import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');

const targets = [
  ['venues/slug_thelocalpubpei/events/81k0S2cOT1au8Ea5QuCv', 'Thanksgiving Turkey Dinner', '2026-10-04', '10:00', '1123592920192883_b39bbc2e2bc5c04c', '2026-10-05T12:42:34.878Z'],
  ['venues/slug_thelocalpubpei/events/2bNllIddq20kYawk7oWl', 'Thanksgiving Turkey Dinner', '2026-10-05', '11:00', '1123592920192883_c6de8fed299ccaf5', '2026-10-05T12:42:35.333Z'],
  ['venues/BKaKU7O4J56sipdJRrHM/events/wczAVClWRdo4W5okzshs', 'Behind The Veil', '2027-09-25', '20:00', '122202342704923603_aea673fe9f33eca7', '2026-10-05T14:23:43.466Z'],
  ['venues/BKaKU7O4J56sipdJRrHM/events/lmubqM0FFy72dU9AP0Oi', 'Behind The Veil', '2027-09-26', '14:00', '122202342704923603_27953e99c3d336a8', '2026-10-05T14:23:44.135Z'],
  ['venues/BKaKU7O4J56sipdJRrHM/events/8MmW64d4zRNFrAqT3Mhf', 'Behind The Veil', '2027-09-26', '20:00', '122202342704923603_1b0e9b6b2047c11b', '2026-10-05T14:23:44.664Z'],
];
const apply = process.argv.slice(2).includes('--apply');
if (process.argv.slice(2).some(arg => arg !== '--apply')) throw new Error('Only --apply is supported');
const keyPath = process.env.GATHR_SERVICE_ACCOUNT_PATH;
if (!keyPath) throw new Error('Set GATHR_SERVICE_ACCOUNT_PATH');
const key = JSON.parse(await fs.readFile(keyPath, 'utf8'));
if (key.project_id !== 'gathr-migrated') throw new Error('Unexpected Firebase project');
admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id });
const db = admin.firestore();
const refs = targets.map(([docPath]) => db.doc(docPath));
const docs = await db.getAll(...refs);
const venuePaths = [...new Set(targets.map(([docPath]) => path.posix.dirname(path.posix.dirname(docPath))))];
const venueEvents = await Promise.all(venuePaths.map(venuePath => db.doc(venuePath).collection('events').get()));
const sourceRoots = new Set(targets.map(([, , , , uniqueId]) => uniqueId.split('_')[0]));
const sameSourceSiblings = venueEvents.flatMap(snapshot => snapshot.docs)
  .filter(doc => sourceRoots.has(String(doc.data().uniqueId || '').split('_')[0]))
  .map(doc => ({ path: doc.ref.path, uniqueId: doc.data().uniqueId,
    name: doc.data().name || doc.data().eventName,
    startDate: doc.data().startDate, startTime: doc.data().startTime }));
const targetPaths = new Set(targets.map(([docPath]) => docPath));
const unexpectedSiblings = sameSourceSiblings.filter(doc => !targetPaths.has(doc.path));
if (unexpectedSiblings.length > 0) throw new Error(`Unexpected same-source siblings: ${JSON.stringify(unexpectedSiblings)}`);

const backups = docs.map((doc, index) => {
  const [docPath, name, startDate, startTime, uniqueId, updateTime] = targets[index];
  if (!doc.exists) throw new Error(`Missing target: ${docPath}`);
  const data = doc.data();
  const actualUpdateTime = doc.updateTime.toDate().toISOString();
  if (doc.ref.path !== docPath || (data.name || data.eventName) !== name ||
      data.startDate !== startDate || data.startTime !== startTime ||
      data.uniqueId !== uniqueId || data.isRecurring !== 'No' ||
      data.recurringPattern !== 'none' ||
      actualUpdateTime !== updateTime) {
    throw new Error(`Target changed: ${docPath}`);
  }
  return { path: docPath, updateTime: actualUpdateTime, data };
});
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = path.resolve('artifacts/luna-oct5-canary-audit');
await fs.mkdir(outputDir, { recursive: true });
const backupPath = path.join(outputDir, `wrong-date-cleanup-backup-${stamp}.json`);
await fs.writeFile(backupPath, JSON.stringify(backups, null, 2));
const plan = { mode: apply ? 'apply' : 'dry-run', project: key.project_id, backupPath,
  targets: backups.map(doc => ({ path: doc.path, updateTime: doc.updateTime,
    name: doc.data.name || doc.data.eventName, startDate: doc.data.startDate,
    startTime: doc.data.startTime, uniqueId: doc.data.uniqueId })),
  sameSourceSiblings };
if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

const batch = db.batch();
for (let index = 0; index < refs.length; index++) {
  batch.delete(refs[index], { lastUpdateTime: docs[index].updateTime });
}
await batch.commit();
const after = await db.getAll(...refs);
const remaining = after.filter(doc => doc.exists).map(doc => doc.ref.path);
const report = { ...plan, completedAt: new Date().toISOString(), remaining };
const resultPath = path.join(outputDir, `wrong-date-cleanup-result-${stamp}.json`);
await fs.writeFile(resultPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ resultPath, backupPath, deleted: refs.length - remaining.length, remaining }));
if (remaining.length > 0) process.exitCode = 1;
