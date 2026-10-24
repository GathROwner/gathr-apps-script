// Exact Oct24 data-only scope. No deployment or automatic resolution.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'..'),root=path.join(repo,'functions/artifacts/oct24-six-record-batch');
const authPath=path.join(repo,'functions/artifacts/ocr-caption-fooddrive-oct18/tools/normal-auth.cjs');
const a=require(authPath),TARGETS=[
 'venues/slug_exploresummerside/events/2keLVPPhiuAKJhG7TxIE',
 'venues/slug_exploresummerside/events/HEITPkLJY5IXxfdH3pWL',
 'venues/slug_exploresummerside/events/Us7PRw49hcAglw5UQ6ak',
 'venues/slug_centralcoastalpei/events/sTy6hOqvqdwXmFMx1lN4',
 'venues/slug_harbourfronttheatre/events/rJGyg5P64BZhfzpUHmRt',
 'venues/slug_easternkingssportsplex/events/IxudtQq6NXuCm7npZ6LF'];
const PROTECTED=['events/local_pumpkin_2026',
 'venues/2ei5OViB21wZRLJsXH1Z/events/oct14_repair_festival_20261031_13',
 'venues/slug_centrebellealliance/events/oct14_repair_festival_20261028_9',
 'venues/slug_centrebellealliance/events/oct14_repair_festival_20261024_6'];
const SOURCES=['1812505513672406','1812505513672406','1812505513672406','1743465457788273','1742584501205846','1680961583491226'];
const SERVING_COMMIT='af5d80435c14dd44cfa588fad1fabb3f8be9d306',SERVING_HASH='1adfb0a7af75586451bafc064461dca7ebd00af2';
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const equal=(x,y,m)=>assert.deepEqual(stable(x),stable(y),m);
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,k==='timestampValue'&&typeof v==='string'?v.replace(/\.000Z$/,'Z'):canonical(v)]).filter(([k,v])=>!((k==='values'&&Array.isArray(v)&&!v.length)||(k==='fields'&&v&&typeof v==='object'&&!Object.keys(v).length)))):x;
const load=n=>JSON.parse(fs.readFileSync(path.join(root,n+'.json')));
const save=(n,x)=>{fs.mkdirSync(root,{recursive:true});fs.writeFileSync(path.join(root,n+'.json'),JSON.stringify(x,null,2)+'\n',{flag:'wx'});};
const docPath=d=>d.name.split('/documents/')[1];
async function idle(transaction){
 const r=await Promise.allSettled(['processing_locks','checkpoints','processing_checkpoints'].map(collection=>a.query(collection,collection==='processing_locks'?['status','fileId']:null,{limit:1001,transaction})));
 const[locks,cp,alt]=r.map(x=>{if(x.status==='rejected')throw x.reason;assert(x.value.length<1001,'Unbounded idle query');return x.value;});
 assert.equal(locks.filter(d=>!['completed','failed','cancelled','canceled','released'].includes(a.data(d).status)).length,0,'Active parser: stop');
 return {activeLocks:0,checkpoints:cp.sort((x,y)=>x.name.localeCompare(y.name)),alternateCheckpoints:alt.sort((x,y)=>x.name.localeCompare(y.name))};
}
async function sourceQueries(documents,transaction){
 const sources=new Set(),ids=new Set();for(const d of Object.values(documents)){const x=a.data(d);for(const s of [x.sourceUniqueId,...(x.sourceUniqueIds||[])])if(s)sources.add(String(s));if(x.uniqueId){ids.add(String(x.uniqueId));const m=x.uniqueId.match(/^(\d{6,})(?:_|$)/);if(m)sources.add(m[1]);}}
 const queries=[],found={};
 for(const source of [...sources].sort())for(const[field,op,value]of [['sourceUniqueIds','ARRAY_CONTAINS',source],['sourceUniqueId','EQUAL',source],['uniqueId','PREFIX',source]]){
  const where=op==='PREFIX'?{compositeFilter:{op:'AND',filters:[{fieldFilter:{field:{fieldPath:field},op:'GREATER_THAN_OR_EQUAL',value:a.encode(value+'_')}},{fieldFilter:{field:{fieldPath:field},op:'LESS_THAN',value:a.encode(value+'_\uf8ff')}}]}}:{fieldFilter:{field:{fieldPath:field},op,value:a.encode(value)}};
  queries.push({label:field+':'+source,where});
 }
 for(const id of [...ids].sort())queries.push({label:'exactUniqueId:'+id,where:{fieldFilter:{field:{fieldPath:'uniqueId'},op:'EQUAL',value:a.encode(id)}}});
 for(const q of queries){const docs=await a.query('events',null,{group:true,where:q.where,limit:201,transaction});assert(docs.length<201,'Source limit reached '+q.label);q.paths=docs.map(docPath).sort();for(const d of docs)found[docPath(d)]=d;}
 return {queries,documents:found};
}
async function serving(){
 const baseline=JSON.parse(fs.readFileSync(path.join(repo,'functions/artifacts/luna-oct24-production-audit/serving-readback.json'))),rows=[];
 const excluded=new Set(['K_SERVICE','K_REVISION','K_CONFIGURATION','FUNCTION_TARGET','FUNCTION_SIGNATURE_TYPE','FUNCTION_NAME','FUNCTION_MEMORY_MB','FUNCTION_TIMEOUT_SEC','FUNCTION_IDENTITY','FUNCTION_REGION','FIREBASE_CONFIG','CLOUD_RUNTIME_CONFIG','ENTRY_POINT','GCP_PROJECT','GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','FUNCTION_TRIGGER_TYPE','EVENTARC_CLOUD_EVENT_SOURCE','PORT']);
 for(const old of baseline.rows){
  const f=await a.request('https://cloudfunctions.googleapis.com/v2/projects/gathr-migrated/locations/'+old.region+'/functions/'+old.name),s=await require(a.cli+'gcp/run.js').getService(f.serviceConfig.service),env=Object.fromEntries(Object.entries(f.serviceConfig.environmentVariables||{}).filter(([k])=>!excluded.has(k))),h=crypto.createHash('sha256').update(JSON.stringify(stable(env))).digest('hex');
  assert.equal(f.state,'ACTIVE');assert.equal(f.labels['firebase-functions-hash'],SERVING_HASH);assert.equal(f.serviceConfig.revision,old.revision);assert.equal(h,old.environmentHash);assert.equal(env.UNKNOWN_VENUE_AUTO_RESOLVE_EXISTING,'false');assert.equal(env.UNKNOWN_VENUE_AUTO_CREATE_ENABLED,'false');assert(!Object.hasOwn(env,'UNKNOWN_VENUE_AUTO_EXISTING_ALLOWLIST'));assert.equal(s.status.latestReadyRevisionName,old.revision);equal(s.status.traffic,old.traffic,'Serving traffic drift');
  rows.push({name:old.name,region:old.region,revision:old.revision,sourceHash:SERVING_HASH,state:f.state,traffic:s.status.traffic,environmentHash:h,gates:'OFF'});
 }
 assert.equal(rows.length,3);return {atUTC:new Date().toISOString(),commit:SERVING_COMMIT,rows,gates:'OFF',deploymentPerformed:false};
}
function validate(plan,capture){
 equal(plan.actions.map(x=>x.path),TARGETS);equal(Object.keys(capture.documents),TARGETS);equal(Object.keys(capture.protectedDocuments),PROTECTED);
 assert.equal(plan.scope,'October24 six existing records, data only');assert.equal(plan.captureSHA256,sha(path.join(root,'repair-preflight.json')));assert.equal(plan.servingCommit,SERVING_COMMIT);assert.equal(plan.servingHash,SERVING_HASH);assert.equal(plan.expectedWrites,14);assert.equal(plan.expectedArchives,7);assert.equal(plan.rollbackWrites,7);assert.equal(plan.expectedFeedVersion,a.data(capture.feed).version);assert.equal(plan.expectedFeedUpdateTime,capture.feed.updateTime);
 for(const [i,x]of plan.actions.entries()){
  const d=capture.documents[x.path],v=a.data(d);assert.equal(x.expectedUpdateTime,d.updateTime);equal(v.sourceUniqueIds,[SOURCES[i]],'Exact source drift');
  if(i<4){assert.equal(x.action,'archive_and_delete');assert(!x.setFields);assert(!x.deleteFields);}
  if(i===4){assert.equal(x.action,'update');equal(x.setFields,{isRecurring:'No',recurringPattern:'none'});equal(x.deleteFields,[]);assert.equal(v.isRecurring,'Yes');assert.equal(v.recurringPattern,'daily');assert.equal(v.startDate,'2026-10-23');assert.equal(v.endDate,'2026-10-23');assert.equal(v.startTime,'19:30');assert.equal(v.sourceOccurrenceCount,1);for(const k of ['recurringDaysOfWeek','recurringWeekdaySequence','recurringWeekInterval','totalOccurrences','recurrenceUntilDate','recurrenceSourceUniqueId','originalEventId','parentEventId'])assert(!Object.hasOwn(v,k),'New lifecycle field requires review '+k);}
  if(i===5){assert.equal(x.action,'update');equal(x.setFields,{});equal(x.deleteFields,['description']);assert.equal(v.startDate,'2026-10-31');assert.equal(v.endDate,'2026-10-31');assert.equal(v.startTime,'10:10');assert.equal(v.endTime,'11:10');assert.equal(v.eventName,'U7 SMHA');assert.equal(v.recurringPattern,'none');assert.equal(v.description,'The printed time is “11:20-12:20 AM.” The schedule places this between 10:10-11:10 AM and 12:30-1:30 PM, so the printed end-time meridiem is anomalous and has not been silently changed.');}
 }
}
function payload(plan,capture,digest){
 validate(plan,capture);const base=a.database+'/documents/',writes=[],archives=[],expectedAfter={},archiveSnapshots={};
 const archive=(p,d,reason)=>{
  const ap='event_integrity_backups/oct24_six_'+crypto.createHash('sha256').update(p).digest('hex').slice(0,20)+'_'+digest.slice(0,12),fields=canonical({originalPath:a.encode(p),originalCreateTime:a.encode(d.createTime),originalUpdateTime:a.encode(d.updateTime),capturedAt:a.encode(capture.atUTC),repairTimestamp:a.encode(plan.repairTimestamp),planSHA256:a.encode(digest),reason:a.encode(reason),snapshot:{mapValue:{fields:d.fields}}});
  writes.push({update:{name:base+ap,fields},currentDocument:{exists:false}});archives.push(ap);archiveSnapshots[ap]=fields;
 };
 for(const action of plan.actions){
  const d=capture.documents[action.path];archive(action.path,d,action.reason);
  if(action.action==='archive_and_delete'){writes.push({delete:d.name,currentDocument:{updateTime:d.updateTime}});expectedAfter[action.path]=null;}
  else {const fields=a.fields(action.setFields),mask=[...Object.keys(fields),...action.deleteFields].sort(),after={...d.fields,...fields};for(const k of action.deleteFields)delete after[k];writes.push({update:{name:d.name,fields},updateMask:{fieldPaths:mask},currentDocument:{updateTime:d.updateTime}});expectedAfter[action.path]=canonical(after);}
 }
 archive('runtime_metadata/event_feed',capture.feed,'Full original feed metadata before monotonic invalidation');
 const feedFields=a.fields({version:plan.expectedFeedVersion+1,updatedAt:new Date(plan.repairTimestamp)});
 writes.push({update:{name:capture.feed.name,fields:feedFields},updateMask:{fieldPaths:['updatedAt','version']},currentDocument:{updateTime:capture.feed.updateTime}});
 assert.equal(writes.length,14);assert.equal(new Set(writes.map(x=>x.delete||x.update.name)).size,14);assert.equal(writes.filter(x=>x.delete).length,4);assert.equal(archives.length,7);
 return {writes:canonical(writes),archives,archiveSnapshots,expectedAfter,expectedFeedFields:canonical({...capture.feed.fields,...feedFields})};
}
async function guard(capture,transaction){
 const state=await idle(transaction);equal(state,capture.idle,'Checkpoint drift');
 for(const[p,d]of Object.entries({...capture.documents,...capture.protectedDocuments,...capture.venues,'runtime_metadata/event_feed':capture.feed}))equal(await a.get(p,transaction),d,'Full typed document/version drift '+p);
 const current=await sourceQueries({...capture.documents,...capture.protectedDocuments},transaction);equal(current,capture.sourceSiblings,'Global source membership/version drift');return {idle:state,sourceQueries:current.queries.length,sourceSiblingRecords:Object.keys(current.documents).length};
}
module.exports={a,repo,root,authPath,TARGETS,PROTECTED,SOURCES,SERVING_COMMIT,SERVING_HASH,stable,equal,sha,canonical,load,save,docPath,idle,sourceQueries,serving,validate,payload,guard};
