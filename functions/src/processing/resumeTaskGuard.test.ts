import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildResumeTaskCheckpoint,
  matchesResumeTaskCheckpoint,
} from './resumeTaskGuard.js';

test('buildResumeTaskCheckpoint returns row and batch identity', () => {
  assert.deepEqual(
    buildResumeTaskCheckpoint({ rowIndex: 120, batchNumber: 4 }),
    { rowIndex: 120, batchNumber: 4 }
  );
});

test('matchesResumeTaskCheckpoint accepts the exact same checkpoint identity', () => {
  const expected = buildResumeTaskCheckpoint({ rowIndex: 135, batchNumber: 7 });
  assert.equal(
    matchesResumeTaskCheckpoint(expected, { rowIndex: 135, batchNumber: 7 }),
    true
  );
});

test('matchesResumeTaskCheckpoint rejects stale checkpoint identities', () => {
  const expected = buildResumeTaskCheckpoint({ rowIndex: 135, batchNumber: 7 });
  assert.equal(
    matchesResumeTaskCheckpoint(expected, { rowIndex: 150, batchNumber: 8 }),
    false
  );
  assert.equal(
    matchesResumeTaskCheckpoint(expected, null),
    false
  );
});
