// Read-only release gate, with separate artifacts for this release.
const fs=require('node:fs'),assert=require('node:assert/strict'),admin=require('firebase-admin');
assert(process.argv[2],'Existing authorized credential path required');
const credential=JSON.parse(fs.readFileSync(process.argv[2]));assert.equal(credential.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(credential),projectId:'gathr-migrated'});
const dataset='1w9joG-FJhXFTLKes7T4836iykHoPMZYU';
(async()=>{
 const db=admin.firestore();
 const [locks,marker,checkpoint,batch]=await Promise.all([db.collection('processing_locks').get(),
  db.doc('processed_datasets/'+dataset).get(),db.doc('checkpoints/'+dataset).get(),db.doc('batch_states/'+dataset+'_1').get()]);
 const activeLocks=locks.docs.filter(d=>!['completed','failed','cancelled'].includes(d.data().status))
  .map(d=>({path:d.ref.path,status:d.data().status,runId:d.data().runId}));
 const result={checkedAt:new Date().toISOString(),projectId:'gathr-migrated',dataset,activeLocks,
  processed:marker.exists,checkpoint:checkpoint.exists,batchStatus:batch.data()?.status};
 fs.mkdirSync('artifacts/stage4-compact-release',{recursive:true});
 fs.writeFileSync('artifacts/stage4-compact-release/preflight-'+Date.now()+'.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));assert.equal(activeLocks.length,0,'Active parser run');
 assert(marker.exists);assert(!checkpoint.exists);assert.equal(batch.data()?.status,'completed');
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>admin.app().delete());
