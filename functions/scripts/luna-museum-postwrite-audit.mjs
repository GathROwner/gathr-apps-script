import fs from 'node:fs/promises';
import path from 'node:path';
import admin from 'firebase-admin';

const root = path.resolve(import.meta.dirname, '../..');
const backupPath = path.join(root, 'artifacts/luna-live-canary-2026-10-02/museum-prewrite-backup-20261002.json');
const outputPath = path.join(root, 'artifacts/luna-live-canary-2026-10-02/museum-live-postwrite-audit.json');
const backup = JSON.parse(await fs.readFile(backupPath, 'utf8'));
const key = JSON.parse(await fs.readFile('C:/Users/craig/Dev/gathr-apps-script/firebase/service-account.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id });
const db = admin.firestore();
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
const canonical = value => JSON.stringify(value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(canonical(value[key]))]))
  : Array.isArray(value) ? value.map(entry => JSON.parse(canonical(entry))) : value);
const docs = [];
for (const old of backup.docs) {
  const snap = await db.doc(old.path).get();
  if (!snap.exists) throw new Error(`Document missing after replay: ${old.path}`);
  const current = encode(snap.data());
  const changedFields = Array.from(new Set([...Object.keys(old.data), ...Object.keys(current)]))
    .filter(field => canonical(old.data[field] ?? null) !== canonical(current[field] ?? null)).sort();
  const oldMedia = new Set(old.data.mediaUrls || []);
  const newMedia = (current.mediaUrls || []).filter(url => !oldMedia.has(url));
  docs.push({ path: old.path, changedFields,
    before: { name: old.data.name || old.data.eventName, startDate: old.data.startDate,
      startTime: old.data.startTime, endTime: old.data.endTime,
      recurrence: old.data.recurringPattern, occurrences: old.data.totalOccurrences,
      mediaCount: old.data.mediaUrls?.length || 0 },
    after: { name: current.name || current.eventName, startDate: current.startDate,
      startTime: current.startTime, endTime: current.endTime,
      recurrence: current.recurringPattern, occurrences: current.totalOccurrences,
      mediaCount: current.mediaUrls?.length || 0,
      distinctMediaCount: new Set(current.mediaUrls || []).size,
      retainedOldMedia: [...oldMedia].every(url => (current.mediaUrls || []).includes(url)),
      addedMediaCount: newMedia.length,
      addedMediaManaged: newMedia.every(url => String(url).startsWith('https://storage.googleapis.com/gathr-uploaded-images/')),
      heroFromAddedMedia: newMedia.includes(current.relevantImageUrl || current.image || ''),
      heroInGallery: (current.mediaUrls || []).includes(current.relevantImageUrl || current.image || '') },
    updateTime: snap.updateTime?.toDate().toISOString() });
}
const siblings = await db.collection('venues').doc(backup.venueId).collection('events')
  .where('startDate', '==', '2026-10-18').get();
const lock = await db.collection('processing_locks').doc(backup.fileId).get();
const expected = [
  ['3DO8t0Eyl1TB8scIBfEx', '12:30', '13:45'],
  ['nOz8TgJISaSmdkMUVNzY', '14:15', '15:30'],
];
const errors = [];
for (const [id, start, end] of expected) {
  const record = docs.find(doc => doc.path.endsWith(`/events/${id}`));
  if (!record || record.after.startTime !== start || record.after.endTime !== end ||
    record.after.startDate !== '2026-10-18' || record.after.recurrence !== 'weekly_sunday' ||
    record.after.occurrences !== 8 || record.after.addedMediaCount !== 4 ||
    record.after.distinctMediaCount !== record.after.mediaCount ||
    !record.after.retainedOldMedia || !record.after.addedMediaManaged ||
    !record.after.heroFromAddedMedia || !record.after.heroInGallery) {
    errors.push(`Failed target gate: ${id}`);
  }
}
if (siblings.size !== 2) errors.push(`Expected exactly two October 18 siblings, found ${siblings.size}`);
if (docs.find(doc => doc.path === `venues/${backup.venueId}`)?.changedFields.length) errors.push('Venue document changed');
if (lock.data()?.status !== 'completed') errors.push('Replay lock is not completed');
const output = { checkedAt: new Date().toISOString(), fileId: backup.fileId,
  runId: lock.data()?.runId || '', lockStatus: lock.data()?.status || '',
  sameDaySiblingIds: siblings.docs.map(doc => doc.id).sort(), docs, errors };
await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
console.log(JSON.stringify({ outputPath, runId: output.runId, lockStatus: output.lockStatus,
  sameDaySiblingIds: output.sameDaySiblingIds, docs, errors }));
if (errors.length) process.exitCode = 1;
