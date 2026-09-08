'use strict';

/**
 * Guarded repair for the Downtown Charlottetown schedule that was stored under
 * Port Charlottetown after inherited page/address identity won venue routing.
 *
 * Usage:
 *   node repair-downtown-charlottetown-schedule-routing-2026-09-08.js
 *   node repair-downtown-charlottetown-schedule-routing-2026-09-08.js \
 *     --apply --approved-plan-sha256=<sha256 printed by the dry run>
 *
 * The default is a read-only dry run. Apply also requires the exact digest
 * emitted by a prior dry run; that digest covers complete venue/snapshot state,
 * destination non-existence, and every event's title/source/date/time tuple.
 *
 * Credential lookup:
 *   GATHR_DOWNTOWN_SCHEDULE_REPAIR_SERVICE_ACCOUNT must be an absolute path.
 *   If it is unset, this script may use the existing main-checkout credential
 *   at the absolute fallback below. No credential contents belong in source.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const PROJECT_ID = 'gathr-migrated';
const REPAIR_ID = 'downtown_schedule_routing_20260908_v1';
const PARSER_WEAKNESS_ID = 'PQ-024';
const SERVICE_ACCOUNT_ENV = 'GATHR_DOWNTOWN_SCHEDULE_REPAIR_SERVICE_ACCOUNT';
const SAFE_FALLBACK_SERVICE_ACCOUNT_PATH =
  'C:\\Users\\craig\\Dev\\gathr-apps-script\\firebase\\service-account.json';
const SOURCE_VENUE_ID = 'slug_downtowncharlottetowninc';
const SOURCE_VENUE_PATH = `venues/${SOURCE_VENUE_ID}`;
const SOURCE_SNAPSHOT_PATH =
  'parse_snapshots/1-a9VEyfhjX1K4PlLQ9VheZtpDHy1I0Px_263_1788874739941';
const APPROVED_SOURCE_ROOTS = Object.freeze([
  '1527747079392824',
  '1528646882636177',
  '1528672282633637',
]);
const AUDIT_PATH = `event_update_audits/${REPAIR_ID}`;
const RUN_STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const ARTIFACT_DIR = path.join(__dirname, 'artifacts');
const BACKUP_PATH = path.join(
  ARTIFACT_DIR,
  `downtown-schedule-routing-prewrite-backup-${RUN_STAMP}.json`
);
const RESULT_PATH = path.join(
  ARTIFACT_DIR,
  `downtown-schedule-routing-result-${RUN_STAMP}.json`
);
const APPLY = process.argv.includes('--apply');
const APPROVED_PLAN_SHA256 = argumentValue('--approved-plan-sha256');

const PORT_BEFORE = Object.freeze({
  name: 'Port Charlottetown',
  normalizedName: 'port charlottetown',
  pagenameSlug: 'downtowncharlottetowninc',
  googlePlaceId: 'ChIJjzsCkxFTXksRYQGz2uiNbEY',
  latitude: 46.2368332,
  longitude: -63.1273142,
});

const PORT_AFTER = Object.freeze({
  googlePlaceId: 'ChIJh1-byW9TXksRZDnqfg3-OO0',
  address: '1 Weymouth St, Charlottetown, PE C1A 8W1',
  rawAddress: '1 Weymouth St, Charlottetown, PE C1A 8W1',
  normalizedAddress: '1 Weymouth St, Charlottetown, PE C1A 8W1',
  addressSource: 'google_places',
  addressNormalizationIssues: [],
  streetAddress: '1 Weymouth St',
  city: 'Charlottetown',
  province: 'PE',
  postalCode: 'C1A 8W1',
  latitude: 46.233726,
  longitude: -63.11874,
});

const APPROVED_MOVES = Object.freeze([
  move('2wFbnUm5h8s3tvbp6vu0', 'fb_100057766283684', 'Vinyl Night w/ Riley Bee'),
  move('Lvtn8JhOfoyRzRYVFZ2t', '0F6W6IBgJqlKQ8AmaTGC', 'Age Well'),
  move('SfN7F7fg12uyk9X5zvUf', 'slug_downstreetdance', 'Lindy Hop & Charleston Practice'),
  move(
    'cQC0r3pUiUKxhbciWfn1',
    'fb_100063673418060',
    'Carter McLellan and Step Dancer Mylah Campbell'
  ),
  move('nwY7uv4uhWvlUESVe0UG', 'slug_downstreetdance', 'Beginner Belly Dance'),
  move(
    'pP82JTOrvpwfzIdKv9Sq',
    'slug_citycinemachtown',
    'Max Keenlyside in Concert & Oyster Princess'
  ),
  move('tR103vAd9IXrFSsnxc2h', '0F6W6IBgJqlKQ8AmaTGC', 'Beginner Lindy Hop 1'),
  move('6MaSofMo4B5xHLdPNxAI', 'slug_citycinemachtown', 'Hadetown'),
  move('NcnirktsEGk1Aq3cTvkA', 'slug_foundersfoodhall', 'Kitchen Party'),
  move('TD6KNAEUs2BByCEJP3hK', 'fb_100063673418060', 'Richie and Trevor'),
  move('bxRAQ7mr0S8TulfgUzUj', 'slug_foundersfoodhall', 'Lunch Sounds Better Live'),
  move('lpnbzdKTX8gqJUBSqg88', 'slug_thetivolicinema', 'Cayote Vs. Acme'),
  move('txPC5R3A5bOtE3dBmI8x', 'slug_trailsidemusichall', 'Nashville Nights'),
  move('vRM5VaaSwqXsRDyrD2YF', 'fb_100057766283684', 'Open Mic with Ivan Stewart'),
  move('xrwghij37oRn3iMWpwJW', 'slug_sobeyfamilytheatre', 'Come From Away'),
]);

const CONFIRMED_DUPLICATE = Object.freeze({
  sourceEventId: 'sBMwQUfck0ls4dHKmAhG',
  sourcePath: `${SOURCE_VENUE_PATH}/events/sBMwQUfck0ls4dHKmAhG`,
  canonicalPath: 'venues/slug_foundersfoodhall/events/JbSsg3uLV9nfCu1Vzqkz',
  canonicalVenueId: 'slug_foundersfoodhall',
});

// ---------------------------------------------------------------------------
// HARD-CODED FINGERPRINT MANIFEST -- COORDINATOR FILL-IN REQUIRED
// ---------------------------------------------------------------------------
// Do not infer or invent these stored values. Run the default dry run, compare
// its complete backup/report to the approved live evidence, then paste each
// report.fingerprintManifestTemplate value here. The script refuses --apply
// while any source or schedule entry is null. Titles and document paths are
// already hardcoded above and are checked even during the discovery dry run.
const APPROVED_EVENT_FINGERPRINT_MANIFEST = Object.freeze({
  '2wFbnUm5h8s3tvbp6vu0': '73f98650fb22de13923d739e679107db90ab9094f8362f2df06298f212d1c856',
  Lvtn8JhOfoyRzRYVFZ2t: '29d9e00ee5a66cf583619e8fbe4d3337a0d67625c368b73c53537487e028b603',
  SfN7F7fg12uyk9X5zvUf: 'bf9ee85df8c1b775dcc15d6d6179ad921047207d18b21b706617f72c9548abbd',
  cQC0r3pUiUKxhbciWfn1: '29edae2ebdfea3260078ba163f9ad71662fcf572d711dd689ee4e620a8754613',
  nwY7uv4uhWvlUESVe0UG: '467b5862a8bb556f9d63d872a71a75410112989502af6d9a8fe9d7a43dcfd0c9',
  pP82JTOrvpwfzIdKv9Sq: '340d3a79506b4498fa9cda9ee178cbd45871b43b5c786f63b5398b232916e116',
  tR103vAd9IXrFSsnxc2h: 'bc390440064908a213b742f1c252f013d8b42732cae491a98504d6597e87c9ae',
  '6MaSofMo4B5xHLdPNxAI': '379ed7acd63aab5a240d7d3418a095b866d9d570fc9df379cc9490f0e5693d04',
  NcnirktsEGk1Aq3cTvkA: '5aa108f8590ef9bde780798c4cd490179129f30c6b85d4c63030f57e3ec7aac0',
  TD6KNAEUs2BByCEJP3hK: '23d5633afdf18cd3c268696f3293bc9ed4d194ab1784f66d44292a4fe504c253',
  bxRAQ7mr0S8TulfgUzUj: '7fd8fb29a02bf54f257d0c69474e890c64327c16ab4e48c409aadba64a8557bc',
  lpnbzdKTX8gqJUBSqg88: 'b2be7303c431e62fe1066e1cc169ce9bb15d9a1b6b8b728770e0216842da14f9',
  txPC5R3A5bOtE3dBmI8x: 'a1f94d9ec948ab02e6fbbdd0c04087b94248ebc5fbb774f258c2c91cafd7165a',
  vRM5VaaSwqXsRDyrD2YF: 'fd3666f1e552cb5b2e61005dbb4826b41b7dc748eed2f06b858ee421e5e57049',
  xrwghij37oRn3iMWpwJW: 'dc9e2af881880c8ffdbf7122d0a3b754539326f62a190844aacaf13e6e87e088',
});

const APPROVED_DUPLICATE_FINGERPRINT_MANIFEST = Object.freeze({
  source: '649c3548a40758ca9f2cdfeabebdfc19bf55032ee1dc87288eac3750d8ec9b70',
  canonical: '23e116874f5c0debe5b75e15ab33063b2358cbf85a178b8c6d299a9f7ef8d6c0',
});

const IDENTITY_FIELDS = Object.freeze([
  'name',
  'normalizedName',
  'aliases',
  'aliasesNormalized',
  'pagename',
  'pagenameSlug',
  'pagenameNormalized',
  'facebookUrl',
  'pageurl',
  'facebookSlug',
  'instagramUrl',
]);

const EVENT_MEDIA_FIELDS = Object.freeze([
  'image',
  'imageUrl',
  'relevantImageUrl',
  'cachedImageUrl',
  'sharedPostThumbnail',
  'icon',
  'mediaUrls',
  'imageProvenance',
]);

let currentPlanSha256 = '';
let atomicBatchCommitted = false;

function move(eventId, destinationVenueId, title) {
  return Object.freeze({
    eventId,
    title,
    destinationVenueId,
    sourcePath: `${SOURCE_VENUE_PATH}/events/${eventId}`,
    destinationPath: `venues/${destinationVenueId}/events/${eventId}`,
  });
}

function fingerprintManifestMissingEntries() {
  const missing = [];
  for (const approvedMove of APPROVED_MOVES) {
    const entry = APPROVED_EVENT_FINGERPRINT_MANIFEST[approvedMove.eventId];
    if (!/^[a-f0-9]{64}$/.test(text(entry))) {
      missing.push(approvedMove.eventId);
    }
  }
  if (!APPROVED_DUPLICATE_FINGERPRINT_MANIFEST.source) missing.push('duplicate.source');
  if (!APPROVED_DUPLICATE_FINGERPRINT_MANIFEST.canonical) missing.push('duplicate.canonical');
  return missing;
}

function argumentValue(name) {
  const prefix = `${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length).trim().toLowerCase() : '';
}

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function text(value) {
  return String(value ?? '').trim();
}

function normalizeText(value) {
  return text(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function exactTitle(data) {
  const titles = [data.eventName, data.name].map(text).filter(Boolean);
  invariant(titles.length > 0, 'Event is missing both eventName and name');
  return titles;
}

function strictScheduleFingerprint(data) {
  return {
    startDate: text(data.startDate),
    endDate: text(data.endDate),
    startTime: text(data.startTime),
    endTime: text(data.endTime),
  };
}

function strictSourceFingerprint(data) {
  const sourceUniqueIds = Array.isArray(data.sourceUniqueIds)
    ? data.sourceUniqueIds.map(text).filter(Boolean).sort()
    : [];
  return {
    uniqueId: text(data.uniqueId),
    sourceUniqueId: text(data.sourceUniqueId),
    sourceUniqueIds,
    sourceContentSignature: text(data.sourceContentSignature),
    facebookUrl: text(data.facebookUrl),
    sourceScraperType: text(data.sourceScraperType),
    sourceTimestamp: serialize(data.sourceTimestamp),
  };
}

function sourceRoots(data) {
  const fingerprint = strictSourceFingerprint(data);
  const candidates = [
    fingerprint.sourceUniqueId,
    ...fingerprint.sourceUniqueIds,
    fingerprint.uniqueId,
  ].filter(Boolean);
  return Array.from(
    new Set(candidates.map((value) => value.split('_')[0]).filter(Boolean))
  ).sort();
}

function strictEventFingerprint(eventPath, data, expectedTitle) {
  const titles = exactTitle(data);
  invariant(
    titles.every((title) => title === expectedTitle),
    `Title changed at ${eventPath}: expected ${JSON.stringify(expectedTitle)}, found ${JSON.stringify(titles)}`
  );

  const schedule = strictScheduleFingerprint(data);
  invariant(schedule.startDate, `Missing startDate at ${eventPath}`);
  invariant(schedule.startTime, `Missing startTime at ${eventPath}`);

  const source = strictSourceFingerprint(data);
  invariant(
    source.uniqueId || source.sourceUniqueId || source.sourceUniqueIds.length > 0,
    `Missing source identity at ${eventPath}`
  );

  return {
    path: eventPath,
    title: expectedTitle,
    source,
    schedule,
  };
}

function assertHardcodedFingerprintMatches(eventId, liveFingerprint) {
  const expected = APPROVED_EVENT_FINGERPRINT_MANIFEST[eventId];
  if (!expected) return;
  invariant(expected === sha256(liveFingerprint), `Hardcoded fingerprint changed for ${eventId}`);
}

function completeFingerprint(data) {
  return {
    titles: exactTitle(data),
    source: strictSourceFingerprint(data),
    schedule: strictScheduleFingerprint(data),
  };
}

function assertHardcodedDuplicateFingerprintMatches(liveFingerprint) {
  const expected = APPROVED_DUPLICATE_FINGERPRINT_MANIFEST;
  if (!expected.source || !expected.canonical) return;
  invariant(
    expected.source === sha256(liveFingerprint.source),
    'Hardcoded duplicate source fingerprint changed'
  );
  invariant(
    expected.canonical === sha256(liveFingerprint.canonical),
    'Hardcoded duplicate canonical fingerprint changed'
  );
}

function serialize(value) {
  if (value === undefined) return { __type: 'undefined' };
  if (value === null || typeof value !== 'object') return value;
  if (typeof value.toDate === 'function') {
    return { __type: 'timestamp', value: value.toDate().toISOString() };
  }
  if (value instanceof admin.firestore.GeoPoint) {
    return {
      __type: 'geopoint',
      latitude: value.latitude,
      longitude: value.longitude,
    };
  }
  if (typeof value.path === 'string' && typeof value.get === 'function') {
    return { __type: 'document_reference', path: value.path };
  }
  if (Buffer.isBuffer(value)) {
    return { __type: 'buffer', base64: value.toString('base64') };
  }
  if (Array.isArray(value)) return value.map(serialize);
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, serialize(entry)])
  );
}

function sha256(value) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(serialize(value)))
    .digest('hex');
}

function documentRecord(snapshot) {
  return {
    path: snapshot.ref.path,
    exists: snapshot.exists,
    data: snapshot.exists ? serialize(snapshot.data() || {}) : null,
  };
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(serialize(payload), null, 2)}\n`, 'utf8');
}

function loadServiceAccount() {
  const configuredPath = text(process.env[SERVICE_ACCOUNT_ENV]);
  const selectedPath = configuredPath || SAFE_FALLBACK_SERVICE_ACCOUNT_PATH;
  invariant(
    path.isAbsolute(selectedPath),
    `${SERVICE_ACCOUNT_ENV} must contain an absolute service-account path`
  );
  const resolvedPath = path.resolve(selectedPath);
  invariant(fs.existsSync(resolvedPath), `Service account not found: ${resolvedPath}`);
  const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  invariant(
    serviceAccount.project_id === PROJECT_ID,
    `Credential project must be ${PROJECT_ID}, found ${text(serviceAccount.project_id) || '(missing)'}`
  );
  return { resolvedPath, serviceAccount };
}

function numberEquals(actual, expected) {
  return Number.isFinite(Number(actual)) && Math.abs(Number(actual) - expected) < 1e-9;
}

function assertPortBeforeState(data) {
  for (const [field, expected] of Object.entries(PORT_BEFORE)) {
    const actual = data[field];
    if (typeof expected === 'number') {
      invariant(
        numberEquals(actual, expected),
        `Port before-state changed for ${field}: expected ${expected}, found ${text(actual)}`
      );
    } else {
      invariant(
        text(actual) === expected,
        `Port before-state changed for ${field}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`
      );
    }
  }

  const staleIdentityLocations = [];
  for (const field of IDENTITY_FIELDS) {
    const values = Array.isArray(data[field]) ? data[field] : [data[field]];
    for (const value of values) {
      const compact = text(value).toLowerCase().replace(/[^a-z0-9]/g, '');
      if (compact.includes('downtowncharlottetowninc')) {
        staleIdentityLocations.push(field);
      }
    }
  }
  invariant(
    JSON.stringify(staleIdentityLocations) === JSON.stringify(['pagenameSlug']),
    `Unexpected DowntownCharlottetownInc identity fields: ${JSON.stringify(staleIdentityLocations)}`
  );
}

function assertPortAfterState(data) {
  invariant(text(data.name) === PORT_BEFORE.name, 'Port name was not retained');
  invariant(
    text(data.normalizedName) === PORT_BEFORE.normalizedName,
    'Port normalizedName was not retained'
  );
  invariant(!Object.prototype.hasOwnProperty.call(data, 'pagenameSlug'), 'Stale pagenameSlug remains');
  for (const [field, expected] of Object.entries(PORT_AFTER)) {
    const actual = data[field];
    if (typeof expected === 'number') {
      invariant(numberEquals(actual, expected), `Port postcondition failed for ${field}`);
    } else {
      invariant(
        JSON.stringify(serialize(actual)) === JSON.stringify(serialize(expected)),
        `Port postcondition failed for ${field}`
      );
    }
  }
  invariant(
    text(data.integrityRepair?.repairId) === REPAIR_ID,
    'Port repair provenance is missing'
  );
}

function assertDestinationVenue(snapshot) {
  invariant(snapshot.exists, `Missing destination venue: ${snapshot.ref.path}`);
  const data = snapshot.data() || {};
  invariant(text(data.name), `Destination venue has no canonical name: ${snapshot.ref.path}`);
  invariant(text(data.address), `Destination venue has no address: ${snapshot.ref.path}`);
  invariant(
    Number.isFinite(Number(data.latitude)) && Number.isFinite(Number(data.longitude)),
    `Destination venue has invalid coordinates: ${snapshot.ref.path}`
  );
}

function assertSnapshotEvidence(data) {
  invariant(
    text(data.fileId) === '1-a9VEyfhjX1K4PlLQ9VheZtpDHy1I0Px',
    `Snapshot fileId changed: ${text(data.fileId)}`
  );
  invariant(Number(data.rowIndex) === 263, `Snapshot rowIndex changed: ${text(data.rowIndex)}`);
  const corpus = normalizeText(JSON.stringify(serialize(data)));
  invariant(
    corpus.includes('beginner lindy hop 1') && corpus.includes('side door studio'),
    'Snapshot no longer proves Beginner Lindy Hop 1 at Side Door Studio'
  );
}

function assertDuplicateProof(sourceData, canonicalData) {
  // The two confirmed records may use venue-prefixed title variants. Their
  // exact titles and source identities are locked independently by the
  // hardcoded duplicate manifest before apply.
  exactTitle(sourceData);
  exactTitle(canonicalData);
  const sourceSchedule = strictScheduleFingerprint(sourceData);
  const canonicalSchedule = strictScheduleFingerprint(canonicalData);
  invariant(
    JSON.stringify(sourceSchedule) === JSON.stringify(canonicalSchedule),
    `Duplicate schedules differ: ${JSON.stringify(sourceSchedule)} vs ${JSON.stringify(canonicalSchedule)}`
  );
  invariant(sourceSchedule.startDate, 'Duplicate proof is missing startDate');
  invariant(sourceSchedule.startTime, 'Duplicate proof is missing startTime');
  invariant(
    text(canonicalData.venueId) === CONFIRMED_DUPLICATE.canonicalVenueId,
    'Canonical duplicate venueId changed'
  );
}

function eventIdentityCollision(left, right) {
  const leftTitles = exactTitle(left).map(normalizeText);
  const rightTitles = exactTitle(right).map(normalizeText);
  return (
    leftTitles.some((title) => rightTitles.includes(title)) &&
    JSON.stringify(strictScheduleFingerprint(left)) ===
      JSON.stringify(strictScheduleFingerprint(right))
  );
}

function sourceRootsOverlap(left, right) {
  const rightRoots = new Set(sourceRoots(right));
  return sourceRoots(left).some((root) => rightRoots.has(root));
}

function sourceIdentityTokens(data) {
  const fingerprint = strictSourceFingerprint(data);
  return new Set(
    [
      fingerprint.uniqueId,
      fingerprint.sourceUniqueId,
      ...fingerprint.sourceUniqueIds,
      fingerprint.sourceContentSignature,
    ].filter(Boolean)
  );
}

function sourceIdentityOverlap(left, right) {
  const rightTokens = sourceIdentityTokens(right);
  return Array.from(sourceIdentityTokens(left)).some((token) => rightTokens.has(token));
}

function venueIdentityNames(venueData) {
  return new Set(
    [venueData.name, venueData.pagename, ...(Array.isArray(venueData.aliases) ? venueData.aliases : [])]
      .map(normalizeText)
      .filter(Boolean)
  );
}

function buildMovedEventData(sourceData, destinationVenueData, approvedMove) {
  const moved = { ...sourceData };
  const venueName = text(destinationVenueData.name);
  const venueNames = venueIdentityNames(destinationVenueData);
  moved.venueId = approvedMove.destinationVenueId;
  moved.venue = venueName;
  moved.establishment = venueName;
  moved.locationScope = 'venue';
  moved.locationLabel = venueName;
  moved.locationPrecision = 'exact';
  moved.locationReviewStatus = 'not_needed';
  moved.address = text(destinationVenueData.address);
  moved.rawAddress = text(destinationVenueData.rawAddress) || moved.address;
  moved.normalizedAddress = text(destinationVenueData.normalizedAddress) || moved.address;
  moved.addressSource = text(destinationVenueData.addressSource) || 'venue';
  if (Array.isArray(destinationVenueData.addressNormalizationIssues)) {
    moved.addressNormalizationIssues = destinationVenueData.addressNormalizationIssues;
  } else {
    delete moved.addressNormalizationIssues;
  }
  moved.latitude = Number(destinationVenueData.latitude);
  moved.longitude = Number(destinationVenueData.longitude);
  if (text(destinationVenueData.city)) moved.city = text(destinationVenueData.city);
  if (text(destinationVenueData.streetAddress)) {
    moved.streetAddress = text(destinationVenueData.streetAddress);
  } else {
    delete moved.streetAddress;
  }
  if (venueNames.has(normalizeText(moved.additionalLocation))) {
    delete moved.additionalLocation;
  }
  moved.addressUpdatedAt = admin.firestore.FieldValue.serverTimestamp();
  moved.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  moved.integrityRepair = {
    repairId: REPAIR_ID,
    parserWeaknessId: PARSER_WEAKNESS_ID,
    reason: 'explicit_item_venue_previously_lost_to_inherited_page_address',
    sourcePath: approvedMove.sourcePath,
    destinationPath: approvedMove.destinationPath,
    sourceSnapshotPath: SOURCE_SNAPSHOT_PATH,
    repairedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  for (const field of EVENT_MEDIA_FIELDS) {
    invariant(
      sha256(moved[field]) === sha256(sourceData[field]),
      `Media field ${field} would change for ${approvedMove.sourcePath}`
    );
  }
  return moved;
}

async function readState(db) {
  const sourceVenueRef = db.doc(SOURCE_VENUE_PATH);
  const snapshotRef = db.doc(SOURCE_SNAPSHOT_PATH);
  const auditRef = db.doc(AUDIT_PATH);
  const canonicalDuplicateRef = db.doc(CONFIRMED_DUPLICATE.canonicalPath);
  const destinationVenueIds = Array.from(
    new Set(APPROVED_MOVES.map((entry) => entry.destinationVenueId))
  ).sort();
  const destinationVenueRefs = destinationVenueIds.map((id) => db.doc(`venues/${id}`));
  const destinationEventRefs = APPROVED_MOVES.map((entry) => db.doc(entry.destinationPath));

  const [sourceVenueSnap, snapshotSnap, auditSnap, canonicalDuplicateSnap, sourceEventsSnap] =
    await Promise.all([
      sourceVenueRef.get(),
      snapshotRef.get(),
      auditRef.get(),
      canonicalDuplicateRef.get(),
      sourceVenueRef.collection('events').get(),
    ]);
  const [destinationVenueSnaps, destinationEventSnaps, destinationEventCollectionSnaps] =
    await Promise.all([
    db.getAll(...destinationVenueRefs),
    db.getAll(...destinationEventRefs),
    Promise.all(destinationVenueRefs.map((ref) => ref.collection('events').get())),
  ]);

  return {
    sourceVenueRef,
    snapshotRef,
    auditRef,
    canonicalDuplicateRef,
    destinationVenueIds,
    destinationVenueRefs,
    destinationEventRefs,
    sourceVenueSnap,
    snapshotSnap,
    auditSnap,
    canonicalDuplicateSnap,
    sourceEventsSnap,
    destinationVenueSnaps,
    destinationEventSnaps,
    destinationEventCollectionSnaps,
  };
}

function validateAndPlan(state) {
  invariant(state.sourceVenueSnap.exists, `Missing source venue: ${SOURCE_VENUE_PATH}`);
  invariant(state.snapshotSnap.exists, `Missing source snapshot: ${SOURCE_SNAPSHOT_PATH}`);
  invariant(!state.auditSnap.exists, `Repair audit already exists: ${AUDIT_PATH}`);
  invariant(
    state.canonicalDuplicateSnap.exists,
    `Missing confirmed duplicate keeper: ${CONFIRMED_DUPLICATE.canonicalPath}`
  );
  assertPortBeforeState(state.sourceVenueSnap.data() || {});
  assertSnapshotEvidence(state.snapshotSnap.data() || {});
  for (const destinationVenueSnap of state.destinationVenueSnaps) {
    assertDestinationVenue(destinationVenueSnap);
  }
  for (const destinationEventSnap of state.destinationEventSnaps) {
    invariant(
      !destinationEventSnap.exists,
      `Destination collision: ${destinationEventSnap.ref.path}`
    );
  }

  const sourceEventsById = new Map(
    state.sourceEventsSnap.docs.map((snapshot) => [snapshot.id, snapshot])
  );
  const destinationVenuesById = new Map(
    state.destinationVenueSnaps.map((snapshot) => [snapshot.id, snapshot])
  );
  const movePlans = [];
  for (const approvedMove of APPROVED_MOVES) {
    const sourceSnapshot = sourceEventsById.get(approvedMove.eventId);
    invariant(sourceSnapshot, `Missing approved source: ${approvedMove.sourcePath}`);
    const sourceData = sourceSnapshot.data() || {};
    const fingerprint = strictEventFingerprint(
      approvedMove.sourcePath,
      sourceData,
      approvedMove.title
    );
    assertHardcodedFingerprintMatches(approvedMove.eventId, fingerprint);
    const destinationVenueSnapshot = destinationVenuesById.get(
      approvedMove.destinationVenueId
    );
    invariant(
      destinationVenueSnapshot,
      `Destination venue was not read: ${approvedMove.destinationVenueId}`
    );
    movePlans.push({
      ...approvedMove,
      sourceSnapshot,
      sourceData,
      fingerprint,
      destinationVenueSnapshot,
      destinationVenueData: destinationVenueSnapshot.data() || {},
    });
  }

  const destinationCollectionsByVenueId = new Map(
    state.destinationVenueIds.map((venueId, index) => [
      venueId,
      state.destinationEventCollectionSnaps[index],
    ])
  );
  const destinationSiblingCollisions = [];
  for (const entry of movePlans) {
    const destinationCollection = destinationCollectionsByVenueId.get(entry.destinationVenueId);
    invariant(destinationCollection, `Destination collection was not read: ${entry.destinationVenueId}`);
    for (const sibling of destinationCollection.docs) {
      const siblingData = sibling.data() || {};
      if (
        eventIdentityCollision(siblingData, entry.sourceData) ||
        sourceIdentityOverlap(siblingData, entry.sourceData)
      ) {
        destinationSiblingCollisions.push({
          eventId: entry.eventId,
          destinationPath: entry.destinationPath,
          conflictingPath: sibling.ref.path,
        });
      }
    }
  }
  invariant(
    destinationSiblingCollisions.length === 0,
    `Destination sibling collisions: ${JSON.stringify(destinationSiblingCollisions)}`
  );

  const duplicateSourceSnapshot = sourceEventsById.get(CONFIRMED_DUPLICATE.sourceEventId);
  invariant(
    duplicateSourceSnapshot,
    `Missing confirmed duplicate source: ${CONFIRMED_DUPLICATE.sourcePath}`
  );
  const duplicateSourceData = duplicateSourceSnapshot.data() || {};
  const duplicateCanonicalData = state.canonicalDuplicateSnap.data() || {};
  assertDuplicateProof(duplicateSourceData, duplicateCanonicalData);
  const duplicateFingerprint = {
    source: completeFingerprint(duplicateSourceData),
    canonical: completeFingerprint(duplicateCanonicalData),
  };
  assertHardcodedDuplicateFingerprintMatches(duplicateFingerprint);

  const scheduleRoots = Array.from(
    new Set(
      [...movePlans.map((entry) => entry.sourceData), duplicateSourceData]
        .flatMap(sourceRoots)
        .filter(Boolean)
    )
  ).sort();
  invariant(
    JSON.stringify(scheduleRoots) === JSON.stringify(APPROVED_SOURCE_ROOTS),
    `Approved schedule source roots changed: ${JSON.stringify(scheduleRoots)}`
  );
  const snapshotRoot = sourceRoots(state.snapshotSnap.data() || {});
  if (snapshotRoot.length > 0) {
    invariant(
      snapshotRoot.some((root) => APPROVED_SOURCE_ROOTS.includes(root)),
      `Snapshot source root ${JSON.stringify(snapshotRoot)} is outside the approved set`
    );
  }

  const approvedSourceIds = new Set([
    ...APPROVED_MOVES.map((entry) => entry.eventId),
    CONFIRMED_DUPLICATE.sourceEventId,
  ]);
  const approvedSourceData = [...movePlans.map((entry) => entry.sourceData), duplicateSourceData];
  const unexpectedSourceSiblings = [];
  for (const sibling of state.sourceEventsSnap.docs) {
    if (approvedSourceIds.has(sibling.id)) continue;
    const siblingData = sibling.data() || {};
    const overlapsApprovedSource = approvedSourceData.some((data) =>
      sourceRootsOverlap(siblingData, data)
    );
    const collidesWithApprovedEvent = approvedSourceData.some((data) =>
      eventIdentityCollision(siblingData, data)
    );
    if (overlapsApprovedSource || collidesWithApprovedEvent) {
      unexpectedSourceSiblings.push(sibling.ref.path);
    }
  }
  invariant(
    unexpectedSourceSiblings.length === 0,
    `Unexpected source siblings: ${JSON.stringify(unexpectedSourceSiblings)}`
  );

  const planForDigest = {
    repairId: REPAIR_ID,
    sourceVenue: {
      path: SOURCE_VENUE_PATH,
      completeDocumentSha256: sha256(state.sourceVenueSnap.data() || {}),
      expectedBefore: PORT_BEFORE,
      plannedAfter: PORT_AFTER,
      deleteFields: ['pagenameSlug'],
    },
    sourceSnapshot: {
      path: SOURCE_SNAPSHOT_PATH,
      completeDocumentSha256: sha256(state.snapshotSnap.data() || {}),
    },
    destinationVenues: state.destinationVenueSnaps.map((snapshot) => ({
      path: snapshot.ref.path,
      completeDocumentSha256: sha256(snapshot.data() || {}),
    })),
    destinationEventSiblings: state.destinationEventCollectionSnaps.flatMap((querySnapshot) =>
      querySnapshot.docs.map((snapshot) => ({
        path: snapshot.ref.path,
        completeDocumentSha256: sha256(snapshot.data() || {}),
      }))
    ),
    moves: movePlans.map((entry) => ({
      sourcePath: entry.sourcePath,
      destinationPath: entry.destinationPath,
      destinationExists: false,
      fingerprint: entry.fingerprint,
    })),
    duplicate: {
      sourcePath: CONFIRMED_DUPLICATE.sourcePath,
      canonicalPath: CONFIRMED_DUPLICATE.canonicalPath,
      sourceDocumentSha256: sha256(duplicateSourceData),
      canonicalDocumentSha256: sha256(duplicateCanonicalData),
      fingerprint: duplicateFingerprint,
    },
    sourceSiblingPaths: state.sourceEventsSnap.docs.map((snapshot) => snapshot.ref.path).sort(),
    auditPath: AUDIT_PATH,
    auditExists: false,
  };

  return {
    movePlans,
    duplicateSourceSnapshot,
    duplicateSourceData,
    duplicateCanonicalData,
    duplicateFingerprint,
    scheduleRoots,
    planForDigest,
    planSha256: sha256(planForDigest),
  };
}

function completeBackup(state, plan) {
  return {
    generatedAt: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    projectId: PROJECT_ID,
    repairId: REPAIR_ID,
    parserWeaknessId: PARSER_WEAKNESS_ID,
    approvedPlanSha256: plan.planSha256,
    documents: {
      sourceVenue: documentRecord(state.sourceVenueSnap),
      sourceSnapshot: documentRecord(state.snapshotSnap),
      destinationVenues: state.destinationVenueSnaps.map(documentRecord),
      destinationEventSiblings: state.destinationEventCollectionSnaps.flatMap(
        (querySnapshot) => querySnapshot.docs.map(documentRecord)
      ),
      sourceEventsAndSiblings: state.sourceEventsSnap.docs.map(documentRecord),
      destinationEvents: state.destinationEventSnaps.map(documentRecord),
      duplicateSource: documentRecord(plan.duplicateSourceSnapshot),
      duplicateCanonical: documentRecord(state.canonicalDuplicateSnap),
      auditBefore: documentRecord(state.auditSnap),
    },
  };
}

function portUpdatePayload() {
  return {
    pagenameSlug: admin.firestore.FieldValue.delete(),
    ...PORT_AFTER,
    addressUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    integrityRepair: {
      repairId: REPAIR_ID,
      parserWeaknessId: PARSER_WEAKNESS_ID,
      reason: 'removed_stale_downtown_page_identity_and_replaced_ponyboat_place_data',
      sourceSnapshotPath: SOURCE_SNAPSHOT_PATH,
      repairedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  };
}

async function applyAtomicRepair(db, state, plan) {
  const batch = db.batch();
  batch.update(
    state.sourceVenueRef,
    portUpdatePayload(),
    { lastUpdateTime: state.sourceVenueSnap.updateTime }
  );

  for (const entry of plan.movePlans) {
    const movedData = buildMovedEventData(
      entry.sourceData,
      entry.destinationVenueData,
      entry
    );
    batch.create(db.doc(entry.destinationPath), movedData);
    batch.delete(entry.sourceSnapshot.ref, {
      lastUpdateTime: entry.sourceSnapshot.updateTime,
    });
  }
  batch.delete(plan.duplicateSourceSnapshot.ref, {
    lastUpdateTime: plan.duplicateSourceSnapshot.updateTime,
  });
  batch.create(state.auditRef, {
    repairId: REPAIR_ID,
    parserWeaknessId: PARSER_WEAKNESS_ID,
    operation: 'manual_event_integrity_repair',
    approvedPlanSha256: plan.planSha256,
    sourceSnapshotPath: SOURCE_SNAPSHOT_PATH,
    sourceVenuePath: SOURCE_VENUE_PATH,
    movedEvents: APPROVED_MOVES.map((entry) => ({
      eventId: entry.eventId,
      title: entry.title,
      sourcePath: entry.sourcePath,
      destinationPath: entry.destinationPath,
    })),
    deletedDuplicate: CONFIRMED_DUPLICATE,
    mediaDeleted: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await batch.commit();
  atomicBatchCommitted = true;
}

async function verifyPostconditions(db, state, plan) {
  const refs = [
    state.sourceVenueRef,
    state.snapshotRef,
    ...state.destinationVenueRefs,
    ...plan.movePlans.map((entry) => entry.sourceSnapshot.ref),
    ...state.destinationEventRefs,
    plan.duplicateSourceSnapshot.ref,
    state.canonicalDuplicateRef,
    state.auditRef,
  ];
  const snapshots = await db.getAll(...refs);
  const byPath = new Map(snapshots.map((snapshot) => [snapshot.ref.path, snapshot]));

  const portAfterSnapshot = byPath.get(SOURCE_VENUE_PATH);
  invariant(portAfterSnapshot?.exists, 'Port venue disappeared after repair');
  assertPortAfterState(portAfterSnapshot.data() || {});

  const snapshotAfter = byPath.get(SOURCE_SNAPSHOT_PATH);
  invariant(snapshotAfter?.exists, 'Source snapshot disappeared after repair');
  invariant(
    sha256(snapshotAfter.data() || {}) ===
      plan.planForDigest.sourceSnapshot.completeDocumentSha256,
    'Source snapshot changed during repair'
  );

  for (const destinationVenueSnapshot of state.destinationVenueSnaps) {
    const after = byPath.get(destinationVenueSnapshot.ref.path);
    invariant(after?.exists, `Destination venue disappeared: ${destinationVenueSnapshot.ref.path}`);
    invariant(
      sha256(after.data() || {}) === sha256(destinationVenueSnapshot.data() || {}),
      `Destination venue changed during repair: ${destinationVenueSnapshot.ref.path}`
    );
  }

  const movedVerification = [];
  for (const entry of plan.movePlans) {
    const sourceAfter = byPath.get(entry.sourcePath);
    const destinationAfter = byPath.get(entry.destinationPath);
    invariant(!sourceAfter?.exists, `Moved source still exists: ${entry.sourcePath}`);
    invariant(destinationAfter?.exists, `Moved destination is missing: ${entry.destinationPath}`);
    const destinationData = destinationAfter.data() || {};
    strictEventFingerprint(entry.destinationPath, destinationData, entry.title);
    invariant(
      JSON.stringify(strictSourceFingerprint(destinationData)) ===
        JSON.stringify(strictSourceFingerprint(entry.sourceData)),
      `Source fingerprint changed while moving ${entry.eventId}`
    );
    invariant(
      JSON.stringify(strictScheduleFingerprint(destinationData)) ===
        JSON.stringify(strictScheduleFingerprint(entry.sourceData)),
      `Schedule fingerprint changed while moving ${entry.eventId}`
    );
    invariant(
      text(destinationData.venueId) === entry.destinationVenueId,
      `venueId postcondition failed for ${entry.destinationPath}`
    );
    invariant(
      text(destinationData.integrityRepair?.repairId) === REPAIR_ID,
      `Repair provenance missing from ${entry.destinationPath}`
    );
    for (const field of EVENT_MEDIA_FIELDS) {
      invariant(
        sha256(destinationData[field]) === sha256(entry.sourceData[field]),
        `Media field ${field} changed after moving ${entry.eventId}`
      );
    }
    movedVerification.push({
      eventId: entry.eventId,
      title: entry.title,
      sourcePath: entry.sourcePath,
      destinationPath: entry.destinationPath,
      verified: true,
    });
  }

  const duplicateSourceAfter = byPath.get(CONFIRMED_DUPLICATE.sourcePath);
  const duplicateCanonicalAfter = byPath.get(CONFIRMED_DUPLICATE.canonicalPath);
  invariant(!duplicateSourceAfter?.exists, 'Confirmed duplicate source still exists');
  invariant(duplicateCanonicalAfter?.exists, 'Confirmed duplicate keeper disappeared');
  invariant(
    sha256(duplicateCanonicalAfter.data() || {}) === sha256(plan.duplicateCanonicalData),
    'Confirmed duplicate keeper changed during repair'
  );

  const auditAfter = byPath.get(AUDIT_PATH);
  invariant(auditAfter?.exists, 'Repair audit document is missing');
  invariant(
    text(auditAfter.data()?.approvedPlanSha256) === plan.planSha256,
    'Repair audit digest does not match the approved plan'
  );
  invariant(auditAfter.data()?.mediaDeleted === false, 'Repair audit mediaDeleted guard failed');

  const sourceEventsAfter = await state.sourceVenueRef.collection('events').get();
  const removedIds = new Set([
    ...APPROVED_MOVES.map((entry) => entry.eventId),
    CONFIRMED_DUPLICATE.sourceEventId,
  ]);
  const remainingRemovedIds = sourceEventsAfter.docs
    .map((snapshot) => snapshot.id)
    .filter((id) => removedIds.has(id));
  invariant(
    remainingRemovedIds.length === 0,
    `Approved source IDs remain after repair: ${JSON.stringify(remainingRemovedIds)}`
  );

  for (const entry of plan.movePlans) {
    const destinationCollectionAfter = await db
      .doc(`venues/${entry.destinationVenueId}`)
      .collection('events')
      .get();
    const equivalent = destinationCollectionAfter.docs.filter((snapshot) => {
      const data = snapshot.data() || {};
      return (
        eventIdentityCollision(data, entry.sourceData) ||
        sourceIdentityOverlap(data, entry.sourceData)
      );
    });
    invariant(
      equivalent.length === 1 && equivalent[0].id === entry.eventId,
      `Moved event has unexpected equivalent destination siblings: ${entry.destinationPath}`
    );
  }

  return {
    portVenuePath: SOURCE_VENUE_PATH,
    portVenueVerified: true,
    movedEvents: movedVerification,
    deletedDuplicate: {
      sourcePath: CONFIRMED_DUPLICATE.sourcePath,
      canonicalPath: CONFIRMED_DUPLICATE.canonicalPath,
      sourceDeleted: true,
      canonicalUnchanged: true,
      mediaDeleted: false,
    },
    auditPath: AUDIT_PATH,
    auditVerified: true,
  };
}

async function main() {
  const fingerprintManifestMissing = fingerprintManifestMissingEntries();
  if (APPLY) {
    invariant(
      fingerprintManifestMissing.length === 0,
      `Apply is disabled until the hardcoded fingerprint manifest is complete: ${JSON.stringify(fingerprintManifestMissing)}`
    );
    invariant(
      /^[a-f0-9]{64}$/.test(APPROVED_PLAN_SHA256),
      'Apply requires --approved-plan-sha256=<64-character digest from the dry run>'
    );
  }

  const { resolvedPath: serviceAccountPath, serviceAccount } = loadServiceAccount();
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: PROJECT_ID,
    });
  }
  const db = admin.firestore();
  const state = await readState(db);
  const plan = validateAndPlan(state);
  currentPlanSha256 = plan.planSha256;

  if (APPLY) {
    invariant(
      APPROVED_PLAN_SHA256 === plan.planSha256,
      `Approved plan digest is stale. Expected ${APPROVED_PLAN_SHA256}, current live plan is ${plan.planSha256}. Run a new dry run and review it.`
    );
  }

  writeJson(BACKUP_PATH, completeBackup(state, plan));

  const commonResult = {
    generatedAt: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    projectId: PROJECT_ID,
    repairId: REPAIR_ID,
    parserWeaknessId: PARSER_WEAKNESS_ID,
    serviceAccountPath,
    sourceVenuePath: SOURCE_VENUE_PATH,
    sourceSnapshotPath: SOURCE_SNAPSHOT_PATH,
    backupPath: BACKUP_PATH,
    resultPath: RESULT_PATH,
    approvedPlanSha256: plan.planSha256,
    moveCount: plan.movePlans.length,
    duplicateDeleteCount: 1,
    mediaDeleteCount: 0,
    fingerprintManifestMissing,
    fingerprintManifestTemplate: {
      events: Object.fromEntries(
        plan.movePlans.map((entry) => [entry.eventId, sha256(entry.fingerprint)])
      ),
      duplicate: {
        source: sha256(plan.duplicateFingerprint.source),
        canonical: sha256(plan.duplicateFingerprint.canonical),
      },
    },
    plan: plan.planForDigest,
  };

  if (!APPLY) {
    return {
      ...commonResult,
      status:
        fingerprintManifestMissing.length > 0
          ? 'dry-run-manifest-incomplete'
          : 'dry-run-ready',
      applyCommand:
        fingerprintManifestMissing.length > 0
          ? null
          : `node ${path.basename(__filename)} --apply --approved-plan-sha256=${plan.planSha256}`,
      nextStep:
        fingerprintManifestMissing.length > 0
          ? 'Review the backup and report, then copy fingerprintManifestTemplate into the isolated hardcoded manifest and repeat the dry run.'
          : 'Review this unchanged plan, then use the applyCommand exactly.',
    };
  }

  await applyAtomicRepair(db, state, plan);
  const verification = await verifyPostconditions(db, state, plan);
  return {
    ...commonResult,
    status: 'applied-and-verified',
    verification,
  };
}

main()
  .then(async (result) => {
    writeJson(RESULT_PATH, result);
    console.log(JSON.stringify(serialize(result), null, 2));
    if (admin.apps.length) await admin.app().delete();
  })
  .catch(async (error) => {
    const result = {
      generatedAt: new Date().toISOString(),
      status: atomicBatchCommitted ? 'failed-after-atomic-commit' : 'failed-before-commit',
      mode: APPLY ? 'apply' : 'dry-run',
      projectId: PROJECT_ID,
      repairId: REPAIR_ID,
      atomicBatchCommitted,
      currentPlanSha256: currentPlanSha256 || null,
      backupPath: fs.existsSync(BACKUP_PATH) ? BACKUP_PATH : null,
      resultPath: RESULT_PATH,
      error: error instanceof Error ? error.message : String(error),
    };
    try {
      writeJson(RESULT_PATH, result);
    } catch (reportError) {
      console.error('Unable to write failure report:', reportError);
    }
    console.error(error);
    try {
      if (admin.apps.length) await admin.app().delete();
    } catch {}
    process.exitCode = 1;
  });
