import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './__fixtures__/oct16-item-scopes.json';
import {applyItemScopedRecurrence,detectRecurringPattern} from './eventExtractor.js';
import {bindCompactStage4Sources,parseCompactStage4Response} from './compactStage4.js';
import {applyCategoryCorrectionsForRegression,applyRecurrenceNormalizationForRegression,
  rehydrateFormattedEventMetadata,collapseRecurringSeriesEvents,
  createBoundFormattingSchema,parseStrictFormattingEnvelope,formatStage5BatchesWithRecovery} from './finalFormatter.js';
import {constrainSourceTimes} from './sourceTimeConstraints.js';
import {enforceDateTimeCompleteness,applySpecialTimeFallbacks} from './postParser.js';
import {classifySpatialEvent} from './spatialEventClassifier.js';
import type {ExtractedItem,ExtractedEvent,TimeResolvedEvent} from './types.js';

const source = (x:any): ExtractedEvent => ({venue:'Fixture Club',price:'',extractionReason:'literal source excerpt',_sourceType:'event',...x});
const event = (x:any={}): TimeResolvedEvent => ({name:'Fixture Activity',description:'',category:'Gatherings & Parties',
  isEvent:'Yes',isFoodSpecial:'No',establishment:'Fixture Club',address:'',venue:'Fixture Club',additionalLocation:'',
  startDate:'2026-10-15',endDate:'2026-10-15',startTime:'19:00',endTime:'21:00',
  ticketPrice:'',ticketLink:'',relevantImageIndex:0,isRecurring:'No',recurringPattern:'none',
  timeFlags:{start:{source:'explicit',evidence:'7 pm'},end:{source:'explicit',toClose:false,evidence:'9 pm'}},...x});
const decision = (item:any, pattern:string|null) => ({sourceItemIndex:item._pipelineIndex,
  sourceIdentity:Object.fromEntries(['name','date','startTime','venue'].map(k=>[k,String(item[k]??'')])),decision:'KEPT',reason:'Source activity',
  corrections:{recurringPattern:pattern,correctionReason:pattern?'Item has no weekly evidence.':''}});

test('mixed Montague post preserves two rallies, three consecutive sessions, bounded course and poker',()=>{
  const items=fixture.items.map(x=>applyItemScopedRecurrence(source(x),fixture.caption));
  assert.deepEqual(items.slice(0,5).map(x=>x.recurringPattern),Array(5).fill('none'));
  assert.equal(items[5].totalOccurrences,6);assert.equal(items[5].recurrenceUntilDate,'2026-12-17');
  assert.equal(items[5].startTime,'');assert.equal(items[6].recurringPattern,'weekly_thursday');
  const formatted=items.slice(0,5).map(x=>applyRecurrenceNormalizationForRegression(event({name:x.name,description:x.description,
    startDate:x.date,endDate:x.date,startTime:x.startTime,endTime:x.endTime}),x));
  assert.equal(collapseRecurringSeriesEvents(formatted).length,5);
  assert.deepEqual(formatted.map(x=>[x.startDate,x.startTime,x.endTime]),[
    ['2026-10-17','13:00','15:00'],['2026-10-25','15:00','17:00'],
    ['2026-10-28','18:00','20:00'],['2026-10-29','18:00','20:00'],['2026-10-30','18:00','20:00']]);
});
test('item-naming caption sentence restores omitted healthy cadence; another programme cannot lend it',()=>{
  assert.equal(applyItemScopedRecurrence(source({name:'Karaoke Night',description:'Sing along.',recurringPattern:'none'}),
    'Karaoke Night every Friday at 8 pm.').recurringPattern,'weekly_friday');
  assert.equal(applyItemScopedRecurrence(source(fixture.items[0]),fixture.caption).recurringPattern,'none');
  assert.equal(applyItemScopedRecurrence(source({name:'Bingo',description:'Dated game',recurringPattern:'none'}),
    'Bingo on October17; Poker every Thursday.').recurringPattern,'none');
  for(const text of ['Birthday Fridays','Belly Dance Fridays','Ongoing classes on Fridays and Saturdays','No longer ongoing classes Fridays'])
    assert.equal(detectRecurringPattern(text),'none',text);
});
test('forged JSON provenance cannot authorize removal of source-supported recurrence',()=>{
  for(const x of [source({...fixture.items[0],recurringPattern:'weekly_thursday',_recurrenceEvidence:{origin:'post_fallback',pattern:'weekly_thursday',text:fixture.caption}}),
    source(fixture.items[6])]){
    const b=bindCompactStage4Sources([x]);const held=parseCompactStage4Response(JSON.stringify({decisions:[decision(b[0],'none')]}),b).validatedItems[0];
    assert.equal(held.decision,'REJECTED');assert.equal(held.sourceHoldReason,'unsupported_recurrence_correction');
    assert.equal((held.item as any).recurringPattern,(x as any).recurringPattern);
  }
});
test('Be You evening-midnight source remains six hours with coherent next-day date',()=>{
  const x=event({name:'Open Mic, Open Dance Floor and Sing Along',description:'Tonight: 6-12. Must Be 19+',
    startTime:'18:00',endTime:'00:00',endDate:'2026-10-16',
    timeFlags:{start:{source:'explicit',evidence:'Tonight: 6-12'},end:{source:'explicit',toClose:false,evidence:'Tonight: 6-12'}}});
  const out=enforceDateTimeCompleteness([x],'2026-10-15T17:00:56Z','America/Halifax',x.description)[0];
  assert.deepEqual([out.startTime,out.endTime,out.startDate,out.endDate],['18:00','00:00','2026-10-15','2026-10-16']);
});
test('same-evening fallback cannot retain an inherited next-day date; explicit multiday windows survive',()=>{
  const fallback=event({endDate:'2026-10-16',timeResolution:{hoursUsed:false,endFromHours:'duration_default'}});
  assert.equal(enforceDateTimeCompleteness([fallback],'2026-10-15T12:00:00Z','America/Halifax')[0].endDate,'2026-10-15');
  assert.equal(enforceDateTimeCompleteness([event({endDate:'2026-10-16'})],'2026-10-15T12:00:00Z','America/Halifax')[0].endDate,'2026-10-16');
});
test('untimed tonight screening and Harvest activity cannot use post time; legitimate same-day offer still can',()=>{
  for(const name of ['A Long Winter','Chefs Harvest']){
    const x=event({name,description:'Tonight at the venue',startTime:'',endTime:'',timeFlags:{start:{source:'none',evidence:''},end:{source:'none',toClose:false,evidence:''}}});
    assert.equal(applySpecialTimeFallbacks([x],'2026-10-15T15:30:00Z','America/Halifax')[0].startTime,'');
    assert.equal(enforceDateTimeCompleteness([x],'2026-10-15T15:30:00Z','America/Halifax').length,0);
  }
  const offer=event({name:'Daily Sandwich Special',category:'Food Special',isEvent:'No',isFoodSpecial:'Yes',startTime:'',
    timeFlags:{start:{source:'none',evidence:''},end:{source:'explicit',toClose:false,evidence:'9 pm'}}});
  assert.equal(applySpecialTimeFallbacks([offer],'2026-10-15T15:30:00Z','America/Halifax')[0].startTime,'12:30');
});
test('Belly Dance printed55minute ongoing class keeps19:55 and supported Fridays without an invented horizon',()=>{
  const [item]=constrainSourceTimes([applyItemScopedRecurrence(source(fixture.belly))],'');
  assert.equal(item.endTime,'19:55');assert.equal((item as ExtractedEvent).recurringPattern,'weekly_friday');
  const formatted=rehydrateFormattedEventMetadata(event({name:item.name,startDate:item.date,endDate:item.date,startTime:'19:00',endTime:'21:00'}),item);
  assert.equal(formatted.endTime,'19:55');
  const recurring=applyRecurrenceNormalizationForRegression(formatted,item);
  assert.equal(recurring.recurringPattern,'weekly_friday');assert.ok(!recurring.recurrenceUntilDate);
});
test('craft fair with treats remains event; performing chorus remains music; documentary remains cinema',()=>{
  const cases=[['Annual Christmas Craft Fair','Vendors, festive treats and door prizes. Featured vendors include Butter Bits, Beer Blossom Designz, Homestyle Flavours Country Market, Barb’s Baked Goods and Sugar & Spice Homemade Goods.','Food Special','Gatherings & Parties'],
    ['The Men of the Deeps','A chorus of coal miners performing on stage.','Cinema','Live Music'],
    ['The Choir Documentary','Screening a film about a performing chorus.','Cinema','Cinema']];
  for(const [name,description,category,expected] of cases){const out=applyCategoryCorrectionsForRegression(event({name,description,category}),source({name,description}));
    assert.equal(out.category,expected);assert.equal(out.isFoodSpecial,'No');}
});
test('single verified civic address survives formatting while multi-location/unknown evidence cannot supply it',()=>{
  const spatial:any={kind:'single_location',locations:[{label:'ADL Room downstairs',address:'57 Central Street, Summerside',role:'location',certainty:'confirmed',sourceText:'ADL Room downstairs,57 Central Street, Summerside'}]};
  assert.equal(rehydrateFormattedEventMetadata(event(),source({spatial})).address,'57 Central Street, Summerside');
  assert.equal(rehydrateFormattedEventMetadata(event(),source({spatial:{...spatial,kind:'multi_location'}})).address,'');
});
test('a priced chili lunch at a craft fair remains the item-local meal offer',()=>{
 for(const name of ['$8 Chili Lunch at Christmas Craft Fair','Chili Lunch at Christmas Craft Fair — $8','Craft Fair Lunch Special']){
 const description='Lunch special: a bowl of chili for $8.';
 const out=applyCategoryCorrectionsForRegression(event({name,description,category:'Food Special',isEvent:'No',isFoodSpecial:'Yes'}),
  source({name,description,_sourceType:'special'}));
 assert.equal(out.category,'Food Special');assert.equal(out.isFoodSpecial,'Yes');
 }
});
test('Water Street activities route to unordered area review using AT hosts, never BY/FROM providers',()=>{
 const description='Halloween activities on Water Street. Craft table by Art Buds; Pokémon singles from Most Wanted Pawn; quiet zone and colouring contest at Daisy-Mae Bookshop; tattoos from Famous Peppers; fun activities at the Summerside Rotary Library; lawn games at Holman’s Ice Cream Parlour; photo ops from Kool Breeze Farms.';
 const out=classifySpatialEvent({name:'Witches on Water Street',description,location:'Water Street, Downtown Summerside',
  modelSpatialEvidence:{kind:'single_location',locations:[{label:'Water Street, Downtown Summerside',role:'location',certainty:'confirmed'}]}});
 assert.equal(out.kind,'multi_location');assert.equal(out.representation,'area');assert.equal(out.ordered,false);
 assert.deepEqual(out.locations.map(x=>x.label),['Daisy-Mae Bookshop','Summerside Rotary Library','Holman’s Ice Cream Parlour']);
 assert(out.reviewReasons.includes('multi_location_requires_point_resolution'));
 const incomplete=classifySpatialEvent({name:'Witches on Water Street',description:'Halloween fun on Water Street.',location:'Water Street, Downtown Summerside',combinedText:'Our downtown businesses and community partners have planned an activity lineup with crafts and games.'});
 assert.equal(incomplete.kind,'multi_location');assert.equal(incomplete.ordered,false);assert.equal(incomplete.locations.length,0);
 assert(incomplete.reviewReasons.includes('multi_location_names_not_fully_extracted'));
 const one=classifySpatialEvent({name:'Craft workshop',description:'Activities and crafts at the Summerside Rotary Library; craft table by Art Buds.',location:'57 Central Street, Summerside'});
 assert.equal(one.kind,'single_location');
});
test('Harvest strict single envelope rejects extra objects/syntax/fields and preserves source inventory after bounded retry',async()=>{
  const schema=createBoundFormattingSchema(1);
  const record:any=event();delete record.timeFlags;record.sourceItemIndex=0;record.totalOccurrences=1;record.recurrenceUntilDate='';record.isRecurring=false;
  const good=JSON.stringify({formattedEvents:[record],formattingDecisions:[]});
  assert.equal(parseStrictFormattingEnvelope(good,schema).formattedEvents.length,1);
  for(const bad of [good+'}\n janitor'+good,good+good,good.replace('"sourceItemIndex":0','"sourceItemIndex":2'),
    good.replace('"name":','"extra":true,"name":')]) assert.equal(parseStrictFormattingEnvelope(bad,schema).formattedEvents.length,0);
  let calls=0;const out=await formatStage5BatchesWithRecovery([source(fixture.items[0])],9,async()=>{
    calls++;return parseStrictFormattingEnvelope(good+good,schema);});
  assert.equal(out,null);assert.equal(calls,2);
});
