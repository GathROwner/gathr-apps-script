import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './__fixtures__/oct30-source-integrity.json';
import libraryConstraints from '../services/__fixtures__/oct29ReviewedLibraryConstraints.json';
import {applyReviewedSourceItems,isAdministrativePollingItem} from './reviewedSourceItems.js';
import {sourceItemHoldReason} from './sourceItemEvidence.js';
import {preserveValidatedOccurrence,rehydrateFamilyAudienceMetadata,rehydrateFormattedEventMetadata} from './finalFormatter.js';
import {enforceDateTimeCompleteness,extractExplicitTimeRangeForRegression} from './postParser.js';
import {prepareOccurrenceSourceItem} from './occurrenceSourceOwnership.js';
import {classifyReviewedOccurrenceConstraint} from '../services/reviewedOccurrenceConstraints.js';
import {reviewedSourceDuplicateRule,matchesReviewedSourceKeeper} from '../services/reviewedSourceDuplicates.js';
import {isHighConfidenceSameOccurrenceDuplicate,isDuplicateEntry} from '../utils/similarity.js';
import {scoreFamilyFriendly} from '../utils/familyFriendlyScoring.js';
import {validFamilyAudienceEvidence} from '../services/familyAudienceEvidence.js';
import {mergeStageArtifactsSnapshot,sanitizeStageArtifactsSnapshot,previewFullParserEventWritePayload,
  createFullParserVenueLookupCache,previewDuplicateMerge,resolveVenueForFullParserEventWithMatcherForRegression} from '../processing/rowProcessor.js';
import {requestsReviewedDowntownVenue,isReviewedDowntownVenue,ISLAND_CHEF_DOWNTOWN_VENUE} from '../processing/reviewedCanonicalSourceVenue.js';

const row=(number:number):any=>structuredClone(fixture.rows.find(r=>r.row===number)!);
const event=(item:any,patch:any={}):any=>({name:item.name,description:item.description,establishment:item.venue,
  venue:item.venue,category:'Food Special',isEvent:'No',isFoodSpecial:'Yes',startDate:item.date,endDate:item.date,
  startTime:item.startTime,endTime:item.endTime,recurringPattern:'none',isRecurring:'No',...patch});

test('O30-01 actual pickup evidence cannot collapse 15:00–17:00 into 17:00–17:00',()=>{
  const source=row(79),item=source.stage4[0];
  assert.deepEqual(extractExplicitTimeRangeForRegression(item.timeFlags.start.evidence,item.timeFlags.end.evidence),{startTime:'15:00',endTime:'17:00'});
  const formatted=preserveValidatedOccurrence(event(item,{startTime:'17:00'}),item);
  const out=enforceDateTimeCompleteness([{...formatted,timeFlags:item.timeFlags}], '2026-10-29T18:00:00Z','America/Halifax',source.caption);
  assert.equal(out.length,1);assert.equal(out[0].startTime,'15:00');assert.equal(out[0].endTime,'17:00');
  assert.equal(out[0].startDate,'2026-10-31');assert.equal(out[0].endDate,'2026-10-31');
  assert.equal(item.pricing,'$9.50 on the poster; post text says $10');
});

test('range controls retain overnight windows, and ambiguous between evidence cannot supply a standalone start',()=>{
  assert.deepEqual(extractExplicitTimeRangeForRegression('between 10pm & 1am',''),{startTime:'22:00',endTime:'01:00'});
  assert.equal(extractExplicitTimeRangeForRegression('between an unclear opening and 5 pm','between an unclear opening and 5 pm'),null);
  assert.deepEqual(extractExplicitTimeRangeForRegression('Doors at 7 pm','Show ends at 9 pm'),{startTime:'19:00',endTime:'21:00'});
});

test('O30-01 caption family evidence reaches the real write payload through existing scorer',async()=>{
  const source=row(79),item=source.stage4[0];
  const formatted=rehydrateFamilyAudienceMetadata(event(item),item,source.stage4,source.caption);
  const score=scoreFamilyFriendly(formatted);assert(score.familyFriendlyScore>=60);assert(validFamilyAudienceEvidence(formatted));
  const venue:any={id:'fb_100063772711403',name:item.venue,normalizedName:'island stone pub kensington station',address:'62 Broadway Street North, Kensington, PE',latitude:46.436,longitude:-63.639};
  const lookup=createFullParserVenueLookupCache(async()=>({isMatch:true,matchType:'exact',similarity:1,matchedVenue:venue} as any),async()=>({isMatch:true,matchType:'exact',similarity:1,matchedVenue:venue} as any));
  const payload=await previewFullParserEventWritePayload({...formatted,ticketPrice:item.pricing,mediaUrls:[]},
    {uniqueId:source.sourceId,text:source.caption,mediaUrls:[],userName:venue.name,pageName:venue.name,timestamp:'2026-10-29T18:00:00Z'} as any,79,0,venue,venue.name,lookup);
  assert(payload.familyFriendlyScore!>=60);assert(validFamilyAudienceEvidence(payload));
  assert.equal(payload.startTime,'15:00');assert.equal(payload.endTime,'17:00');assert.equal(payload.price,item.pricing);
});

test('family meal context cannot bleed from a gallery, another food, or an adult-only activity',()=>{
  const source=row(79),item=source.stage4[0];
  const mixed=rehydrateFamilyAudienceMetadata(event(item),item,[item,{...item,name:'Adult concert'}],source.caption);
  assert(scoreFamilyFriendly(mixed).familyFriendlyScore<60);
  const other={...item,name:'Mushroom Ravioli'};
  assert(scoreFamilyFriendly(rehydrateFamilyAudienceMetadata(event(other),other,[other],source.caption)).familyFriendlyScore<60);
  const mixedMeals='Feed the family!\n\nFor children and their parents.\n\nPizza and tacos for kids.\n\nCheeseburgers and fries takeout tonight.';
  assert(scoreFamilyFriendly(rehydrateFamilyAudienceMetadata(event(item),item,[item],mixedMeals)).familyFriendlyScore<60);
  const adult=rehydrateFamilyAudienceMetadata(event(item,{description:'19+ only'}),{...item,description:'19+ only'},[item],source.caption);
  assert.equal(scoreFamilyFriendly(adult).familyFriendlyScore,0);
});

test('O30-02 exact source image objects repair 12 extracted branch items including four weekly Chess occurrences',()=>{
  const source=row(126),out:any[]=applyReviewedSourceItems(source.stage4,source.sourceId,source.images);
  let changed=0;
  for(let index=0;index<out.length;index++){
    const item=out[index],before=source.stage4[index];
    if(item.venue===before.venue)continue;changed++;
    assert.equal(item.date,before.date);assert.equal(item.startTime,before.startTime);assert.equal(item.recurringPattern,before.recurringPattern);
    assert.equal(item.recurrenceUntilDate,before.recurrenceUntilDate);assert.equal(item._sourceOccurrenceCount,before._sourceOccurrenceCount);
    assert.equal(item.relevantImageIndex,item.venue==='Montague Rotary Library'?4:3);
    assert.equal(item.spatial.locations[0].address,item.venue==='Montague Rotary Library'?'21 Sullivan Lane':'89 Red Head Road');
    const formatted=rehydrateFormattedEventMetadata(event(item,{venue:before.venue,establishment:before.venue,
      additionalLocation:before.venue,address:'Wrong branch address',relevantImageIndex:before.relevantImageIndex}),item);
    assert.equal(formatted.venue,item.venue);assert.equal(formatted.address,item.spatial.locations[0].address);
    assert.equal(formatted.relevantImageIndex,item.relevantImageIndex);
  }
  assert.equal(changed,12);
  assert.equal(out.filter((i:any)=>i.name==='Chess Club'&&i.venue==='Montague Rotary Library').length,4);
});

test('library binding follows original image identity when gallery order changes; missing image holds only the reviewed item',()=>{
  const source=row(126),item=source.stage4.find((i:any)=>i.name==='DIY Bookmarks');
  const reordered=[...source.images].reverse();
  const fixed=applyReviewedSourceItems([item],source.sourceId,reordered)[0];
  assert.equal(fixed.venue,'Montague Rotary Library');assert.equal(fixed.relevantImageIndex,0);
  assert.equal(sourceItemHoldReason(applyReviewedSourceItems([item],source.sourceId,[])[0]),'reviewed_library_image_identity_unavailable');
  for(const patch of [{date:'2026-12-16'},{name:'Another Book Club'},{startTime:'15:00'}])
    assert.deepEqual(applyReviewedSourceItems([{...item,...patch}],source.sourceId,source.images)[0],{...item,...patch});
  assert.deepEqual(applyReviewedSourceItems([item],'another-source',source.images)[0],item);
});

test('correct branch still enforces accepted exact Montague representation holds without changing Nov4 originals or Nov18/25 continuations',()=>{
  const source=row(126),items=applyReviewedSourceItems(source.stage4,source.sourceId,source.images);
  const entry=libraryConstraints.find((e:any)=>e.venue.id==='slug_montague-rotary-library')!;
  assert(entry);
  const dates=[];
  for(const item of items.filter((i:any)=>i.name==='Chess Club')){
    const prepared:any=prepareOccurrenceSourceItem(item,source.caption);
    assert.equal(prepared.recurringPattern,'weekly_wednesday');assert.equal(prepared.recurrenceUntilDate,'2026-11-30');
    const candidate:any={uniqueId:source.sourceId+'_new',eventName:item.name,startDate:item.date,startTime:'16:30',venueId:entry.venue.id};
    assert.equal(classifyReviewedOccurrenceConstraint(candidate,entry.venue as any),'hold');dates.push(item.date);
  }
  assert.deepEqual(dates,['2026-11-04','2026-11-11','2026-11-18','2026-11-25']);
  assert.equal(classifyReviewedOccurrenceConstraint({uniqueId:'other-source_x',eventName:'Chess Club',startDate:'2026-11-04',startTime:'16:30'} as any,entry.venue as any),'none');
});

test('O30-04 item-level eligibility rejects all four polling candidates while preserving coffee, decor, craft and first aid',()=>{
  let rejected=0;
  for(const number of [336,338]){
    const source=row(number),out=applyReviewedSourceItems(source.stage4,source.sourceId,source.images);
    out.forEach((item:any,index:number)=>{
      if(isAdministrativePollingItem(item)){rejected++;assert.equal(sourceItemHoldReason(item),'ineligible_election_administration');assert.equal(item._itemEligibility,'ineligible');}
      else assert.deepEqual(item,source.stage4[index]);
    });
  }
  assert.equal(rejected,4);
  for(const name of ['Election watch party','Election fundraiser','Coffee','Polling Station Band concert'])
    assert.equal(isAdministrativePollingItem({name,description:'An election-night concert and gathering.',extractionReason:''}),false);
});

test('O30-06 untimed Sobeys offer remains held with exact source and missing essentials through snapshot persistence',()=>{
  const source=row(128),item=applyReviewedSourceItems(source.stage4,source.sourceId,source.images)[0] as any;
  assert.equal(sourceItemHoldReason(item),'retailer_offer_branch_date_clock_unverified');
  assert.deepEqual(item._sourceReviewMissing,['retailer_branch','date_weekday_conflict','service_window']);
  assert.equal(item._sourceId,source.sourceId);assert.equal(item.venue,'Sobeys');assert.equal(item.startTime,'');assert.equal(item.endTime,'');
  const merged=mergeStageArtifactsSnapshot(undefined,{source:'live',stage3HeldItems:[item]});
  const saved=sanitizeStageArtifactsSnapshot(merged)!;
  assert.equal((saved.stage3HeldItems![0] as any)._sourceId,source.sourceId);
  assert.deepEqual((saved.stage3HeldItems![0] as any)._sourceReviewMissing,item._sourceReviewMissing);
  assert.equal(applyReviewedSourceItems(source.stage4,'other-source',source.images)[0]._sourcePublicationHold,undefined);
});

test('bounded duplicate identities require exact source/date/start/title/venue and fingerprinted keeper',()=>{
  const samples=[
    {source:'1947068440080491',name:'Decor',date:'2026-11-12',start:'18:00',venue:'nvQTJXSbDsSfJTCxDKCH'},
    {source:'1946140366839965',name:'Coffee',date:'2026-11-02',start:'10:00',venue:'nvQTJXSbDsSfJTCxDKCH'},
    {source:'1869669937859249',name:'Laughs for a Friend',date:'2026-11-06',start:'20:00',venue:'V7zQ5unfTY1GtNKUvR7c'},
  ];
  for(const sample of samples){
    const candidate:any={uniqueId:sample.source+'_changed',eventName:sample.name,startDate:sample.date,startTime:sample.start,venueId:sample.venue};
    const rule=reviewedSourceDuplicateRule(candidate,sample.venue)!;assert(rule);
    const keeper:any={uniqueId:rule.keeperSources[0]+'_existing',eventName:rule.keeper,venueId:rule.path.split('/')[1],startDate:rule.date,startTime:rule.start};
    assert(matchesReviewedSourceKeeper(rule,keeper));
    assert.equal(matchesReviewedSourceKeeper(rule,{...keeper,startDate:'2026-11-07'}),false);
    assert.equal(matchesReviewedSourceKeeper(rule,{...keeper,uniqueId:'different-source_existing'}),false);
    for(const patch of [{startDate:'2026-11-07'},{startTime:'21:00'},{eventName:'Blair Gaudet'},{uniqueId:'different-source_item'}])
      assert.equal(reviewedSourceDuplicateRule({...candidate,...patch},sample.venue),undefined);
    assert.equal(reviewedSourceDuplicateRule(candidate,'another-venue'),undefined);
  }
});

test('existing duplicate logic matches corrected library/racing occurrence while protecting distinct sessions and performers',()=>{
  const occurrence=(name:string,patch:any={}):any=>({eventName:name,venueId:'same-venue',establishment:'Same Venue',startDate:'2026-11-06',startTime:'18:00',...patch});
  assert(isDuplicateEntry(occurrence('Chess Club'),occurrence('Chess Club',{endTime:'19:00'})));
  assert(isHighConfidenceSameOccurrenceDuplicate(occurrence('Harness Racing'),occurrence('Harness Racing',{endTime:'21:00'})));
  assert.equal(isHighConfidenceSameOccurrenceDuplicate(occurrence('Joey Doucette'),occurrence('Blair Gaudet')),false);
  assert.equal(isHighConfidenceSameOccurrenceDuplicate(occurrence('Joey Doucette'),occurrence('Joey Doucette',{startDate:'2026-11-07'})),false);
  assert.equal(isHighConfidenceSameOccurrenceDuplicate(occurrence('Chess Club'),occurrence('Chess Club',{startTime:'19:00'})),false);
});

test('reviewed duplicate corroboration preserves keeper clocks, title, recurrence, price and media',()=>{
  const existing:any={venueId:'nvQTJXSbDsSfJTCxDKCH',uniqueId:'1943285337125468_old',eventName:'Coffee Club',startDate:'2026-11-02',startTime:'10:00',endDate:'2026-11-03',endTime:'01:00',isRecurring:false,description:'Older description',mediaUrls:['https://storage.googleapis.com/keeper.jpg'],_sourceCorroborationOnly:true};
  const incoming:any={...existing,uniqueId:'1946140366839965_new',eventName:'Coffee',description:'Coffee upstairs.',endDate:'2026-11-02',endTime:'17:00',mediaUrls:[]};
  const result=previewDuplicateMerge({existingEvent:existing,incomingEvent:incoming,venue:{id:existing.venueId,name:'Milton Community Hall'} as any});
  assert.deepEqual(result.changedFields,['sourceUniqueIds']);
  assert.deepEqual(result.updates.sourceUniqueIds,['1943285337125468','1946140366839965']);
});

test('Island Chef mapping requires the reviewed current downtown source and exact existing canonical place',()=>{
  const source:any={userName:'Island Chef Down Town',pageName:'islandchefatthepier',facebookUrl:'https://www.facebook.com/islandchefatthepier',timestamp:'2026-10-29T15:47:30.000Z',text:'Island Chef Down Town\n62 Queen street Charlottetown'};
  const canonical:any={id:ISLAND_CHEF_DOWNTOWN_VENUE,googlePlaceId:'ChIJ0xyPItG_X0sRdhKfPeWKDK4',address:'62 Queen Street, Charlottetown, PE',city:'Charlottetown',latitude:46.2327961,longitude:-63.1255936};
  assert(requestsReviewedDowntownVenue(source));assert(isReviewedDowntownVenue(canonical));
  for(const actual of fixture.canonicalSourceRows)assert(requestsReviewedDowntownVenue(actual as any));
  for(const patch of [{text:'Island Chef, Cavendish'},{timestamp:'2026-09-29T15:00:00Z'},{userName:'Island Chef'},{facebookUrl:'https://www.facebook.com/anotherpage'},{sourceScraperType:'events'}])
    assert.equal(requestsReviewedDowntownVenue({...source,...patch}),false);
  for(const patch of [{id:'fb_100090273050576'},{googlePlaceId:'different-place'},{latitude:35.1394134,longitude:-120.642382},{address:'Cavendish'}])
    assert.equal(isReviewedDowntownVenue({...canonical,...patch}),false);
});

test('Island Chef final occurrence resolution keeps reviewed downtown identity while a separately named host still needs matching',async()=>{
  const source:any={userName:'Island Chef Down Town',pageName:'islandchefatthepier',facebookUrl:'https://www.facebook.com/islandchefatthepier',timestamp:'2026-10-29T15:47:30.000Z',text:'62 Queen street Charlottetown'};
  const canonical:any={id:ISLAND_CHEF_DOWNTOWN_VENUE,name:'Island Chef Downtown Lounge and Eatery',googlePlaceId:'ChIJ0xyPItG_X0sRdhKfPeWKDK4',address:'62 Queen Street, Charlottetown, PE',city:'Charlottetown',latitude:46.2327961,longitude:-63.1255936};
  let calls=0;
  const matcher=async()=>{calls++;return {isMatch:false,matchType:'none',similarity:0} as any;};
  const resolved=await resolveVenueForFullParserEventWithMatcherForRegression({item:{name:'Meal offer',venue:'Island Chef Down Town'} as any,
    row:source,rowVenue:canonical,establishment:canonical.name,rowIndex:270,matcher});
  assert.equal(resolved?.id,canonical.id);assert.equal(calls,0);
  await resolveVenueForFullParserEventWithMatcherForRegression({item:{name:'Guest workshop',venue:'Cavendish venue'} as any,
    row:source,rowVenue:canonical,establishment:canonical.name,rowIndex:270,matcher});
  assert(calls>0);
});
