import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './__fixtures__/oct11-integrity-repair.json';
import { previewDuplicateMerge } from './rowProcessor.js';
import { isDuplicateEntry } from '../utils/similarity.js';
import { isExactUniqueIdDuplicateCompatible } from '../services/exactUniqueIdCompatibility.js';
import { isRecurringFamilyFallbackCompatible, isIncomingRecurringFamilyCompatibleWithExistingOccurrence } from '../services/recurringFamilyFallback.js';
import { alignWeeklySiblingAnchors, isDistinctWeeklySiblingDuplicateRejection, isOperatingHoursOnlyItemForRegression } from '../parsing/secondaryValidator.js';
import { applyCategoryCorrectionsForRegression, filterUnsupportedClosureFoodBleed, filterOperationalHoursOnlyEvents } from '../parsing/finalFormatter.js';

const row = (n: number): any => fixture.rows.find(r => r.row === n)!;
const venue = (event: any): any => ({id: event.venueId, name: event.establishment, normalizedName: event.establishment, address: '', latitude: 0, longitude: 0});
const merge = (existing: any, incoming: any) => previewDuplicateMerge({existingEvent: structuredClone(existing), incomingEvent: structuredClone(incoming), venue: venue(existing)});

test('captured Community Cup age groups select only the matching clock, with defensive merge protection', () => {
  const audit = fixture.audits.find(a => a.path.includes('0HKcUnx'))!;
  const existing = audit.before as any;
  for (const item of row(234).events) {
    const incoming = {...audit.incoming, ...item, uniqueId: `${row(234).id}_${item.startTime}`, eventName: item.name};
    const sameClock = incoming.startTime === existing.startTime;
    assert.equal(isDuplicateEntry(incoming, existing, {requireEstablishmentMatch: false}), sameClock, item.name);
    if (!sameClock) {
      assert.equal(isExactUniqueIdDuplicateCompatible(incoming, existing), false);
      assert.equal(isIncomingRecurringFamilyCompatibleWithExistingOccurrence(incoming, {...existing, uniqueId: incoming.uniqueId}), false);
      assert.equal(isRecurringFamilyFallbackCompatible(incoming, {...existing, isRecurring: true, recurringPattern: 'weekly_tuesday', startDate: '2026-10-06'}), false);
      assert.deepEqual(merge(existing, incoming).updates, {});
    }
  }
  const siblings = row(234).events;
  assert.equal(isDuplicateEntry({...siblings[0], eventName: siblings[0].name}, {...siblings[1], startTime: siblings[0].startTime, eventName: siblings[1].name}), false);
});

test('captured cross-source Baba one-offs preserve all four existing Monday occurrences', () => {
  for (const audit of fixture.audits.filter(a => a.path.includes('fb_100057766283684'))) {
    const updates = merge(audit.before, audit.incoming).updates;
    const result = {...audit.before, ...updates} as any;
    assert.equal(result.startDate, '2026-10-05');
    assert.equal(result.recurringPattern, 'weekly_monday');
    assert.equal(result.totalOccurrences, 4);
    assert.equal(result.recurrenceUntilDate, '2026-10-26');
    assert.equal(result.isRecurring, true);
  }
});

test('same-source correction still clears a falsely recurring parent', () => {
  const audit = fixture.audits.find(a => a.path.includes('3C9dqy'))!;
  const incoming = {...audit.incoming, uniqueId: audit.before.uniqueId, startDate: audit.before.startDate};
  const result = {...audit.before, ...merge(audit.before, incoming).updates} as any;
  assert.equal(result.recurringPattern, 'none');
  assert.equal(result.totalOccurrences, 0);
});

test('an older calendar reparse cannot clear a lifecycle established by a newer camp post', () => {
  const audit = fixture.audits.find(a => a.path.includes('0HKcUnx'))!;
  const u13 = row(234).events.find((e: any) => /U13\b/.test(e.name));
  const incoming = {...audit.incoming, ...u13, uniqueId:`${row(234).id}_u13`, eventName:u13.name};
  const promoted = {...audit.before, ...merge(audit.before, incoming).updates};
  assert.equal(promoted.recurrenceSourceUniqueId, row(234).id);
  const reparsed = {...promoted, ...merge(promoted, audit.before).updates};
  assert.equal(reparsed.recurringPattern, 'weekly_tuesday');
  assert.equal(reparsed.totalOccurrences, 3);
  assert.equal(reparsed.recurrenceUntilDate, '2026-10-27');
});

test('captured Emily default cannot overwrite a legacy end or produce an end before the start', () => {
  const audit = fixture.audits.find(a => a.path.includes('SEWO'))!;
  const incoming = {...audit.incoming, timeResolution: row(277).events[0].timeResolution};
  const result = {...audit.before, ...merge(audit.before, incoming).updates};
  assert.equal(result.endTime, '21:00');
  assert.equal(result.endDate, '2026-10-22');
});

test('new explicit overnight end updates clock and date together', () => {
  const audit = fixture.audits.find(a => a.path.includes('SEWO'))!;
  const incoming = {...audit.incoming, endTime: '00:30', endDate: '2026-10-23', timeFlags: {start:{source:'explicit', evidence:'7 pm'}, end:{source:'explicit', evidence:'12:30 am'}}};
  const result = {...audit.before, ...merge(audit.before, incoming).updates};
  assert.equal(result.endTime, '00:30');
  assert.equal(result.endDate, '2026-10-23');
});

test('captured mixed closure post retains the separately timed turkey buffet', () => {
  const item = row(120).stage3[0];
  const event: any = {...item, category:'Food Special', startDate:item.date};
  assert.equal(filterUnsupportedClosureFoodBleed([event], row(120).caption).length, 1);
  assert.equal(filterUnsupportedClosureFoodBleed([{...event, name:'Pumpkin pie'}], 'Closed Monday. Pumpkin pie $12.').length, 0);
});

test('captured weekly brunch siblings retain Saturday and Sunday without invented explicit dates', () => {
  const aligned = alignWeeklySiblingAnchors(row(66).stage3);
  assert.deepEqual(aligned.map(i => i.date), ['2026-10-10', '2026-10-11']);
  assert.equal(isDistinctWeeklySiblingDuplicateRejection(aligned[1], aligned, 'Duplicate of first brunch listing'), true);
  assert.equal(isDistinctWeeklySiblingDuplicateRejection(aligned[1], aligned, 'Missing source evidence'), false);
  assert.equal(isDistinctWeeklySiblingDuplicateRejection(aligned[1], [aligned[1], {...aligned[1]}], 'Duplicate'), false);
  const explicit = structuredClone(row(66).stage3);
  explicit[1].description += ' October 10.';
  assert.equal(alignWeeklySiblingAnchors(explicit)[1].date, '2026-10-10');
});

test('captured local vendor market sessions remain activities, ordinary shop hours do not', () => {
  for (const item of row(332).stage3.filter((i: any) => /Market/.test(i.name))) {
    assert.equal(isOperatingHoursOnlyItemForRegression(item), false);
    assert.equal(filterOperationalHoursOnlyEvents([{...item, isEvent:'Yes', startDate:item.date} as any]).length, 1);
  }
  assert.equal(isOperatingHoursOnlyItemForRegression({name:'Farm Market Store Hours', description:'Shop open Saturday 10am-4pm', date:'2026-10-10', startTime:'10:00'} as any), true);
});

test('council, author conversation and donation drive stay activities rather than music or meal offers', () => {
  for (const n of [277, 313, 315]) {
    const input = row(n).events[0];
    const result = applyCategoryCorrectionsForRegression(input, row(n).stage3[0]);
    assert.equal(result.category, 'Gatherings & Parties', `row ${n}`);
    assert.equal(result.isEvent, 'Yes');
    assert.equal(result.isFoodSpecial, 'No');
    assert.equal(result.startTime, input.startTime);
    assert.equal(result.ticketLink, input.ticketLink);
  }
  const meal: any = {name:'Turkey Dinner', description:'Sunday turkey dinner $20', category:'Food Special'};
  assert.equal(applyCategoryCorrectionsForRegression(meal).category, 'Food Special');
  const music: any = {name:'Live Music', description:'Live concert with an author introduction', category:'Live Music'};
  assert.equal(applyCategoryCorrectionsForRegression(music).category, 'Live Music');
});
