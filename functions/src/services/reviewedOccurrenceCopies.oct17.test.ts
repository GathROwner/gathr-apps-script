import assert from 'node:assert/strict';
import {test} from 'node:test';
import {EventData} from '../types/index.js';
import {classifyReviewedOccurrenceConstraint, ReviewedOccurrenceConstraint} from './reviewedOccurrenceConstraints.js';
import {checkDuplicate} from './firestoreService.js';

// Synthetic source IDs: the live identities belong only in the private repair
// manifest. The same existing reviewed-retirement contract covers both cases.
for (const [title,canonicalVenue,retiredVenue,date,start] of [
  ['NHL Game on the Screens','food_hall','food_hall','2026-10-17','17:00'],
  ['THE COMEDY CAVE','comedy_room','factory','2026-11-07','20:00'],
]) test(`reviewed ${title} copy is held without blanket same-time or venue-alias matching`, async()=>{
  const rule:ReviewedOccurrenceConstraint={sourceUniqueId:'1111111111111111',uniqueIds:['1111111111111111_old'],
    sourceUrls:['https://www.facebook.com/100000000000000/posts/1111111111111111'],
    action:'retired_occurrence',reviewId:'oct17-reviewed-copy-fixture',startDate:date,startTime:start,
    eventNames:[title],canonicalEventPath:`venues/${canonicalVenue}/events/keeper`};
  const venue={id:retiredVenue,reviewedOccurrenceConstraints:[rule]};
  const event={venueId:retiredVenue,uniqueId:'1111111111111111_regenerated',name:title,startDate:date,startTime:start} as EventData;
  assert.equal(classifyReviewedOccurrenceConstraint(event,venue),'hold');
  assert.deepEqual(await checkDuplicate(event,retiredVenue,[],venue as any),{isDuplicate:true});
  for (const patch of [
    {name:'Chris Burke'}, {name:'A separate comedy show'}, {startDate:'2026-11-08'},
    {startTime:'21:00'}, {uniqueId:'2222222222222222_new'}, {venueId:'other_venue'},
  ]) assert.equal(classifyReviewedOccurrenceConstraint({...event,...patch},venue),'none');
  const before=JSON.stringify(venue);
  classifyReviewedOccurrenceConstraint(event,venue);
  assert.equal(JSON.stringify(venue),before);
});
