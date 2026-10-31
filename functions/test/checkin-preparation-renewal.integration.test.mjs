import assert from 'node:assert/strict';
import test, {before, after} from 'node:test';
import {initializeApp, deleteApp} from 'firebase-admin/app';
import {getFirestore, Timestamp} from 'firebase-admin/firestore';
import {discoverNearbyCheckInPlaces, renewNearbyCheckInPreparation, checkInPreparationPoolDocumentId} from '../lib/social/nearbyCheckInPlaces.js';
import {recordCheckInReadinessSample} from '../lib/social/checkInEligibility.js';
import {discoverNearbyCheckInPlacesCallable} from '../lib/social/callables.js';

// Domain+actual callable wrapper execution against a separate local namespace;
// not an HTTP/native transport test and never a production project or Auth user.
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8097');
assert.equal(process.env.GCLOUD_PROJECT, 'demo-gathr-preparation-renewal');
const projectId = 'demo-gathr-preparation-renewal';
const point = {latitude: 46.2571607, longitude: -63.1406688};
let app, db, count = 0;
before(() => {app = initializeApp({projectId});db = getFirestore(app);});
after(async () => {await deleteApp(app);});
const input = ms => ({...point, preparation: true, accuracyMeters: 17, capturedAtMs: ms});
async function fixture() {
  const uid = `pool-renewal-${Date.now()}-${++count}`, sessionId = 'local-renewal-session';
  const ms = Date.now();
  const initial = await discoverNearbyCheckInPlaces(uid, input(ms), {db, now: Timestamp.fromMillis(ms)});
  for (let elapsed = 0; elapsed <= 30_000; elapsed += 10_000) {
    const stamp = ms - 30_000 + elapsed;
    await recordCheckInReadinessSample(uid, {...input(stamp), protocolVersion: 1, reset: false,
      sessionId, sequence: elapsed / 10_000, speedMetersPerSecond: 0}, db, Timestamp.fromMillis(stamp));
  }
  assert.ok(initial.preparationPool);assert.ok(initial.candidates.length);
  return {uid, sessionId, ms, initial, args: {...input(ms),
    renewPreparationPool: {poolId: initial.preparationPool.id, readinessSessionId: sessionId}}};
}
function invoke(uid, data) {return discoverNearbyCheckInPlacesCallable.run({auth: {uid}, data});}

test('actual wrapper keeps20/day ordinary cap, separate8/hour renewal including refusals, never free fallback', async () => {
  const f = await fixture();
  const ordinary = db.doc(`socialRateLimits/${f.uid}_nearby_check_in_places`);
  await ordinary.set({uid: f.uid, count: 20, windowStartedAt: Timestamp.now()});
  await assert.rejects(invoke(f.uid, input(Date.now())), error => error.code === 'resource-exhausted');
  assert.equal((await ordinary.get()).data().count, 20);
  const renewed = await invoke(f.uid, {...f.args, capturedAtMs: Date.now()});
  assert.equal(renewed.preparationReused, true);
  assert.deepEqual(renewed.candidates.map(c => c.id), f.initial.candidates.map(c => c.id));
  // All seven invalid generation attempts count, without normal discovery.
  for (let index = 0; index < 7; index++) {
    await assert.rejects(invoke(f.uid, {...f.args, capturedAtMs: Date.now(),
      renewPreparationPool: {...f.args.renewPreparationPool, poolId: 'nonexistent-generation'}}),
    error => error.details?.condition === 'rediscovery_required');
  }
  await assert.rejects(invoke(f.uid, {...f.args, capturedAtMs: Date.now()}),
    error => error.code === 'resource-exhausted' && error.details?.condition === 'preparation_renewal_rate_limited');
  assert.equal((await db.doc(`socialRateLimits/${f.uid}_nearby_preparation_renewal`).get()).data().count, 8);
  assert.equal((await ordinary.get()).data().count, 20);
});

test('actual transaction consumption race never revives consumed candidate or substitutes IDs', async () => {
  const f = await fixture();
  const external = f.initial.candidates.filter(c => c.type === 'external_place');
  const ref = db.doc('checkInPlaceCandidates/' + external[0].id);
  const outcomes = await Promise.allSettled([
    renewNearbyCheckInPreparation(f.uid, f.args, {db, now: Timestamp.fromMillis(f.ms + 1)}),
    db.runTransaction(async tx => {const snapshot = await tx.get(ref);assert.ok(!snapshot.data().consumedAt);
      tx.update(ref, {consumedAt: Timestamp.fromMillis(f.ms + 2), consumedCheckInRevision: 'synthetic-race-revision'});}),
  ]);
  assert.equal(outcomes[1].status, 'fulfilled');
  if (outcomes[0].status === 'fulfilled') {
    assert.deepEqual(outcomes[0].value.candidates.map(c => c.id), f.initial.candidates.map(c => c.id));
  } else assert.equal(outcomes[0].reason.details?.condition, 'rediscovery_required');
  const before = (await ref.get()).data();assert.ok(before.consumedAt);
  await assert.rejects(renewNearbyCheckInPreparation(f.uid, f.args, {db, now: Timestamp.fromMillis(f.ms + 3)}),
    error => error.details?.condition === 'rediscovery_required');
  assert.deepEqual((await ref.get()).data(), before);
  const pool = (await db.doc('checkInPlaceCandidates/' + checkInPreparationPoolDocumentId(f.uid)).get()).data();
  assert.deepEqual(pool.candidateIds.sort(), external.map(c => c.id).sort());
});

test('actual transaction handles concurrent renewals with original UUIDs and no additional candidate docs', async () => {
  const f = await fixture();
  const results = await Promise.all([0, 1].map(index => renewNearbyCheckInPreparation(f.uid, f.args,
    {db, now: Timestamp.fromMillis(f.ms + index)})));
  for (const result of results) assert.deepEqual(result.candidates.map(c => c.id), f.initial.candidates.map(c => c.id));
  const docs = await db.collection('checkInPlaceCandidates').where('uid', '==', f.uid).get();
  assert.equal(docs.size, f.initial.candidates.filter(c => c.type === 'external_place').length + 1);
  const ids = f.initial.candidates.filter(c => c.type === 'external_place').map(c => c.id);
  for (const doc of docs.docs) assert.ok(ids.includes(doc.id) || doc.id === checkInPreparationPoolDocumentId(f.uid));
});

test('a concurrent ordinary discovery owns the new generation; old renewal cannot overwrite it', async () => {
  const f = await fixture();
  const results = await Promise.allSettled([
    renewNearbyCheckInPreparation(f.uid, f.args, {db, now: Timestamp.fromMillis(f.ms + 1)}),
    discoverNearbyCheckInPlaces(f.uid, input(f.ms + 2), {db, now: Timestamp.fromMillis(f.ms + 2)}),
  ]);
  assert.equal(results[1].status, 'fulfilled');
  const next = results[1].value;
  assert.notEqual(next.preparationPool.id, f.initial.preparationPool.id);
  const metadata = (await db.doc('checkInPlaceCandidates/' + checkInPreparationPoolDocumentId(f.uid)).get()).data();
  assert.equal(metadata.poolId, next.preparationPool.id);
  assert.equal(metadata.discoveredAt.toMillis(), f.ms + 2);
  assert.deepEqual(metadata.candidateIds.sort(), next.candidates.filter(c => c.type === 'external_place').map(c => c.id).sort());
  await assert.rejects(renewNearbyCheckInPreparation(f.uid, f.args, {db, now: Timestamp.fromMillis(f.ms + 3)}),
    error => error.details?.condition === 'rediscovery_required');
});

test('another UID cannot renew or use metadata as a candidate; failure consumes renewal allowance only', async () => {
  const f = await fixture();const intruder = f.uid + '-other';
  const before = (await db.doc('checkInPlaceCandidates/' + checkInPreparationPoolDocumentId(f.uid)).get()).data();
  await assert.rejects(invoke(intruder, {...f.args, capturedAtMs: Date.now()}),
    error => error.details?.condition === 'preparation_renewal_unqualified');
  assert.deepEqual((await db.doc('checkInPlaceCandidates/' + checkInPreparationPoolDocumentId(f.uid)).get()).data(), before);
  assert.equal((await db.doc(`socialRateLimits/${intruder}_nearby_preparation_renewal`).get()).data().count, 1);
  assert.equal((await db.doc(`socialRateLimits/${intruder}_nearby_check_in_places`).get()).exists, false);
});
