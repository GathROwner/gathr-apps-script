import test from 'node:test';
import assert from 'node:assert/strict';
import { Settings } from 'luxon';

import {
  buildCalendarImageParsedEventsForRegression,
  extractFacebookEmbeddedEventData,
  extractFacebookCanonicalStoryUrl,
  mergeExtractedParsedEventsForRegression,
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

test('facebook public schedule posts expire old extracted events without blocking future ones', async () => {
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

    assert.equal(parsedEvents.length, 2);
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
          title: 'Already Done Band',
          startDate: '2026-06-17',
          status: 'expired',
          routing: 'not_public_candidate',
          isExpired: true,
          reviewReasons: ['event_expired'],
        },
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
