import assert from 'node:assert/strict';
import test from 'node:test';
import fixture from './__fixtures__/nov1-source-integrity.json';
import {constrainSourceTimes,resolveSourceDuration} from './sourceTimeConstraints.js';
import {sourceClockContradiction,reconcileCollapsedWeekdayRange,bindCaptionAttendeeRegion,omittedEndOnlySourceItems} from './sourceOccurrenceIntegrity.js';
import {sourceItemHoldReason} from './sourceItemEvidence.js';
import {preserveValidatedItemSourceType} from './secondaryValidator.js';
import {rehydrateFormattedEventMetadata} from './finalFormatter.js';
import {enforceDateTimeCompleteness} from './postParser.js';
import {hasExplicitItemVenueEvidence,sharedEventRequiresOriginalHost} from '../services/sharedEventVenueEvidence.js';
import {fullParserEventLocationCheck,previewDuplicateMerge,previewFullParserEventWritePayload,createFullParserVenueLookupCache,mergeStageArtifactsSnapshot,sanitizeStageArtifactsSnapshot} from '../processing/rowProcessor.js';
import {isDuplicateEntry,isHighConfidenceSameOccurrenceDuplicate} from '../utils/similarity.js';

const row=(n:number):any=>structuredClone(fixture.rows.find(r=>r.row===n)!);
const event=(item:any,patch:any={}):any=>({name:item.name,eventName:item.name,description:item.description,venue:item.venue,
  establishment:item.venue,category:'Gatherings & Parties',isEvent:'Yes',isFoodSpecial:'No',startDate:item.date,endDate:item.date,
  startTime:item.startTime,endTime:item.endTime,isRecurring:'No',recurringPattern:'none',timeFlags:item.timeFlags,_sourceType:item._sourceType,...patch});
const rawRow=(source:any):any=>({...source.rowMeta,uniqueId:source.sourceId,text:source.caption,sharedPostText:source.rowMeta.sharedPostAuthorName?source.caption:undefined,mediaUrls:[]});

test('N03 exact source title supplies two-hour skate end through validation, formatting and completeness',()=>{
  const source=row(300),original=source.stage3[0],before=structuredClone(original);
  const item=constrainSourceTimes([original],source.caption)[0];
  assert.equal(item.endTime,'14:30');assert.equal(item._sourceDurationResolution?.minutes,120);assert.deepEqual(original,before);
  const validated=preserveValidatedItemSourceType({...item,endTime:'',_sourceDurationResolution:undefined},item);
  assert.equal(validated.endTime,'14:30');
  const formatted=rehydrateFormattedEventMetadata(event(item,{category:'Live Music',endTime:'01:00',endDate:'2026-11-02'}),validated);
  const out=enforceDateTimeCompleteness([formatted],source.rowMeta.timestamp,'America/Halifax',source.caption);
  assert.equal(out.length,1);assert.equal(out[0].endTime,'14:30');assert.equal(out[0].endDate,'2026-11-01');
});

test('duration controls preserve explicit ends, film runtime and separate-component uncertainty',()=>{
  const base=row(300).stage3[0];
  assert.equal(resolveSourceDuration({...base,endTime:'15:00'}).endTime,'15:00');
  for(const patch of [{name:'Movie screening: 2hrs'},{description:'Two hours before doors open.'},{description:'Two separate skating sessions of 2 hours each.'},{description:'Then another 1 hour class.'}]){
    assert.equal(resolveSourceDuration({...base,...patch}).endTime,'');
  }
});

test('N04 actual three-Friday extraction becomes the three source-corroborated dates before deduplication',()=>{
  const source=row(296),before=structuredClone(source.stage3),items=constrainSourceTimes(source.stage3,source.caption);
  assert.deepEqual(items.map(i=>i.date),['2026-11-06','2026-11-07','2026-11-08']);
  assert.deepEqual(items.map((i:any)=>i._pipelineIndex),[1,2,3]);assert.deepEqual(source.stage3,before);
  assert(items.every(i=>i.startTime==='10:00'&&i.endTime==='17:00'&&'recurringPattern' in i&&i.recurringPattern==='none'));
  assert.deepEqual(constrainSourceTimes(items,source.caption),items);
});

test('range repair holds missing/conflicting endpoint proof and preserves healthy separate windows',()=>{
  const source=row(296);
  for(const caption of [source.caption.replace('Nov 8th/26','Nov 9th/26'),source.caption.replace('Our last day will be Nov 8th/26','')]){
    const out=reconcileCollapsedWeekdayRange(source.stage3,caption);
    assert(out.every(i=>sourceItemHoldReason(i)==='collapsed_weekday_range_requires_date_review'));
    assert(out.every(i=>i.date==='2026-11-06'));
  }
  for(const patch of [{startTime:'13:00'},{name:'Separate Workshop'},{venue:'Another venue'},{recurringPattern:'weekly_friday'}]){
    const items=[source.stage3[0],{...source.stage3[1],...patch},source.stage3[2]];
    assert.deepEqual(reconcileCollapsedWeekdayRange(items,source.caption),items);
  }
});

test('N05 source-quoted Harmony House locality survives canonical province suffix and retains host guard',()=>{
  const source=row(291),item=source.stage4[0],r=rawRow(source);
  const candidate:any=rehydrateFormattedEventMetadata(event(item,{establishment:'Harmony House PEI',venue:'Harmony House PEI'}),item);
  assert(hasExplicitItemVenueEvidence(candidate,source.caption));assert.equal(sharedEventRequiresOriginalHost(candidate,r),false);
  assert.equal(hasExplicitItemVenueEvidence(candidate),false);
  assert.notEqual(fullParserEventLocationCheck(candidate,r).decision,'hold');
  for(const patch of [{establishment:'ArtBuds',venue:'ArtBuds'},{establishment:'Harmony House Annex',venue:'Harmony House Annex'},{spatial:undefined},
    {spatial:{...candidate.spatial,locations:[{...candidate.spatial.locations[0],sourceText:''}]}}]){
    assert.equal(hasExplicitItemVenueEvidence({...candidate,...patch}),false);
  }
  assert.equal(sharedEventRequiresOriginalHost({...candidate,spatial:undefined},r),true);
});

test('N06 actual zero-duration U18 and 13-hour source typo hold without changing clocks; healthy sessions survive',()=>{
  const source=row(305),items=constrainSourceTimes(source.stage3,source.caption);
  const held=items.filter(i=>sourceItemHoldReason(i));
  assert.equal(held.length,2);
  assert.equal(sourceItemHoldReason(held.find(i=>/U18 Girls/.test(i.name))!),'source_zero_length_clock_range');
  const typo=held.find(i=>/Sunday Morning Hockey/.test(i.name))!;assert(typo);
  assert.equal(typo.endTime,'11:45 PM');assert.equal(sourceItemHoldReason(typo),'source_implausible_sport_clock_range');
  const healthy=items.find(i=>/U11 Girls/.test(i.name))!;assert.equal(sourceItemHoldReason(healthy),undefined);
  assert.equal(sourceClockContradiction({...healthy,name:'Overnight hockey tournament',startTime:'18:00',endTime:'08:00'}),undefined);
  for(const endDate of ['2026-11-02','2026-11-04'])assert.equal(sourceClockContradiction({...healthy,startTime:'17:30',endTime:'17:30',endDate}),undefined);
  assert.equal(sourceClockContradiction({...healthy,name:'24-hour hockey fundraiser',startTime:'17:30',endTime:'17:30'}),undefined);
  const collapsed={...healthy,startTime:'17:00',endTime:'17:00',timeFlags:{start:{source:'explicit' as const,evidence:'10~5pm'},end:{source:'explicit' as const,toClose:false,evidence:'10~5pm'}}};
  assert.equal(sourceClockContradiction(collapsed),undefined);
  assert.equal(sourceClockContradiction(collapsed,false),'source_zero_length_clock_range');
  const pottery={...row(296).stage3[0],startTime:'17:00',endTime:'17:00',timeFlags:collapsed.timeFlags};
  assert.equal(sourceItemHoldReason(pottery),undefined);
  const repaired=enforceDateTimeCompleteness([event(pottery)],source.rowMeta.timestamp,'America/Halifax','10~5pm');
  assert.equal(repaired.length,1);assert.equal(repaired[0].startTime,'10:00');assert.equal(repaired[0].endTime,'17:00');
  for(const item of held)assert.deepEqual(enforceDateTimeCompleteness([event(item)],source.rowMeta.timestamp,'America/Halifax'),[]);
});

test('U18 and U11 cannot merge through either selector or defensive writer; same division healthy control still matches',()=>{
  const base:any={venueId:'rink',establishment:'Rink',startDate:'2026-11-01',startTime:'17:30',endTime:'18:30',category:'Sports',eventName:'Minor Hockey U11 Girls',name:'Minor Hockey U11 Girls'};
  const other={...base,startTime:'18:30',eventName:'Minor Hockey U18 Girls',name:'Minor Hockey U18 Girls'};
  for(const incoming of [other,{...other,startTime:base.startTime}]){
    assert.equal(isDuplicateEntry(incoming,base),false);assert.equal(isHighConfidenceSameOccurrenceDuplicate(incoming,base),false);
    assert.deepEqual(previewDuplicateMerge({existingEvent:base,incomingEvent:incoming,venue:{id:'rink',name:'Rink'} as any}).updates,{});
  }
  assert(isDuplicateEntry({...base},base));assert(isHighConfidenceSameOccurrenceDuplicate({...base},base));
});

test('N07 all four exact attendee addresses and Ontario region survive formatter page-address contamination and reject before matcher',async()=>{
  const source=row(113),r={...rawRow(source),address:'56 PEI Publisher Road, PE'};
  let lookups=0;
  const matcher=async()=>{lookups++;throw new Error('Coverage check must precede lookup');};
  const cache=createFullParserVenueLookupCache(matcher,matcher);
  for(const original of source.stage3){
    const item=constrainSourceTimes([original],source.caption)[0];assert.equal(item._sourceAttendeeLocation?.province,'Ontario');
    const validated=preserveValidatedItemSourceType({...item,_sourceAttendeeLocation:undefined},item);
    const formatted:any=rehydrateFormattedEventMetadata(event(item,{address:r.address,establishment:"Longo's",venue:"Longo's"}),validated);
    assert.equal(formatted.address,original.spatial.locations[0].address);assert.equal(formatted.locationLabel,original.spatial.locations[0].label);
    assert.equal(fullParserEventLocationCheck(formatted,r).decision,'reject');
    await assert.rejects(previewFullParserEventWritePayload({...formatted,mediaUrls:[]},r,113,0,null as any,r.userName,cache),/explicit_event_region_outside_coverage/);
  }
  assert.equal(lookups,0);
});

test('origin-only geography, unquoted address and another gallery branch never create attendee-region proof',()=>{
  const source=row(113),item=source.stage3[0];
  for(const caption of ['Chef-made on PEI. Our founder is from Ontario.',source.caption.replace('heading to Ontario for','based in Ontario for'),source.caption.replace(item.spatial.locations[0].address,'another address')])
    assert.equal(bindCaptionAttendeeRegion(item,caption)._sourceAttendeeLocation,undefined);
  const uncertain={...item,spatial:{...item.spatial,locations:[{...item.spatial.locations[0],certainty:'possible'}]}};
  assert.equal(bindCaptionAttendeeRegion(uncertain,source.caption)._sourceAttendeeLocation,undefined);
  const invented={...item,_sourceAttendeeLocation:{label:'Fake',address:'123 Fake St',province:'PEI',sourceText:'Fake'}};
  assert.equal(preserveValidatedItemSourceType(invented,item)._sourceAttendeeLocation,undefined);
});

test('N01 explicit unreadable clock evidence holds; ordinary literal clocks remain eligible without pretending independent pixel proof',()=>{
  const item=row(141).stage3.find((i:any)=>i.name==='The Big Sleep');
  assert.equal(sourceItemHoldReason({...item,extractionReason:'The date digit is unclear.'}),'calendar_date_identity_uncertain');
  assert.equal(sourceItemHoldReason({...item,extractionReason:'The time is faint.'}),'calendar_date_identity_uncertain');
  assert.equal(sourceItemHoldReason(item),undefined); // confident-but-wrong pixels remain an explicit limit
});

test('N02 fresh daily screening inventory narrows stale continuous keeper while keeping exact ID and unrelated showing dates',()=>{
  const source=row(141),item=source.stage3.find((i:any)=>i.name==='Your Mother Your Mother Your Mother');
  const venue:any={id:'cinema',name:'The Tivoli Cinema'};
  const existing:any={...event(item,{category:'Cinema',establishment:venue.name}),id:'existing-nov1',venueId:venue.id,uniqueId:'122234623424578108_old',
    facebookUrl:'https://www.facebook.com/thetivolicinema',startTime:'17:00',endTime:'23:00',endDate:'2026-11-05',timeFlags:undefined,
    timeResolution:{hoursUsed:true,endFromHours:'category_default'},description:'Opening Sunday, Nov 1st at 5:00PM and running through Thursday, Nov 5th. See website for showtimes.'};
  const incoming:any={...event(item,{category:'Cinema',establishment:venue.name}),venueId:venue.id,uniqueId:source.sourceId+'_new',facebookUrl:existing.facebookUrl,
    startTime:'17:00',endTime:'',sourceOccurrenceCount:5,timeResolution:{hoursUsed:false}};
  const out=previewDuplicateMerge({existingEvent:existing,incomingEvent:incoming,venue});
  assert.equal(out.updates.endDate,'2026-11-01');assert.equal(out.updates.endTime,'');assert.equal(existing.id,'existing-nov1');assert.equal(existing.endDate,'2026-11-05');
  assert.equal((out.updates.timeResolution as any)?.endFromHours,undefined);assert.equal((out.updates.timeResolution as any)?.hoursUsed,false);
  for(const patch of [{startDate:'2026-11-02',endDate:'2026-11-02'},{sourceOccurrenceCount:1},{facebookUrl:'https://www.facebook.com/guide'},{category:'Gatherings & Parties'}]){
    const control=previewDuplicateMerge({existingEvent:existing,incomingEvent:{...incoming,...patch},venue});
    assert.notEqual(control.updates.endDate,'2026-11-01');
  }
  const printed=previewDuplicateMerge({existingEvent:{...existing,timeFlags:{end:{source:'explicit',evidence:'Continuous festival until Nov5'}}},incomingEvent:incoming,venue});
  assert.notEqual(printed.updates.endDate,'2026-11-01');
});

test('parked shared Holmans activity cannot use sponsor Art Buds as attendance venue',()=>{
  const source=row(214),item=source.stage4.find((i:any)=>i.name==='Pumpkin ring toss'),r=rawRow(source);
  const candidate=event(item,{establishment:'Art Buds',venue:'Art Buds'});
  assert.equal(sharedEventRequiresOriginalHost(candidate,r),true);
  assert.equal(sharedEventRequiresOriginalHost(candidate,{...r,sharedPostText:'Our ring toss takes place at Art Buds tomorrow.'}),false);
});

test('parked recap cannot borrow Sunday hours; a fresh dated invitation stays eligible',()=>{
  const source=row(356),before=structuredClone(source.stage3),out=constrainSourceTimes(source.stage3,source.caption);
  assert.deepEqual(source.stage3,before);
  assert.equal(sourceItemHoldReason(out[0]),'past_activity_recap_without_new_occurrence');
  const future={...source.stage3[0],name:'Sunday animal visit',description:'Join us Sunday from 10 AM–4 PM.'};
  assert.equal(sourceItemHoldReason(constrainSourceTimes([future],source.caption)[0]),undefined);
});

test('parked admission-conditioned free cone retains timing uncertainty instead of publication timestamp',()=>{
  const source=row(19),items=constrainSourceTimes(source.stage3,source.caption),offer=items.find(i=>/Free Ice Cream Cone/.test(i.name))!;
  assert.equal(offer._sourceTimeConstraint?.reason,'activity_offer_without_clock');
  const formatted=rehydrateFormattedEventMetadata(event(offer,{isFoodSpecial:'Yes',isEvent:'No',category:'Food Special',startTime:'11:08',endTime:'21:00'}),offer);
  assert.equal(formatted.startTime,'');
  assert.deepEqual(enforceDateTimeCompleteness([formatted],source.rowMeta.timestamp,'America/Halifax',source.caption),[]);
});

test('parked end-only market survives privately when Stage5 omits it, without inventing an opening',()=>{
  const source=row(284),held=omittedEndOnlySourceItems(source.stage4,[]);
  assert.equal(held.length,1);assert.equal(held[0].startTime,'');assert.equal(held[0].endTime,'17:00');
  assert.equal(held[0]._sourcePublicationHold,'formatter_omitted_end_only_source');
  const saved=sanitizeStageArtifactsSnapshot(mergeStageArtifactsSnapshot(undefined,{source:'live',stage5OmittedItems:held}));
  assert.equal(saved?.stage5OmittedItems?.[0].endTime,'17:00');
  assert.deepEqual(omittedEndOnlySourceItems(source.stage4,[event(source.stage4[0])]),[]);
});
