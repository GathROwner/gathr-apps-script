import assert from 'node:assert/strict';
import test from 'node:test';

import { Timestamp, type Firestore } from 'firebase-admin/firestore';

import {
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
