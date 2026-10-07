import test from 'node:test';
import assert from 'node:assert/strict';
import { BatchManager, createBatchState } from './batchManager.js';
import { isSampledEligibleLunaStage3Post } from '../parsing/lunaSafetyGate.js';

test('eligible Stage 3 routing stays with the source post after a replay', () => {
  const first = new BatchManager(createBatchState('dataset-a', 'dataset', 200));
  const original = first.selectEligibleLunaStage3Post('post-121', 50);

  // A retry may reach the post at a different eligible ordinal because the
  // previous invocation timed out and Stage 2 can make different decisions.
  const resumedState = createBatchState('dataset-a', 'dataset', 200, 2);
  resumedState.stats.lunaStage3EligibleCount = 43;
  const resumed = new BatchManager(resumedState);
  assert.equal(resumed.selectEligibleLunaStage3Post('post-121', 50), original);
  assert.equal(resumed.getStats().lunaStage3EligibleCount, 44);
});

test('eligible sampling stays bounded at the configured rate', () => {
  for (const percent of [17, 50, 75]) {
    const selected = Array.from({ length: 1000 }, (_, index) =>
      isSampledEligibleLunaStage3Post(`dataset-${percent}`, `post-${index}`, percent)
    ).filter(Boolean).length;
    assert.ok(selected > 1000 * (percent / 100 - 0.05));
    assert.ok(selected < 1000 * (percent / 100 + 0.05));
  }
  assert.equal(isSampledEligibleLunaStage3Post('dataset', 'post', 100), true);
  assert.equal(isSampledEligibleLunaStage3Post('dataset', 'post', 101), false);
  assert.equal(isSampledEligibleLunaStage3Post('dataset', '', 50), false);
});
