import test from 'node:test';
import assert from 'node:assert/strict';
import { previewDuplicateMerge } from './rowProcessor.js';
import { EventData, VenueData } from '../types/index.js';

function buildVenue(): VenueData {
  return {
    id: 'venue_alpha',
    name: 'Carrefour ISJ',
    normalizedName: 'carrefour isj',
    address: '5 Acadian Drive',
    latitude: 0,
    longitude: 0,
  };
}

function buildEvent(overrides: Partial<EventData>): EventData {
  return {
    uniqueId: 'row_unique_1',
    establishment: 'Carrefour ISJ',
    venueId: 'venue_alpha',
    eventType: 'workshop_class',
    eventName: 'Language Exchange Program',
    name: 'Language Exchange Program',
    description: 'Language exchange program.',
    category: 'Workshops & Classes',
    isEvent: 'Yes',
    isFoodSpecial: 'No',
    startDate: '2026-04-24',
    endDate: '2026-04-24',
    startTime: '17:00',
    endTime: '19:00',
    isRecurring: true,
    recurringPattern: 'weekly_friday',
    ...overrides,
  };
}

test('prevents endDate-only corruption when incoming recurring occurrence is anchored to a different day', () => {
  const venue = buildVenue();
  const existingEvent = buildEvent({
    uniqueId: '1374461054721870_1',
    eventName: "Programme d'échange de langue / Language Exchange Program (3 sessions)",
    name: "Programme d'échange de langue / Language Exchange Program (3 sessions)",
    description:
      "Programme d'échange de langue / Language Exchange Program. 3 sessions on Fridays 5 pm-7 pm.",
    startDate: '2026-04-24',
    endDate: '2026-04-24',
    recurrenceUntilDate: '2026-06-19',
    totalOccurrences: 3,
    isRecurring: true,
    recurringPattern: 'weekly_friday',
  });

  const incomingEvent = buildEvent({
    uniqueId: '1374461054721870_1',
    eventName: 'Programme d’échange de langue / Language Exchange Program',
    name: 'Programme d’échange de langue / Language Exchange Program',
    description:
      'Programme d’échange de langue / Language Exchange Program — Practice English and French together.',
    startDate: '2026-04-17',
    endDate: '2026-04-17',
    startTime: '17:00',
    endTime: '19:00',
    isRecurring: undefined,
    recurringPattern: 'weekly_friday',
    timeResolution: { hoursUsed: false },
    timeFlags: {
      start: { source: 'explicit', evidence: 'Fridays at 5 pm - 7 pm' },
      end: { source: 'explicit', toClose: false, evidence: '5 pm - 7 pm' },
    },
  });

  const preview = previewDuplicateMerge({
    existingEvent,
    incomingEvent,
    venue,
  });

  assert.equal(preview.updates.startDate, undefined);
  assert.equal(preview.updates.endDate, undefined);
  assert.ok(!preview.changedFields.includes('endDate'));
});

test('prevents endDate replacement from a timestamp-style keeper when startDate stays anchored elsewhere', () => {
  const venue = buildVenue();
  const existingEvent = buildEvent({
    uniqueId: 'language_exchange_timestamp_keeper',
    eventName: 'Language Exchange Program',
    name: 'Language Exchange Program',
    startDate: '2026-04-24',
    endDate: '2026-04-24T00:00:00.000Z',
    startTime: '17:00',
    endTime: '19:00',
    isRecurring: true,
    recurringPattern: 'weekly_friday',
  });

  const incomingEvent = buildEvent({
    uniqueId: 'language_exchange_timestamp_keeper',
    eventName: 'Language Exchange Program',
    name: 'Language Exchange Program',
    startDate: '2026-04-17',
    endDate: '2026-04-17',
    startTime: '17:00',
    endTime: '19:00',
    isRecurring: undefined,
    recurringPattern: 'weekly_friday',
    timeResolution: { hoursUsed: false },
    timeFlags: {
      start: { source: 'explicit', evidence: 'Fridays at 5 pm - 7 pm' },
      end: { source: 'explicit', toClose: false, evidence: '5 pm - 7 pm' },
    },
  });

  const preview = previewDuplicateMerge({
    existingEvent,
    incomingEvent,
    venue,
  });

  assert.equal(preview.updates.startDate, undefined);
  assert.equal(preview.updates.endDate, undefined);
  assert.ok(!preview.changedFields.includes('endDate'));
});

test('allows a valid recurring endDate correction when incoming startDate stays aligned', () => {
  const venue = buildVenue();
  const existingEvent = buildEvent({
    uniqueId: 'overnight_keeper_1',
    eventName: "Ken's Rueda Club",
    name: "Ken's Rueda Club",
    category: 'Live Music',
    eventType: 'live_music',
    startDate: '2026-04-24',
    endDate: '2026-04-24',
    startTime: '23:00',
    endTime: '01:00',
    isRecurring: true,
    recurringPattern: 'weekly_friday',
  });

  const incomingEvent = buildEvent({
    uniqueId: 'overnight_keeper_1',
    eventName: "Ken's Rueda Club",
    name: "Ken's Rueda Club",
    category: 'Live Music',
    eventType: 'live_music',
    startDate: '2026-04-24',
    endDate: '2026-04-25',
    startTime: '23:00',
    endTime: '01:00',
    isRecurring: true,
    recurringPattern: 'weekly_friday',
    timeResolution: { hoursUsed: false },
    timeFlags: {
      start: { source: 'explicit', evidence: 'Friday 11 pm - 1 am' },
      end: { source: 'explicit', toClose: false, evidence: '11 pm - 1 am' },
    },
  });

  const preview = previewDuplicateMerge({
    existingEvent,
    incomingEvent,
    venue,
  });

  assert.equal(preview.updates.startDate, undefined);
  assert.equal(preview.updates.endDate, '2026-04-25');
  assert.ok(preview.changedFields.includes('endDate'));
});
