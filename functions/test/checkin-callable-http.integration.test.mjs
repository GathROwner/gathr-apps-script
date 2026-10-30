import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8097');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9098');
const projectId = 'demo-gathr-checkin-http';
const app = initializeApp({ projectId }, 'checkin-http-only');
const db = getFirestore(app);
after(() => deleteApp(app));
const names = ['recordCheckInReadinessSampleCallable', 'bindCheckInReadinessCallable',
  'createPrivateCheckInPlaceCandidateCallable', 'discoverNearbyCheckInPlacesCallable',
  'listNearbyCanonicalCheckInVenuesCallable'];
const point = { latitude: 46.2382, longitude: -63.1311, accuracyMeters: 17, speedMetersPerSecond: 0 };
async function call(name, data, token) {
  const response = await fetch(`http://127.0.0.1:5008/${projectId}/northamerica-northeast1/${name}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ data }),
  });
  const body = await response.json();
  return { status: response.status, error: body.error, result: body.result ?? body.data };
}

test('five actual HTTP callables enforce Auth and transport qualified preparation/binding', async () => {
  for (const name of names) {
    const reply = await call(name, {});
    assert.equal(reply.status, 401, name);
    assert.equal(reply.error.status, 'UNAUTHENTICATED', name);
  }
  const signed = await fetch(`http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `http-${Date.now()}@fixture.invalid`, password: 'Local-only-fixture-123', returnSecureToken: true }),
  });
  const identity = await signed.json();
  assert.equal(signed.ok, true, JSON.stringify(identity));
  const uid = identity.localId;
  const token = identity.idToken;
  await db.doc(`users/${uid}`).set({ displayName: 'Offline HTTP fixture' });
  const venueId = `http-fixture-${uid}`;
  await db.doc(`venues/${venueId}`).set({ pagename: 'HTTP canonical fixture', ...point });
  const sessionId = 'http-arrival-session';
  const first = await call(names[0], { protocolVersion: 1, reset: false, sessionId, sequence: 1, ...point, capturedAtMs: Date.now() }, token);
  assert.equal(first.status, 200, JSON.stringify(first));
  // Synthetic elapsed history only; reducer dwell is independently integration-tested.
  await db.doc(`checkInEligibilitySessions/${uid}_${sessionId}`).update({
    hereQualifyingMs: 30_000, placeQualifyingMs: 90_000, qualifyingMs: 90_000,
    hereReady: true, placeReady: true, lastSeenAt: Timestamp.fromMillis(Date.now() - 10_000),
    lastCapturedAtMs: Date.now() - 10_000,
  });
  const ready = await call(names[0], { protocolVersion: 1, reset: false, sessionId, sequence: 2, ...point, capturedAtMs: Date.now() }, token);
  assert.equal(ready.status, 200, JSON.stringify(ready));
  assert.equal(ready.result.arrival.place, true);
  for (const name of [names[3], names[4]]) {
    const prepared = await call(name, { preparation: true, ...point, capturedAtMs: Date.now() }, token);
    assert.equal(prepared.status, 200, JSON.stringify(prepared));
    assert.equal(prepared.result.preparationRadiusMetres, 175);
    const candidates = prepared.result.candidates ?? prepared.result.venues;
    // A repeated harness run intentionally reuses the server's five-minute
    // public cache, so an earlier synthetic venue is also a valid fixture.
    assert.ok(candidates.some(candidate => candidate.type === 'gathr_venue'
      && candidate.name === 'HTTP canonical fixture'), JSON.stringify(prepared));
    if (name === names[3]) assert.ok(candidates.some(candidate => candidate.type === 'external_place'), JSON.stringify(prepared));
  }
  const privatePlace = await call(names[2], { label: 'Private place', readinessSessionId: sessionId,
    latitude: 0, longitude: 0, accuracyMeters: 999, capturedAtMs: 1 }, token);
  assert.equal(privatePlace.status, 200, JSON.stringify(privatePlace));
  const candidateId = privatePlace.result.candidate.id;
  const stored = (await db.doc(`checkInPlaceCandidates/${candidateId}`).get()).data();
  assert.equal(stored.place.latitude, point.latitude);
  const bound = await call(names[1], { protocolVersion: 1, readinessSessionId: sessionId,
    useQualifiedArrival: true, operationId: 'http-bind-operation', placeCandidateId: candidateId,
    latitude: 0, longitude: 0, accuracyMeters: 999, capturedAtMs: 1 }, token);
  assert.equal(bound.status, 200, JSON.stringify(bound));
  assert.equal(bound.result.locationType, 'private_place');
  const createData = { operationId: 'http-create-operation', eligibilitySessionId: bound.result.eligibilitySessionId,
    placeCandidateId: candidateId, durationMinutes: 30, audienceMode: 'all_friends', shareExactLocation: false };
  const created = await call('createCheckInCallable', createData, token);
  assert.equal(created.status, 200, JSON.stringify(created));
  const retry = await call('createCheckInCallable', createData, token);
  assert.equal(retry.status, 200, JSON.stringify(retry));
  assert.equal(retry.result.revision, created.result.revision);
  const checkout = await call('checkOutCallable', { expectedRevision: created.result.revision }, token);
  assert.equal(checkout.status, 200, JSON.stringify(checkout));
  assert.equal(checkout.result.checkedOut, true);
  assert.equal((await db.doc(`activeCheckIns/${uid}`).get()).exists, false);
  const invalid = await call(names[1], { protocolVersion: 1, readinessSessionId: 'missing-session',
    useQualifiedArrival: true, operationId: 'http-bind-missing', venueId }, token);
  assert.equal(invalid.status, 400, JSON.stringify(invalid));
  assert.equal(invalid.error.status, 'FAILED_PRECONDITION');
});
