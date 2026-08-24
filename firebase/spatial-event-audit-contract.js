'use strict';

const { validateAreaData } = require('./area-event-contract');
const { validateRouteData } = require('./route-event-contract');

const SPATIAL_KINDS_REQUIRING_REVIEW = new Set([
  'route',
  'multi_location',
  'separate_occurrences',
]);

function finding(severity, code, message, path) {
  return { severity, code, message, path };
}

function isTopLevelEventPath(path) {
  const parts = String(path || '').split('/').filter(Boolean);
  return parts.length === 2 && parts[0] === 'events';
}

function auditSpatialEventDocument(path, data) {
  const doc = data || {};
  const findings = [];
  const scope = String(doc.locationScope || '').trim();
  const mapMode = String(doc.mapMode || '').trim();
  const spatialKind = String(doc.spatialEvidence?.kind || '').trim();
  const routeLike = scope === 'route' || mapMode === 'route' || spatialKind === 'route';
  const multiLocation = spatialKind === 'multi_location' || Boolean(doc.areaData);

  if (routeLike) {
    if (!isTopLevelEventPath(path)) {
      findings.push(finding('High', 'SPATIAL_ROUTE_NOT_TOP_LEVEL', 'Route events must be stored at events/<eventId>, not under a venue.', path));
    }
    if (doc.venueId !== null) {
      findings.push(finding('High', 'SPATIAL_ROUTE_VENUE_ID', 'Route events must have venueId: null.', path));
    }
    if (scope !== 'route') {
      findings.push(finding('High', 'SPATIAL_ROUTE_SCOPE', 'Route evidence must use locationScope: route.', path));
    }
    if (mapMode !== 'route') {
      findings.push(finding('High', 'SPATIAL_ROUTE_MAP_MODE', 'Route events must use mapMode: route.', path));
    }
    if (!doc.routeData) {
      findings.push(finding('High', 'SPATIAL_ROUTE_DATA_MISSING', 'Route event is missing routeData.', path));
    } else {
      try {
        validateRouteData(doc.routeData);
      } catch (error) {
        findings.push(finding('High', 'SPATIAL_ROUTE_DATA_INVALID', error.message, path));
      }
    }
    if (doc.areaData) {
      findings.push(finding('High', 'SPATIAL_ROUTE_HAS_AREA_DATA', 'A route event cannot also carry areaData.', path));
    }
  }

  if (multiLocation) {
    if (!isTopLevelEventPath(path)) {
      findings.push(finding('High', 'SPATIAL_AREA_NOT_TOP_LEVEL', 'Multi-location events must be stored at events/<eventId>, not under one venue.', path));
    }
    if (doc.venueId !== null) {
      findings.push(finding('High', 'SPATIAL_AREA_VENUE_ID', 'Multi-location events must have venueId: null.', path));
    }
    if (scope !== 'area') {
      findings.push(finding('High', 'SPATIAL_AREA_SCOPE', 'Multi-location evidence must use locationScope: area.', path));
    }
    if (mapMode !== 'area') {
      findings.push(finding('High', 'SPATIAL_AREA_MAP_MODE', 'Multi-location events must use mapMode: area.', path));
    }
    if (!doc.areaData) {
      findings.push(finding('High', 'SPATIAL_AREA_DATA_MISSING', 'Multi-location event is missing areaData locations.', path));
    } else {
      try {
        validateAreaData(doc.areaData);
      } catch (error) {
        findings.push(finding('High', 'SPATIAL_AREA_DATA_INVALID', error.message, path));
      }
    }
    if (doc.routeData) {
      findings.push(finding('High', 'SPATIAL_AREA_HAS_ROUTE_DATA', 'An unordered multi-location event cannot carry routeData.', path));
    }
    if (doc.spatialEvidence?.ordered === true) {
      findings.push(finding('High', 'SPATIAL_MULTI_LOCATION_ORDERED', 'An unordered multi-location event incorrectly claims an ordered path.', path));
    }
  }

  const title = String(doc.eventName || doc.name || '').trim();
  const description = String(doc.description || '').trim();
  if (
    /\b(traffic|road|street)\s+(notice|advisory|closure|impact)\b/i.test(title) ||
    (/\btraffic advisory\b/i.test(description) && !/\b(event|festival|concert|race|run|parade)\b/i.test(title))
  ) {
    findings.push(finding('High', 'SPATIAL_TRAFFIC_NOTICE_PUBLISHED', 'Traffic/closure notice appears to be published as an event.', path));
  }

  return findings;
}

function auditSpatialReviewDocument(path, data, publishedEventExists) {
  const review = data || {};
  const findings = [];
  const spatialKind = String(review.spatialEvidence?.kind || '').trim();
  const reasons = Array.isArray(review.autoPublishReviewReasons)
    ? review.autoPublishReviewReasons.map(String)
    : [];
  const needsSpatialReview = review.locationScope === 'route' ||
    SPATIAL_KINDS_REQUIRING_REVIEW.has(spatialKind) ||
    reasons.some((reason) => /route_|multi_location_|split_location_/.test(reason));
  const finalizationAction = String(review.finalization?.action || '').trim();
  const manuallyApproved = review.locationReviewStatus === 'approved' &&
    Boolean(review.resolvedAt || review.resolvedBy) &&
    ['approve_publish', 'publish_route', 'publish_area'].includes(finalizationAction);

  if (needsSpatialReview && !spatialKind) {
    findings.push(finding('High', 'SPATIAL_REVIEW_EVIDENCE_MISSING', 'Spatial review reasons exist but the structured spatialEvidence record is missing.', path));
  }

  if (needsSpatialReview && review.status === 'published' && !manuallyApproved) {
    findings.push(finding('Critical', 'SPATIAL_REVIEW_BYPASSED', 'A review-gated spatial candidate is marked published.', path));
  }
  if (review.status === 'published' && !review.publishedEventPath) {
    findings.push(finding('High', 'SPATIAL_PUBLISHED_PATH_MISSING', 'Published review has no publishedEventPath.', path));
  }
  if (review.status === 'published' && publishedEventExists === false) {
    findings.push(finding('Critical', 'SPATIAL_PUBLISHED_EVENT_MISSING', 'Published review points to no live event document.', path));
  }
  if (review.locationScope === 'route' && spatialKind && spatialKind !== 'route') {
    findings.push(finding('High', 'SPATIAL_REVIEW_SCOPE_MISMATCH', 'Route review scope disagrees with spatial evidence.', path));
  }
  if (spatialKind === 'multi_location' && review.spatialEvidence?.ordered === true) {
    findings.push(finding('High', 'SPATIAL_MULTI_LOCATION_ORDERED', 'Multi-location review incorrectly claims an ordered path.', path));
  }

  return findings;
}

module.exports = {
  auditSpatialEventDocument,
  auditSpatialReviewDocument,
};
