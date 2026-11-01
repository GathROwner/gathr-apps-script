import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {Timestamp, type DocumentData, type Firestore} from 'firebase-admin/firestore';
import {recordCheckInReadinessSample} from './checkInEligibility.js';
import {checkInPreparationPoolDocumentId, discoverNearbyCheckInPlaces, renewNearbyCheckInPreparation,
  validateCheckInPlaceCandidate, type CheckInPreparationPool} from './nearbyCheckInPlaces.js';
import {SocialDomainError} from './validation.js';

type Doc = DocumentData; // Small deterministic double; real transactions have separate emulator coverage.
class MemoryDb {
  documents = new Map<string, Doc>();
  reads = 0; writes = 0; queries = 0;
  snapshot(path: string) {const data = this.documents.get(path); return {id: path.split('/').at(-1), exists: !!data, data: () => data};}
  collection(name: string) {
    const query = (filters: {field: string; op: string; value: unknown}[] = []) => ({
      where: (field: string, op: string, value: unknown) => query([...filters, {field, op, value}]),
      limit: (limit: number) => ({get: async () => {
        this.queries++;
        const docs = [...this.documents].filter(([path, data]) => path.startsWith(name + '/')
          && filters.every(f => typeof data[f.field] === typeof f.value && (f.op === '>='
            ? data[f.field] >= f.value! : data[f.field] <= f.value!))).slice(0, limit).map(([path]) => this.snapshot(path));
        this.reads += docs.length; return {docs};
      }}),
    });
    return {...query(), doc: (id: string) => ({path: `${name}/${id}`})};
  }
  async getAll(...refs: {path: string}[]) {this.reads += refs.length; return refs.map(ref => this.snapshot(ref.path));}
  batch() {const work: [string, Doc][] = [];return {set: (ref: {path: string}, data: Doc) => work.push([ref.path, data]),
    commit: async () => {for (const [path, data] of work) {this.documents.set(path, data);this.writes++;}}};}
  async runTransaction<T>(work: (tx: unknown) => Promise<T>): Promise<T> {
    const writes: [string, Doc][] = [];
    const result = await work({get: async (ref: {path: string}) => {this.reads++;return this.snapshot(ref.path);},
      getAll: (...refs: {path: string}[]) => this.getAll(...refs),
      set: (ref: {path: string}, data: Doc) => writes.push([ref.path, data]),
      update: (ref: {path: string}, data: Doc) => {assert.ok(this.documents.has(ref.path));
        writes.push([ref.path, {...this.documents.get(ref.path), ...data}]);}});
    for (const [path, data] of writes) {this.documents.set(path, data);this.writes++;}return result;
  }
  firestore() {return this as unknown as Firestore;}
}
const point = {latitude: 46.2571607, longitude: -63.1406688};
// Keep dataset-dependent renewal tests after the actual bundled source date.
const catalogueManifest = JSON.parse(readFileSync(join(__dirname, 'data', 'pei-osm-catalogue.json'), 'utf8')).manifest;
const baseMs = Date.parse(catalogueManifest.sourceTimestamp) + 24 * 3_600_000;
const uid = 'renewal-unit-owner', sessionId = 'renewal-unit-session';
const at = (ms: number) => Timestamp.fromMillis(ms);
const input = (ms: number, extra: Doc = {}) => ({...point, preparation: true, accuracyMeters: 17, capturedAtMs: ms, ...extra});
const payload = {elements: [{type: 'node', id: 6835691382, lat: point.latitude, lon: point.longitude,
  tags: {name: 'The Fox & Crow', amenity: 'pub'}}]};
const provider = async () => ({ok: true, status: 200, json: async () => payload}) as Response;
async function prepare(db: MemoryDb, ms = baseMs, extra: Doc = {}) {
  return discoverNearbyCheckInPlaces(uid, input(ms), {db: db.firestore(), now: at(ms),
    useBundledCatalogue: false, fetchImpl: provider, ...extra});
}
async function here(db: MemoryDb, ms: number) {
  let receipt;
  for (let elapsed = 0; elapsed <= 30_000; elapsed += 10_000) {
    const stamp = ms - 30_000 + elapsed;
    receipt = await recordCheckInReadinessSample(uid, {...input(stamp), sessionId, sequence: stamp,
      reset: false, protocolVersion: 1, speedMetersPerSecond: 0}, db.firestore(), at(stamp));
  }
  assert.equal(receipt?.arrival?.here, true);return receipt!;
}
function renewal(pool: CheckInPreparationPool, ms: number, extra: Doc = {}) {
  return {...input(ms), renewPreparationPool: {poolId: pool.id, readinessSessionId: sessionId}, ...extra};
}
function condition(expected: string) {return (error: unknown) => error instanceof SocialDomainError && error.details?.condition === expected;}
async function fixture() {const db = new MemoryDb();const initial = await prepare(db);const ms = baseMs + 600_000;
  await here(db, ms);return {db, initial, ms, pool: initial.preparationPool!};}

test('complete preparation atomically stores capped original IDs; metadata cannot be bound', async () => {
  const db = new MemoryDb();const result = await prepare(db);
  const metadata = db.documents.get('checkInPlaceCandidates/' + checkInPreparationPoolDocumentId(uid))!;
  assert.equal(result.preparationReused, false);assert.equal(metadata.mode, 'nearby_preparation_pool_v1');
  assert.deepEqual(metadata.candidateIds, result.candidates.map(c => c.id));
  assert.equal(db.documents.size, result.candidates.length + 1);
  assert.throws(() => validateCheckInPlaceCandidate(metadata, uid, checkInPreparationPoolDocumentId(uid), at(baseMs)));
});

test('Here30 renews same IDs only, original coverage and immutable target; canonical query is fresh', async () => {
  const {db, initial, ms, pool} = await fixture();
  // This canonical record was not present during the initial cached query.
  db.documents.set('venues/new-canonical', {...point, pagename: 'New canonical'});
  const before = new Map([...db.documents].map(([path, value]) => [path, {...value}]));
  const queries = db.queries, reads = db.reads;
  const result = await renewNearbyCheckInPreparation(uid, renewal(pool, ms,
    {latitude: point.latitude + 19 / 111_320}), {db: db.firestore(), now: at(ms)});
  assert.equal(result.preparationReused, true);
  assert.deepEqual(result.candidates.filter(c => c.type === 'external_place').map(c => c.id), initial.candidates.map(c => c.id));
  assert.equal(result.preparationPool?.originLatitude, point.latitude);
  assert.equal(result.preparationPool?.expiresAtMs, ms + 900_000);
  assert.equal(result.preparationPool?.refreshAtMs, ms + 600_000);
  assert.equal(result.preparationPool?.sourceExpiresAtMs, baseMs + 6 * 3_600_000);
  assert.ok(result.candidates.some(c => c.venueId === 'new-canonical'));
  assert.equal(db.queries - queries, 2);assert.equal(db.reads - reads, 6, '4 guards +1 candidate +1 canonical result');
  assert.deepEqual([...db.documents.keys()].sort(), [...before.keys()].sort(), 'No UUID minted');
  const id = initial.candidates[0].id, old = before.get('checkInPlaceCandidates/' + id)!;
  const changed = db.documents.get('checkInPlaceCandidates/' + id)!;
  assert.deepEqual({...changed, expiresAt: old.expiresAt}, old, 'Only expiresAt changes on candidate');
});

test('honest empty complete pool can renew without minting any candidate', async () => {
  const db = new MemoryDb();const initial = await prepare(db, baseMs,
    {fetchImpl: async () => ({ok: true, json: async () => ({elements: []})}) as Response});
  const ms = baseMs + 600_000;await here(db, ms);
  const result = await renewNearbyCheckInPreparation(uid, renewal(initial.preparationPool!, ms), {db: db.firestore(), now: at(ms)});
  assert.deepEqual(result.candidates, []);assert.equal(db.documents.size, 3, 'Pool +session +owner only');
});

test('partial preparation never creates renewable metadata', async () => {
  const db = new MemoryDb();const result = await prepare(db, baseMs, {fetchImpl: async () => {throw Error('offline');}, providerFailureLogger: () => {}});
  assert.equal(result.externalLookupStatus, 'partial_unavailable');assert.equal(result.preparationPool, undefined);
  assert.equal(db.documents.size, 0);
});

for (const failure of ['expired-candidate', 'consumed', 'missing-candidate', 'mutated-place', 'expired-pool', 'wrong-pool', 'moved', 'wrong-owner']) {
  test(`renewal refuses ${failure} without extending any record or contacting a provider`, async () => {
    const {db, initial, ms, pool} = await fixture();const candidatePath = 'checkInPlaceCandidates/' + initial.candidates[0].id;
    const metadata = db.documents.get('checkInPlaceCandidates/' + checkInPreparationPoolDocumentId(uid))!;
    const args = renewal(pool, ms);
    if (failure === 'expired-candidate') db.documents.get(candidatePath)!.expiresAt = at(ms);
    if (failure === 'consumed') db.documents.get(candidatePath)!.consumedAt = at(ms - 1);
    if (failure === 'missing-candidate') db.documents.delete(candidatePath);
    if (failure === 'mutated-place') db.documents.get(candidatePath)!.place = {...db.documents.get(candidatePath)!.place, name: 'Different target'};
    if (failure === 'expired-pool') metadata.expiresAt = at(ms);
    if (failure === 'wrong-pool') args.renewPreparationPool.poolId = 'other-pool-generation';
    if (failure === 'moved') args.latitude += 21 / 111_320;
    if (failure === 'wrong-owner') metadata.uid = 'somebody-else';
    const writes = db.writes, queries = db.queries;
    await assert.rejects(renewNearbyCheckInPreparation(uid, args, {db: db.firestore(), now: at(ms)}), condition('rediscovery_required'));
    assert.equal(db.writes, writes);assert.equal(db.queries, queries);
  });
}

for (const failure of ['raw-stale', 'raw-inaccurate', 'server-stale', 'less-than30', 'inactive-session', 'consumed-session', 'active-checkin']) {
  test(`unqualified renewal (${failure}) never triggers discovery`, async () => {
    const {db, ms, pool} = await fixture();const args = renewal(pool, ms);
    const session = db.documents.get(`checkInEligibilitySessions/${uid}_${sessionId}`)!;
    if (failure === 'raw-stale') args.capturedAtMs -= 60_001;
    if (failure === 'raw-inaccurate') args.accuracyMeters = 51;
    if (failure === 'server-stale') session.lastHereQualifyingAt = at(ms - 60_001);
    if (failure === 'less-than30') session.hereQualifyingMs = 29_999;
    if (failure === 'inactive-session') db.documents.get(`checkInEligibilitySessions/${uid}__readiness_owner`)!.activeSessionId = 'another-session';
    if (failure === 'consumed-session') session.consumedAt = at(ms - 1);
    if (failure === 'active-checkin') db.documents.set('activeCheckIns/' + uid, {uid});
    const writes = db.writes;
    await assert.rejects(renewNearbyCheckInPreparation(uid, args, {db: db.firestore(), now: at(ms)}), condition('preparation_renewal_unqualified'));
    assert.equal(db.writes, writes);
  });
}

test('eight-hour stationary simulation needs2 normal lookups and47 renewals; source expires at6h', async () => {
  const db = new MemoryDb();let providerCalls = 0;
  const options = {fetchImpl: async () => {providerCalls++;return provider();}};
  let result = await prepare(db, baseMs, options);let pool = result.preparationPool!;
  const firstIds = result.candidates.map(c => c.id);let renewals = 0;
  for (let minutes = 10; minutes <= 480; minutes += 10) {
    const ms = baseMs + minutes * 60_000;await here(db, ms);
    if (minutes === 360) {
      await assert.rejects(renewNearbyCheckInPreparation(uid, renewal(pool, ms), {db: db.firestore(), now: at(ms)}), condition('rediscovery_required'));
      result = await prepare(db, ms, options);pool = result.preparationPool!;
      assert.notDeepEqual(result.candidates.map(c => c.id), firstIds);
    } else {
      const next = await renewNearbyCheckInPreparation(uid, renewal(pool, ms), {db: db.firestore(), now: at(ms)});
      assert.deepEqual(next.candidates.map(c => c.id), result.candidates.map(c => c.id));
      assert.ok(next.preparationPool!.expiresAtMs <= pool.sourceExpiresAtMs);pool = next.preparationPool!;renewals++;
    }
  }
  assert.equal(providerCalls, 2);assert.equal(renewals, 47);
});

test('regional version changes cannot renew cached candidates', async () => {
  const db = new MemoryDb();const initial = await prepare(db, baseMs, {useBundledCatalogue: true});
  const ms = baseMs + 600_000;await here(db, ms);
  db.documents.get('checkInPlaceCandidates/' + checkInPreparationPoolDocumentId(uid))!.catalogVersion = 'old-regional-version';
  await assert.rejects(renewNearbyCheckInPreparation(uid, renewal(initial.preparationPool!, ms), {db: db.firestore(), now: at(ms)}), condition('rediscovery_required'));
});

test('overdue regional data renews a current pool with an explicit maintenance signal and unchanged lease cap', async () => {
  const db = new MemoryDb();
  const ms = baseMs + 8 * 24 * 3_600_000;await here(db, ms);
  const initial = await prepare(db, ms - 600_000, {useBundledCatalogue: true});
  assert.equal(initial.catalogReason, 'catalogue_refresh_overdue');
  const result = await renewNearbyCheckInPreparation(uid, renewal(initial.preparationPool!, ms), {db: db.firestore(), now: at(ms)});
  assert.equal(result.externalLookupStatus, 'complete');
  assert.equal(result.catalogReason, 'catalogue_refresh_overdue');
  assert.equal(result.catalogVersion, initial.catalogVersion);
  assert.equal(result.catalogSourceTimestamp, initial.catalogSourceTimestamp);
  assert.deepEqual(result.candidates.map(c => c.id), initial.candidates.map(c => c.id));
  assert.equal(result.preparationPool!.expiresAtMs, ms + 900_000);
  assert.equal(result.preparationPool!.sourceExpiresAtMs, ms - 600_000 + 6 * 3_600_000);
  db.documents.get('checkInPlaceCandidates/' + checkInPreparationPoolDocumentId(uid))!.catalogVersion = 'changed-version';
  const writes = db.writes;
  await assert.rejects(renewNearbyCheckInPreparation(uid, renewal(initial.preparationPool!, ms), {db: db.firestore(), now: at(ms)}), condition('rediscovery_required'));
  assert.equal(db.writes, writes);
});

for (const failure of ['source-mismatch', 'expired-candidate', 'consumed', 'departed', 'unqualified']) {
  test(`overdue regional availability still refuses ${failure} without writes`, async () => {
    const db = new MemoryDb();const ms = baseMs + 8 * 24 * 3_600_000;
    const initial = await prepare(db, ms - 600_000, {useBundledCatalogue: true});
    await here(db, ms);
    const args = renewal(initial.preparationPool!, ms);
    const pool = db.documents.get('checkInPlaceCandidates/' + checkInPreparationPoolDocumentId(uid))!;
    const candidate = db.documents.get('checkInPlaceCandidates/' + initial.candidates[0].id)!;
    if (failure === 'source-mismatch') pool.catalogSourceTimestamp = '2020-01-01T00:00:00Z';
    if (failure === 'expired-candidate') candidate.expiresAt = at(ms);
    if (failure === 'consumed') candidate.consumedAt = at(ms - 1);
    if (failure === 'departed') args.latitude += 21 / 111_320;
    if (failure === 'unqualified') db.documents.get(`checkInEligibilitySessions/${uid}_${sessionId}`)!.hereQualifyingMs = 29_999;
    const writes = db.writes;
    await assert.rejects(renewNearbyCheckInPreparation(uid, args, {db: db.firestore(), now: at(ms)}),
      condition(failure === 'unqualified' ? 'preparation_renewal_unqualified' : 'rediscovery_required'));
    assert.equal(db.writes, writes);
  });
}
