import assert from 'node:assert/strict';
import test from 'node:test';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { recordCheckInReadinessSample, bindCheckInReadiness, checkInEligibilitySessionId,
  assertCompletedCheckInEligibility } from './checkInEligibility.js';
import { createPrivateCheckInPlaceCandidate, discoverNearbyCheckInPlaces,
  listNearbyCanonicalCheckInVenues } from './nearbyCheckInPlaces.js';
import { CHECK_IN_ARRIVAL_TTL_MS } from './checkInArrival.js';
import { SocialDomainError } from './validation.js';

type Doc = Record<string, unknown>;
class MemoryFirestore {
  documents = new Map<string, Doc>();
  writes = 0;
  snapshot(path: string) {
    const value = this.documents.get(path);
    return { id: path.split('/').at(-1)!, path, exists: !!value, data: () => value };
  }
  collection(name: string) {
    const query = (cursor?: {path: string}) => ({limit: (count: number) => ({get: async () => {
      const keys = [...this.documents.keys()].filter(path => path.startsWith(`${name}/`));
      const offset = cursor ? keys.indexOf(cursor.path) + 1 : 0;
      return {docs: keys.slice(offset, offset + count).map(path => this.snapshot(path))};
    }})});
    return {
      doc: (id: string) => ({ path: `${name}/${id}`,
        set: async (value: Doc) => { this.writes++; this.documents.set(`${name}/${id}`, value); } }),
      limit: query().limit,
      startAfter: (cursor: {path: string}) => query(cursor),
    };
  }
  getAll(...refs: {path: string}[]) { return Promise.resolve(refs.map(ref => this.snapshot(ref.path))); }
  batch() {
    const writes: [string, Doc][] = [];
    return {set: (ref: {path: string}, value: Doc) => writes.push([ref.path, value]),
      commit: async () => { for (const [key, value] of writes) { this.writes++; this.documents.set(key, value); } }};
  }
  async runTransaction<T>(work: (transaction: unknown) => Promise<T>): Promise<T> {
    return work({get: async (ref: {path: string}) => this.snapshot(ref.path),
      getAll: (...refs: {path: string}[]) => this.getAll(...refs),
      set: (ref: {path: string}, value: Doc) => { this.writes++; this.documents.set(ref.path, value); },
      update: (ref: {path: string}, value: Doc) => {
        assert.ok(this.documents.has(ref.path)); this.writes++;
        this.documents.set(ref.path, {...this.documents.get(ref.path), ...value});
      }});
  }
  asFirestore() { return this as unknown as Firestore; }
}
const uid = 'qualified-arrival-user';
const sessionId = 'qualified-arrival-session';
const base = 2_000_000_000_000;
const point = {latitude: 46.2382, longitude: -63.1311};
const time = (seconds: number) => Timestamp.fromMillis(base + seconds * 1000);
const sessionPath = `checkInEligibilitySessions/${checkInEligibilitySessionId(uid, sessionId)}`;
function sample(seconds: number, overrides: Doc = {}) {
  return {protocolVersion: 1, reset: false, sessionId, sequence: seconds / 10,
    ...point, accuracyMeters: 8, speedMetersPerSecond: 0,
    capturedAtMs: base + seconds * 1000 - 250, ...overrides};
}
async function qualify(db: MemoryFirestore, until = 90) {
  let receipt;
  for (let seconds = 0; seconds <= until; seconds += 10) {
    receipt = await recordCheckInReadinessSample(uid, sample(seconds), db.asFirestore(), time(seconds));
  }
  return receipt!;
}
function bindInput(overrides: Doc = {}) {
  return {protocolVersion: 1, readinessSessionId: sessionId, operationId: 'bind-qualified-arrival-001',
    venueId: 'holy-whale', useQualifiedArrival: true, ...point,
    accuracyMeters: 8, speedMetersPerSecond: 0, capturedAtMs: base,
    ...overrides};
}
function venue(db: MemoryFirestore, name = 'holy-whale', northMetres = 0) {
  db.documents.set(`venues/${name}`, {pagename: name, ...point,
    latitude: point.latitude + northMetres / 111195, address: 'Public venue address'});
}
const failedPrecondition = (error: unknown) => error instanceof SocialDomainError && error.code === 'failed-precondition';

test('arrival is server-earned at30/90s, on the same session, with a bounded three-minute lease', async () => {
  const db = new MemoryFirestore();
  const early = await qualify(db, 20);
  assert.equal(early.arrival, undefined);
  const here = await recordCheckInReadinessSample(uid, sample(30), db.asFirestore(), time(30));
  assert.equal(here.arrival?.here, true);
  assert.equal(here.arrival?.place, false);
  assert.equal(here.arrival?.expiresAtMs, time(30).toMillis() + CHECK_IN_ARRIVAL_TTL_MS);
  let place = here;
  for (let seconds = 40; seconds <= 90; seconds += 10) place = await recordCheckInReadinessSample(uid, sample(seconds), db.asFirestore(), time(seconds));
  assert.equal(place.arrival?.sessionId, sessionId);
  assert.equal(place.arrival?.place, true);
  assert.equal(place.expiresAtMs, time(90).toMillis() + 20_000);
  assert.equal(place.arrival?.expiresAtMs, time(90).toMillis() + 180_000);
});

test('26m uncertainty pauses public evidence without resetting or crediting uncertain intervals', async () => {
  const db = new MemoryFirestore();
  await qualify(db, 30);
  const uncertain = await recordCheckInReadinessSample(uid, sample(40, {accuracyMeters: 26}), db.asFirestore(), time(40));
  assert.equal(uncertain.placeQualifyingMs, 30_000);
  const recovered = await recordCheckInReadinessSample(uid, sample(50), db.asFirestore(), time(50));
  assert.equal(recovered.placeQualifyingMs, 30_000);
  let receipt = recovered;
  for (let seconds = 60; seconds <= 110; seconds += 10) receipt = await recordCheckInReadinessSample(uid, sample(seconds), db.asFirestore(), time(seconds));
  assert.equal(receipt.arrival?.place, true);
});

test('Place upgrade replaces a40m Here snapshot with the newly qualified17m evidence', async () => {
  const db = new MemoryFirestore();
  let receipt;
  for (let seconds = 0; seconds <= 30; seconds += 10) receipt = await recordCheckInReadinessSample(uid,
    sample(seconds, {accuracyMeters: 40}), db.asFirestore(), time(seconds));
  assert.equal(receipt?.arrival?.here, true);
  assert.equal(receipt?.arrival?.place, false);
  assert.equal(receipt?.arrival?.accuracyMeters, 40);
  for (let seconds = 40; seconds <= 130; seconds += 10) receipt = await recordCheckInReadinessSample(uid,
    sample(seconds, {accuracyMeters: 17}), db.asFirestore(), time(seconds));
  assert.equal(receipt?.arrival?.place, true);
  assert.equal(receipt?.arrival?.accuracyMeters, 17);
  assert.equal(receipt?.arrival?.capturedAtMs, sample(130).capturedAtMs);
});

test('unknown-speed return after an inaccurate displaced fix preserves counters without crediting that interval', async () => {
  const db = new MemoryFirestore(); await qualify(db, 20);
  await recordCheckInReadinessSample(uid, sample(30, {accuracyMeters: 200,
    speedMetersPerSecond: null, latitude: point.latitude + 150 / 111195}), db.asFirestore(), time(30));
  const returned = await recordCheckInReadinessSample(uid, sample(40, {accuracyMeters: 17,
    speedMetersPerSecond: null}), db.asFirestore(), time(40));
  assert.equal(returned.hereQualifyingMs, 20_000);
  assert.equal(returned.placeQualifyingMs, 20_000);
  const next = await recordCheckInReadinessSample(uid, sample(50, {accuracyMeters: 17,
    speedMetersPerSecond: null}), db.asFirestore(), time(50));
  assert.equal(next.hereQualifyingMs, 30_000);
  assert.equal(next.placeQualifyingMs, 30_000);
});

test('qualified arrival survives uncertainty and one noisy speed fix without extending its lease', async () => {
  const db = new MemoryFirestore();
  const ready = await qualify(db);
  const jitter = await recordCheckInReadinessSample(uid, sample(100, {accuracyMeters: 60,
    latitude: point.latitude + 25 / 111195}), db.asFirestore(), time(100));
  assert.deepEqual(jitter.arrival, ready.arrival);
  const spike = await recordCheckInReadinessSample(uid, sample(110, {speedMetersPerSecond: 7}), db.asFirestore(), time(110));
  assert.deepEqual(spike.arrival, ready.arrival);
  venue(db);
  const bound = await bindCheckInReadiness(uid, bindInput(), db.asFirestore(), time(200));
  assert.equal(bound.locationType, 'gathr_venue');
});

test('accurate clear departure revokes prepared arrival and cannot bind', async () => {
  const db = new MemoryFirestore(); await qualify(db); venue(db);
  const left = await recordCheckInReadinessSample(uid, sample(100, {latitude: point.latitude + 100 / 111195}), db.asFirestore(), time(100));
  assert.equal(left.arrival, undefined);
  await assert.rejects(bindCheckInReadiness(uid, bindInput(), db.asFirestore(), time(110)), failedPrecondition);
});

test('two spatially corroborated vehicle fixes revoke arrival; a single speed spike does not', async () => {
  const db = new MemoryFirestore(); await qualify(db);
  const first = await recordCheckInReadinessSample(uid, sample(100, {speedMetersPerSecond: 6}), db.asFirestore(), time(100));
  assert.ok(first.arrival);
  const second = await recordCheckInReadinessSample(uid, sample(110, {speedMetersPerSecond: 6,
    latitude: point.latitude + 40 / 111195}), db.asFirestore(), time(110));
  assert.equal(second.arrival, undefined);
  assert.equal(second.reason, 'driving');
});

test('an inaccurate prior vehicle fix cannot corroborate a new driving speed inside the qualified area', async () => {
  const db = new MemoryFirestore(); const ready = await qualify(db);
  await recordCheckInReadinessSample(uid, sample(100, {speedMetersPerSecond: 6,
    accuracyMeters: 200, latitude: point.latitude - 200 / 111195}), db.asFirestore(), time(100));
  const second = await recordCheckInReadinessSample(uid, sample(110, {speedMetersPerSecond: 6,
    latitude: point.latitude + 40 / 111195}), db.asFirestore(), time(110));
  assert.deepEqual(second.arrival, ready.arrival);
});

test('qualified bind ignores caller-supplied coordinates, survives raw receipt expiry, is target-bound and idempotent', async () => {
  const db = new MemoryFirestore(); await qualify(db); venue(db); venue(db, 'remote-venue', 200);
  await assert.rejects(bindCheckInReadiness(uid, bindInput({venueId: 'remote-venue', latitude: point.latitude + 200 / 111195}), db.asFirestore(), time(200)), failedPrecondition);
  const grant = await bindCheckInReadiness(uid, bindInput({latitude: -80, longitude: 120, capturedAtMs: 1}), db.asFirestore(), time(200));
  assert.equal(grant.expiresAtMs, time(200).toMillis() + 300_000);
  const repeated = await bindCheckInReadiness(uid, bindInput(), db.asFirestore(), time(280));
  assert.equal(repeated.expiresAtMs, grant.expiresAtMs);
  await assert.rejects(bindCheckInReadiness(uid, bindInput({operationId: 'different-bind-operation'}), db.asFirestore(), time(280)), failedPrecondition);
  const stored = db.documents.get(sessionPath)!;
  assert.doesNotThrow(() => assertCompletedCheckInEligibility(stored, uid, {
    venueId: 'holy-whale', locationKey: 'venue:holy-whale', locationType: 'gathr_venue'}, time(280)));
  stored.consumedAt = time(280);
  assert.throws(() => assertCompletedCheckInEligibility(stored, uid, {
    venueId: 'holy-whale', locationKey: 'venue:holy-whale', locationType: 'gathr_venue'}, time(281)));
  await assert.rejects(bindCheckInReadiness(uid, bindInput(), db.asFirestore(), time(281)), failedPrecondition);
});

test('expired, replaced and another user arrival cannot authorize qualified binding', async () => {
  for (const state of ['expired', 'replaced', 'other-user']) {
    const db = new MemoryFirestore(); await qualify(db); venue(db);
    if (state === 'replaced') db.documents.get(`checkInEligibilitySessions/${uid}__readiness_owner`)!.activeSessionId = 'a-different-session';
    if (state === 'other-user') db.documents.get(sessionPath)!.uid = 'another-user';
    await assert.rejects(bindCheckInReadiness(uid, bindInput(), db.asFirestore(), time(state === 'expired' ? 271 : 200)), SocialDomainError);
  }
});

test('Here arrival creates private candidate from server coordinates after60s, not caller coordinates', async () => {
  const db = new MemoryFirestore(); await qualify(db, 30);
  const result = await createPrivateCheckInPlaceCandidate(uid, {readinessSessionId: sessionId,
    label: 'Home', latitude: -80, longitude: 120, accuracyMeters: 1, capturedAtMs: 1},
  {db: db.asFirestore(), now: time(140)});
  assert.equal(result.candidate.latitude, point.latitude);
  assert.equal(result.candidate.longitude, point.longitude);
  const grant = await bindCheckInReadiness(uid, bindInput({venueId: undefined,
    placeCandidateId: result.candidate.id}), db.asFirestore(), time(150));
  assert.equal(grant.exactPrivateAllowed, true);
  assert.equal(grant.locationType, 'private_place');
});

test('legacy bind still needs a fresh supplied fix and never borrows qualified lease implicitly', async () => {
  const db = new MemoryFirestore(); await qualify(db); venue(db);
  await assert.rejects(bindCheckInReadiness(uid, bindInput({useQualifiedArrival: undefined}), db.asFirestore(), time(200)), failedPrecondition);
});

test('OpenStreetMap failure preserves canonical choices and reports partial preparation', async () => {
  const db = new MemoryFirestore(); venue(db);
  let requests = 0;
  const result = await discoverNearbyCheckInPlaces(uid, {...point, accuracyMeters: 8,
    capturedAtMs: base, preparation: true}, {db: db.asFirestore(), now: time(0),
    providerFailureLogger: () => {}, fetchImpl: async () => { requests++; return new Response('', {status: 502}); }});
  assert.equal(requests, 2);
  assert.equal(result.externalLookupStatus, 'partial_unavailable');
  assert.equal(result.preparationRadiusMetres, 175);
  assert.equal(result.candidates[0]?.venueId, 'holy-whale');
  assert.equal(db.writes, 0);
});

test('empty successful discovery differs from outage; preparation widens only candidate pool, not legacy selection', async () => {
  const db = new MemoryFirestore();
  for (let index = 0; index < 8; index++) venue(db, `venue-${index}`, 80 + index);
  const input = {...point, accuracyMeters: 8, capturedAtMs: base};
  const legacy = await listNearbyCanonicalCheckInVenues(input, {db: db.asFirestore(), now: time(0)});
  const prepared = await listNearbyCanonicalCheckInVenues({...input, preparation: true}, {db: db.asFirestore(), now: time(0)});
  assert.equal(legacy.candidates.length, 0);
  assert.equal('preparationRadiusMetres' in legacy, false);
  assert.equal(prepared.candidates.length, 8);
  assert.equal(prepared.preparationRadiusMetres, 175);
  let requests = 0;
  const empty = await discoverNearbyCheckInPlaces(uid, input, {db: db.asFirestore(), now: time(0),
    fetchImpl: async () => { requests++; return new Response(JSON.stringify({elements: []})); }});
  assert.equal(requests, 1);
  assert.equal(empty.externalLookupStatus, 'complete');
  assert.equal('preparationRadiusMetres' in empty, false);
  assert.deepEqual(empty.candidates, []);
});

test('no canonical choices plus provider outage yields typed retryable failure without candidate writes', async () => {
  const db = new MemoryFirestore();
  await assert.rejects(discoverNearbyCheckInPlaces(uid, {...point, accuracyMeters: 8, capturedAtMs: base},
    {db: db.asFirestore(), now: time(0), providerFailureLogger: () => {},
      fetchImpl: async () => { throw new Error('synthetic offline provider'); }}),
    (error: unknown) => error instanceof SocialDomainError && error.code === 'unavailable'
      && error.details?.condition === 'nearby_public_places_external_lookup_unavailable');
  assert.equal(db.writes, 0);
});

test('preparation pages beyond500 venues and rejects an incomplete pool beyond the5000 scan budget', async () => {
  const db = new MemoryFirestore();
  for (let index = 0; index < 501; index++) venue(db, `far-${index}`, 500);
  venue(db, 'near-after-first-page');
  const input = {...point, preparation: true, accuracyMeters: 8, capturedAtMs: base};
  const result = await listNearbyCanonicalCheckInVenues(input, {db: db.asFirestore(), now: time(0)});
  assert.deepEqual(result.candidates.map(candidate => candidate.venueId), ['near-after-first-page']);
  for (let index = 501; index < 5001; index++) venue(db, `far-${index}`, 500);
  await assert.rejects(listNearbyCanonicalCheckInVenues(input, {db: db.asFirestore(), now: time(0)}),
    (error: unknown) => error instanceof SocialDomainError && error.details?.condition === 'nearby_gathr_venues_incomplete');
});

test('prepared external pool is capped at20 and preserves public footprint geometry for client eligibility filtering', async () => {
  const db = new MemoryFirestore();
  const geometry = [
    {lat: point.latitude - 0.0001, lon: point.longitude - 0.0002},
    {lat: point.latitude + 0.0017, lon: point.longitude - 0.0002},
    {lat: point.latitude + 0.0017, lon: point.longitude + 0.0002},
    {lat: point.latitude - 0.0001, lon: point.longitude + 0.0002},
    {lat: point.latitude - 0.0001, lon: point.longitude - 0.0002},
  ];
  const elements: Doc[] = Array.from({length: 25}, (_, index) => ({type: 'node', id: index + 1,
    lat: point.latitude + (80 + index) / 111195, lon: point.longitude,
    tags: {name: `Prepared Pub ${index}`, amenity: 'pub', 'addr:street': 'Queen Street'}}));
  elements.unshift({type: 'way', id: 100, center: {lat: point.latitude + 0.0008, lon: point.longitude},
    geometry, tags: {name: 'Public Grounds', leisure: 'park', 'addr:street': 'Queen Street'}});
  const result = await discoverNearbyCheckInPlaces(uid, {...point, accuracyMeters: 8, capturedAtMs: base, preparation: true},
    {db: db.asFirestore(), now: time(0), fetchImpl: async () => new Response(JSON.stringify({elements}))});
  assert.equal(result.candidates.length, 20);
  assert.equal(result.preparationRadiusMetres, 175);
  const grounds = result.candidates.find(candidate => candidate.name === 'Public Grounds');
  assert.deepEqual(grounds?.checkInBoundary, geometry);
  await qualify(db);
  const grant = await bindCheckInReadiness(uid, bindInput({venueId: undefined,
    placeCandidateId: grounds!.id}), db.asFirestore(), time(200));
  assert.equal(grant.locationType, 'external_place');
});
