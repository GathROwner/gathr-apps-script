import test from 'node:test';
import assert from 'node:assert/strict';

import { enrichEventsFromVenueWebsite } from './websiteDetailEnricher.js';
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
