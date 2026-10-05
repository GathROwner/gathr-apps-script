import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');
const apply = process.argv.slice(2).includes('--apply');
if (process.argv.slice(2).some(arg => arg !== '--apply')) {
  throw new Error('Only --apply is supported');
}
const keyPath = process.env.GATHR_SERVICE_ACCOUNT_PATH;
if (!keyPath) throw new Error('Set GATHR_SERVICE_ACCOUNT_PATH');
const key = JSON.parse(await fs.readFile(keyPath, 'utf8'));
const manifest = JSON.parse(await fs.readFile(
  new URL('./repair-oct5-ontario-cornwall-manifest.json', import.meta.url), 'utf8'
));
if (key.project_id !== 'gathr-migrated' || manifest.project !== key.project_id) {
  throw new Error('Unexpected Firebase project');
}
if (manifest.venuePath !== 'venues/slug_librarycornwallontario' ||
    manifest.records.length !== 84) {
  throw new Error('Unexpected target manifest');
}
admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id });
const db = admin.firestore();
const venueRef = db.doc(manifest.venuePath);
const [venue, eventSnapshot] = await Promise.all([
  venueRef.get(), venueRef.collection('events').get(),
]);
if (!venue.exists) throw new Error('Venue missing');
const venueData = venue.data();
if (venue.updateTime.toDate().toISOString() !== manifest.venueUpdateTime ||
    venueData.address !== manifest.venueAddress ||
    venueData.latitude !== manifest.latitude ||
    venueData.longitude !== manifest.longitude ||
    venueData.facebookUrl !== 'https://www.facebook.com/librarycornwallontario') {
  throw new Error('Ontario venue fingerprint changed');
}
const expected = new Map(manifest.records.map(item => [item.path, item]));
if (eventSnapshot.size !== expected.size) {
  throw new Error(`Venue event count changed: ${eventSnapshot.size}`);
}
const records = eventSnapshot.docs.map(doc => {
  const fingerprint = expected.get(doc.ref.path);
  if (!fingerprint) throw new Error(`Unexpected event: ${doc.ref.path}`);
  const data = doc.data();
  const actual = {
    path: doc.ref.path,
    updateTime: doc.updateTime.toDate().toISOString(),
    uniqueId: data.uniqueId,
    title: data.eventName,
    startDate: data.startDate,
    endDate: data.endDate,
    startTime: data.startTime,
    endTime: data.endTime,
    isRecurring: data.isRecurring,
    recurringPattern: data.recurringPattern,
  };
  if (JSON.stringify(actual) !== JSON.stringify(fingerprint) ||
      data.name !== fingerprint.title ||
      data.venueId !== venue.id ||
      data.address !== manifest.venueAddress ||
      data.latitude !== manifest.latitude ||
      data.longitude !== manifest.longitude) {
    throw new Error(`Event fingerprint changed: ${doc.ref.path}`);
  }
  return { ref: doc.ref, updateTime: doc.updateTime, backup: {
    path: doc.ref.path, updateTime: actual.updateTime, data,
  } };
});
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = path.resolve('artifacts/luna-oct5-canary-audit');
await fs.mkdir(outputDir, { recursive: true });
const backupPath = path.join(outputDir, `ontario-cornwall-cleanup-backup-${stamp}.json`);
await fs.writeFile(backupPath, JSON.stringify({
  readAt: new Date().toISOString(),
  venue: { path: venue.ref.path, updateTime: manifest.venueUpdateTime, data: venueData },
  records: records.map(record => record.backup),
}, null, 2));
const plan = { mode: apply ? 'apply' : 'dry-run', project: key.project_id,
  venue: manifest.venuePath, venueAction: 'keep',
  eventAction: 'delete', eventCount: records.length,
  targetPaths: records.map(record => record.ref.path).sort(), backupPath };
if (!apply) {
  console.log(JSON.stringify({ ...plan, targetPaths: `all ${records.length} paths in ${path.resolve('firebase/repair-oct5-ontario-cornwall-manifest.json')}` }, null, 2));
  process.exit(0);
}

const batch = db.batch();
for (const record of records) {
  batch.delete(record.ref, { lastUpdateTime: record.updateTime });
}
await batch.commit();
const [venueAfter, eventsAfter] = await Promise.all([
  venueRef.get(), venueRef.collection('events').get(),
]);
const report = { ...plan, completedAt: new Date().toISOString(),
  remainingEventCount: eventsAfter.size,
  venuePreserved: venueAfter.exists &&
    venueAfter.updateTime.toDate().toISOString() === manifest.venueUpdateTime };
const resultPath = path.join(outputDir, `ontario-cornwall-cleanup-result-${stamp}.json`);
await fs.writeFile(resultPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ resultPath, backupPath, deleted: records.length - eventsAfter.size,
  remainingEventCount: eventsAfter.size, venuePreserved: report.venuePreserved }));
if (eventsAfter.size !== 0 || !report.venuePreserved) process.exitCode = 1;
