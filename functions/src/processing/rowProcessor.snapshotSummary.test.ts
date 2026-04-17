import test from 'node:test';
import assert from 'node:assert/strict';

import { summarizeFullParserEvents } from './rowProcessor.js';

test('summarizeFullParserEvents preserves source and recurrence metadata needed for snapshot review', () => {
  const [summary] = summarizeFullParserEvents([
    {
      id: 'evt_1',
      name: 'Exercise',
      category: 'Workshops & Classes',
      isEvent: 'Yes',
      isFoodSpecial: 'No',
      establishment: 'Milton Community Hall',
      additionalLocation: '',
      startDate: '2026-04-15',
      startTime: '09:00',
      endDate: '2026-04-15',
      endTime: '11:00',
      isRecurring: 'Yes',
      recurringPattern: 'weekly_wednesday',
      recurringDaysOfWeek: ['wednesday'],
      recurringWeekdaySequence: ['wednesday'],
      recurringWeekInterval: 1,
      totalOccurrences: 8,
      recurrenceUntilDate: '2026-06-03',
      ticketLink: '',
      ticketsBuyUrl: '',
      image: '',
      relevantImageUrl: '',
      sharedPostThumbnail: '',
      timeResolution: { hoursUsed: true, endFromHours: 'duration_default' },
      timeFlags: null,
      description: 'Listed in the Wednesday, April 15 cell as "9 a.m. - Exercise".',
      _sourceType: 'calendar',
    } as any,
  ]);

  assert.equal(summary._sourceType, 'calendar');
  assert.equal(summary.isRecurring, 'Yes');
  assert.equal(summary.recurringPattern, 'weekly_wednesday');
  assert.deepEqual(summary.recurringDaysOfWeek, ['wednesday']);
  assert.deepEqual(summary.recurringWeekdaySequence, ['wednesday']);
  assert.equal(summary.recurringWeekInterval, 1);
  assert.equal(summary.totalOccurrences, 8);
  assert.equal(summary.recurrenceUntilDate, '2026-06-03');
});
