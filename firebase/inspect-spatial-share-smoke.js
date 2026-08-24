/**
 * Read-only verification for the synthetic spatial-event image-share fixtures.
 *
 * Usage (from firebase/): node inspect-spatial-share-smoke.js
 */
'use strict';

const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, 'service-account.json'));
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

const db = admin.firestore();
const FIXTURE_TITLES = new Set([
  'Harbour Lights Parade',
  'Three Corners Busker Day',
]);

function titleOf(data) {
  return String(
    data?.title ||
    data?.eventTitle ||
    data?.event?.title ||
    data?.parsedEvent?.title ||
    data?.parsedEvents?.[0]?.title ||
    ''
  ).trim();
}

function matchesFixture(data) {
  const serialized = JSON.stringify(data);
  return Array.from(FIXTURE_TITLES).some((title) => serialized.includes(title));
}

function concise(pathValue, data) {
  const event = data?.event || data?.parsedEvent || data?.parsedEvents?.[0] || data;
  return {
    path: pathValue,
    title: titleOf(data),
    status: data.status || data.phase || null,
    visibility: data.visibility || null,
    locationScope: event.locationScope || null,
    mapMode: event.mapMode || null,
    spatialKind: event.spatialEvidence?.kind || event.spatial?.kind || null,
    representation: event.spatialEvidence?.representation || event.spatial?.representation || null,
    routeEvidenceLevel: event.spatialEvidence?.routeEvidenceLevel || event.spatial?.routeEvidenceLevel || null,
    locationName: event.locationName || null,
    locations: event.spatialEvidence?.locations || event.spatial?.locations || null,
    orderedStreets: event.spatialEvidence?.orderedStreets || event.spatial?.orderedStreets || null,
    reviewReasons: data.autoPublishReviewReasons || null,
    parserVersion: data.parserVersion || null,
  };
}

async function matchingCollectionGroup(name) {
  const snapshot = await db.collectionGroup(name).get();
  return snapshot.docs
    .filter((doc) => matchesFixture(doc.data()))
    .map((doc) => concise(doc.ref.path, doc.data()));
}

async function matchingTopLevel(name) {
  const snapshot = await db.collection(name).get();
  return snapshot.docs
    .filter((doc) => matchesFixture(doc.data()))
    .map((doc) => concise(doc.ref.path, doc.data()));
}

async function main() {
  const [privateEvents, ingests, candidates, reviews, publishedEvents] = await Promise.all([
    matchingCollectionGroup('privateSharedEvents'),
    matchingCollectionGroup('sharedEventIngests'),
    matchingTopLevel('public_shared_event_candidates'),
    matchingTopLevel('city_level_event_reviews'),
    matchingTopLevel('events'),
  ]);

  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    fixtures: Array.from(FIXTURE_TITLES),
    privateEvents,
    ingests,
    publicCandidates: candidates,
    cityReviews: reviews,
    publishedEvents,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
