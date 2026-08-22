import assert from 'node:assert/strict';
import test from 'node:test';
import { ParsedSharedEvent } from '../types/sharedEvent.js';
import {
  enrichPrivateSharedEventLocation,
  placeResultMatchesSharedAddress,
} from './sharedEventPrivateLocation.js';

const exactResult = {
  placeId: 'qa-address',
  name: 'QA address',
  formattedAddress: '42 Example Dr, Charlottetown, PE C1A 1A1, Canada',
  location: { lat: 46.25, lng: -63.1 },
  types: ['street_address'],
};

function privateEvent(): ParsedSharedEvent {
  return {
    sourcePlatform: 'unknown',
    sourceVisibility: 'user_private',
    visibilityEvidence: { method: 'no_url', checkedAt: '2026-08-22T12:00:00Z', reason: 'photo' },
    routing: 'private_only',
    status: 'saved',
    title: 'Neighbourhood Game Night',
    startDate: '2026-09-24',
    locationName: 'Maple Fox Community Studio',
    address: '42 Example Drive, Charlottetown PE C1A1A1',
    mediaUrls: ['https://example.com/owned.jpg'],
    timezone: 'America/Halifax',
    confidence: 95,
    needsUserReview: false,
    reviewReasons: [],
    sourceContentSignature: 'qa',
  };
}

test('private address matching rejects nearby but different street results', () => {
  assert.equal(placeResultMatchesSharedAddress(privateEvent().address!, exactResult), true);
  assert.equal(placeResultMatchesSharedAddress(privateEvent().address!, {
    ...exactResult,
    formattedAddress: '42 Queen St, Charlottetown, PE, Canada',
  }), false);
  assert.equal(placeResultMatchesSharedAddress(privateEvent().address!, {
    ...exactResult,
    formattedAddress: '43 Example Dr, Charlottetown, PE, Canada',
  }), false);
});

test('exact private address geocoding stores coordinates without creating a venue', async () => {
  const enriched = await enrichPrivateSharedEventLocation(
    privateEvent(),
    async () => exactResult
  );
  assert.equal(enriched.latitude, 46.25);
  assert.equal(enriched.longitude, -63.1);
  assert.equal(enriched.locationScope, 'unknown');
  assert.equal(enriched.locationPrecision, 'exact');
});
