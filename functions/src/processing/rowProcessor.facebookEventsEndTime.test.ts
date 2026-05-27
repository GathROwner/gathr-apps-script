import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getCityLevelFacebookEventLocationDetails,
  isCityLevelFacebookEventLocation,
  previewDuplicateMerge,
  resolveEventAddressForVenue,
  resolveFacebookEventEndDateTime,
  resolveFacebookEventRecurrence,
} from './rowProcessor.js';
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

test('uses the resolved venue address when an event-specific venue differs from the source row page', () => {
  const result = resolveEventAddressForVenue({
    itemAddress: '125 Heather Moyse Dr, Summerside, PE C1N 5Y8, Canada',
    rowAddress: '125 Heather Moyse Drive, Summerside, PE C1N 5Y8, Canada',
    venueAddress: '192 Water St, Summerside, PE C1N 1B1',
    rowEstablishment: 'Downtown Summerside',
    canonicalVenueName: 'Evermoore Brewing Co.',
  });

  assert.equal(result, '192 Water St, Summerside, PE C1N 1B1');
});

test('uses the resolved venue address when selected-row replay overrides the row establishment', () => {
  const result = resolveEventAddressForVenue({
    itemAddress: '57 Bunbury Road, Stratford, PE, Canada',
    rowAddress: '57 Bunbury Road, Stratford, PE, Canada',
    venueAddress: '234 Shakespeare Drive, Stratford, PE C1B 2V8',
    rowEstablishment: 'Stratford Town Centre Gymnasium',
    canonicalVenueName: 'Stratford Town Centre',
  });

  assert.equal(result, '234 Shakespeare Drive, Stratford, PE C1B 2V8');
});

test('uses the resolved venue address when the item names a known venue alias but carries a source-page address', () => {
  const result = resolveEventAddressForVenue({
    itemAddress: '1 Weymouth Street, Charlottetown, PE, Canada, C1A7M8',
    rowAddress: '',
    venueAddress: '2 Pownal Street 2nd Floor, Charlottetown, PE, Canada, Prince Edward Island',
    rowEstablishment: 'Downtown Charlottetown Inc',
    canonicalVenueName: 'Salt & Sol Restaurant and Lounge | Charlottetown PE',
    itemVenueName: 'Salt & Soul',
    venueAliases: ['Salt & Soul'],
  });

  assert.equal(result, '2 Pownal Street 2nd Floor, Charlottetown, PE, Canada, Prince Edward Island');
});

test('duplicate merge replaces stale source-page address with resolved venue address', () => {
  const venue = {
    id: 'slug_saltandsolpei',
    name: 'Salt & Sol Restaurant and Lounge | Charlottetown PE',
    normalizedName: 'salt sol restaurant and lounge charlottetown pe',
    address: '2 Pownal Street 2nd Floor, Charlottetown, PE, Canada, Prince Edward Island',
    aliases: ['Salt & Soul'],
    latitude: 46.232,
    longitude: -63.126,
  } as VenueData;
  const existing = buildEvent({
    venueId: venue.id,
    establishment: venue.name,
    address: '1 Weymouth Street, Charlottetown, PE, Canada, C1A7M8',
    additionalLocation: 'Salt & Soul',
  });
  const incoming = buildEvent({
    venueId: venue.id,
    establishment: venue.name,
    address: venue.address,
    additionalLocation: undefined,
    latitude: venue.latitude,
    longitude: venue.longitude,
  });

  const result = previewDuplicateMerge({ existingEvent: existing, incomingEvent: incoming, venue });

  assert.equal(result.updates.address, venue.address);
  assert.equal(result.updates.additionalLocation, '');
  assert.equal(result.updates.latitude, venue.latitude);
  assert.equal(result.updates.longitude, venue.longitude);
});

test('duplicate merge keeps sub-location aliases like gymnasium labels', () => {
  const venue = {
    id: '31MHpCb7juuQkKD5N98q',
    name: 'Stratford Town Centre',
    normalizedName: 'stratford town centre',
    address: '234 Shakespeare Drive, Stratford, PE C1B 2V8',
    aliases: ['Stratford Town Centre Gymnasium'],
  } as VenueData;
  const existing = buildEvent({
    venueId: venue.id,
    establishment: venue.name,
    address: venue.address,
    additionalLocation: 'Stratford Town Centre Gymnasium',
  });
  const incoming = buildEvent({
    venueId: venue.id,
    establishment: venue.name,
    address: venue.address,
    additionalLocation: undefined,
  });

  const result = previewDuplicateMerge({ existingEvent: existing, incomingEvent: incoming, venue });

  assert.equal(result.updates.additionalLocation, undefined);
});

test('keeps an explicit event address when it does not look like the source row page address', () => {
  const result = resolveEventAddressForVenue({
    itemAddress: '192 Water St, Summerside, PE C1N 1B1',
    rowAddress: '125 Heather Moyse Drive, Summerside, PE C1N 5Y8, Canada',
    venueAddress: '200 Water St, Summerside, PE',
    rowEstablishment: 'Downtown Summerside',
    canonicalVenueName: 'Evermoore Brewing Co.',
  });

  assert.equal(result, '192 Water St, Summerside, PE C1N 1B1');
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

test('resolves Facebook Events day-month end dates like 7 Jun', () => {
  const result = resolveFacebookEventEndDateTime(
    buildRawRow('When: 5 Jun at 17:00 - 7 Jun at 15:00 ADT\nDuration: 2 days'),
    { date: '2026-06-05', time: '17:00' }
  );

  assert.equal(result?.source, 'dateTimeSentence');
  assert.equal(result?.endDate, '2026-06-07');
  assert.equal(result?.endTime, '15:00');
});

test('detects multi-week Facebook Events class recurrence from description text', () => {
  const row = buildRawRow(
    'When: Wednesday, May 27, 2026 at 6:15 PM - 7:15 PM ADT\n' +
      'Description:\n' +
      "These classes take place at the Carrefour de L'Ile St. Jean at 5 Acadian Drive, Charlottetown on Monday and Wednesday nights from 6:15 to 7:15\n\n" +
      'Winter session March 16th to April 8th, 2026\n' +
      'Spring session April 13th to June 3rd, 2026'
  );
  row.facebookEventDescription =
    "These classes take place at the Carrefour de L'Ile St. Jean at 5 Acadian Drive, Charlottetown on Monday and Wednesday nights from 6:15 to 7:15\n\n" +
    'Winter session March 16th to April 8th, 2026\n' +
    'Spring session April 13th to June 3rd, 2026';

  const result = resolveFacebookEventRecurrence(row, { date: '2026-05-27', time: '18:15' });

  assert.equal(result?.isRecurring, true);
  assert.equal(result?.recurringPattern, 'weekly_custom');
  assert.deepEqual(result?.recurringDaysOfWeek, ['monday', 'wednesday']);
  assert.equal(result?.recurringWeekInterval, 1);
  assert.equal(result?.totalOccurrences, 3);
  assert.equal(result?.recurrenceUntilDate, '2026-06-03');
});

test('counts Facebook Events recurrence occurrences from the current occurrence forward', () => {
  const row = buildRawRow(
    'When: Monday, May 25, 2026 at 6:15 PM - 7:15 PM ADT\n' +
      'Description:\n' +
      "These classes take place at the Carrefour de L'Ile St. Jean at 5 Acadian Drive, Charlottetown on Monday and Wednesday nights from 6:15 to 7:15\n\n" +
      'Spring session April 13th to June 3rd, 2026'
  );
  row.facebookEventDescription =
    "These classes take place at the Carrefour de L'Ile St. Jean at 5 Acadian Drive, Charlottetown on Monday and Wednesday nights from 6:15 to 7:15\n\n" +
    'Spring session April 13th to June 3rd, 2026';

  const result = resolveFacebookEventRecurrence(row, { date: '2026-05-25', time: '18:15' });

  assert.equal(result?.totalOccurrences, 4);
  assert.equal(result?.recurrenceUntilDate, '2026-06-03');
});

test('detects every-second Friday Facebook Events recurrence from description text', () => {
  const row = buildRawRow(
    'When: Friday, May 29, 2026 at 8:00 PM - 11:00 PM ADT\n' +
      'Description:\n' +
      'We are excited to announce that starting Friday, May 29th and every second Friday unless otherwise stated we will be hosting a ladies and femme night.'
  );
  row.facebookEventDescription =
    'We are excited to announce that starting Friday, May 29th and every second Friday unless otherwise stated we will be hosting a ladies and femme night.';

  const result = resolveFacebookEventRecurrence(row, { date: '2026-05-29', time: '20:00' });

  assert.equal(result?.isRecurring, true);
  assert.equal(result?.recurringPattern, 'weekly_friday');
  assert.equal(result?.recurringWeekInterval, 2);
});

test('promotes structured Facebook Events biweekly interval through duplicate merge', () => {
  const preview = previewDuplicateMerge({
    existingEvent: buildEvent({
      eventName: 'Ladies and Femmes Night',
      name: 'Ladies and Femmes Night',
      isRecurring: false,
      recurringPattern: 'none',
      recurringWeekInterval: 1,
    }),
    incomingEvent: buildEvent({
      eventName: 'Ladies and Femmes Night',
      name: 'Ladies and Femmes Night',
      isRecurring: true,
      recurringPattern: 'weekly_friday',
      recurringWeekInterval: 2,
      _sourceType: 'facebook_events_scraper_structured_row',
    }),
    venue: buildVenue(),
  });

  assert.equal(preview.updates.recurringPattern, 'weekly_friday');
  assert.equal(preview.updates.recurringWeekInterval, 2);
  assert.equal(preview.updates.isRecurring, true);
  assert.ok(preview.changedFields.includes('recurringWeekInterval'));
});

test('does not infer recurrence from a single Facebook Events date range without weekday series cues', () => {
  const row = buildRawRow(
    'When: Saturday, May 30, 2026 at 1:00 PM - 4:00 PM ADT\n' +
      'Description:\n' +
      'Date: Saturday, May 30, 2026\nTime: 1 - 4 p.m.\nLocation: Victoria Park Cultural Pavillion'
  );
  row.facebookEventDescription =
    'Date: Saturday, May 30, 2026\nTime: 1 - 4 p.m.\nLocation: Victoria Park Cultural Pavillion';

  const result = resolveFacebookEventRecurrence(row, { date: '2026-05-30', time: '13:00' });

  assert.equal(result, null);
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

test('keeps structured Facebook Events managed media and canonical image fields aligned', () => {
  const oldImage =
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/old-goju.webp';
  const newImage =
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/new-goju.webp';

  const preview = previewDuplicateMerge({
    existingEvent: buildEvent({
      uniqueId: '1552494202718548_1',
      image: oldImage,
      imageUrl: oldImage,
      relevantImageUrl: oldImage,
      mediaUrls: [oldImage],
      sourceContentSignature: 'old-signature',
      isRecurring: true,
      recurringPattern: 'weekly_custom',
      recurringDaysOfWeek: ['monday', 'wednesday'],
      totalOccurrences: 4,
      recurrenceUntilDate: '2026-06-03',
    }),
    incomingEvent: buildEvent({
      uniqueId: '1552494199385215_1',
      image: newImage,
      imageUrl: newImage,
      relevantImageUrl: newImage,
      mediaUrls: [newImage],
      sourceContentSignature: 'new-signature',
      isRecurring: true,
      recurringPattern: 'weekly_custom',
      recurringDaysOfWeek: ['monday', 'wednesday'],
      totalOccurrences: 3,
      recurrenceUntilDate: '2026-06-03',
      _sourceType: 'facebook_events_scraper_structured_row',
    }),
    venue: buildVenue(),
  });

  assert.deepEqual(preview.updates.mediaUrls, [newImage]);
  assert.equal(preview.updates.image, newImage);
  assert.equal(preview.updates.imageUrl, newImage);
  assert.equal(preview.updates.relevantImageUrl, newImage);
  assert.ok(preview.changedFields.includes('mediaUrls'));
  assert.ok(preview.changedFields.includes('image'));
  assert.ok(preview.changedFields.includes('imageUrl'));
  assert.ok(preview.changedFields.includes('relevantImageUrl'));
});

test('routes explicit Downtown Charlottetown Facebook location as area review', () => {
  const row = buildRawRow('Location: Downtown Charlottetown');
  row.userName = 'Downtown Charlottetown';
  row.facebookEventLocationName = 'Downtown Charlottetown';
  row.facebookEventOrganizerName = "Suzanne Scott - The Potter's Daughter";
  row.facebookEventLocationIsCityLevel = true;

  assert.equal(isCityLevelFacebookEventLocation(row), true);
  assert.deepEqual(getCityLevelFacebookEventLocationDetails(row), {
    locationScope: 'area',
    locationLabel: 'Downtown Charlottetown',
    locationCity: 'Charlottetown',
    locationProvince: 'PEI',
    locationPrecision: 'approximate',
  });
});

test('does not treat Downtown Charlottetown Inc organizer/page text as an area venue', () => {
  const organizerOnlyRow = buildRawRow('Organizer: Downtown Charlottetown Inc.');
  organizerOnlyRow.userName = 'Downtown Charlottetown Inc.';
  organizerOnlyRow.facebookEventOrganizerName = 'Downtown Charlottetown Inc.';
  organizerOnlyRow.facebookEventLocationName = undefined;
  organizerOnlyRow.facebookEventLocationIsCityLevel = false;

  assert.equal(isCityLevelFacebookEventLocation(organizerOnlyRow), false);

  const pageLocationRow = buildRawRow('Location: Downtown Charlottetown Inc.');
  pageLocationRow.userName = 'Downtown Charlottetown Inc.';
  pageLocationRow.facebookEventLocationName = 'Downtown Charlottetown Inc.';
  pageLocationRow.facebookEventOrganizerName = 'Downtown Charlottetown Inc.';
  pageLocationRow.facebookEventLocationIsCityLevel = false;

  assert.equal(isCityLevelFacebookEventLocation(pageLocationRow), false);
});
