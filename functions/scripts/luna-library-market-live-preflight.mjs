import fs from 'node:fs/promises';
import path from 'node:path';
import admin from 'firebase-admin';

const root = path.resolve(import.meta.dirname, '../..');
const out = path.join(root, 'artifacts/luna-live-canary-2026-10-02/library-market-prewrite-backup.json');
const fileId = '1OmFzDG0kWiY-k8C-8G6-oGlTBxE3B0cq';
const postId = '1422273086755028';
const sourceSnapshotId = `${fileId}_164_1790948611398`;
const venueIds = ['slug_charlottetownlibrarylearningcentre', 'slug_peilibrary'];
const key = JSON.parse(await fs.readFile('C:/Users/craig/Dev/gathr-apps-script/firebase/service-account.json', 'utf8'));
const app = admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id }, 'libraryMarketLivePreflight');
const db = admin.firestore(app);
const encode = value => {
  if (value instanceof admin.firestore.Timestamp) return { __type: 'Timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds };
  if (value instanceof admin.firestore.GeoPoint) return { __type: 'GeoPoint', latitude: value.latitude, longitude: value.longitude };
  if (value instanceof admin.firestore.DocumentReference) return { __type: 'DocumentReference', path: value.path };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)]));
  return value;
};
const pack = snap => ({ path: snap.ref.path, updateTime: encode(snap.updateTime), data: encode(snap.data()) });
const [source, lock] = await Promise.all([
  db.collection('parse_snapshots').doc(sourceSnapshotId).get(),
  db.collection('processing_locks').doc(fileId).get(),
]);
if (!source.exists || source.data()?.uniqueId !== postId || source.data()?.rowMeta?.mediaUrls?.length !== 3) {
  throw new Error('Source snapshot or three-image gallery identity changed');
}
const lockStatus = lock.exists ? String(lock.data()?.status || '') : 'absent';
if (lockStatus === 'active' || lockStatus === 'processing') throw new Error(`Active dataset lock: ${lockStatus}`);
const docs = [], summary = [];
for (const venueId of venueIds) {
  const venue = await db.collection('venues').doc(venueId).get();
  if (!venue.exists) throw new Error(`Missing venue ${venueId}`);
  docs.push(pack(venue));
  const events = await venue.ref.collection('events').get();
  for (const event of events.docs) {
    const value = event.data(), date = String(value.startDate || '');
    if (date === '2026-10-03' || String(value.uniqueId || '').startsWith(postId)) {
      docs.push(pack(event));
      summary.push({ path: event.ref.path, uniqueId: value.uniqueId || '', name: value.name || value.eventName || '', date, time: value.startTime || '' });
    }
  }
}
const payload = { purpose: 'Prewrite exact venue/date backup for Library Market Luna selected-row live pilot',
  createdAt: new Date().toISOString(), fileId, postId, sourceSnapshotId, lockStatus, docs };
await fs.writeFile(out, JSON.stringify(payload, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ out, lockStatus, backedUpDocs: docs.length, venueDocs: venueIds.length, events: summary }));
