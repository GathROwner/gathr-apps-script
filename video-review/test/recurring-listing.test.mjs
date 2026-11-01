import test from 'node:test';
import assert from 'node:assert/strict';
import {nextListingOccurrence,scheduleFingerprint} from '../listing-schedule.mjs';
import {expiryFor} from '../manual-publication.mjs';
import {bindingIsCurrent} from '../published-policy.mjs';
import {exactListings} from '../pipeline.mjs';
import {FakeDB} from './fake-publication.mjs';
const now=Date.parse('2026-11-01T22:00:00Z');
const event={sourceUniqueIds:['1795594419240850'],name:'Saturday Session',venueId:'v',startDate:'2026-09-12',endDate:'2026-09-12',startTime:'13:30',endTime:'16:00',isRecurring:'Yes',recurringPattern:'weekly_saturday'};
test('old weekly anchor matches the next supported Saturday without changing the stored event',async()=>{
 const db=new FakeDB({'venues/v/events/e':event,'venues/v':{name:'Evermoore'}});
 const result=await exactListings(db,{sourcePostId:event.sourceUniqueIds[0]},now);
 assert.equal(result.length,1);assert.equal(result[0].date,'2026-11-07');assert.equal(result[0].time,'13:30');assert.match(result[0].notes,/anchored 2026-09-12/);
 assert.equal(result[0].scheduleFingerprint,scheduleFingerprint(event));assert.deepEqual(db.snap('venues/v/events/e').data(),event);
 assert.equal((await exactListings(db,{sourcePostId:'unrelated'},now)).length,0);
});
test('one-off past events, cancelled series and contradictory or complex schedules stay excluded',()=>{
 for(const patch of [{isRecurring:'No',recurringPattern:'none'},{isRecurring:'No'},{status:'cancelled'},{isCancelled:true},{metadata:{isExpired:true}},{recurringPattern:'weekly_custom'},{startDate:'2026-09-13'},{recurringWeekdaySequence:['saturday']},{recurringDaysOfWeek:['sunday']},{excludedDates:['2026-11-07']},{recurringWeekInterval:0},{startDate:'2026-02-30'}])assert.equal(nextListingOccurrence({...event,...patch},now),null,JSON.stringify(patch));
});
test('until dates, explicit end bounds, counts and fortnightly intervals constrain the next occurrence',()=>{
 for(const patch of [{recurrenceUntilDate:'2026-10-31'},{endDate:'2026-10-31'},{totalOccurrences:8}])assert.equal(nextListingOccurrence({...event,...patch},now),null);
 assert.equal(nextListingOccurrence({...event,recurrenceUntilDate:'2026-11-07',totalOccurrences:9},now).date,'2026-11-07');
 assert.equal(nextListingOccurrence({...event,recurringWeekInterval:2},now).date,'2026-11-07');
 assert.equal(nextListingOccurrence({...event,recurringWeekInterval:2},Date.parse('2026-11-08T15:00:00Z')).date,'2026-11-21');
});
test('recurring expiry rolls to the next occurrence, respects Halifax DST and is capped by evidence retention',()=>{
 assert.equal(expiryFor(event,now),'2026-11-08T03:59:59.000Z');
 assert.equal(expiryFor(event,Date.parse('2026-11-08T15:00:00Z')),'2026-11-15T03:59:59.000Z');
 assert.equal(expiryFor(event,now,'2026-11-07T20:00:00Z'),'2026-11-07T20:00:00.000Z');
 assert.equal(expiryFor(event,Date.parse('2026-10-30T15:00:00Z')),'2026-11-01T02:59:59.000Z');
 assert.throws(()=>expiryFor({...event,recurrenceUntilDate:'2026-10-31'},now),/ended/);
});
test('future occurrence beyond retained evidence does not queue an unusable video review',async()=>{
 const db=new FakeDB({'venues/v/events/e':event,'venues/v':{name:'Evermoore'}});
 assert.equal((await exactListings(db,{sourcePostId:event.sourceUniqueIds[0],expiresAt:'2026-11-06T23:00:00Z'},now)).length,0);
});
test('schedule changes invalidate a recurring binding even though the public legacy fingerprint stays compatible',()=>{
 const b={sourceId:event.sourceUniqueIds[0],expiresAt:expiryFor(event,now),scheduleFingerprint:scheduleFingerprint(event)};
 assert.equal(bindingIsCurrent(b,event,now),true);
 for(const patch of [{recurrenceUntilDate:'2026-10-31'},{totalOccurrences:1},{isRecurring:'No'},{recurringPattern:'weekly_sunday'}])assert.equal(bindingIsCurrent(b,{...event,...patch},now),false);
});
