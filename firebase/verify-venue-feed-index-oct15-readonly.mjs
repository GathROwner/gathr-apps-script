// Exercise public queries and compare complete venue feeds with the global feed.
// No database writes, API mutations, model calls or credentials.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const phase=process.argv[2];assert(['before','after'].includes(phase));
const out=path.join(import.meta.dirname,'artifacts/venue-feed-index-oct15');
const api='https://gathr-backend-924732524090.northamerica-northeast1.run.app/api/v2/firestore/events';
const venues=['ZDUj9euh7NVJ6INSlHM8','jluPLYoWDPhhkJ4NZitP','GHVmi7KY2DhZIQQbVc0p','slug_ccoagallery','slug_confedcentre'];
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function get(params){const u=new URL(api);for(const[k,v]of Object.entries(params))u.searchParams.set(k,String(v));const r=await fetch(u,{signal:AbortSignal.timeout(60000)});return{status:r.status,body:await r.json()};}
async function feed(params){const rows=[],cursors=new Set();let cursor='',pages=0;
 do{const r=await get({...params,...(cursor?{startAfter:cursor}:{})});assert.equal(r.status,200,JSON.stringify(r.body));assert(Array.isArray(r.body.events));rows.push(...r.body.events);cursor=r.body.nextPageToken||'';assert(++pages<100);if(cursor){assert(!cursors.has(cursor),'Repeated cursor');cursors.add(cursor);}}while(cursor);
 assert.equal(new Set(rows.map(e=>e.id)).size,rows.length,'Duplicate event across pages');return{rows,pages};
}
await fs.mkdir(out,{recursive:true});
if(phase==='before'){
 const fail=await get({venueId:venues[0],includeExpired:false,limit:10});assert.equal(fail.status,500);assert.match(fail.body.details,/FAILED_PRECONDITION.*requires an index/);
 const global=await feed({includeExpired:false,limit:100});const capable=await feed({includeExpired:false,dateOnlyActivities:'v1',limit:100});
 const record={capturedAt:new Date().toISOString(),failingRequest:fail,global,capable,liveWrites:0};await fs.writeFile(path.join(out,'api-before.json'),JSON.stringify(record,null,2));console.log(JSON.stringify({phase,venueStatus:fail.status,globalEvents:global.rows.length,capableEvents:capable.rows.length,liveWrites:0}));
}else{
 const before=JSON.parse(await fs.readFile(path.join(out,'api-before.json'),'utf8'));
 const [global,capable,history]=await Promise.all([feed({includeExpired:false,limit:100}),feed({includeExpired:false,dateOnlyActivities:'v1',limit:100}),feed({includeExpired:true,dateOnlyActivities:'v1',limit:100})]);
 assert.equal(hash(global.rows),hash(before.global.rows),'Default global feed changed');assert.equal(hash(capable.rows),hash(before.capable.rows),'Capable global feed changed');
 const results=[];
 for(const venueId of venues){for(const[mode,reference,params]of [['default',global,{includeExpired:false}],['capable',capable,{includeExpired:false,dateOnlyActivities:'v1'}],['history',history,{includeExpired:true,dateOnlyActivities:'v1'}]]){
  const filtered=await feed({...params,venueId,limit:2});assert(filtered.rows.every(e=>e.venueId===venueId),'Cross-venue leak');
  const expected=reference.rows.filter(e=>e.venueId===venueId).sort((a,b)=>a.id.localeCompare(b.id));const actual=[...filtered.rows].sort((a,b)=>a.id.localeCompare(b.id));assert.deepEqual(actual,expected,'Filtered/global mismatch '+venueId+' '+mode);
  results.push({venueId,mode,status:200,events:actual.length,pages:filtered.pages,exactGlobalSubset:true});
 }}
 const window=await get({venueId:'GHVmi7KY2DhZIQQbVc0p',startDate:'2026-12-04',endDate:'2026-12-06',includeExpired:false,limit:100});assert.equal(window.status,200);assert(window.body.events.every(e=>e.venueId==='GHVmi7KY2DhZIQQbVc0p'&&e.startDate>='2026-12-04'&&e.startDate<='2026-12-06'));
 const missing=await get({venueId:'nonexistent_venue_index_probe',includeExpired:false,limit:2});assert.equal(missing.status,200);assert.equal(missing.body.events.length,0);
 const version=await fetch(api+'/version').then(r=>r.json());assert.equal(version.version,267);
 const report={verifiedAt:new Date().toISOString(),globalDefaultUnchanged:true,globalCapableUnchanged:true,globalDefault:{events:global.rows.length,pages:global.pages},globalCapable:{events:capable.rows.length,pages:capable.pages},history:{events:history.rows.length,pages:history.pages},venueCases:results,dateWindowStatus:window.status,emptyVenueStatus:missing.status,feedVersion:version.version,liveWrites:0};
 await fs.writeFile(path.join(out,'api-after.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
