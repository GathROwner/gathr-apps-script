import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyFestivalFullRun,claimFestivalShadowJob,finishFestivalShadowJob,festivalShadowJobId,festivalShadowFingerprint,FullRunEvidence} from './festivalLinkShadowJob.js';
const full=():FullRunEvidence=>({fileId:'dataset',checkpointExists:false,lock:{fileId:'dataset',runId:'run',status:'completed'},marker:{fileId:'dataset',fileName:'APIFY Dataset.xlsx'},batch:{fileId:'dataset',runId:'run',status:'completed',currentRowIndex:370,totalRows:370}});
test('requires all four completion authorities, final cursor and same run identity',()=>{
 assert(verifyFestivalFullRun(full()).ready);
 for(const change of [{marker:undefined},{checkpointExists:true},{lock:{fileId:'dataset',runId:'run',status:'running'}},{batch:{...full().batch,runId:'old'}},{batch:{...full().batch,currentRowIndex:369}},{marker:{...full().marker,fileId:'other'}}]) assert(!verifyFestivalFullRun({...full(),...change}).ready);
});
test('dry and selected-row evidence cannot masquerade as a regular full run',()=>{
 for(const marker of [{...full().marker,dryRun:true},{...full().marker,selectedRows:[1]},{...full().marker,fileName:'selected-row-replay.xlsx'}]) assert(!verifyFestivalFullRun({...full(),marker}).ready);
});
test('resumed skipped rows do not require processed-row counters to equal total rows',()=>{assert(verifyFestivalFullRun(full()).ready);});
test('stable dataset job and input hash ignore object property order',()=>{
 assert.equal(festivalShadowFingerprint({a:1,b:{x:2,y:3}}),festivalShadowFingerprint({b:{y:3,x:2},a:1}));
 assert.equal(festivalShadowJobId('dataset'),festivalShadowJobId('dataset'));assert.notEqual(festivalShadowJobId('other'),festivalShadowJobId('dataset'));
});
const claim=(previous:any=undefined,overrides:any={})=>claimFestivalShadowJob(previous,{fileId:'dataset',inputFingerprint:'revision1',workerToken:'a',nowMs:100,leaseMs:100,...overrides});
test('only one worker claims a lease, even with a changed input revision',()=>{
 const a=claim();assert.equal(a.decision,'claimed');if(a.decision!=='claimed')return;
 assert.equal(claim(a.job,{workerToken:'b',inputFingerprint:'revision2'}).decision,'busy');
});
test('stale takeover fences original writer and generations never regress',()=>{
 const a=claim();if(a.decision!=='claimed')throw Error();const b=claim(a.job,{workerToken:'b',nowMs:201});if(b.decision!=='claimed')throw Error();
 assert.equal(b.job.generation,2);assert.throws(()=>finishFestivalShadowJob(b.job,a.job,202,'completed'),/Stale/);
 const done=finishFestivalShadowJob(b.job,b.job,202,'completed');assert.equal(claim(done,{nowMs:203}).decision,'already_completed');
});
test('later source or canonical revision requeues a completed dataset idempotently',()=>{
 const a=claim();if(a.decision!=='claimed')throw Error();const done=finishFestivalShadowJob(a.job,a.job,101,'completed');
 const b=claim(done,{nowMs:102,inputFingerprint:'revision2'});if(b.decision!=='claimed')throw Error();assert.equal(b.job.generation,2);assert.equal(b.job.attempts,1);
});
test('expired workers cannot finish and retry exhaustion remains visible',()=>{
 const a=claim();if(a.decision!=='claimed')throw Error();assert.throws(()=>finishFestivalShadowJob(a.job,a.job,201,'completed'),/Stale/);
 assert.equal(claim({...a.job,status:'retryable',attempts:5}).decision,'attempts_exhausted');
});
