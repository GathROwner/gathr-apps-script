import test from 'node:test';
import assert from 'node:assert/strict';
import tickets from './__fixtures__/oct13-ticket-events.json';
import {parseLinkedPerformanceStart,enrichLinkedPerformanceStarts} from './linkedPerformanceTime.js';
const html=(e:any)=>`<script type="application/ld+json">${JSON.stringify(e)}</script>`;
const item=(i:number):any=>({name:i?'Jake Vaadeland and the Sturgeon River Boys':'Life in the Fast Lane: A Night of the Eagles',date:i?'2026-11-04':'2026-10-29',startTime:'',endTime:'',ticketLink:tickets[i].url,_sourceTimeConstraint:{reason:'doors_without_showtime',evidence:'doors-630-pm'}});
test('actual linked timestamps use event-date DST offset, not current offset or title doors time',()=>{
 for(const i of [0,1]){const x=parseLinkedPerformanceStart(html(tickets[i].event),tickets[i].url,item(i),'America/Halifax');assert(x);assert.equal(x.startTime,'20:00');assert.equal(x._sourceTimeConstraint,undefined);assert.match(x.timeFlags!.start.evidence,/Linked performance timestamp/);}
});
test('different source URL, film identity, date, cancelled status and duplicate linked objects cannot supply a clock',()=>{
 const t=tickets[0],e=t.event;
 for(const candidate of [{...e,offers:{...e.offers,url:'https://locarius.io/events/999/other'}},{...e,name:'Other Band Live Concert'}, {...e,eventStatus:'https://schema.org/EventCancelled'}, {...e,startDate:'2026-10-30T23:00:00Z'}, {...e,startDate:'October 29, 8pm'}])assert.equal(parseLinkedPerformanceStart(html(candidate),t.url,item(0),'America/Halifax'),undefined);
 assert.equal(parseLinkedPerformanceStart(html([e,e]),t.url,item(0),'America/Halifax'),undefined);
});
test('bounded fetch touches only the exact caption-linked allowlisted pages and retains failed holds',async()=>{
 const original=globalThis.fetch,urls:string[]=[];
 try{globalThis.fetch=(async(url:any,init:any)=>{urls.push(String(url));assert.equal(init.redirect,'error');return new Response(html(tickets[0].event),{headers:{'content-type':'text/html'}});}) as any;
 const output=await enrichLinkedPerformanceStarts([item(0)],tickets[0].url,'America/Halifax');assert.equal(output[0].startTime,'20:00');assert.equal(urls.length,1);
 await enrichLinkedPerformanceStarts([item(0)],'No linked page','America/Halifax');assert.equal(urls.length,1);
 await enrichLinkedPerformanceStarts([{...item(0),ticketLink:'https://evil.example/events/1'}],'https://evil.example/events/1','America/Halifax');assert.equal(urls.length,1);
 globalThis.fetch=(async()=>{throw Error('network unavailable')}) as any;
 assert.deepEqual(await enrichLinkedPerformanceStarts([item(0)],tickets[0].url,'America/Halifax'),[item(0)]);
 }finally{globalThis.fetch=original;}
});
