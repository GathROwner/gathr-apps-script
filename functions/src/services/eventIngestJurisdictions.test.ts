import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkEventCoordinatesAgainstAllowedRegions,
  checkEventLocationAgainstAllowedRegions,
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

test('explicit event region rejects Ontario but preserves Island locations', () => {
  assert.equal(checkEventLocationAgainstAllowedRegions({ description: 'Showcase in Hamilton, Ontario.' }, 'PEI').decision, 'reject');
  assert.equal(checkEventLocationAgainstAllowedRegions({ province: 'PE' }, 'PEI').decision, 'allow');
  assert.equal(checkEventLocationAgainstAllowedRegions({ address: '12 Fixture Street, Hamilton, ON L8P 1A1, Canada' }, 'PEI').decision, 'reject');
});
test('artist origins and bare province mentions are not event locations', () => {
  for (const description of ['An Ontario fiddler performs tonight.', 'The performer was born in Hamilton, Ontario.',
    'A performer based in Toronto, Ontario.', 'An Ontario artist visits our Island venue.']) {
    assert.equal(checkEventLocationAgainstAllowedRegions({ description }, 'PEI').decision, 'unknown', description);
  }
  assert.equal(checkEventLocationAgainstAllowedRegions({ description:
    'Born in Hamilton, Ontario. Tonight the concert is in Souris, PEI.' }, 'PEI').decision, 'allow');
});
test('conflicting event evidence holds instead of selecting a convenient region', () => {
  assert.equal(checkEventLocationAgainstAllowedRegions({ province: 'PE',
    description: 'Showcase in Hamilton, Ontario.' }, 'PEI').decision, 'hold');
});
test('missing event region and invalid deployment region are not guessed', () => {
  assert.equal(checkEventLocationAgainstAllowedRegions({ locationLabels: ['Room 902'] }, 'PEI').decision, 'unknown');
  assert.equal(checkEventLocationAgainstAllowedRegions({ province: 'ON' }, 'TYPO').decision, 'unknown');
});
test('ticket outlets, organizers and story settings do not relocate an event', () => {
  for (const description of ['Tickets available in Hamilton, Ontario.',
    'Organizer for this event based in Hamilton, Ontario.',
    'The film follows a concert in Hamilton, Ontario.']) {
    assert.equal(checkEventLocationAgainstAllowedRegions({ description }, 'PEI').decision, 'unknown');
  }
  assert.equal(checkEventLocationAgainstAllowedRegions({ description:
    'Concert in Souris, PEI. Tickets available in Hamilton, Ontario.' }, 'PEI').decision, 'allow');
});

test('rejects unmistakably off-region Facebook Event coordinates', () => {
  const result = checkEventCoordinatesAgainstAllowedRegions({
    latitude: 48.387715750251,
    longitude: -4.4854892711642,
  }, 'PEI');

  assert.equal(result.decision, 'reject');
  assert.deepEqual(result.allowedRegionCodes, ['PEI']);
});

test('rejects the matched Ontario Cornwall Public Library venue coordinates', () => {
  const result = checkEventCoordinatesAgainstAllowedRegions({
    latitude: 45.0191421,
    longitude: -74.7272033,
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
