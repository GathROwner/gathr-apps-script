import assert from 'node:assert/strict';
import test from 'node:test';
import { ParsedSharedEvent } from '../types/sharedEvent.js';
import { resolveOrRequireSharedEventVenue } from './sharedEventVenueResolution.js';

function photoEvent(overrides: Partial<ParsedSharedEvent> = {}): ParsedSharedEvent {
  return {
    sourcePlatform: 'unknown',
    sourceVisibility: 'user_private',
    visibilityEvidence: { method: 'no_url', checkedAt: '2026-08-22T12:00:00Z', reason: 'photo' },
    routing: 'private_only',
    status: 'saved',
    title: 'Lantern Night',
    startDate: '2026-09-24',
    locationName: 'Maple Fox Community Studio',
    mediaUrls: ['https://example.com/owned.jpg'],
    timezone: 'America/Halifax',
    confidence: 94,
    needsUserReview: false,
    reviewReasons: [],
    sourceContentSignature: 'venue-resolution-test',
    ...overrides,
  };
}

test('known venue directory match resolves without Places selection', async () => {
  const resolved = await resolveOrRequireSharedEventVenue(photoEvent(), async () => ({
    isMatch: true,
    matchedVenue: {
      id: 'venue-maple-fox',
      pagename: 'Maple Fox Studio',
      address: '9 Dale Drive, Charlottetown, PE C1A 7V7',
      latitude: 46.25,
      longitude: -63.13,
    },
    confidence: 95,
  } as any));
  assert.equal(resolved.resolvedVenueId, 'venue-maple-fox');
  assert.equal(resolved.venueResolutionStatus, 'not_needed');
  assert.equal(resolved.locationScope, 'venue');
  assert.equal(resolved.address, '9 Dale Drive, Charlottetown, PE C1A 7V7');
});

test('unknown named venue without an address requires user selection', async () => {
  const resolved = await resolveOrRequireSharedEventVenue(photoEvent(), async () => ({
    isMatch: false,
    confidence: 0,
  } as any));
  assert.equal(resolved.venueResolutionStatus, 'selection_required');
  assert.equal(resolved.status, 'needs_user_review');
  assert.equal(resolved.needsUserReview, true);
  assert.ok(resolved.reviewReasons.includes('venue_selection_required'));
});

test('printed address and route geometry skip venue selection', async () => {
  const lookup = async () => {
    throw new Error('venue lookup should not run');
  };
  const addressed = await resolveOrRequireSharedEventVenue(photoEvent({
    address: '9 Dale Drive, Charlottetown, PE C1A 7V7',
  }), lookup as any);
  assert.equal(addressed.venueResolutionStatus, 'not_needed');

  const route = await resolveOrRequireSharedEventVenue(photoEvent({
    locationScope: 'route',
    mapMode: 'route',
  }), lookup as any);
  assert.equal(route.venueResolutionStatus, undefined);
});
