import test from 'node:test';import assert from 'node:assert/strict';
import {dateOnlyActivity} from './dateOnlyActivity.js';
import {constrainSourceTimes} from './sourceTimeConstraints.js';
import {rehydrateFormattedEventMetadata} from './finalFormatter.js';
import {enforceDateTimeCompleteness} from './postParser.js';
import {mergeStageArtifactsSnapshot,sanitizeStageArtifactsSnapshot} from '../processing/rowProcessor.js';
const dated:any={name:'Stay & Play',description:'Package begins October 16, $149 per person for a night and round.',date:'2026-10-16',startTime:'',endTime:'',recurringPattern:'none',_stage4NeedsTimeEnrichment:true,_sourceType:'event'};
const format:any={name:dated.name,description:dated.description,startDate:dated.date,endDate:dated.date,startTime:'12:30',endTime:'23:00',isEvent:'Yes',isFoodSpecial:'No',category:'Gatherings & Parties',recurringPattern:'none'};
test('untimed dated booking cannot gain post/venue clocks and remains a durable candidate while rollout is off',()=>{
  const item=constrainSourceTimes([dated],'')[0];
  assert.equal(item._sourceTimeConstraint?.reason,'dated_activity_without_clock');
  const restored=rehydrateFormattedEventMetadata(format,item);
  assert.equal(restored.startTime,'');assert.equal(restored.endTime,'');
  const off=enforceDateTimeCompleteness([restored as any],'2026-10-16T12:30:00Z','America/Halifax');
  assert.equal(off.length,0);assert.equal((off as any)._dateOnlyCandidates.length,1);
  const saved=sanitizeStageArtifactsSnapshot(mergeStageArtifactsSnapshot(undefined,{source:'live',stage56HeldItems:(off as any)._dateOnlyCandidates}));
  assert.equal(saved?.stage56HeldItems?.[0].startDate,'2026-10-16');
});
test('explicit opt-in keeps unknown clocks with expiry-only timing and no invented all-day window',()=>{
  const item=constrainSourceTimes([dated],'')[0];
  const restored=rehydrateFormattedEventMetadata(format,item);
  const result=enforceDateTimeCompleteness([restored as any],'2026-10-16T12:30:00Z','America/Halifax','',false,true);
  assert.equal(result.length,1);assert.equal(result[0].startTime,'');assert.equal(result[0].endTime,'');
  const timing:any=result[0].timing;
  assert.equal(timing.scheduleKind,'timed_session');assert.equal(timing.schedule.start.localTime,null);
  assert.equal(timing.schedule.end.status,'unknown');assert.equal(timing.estimate.discoveryCutoffDate,'2026-10-16');
  assert.equal(timing.estimate.displayEndTime,undefined);
});
test('ambiguous clocks, malformed dates, recurrence and unvalidated content do not gain date-only publication',()=>{
  const base:any={...format,startTime:'',endTime:'',_sourceTimeConstraint:{reason:'dated_activity_without_clock'}};
  for(const patch of [{_sourceTimeConstraint:{reason:'unresolved_meridiem'}},{startDate:'2026-02-30'},
    {endDate:'2026-10-15'},{recurringPattern:'weekly_thursday'},{isEvent:'No',isFoodSpecial:'No'},
    {_sourceTimeConstraint:undefined},{startTime:'20:00'}])assert.equal(dateOnlyActivity({...base,...patch}),null);
});
test('date-only evidence cannot defeat the Firestore artifact budget',()=>{
  const items=Array.from({length:120},()=>({...format,description:'x'.repeat(9000)}));
  const saved=sanitizeStageArtifactsSnapshot({source:'live',stage56HeldItems:items});
  assert(Buffer.byteLength(JSON.stringify(saved))<240000);assert(saved?.artifactTruncation);
});
