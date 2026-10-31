import assert from 'node:assert/strict';
import test from 'node:test';

import { Timestamp, type Firestore } from 'firebase-admin/firestore';

import {
  assertCompletedCheckInEligibility,
  bindCheckInReadiness,
  CHECK_IN_POST_CHECKOUT_RESUME_MS,
  checkInEligibilitySessionId,
  recordCheckInReadinessSample,
} from './checkInEligibility.js';
import { SocialDomainError } from './validation.js';

type StoredDocument = Record<string, unknown>;
type TestReference = { path: string };
type TestSnapshot = { exists: boolean; data: () => StoredDocument | undefined };
type TestTransaction = {
  get: (reference: TestReference) => Promise<TestSnapshot>;
  getAll: (...references: TestReference[]) => Promise<TestSnapshot[]>;
  set: (reference: TestReference, value: StoredDocument, options?: { merge?: boolean }) => void;
  update: (reference: TestReference, value: StoredDocument) => void;
};

class ReadinessFirestore {
  readonly documents = new Map<string, StoredDocument>();

  collection(name: string) {
    return { doc: (id: string) => ({ path: `${name}/${id}` }) };
  }

  async runTransaction<T>(work: (transaction: TestTransaction) => Promise<T>): Promise<T> {
    const snapshot = (reference: TestReference) => {
      const value = this.documents.get(reference.path);
      return {
        exists: value !== undefined,
        data: () => value,
      };
    };
    const transaction = {
      get: async (reference: TestReference) => snapshot(reference),
      getAll: async (...references: TestReference[]) => references.map(snapshot),
      set: (reference: TestReference, value: StoredDocument, options?: { merge?: boolean }) => {
        const current = this.documents.get(reference.path) || {};
        this.documents.set(reference.path, options?.merge ? { ...current, ...value } : value);
      },
      update: (reference: TestReference, value: StoredDocument) => {
        const current = this.documents.get(reference.path);
        if (!current) throw new Error(`Cannot update missing document ${reference.path}`);
        this.documents.set(reference.path, { ...current, ...value });
      },
    };
    return work(transaction);
  }
}

const uid = 'checkout-resume-user';
const oldSessionId = 'readiness-before-checkout-001';
const newSessionId = 'readiness-after-checkout-001';
const ownerPath = `checkInEligibilitySessions/${uid}__readiness_owner`;
const startMs = 2_000_000_000_000;

function freshDatabase(nowMs: number) {
  const db = new ReadinessFirestore();
  const resumeUntilAt = Timestamp.fromMillis(nowMs + CHECK_IN_POST_CHECKOUT_RESUME_MS);
  const oldSessionPath = `checkInEligibilitySessions/${checkInEligibilitySessionId(uid, oldSessionId)}`;
  db.documents.set(ownerPath, {
    uid,
    mode: 'prequalification_owner_v1',
    activeSessionId: oldSessionId,
    resumeSessionId: oldSessionId,
    resumeUntilAt,
    expiresAt: resumeUntilAt,
  });
  db.documents.set(oldSessionPath, {
    uid,
    mode: 'prequalification_v1',
    sessionId: oldSessionId,
    boundAt: Timestamp.fromMillis(nowMs - 3_600_000),
    consumedAt: Timestamp.fromMillis(nowMs - 3_600_000),
    expiresAt: resumeUntilAt,
    hereQualifyingMs: 30_000,
    placeQualifyingMs: 90_000,
    anchorLatitude: 46.2382,
    anchorLongitude: -63.1311,
    lastLatitude: 46.2382,
    lastLongitude: -63.1311,
    lastAccuracyMeters: 8,
    lastSpeedMetersPerSecond: 0,
    lastCapturedAtMs: nowMs - 3_600_000,
    lastSeenAt: Timestamp.fromMillis(nowMs - 3_600_000),
  });
  return db;
}

function sample(sessionId: string, sequence: number, nowMs: number, overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: 1,
    reset: false,
    sessionId,
    sequence,
    latitude: 46.2382,
    longitude: -63.1311,
    accuracyMeters: 8,
    speedMetersPerSecond: 0,
    capturedAtMs: nowMs - 250,
    ...overrides,
  };
}

test('readiness latency variation does not discard qualifying captured or server-observed time', async () => {
  const db = new ReadinessFirestore();
  const sessionId = 'latency-bank-session-001';
  let receipt;
  for (let index = 0; index <= 9; index++) {
    const capturedAtMs = startMs + index * 10_000;
    const observedAtMs = capturedAtMs + (index % 2 ? 9_000 : index === 0 ? 9_000 : 0);
    receipt = await recordCheckInReadinessSample(uid,
      sample(sessionId, index + 1, observedAtMs, { capturedAtMs }),
      db as unknown as Firestore, Timestamp.fromMillis(observedAtMs));
    if (index === 3) {
      assert.equal(receipt.hereQualifyingMs, 30_000, '30s captured AND 30s observed should qualify Here');
      assert.equal(receipt.arrival?.here, true);
    }
  }
  assert.equal(receipt?.placeQualifyingMs, 90_000, 'latency jitter must not turn 90s into repeated extra waiting');
  assert.equal(receipt?.arrival?.place, true);
});

test('readiness credit remains bounded by both clocks with no fast capture or server-time shortcut', async () => {
  for (const fastClock of ['capture', 'server']) {
    const db = new ReadinessFirestore();
    const sessionId = `fast-${fastClock}-session-001`;
    let receipt;
    for (let index = 0; index <= 3; index++) {
      // All fixes remain in the accepted age/future window. Neither clock alone
      // may qualify a 30-second arrival while the other has only observed 9s.
      const capturedAtMs = startMs + index * (fastClock === 'capture' ? 10_000 : 3_000);
      const observedAtMs = startMs + 21_000 + index * (fastClock === 'capture' ? 3_000 : 10_000);
      receipt = await recordCheckInReadinessSample(uid,
        sample(sessionId, index + 1, observedAtMs, { capturedAtMs }),
        db as unknown as Firestore, Timestamp.fromMillis(observedAtMs));
    }
    assert.equal(receipt?.hereQualifyingMs, 9_000);
    assert.equal(receipt?.hereReady, false);
    assert.equal(receipt?.arrival, undefined);
  }
});

test('readiness clock banks reset together after motion or explicit reset', async () => {
  for (const reset of [false, true]) {
    const db = new ReadinessFirestore();
    const sessionId = `bank-reset-${reset}-session-001`;
    for (const [index, delay] of [9_000, 9_000, 0].entries()) {
      const capture = startMs + index * 10_000;
      await recordCheckInReadinessSample(uid, sample(sessionId, index + 1, capture + delay, { capturedAtMs: capture }),
        db as unknown as Firestore, Timestamp.fromMillis(capture + delay));
    }
    const stopped = await recordCheckInReadinessSample(uid,
      sample(sessionId, 4, startMs + 39_000, { capturedAtMs: startMs + 30_000, reset, speedMetersPerSecond: reset ? 0 : 1.2 }),
      db as unknown as Firestore, Timestamp.fromMillis(startMs + 39_000));
    assert.equal(stopped.hereQualifyingMs, 0);
    const stored = db.documents.get(`checkInEligibilitySessions/${checkInEligibilitySessionId(uid, sessionId)}`)!;
    for (const field of ['hereCapturedQualifyingMs', 'hereObservedQualifyingMs', 'placeCapturedQualifyingMs', 'placeObservedQualifyingMs']) {
      assert.equal(stored[field], 0, `do not revive a discarded clock bank: ${field}`);
    }
  }
});

test('readiness uncertainty preserves earned banks without credit across bad-accuracy endpoints', async () => {
  const db = new ReadinessFirestore();
  const sessionId = 'bank-accuracy-session-001';
  let receipt;
  for (const [index, delay] of [9_000, 9_000, 0, 9_000, 0].entries()) {
    const capture = startMs + index * 10_000;
    receipt = await recordCheckInReadinessSample(uid,
      sample(sessionId, index + 1, capture + delay, { capturedAtMs: capture, accuracyMeters: index === 3 ? 60 : 8 }),
      db as unknown as Firestore, Timestamp.fromMillis(capture + delay));
    if (index >= 2) assert.equal(receipt.hereQualifyingMs, 11_000);
  }
  assert.equal(receipt?.hereReady, false);
});

test('existing readiness sessions migrate only their already-earned credit into the two clock banks', async () => {
  const db = new ReadinessFirestore();
  const sessionId = 'bank-legacy-session-001';
  for (let index = 0; index <= 2; index++) {
    await recordCheckInReadinessSample(uid, sample(sessionId, index + 1, startMs + index * 10_000,
      { capturedAtMs: startMs + index * 10_000 }), db as unknown as Firestore, Timestamp.fromMillis(startMs + index * 10_000));
  }
  const stored = db.documents.get(`checkInEligibilitySessions/${checkInEligibilitySessionId(uid, sessionId)}`)!;
  for (const field of ['hereCapturedQualifyingMs', 'hereObservedQualifyingMs', 'placeCapturedQualifyingMs', 'placeObservedQualifyingMs']) delete stored[field];
  const receipt = await recordCheckInReadinessSample(uid, sample(sessionId, 4, startMs + 30_000,
    { capturedAtMs: startMs + 30_000 }), db as unknown as Firestore, Timestamp.fromMillis(startMs + 30_000));
  assert.equal(receipt.hereQualifyingMs, 30_000);
  assert.equal(receipt.arrival?.here, true);
});

test('Here-level private binding can authorize an explicit exact-pin opt-in before Place readiness', async () => {
  const now = Timestamp.fromMillis(startMs);
  const db = new ReadinessFirestore();
  const readinessSessionId = 'private-exact-here-session-001';
  const placeCandidateId = 'private-exact-home-candidate-001';
  const locationKey = `private:${'a'.repeat(32)}`;
  const latitude = 46.2382;
  const longitude = -63.1311;
  const sessionPath = `checkInEligibilitySessions/${checkInEligibilitySessionId(uid, readinessSessionId)}`;
  db.documents.set(ownerPath, {
    uid,
    mode: 'prequalification_owner_v1',
    activeSessionId: readinessSessionId,
    expiresAt: Timestamp.fromMillis(startMs + 120_000),
  });
  db.documents.set(sessionPath, {
    uid,
    mode: 'prequalification_v1',
    sessionId: readinessSessionId,
    expiresAt: Timestamp.fromMillis(startMs + 60_000),
    hereQualifyingMs: 30_000,
    placeQualifyingMs: 0,
    anchorLatitude: latitude,
    anchorLongitude: longitude,
    lastLatitude: latitude,
    lastLongitude: longitude,
    lastAccuracyMeters: 8,
    lastSpeedMetersPerSecond: 0,
    lastSeenAt: now,
  });
  db.documents.set(`checkInPlaceCandidates/${placeCandidateId}`, {
    uid,
    candidateId: placeCandidateId,
    source: 'user_private_place',
    expiresAt: Timestamp.fromMillis(startMs + 60_000),
    place: { type: 'private_place', name: 'Home', locationKey, latitude, longitude },
  });

  const grant = await bindCheckInReadiness(uid, {
    protocolVersion: 1,
    readinessSessionId,
    operationId: 'private-exact-bind-operation-001',
    placeCandidateId,
    latitude,
    longitude,
    accuracyMeters: 8,
    speedMetersPerSecond: 0,
    capturedAtMs: startMs - 250,
  }, db as unknown as Firestore, now);

  const boundSession = db.documents.get(sessionPath);
  assert.equal(grant.exactPrivateAllowed, true);
  assert.equal(boundSession?.eligibilityLevel, 'here');
  assert.equal(boundSession?.placeQualifyingMs, 0);
  assert.doesNotThrow(() => assertCompletedCheckInEligibility(boundSession || {}, uid, {
    placeCandidateId,
    locationKey,
    locationType: 'private_place',
    shareExactLocation: true,
  }, now));
});

test('checkout renews previously earned rings only after a fresh same-anchor fix', async () => {
  const nowMs = startMs;
  const db = freshDatabase(nowMs);
  const ready = await recordCheckInReadinessSample(
    uid,
    sample(newSessionId, 0, nowMs),
    db as unknown as Firestore,
    Timestamp.fromMillis(nowMs)
  );

  assert.equal(ready.hereReady, true);
  assert.equal(ready.placeReady, true);
  assert.equal(ready.hereQualifyingMs, 30_000);
  assert.equal(ready.placeQualifyingMs, 90_000);
  const owner = db.documents.get(ownerPath);
  assert.equal(owner?.activeSessionId, newSessionId);
  assert.equal(owner?.resumeSessionId, null);

  const moved = await recordCheckInReadinessSample(
    uid,
    sample(newSessionId, 1, nowMs + 5_000, { latitude: 46.239 }),
    db as unknown as Firestore,
    Timestamp.fromMillis(nowMs + 5_000)
  );
  assert.equal(moved.hereReady, false);
  assert.equal(moved.placeReady, false);
  assert.equal(moved.hereQualifyingMs, 0);
  assert.equal(moved.placeQualifyingMs, 0);
});

test('checkout renewal is unavailable while the active check-in still exists', async () => {
  const nowMs = startMs;
  const db = freshDatabase(nowMs);
  db.documents.set('activeCheckIns/checkout-resume-user', {
    expiresAt: Timestamp.fromMillis(nowMs + 30 * 60_000),
  });

  await assert.rejects(
    recordCheckInReadinessSample(
      uid,
      sample(newSessionId, 0, nowMs),
      db as unknown as Firestore,
      Timestamp.fromMillis(nowMs)
    ),
    (error: unknown) => error instanceof SocialDomainError && error.code === 'failed-precondition'
  );
});

test('a client reset cannot inherit the consumed readiness session', async () => {
  const nowMs = startMs;
  const db = freshDatabase(nowMs);
  const reset = await recordCheckInReadinessSample(
    uid,
    sample(newSessionId, 0, nowMs, { reset: true }),
    db as unknown as Firestore,
    Timestamp.fromMillis(nowMs)
  );

  assert.equal(reset.hereReady, false);
  assert.equal(reset.placeReady, false);
  assert.equal(reset.hereQualifyingMs, 0);
  assert.equal(reset.placeQualifyingMs, 0);
});
