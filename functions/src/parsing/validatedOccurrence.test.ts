import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { preserveValidatedOccurrence, preserveSparseExplicitDateSequences,
  promoteFiniteWeeklyOneOffSequencesForRegression } from './finalFormatter.js';
import { partitionRecentPastYearlessItems } from './lunaSafetyGate.js';
import { hasMissingValidatedSourceIdentity } from './secondaryValidator.js';
import type { ExtractedItem, FormattedEvent } from './types.js';

// Actual Stage 4 payload from the failing no-write PowerSkating replay.
const source: ExtractedItem[] = JSON.parse(fs.readFileSync(
  'src/parsing/powerskating.validated.fixture.json', 'utf8'));
const corruptedStage4: ExtractedItem[] = JSON.parse(fs.readFileSync(
  'src/parsing/powerskating.corrupted-stage4.fixture.json', 'utf8'));

test('actual Stage 4 date and age-group corruption triggers the existing raw-source fallback', () => {
  const response = (items: ExtractedItem[]) => items.map(item => ({ item, decision: 'KEPT' as const, reason: 'valid' }));
  assert.equal(hasMissingValidatedSourceIdentity(source, response(corruptedStage4)), true);
  assert.equal(hasMissingValidatedSourceIdentity(source, response(source)), false);
});

test('twenty validated printed dates survive formatter date, time and weekly mutations', () => {
  const restored = source.map((item, index) => preserveValidatedOccurrence({
    name: item.name, description: item.description, establishment: 'Cavendish',
    additionalLocation: '', category: index % 2 ? 'Sports' : 'Workshops & Classes',
    startDate: '2026-11-01', endDate: '2027-01-03',
    startTime: '10:00', endTime: '11:00',
    isRecurring: 'Yes', recurringPattern: 'weekly_saturday', totalOccurrences: 10,
  } as FormattedEvent, item));
  const final = promoteFiniteWeeklyOneOffSequencesForRegression(preserveSparseExplicitDateSequences(restored));
  assert.equal(final.length, 20);
  assert.deepEqual(final.map(x => x.startDate), source.map(x => x.date));
  assert.ok(final.every(x => x.endDate === x.startDate && x.startTime === '07:00' && x.endTime === '08:00'));
  assert.ok(final.every(x => x.recurringPattern === 'none' && x.isRecurring === 'No'));
});

test('validated weekly recurrence and explicit multi-day window remain available', () => {
  const weekly = { ...source[0], recurringPattern: 'weekly_saturday' } as ExtractedItem;
  const model = { startDate: weekly.date, endDate: weekly.date,
    recurringPattern: 'weekly_saturday', isRecurring: 'Yes', totalOccurrences: 10 } as FormattedEvent;
  assert.equal(preserveValidatedOccurrence(model, weekly).totalOccurrences, 10);
  const changedWeekday = { ...model, recurringPattern: 'weekly_friday', startDate: '2026-10-23' } as FormattedEvent;
  assert.equal(preserveValidatedOccurrence(changedWeekday, weekly).recurringPattern, 'weekly_saturday');
  assert.equal(preserveValidatedOccurrence(changedWeekday, weekly).startDate, weekly.date);
  const window = { ...model, startDate: '2026-10-17', endDate: '2026-10-20',
    recurringPattern: 'none', isRecurring: 'No' } as FormattedEvent;
  assert.equal(preserveValidatedOccurrence(window, source[0]).endDate, '2026-10-20');
});

test('caption recap and image-only recent-past sign are held independently on every attempt', () => {
  const caption = 'We loved teaching automobile maintenance on October 3rd.';
  const recap = { name: 'Maintenance', description: caption, date: '2026-10-03' } as ExtractedItem;
  const sign = { name: 'Mary Walsh Cavendish Lit Fest', date: '2026-09-25',
    description: 'The complex sign advertises Mary Walsh on September 25 at 7PM.' } as ExtractedItem;
  const future = { name: 'Apple picking', date: '2026-10-17', description: 'October 17, 1–4pm' } as ExtractedItem;
  for (const items of [[recap, sign, future], [sign, future]]) {
    const result = partitionRecentPastYearlessItems(items, caption, '2026-10-06');
    assert.deepEqual(result.kept, [future]);
    assert.ok(result.held.includes(sign));
  }
  assert.equal(partitionRecentPastYearlessItems([sign], caption, '2026-10-06').kept.length, 0);
  const sameDay = { ...sign, date: '2026-10-06', description: 'Tonight, October 6 at 7PM' };
  assert.equal(partitionRecentPastYearlessItems([sameDay], caption, '2026-10-06').kept.length, 1);
  const explicitFuture = { ...sign, date: '2027-09-25' };
  assert.equal(partitionRecentPastYearlessItems([explicitFuture], 'September 25, 2027 at 7PM', '2026-10-06').kept.length, 1);
});
