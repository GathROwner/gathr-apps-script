import test from 'node:test';
import assert from 'node:assert/strict';
import {extractExplicitTimeRangeForRegression} from './postParser.js';
import {bindCompactStage4Sources,compactStage4FormatForSources,parseCompactStage4Response} from './compactStage4.js';
import {scoreFamilyFriendly,FAMILY_FRIENDLY_LIKELY_THRESHOLD} from '../utils/familyFriendlyScoring.js';
import {hasConflictingOccurrenceIdentity} from '../utils/occurrenceMergeGuard.js';
import type {ExtractedItem} from './types.js';
import {reconcilePublicPoolWindows,hasUnsupportedPostDateFallback} from './sourceOccurrenceGuards.js';
import {constrainSourceTimes} from './sourceTimeConstraints.js';
import {sourceItemHoldReason} from './sourceItemEvidence.js';
import {sharedFoodOfferOwner} from '../services/sharedFoodOfferVenue.js';
import {samePricedDailyOffer} from '../services/pricedDailyOfferIdentity.js';
import {applyCategoryCorrectionsForRegression} from './finalFormatter.js';
import {pickRecurringFamilyFallbackMatch} from '../services/recurringFamilyFallback.js';
import {preserveConflictingCloseAsUnknown} from './venueResolver.js';
import {enforceDateTimeCompleteness} from './postParser.js';
import {resolveVenueForFullParserEventWithMatcherForRegression} from '../processing/rowProcessor.js';

test('October19 breakfast compact source range preserves09:30 instead of matching its suffix',()=>{
 assert.deepEqual(extractExplicitTimeRangeForRegression('930-11am','930-11am'),{startTime:'09:30',endTime:'11:00'});
 assert.deepEqual(extractExplicitTimeRangeForRegression('1230-1pm',''),{startTime:'12:30',endTime:'13:00'});
 assert.deepEqual(extractExplicitTimeRangeForRegression('Available 11-2pm',''),{startTime:'11:00',endTime:'14:00'});
});

test('newline source identity is JSON data, never an invalid strict-schema enum literal',()=>{
 const sources=bindCompactStage4Sources([{name:'Studio Stories\nThe Great Migration',date:'2026-10-18',startTime:'',venue:''} as ExtractedItem]);
 const format=compactStage4FormatForSources(sources);
 assert.equal('enum' in format.schema.properties.decisions.items.properties.sourceIdentity.properties.name,false);
 assert.deepEqual(format.schema.properties.decisions.items.properties.sourceItemIndex.enum,[1]);
 const entry={sourceItemIndex:1,sourceIdentity:{name:sources[0].name,date:'2026-10-18',startTime:'',venue:''},decision:'KEPT',reason:'Dated public gallery visit.',corrections:{recurringPattern:null,correctionReason:''}};
 assert.equal(parseCompactStage4Response(JSON.stringify({decisions:[entry]}),sources).validatedItems.length,1);
 assert.throws(()=>parseCompactStage4Response(JSON.stringify({decisions:[{...entry,sourceIdentity:{...entry.sourceIdentity,name:'Other title'}}]}),sources),/source_identity_mismatch/);
});

test('leisure-pool access qualifies; adult, lane and lesson controls stay excluded',()=>{
 assert.ok(scoreFamilyFriendly({name:'Leisure pool open',category:'Sports'}).familyFriendlyScore>=FAMILY_FRIENDLY_LIKELY_THRESHOLD);
 for(const description of ['Adults-only swim.','Lane swim only.','Swimming lessons.'])assert.ok(scoreFamilyFriendly({name:'Leisure pool open',category:'Sports',description}).familyFriendlyScore<FAMILY_FRIENDLY_LIKELY_THRESHOLD);
});

test('a dated Zumba calendar slot cannot merge into a lifecycle that endedOctober7',()=>{
 const series={name:'ZUMBA',startDate:'2026-10-07',startTime:'17:30',isRecurring:'Yes',recurringPattern:'weekly_wednesday',recurrenceUntilDate:'2026-10-07',totalOccurrences:1,uniqueId:'1922694639184538_1'};
 const incoming={name:'Zumba',startDate:'2026-10-21',startTime:'17:30',isRecurring:'No',recurringPattern:'none',uniqueId:'1935042294616439_1',_sourceType:'calendar'};
 assert.equal(hasConflictingOccurrenceIdentity(series,incoming),true);
 assert.equal(hasConflictingOccurrenceIdentity(series,{...incoming,startDate:'2026-10-07'}),false);
});

test('October19 missing dash restores exactly three leisure intervals and remains idempotent',()=>{
 const caption='Monday October 19th at the Bell Aliant Centre!\nLeisure pool open - 5:30 am - 4:00 pm, 5:30 pm 7:00 pm, 8:00 pm - 9:00 pm';
 const result=reconcilePublicPoolWindows([],caption,'2026-10-18','Bell Aliant Centre');
 assert.deepEqual(result.map(x=>[x.date,x.startTime,x.endTime]),[['2026-10-19','05:30','16:00'],['2026-10-19','17:30','19:00'],['2026-10-19','20:00','21:00']]);
 assert.deepEqual(reconcilePublicPoolWindows(result,caption,'2026-10-18','Bell Aliant Centre'),result);
 assert.deepEqual(reconcilePublicPoolWindows([],caption.replace('Monday October 19th at the Bell Aliant Centre!',''),'2026-10-18','Bell Aliant Centre'),[]);
});

test('an undecided off-season launch cannot inherit posting date as a daily special',()=>{
 const caption="ANNOUNCEMENT\nWe are pleased to let everyone know that we will be setting up shop in PINTS East at the St Peters Information Center for the Off-Season. The hours will be Friday and Saturday each week from 4-8pm. Stay tuned for menu options to be released later this week but not sure when day 1 is yet, SOON! We will be open to everyone and there will be seating in the main pub or back by the order desk. We hope to see our many valued customers and will be offering a daily dinner special along with our popular smashburgers and pizzas.\n\nExciting news for Pints East!! We look forward to working with Betty and Shaun…Betty's Homestyle Take Out\n\nCommunity of St. Peter's\nWhat's up St. Peters Bay\nCommunity of Morell\nPoints East Coastal Drive";
 const item={name:'Daily dinner special',date:'2026-10-18',description:'A daily dinner special will be offered.',_sourceType:'special'} as ExtractedItem;
 for(const description of [item.description || '','Available today from4-8pm.','', 'Dinner special.'])
  for(const date of ['2026-10-18','2026-10-19','2026-10-24'])
   assert.equal(hasUnsupportedPostDateFallback({...item,date,description,extractionReason:''},'2026-10-18',caption),true);
 const mixed=caption+'\nToday, October18: Coffee available9am-11am for$3.';
 assert.equal(hasUnsupportedPostDateFallback({...item,name:'Coffee',description:'Available today.'},'2026-10-18',mixed),false);
 assert.equal(hasUnsupportedPostDateFallback(item,'2026-10-18',mixed),true);
 assert.equal(hasUnsupportedPostDateFallback({...item,name:'Coffee',date:'2026-10-19'},'2026-10-18',mixed),true);
 assert.equal(hasUnsupportedPostDateFallback({...item,name:'Coffee'},'2026-10-18',caption+'\nOCR TEXT:\nToday Coffee available9am-11am.'),true);
 assert.equal(hasUnsupportedPostDateFallback(item,'2026-10-18','Today, October18: Daily dinner special from4-8pm.'),false);
});

test('unqualified away venue and explicitly unspecified AM/PM stay held before formatting',()=>{
 const item={name:'U14 Penny vs Rustico Gauthier',date:'2026-10-20',startTime:'7:00',endTime:'8:00',venue:'',description:'Away game.',extractionReason:'The printed times do not specify AM or PM, so they are retained as shown.',_sourceType:'calendar',spatial:{kind:'unspecified',locations:[],evidenceNotes:'Marked Away; no venue printed.'}} as ExtractedItem;
 assert.equal(sourceItemHoldReason(constrainSourceTimes([item],'October19-25')[0]),'away_game_without_attendee_venue');
 for(const startTime of ['7:00','11:20','12:30']){
  const home={...item,startTime,description:'Home game.',spatial:{...item.spatial!,evidenceNotes:'Marked Home; no venue printed.'}} as ExtractedItem;
  assert.equal(sourceItemHoldReason(constrainSourceTimes([home],'October19-25')[0]),'source_meridiem_unresolved');
 }
});

test('a fundraiser explicitly names the publishing restaurant as attendee host',()=>{
 const publisher={id:'host',name:'New Glasgow Lobster Suppers | New Glasgow PE'} as any;
 const row={sharedPostAuthorName:'Rustico Ringette Association',sharedPostAuthorUrl:'https://www.facebook.com/RusticoRiptideRingette',sharedPostText:'Our first fundraiser!\nOctober25\n4:00-7:00 PM\nNew Glasgow Lobster Suppers',userName:publisher.name,pageName:publisher.name} as any;
 const item={category:'Food Special',name:'New Glasgow Lobster Suppers',venue:'New Glasgow Lobster Suppers',establishment:'New Glasgow Lobster Suppers'} as any;
 assert.equal(sharedFoodOfferOwner(item,row,publisher),undefined);
 assert.equal(sharedFoodOfferOwner({...item,venue:publisher.name,establishment:publisher.name},{...row,sharedPostText:'Our fundraiser meal special!4:00-7:00 PM'},publisher),'Rustico Ringette Association');
});

test('daily happy-hour product matches require exact product amount and slot',()=>{
 const incoming={name:'Happy Hour Gahan Beer',description:'Gahan beer (16oz) for $6, available daily.',category:'Happy Hour',recurringPattern:'daily',venueId:'merchantman',startTime:'21:00'} as any;
 const existing={...incoming,name:'Happy Hour – $6 Gahan beer (16oz)',description:'Available daily from9pm-close.'};
 assert.equal(samePricedDailyOffer(incoming,existing),true);
 for(const change of [{startTime:'14:00'},{venueId:'other'},{name:'Happy Hour – $6 Other beer (16oz)'},{name:'Happy Hour – $7 Gahan beer (16oz)'},{name:'Happy Hour – $6 Gahan beer (20oz)'}])assert.equal(samePricedDailyOffer(incoming,{...existing,...change}),false);
 const oysters={...incoming,name:'Happy Hour Oysters',description:'10 oysters for $20.'};
 assert.equal(samePricedDailyOffer(oysters,{...oysters,name:'10 oysters for $20'}),true);
 assert.equal(samePricedDailyOffer(oysters,{...oysters,name:'6 oysters for $20',description:'6 oysters for $20'}),false);
});

test('actual recurring-family selection binds daily offers across their original weekdays without crossing products or slots',()=>{
 const shared={category:'Happy Hour',eventType:'food_special',isEvent:'No',isFoodSpecial:'Yes',recurringPattern:'daily',isRecurring:'Yes',venueId:'merchantman',establishment:'Merchantman'};
 const before={...shared,id:'old-oysters',uniqueId:'1925652185545659_old',name:'Happy Hour – 10 oysters for $20',eventName:'Happy Hour – 10 oysters for $20',description:'10 oysters for $20, available every day2-4pm and9pm-close.',startDate:'2026-07-17',startTime:'14:00'} as any;
 const incoming={...shared,uniqueId:'2018884169555793_new',name:'Happy Hour Oysters',eventName:'Happy Hour Oysters',description:'Happy hour:10 oysters for $20, available daily2-4pm.',startDate:'2026-10-18',startTime:'14:00'} as any;
 assert.equal(pickRecurringFamilyFallbackMatch(incoming,[before],{venueId:'merchantman'})?.id,'old-oysters');
 assert.equal(pickRecurringFamilyFallbackMatch(incoming,[{...before,startTime:'21:00'}],{venueId:'merchantman'}),undefined);
 assert.equal(pickRecurringFamilyFallbackMatch({...incoming,name:'Happy Hour Gahan Beer',eventName:'Happy Hour Gahan Beer',description:'Gahan beer16oz for $6 daily.'},[before],{venueId:'merchantman'}),undefined);
});

test('calendar exercise cannot inherit a food-special category from adjacent free coffee',()=>{
 const source={name:'Exercise',date:'2026-10-19',startTime:'09:00',_sourceType:'calendar'} as ExtractedItem;
 const result=applyCategoryCorrectionsForRegression({name:'Exercise',category:'Food Special',description:'',isEvent:'No',isFoodSpecial:'Yes'} as any,source);
 assert.equal(result.category,'Workshops & Classes');assert.equal(result.isEvent,'Yes');assert.equal(result.isFoodSpecial,'No');
});

test('uncertain sidebar date stays held rather than migrating into the main weekly band',()=>{
 assert.equal(sourceItemHoldReason({name:'Christmas Decor',date:'2026-10-22',_sourceType:'calendar',description:'The first date digit is faint or partly obscured.'} as ExtractedItem),'calendar_date_identity_uncertain');
 assert.equal(sourceItemHoldReason({name:'Book Launch',date:'2026-10-22',_sourceType:'calendar',description:'Listed in Thursday October22 cell.'} as ExtractedItem),undefined);
});

test('cached close equal to advertised start preserves unknown end, without fallback reinvention',()=>{
 const event={name:'Happy Hour Oysters',category:'Happy Hour',isEvent:'No',isFoodSpecial:'Yes',establishment:'Merchantman',startDate:'2026-10-19',endDate:'2026-10-19',startTime:'21:00',endTime:'21:00',timeFlags:{start:{source:'explicit',evidence:'9pm'},end:{source:'none',toClose:true,evidence:''}},timeResolution:{hoursUsed:true,endFromHours:'to_close'}} as any;
 preserveConflictingCloseAsUnknown(event,{open:'11:00',close:'21:00'} as any);
 assert.equal(event.endTime,'');
 const [final]=enforceDateTimeCompleteness([event],'2026-10-18T14:00:00Z','America/Halifax','Available daily9pm-close.');
 assert.ok(final);assert.equal(final.endTime,'');assert.equal(final.timeFlags?.end?.source,'none');
 const overnight={...event,endTime:'01:00',timeResolution:{hoursUsed:true}} as any;
 preserveConflictingCloseAsUnknown(overnight,{open:'11:00',close:'01:00'} as any);assert.equal(overnight.endTime,'01:00');
});

test('actual completeness pass does not overwrite corrected breakfast with11:00 from range evidence',()=>{
 const event={name:'Pancake Breakfast',category:'Gatherings & Parties',isEvent:'Yes',isFoodSpecial:'No',establishment:'Montague Curling Club',startDate:'2026-10-31',endDate:'2026-10-31',startTime:'09:30',endTime:'11:00',timeFlags:{start:{source:'explicit',evidence:'930-11am'},end:{source:'explicit',toClose:false,evidence:'930-11am'}},timeResolution:{hoursUsed:false}} as any;
 const [result]=enforceDateTimeCompleteness([event],'2026-10-18T11:57:45Z','America/Halifax','Breakfast will run from930-11am.');
 assert.equal(result.startTime,'09:30');assert.equal(result.endTime,'11:00');
});

test('actual venue resolver uses explicit fundraiser host instead of querying the ringette organizer',async()=>{
 const host={id:'host',name:'New Glasgow Lobster Suppers | New Glasgow PE',address:'604 Route258, New Glasgow, PE',facebookUrl:'https://www.facebook.com/NewGlasgowLobsterSuppers'} as any;
 const row={uniqueId:'1540835551185689',timestamp:'2026-10-18T12:00:00Z',userName:'New Glasgow Lobster Suppers',pageName:'NewGlasgowLobsterSuppers',facebookUrl:host.facebookUrl,sharedPostAuthorName:'Rustico Ringette Association',sharedPostAuthorUrl:'https://www.facebook.com/RusticoRiptideRingette',sharedPostText:'Our first fundraiser!\nOctober25\n4:00-7:00 PM\nNew Glasgow Lobster Suppers',text:'We share our building with Rustico Ringette.'} as any;
 const item={name:'New Glasgow Lobster Suppers',venue:'New Glasgow Lobster Suppers',establishment:'New Glasgow Lobster Suppers',category:'Food Special',isFoodSpecial:'Yes',isEvent:'No',startDate:'2026-10-25',startTime:'16:00',endTime:'19:00'} as any;
 const attempts:string[]=[];
 const result=await resolveVenueForFullParserEventWithMatcherForRegression({item,row,rowVenue:host,establishment:host.name,rowIndex:142,matcher:async(name)=>{attempts.push(name);return {isMatch:true,matchType:'exact',similarity:1,matchedVenue:host};}});
 assert.equal(result?.id,host.id);assert(!attempts.some(name=>/ringette/i.test(name)));
});
