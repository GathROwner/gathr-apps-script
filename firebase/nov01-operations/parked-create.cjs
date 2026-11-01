'use strict';
// Pure create-only adaptation of combined.cjs and the reviewed Oct29 constructor.
// No auth, commit, replay, queue-finalization, deployment or automatic recovery.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const CORE='C:/Users/craig/.codex/skills/gathr-event-data-repair/scripts/writer/repair-core.cjs';
const OWNER='01a0ea83-7031-7423-b853-966f2180d186';
const C=require(CORE).createCore({dir:__dirname,executorTaskId:OWNER});
// Same pure value constructors/payload budget as combined.cjs, without importing
// its historical canonicalizer (which imports an authentication module at load).
function plain(v){if(v.mapValue)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,plain(x)]));if(v.arrayValue)return(v.arrayValue.values||[]).map(plain);if('integerValue'in v)return Number(v.integerValue);if('doubleValue'in v)return v.doubleValue;if('booleanValue'in v)return v.booleanValue;if('nullValue'in v)return null;return v.stringValue??v.timestampValue;}
function typed(v){if(v===null)return{nullValue:null};if(Array.isArray(v))return{arrayValue:{values:v.map(typed)}};if(typeof v==='object')return{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,typed(x)]))}};if(typeof v==='number')return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};if(typeof v==='boolean')return{booleanValue:v};return{stringValue:v};}
// Unchanged outgoing-wire canonicalization from recover-oct28-roundup-movie.cjs;
// never apply this to captured native prestates or transaction comparisons.
const canon=x=>Array.isArray(x)?x.map(canon):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,k==='timestampValue'&&typeof v==='string'?v.replace(/\.000Z$/,'Z'):canon(v)]).filter(([k,v])=>!((k==='values'&&Array.isArray(v)&&!v.length)||(k==='fields'&&v&&typeof v==='object'&&!Object.keys(v).length)))):x;
function validatePayload(writes){const depth=v=>v?.mapValue?1+Math.max(0,...Object.values(v.mapValue.fields||{}).map(depth)):v?.arrayValue?1+Math.max(0,...(v.arrayValue.values||[]).map(depth)):0;
 const native=v=>{assert(v&&typeof v==='object'&&Object.keys(v).length===1,'Invalid native Firestore value');const k=Object.keys(v)[0];assert(['stringValue','timestampValue','integerValue','doubleValue','booleanValue','nullValue','referenceValue','geoPointValue','bytesValue','mapValue','arrayValue'].includes(k),'Invalid native type '+k);if(k==='mapValue')Object.values(v.mapValue.fields||{}).forEach(native);if(k==='arrayValue')(v.arrayValue.values||[]).forEach(native);};
 assert(Buffer.byteLength(JSON.stringify({writes}))<8*1024*1024);for(const w of writes)if(w.update){Object.values(w.update.fields).forEach(native);assert(Buffer.byteLength(JSON.stringify(w.update.fields))<900000);assert(Object.values(w.update.fields).every(v=>depth(v)<=20));}return true;}
const clone=x=>JSON.parse(JSON.stringify(x));
const read=f=>JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''));
const absent=p=>({path:p,exists:false,fields:null,updateTime:null});
function seal(p){const x=clone(p);delete x.digest;return{...x,digest:C.hash(x)};}
function index(ds){const m=new Map();for(const d of ds){assert(!m.has(d.path),'Duplicate document guard '+d.path);m.set(d.path,d);}return m;}
function archiveFields(op,scopeDigest){return typed({packetId:'NOV01_PARKED_CREATE_ONLY',scopeDigest,originalPath:op.path,
 beforeExists:false,originalCreateTime:'',originalUpdateTime:'',nativeFieldsJSON:'{}',operation:'create',destinationPath:op.path}).mapValue.fields;}
function nativeSignature(ds){return ds.map(d=>({path:d.path,exists:d.exists,fields:d.fields,createTime:d.createTime||null,updateTime:d.updateTime||null})).sort((a,b)=>a.path.localeCompare(b.path));}
function verify(p){
 C.verifyDigest(p);assert.equal(p.kind,'NOV01_PARKED_CREATE_ONLY');assert.equal(p.ownerTaskId,OWNER);
 assert.equal(p.mode,'OFFLINE_PREPARATION_ONLY');assert.equal(p.productionWrites,0);assert.equal(p.activationAllowed,false);
 assert.equal(p.operations.length,18);assert.equal(p.operations.filter(o=>o.documentKind==='event').length,17);
 assert.equal(p.operations.filter(o=>o.documentKind==='venue').length,1);
 const docs=index(p.documents),ops=index(p.operations),ids=new Set(),fingerprints=new Set();
 assert.equal(p.counts.archives,18);assert.equal(p.counts.forward,37);assert.equal(p.counts.recovery,19);
 for(const o of p.operations){
  assert.equal(o.kind,'create');assert.equal(o.before.exists,false);assert.deepEqual(o.before,docs.get(o.path));
  assert.equal(docs.get(o.archivePath)?.exists,false,'Missing archive absence');assert(p.requiredAbsent.includes(o.path)&&p.requiredAbsent.includes(o.archivePath));
  assert(o.sourcePaths.length&&o.sourcePaths.every(s=>docs.get(s)?.exists),'Missing native source');
  const e=Object.fromEntries(Object.entries(o.afterFields).map(([k,v])=>[k,plain(v)]));
  if(o.documentKind==='venue'){
   assert.equal(o.path,'venues/place_'+C.hash('ChIJGRrl28yVX0sRRvuajhcSRko').slice(0,16));
   assert.equal(e.googlePlaceId,'ChIJGRrl28yVX0sRRvuajhcSRko');assert.equal(e.latitude,46.464370699999996);assert.equal(e.longitude,-63.5148735);
   assert.equal(e.name,'New London Carriage House');assert.equal(e.website,'https://carriagehousepei.com/');assert(!e.aliases&&!e.aliasesNormalized);
   continue;
  }
  assert(/^venues\/[^/]+\/events\/n01park_[0-9a-f]{24}$/.test(o.path));
  const parent='venues/'+e.venueId;assert.equal(parent,o.path.split('/events/')[0],'Parent/venueId mismatch');
  const vf=docs.get(parent)?.exists?docs.get(parent).fields:ops.get(parent)?.afterFields;assert(vf,'Canonical parent missing');
  for(const f of ['address','latitude','longitude'])assert.deepEqual(o.afterFields[f],vf[f],'Canonical routing drift '+f);
  assert.equal(e.endDate,e.startDate);assert(e.startDate>='2026-11-02'&&e.startDate<='2026-12-05','Past/out-of-scope occurrence');
  assert(/^\d{2}:\d{2}$/.test(e.startTime));assert.equal(e.isRecurring,'No');assert.equal(e.recurringPattern,'none');
  assert(!Object.keys(e).some(k=>/^(recurrence|recurringDays|totalOccurrences|exceptionDates)/.test(k)),'Unbounded recurrence metadata');
  assert.equal(e.timeResolution.hoursUsed,false);assert.equal(e.timeFlags.start.source,'explicit');
  assert.equal(e.timeFlags.end.source,e.endTime?'explicit':'none');
  assert(!ids.has(e.uniqueId),'Duplicate uniqueId');ids.add(e.uniqueId);
  const fingerprint=[e.venueId,e.name,e.startDate,e.startTime].join('|');assert(!fingerprints.has(fingerprint),'Duplicate candidate');fingerprints.add(fingerprint);
  assert.equal(e.sourceUniqueIds.length,1);assert.equal(e.sourceUniqueIds[0],o.sourceId);
  assert(!/audit|held|review|conflict|parser|packet/i.test(e.description),'Private reasoning in attendee description');
  assert.equal(e.familyFriendlyScoringVersion,'family-friendly-v15');assert(e.familyAudienceEvidence);
  if(e.imageUrl){assert(e.imageUrl.startsWith('https://storage.googleapis.com/gathr-uploaded-images/postimages/'));assert.equal(e.imageProvenance.primaryUrl,e.imageUrl);assert.deepEqual(e.mediaUrls,[e.imageUrl]);}
 }
 const feed=docs.get(C.FEED);assert.equal(C.feedVersion(feed),p.feedVersion);
 assert.equal(new Set(p.requiredAbsent).size,p.requiredAbsent.length);
 for(const x of p.requiredAbsent)assert.equal(docs.get(x)?.exists,false,'Missing required absence '+x);
 assert.equal(new Set(p.queries.map(q=>C.hash(q.query))).size,p.queries.length,'Duplicate query guards');
 for(const q of p.queries)if(q.query.mustBeEmpty)assert.equal(q.documents.length,0,'Nonempty identity/reference guard '+q.query.label);
 assert.equal(p.authority.sourceThreadId,OWNER);assert.equal(p.authority.sourceUserMessageId,'01a19973-2633-7652-8f70-39fcc16bab09');
 assert.equal(p.independentReview.status,'PENDING');assert.equal(p.independentReview.approved,false);
 validatePayload(forwardWritesUnchecked(p));return p;
}
function forwardWritesUnchecked(p){return p.operations.flatMap(o=>[
 {update:{name:C.PREFIX+o.archivePath,fields:archiveFields(o,p.scopeDigest)},currentDocument:{exists:false}},
 {update:{name:C.PREFIX+o.path,fields:clone(o.afterFields)},currentDocument:{exists:false}}
 ]).concat(C.feedWrite(index(p.documents).get(C.FEED)));}
function forwardWrites(p,feed){verify(p);assert.equal(C.feedVersion(feed),p.feedVersion,'Feed drift');return forwardWritesUnchecked(p);}
function checkSnapshot(p,s){
 verify(p);assert.deepEqual(nativeSignature(s.documents),nativeSignature(p.documents),'Full native source/parent/protected/absence/feed drift');
 const qm=new Map(s.queries.map(q=>[C.hash(q.query),q]));assert.equal(qm.size,p.queries.length,'Query coverage differs');
 for(const q of p.queries){const got=qm.get(C.hash(q.query));assert(got,'Missing query '+q.query.label);assert.deepEqual(nativeSignature(got.documents),nativeSignature(q.documents),'Sibling/source/duplicate/reference/catalogue drift '+q.query.label);}
 for(const pth of p.childPaths){const x=s.children.find(x=>x.path===pth);assert(x&&!x.nextPageToken&&!(x.collectionIds||[]).length,'Destination children unknown/present '+pth);}
 for(const k of ['parserOutside','parserInside'])assert(s[k]?.complete&&s[k].activeLocks===0&&s[k].transactionalActivePredicateChecked,'Parser idle scan incomplete/active '+k);
 return forwardWrites(p,index(s.documents).get(C.FEED));
}
function bindings(p){verify(p);for(const[f,h]of Object.entries(p.boundFiles))assert.equal(C.fileHash(f),h,'Bound evidence/helper drift '+f);
 const requestFile=Object.keys(p.boundFiles).find(f=>path.basename(f)==='REQUEST.json');assert(requestFile);const request=read(requestFile);C.verifyDigest(request);
 assert.equal(request.digest,p.requestDigest);for(const k of ['operations','requiredAbsent','childPaths'])assert.deepEqual(p[k],request[k],'Derived candidate scope drift '+k);
 const captureFile=Object.keys(p.boundFiles).find(f=>path.basename(f)==='GUARD_CAPTURE.json');assert(captureFile);const captured=read(captureFile);assert.equal(captured.requestDigest,p.requestDigest);
 for(const k of ['documents','queries','parserFunctions'])assert.deepEqual(p[k],captured[k],'Derived captured scope drift '+k);
 const actual=read(p.authorityEvidence.path);assert.deepEqual(p.authority,actual,'Actual authority binding drift');assert.equal(C.fileHash(p.authorityEvidence.path),p.authorityEvidence.sha256);
 return true;}
function validateReceipt(p,r){
 verify(p);assert.equal(r.operation,'apply');assert.equal(r.ownerTaskId,OWNER);assert.equal(r.planDigest,p.digest);assert.deepEqual(r.writes,forwardWritesUnchecked(p));
 assert(r.response?.commitTime);assert.equal(r.response.writeResults.length,37);
 for(let i=0;i<36;i++)assert(r.response.writeResults[i].updateTime,'Actual per-document version required');
 assert.equal(Number(r.response.writeResults[36].transformResults?.[0]?.integerValue),p.feedVersion+1);return true;
}
function expectedAfter(p,r){validateReceipt(p,r);return p.operations.flatMap((o,i)=>[
 {path:o.archivePath,exists:true,fields:archiveFields(o,p.scopeDigest),updateTime:r.response.writeResults[i*2].updateTime},
 {path:o.path,exists:true,fields:clone(o.afterFields),updateTime:r.response.writeResults[i*2+1].updateTime}
 ]);}
function recoveryWrites(p,r,feed,a){
 validateReceipt(p,r);assert(a?.separatelyApproved===true&&a.operation==='recovery','Separate recovery approval required');
 assert.equal(a.planDigest,p.digest);assert.equal(a.applyReceiptSHA256,C.hash(r));assert(a.userMessageId&&a.userText&&a.parentExecutionId&&a.independentReviewSHA256,'Recovery authority/review required');
 // Children first; fresh full sibling/reference/counter guards are mandatory before this pure preview is executable.
 const writes=[...p.operations].map((o,i)=>({o,i})).reverse().map(({o,i})=>({delete:C.PREFIX+o.path,currentDocument:{updateTime:r.response.writeResults[i*2+1].updateTime}}));
 writes.push(C.feedWrite(feed));assert.equal(writes.length,19);return writes;
}
function attemptFence(files){assert(!files.attempt&&!files.commit&&!files.unknown,'Prior/uncertain attempt requires receipt/target/archive/feed reconciliation; no retry');return true;}
function executionUnavailable(){throw new Error('PREPARATION ONLY: apply/recovery transport unavailable; root must independently review and activate exact authority, reservations and a reviewed transport.');}
module.exports={C,OWNER,typed,plain,canon,validatePayload,clone,read,seal,absent,index,archiveFields,nativeSignature,verify,forwardWrites,checkSnapshot,bindings,validateReceipt,expectedAfter,recoveryWrites,attemptFence,executionUnavailable};
