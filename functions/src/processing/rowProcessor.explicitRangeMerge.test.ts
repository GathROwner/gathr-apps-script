import test from 'node:test';
import assert from 'node:assert/strict';

import { previewDuplicateMerge } from './rowProcessor.js';
import { EventData, VenueData } from '../types/index.js';

function buildVenue(): VenueData {
  return {
    id: 'venue_buenos',
    name: 'Buenos Island Studio',
    normalizedName: 'buenos island studio',
    address: '135 Great George St',
    latitude: 0,
    longitude: 0,
  };
}

function buildEvent(overrides: Partial<EventData> & { _sourceType?: string } = {}): EventData {
  const event: EventData & { _sourceType?: string } = {
    uniqueId: '122131955871035455_1',
    establishment: 'Buenos Island Studio',
    venueId: 'venue_buenos',
    eventType: 'workshops_classes',
    eventName: 'Schedule Item',
    name: 'Schedule Item',
    description: '',
    category: 'Workshops & Classes',
    isEvent: 'Yes',
    isFoodSpecial: 'No',
    startDate: '2026-04-18',
    endDate: '2026-04-18',
    startTime: '18:00',
    endTime: '19:00',
    isRecurring: false,
    recurringPattern: 'none',
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

test('updates stale end time when explicit schedule evidence uses a bare range like 6-7:30', () => {
  const venue = buildVenue();
  const existingEvent = buildEvent({
    uniqueId: '122131955871035455_4',
    eventName: 'Salsa Bachata w/BIPOC',
    name: 'Salsa Bachata w/BIPOC',
    description: '6-7:30; with USHR; SOLD OUT',
    startTime: '18:00',
    endTime: '19:00',
    timeFlags: {
      start: { source: 'explicit', evidence: '6-7:30' },
      end: { source: 'explicit', toClose: false, evidence: '6-7:30' },
    },
  });

  const incomingEvent = buildEvent({
    uniqueId: '122131955871035455_4',
    eventName: 'Salsa Bachata w/BIPOC USHR',
    name: 'Salsa Bachata w/BIPOC USHR',
    description: 'SOLD OUT',
    startTime: '18:00',
    endTime: '19:30',
    timeFlags: {
      start: { source: 'explicit', evidence: '6-7:30' },
      end: { source: 'explicit', toClose: false, evidence: '6-7:30' },
    },
    _sourceType: 'schedule',
  });

  const preview = previewDuplicateMerge({
    existingEvent,
    incomingEvent,
    venue,
  });

  assert.equal(preview.updates.startTime, undefined);
  assert.equal(preview.updates.endTime, '19:30');
  assert.ok(preview.changedFields.includes('endTime'));
});

test('uses a single explicit range in the existing description when the keeper lacks usable timeFlags', () => {
  const venue = buildVenue();
  const existingEvent = buildEvent({
    uniqueId: '122131955871035455_3',
    eventName: 'Runway & Posing Workshop',
    name: 'Runway & Posing Workshop',
    description: '2:30-5:30; with Soli Coaching',
    startTime: '14:00',
    endTime: '17:00',
    timeFlags: undefined,
  });

  const incomingEvent = buildEvent({
    uniqueId: '122131955871035455_3',
    eventName: 'Runway & Posing Workshop with Soli Coaching',
    name: 'Runway & Posing Workshop with Soli Coaching',
    description: 'RUNWAY&POSING',
    startTime: '14:30',
    endTime: '17:30',
    timeFlags: {
      start: { source: 'explicit', evidence: '2:30-5:30' },
      end: { source: 'explicit', toClose: false, evidence: '2:30-5:30' },
    },
    _sourceType: 'schedule',
  });

  const preview = previewDuplicateMerge({
    existingEvent,
    incomingEvent,
    venue,
  });

  assert.equal(preview.updates.startTime, '14:30');
  assert.equal(preview.updates.endTime, '17:30');
  assert.deepEqual(preview.updates.timeFlags, incomingEvent.timeFlags);
  assert.ok(preview.changedFields.includes('startTime'));
  assert.ok(preview.changedFields.includes('endTime'));
});

test('does not use vague descriptions as synthetic schedule evidence', () => {
  const venue = buildVenue();
  const existingEvent = buildEvent({
    uniqueId: '122131955871035455_3',
    eventName: 'Runway & Posing Workshop',
    name: 'Runway & Posing Workshop',
    description: 'Afternoon session with Soli Coaching',
    startTime: '14:00',
    endTime: '17:00',
    timeFlags: undefined,
  });

  const incomingEvent = buildEvent({
    uniqueId: '122131955871035455_3',
    eventName: 'Runway & Posing Workshop with Soli Coaching',
    name: 'Runway & Posing Workshop with Soli Coaching',
    description: 'RUNWAY&POSING',
    startTime: '14:30',
    endTime: '17:30',
    timeFlags: {
      start: { source: 'explicit', evidence: '2:30-5:30' },
      end: { source: 'explicit', toClose: false, evidence: '2:30-5:30' },
    },
    _sourceType: 'schedule',
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
