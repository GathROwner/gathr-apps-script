import assert from 'node:assert/strict';
import test from 'node:test';

import { RawRowData } from '../types/index.js';
import { BatchManager, createBatchState } from './batchManager.js';
import { processRow } from './rowProcessor.js';

test('rejects an off-region Facebook Event before venue matching', async () => {
  const previousAllowedRegions = process.env.EVENT_INGEST_ALLOWED_REGIONS;
  process.env.EVENT_INGEST_ALLOWED_REGIONS = 'PEI';

  try {
    const row: RawRowData = {
      uniqueId: '1004061762068907',
      text: 'Souris dans l\'herbe, un atelier peinture en parent-enfant.',
      mediaUrls: [],
      userName: 'Musée des mômes',
      pageName: '',
      timestamp: '2026-09-13T08:00:00.000Z',
      utcStartDate: '2026-09-13T08:00:00.000Z',
      facebookUrl: 'https://www.facebook.com/events/1004061762068907/',
      sourceScraperType: 'events',
      facebookEventLocationName: 'Musée des mômes',
      facebookEventLocationLatitude: 48.387715750251,
      facebookEventLocationLongitude: -4.4854892711642,
      facebookEventLocationCountryCode: 'FR',
    };
    const manager = new BatchManager(
      createBatchState('test-file', 'Apify Dataset.xlsx', 1),
      { parserMode: 'full5stage' }
    );

    const result = await processRow(row, 0, manager, { parserMode: 'full5stage' });

    assert.equal(result.success, false);
    assert.equal(result.isInvalid, true);
    assert.equal(result.error, 'facebook_event_coordinates_outside_allowed_regions');
    assert.deepEqual(result.events, []);
    assert.equal(manager.getStats().invalidCount, 1);
  } finally {
    if (previousAllowedRegions === undefined) {
      delete process.env.EVENT_INGEST_ALLOWED_REGIONS;
    } else {
      process.env.EVENT_INGEST_ALLOWED_REGIONS = previousAllowedRegions;
    }
  }
});
