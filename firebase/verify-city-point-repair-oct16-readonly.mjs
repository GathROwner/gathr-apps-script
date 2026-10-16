import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
const after=process.argv.includes('--after');assert(process.argv.slice(2).every(x=>x==='--after'));
const root=path.resolve(import.meta.dirname,'..'),out=path.join(import.meta.dirname,'artifacts/city-point-repair-oct16');
const plan=JSON.parse(await fs.readFile(path.join(out,'repair-plan-2026-10-16T17-16-31-069Z.json'),'utf8'));
const capture=JSON.parse(await fs.readFile(plan.backupPath,'utf8'));
const before=new Map(capture.documents.map(d=>[d.path,d.data]));
const deletions=plan.actions.filter(a=>a.action==='delete'),keepers=plan.actions.filter(a=>a.action==='update'&&a.path.includes('/events/')||a.action==='update'&&a.path.startsWith('events/'));
const untouched=capture.relatedInventory.filter(d=>d.path.startsWith('venues/DqhaDw4xcuBFIm6WCQSq/events/')&&String(d.data.uniqueId).startsWith('1528035509358029_')&&!plan.actions.some(a=>a.path===d.path));
assert.equal(deletions.length,12);assert.equal(keepers.length,11);assert.equal(untouched.length,2);
const base='https://gathr-backend-924732524090.northamerica-northeast1.run.app/api/v2/firestore/events';
const read=async id=>{const r=await fetch(base+'/'+id+'?dateOnlyActivities=v1',{signal:AbortSignal.timeout(30000),headers:{'Cache-Control':'no-cache'}});return{id,status:r.status,body:r.status===200?await r.json():null};};
const results=[];
for(const list of [deletions,keepers,untouched])for(let i=0;i<list.length;i+=5)results.push(...await Promise.all(list.slice(i,i+5).map(a=>read(a.path.split('/').at(-1)))));
for(const a of deletions){const d=results.find(r=>r.id===a.path.split('/').at(-1));assert.equal(d.status,after?404:200,'Deleted candidate detail: '+a.path);}
for(const a of [...keepers,...untouched]){const r=results.find(r=>r.id===a.path.split('/').at(-1));assert.equal(r.status,200);const d=r.body.event||r.body,source=before.get(a.path)||a.data;assert.equal(d.venueId,source.venueId);assert.equal(d.startDate,source.startDate);assert.equal(d.startTime,source.startTime);assert.equal(d.endTime,source.endTime);
 if(after){assert.equal(d.locationScope||d.metadata?.locationScope,'venue');const flags=d.timeFlags||d.metadata?.timeFlags;assert.equal(flags.start.source,'explicit');assert.equal(flags.end.source,'explicit');assert(!/Observed broad location|Review reasons:/i.test(d.description||''));if(a.path==='events/location_4a31a72846d2aabe0ca31f21')assert(/Doors open at 6:30 p\.m\./.test(d.metadata?.fullDescription||d.fullDescription||d.description));}
}
const pages=[],seen=new Set();let token='';do{const url=new URL(base);url.searchParams.set('includeExpired','false');url.searchParams.set('limit','100');url.searchParams.set('dateOnlyActivities','v1');if(token)url.searchParams.set('startAfter',token);const r=await fetch(url,{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);const page=await r.json();assert(Array.isArray(page.events));pages.push(page.events);token=page.nextPageToken||'';assert(pages.length<100);if(token){assert(!seen.has(token));seen.add(token);}}while(token);
const feed=pages.flat();if(after){for(const a of deletions){const id=a.path.split('/').at(-1);assert(!feed.some(d=>d.id===id||String(d.id).startsWith(id+'_')),'Retired root/instance in feed');}
 for(const a of [...keepers,...untouched]){const id=a.path.split('/').at(-1),d=before.get(a.path)||a.data;const detail=results.find(r=>r.id===id).body.event||results.find(r=>r.id===id).body;const isExpired=detail.isExpired===true||detail.metadata?.isExpired===true;
  const entries=feed.filter(d=>d.id===id);assert(entries.length<=1,'Duplicate keeper in feed');if(!isExpired)assert.equal(entries.length,1,'Active keeper missing: '+a.path);}
}
const media=[];for(const pin of plan.mediaPins){const r=await fetch(pin.url,{signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);media.push({url:pin.url,status:r.status});}
const file=path.join(out,(after?'after':'before')+'-api-verified.json');await fs.writeFile(file,JSON.stringify({checkedAt:new Date().toISOString(),mode:after?'after':'before',results,feedPages:pages.length,feedCount:feed.length,media,liveWrites:0},null,2));console.log(JSON.stringify({file,mode:after?'after':'before',detailChecks:results.length,feedPages:pages.length,feedCount:feed.length,mediaChecks:media.length,liveWrites:0}));
