'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  auditSpatialEventDocument,
  auditSpatialReviewDocument,
} = require('./spatial-event-audit-contract');

const point = (id, label) => ({
  id,
  label,
  certainty: 'confirmed',
  coordinates: { latitude: 46.23, longitude: -63.13 },
});

test('clean multi-location event passes the auditor', () => {
  const findings = auditSpatialEventDocument('events/busker', {
    locationScope: 'area',
    mapMode: 'area',
    venueId: null,
    spatialEvidence: { kind: 'multi_location', ordered: false },
    areaData: { version: 1, status: 'verified', locations: [point('one', 'Victoria Row')] },
  });
  assert.deepEqual(findings, []);
});

test('multi-location event cannot imply a line or order', () => {
  const findings = auditSpatialEventDocument('events/bad-area', {
    locationScope: 'area',
    mapMode: 'area',
    venueId: null,
    spatialEvidence: { kind: 'multi_location', ordered: true },
    areaData: {
      version: 1,
      status: 'verified',
      locations: [point('one', 'One')],
      orderedLocations: true,
    },
  });
  assert.ok(findings.some((entry) => entry.code === 'SPATIAL_AREA_DATA_INVALID'));
});

test('route event must be top-level and carry route map data', () => {
  const findings = auditSpatialEventDocument('venues/pub/events/parade', {
    locationScope: 'route',
    mapMode: 'area',
    venueId: 'pub',
    spatialEvidence: { kind: 'route' },
  });
  assert.deepEqual(findings.map((entry) => entry.code).sort(), [
    'SPATIAL_ROUTE_DATA_MISSING',
    'SPATIAL_ROUTE_MAP_MODE',
    'SPATIAL_ROUTE_VENUE_ID',
  ]);
});

test('confirmed routed street needs full official evidence', () => {
  const findings = auditSpatialEventDocument('events/guessed-route', {
    locationScope: 'route',
    mapMode: 'route',
    venueId: null,
    routeData: {
      version: 1,
      status: 'approximate',
      evidenceLevel: 'inferred',
      geometryMethod: 'street_routing_estimate',
      stops: [],
      segments: [{
        id: 'guess',
        streetName: 'Queen Street',
        certainty: 'confirmed',
        source: 'routed_streets',
        coordinates: [
          { latitude: 46.23, longitude: -63.13 },
          { latitude: 46.24, longitude: -63.12 },
        ],
      }],
    },
  });
  assert.ok(findings.some((entry) => entry.code === 'SPATIAL_ROUTE_DATA_INVALID'));
});

test('published spatial review is reported as a bypass', () => {
  const findings = auditSpatialReviewDocument('city_level_event_reviews/route', {
    status: 'published',
    locationScope: 'route',
    publishedEventPath: 'events/route',
    spatialEvidence: { kind: 'route' },
  }, true);
  assert.ok(findings.some((entry) => entry.code === 'SPATIAL_REVIEW_BYPASSED'));
});

test('explicitly approved spatial publication is not called an auto-publish bypass', () => {
  const findings = auditSpatialReviewDocument('city_level_event_reviews/approved-route', {
    status: 'published',
    locationScope: 'route',
    locationReviewStatus: 'approved',
    resolvedBy: 'human-reviewer',
    resolvedAt: new Date(),
    publishedEventPath: 'events/approved-route',
    finalization: { action: 'publish_route' },
    spatialEvidence: { kind: 'route' },
  }, true);
  assert.ok(!findings.some((entry) => entry.code === 'SPATIAL_REVIEW_BYPASSED'));
});

test('missing live event behind a published review is critical', () => {
  const findings = auditSpatialReviewDocument('city_level_event_reviews/area', {
    status: 'published',
    locationScope: 'area',
    publishedEventPath: 'events/missing',
  }, false);
  assert.ok(findings.some((entry) => entry.code === 'SPATIAL_PUBLISHED_EVENT_MISSING'));
});

test('traffic advisory is flagged when published as an event', () => {
  const findings = auditSpatialEventDocument('events/traffic', {
    eventName: 'Traffic Advisory',
    venueId: null,
  });
  assert.ok(findings.some((entry) => entry.code === 'SPATIAL_TRAFFIC_NOTICE_PUBLISHED'));
});
