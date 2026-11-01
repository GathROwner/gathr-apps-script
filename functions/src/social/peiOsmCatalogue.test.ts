import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {Timestamp} from 'firebase-admin/firestore';
import {evaluatePeiCatalogue, lookupPeiOsmCatalogue, PEI_CATALOGUE_REFRESH_AFTER_MS, type PeiCatalogue} from './peiOsmCatalogue.js';
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

test('actual official PEI artifact preserves2227 identities,1213 closed ways and24 complete center-pin relations', () => {
  assert.equal(data.manifest.pbfSha256, 'c682572ea356c49e87cfc94efb22ad4e25613f7f33246a3d0d33a64474aed68d');
  assert.equal(data.manifest.sourceTimestamp, '2026-10-31T21:23:06Z');
  assert.equal(elements.length, 2227);
  assert.equal(new Set(elements.map(item => `${item.type}:${item.id}`)).size, 2227);
  const rings = elements.filter(item => item.type === 'way' && parseCheckInBoundary(item.geometry));
  assert.equal(rings.length, 1213);
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
  assert.equal(result.catalogReason, undefined);
  assert.equal(result.preparationRadiusMetres, 175);
  assert.ok(result.candidates.some(candidate => candidate.name === (actualPub.tags as Record<string, string>).name));
  const candidates = db.writes.filter(value => value.candidateId);
  assert.ok(candidates.length > 0 && candidates.length <= 20);
  assert.equal(db.writes.length, candidates.length + 1, 'One non-bindable pool metadata record');
  for (const candidate of candidates) {
    assert.equal(candidate.source, 'openstreetmap_overpass');
    assert.equal(candidate.catalogSource, 'osm_regional_snapshot');
    assert.equal(candidate.catalogVersion, result.catalogVersion);
    assert.equal((candidate.expiresAt as Timestamp).toMillis() - freshMs, 15 * 60_000);
    validateCheckInPlaceCandidate(candidate, 'real-catalogue-fixture', candidate.candidateId as string, now);
    assert.throws(() => validateCheckInPlaceCandidate(candidate, 'other-user', candidate.candidateId as string, now));
  }
});

test('external public identity survives fresh UUIDs without granting expired, consumed or other-user authority', async () => {
  const db = emptyCanonicalDb();
  const prepare = (uid: string, ms: number) => discoverNearbyCheckInPlaces(uid, {...point,
    accuracyMeters: 17, capturedAtMs: ms, preparation: true}, {db: db as never, now: Timestamp.fromMillis(ms),
    fetchImpl: async () => {throw Error('No provider call in covered region');}});
  const first = await prepare('identity-owner', freshMs);
  const next = await prepare('identity-owner', freshMs + 1);
  const old = first.candidates.find(candidate => candidate.name === (actualPub.tags as Record<string, string>).name)!;
  const replacement = next.candidates.find(candidate => candidate.locationKey === old.locationKey)!;
  assert.match(old.locationKey || '', /^external:[a-f0-9]{32}$/);
  assert.notEqual(old.id, replacement.id);
  assert.equal(old.locationKey, replacement.locationKey);
  assert.equal(new Set(first.candidates.map(candidate => candidate.locationKey)).size, first.candidates.length);
  const stored = db.writes.find(candidate => candidate.candidateId === old.id)!;
  assert.equal((stored.place as {locationKey: string}).locationKey, old.locationKey);
  assert.throws(() => validateCheckInPlaceCandidate(stored, 'other-user', old.id, Timestamp.fromMillis(freshMs)));
  assert.throws(() => validateCheckInPlaceCandidate(stored, 'identity-owner', old.id,
    Timestamp.fromMillis(freshMs + 15 * 60_000 + 1)));
  assert.throws(() => validateCheckInPlaceCandidate({...stored, consumedAt: Timestamp.fromMillis(freshMs)},
    'identity-owner', old.id, Timestamp.fromMillis(freshMs)));
  // A stable public key never substitutes for an exact owner-bound UUID.
  assert.throws(() => validateCheckInPlaceCandidate(stored, 'identity-owner', old.locationKey!, Timestamp.fromMillis(freshMs)));
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

test('actual sparse area is complete-empty; overdue valid coverage remains available without provider fallback', async () => {
  const sparse = {latitude: 46.9, longitude: -62.9};
  const lookup = lookupPeiOsmCatalogue(sparse, freshMs);
  assert.equal(lookup.status, 'complete');
  assert.deepEqual(parsePublicNearbyPlaces({elements: lookup.elements}, {...sparse, preparation: true}), []);
  let providerCalls = 0;
  const oldMs = Date.parse(data.manifest.sourceTimestamp) + PEI_CATALOGUE_REFRESH_AFTER_MS + 1;
  const db = emptyCanonicalDb();
  const result = await discoverNearbyCheckInPlaces('stale-catalogue-fixture', {...point,
    accuracyMeters: 17, capturedAtMs: oldMs, preparation: true}, {db: db as never,
    now: Timestamp.fromMillis(oldMs), fetchImpl: async () => {providerCalls++; throw Error('No hidden dependency');}});
  assert.equal(providerCalls, 0);
  assert.equal(result.externalLookupStatus, 'complete');
  assert.equal(result.catalogReason, 'catalogue_refresh_overdue');
  assert.ok(result.candidates.some(candidate => candidate.name === (actualPub.tags as Record<string, string>).name));
  for (const candidate of db.writes.filter(value => value.candidateId)) {
    assert.equal(candidate.catalogReason, 'catalogue_refresh_overdue');
    assert.equal((candidate.expiresAt as Timestamp).toMillis(), oldMs + 15 * 60_000);
    validateCheckInPlaceCandidate(candidate, 'stale-catalogue-fixture', candidate.candidateId as string, Timestamp.fromMillis(oldMs));
    assert.throws(() => validateCheckInPlaceCandidate(candidate, 'stale-catalogue-fixture', candidate.candidateId as string,
      Timestamp.fromMillis(oldMs + 15 * 60_000 + 1)));
  }
});

test('source-age boundary is observable without an eventual age-only shutdown', () => {
  const sourceMs = Date.parse(data.manifest.sourceTimestamp);
  assert.equal(evaluatePeiCatalogue(data, point, sourceMs + PEI_CATALOGUE_REFRESH_AFTER_MS).reason, undefined);
  for (const age of [PEI_CATALOGUE_REFRESH_AFTER_MS + 1, 365 * 24 * 60 * 60_000]) {
    const result = evaluatePeiCatalogue(data, point, sourceMs + age);
    assert.equal(result.status, 'complete');
    assert.equal(result.reason, 'catalogue_refresh_overdue');
    assert.equal(result.elements, data.elements);
    assert.equal(result.sourceTimestamp, data.manifest.sourceTimestamp);
    assert.equal(result.version, lookupPeiOsmCatalogue(point, freshMs).version);
  }
});

test('overdue availability does not bypass invalid source, manifest or geometry coverage', () => {
  const now = Date.parse(data.manifest.sourceTimestamp) + 30 * 24 * 60 * 60_000;
  const invalidDate = structuredClone(data);
  invalidDate.manifest.sourceTimestamp = 'invalid-date';
  assert.equal(evaluatePeiCatalogue(invalidDate, point, now).reason, 'catalogue_age');
  assert.equal(evaluatePeiCatalogue(data, point, Date.parse(data.manifest.sourceTimestamp) - 1).reason, 'catalogue_age');
  const invalidHash = structuredClone(data);
  invalidHash.manifest.pbfSha256 = 'invalid-hash';
  assert.equal(evaluatePeiCatalogue(invalidHash, point, now).reason, 'invalid_catalogue');
  const missing = structuredClone(data);
  missing.manifest.missingReferences = 1;
  assert.equal(evaluatePeiCatalogue(missing, point, now).reason, 'invalid_catalogue');
  const incomplete = structuredClone(data);
  incomplete.limitations = [{type: 'way', id: 123, reason: 'missing_geometry',
    bounds: [point.latitude - .001, point.longitude - .001, point.latitude + .001, point.longitude + .001]}];
  assert.equal(evaluatePeiCatalogue(incomplete, point, now).reason, 'incomplete_geometry');
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
