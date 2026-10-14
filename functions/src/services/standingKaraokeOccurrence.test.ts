import test from 'node:test';
import assert from 'node:assert/strict';
import {EventData, VenueData} from '../types/index.js';
import {coversStandingKaraokeOccurrence, selectStandingKaraokeOccurrence} from './standingKaraokeOccurrence.js';
import {previewDuplicateMerge} from '../processing/rowProcessor.js';
import {hasConflictingOccurrenceIdentity} from '../utils/occurrenceMergeGuard.js';
import {isRecurringFamilyFallbackCompatible} from './recurringFamilyFallback.js';

const venue = {id:'fixture',name:'Fixture',normalizedName:'fixture',address:'119 Fixture St',latitude:0,longitude:0,facebookUrl:'https://www.facebook.com/FixtureOwner/'} as VenueData;
const event = (patch: Partial<EventData> = {}): EventData => ({
  id:'old-parent',uniqueId:'oldsource_1',venueId:'fixture',establishment:'Fixture',
  eventName:'Karaoke Night ✨',name:'Karaoke Night ✨',category:'Karaoke',eventType:'karaoke',
  description:'Every Wednesday. 19+.',startDate:'2026-05-27',endDate:'2026-05-28',
  startTime:'20:00',endTime:'00:00',recurringPattern:'weekly_wednesday',isRecurring:'Yes',
  isEvent:'Yes',isFoodSpecial:'No',sourceTimestamp:new Date('2026-09-16T23:28:24Z'),
  facebookUrl:'https://www.facebook.com/FixtureOwner/',
  mediaUrls:['https://example.com/old-poster','https://example.com/unrelated-collage'],
  timeFlags:{start:{source:'explicit',evidence:'8 PM'},end:{source:'explicit',evidence:'12 AM',toClose:false}},
  ...patch,
});
const dated = (patch: Partial<EventData> = {}) => event({id:'new-child',uniqueId:'newsource_1',eventName:'Karaoke',name:'Karaoke',
  description:'Fixture: Karaoke',startDate:'2026-10-14',endDate:'2026-10-14',endTime:'',recurringPattern:'none',isRecurring:'No',
  sourceTimestamp:new Date('2026-10-13T11:43:25Z'),timeFlags:{start:{source:'explicit',evidence:'8 PM'},end:{source:'none',evidence:'',toClose:false}},...patch});
test('standing karaoke survives the 120-day parent window and accepts the plain activity title',()=>{
  assert.equal(coversStandingKaraokeOccurrence(dated(),event()),true);
  assert.equal(selectStandingKaraokeOccurrence(dated(),[event()]).existing?.id,'old-parent');
  assert.equal(coversStandingKaraokeOccurrence(dated({startDate:'2026-09-30'}),event()),true);
});
test('multiple standing parents and conflicting printed finishes hold',()=>{
  assert.equal(selectStandingKaraokeOccurrence(dated(),[event(),event({id:'second'})]).kind,'hold');
  assert.equal(selectStandingKaraokeOccurrence(dated(),[event(),event({id:'second'})]).reason,'multiple_parents');
  assert.equal(selectStandingKaraokeOccurrence(dated({endTime:'23:00',timeFlags:event().timeFlags}),[event()]).kind,'hold');
  assert.equal(selectStandingKaraokeOccurrence(dated({endTime:'23:00',timeFlags:event().timeFlags}),[event()]).reason,'printed_end_conflict');
});
for (const [label,patch] of Object.entries({
  friday:{startDate:'2026-10-16'},differentStart:{startTime:'21:00'},room:{subVenue:'Other room'},
  venue:{venueId:'other'},branded:{eventName:'Sing-Along Night'},host:{eventName:'Karaoke with Fixture Host'},
  beforeStart:{startDate:'2026-05-20'},customDays:{recurringPattern:'weekly_custom',recurringDaysOfWeek:['wednesday','friday']},
})) test(`standing selector protects ${label}`,()=>{
  assert.equal(coversStandingKaraokeOccurrence(dated(patch as Partial<EventData>),event()),false);
});
test('bounded, fortnightly and age-specific series retain lifecycle identity',()=>{
  assert.equal(coversStandingKaraokeOccurrence(dated(),event({totalOccurrences:4})),false);
  assert.equal(coversStandingKaraokeOccurrence(dated(),event({recurrenceUntilDate:'2026-09-30'})),false);
  assert.equal(coversStandingKaraokeOccurrence(dated({startDate:'2026-10-21'}),event({recurringWeekInterval:2})),false);
  assert.equal(coversStandingKaraokeOccurrence(dated({ageRestriction:'All ages'}),event({ageRestriction:'19+'})),false);
});
test('exact-source and fallback guards protect a different clock/day despite generic titles',()=>{
  const old=event(),wrong=dated({uniqueId:old.uniqueId,startTime:'21:00'});
  assert.equal(hasConflictingOccurrenceIdentity(old,wrong),true);
  assert.equal(isRecurringFamilyFallbackCompatible(wrong,old),false);
  assert.deepEqual(previewDuplicateMerge({existingEvent:old,incomingEvent:wrong,venue}).updates,{});
});
test('defensive merge cannot let an aggregate occurrence repaint a standing parent',()=>{
  const old=event(),incoming=dated({mediaUrls:['https://example.com/collage'],endTime:'01:00'});
  const result=previewDuplicateMerge({existingEvent:old,incomingEvent:incoming,venue});
  assert.deepEqual(result.updates,{sourceUniqueIds:['oldsource','newsource']});
  assert.deepEqual(result.changedFields,['sourceUniqueIds']);
});
test('a fresh owner poster replaces the standing gallery without adding historical collages',()=>{
  const old=event(),incoming=event({id:'fresh',uniqueId:'freshsource_1',startDate:'2026-09-30',endDate:'2026-10-01',
    sourceTimestamp:new Date('2026-09-30T23:55:05Z'),mediaUrls:['https://storage.googleapis.com/gathr-uploaded-images/postimages/fixture-fresh.webp','https://example.com/unrelated-broadway'],
    relevantImageUrl:'https://storage.googleapis.com/gathr-uploaded-images/postimages/fixture-fresh.webp',
    imageProvenance:{version:1,primarySource:'post_media',primaryUrl:'https://storage.googleapis.com/gathr-uploaded-images/postimages/fixture-fresh.webp',isFallback:false,sourceFields:[],media:[]}});
  const result=previewDuplicateMerge({existingEvent:old,incomingEvent:incoming,venue});
  assert.deepEqual(result.updates.mediaUrls,[incoming.relevantImageUrl]);
  assert.equal(result.updates.startDate,undefined);
  const stale=previewDuplicateMerge({existingEvent:incoming,incomingEvent:old,venue});
  assert.deepEqual(stale.updates,{});
});
test('fresh owner recurrence replaces stale relative prose while older richer captions cannot repaint it',()=>{
  const old=event({description:'Tomorrow we are hosting our weekly karaoke night. Bring your friends and sing your favourite tunes. See you there!'});
  const current=event({uniqueId:'fresh_1',startDate:'2026-10-14',sourceTimestamp:new Date('2026-10-14T12:00:00Z'),description:'Every Wednesday karaoke. 19+.'});
  assert.equal(previewDuplicateMerge({existingEvent:old,incomingEvent:current,venue}).updates.description,current.description);
  assert.deepEqual(previewDuplicateMerge({existingEvent:current,incomingEvent:old,venue}).updates,{});
});
test('shared guard callers without canonical venue IDs retain their prior comparison behavior',()=>{
  const old=event({venueId:undefined}),incoming=dated({venueId:undefined});
  assert.equal(hasConflictingOccurrenceIdentity(old,incoming),false);
  assert.equal(isRecurringFamilyFallbackCompatible(event({venueId:undefined,startDate:'2026-10-14',uniqueId:'new_1'}),old),true);
});
test('missing event-attributed media cannot replace or append a mixed source gallery',()=>{
  const incoming=event({uniqueId:'fresh_1',startDate:'2026-10-14',sourceTimestamp:new Date('2026-10-14T12:00:00Z'),mediaUrls:['https://example.com/mixed-gallery'],sharedPostThumbnail:'https://example.com/unrelated-thumbnail'});
  const result=previewDuplicateMerge({existingEvent:event(),incomingEvent:incoming,venue});
  for (const field of ['mediaUrls','image','imageUrl','relevantImageUrl','sharedPostThumbnail']) assert.equal((result.updates as any)[field],undefined);
});
test('defensive merge retains Friday and explicit midnight conflicts',()=>{
  for (const incoming of [dated({startDate:'2026-10-16',recurringPattern:'weekly_friday'}),
    event({uniqueId:'different_1',startDate:'2026-10-14',endTime:'23:00'})]) {
    assert.deepEqual(previewDuplicateMerge({existingEvent:event(),incomingEvent:incoming,venue}).updates,{});
  }
});
