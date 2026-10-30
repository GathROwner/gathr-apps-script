'use strict';
// Exact location-only operation, reusing accepted native/version/parser/feed guards.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),P=require('./location-core.cjs'),{C}=P;
const AUTH='C:/Users/craig/.codex/worktrees/luna-accounting-release/gathr-apps-script/functions/artifacts/ocr-caption-fooddrive-oct18/tools/normal-auth.cjs';
const SHARED='C:/Users/craig/Documents/Codex/2026-10-24/task/coordination/ownership.json',dir=__dirname;
const file=n=>path.join(dir,n+'.json'),read=n=>P.read(file(n));
const save=(n,x)=>fs.writeFileSync(file(n),JSON.stringify(x,null,2)+'\n',{flag:'wx'});
const mode=process.argv[2]||'offline',a=require(AUTH);
const fieldsHash=d=>C.hash(d.fields);
function bound(p){P.validate(p);for(const[f,h]of Object.entries(p.boundFiles))assert.equal(C.fileHash(f),h,'Bound evidence/code drift '+f);assert.equal(C.fileHash(__filename),p.runnerSHA256);return p;}
function conflicts(p){const shared=P.read(SHARED),scope=[C.LANE,C.FEED,...p.actions.map(x=>x.path)];const bad=(shared.reservedResources||[]).filter(r=>r.exclusive===true&&!/released|closed|completed/i.test(r.status||'')&&r.taskId!==P.OWNER&&scope.some(s=>[r.resourceId,r.resourceName].some(v=>typeof v==='string'&&(v===s||v.endsWith(':'+s)))));assert.equal(bad.length,0,'Competing exact writer');return{path:SHARED,sha256:C.fileHash(SHARED),conflicts:0};}
function authority(p){
 const auth=read('EXACT_SCOPE_AUTHORITY'),review=read('INDEPENDENT_REVIEW'),lease=read('DIRECT_OWNERSHIP');
 assert.equal(auth.sourceThreadId,P.OWNER);assert.equal(auth.sourceUserMessageId,'01a18e31-35a9-7cf1-99f2-e7d88cede994');assert.equal(auth.sourceUserText,'Ok fix them');assert.equal(auth.planDigest,p.digest);assert.deepEqual(auth.targets,p.actions.map(a=>a.path));
 assert.equal(C.fileHash(auth.evidence.path),auth.evidence.sha256);const actual=P.read(auth.evidence.path);assert.equal(actual.sourceUserMessageId,auth.sourceUserMessageId);assert.equal(actual.sourceUserText,auth.sourceUserText);assert.equal(actual.sourceThreadId,P.OWNER);
 assert.equal(review.approved,true);assert(review.reviewerTaskId&&review.reviewerTaskId!==P.OWNER);assert.equal(review.planDigest,p.digest);assert.equal(review.planSHA256,C.fileHash(file('PLAN')));assert.equal(review.coreSHA256,C.fileHash(require.resolve('./location-core.cjs')));assert.equal(review.runnerSHA256,C.fileHash(__filename));assert.equal(review.acceptedCoreSHA256,C.fileHash(P.CORE));assert.equal(C.fileHash(review.evidence.path),review.evidence.sha256);const evidence=P.read(review.evidence.path);assert.equal(evidence.sourceThreadId,review.reviewerTaskId);assert(evidence.messageId&&evidence.text);assert.equal(evidence.planDigest,p.digest);
 assert.equal(lease.ownerTaskId,P.OWNER);assert.equal(lease.status,'active');assert.equal(lease.planDigest,p.digest);assert.equal(lease.feedWriteAuthority,true);assert.equal(lease.deletionAuthority,false);assert.equal(lease.recoveryAuthority,false);assert.deepEqual(lease.targets,p.actions.map(a=>a.path));assert.equal(lease.sourceUserMessageId,auth.sourceUserMessageId);
 return{authoritySHA256:C.fileHash(file('EXACT_SCOPE_AUTHORITY')),reviewSHA256:C.fileHash(file('INDEPENDENT_REVIEW')),leaseSHA256:C.fileHash(file('DIRECT_OWNERSHIP'))};
}
const req=async(suffix,body)=>{assert(/(?::batchGet|:runQuery|:beginTransaction|:rollback|:listCollectionIds)$/.test(suffix),'Read transport only');return a.request(a.database+'/documents'+suffix,'POST',body);};
async function venueEvents(tx){return C.query(req,{parent:P.VENUE,collection:'events',allDescendants:false,limit:101,label:'Montague exact complete retained event parents'},tx);}
async function snapshot(p,tx,kind='before',receipt){
 const paths=[...p.actions.flatMap(x=>[x.path,x.archivePath]),...p.protectedRemovedPaths,...p.sourceDocuments.map(x=>x.path),C.FEED];
 const ds=await C.batch(req,paths,tx),events=await venueEvents(tx);P.check(p,ds,events,kind,receipt);
 const m=new Map(ds.map(x=>[x.path,x]));for(const s of p.sourceDocuments){const current=m.get(s.path);assert(current?.exists);assert.equal(current.updateTime,s.updateTime);assert.equal(fieldsHash(current),fieldsHash(s),'Exact source snapshot changed');}
 return{documents:ds,events,feed:m.get(C.FEED),parserInside:tx?await C.parserIdleInTransaction(req,tx):null};
}
async function prepare(){
 assert(!fs.existsSync(file('PLAN')),'Never overwrite a frozen packet');await a.signIn();const idle=await a.idle();assert.equal(idle.checkpointCount,0);
 const events=await venueEvents(),baseDocs=await C.batch(req,[P.VENUE,C.FEED]),venue=baseDocs.find(d=>d.path===P.VENUE),feed=baseDocs.find(d=>d.path===C.FEED);
 const audit=P.read(P.AUDIT+'/snapshots.json').find(x=>x.data.rowIndex===126);assert(audit);
 const [source]=await C.batch(req,[audit.path]);assert.equal(a.data(source).uniqueId,'1448322924150044');assert.deepEqual(a.data(source).captionProvenance,audit.data.captionProvenance,'Reviewed source provenance changed');
 const initial=P.make(venue,events,feed,P.read(P.EVIDENCE+'/PLACES_EVIDENCE.json'),new Date().toISOString());delete initial.digest;
 initial.runnerSHA256=C.fileHash(__filename);initial.sourceDocuments=[source];const p=P.seal(initial);bound(p);conflicts(p);
 const s=await snapshot(p);assert.equal(C.feedVersion(s.feed),p.feedVersion);save('PREPARATION',{atUTC:new Date().toISOString(),readOnly:true,idle,snapshot:s});save('PLAN',p);
 console.log(JSON.stringify({status:'PREPARED_NO_WRITES',planDigest:p.digest,targets:p.actions.map(a=>a.path),writes:17,feedBefore:p.feedVersion}));
}
async function run(){
 if(mode==='prepare')return prepare();const p=bound(read('PLAN'));
 if(mode==='offline'){console.log(JSON.stringify({status:'OFFLINE_VALIDATED',planDigest:p.digest,updates:8,writes:17}));return;}
 assert(['check-live','apply','verify'].includes(mode),'Unsupported mode');await a.signIn();
 if(mode==='verify'){
  const receipt=read('COMMIT');assert.equal(receipt.planDigest,p.digest);assert.deepEqual(receipt.writes,P.writes(p,receipt.beforeFeed));assert.equal(receipt.response.writeResults.length,17);assert(receipt.response.commitTime);
  const s=await snapshot(p,null,'after',receipt);assert(C.feedVersion(s.feed)>=receipt.assignedFeed);save('READBACK',{atUTC:new Date().toISOString(),status:'PASS_NATIVE_TYPED_ARCHIVES_AND_ROUTING',commitTime:receipt.response.commitTime,documents:s.documents,events:s.events,feedVersion:C.feedVersion(s.feed)});
  console.log(JSON.stringify({status:'PASS_NATIVE_TYPED_ARCHIVES_AND_ROUTING',targets:8,archives:8,feedVersion:C.feedVersion(s.feed)}));return;
 }
 const idle=await a.idle();assert.equal(idle.checkpointCount,0);const shared=conflicts(p);
 if(mode==='check-live'){const s=await snapshot(p);assert.equal(C.feedVersion(s.feed),p.feedVersion);console.log(JSON.stringify({status:'PASS_READ_ONLY_CURRENT_GUARDS',atUTC:new Date().toISOString(),targets:8,feed:C.feedVersion(s.feed),idle,shared}));return;}
 const auth=authority(p);assert(!fs.existsSync(file('ATTEMPT'))&&!fs.existsSync(file('COMMIT')),'One-shot attempted; inspect actual outcome');
 save('ATTEMPT',{atUTC:new Date().toISOString(),planDigest:p.digest,mode:'apply',auth,shared});
 const started=Date.now(),tx=await a.request(a.database+'/documents:beginTransaction','POST',{options:{readWrite:{}}});assert(tx.transaction);
 let submitted=false;
 try{
  const s=await snapshot(p,tx.transaction);assert.equal(C.feedVersion(s.feed),p.feedVersion,'Serialized feed changed');assert(Date.now()-started<120000,'Transaction budget exceeded');
  const reauth=authority(p);assert.deepEqual(reauth,auth,'Authority/review changed');conflicts(p);bound(p);
  const writes=P.writes(p,s.feed);save('PREWRITE_TYPED_BACKUP',{atUTC:new Date().toISOString(),planDigest:p.digest,snapshot:s,fullTypedPrestates:p.actions.map(x=>x.before),writes,parserOutside:idle});
  submitted=true;const response=await a.request(a.database+'/documents:commit','POST',{transaction:tx.transaction,writes});
  const assignedFeed=Number(response.writeResults.at(-1).transformResults[0].integerValue),receipt={atUTC:new Date().toISOString(),planDigest:p.digest,planSHA256:C.fileHash(file('PLAN')),beforeFeed:s.feed,writes,response,assignedFeed};save('COMMIT',receipt);
  // Commit result is persisted and printed before any readback or further reporting.
  console.log(JSON.stringify({status:'COMMITTED',commitTime:response.commitTime,writes:response.writeResults.length,assignedFeed,receiptPath:file('COMMIT')}));
 }catch(e){save('STOP',{atUTC:new Date().toISOString(),planDigest:p.digest,submitted,error:e.message,meaning:submitted?'Uncertain submission: inspect actual targets/archive/feed before retry.':'Commit not submitted; inspect guard failure.'});throw e;}
 finally{if(!submitted)await a.request(a.database+'/documents:rollback','POST',{transaction:tx.transaction});}
}
if(require.main===module)run().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={bound,conflicts,authority,run};
