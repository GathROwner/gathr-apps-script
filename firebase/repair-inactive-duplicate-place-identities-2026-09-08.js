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

admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: PROJECT_ID });
const db = admin.firestore();
const C = (latitude, longitude) => ({ latitude, longitude });

const TARGETS = [
  {
    venueId: 'slug_cardiganballfields',
    name: 'Cardigan Ball Fields',
    address: '4364 Chapel Rd, Three Rivers, PE C0A, Canada',
    currentPlaceId: 'ChIJ_9YYL8ZuXksRlS3-nsFGRJo',
    current: C(46.2331235, -62.6172627),
    canonicalPlaceId: 'ChIJc410zk1rXksR2saHGTkJnTA',
    canonical: C(46.23875, -62.620918),
  },
  {
    venueId: 'slug_pointseastcoastaldrive',
    name: 'Points East Coastal Drive',
    address: "1915 Rte 2, St Peter's Bay, PE C0A 2A0, Canada",
    currentPlaceId: 'ChIJ_9YYL8ZuXksRlS3-nsFGRJo',
    current: C(46.2331235, -62.6172627),
    clearUnverifiedLocation: true,
  },
  {
    venueId: 'slug_watersedgerestaurantpei',
    name: "Water's Edge",
    address: '1525 Boston Post Rd, Westbrook, CT 06498, United States',
    currentPlaceId: 'ChIJ_TUMFOJSXksRu3pFVjv941Q',
    current: C(46.2312831, -63.123627),
    canonicalPlaceId: 'ChIJYR8j4JIj5okRKyozwHJmxv0',
    canonical: C(41.2796505, -72.4373407),
  },
  {
    venueId: 'slug_bogsidebrewco',
    name: 'Bogside Brewing',
    address: '11 Brook St, Montague, PE C0A 1R0, Canada',
    currentPlaceId: 'ChIJlcoBmmNoXksRZZoCEnL0dfg',
    current: C(46.1635047, -62.6470558),
    canonicalPlaceId: 'ChIJy8hg91NpXksR2AVdb0H8ZzU',
    canonical: C(46.1665498, -62.6473772),
  },
  {
    venueId: 'slug_rochfordsquare',
    name: 'Rochford Square',
    address: 'Rochford Square, Charlottetown, PE, Canada',
    currentPlaceId: 'ChIJc54zqFxTXksRaWpLd6236Gw',
    current: C(46.2361255, -63.1272596),
    clearUnverifiedLocation: true,
  },
  {
    venueId: 'tqkqD2DAJbioute8QMbJ',
    name: 'Victoria Park',
    address: 'Victoria Park, Victoria Park Boardwalk, Charlottetown, PE C1A 8T6, Canada',
    currentPlaceId: 'ChIJGVR6GwBTXksROcK8QiEsel0',
    current: C(46.232194, -63.1255709),
    canonicalPlaceId: 'ChIJj0xGLyJTXksRCXvT9DQ4tlE',
    canonical: C(46.2292321, -63.1406457),
  },
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
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`);
}

function assertCoordinates(actual, expected, label) {
  const matches = actual && expected &&
    Math.abs(actual.latitude - expected.latitude) <= 1e-7 &&
    Math.abs(actual.longitude - expected.longitude) <= 1e-7;
  if (!matches) throw new Error(`${label}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`);
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
    const ref = db.doc(`venues/${target.venueId}`);
    const [snapshot, eventsSnapshot] = await Promise.all([ref.get(), ref.collection('events').get()]);
    if (!snapshot.exists) throw new Error(`Missing target ${ref.path}`);
    if (!eventsSnapshot.empty) throw new Error(`${ref.path}: expected no stored events, found ${eventsSnapshot.size}`);
    const data = snapshot.data();
    assertEqual(text(data.name), target.name, `${ref.path} name`);
    assertEqual(text(data.address), target.address, `${ref.path} address`);
    assertEqual(text(data.googlePlaceId), target.currentPlaceId, `${ref.path} googlePlaceId`);
    assertCoordinates(coordinates(data), target.current, `${ref.path} current coordinates`);
    loaded.push({ ...target, ref, snapshot });
  }
  return loaded;
}

async function verifyPostconditions(targets) {
  for (const target of targets) {
    const snapshot = await target.ref.get();
    if (!snapshot.exists) throw new Error(`Postcondition target disappeared: ${target.ref.path}`);
    const data = snapshot.data();
    if (target.clearUnverifiedLocation) {
      assertEqual(text(data.googlePlaceId), '', `${target.ref.path} cleared googlePlaceId`);
      assertEqual(coordinates(data), null, `${target.ref.path} cleared coordinates`);
    } else {
      assertEqual(text(data.googlePlaceId), target.canonicalPlaceId, `${target.ref.path} canonical googlePlaceId`);
      assertCoordinates(coordinates(data), target.canonical, `${target.ref.path} canonical coordinates`);
      assertCoordinates(coordinates({ coordinates: data.coordinates }), target.canonical, `${target.ref.path} nested coordinates`);
    }
  }
}

async function main() {
  const targets = await loadAndVerifyTargets();
  const runDirectory = path.resolve(
    ARTIFACTS_ROOT,
    `inactive-duplicate-place-identity-${APPLY ? 'apply' : 'dry-run'}-${timestampSlug()}`
  );
  fs.mkdirSync(runDirectory, { recursive: true });
  const plan = {
    schemaVersion: 1,
    mode: APPLY ? 'apply' : 'dry-run',
    projectId: PROJECT_ID,
    checkedAt: new Date().toISOString(),
    counts: {
      venueDocuments: targets.length,
      canonicalReplacements: targets.filter((target) => !target.clearUnverifiedLocation).length,
      clearedUnverifiedLocations: targets.filter((target) => target.clearUnverifiedLocation).length,
      eventDocuments: 0,
      totalDocuments: targets.length,
      mediaDeletions: 0,
    },
    targets: targets.map((target) => ({
      path: target.ref.path,
      action: target.clearUnverifiedLocation
        ? 'clear a confirmed-wrong Place identity and coordinates when no canonical Place match is verified'
        : 'replace duplicated Google Place identity and synchronize canonical coordinates',
      canonical: target.canonical || null,
      canonicalGooglePlaceId: target.canonicalPlaceId || null,
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
    documents: targets.map((target) => ({ path: target.ref.path, data: serialize(target.snapshot.data()) })),
  }, null, 2)}\n`, 'utf8');

  const batch = db.batch();
  for (const target of targets) {
    const update = target.clearUnverifiedLocation
      ? {
          googlePlaceId: admin.firestore.FieldValue.delete(),
          latitude: admin.firestore.FieldValue.delete(),
          longitude: admin.firestore.FieldValue.delete(),
          coordinates: admin.firestore.FieldValue.delete(),
        }
      : {
          googlePlaceId: target.canonicalPlaceId,
          latitude: target.canonical.latitude,
          longitude: target.canonical.longitude,
          coordinates: target.canonical,
        };
    batch.update(target.ref, {
      ...update,
      operatingHours: admin.firestore.FieldValue.delete(),
      operatingHoursUpdatedAt: admin.firestore.FieldValue.delete(),
      googlePlaceTypes: admin.firestore.FieldValue.delete(),
      googleBusinessStatus: admin.firestore.FieldValue.delete(),
      googleRating: admin.firestore.FieldValue.delete(),
      googleUserRatingsTotal: admin.firestore.FieldValue.delete(),
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
