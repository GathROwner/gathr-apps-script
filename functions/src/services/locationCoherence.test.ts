import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addressLocationKey,
  addressesLikelyEquivalent,
  assessVenueLocationCandidate,
  coordinateDistanceMeters,
  coordinatesFromLocationRecord,
  resolveVenueScopedEventLocation,
  synchronizedCoordinateFields,
} from './locationCoherence.js';

test('treats common street and postal formatting variants as one location', () => {
  assert.equal(
    addressesLikelyEquivalent(
      '1 Weymouth St, Charlottetown, PE C1A 8W1',
      '1 Weymouth Street, Charlottetown, P.E.I. C1A 7M8, Canada'
    ),
    true
  );
  assert.equal(addressLocationKey('46 Kensington Road, Charlottetown, PE C1A 5H7, Canada'), '46 kensington rd charlottetown');
});

test('reads top-level, nested, and Firestore GeoPoint-style coordinates', () => {
  assert.deepEqual(coordinatesFromLocationRecord({ latitude: '46.2', longitude: '-63.1' }), { latitude: 46.2, longitude: -63.1 });
  assert.deepEqual(coordinatesFromLocationRecord({ coordinates: { latitude: 46.3, longitude: -63.2 } }), { latitude: 46.3, longitude: -63.2 });
  assert.deepEqual(coordinatesFromLocationRecord({ coordinates: { _latitude: 46.4, _longitude: -63.3 } }), { latitude: 46.4, longitude: -63.3 });
});

test('rejects a PEI address paired with Chicago coordinates', () => {
  const result = assessVenueLocationCandidate({
    expectedAddress: '18 Queen St, Charlottetown, PE C1A 4A1, Canada',
    candidateAddress: '18 Queen St, Charlottetown, PE C1A 4A1, Canada',
    candidate: { latitude: 41.9087566, longitude: -87.6604734, googlePlaceId: 'wrong-place' },
  });
  assert.equal(result.decision, 'reject');
  assert.ok(result.reasons.includes('coordinates_outside_allowed_regions'));
});

test('quarantines the exact stale Port coordinate move', () => {
  const result = assessVenueLocationCandidate({
    existing: { address: '1 Weymouth St, Charlottetown, PE C1A 8W1', latitude: 46.233726, longitude: -63.11874, googlePlaceId: 'port' },
    expectedAddress: '1 Weymouth St, Charlottetown, PE C1A 8W1',
    candidateAddress: '1 Weymouth Street, Charlottetown, PE C1A 7M8, Canada',
    candidate: { latitude: 46.2368332, longitude: -63.1273142, googlePlaceId: 'port' },
  });
  assert.equal(result.decision, 'reject');
  assert.ok(result.reasons.includes('coordinate_move_requires_manual_review'));
  assert.ok((result.moveDistanceMeters || 0) > 700);
});

test('rejects a Places result whose address conflicts with the canonical venue', () => {
  const result = assessVenueLocationCandidate({
    existing: { address: '46 Kensington Road, Charlottetown, PE C1A 5H7, Canada', latitude: 46.2458204, longitude: -63.1171685, googlePlaceId: 'preserve-company' },
    expectedAddress: '46 Kensington Road, Charlottetown, PE C1A 5H7, Canada',
    candidateAddress: '2841 New Glasgow Rd, New Glasgow, PE C0A 1N0, Canada',
    candidate: { latitude: 46.4091112, longitude: -63.3481532, googlePlaceId: 'preserve-company' },
  });
  assert.equal(result.decision, 'reject');
  assert.ok(result.reasons.includes('candidate_address_conflicts_with_canonical_address'));
  assert.ok(result.reasons.includes('coordinate_move_requires_manual_review'));
});

test('rejects a new Library venue when its Google identity resolves to PEI Preserve Company', () => {
  const result = assessVenueLocationCandidate({
    expectedAddress: 'Dominion Building, 97 Queen St, Charlottetown, PE C1A 4A9',
    candidateAddress: '2841 New Glasgow Rd, New Glasgow, PE C0A 1N0, Canada',
    candidate: {
      latitude: 46.4091112,
      longitude: -63.3481532,
      googlePlaceId: 'ChIJVWSVqHK6X0sR1lrS8Xbhp4c',
    },
  });

  assert.equal(result.decision, 'reject');
  assert.deepEqual(result.reasons, ['candidate_address_conflicts_with_canonical_address']);
});

test('accepts a small same-address coordinate refinement', () => {
  const result = assessVenueLocationCandidate({
    existing: { address: '46 Kensington Road, Charlottetown, PE C1A 5H7, Canada', latitude: 46.2458204, longitude: -63.1171685, googlePlaceId: 'eastlink' },
    expectedAddress: '46 Kensington Rd, Charlottetown, PE C1A 5H6, Canada',
    candidateAddress: '46 Kensington Rd, Charlottetown, PE C1A 5H6, Canada',
    candidate: { latitude: 46.245193, longitude: -63.1174029, googlePlaceId: 'eastlink' },
  });
  assert.equal(result.decision, 'accept');
  assert.ok((result.moveDistanceMeters || Infinity) < 100);
});

test('requires manual review before replacing an established Google Place identity', () => {
  const result = assessVenueLocationCandidate({
    existing: {
      address: '119 Grafton St, Charlottetown, PE',
      latitude: 46.2349273,
      longitude: -63.1276278,
      googlePlaceId: 'be-you',
    },
    expectedAddress: '119 Grafton St, Charlottetown, PE',
    candidateAddress: '119 Grafton Street, Charlottetown, PE',
    candidate: {
      latitude: 46.23493,
      longitude: -63.12763,
      googlePlaceId: 'different-place',
    },
  });

  assert.equal(result.decision, 'reject');
  assert.ok(result.reasons.includes('google_place_id_change_requires_manual_review'));
});

test('replaces same-address event coordinates with the canonical venue point', () => {
  const result = resolveVenueScopedEventLocation({
    event: { address: '124 Heather Moyse Dr, Summerside, PE C1N 5R1, Canada', latitude: 46.3931755, longitude: -63.7688332 },
    venue: { address: '124 Heather Moyse Drive, Summerside, PE C1N 1A9, Canada', latitude: 46.3893775, longitude: -63.7857654 },
  });
  assert.equal(result.decision, 'accept');
  assert.equal(result.source, 'venue');
  assert.deepEqual(result.coordinates, { latitude: 46.3893775, longitude: -63.7857654 });
  assert.ok(result.reasons.includes('event_coordinates_replaced_with_canonical_venue_coordinates'));
});

test('preserves a distinct in-region off-site event location', () => {
  const eventCoordinates = { latitude: 46.25, longitude: -63.2 };
  const result = resolveVenueScopedEventLocation({
    event: { address: '100 Different Road, Charlottetown, PE', ...eventCoordinates },
    venue: { address: '46 Kensington Road, Charlottetown, PE', latitude: 46.245193, longitude: -63.1174029 },
  });
  assert.equal(result.decision, 'accept');
  assert.equal(result.source, 'event');
  assert.deepEqual(result.coordinates, eventCoordinates);
});

test('rejects an off-site event outside the configured region', () => {
  const result = resolveVenueScopedEventLocation({
    event: { address: '18 Queen St, Charlottetown, PE', latitude: 41.9087566, longitude: -87.6604734 },
    venue: { address: '146 Richmond St, Charlottetown, PE', latitude: 46.2340802, longitude: -63.1263026 },
  });
  assert.equal(result.decision, 'reject');
  assert.ok(result.reasons.includes('event_coordinates_outside_allowed_regions'));
});

test('emits identical top-level and nested coordinates', () => {
  assert.deepEqual(synchronizedCoordinateFields({ latitude: 46.2, longitude: -63.1 }), {
    latitude: 46.2,
    longitude: -63.1,
    coordinates: { latitude: 46.2, longitude: -63.1 },
  });
});

test('distance calculation remains stable for the known Eastlink mismatch', () => {
  const distance = coordinateDistanceMeters(
    { latitude: 46.2458204, longitude: -63.1171685 },
    { latitude: 46.4091112, longitude: -63.3481532 }
  );
  assert.ok(distance > 25000 && distance < 26000);
});
