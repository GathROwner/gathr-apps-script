const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const APPLY = process.argv.includes('--apply');
const TARGET_PATH = 'venues/V7zQ5unfTY1GtNKUvR7c/events/3tqTPat9LVjHqzBBwTNp';
const LEGIT_PATH = 'venues/V7zQ5unfTY1GtNKUvR7c/events/tTCP7DPYUnIE3DmIEYGJ';
const AUDIT_PATH = 'event_update_audits/N08RAnn8ZyhQbx72Ysnz';
const PRIOR_IMAGE =
  'https://storage.googleapis.com/gathr-uploaded-images/postimages/1785249687613-hq3y2l.webp';
const MERGE_IMAGES = [
  'https://storage.googleapis.com/gathr-uploaded-images/postimages/1786716915853-vxvag8.webp',
  'https://storage.googleapis.com/gathr-uploaded-images/postimages/1786716916174-tw6qec.webp',
];
const LEGIT_IMAGE =
  'https://storage.googleapis.com/gathr-uploaded-images/postimages/1787062851953-ztfyck.webp';

const serviceAccountPath = process.env.GATHR_SERVICE_ACCOUNT_PATH
  ? path.resolve(process.env.GATHR_SERVICE_ACCOUNT_PATH)
  : path.join(__dirname, 'service-account.json');
if (!fs.existsSync(serviceAccountPath)) {
  throw new Error(
    `Missing service account at ${serviceAccountPath}. Set GATHR_SERVICE_ACCOUNT_PATH explicitly.`
  );
}

admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath)),
});
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

function timestampTag() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      `Fingerprint mismatch for ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertTargetFingerprint(data) {
  assertEqual(data.uniqueId, '1772514857574758_5d110d048656f7f8', 'target.uniqueId');
  assertEqual(
    data.eventName || data.name,
    'The Comedy Cave: Jalen + Friends (Stand-up Comedy Showcase)',
    'target.name'
  );
  assertEqual(data.startDate, '2026-08-15', 'target.startDate');
  assertEqual(data.endDate, '2026-08-15', 'target.endDate');
  assertEqual(data.startTime, '20:00', 'target.startTime');
  assertEqual(data.endTime, '22:00', 'target.endTime');
  assertEqual(data.isRecurring, true, 'target.isRecurring');
  assertEqual(data.recurringPattern, 'weekly_saturday', 'target.recurringPattern');
  assertEqual(
    data.relevantImageUrl,
    MERGE_IMAGES[1],
    'target.relevantImageUrl'
  );
}

function assertLegitFingerprint(data) {
  assertEqual(data.uniqueId, '1793064295519814_8972e7770a2165a1', 'legit.uniqueId');
  assertEqual(
    data.eventName || data.name,
    'Canada’s Next Best Comic Search (Comedy Cave stop)',
    'legit.name'
  );
  assertEqual(data.startDate, '2026-09-26', 'legit.startDate');
  assertEqual(data.endDate, '2026-09-26', 'legit.endDate');
  assertEqual(data.startTime, '20:00', 'legit.startTime');
  assertEqual(data.endTime, '22:00', 'legit.endTime');
  assertEqual(data.recurringPattern, 'none', 'legit.recurringPattern');
  assertEqual(data.relevantImageUrl, LEGIT_IMAGE, 'legit.relevantImageUrl');
}

function assertAuditFingerprint(data) {
  if (!data.before || !data.incoming) {
    throw new Error(`Audit ${AUDIT_PATH} is missing before/incoming snapshots`);
  }
  assertEqual(data.before.uniqueId, '1772514857574758_5d110d048656f7f8', 'audit.before.uniqueId');
  assertEqual(data.before.recurringPattern, 'none', 'audit.before.recurringPattern');
  assertEqual(data.before.relevantImageUrl, PRIOR_IMAGE, 'audit.before.relevantImageUrl');
  assertEqual(
    data.incoming.uniqueId,
    '1789273352565575_8157646ba085fc2f',
    'audit.incoming.uniqueId'
  );
  assertEqual(data.incoming.recurringPattern, 'weekly_saturday', 'audit.incoming.recurringPattern');
  assertEqual(data.incoming.relevantImageUrl, MERGE_IMAGES[1], 'audit.incoming.relevantImageUrl');
}

function collectUrlLocations(value, wantedUrls, prefix = '', results = []) {
  if (typeof value === 'string') {
    if (wantedUrls.has(value)) results.push(prefix || '<root>');
    return results;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      collectUrlLocations(entry, wantedUrls, `${prefix}[${index}]`, results)
    );
    return results;
  }
  if (!value || typeof value !== 'object') return results;
  for (const [key, entry] of Object.entries(value)) {
    collectUrlLocations(entry, wantedUrls, prefix ? `${prefix}.${key}` : key, results);
  }
  return results;
}

async function scanEventImageReferences() {
  const wantedUrls = new Set([PRIOR_IMAGE, ...MERGE_IMAGES, LEGIT_IMAGE]);
  const snapshots = await Promise.all([
    db.collectionGroup('events').get(),
    db.collection('events').get(),
  ]);
  const docs = new Map();
  for (const snapshot of snapshots) {
    for (const doc of snapshot.docs) docs.set(doc.ref.path, doc);
  }

  const refs = [];
  for (const [docPath, doc] of docs) {
    const fields = collectUrlLocations(doc.data(), wantedUrls);
    if (fields.length > 0) refs.push({ path: docPath, fields });
  }
  return {
    scannedEventDocs: docs.size,
    refs,
  };
}

function buildUpdates(priorImageProvenance) {
  return {
    isRecurring: false,
    recurringPattern: 'none',
    recurringDaysOfWeek: FieldValue.delete(),
    recurringWeekdaySequence: FieldValue.delete(),
    recurringWeekInterval: FieldValue.delete(),
    recurrenceUntilDate: FieldValue.delete(),
    totalOccurrences: FieldValue.delete(),
    image: PRIOR_IMAGE,
    imageUrl: PRIOR_IMAGE,
    relevantImageUrl: PRIOR_IMAGE,
    mediaUrls: [PRIOR_IMAGE],
    imageProvenance: priorImageProvenance,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function summarizePlannedUpdates() {
  return {
    isRecurring: false,
    recurringPattern: 'none',
    clearedFields: [
      'recurringDaysOfWeek',
      'recurringWeekdaySequence',
      'recurringWeekInterval',
      'recurrenceUntilDate',
      'totalOccurrences',
    ],
    image: PRIOR_IMAGE,
    imageUrl: PRIOR_IMAGE,
    relevantImageUrl: PRIOR_IMAGE,
    mediaUrls: [PRIOR_IMAGE],
    imageProvenance: 'restore event_update_audits/N08RAnn8ZyhQbx72Ysnz.before.imageProvenance',
    updatedAt: 'serverTimestamp',
  };
}

async function main() {
  const [targetSnap, legitSnap, auditSnap, referenceScan] = await Promise.all([
    db.doc(TARGET_PATH).get(),
    db.doc(LEGIT_PATH).get(),
    db.doc(AUDIT_PATH).get(),
    scanEventImageReferences(),
  ]);

  if (!targetSnap.exists) throw new Error(`Target does not exist: ${TARGET_PATH}`);
  if (!legitSnap.exists) throw new Error(`Legitimate event does not exist: ${LEGIT_PATH}`);
  if (!auditSnap.exists) throw new Error(`Update audit does not exist: ${AUDIT_PATH}`);

  const targetBefore = targetSnap.data();
  const legitBefore = legitSnap.data();
  const audit = auditSnap.data();
  assertTargetFingerprint(targetBefore);
  assertLegitFingerprint(legitBefore);
  assertAuditFingerprint(audit);

  const stamp = timestampTag();
  const backupPath = path.join(
    __dirname,
    `comedy-cave-recurrence-repair-backup-${stamp}.json`
  );
  const reportPath = path.join(
    __dirname,
    `comedy-cave-recurrence-repair-report-${stamp}.json`
  );
  const backup = {
    generatedAt: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    target: { path: TARGET_PATH, data: targetBefore },
    protectedLegitimateEvent: { path: LEGIT_PATH, data: legitBefore },
    provenanceAudit: { path: AUDIT_PATH, data: audit },
    imageReferenceScan: referenceScan,
    storageObjectsDeleted: [],
  };
  fs.writeFileSync(backupPath, `${JSON.stringify(backup, null, 2)}\n`, 'utf8');

  const report = {
    generatedAt: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    targetPath: TARGET_PATH,
    protectedLegitimateEventPath: LEGIT_PATH,
    plannedUpdates: summarizePlannedUpdates(),
    imageReferenceScan: referenceScan,
    backupPath,
    storageObjectsDeleted: [],
  };

  if (!APPLY) {
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ ...report, reportPath }, null, 2));
    return;
  }

  await db.runTransaction(async (transaction) => {
    const [freshTargetSnap, freshLegitSnap] = await Promise.all([
      transaction.get(db.doc(TARGET_PATH)),
      transaction.get(db.doc(LEGIT_PATH)),
    ]);
    if (!freshTargetSnap.exists || !freshLegitSnap.exists) {
      throw new Error('Target or protected legitimate event disappeared before apply');
    }
    assertTargetFingerprint(freshTargetSnap.data());
    assertLegitFingerprint(freshLegitSnap.data());
    transaction.update(
      db.doc(TARGET_PATH),
      buildUpdates(audit.before.imageProvenance)
    );
  });

  const [targetAfterSnap, legitAfterSnap] = await Promise.all([
    db.doc(TARGET_PATH).get(),
    db.doc(LEGIT_PATH).get(),
  ]);
  const targetAfter = targetAfterSnap.data();
  const legitAfter = legitAfterSnap.data();
  assertEqual(targetAfter.isRecurring, false, 'targetAfter.isRecurring');
  assertEqual(targetAfter.recurringPattern, 'none', 'targetAfter.recurringPattern');
  assertEqual(targetAfter.relevantImageUrl, PRIOR_IMAGE, 'targetAfter.relevantImageUrl');
  assertEqual(targetAfter.image, PRIOR_IMAGE, 'targetAfter.image');
  assertEqual(targetAfter.imageUrl, PRIOR_IMAGE, 'targetAfter.imageUrl');
  assertEqual(targetAfter.mediaUrls.length, 1, 'targetAfter.mediaUrls.length');
  assertEqual(targetAfter.mediaUrls[0], PRIOR_IMAGE, 'targetAfter.mediaUrls[0]');
  assertEqual(
    targetAfter.imageProvenance.primaryUrl,
    PRIOR_IMAGE,
    'targetAfter.imageProvenance.primaryUrl'
  );
  assertLegitFingerprint(legitAfter);

  const applyReport = {
    ...report,
    completedAt: new Date().toISOString(),
    fieldsAfter: {
      isRecurring: targetAfter.isRecurring,
      recurringPattern: targetAfter.recurringPattern,
      image: targetAfter.image,
      imageUrl: targetAfter.imageUrl,
      relevantImageUrl: targetAfter.relevantImageUrl,
      mediaUrls: targetAfter.mediaUrls,
      imageProvenance: targetAfter.imageProvenance,
    },
    protectedLegitimateEventVerifiedUnchanged: true,
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(applyReport, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...applyReport, reportPath }, null, 2));
}

main()
  .then(async () => {
    await admin.app().delete();
  })
  .catch(async (error) => {
    console.error(error);
    try {
      await admin.app().delete();
    } catch {}
    process.exit(1);
  });
