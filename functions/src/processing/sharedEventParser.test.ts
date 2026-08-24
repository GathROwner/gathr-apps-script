import test from 'node:test';
import assert from 'node:assert/strict';
import { Settings } from 'luxon';
import { deduplicateMixedContentForRegression } from '../parsing/eventExtractor.js';

import {
  buildCalendarImageParsedEventsForRegression,
  ensureNamedSharedPhotoParentsForRegression,
  extractFacebookEmbeddedEventData,
  extractFacebookCanonicalStoryUrl,
  mergeExtractedParsedEventsForRegression,
  keepDominantSharedPhotoSeriesForRegression,
  parseSharedEventPayload,
  parseSharedEventPayloads,
  reconcileSingleSharedPhotoEventDateForRegression,
  selectParsedEventsForSubmissionForRegression,
  verifySharedEventSourceVisibility,
} from './sharedEventParser.js';

test('verified public route preserves official stops and street sequence', async () => {
  const parsed = await parseSharedEventPayload({
    sourceUrl: 'https://example.com/events/parade',
    title: 'Harbour Parade',
    description: 'Start: Victoria Park\nRoute: Brighton Road -> Queen Street\nFinish: Confederation Centre',
    startDate: '2026-09-01',
    startTime: '10:00',
    locationName: 'Charlottetown, PEI',
  }, {
    sourceVisibility: 'public_verified',
    visibilityEvidence: {
      method: 'public_url_probe',
      checkedAt: '2026-08-23T12:00:00.000Z',
      reason: 'Public source verified.',
      title: 'Harbour Parade',
      description: 'Start: Victoria Park\nRoute: Brighton Road -> Queen Street\nFinish: Confederation Centre',
      startDate: '2026-09-01',
      startTime: '10:00',
      locationName: 'Charlottetown, PEI',
    },
  });

  assert.equal(parsed.spatialEvidence?.kind, 'route');
  assert.equal(parsed.spatialEvidence?.routeEvidenceLevel, 'official_full_route');
  assert.ok(parsed.reviewReasons.includes('route_candidate_requires_geometry_review'));
  assert.equal(parsed.routing, 'public_candidate');
});

test('private share text cannot strengthen verified public spatial evidence', async () => {
  const parsed = await parseSharedEventPayload({
    sourceUrl: 'https://example.com/events/community-day',
    title: 'Community Day',
    description: 'Private note: route starts at Victoria Park, follows Brighton Road, and finishes at City Hall.',
    startDate: '2026-09-01',
    startTime: '10:00',
    locationName: 'Charlottetown, PEI',
  }, {
    sourceVisibility: 'public_verified',
    visibilityEvidence: {
      method: 'public_url_probe',
      checkedAt: '2026-08-23T12:00:00.000Z',
      reason: 'Public source verified without route facts.',
      title: 'Community Day',
      description: 'A day of activities in Charlottetown.',
      startDate: '2026-09-01',
      startTime: '10:00',
      locationName: 'Charlottetown, PEI',
    },
  });

  assert.notEqual(parsed.spatialEvidence?.kind, 'route');
  assert.equal(parsed.spatialEvidence?.locations.length, 0);
});

test('private image-share multi-location event remains an unordered point set', async () => {
  const parsed = await parseSharedEventPayload({
    title: 'Downtown Busker Weekend',
    description: "Locations: Victoria Row; Founders Food Hall & Market; Peake's Quay",
    startDate: '2026-09-05',
    startTime: '12:00',
    locationName: 'Downtown Charlottetown',
    mediaUrls: ['file:///shared/busker-poster.jpg'],
  }, {
    sourceVisibility: 'user_private',
    visibilityEvidence: {
      method: 'share_payload_hint',
      checkedAt: '2026-08-23T12:00:00.000Z',
      reason: 'Private share.',
    },
  });

  assert.equal(parsed.routing, 'private_only');
  assert.equal(parsed.spatialEvidence?.kind, 'multi_location');
  assert.equal(parsed.spatialEvidence?.ordered, false);
  assert.equal(parsed.spatialEvidence?.locations.length, 3);
});

test('private image-share prose recovers unordered confirmed and possible locations', async () => {
  const parsed = await parseSharedEventPayload({
    title: 'Harbour Squares Busker Pop-Up',
    description: "CONFIRMED LOCATIONS (NO SET ORDER): Confederation Landing; Victoria Row POSSIBLE WEATHER LOCATION: Founders Food Hall & Market. This is not a travel route.",
    startDate: '2026-09-26',
    startTime: '13:00',
    locationName: 'Downtown Charlottetown, PEI',
    mediaUrls: ['file:///shared/harbour-squares-poster.png'],
  }, {
    sourceVisibility: 'user_private',
    visibilityEvidence: {
      method: 'share_payload_hint',
      checkedAt: '2026-08-24T12:00:00.000Z',
      reason: 'Private image share.',
    },
  });

  assert.equal(parsed.routing, 'private_only');
  assert.equal(parsed.spatialEvidence?.kind, 'multi_location');
  assert.equal(parsed.spatialEvidence?.ordered, false);
  assert.deepEqual(parsed.spatialEvidence?.locations.map((entry) => [entry.label, entry.certainty]), [
    ['Confederation Landing', 'confirmed'],
    ['Victoria Row', 'confirmed'],
    ['Founders Food Hall & Market', 'possible'],
  ]);
  assert.ok(parsed.reviewReasons.includes('multi_location_requires_point_resolution'));
});

test('dominant centered poster drops one isolated neighbouring poster extraction', () => {
  const makeItem = (name: string, date: string) => ({
    name,
    description: name,
    date,
    startTime: '',
    endTime: '',
    venue: '',
    price: '',
    recurringPattern: 'none' as const,
    extractionReason: 'visible poster text',
  });
  const filtered = keepDominantSharedPhotoSeriesForRegression([
    makeItem('Cubby Bear and the Adventure Home (Charlottetown)', '2026-06-18'),
    makeItem('Cubby Bear and the Adventure Home (Charlottetown)', '2026-06-19'),
    makeItem('Cubby Bear and the Adventure Home (Summerside)', '2026-06-27'),
    makeItem('Cubby Bear and the Adventure Home (Summerside)', '2026-06-28'),
    makeItem('CESP / ANTIPHE / C.A.B.L.E.', '2026-07-23'),
  ]);

  assert.equal(filtered.length, 4);
  assert.ok(filtered.every((item) => item.name.startsWith('Cubby Bear')));
});

test('diverse monthly calendar is not collapsed to one repeated act', () => {
  const items = ['Carter MacLellan', 'Carter MacLellan', 'Carter MacLellan', 'Kim Albert Trio', 'Richie & Brian', 'Adam & The Foes']
    .map((name, index) => ({
      name,
      description: name,
      date: `2026-07-${String(index + 1).padStart(2, '0')}`,
      startTime: '18:00',
      endTime: '22:00',
      venue: 'Charlottetown Beer Garden',
      price: '',
      recurringPattern: 'none' as const,
      extractionReason: 'monthly calendar cell',
    }));

  assert.equal(keepDominantSharedPhotoSeriesForRegression(items).length, items.length);
});

test('single shared-photo event uses explicit OCR month and day instead of a rolled weekday', () => {
  const [item] = reconcileSingleSharedPhotoEventDateForRegression({
    items: [{
      name: 'A Gozar!! Fiesta Latina',
      description: 'Latin thank-you party',
      date: '2026-08-28',
      startTime: '20:00',
      endTime: '01:00',
      venue: 'The Night Cap',
      price: '$8 online / $10 door',
      recurringPattern: 'none',
      extractionReason: 'single headline event',
    }],
    contentType: 'EVENT',
    ocrText: 'A GOZAR!! FIESTA LATINA\nFRI JUL 31\n8pm-1am\n185 Kent St',
    referenceIso: '2026-08-22T20:00:00-03:00',
    timezone: 'America/Halifax',
  });

  assert.equal(item.date, '2026-07-31');
});

test('single shared-photo event with no printed date stays unresolved', () => {
  const [item] = reconcileSingleSharedPhotoEventDateForRegression({
    items: [{
      name: 'Lovebite Release Show',
      description: 'With Kendra Lyttle and Dream of Leaves at 10pm',
      date: '2026-08-22',
      startTime: '22:00',
      endTime: '',
      venue: "Baba's Lounge",
      price: '$10',
      recurringPattern: 'none',
      extractionReason: 'single headline event',
    }],
    contentType: 'EVENT',
    ocrText: 'LOVE BITE RELEASE SHOW\nKENDRA LYTTLE\nDREAM OF LEAVES\n@10pm $10\nBABAS LOUNGE',
    referenceIso: '2026-08-22T20:00:00-03:00',
    timezone: 'America/Halifax',
  });

  assert.equal(item.date, '');
});

test('DJ admission price and special-guest wording remain an event', async () => {
  const primary = await parseSharedEventPayload({
    title: 'Give Me House Music',
    mediaUrls: ['https://example.com/babas-dj-poster.jpg'],
    timezone: 'America/Halifax',
  });
  const [event] = buildCalendarImageParsedEventsForRegression(primary, [{
    name: 'Give Me House Music',
    type: 'special',
    date: '2026-06-19',
    startTime: '22:00',
    endTime: '02:00',
    venue: "Baba's Lounge",
    price: '$10',
    description: 'House music with local DJ support and special guest DJ Dale Mannette.',
    extractionReason: 'nightlife poster with admission price',
  }]);

  assert.equal(event.contentKind, 'event');
  assert.equal(event.price, '$10');
});

test('market and its independently timed live performance remain two linked events', async () => {
  const primary = await parseSharedEventPayload({
    title: 'West Prince PEI Markets Trail',
    mediaUrls: ['https://example.com/west-prince-market.jpg'],
    timezone: 'America/Halifax',
  });
  const parsed = buildCalendarImageParsedEventsForRegression(primary, [
    {
      name: 'West Prince PEI Markets Trail - Inside Market',
      type: 'event',
      date: '2026-08-23',
      startTime: '11:00',
      endTime: '16:00',
      venue: 'Jacques Cartier Memorial Arena',
      address: '349 Church Street, Alberton, PE',
      price: 'Free admission',
      description: 'Inside market with 25+ vendors, food on site, and 50/50 sales.',
    },
    {
      name: 'Live Entertainment by Floyd Gaudet',
      type: 'event',
      date: '2026-08-23',
      startTime: '12:00',
      endTime: '14:00',
      venue: 'Jacques Cartier Memorial Arena',
      address: '349 Church Street, Alberton, PE',
      description: 'Live music during the West Prince PEI Markets Trail Inside Market.',
      relationshipType: 'component_of',
      parentEventTitle: 'West Prince PEI Markets Trail - Inside Market',
    },
  ]);

  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed.map((item) => ({
    title: item.title,
    contentKind: item.contentKind,
    startTime: item.startTime,
    endTime: item.endTime,
    relationshipType: item.relationshipType,
    parentEventTitle: item.parentEventTitle,
  })), [
    {
      title: 'West Prince PEI Markets Trail - Inside Market',
      contentKind: 'event',
      startTime: '11:00',
      endTime: '16:00',
      relationshipType: undefined,
      parentEventTitle: undefined,
    },
    {
      title: 'Live Entertainment by Floyd Gaudet',
      contentKind: 'event',
      startTime: '12:00',
      endTime: '14:00',
      relationshipType: 'component_of',
      parentEventTitle: 'West Prince PEI Markets Trail - Inside Market',
    },
  ]);
});

test('named component materializes its omitted market parent from the poster-wide time range', () => {
  const items = ensureNamedSharedPhotoParentsForRegression([{
    name: 'Live Entertainment by Floyd Gaudet',
    description: 'Live entertainment by Floyd Gaudet from 12 PM to 2 PM.',
    date: '2026-08-23',
    startTime: '12:00',
    endTime: '14:00',
    venue: 'Jacques Cartier Memorial Arena',
    address: '349 Church Street, Alberton, PE',
    price: '',
    recurringPattern: 'none',
    extractionReason: 'Named live performance.',
    relationshipType: 'component_of',
    parentEventTitle: 'West Prince PEI Markets Trail - Inside Market',
  }], [
    'WEST PRINCE PEI MARKETS TRAIL - INSIDE MARKET',
    'AUGUST 23 11AM - 4PM',
    'LIVE ENTERTAINMENT BY FLOYD GAUDET 12PM - 2PM',
    'FREE ADMISSION',
    '25+ VENDORS AND MORE',
    'FOOD ON SITE',
    '50/50 SALES',
  ].join('\n'));

  assert.equal(items.length, 2);
  assert.equal(items[0].name, 'West Prince PEI Markets Trail - Inside Market');
  assert.equal(items[0].startTime, '11:00');
  assert.equal('endTime' in items[0] ? items[0].endTime : '', '16:00');
  assert.match('description' in items[0] ? items[0].description || '' : '', /25\+ vendors/i);
  assert.equal(items[1].name, 'Live Entertainment by Floyd Gaudet');
});

test('supporting drink special materializes its explicitly named omitted party event', () => {
  const items = ensureNamedSharedPhotoParentsForRegression([{
    name: '$6 Burt Reynolds Shots',
    description: '$6 Burt Reynolds shots from 10 PM to 2 AM.',
    date: '2026-08-22',
    startTime: '22:00',
    endTime: '02:00',
    venue: 'Charlottetown Beer Garden & Seafood Patio',
    pricing: '$6',
    recurringPattern: 'none',
    extractionReason: 'Priced drink offer.',
    relationshipType: 'supporting_special_for',
    parentEventTitle: 'Saturday Dance Party - DJ Jeramie',
    _sourceType: 'special',
  }], 'SATURDAY DANCE PARTY - DJ JERAMIE\n$6 BURT REYNOLDS SHOTS\n10PM - 2AM');

  assert.equal(items.length, 2);
  assert.equal(items[0].name, 'Saturday Dance Party - DJ Jeramie');
  assert.equal(items[0].startTime, '22:00');
  assert.equal('endTime' in items[0] ? items[0].endTime : '', '02:00');
  assert.equal(items[1].name, '$6 Burt Reynolds Shots');
});

test('materialized dance party recovers its DJ name from the same weekday OCR panel', () => {
  const items = ensureNamedSharedPhotoParentsForRegression([{
    name: '$6 Burt Reynolds Shots',
    description: '$6 Burt Reynolds shots from 10 PM to 2 AM.',
    date: '2026-08-22',
    startTime: '22:00',
    endTime: '02:00',
    venue: 'The Beer Garden',
    pricing: '$6',
    recurringPattern: 'none',
    extractionReason: 'Priced drink offer.',
    relationshipType: 'supporting_special_for',
    parentEventTitle: 'SATURDAY! Dance Party',
    _sourceType: 'special',
  }], [
    'SATURDAY! Dance Party',
    'AUG. 22 // 10 P.M. - 2 A.M.',
    'THE BEER GARDEN',
    'DJ JERAMIE',
    '$6 BURT REYNOLDS SHOTS',
  ].join('\n'));

  assert.equal(items[0].name, 'SATURDAY! Dance Party - DJ JERAMIE');
  assert.equal(items[1].parentEventTitle, 'SATURDAY! Dance Party - DJ JERAMIE');
});

test('dance party and its priced shot offer remain one event plus one linked special', async () => {
  const primary = await parseSharedEventPayload({
    title: 'Charlottetown Beer Garden weekend',
    mediaUrls: ['https://example.com/beer-garden-party.jpg'],
    timezone: 'America/Halifax',
  });
  const parsed = buildCalendarImageParsedEventsForRegression(primary, [
    {
      name: 'Friday Dance Party - DJ Derek',
      type: 'event',
      date: '2026-08-21',
      startTime: '22:00',
      endTime: '02:00',
      venue: 'Charlottetown Beer Garden & Seafood Patio',
      description: 'Friday dance party with DJ Derek from 10 PM to 2 AM.',
    },
    {
      name: '$6 Burt Reynolds Shots',
      type: 'special',
      date: '2026-08-21',
      startTime: '22:00',
      endTime: '02:00',
      venue: 'Charlottetown Beer Garden & Seafood Patio',
      price: '$6',
      description: '$6 Burt Reynolds shots during Friday Dance Party - DJ Derek.',
      relationshipType: 'supporting_special_for',
      parentEventTitle: 'Friday Dance Party - DJ Derek',
    },
  ]);

  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].title, 'Friday Dance Party - DJ Derek');
  assert.equal(parsed[0].contentKind, 'event');
  assert.equal(parsed[1].title, '$6 Burt Reynolds Shots');
  assert.equal(parsed[1].contentKind, 'special');
  assert.equal(parsed[1].price, '$6');
  assert.equal(parsed[1].relationshipType, 'supporting_special_for');
  assert.equal(parsed[1].parentEventTitle, 'Friday Dance Party - DJ Derek');
});

test('entertainment card survives mixed dedup when its description mentions a supporting drink special', () => {
  const event = {
    name: 'Saturday Dance Party - DJ Jeramie',
    date: '2026-08-22',
    startTime: '22:00',
    endTime: '02:00',
    venue: 'The Beer Garden',
    price: '',
    description: 'Dance party with DJ Jeramie; $6 Burt Reynolds shots available.',
    recurringPattern: 'none' as const,
    extractionReason: 'Named entertainment event.',
    _sourceType: 'event' as const,
  };
  const special = {
    name: '$6 Burt Reynolds Shots',
    date: '2026-08-22',
    startTime: '22:00',
    endTime: '02:00',
    venue: 'The Beer Garden',
    pricing: '$6',
    description: '$6 Burt Reynolds shots during Saturday Dance Party.',
    recurringPattern: 'none' as const,
    extractionReason: 'Priced drink offer.',
    _sourceType: 'special' as const,
  };

  const parsed = deduplicateMixedContentForRegression([event], [special]);
  assert.deepEqual(parsed.map((item) => item.name), [event.name, special.name]);
});

test('private visibility hints keep shared Facebook events user-private', async () => {
  const visibility = await verifySharedEventSourceVisibility({
    sourceUrl: 'https://www.facebook.com/events/123456789',
    visibilityHint: 'invite_only',
    sharedText: 'Secret show\nWhen: June 25 at 7 PM\nLocation: Small Hall',
  }, 'https://www.facebook.com/events/123456789');

  assert.equal(visibility.visibility, 'user_private');
  assert.equal(visibility.evidence.method, 'share_payload_hint');

  const parsed = await parseSharedEventPayload({
    sourceUrl: 'https://www.facebook.com/events/123456789',
    visibilityHint: 'invite_only',
    sharedText: 'Secret show\nWhen: June 25 at 7 PM\nLocation: Small Hall',
  }, {
    sourceVisibility: visibility.visibility,
    visibilityEvidence: visibility.evidence,
  });

  assert.equal(parsed.routing, 'private_only');
  assert.equal(parsed.sourceVisibility, 'user_private');
  assert.equal(parsed.title, 'Secret show');
  assert.equal(parsed.startTime, '19:00');
  assert.equal(parsed.locationName, 'Small Hall');
});

test('public verified source routes to a public candidate while retaining user status', async () => {
  const originalNow = Settings.now;
  Settings.now = () => new Date('2026-06-17T12:00:00.000Z').getTime();
  try {
    const parsed = await parseSharedEventPayload({
      sourceUrl: 'https://example.com/events/music-night',
      title: 'Music Night',
      sharedText: 'When: June 25 at 7 PM\nLocation: Founders Hall',
    }, {
      sourceVisibility: 'public_verified',
      visibilityEvidence: {
        method: 'public_url_probe',
        checkedAt: '2026-06-17T00:00:00.000Z',
        url: 'https://example.com/events/music-night',
        httpStatus: 200,
        reason: 'Public URL returned usable metadata without user credentials.',
        titleFound: true,
        descriptionFound: true,
      },
    });

    assert.equal(parsed.routing, 'public_candidate');
    assert.equal(parsed.status, 'submitted_public_candidate');
    assert.equal(parsed.needsUserReview, false);
    assert.equal(parsed.sourceVisibility, 'public_verified');
  } finally {
    Settings.now = originalNow;
  }
});

test('public probe metadata fills event fields when the share payload only has a URL', async () => {
  const parsed = await parseSharedEventPayload({
    sourceUrl: 'https://fb.me/e/example',
    sharedText: 'https://fb.me/e/example',
  }, {
    sourceVisibility: 'public_verified',
    visibilityEvidence: {
      method: 'public_url_probe',
      checkedAt: '2026-06-17T00:00:00.000Z',
      url: 'https://fb.me/e/example',
      finalUrl: 'https://www.facebook.com/events/123456789/',
      httpStatus: 200,
      reason: 'Public URL returned usable metadata without user credentials.',
      titleFound: true,
      descriptionFound: true,
      title: 'Big Love: The Music of Fleetwood Mac',
      description: 'When: July 2 at 7 PM\nLocation: Trailside Music Hall',
      imageUrl: 'https://example.com/event.jpg',
    },
  });

  assert.equal(parsed.sourceUrl, 'https://www.facebook.com/events/123456789/');
  assert.equal(parsed.title, 'Big Love: The Music of Fleetwood Mac');
  assert.equal(parsed.startDate, '2026-07-02');
  assert.equal(parsed.startTime, '19:00');
  assert.equal(parsed.locationName, 'Trailside Music Hall');
  assert.deepEqual(parsed.mediaUrls, ['https://example.com/event.jpg']);
});

test('facebook public metadata description can provide a city location fallback', async () => {
  const parsed = await parseSharedEventPayload({
    sourceUrl: 'https://fb.me/e/example',
    sharedText: 'https://fb.me/e/example',
  }, {
    sourceVisibility: 'public_verified',
    visibilityEvidence: {
      method: 'public_url_probe',
      checkedAt: '2026-06-17T00:00:00.000Z',
      url: 'https://fb.me/e/example',
      finalUrl: 'https://www.facebook.com/events/946907037842053/',
      httpStatus: 200,
      reason: 'Public URL returned usable metadata without user credentials.',
      titleFound: true,
      descriptionFound: true,
      title: 'DiverseCity Festival - Charlottetown 2026',
      description: 'Party event in Charlottetown by DiverseCity Multicultural Festival on Sunday, June 28 2026.',
      imageUrl: 'https://example.com/diversecity.jpg',
    },
  });

  assert.equal(parsed.title, 'DiverseCity Festival - Charlottetown 2026');
  assert.equal(parsed.startDate, '2026-06-28');
  assert.equal(parsed.locationName, 'Charlottetown');
});

test('facebook post text can infer venue and same-day weekday date from natural wording', async () => {
  const originalNow = Settings.now;
  Settings.now = () => new Date('2026-06-18T22:08:00.000Z').getTime();

  try {
    const parsed = await parseSharedEventPayload({
      sourceUrl: 'https://www.facebook.com/share/p/trivia-example',
      sharedText: 'https://www.facebook.com/share/p/trivia-example',
    }, {
      sourceVisibility: 'public_verified',
      visibilityEvidence: {
        method: 'public_url_probe',
        checkedAt: '2026-06-18T22:08:00.000Z',
        url: 'https://www.facebook.com/share/p/trivia-example',
        finalUrl: 'https://www.facebook.com/darcystrivia/posts/123456789',
        httpStatus: 200,
        reason: 'Public URL returned usable metadata without user credentials.',
        titleFound: true,
        descriptionFound: true,
        title: "Darcy's Trivia & Entertainment",
        description: [
          "Thursday night plans? We've got you covered.",
          "Trivia is back at Hunter's Ale House this Thursday at 9pm - bring your smartest friends.",
          "Great questions, big laughs, cold drinks, and full bragging rights on the line.",
        ].join('\n'),
        ogType: 'article',
        sourcePublishedAt: '2026-06-18T12:00:00.000-03:00',
      },
    });

    assert.equal(parsed.title, "Darcy's Trivia & Entertainment");
    assert.equal(parsed.startDate, '2026-06-18');
    assert.equal(parsed.startTime, '21:00');
    assert.equal(parsed.locationName, "Hunter's Ale House");
    assert.deepEqual(parsed.reviewReasons, []);
  } finally {
    Settings.now = originalNow;
  }
});

test('facebook post metadata avoids possessive event phrases as venue names', async () => {
  const originalNow = Settings.now;
  Settings.now = () => new Date('2026-06-18T16:22:00.000Z').getTime();

  try {
    const parsed = await parseSharedEventPayload({
      sourceUrl: 'https://www.facebook.com/share/p/founders-example',
      sharedText: 'https://www.facebook.com/share/p/founders-example',
    }, {
      sourceVisibility: 'public_verified',
      visibilityEvidence: {
        method: 'public_url_probe',
        checkedAt: '2026-06-18T16:22:00.000Z',
        url: 'https://www.facebook.com/share/p/founders-example',
        finalUrl: 'https://www.facebook.com/100063765871700/posts/1600420268760154',
        httpStatus: 200,
        reason: 'Public URL returned usable metadata without user credentials.',
        titleFound: true,
        descriptionFound: true,
        title: 'Founders\u2019 Food Hall and Market',
        description: [
          'Summer starts here! \u2600\ufe0f',
          'Join us this week for Wellness Wednesday, then celebrate the start of summer at our Summer Kick-Off Night Market on Saturday, June 20! Shop local vendors, enjoy great food and drinks, and soak up the summer atmosphere!',
          'Plus, catch all the FIFA action on our screens throughout the week.',
        ].join('\n'),
        imageUrl: 'https://example.com/founders-cover.jpg',
        ogType: 'video.other',
        sourcePostId: '1600420268760154',
        sourceOwnerId: '100063765871700',
        sourcePublishedAt: '2026-06-15T14:56:28.000-03:00',
      },
    });

    assert.equal(parsed.title, 'Summer Kick-Off Night Market');
    assert.equal(parsed.startDate, '2026-06-20');
    assert.equal(parsed.locationName, 'Founders\u2019 Food Hall and Market');
    assert.notEqual(parsed.locationName, 'our Summer Kick-Off Night Market on');
    assert.deepEqual(parsed.reviewReasons, []);
  } finally {
    Settings.now = originalNow;
  }
});

test('facebook post text uses source post date to mark old relative weekday events expired', async () => {
  const originalNow = Settings.now;
  Settings.now = () => new Date('2026-06-18T22:58:00.000Z').getTime();

  try {
    const parsed = await parseSharedEventPayload({
      sourceUrl: 'https://www.facebook.com/share/p/old-trivia-example',
      sharedText: 'https://www.facebook.com/share/p/old-trivia-example',
    }, {
      sourceVisibility: 'public_verified',
      visibilityEvidence: {
        method: 'public_url_probe',
        checkedAt: '2026-06-18T22:58:00.000Z',
        url: 'https://www.facebook.com/share/p/old-trivia-example',
        finalUrl: 'https://www.facebook.com/darcystrivia/posts/987654321',
        httpStatus: 200,
        reason: 'Public URL returned usable metadata without user credentials.',
        titleFound: true,
        descriptionFound: true,
        title: "Darcy's Trivia & Entertainment",
        description: [
          "Thursday night plans? We've got you covered.",
          "Trivia is back at Hunter's Ale House this Thursday at 9pm - bring your smartest friends.",
          "Great questions, big laughs, cold drinks, and full bragging rights on the line.",
        ].join('\n'),
        ogType: 'article',
        sourcePublishedAt: '2026-06-07T12:00:00.000-03:00',
      },
    });

    assert.equal(parsed.startDate, '2026-06-11');
    assert.equal(parsed.startTime, '21:00');
    assert.equal(parsed.locationName, "Hunter's Ale House");
    assert.equal(parsed.status, 'expired');
    assert.equal(parsed.routing, 'not_public_candidate');
    assert.equal(parsed.isExpired, true);
    assert.deepEqual(parsed.reviewReasons, ['event_expired']);
  } finally {
    Settings.now = originalNow;
  }
});

test('facebook embedded public event data supplies time address and real cover image', async () => {
  const html = `
    <meta property="og:url" content="https://www.facebook.com/events/29-cornwall-rd-cornwall-pe-canada-prince-edward-island-c0a-1h1/2026-just-live-fun-run/1607254180584029/" />
    <script>{"id":"1607254180584029","name":"2026 Just Live Fun Run ","day_time_sentence":"Sunday, August 23, 2026 at 8:00\\u202fAM ADT","event_place":{"__typename":"FreeformPlace","contextual_name":"29 Cornwall Rd, Cornwall, PE, Canada, Prince Edward Island C0A 1H1","location":{"latitude":46.23082,"longitude":-63.21702},"name":"29 Cornwall Rd, Cornwall, PE, Canada, Prince Edward Island C0A 1H1"},"current_start_timestamp":1787482800,"start_timestamp":1787482800,"start_time_formatted":"Sun, Aug 23 at 8:00\\u202fAM ADT","cover_media_renderer":{"__typename":"EventCoverPhotoRenderer","cover_photo":{"photo":{"full_image":{"height":540,"uri":"https:\\/\\/scontent.fyhz1-1.fna.fbcdn.net\\/v\\/event-cover.jpg?oh=abc","width":960}}}},"event_description":{"text":"Just Live Events Inc. is hosting it\\u2019s\\n4th Annual Just Live Fun Run."},"one_line_address":"29 Cornwall Rd, Cornwall, PE C0A, Canada"}</script>
  `;

  const embedded = extractFacebookEmbeddedEventData(
    html,
    'https://www.facebook.com/events/1607254180584029/'
  );

  assert.equal(embedded.title, '2026 Just Live Fun Run');
  assert.equal(embedded.startDate, '2026-08-23');
  assert.equal(embedded.startTime, '08:00');
  assert.equal(embedded.address, '29 Cornwall Rd, Cornwall, PE C0A, Canada');
  assert.equal(embedded.imageUrl, 'https://scontent.fyhz1-1.fna.fbcdn.net/v/event-cover.jpg?oh=abc');
  assert.equal(embedded.description, 'Just Live Events Inc. is hosting it\u2019s\n4th Annual Just Live Fun Run.');

  const parsed = await parseSharedEventPayload({
    sourceUrl: 'https://fb.me/e/7THIGPXNv',
    sharedText: 'https://fb.me/e/7THIGPXNv',
  }, {
    sourceVisibility: 'public_verified',
    visibilityEvidence: {
      method: 'public_url_probe',
      checkedAt: '2026-06-17T00:00:00.000Z',
      url: 'https://fb.me/e/7THIGPXNv',
      finalUrl: 'https://www.facebook.com/events/1607254180584029/',
      httpStatus: 200,
      reason: 'Public URL returned usable metadata without user credentials.',
      titleFound: true,
      descriptionFound: true,
      ...embedded,
    },
  });

  assert.equal(parsed.title, '2026 Just Live Fun Run');
  assert.equal(parsed.startDate, '2026-08-23');
  assert.equal(parsed.startTime, '08:00');
  assert.equal(parsed.locationName, undefined);
  assert.equal(parsed.address, '29 Cornwall Rd, Cornwall, PE C0A, Canada');
  assert.deepEqual(parsed.mediaUrls, ['https://scontent.fyhz1-1.fna.fbcdn.net/v/event-cover.jpg?oh=abc']);
});

test('facebook share post probes can derive canonical story url', () => {
  const html = `
    <script>{"post_id":"1456024579878094","url":"https:\\/\\/www.facebook.com\\/story.php?story_fbid=1456024579878094&id=100064116963888&mibextid=wwXIfr"}</script>
  `;

  assert.equal(
    extractFacebookCanonicalStoryUrl(html, 'https://www.facebook.com/share/p/1CHRa6u6wB/?mibextid=wwXIfr'),
    'https://www.facebook.com/story.php?story_fbid=1456024579878094&id=100064116963888'
  );
});

test('facebook login probes with story ids do not verify as public', async () => {
  const originalFetch = globalThis.fetch;
  const loginFinalUrl = 'https://m.facebook.com/login/?next=https%3A%2F%2Fwww.facebook.com%2Fstory.php%3Fstory_fbid%3D1456024579878094%26id%3D100064116963888';
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    url: loginFinalUrl,
    text: async () => `
      <html>
        <head>
          <title>Log into Facebook | Facebook</title>
          <meta name="description" content="Log into Facebook to start sharing and connecting with your friends, family, and people you know." />
        </head>
        <body>Log in to Facebook</body>
      </html>
    `,
  })) as unknown as typeof fetch;

  try {
    const visibility = await verifySharedEventSourceVisibility({
      sourceUrl: 'https://www.facebook.com/share/p/1FMVSgHJsz/?mibextid=wwXIfr',
      sharedText: 'https://www.facebook.com/share/p/1FMVSgHJsz/?mibextid=wwXIfr',
    }, 'https://www.facebook.com/share/p/1FMVSgHJsz/?mibextid=wwXIfr');

    assert.equal(visibility.visibility, 'restricted_unverified');
    assert.equal(visibility.evidence.sourcePostId, '1456024579878094');
    assert.equal(visibility.evidence.sourceOwnerId, '100064116963888');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('facebook public post pages with checkpoint route strings can still expand events', async () => {
  const originalFetch = globalThis.fetch;
  const finalUrl = 'https://www.facebook.com/permalink.php?story_fbid=1456024579878094&id=100064116963888';
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    url: finalUrl,
    text: async () => `
      <html>
        <head>
          <title>the week is loaded and we are ready... - Hunter&#039;s Ale House</title>
          <meta property="og:title" content="Hunter&#039;s Ale House" />
          <meta property="og:description" content="the week is loaded and we are ready for it. &#x1f3b8;&#x1f37a;&#x1f5d3; Thur June 18 &#x2014; Travis &amp; Juline Acoustic Night &#064; 10pm..." />
          <meta property="og:type" content="video.other" />
        </head>
        <body>
          <script>{"allowlist":["\\/checkpoint\\/block\\/"],"post_id":"1456024579878094","message_container":{"story":{"message":{"text":"the week is loaded and we are ready for it. \\ud83c\\udfb8\\ud83c\\udf7a\\n\\ud83d\\uddd3 Thur June 18 \\u2014 Travis & Juline Acoustic Night \\u0040 10pm (Trivia w\\/ Darcy from 9)\\n\\ud83d\\uddd3 Fri June 19 \\u2014 Mat & Ryan Live Music \\u0040 10pm\\n\\ud83d\\uddd3 Sat June 20 \\u2014 Gin N Tonic Live Music \\u0040 10pm\\n\\ud83d\\uddd3 Sun June 21 \\u2014 Music Trivia w\\/ Andrew Rollins \\u0040 9pm"}}}}</script>
        </body>
      </html>
    `,
  })) as unknown as typeof fetch;

  try {
    const payload = {
      sourceUrl: finalUrl,
      sharedText: finalUrl,
    };
    const visibility = await verifySharedEventSourceVisibility(payload, finalUrl);
    const parsedEvents = await parseSharedEventPayloads(payload, {
      sourceVisibility: visibility.visibility,
      visibilityEvidence: visibility.evidence,
    });

    assert.equal(visibility.visibility, 'public_verified');
    assert.match(visibility.evidence.description || '', /Sun June 21/);
    assert.equal(parsedEvents.length, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('facebook public post text can expand into multiple event candidates', async () => {
  const originalNow = Settings.now;
  Settings.now = () => new Date('2026-06-18T15:00:00.000Z').getTime();

  try {
    const parsedEvents = await parseSharedEventPayloads({
      sourceUrl: 'https://www.facebook.com/share/p/example',
      sharedText: 'https://www.facebook.com/share/p/example',
    }, {
      sourceVisibility: 'public_verified',
      visibilityEvidence: {
        method: 'public_url_probe',
        checkedAt: '2026-06-17T00:00:00.000Z',
        url: 'https://www.facebook.com/share/p/example',
        finalUrl: 'https://www.facebook.com/huntersalehouse/posts/123456789',
        httpStatus: 200,
        reason: 'Public URL returned usable metadata without user credentials.',
        titleFound: true,
        descriptionFound: true,
        title: "Hunter's Ale House",
        description: [
          'the week is loaded and we are ready for it. &#x1f3b8;&#x1f37a;',
          '&#x1f5d3; Thur June 18 &#x2014; Travis & Juline Acoustic Night &#064; 10pm (Trivia w/ Darcy from 9)',
          '&#x1f5d3; Fri June 19 &#x2014; Mat & Ryan Live Music &#064; 10pm',
          '&#x1f5d3; Sat June 20 &#x2014; Gin N Tonic Live Music Night &#064; 10pm',
          '&#x1f5d3; Sun June 21 &#x2014; Music Trivia w/ Andrew Rollins &#064; 9pm',
        ].join('\n'),
        ogType: 'video.other',
      },
    });

    assert.equal(parsedEvents.length, 4);
    assert.deepEqual(
      parsedEvents.map((event) => ({
        title: event.title,
        startDate: event.startDate,
        startTime: event.startTime,
        locationName: event.locationName,
        reviewReasons: event.reviewReasons,
      })),
      [
        {
          title: 'Travis & Juline Acoustic Night',
          startDate: '2026-06-18',
          startTime: '22:00',
          locationName: "Hunter's Ale House",
          reviewReasons: [],
        },
        {
          title: 'Mat & Ryan Live Music',
          startDate: '2026-06-19',
          startTime: '22:00',
          locationName: "Hunter's Ale House",
          reviewReasons: [],
        },
        {
          title: 'Gin N Tonic Live Music Night',
          startDate: '2026-06-20',
          startTime: '22:00',
          locationName: "Hunter's Ale House",
          reviewReasons: [],
        },
        {
          title: 'Music Trivia w/ Andrew Rollins',
          startDate: '2026-06-21',
          startTime: '21:00',
          locationName: "Hunter's Ale House",
          reviewReasons: [],
        },
      ]
    );
  } finally {
    Settings.now = originalNow;
  }
});

test('facebook public schedule posts submit current events without old extracted rows', async () => {
  const originalNow = Settings.now;
  Settings.now = () => new Date('2026-06-18T22:58:00.000Z').getTime();

  try {
    const parsedEvents = await parseSharedEventPayloads({
      sourceUrl: 'https://www.facebook.com/share/p/mixed-schedule-example',
      sharedText: 'https://www.facebook.com/share/p/mixed-schedule-example',
    }, {
      sourceVisibility: 'public_verified',
      visibilityEvidence: {
        method: 'public_url_probe',
        checkedAt: '2026-06-18T22:58:00.000Z',
        url: 'https://www.facebook.com/share/p/mixed-schedule-example',
        finalUrl: 'https://www.facebook.com/huntersalehouse/posts/987654321',
        httpStatus: 200,
        reason: 'Public URL returned usable metadata without user credentials.',
        titleFound: true,
        descriptionFound: true,
        title: "Hunter's Ale House",
        description: [
          'More events this week at Hunter\'s Ale House.',
          'Wed June 17 - Already Done Band @ 10pm',
          'Fri June 19 - Still Coming Band @ 10pm',
        ].join('\n'),
        ogType: 'article',
      },
    });

    assert.equal(parsedEvents.length, 1);
    assert.deepEqual(
      parsedEvents.map((event) => ({
        title: event.title,
        startDate: event.startDate,
        status: event.status,
        routing: event.routing,
        isExpired: event.isExpired,
        reviewReasons: event.reviewReasons,
      })),
      [
        {
          title: 'Still Coming Band',
          startDate: '2026-06-19',
          status: 'submitted_public_candidate',
          routing: 'public_candidate',
          isExpired: false,
          reviewReasons: [],
        },
      ]
    );
  } finally {
    Settings.now = originalNow;
  }
});

test('calendar image extraction conversion keeps expired events, future events, and specials', async () => {
  const originalNow = Settings.now;
  Settings.now = () => new Date('2026-06-18T22:58:00.000Z').getTime();

  try {
    const primary = await parseSharedEventPayload({
      sourceUrl: 'https://www.facebook.com/share/p/babas-calendar',
      sharedText: 'June!!',
      mediaUrls: ['https://example.com/babas-june-calendar.jpg'],
      timezone: 'America/Halifax',
    }, {
      sourceVisibility: 'public_verified',
      visibilityEvidence: {
        method: 'public_url_probe',
        checkedAt: '2026-06-18T22:58:00.000Z',
        url: 'https://www.facebook.com/share/p/babas-calendar',
        finalUrl: 'https://www.facebook.com/babaslounge/posts/123456789',
        httpStatus: 200,
        reason: 'Public URL returned usable metadata without user credentials.',
        titleFound: true,
        descriptionFound: true,
        title: "Baba's Lounge",
        description: 'June!!',
        imageUrl: 'https://example.com/babas-june-calendar.jpg',
        ogType: 'article',
        sourcePublishedAt: '2026-05-26T12:00:00.000-03:00',
      },
    });

    const parsedEvents = buildCalendarImageParsedEventsForRegression(primary, [
      {
        name: 'Rat Tales Comedy Night',
        type: 'event',
        date: '2026-06-15',
        startTime: '10pm',
        venue: '',
        description: 'Extracted from June calendar image.',
      },
      {
        name: 'Island Jazz ft. Sean Ferris',
        type: 'event',
        date: '2026-06-25',
        startTime: '8pm',
        venue: '',
        description: 'Extracted from June calendar image.',
      },
      {
        name: 'Happy Hour: $6 Pint w/ Appetizer',
        type: 'special',
        date: '2026-06-30',
        startTime: '',
        venue: '',
        description: 'Drink special.',
      },
    ]);

    assert.equal(parsedEvents.length, 3);
    assert.deepEqual(
      parsedEvents.map((event) => ({
        title: event.title,
        startDate: event.startDate,
        startTime: event.startTime,
        locationName: event.locationName,
        status: event.status,
        routing: event.routing,
        reviewReasons: event.reviewReasons,
      })),
      [
        {
          title: 'Rat Tales Comedy Night',
          startDate: '2026-06-15',
          startTime: '22:00',
          locationName: "Baba's Lounge",
          status: 'expired',
          routing: 'not_public_candidate',
          reviewReasons: ['event_expired'],
        },
        {
          title: 'Island Jazz ft. Sean Ferris',
          startDate: '2026-06-25',
          startTime: '20:00',
          locationName: "Baba's Lounge",
          status: 'submitted_public_candidate',
          routing: 'public_candidate',
          reviewReasons: [],
        },
        {
          title: 'Happy Hour: $6 Pint w/ Appetizer',
          startDate: '2026-06-30',
          startTime: undefined,
          locationName: "Baba's Lounge",
          status: 'submitted_public_candidate',
          routing: 'public_candidate',
          reviewReasons: [],
        },
      ]
    );

    const submissionEvents = selectParsedEventsForSubmissionForRegression(parsedEvents);
    assert.deepEqual(
      submissionEvents.map((event) => event.title),
      ['Island Jazz ft. Sean Ferris', 'Happy Hour: $6 Pint w/ Appetizer']
    );
  } finally {
    Settings.now = originalNow;
  }
});

test('calendar image venue cleanup removes Facebook activity text', async () => {
  const primary = await parseSharedEventPayload({
    sourceUrl: 'https://www.facebook.com/share/p/peakes-kim-albert',
    sharedText: 'Kim Albert',
    mediaUrls: ['https://example.com/peakes-kim-albert.jpg'],
    timezone: 'America/Halifax',
  }, {
    sourceVisibility: 'public_verified',
    visibilityEvidence: {
      method: 'public_url_probe',
      checkedAt: '2026-06-19T10:00:00.000Z',
      url: 'https://www.facebook.com/share/p/peakes-kim-albert',
      finalUrl: 'https://www.facebook.com/peakesquay/posts/123456789',
      httpStatus: 200,
      reason: 'Public URL returned usable metadata without user credentials.',
      titleFound: true,
      descriptionFound: true,
      title: "Peake's Quay",
      description: "Peake's Quay added a new photo.",
      imageUrl: 'https://example.com/peakes-kim-albert.jpg',
      ogType: 'article',
      locationName: "Peake's Quay Restaurant & Bar",
    },
  });

  const parsedEvents = buildCalendarImageParsedEventsForRegression(primary, [
    {
      name: 'Kim Albert',
      type: 'event',
      date: '2026-06-20',
      startTime: '7pm',
      venue: "Peake's Quay - Peake's Quay added a new photo.",
      description: 'Extracted from shared calendar image.',
    },
  ]);

  assert.equal(parsedEvents.length, 1);
  assert.equal(parsedEvents[0].locationName, "Peake's Quay");
  assert.notEqual(parsedEvents[0].locationName, "Peake's Quay - Peake's Quay added a new photo.");
});

test('shared event merge collapses same title date and time with better venue', async () => {
  const primary = await parseSharedEventPayload({
    sourceUrl: 'https://www.facebook.com/share/p/peakes-kim-albert',
    title: 'Kim Albert',
    sharedText: 'Saturday June 20 | 7-10 PM',
    timezone: 'America/Halifax',
  }, {
    sourceVisibility: 'public_verified',
    visibilityEvidence: {
      method: 'public_url_probe',
      checkedAt: '2026-06-19T10:00:00.000Z',
      url: 'https://www.facebook.com/share/p/peakes-kim-albert',
      finalUrl: 'https://www.facebook.com/peakesquay/posts/123456789',
      httpStatus: 200,
      reason: 'Public URL returned usable metadata without user credentials.',
      titleFound: true,
      descriptionFound: true,
      title: "Peake's Quay",
      description: "Peake's Quay added a new photo.",
      ogType: 'article',
      locationName: "Peake's Quay Restaurant & Bar",
    },
  });

  const weakVenue = {
    ...primary,
    title: 'Kim Albert',
    startDate: '2026-06-20',
    endDate: '2026-06-20',
    startTime: '19:00',
    locationName: "Peake's Quay - Peake's Quay added a new photo.",
    confidence: 85,
  };
  const betterVenue = {
    ...primary,
    title: 'Kim Albert',
    startDate: '2026-06-20',
    endDate: '2026-06-20',
    startTime: '19:00',
    locationName: "Peake's Quay Restaurant & Bar",
    confidence: 95,
  };

  const merged = mergeExtractedParsedEventsForRegression([weakVenue], [betterVenue]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].title, 'Kim Albert');
  assert.equal(merged[0].startDate, '2026-06-20');
  assert.equal(merged[0].startTime, '19:00');
  assert.equal(merged[0].locationName, "Peake's Quay Restaurant & Bar");
});

test('shared event merge collapses same title and time when one candidate is missing date', async () => {
  const primary = await parseSharedEventPayload({
    sourceUrl: 'https://www.facebook.com/share/p/peakes-kim-albert',
    title: 'Kim Albert',
    sharedText: 'Saturday June 20 | 7-10 PM',
    timezone: 'America/Halifax',
  }, {
    sourceVisibility: 'public_verified',
    visibilityEvidence: {
      method: 'public_url_probe',
      checkedAt: '2026-06-19T10:00:00.000Z',
      url: 'https://www.facebook.com/share/p/peakes-kim-albert',
      finalUrl: 'https://www.facebook.com/peakesquay/posts/123456789',
      httpStatus: 200,
      reason: 'Public URL returned usable metadata without user credentials.',
      titleFound: true,
      descriptionFound: true,
      title: "Peake's Quay",
      description: "Peake's Quay added a new photo.",
      ogType: 'article',
      locationName: "Peake's Quay Restaurant & Bar",
    },
  });

  const datedCandidate = {
    ...primary,
    title: 'Kim Albert',
    startDate: '2026-06-20',
    endDate: '2026-06-20',
    startTime: '19:00',
    locationName: "Peake's Quay",
    reviewReasons: [],
    confidence: 95,
  };
  const missingDateCandidate = {
    ...primary,
    title: 'Kim Albert',
    startDate: undefined,
    endDate: undefined,
    startTime: '19:00',
    locationName: "Peake's Quay Restaurant & Bar",
    reviewReasons: ['missing_start_date'],
    confidence: 80,
  };

  const merged = mergeExtractedParsedEventsForRegression([datedCandidate], [missingDateCandidate]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].title, 'Kim Albert');
  assert.equal(merged[0].startDate, '2026-06-20');
  assert.equal(merged[0].startTime, '19:00');
  assert.equal(merged[0].locationName, "Peake's Quay");
  assert.deepEqual(merged[0].reviewReasons, []);
});

test('shared event merge drops same-slot placeholder when a better titled candidate exists', async () => {
  const primary = await parseSharedEventPayload({
    sourceUrl: 'https://www.facebook.com/share/p/founders-trivia',
    title: 'Trivia Night',
    sharedText: 'Trivia - Prizes - Family Friendly. Saturday June 27 at 5 PM',
    timezone: 'America/Halifax',
  }, {
    sourceVisibility: 'public_verified',
    visibilityEvidence: {
      method: 'public_url_probe',
      checkedAt: '2026-06-23T10:00:00.000Z',
      url: 'https://www.facebook.com/share/p/founders-trivia',
      finalUrl: 'https://www.facebook.com/founders/posts/123456789',
      httpStatus: 200,
      reason: 'Public URL returned usable metadata without user credentials.',
      titleFound: true,
      descriptionFound: true,
      title: 'Trivia Night',
      description: 'Join us for Trivia Fun! Trivia - Prizes - Family Friendly.',
      ogType: 'article',
      locationName: "Founders' Food Hall & Market",
    },
  });

  const placeholder = {
    ...primary,
    title: 'Event',
    description: 'Extracted from shared calendar image.',
    startDate: '2026-06-27',
    endDate: '2026-06-27',
    startTime: '17:00',
    endTime: '18:30',
    locationName: "Founders' Food Hall & Market",
    confidence: 82,
  };
  const specific = {
    ...placeholder,
    title: 'Trivia Night',
    description: 'Join us for Trivia Fun! Trivia - Prizes - Family Friendly.',
    confidence: 96,
  };

  const genericFirst = mergeExtractedParsedEventsForRegression([placeholder], [specific]);
  const specificFirst = mergeExtractedParsedEventsForRegression([specific], [placeholder]);

  assert.equal(genericFirst.length, 1);
  assert.equal(genericFirst[0].title, 'Trivia Night');
  assert.equal(specificFirst.length, 1);
  assert.equal(specificFirst[0].title, 'Trivia Night');
});

test('image-only calendar shares stay private while preserving extracted event details', async () => {
  const originalNow = Settings.now;
  Settings.now = () => new Date('2026-06-18T22:58:00.000Z').getTime();

  try {
    const primary = await parseSharedEventPayload({
      mediaUrls: ['https://example.com/downloaded-schedule.jpg'],
      sourceApp: 'native_share_sheet',
      timezone: 'America/Halifax',
    }, {
      sourceVisibility: 'unknown',
      visibilityEvidence: {
        method: 'no_url',
        checkedAt: '2026-06-18T22:58:00.000Z',
        reason: 'No public URL was included with the share payload.',
      },
    });

    const parsedEvents = buildCalendarImageParsedEventsForRegression(primary, [
      {
        name: 'Summer Kickoff Market',
        type: 'event',
        date: '2026-06-20',
        startTime: '3pm',
        venue: 'Founders Food Hall and Market',
        description: 'Extracted from downloaded schedule image.',
      },
    ]);

    assert.equal(parsedEvents.length, 1);
    assert.equal(parsedEvents[0].sourcePlatform, 'unknown');
    assert.equal(parsedEvents[0].sourceVisibility, 'unknown');
    assert.equal(parsedEvents[0].routing, 'private_only');
    assert.equal(parsedEvents[0].status, 'saved');
    assert.equal(parsedEvents[0].title, 'Summer Kickoff Market');
    assert.equal(parsedEvents[0].startDate, '2026-06-20');
    assert.equal(parsedEvents[0].startTime, '15:00');
    assert.equal(parsedEvents[0].locationName, 'Founders Food Hall and Market');
    assert.deepEqual(parsedEvents[0].reviewReasons, []);
  } finally {
    Settings.now = originalNow;
  }
});

test('shared photo specials preserve address, price, and finite multi-day recurrence', async () => {
  const originalNow = Settings.now;
  Settings.now = () => new Date('2026-08-22T15:00:00.000Z').getTime();

  try {
    const primary = await parseSharedEventPayload({
      mediaUrls: ['https://example.com/happy-hour.jpg'],
      sourceApp: 'native_share_sheet',
      timezone: 'America/Halifax',
    }, {
      sourceVisibility: 'user_private',
      visibilityEvidence: {
        method: 'no_url',
        checkedAt: '2026-08-22T15:00:00.000Z',
        reason: 'User photo.',
      },
    });

    const [special] = buildCalendarImageParsedEventsForRegression(primary, [{
      name: 'Happy Hour - Island Mussels',
      type: 'special',
      date: '2026-08-25',
      startTime: '16:00',
      endTime: '18:00',
      venue: 'Harbour House Bistro',
      address: '10 Water Street, Charlottetown, PE',
      description: 'Tuesday-Friday happy hour through September 30.',
      price: '$8',
      recurringPattern: 'weekly_custom',
      recurringDaysOfWeek: ['tuesday', 'wednesday', 'thursday', 'friday'],
      recurrenceUntilDate: '2026-09-30',
    }]);

    assert.equal(special.contentKind, 'special');
    assert.equal(special.address, '10 Water Street, Charlottetown, PE');
    assert.equal(special.price, '$8');
    assert.equal(special.recurringPattern, 'weekly_custom');
    assert.deepEqual(special.recurringDaysOfWeek, ['tuesday', 'wednesday', 'thursday', 'friday']);
    assert.equal(special.recurrenceUntilDate, '2026-09-30');
    assert.equal(special.isExpired, false);
    assert.equal(special.fieldSources?.address, 'uploaded_media');
  } finally {
    Settings.now = originalNow;
  }
});

test('shared photo specials recover structured price from title text when image extraction omits price', async () => {
  const primary = await parseSharedEventPayload({
    mediaUrls: ['https://example.com/happy-hour.jpg'],
    sourceApp: 'native_share_sheet',
    timezone: 'America/Halifax',
  }, {
    sourceVisibility: 'user_private',
    visibilityEvidence: {
      method: 'no_url',
      checkedAt: '2026-08-22T15:00:00.000Z',
      reason: 'User photo.',
    },
  });

  const parsed = buildCalendarImageParsedEventsForRegression(primary, [
    {
      name: '$8 Island Mussels',
      type: 'special',
      date: '2026-08-25',
      startTime: '16:00',
      venue: 'Harbour House Bistro',
      description: 'Tuesday-Friday happy hour.',
    },
    {
      name: 'Half-Price Mocktails',
      type: 'special',
      date: '2026-08-25',
      startTime: '16:00',
      venue: 'Harbour House Bistro',
      description: 'Tuesday-Friday happy hour.',
    },
  ]);

  assert.equal(parsed[0].price, '$8');
  assert.equal(parsed[1].price, 'Half-Price');
});

test('shared photo specials strip item names from structured offer fields', async () => {
  const primary = await parseSharedEventPayload({
    mediaUrls: ['https://example.com/happy-hour.jpg'],
    timezone: 'America/Halifax',
  }, {
    sourceVisibility: 'user_private',
    visibilityEvidence: {
      method: 'no_url',
      checkedAt: '2026-08-22T15:00:00.000Z',
      reason: 'User photo.',
    },
  });

  const parsed = buildCalendarImageParsedEventsForRegression(primary, [
    {
      name: 'Island Mussels',
      type: 'special',
      date: '2026-08-25',
      startTime: '16:00',
      venue: 'Harbour House Bistro',
      pricing: '$8 Island Mussels',
    },
    {
      name: 'Mocktails',
      type: 'special',
      date: '2026-08-25',
      startTime: '16:00',
      venue: 'Harbour House Bistro',
      pricing: 'Half-Price Mocktails',
    },
  ]);

  assert.equal(parsed[0].price, '$8');
  assert.equal(parsed[1].price, 'Half-Price');
});

test('route-like shared photos remain private review items with approximate geometry', async () => {
  const originalNow = Settings.now;
  Settings.now = () => new Date('2026-08-22T15:00:00.000Z').getTime();
  try {
    const primary = await parseSharedEventPayload({
      mediaUrls: ['https://example.com/route.jpg'],
      timezone: 'America/Halifax',
    }, {
      sourceVisibility: 'user_private',
      visibilityEvidence: {
        method: 'no_url',
        checkedAt: '2026-08-22T15:00:00.000Z',
        reason: 'User photo.',
      },
    });
    const [route] = buildCalendarImageParsedEventsForRegression(primary, [{
      name: 'Lantern Walk',
      type: 'event',
      date: '2026-09-19',
      startTime: '19:30',
      endTime: '21:00',
      venue: "Founders' Hall",
      description: "Start at Founders' Hall. Route follows the boardwalk. Finish at Victoria Park.",
    }]);

    assert.equal(route.routing, 'private_only');
    assert.equal(route.needsUserReview, true);
    assert.equal(route.locationScope, 'route');
    assert.equal(route.mapMode, 'route');
    assert.equal(route.locationPrecision, 'approximate');
    assert.ok(route.reviewReasons.includes('route_event_requires_review'));
  } finally {
    Settings.now = originalNow;
  }
});

test('priced calendar activities remain events when a validator tags them as specials', async () => {
  const primary = await parseSharedEventPayload({
    mediaUrls: ['https://example.com/community-calendar.jpg'],
    timezone: 'America/Halifax',
  }, {
    sourceVisibility: 'user_private',
    visibilityEvidence: {
      method: 'no_url',
      checkedAt: '2026-08-22T15:00:00.000Z',
      reason: 'User photo.',
    },
  });

  const parsed = buildCalendarImageParsedEventsForRegression(primary, [
    {
      name: 'Island Comedy Night',
      description: 'Friday September 11 at 7:30 PM. $18.',
      date: '2026-09-11',
      startTime: '19:30',
      endTime: '',
      venue: 'Harbourlight Community Hall',
      address: '9 Dale Drive, Charlottetown, PE',
      pricing: '$18',
      recurringPattern: 'none',
      extractionReason: 'Printed calendar row with ticket price.',
      _sourceType: 'special',
    },
    {
      name: 'Watercolour Workshop',
      description: 'Thursday September 17 at 6 PM. $35.',
      date: '2026-09-17',
      startTime: '18:00',
      endTime: '',
      venue: 'Harbourlight Community Hall',
      address: '9 Dale Drive, Charlottetown, PE',
      pricing: '$35',
      recurringPattern: 'none',
      extractionReason: 'Printed calendar row with ticket price.',
      _sourceType: 'special',
    },
  ]);

  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].contentKind, 'event');
  assert.equal(parsed[0].price, '$18');
  assert.equal(parsed[1].contentKind, 'event');
  assert.equal(parsed[1].price, '$35');
});

test('route photo recovers its printed start landmark without claiming an exact route', async () => {
  const primary = await parseSharedEventPayload({
    mediaUrls: ['https://example.com/lantern-route.jpg'],
    timezone: 'America/Halifax',
  }, {
    sourceVisibility: 'user_private',
    visibilityEvidence: {
      method: 'no_url',
      checkedAt: '2026-08-22T15:00:00.000Z',
      reason: 'User photo.',
    },
  });

  const [route] = buildCalendarImageParsedEventsForRegression(primary, [{
    name: 'Moonlight Lantern Walk',
    type: 'event',
    date: '2026-10-03',
    startTime: '19:00',
    venue: '',
    address: '',
    description: 'Start: Confederation Landing Gazebo. Follow the boardwalk. Finish: Victoria Park Pavilion.',
  }]);

  assert.equal(route.locationName, 'Confederation Landing Gazebo');
  assert.equal(route.locationScope, 'route');
  assert.equal(route.mapMode, 'route');
  assert.equal(route.locationPrecision, 'approximate');
  assert.equal(route.needsUserReview, true);
  assert.ok(route.reviewReasons.includes('route_event_requires_review'));
  assert.ok(!route.reviewReasons.includes('missing_location'));
});
