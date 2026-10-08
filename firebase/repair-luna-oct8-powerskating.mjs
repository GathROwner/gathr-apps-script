import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { buildExpandedEventStoredUniqueId } from '../functions/lib/processing/rowProcessor.js';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const planArg = args.find(arg => arg.startsWith('--plan='));
if (args.some(arg => arg !== '--apply' && !arg.startsWith('--plan=')) ||
    (apply && !planArg) || (!apply && planArg)) {
  throw new Error('Use no arguments for a dry run, or --apply --plan=<dry-run plan path>');
}
const keyPath = process.env.GATHR_SERVICE_ACCOUNT_PATH;
if (!keyPath) throw new Error('Set GATHR_SERVICE_ACCOUNT_PATH');
const key = JSON.parse(await fs.readFile(keyPath, 'utf8'));
if (key.project_id !== 'gathr-migrated') throw new Error('Unexpected Firebase project');
const app = admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id },
  'lunaOct8PowerRepair');
const db = admin.firestore(app);
const venueId = 'LglliE42SPFssmoU01su';
const venueName = 'Cavendish Farms Community Events Centre';
const sourceRoot = '1723226023140608';
const collection = db.collection(`venues/${venueId}/events`);
const parentSpecs = [
  { id: 'N1zwOCv81EGSbomyQZlC', group: 'u9-u11',
    title: 'POWERSKATING SESSIONS — U9 - U11', date: '2026-10-17',
    uniqueId: '1723226023140608_ca2d75e2cc856c15', pattern: 'weekly_saturday' },
  { id: 'vnYpnIqiI9jmHmqee19m', group: 'u13-u15',
    title: 'POWERSKATING SESSIONS — U13-U15', date: '2026-10-18',
    uniqueId: '1723226023140608_ca700ea6f4fabfa8', pattern: 'weekly_sunday' },
];
const expectedDates = {
  'u9-u11': ['2026-10-17','2026-10-24','2026-10-31','2026-11-14','2026-11-21',
    '2026-11-28','2026-12-05','2026-12-12','2026-12-19','2027-01-02'],
  'u13-u15': ['2026-10-18','2026-10-25','2026-11-01','2026-11-15','2026-11-22',
    '2026-11-29','2026-12-06','2026-12-13','2026-12-20','2027-01-03'],
};
const sourceFile = path.resolve('functions/artifacts/luna-oct8-full-audit/row287-stage5-readonly.json');
const replay = JSON.parse(await fs.readFile(sourceFile, 'utf8'));
if (replay.row !== 287 || replay.events?.length !== 20) {
  throw new Error('The verified 20-item Stage 5 replay is missing or changed');
}
const groupFor = item => item.name === 'POWERSKATING SESSIONS U9 - U11' ? 'u9-u11' :
  item.name === 'POWERSKATING SESSIONS U13-U15' ? 'u13-u15' : null;
for (const [group, dates] of Object.entries(expectedDates)) {
  const actual = replay.events.filter(item => groupFor(item) === group)
    .map(item => item.startDate).sort();
  if (JSON.stringify(actual) !== JSON.stringify(dates)) {
    throw new Error(`Source date inventory changed for ${group}`);
  }
}
if (replay.events.some(item => !groupFor(item) || item.startDate !== item.endDate ||
  item.startTime !== '07:00' || item.endTime !== '08:00' ||
  item.isRecurring !== 'No' || item.recurringPattern !== 'none')) {
  throw new Error('The verified one-off payload changed');
}

const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const parentSnaps = await Promise.all(parentSpecs.map(item => collection.doc(item.id).get()));
const parents = new Map();
for (let i = 0; i < parentSpecs.length; i++) {
  const spec = parentSpecs[i];
  const snap = parentSnaps[i];
  if (!snap.exists) throw new Error(`Parent missing: ${snap.ref.path}`);
  const data = snap.data();
  if (data.eventName !== spec.title || data.name !== spec.title ||
      data.uniqueId !== spec.uniqueId || data.startDate !== spec.date ||
      data.endDate !== spec.date || data.startTime !== '07:00' ||
      data.endTime !== '08:00' || data.recurringPattern !== spec.pattern ||
      data.isRecurring !== 'Yes' || data.venueId !== venueId) {
    throw new Error(`Parent fingerprint changed: ${snap.ref.path}`);
  }
  parents.set(spec.group, { spec, snap, data, dataHash: hash(data) });
}
const sourceSiblings = (await collection.get()).docs
  .filter(doc => String(doc.data().uniqueId || '').startsWith(`${sourceRoot}_`))
  .map(doc => doc.id).sort();
const expectedSiblings = parentSpecs.map(item => item.id).sort();
if (JSON.stringify(sourceSiblings) !== JSON.stringify(expectedSiblings)) {
  throw new Error(`Source siblings changed: ${JSON.stringify(sourceSiblings)}`);
}

const creates = [];
for (const item of replay.events) {
  const group = groupFor(item);
  const parent = parents.get(group).data;
  const docId = `powerskate-${group}-${item.startDate}`;
  const ref = collection.doc(docId);
  if ((await ref.get()).exists) throw new Error(`Planned one-off path already exists: ${ref.path}`);
  const data = {
    ...parent,
    uniqueId: buildExpandedEventStoredUniqueId({
      row: { uniqueId: sourceRoot, sourceScraperType: 'posts' },
      eventName: item.name,
      startDate: item.startDate,
      endDate: item.endDate,
      startTime: item.startTime,
      endTime: item.endTime,
      venueName,
      additionalLocation: item.additionalLocation,
    }),
    eventName: item.name,
    name: item.name,
    description: item.description,
    category: item.category,
    startDate: item.startDate,
    endDate: item.endDate,
    startTime: item.startTime,
    endTime: item.endTime,
    isRecurring: 'No',
    recurringPattern: 'none',
  };
  delete data.totalOccurrences;
  delete data.recurrenceUntilDate;
  creates.push({ path: ref.path, group, date: item.startDate, title: item.name,
    uniqueId: data.uniqueId, dataHash: hash(data), data, ref });
}
if (new Set(creates.map(item => item.uniqueId)).size !== 20) {
  throw new Error('Generated source identities are not distinct');
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = path.resolve('functions/artifacts/luna-oct8-full-audit');
await fs.mkdir(outputDir, { recursive: true });
const summary = {
  project: key.project_id, sourceRoot, venueId, sourceFile,
  deletes: [...parents.values()].map(({ spec, snap, dataHash }) => ({
    path: snap.ref.path, title: spec.title, uniqueId: spec.uniqueId,
    updateTime: snap.updateTime.toDate().toISOString(), dataHash })),
  creates: creates.map(({ path: docPath, group, date, title, uniqueId, dataHash }) =>
    ({ path: docPath, group, date, title, uniqueId, dataHash })),
  sourceSiblings,
};
if (!apply) {
  const backupPath = path.join(outputDir, `powerskate-backup-${stamp}.json`);
  const planPath = path.join(outputDir, `powerskate-plan-${stamp}.json`);
  await fs.writeFile(backupPath, JSON.stringify({ createdAt: new Date().toISOString(),
    parents: [...parents.values()].map(({ snap, data }) => ({
      path: snap.ref.path, updateTime: snap.updateTime.toDate().toISOString(), data })),
    sourceSiblings }, null, 2));
  await fs.writeFile(planPath, JSON.stringify({ ...summary, backupPath }, null, 2));
  console.log(JSON.stringify({ mode: 'dry-run', planPath, backupPath, ...summary }, null, 2));
  process.exit(0);
}
const plan = JSON.parse(await fs.readFile(path.resolve(planArg.slice('--plan='.length)), 'utf8'));
const { backupPath: _backupPath, ...approved } = plan;
if (JSON.stringify(approved) !== JSON.stringify(summary)) {
  throw new Error('Parents, source siblings, or proposed one-offs changed since approved dry run');
}
const batch = db.batch();
for (const { snap } of parents.values()) {
  batch.delete(snap.ref, { lastUpdateTime: snap.updateTime });
}
for (const { ref, data } of creates) {
  batch.create(ref, { ...data, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastSeenAt: admin.firestore.FieldValue.serverTimestamp() });
}
await batch.commit();
const afterParents = await Promise.all([...parents.values()].map(({ snap }) => snap.ref.get()));
const afterCreates = await Promise.all(creates.map(({ ref }) => ref.get()));
const ok = afterParents.every(snap => !snap.exists) &&
  afterCreates.every((snap, index) => snap.exists &&
    snap.data().uniqueId === creates[index].uniqueId &&
    snap.data().isRecurring === 'No' && snap.data().recurringPattern === 'none');
const resultPath = path.join(outputDir, `powerskate-result-${stamp}.json`);
await fs.writeFile(resultPath, JSON.stringify({ completedAt: new Date().toISOString(),
  planPath: path.resolve(planArg.slice('--plan='.length)), ok,
  deleted: summary.deletes.map(item => item.path),
  created: summary.creates.map(item => item.path) }, null, 2));
console.log(JSON.stringify({ resultPath, ok, deletedCount: 2, createdCount: 20 }));
if (!ok) process.exitCode = 1;
