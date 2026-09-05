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

function buildBabasVenue(): VenueData {
  return {
    id: 'fb_100057766283684',
    name: "Baba's Lounge",
    normalizedName: 'babas lounge',
    address: '181 Great George St',
    latitude: 46.234,
    longitude: -63.127,
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

test('does not let a newer one-off calendar item repaint an older recurring keeper across source posts', () => {
  const oldImage = 'https://storage.googleapis.com/gathr-uploaded-images/events/babas-june-happy-hour.webp';
  const julyCalendarImage = 'https://storage.googleapis.com/gathr-uploaded-images/events/babas-july-calendar.webp';
  const preview = previewDuplicateMerge({
    venue: buildBabasVenue(),
    existingEvent: buildEvent({
      uniqueId: '1544517017483826_35',
      establishment: "Baba's Lounge",
      venueId: 'fb_100057766283684',
      eventType: 'happy_hour',
      eventName: 'Happy Hour: $6 Pint w/ Appetizer',
      name: 'Happy Hour: $6 Pint w/ Appetizer',
      description: 'Pint with appetizer.',
      category: 'Happy Hour',
      isEvent: 'No',
      isFoodSpecial: 'Yes',
      startDate: '2026-06-30',
      endDate: '2026-06-30',
      startTime: '16:00',
      endTime: '19:00',
      isRecurring: 'Yes',
      recurringPattern: 'weekly_tuesday',
      mediaUrls: [oldImage],
      image: oldImage,
      imageUrl: oldImage,
      relevantImageUrl: oldImage,
      sourceTimestamp: new Date('2026-05-27T20:00:00.000Z'),
      imageProvenance: {
        version: 1,
        primarySource: 'post_media',
        primaryField: 'image',
        primaryUrl: oldImage,
        isFallback: false,
      },
    }),
    incomingEvent: buildEvent({
      uniqueId: '1571494188119442_4a8de12fff7e8397',
      establishment: "Baba's Lounge",
      venueId: 'fb_100057766283684',
      eventType: 'happy_hour',
      eventName: 'Happy Hour: $6 Pint w/ Appetizer',
      name: 'Happy Hour: $6 Pint w/ Appetizer',
      description: 'Pint with appetizer.',
      category: 'Happy Hour',
      isEvent: 'No',
      isFoodSpecial: 'Yes',
      startDate: '2026-07-07',
      endDate: '2026-07-07',
      startTime: '16:00',
      endTime: '19:00',
      isRecurring: 'No',
      recurringPattern: 'none',
      mediaUrls: [julyCalendarImage],
      image: julyCalendarImage,
      imageUrl: julyCalendarImage,
      relevantImageUrl: julyCalendarImage,
      sharedPostThumbnail: julyCalendarImage,
      sourceTimestamp: new Date('2026-06-29T20:00:00.000Z'),
      imageProvenance: {
        version: 1,
        primarySource: 'post_media',
        primaryField: 'image',
        primaryUrl: julyCalendarImage,
        isFallback: false,
      },
    }),
  });

  assert.equal(preview.updates.sourceTimestamp, undefined);
  assert.equal(preview.updates.mediaUrls, undefined);
  assert.equal(preview.updates.image, undefined);
  assert.equal(preview.updates.imageUrl, undefined);
  assert.equal(preview.updates.relevantImageUrl, undefined);
  assert.equal(preview.updates.sharedPostThumbnail, undefined);
  assert.equal(preview.updates.imageProvenance, undefined);
  assert.equal(preview.updates.recurringPattern, undefined);
  assert.equal(preview.updates.isRecurring, undefined);
  assert.equal(preview.updates.recurrenceUntilDate, undefined);
  assert.equal(preview.updates.totalOccurrences, undefined);
});

test('does not let a dated Salty Saturdays poster repaint a stale recurring keeper', () => {
  const mayImage = 'https://storage.googleapis.com/gathr-uploaded-images/events/salty-may.webp';
  const julyImage = 'https://storage.googleapis.com/gathr-uploaded-images/events/salty-july.webp';
  const venue: VenueData = {
    id: 'slug_saltandsolpei',
    name: 'Salt & Sol Restaurant and Lounge',
    normalizedName: 'salt sol restaurant and lounge',
    address: '2 Pownal Street 2nd Floor',
    latitude: 46.232,
    longitude: -63.125,
  };
  const preview = previewDuplicateMerge({
    venue,
    existingEvent: buildEvent({
      uniqueId: '1796647248391130_1',
      establishment: venue.name,
      venueId: venue.id,
      eventType: 'live_music',
      eventName: 'Salty Saturdays: MÖJO',
      name: 'Salty Saturdays: MÖJO',
      description: 'Salty Saturday nights are back!! @mojo.mojo.mo.jo kicking off our summer this Saturday at 10pm. Rain or shine!',
      category: 'Live Music',
      isEvent: 'Yes',
      isFoodSpecial: 'No',
      startDate: '2026-05-16',
      endDate: '2026-05-17',
      startTime: '22:00',
      endTime: '02:00',
      isRecurring: 'Yes',
      recurringPattern: 'weekly_saturday',
      sourceTimestamp: new Date('2026-05-15T20:00:00.000Z'),
      mediaUrls: [mayImage],
      image: mayImage,
      imageUrl: mayImage,
      relevantImageUrl: mayImage,
    }),
    incomingEvent: buildEvent({
      uniqueId: '1843494740373047_abbe51656d78c73b',
      establishment: venue.name,
      venueId: venue.id,
      eventType: 'live_music',
      eventName: 'Salty Saturdays (ft. DJ Dekz & Jeremie)',
      name: 'Salty Saturdays (ft. DJ Dekz & Jeremie)',
      description: 'Saturday: Salty Saturdays ft Sundrift Festival with DJ Dekz and Jeremie',
      category: 'Live Music',
      isEvent: 'Yes',
      isFoodSpecial: 'No',
      startDate: '2026-07-04',
      endDate: '2026-07-05',
      startTime: '22:00',
      endTime: '02:00',
      isRecurring: 'No',
      recurringPattern: 'none',
      sourceTimestamp: new Date('2026-07-03T20:00:00.000Z'),
      mediaUrls: [julyImage],
      image: julyImage,
      imageUrl: julyImage,
      relevantImageUrl: julyImage,
      sharedPostThumbnail: julyImage,
    }),
  });

  assert.equal(preview.updates.sourceTimestamp, undefined);
  assert.equal(preview.updates.mediaUrls, undefined);
  assert.equal(preview.updates.image, undefined);
  assert.equal(preview.updates.imageUrl, undefined);
  assert.equal(preview.updates.relevantImageUrl, undefined);
  assert.equal(preview.updates.sharedPostThumbnail, undefined);
});

test('still promotes image fields for a legitimate newer finite family shape', () => {
  const oldImage = 'https://storage.googleapis.com/gathr-uploaded-images/events/two-can-dine-march.webp';
  const newImage = 'https://storage.googleapis.com/gathr-uploaded-images/events/two-can-dine-april.webp';
  const preview = previewDuplicateMerge({
    venue: buildVenue(),
    existingEvent: buildEvent({
      mediaUrls: [oldImage],
      image: oldImage,
      imageUrl: oldImage,
      relevantImageUrl: oldImage,
      imageProvenance: {
        version: 1,
        primarySource: 'post_media',
        primaryField: 'image',
        primaryUrl: oldImage,
        isFallback: false,
      },
    }),
    incomingEvent: buildEvent({
      uniqueId: '1531052469019872',
      eventName: 'Two Can Dine',
      name: 'Two Can Dine',
      description:
        'Enjoy our Two Can Dine for $70 (+HST). Includes: 1 shareable appetizer, 2 mains, 1 shareable dessert. Available Tuesday, April 14 - Sunday, April 19 from 4-9PM.',
      startDate: '2026-04-14',
      endDate: '2026-04-19',
      isRecurring: false,
      recurringPattern: 'none',
      sourceTimestamp: new Date('2026-04-13T20:26:50.000Z'),
      mediaUrls: [newImage],
      image: newImage,
      imageUrl: newImage,
      relevantImageUrl: newImage,
      imageProvenance: {
        version: 1,
        primarySource: 'post_media',
        primaryField: 'image',
        primaryUrl: newImage,
        isFallback: false,
      },
    }),
  });

  assert.equal(preview.updates.image, newImage);
  assert.equal(preview.updates.imageUrl, newImage);
  assert.equal(preview.updates.relevantImageUrl, newImage);
  assert.deepEqual(preview.updates.mediaUrls, [oldImage, newImage]);
  assert.equal(preview.updates.imageProvenance?.primaryUrl, newImage);
});

test('promotes an incoming same-source recurring parent over a one-off occurrence child', () => {
  const venue: VenueData = {
    id: 'slug_kinkorapubliclibrary',
    name: 'Kinkora Public Library',
    normalizedName: 'kinkora public library',
    address: '45 Anderson Road',
    latitude: 46.327,
    longitude: -63.603,
  };

  const preview = previewDuplicateMerge({
    venue,
    existingEvent: buildEvent({
      uniqueId: '1365076749141329_8',
      establishment: 'Kinkora Public Library',
      venueId: 'slug_kinkorapubliclibrary',
      eventType: 'community',
      eventName: 'TD Summer Reading Club Activities',
      name: 'TD Summer Reading Club Activities',
      description: 'Join us for reading club activities.',
      category: 'Family Friendly',
      isEvent: 'Yes',
      isFoodSpecial: 'No',
      startDate: '2026-08-20',
      endDate: '2026-08-20',
      startTime: '17:00',
      endTime: '19:00',
      isRecurring: 'No',
      recurringPattern: 'none',
      sourceTimestamp: new Date('2026-07-28T12:00:00.000Z'),
      timeResolution: undefined,
      timeFlags: undefined,
    }),
    incomingEvent: buildEvent({
      uniqueId: '1365076749141329_7',
      establishment: 'Kinkora Public Library',
      venueId: 'slug_kinkorapubliclibrary',
      eventType: 'community',
      eventName: 'TD Summer Reading Club Activities',
      name: 'TD Summer Reading Club Activities',
      description:
        'Thursdays at 5:00 p.m. Join us each week for summer reading club activities.',
      category: 'Family Friendly',
      isEvent: 'Yes',
      isFoodSpecial: 'No',
      startDate: '2026-08-13',
      endDate: '2026-08-13',
      startTime: '17:00',
      endTime: '19:00',
      isRecurring: 'Yes',
      recurringPattern: 'weekly_thursday',
      totalOccurrences: 3,
      sourceTimestamp: new Date('2026-07-28T12:00:00.000Z'),
      timeResolution: undefined,
      timeFlags: undefined,
    }),
  });

  assert.equal(preview.updates.eventName, undefined);
  assert.equal(preview.updates.name, undefined);
  assert.equal(
    preview.updates.description,
    'Thursdays at 5:00 p.m. Join us each week for summer reading club activities.'
  );
  assert.equal(preview.updates.startDate, '2026-08-13');
  assert.equal(preview.updates.endDate, '2026-08-13');
  assert.equal(preview.updates.recurringPattern, 'weekly_thursday');
  assert.equal(preview.updates.totalOccurrences, 3);
  assert.equal(preview.updates.isRecurring, true);
});
