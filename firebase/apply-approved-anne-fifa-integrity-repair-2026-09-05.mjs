import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const requireFromFunctions = createRequire(path.join(repoRoot, 'functions', 'package.json'));
const admin = requireFromFunctions('firebase-admin');

const fifaTarget = {
  path: 'venues/slug_foundersfoodhall/events/DOUl8QiVvncaP7dRT4QF',
  uniqueId: '1480706504096882_6bd310b885428e84',
  title: 'FIFA World Cup Match',
  startDate: '2026-07-18',
  startTime: '18:00',
  recurringPattern: 'weekly_saturday',
};

const anneKeeper = {
  path: 'venues/slug_sobeyfamilytheatre/events/h2n7NcxUVWnbQ39B10IG',
  uniqueId: '1525873122913553_425a42cfae8d63dd',
  title: 'Anne of Green Gables - The Musical ™️',
  startDate: '2026-09-05',
  startTime: '19:30',
  endTime: '21:30',
};

const anneClosingSource = {
  path: 'venues/slug_confedcentre/events/N6HWvHvvDeqGyIiaHD8e',
  uniqueId: '1475216191310418_002b6acf57f01c1c',
  title: 'Anne of Green Gables–The Musical™ (Closing Performance)',
  startDate: '2026-09-05',
  startTime: '19:30',
};

const anneBadOrDuplicateTargets = [
  {
    path: 'events/cityrecovered_0b311963b58b00d563c2d938',
    uniqueId: 'cityrecovered_0b311963b58b00d563c2d938_venue',
    title: 'Anne of Green Gables–The Musical™',
    startDate: '2026-09-05',
    startTime: '08:00',
  },
  {
    path: 'venues/slug_ccoagallery/events/DEWaxFjFjQLK3VXMiCfg',
    uniqueId: '1412923254206379_d4134d3d9a2e3314',
    title: 'Anne of Green Gables–The Musical™ (On stage through Sept 5)',
    startDate: '2026-09-05',
    startTime: '08:00',
  },
  {
    path: 'venues/slug_confedcentre/events/A1tLDqtH3f6zU41IceNB',
    uniqueId: '1368680751963963_2',
    title: 'Anne of Green Gables–The Musical™',
    startDate: '2026-09-05',
    startTime: '08:00',
  },
  {
    path: 'venues/slug_sobeyfamilytheatre/events/a9WMif8alSVBmesYSMHP',
    uniqueId: '1461378342694203_c80ab28163dddbc3',
    title: 'Anne of Green Gables–The Musical™',
    startDate: '2026-09-05',
    startTime: '08:00',
  },
  anneClosingSource,
];

const reviewTargets = [
  'city_level_event_reviews/cityevt_20a500f87ff77853f0b5b947',
  'city_level_event_reviews/cityevt_7bf74f3bbb04cafab622c7e7',
  'city_level_event_reviews/cityevt_9c7bc8e66f2287aa624f4c90',
];

const recoveredEventId = 'cityrecovered_0b311963b58b00d563c2d938';
const recoveredEventPath = `events/${recoveredEventId}`;
const officialEventUrl =
  'https://confederationcentre.com/event/anne-of-green-gables-the-musical-2026/';

function serialize(value) {
  if (value == null) return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, serialize(child)]));
  }
  return value;
}

function titleOf(data) {
  return String(data.eventName || data.name || data.title || '').trim();
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function assertEvent(snapshot, expected) {
  if (!snapshot.exists) throw new Error(`Approved target is missing: ${expected.path}`);
  const data = snapshot.data() || {};
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (field === 'path') continue;
    const actualValue = field === 'title' ? titleOf(data) : String(data[field] ?? '').trim();
    if (actualValue !== expectedValue) {
      throw new Error(
        `Approved target changed: ${expected.path} expected ${field}=${expectedValue}, received ${actualValue}`
      );
    }
  }
  return data;
}

function compactEvent(pathValue, data) {
  return {
    path: pathValue,
    title: titleOf(data),
    uniqueId: data.uniqueId || null,
    startDate: data.startDate || null,
    startTime: data.startTime || null,
    endTime: data.endTime || null,
    establishment: data.establishment || null,
    venueId: data.venueId || null,
    recurringPattern: data.recurringPattern || null,
  };
}

function buildKeeperPatch(closingSourceData) {
  const patch = {
    name: anneClosingSource.title,
    eventName: anneClosingSource.title,
    description: closingSourceData.description,
    establishment: 'Sobey Family Theatre',
    venue: 'Sobey Family Theatre',
    additionalLocation: 'Sobey Family Theatre',
    venueId: 'slug_sobeyfamilytheatre',
    locationScope: 'venue',
    locationLabel: 'Sobey Family Theatre',
    locationPrecision: 'exact',
    locationReviewStatus: 'not_needed',
    ticketLink: officialEventUrl,
    ticketsBuyUrl: officialEventUrl,
    facebookUrl: closingSourceData.facebookUrl,
    cleanedFacebookUrl: closingSourceData.cleanedFacebookUrl,
    organizedBy: closingSourceData.organizedBy || 'Confederation Centre of the Arts',
    sourceTimestamp: closingSourceData.sourceTimestamp,
    imageUrl: closingSourceData.imageUrl,
    image: closingSourceData.image,
    relevantImageUrl: closingSourceData.relevantImageUrl,
    mediaUrls: closingSourceData.mediaUrls,
    imageProvenance: closingSourceData.imageProvenance,
    icon: closingSourceData.icon,
    likes: closingSourceData.likes,
    shares: closingSourceData.shares,
    comments: closingSourceData.comments,
    topReactionsCount: closingSourceData.topReactionsCount,
    category: 'Cinema',
    eventType: 'cinema',
    integrityRepair: {
      repairedBy: 'codex-approved-anne-fifa-integrity-repair-2026-09-05',
      reason: 'consolidated_same_occurrence_and_corrected_subvenue',
      mergedSourcePath: anneClosingSource.path,
      officialEvidenceUrl: officialEventUrl,
      preservedEndTimeWithoutChange: anneKeeper.endTime,
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
}

function buildReviewPatch(reviewData) {
  const priorNotes = String(reviewData.notes || '').trim();
  const repairNote =
    'The published recovery was invalidated: promotional run-to-date text and unrelated website hours were not a valid Sep 5 8am-6pm occurrence.';
  return {
    status: 'rejected',
    locationReviewStatus: 'rejected',
    publishedEventId: admin.firestore.FieldValue.delete(),
    publishedEventPath: admin.firestore.FieldValue.delete(),
    invalidPublishedEventId: recoveredEventId,
    invalidPublishedEventPath: recoveredEventPath,
    publishedEventInvalidatedAt: admin.firestore.FieldValue.serverTimestamp(),
    publishedEventInvalidatedBy: 'codex-approved-anne-fifa-integrity-repair-2026-09-05',
    publishedEventInvalidatedReason: 'invalid_promotional_run_recovery_and_unrelated_site_hours',
    resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
    resolvedBy: 'codex-approved-anne-fifa-integrity-repair-2026-09-05',
    notes: priorNotes ? `${priorNotes} ${repairNote}` : repairNote,
    finalization: {
      action: 'reject',
      reason: 'invalid_promotional_run_recovery_and_unrelated_site_hours',
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const serviceAccountPath =
    process.env.GATHR_SERVICE_ACCOUNT_PATH || path.join(__dirname, 'service-account.json');
  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(`Service account file not found: ${serviceAccountPath}`);
  }

  const serviceAccount = requireFromFunctions(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
  const db = admin.firestore();

  const deleteTargets = [fifaTarget, ...anneBadOrDuplicateTargets];
  const [deleteSnapshots, keeperSnapshot, reviewSnapshots] = await Promise.all([
    Promise.all(deleteTargets.map((target) => db.doc(target.path).get())),
    db.doc(anneKeeper.path).get(),
    Promise.all(reviewTargets.map((targetPath) => db.doc(targetPath).get())),
  ]);

  const deleteData = deleteSnapshots.map((snapshot, index) =>
    assertEvent(snapshot, deleteTargets[index])
  );
  const keeperData = assertEvent(keeperSnapshot, anneKeeper);
  const closingSourceData = deleteData[deleteTargets.findIndex((target) => target.path === anneClosingSource.path)];

  const reviewData = reviewSnapshots.map((snapshot, index) => {
    const reviewPath = reviewTargets[index];
    if (!snapshot.exists) throw new Error(`Approved review target is missing: ${reviewPath}`);
    const data = snapshot.data() || {};
    if (String(data.publishedEventId || '').trim() !== recoveredEventId) {
      throw new Error(
        `Approved review target changed: ${reviewPath} no longer points to ${recoveredEventId}`
      );
    }
    if (String(data.publishedEventPath || '').trim() !== recoveredEventPath) {
      throw new Error(
        `Approved review target changed: ${reviewPath} no longer points to ${recoveredEventPath}`
      );
    }
    return data;
  });

  const keeperPatch = buildKeeperPatch(closingSourceData);
  const plan = {
    applied: apply,
    projectId: serviceAccount.project_id,
    deletes: deleteTargets.map((target, index) => compactEvent(target.path, deleteData[index])),
    keeper: {
      before: compactEvent(anneKeeper.path, keeperData),
      preservedEndTimeWithoutChange: keeperData.endTime,
      patch: serialize(keeperPatch),
    },
    reviewUpdates: reviewTargets.map((reviewPath, index) => ({
      path: reviewPath,
      before: serialize(reviewData[index]),
      patch: serialize(buildReviewPatch(reviewData[index])),
    })),
    mediaDeletionCount: 0,
  };

  if (!apply) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  const artifactsDir = path.join(__dirname, 'artifacts');
  fs.mkdirSync(artifactsDir, { recursive: true });
  const runStamp = stamp();
  const backupPath = path.join(
    artifactsDir,
    `anne-fifa-integrity-2026-09-05-prewrite-backup-${runStamp}.json`
  );
  fs.writeFileSync(
    backupPath,
    JSON.stringify({ backedUpAt: new Date().toISOString(), ...plan }, null, 2)
  );

  const batch = db.batch();
  for (const target of deleteTargets) batch.delete(db.doc(target.path));
  batch.set(db.doc(anneKeeper.path), keeperPatch, { merge: true });
  reviewTargets.forEach((reviewPath, index) => {
    batch.set(db.doc(reviewPath), buildReviewPatch(reviewData[index]), { merge: true });
  });
  await batch.commit();

  const [deletedVerification, keeperVerification, reviewVerification] = await Promise.all([
    Promise.all(deleteTargets.map((target) => db.doc(target.path).get())),
    db.doc(anneKeeper.path).get(),
    Promise.all(reviewTargets.map((reviewPath) => db.doc(reviewPath).get())),
  ]);
  const failedDeletes = deletedVerification
    .map((snapshot, index) => ({ path: deleteTargets[index].path, exists: snapshot.exists }))
    .filter((item) => item.exists);
  if (failedDeletes.length > 0) {
    throw new Error(`Delete verification failed: ${failedDeletes.map((item) => item.path).join(', ')}`);
  }
  if (!keeperVerification.exists) throw new Error(`Keeper missing after repair: ${anneKeeper.path}`);
  const repairedKeeper = keeperVerification.data() || {};
  if (
    titleOf(repairedKeeper) !== anneClosingSource.title ||
    repairedKeeper.venueId !== 'slug_sobeyfamilytheatre' ||
    repairedKeeper.startTime !== '19:30' ||
    repairedKeeper.endTime !== anneKeeper.endTime
  ) {
    throw new Error(`Keeper verification failed: ${anneKeeper.path}`);
  }
  const badReviewPointers = reviewVerification.filter((snapshot) => {
    const data = snapshot.data() || {};
    return (
      !snapshot.exists ||
      data.status !== 'rejected' ||
      data.locationReviewStatus !== 'rejected' ||
      data.publishedEventId ||
      data.publishedEventPath ||
      data.invalidPublishedEventId !== recoveredEventId
    );
  });
  if (badReviewPointers.length > 0) {
    throw new Error('One or more city review pointer verifications failed');
  }

  const verification = {
    deleted: deleteTargets.map((target) => ({ path: target.path, existsAfterRepair: false })),
    keeper: compactEvent(anneKeeper.path, repairedKeeper),
    reviews: reviewTargets.map((reviewPath) => ({
      path: reviewPath,
      status: 'rejected',
      publishedEventPointerCleared: true,
    })),
    mediaDeletionCount: 0,
  };
  const reportPath = path.join(
    artifactsDir,
    `anne-fifa-integrity-2026-09-05-repair-report-${runStamp}.json`
  );
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        repairedAt: new Date().toISOString(),
        projectId: serviceAccount.project_id,
        verification,
        backupPath,
      },
      null,
      2
    )
  );

  console.log(JSON.stringify({ verification, backupPath, reportPath }, null, 2));
}

main()
  .then(async () => {
    if (admin.apps.length) await admin.app().delete();
  })
  .catch(async (error) => {
    console.error(error);
    try {
      if (admin.apps.length) await admin.app().delete();
    } catch {}
    process.exit(1);
  });
