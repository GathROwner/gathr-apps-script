import test from 'node:test';
import assert from 'node:assert/strict';
import fixtures from './__fixtures__/oct26-explicit-times.json';
import {constrainSourceTimes,hasProvenSourceDurationEnd} from './sourceTimeConstraints.js';
import {rehydrateFormattedEventMetadata} from './finalFormatter.js';
import {enforceDateTimeCompleteness} from './postParser.js';
import {resolveTimesWithOperatingHours} from './venueResolver.js';
import {preserveValidatedItemSourceType} from './secondaryValidator.js';
import {repairCaptionTakeoutWindow} from './captionMealCoverage.js';

const zone='America/Halifax',timestamp='2026-10-25T14:40:57Z';
const meal=fixtures[0],concert=fixtures[1];
const formatted=(item:any,patch:any={})=>({name:item.name,description:item.description,
  category:item._sourceType==='special'?'Food Special':'Live Music',
  isEvent:item._sourceType==='special'?'No':'Yes',isFoodSpecial:item._sourceType==='special'?'Yes':'No',
  establishment:item.venue,venue:item.venue,address:'',additionalLocation:'',
  startDate:item.date,endDate:item.date,startTime:item.startTime,endTime:item.endTime,
  ticketPrice:item.price,ticketLink:'',relevantImageIndex:0,isRecurring:'No',recurringPattern:'none',...patch} as any);
const constrain=(items:any[],caption:string)=>constrainSourceTimes(structuredClone(items),caption);

test.beforeEach(t=>{
  (t as import('node:test').TestContext).mock.method(globalThis,'fetch',async()=>assert.fail('Unexpected network request in local time regressions'));
});

test('exact Albert source retains three dated takeout specials and prices through final completion',async()=>{
  for(const input of [meal.stage3,meal.stage4]){
    const items=constrain(input,meal.caption);
    assert.equal(items.length,3);
    assert.deepEqual(items.map(x=>x.name),input.map(x=>x.name));
    assert.deepEqual(items.map(x=>x.price),['$20','$8','$20']);
    assert.deepEqual(constrain(items,meal.caption),items,'second source-constraint pass is idempotent');
    for(const item of items){
      assert.equal(item.date,'2026-10-25');assert.equal(item.startTime,'11:30');assert.equal(item.endTime,'19:00');
      assert.equal(item._sourceTimeConstraint,undefined);
      assert.equal(item.timeFlags?.start?.source,'implied');assert.equal(item.timeFlags?.end?.source,'explicit');
      assert.match(item.timeFlags!.start.evidence,/meridiem inferred/);
      assert.match(item.description!,/Takeout availability only/);
    }
    // Simulate the formatter dropping clocks/scope and retaining the old clockless hold.
    const output=items.map(item=>rehydrateFormattedEventMetadata(formatted(item,{description:item.name,
      startTime:'',endTime:'',_sourceTimeConstraint:{reason:'meal_period_without_clock'}}),item));
    const hours=await resolveTimesWithOperatingHours(output,'No lookup needed','',timestamp,{timezone:zone});
    const final=enforceDateTimeCompleteness(hours,timestamp,zone,meal.caption);
    assert.equal(final.length,3);
    for(const item of final){
      assert.equal(item.startDate,'2026-10-25');assert.equal(item.endDate,'2026-10-25');
      assert.equal(item.startTime,'11:30');assert.equal(item.endTime,'19:00');
      assert.match(item.description!,/Takeout availability only: 11:30-19:00/);
      assert.equal(item.timeResolution?.hoursUsed,false);
    }
  }
});

test('takeout evidence binds literal specials only, leaves unrelated entertainment and other dates alone',()=>{
  const entertainment={...meal.stage3[0],name:'Live music',_sourceType:'event',_sourceTimeConstraint:undefined};
  const unlisted={...meal.stage3[0],name:'Other food special'};
  const output=constrain([...meal.stage3,entertainment,unlisted] as any[],meal.caption);
  assert.equal(output[3].startTime,'');assert.equal(output[4].startTime,'');
  const dates=structuredClone(meal.stage3);dates[1].date='2026-10-26';
  assert(constrain(dates,meal.caption).every(x=>!x.startTime));
});

test('missing, ambiguous, overnight and multiple service windows remain clockless',()=>{
  for(const caption of [meal.caption.replace(/Takeout orders available from 11:30-7:00pm/,''),
    meal.caption.replace('11:30-7:00pm','11:30-7:00'),
    meal.caption.replace('11:30-7:00pm','11:30pm-7:00pm'),
    meal.caption.replace('11:30-7:00pm','11:00pm-1:00am'),
    meal.caption.replace('11:30-7:00pm','11:30-7:00pm or 9:00pm'),
    meal.caption.replace('Takeout orders','Tomorrow Takeout orders'),
    meal.caption+'\nTakeout orders available from 1pm-3pm.',
    meal.caption.replace(/today['’]s specials/i,'Other offers')]){
    assert(constrain(meal.stage3,caption).every(x=>!x.startTime),caption);
  }
  const explicit=constrain(meal.stage3,meal.caption.replace('11:30-7:00pm','11:30am-7:00pm'));
  assert.equal(explicit[0].timeFlags?.start?.source,'explicit');
  assert.equal(explicit[0].startTime,'11:30');
});

test('existing item clocks, ends, close evidence and unresolved meridiem outrank shared takeout window',()=>{
  for(const patch of [{startTime:'18:00'}, {endTime:'21:00'},
    {timeFlags:{start:{source:'none',evidence:''},end:{source:'none',toClose:true,evidence:'until close'}}},
    {_sourceTimeConstraint:{reason:'unresolved_meridiem',evidence:'ambiguous'}}]){
    const source={...meal.stage3[0],...patch};
    const [output]=constrain([source] as any[],meal.caption);
    assert.equal(output.startTime,source.startTime);assert.equal(output.endTime,source.endTime);
    assert.equal(output._sourceMeridiemResolution,undefined);
  }
});

test('exact Spook descriptions coalesce 60-minute and one-hour proof through formatting and completion',async()=>{
  for(const input of [concert.stage3,concert.stage4]){
    const [item]=constrain(input,concert.caption);
    assert.equal(item.startTime,'19:00');assert.equal(item.endTime,'20:00');
    assert.equal(item._sourceDurationResolution?.minutes,60);
    assert.match(item.timeFlags!.end!.evidence!,/60-minute \/ one-hour/);
    assert.deepEqual(item.spatial,(input[0] as any).spatial);
    assert.equal(item.date,'2026-10-25');assert.equal(item.venue,input[0].venue);
    const restored=rehydrateFormattedEventMetadata(formatted(item,{endTime:'01:00',endDate:'2026-10-26'}),item);
    const hours=await resolveTimesWithOperatingHours([restored],'No lookup needed','',timestamp,{timezone:zone});
    const [final]=enforceDateTimeCompleteness(hours,timestamp,zone,concert.caption);
    assert.equal(final.endTime,'20:00');assert.equal(final.endDate,'2026-10-25');
    assert.equal(hasProvenSourceDurationEnd(final),true);
  }
});

test('generic program duration handles overnight rollover and absent or untrusted starts',()=>{
  const source={...concert.stage3[0],name:'Evening recital',description:'A one-hour program.',startTime:'23:30'};
  const [item]=constrain([source] as any[],'');
  const restored=rehydrateFormattedEventMetadata(formatted(item),item);
  const [final]=enforceDateTimeCompleteness([restored],timestamp,zone);
  assert.equal(final.endTime,'00:30');assert.equal(final.endDate,'2026-10-26');
  for(const patch of [{startTime:''},{startTime:'7:00',description:'AM/PM unknown. A one-hour program.'},
    {timeFlags:{start:{source:'none',evidence:''},end:{source:'none',toClose:false}}}]){
    const [output]=constrain([{...source,...patch}] as any[],'');
    assert.equal(output.endTime,'');assert.equal(output._sourceDurationResolution,undefined);
  }
});

test('conflicting, multi-item, film-runtime, component and doors durations cannot supply a concert end',()=>{
  for(const description of ['A 60-minute concert; a 90-minute program.',
    'Two one-hour concerts; a 60-minute program.',
    'A 60-minute concert and a one-hour workshop.',
    'A one-hour program followed by another 60-minute concert.',
    'A one-hour class; another 60-minute class.',
    'A one-hour program with two 60-minute sessions.',
    'Doors open one hour before the 60-minute program.',
    'A 60-minute film screening in a one-hour program.',
    'A 60-minute song in a one-hour program.',
    'A one-hour intermission during the 60-minute program.',
    'Doors open for one hour.', 'A great concert without a stated duration.']){
    const [item]=constrain([{...concert.stage3[0],description}] as any[],'');
    assert.equal(item.endTime,'',description);assert.equal(item._sourceDurationResolution,undefined);
  }
});

test('an item explicit end is stronger than a duration, and ordinary classes remain supported',()=>{
  const source={...concert.stage3[0],endTime:'21:00',timeFlags:{start:concert.stage3[0].timeFlags.start,
    end:{source:'explicit',toClose:false,evidence:'Finishes at 9pm'}}};
  assert.equal(constrain([source] as any[],'')[0].endTime,'21:00');
  const [lesson]=constrain([{...concert.stage3[0],name:'Yoga class',description:'A one-hour class.'}] as any[],'');
  assert.equal(lesson.endTime,'20:00');
});

test('Stage 4 retains source proofs when it omits internal metadata or clocks',()=>{
  for(const fixture of fixtures){
    const sources=constrain(fixture.stage3,fixture.caption);
    for(const source of sources){
      for(const clocks of [{startTime:'',endTime:''},{startTime:source.startTime,endTime:source.endTime}]){
        const validated:any={...fixture.stage4.find(x=>x.name===source.name),...clocks};
        delete validated._sourceDurationResolution;delete validated._sourceMeridiemResolution;
        const kept=preserveValidatedItemSourceType(validated,source);
        assert.equal(kept.startTime,source.startTime);assert.equal(kept.endTime,source.endTime);
        assert.deepEqual(kept._sourceDurationResolution,source._sourceDurationResolution);
        assert.deepEqual(kept._sourceMeridiemResolution,source._sourceMeridiemResolution);
        const final=rehydrateFormattedEventMetadata(formatted(kept,{endTime:'01:00'}),kept);
        assert.equal(final.endTime,source.endTime);
        assert.equal(enforceDateTimeCompleteness([final],timestamp,zone,fixture.caption).length,1);
      }
    }
  }
});

test('Stage 4 does not transfer proofs to another identity/date or conflicting validated clocks',()=>{
  for(const fixture of fixtures){
    const [source]=constrain(fixture.stage3,fixture.caption);
    for(const patch of [{name:'Another item'},{date:'2026-10-26'},{startTime:'18:00'},
      {_sourceTimeConstraint:{reason:'doors_without_showtime',evidence:'Only doors known'}},
      {endTime:'',timeFlags:{start:source.timeFlags!.start,end:{source:'explicit',toClose:false,evidence:'Finishes at 9pm'}}},
      {endTime:'21:00',timeFlags:{start:source.timeFlags!.start,end:{source:'explicit',toClose:false,evidence:'9pm'}}}]){
      const validated:any={...fixture.stage4[0],...patch};
      const kept=preserveValidatedItemSourceType(validated,source);
      assert.equal(kept._sourceDurationResolution,undefined);assert.equal(kept._sourceMeridiemResolution,undefined);
      assert.equal(kept.startTime,validated.startTime);assert.equal(kept.endTime,validated.endTime);
    }
  }
});

test('review delta: equal sequential component durations remain unknown without whole-occurrence proof',()=>{
  for(const description of ['A one-hour performance followed by a one-hour reception.',
    'A 60-minute concert followed by a 60-minute Q&A.',
    'A one-hour performance. A one-hour reception.',
    'A 60-minute concert. The 60-minute Q&A starts at 7 pm.',
    'A one-hour performance. The one-hour reception starts at 7 pm.',
    'A one-hour concert and a one-hour Q&A.']){
    const source={...concert.stage3[0],description};
    const [item]=constrain([source] as any[],'');
    assert.equal(item.endTime,'',description);
    assert.equal(item._sourceDurationResolution,undefined,description);
    assert.equal(hasProvenSourceDurationEnd(item),false,description);
    const explicit={...source,endTime:'21:00',timeFlags:{start:source.timeFlags.start,
      end:{source:'explicit',toClose:false,evidence:'Finishes at 9pm'}}};
    assert.equal(constrain([explicit] as any[],'')[0].endTime,'21:00');
  }
});

test('review delta: item-local takeout exclusions outrank a shared window while other specials retain it',()=>{
  const restrictedCaption="Today's Specials\n-Roast Pork Dinner $20 (dine-in only; not available for takeout)\n-Bacon corn chowder $8\n-Seafood Chowder $20\nTakeout orders available from 11:30-7:00pm.";
  for(const evidence of ['bullet only','description only','extraction reason only','both']){
    const items:any[]=structuredClone(meal.stage3);
    const restriction='Dine-in only; not available for takeout.';
    if(evidence==='description only'||evidence==='both')items[0].description+=' '+restriction;
    if(evidence==='extraction reason only')items[0].extractionReason+=' '+restriction;
    const caption=evidence==='bullet only'||evidence==='both'?restrictedCaption:meal.caption;
    for(const output of [repairCaptionTakeoutWindow(structuredClone(items),caption),constrain(items,caption)]){
      assert.equal(output[0].startTime,'',evidence);assert.equal(output[0].endTime,'',evidence);
      assert.equal(output[0]._sourceMeridiemResolution,undefined,evidence);
      assert.doesNotMatch(output[0].description!,/Takeout availability only/);
      assert.deepEqual(output.slice(1).map(x=>[x.name,x.price,x.date,x.startTime,x.endTime]),[
        ['Bacon corn chowder','$8','2026-10-25','11:30','19:00'],
        ['Seafood Chowder','$20','2026-10-25','11:30','19:00']]);
    }
    const explicit={...items[0],startTime:'18:00',endTime:'20:00',timeFlags:{
      start:{source:'explicit',evidence:'Dine-in 6pm'},end:{source:'explicit',toClose:false,evidence:'Dine-in until 8pm'}}};
    const [kept]=constrain([explicit,...items.slice(1)],caption);
    assert.equal(kept.startTime,'18:00');assert.equal(kept.endTime,'20:00');
    assert.equal(kept._sourceMeridiemResolution,undefined);
  }
});
