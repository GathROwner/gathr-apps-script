import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from '../services/fixtures/venue-resolution.json';
import { fullParserEventLocationCheck, processFullParserEvent, createFullParserVenueLookupCache } from './rowProcessor.js';
import { queueUnrecognizedVenue } from '../services/firestoreService.js';
import type { ProcessedEvent } from '../parsing/types.js';
import type { RawRowData } from '../types/index.js';
import type { BatchManager } from './batchManager.js';

const row = { uniqueId: 'fixture-post', userName: 'Fixture artist',
  text: 'Artist hometown: New Glasgow, Prince Edward Island.',
  address: '35 Fixture Drive, Cornwall, PE' } as RawRowData;

for (const occurrence of fixture.foreignOccurrences) {
  test(`${occurrence.venue} is stopped before lookup, queue or write despite PEI hometown`, async () => {
    const item = { ...occurrence, establishment: occurrence.venue, address: row.address } as ProcessedEvent;
    let lookups = 0;
    const cache = createFullParserVenueLookupCache(async () => {
      lookups++; throw new Error('Unexpected lookup');
    });
    const batch = { assertWorkerActive: () => { throw new Error('Unexpected writer work'); },
      getState: () => { throw new Error('Unexpected queue'); } } as unknown as BatchManager;
    assert.equal(fullParserEventLocationCheck(item, row).decision, 'reject');
    assert.deepEqual(await processFullParserEvent(item, row, 0, 0, null, row.userName, batch, false, cache),
      { created: false, updated: false, isDuplicate: false });
    assert.equal(lookups, 0);
    const queued = await queueUnrecognizedVenue({ venueName: occurrence.venue,
      source: 'full5stage_event', description: occurrence.description });
    assert.equal(queued.queued, false);
    assert.equal(queued.reason, 'explicit_event_region_outside_coverage');
  });
}
test('a mixed gallery does not reject its local occurrence', () => {
  const foreign = fixture.foreignOccurrences[0] as ProcessedEvent;
  const local = { name: 'Fixture Island session', venue: 'Community Hall', relevantImageIndex: 1,
    description: 'A public session in Souris, PEI.' } as ProcessedEvent;
  assert.equal(fullParserEventLocationCheck(foreign, row).decision, 'reject');
  assert.equal(fullParserEventLocationCheck(local, row).decision, 'allow');
});
test('province-wide and area events retain their scope without inventing venues', () => {
  for (const scope of ['area', 'city', 'route']) {
    assert.equal(fullParserEventLocationCheck({ locationScope: scope, locationProvince: 'PEI' } as ProcessedEvent, row).decision, 'allow');
  }
});
