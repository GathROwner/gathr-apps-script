import test from 'node:test';
import assert from 'node:assert/strict';

import { ProcessedEvent as ParserProcessedEvent } from '../parsing/types.js';
import { MatchInfo, RawRowData, VenueData } from '../types/index.js';
import { normalizeVenueName } from '../utils/similarity.js';
import { resolveVenueForFullParserEventWithMatcherForRegression } from './rowProcessor.js';

const foundersVenue: VenueData = {
  id: 'slug_foundersfoodhall',
  name: "Founders' Food Hall and Market",
  normalizedName: "founders' food hall and market",
  aliases: ["Founders' Hall Stage"],
  facebookUrl: 'https://www.facebook.com/foundersfoodhall',
  address: '6 Prince St, Charlottetown, PE C1A 4P5, Canada',
};

const peakesVenue: VenueData = {
  id: 'slug_peakesquaycharlottetown',
  name: "Peake's Quay",
  normalizedName: "peake's quay",
  aliases: ["Peake's Quay Stage"],
  facebookUrl: 'https://www.facebook.com/PeakesQuayCharlottetown',
  address: '11 Great George St, Charlottetown, PE C1A 4J7, Canada',
};

const underTheSpireVenue: VenueData = {
  id: 'slug_underthespire',
  name: 'Under the Spire | Kensington PE',
  normalizedName: 'under the spire kensington pe',
  aliases: [
    "St. Mary's Church, Indian River, PE",
    "Historic St. Mary's",
    "Historic St. Mary's Church",
  ],
  facebookUrl: 'https://www.facebook.com/underthespire/',
  address: '1374 Hamilton Rd. Route 104, Kensington, PE, Canada, C0B 1M0',
};

const belvedereVenue: VenueData = {
  id: 'AX91tBWrMCXUPA8BaV8Y',
  name: 'Belvedere Golf Course',
  normalizedName: 'belvedere golf course',
  aliases: ['Belvedere Golf Course (Charlottetown)'],
  facebookUrl: 'https://www.facebook.com/belvederegolfclub',
  address: '1 Greensview Dr, Charlottetown, PE C1A 6C3, Canada',
};

const charlottetownEventGroundsVenue: VenueData = {
  id: 'slug_charlottetown-event-grounds',
  name: 'Charlottetown Event Grounds',
  normalizedName: 'charlottetown event grounds',
  address: '360 Grafton St, Charlottetown, PE, Canada',
};

const peiLibrarySystemVenue: VenueData = {
  id: 'slug_peilibrary',
  name: 'PEI Public Library Service des bibliothèques publiques ÎPÉ',
  normalizedName: 'pei public library service des bibliotheques publiques ipe',
  facebookUrl: 'https://www.facebook.com/PEILibrary/',
  address: '89 Red Head Road, Morell, PE, Canada',
};

const cornwallPeiLibraryVenue: VenueData = {
  id: 'slug_cornwallpubliclibrary',
  name: 'Cornwall Public Library',
  normalizedName: 'cornwall public library',
  address: '15 Mercedes Dr, Cornwall, PE C0A 1H0, Canada',
  province: 'PE',
  googlePlaceId: 'ChIJUVZ4c-ysX0sRL5Gm8vFQsT0',
};

const cornwallOntarioLibraryVenue: VenueData = {
  id: 'slug_librarycornwallontario',
  name: 'Cornwall Public Library',
  normalizedName: 'cornwall public library',
  facebookUrl: 'https://www.facebook.com/librarycornwallontario',
  address: '45 Second St E, Cornwall, ON K6H 1Y3, Canada',
  province: 'ON',
};

const foundersRow = {
  uniqueId: '1621154443353403',
  text: "This Week: July 6 - July 12. Sounds of the Waterfront at Founders' Hall Stage and Peake's Quay Stage.",
  mediaUrls: [],
  facebookUrl: 'https://www.facebook.com/foundersfoodhall',
  pageName: 'Founders Food Hall',
  userName: "Founders' Food Hall and Market",
  timestamp: '2026-07-06T11:00:04.000Z',
} as RawRowData;

const exactPosterSchedule = [
  { date: '2026-07-06', start: '12:00', end: '14:00', name: 'Claire on Keys', stage: "Founders' Hall Stage", venueId: foundersVenue.id },
  { date: '2026-07-06', start: '17:00', end: '19:00', name: 'Kelley Mooney', stage: "Founders' Hall Stage", venueId: foundersVenue.id },
  { date: '2026-07-06', start: '14:00', end: '16:00', name: 'Brian Langille', stage: "Peake's Quay Stage", venueId: peakesVenue.id },
  { date: '2026-07-06', start: '17:00', end: '19:00', name: 'Kednall Docherty', stage: "Peake's Quay Stage", venueId: peakesVenue.id },
  { date: '2026-07-07', start: '12:00', end: '14:00', name: 'Rocklin Rd.', stage: "Founders' Hall Stage", venueId: foundersVenue.id },
  { date: '2026-07-07', start: '17:00', end: '19:00', name: "The Celtic's Step Trio", stage: "Founders' Hall Stage", venueId: foundersVenue.id },
  { date: '2026-07-07', start: '14:00', end: '16:00', name: 'We 3', stage: "Peake's Quay Stage", venueId: peakesVenue.id },
  { date: '2026-07-07', start: '17:00', end: '19:00', name: 'Dino and Judy', stage: "Peake's Quay Stage", venueId: peakesVenue.id },
  { date: '2026-07-08', start: '12:00', end: '14:00', name: 'Dan Dorion', stage: "Founders' Hall Stage", venueId: foundersVenue.id },
  { date: '2026-07-08', start: '17:00', end: '19:00', name: 'Frets and Keys', stage: "Founders' Hall Stage", venueId: foundersVenue.id },
  { date: '2026-07-08', start: '14:00', end: '16:00', name: 'Micheal Roves', stage: "Peake's Quay Stage", venueId: peakesVenue.id },
  { date: '2026-07-08', start: '17:00', end: '19:00', name: 'Steve and Marvin', stage: "Peake's Quay Stage", venueId: peakesVenue.id },
  { date: '2026-07-09', start: '12:00', end: '14:00', name: 'Olivia Blacquiere', stage: "Founders' Hall Stage", venueId: foundersVenue.id },
  { date: '2026-07-09', start: '17:00', end: '19:00', name: 'Gordon Butler', stage: "Founders' Hall Stage", venueId: foundersVenue.id },
  { date: '2026-07-09', start: '14:00', end: '16:00', name: 'Micheal Roves', stage: "Peake's Quay Stage", venueId: peakesVenue.id },
  { date: '2026-07-09', start: '17:00', end: '19:00', name: 'Dino & Judy', stage: "Peake's Quay Stage", venueId: peakesVenue.id },
  { date: '2026-07-10', start: '12:00', end: '14:00', name: 'Lucy Blu', stage: "Founders' Hall Stage", venueId: foundersVenue.id },
  { date: '2026-07-10', start: '17:00', end: '19:00', name: 'Adam MacGregor', stage: "Founders' Hall Stage", venueId: foundersVenue.id },
  { date: '2026-07-10', start: '14:00', end: '16:00', name: 'Gordon Belsher', stage: "Peake's Quay Stage", venueId: peakesVenue.id },
  { date: '2026-07-10', start: '17:00', end: '19:00', name: "Barry O'Brien", stage: "Peake's Quay Stage", venueId: peakesVenue.id },
  { date: '2026-07-11', start: '12:00', end: '14:00', name: 'Carter Maclellan', stage: "Founders' Hall Stage", venueId: foundersVenue.id },
  { date: '2026-07-11', start: '17:00', end: '19:00', name: 'DJ SUNSET PATIO', stage: "Founders' Hall Stage", venueId: foundersVenue.id },
  { date: '2026-07-11', start: '14:00', end: '16:00', name: 'David Woodside', stage: "Peake's Quay Stage", venueId: peakesVenue.id },
  { date: '2026-07-11', start: '17:00', end: '19:00', name: 'Dan Doiron', stage: "Peake's Quay Stage", venueId: peakesVenue.id },
  { date: '2026-07-12', start: '12:00', end: '14:00', name: 'Sound Eats the Boy', stage: "Founders' Hall Stage", venueId: foundersVenue.id },
  { date: '2026-07-12', start: '17:00', end: '19:00', name: 'Mike Stratton', stage: "Founders' Hall Stage", venueId: foundersVenue.id },
  { date: '2026-07-12', start: '14:00', end: '16:00', name: 'Macaroon', stage: "Peake's Quay Stage", venueId: peakesVenue.id },
  { date: '2026-07-12', start: '17:00', end: '19:00', name: "Barry O'Brien", stage: "Peake's Quay Stage", venueId: peakesVenue.id },
] as const;

async function matchKnownVenue(candidate: string): Promise<MatchInfo> {
  const normalized = normalizeVenueName(candidate);
  if (normalized.includes('peake')) {
    return { isMatch: true, matchType: 'fuzzy', similarity: 0.92, matchedVenue: peakesVenue };
  }
  if (normalized.includes('founders')) {
    return { isMatch: true, matchType: 'fuzzy', similarity: 0.92, matchedVenue: foundersVenue };
  }
  return { isMatch: false, matchType: 'none', similarity: 0 };
}

function malformedFormattedItem(entry: typeof exactPosterSchedule[number]): ParserProcessedEvent {
  return {
    id: foundersRow.uniqueId,
    name: entry.name,
    category: 'Live Music',
    isEvent: 'Yes',
    isFoodSpecial: 'No',
    establishment: foundersVenue.name,
    venue: foundersVenue.name,
    additionalLocation: entry.stage,
    startDate: entry.date,
    endDate: entry.date,
    startTime: entry.start,
    endTime: entry.end,
  } as ParserProcessedEvent;
}

test('Sounds of the Waterfront poster stage labels resolve all 28 performances to the correct venue', async () => {
  const actual: Array<{ name: string; date: string; start: string; venueId: string | undefined }> = [];

  for (const entry of exactPosterSchedule) {
    const resolved = await resolveVenueForFullParserEventWithMatcherForRegression({
      item: malformedFormattedItem(entry),
      rowVenue: foundersVenue,
      row: foundersRow,
      establishment: foundersVenue.name,
      rowIndex: 123,
      matcher: matchKnownVenue,
    });

    actual.push({
      name: entry.name,
      date: entry.date,
      start: entry.start,
      venueId: resolved?.id,
    });
    assert.equal(
      resolved?.id,
      entry.venueId,
      `${entry.date} ${entry.start} ${entry.name} should resolve from ${entry.stage} to ${entry.venueId}`
    );
  }

  assert.equal(actual.length, 28);
  assert.deepEqual(
    actual.filter((item) => item.date === '2026-07-09'),
    [
      { name: 'Olivia Blacquiere', date: '2026-07-09', start: '12:00', venueId: foundersVenue.id },
      { name: 'Gordon Butler', date: '2026-07-09', start: '17:00', venueId: foundersVenue.id },
      { name: 'Micheal Roves', date: '2026-07-09', start: '14:00', venueId: peakesVenue.id },
      { name: 'Dino & Judy', date: '2026-07-09', start: '17:00', venueId: peakesVenue.id },
    ]
  );
});

test('post-derived area labels bypass venue matching so they can queue city review', async () => {
  const row = {
    uniqueId: 'classic-car-night-post',
    text: 'Classic Car Night on Water Street in Downtown Summerside.',
    sharedPostText: 'Classic Car Night',
    mediaUrls: [],
    userName: 'Downtown Summerside',
    pageName: 'Downtown Summerside',
    timestamp: '2026-07-17T21:30:00.000Z',
    sourceScraperType: 'posts',
  } as RawRowData;

  const item = {
    name: 'Classic Car Night',
    venue: 'Downtown Summerside, PEI (Water Street)',
    startDate: '2026-07-17',
    startTime: '18:30',
  } as ParserProcessedEvent;

  const resolved = await resolveVenueForFullParserEventWithMatcherForRegression({
    item,
    rowVenue: null,
    row,
    establishment: 'Downtown Summerside',
    rowIndex: 233,
    matcher: async (candidate) => {
      if (normalizeVenueName(candidate).includes('downtown summerside')) {
        return {
          isMatch: true,
          matchType: 'fuzzy',
          similarity: 0.97,
          matchedVenue: {
            id: 'fb_100063593349606',
            name: 'Downtown Summerside | Summerside PE',
            normalizedName: 'downtown summerside summerside pe',
          } as VenueData,
        };
      }
      return { isMatch: false, matchType: 'none', similarity: 0 };
    },
  });

  assert.equal(resolved, null);
});

test('post-derived city hints still allow matching an existing poster venue', async () => {
  const row = {
    uniqueId: '1616703420462783',
    text: 'PEI! We are coming your way for a show as part of the wonderful Under The Spire concert series in Kensington!',
    sharedPostText: 'Under The Spire Concert Series show with The Hot Club Of Conception Bay',
    mediaUrls: [],
    facebookUrl: 'https://www.facebook.com/underthespire/',
    pageName: 'Under The Spire',
    userName: 'Under The Spire',
    timestamp: '2026-07-28T14:11:11.000Z',
    sourceScraperType: 'posts',
  } as RawRowData;

  const item = {
    name: 'Under The Spire Concert Series show with The Hot Club Of Conception Bay',
    additionalLocation: 'Kensington',
    startDate: '2026-08-02',
    startTime: '14:00',
  } as ParserProcessedEvent;

  const resolved = await resolveVenueForFullParserEventWithMatcherForRegression({
    item,
    rowVenue: null,
    row,
    establishment: 'Under The Spire',
    rowIndex: 204,
    matcher: async (candidate, facebookUrl) => {
      if (
        normalizeVenueName(candidate).includes('under the spire') &&
        facebookUrl === 'https://www.facebook.com/underthespire/'
      ) {
        return {
          isMatch: true,
          matchType: 'exact',
          similarity: 1,
          matchedVenue: underTheSpireVenue,
        };
      }
      return { isMatch: false, matchType: 'none', similarity: 0 };
    },
  });

  assert.equal(resolved?.id, underTheSpireVenue.id);
});

test('PEI Library system posts resolve Cornwall Public Library to the PEI branch venue', async () => {
  const row = {
    uniqueId: '1365076749141329',
    text: 'Cornwall Public Library programs. Footer: 15 Mercedes Drive, cornwall@gov.pe.ca, www.library.pe.ca, @PEILibrary.',
    sharedPostText: 'Cornwall Public Library programs',
    mediaUrls: [],
    facebookUrl: 'https://www.facebook.com/PEILibrary',
    pageName: 'PEI Public Library Service',
    userName: 'PEI Public Library Service des bibliothèques publiques ÎPÉ',
    timestamp: '2026-07-28T11:47:02.000Z',
    sourceScraperType: 'posts',
  } as RawRowData;

  const item = {
    name: 'Computer Help',
    establishment: 'Cornwall Public Library',
    venue: 'Cornwall Public Library',
    startDate: '2026-08-19',
    startTime: '14:00',
  } as ParserProcessedEvent;

  let observedRegionHint = '';
  const resolved = await resolveVenueForFullParserEventWithMatcherForRegression({
    item,
    rowVenue: peiLibrarySystemVenue,
    row,
    establishment: peiLibrarySystemVenue.name,
    rowIndex: 412,
    matcher: async (candidate, _facebookUrl, context) => {
      if (normalizeVenueName(candidate) === 'cornwall public library') {
        observedRegionHint = context?.regionHint || '';
        return {
          isMatch: true,
          matchType: 'exact',
          similarity: 1,
          matchedVenue:
            context?.regionHint === 'PE'
              ? cornwallPeiLibraryVenue
              : cornwallOntarioLibraryVenue,
        };
      }
      return { isMatch: false, matchType: 'none', similarity: 0 };
    },
  });

  assert.equal(observedRegionHint, 'PE');
  assert.equal(resolved?.id, cornwallPeiLibraryVenue.id);
});

test('Ontario Cornwall Library source does not receive the PEI Library source hint', async () => {
  const row = {
    uniqueId: '1058654909823084',
    text: 'Cornwall Public Library Ontario program.',
    mediaUrls: [],
    facebookUrl: 'https://www.facebook.com/librarycornwallontario',
    pageName: 'Cornwall Public Library',
    userName: 'Cornwall Public Library',
    timestamp: '2026-06-02T13:38:22.448Z',
    sourceScraperType: 'posts',
  } as RawRowData;

  const item = {
    name: 'Dungeons & Dragons',
    establishment: 'Cornwall Public Library',
    venue: 'Cornwall Public Library',
    startDate: '2026-08-25',
    startTime: '18:30',
  } as ParserProcessedEvent;

  let observedRegionHint = 'not-called';
  const resolved = await resolveVenueForFullParserEventWithMatcherForRegression({
    item,
    rowVenue: null,
    row,
    establishment: 'Cornwall Public Library',
    rowIndex: 413,
    matcher: async (candidate, facebookUrl, context) => {
      if (normalizeVenueName(candidate) === 'cornwall public library') {
        observedRegionHint = context?.regionHint || '';
        assert.equal(facebookUrl, 'https://www.facebook.com/librarycornwallontario');
        return {
          isMatch: true,
          matchType: 'exact',
          similarity: 1,
          matchedVenue: cornwallOntarioLibraryVenue,
        };
      }
      return { isMatch: false, matchType: 'none', similarity: 0 };
    },
  });

  assert.equal(observedRegionHint, '');
  assert.equal(resolved?.id, cornwallOntarioLibraryVenue.id);
});

test('venue names with trailing city resolve before city-level review fallback', async () => {
  const row = {
    uniqueId: '1362301356098470',
    text: 'The 27th annual Bragger’s Cup: Golf for Wishes will soon be underway at the beautiful Belvedere Golf Course in Charlottetown.',
    sharedPostText: 'Bragger’s Cup: Golf for Wishes',
    mediaUrls: [],
    facebookUrl: 'https://www.facebook.com/makeawishpe',
    pageName: 'makeawishpe',
    userName: 'Make-A-Wish Canada, PEI',
    timestamp: '2026-07-27T13:02:51.000Z',
    sourceScraperType: 'posts',
  } as RawRowData;

  const item = {
    name: 'Bragger’s Cup: Golf for Wishes (27th annual)',
    establishment: 'Belvedere Golf Course, Charlottetown',
    additionalLocation: 'Belvedere Golf Course, Charlottetown',
    startDate: '2026-08-02',
    startTime: '07:15',
  } as ParserProcessedEvent;

  const resolved = await resolveVenueForFullParserEventWithMatcherForRegression({
    item,
    rowVenue: {
      id: 'slug_makeawishpe',
      name: 'Make-A-Wish Canada, PEI',
      normalizedName: 'make a wish canada pei',
      facebookUrl: 'https://www.facebook.com/makeawishpe',
    } as VenueData,
    row,
    establishment: 'Make-A-Wish Canada, PEI',
    rowIndex: 145,
    matcher: async (candidate) => {
      if (normalizeVenueName(candidate) === 'belvedere golf course') {
        return {
          isMatch: true,
          matchType: 'exact',
          similarity: 1,
          matchedVenue: belvedereVenue,
        };
      }
      return { isMatch: false, matchType: 'none', similarity: 0 };
    },
  });

  assert.equal(resolved?.id, belvedereVenue.id);
});

test('official Shellfish Festival broad Charlottetown posts resolve to Event Grounds', async () => {
  const row = {
    uniqueId: '1677488677714318',
    text: 'The PEI International Shellfish Festival returns to Charlottetown for four unforgettable days. September 17-20, 2026.',
    sharedPostText: '',
    mediaUrls: [],
    facebookUrl: 'https://www.facebook.com/PEIshellfish',
    pageName: 'PEIshellfish',
    userName: 'PEI International Shellfish Festival',
    timestamp: '2026-07-29T22:08:20.000Z',
    sourceScraperType: 'posts',
  } as RawRowData;

  const rowVenue = {
    id: 'slug_peishellfish',
    name: 'PEI International Shellfish Festival | Charlottetown PE',
    normalizedName: 'pei international shellfish festival charlottetown pe',
    facebookUrl: 'https://www.facebook.com/PEIshellfish',
  } as VenueData;

  const item = {
    name: 'PEI International Shellfish Festival',
    establishment: 'Charlottetown',
    additionalLocation: 'Charlottetown',
    startDate: '2026-09-17',
    startTime: '17:00',
  } as ParserProcessedEvent;

  const resolved = await resolveVenueForFullParserEventWithMatcherForRegression({
    item,
    rowVenue,
    row,
    establishment: 'PEI International Shellfish Festival',
    rowIndex: 124,
    matcher: async (candidate) => {
      if (normalizeVenueName(candidate) === 'charlottetown event grounds') {
        return {
          isMatch: true,
          matchType: 'exact',
          similarity: 1,
          matchedVenue: charlottetownEventGroundsVenue,
        };
      }
      return { isMatch: false, matchType: 'none', similarity: 0 };
    },
  });

  assert.equal(resolved?.id, charlottetownEventGroundsVenue.id);
});

test('official Shellfish Festival posts with no parsed venue still use Event Grounds when source text names Charlottetown', async () => {
  const row = {
    uniqueId: '1677488677714318',
    text: 'The PEI International Shellfish Festival returns to Charlottetown for four unforgettable days. September 17-20, 2026.',
    sharedPostText: '',
    mediaUrls: [],
    facebookUrl: 'https://www.facebook.com/PEIshellfish',
    pageName: 'PEIshellfish',
    userName: 'PEI International Shellfish Festival',
    timestamp: '2026-07-29T22:08:20.000Z',
    sourceScraperType: 'posts',
  } as RawRowData;

  const rowVenue = {
    id: 'slug_peishellfish',
    name: 'PEI International Shellfish Festival | Charlottetown PE',
    normalizedName: 'pei international shellfish festival charlottetown pe',
    facebookUrl: 'https://www.facebook.com/PEIshellfish',
  } as VenueData;

  const item = {
    name: 'PEI International Shellfish Festival',
    description: 'PEI International Shellfish Festival returns to Charlottetown for four unforgettable days.',
    startDate: '2026-09-17',
    endDate: '2026-09-20',
    startTime: '17:00',
  } as ParserProcessedEvent;

  const resolved = await resolveVenueForFullParserEventWithMatcherForRegression({
    item,
    rowVenue,
    row,
    establishment: 'PEI International Shellfish Festival',
    rowIndex: 124,
    matcher: async (candidate) => {
      if (normalizeVenueName(candidate) === 'charlottetown event grounds') {
        return {
          isMatch: true,
          matchType: 'exact',
          similarity: 1,
          matchedVenue: charlottetownEventGroundsVenue,
        };
      }
      return { isMatch: false, matchType: 'none', similarity: 0 };
    },
  });

  assert.equal(resolved?.id, charlottetownEventGroundsVenue.id);
});

test('official Shellfish Festival subevents with organizer location use Event Grounds', async () => {
  const row = {
    uniqueId: '1631369492326237',
    text: 'GIRLS NIGHT OUT takes over the PEI International Shellfish Festival on September 18!',
    sharedPostText: '',
    mediaUrls: [],
    facebookUrl: 'https://www.facebook.com/PEIshellfish',
    pageName: 'PEIshellfish',
    userName: 'PEI International Shellfish Festival',
    timestamp: '2026-07-09T13:52:18.000Z',
    sourceScraperType: 'posts',
  } as RawRowData;

  const rowVenue = {
    id: 'slug_peishellfish',
    name: 'PEI International Shellfish Festival | Charlottetown PE',
    normalizedName: 'pei international shellfish festival charlottetown pe',
    facebookUrl: 'https://www.facebook.com/PEIshellfish',
  } as VenueData;

  const item = {
    name: 'Girls Night Out',
    description: 'Girls Night Out takes over the PEI International Shellfish Festival.',
    additionalLocation: 'PEI International Shellfish Festival',
    startDate: '2026-09-18',
    startTime: '17:00',
  } as ParserProcessedEvent;

  const resolved = await resolveVenueForFullParserEventWithMatcherForRegression({
    item,
    rowVenue,
    row,
    establishment: 'PEI International Shellfish Festival',
    rowIndex: 126,
    matcher: async (candidate) => {
      if (normalizeVenueName(candidate) === 'charlottetown event grounds') {
        return {
          isMatch: true,
          matchType: 'exact',
          similarity: 1,
          matchedVenue: charlottetownEventGroundsVenue,
        };
      }
      return { isMatch: false, matchType: 'none', similarity: 0 };
    },
  });

  assert.equal(resolved?.id, charlottetownEventGroundsVenue.id);
});

test('official Shellfish Festival posts keep explicit alternate venues', async () => {
  const row = {
    uniqueId: 'shellfish-offsite',
    text: 'The PEI International Shellfish Festival returns to Charlottetown with a special offsite event at The Culinary Institute of Canada.',
    sharedPostText: '',
    mediaUrls: [],
    facebookUrl: 'https://www.facebook.com/PEIshellfish',
    pageName: 'PEIshellfish',
    userName: 'PEI International Shellfish Festival',
    timestamp: '2026-07-29T22:08:20.000Z',
    sourceScraperType: 'posts',
  } as RawRowData;

  const culinaryVenue = {
    id: 'slug_culinaryinstituteofcanada',
    name: 'The Culinary Institute of Canada',
    normalizedName: 'the culinary institute of canada',
  } as VenueData;

  const item = {
    name: 'PEI International Shellfish Festival special event',
    establishment: 'The Culinary Institute of Canada, Charlottetown',
    additionalLocation: 'The Culinary Institute of Canada, Charlottetown',
    startDate: '2026-09-18',
    startTime: '17:00',
  } as ParserProcessedEvent;

  const resolved = await resolveVenueForFullParserEventWithMatcherForRegression({
    item,
    rowVenue: null,
    row,
    establishment: 'PEI International Shellfish Festival',
    rowIndex: 125,
    matcher: async (candidate) => {
      if (normalizeVenueName(candidate).includes('culinary institute of canada')) {
        return {
          isMatch: true,
          matchType: 'exact',
          similarity: 1,
          matchedVenue: culinaryVenue,
        };
      }
      if (normalizeVenueName(candidate) === 'charlottetown event grounds') {
        return {
          isMatch: true,
          matchType: 'exact',
          similarity: 1,
          matchedVenue: charlottetownEventGroundsVenue,
        };
      }
      return { isMatch: false, matchType: 'none', similarity: 0 };
    },
  });

  assert.equal(resolved?.id, culinaryVenue.id);
});
