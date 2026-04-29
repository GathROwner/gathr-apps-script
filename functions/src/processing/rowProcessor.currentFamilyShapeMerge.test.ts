import test from 'node:test';
import assert from 'node:assert/strict';

import { previewDuplicateMerge } from './rowProcessor.js';
import { EventData, VenueData } from '../types/index.js';

function buildVenue(): VenueData {
  return {
    id: 'venue_cork_cast',
    name: 'The Cork & Cast',
    normalizedName: 'the cork cast',
    address: '146 Richmond St',
    latitude: 0,
    longitude: 0,
  };
}

function buildEvent(overrides: Partial<EventData> = {}): EventData {
  return {
    uniqueId: '1512448494213603_2',
    establishment: 'The Cork & Cast',
    venueId: 'venue_cork_cast',
    eventType: 'food_special',
    eventName: 'Two Can Dine for $70',
    name: 'Two Can Dine for $70',
    description:
      'Two Can Dine for $70 + HST — Tuesday, March 24 – Saturday, March 28 | 4–9 PM. Enjoy a shareable appetizer, two mains, and a dessert to share.',
    category: 'Food Special',
    isEvent: 'No',
    isFoodSpecial: 'Yes',
    startDate: '2026-03-24',
    endDate: '2026-03-24',
    startTime: '16:00',
    endTime: '21:00',
    isRecurring: true,
    recurringPattern: 'weekly_tuesday',
    sourceTimestamp: new Date('2026-04-13T20:26:50.000Z'),
    timeResolution: {
      hoursUsed: false,
    },
    timeFlags: {
      start: { source: 'explicit', evidence: '4–9 PM' },
      end: { source: 'explicit', toClose: false, evidence: '4–9 PM' },
    },
    ...overrides,
  };
}

test('promotes the authoritative current family shape for a newer Two Can Dine-style keeper', () => {
  const preview = previewDuplicateMerge({
    venue: buildVenue(),
    existingEvent: buildEvent(),
    incomingEvent: buildEvent({
      uniqueId: '1531052469019872',
      eventName: 'Two Can Dine',
      name: 'Two Can Dine',
      description:
        'Enjoy our Two Can Dine for $70 (+HST). Includes: 1 shareable appetizer, 2 mains, 1 shareable dessert. Available Tuesday, April 14 – Sunday, April 19 from 4–9PM.',
      startDate: '2026-04-14',
      endDate: '2026-04-19',
      isRecurring: false,
      recurringPattern: 'none',
      sourceTimestamp: new Date('2026-04-13T20:26:50.000Z'),
      timeResolution: {
        hoursUsed: true,
        startFromHours: true,
        endFromHours: true,
      },
      timeFlags: {
        start: { source: 'hours', evidence: '4-9PM' },
        end: { source: 'hours', toClose: false, evidence: '4-9PM' },
      },
    }),
  });

  assert.equal(preview.updates.eventName, 'Two Can Dine');
  assert.equal(preview.updates.name, 'Two Can Dine');
  assert.equal(
    preview.updates.description,
    'Enjoy our Two Can Dine for $70 (+HST). Includes: 1 shareable appetizer, 2 mains, 1 shareable dessert. Available Tuesday, April 14 – Sunday, April 19 from 4–9PM.'
  );
  assert.equal(preview.updates.startDate, '2026-04-14');
  assert.equal(preview.updates.endDate, '2026-04-19');
  assert.equal(preview.updates.isRecurring, false);
  assert.equal(preview.updates.recurringPattern, 'none');
  assert.equal(preview.updates.timeResolution, undefined);
  assert.equal(preview.updates.timeFlags, undefined);
  assert.equal(preview.timeImproved, false);
});

test('does not promote title or date span for a similar but different family', () => {
  const preview = previewDuplicateMerge({
    venue: buildVenue(),
    existingEvent: buildEvent(),
    incomingEvent: buildEvent({
      uniqueId: 'different_family_1',
      eventName: 'Dessert Board for Two',
      name: 'Dessert Board for Two',
      description:
        'Dessert Board for Two. Available Tuesday, April 14 – Sunday, April 19 from 4–9PM.',
      startDate: '2026-04-14',
      endDate: '2026-04-19',
      isRecurring: false,
      recurringPattern: 'none',
      sourceTimestamp: new Date('2026-04-13T20:26:50.000Z'),
    }),
  });

  assert.equal(preview.updates.eventName, undefined);
  assert.equal(preview.updates.name, undefined);
  assert.equal(preview.updates.startDate, undefined);
  assert.equal(preview.updates.endDate, undefined);
});

test('does not promote short generic title overlaps into a different family shape', () => {
  const preview = previewDuplicateMerge({
    venue: buildVenue(),
    existingEvent: buildEvent({
      eventName: 'Happy Hour',
      name: 'Happy Hour',
      description: 'Happy Hour every Tuesday from 4-9PM.',
    }),
    incomingEvent: buildEvent({
      uniqueId: 'generic_overlap_1',
      eventName: 'Happy Hour Karaoke',
      name: 'Happy Hour Karaoke',
      description: 'Happy Hour Karaoke runs Tuesday, April 14 - Sunday, April 19 from 4-9PM.',
      startDate: '2026-04-14',
      endDate: '2026-04-19',
      isRecurring: false,
      recurringPattern: 'none',
      sourceTimestamp: new Date('2026-04-13T20:26:50.000Z'),
    }),
  });

  assert.equal(preview.updates.eventName, undefined);
  assert.equal(preview.updates.name, undefined);
  assert.equal(preview.updates.startDate, undefined);
  assert.equal(preview.updates.endDate, undefined);
});

test('does not let an older incoming family shape replace the current keeper title or dates', () => {
  const preview = previewDuplicateMerge({
    venue: buildVenue(),
    existingEvent: buildEvent({
      sourceTimestamp: new Date('2026-04-13T20:26:50.000Z'),
    }),
    incomingEvent: buildEvent({
      uniqueId: 'older_family_shape_1',
      eventName: 'Two Can Dine',
      name: 'Two Can Dine',
      description:
        'Enjoy our Two Can Dine for $70 (+HST). Available Tuesday, March 10 – Sunday, March 15 from 4–9PM.',
      startDate: '2026-03-10',
      endDate: '2026-03-15',
      isRecurring: false,
      recurringPattern: 'none',
      sourceTimestamp: new Date('2026-03-09T20:26:50.000Z'),
    }),
  });

  assert.equal(preview.updates.eventName, undefined);
  assert.equal(preview.updates.name, undefined);
  assert.equal(preview.updates.startDate, undefined);
  assert.equal(preview.updates.endDate, undefined);
});
