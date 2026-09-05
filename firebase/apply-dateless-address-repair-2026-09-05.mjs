import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const requireFromFunctions = createRequire(path.join(repoRoot, 'functions', 'package.json'));
const admin = requireFromFunctions('firebase-admin');

const deletions = [
  {
    path: 'venues/slug_confedcentre/events/6hO20kSPXPu28g9Nu0kk',
    title: 'Summer Festival performance (Confederation Centre of the Arts)',
    uniqueId: '1469106161921421_e2983abf97f6290e',
    startDate: '',
  },
  {
    path: 'venues/slug_citycinemachtown/events/YX3q0rQ5x87tsHJqqzD6',
    title: 'Once Upon a Time in a Cinema',
    uniqueId: '1605852361551679_6305074cd2a7bc4d',
    startDate: '',
  },
];

const addressRepairs = [
  {
    path: 'venues/fb_100063673418060/events/d5RqYU1RmRmGl4LGoWlu',
    venuePath: 'venues/fb_100063673418060',
    title: 'Ultimate Fridays',
    uniqueId: '1448131740687692_26',
    oldAddress: '1 Weymouth Street, Charlottetown, PE, Canada, C1A7M8',
    canonicalAddress: '131 Sydney St, Charlottetown, PE C1A 1G5, Canada',
    latitude: 46.2337722,
    longitude: -63.126022199999994,
  },
  {
    path: 'venues/slug_thegahanhouse/events/MMTgx1HwK8E1e7R56hMe',
    venuePath: 'venues/slug_thegahanhouse',
    title: '$6 Beer before 6PM',
    uniqueId: '1483437993823733_45c4bb9a682e88be',
    oldAddress: '1 Weymouth Street, Charlottetown, PE, Canada, C1A7M8',
    canonicalAddress: '126 Sydney St, Charlottetown, PE C1A 1G5, Canada',
    latitude: 46.2334275,
    longitude: -63.1258894,
  },
];

const preservedTestEventPaths = [
  'events/routepreview_runtime_addresses_20260902',
  'events/routepreview_runtime_coordinates_20260902',
  'events/area_corner_street_daze_2026',
];

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

function eventTitle(data) {
  return String(data.eventName || data.name || data.title || '').trim();
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function assertEqual(label, expected, actual) {
  if (String(actual ?? '').trim() !== String(expected ?? '').trim()) {
    throw new Error(`${label} changed: expected ${expected}, received ${actual}`);
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const serviceAccountPath = process.env.GATHR_SERVICE_ACCOUNT_PATH ||
    path.join(__dirname, 'service-account.json');
  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(`Service account file not found: ${serviceAccountPath}`);
  }

  const serviceAccount = requireFromFunctions(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
  const db = admin.firestore();

  const deletionSnapshots = await Promise.all(deletions.map((target) => db.doc(target.path).get()));
  const repairSnapshots = await Promise.all(addressRepairs.map((target) => db.doc(target.path).get()));
  const venueSnapshots = await Promise.all(addressRepairs.map((target) => db.doc(target.venuePath).get()));
  const testSnapshotsBefore = await Promise.all(
    preservedTestEventPaths.map((eventPath) => db.doc(eventPath).get())
  );

  const deletionPlan = [];
  for (let index = 0; index < deletions.length; index += 1) {
    const target = deletions[index];
    const snapshot = deletionSnapshots[index];
    if (!snapshot.exists) throw new Error(`Deletion target is missing: ${target.path}`);
    const data = snapshot.data() || {};
    assertEqual(`${target.path} title`, target.title, eventTitle(data));
    assertEqual(`${target.path} uniqueId`, target.uniqueId, data.uniqueId);
    assertEqual(`${target.path} startDate`, target.startDate, data.startDate);

    const exactFamily = await db.collectionGroup('events').where('uniqueId', '==', target.uniqueId).get();
    const unexpectedPaths = exactFamily.docs
      .map((doc) => doc.ref.path)
      .filter((eventPath) => eventPath !== target.path);
    if (unexpectedPaths.length > 0) {
      throw new Error(`Unexpected exact-source family for ${target.path}: ${unexpectedPaths.join(', ')}`);
    }

    deletionPlan.push({
      action: 'delete',
      path: target.path,
      data: serialize(data),
      exactSourceFamilyPaths: exactFamily.docs.map((doc) => doc.ref.path),
    });
  }

  const addressRepairPlan = [];
  for (let index = 0; index < addressRepairs.length; index += 1) {
    const target = addressRepairs[index];
    const eventSnapshot = repairSnapshots[index];
    const venueSnapshot = venueSnapshots[index];
    if (!eventSnapshot.exists) throw new Error(`Address-repair target is missing: ${target.path}`);
    if (!venueSnapshot.exists) throw new Error(`Canonical venue is missing: ${target.venuePath}`);

    const eventData = eventSnapshot.data() || {};
    const venueData = venueSnapshot.data() || {};
    assertEqual(`${target.path} title`, target.title, eventTitle(eventData));
    assertEqual(`${target.path} uniqueId`, target.uniqueId, eventData.uniqueId);
    assertEqual(`${target.path} old address`, target.oldAddress, eventData.address);
    assertEqual(`${target.venuePath} address`, target.canonicalAddress, venueData.address);
    assertEqual(`${target.venuePath} latitude`, target.latitude, venueData.latitude);
    assertEqual(`${target.venuePath} longitude`, target.longitude, venueData.longitude);

    addressRepairPlan.push({
      action: 'update',
      path: target.path,
      venuePath: target.venuePath,
      before: serialize(eventData),
      canonicalVenue: serialize(venueData),
      update: {
        address: target.canonicalAddress,
        rawAddress: target.canonicalAddress,
        normalizedAddress: target.canonicalAddress,
        addressSource: 'venue',
        addressNormalizationIssues: [],
        latitude: target.latitude,
        longitude: target.longitude,
      },
    });
  }

  const preservedTestEvents = testSnapshotsBefore.map((snapshot, index) => ({
    path: preservedTestEventPaths[index],
    exists: snapshot.exists,
    data: snapshot.exists ? serialize(snapshot.data()) : null,
  }));

  const plan = {
    applied: apply,
    projectId: serviceAccount.project_id,
    deletions: deletionPlan,
    addressRepairs: addressRepairPlan,
    preservedTestEvents,
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
    `dateless-address-repair-2026-09-05-prewrite-backup-${runStamp}.json`
  );
  fs.writeFileSync(
    backupPath,
    JSON.stringify({ backedUpAt: new Date().toISOString(), ...plan }, null, 2)
  );

  const batch = db.batch();
  for (const target of deletions) batch.delete(db.doc(target.path));
  for (const target of addressRepairPlan) {
    batch.update(db.doc(target.path), {
      ...target.update,
      addressUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();

  const deletionVerification = await Promise.all(
    deletions.map(async (target) => ({
      path: target.path,
      existsAfterDelete: (await db.doc(target.path).get()).exists,
    }))
  );
  const addressVerification = await Promise.all(
    addressRepairs.map(async (target) => {
      const snapshot = await db.doc(target.path).get();
      const data = snapshot.data() || {};
      return {
        path: target.path,
        exists: snapshot.exists,
        address: data.address || null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        matchesCanonicalVenue:
          snapshot.exists &&
          data.address === target.canonicalAddress &&
          data.latitude === target.latitude &&
          data.longitude === target.longitude,
      };
    })
  );
  const testSnapshotsAfter = await Promise.all(
    preservedTestEventPaths.map((eventPath) => db.doc(eventPath).get())
  );
  const testEventVerification = testSnapshotsAfter.map((snapshot, index) => ({
    path: preservedTestEventPaths[index],
    existedBefore: testSnapshotsBefore[index].exists,
    existsAfter: snapshot.exists,
    unchanged:
      JSON.stringify(serialize(testSnapshotsBefore[index].data())) ===
      JSON.stringify(serialize(snapshot.data())),
  }));

  if (deletionVerification.some((item) => item.existsAfterDelete)) {
    throw new Error('At least one dateless event still exists after deletion');
  }
  if (addressVerification.some((item) => !item.matchesCanonicalVenue)) {
    throw new Error('At least one event address does not match its canonical venue after repair');
  }
  if (testEventVerification.some((item) => !item.unchanged)) {
    throw new Error('A preserved test event changed unexpectedly');
  }

  const reportPath = path.join(
    artifactsDir,
    `dateless-address-repair-2026-09-05-report-${runStamp}.json`
  );
  const report = {
    appliedAt: new Date().toISOString(),
    projectId: serviceAccount.project_id,
    backupPath,
    deletionVerification,
    addressVerification,
    testEventVerification,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
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
