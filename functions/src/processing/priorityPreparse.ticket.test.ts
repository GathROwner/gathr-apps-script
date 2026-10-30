import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from '../services/fixtures/priorityPreparse.json';
import {isRejectedReviewedTicketBinding as rejected,withoutRejectedReviewedTicketLinks} from '../parsing/reviewedTicketBinding.js';
import {previewDuplicateMerge,previewFullParserEventWritePayload,createFullParserVenueLookupCache} from './rowProcessor.js';
import {enrichEventsFromTicketLinks} from '../parsing/ticketLinkEnricher.js';
import {enrichEventsFromVenueWebsite} from '../parsing/websiteDetailEnricher.js';
import {DEFAULT_PARSING_CONFIG, ExtractedItem} from '../parsing/types.js';
import type {EventData} from '../types/index.js';
import * as admin from 'firebase-admin';
import {createEvent} from '../services/firestoreService.js';

const event = fixture.ticket.event as EventData;
const bad = fixture.ticket.rejectedUrl;
const good = 'https://tickets.example/pei-brewing-oct30';
const venue:any = {id:event.venueId,name:'PEI Brewing Company',normalizedName:'pei brewing company',
  address:'96 Kensington Rd, Charlottetown, PE C1A 5J4, Canada',latitude:46.2525504,longitude:-63.1150114};
const item = (overrides:Partial<ExtractedItem> = {}):ExtractedItem => ({name:event.name!,date:event.startDate,startTime:'',endTime:'',
  venue:venue.name,description:'',recurringPattern:'none',_sourceType:'calendar',...overrides} as ExtractedItem);

test('only the reviewed source/date/venue/programme and exact wrong-stop page are rejected', () => {
  for (const url of [bad,bad+'/?ref=post#tickets',bad.replace('%2C',','),bad.replace('https://www.','http://')]) assert(rejected(event,url));
  for (const patch of [{uniqueId:'2222222222222222_leaf'}, {startDate:'2026-10-24'}, {venueId:'souris_show_hall'},
    {name:'Another concert',eventName:'Another concert'}]) assert.equal(rejected({...event,...patch},bad),false);
  for (const url of [good,bad.replace('two-pianos','another-show'),bad.replace('sourisshowhall.com','sourisshowhall.com.evil.example'),'',undefined]) {
    assert.equal(rejected(event,url),false);
  }
  assert.equal(rejected({...event,venueId:'souris_show_hall',establishment:venue.name},bad),false);
});

test('URL stripping retains valid links, artwork and clocks without mutating its input', () => {
  const original = {...event,ticketLink:bad,ticketsBuyUrl:good,image:'retained-artwork'};
  const result = withoutRejectedReviewedTicketLinks(original);
  assert.equal(result.ticketLink,undefined);assert.equal(result.ticketsBuyUrl,good);
  assert.equal(result.image,original.image);assert.equal(result.startTime,original.startTime);
  assert.equal(original.ticketLink,bad);
});

test('actual duplicate merge cannot refill cleared fields or improve a homepage with the rejected binding', () => {
  for (const old of ['',null,'https://www.sourisshowhall.com/']) {
    const existing = {...event,ticketLink:old,ticketsBuyUrl:old} as EventData;
    for (const patch of [{},{uniqueId:'2222222222222222_crosspost'}]) {
      const incoming = {...event,...patch,ticketLink:bad,ticketsBuyUrl:bad,organizedBy:'Valid organizer enrichment'};
      const result = previewDuplicateMerge({existingEvent:existing,incomingEvent:incoming,venue});
      assert.equal(result.updates.ticketLink,undefined);assert.equal(result.updates.ticketsBuyUrl,undefined);
      assert.equal(result.updates.organizedBy,incoming.organizedBy);
    }
  }
  const valid = previewDuplicateMerge({existingEvent:{...event,ticketLink:'',ticketsBuyUrl:''},
    incomingEvent:{...event,ticketLink:good,ticketsBuyUrl:good},venue});
  assert.equal(valid.updates.ticketLink,good);assert.equal(valid.updates.ticketsBuyUrl,good);
});

test('actual construction rejects model and row ticket fallbacks before new-event/duplicate selection', async () => {
  const row:any = {uniqueId:fixture.ticket.source,text:fixture.ticket.caption,mediaUrls:[],userName:'Souris Show Hall',pageName:'sourisshowhall',
    timestamp:'2026-10-10T01:38:56Z',facebookUrl:'https://www.facebook.com/sourisshowhall/',ticketsBuyUrl:bad};
  const incoming:any = {...event,venue:venue.name,establishment:venue.name,address:venue.address,
    ticketLink:bad,ticketsBuyUrl:bad,ticketPrice:'',image:'retained-artwork',imageUrl:'retained-artwork',mediaUrls:[]};
  const lookup = createFullParserVenueLookupCache(async()=>({isMatch:true,matchType:'exact',confidence:1,venue} as any),
    async()=>({isMatch:true,matchType:'exact',confidence:1,venue} as any));
  const payload = await previewFullParserEventWritePayload(incoming,row,1,0,venue,venue.name,lookup);
  assert.equal(payload.ticketLink,undefined);assert.equal(payload.ticketsBuyUrl,undefined);
  assert.equal(payload.startDate,event.startDate);assert.equal(payload.startTime,event.startTime);
  const valid = await previewFullParserEventWritePayload({...incoming,ticketLink:good,ticketsBuyUrl:good},row,1,0,venue,venue.name,lookup);
  assert.equal(valid.ticketLink,good);assert.equal(valid.ticketsBuyUrl,good);
});

test('new-event write boundary removes the rejected links and preserves a valid link', async t => {
  const captured:any[]=[];
  t.mock.method(admin.firestore(),'collection',(name:string) => {
    assert.equal(name,'venues');
    return {doc:(id:string) => {
      assert.equal(id,venue.id);
      return {collection:(child:string) => {
        assert.equal(child,'events');
        return {add:async (payload:any) => {captured.push(payload);return {id:'offline-only'};}};
      }};
    }} as any;
  });
  await createEvent(venue.id,{...event,ticketLink:bad,ticketsBuyUrl:bad});
  assert.equal(captured[0].ticketLink,undefined);assert.equal(captured[0].ticketsBuyUrl,undefined);
  await createEvent(venue.id,{...event,ticketLink:good,ticketsBuyUrl:good});
  assert.equal(captured[1].ticketLink,good);assert.equal(captured[1].ticketsBuyUrl,good);
});

test('ticket-page enrichment leaves the PEI leaf unchanged and still enriches the Souris sibling', async t => {
  let fetches=0;
  t.mock.method(globalThis,'fetch',async (input:any) => {
    assert.equal(String(input),bad);fetches++;
    return new Response('<script type="application/ld+json">'+JSON.stringify({'@type':'Event',name:event.name,
      startDate:'2026-10-24T19:30:00-03:00',image:'https://images.example/souris.webp',location:{name:'Souris Show Hall'}})+'</script>',
      {headers:{'content-type':'text/html'}});
  });
  const pei=item(),souris=item({date:'2026-10-24',venue:'Souris Show Hall'});
  const result=await enrichEventsFromTicketLinks([pei,souris],bad,undefined,[],'2026-10-10T01:38:56Z',
    {...DEFAULT_PARSING_CONFIG,ticketLinkEnrichment:{enabled:true,allowedDomains:['sourisshowhall.com']}},fixture.ticket.source);
  assert.equal(fetches,1);assert.deepEqual(result.items[0],pei);
  assert.equal(result.items[1].startTime,'19:30');assert.equal((result.items[1] as any)._ticketImageUrl,'https://images.example/souris.webp');
});

test('ticket bootstrap rejects the reviewed wrong binding and preserves a grounded Souris stop', async t => {
  t.mock.method(globalThis,'fetch',async (input:any) => {
    const pei=String(input).endsWith('?bootstrap=pei');
    return new Response('<script type="application/ld+json">'+JSON.stringify({'@type':'Event',name:event.name,
      startDate:pei?'2026-10-30T19:30:00-03:00':'2026-10-24T19:30:00-03:00',
      location:{name:pei?venue.name:'Souris Show Hall'}})+'</script>',{headers:{'content-type':'text/html'}});
  });
  const config={...DEFAULT_PARSING_CONFIG,ticketLinkEnrichment:{enabled:true,allowedDomains:['sourisshowhall.com']}};
  const blocked=await enrichEventsFromTicketLinks([],bad+'?bootstrap=pei',undefined,[],'2026-10-10T01:38:56Z',config,fixture.ticket.source);
  assert.deepEqual(blocked.items,[]);assert.equal(blocked.summary.reason,'reviewed_ticket_binding_rejected');
  const allowed=await enrichEventsFromTicketLinks([],bad+'?bootstrap=souris',undefined,[],'2026-10-10T01:38:56Z',config,fixture.ticket.source);
  assert.equal(allowed.items.length,1);assert.equal(allowed.items[0].venue,'Souris Show Hall');assert.equal(allowed.items[0].date,'2026-10-24');
});

test('website enrichment rejects the wrong page before clock/link/media use while retaining the other stop', async t => {
  const home='https://www.sourisshowhall.com/';
  t.mock.method(globalThis,'fetch',async (input:any) => {
    const url=String(input);
    if(url===home)return new Response(`<a href="${bad}">Two Pianos No Rodeo show details</a>`,{headers:{'content-type':'text/html'}});
    assert.equal(url,bad);
    // Adverse retained mechanism: a page with no unambiguous date can otherwise
    // bind the same title to both tour stops. Do not invent a webpage date.
    return new Response(`<h1>${event.name}</h1><meta property="og:image" content="https://images.example/souris.webp"><p>Show at 7:30 PM.</p>`,
      {headers:{'content-type':'text/html'}});
  });
  const pei=item(),souris=item({date:'2026-10-24',venue:'Souris Show Hall'});
  const result=await enrichEventsFromVenueWebsite([pei,souris],`More info and tickets available at ${home}`,undefined,'2026-10-10T01:38:56Z',
    {name:'Souris Show Hall',website:home},DEFAULT_PARSING_CONFIG,fixture.ticket.source);
  assert.deepEqual(result.items[0],pei);
  assert.equal(result.items[1].ticketLink,bad);assert.equal(result.items[1].startTime,'19:30');
});
