import test from 'node:test';
import assert from 'node:assert/strict';

import { previewDuplicateMerge } from './rowProcessor.js';
import { EventData, VenueData } from '../types/index.js';

function buildVenue(): VenueData {
  return {
    id: 'venue_club',
    name: 'The Club',
    normalizedName: 'the club',
    address: '44 Ferry Street',
    latitude: 0,
    longitude: 0,
  };
}

function buildEvent(overrides: Partial<EventData>): EventData {
  return {
    uniqueId: '1468660561621505_2',
    venueId: 'venue_club',
    establishment: 'The Club',
    additionalLocation: 'The Club',
    eventType: 'live_music',
    eventName: 'Dan McCarthy on the mic',
    name: 'Dan McCarthy on the mic',
    description: 'Dan McCarthy on the mic Friday 4pm',
    category: 'Live Music',
    isEvent: 'Yes',
    isFoodSpecial: 'No',
    startDate: '2026-04-10',
    endDate: '2026-04-11',
    startTime: '16:00',
    endTime: '01:00',
    isRecurring: true,
    recurringPattern: 'weekly_friday',
    ...overrides,
  };
}

test('corrects a stale simple weekly weekday when the incoming weekday matches the keeper date and family', () => {
  const preview = previewDuplicateMerge({
    venue: buildVenue(),
    existingEvent: buildEvent({
      recurringPattern: 'weekly_wednesday',
    }),
    incomingEvent: buildEvent({
      recurringPattern: 'weekly_friday',
    }),
  });

  assert.equal(preview.updates.recurringPattern, 'weekly_friday');
  assert.ok(preview.changedFields.includes('recurringPattern'));
});

test('keeps equal-specificity weekly patterns unchanged without strong date-conflict proof', () => {
  const preview = previewDuplicateMerge({
    venue: buildVenue(),
    existingEvent: buildEvent({
      recurringPattern: 'weekly_wednesday',
    }),
    incomingEvent: buildEvent({
      recurringPattern: 'weekly_friday',
      startDate: '2026-04-09',
      endDate: '2026-04-10',
    }),
  });

  assert.equal(preview.updates.recurringPattern, undefined);
  assert.ok(!preview.changedFields.includes('recurringPattern'));
});

test('does not correct weekly pattern across different sibling titles', () => {
  const preview = previewDuplicateMerge({
    venue: buildVenue(),
    existingEvent: buildEvent({
      recurringPattern: 'weekly_wednesday',
      name: 'Dan McCarthy on the mic',
      eventName: 'Dan McCarthy on the mic',
    }),
    incomingEvent: buildEvent({
      recurringPattern: 'weekly_friday',
      name: 'Open mic Sunday with Mike Fagen',
      eventName: 'Open mic Sunday with Mike Fagen',
      description: 'Open mic Sunday with Mike Fagen Friday 4pm',
    }),
  });

  assert.equal(preview.updates.recurringPattern, undefined);
  assert.ok(!preview.changedFields.includes('recurringPattern'));
});
