import test from 'node:test';
import assert from 'node:assert/strict';
import {enrichEventsFromVenueWebsite} from './websiteDetailEnricher.js';
import {reconcileSourceItemEvidence} from './sourceItemEvidence.js';
import {DEFAULT_PARSING_CONFIG} from './types.js';

async function playback(suffix:string, changes:Record<string,unknown>={}, itemChanges:Record<string,unknown>={}) {
  const site=`https://ticket-role-${suffix}.example/`;
  const ticket=`https://locarius.io/events/9876/fixture-performer-november-19-doors-630-pm`;
  const record:any={name:'Fixture Performer - November 19th - Doors 6:30 PM',url:ticket,
    start:{timezone:'America/Halifax',utc:'2026-11-20T00:00:24.039Z',local:'Thursday, November 19, 2026 at 08:00 PM'},...changes};
  const original=globalThis.fetch;
  try {
    globalThis.fetch=(async (input:any)=>{
      const url=String(input);
      if(url===site)return new Response('<script src="/static/js/main.js"></script>',{headers:{'content-type':'text/html'}});
      if(url===site+'static/js/main.js')return new Response('const api=axios.create({baseURL:"/api"});api.get("/events/locarius")',{headers:{'content-type':'application/javascript'}});
      if(url===site+'api/events/locarius')return new Response(JSON.stringify({body:{result:[record]}}),{headers:{'content-type':'application/json'}});
      throw Error('Unexpected offline fixture fetch');
    }) as any;
    const item:any={name:'Fixture Performer',date:'2026-11-19',startTime:'',endTime:'',description:'',venue:'Fixture Hall',_sourceType:'event',recurringPattern:'none',...itemChanges};
    const r=await enrichEventsFromVenueWebsite([item],`Tickets and more show info at ${site}`,'','2026-10-15T12:00:00Z',{name:'Fixture Hall',website:site},DEFAULT_PARSING_CONFIG);
    return reconcileSourceItemEvidence(r.items,'Fixture Performer live November 19th. Tickets on the venue website.')[0];
  } finally {globalThis.fetch=original;}
}

test('separate agreeing API/local event start survives a doors-named ticket URL after source reconciliation',async()=>{
  const item=await playback('separate');assert.equal(item.startTime,'20:00');assert.equal(item.endTime,'');
  assert.equal(item._sourceTimeConstraint,undefined);assert.match(item.timeFlags!.start.evidence,/performance start.*20:00.*separate doors 18:30/);
});
test('fresh agreeing proof clears a previous doors hold but preserves other source holds',async()=>{
  const resolved=await playback('previous',{}, {_sourceTimeConstraint:{reason:'doors_without_showtime',evidence:'previous doors-only URL'}});
  assert.equal(resolved.startTime,'20:00');assert.equal(resolved._sourceTimeConstraint,undefined);
  const held=await playback('unrelated',{}, {_sourceTimeConstraint:{reason:'unresolved_meridiem',evidence:'independent source conflict'}});
  assert.equal(held._sourceTimeConstraint?.reason,'unresolved_meridiem');
});
test('API start equal to doors remains held',async()=>{
  const item=await playback('same',{start:{timezone:'America/Halifax',utc:'2026-11-19T22:30:00Z',local:'Thursday, November 19, 2026 at 06:30 PM'}});
  assert.equal(item.startTime,'');assert.equal(item._sourceTimeConstraint?.reason,'doors_without_showtime');
});
test('disagreeing local and instant clocks do not acquire performance proof',async()=>{
  const item=await playback('conflict',{start:{timezone:'America/Halifax',utc:'2026-11-20T00:00:00Z',local:'Thursday, November 19, 2026 at 07:00 PM'}});
  assert.equal(item.startTime,'');assert.equal(item._sourceTimeConstraint?.reason,'doors_without_showtime');
});
test('wrong date and performer cannot donate a performance start',async()=>{
  for(const [label,changes] of [['date',{start:{timezone:'America/Halifax',utc:'2026-11-21T00:00:00Z',local:'Friday, November 20, 2026 at 08:00 PM'}}],['identity',{name:'Unrelated Headliner - Doors 6:30 PM'}]] as const){
    const item=await playback(label,changes);assert.equal(item.startTime,'');assert.equal(item._sourceTimeConstraint,undefined);
  }
});
