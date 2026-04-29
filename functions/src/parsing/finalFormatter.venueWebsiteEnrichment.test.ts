import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyExplicitDateRangeCorrections,
  rehydrateFormattedEventMetadata,
} from './finalFormatter.js';
import { ExtractedItem, TimeResolvedEvent } from './types.js';

function buildFormattedEvent(
  overrides: Partial<TimeResolvedEvent> = {}
): TimeResolvedEvent {
  return {
    isEvent: 'Yes',
    isFoodSpecial: 'No',
    category: 'Live Music',
    name: 'Beach Boys show (Trailside Music Hall)',
    description:
      'Tickets available now. May 7th - 9th at the Trailside! Tickets on sale now at www.trailside.ca',
    establishment: 'Trailside Music Hall',
    address: '',
    startDate: '2026-05-07',
    endDate: '2026-05-07',
    startTime: '20:00',
    endTime: '',
    ticketPrice: '',
    ticketLink: '',
    relevantImageIndex: 0,
    venue: 'Trailside Music Hall',
    additionalLocation: '',
    isRecurring: 'No',
    recurringPattern: 'none',
    timeFlags: {
      start: { source: 'explicit', evidence: '8:00' },
      end: { source: 'none', toClose: false, evidence: '' },
    },
    ...overrides,
  };
}

function buildOriginalItem(overrides: Record<string, unknown> = {}): ExtractedItem {
  return {
    name: 'Show at Trailside Music Hall (May 7)',
    description:
      'Tickets available through link in bio or Trailside.ca. May 7th - 9th at the Trailside! Tickets on sale now at www.trailside.ca',
    date: '2026-05-07',
    startTime: '20:00',
    endTime: '',
    venue: 'Trailside Music Hall',
    recurringPattern: 'none',
    extractionReason: 'website follow-up',
    _sourceType: 'event',
    ...overrides,
  } as ExtractedItem;
}

test('explicit date-range correction preserves split single-date items produced from multi-item stage 3 extraction', () => {
  const event = buildFormattedEvent({
    startDate: '2026-05-08',
    endDate: '2026-05-08',
  });

  const corrected = applyExplicitDateRangeCorrections(
    event,
    buildOriginalItem({
      date: '2026-05-08',
      _pipelineTotalStage3: 3,
    })
  );

  assert.equal(corrected.startDate, '2026-05-08');
  assert.equal(corrected.endDate, '2026-05-08');
});

test('explicit date-range correction still widens a true single extracted item to the poster range', () => {
  const corrected = applyExplicitDateRangeCorrections(
    buildFormattedEvent(),
    buildOriginalItem({
      date: '2026-05-07',
      _pipelineTotalStage3: 1,
    })
  );

  assert.equal(corrected.startDate, '2026-05-07');
  assert.equal(corrected.endDate, '2026-05-09');
});

test('formatted metadata rehydration restores a recovered ticket link when Stage 5 leaves it blank', () => {
  const rehydrated = rehydrateFormattedEventMetadata(
    buildFormattedEvent({
      ticketLink: '',
    }),
    buildOriginalItem({
      ticketLink: 'https://locarius.io/events/3817/beach-boys-may-7',
    })
  );

  assert.equal(
    rehydrated.ticketLink,
    'https://locarius.io/events/3817/beach-boys-may-7'
  );
});
