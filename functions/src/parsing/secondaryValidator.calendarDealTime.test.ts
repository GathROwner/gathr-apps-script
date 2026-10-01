import test from 'node:test';
import assert from 'node:assert/strict';
import { isLikelyCalendarDealCardSpecialForRegression } from './secondaryValidator.js';

test('a free calendar lunch with a printed start is not an all-day deal card', () => {
  const lunch = {
    _sourceType: 'calendar', date: '2026-09-24', name: "Senior's Lunch",
    description: 'Free corn chowder and biscuits', startTime: '11:30 AM', endTime: '',
  };
  assert.equal(isLikelyCalendarDealCardSpecialForRegression(lunch as any), false);
  assert.equal(isLikelyCalendarDealCardSpecialForRegression({ ...lunch, startTime: '' } as any), true);
});
