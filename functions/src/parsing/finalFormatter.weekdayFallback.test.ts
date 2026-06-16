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

test('explicit one-off dates are not kept as simple weekly recurring events', () => {
  const examples = [
    {
      name: 'YYG Annual Runway Run',
      description:
        "Save the Date! Ever wondered what it's like to run on an airport runway? Mark your calendar because YYG's annual Runway Run takes off on May 9 at 9:00 AM! Stay tuned for registration details.",
      startDate: '2026-05-09',
      startTime: '09:00',
      endTime: '23:00',
    },
    {
      name: 'Live Soccer Final Watch Party',
      description:
        "The Soccer Final is HERE this Saturday, May 30th! Kick off starts at 1PM and you won't want to miss a second of the action.",
      startDate: '2026-05-30',
      startTime: '13:00',
      endTime: '',
    },
    {
      name: 'A Shot of Islandness: Cocktail Pop-up',
      description:
        'Saturday, April 18 | 4pm to close | Red Island Cider. A culminating project of the UPEI MAIS program, brought to life right here at the taproom.',
      startDate: '2026-04-18',
      startTime: '16:00',
      endTime: '20:00',
    },
  ];

  for (const example of examples) {
    const normalized = applyRecurrenceNormalizationForRegression(
      buildEvent({
        category: 'Gatherings & Parties',
        name: example.name,
        description: example.description,
        startDate: example.startDate,
        endDate: example.startDate,
        startTime: example.startTime,
        endTime: example.endTime,
        isRecurring: 'Yes',
        recurringPattern: 'weekly_saturday',
      }),
      buildOriginalItem({
        name: example.name,
        description: example.description,
        date: example.startDate,
        startTime: example.startTime,
        endTime: example.endTime,
        recurringPattern: 'weekly_saturday',
      })
    );

    assert.equal(normalized.isRecurring, false, example.name);
    assert.equal(normalized.recurringPattern, 'none', example.name);
  }
});

test('generic singular weekday food specials are not inferred as weekly recurring', () => {
  const normalized = applyRecurrenceNormalizationForRegression(
    buildEvent({
      isEvent: 'No',
      isFoodSpecial: 'Yes',
      category: 'Food Special',
      name: 'Monday Special - Homemade Pulled Pork Hoagie',
      description:
        'Monday Special At The Road House Our Homemade Pulled Pork Hoagie For 17.99 Toasted Sub Bun, Coleslaw, Pickles & Pulled Pork With Your Choice Of Side!',
      startDate: '2026-06-08',
      endDate: '2026-06-08',
      startTime: '11:00',
      endTime: '21:00',
    }),
    buildOriginalItem({
      name: 'Monday Special - Homemade Pulled Pork Hoagie',
      description:
        'Monday Special At The Road House Our Homemade Pulled Pork Hoagie For 17.99 Toasted Sub Bun, Coleslaw, Pickles & Pulled Pork With Your Choice Of Side!',
      date: '2026-06-08',
      startTime: '11:00',
      endTime: '21:00',
      recurringPattern: 'none',
    })
  );

  assert.equal(normalized.isRecurring, false);
  assert.equal(normalized.recurringPattern, 'none');
});

test('generic singular weekday food specials are demoted when extracted as weekly', () => {
  const normalized = applyRecurrenceNormalizationForRegression(
    buildEvent({
      isEvent: 'No',
      isFoodSpecial: 'Yes',
      category: 'Food Special',
      name: 'Monday Special - Homemade Pulled Pork Hoagie',
      description:
        'Monday Special At The Road House Our Homemade Pulled Pork Hoagie For 17.99 Toasted Sub Bun, Coleslaw, Pickles & Pulled Pork With Your Choice Of Side!',
      startDate: '2026-06-08',
      endDate: '2026-06-08',
      startTime: '11:00',
      endTime: '21:00',
      isRecurring: 'Yes',
      recurringPattern: 'weekly_monday',
    }),
    buildOriginalItem({
      name: 'Monday Special - Homemade Pulled Pork Hoagie',
      description:
        'Monday Special At The Road House Our Homemade Pulled Pork Hoagie For 17.99 Toasted Sub Bun, Coleslaw, Pickles & Pulled Pork With Your Choice Of Side!',
      date: '2026-06-08',
      startTime: '11:00',
      endTime: '21:00',
      recurringPattern: 'weekly_monday',
    })
  );

  assert.equal(normalized.isRecurring, false);
  assert.equal(normalized.recurringPattern, 'none');
});

test('explicit recurrence wording still keeps weekly food specials', () => {
  const normalized = applyRecurrenceNormalizationForRegression(
    buildEvent({
      isEvent: 'No',
      isFoodSpecial: 'Yes',
      category: 'Food Special',
      name: 'Tuesday Wing Night',
      description: '75c breaded or boneless wings every Tuesday from 9pm.',
      startDate: '2026-06-09',
      endDate: '2026-06-09',
      startTime: '21:00',
      endTime: '23:00',
    }),
    buildOriginalItem({
      name: 'Tuesday Wing Night',
      description: '75c breaded or boneless wings every Tuesday from 9pm.',
      date: '2026-06-09',
      startTime: '21:00',
      endTime: '23:00',
      recurringPattern: 'none',
    })
  );

  assert.equal(normalized.recurringPattern, 'weekly_tuesday');
});

test('explicit every single day wording keeps daily food specials', () => {
  const normalized = applyRecurrenceNormalizationForRegression(
    buildEvent({
      isEvent: 'No',
      isFoodSpecial: 'Yes',
      category: 'Food Special',
      name: '$1.50 Oysters',
      description: '$1.50 oysters every single day from 3-5pm.',
      startDate: '2026-05-12',
      endDate: '2026-05-12',
      startTime: '15:00',
      endTime: '17:00',
    }),
    buildOriginalItem({
      name: '$1.50 Oysters',
      description: '$1.50 oysters every single day from 3-5pm.',
      date: '2026-05-12',
      startTime: '15:00',
      endTime: '17:00',
      recurringPattern: 'none',
    })
  );

  assert.equal(normalized.isRecurring, true);
  assert.equal(normalized.recurringPattern, 'daily');
});

test('plural weekday wording still keeps weekly food specials', () => {
  const normalized = applyRecurrenceNormalizationForRegression(
    buildEvent({
      isEvent: 'No',
      isFoodSpecial: 'Yes',
      category: 'Food Special',
      name: 'Mondays Lunch Special',
      description: 'Mondays from 11am to 2pm: pulled pork hoagie with your choice of side.',
      startDate: '2026-06-08',
      endDate: '2026-06-08',
      startTime: '11:00',
      endTime: '14:00',
    }),
    buildOriginalItem({
      name: 'Mondays Lunch Special',
      description: 'Mondays from 11am to 2pm: pulled pork hoagie with your choice of side.',
      date: '2026-06-08',
      startTime: '11:00',
      endTime: '14:00',
      recurringPattern: 'none',
    })
  );

  assert.equal(normalized.recurringPattern, 'weekly_monday');
});

test('dated performer weekday live posts are not kept as weekly recurring', () => {
  const normalized = applyRecurrenceNormalizationForRegression(
    buildEvent({
      category: 'Live Music',
      name: 'Tuesday Live (BluRobin Music)',
      description: 'Tuesday Live - BluRobin Music 6 to 8pm (June 9th).',
      startDate: '2026-06-09',
      endDate: '2026-06-09',
      startTime: '18:00',
      endTime: '20:00',
      isRecurring: 'Yes',
      recurringPattern: 'weekly_tuesday',
    }),
    buildOriginalItem({
      name: 'Tuesday Live (BluRobin Music)',
      description: 'Tuesday Live - BluRobin Music 6 to 8pm (June 9th).',
      date: '2026-06-09',
      startTime: '18:00',
      endTime: '20:00',
      recurringPattern: 'weekly_tuesday',
    })
  );

  assert.equal(normalized.isRecurring, false);
  assert.equal(normalized.recurringPattern, 'none');
});
