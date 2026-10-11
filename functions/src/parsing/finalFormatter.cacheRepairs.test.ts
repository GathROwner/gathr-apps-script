import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './__fixtures__/stage5-cache-oct11-repairs.json';
import {preserveValidatedOccurrence, applyCategoryCorrectionsForRegression} from './finalFormatter.js';
import {ExtractedItem, FormattedEvent} from './types.js';
const item = fixture.find(c => c.row === 229)!;
const source = (overrides = {}): ExtractedItem => ({...item.source, ...overrides} as ExtractedItem);
const event = (overrides = {}): FormattedEvent => ({...item.candidate, ...overrides} as FormattedEvent);

test('captured overnight DJ and BE YOU ends survive both model layouts', () => {
  for (const row of fixture.filter(c => [212,229].includes(c.row))) {
    for (const arm of ['baseline','candidate'] as const) {
      const result = preserveValidatedOccurrence(row[arm] as FormattedEvent, row.source as ExtractedItem);
      assert.equal(result.startDate, '2026-10-10');
      assert.equal(result.endDate, '2026-10-11');
      assert.equal(result.startTime, row.source.startTime);
      assert.equal(result.endTime, '02:00');
      assert.equal(result.ticketPrice, row[arm].ticketPrice);
      assert.equal(result.relevantImageIndex, row[arm].relevantImageIndex);
    }
  }
});

test('source-grounded overnight repair handles month/year/leap-day rollover', () => {
  for (const [date, end] of [['2026-12-31','2027-01-01'],['2028-02-28','2028-02-29'],['2026-10-31','2026-11-01']]) {
    assert.equal(preserveValidatedOccurrence(event({startDate:date,endDate:date}), source({date})).endDate,end);
  }
});

test('overnight repair preserves genuine multi-day dates and recurrence bounds', () => {
  assert.equal(preserveValidatedOccurrence(event({endDate:'2026-10-12'}),source()).endDate,'2026-10-12');
  const weekly = source({recurringPattern:'weekly_saturday',totalOccurrences:3,recurrenceUntilDate:'2026-10-24'});
  const result = preserveValidatedOccurrence(event(),weekly);
  assert.equal(result.endDate,'2026-10-11');
  assert.equal(result.recurringPattern,'weekly_saturday');
  assert.equal(result.totalOccurrences,3);
  assert.equal(result.recurrenceUntilDate,'2026-10-24');
});

test('daytime, unknown clocks, and implied times cannot trigger an overnight repair', () => {
  for (const input of [source({startTime:'09:00',endTime:'16:00'}),source({endTime:''}),source({startTime:'unknown'}),source({timeFlags:{start:{source:'implied'},end:{source:'explicit'}}})]) {
    assert.equal(preserveValidatedOccurrence(event(),input).endDate,'2026-10-10');
  }
});

test('captured public care clinic and produce weigh-off retain activity flags and social category', () => {
  for (const row of fixture.filter(c => [48,285].includes(c.row))) for (const arm of ['baseline','candidate'] as const) {
    const result=applyCategoryCorrectionsForRegression(row[arm] as FormattedEvent,row.source as ExtractedItem);
    assert.equal(result.category,'Gatherings & Parties');
    assert.equal(result.isEvent,'Yes');
    assert.equal(result.isFoodSpecial,'No');
    assert.equal(result.startTime,row.source.startTime);
  }
});

test('sports clinics, squash matches and medical education retain their category', () => {
  for (const [name,description,category] of [
    ['Hockey Skills Clinic','Medical staff present for players.','Sports'],
    ['Squash Tournament','Singles matches and finals.','Sports'],
    ['Medical Care Workshop','Learn clinical care through hands-on training.','Workshops & Classes'],
    ['Pumpkin Run','A family running race.','Sports'],
  ]) {
    const result=applyCategoryCorrectionsForRegression(event({name,description,category}),source({name,description}));
    assert.equal(result.category,category,name);
  }
});
