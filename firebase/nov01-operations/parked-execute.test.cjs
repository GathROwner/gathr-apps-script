'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const X=require('./parked-execute.cjs'),P=require('./parked-create.cjs'),R=require('./parked-create-runner.cjs'),{C}=P;
const p=P.read(path.join(X.OUT,'OPERATIONAL_PLAN.json'));
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gathr-offline-synthetic-authority-'));
 t.after(()=>{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert(path.basename(dir).startsWith('gathr-offline-synthetic-authority-'));fs.rmSync(dir,{recursive:true});});
 const put=(n,x)=>fs.writeFileSync(path.join(dir,n+'.json'),JSON.stringify(x,null,2)+'\n');
 fs.copyFileSync(path.join(X.OUT,'OPERATIONAL_PLAN.json'),path.join(dir,'OPERATIONAL_PLAN.json'));
 const targets=p.operations.map(o=>o.path),h=X.hashes(),user={...p.authority,planDigest:p.digest,approvedTargets:targets};put('USER',user);
 const actual={sourceThreadId:'SYNTHETIC_OFFLINE_REVIEWER',messageId:'SYNTHETIC_OFFLINE_MESSAGE',text:'Synthetic offline test only '+p.digest,bindings:{...h,planDigest:p.digest}};put('MESSAGE',actual);
 const review={approved:true,planDigest:p.digest,ownerTaskId:P.OWNER,reviewerThreadId:actual.sourceThreadId,planSHA256:C.fileHash(path.join(dir,'OPERATIONAL_PLAN.json')),...h,evidence:{path:path.join(dir,'MESSAGE.json'),sha256:C.fileHash(path.join(dir,'MESSAGE.json'))}};put('INDEPENDENT_REVIEW',review);
 const approval={approved:true,operation:'apply',planDigest:p.digest,targets,sourceThreadId:P.OWNER,sourceUserMessageId:user.sourceUserMessageId,sourceUserText:user.sourceUserText,exactCreationsConfirmed:true,storageWriteAuthority:false,queueWriteAuthority:false,directUserEvidence:{path:path.join(dir,'USER.json'),sha256:C.fileHash(path.join(dir,'USER.json'))},parentExecutionAuthorization:{executorTaskId:P.OWNER,messageId:user.sourceUserMessageId,text:user.sourceUserText}};put('EXACT_BATCH_APPROVAL',approval);
 const writes=P.forwardWrites(p,P.index(p.documents).get(C.FEED)),lease={status:'active',ownerTaskId:P.OWNER,ledgerOwnerTaskId:P.OWNER,planDigest:p.digest,acceptedFeedVersion:p.feedVersion,sourceUserMessageId:user.sourceUserMessageId,targets,feedWriteAuthority:true,storageWriteAuthority:false,queueWriteAuthority:false,reservedResources:writes.map(w=>({resourceName:(w.update?.name||w.transform?.document).slice(C.PREFIX.length),taskId:P.OWNER,status:'active',exclusive:true,productionWriteAuthority:true,planDigest:p.digest,...h,deletionAuthority:false,createAuthority:Boolean(w.update),updateAuthority:false,feedWriteAuthority:Boolean(w.transform),precondition:w.currentDocument}))};put('DIRECT_OWNERSHIP',lease);
 return{dir,put,approval,review,lease};}
test('synthetic authority fixture exercises exact accepted create-only bindings',t=>{const f=fixture(t);assert.equal(X.authority(p,f.dir),true);});
for(const [name,file,key,value]of [
 ['missing human scope','EXACT_BATCH_APPROVAL','exactCreationsConfirmed',false],
 ['wrong user message','EXACT_BATCH_APPROVAL','sourceUserMessageId','SYNTHETIC_WRONG'],
 ['queue authority is outside batch','EXACT_BATCH_APPROVAL','queueWriteAuthority',true],
 ['storage authority is outside batch','EXACT_BATCH_APPROVAL','storageWriteAuthority',true],
 ['independent rejection','INDEPENDENT_REVIEW','approved',false],
 ['same-owner reviewer','INDEPENDENT_REVIEW','reviewerThreadId',P.OWNER],
 ['different plan review','INDEPENDENT_REVIEW','planDigest','wrong'],
 ['different transport review','INDEPENDENT_REVIEW','runnerSHA256','wrong'],
 ['inactive lease','DIRECT_OWNERSHIP','status','released'],
 ['wrong feed lease','DIRECT_OWNERSHIP','acceptedFeedVersion',p.feedVersion+1],
 ['missing feed authority','DIRECT_OWNERSHIP','feedWriteAuthority',false]
])test('rejects '+name,t=>{const f=fixture(t),v=P.read(path.join(f.dir,file+'.json'));v[key]=value;f.put(file,v);assert.throws(()=>X.authority(p,f.dir));});
test('rejects missing resource reservation',t=>{const f=fixture(t);f.lease.reservedResources.pop();f.put('DIRECT_OWNERSHIP',f.lease);assert.throws(()=>X.authority(p,f.dir));});
test('rejects stale per-resource version',t=>{const f=fixture(t);f.lease.reservedResources[0].precondition={exists:true};f.put('DIRECT_OWNERSHIP',f.lease);assert.throws(()=>X.authority(p,f.dir));});
test('rejects duplicate resource reservation',t=>{const f=fixture(t);f.lease.reservedResources[1]=P.clone(f.lease.reservedResources[0]);f.put('DIRECT_OWNERSHIP',f.lease);assert.throws(()=>X.authority(p,f.dir));});
test('rejects changed reviewer-message bytes',t=>{const f=fixture(t);fs.appendFileSync(path.join(f.dir,'MESSAGE.json'),' ');assert.throws(()=>X.authority(p,f.dir));});
test('actual capture passes transaction to complete native and query guards before writes',async t=>{
 const prior=P.read(path.join(X.ROOT,'packet-preparation/GUARD_CAPTURE.json')),queries=[];let batched=0,children=0,inside=0;
 t.mock.method(C,'batch',async(req,paths,tx)=>{assert.equal(tx,'synthetic-read-write-transaction');assert.equal(paths.length,p.documents.length);batched++;return P.clone(prior.documents);});
 t.mock.method(C,'query',async(req,q,tx)=>{assert.equal(tx,'synthetic-read-write-transaction');queries.push(q.label);return P.clone(prior.queries.find(x=>C.hash(x.query)===C.hash(q)).documents);});
 t.mock.method(R,'children',async(req,paths)=>{assert.deepEqual(paths,p.childPaths);children++;return P.clone(prior.children);});
 t.mock.method(C,'parserIdleInTransaction',async(req,tx)=>{assert.equal(tx,'synthetic-read-write-transaction');inside++;return P.clone(prior.parserInside);});
 const state=await X.capture(()=>assert.fail('Unexpected network'),p,'synthetic-read-write-transaction',prior.parserOutside);
 assert.equal(batched,1);assert.equal(children,1);assert.equal(inside,1);assert.equal(queries.length,p.queries.length);assert.equal(P.checkSnapshot(p,state).length,37);
});
test('capture rejects parser activity before a write can be constructed',async t=>{
 const prior=P.read(path.join(X.ROOT,'packet-preparation/GUARD_CAPTURE.json'));
 t.mock.method(C,'batch',async()=>P.clone(prior.documents));t.mock.method(C,'query',async(req,q)=>P.clone(prior.queries.find(x=>C.hash(x.query)===C.hash(q)).documents));t.mock.method(R,'children',async()=>P.clone(prior.children));
 t.mock.method(C,'parserIdleInTransaction',async()=>({...prior.parserInside,activeLocks:1}));
 await assert.rejects(X.capture(()=>assert.fail('Unexpected network'),p,'synthetic',prior.parserOutside),/Parser idle/);
});
