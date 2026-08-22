import assert from 'node:assert/strict';
import test from 'node:test';
import { EventData, VenueData } from '../types/index.js';
import { PublicSharedEventCandidateRecord } from '../types/sharedEvent.js';
import {
  buildPublicSharedEventData,
  extractSharedEventSubVenue,
  getRequiredCandidateReviewReason,
} from './sharedEventPublicPromotion.js';
import { getUntrustedPublicPromotionReason } from './sharedEventPublicTrust.js';

test('extractSharedEventSubVenue preserves a venue-scoped stage label', () => {
  assert.equal(
    extractSharedEventSubVenue(
      "Founders' Food Hall and Market - Group Stage",
      "Founders' Food Hall and Market"
    ),
    'Group Stage'
  );

  assert.equal(
    extractSharedEventSubVenue("Founders' Food Hall and Market", "Founders' Food Hall and Market"),
    ''
  );
});

test('buildPublicSharedEventData writes canonical venue event fields and private provenance metadata', () => {
  const venue = {
    id: 'venue_founders',
    name: "Founders' Food Hall and Market",
    address: '6 Prince Street, Charlottetown, PE',
    latitude: 46.234,
    longitude: -63.126,
    profileImage: 'https://example.com/profile.jpg',
  } as VenueData;
  const candidate: PublicSharedEventCandidateRecord = {
    id: 'candidate_123',
    ownerUid: 'user_123',
    ingestId: 'ingest_123',
    privateEventId: 'private_123',
    sourceUrl: 'https://www.facebook.com/share/p/example',
    sourcePlatform: 'facebook',
    sourceVisibility: 'public_verified',
    visibilityEvidence: {
      method: 'public_url_probe',
      checkedAt: '2026-06-18T12:00:00.000Z',
      reason: 'public metadata fetched',
      url: 'https://www.facebook.com/share/p/example',
    },
    title: 'BBQ on the Patio',
    description: 'Big Burger ($).',
    startDate: '2026-06-20',
    startTime: '16:00',
    locationName: "Founders' Food Hall and Market - Patio",
    mediaUrls: ['https://example.com/poster.jpg'],
    timezone: 'America/Halifax',
    sourceContentSignature: 'abc123',
    status: 'pending_validation',
  };

  const event = buildPublicSharedEventData(candidate, venue, 'Patio') as EventData & Record<string, unknown>;

  assert.equal(event.uniqueId, 'shared_public_candidate_123');
  assert.equal(event.establishment, "Founders' Food Hall and Market");
  assert.equal(event.eventName, 'BBQ on the Patio');
  assert.equal(event.category, 'Food Special');
  assert.equal(event.eventType, 'food_special');
  assert.equal(event.isFoodSpecial, true);
  assert.equal(event.isEvent, false);
  assert.equal(event.venueId, 'venue_founders');
  assert.equal(event.latitude, 46.234);
  assert.equal(event.longitude, -63.126);
  assert.equal(event.icon, 'https://example.com/profile.jpg');
  assert.equal(event.subVenue, 'Patio');
  assert.equal(event.locationLabel, 'Patio');
  assert.equal(event.imageUrl, 'https://example.com/poster.jpg');
  assert.equal(event.sharedEventCandidateId, 'candidate_123');
  assert.equal(event.sharedEventPrivateEventId, 'private_123');
});

test('crowd consensus candidates require independent contributors and never publish an owner uid', () => {
  const candidate = {
    id: 'crowd_abc',
    ownerUid: 'user-1',
    ingestId: 'ingest-1',
    privateEventId: 'private-1',
    sourcePlatform: 'unknown',
    sourceVisibility: 'user_private',
    promotionBasis: 'crowd_consensus',
    visibilityEvidence: {
      method: 'no_url',
      checkedAt: '2026-08-22T12:00:00.000Z',
      reason: 'crowd consensus',
    },
    title: 'Harbour Lights Concert',
    startDate: '2026-09-12',
    locationName: 'Victoria Park Cultural Pavilion',
    mediaUrls: [],
    timezone: 'America/Halifax',
    sourceContentSignature: 'crowd:abc',
    fieldSources: {
      title: 'crowd_consensus',
      startDate: 'crowd_consensus',
      locationName: 'crowd_consensus',
    },
    crowdConsensus: {
      aggregateId: 'abc',
      contributorCount: 3,
      threshold: 3,
      contributorRefs: [
        { ownerUid: 'user-1', ingestId: 'ingest-1', privateEventId: 'private-1' },
        { ownerUid: 'user-2', ingestId: 'ingest-2', privateEventId: 'private-2' },
        { ownerUid: 'user-3', ingestId: 'ingest-3', privateEventId: 'private-3' },
      ],
    },
    status: 'pending_validation',
  } as PublicSharedEventCandidateRecord;
  assert.equal(getRequiredCandidateReviewReason(candidate), '');

  const venue = {
    id: 'venue-victoria-park',
    name: 'Victoria Park Cultural Pavilion',
    latitude: 46.23,
    longitude: -63.14,
  } as VenueData;
  const event = buildPublicSharedEventData(candidate, venue) as EventData & Record<string, unknown>;
  assert.equal(event.sharedEventSource, 'crowd_shared_event_candidate');
  assert.equal('sharedEventOwnerUid' in event, false);
  assert.equal(event.imageUrl, '');

  candidate.crowdConsensus!.contributorRefs[2] = candidate.crowdConsensus!.contributorRefs[1];
  assert.equal(getRequiredCandidateReviewReason(candidate), 'crowd_contributors_not_independent');
});

test('crowd-promoted specials retain price and finite recurrence metadata', () => {
  const venue = {
    id: 'venue_harbour_house',
    name: 'Harbour House Bistro',
    address: '18 Queen Street, Charlottetown, PE',
    latitude: 46.23,
    longitude: -63.13,
  } as VenueData;
  const candidate = {
    id: 'crowd_special',
    ownerUid: 'user-1',
    ingestId: 'ingest-1',
    privateEventId: 'private-1',
    sourcePlatform: 'unknown',
    sourceVisibility: 'user_private',
    promotionBasis: 'crowd_consensus',
    visibilityEvidence: {
      method: 'no_url',
      checkedAt: '2026-08-22T12:00:00Z',
      reason: 'crowd',
    },
    title: 'Half-Price Mocktails',
    description: 'Tuesday-Friday happy hour.',
    contentKind: 'special',
    price: 'Half-Price',
    startDate: '2026-08-25',
    endDate: '2026-08-25',
    startTime: '16:00',
    endTime: '18:00',
    recurringPattern: 'weekly_custom',
    recurringDaysOfWeek: ['tuesday', 'wednesday', 'thursday', 'friday'],
    recurrenceUntilDate: '2026-09-30',
    locationName: 'Harbour House Bistro',
    mediaUrls: [],
    timezone: 'America/Halifax',
    sourceContentSignature: 'crowd:special',
    crowdConsensus: {
      aggregateId: 'aggregate-special',
      contributorCount: 3,
      threshold: 3,
      contributorRefs: [],
    },
    status: 'pending_validation',
  } as PublicSharedEventCandidateRecord;

  const event = buildPublicSharedEventData(candidate, venue) as EventData & Record<string, unknown>;
  assert.equal(event.isFoodSpecial, true);
  assert.equal(event.ticketPrice, 'Half-Price');
  assert.equal(event.isRecurring, true);
  assert.equal(event.recurringPattern, 'weekly_custom');
  assert.deepEqual(event.recurringDaysOfWeek, candidate.recurringDaysOfWeek);
  assert.equal(event.recurrenceUntilDate, '2026-09-30');
});

test('public shared-event promotion trust requires public-sourced event facts', () => {
  const trustedCandidate = {
    title: 'Kim Albert',
    startDate: '2026-06-20',
    startTime: '19:00',
    locationName: "Peake's Quay Restaurant & Bar",
    fieldSources: {
      title: 'public_source',
      startDate: 'public_source',
      startTime: 'public_source',
      locationName: 'public_source',
    },
  } as PublicSharedEventCandidateRecord;

  const untrustedCandidate = {
    ...trustedCandidate,
    fieldSources: {
      title: 'share_payload',
      startDate: 'uploaded_media',
      startTime: 'uploaded_media',
      locationName: 'public_source',
    },
  } as PublicSharedEventCandidateRecord;

  assert.equal(getUntrustedPublicPromotionReason(trustedCandidate), '');
  assert.equal(
    getUntrustedPublicPromotionReason(untrustedCandidate),
    'untrusted_public_fields:title,startDate,startTime'
  );
});

test('public shared-event promotion requires a real event title', () => {
  const placeholderCandidate = {
    title: 'Event',
    startDate: '2026-06-27',
    startTime: '17:00',
    locationName: "Founders' Food Hall & Market",
    fieldSources: {
      title: 'public_source',
      startDate: 'public_source',
      startTime: 'public_source',
      locationName: 'public_source',
    },
  } as PublicSharedEventCandidateRecord;

  assert.equal(getRequiredCandidateReviewReason(placeholderCandidate), 'generic_placeholder_title');
});
