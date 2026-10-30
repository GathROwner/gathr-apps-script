import assert from 'node:assert/strict';
import test, {after, before} from 'node:test';
import {initializeApp, deleteApp} from 'firebase-admin/app';
import {getFirestore, Timestamp} from 'firebase-admin/firestore';
import {createPrivateCheckInPlaceCandidate} from '../lib/social/nearbyCheckInPlaces.js';

// This file can never fall back to a production endpoint or application credential.
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):8098$/);
let app;
let db;
before(() => {app = initializeApp({projectId: 'demo-gathr-private-candidate-limit'}, 'private-candidate-limit'); db = getFirestore(app);});
after(async () => {await deleteApp(app);});

test('twenty private candidates/hour commit atomically; the rejected21st writes no candidate or counter increment', async () => {
  const uid = `private-limit-${Date.now()}`;
  const now = Timestamp.now();
  const input = {label: 'Home', latitude: 46.2382, longitude: -63.1311,
    accuracyMeters: 17, capturedAtMs: now.toMillis()};
  for (let count = 0; count < 20; count++) await createPrivateCheckInPlaceCandidate(uid, input, {db, now});
  const rateRef = db.doc(`socialRateLimits/${uid}_private_check_in_place_candidate`);
  const beforeLimit = (await rateRef.get()).data();
  assert.equal(beforeLimit.count, 20);
  assert.equal(beforeLimit.action, 'private_check_in_place_candidate');
  assert.equal(beforeLimit.windowStartedAt.toMillis(), now.toMillis());
  assert.equal(beforeLimit.expiresAt.toMillis(), now.toMillis() + 2 * 60 * 60_000);
  await assert.rejects(createPrivateCheckInPlaceCandidate(uid, input, {db, now}), error => error.code === 'resource-exhausted');
  assert.equal((await rateRef.get()).data().count, 20);
  const candidates = await db.collection('checkInPlaceCandidates').where('uid', '==', uid).get();
  assert.equal(candidates.size, 20);
  const nextWindow = Timestamp.fromMillis(now.toMillis() + 60 * 60_000);
  await createPrivateCheckInPlaceCandidate(uid, {...input, capturedAtMs: nextWindow.toMillis()}, {db, now: nextWindow});
  assert.equal((await rateRef.get()).data().count, 1);
});

test('two concurrent last-slot requests create exactly one candidate and leave count20', async () => {
  const uid = `private-limit-last-slot-${Date.now()}`;
  const now = Timestamp.now();
  const rateRef = db.doc(`socialRateLimits/${uid}_private_check_in_place_candidate`);
  await rateRef.set({uid, action: 'private_check_in_place_candidate', count: 19,
    windowStartedAt: now, expiresAt: Timestamp.fromMillis(now.toMillis() + 2 * 60 * 60_000)});
  const input = {label: 'Private gathering', latitude: 46.2382, longitude: -63.1311,
    accuracyMeters: 17, capturedAtMs: now.toMillis()};
  const results = await Promise.allSettled([createPrivateCheckInPlaceCandidate(uid, input, {db, now}),
    createPrivateCheckInPlaceCandidate(uid, input, {db, now})]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = results.find(result => result.status === 'rejected');
  assert.equal(rejected.reason.code, 'resource-exhausted');
  assert.equal((await rateRef.get()).data().count, 20);
  assert.equal((await db.collection('checkInPlaceCandidates').where('uid', '==', uid).get()).size, 1);
});
