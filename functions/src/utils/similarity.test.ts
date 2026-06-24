import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateEnhancedSimilarity,
  normalizeVenueName,
} from './similarity.js';

test('normalizeVenueName treats scraper replacement marks and ampersands like known venue names', () => {
  assert.equal(
    normalizeVenueName('Founders? Food Hall & Market'),
    normalizeVenueName("Founders' Food Hall and Market")
  );
  assert.equal(
    normalizeVenueName('Peake? s Quay Restaurant & Bar'),
    normalizeVenueName("Peake's Quay Restaurant and Bar")
  );
});

test('calculateEnhancedSimilarity matches ampersand and apostrophe-damaged venue variants', () => {
  assert.equal(
    calculateEnhancedSimilarity('Founders? Food Hall & Market', "Founders' Food Hall and Market"),
    1
  );
});
