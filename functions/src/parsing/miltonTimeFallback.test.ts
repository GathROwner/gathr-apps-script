import test from 'node:test';
import assert from 'node:assert/strict';
import { ExtractedItem, FormattedEvent, TimeResolvedEvent } from './types.js';
import { rehydrateFormattedEventMetadata } from './finalFormatter.js';
import { enforceDateTimeCompleteness } from './postParser.js';
import { preserveValidatedItemSourceType } from './secondaryValidator.js';

function buildFormattedEvent(
  overrides: Partial<TimeResolvedEvent> = {}
): TimeResolvedEvent {
  return {
    isEvent: 'Yes',
    isFoodSpecial: 'No',
    category: 'Workshops & Classes',
    name: 'Exercise',
    description: 'Wed April 15 - 9 a.m. - Exercise',
    establishment: 'Milton Community Hall',
    address: '',
    startDate: '2026-04-15',
    endDate: '2026-04-15',
    startTime: '09:00',
    endTime: '',
    ticketPrice: '',
    ticketLink: '',
    relevantImageIndex: 0,
    venue: 'Milton Community Hall',
    additionalLocation: '',
    isRecurring: 'No',
    recurringPattern: 'none',
    timeFlags: {
      start: {
        source: 'explicit',
        evidence: '9 a.m.',
      },
      end: {
        source: 'none',
        toClose: false,
        evidence: '',
      },
    },
    ...overrides,
  };
}

function buildOriginalItem(overrides: Record<string, unknown> = {}): ExtractedItem {
  return {
    name: 'Exercise',
    description: 'Wed April 15 - 9 a.m. - Exercise',
    date: '2026-04-15',
    venue: 'Milton Community Hall',
    _sourceType: 'calendar',
    ...overrides,
  } as ExtractedItem;
}

function buildValidatedItem(overrides: Record<string, unknown> = {}): ExtractedItem {
  return {
    name: 'Exercise',
    description: 'Wed April 15 - 9 a.m. - Exercise',
    date: '2026-04-15',
    venue: 'Milton Community Hall',
    startTime: '09:00',
    endTime: '',
    ...overrides,
  } as ExtractedItem;
}

test('preserves calendar source type so start-only Milton classes use duration defaults', () => {
  const validatedItem = preserveValidatedItemSourceType(
    buildValidatedItem(),
    buildOriginalItem()
  );
  const rehydrated = rehydrateFormattedEventMetadata(
    buildFormattedEvent(),
    validatedItem
  );

  assert.equal(rehydrated._sourceType, 'calendar');

  const [resolved] = enforceDateTimeCompleteness(
    [rehydrated],
    '2026-04-14T00:44:02.000Z',
    'America/Halifax',
    ''
  );

  assert.equal(resolved.endTime, '11:00');
  assert.equal(resolved.timeResolution?.endFromHours, 'duration_default');
});

test('preserves calendar source type so start-only Milton social entries do not fall back to venue-close defaults', () => {
  const validatedItem = preserveValidatedItemSourceType(
    buildValidatedItem({
      name: 'Knit/Crochet Social',
      description: 'Wed April 15 - 1:30 - Knit/Crochet Social',
      date: '2026-04-15',
      startTime: '13:30',
    }),
    buildOriginalItem({
      name: 'Knit/Crochet Social',
      description: 'Wed April 15 - 1:30 - Knit/Crochet Social',
    })
  );
  const rehydrated = rehydrateFormattedEventMetadata(
    buildFormattedEvent({
      category: 'Gatherings & Parties',
      name: 'Knit/Crochet Social',
      description: 'Wed April 15 - 1:30 - Knit/Crochet Social',
      startTime: '13:30',
      timeFlags: {
        start: {
          source: 'explicit',
          evidence: '1:30',
        },
        end: {
          source: 'none',
          toClose: false,
          evidence: '',
        },
      },
    }),
    validatedItem
  );

  assert.equal(rehydrated._sourceType, 'calendar');

  const [resolved] = enforceDateTimeCompleteness(
    [rehydrated],
    '2026-04-14T00:44:02.000Z',
    'America/Halifax',
    ''
  );

  assert.equal(resolved.endTime, '15:30');
  assert.equal(resolved.timeResolution?.endFromHours, 'duration_default');
});

test('stage 4 source-type preservation restores missing calendar metadata from the original extracted item', () => {
  const restored = preserveValidatedItemSourceType(
    buildValidatedItem({
      name: 'Sourdough School',
      description: 'Sun April 19 - 9 a.m. Sourdough School',
      date: '2026-04-19',
    }),
    buildOriginalItem({
      name: 'Sourdough School',
      description: 'Sun April 19 - 9 a.m. Sourdough School',
      date: '2026-04-19',
      _sourceType: 'schedule',
    })
  );

  assert.equal(restored._sourceType, 'schedule');
});
