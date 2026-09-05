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

test('single-date screening rows do not become finite weekly recurring runs', () => {
  const normalized = applyRecurrenceNormalizationForRegression(
    buildEvent({
      category: 'Cinema',
      name: 'Early Test Screening (Invite Only) - Courtesy of MUBI and Camp Miasma Pictures LLC',
      description: 'Early test screening invite only alongside Aug 14th at 7:00PM.',
      establishment: 'The Tivoli Cinema',
      venue: 'The Tivoli Cinema',
      startDate: '2026-08-07',
      endDate: '2026-08-07',
      startTime: '19:00',
      endTime: '23:00',
      isRecurring: 'Yes',
      recurringPattern: 'weekly_friday',
      totalOccurrences: 2,
      recurrenceUntilDate: '2026-08-14',
    }),
    buildOriginalItem({
      name: 'Early Test Screening (Invite Only) - Courtesy of MUBI and Camp Miasma Pictures LLC',
      description: 'Early test screening invite only alongside Aug 14th at 7:00PM.',
      date: '2026-08-14',
      startTime: '19:00',
      endTime: '23:00',
      venue: 'The Tivoli Cinema',
      recurringPattern: 'weekly_friday',
      _sourceType: 'calendar',
    })
  );

  assert.equal(normalized.isRecurring, false);
  assert.equal(normalized.recurringPattern, 'none');
  assert.equal(normalized.totalOccurrences, undefined);
  assert.equal(normalized.recurrenceUntilDate, undefined);
  assert.equal(normalized.startDate, '2026-08-14');
  assert.equal(normalized.endDate, '2026-08-14');
});

test('real camp recurrence wording is still treated as recurring', () => {
  const normalized = applyRecurrenceNormalizationForRegression(
    buildEvent({
      category: 'Family Friendly',
      name: 'Summer Art Camp',
      description: 'Summer art camp runs every Friday until Aug 14 at 10am.',
      startDate: '2026-07-31',
      endDate: '2026-07-31',
      startTime: '10:00',
      endTime: '12:00',
      isRecurring: 'Yes',
      recurringPattern: 'weekly_friday',
      recurrenceUntilDate: '2026-08-14',
    }),
    buildOriginalItem({
      name: 'Summer Art Camp',
      description: 'Summer art camp runs every Friday until Aug 14 at 10am.',
      date: '2026-07-31',
      startTime: '10:00',
      endTime: '12:00',
      recurringPattern: 'weekly_friday',
    })
  );

  assert.equal(normalized.isRecurring, true);
  assert.equal(normalized.recurringPattern, 'weekly_friday');
  assert.equal(normalized.recurrenceUntilDate, '2026-08-14');
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

test('a weak Friday-and-Saturday Live DJ extraction cannot become an open-ended custom recurrence', () => {
  const normalized = applyRecurrenceNormalizationForRegression(
    buildEvent({
      category: 'Live Music',
      name: 'Live DJ',
      description: 'Pasties Party! Fri and Sat with DJ MCODE 2000! LIVE DJ @ 10PM',
      establishment: 'Be You',
      venue: 'Be You',
      startDate: '2026-08-10',
      endDate: '2026-08-11',
      startTime: '22:00',
      endTime: '01:00',
      isRecurring: 'Yes',
      recurringPattern: 'weekly_custom',
      recurringDaysOfWeek: ['friday', 'saturday'],
    }),
    buildOriginalItem({
      name: 'Live DJ',
      description: 'Pasties Party! Fri and Sat with DJ MCODE 2000! LIVE DJ @ 10PM',
      date: '2026-08-10',
      startTime: '22:00',
      endTime: '01:00',
      recurringPattern: 'weekly_custom',
      recurringDaysOfWeek: ['friday', 'saturday'],
    })
  );

  assert.equal(normalized.isRecurring, false);
  assert.equal(normalized.recurringPattern, 'none');
  assert.equal(normalized.recurringDaysOfWeek, undefined);
  assert.equal(normalized.recurrenceUntilDate, undefined);
});

test('an explicit every-Friday-and-Saturday Live DJ series remains recurring', () => {
  const normalized = applyRecurrenceNormalizationForRegression(
    buildEvent({
      category: 'Live Music',
      name: 'Live DJ',
      description: 'Live DJ every Friday and Saturday at 10PM.',
      startDate: '2026-08-14',
      endDate: '2026-08-15',
      startTime: '22:00',
      endTime: '01:00',
      isRecurring: 'Yes',
      recurringPattern: 'weekly_custom',
      recurringDaysOfWeek: ['friday', 'saturday'],
    }),
    buildOriginalItem({
      name: 'Live DJ',
      description: 'Live DJ every Friday and Saturday at 10PM.',
      date: '2026-08-14',
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

test('a single dated schedule row cannot become an open-ended weekly event', () => {
  const description =
    'Throughout Victoria Park Woods. Discover art around every corner. Dance and music woven into the woods, glowing sculptures, immersive installations by the water, playground and beyond.';
  const normalized = applyRecurrenceNormalizationForRegression(
    buildEvent({
      category: 'Live Music',
      name: 'Art Installations',
      description,
      establishment: 'Victoria Park',
      venue: 'Victoria Park',
      startDate: '2026-08-29',
      endDate: '2026-08-29',
      startTime: '16:00',
      endTime: '23:00',
      isRecurring: 'Yes',
      recurringPattern: 'weekly_saturday',
    }),
    buildOriginalItem({
      name: 'Art Installations',
      description,
      date: '2026-08-29',
      startTime: '16:00',
      endTime: '23:00',
      recurringPattern: 'weekly_saturday',
      _sourceType: 'schedule',
    })
  );

  assert.equal(normalized.isRecurring, false);
  assert.equal(normalized.recurringPattern, 'none');
  assert.equal(normalized.recurrenceUntilDate, undefined);
});

test('a dated FIFA match post cannot promote a one-off match into an endless Saturday series', () => {
  const description =
    'BRONZE MEDAL - France vs England on this fine Saturday evening! This game will show each team’s strengths and weaknesses, with only one team walking away with a medal.';
  const normalized = applyRecurrenceNormalizationForRegression(
    buildEvent({
      category: 'Sports',
      name: 'FIFA World Cup Matchday: France vs England (Bronze Medal Match)',
      description,
      establishment: 'Founders’ Food Hall and Market',
      venue: 'Founders’ Food Hall and Market',
      startDate: '2026-07-18',
      endDate: '2026-07-18',
      startTime: '18:00',
      endTime: '23:00',
      isRecurring: 'Yes',
      recurringPattern: 'weekly_saturday',
    }),
    buildOriginalItem({
      name: 'FIFA World Cup Matchday: France vs England (Bronze Medal Match)',
      description,
      date: '2026-07-18',
      startTime: '18:00',
      endTime: '23:00',
      recurringPattern: 'weekly_saturday',
      _sourceType: 'event',
    })
  );

  assert.equal(normalized.isRecurring, false);
  assert.equal(normalized.recurringPattern, 'none');
  assert.equal(normalized.recurrenceUntilDate, undefined);
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
