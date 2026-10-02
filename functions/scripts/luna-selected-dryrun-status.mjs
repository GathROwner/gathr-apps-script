import fs from 'node:fs/promises';
import admin from 'firebase-admin';

const [fileId, rowIndex, postId] = process.argv.slice(2);
if (!/^[A-Za-z0-9_-]{20,}$/.test(fileId || '') || !/^\d{1,4}$/.test(rowIndex || '') ||
    !/^\d{12,20}$/.test(postId || '')) {
  throw new Error('Provide dataset id, row index, and numeric post id');
}
const key = JSON.parse(await fs.readFile('C:/Users/craig/Dev/gathr-apps-script/firebase/service-account.json', 'utf8'));
const app = admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id }, 'lunaSelectedDryrunStatus');
const db = admin.firestore(app);
const [lock, dataset, snapshots] = await Promise.all([
  db.collection('processing_locks').doc(fileId).get(),
  db.collection('processed_datasets').doc(fileId).get(),
  db.collection('parse_snapshots').where('uniqueId', '==', postId).get(),
]);
const prefix = `${fileId}_${rowIndex}_`;
const latest = snapshots.docs.filter(doc => doc.id.startsWith(prefix))
  .sort((a, b) => Number(b.id.slice(prefix.length)) - Number(a.id.slice(prefix.length)))[0];
const stages = latest?.data()?.stages || [];
const events = stages.find(stage => stage.stage === 'format')?.output?.events || [];
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  fileId, rowIndex: Number(rowIndex), postId,
  lock: lock.exists ? { status: lock.data().status, runId: lock.data().runId || '' } : null,
  dataset: dataset.exists ? { status: dataset.data().status,
    errorCount: dataset.data().stats?.errorCount ?? null } : null,
  latestSnapshotId: latest?.id || '',
  events: events.map(event => ({ name: event.name, date: event.startDate || event.date,
    startTime: event.startTime, endTime: event.endTime,
    recurringPattern: event.recurringPattern || '', totalOccurrences: event.totalOccurrences || null })),
}));
