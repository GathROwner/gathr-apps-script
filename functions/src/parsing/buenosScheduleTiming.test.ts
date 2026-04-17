import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeScheduleItemsForRegression,
  parseScheduleTextForRegression,
} from './eventExtractor.js';
import { rehydrateFormattedEventMetadata } from './finalFormatter.js';
import { enforceDateTimeCompleteness } from './postParser.js';
import { preserveValidatedItemSourceType } from './secondaryValidator.js';
import { ExtractedItem, TimeResolvedEvent } from './types.js';

function buildFormattedEvent(
  overrides: Partial<TimeResolvedEvent> = {}
): TimeResolvedEvent {
  const base: TimeResolvedEvent = {
    isEvent: 'Yes',
    isFoodSpecial: 'No',
    category: 'Workshops & Classes',
    name: 'Schedule Item',
    description: '',
    establishment: 'Buenos Island Studio',
    address: '',
    startDate: '2026-04-18',
    endDate: '2026-04-18',
    startTime: '',
    endTime: '',
    ticketPrice: '',
    ticketLink: '',
    relevantImageIndex: 0,
    venue: 'Buenos Island Studio',
    additionalLocation: '',
    isRecurring: 'No',
    recurringPattern: 'none',
    timeFlags: {
      start: { source: 'none', evidence: '' },
      end: { source: 'none', toClose: false, evidence: '' },
    },
  };

  const event = {
    ...base,
    ...overrides,
  } as TimeResolvedEvent;

  if (Object.prototype.hasOwnProperty.call(overrides, 'timeFlags') && overrides.timeFlags === undefined) {
    delete (event as any).timeFlags;
  }
  if (Object.prototype.hasOwnProperty.call(overrides, '_sourceType') && overrides._sourceType === undefined) {
    delete (event as any)._sourceType;
  }

  return event;
}

test('schedule extraction preserves explicit 12-1PM timing through Stage 4 and Stage 5', () => {
  const [stage3Item] = normalizeScheduleItemsForRegression([
    {
      name: 'Belly Dance with Alika',
      type: 'event',
      date: '2026-04-18',
      startTime: '12:00',
      endTime: '',
      venue: 'Buenos Island Studio',
      description: 'Saturdays March 14-April 18; 12-1PM; Six classes',
      extractionReason: 'schedule poster line',
    },
  ]);

  assert.equal(stage3Item.startTime, '12:00');
  assert.equal(stage3Item.endTime, '13:00');
  assert.equal(stage3Item.timeFlags?.start.source, 'explicit');
  assert.equal(stage3Item.timeFlags?.end.source, 'explicit');
  assert.match(stage3Item.timeFlags?.start.evidence || '', /12-1PM/i);

  const stage4Item = preserveValidatedItemSourceType(
    {
      ...stage3Item,
      _sourceType: undefined,
      timeFlags: undefined,
    } as ExtractedItem,
    stage3Item as ExtractedItem
  );

  assert.equal((stage4Item as any)._sourceType, 'schedule');
  assert.equal(stage4Item.timeFlags?.end.source, 'explicit');

  const rehydrated = rehydrateFormattedEventMetadata(
    buildFormattedEvent({
      name: 'Belly Dance with Alika',
      description: 'Saturdays March 14-April 18; 12-1PM; Six classes',
      startDate: '2026-04-18',
      endDate: '2026-04-18',
      startTime: '12:00',
      endTime: '',
      timeFlags: undefined,
      _sourceType: undefined,
    }),
    stage4Item
  );

  assert.equal(rehydrated._sourceType, 'schedule');
  assert.equal(rehydrated.timeFlags?.end.source, 'explicit');

  const [resolved] = enforceDateTimeCompleteness(
    [rehydrated],
    '2026-04-15T12:00:00.000Z',
    'America/Halifax',
    ''
  );

  assert.equal(resolved.endTime, '13:00');
  assert.equal(resolved.timeResolution?.endFromHours, undefined);
});

test('schedule normalization preserves explicit 2:30-5:30 ranges unchanged when Stage 3 already extracted the clock times', () => {
  const [stage3Item] = normalizeScheduleItemsForRegression([
    {
      name: 'Runway & Posing Workshop',
      type: 'event',
      date: '2026-04-18',
      startTime: '14:30',
      endTime: '17:30',
      venue: 'Buenos Island Studio',
      description: '2:30-5:30; with Soli Coaching',
      extractionReason: 'schedule poster line',
    },
  ]);

  assert.equal(stage3Item.startTime, '14:30');
  assert.equal(stage3Item.endTime, '17:30');
  assert.equal(stage3Item.timeFlags?.start.source, 'explicit');
  assert.equal(stage3Item.timeFlags?.end.source, 'explicit');
  assert.match(stage3Item.timeFlags?.start.evidence || '', /2:30-5:30/i);

  const [resolved] = enforceDateTimeCompleteness(
    [
      buildFormattedEvent({
        name: stage3Item.name,
        description: stage3Item.description || '',
        startDate: stage3Item.date,
        endDate: stage3Item.date,
        startTime: stage3Item.startTime,
        endTime: stage3Item.endTime || '',
        timeFlags: stage3Item.timeFlags,
        _sourceType: 'schedule',
      }),
    ],
    '2026-04-15T12:00:00.000Z',
    'America/Halifax',
    ''
  );

  assert.equal(resolved.startTime, '14:30');
  assert.equal(resolved.endTime, '17:30');
});

test('start-only schedule items use short duration fallback instead of category-close defaults', () => {
  const [originalStage3Item] = parseScheduleTextForRegression(
    'Saturday April 18\n1PM SASS Class w/Karina',
    '2026-04-15',
    'Buenos Island Studio',
    'schedule'
  ) as ExtractedItem[];

  const stage4Item = preserveValidatedItemSourceType(
    {
      ...originalStage3Item,
      _sourceType: undefined,
    } as ExtractedItem,
    originalStage3Item
  );

  const rehydrated = rehydrateFormattedEventMetadata(
    buildFormattedEvent({
      name: 'SASS Class w/Karina',
      description: 'Saturdays March 14-April 18; 1PM class',
      startDate: '2026-04-18',
      endDate: '2026-04-18',
      startTime: '13:00',
      endTime: '',
      timeFlags: undefined,
      _sourceType: undefined,
    }),
    stage4Item
  );

  const [resolved] = enforceDateTimeCompleteness(
    [rehydrated],
    '2026-04-15T12:00:00.000Z',
    'America/Halifax',
    ''
  );

  assert.equal(resolved.endTime, '15:00');
  assert.equal(resolved.timeResolution?.endFromHours, 'duration_default');
});

test('ordinary non-schedule events do not gain synthetic schedule time flags', () => {
  const originalItem = {
    name: 'Launch Party',
    description: 'One-night poster event',
    date: '2026-04-18',
    startTime: '18:00',
    endTime: '',
    venue: 'Buenos Island Studio',
    _sourceType: 'event',
  } as ExtractedItem;

  const stage4Item = preserveValidatedItemSourceType(
    {
      ...originalItem,
      _sourceType: undefined,
    } as ExtractedItem,
    originalItem
  );

  const rehydrated = rehydrateFormattedEventMetadata(
    buildFormattedEvent({
      category: 'Gatherings & Parties',
      name: 'Launch Party',
      description: 'One-night poster event',
      startDate: '2026-04-18',
      endDate: '2026-04-18',
      startTime: '18:00',
      endTime: '',
      timeFlags: undefined,
      _sourceType: undefined,
    }),
    stage4Item
  );

  assert.equal(rehydrated._sourceType, 'event');
  assert.equal(rehydrated.timeFlags, undefined);
});
