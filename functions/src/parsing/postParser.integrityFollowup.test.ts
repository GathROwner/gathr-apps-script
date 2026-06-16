import test from 'node:test';
import assert from 'node:assert/strict';

import {
  enforceDateTimeCompleteness,
  extractExplicitTimeRangeForRegression,
} from './postParser.js';
import { TimeResolvedEvent } from './types.js';

function buildEvent(overrides: Partial<TimeResolvedEvent> = {}): TimeResolvedEvent {
  return {
    isEvent: 'Yes',
    isFoodSpecial: 'No',
    category: 'Workshops & Classes',
    name: 'Program Item',
    description: '',
    establishment: 'Test Venue',
    address: '',
    startDate: '2026-04-25',
    endDate: '2026-04-25',
    startTime: '08:30',
    endTime: '21:00',
    ticketPrice: '',
    ticketLink: '',
    relevantImageIndex: 0,
    venue: 'Test Venue',
    additionalLocation: '',
    isRecurring: 'No',
    recurringPattern: 'none',
    timeResolution: {
      hoursUsed: false,
      endFromHours: 'category_default',
    },
    ...overrides,
  };
}

test('grouped workshop rows can override category-default close times using the next start time', () => {
  const resolved = enforceDateTimeCompleteness(
    [
      buildEvent({
        name: 'Rebound Fit',
        description:
          'We have Rebound Fit at 830am and Soul Cave Box Fit at 930am. All abilities welcome.',
        startTime: '08:30',
      }),
      buildEvent({
        name: 'SoulCave Box Fit',
        description:
          'We have Rebound Fit at 830am and Soul Cave Box Fit at 930am. All abilities welcome.',
        startTime: '09:30',
      }),
    ],
    '2026-04-24T23:33:09.000Z',
    'America/Halifax',
    'We have Rebound Fit at 830am and Soul Cave Box Fit at 930am. All abilities welcome.'
  );

  assert.equal(resolved[0].endTime, '09:30');
  assert.equal(resolved[0].timeResolution?.endFromHours, 'duration_default');
  assert.match(String(resolved[0].timeFlags?.end?.evidence || ''), /next grouped start/i);

  assert.equal(resolved[1].endTime, '10:30');
  assert.equal(resolved[1].timeResolution?.endFromHours, 'duration_default');
  assert.match(String(resolved[1].timeFlags?.end?.evidence || ''), /grouped duration default 60m/i);
});

test('short-form program rows replace category-default close times with duration defaults', () => {
  const [resolved] = enforceDateTimeCompleteness(
    [
      buildEvent({
        category: 'Gatherings & Parties',
        name: 'Teen Advisory Group',
        description:
          'Join our teen advisory group and earn volunteer hours for the community service bursary.',
        startDate: '2026-05-04',
        endDate: '2026-05-04',
        startTime: '15:30',
        endTime: '23:00',
        recurringPattern: 'weekly_monday',
        isRecurring: 'Yes',
        timeResolution: {
          hoursUsed: true,
          endFromHours: 'category_default',
        },
      }),
    ],
    '2026-04-28T12:01:13.000Z',
    'America/Halifax',
    'Join our teen advisory group and earn volunteer hours for the community service bursary.'
  );

  assert.equal(resolved.endTime, '17:30');
  assert.equal(resolved.timeResolution?.endFromHours, 'duration_default');
  assert.match(String(resolved.timeFlags?.end?.evidence || ''), /short-form duration default override/i);
});

test('schedule-style program rows use duration defaults even with generic titles', () => {
  const [resolved] = enforceDateTimeCompleteness(
    [
      buildEvent({
        category: 'Workshops & Classes',
        name: 'Paper Weaving',
        description: 'Ages 6-12. Create your own unique art using the paper weaving method.',
        startDate: '2026-05-01',
        endDate: '2026-05-01',
        startTime: '11:00',
        endTime: '21:00',
        timeResolution: {
          hoursUsed: true,
          endFromHours: 'category_default',
        },
        _sourceType: 'calendar' as TimeResolvedEvent['_sourceType'],
      }),
    ],
    '2026-04-28T12:01:13.000Z',
    'America/Halifax',
    'Paper Weaving 11:00 a.m. Ages 6-12. Create your own unique art using the paper weaving method.'
  );

  assert.equal(resolved.endTime, '13:00');
  assert.equal(resolved.timeResolution?.endFromHours, 'duration_default');
  assert.match(String(resolved.timeFlags?.end?.evidence || ''), /short-form duration default override/i);
});

test('dense one-off schedule batches replace category-default close times across generic program rows', () => {
  const events = Array.from({ length: 8 }, (_, index) =>
    buildEvent({
      category: index % 2 === 0 ? 'Family Friendly' : 'Workshops & Classes',
      name: `Program ${index + 1}`,
      description: 'Monthly calendar program listing.',
      startDate: `2026-05-${String(index + 1).padStart(2, '0')}`,
      endDate: `2026-05-${String(index + 1).padStart(2, '0')}`,
      startTime: index % 2 === 0 ? '11:00' : '14:00',
      endTime: index % 2 === 0 ? '21:00' : '23:00',
      recurringPattern: 'none',
      isRecurring: 'No',
      timeResolution: {
        hoursUsed: true,
        endFromHours: 'category_default',
      },
    })
  );

  const resolved = enforceDateTimeCompleteness(
    events,
    '2026-04-28T12:01:13.000Z',
    'America/Halifax',
    'May programs calendar poster.'
  );

  assert.equal(resolved[0].endTime, '13:00');
  assert.equal(resolved[0].timeResolution?.endFromHours, 'duration_default');
  assert.match(String(resolved[0].timeFlags?.end?.evidence || ''), /dense schedule duration default override/i);

  assert.equal(resolved[1].endTime, '16:00');
  assert.equal(resolved[1].timeResolution?.endFromHours, 'duration_default');
});

test('ordinary category-default rows without short-form cues stay unchanged', () => {
  const [resolved] = enforceDateTimeCompleteness(
    [
      buildEvent({
        category: 'Gatherings & Parties',
        name: 'Community Social',
        description: 'Join us for an evening social at the hall.',
        startDate: '2026-05-04',
        endDate: '2026-05-04',
        startTime: '15:30',
        endTime: '23:00',
        timeResolution: {
          hoursUsed: true,
          endFromHours: 'category_default',
        },
      }),
    ],
    '2026-04-28T12:01:13.000Z',
    'America/Halifax',
    'Join us for an evening social at the hall.'
  );

  assert.equal(resolved.endTime, '23:00');
  assert.equal(resolved.timeResolution?.endFromHours, 'category_default');
});

test('regular events fail closed when only venue hours invented the start time', () => {
  const resolved = enforceDateTimeCompleteness(
    [
      buildEvent({
        category: 'Cinema',
        name: 'Bleak Week: Cinema of Despair',
        description: 'A week straight of films from Monday, June 1 to Sunday, June 7.',
        establishment: 'The Tivoli Cinema',
        venue: 'The Tivoli Cinema',
        startDate: '2026-06-01',
        endDate: '2026-06-07',
        startTime: '16:00',
        endTime: '23:00',
        timeFlags: {
          start: { source: 'semantic', evidence: 'Start from venue hours (opens 16:00)' },
          end: { source: 'none', toClose: false, evidence: '' },
        },
        timeResolution: {
          hoursUsed: true,
          startFromHours: true,
          endFromHours: 'category_default',
        },
      }),
    ],
    '2026-04-28T12:01:13.000Z',
    'America/Halifax',
    'Bleak Week: Cinema of Despair June 1-7. No showtimes listed.'
  );

  assert.equal(resolved.length, 0);
});

test('special-like rows may keep venue-hours start fallbacks', () => {
  const [resolved] = enforceDateTimeCompleteness(
    [
      buildEvent({
        isEvent: 'No',
        isFoodSpecial: 'Yes',
        category: 'Happy Hour',
        name: 'Happy Hour',
        description: 'Happy hour specials today.',
        startTime: '16:00',
        endTime: '19:00',
        timeFlags: {
          start: { source: 'semantic', evidence: 'Start from venue hours (opens 16:00)' },
          end: { source: 'none', toClose: false, evidence: '' },
        },
        timeResolution: {
          hoursUsed: true,
          startFromHours: true,
          endFromHours: 'category_default',
        },
      }),
    ],
    '2026-04-28T12:01:13.000Z',
    'America/Halifax',
    'Happy hour specials today.'
  );

  assert.equal(resolved.startTime, '16:00');
  assert.equal(resolved.timeResolution?.startFromHours, true);
});

test('lunch special shorthand ranges recover the intended daytime window', () => {
  const [resolved] = enforceDateTimeCompleteness(
    [
      buildEvent({
        category: 'Food Special',
        isFoodSpecial: 'Yes',
        name: 'Lunch Special',
        description: 'Available 11-2pm while quantities last.',
        startTime: '23:00',
        endTime: '14:00',
        timeFlags: {
          start: { source: 'explicit', evidence: 'Available 11-2pm' },
          end: { source: 'none', toClose: false, evidence: '' },
        },
        timeResolution: {
          hoursUsed: false,
          endFromHours: 'category_default',
        },
      }),
    ],
    '2026-04-28T12:01:13.000Z',
    'America/Halifax',
    'Available 11-2pm while quantities last.'
  );

  assert.deepEqual(extractExplicitTimeRangeForRegression('Available 11-2pm', ''), {
    startTime: '11:00',
    endTime: '14:00',
  });
  assert.equal(resolved.startTime, '11:00');
  assert.equal(resolved.endTime, '14:00');
});

test('single-night explicit midnight ranges do not become false 24-hour events', () => {
  const description =
    'WERK NIGHT is a queer and trans inclusive mix-tape dance party. When? Saturday, June 13th. 9 PM - Midnight.';
  const [resolved] = enforceDateTimeCompleteness(
    [
      buildEvent({
        category: 'Gatherings & Parties',
        name: 'WERK NIGHT',
        description,
        startDate: '2026-06-13',
        endDate: '2026-06-13',
        startTime: '21:00',
        endTime: '21:00',
        timeResolution: {
          hoursUsed: false,
          endFromHours: 'category_default',
        },
      }),
    ],
    '2026-06-13T14:29:36.165Z',
    'America/Halifax',
    description
  );

  assert.deepEqual(extractExplicitTimeRangeForRegression(description, ''), {
    startTime: '21:00',
    endTime: '00:00',
  });
  assert.equal(resolved.startTime, '21:00');
  assert.equal(resolved.endTime, '00:00');
  assert.equal(resolved.startDate, '2026-06-13');
  assert.equal(resolved.endDate, '2026-06-14');
});
