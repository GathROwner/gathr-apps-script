#!/usr/bin/env node
// Guarded, opt-in correction of two source-verified October 3 canary writes.
// Usage: GATHR_SERVICE_ACCOUNT_PATH=<absolute path> node repair-luna-oct3-two-events.js [--apply]
const fs = require('node:fs');
const path = require('node:path');

const keyPath = process.env.GATHR_SERVICE_ACCOUNT_PATH;
if (!keyPath || !path.isAbsolute(keyPath)) {
  throw new Error('Set GATHR_SERVICE_ACCOUNT_PATH to the absolute service-account.json path.');
}
const admin = require(require.resolve('firebase-admin', { paths: [path.dirname(keyPath)] }));
admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
const db = admin.firestore();
const apply = process.argv.includes('--apply');
const outputDir = path.resolve(__dirname, '../artifacts/luna-oct3-canary-audit');

const targets = [
  {
    path: 'venues/slug_holmansicecream/events/DZlHQ0mpfLjKJF6nCaml',
    fingerprint: {
      uniqueId: '1696850639107578_986e635b4ef8e80c',
      name: 'Pre-Order Warm Apple Crisp',
      startDate: '2026-10-08', startTime: '11:30',
      endDate: '2026-10-08', endTime: '21:00',
      isRecurring: 'Yes', recurringPattern: 'weekly_custom',
    },
    update: {
      startDate: '2026-10-02', startTime: '14:25',
      endDate: '2026-10-07', endTime: '09:00',
      isRecurring: 'No', recurringPattern: 'none',
      totalOccurrences: 1,
      recurrenceUntilDate: admin.firestore.FieldValue.delete(),
      recurringDaysOfWeek: admin.firestore.FieldValue.delete(),
      recurringWeekInterval: admin.firestore.FieldValue.delete(),
      timeFlags: {
        start: { source: 'semantic', evidence: 'ordering open at source post time 2026-10-02T17:25:59Z' },
        end: { source: 'explicit', toClose: false, evidence: 'Pre-orders available until Wednesday October 7 at 9 A.M.' },
      },
      timeResolution: { hoursUsed: false, startFromPostTime: true },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  },
  {
    path: 'venues/aaUr1AtLKEjPEtmhKD8u/events/Np1VN85oOdu2o4Ktki7P',
    fingerprint: {
      uniqueId: '1620327989788094_438c93fd2d968ac0',
      name: 'Jordan Mocsyn – Around the Fire',
      startDate: '2026-10-02', startTime: '16:00',
      endDate: '2026-10-03', endTime: '01:00',
      isRecurring: 'No', recurringPattern: 'none',
    },
    update: {
      name: 'Jordan Musycsyn – Around the Fire',
      eventName: 'Jordan Musycsyn – Around the Fire',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  },
];

async function main() {
  if (process.argv.some(arg => arg.startsWith('--') && arg !== '--apply')) {
    throw new Error('Only --apply is supported. Default is dry run.');
  }
  const snapshots = await Promise.all(targets.map(target => db.doc(target.path).get()));
  const mismatch = [];
  snapshots.forEach((snap, index) => {
    const target = targets[index];
    if (!snap.exists) { mismatch.push(`${target.path}: missing`); return; }
    const data = snap.data();
    for (const [field, expected] of Object.entries(target.fingerprint)) {
      if (data[field] !== expected) mismatch.push(`${target.path}: ${field} changed`);
    }
    const root = target.fingerprint.uniqueId.split('_')[0];
    if (!String(data.uniqueId || '').startsWith(`${root}_`)) {
      mismatch.push(`${target.path}: source root changed`);
    }
  });
  if (mismatch.length) throw new Error(`Fingerprint failure: ${mismatch.join('; ')}`);

  const siblingChecks = await Promise.all(targets.map(target => {
    const prefix = `${target.fingerprint.uniqueId.split('_')[0]}_`;
    return db.collectionGroup('events').orderBy('uniqueId').startAt(prefix).endAt(`${prefix}\uf8ff`).get();
  }));
  const siblingPaths = siblingChecks.map(snap => snap.docs.map(doc => doc.ref.path));
  siblingPaths.forEach((paths, index) => {
    if (paths.length !== 1 || paths[0] !== targets[index].path) {
      mismatch.push(`${targets[index].path}: unexpected source siblings ${paths.join(', ')}`);
    }
  });
  if (mismatch.length) throw new Error(`Source identity failure: ${mismatch.join('; ')}`);

  const plan = targets.map((target, index) => ({
    path: target.path,
    updateTime: snapshots[index].updateTime.toDate().toISOString(),
    before: target.fingerprint,
    after: Object.fromEntries(Object.entries(target.update).filter(([key]) => key !== 'updatedAt')
      .map(([key, value]) => [key, value?.isEqual ? '<delete>' : value])),
    sourceSiblingPaths: siblingPaths[index],
  }));
  if (!apply) {
    console.log(JSON.stringify({ mode: 'dry-run', plan }, null, 2));
    return;
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(outputDir, `two-event-live-backup-${stamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify({ capturedAt: new Date().toISOString(),
    documents: snapshots.map(snap => ({ path: snap.ref.path,
      updateTime: snap.updateTime.toDate().toISOString(), data: snap.data() })) }, null, 2));

  // Preconditions close the gap between the dry run and the atomic commit.
  const batch = db.batch();
  targets.forEach((target, index) => {
    batch.update(snapshots[index].ref, target.update, { lastUpdateTime: snapshots[index].updateTime });
  });
  await batch.commit();
  const after = await Promise.all(targets.map(target => db.doc(target.path).get()));
  if (after.some((snap, index) => !snap.exists ||
      (index === 0 && (snap.get('startDate') !== '2026-10-02' || snap.get('endDate') !== '2026-10-07' ||
        snap.get('endTime') !== '09:00' || snap.get('isRecurring') !== 'No')) ||
      (index === 1 && snap.get('name') !== 'Jordan Musycsyn – Around the Fire'))) {
    throw new Error(`Write committed but verification failed; inspect backup ${backupPath}`);
  }
  const resultPath = path.join(outputDir, `two-event-live-result-${stamp}.json`);
  fs.writeFileSync(resultPath, JSON.stringify({ appliedAt: new Date().toISOString(), backupPath,
    paths: targets.map(target => target.path), verified: true }, null, 2));
  console.log(JSON.stringify({ mode: 'applied', backupPath, resultPath, verified: true }));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => admin.app().delete());
