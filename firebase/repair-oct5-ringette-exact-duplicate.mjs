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
if (key.project_id !== 'gathr-migrated') throw new Error('Unexpected Firebase project');
admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id });
const db = admin.firestore();

const venueEventsPath = 'venues/slug_easternkingssportsplex/events';
const genericPath = `${venueEventsPath}/owQi3dQZNftKXYnebMjX`;
const detailedPath = `${venueEventsPath}/h0bVbqyWsIXG0anRyWGc`;
const genericSource = '1662948381959213_2e6912334ff2d1ee';
const detailedSource = '1662950478625670_48ee16fdd17eec60';
const expectedGenericUpdateTime = '2026-10-04T13:58:02.573Z';
const expectedDetailedUpdateTime = '2026-10-05T13:51:53.868Z';
const expectedSiblingIds = [
  '9QDe6RDYjVkMtxRpH6cA', 'IrYSaTMEFcFDOjiDtONp',
  'LOtdim5QCB9piP3YiF4n', 'ROzJR7ratuRXNmaj5Fam',
  'jaQJngLzdr9AUZ1Mbohf', 'owQi3dQZNftKXYnebMjX',
  'rPypuETWluC89uBaPU1e', 'v292kPrh0PpXPQNJTvhu',
  'voKhYdmgKtsNawXuIAmZ', 'xIBEU7bYlwUchmWiRrCj',
].sort();

const [generic, detailed, allVenueEvents] = await Promise.all([
  db.doc(genericPath).get(),
  db.doc(detailedPath).get(),
  db.collection(venueEventsPath).get(),
]);
if (!generic.exists || !detailed.exists) throw new Error('A target record is missing');
const genericData = generic.data();
const detailedData = detailed.data();
const sameSourceSiblings = allVenueEvents.docs
  .filter(doc => String(doc.data().uniqueId || '').startsWith('1662948381959213_'))
  .map(doc => doc.id).sort();
if (JSON.stringify(sameSourceSiblings) !== JSON.stringify(expectedSiblingIds)) {
  throw new Error(`Generic source siblings changed: ${JSON.stringify(sameSourceSiblings)}`);
}
const expectedSlot = (data, title, uniqueId) =>
  data.eventName === title && data.name === title && data.uniqueId === uniqueId &&
  data.startDate === '2026-10-09' && data.endDate === '2026-10-09' &&
  data.startTime === '16:20' && data.endTime === '17:20' &&
  data.venueId === 'slug_easternkingssportsplex' &&
  data.cleanedFacebookUrl === 'https://www.facebook.com/EasternKingsSportsplex/' &&
  data.isRecurring === 'No' && data.recurringPattern === 'none';
if (!expectedSlot(genericData, 'RINGETTE', genericSource) ||
    !expectedSlot(detailedData, 'Souris Savers Ringette — U12', detailedSource) ||
    generic.updateTime.toDate().toISOString() !== expectedGenericUpdateTime ||
    detailed.updateTime.toDate().toISOString() !== expectedDetailedUpdateTime) {
  throw new Error('A candidate fingerprint or update time changed');
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = path.resolve('artifacts/luna-oct5-canary-audit');
await fs.mkdir(outputDir, { recursive: true });
const backupPath = path.join(outputDir, `ringette-duplicate-cleanup-backup-${stamp}.json`);
await fs.writeFile(backupPath, JSON.stringify({
  readAt: new Date().toISOString(),
  generic: { path: genericPath, updateTime: expectedGenericUpdateTime, data: genericData },
  detailed: { path: detailedPath, updateTime: expectedDetailedUpdateTime, data: detailedData },
  sameSourceSiblings,
}, null, 2));
const plan = {
  mode: apply ? 'apply' : 'dry-run', project: key.project_id,
  delete: genericPath, keep: detailedPath, backupPath,
  generic: { title: genericData.eventName, uniqueId: genericData.uniqueId,
    startDate: genericData.startDate, startTime: genericData.startTime,
    endTime: genericData.endTime, updateTime: expectedGenericUpdateTime },
  detailed: { title: detailedData.eventName, uniqueId: detailedData.uniqueId,
    startDate: detailedData.startDate, startTime: detailedData.startTime,
    endTime: detailedData.endTime, updateTime: expectedDetailedUpdateTime },
  sameSourceSiblingCount: sameSourceSiblings.length,
};
if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

const batch = db.batch();
batch.delete(generic.ref, { lastUpdateTime: generic.updateTime });
await batch.commit();
const [genericAfter, detailedAfter] = await Promise.all([
  generic.ref.get(), detailed.ref.get(),
]);
const report = { ...plan, completedAt: new Date().toISOString(),
  genericRemaining: genericAfter.exists,
  detailedPreserved: detailedAfter.exists &&
    detailedAfter.updateTime.toDate().toISOString() === expectedDetailedUpdateTime };
const resultPath = path.join(outputDir, `ringette-duplicate-cleanup-result-${stamp}.json`);
await fs.writeFile(resultPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ resultPath, backupPath,
  deleted: !report.genericRemaining, detailedPreserved: report.detailedPreserved }));
if (report.genericRemaining || !report.detailedPreserved) process.exitCode = 1;
