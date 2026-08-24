import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getCityLevelFacebookEventLocationDetails,
  isCityLevelFacebookEventLocation,
  previewDuplicateMerge,
  resolveEventAddressForVenue,
  resolveEventCoordinatesForVenue,
  resolveFacebookEventEndDateTime,
  resolveFacebookEventRecurrence,
  resolveFullParserEventImageUrls,
  resolvePostDerivedCityLevelEventLocation,
} from './rowProcessor.js';
import { EventData, RawRowData, VenueData } from '../types/index.js';
import { FAMILY_FRIENDLY_SCORING_VERSION } from '../utils/familyFriendlyScoring.js';

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

test('uses the Highland Storm venue address when a Holmans source-page address leaks into the parsed item', () => {
  const result = resolveEventAddressForVenue({
    itemAddress: '286 Fitzroy Street, Summerside, PE C1N 1J2, Canada',
    rowAddress: '',
    sourceVenueAddress: '286 Fitzroy Street, Summerside, PE C1N 1J2, Canada',
    sourceVenueId: 'slug_holmansicecream',
    resolvedVenueId: 'slug_thescottmacaulayperformingartscentre',
    venueAddress: '619 Water Street East, Summerside, PE C1N 4H8, Canada',
    rowEstablishment: "Holman's Ice Cream Parlour",
    canonicalVenueName: 'The Scott MacAulay Performing Arts Centre at the College of Piping | Summerside PE',
    itemVenueName: 'The Scott MacAulay Performing Arts Centre at the College of Piping',
    venueAliases: ['The Scott MacAulay Performing Arts Centre'],
  });

  assert.equal(result, '619 Water Street East, Summerside, PE C1N 4H8, Canada');
});

test('uses target venue coordinates whenever its address replaces source-page metadata', () => {
  const result = resolveEventCoordinatesForVenue({
    usesVenueAddress: true,
    itemLatitude: 46.393003,
    itemLongitude: -63.7915259,
    venueLatitude: 46.3942715,
    venueLongitude: -63.7689742,
  });

  assert.deepEqual(result, {
    latitude: 46.3942715,
    longitude: -63.7689742,
  });
});

test('keeps item coordinates when a distinct explicit event address is retained', () => {
  const result = resolveEventCoordinatesForVenue({
    usesVenueAddress: false,
    itemLatitude: 46.391,
    itemLongitude: -63.79,
    venueLatitude: 46.3942715,
    venueLongitude: -63.7689742,
  });

  assert.deepEqual(result, {
    latitude: 46.391,
    longitude: -63.79,
  });
});

test('keeps a distinct explicit event address when it is not the source venue address', () => {
  const result = resolveEventAddressForVenue({
    itemAddress: '192 Water St, Summerside, PE C1N 1B1',
    rowAddress: '',
    sourceVenueAddress: '286 Fitzroy Street, Summerside, PE C1N 1J2, Canada',
    sourceVenueId: 'slug_holmansicecream',
    resolvedVenueId: 'slug_thescottmacaulayperformingartscentre',
    venueAddress: '619 Water Street East, Summerside, PE C1N 4H8, Canada',
    rowEstablishment: "Holman's Ice Cream Parlour",
    canonicalVenueName: 'The Scott MacAulay Performing Arts Centre at the College of Piping',
    itemVenueName: 'Temporary off-site stage',
  });

  assert.equal(result, '192 Water St, Summerside, PE C1N 1B1');
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
      imageProvenance: {
        version: 1,
        primarySource: 'post_media',
        primaryField: 'image',
        primaryUrl: newImage,
        isFallback: false,
        selectionReason: 'facebook_events_scraper_media_upload',
        updatedBy: 'structured_facebook_event_adapter',
      },
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
  assert.equal(preview.updates.imageProvenance?.primarySource, 'post_media');
  assert.equal(preview.updates.imageProvenance?.primaryUrl, newImage);
  assert.equal(preview.updates.imageProvenance?.updatedBy, 'duplicate_merge');
  assert.ok(preview.changedFields.includes('mediaUrls'));
  assert.ok(preview.changedFields.includes('image'));
  assert.ok(preview.changedFields.includes('imageUrl'));
  assert.ok(preview.changedFields.includes('relevantImageUrl'));
  assert.ok(preview.changedFields.includes('imageProvenance'));
});

test('full parser events use the model-selected relevant image as the card image', () => {
  const postDefaultImage =
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/founders-post-default.webp';
  const wellnessImage =
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/wellness-waterfront.webp';

  const resolved = resolveFullParserEventImageUrls({
    image: postDefaultImage,
    relevantImageUrl: wellnessImage,
    mediaUrls: [postDefaultImage, wellnessImage],
  });

  assert.equal(resolved.image, wellnessImage);
  assert.equal(resolved.imageUrl, wellnessImage);
  assert.equal(resolved.relevantImageUrl, wellnessImage);
});

test('backfills image provenance when duplicate merge re-sees a legacy event', () => {
  const image =
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/under-spire.webp';

  const preview = previewDuplicateMerge({
    existingEvent: buildEvent({
      image,
      imageUrl: image,
      relevantImageUrl: image,
      mediaUrls: [image],
    }),
    incomingEvent: buildEvent({
      image,
      imageUrl: image,
      relevantImageUrl: image,
      mediaUrls: [image],
      imageProvenance: {
        version: 1,
        primarySource: 'post_media',
        primaryField: 'relevantImageUrl',
        primaryUrl: image,
        isFallback: false,
        selectionReason: 'full_parser_event_media',
        updatedBy: 'parser',
      },
    }),
    venue: buildVenue(),
  });

  assert.equal(preview.updates.image, undefined);
  assert.equal(preview.updates.imageUrl, undefined);
  assert.equal(preview.updates.relevantImageUrl, undefined);
  assert.equal(preview.updates.imageProvenance?.primarySource, 'post_media');
  assert.equal(preview.updates.imageProvenance?.primaryUrl, image);
  assert.equal(preview.updates.imageProvenance?.updatedBy, 'duplicate_merge');
  assert.ok(preview.changedFields.includes('imageProvenance'));
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

test('duplicate merge backfills family-friendly scoring from merged event content', () => {
  const venue = buildVenue();
  const existing = buildEvent({
    category: 'Live Music',
    eventName: 'All Ages Summer Concert',
    name: 'All Ages Summer Concert',
    description: 'Suitable for all ages.',
    familyFriendlyScore: undefined,
    familyFriendlyLevel: undefined,
    familyFriendlyReasons: undefined,
    familyFriendlyScoringVersion: undefined,
  });
  const incoming = buildEvent({
    category: 'Live Music',
    eventName: 'All Ages Summer Concert',
    name: 'All Ages Summer Concert',
    description: 'Suitable for all ages.',
  });

  const result = previewDuplicateMerge({ existingEvent: existing, incomingEvent: incoming, venue });

  assert.equal(Number(result.updates.familyFriendlyScore) >= 60, true);
  assert.equal(result.updates.familyFriendlyLevel, 'high');
  assert.equal(result.updates.familyFriendlyScoringVersion, FAMILY_FRIENDLY_SCORING_VERSION);
});

test('routes explicit Downtown Summerside Facebook location as area review', () => {
  const row = buildRawRow('Location: Downtown Summerside, PEI (Water Street)');
  row.userName = 'Downtown Summerside';
  row.facebookEventLocationName = 'Downtown Summerside, PEI (Water Street)';
  row.facebookEventOrganizerName = 'Downtown Summerside';
  row.facebookEventLocationIsCityLevel = false;

  assert.equal(isCityLevelFacebookEventLocation(row), true);
  assert.deepEqual(getCityLevelFacebookEventLocationDetails(row), {
    locationScope: 'area',
    locationLabel: 'Downtown Summerside',
    locationCity: 'Summerside',
    locationProvince: 'PEI',
    locationPrecision: 'approximate',
  });
});

test('routes post-derived Downtown Summerside location to area review metadata', () => {
  const row = buildRawRow('Classic Car Night on Water Street in Downtown Summerside.');
  row.sourceScraperType = 'posts';
  row.userName = 'Downtown Summerside';
  row.pageName = 'Downtown Summerside';
  row.facebookEventLocationName = undefined;
  row.facebookEventLocationIsCityLevel = false;
  row.sharedPostText = 'Classic Car Night';

  const result = resolvePostDerivedCityLevelEventLocation({
    row,
    establishment: 'Downtown Summerside',
    item: {
      name: 'Classic Car Night',
      venue: 'Downtown Summerside, PEI (Water Street)',
      startDate: '2026-07-25',
      startTime: '18:00',
      description: 'Classic Car Night on Water Street.',
    },
  });

  assert.deepEqual(result, {
    locationScope: 'area',
    locationLabel: 'Downtown Summerside',
    locationCity: 'Summerside',
    locationProvince: 'PEI',
    locationPrecision: 'approximate',
    observedLocationName: 'Downtown Summerside, PEI (Water Street)',
    autoPublishReviewReasons: ['post_derived_area_candidate'],
    detectionSource: 'item_venue',
  });
});

test('routes post-derived Charlottetown Busker Festival to downtown area review metadata', () => {
  const row = buildRawRow('Charlottetown Busker Festival returns downtown this summer.');
  row.sourceScraperType = 'posts';
  row.userName = 'Charlottetown Busker Festival';
  row.pageName = 'Charlottetown Busker Festival';
  row.facebookEventLocationName = undefined;
  row.facebookEventLocationIsCityLevel = false;
  row.sharedPostText = 'Charlottetown Busker Festival';

  const result = resolvePostDerivedCityLevelEventLocation({
    row,
    establishment: 'Charlottetown Busker Festival',
    item: {
      name: 'Charlottetown Busker Festival',
      startDate: '2026-07-31',
      startTime: '12:00',
      description: 'Performances throughout downtown Charlottetown.',
    },
  });

  assert.deepEqual(result, {
    locationScope: 'area',
    locationLabel: 'Downtown Charlottetown',
    locationCity: 'Charlottetown',
    locationProvince: 'PEI',
    locationPrecision: 'approximate',
    observedLocationName: 'Charlottetown Busker Festival',
    autoPublishReviewReasons: ['post_derived_area_candidate'],
    detectionSource: 'event_text_area_hint',
  });
});

test('routes post-derived Charlottetown Busker Festival even when parser produced no final event', () => {
  const row = buildRawRow(
    "No plans for Labour Day Weekend? Charlottetown Buskerfest is back with free street performances all weekend long in downtown Charlottetown."
  );
  row.sourceScraperType = 'posts';
  row.userName = 'Charlottetown Busker Festival';
  row.pageName = 'Charlottetown Busker Festival';
  row.facebookEventLocationName = undefined;
  row.facebookEventLocationIsCityLevel = false;
  row.sharedPostText = '';

  const result = resolvePostDerivedCityLevelEventLocation({
    row,
    establishment: 'Charlottetown Busker Festival',
    item: {
      name: 'Charlottetown Busker Festival',
      description: row.text,
    },
  });

  assert.deepEqual(result, {
    locationScope: 'area',
    locationLabel: 'Downtown Charlottetown',
    locationCity: 'Charlottetown',
    locationProvince: 'PEI',
    locationPrecision: 'approximate',
    observedLocationName: 'Charlottetown Busker Festival',
    autoPublishReviewReasons: ['post_derived_area_candidate'],
    detectionSource: 'event_text_area_hint',
  });
});

test('routes post-derived province or route scope to review metadata without publish eligibility', () => {
  const row = buildRawRow('PEI Marathon route information across PEI.');
  row.sourceScraperType = 'posts';
  row.userName = 'PEI Marathon';
  row.pageName = 'PEI Marathon';
  row.facebookEventLocationName = undefined;
  row.facebookEventLocationIsCityLevel = false;
  row.sharedPostText = 'PEI Marathon';

  const result = resolvePostDerivedCityLevelEventLocation({
    row,
    establishment: 'PEI Marathon',
    item: {
      name: 'PEI Marathon',
      venue: 'PEI',
      startDate: '2026-10-18',
      startTime: '08:00',
      description: 'Marathon route across PEI.',
    },
  });

  assert.equal(result?.locationLabel, 'PEI Marathon Route');
  assert.equal(result?.locationScope, 'route');
  assert.ok(result?.autoPublishReviewReasons.includes('post_derived_area_candidate'));
  assert.ok(result?.autoPublishReviewReasons.includes('route_candidate_requires_geometry_review'));
  assert.ok(result?.autoPublishReviewReasons.includes('route_missing_explicit_stops_or_streets'));
});

test('routes post-derived route labels to review metadata instead of venue matching', () => {
  const row = buildRawRow('Community ride along Route 2.');
  row.sourceScraperType = 'posts';
  row.userName = 'Community Ride';
  row.pageName = 'Community Ride';
  row.facebookEventLocationName = undefined;
  row.facebookEventLocationIsCityLevel = false;
  row.sharedPostText = 'Community Ride';

  const result = resolvePostDerivedCityLevelEventLocation({
    row,
    establishment: 'Community Ride',
    item: {
      name: 'Community Ride',
      venue: 'Route 2, PEI',
      startDate: '2026-08-01',
      startTime: '09:00',
      description: 'Ride route along Route 2.',
    },
  });

  assert.equal(result?.locationLabel, 'Route 2, PEI');
  assert.equal(result?.locationScope, 'area');
  assert.ok(result?.autoPublishReviewReasons.includes('post_derived_area_candidate'));
  assert.ok(result?.autoPublishReviewReasons.includes('route_like_or_unsupported_location'));
});

test('does not infer a downtown area event for specific venues inside a roundup post', () => {
  const row = buildRawRow(
    "What's happening today in Downtown Charlottetown? 12:00 pm - Founders Food Hall & Market: Caitlin Alexis."
  );
  row.sourceScraperType = 'posts';
  row.userName = 'Downtown Charlottetown Inc';
  row.pageName = 'Downtown Charlottetown Inc';
  row.facebookEventLocationName = undefined;
  row.facebookEventLocationIsCityLevel = false;
  row.sharedPostText = "What's happening today in Downtown Charlottetown?";

  assert.equal(resolvePostDerivedCityLevelEventLocation({
    row,
    establishment: 'Downtown Charlottetown Inc',
    item: {
      name: 'Caitlin Alexis',
      venue: 'Founders Food Hall & Market',
      startDate: '2026-07-25',
      startTime: '12:00',
      description: 'Sounds of the Waterfront',
    },
  }), null);
});

test('does not infer downtown area from post context when item location is an explicit venue', () => {
  const row = buildRawRow(
    "What's happening today in Downtown Charlottetown? 11:00 pm - Hunter's Ale House: Mat & Adam."
  );
  row.sourceScraperType = 'posts';
  row.userName = 'Downtown Charlottetown Inc';
  row.pageName = 'Downtown Charlottetown Inc';
  row.facebookEventLocationName = undefined;
  row.facebookEventLocationIsCityLevel = false;
  row.sharedPostText = "What's happening today in Downtown Charlottetown?";

  assert.equal(resolvePostDerivedCityLevelEventLocation({
    row,
    establishment: 'Downtown Charlottetown Inc',
    item: {
      name: 'Mat & Adam',
      venue: "Hunter's Ale House",
      startDate: '2026-07-30',
      startTime: '23:00',
      description: 'Live music at Hunter’s Ale House.',
    },
  }), null);
});

test('does not infer a nearby city from a venue-like hall location', () => {
  const row = buildRawRow(
    "Back Home Tonight at Stanley Bridge Hall, a cozy Women's Institute Hall near Kensington."
  );
  row.sourceScraperType = 'posts';
  row.userName = 'Stanley Bridge Ceilidhs';
  row.pageName = 'Stanley Bridge Ceilidhs';
  row.facebookEventLocationName = undefined;
  row.facebookEventLocationIsCityLevel = false;
  row.sharedPostText = 'Back Home Tonight';

  assert.equal(resolvePostDerivedCityLevelEventLocation({
    row,
    establishment: 'Stanley Bridge Ceilidhs',
    item: {
      name: 'Back Home Tonight: Gordon Belsher with Todd MacLean & Cynthia MacLeod',
      venue: "Stanley Bridge Hall (Women's Institute Hall)",
      startDate: '2026-07-27',
      startTime: '19:30',
      description: "Back home at the cozy Women's Institute Hall near Kensington.",
    },
  }), null);
});

test('routes audited post-derived local area labels to review metadata', () => {
  const cases = [
    {
      venue: 'Greenwich & Stanhope Beaches (PEI National Park)',
      name: 'Surfguard Services',
      description: 'Multi-beach PEI National Park surfguard service schedule.',
      locationLabel: 'Greenwich & Stanhope Beaches, PEI',
      locationCity: undefined,
      reason: 'multi_venue_area_candidate',
    },
    {
      venue: 'Brackley & Cavendish Beaches (PEI National Park)',
      name: 'Surfguard Services',
      description: 'Multi-beach PEI National Park surfguard service schedule.',
      locationLabel: 'Brackley & Cavendish Beaches, PEI',
      locationCity: undefined,
      reason: 'multi_venue_area_candidate',
    },
    {
      venue: 'Richmond',
      name: 'Kari rural expansion launch',
      description: 'Kari ride-share service hours for Richmond.',
      locationLabel: 'Richmond, PEI',
      locationCity: 'Richmond',
    },
    {
      venue: 'Various locations throughout Summerside',
      name: 'Summerside Arts Fest',
      description: 'City-wide festival throughout Summerside.',
      locationScope: 'area',
      locationLabel: 'Summerside Arts Fest Locations',
      locationCity: 'Summerside',
      reason: 'multi_location_names_not_fully_extracted',
    },
    {
      venue: 'Georgetown CleanTech Park',
      name: '10th Annual Georgetown CleanTech Park 5K & 10K Run/Walk',
      description: 'Run/walk course in Georgetown.',
      locationScope: 'route',
      locationLabel: '10th Annual Georgetown CleanTech Park 5K & 10K Run/Walk Route',
      locationCity: 'Georgetown',
      reason: 'route_missing_explicit_stops_or_streets',
    },
    {
      venue: 'Main Street',
      name: 'Street Dance with Westbury 5.0',
      description: 'Alberton Days street dance on Main Street.',
      locationLabel: 'Main Street, Alberton, PEI',
      locationCity: 'Alberton',
    },
    {
      venue: 'Town pond',
      name: 'Fishing Derby',
      description: 'Alberton Days fishing derby at the town pond.',
      locationLabel: 'Alberton Town Pond, PEI',
      locationCity: 'Alberton',
    },
    {
      venue: 'N. Rustico Boardwalk',
      name: 'W.I. Walk',
      description: 'Community walk from the boardwalk in North Rustico.',
      locationLabel: 'North Rustico Boardwalk, PEI',
      locationCity: 'North Rustico',
      reason: 'route_like_or_unsupported_location',
    },
    {
      venue: 'East Point Lighthouse (start) / Souris Lighthouse on MacPhee Avenue (finish)',
      name: 'East Point Lighthouse Run/Relay',
      description: 'Point-to-point race route from East Point Lighthouse to Souris Lighthouse.',
      locationScope: 'route',
      locationLabel: 'East Point Lighthouse Run/Relay Route',
      locationCity: 'Souris',
      observedLocationName: 'East Point Lighthouse; Souris Lighthouse on MacPhee Avenue',
      reason: 'route_candidate_requires_geometry_review',
    },
    {
      venue: 'Miltonvale Park',
      name: 'Canada Day at the Park',
      description: 'Rural Municipality of Miltonvale Park community events.',
      locationLabel: 'Miltonvale Park, PEI',
      locationCity: 'Miltonvale Park',
    },
    {
      venue: 'Downtown Charlottetown (Parade Route)',
      name: '2026 PEI Pride Parade',
      description: 'Parade route through Downtown Charlottetown.',
      locationScope: 'route',
      locationLabel: '2026 PEI Pride Parade Route',
      locationCity: 'Charlottetown',
      reason: 'route_missing_explicit_stops_or_streets',
    },
  ];

  for (const candidate of cases) {
    const row = buildRawRow(candidate.description);
    row.sourceScraperType = 'posts';
    row.userName = candidate.venue;
    row.pageName = candidate.venue;
    row.facebookEventLocationName = undefined;
    row.facebookEventLocationIsCityLevel = false;
    row.sharedPostText = candidate.name;

    const result = resolvePostDerivedCityLevelEventLocation({
      row,
      establishment: candidate.venue,
      item: {
        name: candidate.name,
        venue: candidate.venue,
        startDate: '2026-07-01',
        startTime: '12:00',
        description: candidate.description,
      },
    });

    assert.equal(result?.locationScope, candidate.locationScope || 'area');
    assert.equal(result?.locationLabel, candidate.locationLabel);
    assert.equal(result?.locationCity, candidate.locationCity);
    assert.equal(result?.observedLocationName, candidate.observedLocationName || candidate.venue);
    assert.ok(result?.autoPublishReviewReasons.includes('post_derived_area_candidate'));
    if (candidate.reason) {
      assert.ok(result?.autoPublishReviewReasons.includes(candidate.reason));
    }
  }
});

test('keeps route-stop brands in review without inferring a nearby city', () => {
  const routeStopRow = buildRawRow('Ride departure/route stop from Irving toward Souris.');
  routeStopRow.sourceScraperType = 'posts';
  routeStopRow.userName = 'Town of Souris';
  routeStopRow.pageName = 'Town of Souris';
  routeStopRow.facebookEventLocationName = undefined;
  routeStopRow.facebookEventLocationIsCityLevel = false;
  routeStopRow.sharedPostText = 'The Atlantic 911 Ride 2026 - Depart Irving';

  const result = resolvePostDerivedCityLevelEventLocation({
    row: routeStopRow,
    establishment: 'Irving',
    item: {
      name: 'The Atlantic 911 Ride 2026 - Depart Irving',
      venue: 'Irving',
      startDate: '2026-06-07',
      startTime: '08:00',
      description: 'Ride departure/route stop from Irving toward Souris.',
    },
  });

  assert.equal(result?.locationLabel, 'Irving');
  assert.equal(result?.locationCity, undefined);
  assert.equal(result?.locationScope, 'area');
  assert.ok(result?.autoPublishReviewReasons.includes('route_like_or_unsupported_location'));
});

test('does not infer broad area review from concrete addresses', () => {
  const addressRow = buildRawRow('Tug of War event at 20 Lea Crane Boulevard in Souris.');
  addressRow.sourceScraperType = 'posts';
  addressRow.userName = 'Souris Sea Glass Festival';
  addressRow.pageName = 'Souris Sea Glass Festival';
  addressRow.facebookEventLocationName = undefined;
  addressRow.facebookEventLocationIsCityLevel = false;
  addressRow.sharedPostText = 'Night 1 of Souris Tug of War';

  assert.equal(resolvePostDerivedCityLevelEventLocation({
    row: addressRow,
    establishment: '20 Lea Crane Boulevard',
    item: {
      name: 'Night 1 of Souris Tug of War',
      venue: '20 Lea Crane Boulevard',
      startDate: '2026-07-23',
      startTime: '19:00',
      description: 'Tug of War event at 20 Lea Crane Boulevard in Souris.',
    },
  }), null);
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
