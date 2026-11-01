'use strict';
// Preparation transport only. The accepted read adapter rejects every mutation endpoint.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const P=require('./parked-create.cjs'),D=require('./parked-prepare.cjs'),{C}=P;
// Reuse unchanged accepted combined-runner read helpers without its module-load
// dependency on the historical authenticated executor.
async function mapLimit(xs,n,fn){const out=new Array(xs.length);let i=0,error;await Promise.all(Array.from({length:Math.min(n,xs.length)},async()=>{while(!error){const k=i++;if(k>=xs.length)return;try{out[k]=await fn(xs[k],k);}catch(e){error||=e;}}}));if(error)throw error;return out;}
async function children(req,paths){return mapLimit(paths,6,async p=>{const x=await req('/'+p+':listCollectionIds',{pageSize:100});assert(!x.nextPageToken&&!(x.collectionIds||[]).length,'Child collections present '+p);return{path:p,collectionIds:[],nextPageToken:null};});}
function durationBudget(start){assert(Date.now()-start<120000,'Transaction work exceeded conservative120second budget');}
const AUTH='C:/Users/craig/.codex/worktrees/luna-accounting-release/gathr-apps-script/functions/artifacts/ocr-caption-fooddrive-oct18/tools/normal-auth.cjs';
async function serving(a,expected){
 const rows=[];assert.equal(expected.length,3);
 for(const b of expected){const f=await a.request('https://cloudfunctions.googleapis.com/v2/'+b.name);
  assert.equal(f.state,'ACTIVE');assert.equal(f.labels['firebase-functions-hash'],b.labels['firebase-functions-hash'],'Serving source drift');
  assert.equal(f.serviceConfig.revision,b.serviceConfig.revision,'Serving revision drift');
  assert.equal(f.serviceConfig.maxInstanceCount,b.serviceConfig.maxInstanceCount,'Serving instance policy drift');
  assert.equal(C.hash(f.serviceConfig.environmentVariables||{}),C.hash(b.serviceConfig.environmentVariables||{}),'Serving environment drift');
  const region=b.name.split('/')[3],service=f.serviceConfig.service.split('/').at(-1);
  const s=await a.request(`https://${region}-run.googleapis.com/apis/serving.knative.dev/v1/namespaces/gathr-migrated/services/${service}`);
  assert.equal(s.status.conditions.find(x=>x.type==='Ready')?.status,'True');assert.equal(s.status.latestReadyRevisionName,f.serviceConfig.revision);
  assert.equal(s.status.traffic.length,1);assert.equal(s.status.traffic[0].percent,100);assert.equal(s.status.traffic[0].revisionName,f.serviceConfig.revision);
  rows.push({name:f.name,sourceHash:f.labels['firebase-functions-hash'],revision:f.serviceConfig.revision,environmentHash:C.hash(f.serviceConfig.environmentVariables||{}),maxInstanceCount:f.serviceConfig.maxInstanceCount,traffic:s.status.traffic});
 }return rows;
}
async function idle(req){const transaction=(await req(':beginTransaction',{options:{readOnly:{}}})).transaction;try{return await C.parserIdleInTransaction(req,transaction);}finally{await req(':rollback',{transaction});}}
async function capture(a,r){
 const req=C.readAdapter(a),baseline=P.read(path.join(D.ROOT,'LIVE_SOURCE_BASELINE.json'));
 const runtime=await serving(a,baseline.parserFunctions),parserOutside=await idle(req);
 const transaction=(await req(':beginTransaction',{options:{readOnly:{}}})).transaction,start=Date.now();
 try{
  const documents=await C.batch(req,r.documents,transaction);
  const queries=await mapLimit(r.queries,6,async query=>({query,documents:await C.query(req,query,transaction)}));
  const child=await children(req,r.childPaths),parserInside=await C.parserIdleInTransaction(req,transaction);
  durationBudget(start);return{atUTC:new Date().toISOString(),requestDigest:r.digest,documents,queries,children:child,parserOutside,parserInside,parserFunctions:runtime,transactionMode:'readOnly',productionWrites:0};
 }finally{await req(':rollback',{transaction});}
}
async function main(args=process.argv.slice(2)){
 const mode=args[0]||'offline';assert.equal(args.length,mode==='offline'&&args.length===0?0:1,'Unexpected arguments');
 if(!['offline','--capture-live','--check-live'].includes(mode))P.executionUnavailable(); // Stop before loading auth.
 const r=P.read(path.join(D.OUT,'REQUEST.json'));C.verifyDigest(r);assert.deepEqual(r,D.requestPacket(),'Source/request drift');
 if(mode==='offline'){
  const file=path.join(D.OUT,'OPERATIONAL_PLAN.json');if(fs.existsSync(file)){const p=P.read(file);P.bindings(p);assert.deepEqual(p,D.makePlan(r,P.read(path.join(D.OUT,'GUARD_CAPTURE.json'))));}
  console.log(JSON.stringify({status:'OFFLINE_VALIDATED',requestDigest:r.digest,productionWrites:0}));return;
 }
 let plan;if(mode==='--check-live'){plan=P.read(path.join(D.OUT,'OPERATIONAL_PLAN.json'));P.bindings(plan);}
 const a=require(AUTH);await a.signIn();const s=await capture(a,r);
 if(mode==='--capture-live'){
  D.assertNoDuplicate(r,s);for(const p of r.requiredAbsent)assert.equal(P.index(s.documents).get(p)?.exists,false,'Required absence occupied '+p);
  D.save('GUARD_CAPTURE.json',s);console.log(JSON.stringify({status:'READ_ONLY_CAPTURED',atUTC:s.atUTC,documents:s.documents.length,queries:s.queries.length,productionWrites:0}));
 }else{
  P.checkSnapshot(plan,s);D.save('LIVE_CHECK_'+Date.now()+'.json',{...s,status:'READ_ONLY_GUARDS_PASS',planDigest:plan.digest});
  console.log(JSON.stringify({status:'READ_ONLY_GUARDS_PASS',planDigest:plan.digest,productionWrites:0}));
 }
}
module.exports={main,capture,serving,idle,mapLimit,children,durationBudget};
if(require.main===module)main().catch(e=>{console.error('Parked preparation stopped: '+e.message);process.exitCode=1;});
