import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveFriendEventAddress } from './friendEventGeocoding.js';

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
