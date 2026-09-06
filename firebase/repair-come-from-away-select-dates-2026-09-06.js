const fs = require('fs');
const path = require('path');
const admin = require('../functions/node_modules/firebase-admin');

const serviceAccountPath =
  process.env.GATHR_SERVICE_ACCOUNT_PATH ||
  'C:\\Users\\craig\\Dev\\gathr-apps-script\\firebase\\service-account.json';
const serviceAccount = require(path.resolve(serviceAccountPath));

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();
const apply = process.argv.includes('--apply');
const runStamp = new Date().toISOString().replace(/[:.]/g, '-');

const TARGETS = [
  {
    path: 'venues/slug_confedcentre/events/i5rV9dIg2n9KwUD7R5gq',
    expected: {
      uniqueId: '1392327566265948_1',
      eventName: 'Come From Away (Charlottetown Festival)',
      startDate: '2026-06-30',
      endDate: '2026-09-26',
    },
    reason: 'Select-date season range stored as one continuous event.',
  },
  {
    path: 'venues/slug_sobeyfamilytheatre/events/25fkcLJtO9teSYpomDoY',
    expected: {
      uniqueId: '1459418062890231_4e55d20a4534d155',
      eventName: 'Come From Away (musical) — Select Dates',
      startDate: '2026-06-30',
      endDate: '2026-06-30',
      recurringPattern: 'daily',
      recurrenceUntilDate: '2026-09-26',
    },
    reason: 'Select-date season range stored as a fabricated daily recurrence.',
  },
  {
    path: 'venues/slug_confedcentre/events/c285BGlYbTzbPRkFQtkQ',
    expected: {
      uniqueId: '1368680751963963_4',
      eventName: 'Come From Away',
      startDate: '2026-09-26',
      startTime: '08:00',
    },
    reason: 'Run-until boundary stored as a closing-day occurrence with unsupported hours.',
  },
  {
    path: 'venues/slug_sobeyfamilytheatre/events/J9PYe7ZIbxkyEMPvjov4',
    expected: {
      uniqueId: '1460496102782427_5360f722c20c13e3',
      eventName: 'COME FROM AWAY (The Charlottetown Festival)',
      startDate: '2026-09-26',
      startTime: '08:00',
    },
    reason: 'On-stage-now promotion stored as a closing-day occurrence.',
  },
  {
    path: 'venues/slug_ccoagallery/events/EPR0X4GLGqfogESGv2du',
    expected: {
      uniqueId: '1455782159920488_6bf665eab9054fb8',
      eventName: 'Come From Away (The Charlottetown Festival) - Closing date',
      startDate: '2026-09-26',
      venueId: 'slug_ccoagallery',
    },
    reason: 'Select-date boundary stored as an Art Gallery closing-date event.',
  },
];

function mismatchFields(data, expected) {
  return Object.entries(expected)
    .filter(([key, expectedValue]) => data[key] !== expectedValue)
    .map(([key, expectedValue]) => ({ key, expected: expectedValue, actual: data[key] }));
}

async function main() {
  const records = [];
  let safe = true;

  for (const target of TARGETS) {
    const snapshot = await db.doc(target.path).get();
    const before = snapshot.exists ? snapshot.data() : null;
    const mismatches = before ? mismatchFields(before, target.expected) : [{ key: 'exists', expected: true, actual: false }];
    if (mismatches.length > 0) safe = false;
    records.push({
      path: target.path,
      exists: snapshot.exists,
      reason: target.reason,
      expected: target.expected,
      mismatches,
      before,
    });
  }

  const plan = {
    generatedAt: new Date().toISOString(),
    mode: apply ? 'apply' : 'dry-run',
    safe,
    action: 'delete Firestore documents only; media is not deleted',
    targetCount: TARGETS.length,
    targets: records.map(({ before, ...record }) => record),
  };

  const planPath = path.join(process.cwd(), `tmp_come_from_away_cleanup_plan_${runStamp}.json`);
  const backupPath = path.join(process.cwd(), `tmp_come_from_away_cleanup_backup_${runStamp}.json`);
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));
  fs.writeFileSync(
    backupPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), records }, null, 2)
  );

  console.log(JSON.stringify({ ...plan, planPath, backupPath }, null, 2));

  if (!safe) {
    throw new Error('Cleanup aborted because one or more strict fingerprints did not match.');
  }

  if (!apply) {
    console.log('Dry run only. Re-run with --apply after reviewing the plan and backup.');
    return;
  }

  const batch = db.batch();
  for (const target of TARGETS) batch.delete(db.doc(target.path));
  await batch.commit();

  const verification = [];
  for (const target of TARGETS) {
    const snapshot = await db.doc(target.path).get();
    verification.push({ path: target.path, exists: snapshot.exists });
  }

  if (verification.some((record) => record.exists)) {
    throw new Error(`Post-commit verification failed: ${JSON.stringify(verification)}`);
  }

  console.log(JSON.stringify({ applied: true, deletedCount: TARGETS.length, verification }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await admin.app().delete();
  });
