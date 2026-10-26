import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLinkedPerformanceStart,enrichLinkedPerformanceStarts,linkedPerformanceImagesTextFree} from './linkedPerformanceTime.js';
import {constrainSourceTimes} from './sourceTimeConstraints.js';
import {enrichEventsFromTicketLinks} from './ticketLinkEnricher.js';
import {DEFAULT_PARSING_CONFIG} from './types.js';

const url='https://locarius.io/events/1234/ed-vale-october-28th-25-doors-630-pm';
const caption=`Ed Vale live at the Sample Hall in Charlottetown October 28th!!!\nTickets and show info.\n${url}`;
const source={caption,venueName:'Sample Hall',imagesTextFree:true};
const item:any={name:'Ed Vale live at the Sample Hall',description:'The event URL identifies the year as 2025 and lists doors at 6:30 pm.',
  extractionReason:'The URL includes the date marker 25.',date:'2025-10-28',startTime:'',endTime:'',venue:'',price:'',ticketLink:url,
  recurringPattern:'none',relevantImageIndex:0,_sourceType:'event',
  spatial:{kind:'single_location',locations:[{label:'Sample Hall in Charlottetown',certainty:'confirmed'}]},
  _sourceTimeConstraint:{reason:'doors_without_showtime',evidence:'doors-630-pm'},
  timeFlags:{start:{source:'none',evidence:'Only doors given'},end:{source:'none',toClose:false,evidence:''}}};
const event={ '@type':'Event',eventStatus:'https://schema.org/EventScheduled',name:'Ed Vale - October 28th - $25 - Doors 6:30 PM',
  startDate:'2026-10-28T23:00:00Z',endDate:'2026-10-29T01:00:00Z',location:{name:'Sample Hall'},offers:{url,price:32.15},image:'https://example.invalid/replacement.jpg'};
const html=(e:any)=>`<script type="application/ld+json">${JSON.stringify(e)}</script>`;

test('source-linked scheduled occurrence corrects only the unsupported URL year, with short performer names',()=>{
 const x=parseLinkedPerformanceStart(html(event),url,item,'America/Halifax',source);assert(x);
 assert.equal(x.date,'2026-10-28');assert.equal(x.startTime,'20:00');assert.equal(x.endTime,'');
 assert.equal(x._sourceTimeConstraint,undefined);assert.equal(x.price,'');assert.equal(x.relevantImageIndex,0);
 assert.equal(x.timeFlags?.end?.source,'none');assert.match(x.description||'',/Doors open at 6:30 p\.m\./);
 assert(!/2025/.test(x.description||''));assert.equal((x as any)._ticketImageUrl,undefined);
});
test('real old years, missing source proof and conflicting occurrence/venue/title remain held',()=>{
 for(const context of [undefined,{...source,caption:caption+' October 28, 2025'},{...source,imagesTextFree:false},{...source,venueName:'Other Hall'},{...source,caption:caption.replace('October 28th!!!','October 29th!!!')}])
  assert.equal(parseLinkedPerformanceStart(html(event),url,item,'America/Halifax',context),undefined);
 for(const e of [{...event,name:'Ed Other - October 28th'}, {...event,location:{name:'Other Hall'}},{...event,startDate:'2026-10-29T23:00:00Z'}, {...event,eventStatus:'https://schema.org/EventCancelled'}, {...event,offers:{url:url+'-other'}},[event,event]])
  assert.equal(parseLinkedPerformanceStart(html(e),url,item,'America/Halifax',source),undefined);
 assert.equal(parseLinkedPerformanceStart(html(event),url,{...item,extractionReason:'Poster prints 2025',description:'Printed year 2025'},'America/Halifax',source),undefined);
 assert.equal(parseLinkedPerformanceStart(html(event),url,{...item,spatial:{kind:'multi_location',locations:[]}},'America/Halifax',source),undefined);
});
test('text-free source evidence requires complete per-image accounting; printed and unknown images fail closed',()=>{
 const photo={imageIndex:0,description:'Portrait; no readable text is visible.',imageComplexity:{isPromotionalPhoto:true,textDensityScore:0,hasCalendarGrid:false,hasDenseText:false,hasMultipleEventListings:false}};
 assert(linkedPerformanceImagesTextFree(1,[photo]));assert(linkedPerformanceImagesTextFree(0,[]));
 for(const [count,analyses] of [[1,[]],[2,[photo]],[2,[photo,photo]],[1,[{...photo,imageComplexity:{...photo.imageComplexity,textDensityScore:1}}]],[1,[{...photo,description:'Poster says October 28, 2025'}]]] as const)
  assert.equal(linkedPerformanceImagesTextFree(count,analyses as any),false);
});
test('actual extraction → source-time constraints → linked ticket → general enrichment route works with production allowlist',async()=>{
 const original=globalThis.fetch,calls:string[]=[];
 try{
  globalThis.fetch=(async(input:any,init:any)=>{assert.equal(String(input),url);assert.equal(init.redirect,'error');calls.push(String(input));return new Response(html(event),{headers:{'content-type':'text/html'}});}) as any;
  const constrained=constrainSourceTimes([item],caption);
  const linked=await enrichLinkedPerformanceStarts(constrained,caption,'America/Halifax',source);
  const result=await enrichEventsFromTicketLinks(linked,caption,undefined,[],'2026-10-15T15:17:17Z',DEFAULT_PARSING_CONFIG);
  assert.equal(calls.length,1);assert.equal(result.summary.reason,'no_ticket_urls');
  assert.equal(result.items[0].date,'2026-10-28');assert.equal(result.items[0].startTime,'20:00');assert.equal(result.items[0].endTime,'');
  globalThis.fetch=(async()=>{throw Error('source unavailable');}) as any;
  assert.deepEqual(await enrichLinkedPerformanceStarts(constrained,caption,'America/Halifax',source),constrained);
 }finally{globalThis.fetch=original;}
});
