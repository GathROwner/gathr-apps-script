import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldKeepExplicitScheduleTime } from './secondaryValidator.js';
import type { ExtractedItem } from './types.js';

const printedTour = {
  name: 'Historic Great George Tour',
  date: '2026-10-01',
  startTime: '02:00',
  extractionReason: 'schedule_text_fallback',
  timeFlags: {
    start: { source: 'explicit', evidence: '2:00 am' },
    end: { source: 'none', evidence: '', toClose: false },
  },
} as ExtractedItem;

test('preserves a source-copied schedule listing rejected solely for an unusual printed time', () => {
  assert.equal(shouldKeepExplicitScheduleTime(printedTour,
    'The listed 2:00 am time is implausible for a walking tour.'), true);
});

test('does not protect inferred times or unrelated invalid listings', () => {
  assert.equal(shouldKeepExplicitScheduleTime({ ...printedTour,
    timeFlags: { ...printedTour.timeFlags!,
      start: { source: 'implied', evidence: '' } } } as ExtractedItem,
  'The listed time is implausible.'), false);
  assert.equal(shouldKeepExplicitScheduleTime(printedTour,
    'This is an operating-hours announcement, not an event.'), false);
});
