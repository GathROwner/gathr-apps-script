// Read-only release/repair preflight. Credential is read from its existing location.
const fs = require('node:fs');
const path = require('node:path');
const admin = require('firebase-admin');
const keyPath = process.argv[2];
if (!keyPath) throw Error('Supply the existing service-account file path');
admin.initializeApp({credential: admin.credential.cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))), projectId:'gathr-migrated'});
const db = admin.firestore();
const dataset = '1w9joG-FJhXFTLKes7T4836iykHoPMZYU';
const venues = ['slug_easternkingssportsplex','fb_100057766283684','slug_florencesimmonsperformancehall','31MHpCb7juuQkKD5N98q','slug_tipsyfarmers','slug_thelocalpubpei','4OcLMCRKRGoKO5eQncLi'];
const encode = doc => ({path:doc.ref.path, exists:doc.exists, updateTime:doc.updateTime?.toDate().toISOString(), data:doc.data()});
(async()=> {
  const [locks, marker, checkpoint, batch, foodDriveReview, ...events] = await Promise.all([
    db.collection('processing_locks').get(), db.doc(`processed_datasets/${dataset}`).get(),
    db.doc(`checkpoints/${dataset}`).get(), db.doc(`batch_states/${dataset}_1`).get(),
    db.doc('city_level_event_reviews/cityevt_7040cff228c17373d2ea4ea3').get(),
    ...venues.map(venue=>db.collection(`venues/${venue}/events`).get()),
  ]);
  const result = {checkedAt:new Date().toISOString(), projectId:'gathr-migrated',
    locks:locks.docs.map(encode), marker:encode(marker), checkpoint:encode(checkpoint), batch:encode(batch), foodDriveReview:encode(foodDriveReview),
    events:events.flatMap(snapshot=>snapshot.docs.map(encode))};
  const out = path.resolve(__dirname, '../artifacts/luna-oct11-integrity-repair/live-preflight.json');
  fs.mkdirSync(path.dirname(out), {recursive:true});
  fs.writeFileSync(out, JSON.stringify(result,null,2));
  console.log(JSON.stringify({out, checkedAt:result.checkedAt, activeLocks:result.locks.filter(({data})=>!['completed','failed','cancelled'].includes(data.status)).map(({path,data})=>({path,status:data.status,runId:data.runId})), processed:marker.exists, checkpoint:checkpoint.exists, batchStatus:batch.data()?.status, eventCount:result.events.length}));
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>admin.app().delete());
