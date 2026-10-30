import test from 'node:test';
import assert from 'node:assert/strict';
import {DateTime} from 'luxon';
import {datedUntimedOfferService, inferOfferAvailability, coherentOfferAvailability,
  typesSupportOfferService, websiteTitleSupportsOffer, VerifiedOfferHours} from './offerServiceHours.js';
import {resolveTimesWithOperatingHours} from './venueResolver.js';
import {enforceDateTimeCompleteness} from './postParser.js';
import {previewDuplicateMerge, previewFullParserEventWritePayload, createFullParserVenueLookupCache} from '../processing/rowProcessor.js';
import {enrichEventsFromVenueWebsite} from './websiteDetailEnricher.js';
import {DEFAULT_PARSING_CONFIG} from './types.js';
import * as firestore from '../services/firestoreService.js';
import * as places from '../services/placesService.js';

const now = Date.parse('2026-10-29T01:00:00Z');
const base: any = {name:'Free Buddy Burger for Halloween',description:'On October 31, wear a costume for a free Buddy Burger.',
  category:'Food Special',isEvent:'No',isFoodSpecial:'Yes',establishment:'A&W',address:'650 University Ave, Charlottetown, PE',
  startDate:'2026-10-31',endDate:'2026-10-31',startTime:'',endTime:'',isRecurring:'No',recurringPattern:'none',
  _sourceType:'special',timeFlags:{start:{source:'none',evidence:''},end:{source:'none',toClose:false,evidence:''}}};
const evidence: VerifiedOfferHours = {venueId:'aw',placeId:'exact-aw',verifiedAt:new Date(now).toISOString(),
  sourceUrl:'https://example.org/verified-service-hours',service:'food',hours:{open:'06:00',close:'02:00'}};
function infer(overrides:any = {}, proof:Partial<VerifiedOfferHours> = {}) {
  return inferOfferAvailability({...base,...overrides},{...evidence,...proof},'America/Halifax',now);
}

test('dated restaurant offer is an estimated availability window across DST, not an advertised start',()=>{
  const event=infer()!; assert.ok(coherentOfferAvailability(event));
  assert.equal(event.endDate,'2026-11-01'); assert.equal(event.timeFlags?.end?.toClose,false);
  const timing:any=event.timing;
  assert.equal(timing.scheduleKind,'availability_window');
  assert.equal(timing.schedule.start.status,'estimated'); assert.equal(timing.schedule.end.status,'estimated');
  assert.equal(timing.schedule.start.at,'2026-10-31T09:00:00.000Z');
  assert.equal(timing.schedule.end.at,'2026-11-01T06:00:00.000Z');
  assert.equal(event.timeResolution?.endFromHours,undefined);
});
test('two drink-offer dates use bar closing, with correct next-day and DST conversion',()=>{
  for(const date of ['2026-10-30','2026-10-31']) {
    const event=infer({category:'Drink Special',name:'Halloween drinks & treat bags',description:'Available Friday and Saturday.',startDate:date,endDate:date},
      {service:'bar',hours:{open:'12:00',close:'02:00'}})!;
    assert.ok(event); assert.equal(event.endDate,date==='2026-10-30'?'2026-10-31':'2026-11-01');
    assert.equal((event.timing as any).schedule.end.at,date==='2026-10-30'?'2026-10-31T05:00:00.000Z':'2026-11-01T06:00:00.000Z');
  }
});
for(const [label,override] of Object.entries({
  'printed start':{startTime:'14:00'},'printed end':{endTime:'19:00'},
  'weekly offer':{recurringPattern:'weekly_saturday'},'recurrence flag':{isRecurring:'Yes'},
  'source hold':{_sourceTimeConstraint:{reason:'activity_offer_without_clock',evidence:'different session'}},
  'multi-location':{spatial:{kind:'multi_location'}},'route':{spatial:{kind:'route'}},
  'non-offer':{isFoodSpecial:'No'},'scheduled event':{isEvent:'Yes'},
  'meal period':{description:'October 31 lunch only.'},'happy hour':{description:'Halloween happy hour drinks.'},
  'evening':{description:'Halloween drinks tonight.'},'clock in text':{description:'October 31 from 6 pm.'},
  'party':{name:'Halloween burger party'},'tasting session':{name:'Halloween beer tasting'},
  'no source date cue':{name:'Burger offer',description:'You may enjoy our burgers.'},
  'multiday':{endDate:'2026-11-01'},'invalid date':{startDate:'2026-02-30',endDate:'2026-02-30'},
})) test(`does not infer ${label}`,()=>assert.equal(infer(override),null));
for(const [label,hours] of Object.entries({closed:{open:'06:00',close:'23:00',closed:true},missing:{open:'06:00',close:''},
  malformed:{open:'6ish',close:'23:00'},ambiguous24h:{open:'00:00',close:'00:00'}})) {
  test(`does not infer ${label} hours`,()=>assert.equal(infer({}, {hours}),null));
}
test('expired hours and distant occurrence fail closed',()=>{
  assert.equal(infer({}, {verifiedAt:'2026-10-01T00:00:00Z'}),null);
  assert.equal(infer({startDate:'2026-12-31',endDate:'2026-12-31'}),null);
});
test('relevant service identity excludes food at mixed-service entertainment premises',()=>{
  assert.equal(typesSupportOfferService(['hamburger_restaurant','restaurant'],'food'),true);
  assert.equal(typesSupportOfferService(['bar','restaurant'],'food'),false);
  assert.equal(typesSupportOfferService(['bar','restaurant'],'bar'),true);
  assert.equal(typesSupportOfferService(['shopping_mall','restaurant'],'food'),false);
  assert.equal(typesSupportOfferService(['restaurant'],'bar'),false);
});
test('website offer identity excludes unrelated seasonal party even when it mentions drinks',()=>{
  const item='Halloween drinks & treat bags';
  assert.equal(websiteTitleSupportsOffer(item,'Saints & Sinners Halloween Party'),false);
  assert.equal(websiteTitleSupportsOffer(item,'Halloween Cocktail Party with Drinks'),false);
  assert.equal(websiteTitleSupportsOffer(item,'Halloween drinks and treat bags at PonyBoat'),true);
  assert.equal(websiteTitleSupportsOffer('Ordinary concert','Ordinary concert'),true);
});

function install(t:any, changes:any={}) {
  const dt=DateTime.now().setZone('America/Halifax').plus({days:2}).startOf('day');
  const date=dt.toISODate()!; const weekday=dt.weekday%7;
  const event={...base,startDate:date,endDate:date,description:`Offer on ${date}.`};
  const venue:any={id:'aw',name:'A&W',googlePlaceId:'exact-aw',address:base.address,...changes.venue};
  t.mock.method(firestore,'findVenueExactNameCandidates',async()=>changes.venues || [venue]);
  const period={open:{day:weekday,date,time:'06:00'},close:{day:weekday,date,time:'23:00'}};
  const details:any={placeId:'exact-aw',formattedAddress:base.address,businessStatus:'OPERATIONAL',types:['hamburger_restaurant'],
    openingHours:{weekdayText:[],periods:changes.periods?.(period) || [period]},...changes.details};
  const mock=t.mock.method(places,'getPlaceDetails',async()=>details);
  return {event,date,mock,venue};
}
test('resolver uses exact date-bound service hours once for repeated offers and preserves estimated contract through completion',async t=>{
  const {event,mock}=install(t);
  const results=await resolveTimesWithOperatingHours([event,event],'A&W','','2026-10-27T12:00:00Z');
  assert.equal(mock.mock.callCount(),1);
  for(const result of results){
    assert.equal(result.endTime,'23:00');assert.ok(coherentOfferAvailability(result));
    const final=enforceDateTimeCompleteness([result],'2026-10-27T12:00:00Z','America/Halifax','');
    assert.equal(final.length,1); assert.ok(coherentOfferAvailability(final[0]));
  }
});
for(const [label,changes] of Object.entries({
  'ambiguous canonical branches':{venues:[{id:'one',googlePlaceId:'one'},{id:'two',googlePlaceId:'two'}]},
  'wrong branch address':{venue:{address:'99 Other Road, Charlottetown, PE'}},
  'wrong stored Places identity address':{details:{formattedAddress:'451 Granville St, Summerside, PE'}},
  'closed business':{details:{businessStatus:'CLOSED_TEMPORARILY'}},
  'mixed food service':{details:{types:['restaurant','bar']}},
  'split shifts':{periods:(p:any)=>[p,p]},
  'truncated boundary':{periods:(p:any)=>[{...p,open:{...p.open,truncated:true}}]},
  'missing close':{periods:(p:any)=>[{open:p.open}]},
  'wrong occurrence date':{periods:(p:any)=>[{...p,open:{...p.open,date:'2026-01-01'}}]},
  'missing exact date':{periods:(p:any)=>[{open:{...p.open,date:undefined},close:p.close}]},
})) test(`resolver holds ${label} through same-day final fallback`,async t=>{
  const {event,date}=install(t,changes);
  const [result]=await resolveTimesWithOperatingHours([event],'A&W','',`${date}T12:00:00Z`);
  assert.equal(result.startTime,'');assert.equal(result._sourceTimeConstraint?.reason,'offer_service_hours_unverified');
  assert.equal(enforceDateTimeCompleteness([result],`${date}T12:00:00Z`,'America/Halifax','').length,0);
});
test('untimed restricted offer is held instead of falling through legacy venue-hour inference',async t=>{
  const {event,date,mock}=install(t);
  const [result]=await resolveTimesWithOperatingHours([{...event,description:`Halloween lunch only ${date}`}],'A&W','',`${date}T12:00:00Z`);
  assert.equal(mock.mock.callCount(),0); assert.equal(result.startTime,'');
  assert.equal(enforceDateTimeCompleteness([result],`${date}T12:00:00Z`,'America/Halifax','').length,0);
});
test('hours lookup failure retains the hold through same-day completion',async t=>{
  const {event,date}=install(t);
  t.mock.method(firestore,'findVenueExactNameCandidates',async()=>{throw Error('Fixture lookup unavailable');});
  const [result]=await resolveTimesWithOperatingHours([event],'A&W','',`${date}T12:00:00Z`);
  assert.equal(result._sourceTimeConstraint?.reason,'offer_service_hours_unverified');
  assert.equal(enforceDateTimeCompleteness([result],`${date}T12:00:00Z`,'America/Halifax','').length,0);
});
test('verified midnight close survives final completeness, while detached timing is held',()=>{
  const midnight=infer({}, {hours:{open:'06:00',close:'00:00'}})!;
  const final=enforceDateTimeCompleteness([midnight],'2026-10-27T12:00:00Z','America/Halifax','');
  assert.equal(final.length,1); assert.ok(coherentOfferAvailability(final[0]));
  assert.equal(enforceDateTimeCompleteness([{...infer()!,endTime:'23:00'}],'2026-10-27T12:00:00Z','America/Halifax','').length,0);
});
test('duplicate merge never partially replaces an existing printed clock with inferred availability',()=>{
  const incoming:any={...infer()!,venueId:'aw',name:base.name,eventName:base.name,id:'post',uniqueId:'1939264440811908'};
  const existing:any={...incoming,id:'existing',startTime:'14:00',endTime:'15:00',timing:null,
    timeResolution:{hoursUsed:false},timeFlags:{start:{source:'explicit',evidence:'14:00'},end:{source:'explicit',evidence:'15:00'}}};
  const result=previewDuplicateMerge({existingEvent:existing,incomingEvent:incoming,venue:{id:'aw',name:'A&W'} as any});
  assert.equal(result.timeImproved,false);assert.deepEqual(result.changedFields,[]);
});
test('real write preview keeps both estimated endpoints and exact overnight date',async()=>{
  const venue:any={id:'aw',name:'A&W',googlePlaceId:'exact-aw',address:base.address,latitude:46.263614,longitude:-63.145675};
  const lookup=createFullParserVenueLookupCache(async()=>({isMatch:true,matchType:'exact',confidence:1,venue} as any),
    async()=>({isMatch:true,matchType:'exact',confidence:1,venue} as any));
  const item:any={...infer()!,venueId:'aw',venue:venue.name,additionalLocation:'',mediaUrls:[],ticketPrice:'',ticketLink:'',relevantImageIndex:-1};
  const row:any={uniqueId:'1939264440811908',text:base.description,userName:venue.name,pageName:venue.name,
    address:venue.address,mediaUrls:[],timestamp:'2026-10-27T12:00:00Z',facebookUrl:'https://www.facebook.com/fixture'};
  const payload:any=await previewFullParserEventWritePayload(item,row,61,0,venue,venue.name,lookup);
  assert.deepEqual(payload.timing,item.timing); assert.deepEqual(payload.timeResolution,item.timeResolution);
  assert.equal(payload.endDate,'2026-11-01'); assert.equal(payload.endTime,'02:00');assert.equal(payload.venueId,'aw');
  await assert.rejects(previewFullParserEventWritePayload(item,row,61,0,{...venue,id:'other-branch'},venue.name,
    createFullParserVenueLookupCache(async()=>({isMatch:true,matchType:'exact',confidence:1,venue:{...venue,id:'other-branch'}} as any),
      async()=>({isMatch:true,matchType:'exact',confidence:1,venue:{...venue,id:'other-branch'}} as any))), /service-hour venue identity mismatch/);
});
test('actual website enrichment cannot lend a Halloween party start to the distinct drink offer',async t=>{
  const url='https://offer-fixture.example/events/halloween-party';
  t.mock.method(globalThis,'fetch',async()=>new Response(`<html><body><a href="${url}">Halloween Party details</a><h1>Saints &amp; Sinners Halloween Party</h1><p>October 31, 2026 at 10:00 pm.</p>
    <script type="application/ld+json">${JSON.stringify({'@type':'Event',name:'Saints & Sinners Halloween Party',
    startDate:'2026-10-31T22:00:00-03:00',url})}</script></body></html>`,{headers:{'content-type':'text/html'}}));
  const item:any={name:'Halloween drinks & treat bags',description:'Available Saturday.',date:'2026-10-31',
    startTime:'',endTime:'',recurringPattern:'none',_sourceType:'special',venue:'',extractionReason:'Original caption'};
  const result=await enrichEventsFromVenueWebsite([item],`Details at ${url}`,'','2026-10-27T12:00:00Z',
    {name:'PonyBoat',website:url} as any,DEFAULT_PARSING_CONFIG);
  assert.ok(result.summary.candidateItemsFound>0); assert.equal(result.items[0].startTime,'');
  assert.equal(result.summary.appliedCount,0);
});
