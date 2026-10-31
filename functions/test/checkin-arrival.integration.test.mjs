import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { recordCheckInReadinessSample, bindCheckInReadiness, checkInEligibilitySessionId } from '../lib/social/checkInEligibility.js';
import { createCheckIn } from '../lib/social/socialService.js';
import { createPrivateCheckInPlaceCandidate } from '../lib/social/nearbyCheckInPlaces.js';

// Never fall back to a real Firebase project or credentials.
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):8098$/);
const projectId = 'demo-gathr-checkin-arrival';
let app;
let db;
let sequence = 0;
// Existing synthetic integration-test point, independent of the user's location.
const point = { latitude: 46.2382, longitude: -63.1311, accuracyMeters: 17, speedMetersPerSecond: 0 };

before(() => { app = initializeApp({ projectId }, 'checkin-arrival-integration'); db = getFirestore(app); });
after(async () => { await deleteApp(app); });

async function qualified({ seconds = 90, ageSeconds = 90 } = {}) {
  const uid = `arrival-fixture-${++sequence}-${Date.now()}`;
  const sessionId = `arrival-session-${sequence}`;
  const venueId = `arrival-venue-${sequence}`;
  const nowMs = Date.now();
  const startMs = nowMs - (seconds + ageSeconds) * 1000;
  await db.doc(`users/${uid}`).set({ displayName: 'Local arrival fixture' });
  await db.doc(`venues/${venueId}`).set({ pagename: 'Local venue fixture (not live venue data)', ...point });
  let receipt;
  for (let elapsed = 0; elapsed <= seconds; elapsed += 10) {
    const capture = startMs + elapsed * 1000;
    receipt = await recordCheckInReadinessSample(uid, {
      protocolVersion: 1, reset: false, sessionId, sequence: elapsed / 10 + 1,
      ...point, capturedAtMs: capture,
    }, db, Timestamp.fromMillis(capture));
  }
  assert.equal(receipt.arrival?.here, true);
  assert.equal(receipt.arrival?.place, seconds >= 90);
  return { uid, sessionId, venueId, receipt, nowMs };
}

function binding(fixture, overrides = {}) {
  return {
    protocolVersion: 1, readinessSessionId: fixture.sessionId, operationId: 'arrival-bind-operation',
    venueId: fixture.venueId, ...point, capturedAtMs: fixture.receipt.arrival.capturedAtMs,
    useQualifiedArrival: true, ...overrides,
  };
}

test('real Firestore keeps both qualifying clocks without losing transport jitter or accepting one fast clock', async () => {
  const uid = `arrival-clock-fixture-${++sequence}-${Date.now()}`;
  const sessionId = `arrival-clock-session-${sequence}`;
  const base = Date.now() - 120_000;
  let receipt;
  for (let index = 0; index <= 9; index++) {
    const capturedAtMs = base + index * 10_000;
    const observedAtMs = capturedAtMs + (index % 2 || index === 0 ? 9_000 : 0);
    receipt = await recordCheckInReadinessSample(uid, {
      protocolVersion: 1, reset: false, sessionId, sequence: index + 1,
      ...point, capturedAtMs,
    }, db, Timestamp.fromMillis(observedAtMs));
    if (index === 3) assert.equal(receipt.arrival?.here, true);
  }
  assert.equal(receipt.arrival?.place, true);
  const saved = (await db.doc(`checkInEligibilitySessions/${checkInEligibilitySessionId(uid, sessionId)}`).get()).data();
  assert.equal(saved.hereCapturedQualifyingMs, 30_000);
  assert.equal(saved.hereObservedQualifyingMs, 30_000);
  assert.equal(saved.placeCapturedQualifyingMs, 90_000);
  assert.equal(saved.placeObservedQualifyingMs, 90_000);

  const fastUid = `${uid}-fast-capture`;
  let fast;
  for (let index = 0; index <= 3; index++) {
    fast = await recordCheckInReadinessSample(fastUid, {
      protocolVersion: 1, reset: false, sessionId, sequence: index + 1,
      ...point, capturedAtMs: base + index * 10_000,
    }, db, Timestamp.fromMillis(base + 21_000 + index * 3_000));
  }
  assert.equal(fast.hereQualifyingMs, 9_000);
  assert.equal(fast.hereReady, false);
});

test('qualified arrival survives an expired raw receipt and creates exactly one idempotent check-in', async () => {
  const fixture = await qualified();
  assert.ok(fixture.receipt.expiresAtMs < fixture.nowMs);
  assert.ok(fixture.receipt.arrival.expiresAtMs > fixture.nowMs);
  const input = binding(fixture);
  const firstGrant = await bindCheckInReadiness(fixture.uid, input, db, Timestamp.fromMillis(fixture.nowMs));
  const retryGrant = await bindCheckInReadiness(fixture.uid, input, db, Timestamp.fromMillis(fixture.nowMs + 1000));
  assert.equal(firstGrant.eligibilitySessionId, retryGrant.eligibilitySessionId);
  const createInput = {
    venueId: fixture.venueId, eligibilitySessionId: firstGrant.eligibilitySessionId,
    operationId: 'arrival-create-operation', durationMinutes: 60, audienceMode: 'all_friends',
    shareExactLocation: false, message: 'Local fixture only',
  };
  const [first, retry] = await Promise.all([
    createCheckIn(fixture.uid, createInput, db), createCheckIn(fixture.uid, createInput, db),
  ]);
  assert.equal(first.revision, retry.revision);
  const stored = await db.doc(`checkInEligibilitySessions/${checkInEligibilitySessionId(fixture.uid, fixture.sessionId)}`).get();
  assert.ok(stored.data().consumedAt instanceof Timestamp);
  await assert.rejects(bindCheckInReadiness(fixture.uid, { ...input, operationId: 'different-bind-operation' }, db),
    error => error.code === 'failed-precondition');
});

test('arrival cannot be rebound to a substituted target or used by another account', async () => {
  const fixture = await qualified();
  const remoteId = `${fixture.venueId}-remote`;
  await db.doc(`venues/${remoteId}`).set({ pagename: 'Remote fixture', latitude: point.latitude + 0.01, longitude: point.longitude });
  await assert.rejects(bindCheckInReadiness(fixture.uid, binding(fixture, { venueId: remoteId }), db), /outside|location|place|match/i);
  await assert.rejects(bindCheckInReadiness(`${fixture.uid}-other`, binding(fixture), db),
    error => error.code === 'failed-precondition');
});

test('expired arrival fails closed even when caller resends the previously qualified coordinates', async () => {
  const fixture = await qualified();
  await assert.rejects(bindCheckInReadiness(fixture.uid, binding(fixture), db,
    Timestamp.fromMillis(fixture.receipt.arrival.expiresAtMs + 1)), /expired|readiness|arrival/i);
});

test('Here private candidate uses the server arrival without refreshing an old capture timestamp', async () => {
  const fixture = await qualified({ seconds: 30, ageSeconds: 90 });
  const candidateResult = await createPrivateCheckInPlaceCandidate(fixture.uid, {
    label: 'Home', readinessSessionId: fixture.sessionId,
    ...point, capturedAtMs: fixture.receipt.arrival.capturedAtMs,
  }, { db, now: Timestamp.fromMillis(fixture.nowMs) });
  assert.equal(candidateResult.candidate.type, 'private_place');
  const grant = await bindCheckInReadiness(fixture.uid, binding(fixture, {
    venueId: undefined, placeCandidateId: candidateResult.candidate.id,
  }), db, Timestamp.fromMillis(fixture.nowMs));
  assert.equal(grant.locationType, 'private_place');
  assert.equal(grant.exactPrivateAllowed, true);
});
