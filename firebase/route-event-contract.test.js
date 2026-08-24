'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  outAndBack,
  toCoordinateObjects,
  validateRouteData,
} = require('./route-event-contract');

test('outAndBack returns to the start without duplicating the turnaround', () => {
  assert.deepEqual(outAndBack([[1, 2], [3, 4], [5, 6]]), [
    [1, 2], [3, 4], [5, 6], [3, 4], [1, 2],
  ]);
});

test('coordinate tuples are stored as Firestore-safe objects', () => {
  assert.deepEqual(toCoordinateObjects([[-63.2, 46.2]]), [
    { longitude: -63.2, latitude: 46.2 },
  ]);
});

test('confirmed stops can publish without an invented line', () => {
  assert.doesNotThrow(() => validateRouteData({
    version: 1,
    status: 'approximate',
    stops: [{
      id: 'harbour',
      label: 'Harbour gathering point',
      kind: 'start',
      certainty: 'approximate',
      coordinates: { longitude: -63.46, latitude: 46.46 },
    }],
    segments: [],
  }));
});

test('raw connected-stop chords are rejected because the app would hide them', () => {
  assert.throws(() => validateRouteData({
    version: 1,
    status: 'approximate',
    stops: [],
    segments: [{
      id: 'bad-chord',
      certainty: 'approximate',
      source: 'connected_stops',
      coordinates: [
        { longitude: -63.2, latitude: 46.2 },
        { longitude: -63.3, latitude: 46.3 },
      ],
    }],
  }), /would be hidden/);
});

test('street-routed suggested connections are accepted', () => {
  assert.doesNotThrow(() => validateRouteData({
    version: 1,
    status: 'partial',
    stops: [],
    segments: [{
      id: 'walking-connection',
      certainty: 'approximate',
      source: 'routed_streets',
      coordinates: [
        { longitude: -63.2, latitude: 46.2 },
        { longitude: -63.3, latitude: 46.3 },
      ],
    }],
  }));
});

test('official full street sequences can use confirmed map-aligned traces', () => {
  assert.doesNotThrow(() => validateRouteData({
    version: 1,
    status: 'verified',
    evidenceLevel: 'official_full_route',
    geometryMethod: 'map_aligned_street_trace',
    confirmedStreets: ['North River Road'],
    stops: [],
    segments: [{
      id: 'confirmed-north-river-road',
      streetName: 'North River Road',
      certainty: 'confirmed',
      source: 'routed_streets',
      coordinates: [
        { longitude: -63.2, latitude: 46.2 },
        { longitude: -63.3, latitude: 46.3 },
      ],
    }],
  }));
});

test('street routing alone cannot upgrade an inferred route to confirmed', () => {
  assert.throws(() => validateRouteData({
    version: 1,
    status: 'approximate',
    evidenceLevel: 'inferred',
    geometryMethod: 'street_routing_estimate',
    confirmedStreets: [],
    stops: [],
    segments: [{
      id: 'guessed-route',
      streetName: 'Unknown Street',
      certainty: 'confirmed',
      source: 'routed_streets',
      coordinates: [
        { longitude: -63.2, latitude: 46.2 },
        { longitude: -63.3, latitude: 46.3 },
      ],
    }],
  }), /cannot be confirmed|official_full_route|map_aligned_street_trace/);
});
