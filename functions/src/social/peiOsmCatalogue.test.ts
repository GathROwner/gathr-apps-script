import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {Timestamp} from 'firebase-admin/firestore';
import {evaluatePeiCatalogue, lookupPeiOsmCatalogue, PEI_CATALOGUE_MAX_AGE_MS, type PeiCatalogue} from './peiOsmCatalogue.js';
import {discoverNearbyCheckInPlaces, parsePublicNearbyPlaces, validateCheckInPlaceCandidate} from './nearbyCheckInPlaces.js';
import {parseCheckInBoundary, pointDistance} from './checkInPlaceGeometry.js';

const data = JSON.parse(readFileSync(join(__dirname, 'data', 'pei-osm-catalogue.json'), 'utf8')) as PeiCatalogue;
const freshMs = Date.parse(data.manifest.sourceTimestamp) + 24 * 60 * 60_000;
const elements = data.elements as Record<string, unknown>[];
const actualPub = elements.find(item => item.type === 'node' && (item.tags as Record<string, string>).amenity === 'pub')!;
const point = {latitude: Number(actualPub.lat), longitude: Number(actualPub.lon)};

function emptyCanonicalDb() {
  const writes: Record<string, unknown>[] = [];
  let queries = 0;
  const query = {where: () => query, limit: () => ({get: async () => {queries++; return {docs: []};}})};
  return {collection: () => ({...query, doc: (id: string) => ({id})}),
    batch: () => ({set: (_: unknown, value: Record<string, unknown>) => writes.push(value), commit: async () => {}}),
    writes, get queries() {return queries;}};
}

test('actual official PEI artifact preserves2219 identities,1210 closed ways and24 complete center-pin relations', () => {
  assert.equal(data.manifest.pbfSha256, '12d783b94e75d8964d2d562bd79233a03abddb3398bd5ba09d86672dc24bc1fa');
  assert.equal(data.manifest.sourceTimestamp, '2026-10-29T21:21:26Z');
  assert.equal(elements.length, 2219);
  assert.equal(new Set(elements.map(item => `${item.type}:${item.id}`)).size, 2219);
  const rings = elements.filter(item => item.type === 'way' && parseCheckInBoundary(item.geometry));
  assert.equal(rings.length, 1210);
  const relations = elements.filter(item => item.type === 'relation');
  assert.equal(relations.length, 24);
  for (const item of relations) {
    const center = item.center as {lat: number; lon: number};
    const bounds = item.bounds as {minlat: number; minlon: number; maxlat: number; maxlon: number};
    assert.equal(center.lat, (bounds.minlat + bounds.maxlat) / 2);
    assert.equal(center.lon, (bounds.minlon + bounds.maxlon) / 2);
    const parsed = parsePublicNearbyPlaces({elements: [item]}, {latitude: center.lat, longitude: center.lon, preparation: true});
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].checkInBoundary, undefined, 'Relations retain current point-only policy');
  }
  assert.deepEqual(data.limitations, []);
});

test('actual mapped public pub uses catalogue without any provider call and mints legacy-compatible owner-bound candidates', async () => {
  const db = emptyCanonicalDb();
  let providerCalls = 0;
  const now = Timestamp.fromMillis(freshMs);
  const result = await discoverNearbyCheckInPlaces('real-catalogue-fixture', {...point,
    accuracyMeters: 17, capturedAtMs: freshMs, preparation: true}, {db: db as never, now,
    fetchImpl: async () => {providerCalls++; throw Error('Covered lookup must never contact a provider');}});
  assert.equal(providerCalls, 0);
  assert.equal(db.queries, 2, 'Only existing canonical numeric and legacy queries');
  assert.equal(result.externalLookupStatus, 'complete');
  assert.equal(result.catalogSource, 'osm_regional_snapshot');
  assert.equal(result.preparationRadiusMetres, 175);
  assert.ok(result.candidates.some(candidate => candidate.name === (actualPub.tags as Record<string, string>).name));
  assert.ok(db.writes.length > 0 && db.writes.length <= 20);
  for (const candidate of db.writes) {
    assert.equal(candidate.source, 'openstreetmap_overpass');
    assert.equal(candidate.catalogSource, 'osm_regional_snapshot');
    assert.equal(candidate.catalogVersion, result.catalogVersion);
    assert.equal((candidate.expiresAt as Timestamp).toMillis() - freshMs, 15 * 60_000);
    validateCheckInPlaceCandidate(candidate, 'real-catalogue-fixture', candidate.candidateId as string, now);
    assert.throws(() => validateCheckInPlaceCandidate(candidate, 'other-user', candidate.candidateId as string, now));
  }
});

test('an actual large closed-way footprint remains selectable when its center is more than175m away', () => {
  const large = elements.find(item => {
    const ring = parseCheckInBoundary(item.geometry);
    const center = item.center as {lat: number; lon: number} | undefined;
    return item.type === 'way' && ring && center && pointDistance(
      {latitude: ring[0].lat, longitude: ring[0].lon}, {latitude: center.lat, longitude: center.lon}) > 175;
  })!;
  assert.ok(large, 'Actual regional source must supply the large-footprint proof');
  const ring = parseCheckInBoundary(large.geometry)!;
  const edge = {latitude: ring[0].lat, longitude: ring[0].lon, preparation: true};
  const lookup = lookupPeiOsmCatalogue(edge, freshMs);
  assert.equal(lookup.status, 'complete');
  const nearby = parsePublicNearbyPlaces({elements: lookup.elements}, edge);
  const actual = nearby.find(item => item.osmElementKey === `way:${large.id}`);
  assert.ok(actual?.checkInBoundary);
  assert.equal(actual.distanceMetres, 0);
});

test('actual sparse area is complete-empty, while an over-age covered catalogue is explicit unavailable without provider fallback', async () => {
  const sparse = {latitude: 46.9, longitude: -62.9};
  const lookup = lookupPeiOsmCatalogue(sparse, freshMs);
  assert.equal(lookup.status, 'complete');
  assert.deepEqual(parsePublicNearbyPlaces({elements: lookup.elements}, {...sparse, preparation: true}), []);
  let providerCalls = 0;
  const oldMs = Date.parse(data.manifest.sourceTimestamp) + PEI_CATALOGUE_MAX_AGE_MS + 1;
  const result = await discoverNearbyCheckInPlaces('stale-catalogue-fixture', {...point,
    accuracyMeters: 17, capturedAtMs: oldMs, preparation: true}, {db: emptyCanonicalDb() as never,
    now: Timestamp.fromMillis(oldMs), fetchImpl: async () => {providerCalls++; throw Error('No hidden dependency');}});
  assert.equal(providerCalls, 0);
  assert.equal(result.externalLookupStatus, 'partial_unavailable');
  assert.equal(result.catalogReason, 'catalogue_age');
});

test('full-circle extent containment rejects edges and holes; invalid/future/missing-reference data cannot claim complete', () => {
  const fixture = structuredClone(data);
  fixture.manifest.extent = [
    {hole: false, points: [{lat: 45, lon: -64}, {lat: 47, lon: -64}, {lat: 47, lon: -62}, {lat: 45, lon: -62}, {lat: 45, lon: -64}]},
    {hole: true, points: [{lat: 45.9, lon: -63.1}, {lat: 46.1, lon: -63.1}, {lat: 46.1, lon: -62.9}, {lat: 45.9, lon: -62.9}, {lat: 45.9, lon: -63.1}]},
  ];
  assert.equal(evaluatePeiCatalogue(fixture, {latitude: 46, longitude: -63}, freshMs).status, 'outside_coverage');
  assert.equal(evaluatePeiCatalogue(fixture, {latitude: 45.001, longitude: -63.5}, freshMs).status, 'outside_coverage');
  assert.equal(evaluatePeiCatalogue(fixture, {latitude: 45.5, longitude: -63.5}, freshMs).status, 'complete');
  assert.equal(evaluatePeiCatalogue(data, point, Date.parse(data.manifest.sourceTimestamp) - 1).status, 'unavailable');
  fixture.manifest.missingReferences = 1;
  assert.equal(evaluatePeiCatalogue(fixture, point, freshMs).status, 'unavailable');
  fixture.manifest.missingReferences = 0;
  fixture.limitations = [{type: 'way', id: 123, reason: 'synthetic_missing_geometry', bounds: [point.latitude-.001,point.longitude-.001,point.latitude+.001,point.longitude+.001]}];
  assert.equal(evaluatePeiCatalogue(fixture, point, freshMs).status, 'unavailable');
});
