import test from 'node:test';import assert from 'node:assert/strict';
import {classifyReviewedOccurrenceConstraint as classify} from './reviewedOccurrenceConstraints.js';
import {checkDuplicate} from './firestoreService.js';
const rule={sourceUniqueId:'1111111111111',uniqueIds:['1111111111111_old'],reviewId:'review_fixture',sourceUrls:['https://venue.example/season'],action:'season_bound' as const,untilDate:'2026-10-10',startTime:'16:00',recurringPattern:'weekly_saturday'};
const venue={id:'venue_fixture',reviewedOccurrenceConstraints:[rule]};
const event:any={venueId:venue.id,uniqueId:rule.uniqueIds[0],startTime:'16:00',recurringPattern:'weekly_saturday'};
test('reviewed seasonal tours reject the old unbounded source representation',()=>assert.equal(classify(event,venue),'hold'));
test('a bounded tour with no invented finish is allowed',()=>assert.equal(classify({...event,recurrenceUntilDate:'2026-10-10'},venue),'none'));
test('later horizon, wrong clock or inferred finish cannot overwrite the repaired tour',()=>{
 for(const patch of [{recurrenceUntilDate:'2026-10-11'},{startTime:'15:00'},{endTime:'23:00',timeFlags:{end:{source:'none'}}}])assert.equal(classify({...event,recurrenceUntilDate:'2026-10-10',...patch},venue),'hold');
});
test('a separately verified explicit finish is not suppressed',()=>assert.equal(classify({...event,recurrenceUntilDate:'2026-10-10',endTime:'17:00',timeFlags:{end:{source:'explicit'}}},venue),'none'));
test('new dated sources, another activity and another venue are unaffected',()=>{
 for(const patch of [{uniqueId:'2222222222222_new'},{uniqueId:'1111111111111_other'},{venueId:'another_venue'}])assert.equal(classify({...event,...patch},venue),'none');
});
test('guest morning programme holds only the exact wrong-clock identities',()=>{
 const v={...venue,reviewedOccurrenceConstraints:[{...rule,action:'hold' as const}]};assert.equal(classify(event,v),'hold');assert.equal(classify({...event,uniqueId:'1111111111111_corrected'},v),'none');
});
test('invalid policy holds; existing retirement configuration is independent',()=>{
 assert.equal(classify(event,{...venue,reviewedOccurrenceConstraints:[{...rule,sourceUrls:['http://venue.example']}] }),'hold');
 const before=JSON.stringify(venue);classify(event,venue);assert.equal(JSON.stringify(venue),before);
});
test('actual write-selection service holds reviewed stale tour and morning card before database access',async()=>{
 assert.deepEqual(await checkDuplicate(event,venue.id,[],venue as any),{isDuplicate:true});
 assert.deepEqual(await checkDuplicate(event,venue.id,[],{...venue,reviewedOccurrenceConstraints:[{...rule,action:'hold'}]} as any),{isDuplicate:true});
});

test('exact reviewed dated occurrence rejects obsolete date and inferred finish without touching other sources',async()=>{
 const fixed={...rule,action:'fixed_occurrence' as const,startDate:'2026-10-15',endDate:'2026-10-15',startTime:'19:00',endTime:''};
 const v={...venue,reviewedOccurrenceConstraints:[fixed]};
 const current:any={...event,startDate:fixed.startDate,endDate:fixed.endDate,startTime:fixed.startTime,endTime:'',recurringPattern:'none',isRecurring:'No',timeFlags:{start:{source:'explicit'},end:{source:'none'}}};
 assert.equal(classify(current,v),'none');
 for(const patch of [{startDate:'2026-10-16',endDate:'2026-10-16'},{endTime:'23:00'},{startTime:'09:38'},{recurringPattern:'weekly_friday'},{timeFlags:{start:{source:'post_timestamp'}}}]){
  assert.equal(classify({...current,...patch},v),'hold');
  assert.deepEqual(await checkDuplicate({...current,...patch},venue.id,[],v as any),{isDuplicate:true});
 }
 assert.equal(classify({...current,startDate:'2026-10-16',uniqueId:'2222222222222_other'},v),'none');
 assert.equal(classify(current,{...v,reviewedOccurrenceConstraints:[{...fixed,startDate:'2026-02-30'}]}),'hold');
});

test('reviewed office-pinned duplicate holds exact occurrence through changed semantic IDs without moving its venue',async()=>{
 const retired={...rule,action:'retired_occurrence' as const,startDate:'2026-10-17',startTime:'11:00',
   eventNames:['Kids Fox Trot'],canonicalEventPath:'venues/real_park/events/canonical'};
 const v={...venue,reviewedOccurrenceConstraints:[retired]};
 const e={...event,name:'Kids Fox Trot',startDate:'2026-10-17',startTime:'11:00',uniqueId:'1111111111111_new_semantic_id'};
 assert.equal(classify(e,v),'hold');
 assert.deepEqual(await checkDuplicate(e,v.id,[],v as any),{isDuplicate:true});
 for(const patch of [{name:'Team Relay'},{startDate:'2026-10-18'},{startTime:'14:00'},
   {uniqueId:'2222222222222_new'},{venueId:'real_park'}])assert.equal(classify({...e,...patch},v),'none');
 const before=JSON.stringify(v);classify(e,v);assert.equal(JSON.stringify(v),before);
 for(const patch of [{eventNames:[]},{canonicalEventPath:'events/unverified'},{startTime:'25:00'},{startDate:'2026-02-30'}])
   assert.equal(classify(e,{...v,reviewedOccurrenceConstraints:[{...retired,...patch}]}),'hold');
});
