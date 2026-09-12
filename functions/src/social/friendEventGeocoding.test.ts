import assert from 'node:assert/strict';
import test from 'node:test';

import {
  retrieveFriendEventLocationSuggestion,
  resolveFriendEventAddress,
  suggestFriendEventLocations,
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

test('server geocoding replaces every temporary preview field with storable OSM values', async () => {
  let requestedUrl = '';
  const resolved = await resolveFriendEventAddress({
    ...customInput,
    location: {
      ...customInput.location,
      placeName: 'Temporary preview name',
      address: 'Temporary preview address, Charlottetown PE',
    },
  }, {
    fetchImpl: async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify([{
        lat: '46.234',
        lon: '-63.126',
        name: 'OpenStreetMap place name',
        display_name: '123 Water Street, Charlottetown, Prince Edward Island, Canada',
        address: { house_number: '123' },
      }]), { status: 200 });
    },
  });
  const location = resolved.location as Record<string, unknown>;
  assert.equal(location.placeName, 'OpenStreetMap place name');
  assert.equal(location.address, '123 Water Street, Charlottetown, Prince Edward Island, Canada');
  assert.equal(location.latitude, 46.234);
  assert.equal(location.longitude, -63.126);
  const requested = new URL(requestedUrl);
  assert.equal(requested.hostname, 'nominatim.openstreetmap.org');
  assert.equal(requested.pathname, '/search');
  assert.equal(requested.searchParams.get('q'), 'Temporary preview address, Charlottetown PE');
  assert.equal(requested.searchParams.get('countrycodes'), 'ca');
  assert.equal(requested.searchParams.get('addressdetails'), '1');
  assert.equal(requested.searchParams.has('permanent'), false);
});

test('server geocoding identifies GathR and requests JSON from Nominatim', async () => {
  let requestedUrl = '';
  let requestedHeaders: unknown;
  await resolveFriendEventAddress(customInput, {
    fetchImpl: async (input, init) => {
      requestedUrl = String(input);
      requestedHeaders = init?.headers;
      return new Response(JSON.stringify([{
        lat: '46.234',
        lon: '-63.126',
        display_name: '123 Water Street, Charlottetown, Prince Edward Island, Canada',
        address: { house_number: '123' },
      }]), { status: 200 });
    },
  });
  assert.equal(new URL(requestedUrl).searchParams.get('format'), 'jsonv2');
  assert.match(JSON.stringify(requestedHeaders), /GathRPreview/);
});

test('custom addresses fail closed when Nominatim returns no match', async () => {
  await assert.rejects(
    () => resolveFriendEventAddress(customInput, {
      fetchImpl: async () => new Response(JSON.stringify([]), { status: 200 }),
    }),
    /could not be located/
  );
});

test('custom civic addresses reject a street-centre result without the requested house number', async () => {
  await assert.rejects(
    () => resolveFriendEventAddress(customInput, {
      fetchImpl: async () => new Response(JSON.stringify([{
        lat: '46.234',
        lon: '-63.126',
        display_name: 'Water Street, Charlottetown, Prince Edward Island, Canada',
        address: { road: 'Water Street' },
      }]), { status: 200 }),
    }),
    /could not be located/
  );
});

test('non-address locations never call the geocoder', async () => {
  const input = { location: { type: 'online', onlineUrl: 'https://example.com' } };
  const result = await resolveFriendEventAddress(input, {
    fetchImpl: async () => { throw new Error('should not run'); },
  });
  assert.equal(result, input);
});

test('location suggestions use Search Box for locally biased POIs and addresses', async () => {
  let requestedUrl = '';
  const result = await suggestFriendEventLocations({
    query: '  Hunters  ',
    sessionToken: '00000000-0000-4000-8000-000000000001',
    proximityLatitude: 46.24,
    proximityLongitude: -63.13,
  }, ' test-token ', {
    fetchImpl: async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({
        suggestions: [{
          mapbox_id: 'poi.hunters',
          name_preferred: "Hunter's Ale House",
          place_formatted: 'Charlottetown, Prince Edward Island, Canada',
          full_address: '185 Kent St, Charlottetown, PE C1A 1P1, Canada',
          feature_type: 'poi',
        }],
      }), { status: 200 });
    },
  });

  const url = new URL(requestedUrl);
  assert.equal(url.pathname, '/search/searchbox/v1/suggest');
  assert.equal(url.searchParams.get('q'), 'Hunters');
  assert.equal(url.searchParams.get('limit'), '5');
  assert.match(url.searchParams.get('types') || '', /poi/);
  assert.match(url.searchParams.get('types') || '', /address/);
  assert.equal(url.searchParams.get('session_token'), '00000000-0000-4000-8000-000000000001');
  assert.equal(url.searchParams.get('proximity'), '-63.13,46.24');
  assert.equal(url.searchParams.get('access_token'), 'test-token');
  assert.deepEqual(result.suggestions, [{
    id: 'mapbox:poi.hunters',
    mapboxId: 'poi.hunters',
    primaryText: "Hunter's Ale House",
    secondaryText: '185 Kent St, Charlottetown, PE C1A 1P1, Canada',
    fullAddress: '185 Kent St, Charlottetown, PE C1A 1P1, Canada',
    featureType: 'poi',
  }]);
});

test('location suggestions skip short queries without requiring a session or calling Mapbox', async () => {
  let called = false;
  const result = await suggestFriendEventLocations({ query: '9 ' }, 'test-token', {
    fetchImpl: async () => {
      called = true;
      throw new Error('should not run');
    },
  });
  assert.deepEqual(result, { suggestions: [] });
  assert.equal(called, false);
});

test('location suggestions drop duplicate and malformed results', async () => {
  const result = await suggestFriendEventLocations({
    query: '12 Water',
    sessionToken: '00000000-0000-4000-8000-000000000002',
  }, 'test-token', {
    fetchImpl: async () => new Response(JSON.stringify({
      suggestions: [
        {
          mapbox_id: 'address.1',
          name: '12 Water Street',
          place_formatted: 'Charlottetown, PE, Canada',
          full_address: '12 Water Street, Charlottetown, PE, Canada',
          feature_type: 'address',
        },
        {
          mapbox_id: 'address.duplicate',
          name: '12 Water Street',
          place_formatted: 'Charlottetown, PE, Canada',
          full_address: '12 Water Street, Charlottetown, PE, Canada',
          feature_type: 'address',
        },
        {
          name: 'Missing identifier',
          place_formatted: 'Nowhere',
        },
      ],
    }), { status: 200 }),
  });
  assert.equal(result.suggestions.length, 1);
  assert.equal(result.suggestions[0]?.id, 'mapbox:address.1');
});

test('retrieving a selected POI returns preview coordinates and a complete address', async () => {
  let requestedUrl = '';
  const result = await retrieveFriendEventLocationSuggestion({
    mapboxId: 'poi.hunters',
    sessionToken: '00000000-0000-4000-8000-000000000003',
  }, ' test-token ', {
    fetchImpl: async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({
        features: [{
          geometry: { coordinates: [-63.126066, 46.237417] },
          properties: {
            mapbox_id: 'poi.hunters',
            name: "Hunter's Ale House",
            full_address: '185 Kent St, Charlottetown, PE C1A 1P1, Canada',
            feature_type: 'poi',
          },
        }],
      }), { status: 200 });
    },
  });
  const url = new URL(requestedUrl);
  assert.equal(url.pathname, '/search/searchbox/v1/retrieve/poi.hunters');
  assert.equal(url.searchParams.get('session_token'), '00000000-0000-4000-8000-000000000003');
  assert.deepEqual(result, {
    mapboxId: 'poi.hunters',
    primaryText: "Hunter's Ale House",
    fullAddress: '185 Kent St, Charlottetown, PE C1A 1P1, Canada',
    featureType: 'poi',
    latitude: 46.237417,
    longitude: -63.126066,
  });
});
