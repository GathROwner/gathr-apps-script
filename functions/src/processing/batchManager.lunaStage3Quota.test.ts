import test from 'node:test';
import assert from 'node:assert/strict';
import { BatchManager, createBatchState } from './batchManager.js';

test('Luna eligible quota continues from checkpoint stats across batch resumes', () => {
  const first = new BatchManager(createBatchState('dataset-a', 'dataset', 200));
  const firstSelected = Array.from({ length: 50 }, (_, index) =>
    first.selectEligibleLunaStage3Post(`post-${index}`, 17)
  ).filter(Boolean).length;
  const checkpointStats = first.getStats();
  assert.equal(checkpointStats.lunaStage3EligibleCount, 50);
  assert.equal(checkpointStats.lunaStage3SelectedCount, firstSelected);

  const resumedState = createBatchState('dataset-a', 'dataset', 200, 2);
  resumedState.stats = checkpointStats;
  const resumed = new BatchManager(resumedState);
  const nextSelected = Array.from({ length: 40 }, (_, index) =>
    resumed.selectEligibleLunaStage3Post(`post-${index + 50}`, 17)
  ).filter(Boolean).length;
  assert.equal(resumed.getStats().lunaStage3EligibleCount, 90);
  const totalSelected = Number(resumed.getStats().lunaStage3SelectedCount || 0);
  assert.ok(totalSelected >= 15 && totalSelected <= 16);
  assert.equal(firstSelected + nextSelected, totalSelected);
});
