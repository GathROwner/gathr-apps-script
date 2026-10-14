import fs from 'node:fs/promises';
import admin from 'firebase-admin';
const credentialPath = process.env.BE_YOU_CREDENTIAL_PATH;
if (!credentialPath) throw new Error('BE_YOU_CREDENTIAL_PATH required');
const credential = JSON.parse(await fs.readFile(credentialPath, 'utf8'));
if (credential.project_id !== 'gathr-migrated') throw new Error('Wrong project');
admin.initializeApp({credential:admin.credential.cert(credential),projectId:'gathr-migrated'});
const db=admin.firestore();
const out='artifacts/be-you-oct14';
await fs.mkdir(out,{recursive:true});
const pack=d=>({path:d.ref.path,updateTime:d.updateTime?.toDate().toISOString(),data:d.data()});
const [venues,events,locks,processed,batches,checkpoints]=await Promise.all([
 db.collection('venues').get(),db.collectionGroup('events').get(),
 db.collection('processing_locks').get(), db.collection('processed_datasets').get(),
 db.collection('batch_states').get(),db.collection('processing_checkpoints').get()]);
const venueDocs=venues.docs.filter(d=>/be\s*you|119\s*grafton/i.test(JSON.stringify(d.data())));
const venueIds=new Set(venueDocs.map(d=>d.id));
const matches=events.docs.filter(d=>venueIds.has(d.ref.parent.parent?.id)||venueIds.has(d.data().venueId)||/be you|119 grafton/i.test([d.data().venueName,d.data().establishment,d.data().address].join(' ')));
await fs.writeFile(`${out}/all-events.json`,JSON.stringify(events.docs.map(pack),null,2));
await fs.writeFile(`${out}/capture.json`,JSON.stringify({capturedAt:new Date().toISOString(),project:'gathr-migrated',venues:venueDocs.map(pack),events:matches.map(pack),locks:locks.docs.map(pack),processed:processed.docs.map(pack),batches:batches.docs.map(pack),checkpoints:checkpoints.docs.map(pack)},null,2));
console.log(JSON.stringify({venues:venueDocs.map(d=>({id:d.id,name:d.data().name})),events:matches.map(d=>({path:d.ref.path,name:d.data().eventName||d.data().name,date:d.data().startDate,time:d.data().startTime,pattern:d.data().recurringPattern,source:d.data().uniqueId})),totalEvents:events.size,lockCount:locks.size,processedCount:processed.size}));
