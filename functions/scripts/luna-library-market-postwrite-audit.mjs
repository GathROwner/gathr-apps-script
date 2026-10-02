import fs from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import admin from 'firebase-admin';

const root = path.resolve(import.meta.dirname, '../..');
const dir = path.join(root, 'artifacts/luna-live-canary-2026-10-02');
const backup = JSON.parse(await fs.readFile(path.join(dir, 'library-market-prewrite-backup.json'), 'utf8'));
if (backup.postId !== '1422273086755028' || backup.docs.length !== 5) throw new Error('Unexpected backup scope');
const key = JSON.parse(await fs.readFile('C:/Users/craig/Dev/gathr-apps-script/firebase/service-account.json', 'utf8'));
const app = admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id }, 'libraryMarketPostwriteAudit');
const db = admin.firestore(app);
const encode = value => {
  if (value instanceof admin.firestore.Timestamp) return { __type: 'Timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds };
  if (value instanceof admin.firestore.GeoPoint) return { __type: 'GeoPoint', latitude: value.latitude, longitude: value.longitude };
  if (value instanceof admin.firestore.DocumentReference) return { __type: 'DocumentReference', path: value.path };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)]));
  return value;
};
const changes = [];
for (const before of backup.docs) {
  const after = await db.doc(before.path).get();
  if (!after.exists) { changes.push({ path: before.path, deleted: true }); continue; }
  const data = encode(after.data());
  if (!isDeepStrictEqual(before.data, data)) {
    const keys = [...new Set([...Object.keys(before.data), ...Object.keys(data)])]
      .filter(k => !isDeepStrictEqual(before.data[k], data[k]));
    changes.push({ path: before.path, changedKeys: keys,
      before: { name: before.data.name || before.data.eventName, startDate: before.data.startDate,
        startTime: before.data.startTime, endTime: before.data.endTime, category: before.data.category,
        mediaCount: before.data.mediaUrls?.length || 0, hero: before.data.relevantImageUrl || '' },
      after: { name: data.name || data.eventName, startDate: data.startDate, startTime: data.startTime,
        endTime: data.endTime, category: data.category, mediaCount: data.mediaUrls?.length || 0,
        hero: data.relevantImageUrl || '' } });
  }
}
const eventPaths = new Set(backup.docs.filter(x => x.path.includes('/events/')).map(x => x.path));
const newDocs = [];
for (const venueId of ['slug_charlottetownlibrarylearningcentre', 'slug_peilibrary']) {
  const events = await db.collection('venues').doc(venueId).collection('events').get();
  for (const event of events.docs) {
    const value = event.data();
    if ((value.startDate === '2026-10-03' || String(value.uniqueId || '').startsWith(backup.postId))
      && !eventPaths.has(event.ref.path)) newDocs.push({ path: event.ref.path, name: value.name || value.eventName });
  }
}
const prefix = `${backup.fileId}_164_`;
const snapshots = await db.collection('parse_snapshots').orderBy(admin.firestore.FieldPath.documentId())
  .startAt(prefix).endAt(`${prefix}\uf8ff`).get();
const latest = snapshots.docs.at(-1);
const finalEvents = latest?.data()?.stages?.find(stage => stage.stage === 'format')?.output?.events || [];
const targetPath = 'venues/slug_charlottetownlibrarylearningcentre/events/c4ENYKLh26FgN5cyF9SC';
const target = await db.doc(targetPath).get();
const targetData = target.data() || {};
const gallery = [...new Set(targetData.mediaUrls || [])];
const output = { checkedAt: new Date().toISOString(), backupPath: path.join(dir, 'library-market-prewrite-backup.json'),
  latestSnapshotId: latest?.id || '', snapshotEventCount: finalEvents.length,
  snapshotEvents: finalEvents.map(x => ({ name: x.name, date: x.startDate, startTime: x.startTime,
    endTime: x.endTime, category: x.category })), changes, newDocs,
  target: { path: targetPath, uniqueId: targetData.uniqueId || '', name: targetData.name || targetData.eventName || '',
    startDate: targetData.startDate || '', startTime: targetData.startTime || '', endTime: targetData.endTime || '',
    category: targetData.category || '', gallery, hero: targetData.relevantImageUrl || '',
    heroInGallery: gallery.includes(targetData.relevantImageUrl || ''),
    provenanceSource: targetData.imageProvenance?.primarySource || '' } };
const out = path.join(dir, 'library-market-postwrite-audit.json');
await fs.writeFile(out, JSON.stringify(output, null, 2));
console.log(JSON.stringify({ out, latestSnapshotId: output.latestSnapshotId, snapshotEventCount: finalEvents.length,
  changes, newDocs, target: { name: output.target.name, date: output.target.startDate, time: output.target.startTime,
    endTime: output.target.endTime, category: output.target.category, galleryCount: gallery.length,
    heroInGallery: output.target.heroInGallery, provenanceSource: output.target.provenanceSource } }));
