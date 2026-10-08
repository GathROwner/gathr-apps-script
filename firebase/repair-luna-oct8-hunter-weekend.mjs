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
  'lunaOct8HunterRepair');
const db = admin.firestore(app);
const venueId = 'fb_100064116963888';
const venueName = 'Hunter’s Ale House';
const sourceRoot = '1558017193012165';
const collection = db.collection(`venues/${venueId}/events`);
const templateRef = collection.doc('sy3avBQCRLbJdPqYSRqG');
const sourceFile = path.resolve('functions/artifacts/luna-oct8-full-audit/row16-local-readonly.json');
const replay = JSON.parse(await fs.readFile(sourceFile, 'utf8'));
if (replay.row !== 16 || replay.postId !== sourceRoot || replay.events?.length !== 5) {
  throw new Error('Verified five-item Hunter source replay is missing or changed');
}
const wanted = [
  { id: 'hunters-griff-guest-2026-10-09', name: 'GRIFF & GUEST LIVE MUSIC NIGHT',
    startDate: '2026-10-09', endDate: '2026-10-10' },
  { id: 'hunters-gin-n-tonic-2026-10-10', name: 'GIN N TONIC LIVE MUSIC NIGHT',
    startDate: '2026-10-10', endDate: '2026-10-11' },
];
const items = wanted.map(spec => {
  const item = replay.events.find(event => event.name === spec.name &&
    event.startDate === spec.startDate && event.endDate === spec.endDate);
  if (!item || item.startTime !== '22:00' || item.endTime !== '01:00' ||
      item.isRecurring !== 'No' || item.recurringPattern !== 'none' ||
      item.category !== 'Live Music') {
    throw new Error(`Source inventory changed: ${spec.name}`);
  }
  return { spec, item };
});
const template = await templateRef.get();
if (!template.exists) throw new Error('The existing Hunter Sunday event is missing');
const templateData = template.data();
if (templateData.uniqueId !== '1558017193012165_77a7d5454ad211dc' ||
    templateData.startDate !== '2026-10-11' || templateData.venueId !== venueId ||
    templateData.relevantImageUrl?.startsWith('https://storage.googleapis.com/') !== true) {
  throw new Error('Hunter source/template fingerprint changed');
}
const venueEvents = await collection.get();
const sameSourceIds = venueEvents.docs
  .filter(doc => String(doc.data().uniqueId || '').startsWith(`${sourceRoot}_`))
  .map(doc => doc.id).sort();
if (JSON.stringify(sameSourceIds) !== JSON.stringify([template.id])) {
  throw new Error(`Hunter same-source siblings changed: ${JSON.stringify(sameSourceIds)}`);
}
const conflicts = venueEvents.docs
  .filter(doc => doc.data().startDate === '2026-10-09' && doc.id !== wanted[0].id)
  .map(doc => ({ path: doc.ref.path, title: doc.data().eventName,
    time: doc.data().startTime, uniqueId: doc.data().uniqueId })).sort((a, b) =>
      a.path.localeCompare(b.path));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const creates = [];
for (const { spec, item } of items) {
  const ref = collection.doc(spec.id);
  if ((await ref.get()).exists) throw new Error(`Planned path already exists: ${ref.path}`);
  const data = {
    ...templateData,
    uniqueId: buildExpandedEventStoredUniqueId({
      row: { uniqueId: sourceRoot, sourceScraperType: 'posts' },
      eventName: item.name, startDate: item.startDate, endDate: item.endDate,
      startTime: item.startTime, endTime: item.endTime,
      venueName, additionalLocation: item.additionalLocation,
    }),
    eventName: item.name, name: item.name, description: item.description,
    category: item.category, startDate: item.startDate, endDate: item.endDate,
    startTime: item.startTime, endTime: item.endTime,
    eventType: 'live_music', timeFlags: item.timeFlags,
    timeResolution: item.timeResolution,
    isRecurring: 'No', recurringPattern: 'none',
  };
  delete data.totalOccurrences;
  delete data.recurrenceUntilDate;
  creates.push({ path: ref.path, ref, data, dataHash: hash(data),
    title: item.name, startDate: item.startDate, uniqueId: data.uniqueId });
}
const summary = { project: key.project_id, venueId, sourceRoot, sourceFile,
  templatePath: templateRef.path,
  templateUpdateTime: template.updateTime.toDate().toISOString(),
  templateDataHash: hash(templateData), sameSourceIds, conflicts,
  creates: creates.map(({ path: docPath, title, startDate, uniqueId, dataHash }) =>
    ({ path: docPath, title, startDate, uniqueId, dataHash })) };
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = path.resolve('functions/artifacts/luna-oct8-full-audit');
await fs.mkdir(outputDir, { recursive: true });
if (!apply) {
  const backupPath = path.join(outputDir, `hunter-backup-${stamp}.json`);
  const planPath = path.join(outputDir, `hunter-plan-${stamp}.json`);
  await fs.writeFile(backupPath, JSON.stringify({ createdAt: new Date().toISOString(),
    template: { path: templateRef.path,
      updateTime: template.updateTime.toDate().toISOString(), data: templateData },
    sameSourceIds, conflicts }, null, 2));
  await fs.writeFile(planPath, JSON.stringify({ ...summary, backupPath }, null, 2));
  console.log(JSON.stringify({ mode: 'dry-run', planPath, backupPath, ...summary }, null, 2));
  process.exit(0);
}
const plan = JSON.parse(await fs.readFile(path.resolve(planArg.slice('--plan='.length)), 'utf8'));
const { backupPath: _backupPath, ...approved } = plan;
if (JSON.stringify(approved) !== JSON.stringify(summary)) {
  throw new Error('Hunter source, existing template, or Friday conflict changed since approved dry run');
}
const batch = db.batch();
for (const { ref, data } of creates) batch.create(ref, {
  ...data, createdAt: admin.firestore.FieldValue.serverTimestamp(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
});
await batch.commit();
const after = await Promise.all(creates.map(({ ref }) => ref.get()));
const ok = after.every((snap, index) => snap.exists &&
  snap.data().uniqueId === creates[index].uniqueId &&
  snap.data().startDate === creates[index].startDate);
const resultPath = path.join(outputDir, `hunter-result-${stamp}.json`);
await fs.writeFile(resultPath, JSON.stringify({ completedAt: new Date().toISOString(),
  planPath: path.resolve(planArg.slice('--plan='.length)), ok,
  created: summary.creates.map(item => item.path),
  preserved: templateRef.path, conflicts }, null, 2));
console.log(JSON.stringify({ resultPath, ok, created: summary.creates.map(item => item.path) }));
if (!ok) process.exitCode = 1;
