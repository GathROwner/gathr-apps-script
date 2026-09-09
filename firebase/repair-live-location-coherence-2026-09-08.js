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
const E = (
  id,
  title,
  uniqueId,
  startDate,
  endDate,
  startTime,
  endTime,
  isRecurring,
  recurringPattern,
  currentCoordinates
) => ({
  id,
  title,
  uniqueId,
  startDate,
  endDate,
  startTime,
  endTime,
  isRecurring,
  recurringPattern,
  currentCoordinates,
});

const REPAIR_GROUPS = [
  {
    venueId: 'slug_downtowncharlottetowninc',
    expectedVenue: {
      name: 'Port Charlottetown',
      address: '1 Weymouth St, Charlottetown, PE C1A 8W1',
      googlePlaceId: 'ChIJh1-byW9TXksRZDnqfg3-OO0',
      currentCoordinates: C(46.233726, -63.11874),
    },
    canonical: C(46.233726, -63.11874),
    canonicalGooglePlaceId: 'ChIJh1-byW9TXksRZDnqfg3-OO0',
    events: [
      E('ZUNtGCw9MZj77yrxjEz0', 'Inside Island History', '1490143686486497_f10d5e5b12c702dc', '2026-07-30', '2026-07-30', '08:00', '18:00', true, 'weekly_thursday', C(46.2368332, -63.1273142)),
      E('qOejo1XReN3Y25yJFsxy', 'Bootleggers and Barbacks Tour (NEW TOUR!)', '1490143686486497_d4e20fb7e9d9c334', '2026-07-31', '2026-07-31', '08:00', '18:00', true, 'weekly_friday', C(46.2368332, -63.1273142)),
    ],
  },
  {
    venueId: 'slug_eastlinkctrpei',
    expectedVenue: {
      name: 'Eastlink Centre Charlottetown',
      address: '46 Kensington Road, Charlottetown, PE C1A 5H7, Canada',
      googlePlaceId: 'ChIJVWSVqHK6X0sR1lrS8Xbhp4c',
      currentCoordinates: C(46.2458204, -63.1171685),
    },
    canonical: C(46.245193, -63.1174029),
    canonicalGooglePlaceId: 'ChIJA2j5SepSXksRES-s4ia-a3U',
    clearStalePlaceMetadata: true,
    events: [
      E('V9h9fm8AARI7fDIrwGtE', 'The Princess Proms Concert', '1622837136033303_3734c6208fb74b61', '2026-12-18', '2026-12-19', '16:45', '01:00', false, 'none', C(46.4091112, -63.3481532)),
      E('fb_ka99de', 'Scotties Tournament of Hearts', null, '2027-02-12', '2027-02-12', '11:00', '13:00', false, 'none', null),
    ],
  },
  {
    venueId: 'slug_harbourfronttheatre',
    expectedVenue: {
      name: 'Harbourfront Theatre',
      address: '124 Heather Moyse Dr, Summerside, PE C1N 5R1, Canada',
      googlePlaceId: 'ChIJlZ8JEd-aX0sRDlbOMHZxD5k',
      currentCoordinates: C(46.3931755, -63.7688332),
    },
    canonical: C(46.3893775, -63.7857654),
    canonicalGooglePlaceId: 'ChIJL0PeFysJqkERLvnvRoLi0CI',
    clearStalePlaceMetadata: true,
    events: [
      E('3Gd5ys6DYH5jSrMJmVHL', 'John McDermott: To Remember, To Give Back', '1589531286511169_1', '2026-10-14', '2026-10-15', '19:30', '01:00', false, 'none', null),
      E('6A3lU6TA2zO4QdsgA6Uh', 'Fascinating Ladies of Country', '1681473777316919_3441ab798d30905c', '2026-09-13', '2026-09-13', '14:00', '01:00', false, 'none', C(46.3931755, -63.7688332)),
      E('6o8RijhtKIRDUiOXOAr5', 'Harbourfront Ticket Trunk (2026)', '1655715553226075_8369b98b011cba6e', '2027-12-20', '2027-12-20', '12:00', '23:00', true, 'weekly_monday', C(46.3931755, -63.7688332)),
      E('7CcZEuIPZyngYOn7nhWz', 'Don Ross & Julie Malía', '1620605846737046_a2f505d5ad89625b', '2026-10-02', '2026-10-02', '20:00', '23:00', false, 'none', C(46.3931755, -63.7688332)),
      E('99MfKWXxKwjUcXaGoUwD', 'Solitary Man: Celebrating the Music of Neil Diamond', '1668455138618783_d6db064b8a816122', '2027-11-05', '2027-11-06', '19:30', '01:00', false, 'none', C(46.3931755, -63.7688332)),
      E('Aoz65RDFaa33GKmUIo4Y', 'YESTERDAY: The Magic of the Beatles', '1642708217860142_3252878e04b8df93', '2026-07-17', '2027-07-07', '19:30', '23:00', false, 'none', C(46.3931755, -63.7688332)),
      E('C6vLzm0ObLCW0xDaF6uS', 'Frozen In Time', '1679100147554282_6bbbf266fdff7c2d', '2026-10-11', '2026-10-12', '11:00', '01:00', false, 'none', C(46.3931755, -63.7688332)),
      E('K2BiuhLadmfHHHHmPZvt', 'Big Love: The Music of Fleetwood Mac', '1680144204116543_e0e27da1db880857', '2026-09-18', '2026-09-19', '19:30', '01:00', false, 'none', C(46.3931755, -63.7688332)),
      E('MZmtxhkpZK7AgXGjYaNu', 'Jason Cyrus LIVE: Beyond Limits', '1539420371522261_1', '2026-10-23', '2026-10-23', '19:00', '23:00', false, 'none', null),
      E('VrnKkyh5XItklOroK1AS', 'Harbourfront Ticket Trunk Draw', '1586999770097654_1', '2026-12-30', '2026-12-30', '12:00', '23:00', false, 'none', C(46.3931755, -63.7688332)),
      E('XaK8cL12Jj3iCRuZVdFK', 'FLASHBACK', '1615785173885780_2', '2026-10-30', '2026-10-31', '19:00', '01:00', false, 'none', C(46.3931755, -63.7688332)),
      E('ZEvdnm7UJYIuzjmwgtrK', 'Big Love: The Music of Fleetwood Mac', '1759364482319843_ebd6bcc87e0f968f', '2026-09-19', '2026-09-20', '19:30', '01:00', false, 'none', C(46.3931755, -63.7688332)),
      E('ZkS8Phlj91qG5j25B89I', 'Harbour Filmworks: Tuner', '1674440598020237_0a259c35b796e6a9', '2026-09-14', '2026-09-14', '19:00', '23:00', false, 'none', C(46.3931755, -63.7688332)),
      E('erxGb85hhHSvrhUusBTU', 'Ballet Jörgen: Swan Lake', '1574380694692895_1', '2027-04-21', '2027-04-21', '19:30', '21:30', false, 'none', null),
      E('fb_e23043a94d83', 'Tour for the Cure: Celebrating the Music of the Tragically Hip', '1490762459721386_fb_e23043a94d83', '2026-10-01', '2026-10-01', '19:30', '21:30', false, 'none', C(46.3893775, -63.7857654)),
      E('fb_k7iq8d', 'SOS - The ABBA Experience', null, '2026-09-20', '2026-09-21', '19:30', '02:00', true, 'weekly_sunday', C(46.3931755, -63.7688332)),
      E('jUAm3YRSCStNYR7zKshG', 'Big Love: The Music of Fleetwood Mac', '1759364482319843_abe64dda9169816b', '2026-09-18', '2026-09-19', '19:30', '01:00', false, 'none', C(46.3931755, -63.7688332)),
      E('rzII6bJ9MSQMWTit6QcB', 'Big Love: The Music of Fleetwood Mac', '1680144204116543_7ae79eaa10754f6f', '2026-09-19', '2026-09-20', '19:30', '01:00', false, 'none', C(46.3931755, -63.7688332)),
      E('t5PhPt4FAFlenPtauh7P', 'Jeff Leeson: Only Gonna Say This Once Comedy Tour', '1559067842890847_1', '2026-11-21', '2026-11-21', '19:30', '23:00', false, 'none', null),
      E('xQv9wbyZS62MaEt2GHj6', 'FLASHBACK', '1615785173885780_1', '2026-10-13', '2026-10-14', '19:00', '01:00', false, 'none', C(46.3931755, -63.7688332)),
      E('xmjXPZMOVxyK3SfI55HA', 'Relive the Music 50s, 60s & 70s Show', '1585054496958848_1', '2026-10-19', '2026-10-19', '19:00', '22:00', false, 'none', null),
    ],
  },
  {
    venueId: 'name_n2ivcu',
    expectedVenue: {
      name: 'Be You',
      address: '119 Grafton St, Charlottetown, PE C1A 1K9, Canada',
      googlePlaceId: 'ChIJ5TVlqOhTXksR01SAZwKHWKY',
      currentCoordinates: C(46.2374623, -63.1259052),
    },
    canonical: C(46.2349273, -63.1276278),
    canonicalGooglePlaceId: 'ChIJ0f0dHwBTXksRR9-84rb9GeE',
    clearStalePlaceMetadata: true,
    events: [
      E('8Pkq5tB6mqFvoRKxYZoR', 'Broadway Babes Night', '122190316298910683_08f24738104300dc', '2026-07-28', '2026-07-29', '08:00', '01:00', true, 'weekly_tuesday', C(46.2374623, -63.1259052)),
      E('NjuXs9pBfz4ZTbhDw54J', 'Weekend Dance Party - Music with DJ BraedenV (Friday)', '122197822010910683_a9051e436bbf58b2', '2026-09-04', '2026-09-05', '22:00', '02:00', true, 'weekly_custom', C(46.2374623, -63.1259052)),
      E('Uo0EN3ofQfIFbxcYRYwy', 'Karaoke Night ✨', '1563147748686067_1', '2026-05-27', '2026-05-28', '20:00', '00:00', true, 'weekly_wednesday', C(46.2374623, -63.1259052)),
      E('die8a6jnD5WyBRTfCtMK', 'Tarot Fridays', '122187166232910683_522e19fbc8183880', '2026-07-03', '2026-07-03', '18:00', '23:00', true, 'weekly_friday', C(46.2374623, -63.1259052)),
      E('snVmgBVe7KuzQWvZ6grM', 'Ladies & Femmes Night + Confessions', '2823878034640926_1', '2026-06-12', '2026-06-12', '20:00', '23:00', true, 'weekly_friday', C(46.2374623, -63.1259052)),
    ],
  },
  {
    venueId: 'slug_thecorkandcast',
    expectedVenue: {
      name: 'Delta Hotels by Marriott Prince Edward | Charlottetown PE',
      address: '18 Queen St, Charlottetown, PE C1A 4A1, Canada',
      googlePlaceId: 'ChIJafTyeuJSXksRfB4nqjM1eRc',
      currentCoordinates: C(41.9087566, -87.6604734),
    },
    canonical: C(46.2319063, -63.1243515),
    canonicalGooglePlaceId: 'ChIJafTyeuJSXksRfB4nqjM1eRc',
    events: [
      E('P6FVV7ArPYgkTY4zPvJ1', 'P.E.I.’s Battle for Recovery (Charlottetown)', '1681016873012934_1', '2027-04-03', '2027-04-03', '10:00', '17:00', false, 'none', C(41.9087566, -87.6604734)),
    ],
  },
];

function text(value) {
  return String(value ?? '').trim();
}

function eventTitle(data) {
  return text(data.eventName || data.name);
}

function recurringBoolean(value) {
  if (value === true || text(value).toLowerCase() === 'yes') return true;
  if (value === false || text(value).toLowerCase() === 'no') return false;
  return undefined;
}

function coordinateValue(value) {
  if (value === undefined || value === null || text(value) === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function coordinates(data) {
  const nested = data?.coordinates || {};
  const latitude = coordinateValue(data?.latitude ?? nested.latitude ?? nested._latitude);
  const longitude = coordinateValue(data?.longitude ?? nested.longitude ?? nested._longitude);
  return latitude === undefined || longitude === undefined ? null : { latitude, longitude };
}

function coordinatesEqual(actual, expected, tolerance = 1e-7) {
  if (actual === null || expected === null) return actual === expected;
  return Math.abs(actual.latitude - expected.latitude) <= tolerance &&
    Math.abs(actual.longitude - expected.longitude) <= tolerance;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`);
  }
}

function assertCoordinates(actual, expected, label) {
  if (!coordinatesEqual(actual, expected)) {
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
      assertEqual(eventTitle(event), expected.title, `${eventRef.path} title`);
      assertEqual(text(event.uniqueId) || null, expected.uniqueId, `${eventRef.path} uniqueId`);
      assertEqual(text(event.startDate), expected.startDate, `${eventRef.path} startDate`);
      assertEqual(text(event.endDate), expected.endDate, `${eventRef.path} endDate`);
      assertEqual(text(event.startTime), expected.startTime, `${eventRef.path} startTime`);
      assertEqual(text(event.endTime), expected.endTime, `${eventRef.path} endTime`);
      assertEqual(recurringBoolean(event.isRecurring), expected.isRecurring, `${eventRef.path} isRecurring`);
      assertEqual(text(event.recurringPattern), expected.recurringPattern, `${eventRef.path} recurringPattern`);
      assertEqual(text(event.address), group.expectedVenue.address === '1 Weymouth St, Charlottetown, PE C1A 8W1'
        ? '1 Weymouth Street, Charlottetown, PE C1A 7M8, Canada'
        : group.expectedVenue.address, `${eventRef.path} address`);
      assertCoordinates(coordinates(event), expected.currentCoordinates, `${eventRef.path} coordinates`);
      targets.push({ kind: 'event', ref: eventRef, snapshot: eventSnapshot, group, expected });
    }
  }
  return targets;
}

function targetPlan(target) {
  if (target.kind === 'venue') {
    return {
      path: target.ref.path,
      kind: target.kind,
      action: 'synchronize canonical coordinates and Google Place identity',
      canonical: target.group.canonical,
      canonicalGooglePlaceId: target.group.canonicalGooglePlaceId,
      clearStalePlaceMetadata: target.group.clearStalePlaceMetadata === true,
    };
  }
  return {
    path: target.ref.path,
    kind: target.kind,
    title: target.expected.title,
    action: 'replace event and metadata coordinates with canonical parent venue coordinates',
    canonical: target.group.canonical,
  };
}

async function verifyPostconditions(targets) {
  const results = [];
  for (const target of targets) {
    const snapshot = await target.ref.get();
    if (!snapshot.exists) throw new Error(`Postcondition target disappeared: ${target.ref.path}`);
    const data = snapshot.data();
    assertCoordinates(coordinates(data), target.group.canonical, `${target.ref.path} postcondition coordinates`);
    if (target.kind === 'venue') {
      assertEqual(text(data.googlePlaceId), target.group.canonicalGooglePlaceId, `${target.ref.path} postcondition googlePlaceId`);
      assertCoordinates(coordinates({ coordinates: data.coordinates }), target.group.canonical, `${target.ref.path} nested coordinates`);
    }
    if (target.kind === 'event') {
      assertCoordinates(coordinates(data.metadata || {}), target.group.canonical, `${target.ref.path} metadata coordinates`);
    }
    results.push({ path: target.ref.path, verified: true });
  }
  return results;
}

async function main() {
  const targets = await loadAndVerifyTargets();
  const runDirectory = path.resolve(ARTIFACTS_ROOT, `location-coherence-${APPLY ? 'apply' : 'dry-run'}-${timestampSlug()}`);
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
    targets: targets.map(targetPlan),
  };
  const planPath = path.join(runDirectory, 'plan.json');
  fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');

  if (!APPLY) {
    console.log(JSON.stringify({ ...plan, planPath }, null, 2));
    return;
  }

  const backup = {
    schemaVersion: 1,
    projectId: PROJECT_ID,
    backedUpAt: new Date().toISOString(),
    documents: targets.map((target) => ({
      path: target.ref.path,
      data: serialize(target.snapshot.data()),
    })),
  };
  const backupPath = path.join(runDirectory, 'pre-write-backup.json');
  fs.writeFileSync(backupPath, `${JSON.stringify(backup, null, 2)}\n`, 'utf8');

  const batch = db.batch();
  for (const target of targets) {
    const canonical = target.group.canonical;
    if (target.kind === 'venue') {
      const update = {
        latitude: canonical.latitude,
        longitude: canonical.longitude,
        coordinates: canonical,
        googlePlaceId: target.group.canonicalGooglePlaceId,
        locationIntegrityUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (target.group.clearStalePlaceMetadata) {
        update.operatingHours = admin.firestore.FieldValue.delete();
        update.operatingHoursUpdatedAt = admin.firestore.FieldValue.delete();
        update.googlePlaceTypes = admin.firestore.FieldValue.delete();
        update.googleBusinessStatus = admin.firestore.FieldValue.delete();
        update.googleRating = admin.firestore.FieldValue.delete();
        update.googleUserRatingsTotal = admin.firestore.FieldValue.delete();
      }
      batch.update(target.ref, update);
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

  const verification = await verifyPostconditions(targets);
  const result = {
    ...plan,
    appliedAt: new Date().toISOString(),
    backupPath,
    planPath,
    verification,
  };
  const resultPath = path.join(runDirectory, 'result.json');
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    mode: 'apply',
    counts: plan.counts,
    backupPath,
    planPath,
    resultPath,
    verifiedDocuments: verification.length,
  }, null, 2));
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
