import test from 'node:test';
import assert from 'node:assert/strict';

import { splitFiniteDateSeriesItemsForRegression } from './eventExtractor.js';
import { ExtractedItem } from './types.js';

function item(overrides: Record<string, unknown>): ExtractedItem {
  return {
    name: 'Theatre production',
    description: '',
    date: '2026-09-03',
    startTime: '19:30',
    endTime: '21:10',
    venue: 'Sobey Family Theatre',
    extractionReason: '',
    recurringPattern: 'daily',
    ...overrides,
  } as ExtractedItem;
}

test('an irregular explicit select-dates list becomes exact dated one-offs', () => {
  const result = splitFiniteDateSeriesItemsForRegression([
    item({ description: 'Select dates shown: September 3, 10 & 24.' }),
  ]);

  assert.deepEqual(result.map((entry) => (entry as any).date), [
    '2026-09-03',
    '2026-09-10',
    '2026-09-24',
  ]);
  assert.deepEqual(result.map((entry) => (entry as any).recurringPattern), [
    'none',
    'none',
    'none',
  ]);
  assert.ok(result.every((entry) => (entry as any).isRecurring === false));
});

test('a select-dates season range is not mistaken for two occurrence dates', () => {
  const source = item({
    name: 'Come From Away (musical) — Select Dates',
    description:
      'Show dates: June 30, 2026 until Sept 26, 2026. Select dates at Sobey Family Theatre.',
    date: '2026-06-30',
  });

  const result = splitFiniteDateSeriesItemsForRegression([source]);

  assert.equal(result.length, 1);
  assert.equal((result[0] as any).date, '2026-06-30');
  assert.equal((result[0] as any).recurringPattern, 'daily');
});

test('ordinary multi-date poster handling remains available outside select-dates copy', () => {
  const result = splitFiniteDateSeriesItemsForRegression([
    item({
      name: 'Festival lineup',
      description: 'Dates shown: September 3 & 5.',
    }),
  ]);

  assert.equal(result.length, 2);
  assert.deepEqual(result.map((entry) => (entry as any).date), [
    '2026-09-03',
    '2026-09-05',
  ]);
});
