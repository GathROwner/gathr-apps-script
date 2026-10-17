/** Exact October17 reviewed manifest only. Default is read-only. No media writes. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const args=process.argv.slice(2),arg=name=>args.find(a=>a.startsWith(name+'='))?.slice(name.length+1);
assert(args.every(a=>a==='--apply'||a.startsWith('--plan=')||a.startsWith('--sha256=')),'Unexpected option');
assert(arg('--plan')&&/^[a-f0-9]{64}$/.test(arg('--sha256')||''),'Exact reviewed plan and SHA256 required');
const bytes=await fs.readFile(path.resolve(arg('--plan')));
assert.equal(createHash('sha256').update(bytes).digest('hex'),arg('--sha256'),'Reviewed plan changed');
const plan=JSON.parse(bytes);assert.equal(plan.schema,'oct17-audit-approved-batch-v1');
assert.equal(plan.fileId,'1JFQdQB-pAXdAb0usJhNFf5mrWnWyBd7g');
assert(plan.operations.length>0&&plan.operations.length<=30);
const allowed=new Map([
 ['venues/LglliE42SPFssmoU01su/events/oct17_restore_1733964295400114_fe14ea52014e1ad1','create'],
 ['venues/LglliE42SPFssmoU01su/events/oct17_restore_1733964295400114_df3cb6b28175abf5','create'],
 ['venues/slug_eptek.centre/events/nOz8TgJISaSmdkMUVNzY','update'],
 ['venues/V7zQ5unfTY1GtNKUvR7c/events/bDdUKS57VSPMil4oKqqp','update'],
 ['venues/DZ4nQZQnOKCkTotuKYVv/events/pXeHp206JhwAKXZfgoE3','delete'],
 ['venues/DZ4nQZQnOKCkTotuKYVv','update'],
 ['venues/slug_foundersfoodhall/events/sf9FKqC2RWLXStUj7Lwn','update'],
 ['venues/slug_foundersfoodhall/events/Nqq3FWCRRCBudDP1FYYh','delete'],
 ['venues/slug_foundersfoodhall','update'],
 ['venues/slug_royaltycrossing/events/6idnDEErpAB7Ex2skVxQ','update'],
 ['venues/qUg3AMPeXX9URM0UrXEA/events/4ZxbxygV32qUmnT7Pbt7','update'],
 ['venues/slug_bellaliantcentre/events/jjOj9C8U4xuOe87fdmGV','update'],
 ['venues/LglliE42SPFssmoU01su/events/MaC5HZv3CVQR5M6koJCO','update'],
 ['venues/slug_cornwallciviccentre/events/NvtBo0lQs208nlxrHSYH','update'],
 ['venues/RJ9iYyEWcYUr91hcGSeL/events/2DjVdRAtNrcyKPPgjjQU','delete'],
 ['venues/slug_mothlanebrewing/events/dqtPfabTkUTz0dn2pHVW','delete'],
 ['venues/RJ9iYyEWcYUr91hcGSeL','update'],
 ['venues/slug_mothlanebrewing','update'],
 ['event_integrity_holds/oct17_coats_distribution_1118550040924946','create'],
 ['event_integrity_holds/oct17_mothlane_clock_1720610070064632','create'],
 ['runtime_metadata/event_feed','update'],
]);
assert.equal(new Set(plan.operations.map(o=>o.path)).size,plan.operations.length,'Duplicate operation paths');
for(const o of plan.operations){assert.equal(allowed.get(o.path),o.action,'Unapproved target/action: '+o.path);
 if(/^venues\/[^/]+$/.test(o.path))assert.deepEqual(Object.keys(o.payload),['reviewedOccurrenceConstraints'],'Venue changes must be policy-only');
 if(o.path==='runtime_metadata/event_feed')assert.deepEqual(Object.keys(o.payload),['version'],'Feed delta must be version-only');
}
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const admin=require('firebase-admin');
const credential=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));
assert.equal(credential.project_id,'gathr-migrated');
const app=admin.initializeApp({credential:admin.credential.cert(credential),projectId:credential.project_id});
const db=app.firestore();
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(canonical(JSON.parse(JSON.stringify(v))))).digest('hex');
const plain=d=>({path:d.ref.path,exists:d.exists,version:d.updateTime?{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}:null,data:d.exists?d.data():null});
const roots=d=>[d.uniqueId,d.sourceUniqueId,...(d.sourceUniqueIds||[])].map(x=>String(x||'').split('_')[0]);
const related=docs=>docs.filter(d=>roots(d.data()).some(s=>plan.sourceRoots.includes(s))).map(d=>d.ref.path).sort();
const terminal=new Set(['completed','failed','cancelled','canceled','released']);
const validate=(docs,locks,marker,checkpoint,siblings,matchingCheckpoints)=>{
 assert(locks.docs.every(d=>terminal.has(String(d.get('status')||''))),'Active parser; abort');
 assert(marker.exists&&marker.get('fileId')===plan.fileId,'Completion marker drift');
 const lock=locks.docs.find(d=>d.id===plan.fileId);assert(lock&&lock.get('status')==='completed'&&lock.get('runId')===plan.runId,'Completed run lock drift');
 const batch=docs.find(d=>d.ref.path===plan.finalBatchPath);assert(batch?.exists&&batch.get('status')==='completed'&&batch.get('currentRowIndex')===367&&batch.get('totalRows')===367,'Final batch drift');
 assert(!checkpoint.exists,'Parser checkpoint present');
 assert(matchingCheckpoints.empty,'Matching parser checkpoint present');
 assert.deepEqual(related(siblings.docs),plan.sourceSiblingPaths,'Source sibling membership drift');
 for(const p of plan.preconditions){const d=docs.find(d=>d.ref.path===p.path);assert(d,'Missing read-set document');
  assert.equal(d.exists,p.exists,'Existence drift: '+p.path);
  if(d.exists)assert.equal(hash(d.data()),p.sha256,'Document drift: '+p.path);
 }
};
const decode=v=>Array.isArray(v)?v.map(decode):v&&typeof v==='object'?
 Object.keys(v).length===2&&Number.isInteger(v._seconds)&&Number.isInteger(v._nanoseconds)?new admin.firestore.Timestamp(v._seconds,v._nanoseconds):
 Object.fromEntries(Object.entries(v).map(([k,x])=>[k,decode(x)])):v;
try{
 const refs=plan.preconditions.map(p=>db.doc(p.path));
 const [docs,locks,marker,checkpoint,siblings,matchingCheckpoints]=await Promise.all([db.getAll(...refs),db.collection('processing_locks').get(),
  db.doc('processed_datasets/'+plan.fileId).get(),db.doc('checkpoints/'+plan.fileId).get(),db.collectionGroup('events').get(),db.collection('checkpoints').where('fileId','==',plan.fileId).get()]);
 validate(docs,locks,marker,checkpoint,siblings,matchingCheckpoints);
 const outDir=path.resolve('firebase/artifacts/oct17-eight-group');await fs.mkdir(outDir,{recursive:true});
 const stamp=new Date().toISOString().replace(/[:.]/g,'-');
 if(!args.includes('--apply')){console.log(JSON.stringify({dryRun:true,ready:true,operations:plan.operations.map(o=>({action:o.action,path:o.path})),liveWrites:0}));}
 else{
  const backup=path.join(outDir,'prewrite-backup-'+stamp+'.json');
  await fs.writeFile(backup,JSON.stringify({at:new Date().toISOString(),planSha256:arg('--sha256'),documents:docs.map(plain),relatedSources:siblings.docs.filter(d=>plan.sourceSiblingPaths.includes(d.ref.path)).map(plain)},null,2));
  await db.runTransaction(async tx=>{
   const [current,currentLocks,currentMarker,currentCheckpoint,currentSiblings,currentMatchingCheckpoints]=await Promise.all([tx.getAll(...refs),tx.get(db.collection('processing_locks')),
    tx.get(db.doc('processed_datasets/'+plan.fileId)),tx.get(db.doc('checkpoints/'+plan.fileId)),tx.get(db.collectionGroup('events')),tx.get(db.collection('checkpoints').where('fileId','==',plan.fileId))]);
   validate(current,currentLocks,currentMarker,currentCheckpoint,currentSiblings,currentMatchingCheckpoints);
   for(const o of plan.operations){const ref=db.doc(o.path);assert(plan.preconditions.some(p=>p.path===o.path),'Unpinned operation');
    if(o.action==='delete')tx.delete(ref);
    else{const payload=decode(o.payload);for(const field of o.timestampFields||[])payload[field]=admin.firestore.FieldValue.serverTimestamp();
     if(o.action==='create')tx.create(ref,payload);else {assert.equal(o.action,'update');tx.update(ref,payload);}}
   }
  });
  const resultPath=path.join(outDir,'applied-'+stamp+'.json');
  await fs.writeFile(resultPath,JSON.stringify({at:new Date().toISOString(),status:'committed_verification_pending',backup,planSha256:arg('--sha256'),operations:plan.operations},null,2));
  const after=await db.getAll(...plan.operations.map(o=>db.doc(o.path)));
  for(const o of plan.operations){const d=after.find(d=>d.ref.path===o.path);assert.equal(d.exists,o.action!=='delete','Postcondition existence: '+o.path);
   if(d.exists)for(const [k,v]of Object.entries(o.payload))assert.equal(hash(d.get(k)),hash(v),'Postcondition field: '+o.path+':'+k);}
  const result={at:new Date().toISOString(),status:'applied',planSha256:arg('--sha256'),backup,operations:plan.operations.map(o=>({action:o.action,path:o.path})),after:after.map(plain)};
  await fs.writeFile(resultPath,JSON.stringify(result,null,2));
  console.log(JSON.stringify({status:result.status,operations:plan.operations.length,backup,resultPath}));
 }
}finally{await app.delete();}
