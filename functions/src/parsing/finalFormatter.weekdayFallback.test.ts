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

test('single-date concerts with duration-only each wording are not kept as weekly recurring', () => {
  const examples = [
    {
      name: "Progressive Organ Concert (Trinity United Church)",
      description:
        'Annual Progressive Organ Concert on Sun, June 28. Proceed to Trinity United Church (Prince Street) for a 2:30 p.m. concert. Each concert is about 30 minutes. Admission is free. Donations accepted to support the Dr. Alan Reesor Memorial Scholarship Fund.',
      startTime: '14:30',
    },
    {
      name: "Progressive Organ Concert (St. Dunstan's Basilica)",
      description:
        "Annual Progressive Organ Concert on Sun, June 28. Conclude the afternoon of music at St. Dunstan's Basilica (Great George Street) at 3:30 p.m. Each concert is about 30 minutes. Admission is free. Donations accepted to support the Dr. Alan Reesor Memorial Scholarship Fund.",
      startTime: '15:30',
    },
  ];

  for (const example of examples) {
    const normalized = applyRecurrenceNormalizationForRegression(
      buildEvent({
        category: 'Live Music',
        name: example.name,
        description: example.description,
        startDate: '2026-06-28',
        endDate: '2026-06-29',
        startTime: example.startTime,
        endTime: '01:00',
        isRecurring: 'Yes',
        recurringPattern: 'weekly_sunday',
      }),
      buildOriginalItem({
        name: example.name,
        description: example.description,
        date: '2026-06-28',
        startTime: example.startTime,
        endTime: '01:00',
        recurringPattern: 'weekly_sunday',
      })
    );

    assert.equal(normalized.isRecurring, false, example.name);
    assert.equal(normalized.recurringPattern, 'none', example.name);
  }
});

test('actual recurring concerts still keep every Sunday wording with duration details', () => {
  const description =
    'Community Organ Concerts every Sunday at 3:30 p.m. Each concert is about 30 minutes. Admission is free.';

  const normalized = applyRecurrenceNormalizationForRegression(
    buildEvent({
      category: 'Live Music',
      name: 'Community Organ Concerts',
      description,
      startDate: '2026-06-28',
      endDate: '2026-06-29',
      startTime: '15:30',
      endTime: '01:00',
      isRecurring: 'Yes',
      recurringPattern: 'weekly_sunday',
    }),
    buildOriginalItem({
      name: 'Community Organ Concerts',
      description,
      date: '2026-06-28',
      startTime: '15:30',
      endTime: '01:00',
      recurringPattern: 'weekly_sunday',
    })
  );

  assert.equal(normalized.isRecurring, true);
  assert.equal(normalized.recurringPattern, 'weekly_sunday');
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

test('this-week every-night performer lineups are not kept as open-ended weekly recurrence', () => {
  const normalized = applyRecurrenceNormalizationForRegression(
    buildEvent({
      category: 'Live Music',
      name: 'We 3',
      description: 'Live music every night this week.',
      establishment: 'Peake’s Quay',
      venue: 'Peake’s Quay',
      startDate: '2026-07-19',
      endDate: '2026-07-19',
      startTime: '19:00',
      endTime: '22:00',
      isRecurring: 'Yes',
      recurringPattern: 'weekly_sunday',
    }),
    buildOriginalItem({
      name: 'We 3',
      description: 'Live music every night this week.',
      date: '2026-07-19',
      startTime: '19:00',
      endTime: '22:00',
      venue: 'Peake’s Quay',
      recurringPattern: 'weekly_sunday',
      _sourceType: 'schedule',
    })
  );

  assert.equal(normalized.isRecurring, false);
  assert.equal(normalized.recurringPattern, 'none');
  assert.equal(normalized.recurrenceUntilDate, undefined);
});

test('weekend lineup tonight rows cannot remain open-ended weekly recurrence', () => {
  const normalized = applyRecurrenceNormalizationForRegression(
    buildEvent({
      category: 'Live Music',
      name: 'After Dinner Social Club (ft. DJ Noah)',
      description: 'Friday: After Dinner Social Club ft Sundrift Festival with DJ Noah',
      establishment: 'Salt & Sol Restaurant and Lounge',
      venue: 'Salt & Sol Restaurant and Lounge',
      startDate: '2026-07-03',
      endDate: '2026-07-04',
      startTime: '21:00',
      endTime: '01:00',
      isRecurring: 'Yes',
      recurringPattern: 'weekly_friday',
    }),
    buildOriginalItem({
      name: 'After Dinner Social Club (ft. DJ Noah)',
      description: 'Friday: After Dinner Social Club ft Sundrift Festival with DJ Noah',
      date: '2026-07-03',
      startTime: '21:00',
      endTime: '01:00',
      venue: 'Salt & Sol Restaurant and Lounge',
      recurringPattern: 'weekly_friday',
    }),
    'WEEKEND LINEUP. Tonight: After Dinner Social Club, a late aperitivo vibe with Noah O Connor. Tomorrow: Salty Saturdays with Dexter Shea and Jeremie Boutilier.'
  );

  assert.equal(normalized.isRecurring, false);
  assert.equal(normalized.recurringPattern, 'none');
  assert.equal(normalized.recurrenceUntilDate, undefined);
});

test('explicit weekly cadence near a lineup event remains recurring', () => {
  const normalized = applyRecurrenceNormalizationForRegression(
    buildEvent({
      category: 'Live Music',
      name: 'After Dinner Social Club (ft. DJ Noah)',
      description: 'After Dinner Social Club ft DJ Noah every Friday.',
      startDate: '2026-07-03',
      endDate: '2026-07-04',
      startTime: '21:00',
      endTime: '01:00',
      isRecurring: 'Yes',
      recurringPattern: 'weekly_friday',
    }),
    buildOriginalItem({
      name: 'After Dinner Social Club (ft. DJ Noah)',
      description: 'After Dinner Social Club ft DJ Noah every Friday.',
      date: '2026-07-03',
      startTime: '21:00',
      endTime: '01:00',
      recurringPattern: 'weekly_friday',
    }),
    'WEEKEND LINEUP. After Dinner Social Club with DJ Noah every Friday at 9 PM.'
  );

  assert.equal(normalized.isRecurring, true);
  assert.equal(normalized.recurringPattern, 'weekly_friday');
});

test('last class tomorrow cannot remain an open-ended weekly recurrence', () => {
  const description =
    'Last of the FREE exercise classes with Michele for the summer tomorrow - Wednesday at 9 a.m.';
  const normalized = applyRecurrenceNormalizationForRegression(
    buildEvent({
      category: 'Workshops & Classes',
      name: 'FREE exercise class with Michele (Senior fitness)',
      description,
      startDate: '2026-06-24',
      endDate: '2026-06-24',
      startTime: '09:00',
      endTime: '11:00',
      isRecurring: 'Yes',
      recurringPattern: 'weekly_wednesday',
    }),
    buildOriginalItem({
      name: 'FREE exercise class with Michele (Senior fitness)',
      description,
      date: '2026-06-24',
      startTime: '09:00',
      endTime: '11:00',
      recurringPattern: 'weekly_wednesday',
    })
  );

  assert.equal(normalized.isRecurring, false);
  assert.equal(normalized.recurringPattern, 'none');
});

test('this-week class announcements cannot become open-ended weekly recurrence', () => {
  const normalized = applyRecurrenceNormalizationForRegression(
    buildEvent({
      category: 'Workshops & Classes',
      name: 'DanceFit with Rhonda',
      description: 'Thursday - DanceFit with Rhonda. Drop ins welcome!',
      startDate: '2026-07-23',
      endDate: '2026-07-23',
      startTime: '10:00',
      endTime: '12:00',
      isRecurring: 'Yes',
      recurringPattern: 'weekly_thursday',
    }),
    buildOriginalItem({
      name: 'DanceFit with Rhonda',
      description: 'Thursday - DanceFit with Rhonda. Drop ins welcome!',
      date: '2026-07-23',
      startTime: '10:00',
      endTime: '12:00',
      recurringPattern: 'weekly_thursday',
    }),
    'This week at EKCC: DanceFit with Rhonda Thursday at 10am. Yoga with Krista Friday at 8am.'
  );

  assert.equal(normalized.isRecurring, false);
  assert.equal(normalized.recurringPattern, 'none');
});

test('a rotating weekly special mentioned in a this-week menu stays one-off', () => {
  const normalized = applyRecurrenceNormalizationForRegression(
    buildEvent({
      category: 'Food Special',
      isFoodSpecial: 'Yes',
      name: 'Poutine Flight ($14)',
      description: 'Thursday: Try a poutine flight for $14.',
      startDate: '2026-05-28',
      endDate: '2026-05-28',
      startTime: '16:00',
      endTime: '22:00',
      isRecurring: 'Yes',
      recurringPattern: 'weekly_thursday',
    }),
    buildOriginalItem({
      name: 'Poutine Flight ($14)',
      description: 'Thursday: Try a poutine flight for $14.',
      date: '2026-05-28',
      startTime: '16:00',
      endTime: '22:00',
      recurringPattern: 'weekly_thursday',
    }),
    'Lots of things cooking at Hop this week! Thursday: Try a poutine flight for $14 and come check out our weekly special.'
  );

  assert.equal(normalized.isRecurring, false);
  assert.equal(normalized.recurringPattern, 'none');
});

test('a source-anchored calendar date cannot become open-ended weekly recurrence', () => {
  const normalized = applyRecurrenceNormalizationForRegression(
    buildEvent({
      category: 'Sports',
      name: "Noah Dobson's Hockey Fest",
      description: "Don't miss Noah Dobson's Hockey Fest.",
      startDate: '2026-06-19',
      endDate: '2026-06-21',
      startTime: '09:00',
      endTime: '17:00',
      isRecurring: 'Yes',
      recurringPattern: 'weekly_friday',
    }),
    buildOriginalItem({
      name: "Noah Dobson's Hockey Fest",
      description: "Don't miss Noah Dobson's Hockey Fest.",
      date: '2026-06-19',
      startTime: '09:00',
      endTime: '17:00',
      recurringPattern: 'weekly_friday',
    }),
    "Don't miss your chance to meet Noah at the 2026 Noah Dobson's Hockey Fest June 19-21, 2026."
  );

  assert.equal(normalized.isRecurring, false);
  assert.equal(normalized.recurringPattern, 'none');
});

test('a this-Friday solo show remains a one-off', () => {
  const description =
    'Solo acoustic show 4-7pm Friday at The Club, Sydney! Drop in after work for a cool one and some tunes, get your weekend vibe goin!\\n\\nThis Friday';
  const normalized = applyRecurrenceNormalizationForRegression(
    buildEvent({
      category: 'Live Music',
      name: 'Solo acoustic show',
      description,
      startDate: '2026-07-10',
      endDate: '2026-07-10',
      startTime: '16:00',
      endTime: '19:00',
      isRecurring: 'Yes',
      recurringPattern: 'weekly_friday',
    }),
    buildOriginalItem({
      name: 'Solo acoustic show',
      description,
      date: '2026-07-10',
      startTime: '16:00',
      endTime: '19:00',
      recurringPattern: 'weekly_friday',
    }),
    `${description}\n\nOCR TEXT:\nMay be an image of guitar`
  );

  assert.equal(normalized.isRecurring, false);
  assert.equal(normalized.recurringPattern, 'none');
});

test('an explicit eight-week Fridays class remains recurring', () => {
  const description = 'Yoga with Krista. Fridays at 8:00am for 8 weeks.';
  const normalized = applyRecurrenceNormalizationForRegression(
    buildEvent({
      category: 'Workshops & Classes',
      name: 'Yoga with Krista',
      description,
      startDate: '2026-07-03',
      endDate: '2026-07-03',
      startTime: '08:00',
      endTime: '10:00',
      isRecurring: 'Yes',
      recurringPattern: 'weekly_friday',
    }),
    buildOriginalItem({
      name: 'Yoga with Krista',
      description,
      date: '2026-07-03',
      startTime: '08:00',
      endTime: '10:00',
      recurringPattern: 'weekly_friday',
    }),
    'This week at EKCC: Yoga with Krista Friday at 8am. Poster: Fridays at 8:00am, July 3-August 21 (8 weeks).'
  );

  assert.equal(normalized.isRecurring, true);
  assert.equal(normalized.recurringPattern, 'weekly_friday');
});

test('dated performer rows do not inherit a Friday and Saturday series header as open-ended recurrence', () => {
  const normalized = applyRecurrenceNormalizationForRegression(
    buildEvent({
      category: 'Live Music',
      name: 'Billy White',
      description:
        'Red Shores Unplugged Entertainment Series (acoustic weekend entertainment series). Friday & Saturday evenings.',
      startDate: '2026-07-17',
      endDate: '2026-07-18',
      startTime: '22:00',
      endTime: '01:00',
      isRecurring: 'Yes',
      recurringPattern: 'weekly_custom',
      recurringDaysOfWeek: ['friday', 'saturday'],
    }),
    buildOriginalItem({
      name: 'Billy White',
      description:
        'Red Shores Unplugged Entertainment Series (acoustic weekend entertainment series). Friday & Saturday evenings.',
      date: '2026-07-17',
      startTime: '22:00',
      endTime: '01:00',
      recurringPattern: 'weekly_custom',
      recurringDaysOfWeek: ['friday', 'saturday'],
    })
  );

  assert.equal(normalized.isRecurring, false);
  assert.equal(normalized.recurringPattern, 'none');
  assert.equal(normalized.recurringDaysOfWeek, undefined);
});

test('true multi-day live music series containers can still stay recurring', () => {
  const normalized = applyRecurrenceNormalizationForRegression(
    buildEvent({
      category: 'Live Music',
      name: 'Red Shores Unplugged Entertainment Series',
      description:
        'Red Shores Unplugged Entertainment Series. Friday & Saturday evenings at 10pm.',
      startDate: '2026-07-03',
      endDate: '2026-07-03',
      startTime: '22:00',
      endTime: '01:00',
      isRecurring: 'Yes',
      recurringPattern: 'weekly_custom',
      recurringDaysOfWeek: ['friday', 'saturday'],
    }),
    buildOriginalItem({
      name: 'Red Shores Unplugged Entertainment Series',
      description:
        'Red Shores Unplugged Entertainment Series. Friday & Saturday evenings at 10pm.',
      date: '2026-07-03',
      startTime: '22:00',
      endTime: '01:00',
      recurringPattern: 'weekly_custom',
      recurringDaysOfWeek: ['friday', 'saturday'],
    })
  );

  assert.equal(normalized.isRecurring, true);
  assert.equal(normalized.recurringPattern, 'weekly_custom');
  assert.deepEqual(normalized.recurringDaysOfWeek, ['friday', 'saturday']);
});

test('an explicit every-Tuesday source corrects a bad daily model result and anchor date', () => {
  const normalized = applyRecurrenceNormalizationForRegression(
    buildEvent({
      category: 'Trivia Night',
      name: 'Trivia Night',
      description: 'Trivia Night every Tuesday at 5pm.',
      establishment: 'Bogside Brewing',
      venue: 'Bogside Brewing',
      startDate: '2026-08-01',
      endDate: '2026-08-01',
      startTime: '17:00',
      endTime: '19:00',
      isRecurring: 'Yes',
      recurringPattern: 'daily',
    }),
    buildOriginalItem({
      name: 'Trivia Night',
      description: 'Trivia Night every Tuesday at 5pm.',
      date: '2026-08-01',
      startTime: '17:00',
      endTime: '19:00',
      venue: 'Bogside Brewing',
      recurringPattern: 'daily',
    })
  );

  assert.equal(normalized.isRecurring, true);
  assert.equal(normalized.recurringPattern, 'weekly_tuesday');
  assert.equal(normalized.startDate, '2026-08-04');
  assert.equal(normalized.endDate, '2026-08-04');
});

test('a singular weekday listing cannot remain an open-ended daily recurrence', () => {
  const normalized = applyRecurrenceNormalizationForRegression(
    buildEvent({
      category: 'Family Friendly',
      name: 'Family Rates Available (Day on the Farm)',
      description: 'Sunday - Family Rates Available. Bring the whole family.',
      establishment: 'Island Hill Farm',
      venue: 'Island Hill Farm',
      startDate: '2026-07-26',
      endDate: '2026-07-26',
      startTime: '10:00',
      endTime: '18:00',
      isRecurring: 'Yes',
      recurringPattern: 'daily',
    }),
    buildOriginalItem({
      name: 'Family Rates Available (Day on the Farm)',
      description: 'Sunday - Family Rates Available. Bring the whole family.',
      date: '2026-07-26',
      startTime: '10:00',
      endTime: '18:00',
      venue: 'Island Hill Farm',
      recurringPattern: 'daily',
    })
  );

  assert.equal(normalized.isRecurring, false);
  assert.equal(normalized.recurringPattern, 'none');
  assert.equal(normalized.recurrenceUntilDate, undefined);
});
