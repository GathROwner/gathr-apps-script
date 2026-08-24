/**
 * Read-only Firestore audit for route and multi-location event contracts.
 *
 * Usage (from firebase/): node audit-spatial-events.js
 * This script prints JSON and performs no writes.
 */
'use strict';

const admin = require('firebase-admin');
const path = require('path');
const {
  auditSpatialEventDocument,
  auditSpatialReviewDocument,
} = require('./spatial-event-audit-contract');

const serviceAccount = require(path.join(__dirname, 'service-account.json'));
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

const db = admin.firestore();

function isSpatialEvent(data) {
  return data?.locationScope === 'route' ||
    data?.mapMode === 'route' ||
    Boolean(data?.routeData) ||
    Boolean(data?.areaData) ||
    ['route', 'multi_location'].includes(String(data?.spatialEvidence?.kind || ''));
}

function isSpatialReview(data) {
  const reasons = Array.isArray(data?.autoPublishReviewReasons)
    ? data.autoPublishReviewReasons.join(' ')
    : '';
  return data?.locationScope === 'route' ||
    ['route', 'multi_location', 'separate_occurrences'].includes(String(data?.spatialEvidence?.kind || '')) ||
    /route_|multi_location_|split_location_|multi_venue_area_candidate|route_like_or_unsupported_location/.test(reasons);
}

async function main() {
  const [eventSnapshot, reviewSnapshot] = await Promise.all([
    db.collectionGroup('events').get(),
    db.collection('city_level_event_reviews').get(),
  ]);

  const spatialEvents = eventSnapshot.docs.filter((doc) => isSpatialEvent(doc.data()));
  const spatialReviews = reviewSnapshot.docs.filter((doc) => isSpatialReview(doc.data()));
  const findings = [];

  for (const doc of spatialEvents) {
    findings.push(...auditSpatialEventDocument(doc.ref.path, doc.data()));
  }

  for (const doc of spatialReviews) {
    const data = doc.data();
    let publishedEventExists;
    if (data.status === 'published') {
      const publishedPath = String(data.publishedEventPath || '').trim();
      publishedEventExists = publishedPath ? (await db.doc(publishedPath).get()).exists : false;
    }
    findings.push(...auditSpatialReviewDocument(doc.ref.path, data, publishedEventExists));
  }

  const severityCounts = findings.reduce((counts, entry) => {
    counts[entry.severity] = (counts[entry.severity] || 0) + 1;
    return counts;
  }, {});
  console.log(JSON.stringify({
    capturedAt: new Date().toISOString(),
    projectId: serviceAccount.project_id,
    readOnly: true,
    scannedEventCount: eventSnapshot.size,
    spatialEventCount: spatialEvents.length,
    scannedReviewCount: reviewSnapshot.size,
    spatialReviewCount: spatialReviews.length,
    findingCount: findings.length,
    severityCounts,
    findings,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
