import test from 'node:test';
import assert from 'node:assert/strict';

import { applyRecurrenceNormalizationForRegression } from './finalFormatter.js';
import { ExtractedItem, FormattedEvent } from './types.js';

function buildEvent(overrides: Partial<FormattedEvent> = {}): FormattedEvent {
  return {
    isEvent: 'Yes',
    isFoodSpecial: 'No',
    category: 'Live Music',
    name: 'Event',
    description: '',
    establishment: 'The Club',
    address: '',
    startDate: '2026-04-10',
    endDate: '2026-04-10',
    startTime: '16:00',
    endTime: '',
    ticketPrice: '',
    ticketLink: '',
    relevantImageIndex: 0,
    venue: 'The Club',
    additionalLocation: '',
    isRecurring: 'No',
    recurringPattern: 'none',
    ...overrides,
  };
}

function buildOriginalItem(overrides: Record<string, unknown> = {}): ExtractedItem {
  return {
    name: 'Event',
    description: '',
    date: '2026-04-10',
    startTime: '16:00',
    endTime: '',
    venue: 'The Club',
    extractionReason: '',
    recurringPattern: 'none',
    ...overrides,
  } as ExtractedItem;
}

test('single-weekday row-scoped recurrence fallback still works when the row only supports one weekday', () => {
  const normalized = applyRecurrenceNormalizationForRegression(
    buildEvent({
      name: 'Open Jam Session',
      description: 'Open jam session.',
      startDate: '2026-04-07',
      endDate: '2026-04-07',
      startTime: '18:00',
      endTime: '20:00',
    }),
    buildOriginalItem({
      name: 'Open Jam Session',
      description: 'Open jam session every Tuesday at 6pm.',
      date: '2026-04-07',
      startTime: '18:00',
      endTime: '20:00',
    })
  );

  assert.equal(normalized.recurringPattern, 'weekly_tuesday');
});

test('mixed weekly board text does not let a Wednesday cue overwrite a Friday item', () => {
  const normalized = applyRecurrenceNormalizationForRegression(
    buildEvent({
      name: 'Dan McCarthy on the mic',
      description: 'Dan McCarthy on the mic Friday 4pm',
      startDate: '2026-04-10',
      endDate: '2026-04-11',
      startTime: '16:00',
      endTime: '01:00',
    }),
    buildOriginalItem({
      name: 'Dan McCarthy on the mic',
      description:
        "What's up at the club this week?! Blues jam session every Wednesday night 7pm. Trivia night every second Thursday. Dan McCarthy on the mic Friday 4pm. Open mic Sunday, every friggin' Sunday!",
      extractionReason:
        'weekly board poster with Wednesday, Thursday, Friday, and Sunday listings',
      date: '2026-04-10',
      startTime: '16:00',
      endTime: '',
    })
  );

  assert.equal(normalized.recurringPattern, 'weekly_friday');
});

test('multi-weekday board text does not assign a weekday when item-local support is weak', () => {
  const normalized = applyRecurrenceNormalizationForRegression(
    buildEvent({
      name: 'Special Guest',
      description: 'Live at the club.',
      startDate: '2026-04-10',
      endDate: '2026-04-11',
      startTime: '16:00',
      endTime: '01:00',
    }),
    buildOriginalItem({
      name: 'Special Guest',
      description:
        "What's up at the club this week?! Blues jam session every Wednesday night 7pm. Dan McCarthy on the mic Friday 4pm. Open mic Sunday, every friggin' Sunday!",
      extractionReason:
        'weekly board poster with Wednesday, Friday, and Sunday listings',
      date: '2026-04-10',
      startTime: '16:00',
      endTime: '',
    })
  );

  assert.equal(normalized.recurringPattern, 'none');
});

test('MWF shorthand expands to a weekly_custom multi-day recurrence', () => {
  const normalized = applyRecurrenceNormalizationForRegression(
    buildEvent({
      category: 'Workshops & Classes',
      name: 'Exercise Class Videos (Big Screen)',
      description: 'The rest of May exercise classes will be videos on the big screen.',
      startDate: '2026-05-01',
      endDate: '2026-05-01',
      startTime: '09:00',
      endTime: '11:00',
      isRecurring: 'Yes',
      recurringPattern: 'weekly_monday',
    }),
    buildOriginalItem({
      name: 'Exercise Class Videos (Big Screen)',
      description:
        'This Friday, May 1 is Zumba Gold at 9 am. The rest of May’s MWF 9 am exercise classes will be videos on the big screen.',
      date: '2026-05-01',
      startTime: '09:00',
      endTime: '11:00',
      recurringPattern: 'weekly_monday',
    })
  );

  assert.equal(normalized.recurringPattern, 'weekly_custom');
  assert.deepEqual(normalized.recurringDaysOfWeek, ['monday', 'wednesday', 'friday']);
});
