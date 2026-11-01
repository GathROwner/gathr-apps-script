import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './__fixtures__/oct12-integrity.json';
import {constrainSourceTimes, hasUnresolvedSourceMeridiem} from './sourceTimeConstraints.js';
import {applyCategoryCorrectionsForRegression, rehydrateFormattedEventMetadata} from './finalFormatter.js';
import {applyFallbackTimes, resolveTimesWithOperatingHours} from './venueResolver.js';
import {applySpecialTimeFallbacks, enforceDateTimeCompleteness} from './postParser.js';
import {previewDuplicateMerge} from '../processing/rowProcessor.js';

const row = (n: number): any => fixture.rows.find(r => r.row === n)!;

test('actual Milton ambiguity is held; explicit AM, PM and 24-hour clocks survive', () => {
  const item = row(289).stage3[5];
  assert.equal(hasUnresolvedSourceMeridiem(item), true);
  assert.equal(constrainSourceTimes([item], '').at(0)?._sourceTimeConstraint?.reason, 'unresolved_meridiem');
  for (const startTime of ['1:30 p.m.', '1:30 a.m.', '13:30', '01:30 AM']) {
    assert.equal(hasUnresolvedSourceMeridiem({...item, startTime}), false, startTime);
  }
  assert.equal(hasUnresolvedSourceMeridiem({...item, description:'', extractionReason:'Printed 01:30 in 24-hour timetable', startTime:'01:30'}), false);
});

test('captured clothing drive and volunteer work stay activities despite incidental food words', () => {
  for (const n of [257,268]) {
    const source = row(n).stage3[0];
    const corrected = applyCategoryCorrectionsForRegression({...row(n).events[0], description:source.description}, source);
    assert.equal(corrected.category, 'Gatherings & Parties', source.name);
    assert.equal(corrected.isEvent, 'Yes');
    assert.equal(corrected.isFoodSpecial, 'No');
  }
  const original = row(268).events[0];
  const corrected = applyCategoryCorrectionsForRegression({...original, category:'Gatherings & Parties', name:'Community collection', description:'Drop off donations on the main level.'}, {name:'Community collection', description:'Drop off donations on the main level.'} as any);
  assert.notEqual(corrected.category, 'Food Special');
});

test('healthy real food offers still receive food categories', () => {
  for (const name of ['Lunch special: Swiss steak', 'Three course dinner special', 'Two can dine', 'Main course special']) {
    const source:any = {name, description:`${name} $20`, _sourceType:'special'};
    assert.equal(applyCategoryCorrectionsForRegression({...row(8).events[0], name, description:source.description, category:'Gatherings & Parties'}, source).category, 'Food Special', name);
  }
  for (const name of ['$5 Mimosa', '$5 Bloody Caesar']) {
    const source:any = {name, description:`Weekend brunch drink special: ${name}`, _sourceType:'special'};
    assert.equal(applyCategoryCorrectionsForRegression({...row(8).events[0], name, description:source.description},source).category,'Drink Special');
  }
  const salad:any = {name:'Caesar Salad Lunch Special', description:'$12 lunch special', _sourceType:'special'};
  assert.equal(applyCategoryCorrectionsForRegression({...row(8).events[0], name:salad.name,description:salad.description},salad).category,'Food Special');
  const brunch:any = {name:'Brunch Special', description:'$35 brunch includes a mimosa', _sourceType:'special'};
  assert.equal(applyCategoryCorrectionsForRegression({...row(8).events[0], name:brunch.name,description:brunch.description},brunch).category,'Food Special');
});

test('actual lunch and untimed activity offer constraints survive formatting and all start fallbacks', async () => {
  for (const n of [8,181]) {
    const r = row(n);
    const items = constrainSourceTimes(r.stage3, r.caption);
    const item = items[n===8 ? 0 : 3];
    assert(item._sourceTimeConstraint);
    const event = rehydrateFormattedEventMetadata({...r.events[n===8 ? 0 : 3], startTime:'17:00'}, item);
    assert.equal(event.startTime, '');
    const hours = await resolveTimesWithOperatingHours([event], r.venue, '', r.timestamp);
    assert.equal(hours[0].startTime, '', 'must return before any venue network call');
    assert.equal(applyFallbackTimes({...hours[0]}, event, '12:00', event.startDate).startTime, '');
    const fallback = applySpecialTimeFallbacks(hours, `${event.startDate}T12:00:00-03:00`, 'America/Halifax');
    assert.equal(fallback[0].startTime, '');
    assert.equal(enforceDateTimeCompleteness(fallback, `${event.startDate}T12:00:00-03:00`, 'America/Halifax').length, 0);
  }
});

test('printed meal times and explicitly all-day ordinary specials remain usable', () => {
  const r=row(8), timed={...r.stage3[0], startTime:'11:30', endTime:'14:00'};
  assert.equal(constrainSourceTimes([timed], r.caption)[0]._sourceTimeConstraint, undefined);
  const allDay={...r.stage3[0], name:'Wing deal', description:'All day $5 wings', extractionReason:'Advertised deal'};
  assert.equal(constrainSourceTimes([allDay], 'All day $5 wings')[0]._sourceTimeConstraint, undefined);
  const allDayBreakfast={...allDay,name:'All day breakfast deal',description:'Breakfast deal served all day'};
  assert.equal(constrainSourceTimes([allDayBreakfast], '')[0]._sourceTimeConstraint, undefined);
  const captionOnlyDeal={...allDay,name:'Wing deal',description:'$5 wings',relevantImageIndex:undefined};
  const captionOnlyEvent={...timed,_sourceType:'event' as const,relevantImageIndex:undefined};
  // No image index is not all-day/date evidence. The accepted service-hours
  // guard requires an actual attendee date/window before publishing this offer.
  assert.equal(constrainSourceTimes([captionOnlyDeal,captionOnlyEvent], '')[0]._sourceTimeConstraint?.reason, 'offer_service_hours_unverified');
});

test('old lunch keeper accepts source-supported literary identity without changing its occurrence', () => {
  const before:any=fixture.bookKeeper.before,incoming:any=fixture.bookKeeper.incoming;
  const merge=(a:any,b:any)=>previewDuplicateMerge({existingEvent:a,incomingEvent:b,venue:{id:a.venueId,name:a.establishment,address:'',latitude:0,longitude:0} as any});
  const corrected:any={...before,...merge(before,incoming).updates};
  assert.equal(corrected.name, incoming.name);assert.equal(corrected.category,'Gatherings & Parties');
  assert.equal(corrected.isEvent,'Yes');assert.equal(corrected.isFoodSpecial,false);
  assert.equal(corrected.uniqueId,before.uniqueId);assert.equal(corrected.startDate,before.startDate);assert.equal(corrected.startTime,before.startTime);
  for (const incomingPatch of [{startDate:'2026-10-23'},{startTime:'20:00'},{venueId:'other'},
    {facebookUrl:'https://example.org',cleanedFacebookUrl:''},{sourceTimestamp:'2026-08-01T00:00:00Z'},
    {name:'Book Launch with Unrelated Author',eventName:'Book Launch with Unrelated Author'}]) {
    assert.equal(merge(before,{...incoming,...incomingPatch}).updates.name,undefined,JSON.stringify(incomingPatch));
  }
  assert.equal(merge({...before,isRecurring:true,recurringPattern:'weekly_friday'},incoming).updates.name,undefined);
});
