import assert from 'node:assert/strict';
import test from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';

import {
  approximatePrivateLocation,
  discoverNearbyCheckInPlaces,
  NEARBY_EXTERNAL_LOOKUP_UNAVAILABLE_CONDITION,
  parsePublicNearbyPlaces,
  selectNearbyPlaceCandidateSlots,
} from './nearbyCheckInPlaces.js';

const origin = { latitude: 46.2382, longitude: -63.1311 };

function poi(overrides: Record<string, unknown> = {}) {
  return {
    type: 'node',
    id: 6595141644,
    lat: 46.23825,
    lon: -63.131,
    tags: {
      name: 'The Oak Downtown',
      amenity: 'pub',
      'addr:housenumber': '156',
      'addr:street': 'Great George Street',
      'addr:city': 'Charlottetown',
      'addr:province': 'Prince Edward Island',
      ...overrides,
    },
  };
}

function fakeDiscoveryDb(venues: Array<{ id: string; data: Record<string, unknown> }> = []) {
  const venueDocs = venues.map((venue) => ({ id: venue.id, data: () => venue.data }));
  return {
    collection(name: string) {
      if (name === 'venues') {
        return {
          limit: () => ({ get: async () => ({ docs: venueDocs }) }),
        };
      }
      if (name === 'checkInPlaceCandidates') {
        return { doc: (id: string) => ({ id }) };
      }
      throw new Error(`Unexpected collection: ${name}`);
    },
    batch() {
      return { set: () => undefined, commit: async () => undefined };
    },
  };
}

const discoveryNow = Timestamp.fromMillis(1_700_000_000_000);
const discoveryInput = {
  latitude: origin.latitude,
  longitude: origin.longitude,
  accuracyMeters: 5,
  capturedAtMs: discoveryNow.toMillis(),
};

test('nearby parsing keeps only deduplicated public POIs within range', () => {
  const result = parsePublicNearbyPlaces({
    elements: [
      poi(),
      { ...poi(), id: 6595141645 },
      { type: 'node', id: 9, lat: 46.23825, lon: -63.131, tags: { name: '156 Great George St' } },
      poi({ name: 'Private Home', amenity: 'residential' }),
      {
        ...poi({ name: 'Far Cafe' }),
        id: 123,
        lat: 46.25,
        lon: -63.15,
      },
      { ...poi({ name: 'Missing id' }), id: '' },
    ],
  }, origin);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.name, 'The Oak Downtown');
  assert.equal(result[0]?.category, 'pub');
  assert.equal(result[0]?.address, '156 Great George Street, Charlottetown, Prince Edward Island');
  assert.match(result[0]?.locationKey || '', /^external:[a-f0-9]{32}$/);
  assert.ok((result[0]?.distanceMetres || 1_000) < 20);
});

test('nearby parsing rejects address-only and residence-like results', () => {
  const result = parsePublicNearbyPlaces({
    elements: [
      { type: 'node', id: 2, lat: 46.23825, lon: -63.131, tags: { name: 'Address only' } },
      { ...poi({ amenity: 'apartment' }), id: 3 },
      { ...poi({ amenity: 'house' }), id: 4 },
    ],
  }, origin);
  assert.deepEqual(result, []);
});

test('nearby selection reserves room for unknown public places in dense venue areas', () => {
  const canonical = ['known-1', 'known-2', 'known-3', 'known-4', 'known-5', 'known-6'];
  const external = ['unknown-1', 'unknown-2', 'unknown-3'];
  const selected = selectNearbyPlaceCandidateSlots(canonical, external);

  assert.deepEqual(selected.canonical, ['known-1', 'known-2', 'known-3']);
  assert.deepEqual(selected.external, ['unknown-1', 'unknown-2']);
});

test('nearby discovery returns canonical venues when every external provider is unavailable', async () => {
  const result = await discoverNearbyCheckInPlaces('alice', discoveryInput, {
    db: fakeDiscoveryDb([{ id: 'known-venue', data: {
      pagename: 'Known GathR venue', latitude: origin.latitude, longitude: origin.longitude,
    } }]) as never,
    now: discoveryNow,
    fetchImpl: async () => { throw new Error('provider unavailable'); },
  });

  assert.equal(result.externalLookupStatus, 'partial_unavailable');
  assert.deepEqual(result.candidates.map((candidate) => candidate.venueId), ['known-venue']);
});

test('nearby discovery reports a typed retryable condition when no canonical venue survives provider failure', async () => {
  await assert.rejects(
    () => discoverNearbyCheckInPlaces('alice', discoveryInput, {
      db: fakeDiscoveryDb() as never,
      now: discoveryNow,
      fetchImpl: async () => { throw new Error('provider unavailable'); },
    }),
    (error: unknown) => {
      const domainError = error as { code?: string; details?: { condition?: string; retryable?: boolean } };
      return domainError.code === 'unavailable'
        && domainError.details?.condition === NEARBY_EXTERNAL_LOOKUP_UNAVAILABLE_CONDITION
        && domainError.details?.retryable === true;
    }
  );
});

test('nearby discovery labels a successful empty external search as complete', async () => {
  const result = await discoverNearbyCheckInPlaces('alice', discoveryInput, {
    db: fakeDiscoveryDb() as never,
    now: discoveryNow,
    fetchImpl: async () => new Response(JSON.stringify({ elements: [] }), { status: 200 }),
  });

  assert.equal(result.externalLookupStatus, 'complete');
  assert.deepEqual(result.candidates, []);
});

test('nearby discovery labels a successful external search as complete and keeps its candidate', async () => {
  const result = await discoverNearbyCheckInPlaces('alice', discoveryInput, {
    db: fakeDiscoveryDb() as never,
    now: discoveryNow,
    fetchImpl: async () => new Response(JSON.stringify({ elements: [poi()] }), { status: 200 }),
  });

  assert.equal(result.externalLookupStatus, 'complete');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0]?.name, 'The Oak Downtown');
  assert.equal(result.candidates[0]?.type, 'external_place');
});

test('private locations are projected to a neighbourhood-sized server grid', () => {
  const exact = { latitude: 46.25391, longitude: -63.13988 };
  const projected = approximatePrivateLocation(exact.latitude, exact.longitude);
  const repeated = approximatePrivateLocation(exact.latitude, exact.longitude);

  assert.deepEqual(projected, repeated);
  assert.notDeepEqual(projected, exact);
  assert.ok(Math.abs(projected.latitude - exact.latitude) < 0.01);
  assert.ok(Math.abs(projected.longitude - exact.longitude) < 0.015);
});
