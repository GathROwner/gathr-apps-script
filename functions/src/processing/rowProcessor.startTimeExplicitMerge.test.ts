import test from 'node:test';
import assert from 'node:assert/strict';

import { previewDuplicateMerge } from './rowProcessor.js';
import { EventData, VenueData } from '../types/index.js';

function buildVenue(): VenueData {
  return {
    id: 'venue_redshores',
    name: 'Red Shores',
    normalizedName: 'red shores',
    address: '58 Kensington Rd',
    latitude: 0,
    longitude: 0,
  };
}

function buildEvent(overrides: Partial<EventData> & { _sourceType?: string } = {}): EventData {
  const event: EventData & { _sourceType?: string } = {
    uniqueId: '1615830863513785_3',
    establishment: 'Red Shores',
    venueId: 'fb_100052606604879',
    eventType: 'special_event',
    eventName: 'Theme Nights at Top of the Park - Fiesta Feast with Mexican flair',
    name: 'Theme Nights at Top of the Park - Fiesta Feast with Mexican flair',
    description:
      'Fridays & Saturdays 5:30PM - 8:00PM - Fiesta Feast with Mexican flair - Just $29.95 (+tax). Dates shown: APRIL17&18.',
    category: 'Events',
    isEvent: 'Yes',
    isFoodSpecial: 'No',
    startDate: '2026-04-17',
    endDate: '2026-04-17',
    startTime: '17:00',
    endTime: '20:00',
    isRecurring: true,
    recurringPattern: 'weekly_custom',
    timeFlags: {
      start: { source: 'explicit', evidence: '5:30PM' },
      end: { source: 'explicit', toClose: false, evidence: '8:00PM' },
    },
    timeResolution: {
      hoursUsed: false,
    },
    ...overrides,
  };

  if (Object.prototype.hasOwnProperty.call(overrides, '_sourceType')) {
    event._sourceType = overrides._sourceType;
  }

  return event as EventData;
}

test('promotes explicit incoming start time when the keeper carries matching 5:30PM evidence but a stale 17:00 start', () => {
  const venue = buildVenue();
  const existingEvent = buildEvent();

  const incomingEvent = buildEvent({
    startTime: '17:30',
    _sourceType: 'schedule',
  });

  const preview = previewDuplicateMerge({
    existingEvent,
    incomingEvent,
    venue,
  });

  assert.equal(preview.updates.startTime, '17:30');
  assert.equal(preview.updates.endTime, undefined);
  assert.equal(preview.timeImproved, true);
  assert.ok(preview.changedFields.includes('startTime'));
});

test('ignores age-range text when validating explicit time evidence during duplicate merge', () => {
  const venue: VenueData = {
    id: '5fxwonYWZbp95kOOjdfF',
    name: "Veteran's Memorial Park",
    normalizedName: 'veterans memorial park',
    address: '89 Summer St',
    latitude: 0,
    longitude: 0,
  };
  const existingEvent = buildEvent({
    uniqueId: '1507911641334813_1',
    venueId: venue.id,
    establishment: "Veteran's Memorial Park",
    eventName: 'Downtown Summerside Easter Egg Hunt (Age 0-6 Hunt)',
    name: 'Downtown Summerside Easter Egg Hunt (Age 0-6 Hunt)',
    description:
      'Downtown Summerside Easter Egg Hunt. Age 0 - 6 Hunt 11 - 11:30.',
    startDate: '2026-03-28',
    endDate: '2026-03-28',
    startTime: '11:00',
    endTime: '11:30',
    timeFlags: {
      start: { source: 'explicit', evidence: 'Age 0 - 6 Hunt 11 - 11:30' },
      end: {
        source: 'explicit',
        toClose: false,
        evidence: 'Age 0 - 6 Hunt 11 - 11:30',
      },
    },
  });
  const incomingEvent = buildEvent({
    uniqueId: '1507911641334813_1',
    venueId: venue.id,
    establishment: "Veteran's Memorial Park",
    eventName: 'Downtown Summerside Easter Egg Hunt (Age 0–6)',
    name: 'Downtown Summerside Easter Egg Hunt (Age 0–6)',
    description:
      'Downtown Summerside Easter Egg Hunt. Age 0 - 6 Hunt 11 - 11:30.',
    startDate: '2026-03-28',
    endDate: '2026-03-28',
    startTime: '00:00',
    endTime: '06:00',
    _sourceType: 'schedule',
    timeFlags: {
      start: { source: 'explicit', evidence: 'Age 0 - 6 Hunt 11 - 11:30' },
      end: {
        source: 'explicit',
        toClose: false,
        evidence: 'Age 0 - 6 Hunt 11 - 11:30',
      },
    },
  });

  const preview = previewDuplicateMerge({
    existingEvent,
    incomingEvent,
    venue,
  });

  assert.equal(preview.updates.startTime, undefined);
  assert.equal(preview.updates.endTime, undefined);
  assert.equal(preview.timeImproved, false);
});
