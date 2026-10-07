import test from 'node:test';
import assert from 'node:assert/strict';
import { isAdvertisedDailySpecialOrDealForRegression } from './secondaryValidator.js';

const special = (name: string, description = '') => ({
  _sourceType: 'special', name, description, price: '', pricing: '', discount: '',
  date: '2026-10-07', startTime: '', endTime: '',
} as any);

test('an explicitly advertised daily special qualifies without a printed price', () => {
  assert.equal(isAdvertisedDailySpecialOrDealForRegression(special('Daily lunch special', 'Soup and sandwich today')), true);
});

test('a stated deal qualifies without a numeric price', () => {
  assert.equal(isAdvertisedDailySpecialOrDealForRegression(special('Burger deal', 'Available Friday')), true);
});

test('Famous Peppers month-long featured pizza is an ordinary menu feature', () => {
  assert.equal(isAdvertisedDailySpecialOrDealForRegression(special('Rough Rider Pizza of the Moment', 'Featured throughout October, in person and online')), false);
});

test('a menu item beside a deal is not promoted by source type alone', () => {
  assert.equal(isAdvertisedDailySpecialOrDealForRegression(special('Regular pepperoni pizza', 'Available on the menu')), false);
});

test('event extractor items cannot take the special-only exception', () => {
  assert.equal(isAdvertisedDailySpecialOrDealForRegression({ ...special('Daily lunch special'), _sourceType: 'event' }), false);
});
