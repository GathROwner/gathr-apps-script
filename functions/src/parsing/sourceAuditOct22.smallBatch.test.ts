// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './__fixtures__/sourceAuditOct22.smallBatch.json';
import {isCalendarVenueOnlyHeading,sourcePublicationHoldReason} from './sourcePublicationPolicy.js';
import {constrainSourceTimes} from './sourceTimeConstraints.js';
import {sourceItemHoldReason} from './sourceItemEvidence.js';
import {parsePostData,replayPostDataFromArtifacts,enforceDateTimeCompleteness,processEvents} from './postParser.js';
import {performFinalFormatting} from './finalFormatter.js';
import {createFullParserVenueLookupCache,previewFullParserEventWritePayload} from '../processing/rowProcessor.js';
const clone=x=>structuredClone(x),reason='attendee_venue_explicitly_withheld';
const input=(caption=fixture.rcmp.caption)=>({combinedText:caption,mediaUrls:[],sharedPostThumbnails:[],
  userName:'RCMP PEI',pageName:'RCMP',timestamp:'2026-10-21T13:01:29Z',facebookUrl:'',profilePicUrl:'',
  extractedData:{id:fixture.rcmp.source}});
const healthy=()=>({name:'Public Safety Talk',date:'2026-10-30',startTime:'17:00',endTime:'18:00',
  description:'Public Safety Talk at Example Hall, October30 from5–6PM. Register by email.',
  venue:'Example Hall',recurringPattern:'none',relevantImageIndex:-1,_pipelineIndex:3,
  spatial:{kind:'single_location',locations:[{label:'Example Hall',certainty:'confirmed',role:'location'}]},
  timeFlags:{start:{source:'explicit',evidence:'5pm'},end:{source:'explicit',evidence:'6pm',toClose:false}}});
function localEnvironment(t,overrides={}){
  const values={DRY_RUN:'true',PARSER_DRY_RUN_LOCAL_IMAGES:'true',LUNA_CANARY_ENABLED:'false',
    LUNA_TEXT_ONLY_ENABLED:'true',ENABLE_STAGE2_SCORE_ROUTING:'false',ENABLE_MODEL_ROUTER:'false',
    IMAGE_UPLOAD_URL:undefined,IMAGE_DELETE_URL:undefined,...overrides};
  const old=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));
  for(const[k,v]of Object.entries(values))if(v===undefined)delete process.env[k];else process.env[k]=v;
  t.after(()=>{for(const[k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;});
  t.mock.method(globalThis,'fetch',async()=>{assert.fail('Unexpected network request in offline source test');});
}
const cfg=(artifacts,skips=[])=>({lunaCanaryBypass:true,timezone:'America/Halifax',
  stageArtifactsHandler:x=>{artifacts.push(clone(x));},skipReasonHandler:x=>{skips.push(x);}});
const held=artifacts=>artifacts.flatMap(x=>x.stage3HeldItems||[]);
function liveMocks(t,extract){
  t.mock.method(require('./contentClassifier.js'),'classifyContent',async()=>({contentType:'EVENT',confidence:1}));
  t.mock.method(require('./eventExtractor.js'),'extractContentByType',extract);
  const unchanged=async items=>({items,summary:{attemptedUrls:[],reason:'offline unchanged fixture'}});
  t.mock.method(require('./ticketLinkEnricher.js'),'enrichEventsFromTicketLinks',unchanged);
  t.mock.method(require('./calendarLinkEnricher.js'),'enrichEventsFromCalendarLinks',unchanged);
  t.mock.method(require('./websiteDetailEnricher.js'),'enrichEventsFromVenueWebsite',unchanged);
  const secondary=t.mock.method(require('./secondaryValidator.js'),'performSecondaryValidation',async()=>assert.fail('Held source reached Stage4'));
  const format=t.mock.method(require('./finalFormatter.js'),'performFinalFormatting',async()=>assert.fail('Held source reached formatting'));
  const lookup=t.mock.method(require('../services/firestoreService.js'),'findVenueByName',async()=>assert.fail('Held source reached venue lookup'));
  return{secondary,format,lookup};
}

test('whole activity title is normalized; pipe suffix is stripped only from venue metadata',()=>{
  assert(isCalendarVenueOnlyHeading('CITY CINEMA','City Cinema | Charlottetown PE'));
  for(const n of ['City Cinema | Film Night','City Cinema Presents: Film Night','Film at City Cinema'])
    assert.equal(isCalendarVenueOnlyHeading(n,'City Cinema'),false);
  assert.equal(sourcePublicationHoldReason(fixture.cinema.phantom,fixture.cinema.caption),'calendar_venue_masthead_not_activity');
  assert.equal(sourcePublicationHoldReason(fixture.cinema.valid,fixture.cinema.caption),undefined);
});

test('exact RCMP sessions retain supported identity and start clocks in item-local holds',()=>{
  const items=constrainSourceTimes(clone(fixture.rcmp.stage3),fixture.rcmp.caption);
  assert.deepEqual(items.map(x=>sourceItemHoldReason(x)),[reason,reason]);
  assert.deepEqual(items.map(x=>[x.name,x.date,x.startTime,x.endTime]),fixture.rcmp.stage3.map(x=>[x.name,x.date,x.startTime,'']));
  assert.deepEqual(items.map(x=>x.startTime),['09:30','13:00']);
  for(const item of items)assert.equal(sourcePublicationHoldReason({...item,venue:'RCMP office'},fixture.rcmp.caption),reason);
});

test('registration and later parking/preparation details do not withhold a known attendee hall',()=>{
  for(const detail of ['Register by email.','Preparation guidelines will be provided upon registration.',
    'Parking directions will be shared after registration.']){
    const item={...healthy(),description:healthy().description+' '+detail};
    assert.equal(sourcePublicationHoldReason(item,item.description),undefined);
  }
  const mixed=constrainSourceTimes([...clone(fixture.rcmp.stage3),healthy()],fixture.rcmp.caption+'\n'+healthy().description);
  assert.equal(sourceItemHoldReason(mixed[2]),undefined);assert.equal(mixed.filter(x=>sourceItemHoldReason(x)).length,2);
  assert.equal(sourcePublicationHoldReason(fixture.rcmp.stage3[0],healthy().description),undefined,'model assertion without original-source evidence');
});

for(const mode of ['primary','fallback'])test('live '+mode+' extraction retains two holds and cannot reach validation/format/write',async t=>{
  localEnvironment(t,{ENABLE_MODEL_ROUTER:'true',ENABLE_MODEL_ROUTER_STAGE3_EVENT:'true',
    MODEL_ROUTER_STAGE3_EVENT_MODEL_LOW:'offline-primary',MODEL_ROUTER_STAGE3_EVENT_MODEL_HIGH:'offline-primary',
    MODEL_ROUTER_FALLBACK_MODEL:'offline-fallback',MODEL_ROUTER_UNKNOWN_ITEMCOUNT_FORCE_HIGH:'false',
    ENABLE_MODEL_ROUTER_FALLBACK_RETRY:'true'});
  let calls=0;const mocks=liveMocks(t,async()=>{calls++;return mode==='fallback'&&calls===1?[]:clone(fixture.rcmp.stage3);});
  const artifacts=[];const out=await parsePostData(input(),{}, {...cfg(artifacts),
    stage1EvaluationValidationOverride:{imageAnalysis:[],hasValidContent:true,confidence:1,validationDecision:'VALIDATION_PASSED',reason:'Saved-source fixture'}});
  assert.deepEqual(out,[]);assert.equal(calls,mode==='fallback'?2:1);
  assert.equal(held(artifacts).filter(x=>sourceItemHoldReason(x)===reason).length,2);
  assert.equal(mocks.secondary.mock.callCount(),0);assert.equal(mocks.format.mock.callCount(),0);assert.equal(mocks.lookup.mock.callCount(),0);
});

for(const stage of ['stage3Items','stage4Items'])test('saved '+stage+' replay retains RCMP evidence before all-held return',async t=>{
  localEnvironment(t);const artifacts=[];
  const format=t.mock.method(require('./finalFormatter.js'),'performFinalFormatting',async()=>assert.fail('All-held replay formatted'));
  const out=await replayPostDataFromArtifacts(input(),{}, {[stage]:clone(fixture.rcmp.stage3),contentType:'EVENT'},cfg(artifacts));
  assert.deepEqual(out,[]);assert.equal(held(artifacts).length,2);assert.equal(format.mock.callCount(),0);
  assert.deepEqual(held(artifacts).map(x=>x.startTime),['09:30','13:00']);
});

test('saved masthead is retained as held evidence while valid Second Sundays remains a source item',async t=>{
  localEnvironment(t);const artifacts=[];let validated=[];
  t.mock.method(require('./secondaryValidator.js'),'performSecondaryValidation',async items=>{validated=clone(items);return items;});
  t.mock.method(require('./finalFormatter.js'),'performFinalFormatting',async()=>[]);
  await replayPostDataFromArtifacts({...input(fixture.cinema.caption),userName:'City Cinema'}, {},
    {stage3Items:[fixture.cinema.phantom,fixture.cinema.valid],contentType:'CALENDAR'},cfg(artifacts));
  assert.equal(held(artifacts)[0].name,'CITY CINEMA');assert.equal(validated.length,1);assert.match(validated[0].name,/Second Sundays/);
});

test('saved Stage4 cannot resurrect a Stage3 hold after stripping its description and flag',async t=>{
  localEnvironment(t);const artifacts=[];let formatting=[];
  const stripped=fixture.rcmp.stage4.map(x=>({...clone(x),description:'Fitness workshop',spatial:undefined,startTime:x.startTime==='09:30'?'9:30 AM':'1:00 PM'}));
  t.mock.method(require('./finalFormatter.js'),'performFinalFormatting',async items=>{formatting=clone(items);return [];});
  await replayPostDataFromArtifacts(input(fixture.rcmp.caption+'\n'+healthy().description),{},
    {stage3Items:[...clone(fixture.rcmp.stage3),healthy()],stage4Items:[...stripped,healthy()],contentType:'EVENT'},cfg(artifacts));
  assert.equal(formatting.length,1);assert.equal(formatting[0].name,healthy().name);
  assert.equal(held(artifacts).filter(x=>sourceItemHoldReason(x)===reason).length,4);
});

test('saved hold cannot transfer to a distinct item sharing title, date and start clock',async t=>{
  localEnvironment(t);const artifacts=[];let formatting=[];
  const positive={...healthy(),name:fixture.rcmp.stage3[0].name,startTime:'09:30',_pipelineIndex:3};
  t.mock.method(require('./finalFormatter.js'),'performFinalFormatting',async items=>{formatting=clone(items);return [];});
  await replayPostDataFromArtifacts(input(fixture.rcmp.caption+'\n'+positive.description),{},
    {stage3Items:[...clone(fixture.rcmp.stage3),positive],stage4Items:[positive],contentType:'EVENT'},cfg(artifacts));
  assert.equal(formatting.length,1);assert.equal(formatting[0]._pipelineIndex,3);
  assert.equal(formatting[0].venue,'Example Hall');assert.equal(held(artifacts).length,2);
});

test('legacy unindexed saved Stage4 inherits only an unambiguous source hold',async t=>{
  localEnvironment(t);const artifacts=[];let formatting=[];
  const stripped=fixture.rcmp.stage4.map(x=>({...clone(x),_pipelineIndex:undefined,description:'Fitness workshop',spatial:undefined}));
  t.mock.method(require('./finalFormatter.js'),'performFinalFormatting',async items=>{formatting=clone(items);return [];});
  await replayPostDataFromArtifacts(input(fixture.rcmp.caption+'\n'+healthy().description),{},
    {stage3Items:[...clone(fixture.rcmp.stage3),healthy()],stage4Items:[...stripped,healthy()],contentType:'EVENT'},cfg(artifacts));
  assert.equal(formatting.length,1);assert.equal(formatting[0].venue,'Example Hall');
  assert.equal(held(artifacts).length,4);
});

test('real formatter, completeness and write preview retain only the unaffected positive',async t=>{
  // An inert placeholder permits SDK construction; its transport is mocked.
  // No real key is created/read and fetch is forbidden for this whole test.
  localEnvironment(t,{OPENAI_API_KEY:'offline-not-a-credential'});
  const items=constrainSourceTimes([...clone(fixture.rcmp.stage3),healthy()],fixture.rcmp.caption+'\n'+healthy().description);
  const outputs=items.map((x,i)=>({sourceItemIndex:i,isEvent:'Yes',isFoodSpecial:'No',category:'Workshops & Classes',
    name:x.name,description:x.description,establishment:x.venue||'RCMP office',address:'',startDate:x.date,endDate:x.date,
    startTime:x.startTime,endTime:x.endTime,ticketPrice:'',ticketLink:'',relevantImageIndex:-1,venue:x.venue||'RCMP office',
    additionalLocation:'',isRecurring:'No',recurringPattern:'none'}));
  const Completions=require('openai/resources/chat/completions/completions').Completions;
  t.mock.method(Completions.prototype,'create',async()=>({choices:[{message:{tool_calls:[{function:{arguments:JSON.stringify({formattedEvents:outputs,formattingDecisions:[]})}}]}}]}));
  const formatted=await performFinalFormatting(items,'RCMP PEI','','2026-10-21T13:01:29Z',
    {gptModelFast:'offline-fixture',timezone:'America/Halifax'},fixture.rcmp.caption+'\n'+healthy().description);
  assert.equal(formatted.length,1);assert.equal(formatted[0].name,healthy().name);
  const final=enforceDateTimeCompleteness(formatted,'2026-10-21T13:01:29Z','America/Halifax',healthy().description);
  const processed=processEvents(final,'Example Hall','','',[],[],[]);assert.equal(processed.length,1);
  const venue={id:'fixture_hall',name:'Example Hall',address:'PEI',latitude:46.2,longitude:-63.1};let lookups=0;
  const cache=createFullParserVenueLookupCache(async()=>{lookups++;return{isMatch:true,venue,matchType:'exact',confidence:1};},async()=>assert.fail('Unexpected address lookup'));
  const payload=await previewFullParserEventWritePayload(processed[0],{uniqueId:fixture.rcmp.source,text:healthy().description,
    userName:venue.name,pageName:'Hall',timestamp:'2026-10-21T13:01:29Z',mediaUrls:[],facebookUrl:''},253,0,venue,venue.name,cache);
  assert.equal(payload.name,healthy().name);assert.equal(payload.startTime,'17:00');assert.equal(payload.endTime,'18:00');
  assert.deepEqual(payload.sourceUniqueIds,[fixture.rcmp.source]);assert(lookups<=1);
});
