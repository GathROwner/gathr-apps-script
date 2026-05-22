import test from 'node:test';
import assert from 'node:assert/strict';

import { previewDuplicateMerge, resolveFacebookEventEndDateTime } from './rowProcessor.js';
import { EventData, RawRowData, VenueData } from '../types/index.js';

function buildVenue(): VenueData {
  return {
    id: 'slug_eastlinkctrpei',
    name: 'Eastlink Centre PEI',
    normalizedName: 'eastlink centre pei',
    address: '46 Kensington Rd',
    latitude: 0,
    longitude: 0,
  };
}

function buildEvent(overrides: Partial<EventData> & { _sourceType?: string } = {}): EventData {
  const event: EventData & { _sourceType?: string } = {
    uniqueId: '1417477513069821',
    establishment: 'Eastlink Centre PEI',
    venueId: 'slug_eastlinkctrpei',
    eventType: 'special_event',
    eventName: 'Charlottetown Food Truck Festival',
    name: 'Charlottetown Food Truck Festival',
    description: 'Food truck festival',
    category: 'Family Friendly',
    isEvent: 'Yes',
    isFoodSpecial: 'No',
    startDate: '2026-05-22',
    endDate: '2026-05-22',
    startTime: '12:00',
    endTime: '',
    isRecurring: false,
    recurringPattern: 'none',
    ...overrides,
  };

  if (Object.prototype.hasOwnProperty.call(overrides, '_sourceType')) {
    event._sourceType = overrides._sourceType;
  }

  return event as EventData;
}

function buildRawRow(text: string): RawRowData {
  return {
    uniqueId: '1417477513069821',
    text,
    sharedPostText: 'Charlottetown Food Truck Festival',
    mediaUrls: [],
    userName: 'Eastlink Centre PEI',
    pageName: 'Eastlink Centre PEI',
    timestamp: '2026-05-22T15:00:00.000Z',
    utcStartDate: '2026-05-22T15:00:00.000Z',
    sourceScraperType: 'events',
  };
}

test('resolves a Facebook Events explicit multi-day range from the structured When text', () => {
  const result = resolveFacebookEventEndDateTime(
    buildRawRow('When: May 22 at 12:00\u202fPM \u2013 May 23 at 8:00\u202fPM ADT\nDuration: 2 days'),
    { date: '2026-05-22', time: '12:00' }
  );

  assert.equal(result?.source, 'dateTimeSentence');
  assert.equal(result?.endDate, '2026-05-23');
  assert.equal(result?.endTime, '20:00');
});

test('uses Facebook Events duration as a fallback when the structured When text lacks an end time', () => {
  const result = resolveFacebookEventEndDateTime(
    buildRawRow('When: Saturday, May 30, 2026 at 7:00 PM ADT\nDuration: 1 hr 30 min'),
    { date: '2026-05-30', time: '19:00' }
  );

  assert.equal(result?.source, 'duration');
  assert.equal(result?.endDate, '2026-05-30');
  assert.equal(result?.endTime, '20:30');
});

test('promotes a structured Facebook Events end date and end time over an older single-day keeper', () => {
  const preview = previewDuplicateMerge({
    existingEvent: buildEvent(),
    incomingEvent: buildEvent({
      endDate: '2026-05-23',
      endTime: '20:00',
      timeFlags: {
        start: { source: 'explicit', evidence: 'UTC start: 2026-05-22T15:00:00.000Z' },
        end: {
          source: 'explicit',
          toClose: false,
          evidence: 'When: May 22 at 12:00 PM - May 23 at 8:00 PM ADT',
        },
      },
      timeResolution: {
        hoursUsed: false,
        startFromFacebookEvent: true,
        endFromFacebookEvent: 'dateTimeSentence',
      },
      _sourceType: 'facebook_events_scraper_structured_row',
    }),
    venue: buildVenue(),
  });

  assert.equal(preview.updates.endDate, '2026-05-23');
  assert.equal(preview.updates.endTime, '20:00');
  assert.ok(preview.changedFields.includes('endDate'));
  assert.ok(preview.changedFields.includes('endTime'));
});
