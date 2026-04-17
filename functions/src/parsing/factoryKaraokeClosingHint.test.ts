import test from 'node:test';
import assert from 'node:assert/strict';
import { TimeResolvedEvent } from './types.js';
import { enforceDateTimeCompleteness } from './postParser.js';

function buildEvent(overrides: Partial<TimeResolvedEvent> = {}): TimeResolvedEvent {
  return {
    isEvent: 'Yes',
    isFoodSpecial: 'No',
    category: 'Karaoke',
    name: 'Karaoke Night',
    description: 'Factory Downtown every Thursday.',
    establishment: 'The Factory',
    address: '',
    startDate: '2026-04-16',
    endDate: '2026-04-16',
    startTime: '22:00',
    endTime: '01:00',
    ticketPrice: '',
    ticketLink: '',
    relevantImageIndex: 0,
    venue: 'The Factory',
    additionalLocation: '',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_thursday',
    _sourceType: 'event',
    timeFlags: {
      start: {
        source: 'explicit',
        evidence: 'from 10PM',
      },
      end: {
        source: 'none',
        toClose: false,
        evidence: '',
      },
    },
    timeResolution: {
      hoursUsed: false,
      endFromHours: 'category_default',
    },
    ...overrides,
  };
}

test('single-event nightlife posters can use a closing-hours hint instead of karaoke category fallback', () => {
  const [resolved] = enforceDateTimeCompleteness(
    [buildEvent()],
    '2026-04-02T00:15:00.000Z',
    'America/Halifax',
    'Karaoke Night APR 02 10 PM Every Thursday Twisted Teas on special Open till 2.AM Come sing all night OCR TEXT: OPEN TILL 2AM'
  );

  assert.equal(resolved.endTime, '02:00');
  assert.equal(resolved.endDate, '2026-04-17');
  assert.equal(resolved.timeResolution?.endFromHours, 'to_close');
  assert.equal(resolved.timeFlags?.end?.source, 'semantic');
  assert.equal(resolved.timeFlags?.end?.toClose, true);
  assert.match(String(resolved.timeFlags?.end?.evidence || ''), /open till 2\.?a\.?m/i);
});

test('duplicated text-plus-ocr closing hints are allowed when they point to the same end time', () => {
  const [resolved] = enforceDateTimeCompleteness(
    [buildEvent()],
    '2026-04-02T00:15:00.000Z',
    'America/Halifax',
    'Karaoke Night every Thursday from 10PM. Open till 2AM. OCR TEXT: OPEN TILL 2.AM'
  );

  assert.equal(resolved.endTime, '02:00');
  assert.equal(resolved.timeResolution?.endFromHours, 'to_close');
});

test('non-nightlife posters do not convert footer closing-hours text into event end times', () => {
  const [resolved] = enforceDateTimeCompleteness(
    [
      buildEvent({
        category: 'Workshops & Classes',
        name: 'Evening Workshop',
        description: 'One-night workshop for adults.',
        startTime: '18:00',
        endTime: '',
        timeFlags: {
          start: {
            source: 'explicit',
            evidence: '6PM',
          },
          end: {
            source: 'none',
            toClose: false,
            evidence: '',
          },
        },
        timeResolution: { hoursUsed: false },
      }),
    ],
    '2026-04-02T00:15:00.000Z',
    'America/Halifax',
    'Evening Workshop at the studio. Doors open at 5PM. Venue open until 9PM.'
  );

  assert.equal(resolved.endTime, '20:00');
  assert.equal(resolved.timeResolution?.endFromHours, 'duration_default');
  assert.equal(resolved.timeFlags?.end?.toClose, false);
});

test('schedule-derived rows do not use the nightlife closing-hours hint', () => {
  const [resolved] = enforceDateTimeCompleteness(
    [
      buildEvent({
        _sourceType: 'schedule',
        endTime: '',
        timeResolution: { hoursUsed: false },
      }),
    ],
    '2026-04-02T00:15:00.000Z',
    'America/Halifax',
    'Thursday schedule: Karaoke 10PM. Open until 2AM.'
  );

  assert.equal(resolved.endTime, '00:00');
  assert.equal(resolved.timeResolution?.endFromHours, 'duration_default');
  assert.equal(resolved.timeFlags?.end?.toClose, false);
});

test('food-special rows do not use the nightlife closing-hours hint', () => {
  const [resolved] = enforceDateTimeCompleteness(
    [
      buildEvent({
        isEvent: 'No',
        isFoodSpecial: 'Yes',
        category: 'Drink Special',
        name: 'Twisted Teas On Special',
        description: 'Open till 2AM.',
        endTime: '',
        timeResolution: { hoursUsed: false },
      }),
    ],
    '2026-04-02T00:15:00.000Z',
    'America/Halifax',
    'Twisted Teas on special. Open until 2AM.'
  );

  assert.equal(resolved.endTime, '23:00');
  assert.equal(resolved.timeResolution?.endFromHours, 'category_default');
  assert.equal(resolved.timeFlags?.end?.toClose, false);
});

test('explicit event ranges are not overridden by a closing-hours hint', () => {
  const [resolved] = enforceDateTimeCompleteness(
    [
      buildEvent({
        endTime: '01:30',
        endDate: '2026-04-17',
        timeResolution: { hoursUsed: false },
        timeFlags: {
          start: {
            source: 'explicit',
            evidence: '10PM-1:30AM',
          },
          end: {
            source: 'explicit',
            toClose: false,
            evidence: '10PM-1:30AM',
          },
        },
      }),
    ],
    '2026-04-02T00:15:00.000Z',
    'America/Halifax',
    'Karaoke Night 10PM-1:30AM. Open till 2AM.'
  );

  assert.equal(resolved.endTime, '01:30');
  assert.equal(resolved.endDate, '2026-04-17');
  assert.equal(resolved.timeFlags?.end?.source, 'explicit');
  assert.equal(resolved.timeFlags?.end?.toClose, false);
});
