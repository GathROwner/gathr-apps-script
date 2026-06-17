import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractFacebookEmbeddedEventData,
  parseSharedEventPayload,
  parseSharedEventPayloads,
  verifySharedEventSourceVisibility,
} from './sharedEventParser.js';

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

test('facebook public post text can expand into multiple event candidates', async () => {
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
      imageUrl: 'https://example.com/hunters.jpg',
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
});
