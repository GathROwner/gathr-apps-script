import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildResumeTaskCheckpoint,
  matchesResumeTaskCheckpoint,
  classifyResumeTaskClaim,
} from './resumeTaskGuard.js';

test('buildResumeTaskCheckpoint returns row and batch identity', () => {
  assert.deepEqual(
    buildResumeTaskCheckpoint({ rowIndex: 120, batchNumber: 4 }),
    { rowIndex: 120, batchNumber: 4 }
  );
});

test('resume claim permits a timed-out task to continue from newer row progress', () => {
  const expected = { rowIndex: 119, batchNumber: 1 };
  const current = { rowIndex: 147, batchNumber: 1 };
  assert.equal(classifyResumeTaskClaim(expected, current, 'running', 600000), 'claim');
  assert.equal(classifyResumeTaskClaim(expected, current, 'running', 300000), 'busy');
  assert.equal(classifyResumeTaskClaim(expected, current, 'paused', 600000), 'stale');
  assert.equal(classifyResumeTaskClaim(expected, expected, 'paused', 0), 'claim');
  assert.equal(classifyResumeTaskClaim(expected, current, 'completed', 600000), 'stale');
  assert.equal(classifyResumeTaskClaim({ rowIndex: 149, batchNumber: 1 }, current,
    'running', 600000), 'stale');
});

test('initial task may claim a paused lock without a checkpoint', () => {
  assert.equal(classifyResumeTaskClaim(undefined, undefined, 'paused', 0), 'claim');
  assert.equal(classifyResumeTaskClaim(undefined, undefined, 'running', 0), 'busy');
  assert.equal(classifyResumeTaskClaim(undefined, undefined, 'running', 600000), 'claim');
  assert.equal(classifyResumeTaskClaim({ rowIndex: 1, batchNumber: 1 }, undefined,
    'paused', 0), 'stale');
  assert.equal(classifyResumeTaskClaim(undefined, undefined, 'completed', 600000), 'stale');
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
