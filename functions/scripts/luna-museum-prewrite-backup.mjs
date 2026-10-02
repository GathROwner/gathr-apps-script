import fs from 'node:fs/promises';
import path from 'node:path';
import admin from 'firebase-admin';

const key = JSON.parse(await fs.readFile('C:/Users/craig/Dev/gathr-apps-script/firebase/service-account.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id });
const db = admin.firestore();
const venueId = 'slug_eptek.centre';
const targetIds = ['3DO8t0Eyl1TB8scIBfEx', 'nOz8TgJISaSmdkMUVNzY'];
const fileId = '1OmFzDG0kWiY-k8C-8G6-oGlTBxE3B0cq';
const [lock, venue, ...targets] = await Promise.all([
  db.collection('processing_locks').doc(fileId).get(),
  db.collection('venues').doc(venueId).get(),
  ...targetIds.map(id => db.collection('venues').doc(venueId).collection('events').doc(id).get()),
]);
if (targets.some(s => !s.exists) || !venue.exists || ['active', 'processing'].includes(lock.data()?.status)) {
  throw new Error('Preflight failed: missing target or active dataset lock');
}
const siblings = await db.collection('venues').doc(venueId).collection('events')
  .where('startDate', '==', '2026-10-18').get();
const encode = value => value instanceof admin.firestore.Timestamp
  ? { __type: 'Timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds }
  : value instanceof admin.firestore.GeoPoint
    ? { __type: 'GeoPoint', latitude: value.latitude, longitude: value.longitude }
    : value instanceof admin.firestore.DocumentReference
      ? { __type: 'DocumentReference', path: value.path }
      : Array.isArray(value) ? value.map(encode)
        : value && typeof value === 'object'
          ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, encode(entry)]))
          : value;
const docs = [venue, ...targets, ...siblings.docs.filter(s => !targetIds.includes(s.id))]
  .map(s => ({ path: s.ref.path, updateTime: encode(s.updateTime), data: encode(s.data()) }));
const out = path.resolve(import.meta.dirname,
  '../../artifacts/luna-live-canary-2026-10-02/museum-prewrite-backup-20261002.json');
await fs.writeFile(out, JSON.stringify({ createdAt: new Date().toISOString(),
  purpose: 'Read-only backup before proposed selected-row Luna museum canary',
  fileId, venueId, postId: '1615048507081168', docs }, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ out, lockStatus: lock.data()?.status || 'absent',
  targets: targets.map(s => ({ path: s.ref.path, name: s.data().name || s.data().eventName,
    startDate: s.data().startDate, startTime: s.data().startTime, endTime: s.data().endTime,
    recurringPattern: s.data().recurringPattern, updated: s.updateTime?.toDate().toISOString() })),
  sameDaySiblingCount: siblings.size }));
