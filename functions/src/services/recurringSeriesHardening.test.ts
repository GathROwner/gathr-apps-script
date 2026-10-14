import test from 'node:test';
import assert from 'node:assert/strict';
import type {EventData, VenueData} from '../types/index.js';
import {recurringSeriesCoversOccurrence} from './firestoreService.js';
import {createRecurringSeriesCatalogCache, sourceLinkedHistoricalSeriesKeepers} from './recurringSeriesCatalog.js';
import {incompatibleRecurringSeriesLifecycle} from '../utils/recurringSeriesLifecycle.js';
import {hasConflictingOccurrenceIdentity} from '../utils/occurrenceMergeGuard.js';
import {isRecurringFamilyFallbackCompatible} from './recurringFamilyFallback.js';
import {selectStandingKaraokeOccurrence} from './standingKaraokeOccurrence.js';
import {previewDuplicateMerge} from '../processing/rowProcessor.js';

const venue = {id:'fixture',name:'Fixture',normalizedName:'fixture',facebookUrl:'https://www.facebook.com/FixtureOwner/'} as VenueData;
const event = (patch: Partial<EventData> = {}): EventData => ({
  id:'parent',uniqueId:'1111111111111_a',venueId:'fixture',establishment:'Fixture',
  eventName:'Wednesday Trivia',name:'Wednesday Trivia',category:'Trivia',eventType:'trivia',
  description:'Every Wednesday.',startDate:'2026-05-27',endDate:'2026-05-27',startTime:'20:00',endTime:'22:00',
  isRecurring:'Yes',recurringPattern:'weekly_wednesday',isEvent:'Yes',isFoodSpecial:'No',
  facebookUrl:venue.facebookUrl,sourceTimestamp:new Date('2026-05-20T12:00:00Z'),...patch,
} as EventData);

test('active old trivia, daily, monthly and multi-day series use their actual recurrence, not parent age',()=>{
  assert(recurringSeriesCoversOccurrence(event(), '2026-10-14'));
  assert(!recurringSeriesCoversOccurrence(event(),'2026-10-16'));
  assert(recurringSeriesCoversOccurrence(event({recurringPattern:'daily'}),'2026-10-16'));
  assert(recurringSeriesCoversOccurrence(event({startDate:'2026-01-15',recurringPattern:'monthly'}),'2026-10-15'));
  assert(!recurringSeriesCoversOccurrence(event({startDate:'2026-01-15',recurringPattern:'monthly'}),'2026-10-16'));
  assert(recurringSeriesCoversOccurrence(event({recurringPattern:'weekly_custom',recurringDaysOfWeek:['wednesday','friday']}),'2026-10-16'));
});
test('occurrence membership respects both counts and until, including multi-day and fortnightly series',()=>{
  const four=event({totalOccurrences:4,recurrenceUntilDate:'2026-12-31'});
  assert(recurringSeriesCoversOccurrence(four,'2026-06-17'));
  assert(!recurringSeriesCoversOccurrence(four,'2026-06-24'));
  assert(!recurringSeriesCoversOccurrence(event({recurrenceUntilDate:'2026-06-10'}),'2026-06-17'));
  const multi=event({recurringPattern:'weekly_custom',recurringDaysOfWeek:['wednesday','friday'],totalOccurrences:4});
  assert(recurringSeriesCoversOccurrence(multi,'2026-06-05'));
  assert(!recurringSeriesCoversOccurrence(multi,'2026-06-10'));
  assert(recurringSeriesCoversOccurrence(event({recurringWeekInterval:2,recurringDaysOfWeek:['wednesday']}),'2026-06-10'));
  assert(!recurringSeriesCoversOccurrence(event({recurringWeekInterval:2,recurringDaysOfWeek:['wednesday']}),'2026-06-03'));
});
test('ongoing incoming series cannot be absorbed by a four-week parent in selection or defensive merge',()=>{
  for(const category of ['Trivia','Karaoke']){
    const name=category==='Karaoke'?'Karaoke Night':'Wednesday Trivia';
    const finite=event({category,name,eventName:name,totalOccurrences:4});
    const incoming=event({category,name,eventName:name,uniqueId:'2222222222222_b',startDate:'2026-06-03',sourceTimestamp:new Date('2026-06-01T12:00:00Z')});
    assert(incompatibleRecurringSeriesLifecycle(incoming,finite));
    assert(hasConflictingOccurrenceIdentity(incoming,finite));
    assert(!isRecurringFamilyFallbackCompatible(incoming,finite));
    assert.deepEqual(previewDuplicateMerge({existingEvent:finite,incomingEvent:incoming,venue}).updates,{});
    if(category==='Karaoke')assert.equal(selectStandingKaraokeOccurrence(incoming,[finite]).kind,'none');
  }
});
test('finite series retain complete start/count/until identity while a dated member remains compatible',()=>{
  const finite=event({totalOccurrences:4});
  for(const incoming of [event({totalOccurrences:6}),event({totalOccurrences:4,startDate:'2026-06-03'}),event({recurrenceUntilDate:'2026-07-01'})])
    assert(incompatibleRecurringSeriesLifecycle(incoming,finite));
  assert(!incompatibleRecurringSeriesLifecycle(event({recurringPattern:'none',isRecurring:'No',startDate:'2026-06-03'}),finite));
  assert(!incompatibleRecurringSeriesLifecycle(event({totalOccurrences:4,recurringDaysOfWeek:['wednesday']}),finite));
});
test('general family matching preserves distinct rooms and age groups',()=>{
  const old=event({additionalLocation:'Room A',ageRestriction:'19+'});
  assert(!isRecurringFamilyFallbackCompatible(event({uniqueId:'2222222222222_b',startDate:'2026-10-14',additionalLocation:'Room B'}),old));
  assert(!isRecurringFamilyFallbackCompatible(event({uniqueId:'2222222222222_b',startDate:'2026-10-14',additionalLocation:'Room A',ageRestriction:'All ages'}),old));
});
test('a dated external trivia roundup only links provenance, never its collage or inferred finish',()=>{
  const incoming=event({uniqueId:'2222222222222_b',startDate:'2026-10-14',isRecurring:'No',recurringPattern:'none',
    facebookUrl:'https://www.facebook.com/FixtureRoundup/',mediaUrls:['https://example.com/unrelated-collage'],endTime:'01:00'});
  const result=previewDuplicateMerge({existingEvent:event(),incomingEvent:incoming,venue});
  assert.deepEqual(result.changedFields,['sourceUniqueIds']);
  assert.equal(result.updates.endTime,undefined);assert.equal(result.updates.mediaUrls,undefined);
});
test('general owner series refresh protects older prose and accepts only event-attributed new media',()=>{
  const existing=event({description:'Tomorrow we have our weekly trivia show.'});
  const url='https://storage.googleapis.com/gathr-uploaded-images/postimages/fixture-trivia.webp';
  const incoming=event({uniqueId:'2222222222222_b',startDate:'2026-10-14',description:'Every Wednesday trivia.',sourceTimestamp:new Date('2026-10-13T12:00:00Z'),
    relevantImageUrl:url,mediaUrls:[url,'https://example.com/another-event'],imageProvenance:{version:1,primarySource:'post_media',primaryUrl:url,isFallback:false,sourceFields:[],media:[]}});
  const result=previewDuplicateMerge({existingEvent:existing,incomingEvent:incoming,venue});
  assert.equal(result.updates.description,incoming.description);assert.deepEqual(result.updates.mediaUrls,[url]);
  assert.deepEqual(previewDuplicateMerge({existingEvent:incoming,incomingEvent:existing,venue}).updates,{});
});
test('catalog paginates recurring history and shares one cached load across concurrent items',async()=>{
  let calls=0,now=0;
  const cache=createRecurringSeriesCatalogCache({now:()=>now});
  const parents=Array.from({length:320},(_,i)=>event({id:String(i),totalOccurrences:i===319?undefined:1}));
  const fetch=async(cursor?:unknown)=>{calls++;const index=Number(cursor||0);return {events:parents.slice(index,index+100),nextCursor:index+100<parents.length?index+100:undefined};};
  const [a,b]=await Promise.all([cache.get('fixture',fetch),cache.get('fixture',fetch)]);
  assert.equal(calls,4);assert.equal(a,b);assert(a.complete);
  assert.equal(a.events.filter(x=>recurringSeriesCoversOccurrence(x,'2026-10-14')).length,1);
  cache.invalidate('fixture');await cache.get('fixture',fetch);assert.equal(calls,8);
  now=31000;await cache.get('fixture',fetch);assert.equal(calls,12);
});
test('Facebook p pages with different owner IDs cannot repaint a recurring poster',()=>{
  const owner={...venue,facebookUrl:'https://www.facebook.com/p/Fixture-Owner-1111111111111/'};
  const existing=event({facebookUrl:owner.facebookUrl});
  const url='https://storage.googleapis.com/gathr-uploaded-images/postimages/other-owner.webp';
  const incoming=event({uniqueId:'2222222222222_b',startDate:'2026-10-14',facebookUrl:'https://www.facebook.com/p/Other-Owner-2222222222222/',
    sourceTimestamp:new Date('2026-10-13T12:00:00Z'),image:url,mediaUrls:[url],
    imageProvenance:{version:1,primarySource:'post_media',primaryUrl:url,isFallback:false}});
  const result=previewDuplicateMerge({existingEvent:existing,incomingEvent:incoming,venue:owner});
  for(const field of ['mediaUrls','image','imageUrl','relevantImageUrl','imageProvenance'])assert.equal((result.updates as any)[field],undefined);
});
test('incomplete catalog and failed loads cannot masquerade as complete empty history',async()=>{
  const cache=createRecurringSeriesCatalogCache({maxPages:2});
  const result=await cache.get('fixture',async()=>({events:[event()],nextCursor:'more'}));
  assert.equal(result.complete,false);
  let calls=0;const failing=createRecurringSeriesCatalogCache();
  const fetch=async()=>{calls++;throw new Error('transient');};
  await assert.rejects(failing.get('fixture',fetch));await assert.rejects(failing.get('fixture',fetch));assert.equal(calls,2);
});
test('replay of an explicitly retired source links to the canonical series without resurrecting its earlier parent',()=>{
  for(const category of ['Trivia','Karaoke']){
    const name=category==='Karaoke'?'Karaoke Night':'Wednesday Trivia';
    const historical=event({category,name,eventName:name});
    const keeper=event({id:'canonical',category,name,eventName:name,uniqueId:'2222222222222_b',startDate:'2026-09-30',
      sourceTimestamp:new Date('2026-09-30T12:00:00Z'),sourceUniqueIds:['1111111111111']});
    const matches=sourceLinkedHistoricalSeriesKeepers(historical,[keeper]);assert.equal(matches[0]?.id,'canonical');
    const result=previewDuplicateMerge({existingEvent:{...keeper,_sourceCorroborationOnly:true} as EventData,incomingEvent:historical,venue});
    assert(result.changedFields.every(x=>['sourceUniqueIds','sourceUrls'].includes(x)));
    assert.equal(result.updates.startDate,undefined);assert.equal(result.updates.description,undefined);
    assert.equal(sourceLinkedHistoricalSeriesKeepers({...historical,uniqueId:'3333333333333_c'},[keeper]).length,0);
    assert.equal(sourceLinkedHistoricalSeriesKeepers({...historical,recurringPattern:'weekly_friday'},[keeper]).length,0);
    assert.equal(sourceLinkedHistoricalSeriesKeepers({...historical,totalOccurrences:4},[keeper]).length,0);
  }
});
