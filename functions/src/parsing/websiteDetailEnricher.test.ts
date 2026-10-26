import test from 'node:test';
import assert from 'node:assert/strict';

import { enrichEventsFromVenueWebsite, websiteCandidateTitleMatchesEventForRegression, eventDetailHtml,parseDetailPageCandidate } from './websiteDetailEnricher.js';
import { DEFAULT_PARSING_CONFIG, EstablishmentInfo, ExtractedItem } from './types.js';

function buildEventItem(overrides: Partial<ExtractedItem> = {}): ExtractedItem {
  return {
    name: 'Website-backed event',
    description: '',
    date: '2026-05-07',
    startTime: '',
    endTime: '',
    venue: 'Test Venue',
    price: '',
    recurringPattern: 'none',
    extractionReason: 'test',
    _sourceType: 'event',
    ...overrides,
  } as ExtractedItem;
}

function installFetchMap(
  handlers: Record<string, Response | (() => Response | Promise<Response>)>
): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: any) => {
    const url = typeof input === 'string' ? input : String(input?.url || '');
    const handler = handlers[url];
    if (!handler) {
      throw new Error(`Unexpected fetch: ${url}`);
    }
    return typeof handler === 'function' ? await handler() : handler;
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function htmlResponse(html: string): Response {
  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function jsResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/javascript; charset=utf-8' },
  });
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

test('course registration open/close clocks cannot become lesson hours, while labelled class clocks remain usable',async()=>{
 for(const [labelled,expected]of [[false,''],[true,'18:15']] as const){
  const page='https://fixture-curling.example/programs/learn-to-curl';
  const html='<html><h1>Learn to Curl</h1><p>Starts November 12, 2026 at 8:06 am. Ends December 17, 2026 at 8:06 am. Registration opens October 3 at 8:06 am and closes December 17 at 8:06 am.</p>'+
   (labelled?'<p>Class starts at 6:15 pm.</p>':'')+'</html>';
  const result=parseDetailPageCandidate(page,html,2026);
  assert.equal(result?.startTime||'',expected);
 }
});

test('audition detail cannot borrow regular building, box-office or navigation clocks', async () => {
  const site = 'https://auditions-oct15.example/';
  const page = site + 'on-stage/submissions-auditions/';
  const html = '<html><head><title>General Musical Theatre Auditions</title></head><body>' +
    '<nav>Opening hours 8 a.m. - 6 p.m.</nav><main><h1>General Musical Theatre Auditions</h1>' +
    '<p>Audition Details Date: Monday, October 26 (evening).</p>' +
    '<p>Successful applicants will be notified where and when auditions take place.</p></main>' +
    '<footer>Box Office 10 a.m. - 5 p.m.</footer>' +
    '<div id="hoursofoperation"><div><p><strong>Regular Building Hours</strong>' +
    'Monday, Friday, Saturday: 8 a.m. - 6 p.m.</p></div></div></body></html>';
  assert(!eventDetailHtml(html).includes('8 a.m.'));
  const restore = installFetchMap({[site]: htmlResponse(`<a href="${page}">General Musical Theatre Auditions</a>`),
    [page]: htmlResponse(html)});
  try {
    const result = await enrichEventsFromVenueWebsite([buildEventItem({
      name:'General Musical Theatre Auditions',date:'2026-10-26',startTime:''})],
      `Auditions on the evening of October 26. Details ${page}`, '', '2026-10-15T12:00:00Z',
      {name:'Test Centre',website:site} as EstablishmentInfo, DEFAULT_PARSING_CONFIG);
    assert.equal(result.items[0].startTime,'');
    assert.equal(result.items[0].endTime,'');
  } finally {restore();}
});

test('event content clocks survive chrome removal and nested hours popups', () => {
  const html='<main><p>Workshop October 26 at 7:30 pm.</p></main>' +
    '<div id="hoursofoperation"><div><div>8 am - 6 pm</div></div></div><p>Tickets available online.</p>';
  const event = eventDetailHtml(html);
  assert(event.includes('7:30 pm'));
  assert(event.includes('Tickets available online'));
  assert(!event.includes('8 am'));
  assert(eventDetailHtml('<article><header><h1>Workshop</h1><p>October 26 at 7:30 pm</p></header></article>').includes('7:30 pm'));
});

test('a tour stop cannot borrow the same show time from another explicitly dated stop', async () => {
  const page = 'https://sourisshowhall.example/events/two-pianos';
  const restoreFetch = installFetchMap({
    [page]: htmlResponse(`<html><head><title>Two Pianos</title></head><body>
      <h1>Two Pianos</h1><p>Two Pianos October 24, 2026 at 7:30 pm.</p>
    </body></html>`),
  });
  try {
    const result = await enrichEventsFromVenueWebsite([
      buildEventItem({ name: 'Two Pianos', date: '2026-10-24', venue: 'Souris Show Hall' }),
      buildEventItem({ name: 'Two Pianos', date: '2026-10-30', venue: 'PEI Brewing Company' }),
    ], `Details at ${page}`, '', '2026-10-10T12:00:00Z',
    { name: 'Souris Show Hall', website: page } as EstablishmentInfo,
    { ...DEFAULT_PARSING_CONFIG, lunaCalendarLiteralSourcePrompt: true });
    assert.equal(result.items[0].startTime, '19:30');
    assert.equal(result.items[1].startTime, '');
    assert.equal(result.summary.appliedCount, 1);
  } finally { restoreFetch(); }
});

test('a bookstore sub-event cannot lend its time to the campus fall open house', () => {
  assert.equal(websiteCandidateTitleMatchesEventForRegression(
    'Fall Open House', 'Bookstore Open House'), false);
  assert.equal(websiteCandidateTitleMatchesEventForRegression(
    'Fall Open House', 'UPEI Fall Open House'), true);
  assert.equal(websiteCandidateTitleMatchesEventForRegression(
    'Open House', 'Bookstore Open House'), false);
  assert.equal(websiteCandidateTitleMatchesEventForRegression(
    'Open House', 'Open House'), true);
});

test('a hidden historical schedule in an HTML comment cannot supply an open-house time', async () => {
  const page = 'https://campus.example/future-students/open-house';
  const restoreFetch = installFetchMap({
    [page]: htmlResponse(`<html><head><title>Fall Open House</title></head><body>
      <h1>Fall Open House</h1><p>Join us October 24, 2026. Register for details.</p>
      <!-- <p>Fall Open House October 24, 2026 at 11:30 am to 12:15 pm.</p> -->
    </body></html>`),
  });
  try {
    const result = await enrichEventsFromVenueWebsite(
      [buildEventItem({ name: 'Fall Open House', date: '2026-10-24', startTime: '' })],
      `Details at ${page}`, '', '2026-10-07T12:00:00Z',
      { name: 'Campus', website: page } as EstablishmentInfo,
      { ...DEFAULT_PARSING_CONFIG, lunaCalendarLiteralSourcePrompt: true }
    );
    assert.equal(result.items[0].startTime, '');
    assert.equal(result.summary.appliedCount, 0);
  } finally {
    restoreFetch();
  }
});

test('a festival date-range page does not lend a child performance time to untimed parent days', async () => {
  const listing = 'https://riverclydearts.com/field';
  const detail = 'https://riverclydearts.com/field/tale';
  const restoreFetch = installFetchMap({
    [listing]: htmlResponse(`<html><body><a href="${detail}">Sharing the Field details</a></body></html>`),
    [detail]: htmlResponse('<html><head><meta property="og:title" content="Sharing the Field"></head><body><h1>Sharing the Field</h1><p>October 2 to October 4, 2026. A Gorgon’s Tale is Saturday, October 3, 4:00pm–5:00pm.</p></body></html>'),
  });

  try {
    const input = buildEventItem({ name: 'Sharing the Field', date: '2026-10-02',
      startTime: '', _sourceType: 'schedule' });
    const result = await enrichEventsFromVenueWebsite(
      [input], `See more info at ${listing}`, '', '2026-10-01T15:00:00Z',
      { name: 'River Clyde Arts', website: listing } as EstablishmentInfo,
      DEFAULT_PARSING_CONFIG
    );
    assert.ok(result.summary.candidateItemsFound > 0);
    assert.equal(result.items[0].startTime, '');
    assert.equal(result.summary.appliedCount, 0);
  } finally {
    restoreFetch();
  }
});

test('Luna matches a linked article paragraph to its dated rally and two weekday class times', async () => {
  const article = 'https://miltonvalepark.com/october-1-2026/luna-regression';
  const restoreFetch = installFetchMap({
    [article]: htmlResponse(`<html><body>
      <h1>October community update</h1>
      <p>Saturday, Oct. 3 at 10:30 a.m. – Car Rally – Teams explore Miltonvale Park.</p>
      <p>TUESDAYS – Square Dancing at 2 p.m. No classes on Oct. 6.</p>
      <p>NEW TIMES! Milton Hall- TUESDAYS – YOGA with Leone 8:30 a.m. – Mat Yoga and 10 a.m. -Chair Yoga.</p>
    </body></html>`),
  });
  const items = [
    buildEventItem({ name: 'Car Rally', date: '2026-10-03', startTime: 'unknown' }),
    buildEventItem({ name: 'Yoga', date: '2026-10-06', startTime: 'unknown' }),
    buildEventItem({ name: 'Yoga', date: '2026-10-06', startTime: 'unknown' }),
  ];
  try {
    const result = await enrichEventsFromVenueWebsite(
      items, `More info at ${article}`, '', '2026-10-02T17:00:31Z',
      { name: 'Milton Community Hall', website: article } as EstablishmentInfo,
      { ...DEFAULT_PARSING_CONFIG, lunaCalendarLiteralSourcePrompt: true }
    );
    assert.deepEqual(result.items.map(item => item.startTime), ['10:30', '08:30', '10:00']);
    assert.match(String(result.items[0].timeFlags?.end?.evidence), /approximate end omitted/);
    assert.equal(result.summary.appliedCount, 3);
  } finally {
    restoreFetch();
  }
});

test('a named dining series lends only its own published evening time to individually listed dates', async () => {
  const detail = 'https://innatbayfortune.example/special-events/chefs-harvest/';
  const restoreFetch = installFetchMap({
    [detail]: htmlResponse(`<html><body>
      <h1>Chefs&#8217; Harvest Dining Series</h1>
      <p>October 15, 16, 17 | October 22, 23, 24 | November 5, 6, 7</p>
      <p>October 15–17 | Forager menu</p>
      <li>3:00 PM | Check In</li>
      <li>5:00–9:30 PM | Chefs’ Harvest Dining Series Experience the full evening</li>
      <li>9:30–10:30 PM | Fire Bar</li>
    </body></html>`),
  });
  try {
    const items = [
      buildEventItem({ name: 'Chef’s Harvest Dining Series', date: '2026-10-15', startTime: 'unknown' }),
      buildEventItem({ name: 'Chef’s Harvest Dining Series', date: '2026-10-24', startTime: 'unknown' }),
      buildEventItem({ name: 'Chef’s Harvest Dining Series', date: '2026-11-07', startTime: 'unknown' }),
      buildEventItem({ name: 'Chef’s Harvest Dining Series', date: '2026-10-18', startTime: 'unknown' }),
      buildEventItem({ name: 'Different dinner', date: '2026-10-15', startTime: 'unknown' }),
    ];
    const result = await enrichEventsFromVenueWebsite(
      items, `Details at ${detail}`, '', '2026-10-02T15:00:00Z',
      { name: 'The Inn', website: detail } as EstablishmentInfo, DEFAULT_PARSING_CONFIG
    );
    assert.deepEqual(result.items.map(item => item.startTime),
      ['17:00', '17:00', '17:00', 'unknown', 'unknown']);
    assert.equal(result.summary.appliedCount, 3);
  } finally {
    restoreFetch();
  }
});

test('Trailside-style website follow-up recovers explicit start times from locarius-backed site data', async () => {
  const restoreFetch = installFetchMap({
    'https://trailside.ca/': htmlResponse(
      '<html><head></head><body><script src="/static/js/main.js"></script></body></html>'
    ),
    'https://trailside.ca/static/js/main.js': jsResponse(
      'const y={getNewProvider:function(){return w({url:"https://api.prod.locarius.io/v1/data/1820/events/",method:"GET",params:{token:"54Y0FsqKowhayVRSZ10a9Exg73bsqIcg"}})}};'
    ),
    'https://api.prod.locarius.io/v1/data/1820/events/?token=54Y0FsqKowhayVRSZ10a9Exg73bsqIcg': jsonResponse({
      body: {
        result: [
          {
            name: "Wouldn't It Be Nice? A Night of the Beach Boys - May 7th",
            description: { text: 'Doors 6:30, show at 8:00.' },
            url: 'https://locarius.io/events/3817/beach-boys-may-7',
            logo: 'https://img.locarius.io/beach-boys-may-7.jpg',
            start: {
              timezone: 'America/Halifax',
              utc: '2026-05-07T23:00:00.000Z',
            },
          },
          {
            name: "Wouldn't It Be Nice? A Night of the Beach Boys - May 8th",
            description: { text: 'Doors 6:30, show at 8:00.' },
            url: 'https://locarius.io/events/3818/beach-boys-may-8',
            logo: 'https://img.locarius.io/beach-boys-may-8.jpg',
            start: {
              timezone: 'America/Halifax',
              utc: '2026-05-08T23:00:00.000Z',
            },
          },
          {
            name: "Wouldn't It Be Nice? A Night of the Beach Boys - May 9th",
            description: { text: 'Doors 6:30, show at 8:00.' },
            url: 'https://locarius.io/events/3819/beach-boys-may-9',
            logo: 'https://img.locarius.io/beach-boys-may-9.jpg',
            start: {
              timezone: 'America/Halifax',
              utc: '2026-05-09T23:00:00.000Z',
            },
          },
        ],
      },
    }),
  });

  try {
    const items = [
      buildEventItem({
        name: 'Show at Trailside Music Hall (May 7)',
        date: '2026-05-07',
        startTime: 'unknown',
      }),
      buildEventItem({
        name: 'Show at Trailside Music Hall (May 8)',
        date: '2026-05-08',
        startTime: 'unknown',
      }),
      buildEventItem({
        name: 'Show at Trailside Music Hall (May 9)',
        date: '2026-05-09',
        startTime: 'unknown',
      }),
    ];

    const establishmentInfo: EstablishmentInfo = {
      name: 'Trailside Music Hall',
      website: 'https://trailside.ca/',
    };

    const result = await enrichEventsFromVenueWebsite(
      items,
      'Tickets available through link in bio or Trailside.ca',
      '',
      '2026-04-29T15:00:00.000Z',
      establishmentInfo,
      DEFAULT_PARSING_CONFIG
    );

    assert.equal(result.summary.appliedCount, 3);
    assert.equal(result.summary.apiRequestsAttempted, 1);
    assert.equal(result.summary.apiRecordsFetched, 3);
    assert.equal(result.items[0].startTime, '20:00');
    assert.equal(result.items[1].startTime, '20:00');
    assert.equal(result.items[2].startTime, '20:00');
    assert.equal((result.items[0] as any).ticketLink, 'https://locarius.io/events/3817/beach-boys-may-7');
    assert.equal((result.items[0] as any)._ticketImageUrl, 'https://img.locarius.io/beach-boys-may-7.jpg');
    assert.match(String(result.items[0].timeFlags?.start?.evidence || ''), /venue_website:/i);
  } finally {
    restoreFetch();
  }
});

test('first-party Locarius proxy recovers the matched show time without lending another same-day show', async () => {
  const site = 'https://trailside-proxy.example/';
  const restoreFetch = installFetchMap({
    [site]: htmlResponse('<html><body><script src="/static/js/main.js"></script></body></html>'),
    'https://trailside-proxy.example/static/js/main.js': jsResponse(
      'const api=axios.create({baseURL:"/api"});api.get("/events/locarius")'
    ),
    'https://trailside-proxy.example/api/events/locarius': jsonResponse({
      body: { result: [
        { name: 'Other Band - October 8th', start: { timezone: 'America/Halifax',
          local: 'Thursday, October 8, 2026 at 07:00 PM' } },
        { name: 'Fucked Up - October 8th - Doors 6:30 PM - Showtime 8 PM',
          url: 'https://locarius.io/events/4551/fucked-up',
          start: { timezone: 'America/Halifax', local: 'Thursday, October 8, 2026 at 08:00 PM' } },
      ] },
    }),
  });
  try {
    const item = buildEventItem({
      name: 'Fucked Up with special guest opener Club Rat',
      date: '2026-10-08', startTime: 'unknown',
    });
    const result = await enrichEventsFromVenueWebsite(
      [item], 'Tickets on sale at www.trailside-proxy.example.', '',
      '2026-10-05T12:00:00Z',
      { name: 'Trailside Music Hall', website: site } as EstablishmentInfo,
      DEFAULT_PARSING_CONFIG
    );
    assert.equal(result.summary.apiRequestsAttempted, 1);
    assert.equal(result.summary.apiRecordsFetched, 2);
    assert.equal(result.summary.appliedCount, 1);
    assert.equal(result.items[0].startTime, '20:00');
    assert.equal((result.items[0] as any).ticketLink, 'https://locarius.io/events/4551/fucked-up');

    const unrelated = await enrichEventsFromVenueWebsite(
      [buildEventItem({ name: 'Completely Different Performer',
        date: '2026-10-08', startTime: 'unknown' })],
      'Tickets on sale at www.trailside-proxy.example.', '',
      '2026-10-05T12:00:00Z',
      { name: 'Trailside Music Hall', website: site } as EstablishmentInfo,
      DEFAULT_PARSING_CONFIG
    );
    assert.equal(unrelated.summary.appliedCount, 0);
    assert.equal(unrelated.items[0].startTime, 'unknown');
  } finally {
    restoreFetch();
  }
});

test('explicit named seatings split one website-backed gallery event without exactizing approximate ends', async () => {
  const detailUrl = 'https://fallflavours.ca/signature-event/taste-of-georgetown-2/';
  const restoreFetch = installFetchMap({
    'https://fallflavours.ca/': htmlResponse(
      `<html><body><a href="${detailUrl}">Taste of Georgetown</a></body></html>`
    ),
    [detailUrl]: htmlResponse(
      '<html><head><meta property="og:title" content="Taste of Georgetown"></head><body>' +
      '<h1>Taste of Georgetown</h1><p>Friday, October 2. Two distinct culinary and cultural experiences.</p>' +
      '<p>Garden Lunch Experience (12:00 p.m. – approx. 2:00 p.m.)</p>' +
      '<p>Evening Dinner Experience (6:00 p.m. – approx. 9:00 p.m.)</p></body></html>'
    ),
    'https://fallflavours.ca/signature-event/taste-of-georgetown-2': htmlResponse(
      '<html><head><meta property="og:title" content="Taste of Georgetown"></head><body>' +
      '<h1>Taste of Georgetown</h1><p>Friday, October 2. Two distinct culinary and cultural experiences.</p>' +
      '<p>Garden Lunch Experience (12:00 p.m. – approx. 2:00 p.m.)</p>' +
      '<p>Evening Dinner Experience (6:00 p.m. – approx. 9:00 p.m.)</p></body></html>'
    ),
  });

  try {
    const sourceItem = buildEventItem({
      name: 'Taste of Georgetown Live Performances',
      date: '2026-10-02',
      startTime: '',
      _sourceImageIndex: 2,
    } as any);
    const caption = `At both the lunch and the dinner seatings of Taste of Georgetown on October 2,` +
      ` enjoy performances. Tickets on our website: ${detailUrl}`;
    const result = await enrichEventsFromVenueWebsite(
      [sourceItem], caption, '', '2026-10-01T12:00:00.000Z',
      { name: 'Kings Playhouse', website: 'https://fallflavours.ca/' }, DEFAULT_PARSING_CONFIG
    );
    assert.equal(result.summary.reason, 'split_explicit_named_website_seatings');
    assert.deepEqual(result.items.map(item => [item.startTime, item.endTime]),
      [['12:00', ''], ['18:00', '']]);
    assert.deepEqual(result.items.map(item => (item as any)._sourceImageIndex), [2, 2]);
    assert.equal(result.items.every(item => item.timeFlags?.end?.source !== 'explicit'), true);
    assert.deepEqual(result.items.map(item => item.name), [
      'Taste of Georgetown: Garden Lunch Experience',
      'Taste of Georgetown: Evening Dinner Experience',
    ]);

    const colonTitle = await enrichEventsFromVenueWebsite(
      [{ ...sourceItem, name: 'Taste of Georgetown:' }], caption, '',
      '2026-10-01T12:00:00.000Z',
      { name: 'Kings Playhouse', website: 'https://fallflavours.ca/' }, DEFAULT_PARSING_CONFIG
    );
    assert.deepEqual(colonTitle.items.map(item => item.name), [
      'Taste of Georgetown: Garden Lunch Experience',
      'Taste of Georgetown: Evening Dinner Experience',
    ]);

    const lunchOnly = await enrichEventsFromVenueWebsite(
      [sourceItem], `Join us for lunch. Tickets available at ${detailUrl}`, '',
      '2026-10-01T12:00:00.000Z',
      { name: 'Kings Playhouse', website: 'https://fallflavours.ca/' }, DEFAULT_PARSING_CONFIG
    );
    assert.equal(lunchOnly.items.length, 1);
  } finally {
    restoreFetch();
  }
});

test('repeated same-day starts reconcile to uniquely named linked-page seatings and preserve unrelated events', async () => {
  const detailUrl = 'https://harbourtable.example/events/october-table';
  const restoreFetch = installFetchMap({
    [detailUrl]: htmlResponse(
      '<html><head><meta property="og:title" content="Harbour Table"></head><body>' +
      '<h1>Harbour Table</h1><p>October 2, 2026.</p>' +
      '<h2>Garden Gathering (11:30 a.m. – 1:00 p.m.)</h2>' +
      '<h2>Twilight Supper (6:15 p.m. – approx. 8:30 p.m.)</h2></body></html>'
    ),
  });

  try {
    const garden = buildEventItem({
      name: 'Harbour Table: Garden Gathering',
      date: '2026-10-02',
      startTime: '11:30',
      endTime: '',
    });
    const twilight = buildEventItem({
      name: 'Harbour Table: Twilight Supper',
      date: '2026-10-02',
      startTime: '11:30',
      endTime: '01:00',
    });
    const unrelated = buildEventItem({
      name: 'Harbour Theatre: Late Show',
      date: '2026-10-02',
      startTime: '19:30',
      endTime: '21:00',
    });
    const caption = `Tickets and details: ${detailUrl}`;
    const result = await enrichEventsFromVenueWebsite(
      [garden, twilight, unrelated], caption, '', '2026-10-01T12:00:00.000Z',
      undefined, DEFAULT_PARSING_CONFIG
    );

    assert.equal(result.summary.reason, 'reconciled_named_website_seating_times');
    assert.deepEqual(result.items.map(item => [item.name, item.startTime, item.endTime]), [
      ['Harbour Table: Garden Gathering', '11:30', '13:00'],
      ['Harbour Table: Twilight Supper', '18:15', ''],
      ['Harbour Theatre: Late Show', '19:30', '21:00'],
    ]);
    assert.equal(result.items[0].timeFlags?.end?.source, 'explicit');
    assert.equal(result.items[1].timeFlags?.start?.evidence.includes('Twilight Supper'), true);
    assert.equal(result.items[1].timeFlags?.end?.source, 'none');
    assert.equal(result.items[1].timeFlags?.end?.evidence.includes('approximate end omitted'), true);
    assert.equal(result.items.length, 3);
  } finally {
    restoreFetch();
  }
});

test('unknown extracted seating times resolve from their uniquely named linked-page sessions', async () => {
  const detailUrl = 'https://fallflavours.ca/signature-event/taste-of-georgetown-2';
  const restoreFetch = installFetchMap({
    [detailUrl]: htmlResponse(
      '<html><head><meta property="og:title" content="Taste of Georgetown"></head><body>' +
      '<h1>Taste of Georgetown</h1><p>Friday, October 2, 2026. Two distinct culinary experiences.</p>' +
      '<p><strong><em>Garden Lunch Experience (12:00 p.m. – approx. 2:00 p.m.)</em></strong></p>' +
      '<p><em><strong>Evening Dinner Experience (6:00 p.m. – approx. 9:00 p.m.)</strong></em></p>' +
      '</body></html>'
    ),
  });

  try {
    const items = [
      buildEventItem({
        name: 'Taste of Georgetown ? Lunch Seating',
        date: '2026-10-02',
        startTime: 'unknown',
        endTime: '',
      }),
      buildEventItem({
        name: 'Taste of Georgetown ? Dinner Seating',
        date: '2026-10-02',
        startTime: 'unknown',
        endTime: '',
      }),
    ];
    const result = await enrichEventsFromVenueWebsite(
      items, `Tickets and details: ${detailUrl}`, '', '2026-10-01T12:00:00.000Z',
      undefined, DEFAULT_PARSING_CONFIG
    );

    assert.equal(result.summary.reason, 'reconciled_named_website_seating_times');
    assert.equal(result.summary.appliedCount, 2);
    assert.deepEqual(result.items.map(item => [item.name, item.date, item.startTime, item.endTime]), [
      ['Taste of Georgetown ? Lunch Seating', '2026-10-02', '12:00', ''],
      ['Taste of Georgetown ? Dinner Seating', '2026-10-02', '18:00', ''],
    ]);
    assert.equal(result.items.every(item => (item as any).ticketLink === detailUrl), true);
    assert.equal(result.items[1].timeFlags?.start?.evidence.includes('Evening Dinner Experience'), true);
    assert.equal(result.items[1].timeFlags?.end?.evidence.includes('approximate end omitted'), true);
  } finally {
    restoreFetch();
  }
});

test('distinct populated starts are not overwritten by linked seating times', async () => {
  const detailUrl = 'https://fallflavours.ca/signature-event/taste-of-georgetown-2';
  const restoreFetch = installFetchMap({});
  try {
    const items = [
      buildEventItem({ name: 'Taste of Georgetown: Garden Lunch Experience', date: '2026-10-02', startTime: '12:00' }),
      buildEventItem({ name: 'Taste of Georgetown: Evening Dinner Experience', date: '2026-10-02', startTime: '18:00' }),
    ];
    const result = await enrichEventsFromVenueWebsite(
      items, `Details: ${detailUrl}`, '', '2026-10-01T12:00:00.000Z',
      undefined, DEFAULT_PARSING_CONFIG
    );

    assert.deepEqual(result.items.map(item => item.startTime), ['12:00', '18:00']);
    assert.equal(result.summary.reason, 'no_missing_event_time_candidates');
  } finally {
    restoreFetch();
  }
});

test('same-day time collisions stay unchanged when linked seating names do not identify extracted items', async () => {
  const detailUrl = 'https://harbourtable.example/events/october-table';
  const restoreFetch = installFetchMap({
    [detailUrl]: htmlResponse(
      '<html><head><meta property="og:title" content="Harbour Table"></head><body>' +
      '<h1>Harbour Table</h1><p>October 2, 2026.</p>' +
      '<h2>Garden Gathering (11:30 a.m. – approx. 1:00 p.m.)</h2>' +
      '<h2>Twilight Supper (6:15 p.m. – approx. 8:30 p.m.)</h2></body></html>'
    ),
  });

  try {
    const items = [
      buildEventItem({ name: 'Harbour Table', date: '2026-10-02', startTime: '11:30' }),
      buildEventItem({ name: 'Harbour Table', date: '2026-10-02', startTime: '11:30' }),
    ];
    const result = await enrichEventsFromVenueWebsite(
      items, `Details: ${detailUrl}`, '', '2026-10-01T12:00:00.000Z',
      undefined, DEFAULT_PARSING_CONFIG
    );

    assert.deepEqual(result.items.map(item => [item.name, item.startTime]), [
      ['Harbour Table', '11:30'],
      ['Harbour Table', '11:30'],
    ]);
    assert.equal(result.summary.updatedFields.times, 0);
  } finally {
    restoreFetch();
  }
});

test('ordinary direct detail pages do not enter the special two-seating path', async () => {
  const url = 'https://example.org/events/ordinary-show';
  const restoreFetch = installFetchMap({
    [url]: htmlResponse('<html><body><h1>Ordinary Show</h1><p>October 2 at 7:00 p.m.</p></body></html>'),
  });
  try {
    const result = await enrichEventsFromVenueWebsite(
      [buildEventItem({ name: 'Ordinary Show', date: '2026-10-02', startTime: '' })],
      `Details: ${url}`, '', '2026-10-01T12:00:00.000Z',
      undefined, DEFAULT_PARSING_CONFIG
    );
    assert.equal(result.items.length, 1);
    assert.equal(result.summary.appliedCount, 0);
  } finally {
    restoreFetch();
  }
});

test('Tivoli-style website follow-up attempts the venue site but fails closed when no showtimes exist on detail pages', async () => {
  const restoreFetch = installFetchMap({
    'https://tivolicinema.com/': htmlResponse(
      '<html><body><a href="/events/">Events</a><a href="/about-us/">About</a></body></html>'
    ),
    'https://tivolicinema.com/events/': htmlResponse(
      '<html><body><a href="/bleak-week/">BLEAK WEEK</a></body></html>'
    ),
    'https://tivolicinema.com/bleak-week/': htmlResponse(
      '<html><head><meta property="og:title" content="Bleak Week: Cinema of Despair"><meta property="og:image" content="https://tivolicinema.com/images/bleak-week.jpg"></head><body><h1>Bleak Week</h1><p>A week straight of cinema from Monday, June 1st to Sunday, June 7th. Check our schedule for showtimes and tickets!</p></body></html>'
    ),
  });

  try {
    const items = Array.from({ length: 7 }, (_, index) =>
      buildEventItem({
        name: `Bleak Week (${index + 1})`,
        date: `2026-06-${String(index + 1).padStart(2, '0')}`,
      })
    );

    const establishmentInfo: EstablishmentInfo = {
      name: 'The Tivoli Cinema',
      website: 'https://tivolicinema.com/',
    };

    const result = await enrichEventsFromVenueWebsite(
      items,
      'Visit our website for showtimes, tickets and details!',
      '',
      '2026-04-29T15:00:00.000Z',
      establishmentInfo,
      DEFAULT_PARSING_CONFIG
    );

    assert.equal(result.summary.attemptedUrls, 1);
    assert.equal(result.summary.listingPagesAttempted, 2);
    assert.equal(result.summary.detailPagesAttempted, 1);
    assert.equal(result.summary.appliedCount, 0);
    assert.equal(result.summary.reason, 'no_high_confidence_time_matches');
    assert.equal(result.items.every((item) => !item.startTime), true);
  } finally {
    restoreFetch();
  }
});
