import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkEventCoordinatesAgainstAllowedRegions,
  parseAllowedEventIngestRegionCodes,
} from './eventIngestJurisdictions.js';

test('allows coordinates inside the default PEI ingest region', () => {
  const result = checkEventCoordinatesAgainstAllowedRegions({
    latitude: 46.2382,
    longitude: -63.1311,
  }, 'PEI');

  assert.equal(result.decision, 'allow');
  assert.equal(result.matchedRegionCode, 'PEI');
});

test('rejects unmistakably off-region Facebook Event coordinates', () => {
  const result = checkEventCoordinatesAgainstAllowedRegions({
    latitude: 48.387715750251,
    longitude: -4.4854892711642,
  }, 'PEI');

  assert.equal(result.decision, 'reject');
  assert.deepEqual(result.allowedRegionCodes, ['PEI']);
});

test('leaves rows without complete coordinates to existing review safeguards', () => {
  const result = checkEventCoordinatesAgainstAllowedRegions({
    latitude: 46.2382,
  }, 'PEI');

  assert.equal(result.decision, 'unknown');
});

test('fails open and reports unknown configured regions', () => {
  const parsed = parseAllowedEventIngestRegionCodes('NS, PEI, NS');
  assert.deepEqual(parsed.allowedRegionCodes, ['PEI']);
  assert.deepEqual(parsed.unknownRegionCodes, ['NS']);

  const result = checkEventCoordinatesAgainstAllowedRegions({
    latitude: 44.6488,
    longitude: -63.5752,
  }, 'NS');
  assert.equal(result.decision, 'unknown');
  assert.deepEqual(result.unknownRegionCodes, ['NS']);
});
