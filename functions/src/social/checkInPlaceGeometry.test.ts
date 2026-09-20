import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkInPlaceDistance, parseCheckInBoundary, pointDistance, publicCheckInRadius } from './checkInPlaceGeometry.js';
import { parsePublicNearbyPlaces } from './nearbyCheckInPlaces.js';

const fixture = JSON.parse(readFileSync(join(__dirname, '../../test/fixtures/charlottetown-event-grounds.json'), 'utf8'));
const grounds = fixture.elements[0];
const pin = { latitude: grounds.center.lat, longitude: grounds.center.lon };
const inside = { latitude: 46.24105, longitude: -63.1158, accuracyMeters: 5 };

test('event grounds qualifies inside its boundary despite being over 50 metres from its centre', () => {
  assert.ok(pointDistance(inside, pin) > 65);
  const boundary = parseCheckInBoundary(grounds.geometry);
  assert.ok(boundary);
  assert.equal(checkInPlaceDistance(inside, pin, boundary), 0);
  const places = parsePublicNearbyPlaces(fixture, inside);
  assert.equal(places.length, 1);
  assert.equal(places[0].distanceMetres, 0);
  assert.deepEqual(places[0].checkInBoundary, boundary);
});

test('point-only results use the final verification radius rather than the 175m search radius', () => {
  const withoutBoundary = { elements: [{ ...grounds, geometry: undefined }] };
  assert.equal(parsePublicNearbyPlaces(withoutBoundary, inside).length, 0);
  assert.equal(publicCheckInRadius(5), 55);
  assert.equal(publicCheckInRadius(100), 75);
  assert.equal(parsePublicNearbyPlaces(withoutBoundary, { ...pin, accuracyMeters: 5 }).length, 1);
});

test('distance is measured to the polygon edge, not a bounding box or just the centre', () => {
  const boundary = parseCheckInBoundary([
    { lat: 46, lon: -63 }, { lat: 46.002, lon: -63 },
    { lat: 46, lon: -62.998 }, { lat: 46, lon: -63 },
  ]);
  assert.ok(boundary);
  assert.equal(checkInPlaceDistance({ latitude: 46.0002, longitude: -62.9998 }, pin, boundary), 0);
  assert.equal(checkInPlaceDistance({ latitude: 46, longitude: -63 }, pin, boundary), 0);
  assert.ok(checkInPlaceDistance({ latitude: 46.0018, longitude: -62.9982 }, pin, boundary) > 70);
  assert.ok(checkInPlaceDistance({ latitude: 46.0008, longitude: -63.0001 }, pin, boundary) < 10);
});

test('partial, malformed, oversized, open and degenerate boundaries fail closed to the pin', () => {
  for (const bad of [undefined, [], grounds.geometry.slice(1), [{ lat: '46', lon: -63 }],
    Array(257).fill({ lat: 46, lon: -63 }),
    [{ lat: 0, lon: 0 }, { lat: 1, lon: 0 }, { lat: 1, lon: 1 }, { lat: 0, lon: 0 }],
    Array(4).fill({ lat: 46, lon: -63 })]) {
    assert.equal(parseCheckInBoundary(bad), undefined);
    assert.ok(checkInPlaceDistance(inside, pin, parseCheckInBoundary(bad)) > 65);
  }
});

test('open ways, area=no and incomplete relations cannot expand point eligibility', () => {
  for (const element of [{ ...grounds, geometry: grounds.geometry.slice(1) },
    { ...grounds, tags: { ...grounds.tags, area: 'no' } }, { ...grounds, type: 'relation' }]) {
    assert.deepEqual(parsePublicNearbyPlaces({ elements: [element] }, inside), []);
  }
});
