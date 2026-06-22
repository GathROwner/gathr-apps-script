import assert from 'node:assert/strict';
import test from 'node:test';
import { EventData, VenueData } from '../types/index.js';
import { PublicSharedEventCandidateRecord } from '../types/sharedEvent.js';
import {
  buildPublicSharedEventData,
  extractSharedEventSubVenue,
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
