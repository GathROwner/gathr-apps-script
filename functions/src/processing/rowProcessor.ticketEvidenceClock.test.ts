import test from 'node:test';import assert from 'node:assert/strict';
import {previewDuplicateMerge} from './rowProcessor.js';
const show=(evidence:string):any=>({uniqueId:'fixture_performance_a',name:'Fixture Performer',eventName:'Fixture Performer',venueId:'fixture_hall',establishment:'Fixture Hall',
 startDate:'2026-11-19',endDate:'2026-11-19',startTime:'20:00',endTime:'',category:'Live Music',eventType:'live_music',isEvent:'Yes',isFoodSpecial:'No',isRecurring:'No',recurringPattern:'none',
 price:'$25',timeFlags:{start:{source:'explicit',evidence},end:{source:'none',toClose:false,evidence:''}}});
const venue:any={id:'fixture_hall',name:'Fixture Hall'};
test('ISO occurrence and raw instant dates in evidence cannot replace an agreeing explicit start',()=>{
 for(const evidence of ['ticket API performance start 2026-11-19 20:00 America/Halifax; separate doors 18:30',
  'Linked performance timestamp 2026-11-20T00:00:24.039Z; America/Halifax 2026-11-19 20:00; ticket event 9876']){
  const existing=show(evidence),incoming={...existing,uniqueId:'fixture_performance_b'};
  const merged={...existing,...previewDuplicateMerge({existingEvent:existing,incomingEvent:incoming,venue}).updates};
  assert.equal(merged.startTime,'20:00');assert.equal(merged.endTime,'');assert.equal(merged.price,'$25');
 }
});
test('numeric ticket URL fragments cannot be parsed as a clock range',()=>{
 const existing=show('venue_website:https://tickets.example/events/11-19/20-22 | explicit show start 8 PM');
 const incoming={...existing,uniqueId:'fixture_performance_b'};
 const merged={...existing,...previewDuplicateMerge({existingEvent:existing,incomingEvent:incoming,venue}).updates};assert.equal(merged.startTime,'20:00');
});
test('corroborated printed clock ranges still protect the correct evening clock from incoming meridiem errors',()=>{
 const existing={...show('7:30-9:30 PM'),startTime:'19:30',endTime:'21:30'};
 const incoming={...show('7:30-9:30 PM'),startTime:'07:30',endTime:'21:30',uniqueId:'fixture_performance_b'};
 const merged={...existing,...previewDuplicateMerge({existingEvent:existing,incomingEvent:incoming,venue}).updates};assert.equal(merged.startTime,'19:30');assert.equal(merged.endTime,'21:30');
});
