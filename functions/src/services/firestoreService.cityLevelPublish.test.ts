import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPublishedCityLevelEventDataForRegression,
  buildPublishedCityLevelMediaFieldsForRegression,
  evaluateCityLevelAutoPublishEligibilityForRegression,
} from './firestoreService.js';
import type { CityLevelEventReviewRecord } from '../types/index.js';
import {structuredMediaSignature} from './structuredLocationContract.js';
import {bindFamilyAudienceEvidence} from '../utils/familyFriendlyScoring.js';

test('reviewed broad publication scores scoped evidence and invalidates it when identity is edited', () => {
  const record=baseRecord({eventName:'Community Concert',eventDate:'2026-10-17',description:'An afternoon programme.'});
  record.familyAudienceEvidence=bindFamilyAudienceEvidence({eventName:record.eventName,startDate:record.eventDate,establishment:record.locationLabel},'Family-friendly programme.','validated_item','source');
  const payload=buildPublishedCityLevelEventDataForRegression('review-fixture',record);
  assert(payload.familyFriendlyScore!>=60);
  const edited=buildPublishedCityLevelEventDataForRegression('review-fixture',record,{eventName:'Adult Drawing Workshop',description:'Adults only.'});
  assert.equal(edited.familyFriendlyScore,0);
});

test('published refresh retains reviewed event proof when its historical review has no audience metadata', () => {
  const record=baseRecord({eventName:'Community Hunt',eventDate:'2026-10-17',description:'Visit participating displays.'});
  const previous=buildPublishedCityLevelEventDataForRegression('review-fixture',record);
  previous.familyAudienceEvidence=bindFamilyAudienceEvidence(previous,'A reviewed family-friendly activity.','reviewed_activity','source');
  const refreshed=buildPublishedCityLevelEventDataForRegression('review-fixture',record,{description:'An updated description of the same displays.'},{},previous);
  assert(refreshed.familyFriendlyScore!>=60);
  assert.deepEqual(refreshed.familyAudienceEvidence,previous.familyAudienceEvidence);
  const again=buildPublishedCityLevelEventDataForRegression('review-fixture',record,{description:refreshed.description},{},refreshed);
  assert.deepEqual(again.familyAudienceEvidence,refreshed.familyAudienceEvidence);
});

test('published refresh cannot carry previous proof to a changed identity or override a fresh adult restriction', () => {
  const record=baseRecord({eventName:'Community Hunt',eventDate:'2026-10-17',description:'Visit participating displays.'});
  const previous=buildPublishedCityLevelEventDataForRegression('review-fixture',record);
  previous.familyAudienceEvidence=bindFamilyAudienceEvidence(previous,'A reviewed family-friendly activity.','reviewed_activity','source');
  const restricted=buildPublishedCityLevelEventDataForRegression('review-fixture',record,{description:'Adults only. 19+'},{},previous);
  assert.equal(restricted.familyFriendlyScore,0);
  const changed=buildPublishedCityLevelEventDataForRegression('review-fixture',record,{eventDate:'2026-10-18'},{},previous);
  assert(changed.familyFriendlyScore!<60);
  assert.equal(changed.familyAudienceEvidence,null);
});

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
    sourceContentSignature: 'synthetic-source-v1',
    structuredLocationValidation: {version: 1, sourceSignature: 'synthetic-source-v1', mediaSignature: structuredMediaSignature([]), decision: 'broad',
      posterStatus: 'no_media', evidence: [], reasons: []},
    autoPublishFieldSources: {
      title: 'facebook_event_name',
      dateTime: 'facebook_event_utc_start_date',
      location: 'facebook_event_location_name',
    },
    ...overrides,
  });
}

function highConfidencePostDerivedAreaRecord(
  overrides: Partial<CityLevelEventReviewRecord> = {}
): CityLevelEventReviewRecord {
  return baseRecord({
    locationScope: 'area',
    locationLabel: 'Alberton Town Pond, PEI',
    locationCity: 'Alberton',
    locationPrecision: 'approximate',
    autoPublishSource: 'parser_fallback',
    autoPublishFieldSources: {
      title: 'parser_event_name',
      dateTime: 'parser_event_datetime',
      location: 'parser_event_location',
    },
    autoPublishReviewReasons: ['post_derived_area_candidate'],
    ...overrides,
  });
}

function highConfidencePostDerivedCityRecord(
  overrides: Partial<CityLevelEventReviewRecord> = {}
): CityLevelEventReviewRecord {
  return baseRecord({
    locationScope: 'city',
    locationLabel: 'Charlottetown, PEI',
    locationCity: 'Charlottetown',
    locationPrecision: 'city_centroid',
    eventName: 'PEI International Shellfish Festival',
    eventDate: '2026-09-17',
    eventTime: '17:00',
    autoPublishSource: 'parser_fallback',
    autoPublishFieldSources: {
      title: 'parser_event_name',
      dateTime: 'parser_event_datetime',
      location: 'parser_event_location',
    },
    autoPublishReviewReasons: ['post_derived_area_candidate'],
    organizerName: 'PEI International Shellfish Festival',
    ticketsBuyUrl: 'https://peishellfish.com/competitions/garland-canada-international-chef-challenge/',
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

test('structured city publication rejects an old signature without current validation', () => {
  const result = evaluateWithAutoPublishEnabled(autoPublishReadyRecord({structuredLocationValidation: undefined}));
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes('missing_current_structured_location_validation'));
});

test('structured venue and clock holds cannot pass city auto publication', () => {
  const base = autoPublishReadyRecord();
  for (const decision of ['hold', 'venue'] as const) {
    assert.equal(evaluateWithAutoPublishEnabled({...base, structuredLocationValidation: {...base.structuredLocationValidation!, decision,
      reasons: decision === 'hold' ? ['structured_poster_start_conflict'] : []}}).eligible, false);
  }
});

test('city builder preserves timing evidence and rejects a retired venue keeper redirect', () => {
  const record = autoPublishReadyRecord({eventTime: '19:30', endTime: '22:00',
    timeFlags: {start: {source: 'explicit', evidence: '7:30 PM'}, end: {source: 'explicit', evidence: '10 PM', toClose: false}},
    timeResolution: {hoursUsed: false}});
  const published = buildPublishedCityLevelEventDataForRegression('synthetic', record);
  assert.deepEqual(published.timeFlags, record.timeFlags);
  assert.deepEqual(published.timeResolution, record.timeResolution);
  assert.throws(() => buildPublishedCityLevelEventDataForRegression('synthetic', {...record, publishedEventPath: 'venues/hall/events/keeper'}), /validated venue/);
  assert.throws(() => buildPublishedCityLevelEventDataForRegression('synthetic', {...record,
    structuredLocationValidation: {...record.structuredLocationValidation!, decision: 'venue', venueId: 'hall'}}), /validated venue/);
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

test('published Summerside area-scope event resolves the downtown centroid', () => {
  const data = buildPublishedCityLevelEventDataForRegression(
    'cityevt_test2b',
    baseRecord({
      locationScope: 'area',
      locationLabel: 'Downtown Summerside',
      locationCity: 'Summerside',
      locationPrecision: 'approximate',
    })
  );
  assert.equal(data.latitude, 46.3909);
  assert.equal(data.longitude, -63.7884);
  assert.equal(data.mapMode, 'area');
});

test('unapproved post-derived area candidates stay in review even when their centroid resolves', () => {
  const result = evaluateWithAutoPublishEnabled(baseRecord({
    locationScope: 'area',
    locationLabel: 'Downtown Summerside',
    locationCity: 'Summerside',
    locationPrecision: 'approximate',
    autoPublishSource: 'parser_fallback',
    autoPublishFieldSources: {
      title: 'parser_event_name',
      dateTime: 'parser_event_datetime',
      location: 'parser_event_location',
    },
    autoPublishReviewReasons: ['post_derived_area_candidate'],
  }));
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes('not_structured_facebook_event_source'));
  assert.ok(result.reasons.includes('untrusted_title_source'));
  assert.ok(result.reasons.includes('untrusted_datetime_source'));
  assert.ok(result.reasons.includes('untrusted_location_source'));
  assert.ok(result.reasons.includes('not_high_confidence_post_derived_area_location'));
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

test('city-level media publish omits failed Facebook lookaside crawler image URLs', async () => {
  const lookasideUrl = 'https://lookaside.fbsbx.com/lookaside/crawler/media/?media_id=1607254180584029';
  const mediaFields = await buildPublishedCityLevelMediaFieldsForRegression(
    baseRecord({
      eventName: '2026 Just Live Fun Run',
      imageUrl: lookasideUrl,
      mediaUrls: [lookasideUrl],
    }),
    {},
    {
      uploadUrl: 'https://uploads.example.test/image',
      convertImageUrlToManaged: async () => null,
      deleteValue: 'deleteField',
    }
  );

  assert.deepEqual(mediaFields, {
    imageUrl: 'deleteField',
    image: 'deleteField',
    relevantImageUrl: 'deleteField',
    mediaUrls: 'deleteField',
    imageProvenance: 'deleteField',
  });
});

test('city-level media publish preserves ordinary direct image URLs when upload conversion fails', async () => {
  const directImageUrl = 'https://example.com/poster.jpg';
  const mediaFields = await buildPublishedCityLevelMediaFieldsForRegression(
    baseRecord({
      imageUrl: directImageUrl,
      mediaUrls: [directImageUrl],
    }),
    {},
    {
      uploadUrl: 'https://uploads.example.test/image',
      convertImageUrlToManaged: async () => null,
    }
  );

  assert.equal(mediaFields.imageUrl, directImageUrl);
  assert.equal(mediaFields.image, directImageUrl);
  assert.equal(mediaFields.relevantImageUrl, directImageUrl);
  assert.deepEqual(mediaFields.mediaUrls, [directImageUrl]);
});

test('valid structured Facebook Event city candidate is eligible to auto-publish', () => {
  const result = evaluateWithAutoPublishEnabled(autoPublishReadyRecord());
  assert.equal(result.eligible, true);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.centroid?.latitude, 46.2382);
  assert.equal(result.centroid?.longitude, -63.1311);
});

test('high-confidence post-derived Alberton Town Pond area candidate is eligible to auto-publish', () => {
  const result = evaluateWithAutoPublishEnabled(highConfidencePostDerivedAreaRecord());
  assert.equal(result.eligible, true);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.centroid?.latitude, 46.8128);
  assert.equal(result.centroid?.longitude, -64.0659);
});

test('high-confidence post-derived Main Street Alberton area candidate is eligible to auto-publish', () => {
  const result = evaluateWithAutoPublishEnabled(highConfidencePostDerivedAreaRecord({
    locationLabel: 'Main Street, Alberton, PEI',
    locationCity: 'Alberton',
  }));
  assert.equal(result.eligible, true);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.centroid?.latitude, 46.8128);
  assert.equal(result.centroid?.longitude, -64.0659);
});

test('post-derived Shellfish Festival city candidate stays in review because it should venue-route', () => {
  const result = evaluateWithAutoPublishEnabled(highConfidencePostDerivedCityRecord());
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes('not_high_confidence_post_derived_city_event'));
});

test('unapproved post-derived city candidate stays in review', () => {
  const result = evaluateWithAutoPublishEnabled(highConfidencePostDerivedCityRecord({
    eventName: 'Temporary Traffic Disruption - Route 2 Winsloe (Traffic Advisory)',
    eventDate: '2026-07-30',
    organizerName: 'Milton Community Hall',
    ticketsBuyUrl: undefined,
  }));
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes('not_high_confidence_post_derived_city_event'));
});

test('post-derived area candidate with blocker reason stays in review', () => {
  const result = evaluateWithAutoPublishEnabled(highConfidencePostDerivedAreaRecord({
    locationLabel: 'Main Street, Alberton, PEI',
    locationCity: 'Alberton',
    autoPublishReviewReasons: [
      'post_derived_area_candidate',
      'route_like_or_unsupported_location',
    ],
  }));
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes('blocking_post_derived_area_reason'));
});

test('post-derived city candidate with route-like blocker stays in review', () => {
  const result = evaluateWithAutoPublishEnabled(highConfidencePostDerivedCityRecord({
    autoPublishReviewReasons: [
      'post_derived_area_candidate',
      'route_like_or_unsupported_location',
    ],
  }));
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes('blocking_post_derived_area_reason'));
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

test('province scope requires manual reviewer approval even when it has a PEI reference anchor', () => {
  const result = evaluateWithAutoPublishEnabled(autoPublishReadyRecord({
    locationScope: 'province' as any,
    locationLabel: 'Across Prince Edward Island',
    locationProvince: 'PEI',
    locationPrecision: 'none',
  }));
  // Automatic ingestion remains intentionally conservative; this coverage
  // scope is for explicit reviewer approval, not province-only auto-publish.
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes('province_scope_requires_manual_review'));
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

test('route-scoped parser candidate cannot auto-publish even with a recognized city', () => {
  const result = evaluateWithAutoPublishEnabled(autoPublishReadyRecord({
    locationScope: 'route',
    locationLabel: 'Gold Cup Parade Route',
    locationCity: 'Charlottetown',
    locationPrecision: 'approximate',
    spatialEvidence: {
      version: 1,
      kind: 'route',
      representation: 'route',
      confidence: 'high',
      ordered: true,
      locations: [],
      confirmedStreets: ['Queen Street'],
      routeEvidenceLevel: 'official_partial_route',
      reviewReasons: ['route_candidate_requires_geometry_review'],
    },
  }));
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes('route_candidate_requires_geometry_review'));
  assert.ok(result.reasons.includes('spatial_event_requires_review'));
  assert.equal(result.centroid, undefined);
});

test('multi-location parser candidate cannot auto-publish at an area centroid', () => {
  const result = evaluateWithAutoPublishEnabled(highConfidencePostDerivedAreaRecord({
    spatialEvidence: {
      version: 1,
      kind: 'multi_location',
      representation: 'area',
      confidence: 'high',
      ordered: false,
      locations: [
        { label: 'Victoria Row', role: 'location', certainty: 'confirmed' },
        { label: "Peake's Quay", role: 'location', certainty: 'confirmed' },
      ],
      confirmedStreets: [],
      reviewReasons: ['multi_location_requires_point_resolution'],
    },
    autoPublishReviewReasons: [
      'post_derived_area_candidate',
      'multi_location_requires_point_resolution',
    ],
  }));
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes('spatial_event_requires_review'));
  assert.ok(result.reasons.includes('blocking_post_derived_area_reason'));
});
