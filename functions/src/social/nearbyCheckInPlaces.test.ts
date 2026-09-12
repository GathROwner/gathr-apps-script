import assert from 'node:assert/strict';
import test from 'node:test';

import { parsePublicNearbyPlaces } from './nearbyCheckInPlaces.js';

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
