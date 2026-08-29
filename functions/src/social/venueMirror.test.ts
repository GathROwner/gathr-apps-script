import assert from 'node:assert/strict';
import test from 'node:test';

import { collectRecognizedVenues } from './venueMirror.js';

test('venue mirror collects canonical venue IDs and aggregates current events', () => {
  const venues = collectRecognizedVenues([
    {
      venueId: 'venue-one',
      venueInfo: {
        name: 'Venue One',
        address: '1 Main Street',
        coordinates: { latitude: 46.2, longitude: -63.1 },
      },
    },
    {
      venueId: 'venue-one',
      venue: 'Less preferred duplicate name',
    },
    {
      venueId: 'venue-two',
      venue: { pagename: 'Venue Two', address: '2 Main Street' },
    },
  ]);

  assert.deepEqual(venues, [
    {
      id: 'venue-one',
      name: 'Venue One',
      address: '1 Main Street',
      latitude: 46.2,
      longitude: -63.1,
      eventCount: 2,
    },
    {
      id: 'venue-two',
      name: 'Venue Two',
      address: '2 Main Street',
      latitude: undefined,
      longitude: undefined,
      eventCount: 1,
    },
  ]);
});

test('venue mirror rejects unsafe IDs and keeps safe fallback records', () => {
  const venues = collectRecognizedVenues([
    { venueId: 'contains/slash', venue: 'Unsafe' },
    { venueId: '', venue: 'Missing' },
    { venueId: 'safe-id' },
  ]);
  assert.deepEqual(venues, [{
    id: 'safe-id',
    name: 'GathR venue',
    address: '',
    latitude: undefined,
    longitude: undefined,
    eventCount: 1,
  }]);
});
