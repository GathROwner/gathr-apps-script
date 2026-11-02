'use strict';
// Exact create-only composition of the accepted combined-runner transport.
// Offline by default; existing approval, full transaction guards and one-shot
// receipt semantics apply. Recovery is deliberately not executable here.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const P=require('./parked-create.cjs'),R=require('./parked-create-runner.cjs'),{C}=P;
const ROOT='C:/Users/craig/Documents/Codex/2026-11-01/parked-resolution';
const OUT=path.join(ROOT,'exact-batch-v2');
const AUTH='C:/Users/craig/.codex/worktrees/luna-accounting-release/gathr-apps-script/functions/artifacts/ocr-caption-fooddrive-oct18/tools/normal-auth.cjs';
const LEDGER='C:/Users/craig/Documents/Codex/2026-10-24/task/coordination/ownership.json';
const load=P.read,save=(n,x)=>fs.writeFileSync(path.join(OUT,n+'.json'),JSON.stringify(x,null,2)+'\n',{flag:'wx'});
function hashes(){return{helperSHA256:C.fileHash(require.resolve('./parked-create.cjs')),readRunnerSHA256:C.fileHash(require.resolve('./parked-create-runner.cjs')),runnerSHA256:C.fileHash(__filename),coreSHA256:C.fileHash(C.CORE_FILE)};}
function sharedConflicts(p){const ledger=load(LEDGER);assert(Array.isArray(ledger.reservedResources));
 const resources=[C.LANE,C.FEED,...p.operations.flatMap(o=>[o.path,o.archivePath])];
 const conflicts=ledger.reservedResources.filter(r=>r.exclusive===true&&!/released|closed|completed/i.test(r.status||'')&&r.taskId!==P.OWNER&&resources.some(x=>[r.resourceId,r.resourceName].some(s=>typeof s==='string'&&(s===x||s.endsWith(':'+x)))));
 assert.equal(conflicts.length,0,'Competing exact writer');return{path:LEDGER,sha256:C.fileHash(LEDGER),conflicts:0};}
function authority(p,dir=OUT){P.bindings(p);const approval=load(path.join(dir,'EXACT_BATCH_APPROVAL.json')),review=load(path.join(dir,'INDEPENDENT_REVIEW.json')),lease=load(path.join(dir,'DIRECT_OWNERSHIP.json'));
 const targets=p.operations.map(o=>o.path),h=hashes();
 assert.equal(approval.approved,true);assert.equal(approval.operation,'apply');assert.equal(approval.planDigest,p.digest);assert.deepEqual(approval.targets,targets);
 assert.equal(approval.sourceThreadId,P.OWNER);assert.equal(approval.sourceUserMessageId,'01a19973-2633-7652-8f70-39fcc16bab09');assert.equal(approval.sourceUserText,p.authority.sourceUserText);
 assert.equal(approval.exactCreationsConfirmed,true);assert.equal(approval.storageWriteAuthority,false);assert.equal(approval.queueWriteAuthority,false);
 const e=approval.directUserEvidence;assert.equal(C.fileHash(e.path),e.sha256);const user=load(e.path);
 assert.equal(user.sourceUserMessageId,approval.sourceUserMessageId);assert.equal(user.sourceUserText,approval.sourceUserText);assert.equal(user.sourceThreadId,P.OWNER);assert.equal(user.planDigest,p.digest);assert.deepEqual(user.approvedTargets,targets);
 assert.equal(approval.parentExecutionAuthorization.executorTaskId,P.OWNER);assert.equal(approval.parentExecutionAuthorization.messageId,user.sourceUserMessageId);assert.equal(approval.parentExecutionAuthorization.text,user.sourceUserText);
 assert.equal(review.approved,true);assert.equal(review.planDigest,p.digest);assert.equal(review.ownerTaskId,P.OWNER);assert(review.reviewerThreadId&&review.reviewerThreadId!==P.OWNER);
 assert.equal(review.planSHA256,C.fileHash(path.join(dir,'OPERATIONAL_PLAN.json')));for(const[k,v]of Object.entries(h))assert.equal(review[k],v,'Reviewed code drift '+k);
 assert.equal(C.fileHash(review.evidence.path),review.evidence.sha256);const actual=load(review.evidence.path);assert.equal(actual.sourceThreadId,review.reviewerThreadId);assert(actual.messageId&&actual.text);assert(actual.text.includes(p.digest));for(const[k,v]of Object.entries({...h,planDigest:p.digest}))assert.equal(actual.bindings[k],v);
 assert.equal(lease.status,'active');assert.equal(lease.ownerTaskId,P.OWNER);assert.equal(lease.ledgerOwnerTaskId,P.OWNER);assert.equal(lease.planDigest,p.digest);assert.equal(lease.acceptedFeedVersion,p.feedVersion);assert.equal(lease.sourceUserMessageId,user.sourceUserMessageId);assert.deepEqual(lease.targets,targets);
 assert.equal(lease.feedWriteAuthority,true);assert.equal(lease.storageWriteAuthority,false);assert.equal(lease.queueWriteAuthority,false);
 const writes=P.forwardWrites(p,P.index(p.documents).get(C.FEED));assert.equal(lease.reservedResources.length,writes.length);assert.equal(new Set(lease.reservedResources.map(x=>x.resourceName)).size,writes.length);
 for(const w of writes){const key=(w.update?.name||w.transform?.document).slice(C.PREFIX.length),r=lease.reservedResources.find(x=>x.resourceName===key);assert(r,'Missing reservation '+key);assert.equal(r.taskId,P.OWNER);assert.equal(r.status,'active');assert.equal(r.exclusive,true);assert.equal(r.productionWriteAuthority,true);assert.equal(r.planDigest,p.digest);for(const[k,v]of Object.entries(h))assert.equal(r[k],v);assert.equal(r.deletionAuthority,false);assert.equal(r.createAuthority,Boolean(w.update));assert.equal(r.updateAuthority,false);assert.equal(r.feedWriteAuthority,Boolean(w.transform));assert.deepEqual(r.precondition,w.currentDocument);}
 return true;}
async function capture(req,p,tx,parserOutside){const documents=await C.batch(req,[...new Set([...p.documents.map(d=>d.path),...p.requiredAbsent])],tx);
 const queries=await R.mapLimit(p.queries,6,async q=>({query:q.query,documents:await C.query(req,q.query,tx)}));
 const children=await R.children(req,p.childPaths),parserInside=await C.parserIdleInTransaction(req,tx);
 const s={documents,queries,children,parserOutside,parserInside};P.checkSnapshot(p,s);return s;}
async function main(mode=process.argv[2]||'offline'){
 assert(['offline','--check-live','--apply','--verify'].includes(mode),'Unknown mode; no recovery transport');
 const p=load(path.join(OUT,'OPERATIONAL_PLAN.json'));P.bindings(p);
 if(mode==='offline'){console.log(JSON.stringify({status:'OFFLINE_VALIDATED',planDigest:p.digest,creates:p.operations.length,writes:P.forwardWrites(p,P.index(p.documents).get(C.FEED)).length,productionWrites:0}));return;}
 if(mode==='--apply')authority(p); // Actual review/authority/reservations required before auth.
 const a=require(AUTH);await a.signIn();const req=C.readAdapter(a);
 if(mode==='--verify'){const receipt=load(path.join(OUT,'COMMIT.json'));P.validateReceipt(p,receipt);const expected=P.expectedAfter(p,receipt),got=await C.batch(req,expected.map(d=>d.path));
  assert.deepEqual(C.signature(got),C.signature(expected),'Native destination/archive readback differs');
  const protectedBefore=p.documents.filter(d=>d.exists&&d.path!==C.FEED&&!p.operations.some(o=>o.path===d.path)),protectedNow=await C.batch(req,protectedBefore.map(d=>d.path));assert.deepEqual(P.nativeSignature(protectedNow),P.nativeSignature(protectedBefore),'Protected original changed');
  const feed=(await C.batch(req,[C.FEED]))[0];assert(C.feedVersion(feed)>=p.feedVersion+1);save('NATIVE_VERIFIED',{atUTC:new Date().toISOString(),status:'PASS',planDigest:p.digest,destinationsAndArchives:got.length,protectedExisting:protectedNow.length,feed:C.feedVersion(feed),receiptSHA256:C.fileHash(path.join(OUT,'COMMIT.json'))});console.log(JSON.stringify({status:'NATIVE_READBACK_PASS',paths:got.length,protected:protectedNow.length}));return;}
 P.attemptFence(Object.fromEntries(['attempt','commit','unknown'].map(x=>[x,fs.existsSync(path.join(OUT,x.toUpperCase()+'.json'))])));
 const runtime=await R.serving(a,load(path.join(ROOT,'LIVE_SOURCE_BASELINE.json')).parserFunctions),shared=sharedConflicts(p),parserOutside=await R.idle(req);
 const apply=mode==='--apply',tx=(await a.request(C.BASE+':beginTransaction','POST',{options:apply?{readWrite:{}}:{readOnly:{}}})).transaction,start=Date.now();let submitted=false,response;
 try{const state=await capture(req,p,tx,parserOutside);R.durationBudget(start);
  if(!apply){save('LIVE_DRY_RUN_'+Date.now(),{atUTC:new Date().toISOString(),status:'PASS_ALL_PREWRITE_GUARDS',planDigest:p.digest,native:state.documents.length,queries:state.queries.length,children:state.children.length,runtime,shared,parserOutside,parserInside:state.parserInside,productionWrites:0});console.log(JSON.stringify({status:'LIVE_DRY_RUN_PASS',native:state.documents.length,queries:state.queries.length,productionWrites:0}));return;}
  authority(p);sharedConflicts(p);
  // Complete all fallible metadata reads before submitting. Once Firestore
  // returns, persisting the actual response must precede further reads/checks.
  const receiptBindings={...hashes(),approvalSHA256:C.fileHash(path.join(OUT,'EXACT_BATCH_APPROVAL.json')),independentReviewSHA256:C.fileHash(path.join(OUT,'INDEPENDENT_REVIEW.json'))};
  const backup='PREWRITE_BACKUP_'+Date.now();save(backup,{atUTC:new Date().toISOString(),planDigest:p.digest,state,runtime,shared});
  save('ATTEMPT',{atUTC:new Date().toISOString(),planDigest:p.digest,backup:path.join(OUT,backup+'.json'),backupSHA256:C.fileHash(path.join(OUT,backup+'.json')),automaticRetry:false});R.durationBudget(start);
  const writes=P.forwardWrites(p,P.index(state.documents).get(C.FEED));submitted=true;response=await a.request(C.BASE+':commit','POST',{transaction:tx,writes});
  const receipt={operation:'apply',ownerTaskId:P.OWNER,planDigest:p.digest,writes,response,backup:path.join(OUT,backup+'.json'),...receiptBindings};save('COMMIT',receipt);
  console.log(JSON.stringify({status:'COMMIT_RESPONSE_SAVED',commitTime:response.commitTime,writes:response.writeResults?.length,feedAssigned:Number(response.writeResults?.at(-1)?.transformResults?.[0]?.integerValue),receipt:path.join(OUT,'COMMIT.json')}));P.validateReceipt(p,receipt);
 }catch(e){try{save(submitted?'UNKNOWN':'STOP_'+Date.now(),{atUTC:new Date().toISOString(),submitted,error:e.message,...(response?{actualResponse:response}:{}),automaticRetry:false});}catch(_){}if(response)console.error(JSON.stringify({status:'COMMIT_RESPONSE_REQUIRES_RECONCILIATION',response,automaticRetry:false}));throw e;}
 finally{if(!submitted)await req(':rollback',{transaction:tx});}
}
module.exports={authority,sharedConflicts,capture,hashes,main,ROOT,OUT};
if(require.main===module)main().catch(e=>{console.error('Parked exact execution stopped: '+e.message);process.exitCode=1;});
