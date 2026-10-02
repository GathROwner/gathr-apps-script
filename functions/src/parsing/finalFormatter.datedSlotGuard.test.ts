import assert from 'node:assert/strict';
import test from 'node:test';
import { rehydrateFormattedEventMetadata } from './finalFormatter.js';
import { ExtractedItem, FormattedEvent } from './types.js';

test('printed schedule slot retains its own date and does not inherit a registration deadline weekday', () => {
  const source = {
    name: 'Pre-Season Puck Skills — U9/U11',
    description: 'Register by Wednesday, September 30 at 6 PM.',
    date: '2026-10-03',
    startTime: '09:15',
    endTime: '',
    recurringPattern: 'none',
    _sourceType: 'schedule',
    timeFlags: {
      start: { source: 'explicit', evidence: 'SAT OCT 3 @ 9:15 AM' },
      end: { source: 'none', toClose: false, evidence: '' },
    },
  } as ExtractedItem;
  const model = {
    name: source.name,
    startDate: '2026-10-07',
    endDate: '2026-10-07',
    startTime: '09:15',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_wednesday',
    totalOccurrences: 0,
    recurrenceUntilDate: '',
  } as FormattedEvent;

  const restored = rehydrateFormattedEventMetadata(model, source);
  assert.equal(restored.startDate, '2026-10-03');
  assert.equal(restored.endDate, '2026-10-03');
  assert.equal(restored.startTime, '09:15');
  assert.equal(restored.isRecurring, 'No');
  assert.equal(restored.recurringPattern, 'none');
});

test('explicit weekly schedule remains recurring', () => {
  const source = {
    name: 'Open Mic every Wednesday',
    description: 'Every Wednesday at 8 PM.',
    date: '2026-10-07',
    startTime: '20:00',
    recurringPattern: 'weekly_wednesday',
    _sourceType: 'schedule',
    timeFlags: { start: { source: 'explicit', evidence: 'WED OCT 7 @ 8 PM' } },
  } as ExtractedItem;
  const model = {
    name: source.name,
    startDate: '2026-10-07',
    endDate: '2026-10-07',
    startTime: '20:00',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_wednesday',
  } as FormattedEvent;

  const restored = rehydrateFormattedEventMetadata(model, source);
  assert.equal(restored.isRecurring, 'Yes');
  assert.equal(restored.recurringPattern, 'weekly_wednesday');
});

test('dated gallery performance keeps its source date when clock evidence omits month and day', () => {
  const source = {
    name: 'A Gorgon’s Tale',
    description: 'Performance at River Clyde Pageant Site.',
    date: '2026-10-03',
    day: 'Saturday',
    startTime: '16:00',
    endTime: '17:00',
    recurringPattern: 'none',
    _sourceType: 'schedule',
    timeFlags: {
      start: { source: 'explicit', evidence: '4:00-5:00pm' },
      end: { source: 'explicit', toClose: false, evidence: '4:00-5:00pm' },
    },
  } as unknown as ExtractedItem;
  const model = {
    name: source.name,
    startDate: '2026-10-04',
    endDate: '2026-10-04',
    startTime: '16:00',
    endTime: '17:00',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_sunday',
  } as FormattedEvent;

  const restored = rehydrateFormattedEventMetadata(model, source);
  assert.equal(restored.startDate, '2026-10-03');
  assert.equal(restored.endDate, '2026-10-03');
  assert.equal(restored.recurringPattern, 'none');
  assert.equal(restored.isRecurring, 'No');
});
