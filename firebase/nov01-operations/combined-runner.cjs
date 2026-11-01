'use strict';
// Target-specific transport. Default is offline. No mutation before exact approval.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const P=require('./combined.cjs'),{C}=P;
const ROOT='C:/Users/craig/Documents/Codex/2026-11-01/remediation';
const OUT=path.join(ROOT,'combined-repairs');
const AUTH='C:/Users/craig/.codex/worktrees/luna-accounting-release/gathr-apps-script/functions/artifacts/ocr-caption-fooddrive-oct18/tools/normal-auth.cjs';
const LEDGER='C:/Users/craig/Documents/Codex/2026-10-24/task/coordination/ownership.json';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''));
const save=(name,x)=>fs.writeFileSync(path.join(OUT,name+'.json'),JSON.stringify(x,null,2)+'\n',{flag:'wx'});
function sharedConflicts(p){
 const ledger=read(LEDGER);assert(Array.isArray(ledger.reservedResources));
 const resources=[C.LANE,C.FEED,...p.targets,...p.archives];
 const conflicts=ledger.reservedResources.filter(r=>r.exclusive===true&&!/released|closed|completed/i.test(r.status||'')&&r.taskId!==P.OWNER&&
  resources.some(x=>[r.resourceId,r.resourceName].some(s=>typeof s==='string'&&(s===x||s.endsWith(':'+x)))));
 assert.equal(conflicts.length,0,'Competing exact writer');return{path:LEDGER,sha256:C.fileHash(LEDGER),conflicts:0};
}
function authority(p,dir=OUT){
 const approval=read(path.join(dir,'EXACT_BATCH_APPROVAL.json')),review=read(path.join(dir,'INDEPENDENT_REVIEW.json')),lease=read(path.join(dir,'DIRECT_OWNERSHIP.json'));
 assert.equal(approval.approved,true);assert.equal(approval.operation,'apply');assert.equal(approval.planDigest,p.digest);
 assert.equal(approval.sourceThreadId,P.OWNER);assert(approval.sourceUserMessageId&&approval.sourceUserText);
 assert.equal(approval.sourceUserMessageId,'01a1987e-fc4c-7d90-a3b7-76178aabd300','Wrong direct November1 user authority');
 assert.equal(approval.externalLinkLossAccepted,true);assert.deepEqual(approval.targets,p.targets);
 assert.equal(approval.exactCorrectionsConfirmed,true);assert.equal(approval.exactDuplicateRemovalConfirmed,true);assert.equal(approval.exactCreationsAndMovesConfirmed,true);
 const evidence=approval.directUserEvidence;assert(evidence?.path&&evidence.sha256,'Hashed actual user evidence required');
 assert.equal(C.fileHash(evidence.path),evidence.sha256,'User approval evidence drift');const user=read(evidence.path);
 assert.equal(user.sourceThreadId,P.OWNER);assert.equal(user.sourceUserMessageId,approval.sourceUserMessageId);assert.equal(user.sourceUserText,approval.sourceUserText);
 assert.equal(user.planDigest,p.digest);assert.deepEqual(user.approvedTargets,p.targets);
 const execution=approval.parentExecutionAuthorization;assert(execution?.messageId&&execution.text,'Actual parent execution authorization required');
 // This executor is the originating coordinator; its direct exact human go-ahead
 // is the parent authorization, not a fabricated child-delivery ID.
 assert.equal(execution.executorTaskId,P.OWNER);assert.equal(execution.messageId,user.sourceUserMessageId);assert.equal(execution.text,user.sourceUserText);
 assert.equal(review.approved,true);assert.equal(review.planDigest,p.digest);assert(review.reviewerThreadId&&review.reviewerThreadId!==P.OWNER);
 assert.equal(review.planSHA256,C.fileHash(path.join(dir,'OPERATIONAL_PLAN.json')));
 assert.equal(review.helperSHA256,C.fileHash(require.resolve('./combined.cjs')));assert.equal(review.runnerSHA256,C.fileHash(__filename));
 assert.equal(review.ownerTaskId,P.OWNER);assert.equal(review.coreSHA256,C.fileHash(C.CORE_FILE));
 assert(review.evidence?.path&&review.evidence.sha256);assert.equal(C.fileHash(review.evidence.path),review.evidence.sha256,'Actual independent review evidence changed');
 const reviewed=read(review.evidence.path);assert.equal(reviewed.sourceThreadId,review.reviewerThreadId);assert(reviewed.messageId&&reviewed.text);
 for(const k of ['planDigest','helperSHA256','runnerSHA256','coreSHA256'])assert.equal(reviewed.bindings[k],review[k],'Independent evidence binding mismatch '+k);
 assert.equal(lease.status,'active');assert.equal(lease.ownerTaskId,P.OWNER);assert.equal(lease.planDigest,p.digest);
 assert.equal(lease.sourceUserMessageId,approval.sourceUserMessageId);assert.deepEqual(lease.targets,p.targets);
 assert.equal(lease.feedWriteAuthority,true);assert.equal(lease.storageWriteAuthority,false);assert.equal(lease.queueWriteAuthority,false);
 reservations(p,lease);
 return true;
}
function reservations(p,lease){
 const expected=p.writes.map(w=>({path:(w.update?.name||w.delete||w.transform?.document).slice(C.PREFIX.length),w}));
 assert.equal(lease.ledgerOwnerTaskId,P.OWNER);assert.equal(lease.acceptedFeedVersion,p.feedVersion);
 assert(Array.isArray(lease.reservedResources));assert.equal(lease.reservedResources.length,expected.length,'All exact documents, archives and feed must be reserved');
 assert.equal(new Set(lease.reservedResources.map(r=>r.resourceName)).size,expected.length);
 for(const {path:key,w}of expected){const row=lease.reservedResources.find(r=>r.resourceName===key);assert(row,'Missing exact reservation '+key);
  assert.equal(row.taskId,P.OWNER);assert.equal(row.status,'active');assert.equal(row.exclusive,true);assert.equal(row.productionWriteAuthority,true);
  assert.equal(row.planDigest,p.digest);assert.equal(row.helperSHA256,C.fileHash(require.resolve('./combined.cjs')));assert.equal(row.runnerSHA256,C.fileHash(__filename));
  assert.equal(row.deletionAuthority,Boolean(w.delete));assert.equal(row.createAuthority,Boolean(w.update&&w.currentDocument.exists===false));
  assert.equal(row.updateAuthority,Boolean(w.update&&w.updateMask));assert.equal(row.feedWriteAuthority,Boolean(w.transform));
  assert.deepEqual(row.precondition,w.currentDocument);
 }
 return true;
}
function durationBudget(start){assert(Date.now()-start<120000,'Transaction work exceeded conservative120second budget; stop before commit');}
async function mapLimit(xs,n,fn){const out=new Array(xs.length);let i=0,error;await Promise.all(Array.from({length:Math.min(n,xs.length)},async()=>{while(!error){const k=i++;if(k>=xs.length)return;try{out[k]=await fn(xs[k],k);}catch(e){error||=e;}}}));if(error)throw error;return out;}
async function children(req,paths){return mapLimit(paths,6,async p=>{const x=await req('/'+p+':listCollectionIds',{pageSize:100});assert(!x.nextPageToken&&!(x.collectionIds||[]).length,'Child collections present '+p);return{path:p,collectionIds:[],nextPageToken:null};});}
async function capture(req,p,tx,parserOutside){
 const documents=await C.batch(req,[...new Set([...p.documents.map(d=>d.path),...p.requiredAbsent])],tx);
 const queries=await mapLimit(p.queries,6,async q=>({query:q.query,documents:await C.query(req,q.query,tx)}));
 const child=await children(req,p.childPaths),parserInside=await C.parserIdleInTransaction(req,tx);
 const s={documents,queries,children:child,parserOutside,parserInside};P.checkSnapshot(p,s);return s;
}
async function serving(a,p){
 const baseline=read(path.join(ROOT,'LIVE_BASELINE.json'));assert.equal(baseline.rows.length,3);
 const hash=C.hash; // Same canonical full-environment hash as the fresh baseline.
 const rows=await Promise.all(baseline.rows.map(async b=>{
  const f=await a.request(`https://cloudfunctions.googleapis.com/v2/projects/gathr-migrated/locations/${b.region}/functions/${b.name}`);
  assert.equal(f.state,'ACTIVE');assert.equal(f.labels['firebase-functions-hash'],b.sourceHash);assert.equal(f.serviceConfig.revision,b.revision);
  assert.equal(hash(f.serviceConfig.environmentVariables||{}),b.environmentHash,'Parser environment drift');
  const env=f.serviceConfig.environmentVariables;assert.equal(env.UNKNOWN_VENUE_AUTO_RESOLVE_EXISTING,'false');assert.equal(env.UNKNOWN_VENUE_AUTO_CREATE_ENABLED,'false');
  assert(!Object.hasOwn(env,'PARSER_RESPONSE_REUSE_ENABLED'));assert.equal(f.serviceConfig.maxInstanceCount,20);
  const service=f.serviceConfig.service.split('/').at(-1),s=await a.request(`https://${b.region}-run.googleapis.com/apis/serving.knative.dev/v1/namespaces/gathr-migrated/services/${service}`);
  assert.equal(s.status.conditions.find(x=>x.type==='Ready')?.status,'True');assert.equal(s.status.latestReadyRevisionName,b.revision);
  assert.equal(s.status.traffic.length,1);assert.equal(s.status.traffic[0].percent,100);assert.equal(s.status.traffic[0].revisionName,b.revision);
  return{name:b.name,region:b.region,revision:b.revision,sourceHash:b.sourceHash,gatesOff:true};
 }));return{atUTC:new Date().toISOString(),rows,planDigest:p.digest};
}
async function main(){
 const mode=process.argv[2]||'offline';assert(['offline','--check-live','--apply','--verify'].includes(mode),'Unknown operation; recovery is separately approved and prepared');
 fs.mkdirSync(OUT,{recursive:true});
 if(mode==='offline'){
  const p=P.makePlan(path.join(ROOT,'event-packet'));
  p.boundFiles[__filename]=C.fileHash(__filename);p.boundFiles[path.join(ROOT,'LIVE_BASELINE.json')]=C.fileHash(path.join(ROOT,'LIVE_BASELINE.json'));
  const sealed=P.seal(p);P.bindings(sealed);save('OPERATIONAL_PLAN',sealed);
  console.log(JSON.stringify({status:'PREPARED_OFFLINE',planDigest:sealed.digest,counts:sealed.counts,productionWrites:0}));return;
 }
 const p=read(path.join(OUT,'OPERATIONAL_PLAN.json'));P.bindings(p);
 if(mode==='--apply')authority(p); // Stop before auth if any authority is absent.
 if(mode==='--verify'){
  const r=read(path.join(OUT,'COMMIT.json'));P.validateReceipt(p,r);
  const a=require(AUTH);await a.signIn();const actual=await C.batch(C.readAdapter(a),P.expectedAfter(p,r).map(d=>d.path));
  assert.deepEqual(C.signature(actual),C.signature(P.expectedAfter(p,r)),'Post-commit native readback differs');
  const feed=(await C.batch(C.readAdapter(a),[C.FEED]))[0];
  assert(C.feedVersion(feed)>=Number(r.response.writeResults.at(-1).transformResults[0].integerValue),'Post-commit feed regressed');
  save('NATIVE_VERIFIED',{atUTC:new Date().toISOString(),planDigest:p.digest,paths:actual.length,status:'PASS',receiptSHA256:C.fileHash(path.join(OUT,'COMMIT.json'))});
  console.log(JSON.stringify({status:'NATIVE_READBACK_PASS',paths:actual.length,productionWrites:0}));return;
 }
 P.attemptFence(Object.fromEntries(['attempt','commit','unknown'].map(x=>[x,fs.existsSync(path.join(OUT,x.toUpperCase()+'.json'))])));
 const a=require(AUTH);await a.signIn();const req=C.readAdapter(a),runtime=await serving(a,p),shared=sharedConflicts(p);
 await a.idle();const outsideTx=(await req(':beginTransaction',{options:{readOnly:{}}})).transaction;let parserOutside;
 try{parserOutside=await C.parserIdleInTransaction(req,outsideTx);}finally{await req(':rollback',{transaction:outsideTx});}
 const apply=mode==='--apply';
 const tx=(await a.request(C.BASE+':beginTransaction','POST',{options:apply?{readWrite:{}}:{readOnly:{}}})).transaction;
 let submitted=false,actualResponse;const transactionStart=Date.now();
 try{
  const state=await capture(req,p,tx,parserOutside);
  durationBudget(transactionStart);
  if(!apply){save('LIVE_DRY_RUN_'+Date.now(),{atUTC:new Date().toISOString(),status:'PASS_ALL_PREWRITE_GUARDS',planDigest:p.digest,native:state.documents.length,queries:state.queries.length,childPaths:state.children.length,parserOutside,parserInside:state.parserInside,runtime,shared,productionWrites:0});console.log(JSON.stringify({status:'LIVE_DRY_RUN_PASS',native:state.documents.length,queries:state.queries.length,productionWrites:0}));return;}
  authority(p);sharedConflicts(p);P.bindings(p);
  const backup='PREWRITE_BACKUP_'+Date.now();save(backup,{atUTC:new Date().toISOString(),planDigest:p.digest,state,runtime,shared});
  save('ATTEMPT',{atUTC:new Date().toISOString(),planDigest:p.digest,backup:path.join(OUT,backup+'.json'),backupSHA256:C.fileHash(path.join(OUT,backup+'.json')),automaticRetry:false});
  durationBudget(transactionStart);
  submitted=true;
  const response=await a.request(C.BASE+':commit','POST',{transaction:tx,writes:p.writes});actualResponse=response;
  const receipt={operation:'apply',ownerTaskId:P.OWNER,planDigest:p.digest,writes:p.writes,response,backup:path.join(OUT,backup+'.json'),
   helperSHA256:C.fileHash(require.resolve('./combined.cjs')),runnerSHA256:C.fileHash(__filename),
   approvalSHA256:C.fileHash(path.join(OUT,'EXACT_BATCH_APPROVAL.json')),independentReviewSHA256:C.fileHash(path.join(OUT,'INDEPENDENT_REVIEW.json'))};
  save('COMMIT',receipt);
  // Persist and report the real response before validation or any readback.
  console.log(JSON.stringify({status:'COMMIT_RESPONSE_SAVED',commitTime:response.commitTime,writes:response.writeResults?.length,feedAssigned:Number(response.writeResults?.at(-1)?.transformResults?.[0]?.integerValue),receipt:path.join(OUT,'COMMIT.json')}));
  P.validateReceipt(p,receipt);
 }catch(e){
  if(actualResponse)console.error(JSON.stringify({status:'ACTUAL_COMMIT_RESPONSE_REQUIRES_RECONCILIATION',response:actualResponse,planDigest:p.digest,automaticRetry:false}));
  try{save((submitted?'UNKNOWN':'STOP')+'_'+Date.now(),{atUTC:new Date().toISOString(),submitted,error:e.message,...(actualResponse?{actualResponse}:{}),automaticRetry:false});}catch(saveError){console.error('Stop receipt persistence failed: '+saveError.message);}
  throw e;
 }
 finally{if(!submitted)await req(':rollback',{transaction:tx});}
}
module.exports={authority,reservations,sharedConflicts,capture,serving,mapLimit,children,durationBudget,ROOT,OUT};
if(require.main===module)main().catch(e=>{console.error('Combined repair stopped: '+e.message);process.exitCode=1;});
