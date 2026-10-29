// Exact recoverable five-offer batch. Default is read-only; no parser/model calls.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const repo=path.resolve(__dirname,'..'),dir=path.join(repo,'functions/artifacts/oct28-repairs/offer-service-hours');
const owner='01a0ea83-7031-7423-b853-966f2180d186';
const a=require('C:/Users/craig/.codex/worktrees/luna-accounting-release/gathr-apps-script/functions/artifacts/ocr-caption-fooddrive-oct18/tools/normal-auth.cjs');
const C=require('C:/Users/craig/.codex/skills/gathr-event-data-repair/scripts/writer/repair-core.cjs').createCore({dir,executorTaskId:owner});
const {canon,valueDepth}=require('./recover-oct28-roundup-movie.cjs');
const read=n=>JSON.parse(fs.readFileSync(path.join(dir,n+'.json'),'utf8'));
const save=(n,x)=>fs.writeFileSync(path.join(dir,n+'.json'),JSON.stringify(x,null,2)+'\n',{flag:'wx'});
const field=(key,op,value)=>({fieldFilter:{field:{fieldPath:key},op,value:{stringValue:value}}});
const ids=['1939264440811908','1119028204045061'];
function bindings(p){const copy={...p};delete copy.digest;assert.equal(C.hash(copy),p.digest);assert.equal(p.ownerTaskId,owner);
 assert.equal(p.creates.length,5);assert.equal(p.updates.length,2);assert.equal(p.writeCount,9);
 const prepared=read('PREPARED_OFFER_BATCH');assert.equal(p.preparedDigest,prepared.digest);
 assert.deepEqual(p.creates,prepared.creates);assert.deepEqual(p.updates,prepared.updates);
 for(const[f,h]of Object.entries(p.boundFiles))assert.equal(C.fileHash(f),h,'Frozen input drift '+f);
 return true;}
function archives(p){return canon(a.fields({packetId:'O28_OFFER_SERVICE_HOURS_20261028',planDigest:p.digest,
  purpose:'Full native typed prestates for exact approved five-offer repair; no media deletion.',
  before:p.documents.filter(d=>d.path!==p.archivePath).map(d=>({path:d.path,exists:d.exists,createTime:d.createTime||'',updateTime:d.updateTime||'',
   // Serialize the native typed map inside a typed archive to preserve every
   // value while avoiding Firestore's nested-map depth limit.
   nativeFieldsJSON:JSON.stringify(d.fields||{})}))}));}
function writes(p,feed){assert.equal(C.feedVersion(feed),p.feedVersion);return[
 ...p.creates.map(x=>({update:{name:C.PREFIX+x.path,fields:canon(x.typedFields)},currentDocument:{exists:false}})),
 ...p.updates.map(x=>({update:{name:C.PREFIX+x.path,fields:canon(x.afterFields)},updateMask:{fieldPaths:x.mask},currentDocument:{updateTime:x.before.updateTime}})),
 {update:{name:C.PREFIX+p.archivePath,fields:archives(p)},currentDocument:{exists:false}},C.feedWrite(feed)];}
function validateWrites(p,ws){assert.equal(ws.length,9);for(const w of ws){assert(Object.values(w.update?.fields||{}).every(v=>valueDepth(v)<=20));assert(Buffer.byteLength(JSON.stringify(w.update?.fields||{}))<900000);}
 for(const x of p.updates){assert.deepEqual(x.mask.filter(k=>!Object.hasOwn(x.afterFields,k)),x.deleteFields);
  for(const k of x.deleteFields){assert(['ticketLink','ticketsBuyUrl'].includes(k));assert.equal(x.path,'venues/slug_ponyboat.socialclub/events/bgZo98tQM6AFZN1eQ9eI');assert.equal(a.data(x.before)[k],'https://www.ponyboat.ca/events/saints-sinners-halloween-party');}
  for(const[k,v]of Object.entries(x.before.fields))if(!x.mask.includes(k))assert.deepEqual(x.afterFields[k],v,'Unmasked field changed '+k);
 }
 return true;}
async function media(p){for(const m of p.mediaProof){const r=await fetch(m.url,{signal:AbortSignal.timeout(30000)});assert(r.ok);assert.equal(C.hash(Buffer.from(await r.arrayBuffer())),m.sha256,'Original media drift');}}
function sharedConflicts(p){const file='C:/Users/craig/Documents/Codex/2026-10-24/task/coordination/ownership.json',ledger=JSON.parse(fs.readFileSync(file,'utf8'));
 const resources=[C.LANE,C.FEED,...p.creates.map(x=>x.path),...p.updates.map(x=>x.path)];
 const conflicts=(ledger.reservedResources||[]).filter(r=>r.exclusive===true&&!/released|closed|completed/i.test(r.status||'')&&r.taskId!==owner&&resources.some(x=>[r.resourceId,r.resourceName].some(s=>typeof s==='string'&&(s===x||s.endsWith(':'+x)))));
 assert.equal(conflicts.length,0,'Competing exact writer');return {path:file,sha256:C.fileHash(file),conflicts:0};}
function authority(p){const approval=read('EXACT_BATCH_APPROVAL'),review=read('OPERATIONAL_REVIEW'),lease=read('DIRECT_OWNERSHIP');
 assert.equal(approval.approved,true);assert.equal(approval.planDigest,p.digest);assert.equal(approval.sourceThreadId,owner);
 assert(approval.sourceUserMessageId&&approval.sourceUserMessageId!=='01a1853b-aab2-77f1-a4b6-a439209b0682','Policy acceptance alone is not exact venue/release approval');assert(approval.sourceUserText);
 assert.deepEqual(approval.createPaths,p.creates.map(x=>x.path));assert.deepEqual(approval.updatePaths,p.updates.map(x=>x.path));
 assert.equal(review.approved,true);assert.equal(review.planDigest,p.digest);assert.equal(review.helperSHA256,C.fileHash(__filename));assert.equal(review.planSHA256,C.fileHash(path.join(dir,'OPERATIONAL_PLAN.json')));
 assert.equal(lease.status,'active');assert.equal(lease.ownerTaskId,owner);assert.equal(lease.planDigest,p.digest);assert.equal(lease.sourceUserMessageId,approval.sourceUserMessageId);assert.equal(lease.feedWriteAuthority,true);
 assert.deepEqual(lease.createPaths,p.creates.map(x=>x.path));assert.deepEqual(lease.updatePaths,p.updates.map(x=>x.path));assert.equal(lease.storageWriteAuthority,false);assert.equal(lease.queueWriteAuthority,false);
 sharedConflicts(p);return true;}
async function serving(apply){if(!apply)return require('./recover-oct28-four-confirmed.cjs').serving();
 const expected=read('OFFER_RELEASE_LIVE_VERIFIED');assert.equal(expected.candidateCommit,'4a803f5df2078dbc66c046bd91eb85f49cb8cf68');assert.equal(expected.independentVerified,true);
 const parsers=expected.rows.filter(r=>['processDataset','processDatasetResume','processDatasetSelectedRows'].includes(r.name));assert.equal(parsers.length,3);
 assert.match(expected.sourceHash,/^[a-f0-9]{40}$/);assert.deepEqual(parsers.map(r=>[r.name,r.region]).sort(),[['processDataset','northamerica-northeast2'],['processDatasetResume','northamerica-northeast1'],['processDatasetSelectedRows','northamerica-northeast1']].sort());
 for(const row of parsers){const f=await a.request(`https://cloudfunctions.googleapis.com/v2/projects/gathr-migrated/locations/${row.region}/functions/${row.name}`),s=await a.request('https://run.googleapis.com/v1/'+f.serviceConfig.service);
  assert.equal(f.state,'ACTIVE');assert.equal(f.labels['firebase-functions-hash'],expected.sourceHash);assert.equal(f.serviceConfig.revision,row.revision);
  assert.equal(f.serviceConfig.maxInstanceCount,20);assert(row.environmentSHA256);assert.equal(C.hash(f.serviceConfig.environmentVariables),row.environmentSHA256);
  assert.equal(f.serviceConfig.environmentVariables.UNKNOWN_VENUE_AUTO_RESOLVE_EXISTING,'false');assert.equal(f.serviceConfig.environmentVariables.UNKNOWN_VENUE_AUTO_CREATE_ENABLED,'false');assert(!Object.hasOwn(f.serviceConfig.environmentVariables,'PARSER_RESPONSE_REUSE_ENABLED'));
  assert.equal(s.status.traffic.length,1);assert.equal(s.status.traffic[0].percent,100);assert.equal(s.status.traffic[0].latestRevision,true);assert.equal(s.status.latestReadyRevisionName,row.revision);}
 return{atUTC:new Date().toISOString(),sourceHash:expected.sourceHash,rows:parsers};}
async function guard(req,p,tx){const found=await C.batch(req,p.documents.map(d=>d.path),tx);assert.deepEqual(C.signature(found),C.signature(p.documents),'Native version/source/target/branch/feed drift');
 for(const q of p.queries)assert.deepEqual(C.signature(await C.query(req,q,tx)),C.signature(q.documents),'Scoped query drift '+q.label);
 const by=new Map(found.map(d=>[d.path,d]));assert.equal(C.feedVersion(by.get(C.FEED)),p.feedVersion);return {documents:found,feed:by.get(C.FEED)};}
async function prepare(){const prepared=read('PREPARED_OFFER_BATCH'),initial=read('FRESH_OFFER_STATE'),req=C.readAdapter(a);await a.idle();
 const queries=initial.queries.map(q=>({...q}));
 for(const id of ids)queries.push({label:'uniqueId prefix '+id,collection:'events',allDescendants:true,filter:{compositeFilter:{op:'AND',filters:[field('uniqueId','GREATER_THAN_OR_EQUAL',id+'_'),field('uniqueId','LESS_THAN',id+'_\uf8ff')]}},limit:501});
 const parents=[...new Set(prepared.creates.filter(x=>x.kind==='event').map(x=>x.path.split('/events/')[0]).concat('venues/slug_ponyboat.socialclub'))];
 for(const parent of parents)queries.push({label:'complete parent '+parent,parent,collection:'events',limit:1001});
 queries.push({label:'canonical branch catalogue',collection:'venues',select:{fields:['name','normalizedName','pagenameNormalized','aliases','aliasesNormalized','address','googlePlaceId','placeId'].map(fieldPath=>({fieldPath}))},limit:1001});
 for(const collection of ['checkpoints','processing_checkpoints'])queries.push({label:collection+' source dataset',collection,filter:field('fileId','EQUAL','1RIa4YTgueN-q5TfBXN26pk3twDVx3itf'),limit:1001});
 for(const q of queries){const fresh=await C.query(req,q);assert(fresh.length<q.limit);if(q.documents)assert.deepEqual(C.signature(fresh),C.signature(q.documents),'Source inventory drift');q.documents=fresh;
  if(q.label.startsWith('uniqueId prefix '+ids[0])||q.collection==='checkpoints'||q.collection==='processing_checkpoints')assert.equal(fresh.length,0,'Unexpected occurrence or checkpoint');}
 const catalogue=queries.find(q=>q.label==='canonical branch catalogue').documents;const {postalStreetIdentity,compatibleStreetLocality}=require('../functions/artifacts/oct28-repairs/offer-hours-candidate/lib/utils/numberedStreetIdentity.js');
 for(const v of prepared.creates.filter(x=>x.kind==='venue')){const key=postalStreetIdentity(v.plain.address);assert(key);assert.equal(catalogue.filter(d=>{const p=a.data(d);return p.googlePlaceId===v.plain.googlePlaceId||p.placeId===v.plain.googlePlaceId||postalStreetIdentity(p.address||'')===key&&compatibleStreetLocality(p.address||'',v.plain.address);}).length,0,'Existing branch identity requires review');}
 const audit=JSON.parse(fs.readFileSync(path.join(dir,'../../oct28-independent-audit/live-readback.json'),'utf8'));const terminal=audit.batchStates.find(x=>x.data.status==='completed');assert(terminal);
 const proofPaths=['processed_datasets/1RIa4YTgueN-q5TfBXN26pk3twDVx3itf','processing_locks/1RIa4YTgueN-q5TfBXN26pk3twDVx3itf',terminal.path];
 const documents=await C.batch(req,[...new Set([...initial.documents.map(d=>d.path),...prepared.creates.map(x=>x.path),...proofPaths])]);const by=new Map(documents.map(d=>[d.path,d]));
 for(const d of initial.documents)assert.deepEqual(C.signature([by.get(d.path)]),C.signature([d]),'Initial target/source/feed drift');
 for(const x of prepared.creates)assert.equal(by.get(x.path).exists,false);for(const p of proofPaths.slice(1))assert.equal(a.data(by.get(p)).status,'completed');assert(by.get(proofPaths[0]).exists);
 const p={...prepared,preparedDigest:prepared.digest,documents,queries,feedVersion:Number(a.data(by.get(C.FEED)).version),ownerTaskId:owner,
  boundFiles:Object.fromEntries([__filename,path.join(__dirname,'recover-oct28-roundup-movie.cjs'),path.join(dir,'PREPARED_OFFER_BATCH.json'),path.join(dir,'INDEPENDENT_REVIEW_SUPPLEMENT.json'),C.CORE_FILE].map(f=>[f,C.fileHash(f)]))};delete p.digest;p.digest=C.hash(p);bindings(p);validateWrites(p,writes(p,by.get(C.FEED)));
 await C.noChildren(req,prepared.creates.map(x=>x.path));sharedConflicts(p);save('OPERATIONAL_PLAN',p);save('NATIVE_WRITE_PREVIEW',{planDigest:p.digest,writes:writes(p,by.get(C.FEED)),productionWrites:0});console.log(JSON.stringify({prepared:true,planDigest:p.digest,writes:9,queryGuards:queries.length,productionWrites:0}));}
async function main(){const mode=process.argv[2]||'dry-run';assert(['prepare','dry-run','--apply'].includes(mode));await a.signIn();if(mode==='prepare')return prepare();
 const p=read('OPERATIONAL_PLAN');bindings(p);const apply=mode==='--apply';for(const n of ['ATTEMPT','COMMIT'])assert(!fs.existsSync(path.join(dir,n+'.json')),'Possible previous attempt: reconcile, never retry blindly');if(apply)authority(p);
 const req=C.readAdapter(a),runtime=await serving(apply);await a.idle();await media(p);await C.noChildren(req,p.creates.map(x=>x.path));sharedConflicts(p);
 const tx=(await a.request(C.BASE+':beginTransaction','POST',{options:apply?{readWrite:{}}:{readOnly:{}}})).transaction;let submitted=false;
 try{const idle=await C.parserIdleInTransaction(req,tx),checked=await guard(req,p,tx),ws=writes(p,checked.feed);validateWrites(p,ws);
  if(!apply){save('OPERATIONAL_DRY_RUN',{atUTC:new Date().toISOString(),status:'PASS_READ_ONLY_TRANSACTION_GUARDS',planDigest:p.digest,idle,runtime,writes:9,productionWrites:0});console.log('Read-only exact nine-write transaction guards passed; no production writes');return;}
  const backup=path.join(dir,'PREWRITE_BACKUP_'+Date.now()+'.json');fs.writeFileSync(backup,JSON.stringify({atUTC:new Date().toISOString(),planDigest:p.digest,documents:checked.documents,queries:p.queries,idle,runtime},null,2),{flag:'wx'});
  save('ATTEMPT',{atUTC:new Date().toISOString(),planDigest:p.digest,backup,backupSHA256:C.fileHash(backup)});submitted=true;
  const response=await a.request(C.BASE+':commit','POST',{transaction:tx,writes:ws});save('COMMIT',{planDigest:p.digest,response,writes:ws,backup});
  console.log(JSON.stringify({status:'COMMIT_RESPONSE_SAVED',commitTime:response.commitTime,writes:response.writeResults.length,feedAssigned:Number(response.writeResults.at(-1).transformResults[0].integerValue),receipt:path.join(dir,'COMMIT.json')}));
 }catch(e){save('STOP_'+Date.now(),{atUTC:new Date().toISOString(),submitted,error:e.stack,automaticRetry:false});throw e;}finally{if(!submitted)await a.request(C.BASE+':rollback','POST',{transaction:tx});}}
module.exports={bindings,archives,writes,validateWrites,guard,authority};if(require.main===module)main().catch(e=>{console.error('Offer batch blocker: '+e.stack);process.exitCode=1;});
