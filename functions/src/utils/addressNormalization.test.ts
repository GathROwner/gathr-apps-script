import test from 'node:test';
import assert from 'node:assert/strict';

import {
  choosePreferredAddress,
  isStructurallyAcceptableAddress,
  normalizeCanadianAddress,
} from './addressNormalization.js';

test('normalizes duplicated PEI province suffix from Facebook venue data', () => {
  const result = normalizeCanadianAddress(
    '110 Queen St, Charlottetown, PE, Canada, Prince Edward Island'
  );

  assert.equal(result.normalizedAddress, '110 Queen St, Charlottetown, PE, Canada');
  assert.deepEqual(result.issues.sort(), [
    'country_before_province',
    'duplicate_province_alias',
  ]);
  assert.equal(result.changed, true);
});

test('moves a trailing Canadian postal code beside the province', () => {
  const result = normalizeCanadianAddress(
    '1 Weymouth Street, Charlottetown, PE, Canada, C1A7M8'
  );

  assert.equal(result.normalizedAddress, '1 Weymouth Street, Charlottetown, PE C1A 7M8, Canada');
  assert.deepEqual(result.issues, ['postal_after_country']);
});

test('normalizes equivalent Nova Scotia province aliases', () => {
  const result = normalizeCanadianAddress(
    '344 Main Street, Antigonish, NS, Canada, Nova Scotia'
  );
  assert.equal(result.normalizedAddress, '344 Main Street, Antigonish, NS, Canada');
});

test('does not rewrite a structurally ambiguous multi-address value', () => {
  const value = '13 Lower Rollo Bay Rd, Kings, PE C0A, Canada, Souris, PE, Canada, Prince Edward Island';
  const result = normalizeCanadianAddress(value);
  assert.equal(result.normalizedAddress, value);
  assert.equal(result.changed, false);
  assert.ok(result.issues.includes('ambiguous_component_order'));
});

test('preserves a correctly ordered canonical address', () => {
  const value = '126 Sydney St, Charlottetown, PE C1A 1G5, Canada';
  const result = normalizeCanadianAddress(value);
  assert.equal(result.normalizedAddress, value);
  assert.equal(result.changed, false);
  assert.deepEqual(result.issues, []);
});

test('removes a downtown qualifier from the locality of a civic address', () => {
  const result = normalizeCanadianAddress(
    '119 Grafton St, Downtown Charlottetown, PE C1A 1K9, Canada'
  );

  assert.equal(result.normalizedAddress, '119 Grafton St, Charlottetown, PE C1A 1K9, Canada');
  assert.deepEqual(result.issues, ['downtown_locality_qualifier']);
  assert.equal(result.changed, true);
});

test('removes a downtown qualifier while also repairing a trailing postal code', () => {
  const result = normalizeCanadianAddress(
    '119 Grafton St, Downtown Charlottetown, PE, Canada, C1A 1K9'
  );

  assert.equal(result.normalizedAddress, '119 Grafton St, Charlottetown, PE C1A 1K9, Canada');
  assert.deepEqual(result.issues.sort(), [
    'downtown_locality_qualifier',
    'postal_after_country',
  ]);
});

test('preserves Downtown Charlottetown when it is an area label rather than a civic address', () => {
  const value = 'Downtown Charlottetown, PE, Canada';
  const result = normalizeCanadianAddress(value);

  assert.equal(result.normalizedAddress, value);
  assert.equal(result.changed, false);
  assert.deepEqual(result.issues, []);
});

test('acceptance requires a civic number, street token, and locality', () => {
  assert.equal(isStructurallyAcceptableAddress('110 Queen St, Charlottetown, PE, Canada'), true);
  assert.equal(isStructurallyAcceptableAddress('Charlottetown, PE, Canada'), false);
});

test('Google Places address cannot be replaced by lower-confidence Facebook data', () => {
  const result = choosePreferredAddress(
    {
      address: '110 Queen St, Charlottetown, PE C1A 4A6, Canada',
      source: 'google_places',
      googlePlaceId: 'place-123',
    },
    {
      address: '110 Queen St, Charlottetown, PE, Canada, Prince Edward Island',
      source: 'facebook_page',
    }
  );

  assert.equal(result.selected, 'existing');
  assert.equal(result.address, '110 Queen St, Charlottetown, PE C1A 4A6, Canada');
});

test('manual correction may replace an existing lower-confidence address', () => {
  const result = choosePreferredAddress(
    {
      address: '110 Queen St, Charlottetown, PE, Canada, Prince Edward Island',
      source: 'facebook_page',
    },
    {
      address: '110 Queen St, Charlottetown, PE C1A 4A6, Canada',
      source: 'manual',
    }
  );

  assert.equal(result.selected, 'incoming');
  assert.equal(result.address, '110 Queen St, Charlottetown, PE C1A 4A6, Canada');
});
