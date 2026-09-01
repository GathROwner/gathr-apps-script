import assert from 'node:assert/strict';
import test from 'node:test';

import { ProcessedEvent as ParserProcessedEvent } from '../parsing/types.js';
import { RawRowData } from '../types/index.js';
import {
  resolvePostDerivedCityLevelEventLocation,
  resolveVenueForFullParserEventWithMatcherForRegression,
} from './rowProcessor.js';

function row(overrides: Partial<RawRowData> = {}): RawRowData {
  return {
    uniqueId: 'spatial-fixture-1',
    text: '',
    mediaUrls: [],
    userName: 'Community Events PEI',
    pageName: 'Community Events PEI',
    timestamp: '2026-08-23T12:00:00.000Z',
    ...overrides,
  } as RawRowData;
}

test('full parser route is queued as route evidence instead of venue-matched', async () => {
  let matcherCalls = 0;
  const sourceRow = row({
    text: 'Start: Queen Charlotte Intermediate School\nRoute: North River Road -> Brighton Road -> Euston Street\nFinish: Fitzroy Street',
  });
  const item = {
    name: 'Gold Cup Parade',
    description: 'Official parade route through Charlottetown.',
    establishment: 'Downtown Charlottetown',
    venue: 'Downtown Charlottetown',
  } as ParserProcessedEvent;

  const details = resolvePostDerivedCityLevelEventLocation({
    item,
    row: sourceRow,
    establishment: 'Community Events PEI',
  });
  assert.equal(details?.locationScope, 'route');
  assert.equal(details?.spatialEvidence?.routeEvidenceLevel, 'official_full_route');
  assert.match(details?.locationLabel || '', /Gold Cup Parade Route/);

  const matched = await resolveVenueForFullParserEventWithMatcherForRegression({
    item,
    row: sourceRow,
    rowVenue: null,
    establishment: 'Community Events PEI',
    rowIndex: 4,
    matcher: async () => {
      matcherCalls += 1;
      return { isMatch: false, matchType: 'none', confidence: 0 } as any;
    },
  });
  assert.equal(matched, null);
  assert.equal(matcherCalls, 0);
});

test('Busker-style site list becomes unordered multi-location review evidence', () => {
  const details = resolvePostDerivedCityLevelEventLocation({
    item: {
      name: 'Charlottetown Busker Festival',
      description: 'Performances at multiple locations downtown.',
    } as ParserProcessedEvent,
    row: row({
      text: "Locations: Victoria Row; Founders Food Hall & Market; Peake's Quay",
    }),
    establishment: 'Discover Charlottetown',
  });

  assert.equal(details?.locationScope, 'area');
  assert.equal(details?.detectionSource, 'spatial_event_classifier');
  assert.equal(details?.spatialEvidence?.kind, 'multi_location');
  assert.equal(details?.spatialEvidence?.locations.length, 3);
  assert.equal(details?.spatialEvidence?.ordered, false);
  assert.ok(details?.autoPublishReviewReasons.includes('multi_location_requires_point_resolution'));
});

test('rooms within one arts centre continue through ordinary venue resolution', () => {
  const details = resolvePostDerivedCityLevelEventLocation({
    item: {
      name: 'Arts Centre Open House',
      venue: 'Confederation Centre of the Arts',
      description: 'Locations: Main Stage; Studio 1; The Mack',
    } as ParserProcessedEvent,
    row: row(),
    establishment: 'Confederation Centre of the Arts',
  });
  assert.equal(details, null);
});

test('traffic advisory referencing a parade does not enter the spatial event queue', () => {
  const details = resolvePostDerivedCityLevelEventLocation({
    item: {
      name: 'Traffic Advisory',
      description: 'Road closure for the Gold Cup Parade route. Expect delays.',
    } as ParserProcessedEvent,
    row: row(),
    establishment: 'City of Charlottetown',
  });
  assert.equal(details, null);
});

test('dated city tour is held for splitting instead of one multi-location publication', () => {
  const details = resolvePostDerivedCityLevelEventLocation({
    item: {
      name: 'Remembering The Bog community meetings',
      description: 'September 17 - Charlottetown\nSeptember 22 - Montague\nSeptember 23 - Summerside',
    } as ParserProcessedEvent,
    row: row(),
    establishment: 'Community Events PEI',
  });
  assert.equal(details?.spatialEvidence?.kind, 'separate_occurrences');
  assert.ok(details?.autoPublishReviewReasons.includes('split_location_occurrences_before_publication'));
});

test('a false separate-occurrences model label on a normal venue listing stays out of the area queue', () => {
  const details = resolvePostDerivedCityLevelEventLocation({
    item: {
      name: 'Neil E Dee at The Guild',
      venue: 'The Guild',
      description: 'An evening performance in Charlottetown.',
      spatial: { kind: 'separate_occurrences' },
    } as ParserProcessedEvent,
    row: row({ text: 'Neil E Dee plays The Guild this Saturday.' }),
    establishment: 'The Guild',
  });

  assert.equal(details, null);
});
