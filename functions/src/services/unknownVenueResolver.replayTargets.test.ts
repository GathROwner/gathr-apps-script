import assert from 'node:assert/strict';
import test from 'node:test';

import { UnrecognizedVenueRecord, UnrecognizedVenueSampleEvent } from '../types/index.js';
import {
  extractReplayTargetsFromSamples,
  sourcePageIdentitySupportsExistingVenueSuggestion,
} from './unknownVenueResolver.js';

function sample(
  overrides: Partial<UnrecognizedVenueSampleEvent>
): UnrecognizedVenueSampleEvent {
  return {
    source: 'full5stage_event',
    parserMode: 'full5stage',
    fileId: 'file-default',
    rowIndex: 1,
    observedVenueName: 'Example Venue',
    observedVenueNormalized: 'example venue',
    ...overrides,
  };
}

function record(samples: UnrecognizedVenueSampleEvent[]): UnrecognizedVenueRecord {
  return {
    id: 'uv_test',
    establishment: 'Example Venue',
    establishmentNormalized: 'example venue',
    status: 'manual_review',
    occurrences: samples.length,
    sampleEvents: samples,
  };
}

test('unknown venue finalizer replay defaults to the primary sample only', () => {
  const selection = extractReplayTargetsFromSamples(record([
    sample({
      fileId: 'file-a',
      fileName: 'A.xlsx',
      sourceUniqueId: 'source-a',
      rowIndex: 11,
    }),
    sample({
      fileId: 'file-b',
      fileName: 'B.xlsx',
      sourceUniqueId: 'source-b',
      rowIndex: 12,
    }),
    sample({
      fileId: 'file-c',
      fileName: 'C.xlsx',
      sourceUniqueId: 'source-c',
      rowIndex: 13,
    }),
  ]));

  assert.equal(selection.replayScope, 'primary_sample');
  assert.equal(selection.sampleCount, 3);
  assert.equal(selection.skippedSampleCount, 2);
  assert.deepEqual(selection.targets, [
    {
      fileId: 'file-a',
      fileName: 'A.xlsx',
      parserMode: 'full5stage',
      sourceUniqueId: 'source-a',
    },
  ]);
});

test('unknown venue finalizer can explicitly replay all sampled rows', () => {
  const selection = extractReplayTargetsFromSamples(
    record([
      sample({
        fileId: 'file-a',
        sourceUniqueId: 'source-a',
        rowIndex: 11,
      }),
      sample({
        fileId: 'file-a',
        sourceUniqueId: 'source-a',
        rowIndex: 11,
      }),
      sample({
        fileId: 'file-b',
        sourceUniqueId: '',
        topLevelUrl: 'https://www.facebook.com/events/1234567890123456/',
        rowIndex: 12,
      }),
      sample({
        fileId: 'file-c',
        sourceUniqueId: '',
        topLevelUrl: '',
        rowIndex: 13,
      }),
    ]),
    { replayScope: 'all_samples' }
  );

  assert.equal(selection.replayScope, 'all_samples');
  assert.equal(selection.sampleCount, 4);
  assert.equal(selection.skippedSampleCount, 0);
  assert.deepEqual(selection.targets, [
    {
      fileId: 'file-a',
      fileName: undefined,
      parserMode: 'full5stage',
      sourceUniqueId: 'source-a',
    },
    {
      fileId: 'file-b',
      fileName: undefined,
      parserMode: 'full5stage',
      sourceUniqueId: '1234567890123456',
    },
    {
      fileId: 'file-c',
      fileName: undefined,
      parserMode: 'full5stage',
      rowIndex: 13,
      sourceUniqueId: undefined,
    },
  ]);
});

test('source page identity suggestion guard allows distinctive shared venue tokens', () => {
  assert.equal(
    sourcePageIdentitySupportsExistingVenueSuggestion(
      'Havenwood Studio Theatre',
      'Havenwood Dance Studio'
    ),
    true
  );
  assert.equal(
    sourcePageIdentitySupportsExistingVenueSuggestion(
      "Peake's Quay",
      "Peake's Quay Restaurant & Bar"
    ),
    true
  );
});

test('source page identity suggestion guard rejects generic organizer context', () => {
  assert.equal(
    sourcePageIdentitySupportsExistingVenueSuggestion(
      'Parking Lot',
      'Milton Community Hall'
    ),
    false
  );
  assert.equal(
    sourcePageIdentitySupportsExistingVenueSuggestion(
      'Havenwood Studio Theatre',
      'Charlottetown Beer Garden'
    ),
    false
  );
});
