import test from 'node:test';
import assert from 'node:assert/strict';
import * as admin from 'firebase-admin';
import {resolveAreaDateRangeTiming, AREA_TIMING_POLICY_VERSION} from './areaDateRangeTiming.js';
import {buildPublishedCityLevelEventDataForRegression} from './firestoreService.js';
import type {CityLevelEventReviewRecord} from '../types/index.js';

const input = () => ({locationScope:'area', startDate:'2026-10-14', endDate:'2026-10-18',
  startTime:'', endTime:'', reviewedDateOnly:true});
const generated = () => {const result=resolveAreaDateRangeTiming(input()); assert.equal(result.action,'set'); if(result.action!=='set')throw Error('Missing timing'); return result.timing;};
const record = (timing?: unknown): CityLevelEventReviewRecord => ({status:'published',locationScope:'area',
  locationLabel:'Downtown Charlottetown',locationCity:'Charlottetown',locationPrecision:'approximate',locationReviewStatus:'approved',
  eventName:'Festival fixture',eventDate:'2026-10-14',endDate:'2026-10-18',eventTime:'19:00',endTime:'23:00',occurrences:1,sampleRows:[],timing,
  finalization:{action:'approve_publish',manual:{eventDate:'2026-10-14',endDate:'2026-10-18',eventTime:'',endTime:''}}});

test('date-only area range uses legacy v2 multi_day with unknown clocks and discovery-only cutoff',()=>{
  const timing=generated();
  assert.equal(timing.version,2);assert.equal(timing.policyVersion,AREA_TIMING_POLICY_VERSION);
  assert.equal(timing.scheduleKind,'multi_day');assert.equal(timing.timeZone,'America/Halifax');
  assert.deepEqual(timing.schedule.start,{localDate:'2026-10-14',localTime:null,timeZone:'America/Halifax',status:'unknown'});
  assert.deepEqual(timing.schedule.end,{localDate:'2026-10-18',localTime:null,timeZone:'America/Halifax',status:'unknown'});
  assert.equal(timing.estimate.discoveryCutoffDate,'2026-10-18');assert.equal(timing.estimate.discoveryCutoffTime,'23:59');
  assert.equal(timing.estimate.confidence,'low');
  for(const field of ['displayEndTime','displayEndDate','displayEndAt','endAt']) assert.equal(field in timing.estimate,false);
  assert.equal(JSON.stringify(timing.schedule).includes('23:59'),false);
});
test('ordinary city, route, session, unreviewed blanks and invalid/one-day ranges receive no derived timing',()=>{
  for(const change of [{locationScope:'city'},{locationScope:'route'},{locationScope:'venue'},
    {startTime:'19:00'},{endTime:'21:00'},{reviewedDateOnly:false},{endDate:'2026-10-14'},
    {endDate:'2026-10-13'},{endDate:'2026-02-30'},{startDate:'2026-2-01'}]) {
    assert.deepEqual(resolveAreaDateRangeTiming({...input(),...change}),{action:'none'});
  }
});
test('changed dates replace the generated cutoff and advertised dates, including Halifax DST ranges',()=>{
  const result=resolveAreaDateRangeTiming({...input(),startDate:'2026-10-31',endDate:'2026-11-02',existingTiming:generated()});
  assert.equal(result.action,'set');if(result.action!=='set')throw Error('Missing timing');
  assert.equal(result.timing.schedule.start.localDate,'2026-10-31');assert.equal(result.timing.schedule.end.localDate,'2026-11-02');
  assert.equal(result.timing.estimate.discoveryCutoffDate,'2026-11-02');assert.equal(result.timing.estimate.discoveryCutoffTime,'23:59');
});
test('re-approval as timed session, single day, another scope or no explicit date-only intent clears only generated timing',()=>{
  for(const change of [{startTime:'19:00'},{endTime:'21:00'},{endDate:'2026-10-14'},{locationScope:'city'},{reviewedDateOnly:false}]) {
    assert.deepEqual(resolveAreaDateRangeTiming({...input(),...change,existingTiming:generated()}),{action:'clear'});
  }
});
test('authoritative rich v2 and unrelated contracts remain untouched, including a reused old marker with new evidence',()=>{
  const rich={...generated(),schedule:{start:{localDate:'2026-10-14',localTime:'19:00',status:'observed'},end:{localDate:'2026-10-18',localTime:'21:00',status:'observed'}}};
  for(const existingTiming of [rich,{...generated(),estimate:{...generated().estimate,displayEndTime:'21:00'}},
    {...generated(),policyVersion:'another_policy'}, {version:1,details:'unrelated'}]) {
    assert.deepEqual(resolveAreaDateRangeTiming({...input(),existingTiming}),{action:'preserve'});
    assert.deepEqual(resolveAreaDateRangeTiming({...input(),startTime:'20:00',existingTiming}),{action:'preserve'});
  }
});
test('public producer keeps clocks blank and preserves authoritative timing on refresh',()=>{
  const published=buildPublishedCityLevelEventDataForRegression('area_fixture',record());
  assert.equal(published.startTime,'');assert.equal(published.endTime,'');assert.deepEqual(published.timing,generated());
  const authoritative={version:2,schedule:{start:{status:'unknown'},end:{status:'unknown'}},estimate:{method:'reviewer_authoritative'}};
  assert.strictEqual(buildPublishedCityLevelEventDataForRegression('area_fixture',record(authoritative)).timing,authoritative);
});
test('public producer refresh and timed re-approval do not retain stale derived timing',()=>{
  const dated=buildPublishedCityLevelEventDataForRegression('area_fixture',record(generated()),{eventDate:'2026-10-15',endDate:'2026-10-20'});
  assert.equal((dated.timing as any).estimate.discoveryCutoffDate,'2026-10-20');
  assert.equal((dated.timing as any).schedule.start.localDate,'2026-10-15');
  const timed=buildPublishedCityLevelEventDataForRegression('area_fixture',record(generated()),{eventTime:'19:00',endTime:'21:00'});
  assert.equal(timed.startTime,'19:00');assert.equal(timed.endTime,'21:00');assert.deepEqual(timed.timing,admin.firestore.FieldValue.delete());
});
