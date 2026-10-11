// Read-only parser release gate. Use an existing authorized credential path.
const fs=require('node:fs'),assert=require('node:assert/strict'),admin=require('firebase-admin');
const credential=process.argv[2];assert(credential,'Credential path required');
const dataset='1w9joG-FJhXFTLKes7T4836iykHoPMZYU';
admin.initializeApp({credential:admin.credential.cert(JSON.parse(fs.readFileSync(credential))),projectId:'gathr-migrated'});
(async()=>{
 const db=admin.firestore();
 const [locks,marker,checkpoint,batch]=await Promise.all([db.collection('processing_locks').get(),db.doc('processed_datasets/'+dataset).get(),db.doc('checkpoints/'+dataset).get(),db.doc('batch_states/'+dataset+'_1').get()]);
 const active=locks.docs.filter(d=>!['completed','failed','cancelled'].includes(d.data().status)).map(d=>({path:d.ref.path,...d.data()}));
 const result={checkedAt:new Date().toISOString(),projectId:'gathr-migrated',dataset,activeLocks:active,processed:marker.exists,checkpoint:checkpoint.exists,batchStatus:batch.data()?.status};
 fs.mkdirSync('artifacts/luna-stage5-cache-release',{recursive:true});
 fs.writeFileSync('artifacts/luna-stage5-cache-release/preflight.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
 assert.equal(active.length,0,'Active parser run');assert(marker.exists);assert(!checkpoint.exists);assert.equal(batch.data()?.status,'completed');
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>admin.app().delete());
