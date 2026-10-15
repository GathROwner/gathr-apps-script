// Read-only deployment gate. Credential stays at its original filesystem path.
import fs from 'node:fs/promises';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
const key=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));assert.equal(key.project_id,'gathr-migrated');
admin.initializeApp({projectId:key.project_id,credential:admin.credential.cert(key)});
try{
  const db=admin.firestore(),fileId='1YPf2cKvXfXl8L0HVL63VZ2zeTLEvWlit';
  const [locks,marker,batch,checkpoint]=await Promise.all([db.collection('processing_locks').get(),db.doc('processed_datasets/'+fileId).get(),
    db.doc('batch_states/'+fileId+'_1').get(),db.doc('checkpoints/'+fileId).get()]);
  const active=locks.docs.filter(d=>!['completed','failed','cancelled','canceled','released'].includes(String(d.get('status')||'')))
    .map(d=>({fileId:d.id,status:d.get('status'),runId:d.get('runId')}));
  const result={checkedAt:new Date().toISOString(),active,completedDataset:marker.exists,checkpointExists:checkpoint.exists,
    batchStatus:batch.get('status'),batchRow:batch.get('currentRowIndex'),liveWrites:0};
  console.log(JSON.stringify(result));assert.equal(active.length,0,'Active or unknown parser lock blocks release');assert(marker.exists);assert(!checkpoint.exists);
}finally{await admin.app().delete();}
