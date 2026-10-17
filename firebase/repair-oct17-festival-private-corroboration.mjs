/** Exact reviewed three-private-document creation. Default dry run. No public writes. */
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
const args=process.argv.slice(2),arg=n=>args.find(a=>a.startsWith(n+'='))?.slice(n.length+1);assert(args.every(a=>a==='--apply'||a.startsWith('--plan=')||a.startsWith('--sha256=')),'Unexpected option');
assert(arg('--plan')&&/^[a-f0-9]{64}$/.test(arg('--sha256')||''),'Exact plan and SHA256 required');const bytes=await fs.readFile(path.resolve(arg('--plan')));assert.equal(createHash('sha256').update(bytes).digest('hex'),arg('--sha256'));
const plan=JSON.parse(bytes);assert.equal(plan.schema,'oct17-festival-reviewed-private-v1');assert.equal(plan.fileId,'1JFQdQB-pAXdAb0usJhNFf5mrWnWyBd7g');
assert(/^batch_states\/[A-Za-z0-9_-]+$/.test(plan.finalBatchPath||''),'Final batch path required');assert(plan.preconditions.some(p=>p.path===plan.finalBatchPath),'Unpinned final batch');
const allowed=['festival_website_evidence/01q4d8wzK8R8VH0revQX','festival_link_corroborations/4a65b7a3f61f50846336731613aa93d421c8b2e966680a847e986833d990b49d','festival_link_corroborations/977a549220e75ac05e8a023916cd0eedb3aeae68a1c230282e6a86584d7935d7'];
assert.deepEqual(plan.operations.map(o=>o.path).sort(),allowed.sort());for(const o of plan.operations){assert.equal(o.action,'create');assert(Buffer.byteLength(JSON.stringify(o.payload))<700000);}
assert.equal(plan.operations.filter(o=>o.path.startsWith('festival_link_corroborations/')).reduce((n,o)=>n+o.payload.receipts.length,0),4);
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const hash=x=>createHash('sha256').update(JSON.stringify(stable(JSON.parse(JSON.stringify(x))))).digest('hex');
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
const credential=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));assert.equal(credential.project_id,'gathr-migrated');
const app=admin.initializeApp({credential:admin.credential.cert(credential),projectId:credential.project_id}),db=app.firestore(),locks=db.collection('processing_locks'),checkpoints=db.collection('checkpoints');
const paths=[...new Set([...plan.preconditions.map(p=>p.path),...allowed,'runtime_metadata/event_feed'])],refs=paths.map(p=>db.doc(p));
const wrap=d=>({path:d.ref.path,exists:d.exists,data:d.exists?d.data():null,version:d.updateTime?{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}:null});
const guard=(docs,ls,cp,cps)=>{
 assert(ls.docs.every(d=>['completed','failed','cancelled','canceled','released'].includes(d.get('status'))),'Active parser');assert(!cp.exists&&cps.empty,'Checkpoint reappeared');
 for(const p of plan.preconditions){const d=docs.find(d=>d.ref.path===p.path);assert(d);assert.equal(d.exists,p.exists,'Existence drift '+p.path);if(d.exists){assert.equal(hash(d.data()),p.sha256,'Document drift '+p.path);assert.deepEqual({seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds},p.version,'Version drift '+p.path);}}
 for(const p of allowed)assert(!docs.find(d=>d.ref.path===p).exists,'Private destination already exists');
 const marker=docs.find(d=>d.ref.path==='processed_datasets/'+plan.fileId),lock=ls.docs.find(d=>d.id===plan.fileId);assert(marker?.exists&&lock?.get('status')==='completed'&&lock.get('runId')==='24bd52c0-fe67-4c1e-929c-ada0766febe6','Completion drift');
 const final=docs.find(d=>d.ref.path===plan.finalBatchPath);assert(final?.exists&&final.get('status')==='completed'&&final.get('currentRowIndex')===367&&final.get('totalRows')===367,'Final batch drift');
 const feed=docs.find(d=>d.ref.path==='runtime_metadata/event_feed');assert(feed?.exists&&[302,303].includes(feed.get('version')),'Unexpected intervening feed release');
};
try{
 const [docs,ls,cp,cps]=await Promise.all([db.getAll(...refs),locks.get(),db.doc('checkpoints/'+plan.fileId).get(),checkpoints.where('fileId','==',plan.fileId).get()]);guard(docs,ls,cp,cps);
 if(!args.includes('--apply'))console.log(JSON.stringify({status:'dry_run',operations:plan.operations.map(o=>({path:o.path,action:o.action})),receipts:4,readSetDocuments:docs.length,feedVersion:docs.find(d=>d.ref.path==='runtime_metadata/event_feed').get('version'),publicWrites:0,liveWrites:0}));
 else{
  const out=new URL('./artifacts/oct17-festival-corroboration/',import.meta.url);await fs.mkdir(out,{recursive:true});const stamp=new Date().toISOString().replace(/[:.]/g,'-'),backup='private-prewrite-backup-'+stamp+'.json',result='private-result-'+stamp+'.json';
  await fs.writeFile(new URL(backup,out),JSON.stringify({createdAt:new Date().toISOString(),plan,planSha256:arg('--sha256'),documents:docs.map(wrap),locks:ls.docs.map(wrap)},null,2));await fs.writeFile(new URL(result,out),JSON.stringify({status:'prepared',backup,planSha256:arg('--sha256'),plan},null,2));
  await db.runTransaction(async tx=>{const [fresh,fl,fcp,fcps]=await Promise.all([tx.getAll(...refs),tx.get(locks),tx.get(db.doc('checkpoints/'+plan.fileId)),tx.get(checkpoints.where('fileId','==',plan.fileId))]);guard(fresh,fl,fcp,fcps);
   assert.equal(hash(fresh.find(d=>d.ref.path==='runtime_metadata/event_feed').data()),hash(docs.find(d=>d.ref.path==='runtime_metadata/event_feed').data()),'Feed changed during private apply');for(const o of plan.operations)tx.create(db.doc(o.path),o.payload);});
  await fs.writeFile(new URL(result,out),JSON.stringify({status:'applied_pending_verification',backup,planSha256:arg('--sha256'),plan},null,2));
  const after=await db.getAll(...refs);for(const d of after){const o=plan.operations.find(o=>o.path===d.ref.path),before=docs.find(b=>b.ref.path===d.ref.path);assert.equal(d.exists,o?true:before.exists);if(d.exists)assert.equal(hash(d.data()),hash(o?o.payload:before.data()),'Unexpected delta '+d.ref.path);}
  await fs.writeFile(new URL(result,out),JSON.stringify({status:'applied',backup,planSha256:arg('--sha256'),plan,verifiedAt:new Date().toISOString(),after:after.map(wrap),publicWrites:0},null,2));console.log(JSON.stringify({status:'applied',privateCreates:3,receipts:4,publicWrites:0,backup,result}));
 }
}finally{await app.delete();}
