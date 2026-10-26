import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {parseXlsxFile} from '../services/driveService.js';
import {splitCitySuffix} from '../services/firestoreService.js';
import {scoreFamilyFriendly} from '../utils/familyFriendlyScoring.js';
import {sharedEventRequiresOriginalHost,outdoorProgrammeRequiresHost} from '../services/sharedEventVenueEvidence.js';
import {applyCategoryCorrectionsForRegression,applyRecurrenceNormalizationForRegression,rehydrateFormattedEventMetadata} from './finalFormatter.js';
import {preserveValidatedItemSourceType} from './secondaryValidator.js';
import {preserveCalendarClockPresence,sourcePublicationHoldReason,boundCinemaRunOccurrence} from './sourcePublicationPolicy.js';
import {constrainSourceTimes,resolveSourceDuration,hasProvenSourceDurationEnd} from './sourceTimeConstraints.js';
import {enforceDateTimeCompleteness,processEvents} from './postParser.js';
import {resolveTimesWithOperatingHours,applyFallbackTimes} from './venueResolver.js';
import {sourceItemHoldReason} from './sourceItemEvidence.js';
import {resolveVenueForFullParserEventWithMatcherForRegression,fullParserEventLocationCheck} from '../processing/rowProcessor.js';
const extracted=(name:string,description='',extra:any={})=>({name,description,date:'2026-10-20',startTime:'18:00',endTime:'',venue:'Test Hall',_sourceType:'schedule',...extra} as any);
const event=(name:string,description='',extra:any={})=>({name,description,startDate:'2026-10-20',endDate:'2026-10-20',startTime:'18:00',endTime:'20:00',category:'Live Music',isEvent:'Yes',isFoodSpecial:'No',establishment:'Test Hall',venue:'Test Hall',additionalLocation:'',address:'',ticketPrice:'',ticketLink:'',relevantImageIndex:0,isRecurring:'No',recurringPattern:'none',...extra} as any);

test('original shared attachments become ordered gallery pixels, not the album URL',async()=>{
  const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([
    ['id','text','sharedPost/attachments/0/url','sharedPost/attachments/1/thumbnail','sharedPost/attachments/2/thumbnail'],
    ['1935901177863884','Only a couple of minutes from us!','https://www.facebook.com/media/set/?set=pcb.1','https://example.com/haunted.jpg','https://example.com/farm.jpg'],
  ]),'Data');const {rows}=await parseXlsxFile(XLSX.write(w,{type:'buffer',bookType:'xlsx'}));
  assert.deepEqual(rows[0].mediaUrls,['https://example.com/haunted.jpg','https://example.com/farm.jpg']);
});
test('downtown location cannot manufacture Ontario from the end of location',()=>{
  assert.equal(splitCitySuffix("Samuel's Coffee House, downtown location"),null);
  assert.deepEqual(splitCitySuffix('Venue, Toronto ON'),{baseName:'Venue',city:'Toronto',region:'ON'});
  assert.deepEqual(splitCitySuffix('Venue, Charlottetown, PE'),{baseName:'Venue',city:'Charlottetown',region:'PE'});
});
test('For families audience sentence is positive but fundraiser beneficiaries are not',()=>{
  assert.ok(scoreFamilyFriendly({name:'Costume Party!',description:'For families. Stories, games, crafts, and treats!'}).familyFriendlyScore>=60);
  assert.ok(scoreFamilyFriendly({name:'Fundraiser',description:'Raising money for families. Adults only. 19+'}).familyFriendlyScore<60);
  assert.equal(scoreFamilyFriendly({name:'Adult Improv',description:'A class for adults, 18+.'}).familyFriendlyScore,0);
});
test('library and speaker starts do not acquire overall programme ends',()=>{
  const source=preserveCalendarClockPresence(extracted('Speaker’s Corner: Perry Aftab','Start9AM. Programme9AM-1PM.',{_sourceType:'calendar',startTime:'09:00'}));
  assert.equal(source.timeFlags?.start?.source,'explicit');assert.equal(source.timeFlags?.end?.source,'none');
  const checked=preserveValidatedItemSourceType({...source,endTime:'13:00',timeFlags:{start:{source:'explicit',evidence:'9'},end:{source:'explicit',toClose:false,evidence:'programme1PM'}}},source);
  assert.equal(checked.timeFlags?.end?.source,'none');
  const formatted=rehydrateFormattedEventMetadata(event(source.name,source.description,{timeFlags:{start:{source:'explicit',evidence:'9'},end:{source:'explicit',evidence:'default2hours'}}}),checked);
  assert.equal(formatted.timeFlags?.end?.source,'none');
  const explicit=preserveCalendarClockPresence(extracted('Public Swim','',{_sourceType:'calendar',startTime:'12:00',endTime:'13:00'}));
  assert.equal(explicit.timeFlags?.end?.source,'explicit');
});
test('source clock ambiguity still holds after calendar certainty preservation',()=>{
  const [source]=constrainSourceTimes([extracted('Unclear cell','AM/PM unspecified',{_sourceType:'calendar',startTime:'6:30'})],'Programme');
  assert.equal(sourceItemHoldReason(source),'source_meridiem_unresolved');
});
test('book discussion and live illusion do not inherit music or cinema categories',()=>{
  assert.equal(applyCategoryCorrectionsForRegression(event('Romance Book Club','No reservations; just show up.'),extracted('Romance Book Club','No reservations; just show up.')).category,'Gatherings & Parties');
  const text='Master illusionists offer a family-friendly evening of theatrical illusion and ghostly storytelling.';
  assert.equal(applyCategoryCorrectionsForRegression(event('Mysteries of the Keyhole House',text,{category:'Cinema'}),extracted('Mysteries of the Keyhole House',text)).category,'Gatherings & Parties');
  assert.equal(applyCategoryCorrectionsForRegression(event('The Illusionist','Film screening',{category:'Cinema'}),extracted('The Illusionist','Film screening')).category,'Cinema');
  assert.equal(applyCategoryCorrectionsForRegression(event('Read, Sing, Play','Stories, rhymes and songs for kids ages0-5'),extracted('Read, Sing, Play','Stories, rhymes and songs for kids ages0-5')).category,'Workshops & Classes');
});
test('weekday alcoholic offers stay drinks; meals and cocktail workshops keep their identities',()=>{
  for(const name of ['Monday Margaritas','Tuesday Staff-Priced Pints','Wednesday Select Wines','Thursday Well Drinks','Friday Espresso Martinis','Saturday Sangria']){
    assert.equal(applyCategoryCorrectionsForRegression(event(name,'11AM-5PM',{category:'Food Special',isEvent:'No',isFoodSpecial:'Yes'}),extracted(name,'11AM-5PM',{_sourceType:'special'})).category,'Drink Special');
  }
  assert.equal(applyCategoryCorrectionsForRegression(event('Wine Sauce Dinner','Meal deal',{category:'Food Special'}),extracted('Wine Sauce Dinner','Meal deal',{_sourceType:'special'})).category,'Food Special');
  assert.equal(applyCategoryCorrectionsForRegression(event('Cocktail Workshop','Learn to mix cocktails',{category:'Workshops & Classes'}),extracted('Cocktail Workshop','Learn to mix cocktails')).category,'Workshops & Classes');
});
test('dated Tuesday Daily Soup flavour is one-off, explicit daily service is retained',()=>{
  const source=extracted('Daily Soup — Beef Chili','Tuesday Meals — $6 Daily Soup: Beef Chili.',{_sourceType:'special',recurringPattern:'daily'});
  const current=event(source.name,source.description,{category:'Food Special',isFoodSpecial:'Yes',isEvent:'No',isRecurring:'Yes',recurringPattern:'daily'});
  assert.equal(applyRecurrenceNormalizationForRegression(current,source).recurringPattern,'none');
  const daily=extracted(source.name,'Served daily from11AM. Every day.',{_sourceType:'special',recurringPattern:'daily'});
  assert.equal(applyRecurrenceNormalizationForRegression(current,daily).recurringPattern,'daily');
});
test('operations, online-only course and retail memoir are held, genuine participation remains',()=>{
  assert.equal(sourcePublicationHoldReason(extracted('Home Decoration Contest — Judging'),'Judging6-10PM. Public viewing October23-31.'),'organizer_judging_not_public_viewing');
  assert.equal(sourcePublicationHoldReason(extracted('Stratford Home Decorating Contest — Judging'),'Register your decorated property by October23 at8AM.'),'organizer_judging_not_public_viewing');
  assert.equal(sourcePublicationHoldReason(extracted('Public Judging','Come watch the judging'),'Public judging'),undefined);
  assert.equal(sourcePublicationHoldReason(extracted('From Partners to Parents','Six-week virtual program',{venue:'Virtual',spatial:{kind:'online'}}),'A virtual program startingOctober26.'),'online_only_course_outside_product_scope');
  assert.equal(sourcePublicationHoldReason(extracted('A Cup of Tea not Meant to Be!'),'The teacup met its demise, broken shards in the garden. Pottery gallery open Friday-Sunday10-5.'),'retail_memoir_and_hours_not_public_programme');
  assert.equal(sourcePublicationHoldReason(extracted('Pottery Exhibition Opening'),'A broken teacup exhibition. Gallery open for the opening receptionFriday10-5.'),undefined);
  assert.equal(sourcePublicationHoldReason(extracted('U9 Hutchinson Practice'),'Today practice schedule'),'rostered_team_practice_not_public_activity');
  assert.equal(sourcePublicationHoldReason(extracted('U9 Open Practice','Public drop-in'),'Public drop-in'),undefined);
});
test('shared farm programme cannot inherit Milton Hall, explicit original publisher host remains',()=>{
  const row={uniqueId:'1935901177863884',userName:'Milton Community Hall',pageName:'miltoncommunityhall',text:'Only a couple of minutes from us!',sharedPostAuthorName:'Trilby Lane Farm and Day Camps',sharedPostAuthorUrl:'https://www.facebook.com/people/Trilby-Lane-Farm-and-Day-Camps/61550515694899/',sharedPostText:'Come join us at our hobby farm for haunted woods.'} as any;
  const item=event('Haunted Woods','Our farm programme',{venue:'Milton Community Hall',establishment:'Milton Community Hall'});
  assert.equal(sharedEventRequiresOriginalHost(item,row),true);
  assert.equal(fullParserEventLocationCheck(item,row).decision,'hold');
  assert.equal(sharedEventRequiresOriginalHost(item,{...row,sharedPostText:'Join us at Milton Community Hall for our party.'}),false);
  assert.equal(sharedEventRequiresOriginalHost({...item,venue:'Named Farm',establishment:'Named Farm'},row),false);
});
test('Scream Park cannot inherit council/arena publishers; named park and explicit host survive',()=>{
  const row={userName:'APM Centre',pageName:'APM Centre',text:''} as any;
  const item=event('Scream Park — Scary','Scream Park Wednesday',{venue:'APM Centre',establishment:'APM Centre'});
  assert.equal(outdoorProgrammeRequiresHost(item,row),true);
  assert.equal(fullParserEventLocationCheck(item,row).decision,'hold');
  assert.equal(outdoorProgrammeRequiresHost({...item,venue:'Eliot River Scream Park',establishment:'Eliot River Scream Park'},row),false);
  assert.equal(outdoorProgrammeRequiresHost(item,{...row,text:'Scream Park takes place at APM Centre.'}),false);
});
test('compound printed room uses exact Marc’s Lounge, never the broad Brickhouse parent',async()=>{
  const seen:string[]=[];const room={id:'slug_marcslounge',name:'Marc’s Lounge'};
  const result=await resolveVenueForFullParserEventWithMatcherForRegression({item:event('Coraline','',{venue:'The Brickhouse Kitchen & Bar (In Marc’s Lounge)',establishment:'The Brickhouse Kitchen & Bar (In Marc’s Lounge)'}),row:{} as any,rowVenue:null,establishment:'Downtown Charlottetown Inc.',rowIndex:30,matcher:async(name)=>{seen.push(name);return {isMatch:name==='Marc’s Lounge',matchType:'exact',confidence:1,matchedVenue:room} as any;}});
  assert.equal(result?.id,room.id);assert.deepEqual(seen,['Marc’s Lounge']);
});
test('film run is not continuous six-day attendance; overnight and film festival controls remain',()=>{
  const item=extracted('Winter of the Crow','Opens tonight and plays until Saturday.');
  assert.equal(boundCinemaRunOccurrence(event(item.name,item.description,{category:'Cinema',startDate:'2026-10-19',endDate:'2026-10-24'}),item).endDate,'2026-10-19');
  const overnight=event('Double Bill','',{category:'Cinema',startDate:'2026-10-19',endDate:'2026-10-20'});
  assert.deepEqual(boundCinemaRunOccurrence(overnight,item),overnight);
  const festival=extracted('Film Festival','Screening run throughSaturday. Film festival.');
  const parent=event(festival.name,festival.description,{category:'Cinema',endDate:'2026-10-24'});
  assert.deepEqual(boundCinemaRunOccurrence(parent,festival),parent);
});

// Saved October20 Stage3 facts; generated formatter ends are controlled inputs.
const absentEndSources=[
  {row:121,name:'Read, Sing, Play',description:'Tuesdays in October. Ages 0–5. Stories, rhymes, and songs for kids and their grown ups.',date:'2026-10-20',startTime:'1:00 PM',start:'13:00',guess:'15:00'},
  {row:155,name:'Speaker’s Corner: Perry Aftab',description:'Speaker’s Corner lineup session. Affiliation shown: PEI FOOD STRONG. The event runs 9:00 AM–1:00 PM at The Confederation Court Mall, Level 2, and is open to all.',date:'2026-10-21',startTime:'9:00 AM',start:'09:00',guess:'13:00'},
];
const timestamp='2026-10-20T12:00:00Z', zone='America/Halifax';
for(const saved of absentEndSources)test(`saved row${saved.row} has no end through actual hours, completeness and publication`,async()=>{
  const source=preserveCalendarClockPresence(extracted(saved.name,saved.description,{date:saved.date,startTime:saved.startTime,_sourceType:'calendar'}));
  const formatted=rehydrateFormattedEventMetadata(event(saved.name,saved.description,{startDate:saved.date,endDate:saved.date,startTime:saved.start,endTime:saved.guess,category:'Workshops & Classes',timeResolution:{hoursUsed:false,endFromHours:'duration_default'}}),source);
  const hours=await resolveTimesWithOperatingHours([formatted],'Test Hall','',timestamp,{timezone:zone});
  assert.equal(hours.length,1);assert.equal(hours[0].endTime,'');
  const fallback=applyFallbackTimes({...hours[0]},hours[0],'09:00','2026-10-20');
  assert.equal(fallback.endTime,'');
  const final=enforceDateTimeCompleteness(hours,timestamp,zone,saved.description);
  assert.equal(final.length,1);assert.equal(final[0].endTime,'');assert.equal(final[0].timeFlags?.end?.source,'none');
  assert.equal(final[0].timeResolution?.endFromHours,undefined);
  assert.equal(enforceDateTimeCompleteness(final,timestamp,zone,saved.description)[0].endTime,'');
  const published=processEvents(final,'Test Hall','https://www.facebook.com/test/','',[],[],[]);
  assert.equal(published.length,1);assert.equal(published[0].endTime,'');
});

test('actual final completeness clears formatter end even when the hours stage is bypassed',()=>{
  for(const saved of absentEndSources){
    const flags={start:{source:'explicit',evidence:saved.startTime},end:{source:'none',toClose:false,evidence:''}};
    for(const endFromHours of ['duration_default','category_default']){
      const input=event(saved.name,saved.description,{_sourceType:'calendar',startTime:saved.start,endTime:saved.guess,timeFlags:structuredClone(flags),timeResolution:{hoursUsed:false,endFromHours}});
      const final=enforceDateTimeCompleteness([input],timestamp,zone,saved.description);
      assert.equal(final.length,1);assert.equal(final[0].endTime,'');assert.equal(final[0].timeFlags?.end?.source,'none');
      assert.equal(enforceDateTimeCompleteness(final,timestamp,zone,saved.description)[0].endTime,'');
    }
  }
});

test('printed ends and proven source durations retain exact clocks, including overnight',async()=>{
  const source=resolveSourceDuration(preserveCalendarClockPresence(extracted('Guided tour session','A two hour guided tour.',{_sourceType:'calendar',startTime:'23:00'})));
  const duration=rehydrateFormattedEventMetadata(event(source.name,source.description,{startTime:'23:00',endTime:source.endTime}),source);
  assert.equal(hasProvenSourceDurationEnd(duration),true);
  const explicit=event('Public Swim','12–1PM',{_sourceType:'calendar',startTime:'12:00',endTime:'13:00',timeFlags:{start:{source:'explicit',evidence:'12PM'},end:{source:'explicit',toClose:false,evidence:'1PM'}}});
  const hours=await resolveTimesWithOperatingHours([explicit,duration],'Test Hall','',timestamp,{timezone:zone});
  const final=enforceDateTimeCompleteness(hours,timestamp,zone);
  assert.equal(final.length,2);assert.equal(final[0].endTime,'13:00');
  assert.equal(final[1].endTime,'01:00');assert.equal(final[1].endDate,'2026-10-21');
  assert.equal(hasProvenSourceDurationEnd(final[1]),true);
});

test('calendar specials retain healthy fallback and source to-close behaviour',()=>{
  const input=event('Drink offer','Tonight',{_sourceType:'calendar',category:'Drink Special',isFoodSpecial:'Yes',isEvent:'No',startTime:'18:00',endTime:'',timeFlags:{start:{source:'explicit',evidence:'6PM'},end:{source:'none',toClose:true,evidence:'until close'}},timeResolution:{hoursUsed:false}});
  const fallback=applyFallbackTimes({...input},input,'09:00','2026-10-20');
  const final=enforceDateTimeCompleteness([fallback],timestamp,zone);
  assert.equal(final.length,1);assert.equal(final[0].endTime,'23:00');assert.equal(final[0].timeFlags?.end?.toClose,true);
});
