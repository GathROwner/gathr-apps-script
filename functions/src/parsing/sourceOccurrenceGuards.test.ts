import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePublicPoolWindows, hasUnsupportedPostDateFallback, isSourcePublicPoolWindow } from './sourceOccurrenceGuards.js';
import { ExtractedItem } from './types.js';

const source = `Friday October 9th at the Bell Aliant Centre!
Lane swim - 5:30 am - 7:00 am *2 lanes only*, 7:00 am -4:00 pm, 4:00 pm - 7:30 pm *2 lanes only*
Leisure pool open - 5:30 am - 4:00 pm, 5:30 pm - 9:00 pm
Toddler Pool open - 5:30 am - 9:00 pm
All pools open - 12:30 pm - 4:00 pm
Waterslide open - 6:30 pm - 7:30 pm
Friday Fun swim - $4.50 per person between 12:00 pm and 4:00 pm
Sunrise Fitness - 7:00 am`;

test('restores eight caption pool windows with exact range times, no duplicates or borrowed image provenance', () => {
  const original = [{ name: 'Friday Fun swim', date: '2026-10-09', startTime: '12:00', endTime: '16:00' },
    { name: 'All pools open', date: '2026-10-09', startTime: '12:30', endTime: '16:00' }] as ExtractedItem[];
  const result = reconcilePublicPoolWindows(original, source, '2026-10-08', 'Bell Aliant Centre');
  assert.equal(result.length, 9);
  const restored = result.filter(isSourcePublicPoolWindow);
  assert.equal(restored.length, 8);
  assert.deepEqual(restored.filter(item => item.name === 'Lane swim').map(item => [item.startTime, item.endTime]),
    [['05:30', '07:00'], ['07:00', '16:00'], ['16:00', '19:30']]);
  assert.ok(restored.every(item => item.date === '2026-10-09' && item.relevantImageIndex === -1 && 'recurringPattern' in item && item.recurringPattern === 'none'));
  assert.deepEqual(reconcilePublicPoolWindows(result, source, '2026-10-08', 'Bell Aliant Centre'), result);
});

test('never constructs public sessions from missing dates, closure/private notices, or OCR', () => {
  for (const text of ['Lane swim - 7 am - 9 am',
    'October 9\nAll pools open - CLOSED for maintenance 7 am - 9 am',
    'October 9\nLeisure pool open - private lessons 7 am - 9 am',
    'October 9\nOffice open 7 am - 9 am',
    'Hello\nOCR TEXT:\nOctober 9\nLane swim - 7 am - 9 am']) {
    assert.deepEqual(reconcilePublicPoolWindows([], text, '2026-10-08', 'Pool'), [], text);
  }
  const nextYear = reconcilePublicPoolWindows([], '2027-01-09\nLane swim - 7 am - 9 am\nSunday\nLane swim - 8 am - 10 am', '2026-10-08', 'Pool');
  assert.equal(nextYear.length, 1);
  assert.equal(nextYear[0].date, '2027-01-09');
});

test('holds confessed unanchored activity date fallback without blocking current specials or tonight', () => {
  const fallback = { name: 'Weekend Market', date: '2026-10-08',
    description: 'No specific calendar date is shown; the post date is used as the date fallback.' } as ExtractedItem;
  assert.equal(hasUnsupportedPostDateFallback(fallback, '2026-10-08'), true);
  assert.equal(hasUnsupportedPostDateFallback({ ...fallback, _sourceType: 'special' } as ExtractedItem, '2026-10-08'), false);
  assert.equal(hasUnsupportedPostDateFallback({ ...fallback, date: '2026-10-10' }, '2026-10-08'), false);
  assert.equal(hasUnsupportedPostDateFallback({ ...fallback, description: 'Tonight at 8 pm.' }, '2026-10-08'), false);
});
