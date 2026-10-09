import test from 'node:test';
import assert from 'node:assert/strict';
import { selectStage1LunaPilot } from './stage1Pilot.js';

test('pilot is opt-in and excludes text-only and unidentified posts', () => {
  assert.equal(selectStage1LunaPilot('file', 'post', 1, false, 50).selected, false);
  assert.equal(selectStage1LunaPilot('file', 'post', 0, true, 50).eligible, false);
  assert.equal(selectStage1LunaPilot('file', '', 1, true, 50).eligible, false);
  for (const value of [NaN, -1, 0, 101]) {
    assert.equal(selectStage1LunaPilot('file', 'post', 1, true, value).eligible, false);
  }
});

test('50 percent source cohort survives retries and does not depend on row order', () => {
  const sources = Array.from({ length: 1000 }, (_, i) => `source-${i}`);
  const chosen = sources.filter(id => selectStage1LunaPilot('file', id, 1, true, 50).selected);
  const repeated = [...sources].reverse().filter(id => selectStage1LunaPilot('file', id, 4, true, 50).selected);
  assert.deepEqual(chosen.sort(), repeated.sort());
  assert.ok(chosen.length > 450 && chosen.length < 550);
  assert.ok(sources.every(id => selectStage1LunaPilot('file', id, 1, true, 100).selected));
});
