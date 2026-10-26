import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './__fixtures__/sourceAuditOct21.json';
import {applyCategoryCorrectionsForRegression,applyRecurrenceNormalizationForRegression,rehydrateFormattedEventMetadata} from './finalFormatter.js';
import {sourcePublicationHoldReason,hasUnadvertisedActivityEnd} from './sourcePublicationPolicy.js';
import {resolveTimesWithOperatingHours} from './venueResolver.js';
import {enforceDateTimeCompleteness,processEvents} from './postParser.js';
import {scoreFamilyFriendly} from '../utils/familyFriendlyScoring.js';
import {isDuplicateEntry,isHighConfidenceSameOccurrenceDuplicate} from '../utils/similarity.js';
import {hasConflictingOccurrenceIdentity} from '../utils/occurrenceMergeGuard.js';
import {previewDuplicateMerge,previewFullParserEventWritePayload,createFullParserVenueLookupCache} from '../processing/rowProcessor.js';
const row=(n:number)=>fixture.rows.find(x=>x.row===n)!;
const formatted=(n:number,name:string)=>structuredClone(row(n).formatted.find(x=>x.name===name)!) as any;
const source=(n:number,name:string)=>(row(n).stage4.find(x=>x.name===name)||row(n).stage3.find(x=>x.name===name)) as any;
const occurrence=(e:any,suffix:string)=>({...e,eventName:e.name,uniqueId:row(12).source+'_'+suffix,venueId:'slug_tipsyfarmers'});

test('actual separate pizza bundles remain separate in both selectors and defensive merge',()=>{
  const deals=row(12).formatted.filter(x=>x.name.startsWith('Any Pizza')).map((x,i)=>occurrence(x,String(i)));
  assert.equal(deals.length,2);
  for(const [a,b] of [deals,[...deals].reverse()]){
    assert(hasConflictingOccurrenceIdentity(a,b));assert.equal(isDuplicateEntry(a,b),false);
    assert.equal(isHighConfidenceSameOccurrenceDuplicate(a,b),false);
    assert.deepEqual(previewDuplicateMerge({existingEvent:a,incomingEvent:b,venue:fixture.cornwallVenue as any}).changedFields,[]);
  }
  assert.equal(isDuplicateEntry(deals[0],{...deals[0],uniqueId:row(12).source+'_replay'}),true);
  assert.equal(hasConflictingOccurrenceIdentity(deals[0],{...deals[0],ticketPrice:'$40'}),false);
});

test('actual bare STAR and Stage lesson names cannot merge despite three-hour tolerance',()=>{
  const classes=row(306).formatted.filter(x=>/^(?:Star|Stage|PreCan|CanSkate)/.test(x.name));
  assert.equal(classes.length,5);
  for(let i=0;i<classes.length;i++)for(let j=i+1;j<classes.length;j++){
    const a:any={...classes[i],uniqueId:row(306).source+'_'+i},b:any={...classes[j],uniqueId:row(306).source+'_'+j};
    assert(hasConflictingOccurrenceIdentity(a,b),`${a.name} / ${b.name}`);
    assert.equal(isDuplicateEntry(a,b),false);
    assert.deepEqual(previewDuplicateMerge({existingEvent:a as any,incomingEvent:b as any,venue:fixture.cornwallVenue as any}).changedFields,[]);
  }
  assert.equal(hasConflictingOccurrenceIdentity({name:'Star Wars'},{name:'Star Trek'}),false);
});

test('actual Tuesday Daily Soup source without weekday in item description stays one-off',()=>{
  const e=formatted(316,'Daily Soup — Beef Chili'),s=source(316,e.name);
  assert(!/tuesday meals/i.test(s.description));
  assert.equal(applyRecurrenceNormalizationForRegression(e,s).recurringPattern,'none');
  const daily={...s,description:'Beef Chili served daily from 11AM. Every day.'};
  assert.equal(applyRecurrenceNormalizationForRegression({...e,isRecurring:'Yes',recurringPattern:'daily'},daily).recurringPattern,'daily');
  for (const [description,recurringPattern] of [
    ['Beef Chili served every Tuesday from 11AM to 2PM.','weekly_tuesday'],
    ['Beef Chili available daily.','daily'],
    ['Daily Soup: Beef Chili served Tuesdays.','weekly_tuesday'],
  ]) assert.equal(applyRecurrenceNormalizationForRegression({...e,isRecurring:'Yes',recurringPattern},
    {...s,description,recurringPattern}).recurringPattern,recurringPattern,description);
  assert.equal(applyRecurrenceNormalizationForRegression({...e,isRecurring:'Yes',recurringPattern:'daily'},
    {...s,description:'Daily Soup: Beef Chili. Each bowl is $6.'}).recurringPattern,'none');
});

test('both actual leisure and toddler pool slots are suitable; lane/closures/adult controls stay negative',()=>{
  const slots=row(66).formatted.filter(x=>x.name==='Leisure and Toddler Pools Open');assert.equal(slots.length,2);
  for(const slot of slots)assert(scoreFamilyFriendly(slot).familyFriendlyScore>=60);
  for(const name of ['Lane Swim','Adult Swim','All Pools Closed','Private Swim','Toddler Pools Closed'])
    assert(scoreFamilyFriendly({name,category:'Sports'}).familyFriendlyScore<60,name);
});

test('actual null-sourceType Cornwall19:00 start survives hours/completeness/real write payload without invented23:00',async()=>{
  const input=formatted(200,'Meet the artists'),s=source(200,input.name);
  assert.equal(input.endTime,'23:00');assert.equal(input._sourceType,null);
  const restored=rehydrateFormattedEventMetadata(input,s);
  assert(hasUnadvertisedActivityEnd(restored));
  const hours=await resolveTimesWithOperatingHours([restored],'Cornwall Public Library','15 Mercedes Dr, Cornwall, PE','2026-10-21T12:00:00Z');
  const final=enforceDateTimeCompleteness(hours,'2026-10-21T12:00:00Z','America/Halifax',row(200).caption);
  assert.equal(final.length,1);assert.equal(final[0].startTime,'19:00');assert.equal(final[0].endTime,'');
  const published=processEvents(final,'Cornwall Public Library','https://www.facebook.com/PEILibrary','',[],[],[]);
  const venue=fixture.cornwallVenue as any;
  const lookup=createFullParserVenueLookupCache(async()=>({isMatch:true,venue,matchType:'exact',confidence:1} as any),async()=>({isMatch:true,venue,matchType:'exact',confidence:1} as any));
  const raw:any={uniqueId:row(200).source,text:row(200).caption,mediaUrls:[],userName:venue.name,pageName:'PEILibrary',timestamp:'2026-10-21T12:00:00Z',facebookUrl:'https://www.facebook.com/PEILibrary'};
  const payload:any=await previewFullParserEventWritePayload(published[0],raw,200,0,venue,venue.name,lookup);
  assert.equal(payload.startTime,'19:00');assert(!payload.endTime);assert.equal(payload.timeFlags?.end?.source,'none');
  assert.equal(payload.timeResolution?.endFromHours,undefined);assert.deepEqual(payload.sourceUniqueIds,[row(200).source]);
  const replay=enforceDateTimeCompleteness(final,'2026-10-21T12:00:00Z','America/Halifax',row(200).caption);
  assert.equal(replay[0].endTime,'');
});

test('printed/duration ends and genuine food to-close contracts remain eligible',()=>{
  const e=formatted(200,'Meet the artists');
  for(const flag of [{source:'explicit',evidence:'7–9PM'},{source:'implied',evidence:'two-hour session'},{source:'semantic',evidence:'printed duration'}])
    assert.equal(hasUnadvertisedActivityEnd({...e,timeFlags:{...e.timeFlags,end:flag}}),false);
  assert.equal(hasUnadvertisedActivityEnd({...e,category:'Food Special',isFoodSpecial:'Yes'}),false);
  assert.equal(hasUnadvertisedActivityEnd({...e,timeFlags:{...e.timeFlags,end:{source:'none',toClose:true}}}),false);
  assert.equal(hasUnadvertisedActivityEnd({...e,_sourceType:null,timeFlags:undefined}),false);
  assert.equal(hasUnadvertisedActivityEnd({...e,_sourceType:'event'}),false);
  assert.equal(hasUnadvertisedActivityEnd({...e,_sourceType:undefined,category:'Live Music'}),false);
});

test('actual canteen operations and front-store retail are held while clinic remains eligible',()=>{
  const canteen=source(306,'Canteen Open');assert.equal(sourcePublicationHoldReason(canteen,row(306).caption!),'canteen_operating_hours_not_public_activity');
  const seniors=row(123).stage4.find(x=>/seniors/i.test(x.name))!;
  assert.equal(sourcePublicationHoldReason(seniors as any,row(123).caption!),'nonfood_front_store_discount');
  const clinic=row(123).stage4.find(x=>/clinic/i.test(x.name))!;
  assert.equal(sourcePublicationHoldReason(clinic as any,row(123).caption!),undefined);
});

test('actual unconfirmed15-person film is held; explicit confirmation releases the condition',()=>{
  const film=row(135).stage4[0] as any;
  assert.equal(sourcePublicationHoldReason(film,row(135).caption!),'screening_attendance_condition_unconfirmed');
  assert.equal(sourcePublicationHoldReason(film,row(135).caption+'\nUPDATE: Target reached. Screening is confirmed.'),undefined);
});

test('actual mixed-post categories follow each activity rather than trivia/music/food inheritance',()=>{
  const expectations:[[number,string,string],...Array<[number,string,string]>]=[[101,'Discounted Apps','Food Special'],[101,'$15 Pitchers','Drink Special'],[195,row(195).formatted[0].name,'Gatherings & Parties'],[201,row(201).formatted[0].name,'Workshops & Classes'],[149,row(149).formatted[0].name,'Gatherings & Parties']];
  for(const[n,name,category]of expectations){const result=applyCategoryCorrectionsForRegression(formatted(n,name),source(n,name));assert.equal(result.category,category,name);assert.equal(result.isFoodSpecial,/Special$/.test(category)?'Yes':'No');}
  assert.equal(applyCategoryCorrectionsForRegression(formatted(101,'Trivia Tuesday'),source(101,'Trivia Tuesday')).category,'Trivia Night');
});
