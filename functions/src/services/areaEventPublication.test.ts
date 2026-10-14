import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEventAreaData, verifyAreaPublicationReferences, requiresReviewedAreaPoints, publicCityLevelDescription} from './areaEventPublication.js';
import type {EventAreaData, AreaEventLinkEvidence} from './areaEventPublication.js';
import {buildPublishedCityLevelEventDataForRegression} from './firestoreService.js';
import type {CityLevelEventReviewRecord} from '../types/index.js';

const area = (): EventAreaData => ({version:1,status:'verified',sourceUrl:'https://www.anchorfest.ca',locations:[{
  id:'venue_venue_fixture',label:'The Arts Guild (The Guild)',venueId:'venue_fixture',certainty:'confirmed',
  coordinates:{latitude:46.2,longitude:-63.1},linkedEventIds:['conference_fixture'],
}]});
const proof = (): AreaEventLinkEvidence => ({eventPath:'venues/venue_fixture/events/conference_fixture',
  eventName:'ANCHOR Fest Conference & Panel Discussion',venueId:'venue_fixture',startDate:'2026-10-15',startTime:'09:00',
  festivalName:'ANCHOR Fest',sourceUrl:'https://www.facebook.com/publisher_fixture/posts/source_fixture',
  sourceText:'Thursday, October 15, 2026 events: 9:00 am - The Arts Guild: ANCHOR Fest Conference & Panel Discussion',
  sourceEventText:'ANCHOR Fest Conference & Panel Discussion',sourceDateText:'October 15, 2026',sourceTimeText:'9:00 am',sourceVenueText:'The Arts Guild'});
const child = () => ({venueId:'venue_fixture',eventName:proof().eventName,startDate:'2026-10-15',endDate:'2026-10-15',startTime:'09:00',isRecurring:'No'});
const read = (override: Record<string,unknown> | undefined = child()) => async (path: string) => path.startsWith('venues/') && !path.includes('/events/')
  ? {...area().locations[0].coordinates} : override;
const input = () => ({areaData:area(),evidence:[proof()],eventName:'Anchor Fest 2026',startDate:'2026-10-14',endDate:'2026-10-18',read:read()});
const record = (overrides: Partial<CityLevelEventReviewRecord> = {}): CityLevelEventReviewRecord => ({status:'needs_review',locationScope:'area',
  locationLabel:'Downtown Charlottetown',locationCity:'Charlottetown',locationPrecision:'approximate',locationReviewStatus:'needs_review',
  eventName:'Anchor Fest 2026',eventDate:'2026-10-14',endDate:'2026-10-18',eventTime:'19:00',endTime:'23:00',occurrences:1,sampleRows:[],...overrides});

test('reviewed unordered points and exact source-bound canonical child IDs survive',async()=>{
  assert.deepEqual(await verifyAreaPublicationReferences(input()),area());
});
test('legacy area points without links remain compatible',()=>{
  const old=area();delete old.locations[0].venueId;delete old.locations[0].linkedEventIds;
  assert.deepEqual(validateEventAreaData(old),old);
});
test('public area contract strips private evidence at every object depth',()=>{
  const dirty:any=area();dirty.areaEventLinks=[proof()];dirty.reviewReasons=['internal'];dirty.locations[0].proof=proof();dirty.locations[0].coordinates.audit='secret';
  assert.deepEqual(validateEventAreaData(dirty),area());
});
test('malformed points, duplicate aliases, duplicate members, and connecting lines fail closed',()=>{
  for(const mutation of [
    (x:any)=>x.locations={},(x:any)=>x.locations=[null],(x:any)=>x.locations[0].coordinates.latitude=NaN,
    (x:any)=>x.locations[0].coordinates.longitude=-181,(x:any)=>x.locations.push({...x.locations[0],id:'alias'}),
    (x:any)=>x.locations[0].linkedEventIds.push(x.locations[0].linkedEventIds[0]),
    (x:any)=>x.locations[0].certainty='possible',(x:any)=>x.locations[0].linkedEventIds='bad',
    (x:any)=>x.segments=[],(x:any)=>x.ordered=false,(x:any)=>x.geometry={},
    (x:any)=>x.sourceUrl='javascript:alert(1)',
  ]) {const x=area();mutation(x);assert.throws(()=>validateEventAreaData(x));}
});
test('missing or ambiguous coordinates never resolve through a guessed location',async()=>{
  for(const venue of [undefined,{latitude:46,longitude:-63}]) await assert.rejects(verifyAreaPublicationReferences({...input(),read:async()=>venue}));
});
test('festival words alone cannot link an unrelated child activity, clock, date, or venue',async()=>{
  for(const changed of [
    {sourceText:'Anchor Fest runs this week. Unrelated event.'}, {sourceEventText:'Another show'},
    {sourceDateText:'October 16, 2026'}, {sourceTimeText:'9:30 am'}, {sourceVenueText:'Babas'},
    {festivalName:'Another Festival'}, {venueId:'different'},
    {eventPath:'venues/different/events/conference_fixture'},
  ]) await assert.rejects(verifyAreaPublicationReferences({...input(),evidence:[{...proof(),...changed}]}));
});
test('a changed or cancelled canonical child is held without rematching',async()=>{
  for(const changes of [{startDate:'2026-10-16'},{startTime:'10:00'},{venueId:'elsewhere'},
    {eventName:'Different activity'},{isRecurring:'Yes'},{originalEventId:'parent'},
    {status:'cancelled'},{endDate:'2026-10-19'}]) {
    await assert.rejects(verifyAreaPublicationReferences({...input(),refreshing:true,read:read({...child(),...changes})}));
  }
});
test('an activity at a different named venue cannot be linked to this point',async()=>{
  const unrelated={...proof(),sourceVenueText:'Babas',sourceText:proof().sourceText.replace('The Arts Guild','Babas')};
  await assert.rejects(verifyAreaPublicationReferences({...input(),evidence:[unrelated]}));
});
test('deleted child blocks initial approval and is safely omitted on refresh without changing point identity',async()=>{
  const reader=async(path:string)=>path.includes('/events/')?undefined:{...area().locations[0].coordinates};
  await assert.rejects(verifyAreaPublicationReferences({...input(),read:reader}));
  const refreshed=await verifyAreaPublicationReferences({...input(),read:reader,refreshing:true});
  assert.equal(refreshed.status,'partial');assert.deepEqual(refreshed.locations[0],{...area().locations[0],linkedEventIds:[]});
  assert.equal(area().locations[0].linkedEventIds?.length,1);
});
test('legacy multi-site review cannot publish a centroid-only umbrella',()=>{
  const legacy=record({sampleRows:[{rowIndex:57,observedLocationName:'Downtown Charlottetown, including City Cinema, Tivoli Cinema, The Arts Guild and Trailside Music Hall'}]});
  assert.equal(requiresReviewedAreaPoints(legacy),true);
  assert.throws(()=>buildPublishedCityLevelEventDataForRegression('anchor',legacy),/requires reviewed areaData/);
});
test('legacy single-venue, parent-complex and city/address review prose does not require extra pins',()=>{
  for(const observedLocationName of ["Mavor's Lounge, Confederation Centre of the Arts; Charlottetown",'145 Richmond Street, Charlottetown, PEI','Downtown Charlottetown']) {
    const single=record({sampleRows:[{rowIndex:1,observedLocationName}]});
    assert.equal(requiresReviewedAreaPoints(single),false);
    assert.equal(buildPublishedCityLevelEventDataForRegression('single',single).areaData,undefined);
  }
});
test('reviewed point/timing/description overrides survive subsequent parser refresh',()=>{
  const reviewed=record({status:'published',descriptionPreview:'Latest parser guessed description',eventTime:'19:00',endTime:'23:00',finalization:{action:'approve_publish',manual:{
    locationScope:'area',areaData:area(),eventTime:'',endTime:'',description:'Five days of film, music, comedy and conference activities.',
    areaEventLinks:[proof()],
  }}});
  const published=buildPublishedCityLevelEventDataForRegression('anchor',reviewed);
  assert.equal(published.startTime,'');assert.equal(published.endTime,'');assert.equal(published.venueId,null);
  assert.equal(published.description,'Five days of film, music, comedy and conference activities.');
  assert.deepEqual(published.areaData,area());assert.equal('areaEventLinks' in published,false);assert.equal('finalization' in published,false);
  const amended=buildPublishedCityLevelEventDataForRegression('anchor',reviewed,{description:'Reviewer amended description'});
  assert.deepEqual(amended.areaData,area());assert.equal(amended.startTime,'');assert.equal(amended.description,'Reviewer amended description');
});
test('public description removes legacy audit suffix while retaining full public prose',()=>{
  const prose='A public festival description. '.repeat(30);
  const published=buildPublishedCityLevelEventDataForRegression('anchor',record({description:prose+' | Observed broad location: X | Review reasons: secret'}));
  assert.equal(published.description,prose.trim());
  assert.equal(publicCityLevelDescription('Great show | Review reasons: held'),'Great show');
});
test('ordinary city publication and existing route review gate stay unchanged',()=>{
  const city=buildPublishedCityLevelEventDataForRegression('city',record({locationScope:'city',locationLabel:'Charlottetown'}));
  assert.equal(city.locationScope,'city');assert.equal(city.areaData,undefined);assert.equal(city.startTime,'19:00');
  assert.throws(()=>buildPublishedCityLevelEventDataForRegression('route',record({locationScope:'route',areaData:area(),spatialEvidence:{kind:'route'} as any})),/cannot replace a route/);
});
