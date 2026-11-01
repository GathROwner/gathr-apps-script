'use strict';
// Compose the unchanged accepted event writer and reviewed create/move constructors.
// Pure preparation, native guards, receipts and recovery; no authentication here.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const CORE='C:/Users/craig/.codex/skills/gathr-event-data-repair/scripts/writer/repair-core.cjs';
const OWNER='01a0ea83-7031-7423-b853-966f2180d186';
const C=require(CORE).createCore({dir:__dirname,executorTaskId:OWNER});
const {canon}=require('../recover-oct28-roundup-movie.cjs');
const clone=x=>JSON.parse(JSON.stringify(x)),sv=stringValue=>({stringValue});
const read=f=>JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''));
function seal(p){const x=clone(p);delete x.digest;return{...x,digest:C.hash(x)};}
function addDocuments(map,documents){for(const d of documents){assert(d?.path);const old=map.get(d.path);if(old)assert.deepEqual(C.signature([old]),C.signature([d]),'Conflicting captured document '+d.path);else map.set(d.path,d);}}
function addQueries(map,queries){for(const q of queries){const key=C.hash(q.query),old=map.get(key);if(old)assert.deepEqual(C.signature(old.documents),C.signature(q.documents),'Conflicting captured query '+q.query.label);else map.set(key,q);}}
function beforeArchive(d,digest){return{packetId:sv('NOV01_COMBINED_REVIEWED_REPAIRS'),scopeDigest:sv(digest),scopeDigestKind:sv('hash_of_component_data_creation_plans_v1'),originalPath:sv(d.path),beforeExists:{booleanValue:d.exists},originalCreateTime:sv(d.createTime||''),originalUpdateTime:sv(d.updateTime||''),nativeFieldsJSON:sv(JSON.stringify(d.fields||{}))};}
function bodyScope(writes){return writes.map(w=>clone(w));}
function plain(v){if(v.mapValue)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,plain(x)]));if(v.arrayValue)return(v.arrayValue.values||[]).map(plain);if('integerValue'in v)return Number(v.integerValue);if('doubleValue'in v)return v.doubleValue;if('booleanValue'in v)return v.booleanValue;if('nullValue'in v)return null;return v.stringValue??v.timestampValue;}
function typed(v){if(v===null)return{nullValue:null};if(Array.isArray(v))return{arrayValue:{values:v.map(typed)}};if(typeof v==='object')return{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,typed(x)]))}};if(typeof v==='number')return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};if(typeof v==='boolean')return{booleanValue:v};return{stringValue:v};}
// Reuses the installed masked-update/delete constructor and the accepted
// create-only archive/destination/feed composition. Exact November1 scope only.
function makePlan(dataDir){
 const A=require(CORE).createCore({dir:dataDir,executorTaskId:OWNER}),ctx=A.inputs();
 assert.equal(ctx.p.actionPaths.length,7);assert.equal(ctx.p.updatePaths.length,5);assert.equal(ctx.p.removalPaths.length,2);
 const creationFile=path.join(dataDir,'CREATION_PLAN.json'),creation=read(creationFile);C.verifyDigest(creation);
 assert.equal(creation.ownerTaskId,OWNER);assert.equal(creation.operations.length,3);assert(creation.operations.every(o=>o.kind==='create'));
 const docs=new Map(),queries=new Map();addDocuments(docs,ctx.guarded);addDocuments(docs,creation.documents);
 addQueries(queries,ctx.pre.queryResults);addQueries(queries,creation.queries);addQueries(queries,creation.scopedQueryResults);
 const feed=docs.get(C.FEED);assert(feed?.exists);
 const scopeDigest=C.hash({dataPlanDigest:ctx.p.digest,creationPlanDigest:creation.digest});
 const eventWrites=A.forwardWrites(ctx,feed),createWrites=[];
 for(const op of creation.operations){
  assert.equal(docs.get(op.path)?.exists,false);assert.equal(op.before.exists,false);
  assert.equal(op.afterFields.venueId.stringValue,op.path.split('/')[1]);assert(docs.get(op.path.split('/events/')[0])?.exists);
  createWrites.push({update:{name:C.PREFIX+op.archivePath,fields:beforeArchive(op.before,scopeDigest)},currentDocument:{exists:false}},
   {update:{name:C.PREFIX+op.path,fields:clone(op.afterFields)},currentDocument:{exists:false}});
 }
 // Normalize only outgoing typed payloads to Firestore's wire representation.
 // Captured native source/protected data and all exact version guards stay raw.
 const writes=[...eventWrites.slice(0,-1),...createWrites,C.feedWrite(feed)].map(w=>w.update?{...w,update:{...w.update,fields:canon(w.update.fields)}}:w);
 const archives=[...ctx.source.actions.map(a=>a.proposedArchivePath),...creation.operations.map(o=>o.archivePath)];
 const targets=[...ctx.p.actionPaths,...creation.operations.map(o=>o.path)];
 const boundFiles={};const bind=f=>{boundFiles[path.resolve(f)]=C.fileHash(f);};
 [ctx.planFile,...Object.values(ctx.p).filter(x=>x&&typeof x==='object'&&typeof x.path==='string'&&x.sha256).map(x=>x.path),creationFile,
  path.join(dataDir,'SOURCE_EVIDENCE.json'),path.join(dataDir,'FAMILY_DERIVATION.json'),CORE,
  require.resolve('C:/Users/craig/.codex/skills/gathr-event-data-repair/scripts/plan-loader.cjs'),require.resolve('../recover-oct28-roundup-movie.cjs'),__filename].forEach(bind);
 const p={schemaVersion:1,kind:'NOV01_COMBINED_EXISTING_WRITER_OPERATIONS',ownerTaskId:OWNER,preparedUTC:new Date().toISOString(),
  sourcePlans:{data:{path:ctx.planFile,digest:ctx.p.digest},creation:{path:creationFile,digest:creation.digest}},scopeDigest,boundFiles,
  documents:[...docs.values()],queries:[...queries.values()],requiredAbsent:[...new Set([...archives,...creation.requiredAbsentPaths])],
  childPaths:[...new Set([...ctx.p.actionPaths,...creation.operations.map(o=>o.path)])],writes,archives,targets,feedVersion:C.feedVersion(feed),feedPath:C.FEED,
  counts:{eventUpdates:5,duplicateRemovals:2,newEvents:3,archives:10,forward:21,recovery:11},holds:['N06 source clock conflict; no new U18 or guessed morning finish'],productionWrites:0};
 return verify(seal(p));
}
function verify(p){
 C.verifyDigest(p);assert.equal(p.ownerTaskId,OWNER);assert.equal(p.kind,'NOV01_COMBINED_EXISTING_WRITER_OPERATIONS');
 assert.equal(p.writes.length,21);assert.equal(p.archives.length,10);assert.equal(p.targets.length,10);
 assert.equal(p.writes.filter(w=>w.transform).length,1);assert.equal(p.writes.at(-1).transform.document,C.PREFIX+C.FEED);
 assert.deepEqual([...new Set(p.targets)].sort(),[...p.targets].sort());
 const mutationPaths=p.writes.map(w=>(w.update?.name||w.delete||w.transform?.document));
 assert.equal(new Set(mutationPaths).size,21);assert(p.writes.every(w=>w.currentDocument),'Missing version/existence precondition');
 assert(p.writes.filter(w=>w.update&&!w.updateMask).every(w=>w.currentDocument.exists===false),'Creates must be create-only');
 assert.equal(p.counts.recovery,11);validatePayload(p.writes);return p;
}
function validatePayload(writes){
 const depth=v=>v?.mapValue?1+Math.max(0,...Object.values(v.mapValue.fields||{}).map(depth)):v?.arrayValue?1+Math.max(0,...(v.arrayValue.values||[]).map(depth)):0;
 assert(Buffer.byteLength(JSON.stringify({writes}))<8*1024*1024,'Transaction payload exceeds conservative8MiB budget');
 for(const w of writes)if(w.update){assert(Buffer.byteLength(JSON.stringify(w.update.fields))<900000,'Document exceeds conservative900KB budget');assert(Object.values(w.update.fields).every(v=>depth(v)<=20),'Firestore map/array depth exceeded');}
 return true;
}
function bindings(p){
 verify(p);for(const[f,h]of Object.entries(p.boundFiles))assert.equal(C.fileHash(f),h,'Bound source/helper drift '+f);
 const rebuilt=makePlan(path.dirname(p.sourcePlans.data.path));
 for(const k of ['writes','documents','queries','requiredAbsent','childPaths','targets','archives','counts','sourcePlans','scopeDigest'])
  assert.deepEqual(p[k],rebuilt[k],'Derived combined scope drift '+k);
 return true;
}
function checkSnapshot(p,s){
 verify(p);const expected=new Map(p.documents.map(d=>[d.path,d]));
 for(const d of s.documents){const e=expected.get(d.path);if(e)assert.deepEqual(C.signature([d]),C.signature([e]),'Native drift '+d.path);}
 for(const e of p.documents)assert(s.documents.some(d=>d.path===e.path),'Missing native guard '+e.path);
 const queryMap=new Map(s.queries.map(q=>[C.hash(q.query),q]));
 for(const q of p.queries){const got=queryMap.get(C.hash(q.query));assert(got,'Missing query');assert.deepEqual(C.signature(got.documents),C.signature(q.documents),'New sibling/reference drift '+q.query.label);}
 const map=new Map(s.documents.map(d=>[d.path,d]));
 for(const key of p.requiredAbsent){assert(map.has(key),'Missing absence guard '+key);assert.equal(map.get(key).exists,false,'Archive/root alias already exists '+key);}
 for(const key of p.childPaths){const child=s.children.find(c=>c.path===key);assert(child&&!child.nextPageToken&&!(child.collectionIds||[]).length,'Child collections unknown/present '+key);}
 assert(s.parserOutside?.complete&&s.parserOutside.activeLocks===0,'Outside parser idle not proved');
 assert(s.parserInside?.complete&&s.parserInside.activeLocks===0,'Transactional parser idle not proved');
 const feed=map.get(C.FEED);assert.equal(C.feedVersion(feed),p.feedVersion,'Feed changed');
 return clone(p.writes);
}
function validateReceipt(p,r){
 verify(p);assert.equal(r.operation,'apply');assert.equal(r.planDigest,p.digest);assert.equal(r.ownerTaskId,OWNER);
 assert.deepEqual(r.writes,p.writes);assert(r.response?.commitTime);assert.equal(r.response.writeResults.length,21);
 assert.equal(Number(r.response.writeResults.at(-1).transformResults?.[0]?.integerValue),p.feedVersion+1);
 for(let i=0;i<20;i++)if(p.writes[i].update)assert(r.response.writeResults[i].updateTime,'Missing actual update version');
 return true;
}
function expectedAfter(p,r){
 validateReceipt(p,r);const by=new Map(p.documents.map(d=>[d.path,clone(d)]));
 for(let i=0;i<p.writes.length-1;i++){
  const w=p.writes[i],key=(w.update?.name||w.delete).slice(C.PREFIX.length);
  if(w.delete){by.set(key,{path:key,exists:false,fields:null,updateTime:null});continue;}
  let fields=clone(w.update.fields);
  if(w.updateMask){fields=clone(by.get(key).fields);for(const k of w.updateMask.fieldPaths){assert(!k.includes('.'));if(k in w.update.fields)fields[k]=clone(w.update.fields[k]);else delete fields[k];}}
  by.set(key,{path:key,exists:true,fields,updateTime:r.response.writeResults[i].updateTime});
 }
 return[...by.values()].filter(d=>d.path!==C.FEED);
}
function recoveryWrites(p,r,feed,approval){
 validateReceipt(p,r);assert(approval?.separatelyApproved===true&&approval.operation==='recovery','Separate recovery approval required');
 assert.equal(approval.planDigest,p.digest);assert.equal(approval.applyReceiptSHA256,C.hash(r));
 const before=new Map(p.documents.map(d=>[d.path,d])),ws=[];
 for(let i=0;i<p.writes.length-1;i++){
  const w=p.writes[i],key=(w.update?.name||w.delete).slice(C.PREFIX.length);if(p.archives.includes(key))continue;
  const old=before.get(key);
  if(w.delete){assert(old?.exists);ws.push({update:{name:C.PREFIX+key,fields:clone(old.fields)},currentDocument:{exists:false}});}
  else if(w.currentDocument.exists===false)ws.push({delete:C.PREFIX+key,currentDocument:{updateTime:r.response.writeResults[i].updateTime}});
  else{assert(old?.exists&&w.updateMask);const fields=Object.fromEntries(w.updateMask.fieldPaths.filter(k=>k in old.fields).map(k=>[k,old.fields[k]]));
   ws.push({update:{name:C.PREFIX+key,fields},updateMask:clone(w.updateMask),currentDocument:{updateTime:r.response.writeResults[i].updateTime}});}
 }
 ws.push(C.feedWrite(feed));assert.equal(ws.length,11);return ws;
}
function attemptFence(files){assert(!files.attempt&&!files.commit&&!files.unknown,'Prior/uncertain attempt requires receipt/target/archive/feed reconciliation; no retry');}
module.exports={C,OWNER,makePlan,seal,verify,bindings,checkSnapshot,validateReceipt,expectedAfter,recoveryWrites,attemptFence,addDocuments,addQueries,plain,typed,validatePayload};
