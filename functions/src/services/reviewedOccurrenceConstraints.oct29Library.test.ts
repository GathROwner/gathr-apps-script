import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './__fixtures__/oct29ReviewedLibraryConstraints.json';
import {classifyReviewedOccurrenceConstraint,ReviewedOccurrenceConstraint} from './reviewedOccurrenceConstraints.js';
import {checkDuplicate} from './firestoreService.js';

test('reviewed November library dates protect exact activities despite regenerated semantic IDs',async()=>{
  let held=0;
  for(const entry of fixture){
    const venue={...entry.venue,reviewedOccurrenceConstraints:entry.venue.reviewedOccurrenceConstraints as ReviewedOccurrenceConstraint[]};
    for(const rule of venue.reviewedOccurrenceConstraints!){
      // This models a repeated source with a newly formatted horizon/end time,
      // which changes the generated uniqueId without changing the activity.
      const event:any={venueId:venue.id,uniqueId:entry.source+'_changed_semantic_identity',
        eventName:entry.activity,startDate:rule.startDate,endDate:'2026-11-30',
        startTime:entry.clock,endTime:'17:00',isRecurring:true,recurringPattern:'weekly_wednesday',
        recurrenceUntilDate:'2026-11-30'};
      assert.equal(classifyReviewedOccurrenceConstraint(event,venue),'hold');
      assert.deepEqual(await checkDuplicate(event,venue.id,[],venue as any),{isDuplicate:true});
      held++;
    }
  }
  assert.equal(held,24);
});

test('library constraints do not become a source-wide, venue-wide or future-month exclusion',()=>{
  for(const entry of fixture){
    const venue={...entry.venue,reviewedOccurrenceConstraints:entry.venue.reviewedOccurrenceConstraints as ReviewedOccurrenceConstraint[]};
    const event:any={venueId:venue.id,uniqueId:entry.source+'_changed_semantic_identity',
      eventName:entry.activity,startDate:'2026-11-04',startTime:entry.clock};
    for(const patch of [
      {uniqueId:'999999999999999_new_month_source'},
      {eventName:'A different library activity'},
      {startDate:'2026-12-02'},
      {startTime:entry.clock==='10:00'?'14:00':'10:00'},
      {venueId:'another_library'},
    ])assert.equal(classifyReviewedOccurrenceConstraint({...event,...patch},venue),'none');
  }
});

test('legacy UID-only holds retain their precise matching behavior',()=>{
  const venue={id:'fixture',reviewedOccurrenceConstraints:[{sourceUniqueId:'1111111111111',uniqueIds:['1111111111111_known'],
    reviewId:'legacy',sourceUrls:['https://example.org/source'],action:'hold' as const}]};
  const event:any={venueId:'fixture',uniqueId:'1111111111111_other',startDate:'2026-11-04',startTime:'10:00',eventName:'Other activity'};
  assert.equal(classifyReviewedOccurrenceConstraint(event,venue),'none');
  assert.equal(classifyReviewedOccurrenceConstraint({...event,uniqueId:'1111111111111_known'},venue),'hold');
});

test('partially specified or invalid semantic hold rules fail closed without changing their input',()=>{
  const entry=fixture[0],rule=entry.venue.reviewedOccurrenceConstraints[0];
  const event:any={venueId:entry.venue.id,uniqueId:entry.source+'_changed',eventName:entry.activity,startDate:'2026-11-04',startTime:entry.clock};
  for(const patch of [{startDate:'2026-02-30'},{startTime:'25:00'},{eventNames:[]},{eventNames:['']},{startDate:undefined}]){
    const venue={id:entry.venue.id,reviewedOccurrenceConstraints:[{...rule,...patch}] as ReviewedOccurrenceConstraint[]};
    const before=JSON.stringify(venue);
    assert.equal(classifyReviewedOccurrenceConstraint(event,venue),'hold');assert.equal(JSON.stringify(venue),before);
  }
});
