import test from 'node:test';
import assert from 'node:assert/strict';

import { hasMissingValidatedSourceIdentity,
  normalizeStage4JsonForRegression, partitionLunaValidationItems,
  preserveValidatedItemSourceType } from './secondaryValidator.js';

test('validation preserves the flyer frame chosen by image-aware extraction', () => {
  const original = { name: 'Flyer two event', relevantImageIndex: 1 } as any;
  const validated = { name: 'Flyer two event', relevantImageIndex: 0 } as any;
  assert.equal(preserveValidatedItemSourceType(validated, original).relevantImageIndex, 1);
});

test('validation preserves the web-only marker instead of claiming a flyer', () => {
  const original = { name: 'Website event', relevantImageIndex: -1 } as any;
  const validated = { name: 'Website event', relevantImageIndex: 0 } as any;
  assert.equal(preserveValidatedItemSourceType(validated, original).relevantImageIndex, -1);
});

test('validation rejects a counted response that erased source names and dates', () => {
  const raw = [{ name: 'Adult Craft', date: '2026-10-02' }] as any[];
  assert.equal(hasMissingValidatedSourceIdentity(raw, [
    { item: { name: '', date: '' }, decision: 'KEPT' } as any,
  ]), true);
  assert.equal(hasMissingValidatedSourceIdentity(raw, [
    { item: { name: 'Adult Craft', date: '2026-10-02' }, decision: 'KEPT' } as any,
  ]), false);
});

test('large Luna review partitions every item once in source order', () => {
  const items = Array.from({ length: 45 }, (_, index) => ({
    name: `Showtime ${index}`, date: '2026-10-01', relevantImageIndex: -1,
  })) as any[];
  const chunks = partitionLunaValidationItems(items);
  assert.deepEqual(chunks.map(chunk => chunk.length), [15, 15, 15]);
  assert.deepEqual(chunks.flat(), items);
  assert.equal(partitionLunaValidationItems(items.slice(0, 16)).length, 2);
});

test('Stage 4 JSON normalization preserves source URLs while removing comments', () => {
  const source = '{"validatedItems":[{"item":{"ticketLink":"https://citycinema.ca/movies/?film=hokum","name":"A // B"},"decision":"KEPT"}],/* note */"validationSummary":{"totalItems":1}}';
  const parsed = JSON.parse(normalizeStage4JsonForRegression(source));
  assert.equal(parsed.validatedItems[0].item.ticketLink,
    'https://citycinema.ca/movies/?film=hokum');
  assert.equal(parsed.validatedItems[0].item.name, 'A // B');
  assert.equal(parsed.validationSummary.totalItems, 1);
});
