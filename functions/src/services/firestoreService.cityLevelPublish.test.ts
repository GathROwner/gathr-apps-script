import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPublishedCityLevelEventDataForRegression,
  evaluateCityLevelAutoPublishEligibilityForRegression,
} from './firestoreService.js';
import type { CityLevelEventReviewRecord } from '../types/index.js';

function baseRecord(overrides: Partial<CityLevelEventReviewRecord> = {}): CityLevelEventReviewRecord {
  return {
    status: 'needs_review',
    locationScope: 'city',
    locationLabel: 'Charlottetown, PEI',
    locationCity: 'Charlottetown',
    locationProvince: 'PEI',
    locationPrecision: 'city_centroid',
    locationReviewStatus: 'needs_review',
    eventName: 'Farm Day in the City',
    eventDate: '2026-09-13',
    occurrences: 1,
    sampleRows: [],
    ...overrides,
  } as CityLevelEventReviewRecord;
}

function autoPublishReadyRecord(overrides: Partial<CityLevelEventReviewRecord> = {}): CityLevelEventReviewRecord {
  return baseRecord({
    autoPublishSource: 'structured_facebook_event',
    autoPublishFieldSources: {
      title: 'facebook_event_name',
      dateTime: 'facebook_event_utc_start_date',
      location: 'facebook_event_location_name',
    },
    ...overrides,
  });
}

function evaluateWithAutoPublishEnabled(record: CityLevelEventReviewRecord) {
  const original = process.env.CITY_LEVEL_AUTO_PUBLISH;
  try {
    delete process.env.CITY_LEVEL_AUTO_PUBLISH;
    return evaluateCityLevelAutoPublishEligibilityForRegression(record);
  } finally {
    if (original === undefined) {
      delete process.env.CITY_LEVEL_AUTO_PUBLISH;
    } else {
      process.env.CITY_LEVEL_AUTO_PUBLISH = original;
    }
  }
}

test('published city-level event carries centroid coordinates for a recognized city', () => {
  const data = buildPublishedCityLevelEventDataForRegression('cityevt_test1', baseRecord());
  assert.equal(data.latitude, 46.2382);
  assert.equal(data.longitude, -63.1311);
  assert.equal(data.mapMode, 'area');
  assert.equal(data.locationReviewStatus, 'approved');
  assert.equal(data.locationScope, 'city');
  assert.equal(data.venueId, null);
});

test('published area-scope event resolves the downtown centroid', () => {
  const data = buildPublishedCityLevelEventDataForRegression(
    'cityevt_test2',
    baseRecord({
      locationScope: 'area',
      locationLabel: 'Downtown Charlottetown',
      locationCity: 'Charlottetown',
      locationPrecision: 'approximate',
    })
  );
  assert.equal(data.latitude, 46.2343);
  assert.equal(data.longitude, -63.1258);
  assert.equal(data.mapMode, 'area');
});

test('published event for an unrecognized place has no coordinates', () => {
  const data = buildPublishedCityLevelEventDataForRegression(
    'cityevt_test3',
    baseRecord({
      locationLabel: 'Borden-Carleton, PEI',
      locationCity: 'Borden-Carleton',
    })
  );
  assert.equal('latitude' in data, false);
  assert.equal('longitude' in data, false);
  assert.equal(data.mapMode, 'area');
});

test('manual locationCity override drives the centroid lookup', () => {
  const data = buildPublishedCityLevelEventDataForRegression(
    'cityevt_test4',
    baseRecord({ locationLabel: 'Somewhere, PEI', locationCity: 'Somewhere' }),
    { locationCity: 'Summerside', locationLabel: 'Summerside, PEI' }
  );
  assert.equal(data.latitude, 46.3959);
  assert.equal(data.longitude, -63.7876);
});

test('valid structured Facebook Event city candidate is eligible to auto-publish', () => {
  const result = evaluateWithAutoPublishEnabled(autoPublishReadyRecord());
  assert.equal(result.eligible, true);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.centroid?.latitude, 46.2382);
  assert.equal(result.centroid?.longitude, -63.1311);
});

test('province-only PEI city-level candidate stays in review', () => {
  const result = evaluateWithAutoPublishEnabled(autoPublishReadyRecord({
    locationScope: 'area',
    locationLabel: 'PEI',
    locationCity: undefined,
    locationProvince: 'PEI',
    locationPrecision: 'approximate',
  }));
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes('province_only_location'));
  assert.ok(result.reasons.includes('unsupported_city_or_area'));
});

test('loose text or parser-fallback city candidate stays in review', () => {
  const result = evaluateWithAutoPublishEnabled(baseRecord({
    autoPublishSource: 'parser_fallback',
    autoPublishFieldSources: {
      title: 'shared_post_text',
      dateTime: 'facebook_event_utc_start_date',
      location: 'facebook_event_location_name',
    },
  }));
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes('not_structured_facebook_event_source'));
  assert.ok(result.reasons.includes('untrusted_title_source'));
});

test('route-like or unsupported broad locations stay in review', () => {
  const result = evaluateWithAutoPublishEnabled(autoPublishReadyRecord({
    locationScope: 'area',
    locationLabel: 'Route 2, PEI',
    locationCity: undefined,
    locationPrecision: 'approximate',
  }));
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes('route_like_or_unsupported_location'));
});
