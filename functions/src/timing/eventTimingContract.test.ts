import test from 'node:test';
import assert from 'node:assert/strict';

import { buildEventTimingContract } from './eventTimingContract.js';

test('legacy duration defaults become hidden discovery cutoffs', () => {
  const timing = buildEventTimingContract({
    startDate: '2026-09-05',
    startTime: '19:00',
    endDate: '2026-09-05',
    endTime: '21:00',
    timeFlags: {
      start: { source: 'explicit', evidence: '7 PM' },
      end: { source: 'none', toClose: false, evidence: '' },
    },
    timeResolution: { endFromHours: 'duration_default' },
  });

  assert.equal(timing.schedule.end.status, 'unknown');
  assert.equal(timing.schedule.end.localTime, null);
  assert.equal(timing.estimate?.confidence, 'low');
  assert.equal(timing.estimate?.discoveryCutoffTime, '21:00');
  assert.equal(timing.estimate?.displayEndTime, undefined);
});

test('explicit and until-close endings remain separate supported facts', () => {
  const explicit = buildEventTimingContract({
    startDate: '2026-09-05', startTime: '19:00', endDate: '2026-09-05', endTime: '20:00',
    timeFlags: { start: { source: 'explicit', evidence: '' }, end: { source: 'explicit', toClose: false, evidence: '7-8 PM' } },
  });
  const untilClose = buildEventTimingContract({
    startDate: '2026-09-05', startTime: '19:00', endDate: '2026-09-05', endTime: '23:00',
    timeFlags: { start: { source: 'explicit', evidence: '' }, end: { source: 'semantic', toClose: true, evidence: 'until close' } },
    timeResolution: { endFromHours: 'to_close' },
  });

  assert.equal(explicit.schedule.end.status, 'observed');
  assert.equal(untilClose.schedule.end.status, 'until_close');
});

test('a truly missing ending receives policy freshness only', () => {
  const timing = buildEventTimingContract({
    startDate: '2026-09-05', startTime: '23:30', endDate: '2026-09-05', endTime: '',
    timeFlags: { start: { source: 'explicit', evidence: '' }, end: { source: 'none', toClose: false, evidence: '' } },
  });
  assert.equal(timing.estimate?.discoveryCutoffDate, '2026-09-06');
  assert.equal(timing.estimate?.discoveryCutoffTime, '01:30');
  assert.equal(timing.estimate?.method, 'conservative_discovery_cutoff');
});

test('an unproven legacy clock is never promoted to an observed ending', () => {
  const timing = buildEventTimingContract({
    startDate: '2026-09-05', startTime: '19:00', endDate: '2026-09-05', endTime: '23:00',
  });
  assert.equal(timing.schedule.end.status, 'unknown');
  assert.equal(timing.schedule.end.localTime, null);
  assert.equal(timing.estimate?.discoveryCutoffTime, '23:00');
});
