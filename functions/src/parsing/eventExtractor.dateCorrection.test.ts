import test from 'node:test';
import assert from 'node:assert/strict';
import { dateMatchesWeekdayPrefix, extractDateFromText } from './eventExtractor.js';

test('a dated special keeps its extracted future week when the weekday agrees', () => {
  assert.equal(extractDateFromText('Sunday: Turkey dinner', '2026-10-04').date, '2026-10-04');
  assert.equal(dateMatchesWeekdayPrefix('Sunday: Turkey dinner', '2026-10-11'), true);
  assert.equal(dateMatchesWeekdayPrefix('Monday: Turkey dinner', '2026-10-12'), true);
});

test('a weekday prefix does not protect an invalid or mismatched date', () => {
  assert.equal(dateMatchesWeekdayPrefix('Sunday: Turkey dinner', '2026-10-12'), false);
  assert.equal(dateMatchesWeekdayPrefix('Sunday: Turkey dinner', 'invalid'), false);
});
