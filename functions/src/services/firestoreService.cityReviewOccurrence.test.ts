import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCityLevelEventReviewDocIdForRegression } from './firestoreService.js';

test('independent sources for one precise spatial occurrence share a review identity', () => {
  const first = buildCityLevelEventReviewDocIdForRegression({
    uniqueId: 'busker-source', rowIndex: 1, eventName: 'Kobbler Jay', eventDate: '2026-09-05', eventTime: '12:00',
    locationLabel: 'Kobbler Jay — separate location occurrences', locationScope: 'area',
    spatialEvidence: { version: 1, kind: 'separate_occurrences', representation: 'none', confidence: 'high', ordered: false,
      locations: [{ label: 'Plaza Boardwalk', role: 'location', certainty: 'confirmed' }], confirmedStreets: [], reviewReasons: [] },
  });
  const second = buildCityLevelEventReviewDocIdForRegression({
    uniqueId: 'downtown-source', rowIndex: 9, eventName: 'Kobbler Jay', eventDate: '2026-09-05', eventTime: '12:00',
    locationLabel: 'Kobbler Jay — separate location occurrences', locationScope: 'area',
    spatialEvidence: { version: 1, kind: 'separate_occurrences', representation: 'none', confidence: 'high', ordered: false,
      locations: [{ label: 'Plaza Boardwalk', role: 'location', certainty: 'confirmed' }], confirmedStreets: [], reviewReasons: [] },
  });
  assert.equal(first, second);
});

test('a different physical stop never shares that occurrence identity', () => {
  const base = { rowIndex: 1, eventName: 'Kobbler Jay', eventDate: '2026-09-05', eventTime: '12:00', locationScope: 'area' as const };
  const atPlaza = buildCityLevelEventReviewDocIdForRegression({ ...base, uniqueId: 'a', locationLabel: 'Plaza Boardwalk' });
  const atRow = buildCityLevelEventReviewDocIdForRegression({ ...base, uniqueId: 'b', locationLabel: 'Victoria Row' });
  assert.notEqual(atPlaza, atRow);
});
