#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const admin = require('firebase-admin');

const PROJECT_ID = 'gathr-migrated';
const APPLY = process.argv.includes('--apply');
const SERVICE_ACCOUNT_PATH = process.argv.find((arg) => arg.startsWith('--serviceAccount='))?.split('=').slice(1).join('=')
  || process.env.GATHR_LOCATION_REPAIR_SERVICE_ACCOUNT;
const ARTIFACTS_ROOT = process.argv.find((arg) => arg.startsWith('--artifactsDir='))?.split('=').slice(1).join('=')
  || path.join(__dirname, 'artifacts');

if (!SERVICE_ACCOUNT_PATH) {
  throw new Error('Pass --serviceAccount=<path> or set GATHR_LOCATION_REPAIR_SERVICE_ACCOUNT');
}

const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(SERVICE_ACCOUNT_PATH), 'utf8'));
if (serviceAccount.project_id !== PROJECT_ID) {
  throw new Error(`Credential project must be ${PROJECT_ID}, found ${serviceAccount.project_id || '(missing)'}`);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: PROJECT_ID,
});
const db = admin.firestore();

const TARGETS = [
  {
    path: 'venues/name_n2ivcu/events/yorefUvhJw9BZDz5MpYR',
    title: 'Pastie Party',
    uniqueId: '122188003256910683_508ec813fc21dbf8',
    startDate: '2026-08-11',
    startTime: '20:00',
    address: '119 Grafton St, Charlottetown, PE C1A 1K9, Canada',
    current: { latitude: 46.2374623, longitude: -63.1259052 },
    canonical: { latitude: 46.2349273, longitude: -63.1276278 },
  },
  ...['FocGMlz1FlWP1kN8Nz82', 'LMaxqd80nxHwJu05xD3N', 'kpsRomLmM2EGhMqTQKHW'].map((id, index) => ({
    path: `venues/slug_harbourfronttheatre/events/${id}`,
    title: 'Simply The Best: A Night of Tina Turner',
    uniqueId: [
      '1644507407680223_d26a1eef2bb389e3',
      '1644507407680223_b360cb2ba680ab12',
      '1644507407680223_df5326bd67eaa5de',
    ][index],
    startDate: ['2026-08-22', '2026-08-20', '2026-08-21'][index],
    startTime: '19:30',
    address: '124 Heather Moyse Dr, Summerside, PE C1N 5R1, Canada',
    current: { latitude: 46.3931755, longitude: -63.7688332 },
    canonical: { latitude: 46.3893775, longitude: -63.7857654 },
  })),
];

function text(value) {
  return String(value ?? '').trim();
}

function coordinates(data) {
  const nested = data?.coordinates || {};
  const latitude = Number(data?.latitude ?? nested.latitude ?? nested._latitude);
  const longitude = Number(data?.longitude ?? nested.longitude ?? nested._longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude }
    : null;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`);
  }
}

function assertCoordinates(actual, expected, label) {
  const matches = actual &&
    Math.abs(actual.latitude - expected.latitude) <= 1e-7 &&
    Math.abs(actual.longitude - expected.longitude) <= 1e-7;
  if (!matches) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`);
  }
}

function serialize(value) {
  if (value instanceof admin.firestore.Timestamp) return { __type: 'Timestamp', value: value.toDate().toISOString() };
  if (value instanceof admin.firestore.GeoPoint) return { __type: 'GeoPoint', latitude: value.latitude, longitude: value.longitude };
  if (value instanceof admin.firestore.DocumentReference) return { __type: 'DocumentReference', path: value.path };
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, serialize(nested)]));
  }
  return value;
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function loadAndVerifyTargets() {
  const loaded = [];
  for (const target of TARGETS) {
    const ref = db.doc(target.path);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new Error(`Missing target ${target.path}`);
    const data = snapshot.data();
    assertEqual(text(data.eventName || data.name), target.title, `${target.path} title`);
    assertEqual(text(data.uniqueId), target.uniqueId, `${target.path} uniqueId`);
    assertEqual(text(data.startDate), target.startDate, `${target.path} startDate`);
    assertEqual(text(data.startTime), target.startTime, `${target.path} startTime`);
    assertEqual(text(data.address), target.address, `${target.path} address`);
    assertCoordinates(coordinates(data), target.current, `${target.path} current coordinates`);
    loaded.push({ ...target, ref, snapshot });
  }
  return loaded;
}

async function verifyPostconditions(targets) {
  for (const target of targets) {
    const snapshot = await target.ref.get();
    if (!snapshot.exists) throw new Error(`Postcondition target disappeared: ${target.path}`);
    const data = snapshot.data();
    assertCoordinates(coordinates(data), target.canonical, `${target.path} postcondition coordinates`);
    assertCoordinates(coordinates(data.metadata || {}), target.canonical, `${target.path} metadata coordinates`);
  }
}

async function main() {
  const targets = await loadAndVerifyTargets();
  const runDirectory = path.resolve(
    ARTIFACTS_ROOT,
    `location-coherence-residual-${APPLY ? 'apply' : 'dry-run'}-${timestampSlug()}`
  );
  fs.mkdirSync(runDirectory, { recursive: true });
  const plan = {
    schemaVersion: 1,
    mode: APPLY ? 'apply' : 'dry-run',
    projectId: PROJECT_ID,
    checkedAt: new Date().toISOString(),
    counts: { eventDocuments: targets.length, totalDocuments: targets.length, mediaDeletions: 0 },
    targets: targets.map((target) => ({
      path: target.path,
      title: target.title,
      action: 'replace event and metadata coordinates with canonical parent venue coordinates',
      canonical: target.canonical,
    })),
  };
  const planPath = path.join(runDirectory, 'plan.json');
  fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');

  if (!APPLY) {
    console.log(JSON.stringify({ ...plan, planPath }, null, 2));
    return;
  }

  const backupPath = path.join(runDirectory, 'pre-write-backup.json');
  fs.writeFileSync(backupPath, `${JSON.stringify({
    schemaVersion: 1,
    projectId: PROJECT_ID,
    backedUpAt: new Date().toISOString(),
    documents: targets.map((target) => ({ path: target.path, data: serialize(target.snapshot.data()) })),
  }, null, 2)}\n`, 'utf8');

  const batch = db.batch();
  for (const target of targets) {
    batch.update(target.ref, {
      latitude: target.canonical.latitude,
      longitude: target.canonical.longitude,
      'metadata.latitude': target.canonical.latitude,
      'metadata.longitude': target.canonical.longitude,
      locationIntegrityUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  await verifyPostconditions(targets);

  const resultPath = path.join(runDirectory, 'result.json');
  fs.writeFileSync(resultPath, `${JSON.stringify({ ...plan, appliedAt: new Date().toISOString(), backupPath }, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    mode: 'apply',
    counts: plan.counts,
    backupPath,
    planPath,
    resultPath,
    verifiedDocuments: targets.length,
  }, null, 2));
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
