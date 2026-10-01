import test from 'node:test';
import assert from 'node:assert/strict';

import { hasMissingValidatedSourceIdentity,
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
