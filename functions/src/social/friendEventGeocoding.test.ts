import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveFriendEventAddress,
  suggestFriendEventAddresses,
} from './friendEventGeocoding.js';

const customInput = {
  title: 'Backyard party',
  location: {
    type: 'custom_address',
    address: '  123  Water Street, Charlottetown PE  ',
    latitude: 0,
    longitude: 0,
  },
};

test('server geocoding replaces client preview coordinates without changing the private address', async () => {
  let requestedUrl = '';
  const resolved = await resolveFriendEventAddress(customInput, 'test-token', {
    fetchImpl: async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({
        features: [{ geometry: { coordinates: [-63.126, 46.234] } }],
      }), { status: 200 });
    },
  });
  const location = resolved.location as Record<string, unknown>;
  assert.equal(location.address, '123 Water Street, Charlottetown PE');
  assert.equal(location.latitude, 46.234);
  assert.equal(location.longitude, -63.126);
  assert.match(requestedUrl, /api\.mapbox\.com\/search\/geocode\/v6\/forward/);
  assert.equal(new URL(requestedUrl).searchParams.get('permanent'), 'true');
  const requestedTypes = new URL(requestedUrl).searchParams.get('types');
  assert.equal(requestedTypes, 'address,street,place,locality');
  assert.doesNotMatch(requestedTypes || '', /poi/);
});

test('server geocoding trims secret transport whitespace before calling Mapbox', async () => {
  let requestedUrl = '';
  await resolveFriendEventAddress(customInput, '  test-token\r\n', {
    fetchImpl: async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({
        features: [{ geometry: { coordinates: [-63.126, 46.234] } }],
      }), { status: 200 });
    },
  });
  assert.equal(new URL(requestedUrl).searchParams.get('access_token'), 'test-token');
});

test('production custom addresses fail closed without a server geocoding token', async () => {
  await assert.rejects(
    () => resolveFriendEventAddress(customInput, ''),
    /verification is temporarily unavailable/
  );
});

test('non-address locations never call the geocoder', async () => {
  const input = { location: { type: 'online', onlineUrl: 'https://example.com' } };
  const result = await resolveFriendEventAddress(input, 'test-token', {
    fetchImpl: async () => { throw new Error('should not run'); },
  });
  assert.equal(result, input);
});

test('address suggestions return a locally biased five-result autocomplete request', async () => {
  let requestedUrl = '';
  const result = await suggestFriendEventAddresses({
    query: '  9  Dale Drive ',
    proximityLatitude: 46.24,
    proximityLongitude: -63.13,
  }, ' test-token ', {
    fetchImpl: async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({
        features: [{
          id: 'address.1',
          properties: {
            name_preferred: '9 Dale Drive',
            place_formatted: 'Charlottetown, Prince Edward Island, Canada',
            full_address: '9 Dale Drive, Charlottetown, Prince Edward Island, Canada',
            coordinates: { latitude: 46.27233, longitude: -63.124694 },
          },
        }],
      }), { status: 200 });
    },
  });

  const url = new URL(requestedUrl);
  assert.equal(url.searchParams.get('q'), '9 Dale Drive');
  assert.equal(url.searchParams.get('autocomplete'), 'true');
  assert.equal(url.searchParams.get('limit'), '5');
  assert.equal(url.searchParams.get('types'), 'address');
  assert.equal(url.searchParams.get('proximity'), '-63.13,46.24');
  assert.equal(url.searchParams.get('access_token'), 'test-token');
  assert.deepEqual(result.suggestions, [{
    id: 'address.1',
    primaryText: '9 Dale Drive',
    secondaryText: 'Charlottetown, Prince Edward Island, Canada',
    fullAddress: '9 Dale Drive, Charlottetown, Prince Edward Island, Canada',
    latitude: 46.27233,
    longitude: -63.124694,
  }]);
});

test('address suggestions skip short queries without calling Mapbox', async () => {
  let called = false;
  const result = await suggestFriendEventAddresses({ query: '9 ' }, 'test-token', {
    fetchImpl: async () => {
      called = true;
      throw new Error('should not run');
    },
  });
  assert.deepEqual(result, { suggestions: [] });
  assert.equal(called, false);
});

test('address suggestions drop duplicate and malformed features', async () => {
  const result = await suggestFriendEventAddresses({ query: '12 Water' }, 'test-token', {
    fetchImpl: async () => new Response(JSON.stringify({
      features: [
        {
          id: 'address.1',
          properties: {
            name: '12 Water Street',
            place_formatted: 'Charlottetown, PE, Canada',
            full_address: '12 Water Street, Charlottetown, PE, Canada',
            coordinates: { latitude: 46.2, longitude: -63.1 },
          },
        },
        {
          id: 'address.duplicate',
          properties: {
            name: '12 Water Street',
            place_formatted: 'Charlottetown, PE, Canada',
            full_address: '12 Water Street, Charlottetown, PE, Canada',
            coordinates: { latitude: 46.2, longitude: -63.1 },
          },
        },
        {
          id: 'bad',
          properties: {
            name: 'Nowhere',
            coordinates: { latitude: 999, longitude: 0 },
          },
        },
      ],
    }), { status: 200 }),
  });
  assert.equal(result.suggestions.length, 1);
  assert.equal(result.suggestions[0]?.id, 'address.1');
});
