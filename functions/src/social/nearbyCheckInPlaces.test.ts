import assert from 'node:assert/strict';
import test from 'node:test';

import { parsePublicNearbyPlaces } from './nearbyCheckInPlaces.js';

const origin = { latitude: 46.2382, longitude: -63.1311 };

function poi(overrides: Record<string, unknown> = {}) {
  return {
    type: 'Feature',
    geometry: { coordinates: [-63.131, 46.23825] },
    properties: {
      mapbox_id: 'poi.the-oak',
      feature_type: 'poi',
      name: 'The Oak Downtown',
      full_address: '172 Great George St, Charlottetown, PE, Canada',
      poi_category: ['pub', 'restaurant'],
      ...overrides,
    },
  };
}

test('nearby parsing keeps only deduplicated public POIs within range', () => {
  const result = parsePublicNearbyPlaces({
    features: [
      poi(),
      poi({ mapbox_id: 'poi.duplicate' }),
      poi({ mapbox_id: 'address.1', feature_type: 'address', name: '172 Great George St' }),
      poi({ mapbox_id: 'poi.home', name: 'Private Home', poi_category: ['residential'] }),
      {
        ...poi({ mapbox_id: 'poi.far', name: 'Far Cafe' }),
        geometry: { coordinates: [-63.15, 46.25] },
      },
      poi({ mapbox_id: '', name: 'Missing id' }),
    ],
  }, origin);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.name, 'The Oak Downtown');
  assert.equal(result[0]?.category, 'pub');
  assert.match(result[0]?.locationKey || '', /^external:[a-f0-9]{32}$/);
  assert.ok((result[0]?.distanceMetres || 1_000) < 20);
});

test('nearby parsing rejects address-only and residence-like results', () => {
  const result = parsePublicNearbyPlaces({
    features: [
      poi({ feature_type: 'address', mapbox_id: 'address.2' }),
      poi({ mapbox_id: 'poi.apartment', poi_category: ['apartment'] }),
      poi({ mapbox_id: 'poi.house', poi_category: ['house'] }),
    ],
  }, origin);
  assert.deepEqual(result, []);
});
