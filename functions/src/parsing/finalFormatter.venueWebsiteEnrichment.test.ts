import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyExplicitDateRangeCorrections,
  hasUnresolvedEarlyMeridiem,
  normalizeUnambiguousSourceStartTime,
  repairGenericTitleFragmentVenue,
  rehydrateFormattedEventMetadata,
} from './finalFormatter.js';
import { ExtractedItem, TimeResolvedEvent } from './types.js';

test('holds a printed 7 h 00 without AM/PM while retaining a corroborated time', () => {
  assert.equal(hasUnresolvedEarlyMeridiem({
    name: 'Cercle de conversation en français',
    startTime: '7:00 (AM/PM unspecified)',
  } as ExtractedItem), true);
  assert.equal(hasUnresolvedEarlyMeridiem({
    name: 'Cercle de conversation en français',
    startTime: '19:00',
  } as ExtractedItem), false);
  assert.equal(hasUnresolvedEarlyMeridiem({
    name: 'L’heure des tout-petits',
    startTime: '10 h 30 (AM/PM unspecified)',
  } as ExtractedItem), false);
});

test('restores only unambiguous printed start times when formatting omits them', () => {
  assert.equal(normalizeUnambiguousSourceStartTime('1:30 P.M.'), '13:30');
  assert.equal(normalizeUnambiguousSourceStartTime('4:00 P.M.'), '16:00');
  assert.equal(normalizeUnambiguousSourceStartTime('10 h 30'), '10:30');
  assert.equal(normalizeUnambiguousSourceStartTime('19:00'), '19:00');
  assert.equal(normalizeUnambiguousSourceStartTime('7:00 (meridiem unspecified)'), '');
  const restored = rehydrateFormattedEventMetadata(
    buildFormattedEvent({ startTime: '' }) as any,
    { name: 'Community Puzzle', startTime: '1:30 P.M.' } as ExtractedItem
  );
  assert.equal(restored.startTime, '13:30');
});

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

test('formatted metadata rehydration preserves image-aware relevant image index', () => {
  const rehydrated = rehydrateFormattedEventMetadata(
    buildFormattedEvent({
      name: 'Wellness on the Waterfront',
      relevantImageIndex: 3,
    }),
    buildOriginalItem({
      name: 'Wellness on the Waterfront',
      relevantImageIndex: 1,
    })
  );

  assert.equal(rehydrated.relevantImageIndex, 1);
});

test('formatted metadata rehydration keeps linked-calendar entries off unrelated post images', () => {
  const rehydrated = rehydrateFormattedEventMetadata(
    buildFormattedEvent({ relevantImageIndex: 0 }),
    buildOriginalItem({ relevantImageIndex: -1 })
  );
  assert.equal(rehydrated.relevantImageIndex, -1);
});

test('generic title-fragment venue does not override the row venue', () => {
  const repaired = repairGenericTitleFragmentVenue(
    buildFormattedEvent({
      name: 'Wellness on the Waterfront',
      establishment: 'Waterfront',
      venue: 'Waterfront',
      additionalLocation: 'Waterfront',
    }),
    "Founders' Food Hall and Market"
  );

  assert.equal(repaired.establishment, "Founders' Food Hall and Market");
  assert.equal(repaired.venue, "Founders' Food Hall and Market");
  assert.equal(repaired.additionalLocation, '');
});
