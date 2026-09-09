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

const C = (latitude, longitude) => ({ latitude, longitude });
const E = (id, title, uniqueId, startDate, startTime, address, currentCoordinates) => ({
  id,
  title,
  uniqueId,
  startDate,
  startTime,
  address,
  currentCoordinates,
});

const REPAIR_GROUPS = [
  {
    venueId: 'slug_charlottetownlibrarylearningcentre',
    expectedVenue: {
      name: 'Charlottetown Library Learning Centre',
      address: 'Dominion Building, 97 Queen St, Charlottetown, PE C1A 4A9',
      googlePlaceId: 'ChIJVWSVqHK6X0sR1lrS8Xbhp4c',
      currentCoordinates: C(46.4091112, -63.3481532),
    },
    canonical: C(46.2332239, -63.1269955),
    canonicalGooglePlaceId: 'ChIJkekco-FSXksRVgftLb_nfCs',
    events: [
      E('4VZBIB4X0j2dlqFEaz3k', 'Community Engagement: Remembering The Bog (Charlottetown)', '1478635457634549_01b1c5d416448a03', '2026-09-17', '18:00', 'Dominion Building, 97 Queen St, Charlottetown, PE C1A 4A9', C(46.4091112, -63.3481532)),
      E('EnXmAffzgWhKKNc0KYGl', 'Artmobile', '1396379042677766_831e31c2fc89822f', '2026-09-16', '17:00', 'Dominion Building, 97 Queen St, Charlottetown, PE C1A 4A9', C(46.4091112, -63.3481532)),
      E('NI05F5tmGgLDVINN2nmg', 'ENCHANTED: A Book Lovers Ball (City of Starlight)', '1361147709534233_c9a7bf65ed1b875e', '2026-10-03', '19:30', 'Dominion Building, 97 Queen St, Charlottetown, PE C1A 4A9', C(46.4091112, -63.3481532)),
      E('NYvySqDO5pZnYSCqVtaw', 'Fruit Kebabs', '1397259349256402_d7e0091204e14907', '2026-09-08', '15:30', 'Dominion Building, 97 Queen St, Charlottetown, PE C1A 4A9', C(46.4091112, -63.3481532)),
      E('qW9FUgW70abfUH3G2Sek', 'Late Night Artisan Market (open to public)', '1085151360985766_3bea9c5e18fbbd7f', '2026-10-03', '17:00', 'Dominion Building, 97 Queen St, Charlottetown, PE C1A 4A9', C(46.4091112, -63.3481532)),
    ],
  },
  {
    venueId: 'slug_loneoakbeergardencavendish',
    expectedVenue: {
      name: 'Lone Oak Beer Garden Cavendish',
      address: '37 Forest Hills Ln, New Glasgow, PE C0A 1N0, Canada',
      googlePlaceId: 'ChIJ0xxuhjitX0sRzw6WnCECYj4',
      currentCoordinates: C(46.2587209, -63.1814155),
    },
    canonical: C(46.4872428, -63.3922184),
    canonicalGooglePlaceId: 'ChIJGUK1owG_X0sRX4IPEb5WizY',
    events: [
      E('4tv2KoqTAB2Lt4cXmtdy', 'Live Music featuring Main Street Bullies', '1540202334813575_962d1b5e0c17054b', '2026-09-10', '19:00', '37 Forest Hills Ln, New Glasgow, PE C0A 1N0, Canada', C(46.2587209, -63.1814155)),
      E('NemzdCM6dI0zi5u10quK', '$6 Pints & Shots', '1540202334813575_7d5a10e77ed2460a', '2026-09-10', '11:00', '37 Forest Hills Ln, New Glasgow, PE C0A 1N0, Canada', C(46.2587209, -63.1814155)),
    ],
  },
  {
    venueId: 'slug_theoakdowntown',
    expectedVenue: {
      name: 'The Oak Downtown',
      address: '156 Great George St, Charlottetown, PE, Canada',
      googlePlaceId: 'ChIJtRjky-BSXksRCBnnqdQw9Y0',
      currentCoordinates: C(46.236496, -63.1274546),
    },
    canonical: C(46.2364827, -63.1276714),
    canonicalGooglePlaceId: 'ChIJfYOaWgBTXksRCSFPJdyQ930',
    events: [],
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
  const targets = [];
  for (const group of REPAIR_GROUPS) {
    const venueRef = db.doc(`venues/${group.venueId}`);
    const venueSnapshot = await venueRef.get();
    if (!venueSnapshot.exists) throw new Error(`Missing target ${venueRef.path}`);
    const venue = venueSnapshot.data();
    assertEqual(text(venue.name), group.expectedVenue.name, `${venueRef.path} name`);
    assertEqual(text(venue.address), group.expectedVenue.address, `${venueRef.path} address`);
    assertEqual(text(venue.googlePlaceId), group.expectedVenue.googlePlaceId, `${venueRef.path} googlePlaceId`);
    assertCoordinates(coordinates(venue), group.expectedVenue.currentCoordinates, `${venueRef.path} coordinates`);
    targets.push({ kind: 'venue', ref: venueRef, snapshot: venueSnapshot, group });

    for (const expected of group.events) {
      const eventRef = venueRef.collection('events').doc(expected.id);
      const eventSnapshot = await eventRef.get();
      if (!eventSnapshot.exists) throw new Error(`Missing target ${eventRef.path}`);
      const event = eventSnapshot.data();
      assertEqual(text(event.eventName || event.name), expected.title, `${eventRef.path} title`);
      assertEqual(text(event.uniqueId), expected.uniqueId, `${eventRef.path} uniqueId`);
      assertEqual(text(event.startDate), expected.startDate, `${eventRef.path} startDate`);
      assertEqual(text(event.startTime), expected.startTime, `${eventRef.path} startTime`);
      assertEqual(text(event.address), expected.address, `${eventRef.path} address`);
      assertCoordinates(coordinates(event), expected.currentCoordinates, `${eventRef.path} coordinates`);
      targets.push({ kind: 'event', ref: eventRef, snapshot: eventSnapshot, group, expected });
    }
  }
  return targets;
}

async function verifyPostconditions(targets) {
  for (const target of targets) {
    const snapshot = await target.ref.get();
    if (!snapshot.exists) throw new Error(`Postcondition target disappeared: ${target.ref.path}`);
    const data = snapshot.data();
    assertCoordinates(coordinates(data), target.group.canonical, `${target.ref.path} postcondition coordinates`);
    if (target.kind === 'venue') {
      assertEqual(text(data.googlePlaceId), target.group.canonicalGooglePlaceId, `${target.ref.path} postcondition googlePlaceId`);
      assertCoordinates(coordinates({ coordinates: data.coordinates }), target.group.canonical, `${target.ref.path} nested coordinates`);
    } else {
      assertCoordinates(coordinates(data.metadata || {}), target.group.canonical, `${target.ref.path} metadata coordinates`);
    }
  }
}

async function main() {
  const targets = await loadAndVerifyTargets();
  const runDirectory = path.resolve(
    ARTIFACTS_ROOT,
    `duplicate-place-identity-${APPLY ? 'apply' : 'dry-run'}-${timestampSlug()}`
  );
  fs.mkdirSync(runDirectory, { recursive: true });
  const plan = {
    schemaVersion: 1,
    mode: APPLY ? 'apply' : 'dry-run',
    projectId: PROJECT_ID,
    checkedAt: new Date().toISOString(),
    counts: {
      venueDocuments: targets.filter((target) => target.kind === 'venue').length,
      eventDocuments: targets.filter((target) => target.kind === 'event').length,
      totalDocuments: targets.length,
      mediaDeletions: 0,
    },
    targets: targets.map((target) => ({
      path: target.ref.path,
      kind: target.kind,
      title: target.kind === 'event' ? target.expected.title : undefined,
      action: target.kind === 'venue'
        ? 'replace duplicated Google Place identity and synchronize canonical coordinates'
        : 'replace event and metadata coordinates with canonical parent venue coordinates',
      canonical: target.group.canonical,
      canonicalGooglePlaceId: target.kind === 'venue' ? target.group.canonicalGooglePlaceId : undefined,
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
    const canonical = target.group.canonical;
    if (target.kind === 'venue') {
      batch.update(target.ref, {
        latitude: canonical.latitude,
        longitude: canonical.longitude,
        coordinates: canonical,
        googlePlaceId: target.group.canonicalGooglePlaceId,
        operatingHours: admin.firestore.FieldValue.delete(),
        operatingHoursUpdatedAt: admin.firestore.FieldValue.delete(),
        googlePlaceTypes: admin.firestore.FieldValue.delete(),
        googleBusinessStatus: admin.firestore.FieldValue.delete(),
        googleRating: admin.firestore.FieldValue.delete(),
        googleUserRatingsTotal: admin.firestore.FieldValue.delete(),
        locationIntegrityUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      batch.update(target.ref, {
        latitude: canonical.latitude,
        longitude: canonical.longitude,
        'metadata.latitude': canonical.latitude,
        'metadata.longitude': canonical.longitude,
        locationIntegrityUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
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
