import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './__fixtures__/oct29-source-integrity.json';
import {prepareOccurrenceSourceItem} from './occurrenceSourceOwnership.js';
import {preserveValidatedItemSourceType} from './secondaryValidator.js';
import {constrainSourceTimes} from './sourceTimeConstraints.js';
import {sourceItemHoldReason} from './sourceItemEvidence.js';
import {rehydrateFormattedEventMetadata,rehydrateFamilyAudienceMetadata,applyRecurrenceNormalizationForRegression,applyCategoryCorrectionsForRegression} from './finalFormatter.js';
import {detectRecurringPattern} from './eventExtractor.js';
import {enforceDateTimeCompleteness} from './postParser.js';
import {imageExtractionCoverageHold,retainCaptionCandyCandidate,INDEPENDENT_SOURCE_ITEM_RULES} from './sourceCandidateRetention.js';
import {mergeStageArtifactsSnapshot,sanitizeStageArtifactsSnapshot,previewDuplicateMerge,
  resolveVenueForFullParserEventWithMatcherForRegression} from '../processing/rowProcessor.js';
import {hasConflictingOccurrenceIdentity} from '../utils/occurrenceMergeGuard.js';
import {isDuplicateEntry,isHighConfidenceSameOccurrenceDuplicate} from '../utils/similarity.js';
import {scoreFamilyFriendly,withFamilyFriendlyScore,FAMILY_FRIENDLY_SCORING_VERSION,FAMILY_FRIENDLY_LIKELY_THRESHOLD} from '../utils/familyFriendlyScoring.js';
import {transferFamilyAudienceEvidence} from '../services/familyAudienceEvidence.js';

const row=(number:number):any=>structuredClone(fixture.rows.find(r=>r.row===number)!);
const formatted=(item:any,patch:any={}):any=>({name:item.name,description:item.description||'',establishment:item.venue||'Fixture venue',
  category:'Gatherings & Parties',isEvent:'Yes',isFoodSpecial:'No',startDate:item.date,endDate:item.date,
  startTime:item.startTime,endTime:item.endTime||'',recurringPattern:'none',isRecurring:false,...patch});

test('O29-01 exact library items recover 15 bounded source-owned weekly programmes without holding every new monthly programme',()=>{
  let recovered=0,oneoffs=0;
  for(const number of [16,17]){const source=row(number);
    for(const raw of source.stage4){
      const prepared:any=prepareOccurrenceSourceItem(raw,source.caption);
      const own=`${raw.description||''} ${raw.extractionReason||''}`;
      if(/Listed for (?:Mondays|Tuesdays|Wednesdays|Thursdays|Fridays|Saturdays|Sundays)|Weekly (?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) program/i.test(own)){
        recovered++;assert.match(prepared.recurringPattern,/^weekly_/);assert.equal(prepared.recurrenceUntilDate,'2026-11-30');
        assert.equal(sourceItemHoldReason(prepared),undefined);
        const stage4=preserveValidatedItemSourceType({...prepared,_sourcePublicationHold:undefined},prepared);
        assert.equal(sourceItemHoldReason(stage4),undefined);
      }else{oneoffs++;assert.equal(prepared._sourceWeeklyProgramPattern,undefined,raw.name);}
    }
  }
  assert.equal(recovered,15);assert(oneoffs>20);
});

test('programme recovery holds explicit closures and cannot borrow another gallery programme weekday or month',()=>{
  const source=row(17),raw=source.stage4.find((i:any)=>/Weekly Wednesday/.test(i.extractionReason));
  const caption=source.caption.split(/\n\s*OCR TEXT:/i)[0];
  for(const text of [caption+'\nClosed Wednesday November 11.',caption+'\nLibrary closure November 11.']){
    const out=prepareOccurrenceSourceItem(raw,text);assert.equal(sourceItemHoldReason(out),'programme_closure_requires_occurrence_review');
    assert.equal((out as any)._sourceWeeklyProgramPattern,undefined);
  }
  for(const caption of ['December at our Libraries!','November and December at our Libraries!', 'Weekly Saturday music.'])
    assert.equal((prepareOccurrenceSourceItem(raw,caption) as any)._sourceWeeklyProgramPattern,undefined);
  const off=source.stage4.find((i:any)=>i.name==='A Ukulele Christmas');
  assert.equal((prepareOccurrenceSourceItem(off,source.caption) as any)._sourceWeeklyProgramPattern,undefined);
  const paws=row(16).stage4.filter((i:any)=>i.name==='Paws to Read');
  assert.equal(paws.length,2);for(const item of paws)assert.equal((prepareOccurrenceSourceItem(item,row(16).caption) as any)._sourceWeeklyProgramPattern,undefined);
});

test('O29-02 exact Side Door series extends through the fourth printed occurrence without clearing count or horizon',()=>{
  const source=row(266),events=source.events.filter((e:any)=>e.name==='Age Well Gabmoves');
  const existing={...events[0],uniqueId:source.sourceId+'_series',venueId:'side-door',sourceOccurrenceCount:4};
  const incoming={...events[1],uniqueId:source.sourceId+'_nov24',venueId:'side-door',sourceOccurrenceCount:4};
  const result=previewDuplicateMerge({existingEvent:existing,incomingEvent:incoming,venue:{id:'side-door',name:'Side Door Studio'} as any});
  const after={...existing,...result.updates};
  assert.equal(after.isRecurring,true);assert.equal(after.recurringPattern,'weekly_tuesday');
  assert.equal(after.totalOccurrences,4);assert.equal(after.recurrenceUntilDate,'2026-11-24');
  assert.equal(after.startDate,'2026-11-03');assert.equal(after.startTime,'09:30');assert.equal(after.endTime,'10:15');
  const exactCorrection=previewDuplicateMerge({existingEvent:existing,incomingEvent:{...incoming,uniqueId:existing.uniqueId,startDate:existing.startDate},venue:{id:'side-door',name:'Side Door Studio'} as any});
  assert.equal(exactCorrection.updates.recurringPattern,'none');
  const fortnightly={...existing,recurringWeekInterval:2,totalOccurrences:2};
  const offWeek={...incoming,startDate:'2026-11-10'};
  assert.equal(hasConflictingOccurrenceIdentity(fortnightly,offWeek),true);
  assert.equal(isDuplicateEntry(offWeek,fortnightly),false);
  assert.deepEqual(previewDuplicateMerge({existingEvent:fortnightly,incomingEvent:offWeek,venue:{id:'side-door',name:'Side Door Studio'} as any}).updates,{});
});

test('O29-03 actual BJORN descriptive daily phrase is one-off and explicit age-group sessions stay distinct',()=>{
  const source=row(354);
  const events=source.stage4.map((raw:any,index:number)=>{
    const item:any=prepareOccurrenceSourceItem(raw,source.caption);
    assert.equal(item.recurringPattern,'none');assert.equal(detectRecurringPattern(`${raw.name} ${raw.description}`),'none');
    const out=applyRecurrenceNormalizationForRegression(formatted(raw,{category:'Sports',isRecurring:true,recurringPattern:'daily'}),item);
    assert.equal(out.recurringPattern,'none');
    return {...out,uniqueId:source.sourceId+'_'+index,sourceOccurrenceCount:2,timeFlags:raw.timeFlags};
  });
  assert.equal(hasConflictingOccurrenceIdentity(events[0],events[1]),true);
  assert.equal(isDuplicateEntry(events[1],events[0]),false);
  const out=previewDuplicateMerge({existingEvent:events[0],incomingEvent:events[1],venue:{id:'rink',name:'Eastern Kings Sportsplex'} as any});
  assert.deepEqual(out.updates,{});
  assert.equal(detectRecurringPattern('Hockey clinic runs daily from November 2 through 6.'),'daily');
  assert.equal(detectRecurringPattern('Skating and puck skills daily. Clinic every Friday.'),'weekly_friday');
});

test('O29-04 actual wrong church candidate cannot use a fuzzy directional-name substitution',async()=>{
  const source=row(314),item=source.events[0];
  const wrong:any={id:'southwest',name:'Southwest River United Church',address:'Margate, PE'};
  const out=await resolveVenueForFullParserEventWithMatcherForRegression({item,rowVenue:{id:'publisher',name:'PEI Seniors'} as any,
    row:{facebookUrl:'https://www.facebook.com/PEISeniors',text:source.caption} as any,establishment:'PEI Seniors',rowIndex:314,
    matcher:async()=>({isMatch:true,matchType:'fuzzy',similarity:.88,matchedVenue:wrong})});
  assert.equal(out,null);
});

test('O29-04 bare library branch requires confirmed attendee evidence and exact independent identity; offsite/organizer labels stay held',async()=>{
  const publisher:any={id:'system',name:'PEI Public Library Service',facebookUrl:'https://www.facebook.com/PEILibrary',address:'89 Red Head Road, Morell'};
  const branch:any={id:'souris',name:'Souris Public Library'};
  const source=row(16),raw=source.stage4.find((i:any)=>i.venue==='Souris');
  const resolve=(spatial:any,exact=true)=>resolveVenueForFullParserEventWithMatcherForRegression({
    item:{...formatted(raw),establishment:'Souris',additionalLocation:'Souris',spatial} as any,rowVenue:publisher,
    row:{facebookUrl:publisher.facebookUrl,userName:publisher.name,text:source.caption} as any,establishment:publisher.name,rowIndex:16,
    matcher:async candidate=>candidate==='Souris Public Library'?{isMatch:true,matchType:exact?'exact':'fuzzy',similarity:1,matchedVenue:branch}:{isMatch:true,matchType:'exact',similarity:1,matchedVenue:publisher}});
  const proof={kind:'single_location',locations:[{label:'Souris',role:'location',certainty:'confirmed',sourceText:'Souris 175 Main Street'}]};
  assert.equal((await resolve(proof))?.id,'souris');assert.equal(await resolve(proof,false),null);
  for(const spatial of [undefined,{...proof,kind:'multi_location'},{...proof,locations:[{...proof.locations[0],role:'organizer'}]},
    {...proof,locations:[{...proof.locations[0],certainty:'uncertain'}]},
    {...proof,locations:[{label:'Souris Town Hall',role:'location',certainty:'confirmed'}]}])assert.equal(await resolve(spatial),null);
});

test('O29-05 captured Hunter variants match without merging gender-specific sessions; host Mat clock survives',()=>{
  for(const pair of fixture.duplicatePairs.slice(0,3))assert.equal(isDuplicateEntry(pair[0] as any,pair[1] as any),true,pair[0].name);
  const pair=fixture.duplicatePairs[1];
  const merged=previewDuplicateMerge({existingEvent:pair[1] as any,incomingEvent:pair[0] as any,
    venue:{id:pair[1].venueId,name:pair[1].establishment,facebookUrl:'https://www.facebook.com/hunterspei'} as any});
  assert.equal(merged.updates.startTime,undefined);assert.equal(pair[1].startTime,'22:00');
  const ann=fixture.duplicatePairs[3];assert.equal(isHighConfidenceSameOccurrenceDuplicate(ann[0] as any,ann[1] as any),true);
  const a:any={...pair[1],name:"Men's basketball",eventName:"Men's basketball"};
  const b={...a,name:"Women's basketball",eventName:"Women's basketball"};assert.equal(isDuplicateEntry(a,b),false);
});

test('O29-06 actual untimed parsnip offer stays held and cannot acquire the post clock',()=>{
  const source=row(176),item=constrainSourceTimes(source.stage4,source.caption)[0];
  assert.equal(item._sourceTimeConstraint?.reason,'offer_service_hours_unverified');
  const restored=rehydrateFormattedEventMetadata(source.events[0],item);assert.equal(restored.startTime,'');
  assert.equal(enforceDateTimeCompleteness([restored],source.rowMeta.timestamp,'America/Halifax').length,0);
});

test('O29-07 exact exhibition source stops before borrowed Eptek hours or closing-only Cinema can publish',()=>{
  const source=row(242),item=constrainSourceTimes(source.stage4,source.caption)[0];
  assert.equal(sourceItemHoldReason(item),'exhibition_attendee_availability_unverified');
  const out=applyCategoryCorrectionsForRegression(source.events[0],item);assert.equal(out.category,'Gatherings & Parties');
  const restored=rehydrateFormattedEventMetadata(source.events[0],item);assert.equal(restored.startTime,'');assert.equal(restored.endTime,'');
});

test('O29-08 exact row31 source loses false alcohol penalty in create and duplicate scoring; true spirit tasting remains alcohol',()=>{
  const source=row(31),event=source.events[0];
  const own=rehydrateFamilyAudienceMetadata(event,source.stage4[0],source.stage4,source.caption);
  const score=scoreFamilyFriendly(own);assert(!score.familyFriendlyReasons.includes('alcohol_focused'));
  assert(score.familyFriendlyScore>=FAMILY_FRIENDLY_LIKELY_THRESHOLD);
  assert.equal(withFamilyFriendlyScore(own).familyFriendlyScoringVersion,FAMILY_FRIENDLY_SCORING_VERSION);
  // The real writer transfers the aligned formatter proof after venue resolution.
  const persisted:any={...own,venueId:'rink'};
  persisted.familyAudienceEvidence=transferFamilyAudienceEvidence(own,persisted);
  assert(withFamilyFriendlyScore(persisted).familyFriendlyScore>=FAMILY_FRIENDLY_LIKELY_THRESHOLD);
  const result=previewDuplicateMerge({existingEvent:{...persisted,uniqueId:'1000000001_a'},
    incomingEvent:{...persisted,uniqueId:'1000000002_a'},venue:{id:'rink',name:event.establishment} as any});
  assert.equal(result.updates.familyFriendlyScoringVersion,FAMILY_FRIENDLY_SCORING_VERSION);
  assert(Number(result.updates.familyFriendlyScore)>=FAMILY_FRIENDLY_LIKELY_THRESHOLD);
  assert(!(result.updates.familyFriendlyReasons||[]).includes('alcohol_focused'));
  for(const description of ['community spirit','school spirit','team spirit'])assert(!scoreFamilyFriendly({description}).familyFriendlyReasons.includes('alcohol_focused'));
  for(const description of ['Spirit tasting','Craft spirits tasting','Beer and wine'])assert(scoreFamilyFriendly({description}).familyFriendlyReasons.includes('alcohol_focused'));
  for(const description of ['Bring family photos and friends to the adult-only lecture.','Do not bring family, friends or children.','Proceeds for families.'])
    assert(scoreFamilyFriendly({description}).familyFriendlyScore<FAMILY_FRIENDLY_LIKELY_THRESHOLD);
});

test('O29-09 actual Roots & Shoots 18-20 clocks survive noon defaults; explicit multiday and overnight endings survive',()=>{
  const source=row(296),item=source.stage4[0];
  const out=rehydrateFormattedEventMetadata(formatted(item,{startTime:'12:00',endTime:'12:00'}),item);
  assert.equal(out.startTime,'18:00');assert.equal(out.endTime,'20:00');assert.equal(out.startDate,'2026-10-28');
  const multi={...item,date:'2026-11-06',endDate:'2026-11-08'};
  assert.equal(rehydrateFormattedEventMetadata(formatted(multi,{endDate:'2026-11-08'}),multi).endDate,'2026-11-08');
  assert.equal(rehydrateFormattedEventMetadata(formatted(multi,{endDate:'2026-11-07'}),multi).endDate,'2026-11-08');
  const overnight={...item,date:'2026-11-06',startTime:'22:00',endTime:'01:00'};
  assert.equal(rehydrateFormattedEventMetadata(formatted(overnight),overnight).endDate,'2026-11-07');
});

test('O29-10 rejected image remains private source coverage; O29-11 an end-only wing offer cannot borrow music start',()=>{
  const holds=imageExtractionCoverageHold(1,'stage1_rejected_attached_images_require_source_review');
  const saved=sanitizeStageArtifactsSnapshot(mergeStageArtifactsSnapshot(undefined,{source:'live',sourceCoverageHolds:holds}));
  assert.deepEqual(saved?.sourceCoverageHolds,holds);assert.equal(saved?.stage3Items,undefined);
  // Verbatim source facts reviewed in media/45-stored-0.img; no invented service start.
  const wing:any={name:'10 wings for $10',description:'10 wings for $10 until 10PM',date:'2026-11-03',startTime:'',endTime:'22:00',_sourceType:'special',
    relevantImageIndex:0,timeFlags:{start:{source:'none',evidence:''},end:{source:'explicit',toClose:false,evidence:'until 10PM'}}};
  const out=constrainSourceTimes([wing,...row(45).stage3],row(45).caption).find(i=>i.name===wing.name)!;
  assert.equal(out.startTime,'');assert.equal(out.endTime,'22:00');assert(out._sourceTimeConstraint);
  assert.match(INDEPENDENT_SOURCE_ITEM_RULES,/unrelated caption/);assert.match(INDEPENDENT_SOURCE_ITEM_RULES,/unprinted start empty/);
});

test('O29-12 literal candy window retained privately, date stays absent, unnamed entertainment stays held',()=>{
  const source=row(324),out=retainCaptionCandyCandidate(source.stage3,source.caption),candy=out.find(i=>i.name==='Candy handout')!;
  assert.equal(candy.startTime,'16:00');assert.equal(candy.endTime,'19:00');assert.equal(candy.date,'');
  assert.equal(sourceItemHoldReason(candy),'caption_activity_date_unverified');
  assert.equal(sourceItemHoldReason(out[0]),'adjacent_entertainment_not_named_activity');
  assert.deepEqual(retainCaptionCandyCandidate(out,source.caption),out);
  assert.equal(retainCaptionCandyCandidate([],'Candy available, entertainment at 7:30pm.').length,0);
});
