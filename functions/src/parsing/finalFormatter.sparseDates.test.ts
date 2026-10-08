import test from 'node:test';
import assert from 'node:assert/strict';
import { preserveSparseExplicitDateSequences,
  promoteFiniteWeeklyOneOffSequencesForRegression } from './finalFormatter.js';
import type { FormattedEvent } from './types.js';

const event = (name: string, date: string, pattern = 'weekly_saturday'): FormattedEvent => ({
  name, startDate: date, endDate: date, startTime: '07:00', endTime: '08:00',
  establishment: 'Cavendish Farms Community Events Centre', additionalLocation: '',
  category: 'Sports', isRecurring: 'Yes', recurringPattern: pattern,
  totalOccurrences: 10,
} as FormattedEvent);

test('preserves all ten printed PowerSkating dates across the November gap', () => {
  const saturdayDates = [
    '2026-10-17', '2026-10-24', '2026-10-31', '2026-11-14', '2026-11-21',
    '2026-11-28', '2026-12-05', '2026-12-12', '2026-12-19', '2027-01-02',
  ];
  const sundayDates = [
    '2026-10-18', '2026-10-25', '2026-11-01', '2026-11-15', '2026-11-22',
    '2026-11-29', '2026-12-06', '2026-12-13', '2026-12-20', '2027-01-03',
  ];
  const source = [
    ...saturdayDates.map(date => event('POWERSKATING SESSIONS — U9 - U11', date)),
    ...sundayDates.map(date => event('POWERSKATING SESSIONS — U13-U15', date, 'weekly_sunday')),
  ];
  const result = preserveSparseExplicitDateSequences(source);
  assert.equal(result.length, 20);
  assert.deepEqual(result.map(item => item.startDate), [...saturdayDates, ...sundayDates]);
  assert.ok(result.every(item => item.isRecurring === 'No' &&
    item.recurringPattern === 'none' && item.totalOccurrences === undefined &&
    item.recurrenceUntilDate === undefined));
  assert.equal(result.some(item => item.startDate === '2026-11-07' ||
    item.startDate === '2026-11-08'), false);
});

test('keeps an ordinary consecutive weekly series intact', () => {
  const source = ['2026-10-17', '2026-10-24', '2026-10-31', '2026-11-07']
    .map(date => event('Weekly public skate', date));
  const result = preserveSparseExplicitDateSequences(source);
  assert.ok(result.every(item => item.isRecurring === 'Yes' &&
    item.recurringPattern === 'weekly_saturday'));
});

test('does not re-promote a consecutive category fragment inside a sparse dated series', () => {
  const dates = [
    '2026-10-17', '2026-10-24', '2026-10-31', '2026-11-14', '2026-11-21',
    '2026-11-28', '2026-12-05', '2026-12-12', '2026-12-19', '2027-01-02',
  ];
  const source = dates.map((date, index) => ({
    ...event('POWERSKATING SESSIONS U9 - U11', date, 'none'),
    category: index >= 5 && index <= 8 ? 'Workshops & Classes' : 'Sports',
    isRecurring: 'No',
  } as FormattedEvent));
  const preserved = preserveSparseExplicitDateSequences(source);
  const promoted = promoteFiniteWeeklyOneOffSequencesForRegression(preserved);
  assert.equal(promoted.length, 10);
  assert.ok(promoted.every(item => item.recurringPattern === 'none' &&
    item.isRecurring === 'No'));
});
