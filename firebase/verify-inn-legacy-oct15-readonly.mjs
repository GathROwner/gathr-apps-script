// Independent exact-delta and complete app-feed verification. No writes.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
assert.equal(process.argv.length,3);const resultPath=path.resolve(process.argv[2]),result=JSON.parse(await fs.readFile(resultPath,'utf8')),before=JSON.parse(await fs.readFile(result.backupPath,'utf8'));assert.deepEqual(result.changes,before.changes);assert.equal(result.mediaWrites,0);
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');const key=JSON.parse(await fs.readFile(process.env.GATHR_SERVICE_ACCOUNT_PATH,'utf8'));assert.equal(key.project_id,'gathr-migrated');admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});const db=admin.firestore();
const plain=x=>JSON.parse(JSON.stringify(x)),wrap=d=>({path:d.ref.path,exists:d.exists,version:d.updateTime?{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}:null,data:d.exists?plain(d.data()):null});
const base='https://gathr-backend-924732524090.northamerica-northeast1.run.app/api/v2/firestore/events',venuePath='venues/fb_100063617721610',feedPath='runtime_metadata/event_feed',tourIds=['5vX5hheEeQZvGWW2MktD','BI5tR0hAivbQzolfh1La'],deletedId='Xl1BWOTyBytkqqD9tQsL';
const get=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(60000)});assert.equal(r.status,200,url);return r.json();};
const represents=(e,id)=>e.id===id||e.originalEventId===id||e.parentEventId===id||String(e.id||'').startsWith(id+'_')||String(e.id||'').startsWith(id+'::');
async function feed(capable,history){const events=[],seen=new Set();let cursor='',pages=0;do{const u=new URL(base);u.searchParams.set('limit','100');u.searchParams.set('includeExpired',String(history));if(capable)u.searchParams.set('dateOnlyActivities','v1');if(cursor)u.searchParams.set('startAfter',cursor);const p=await get(u);assert(Array.isArray(p.events));events.push(...p.events);cursor=p.nextPageToken||'';assert(++pages<100);if(cursor){assert(!seen.has(cursor));seen.add(cursor);}}while(cursor);return{events,pages};}
try{
 const originals=[...new Map([...before.documents,...before.related].map(d=>[d.path,d])).values()],docs=await db.getAll(...originals.map(d=>db.doc(d.path)));let unchanged=0;
 for(let i=0;i<docs.length;i++){const d=docs[i],old=originals[i],change=result.changes.find(c=>c.path===old.path);
  if(change?.kind==='delete'){assert(!d.exists);continue;}
  if(change||old.path===feedPath){assert(d.exists);const want=change?.kind==='create'?{...change.payload}:change?{...old.data,...change.patch}:{...old.data,version:268};const actual=plain(d.data());delete actual.updatedAt;delete want.updatedAt;if(change?.kind==='create')delete actual.createdAt;assert.deepEqual(actual,want,'Exact delta '+old.path);}else{assert.deepEqual(wrap(d),old,'Untouched reference '+old.path);unchanged++;}
 }
 const all=await db.collectionGroup('events').get();assert.equal(all.docs.filter(d=>d.ref.path.startsWith(venuePath+'/events/')).length,14);assert(!all.docs.some(d=>d.id===deletedId||d.get('originalEventId')===deletedId||d.get('parentEventId')===deletedId));
 const harvest=before.related.filter(d=>before.unchangedHarvestEvents.includes(d.path));assert.equal(harvest.length,12);
 for(const old of harvest){const e=(await get(base+'/'+old.path.split('/').at(-1)+'?dateOnlyActivities=v1')).event;assert.equal(e.title,old.data.eventName);for(const field of ['startDate','endDate','startTime','endTime'])assert.equal(e[field],old.data[field]);assert.equal(e.imageUrl,old.data.imageUrl||old.data.image);}
 for(const id of tourIds){const e=(await get(base+'/'+id+'?dateOnlyActivities=v1')).event;assert.equal(e.startTime,'16:00');assert.equal(e.endTime||'','');}
 assert.equal((await fetch(base+'/'+deletedId,{signal:AbortSignal.timeout(60000)})).status,404);
 const [legacy,active,history]=await Promise.all([feed(false,false),feed(true,false),feed(true,true)]);
 for(const f of [legacy,active])for(const id of [...tourIds,deletedId])assert(!f.events.some(e=>represents(e,id)),'Retired occurrence remains active '+id);
 assert(!history.events.some(e=>represents(e,deletedId)),'Removed foraging remains in history');
 const media=[...new Set(before.related.flatMap(d=>[...(d.data.mediaUrls||[]),d.data.imageUrl,d.data.image,d.data.relevantImageUrl,d.data.icon]).filter(Boolean))];
 await Promise.all(media.map(async url=>assert.equal((await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(20000)})).status,200,url)));
 let marker;for(let n=0;n<3;n++){marker=await get(base+'/version');if(marker.version===268)break;if(n<2)await new Promise(resolve=>setTimeout(resolve,15000));}assert.equal(marker.version,268);
 const report={verifiedAt:new Date().toISOString(),resultPath,exactDelta:true,tourUpdates:2,falseTimeDeleted:1,privateHoldCreated:true,venuePolicyUpdated:true,unchangedReferences:unchanged,harvestEventsUnchanged:12,tourDetails200:2,deletedDetail404:true,retiredActiveCopies:0,retainedMedia200:media.length,feedVersion:268,feeds:{default:{events:legacy.events.length,pages:legacy.pages},capable:{events:active.events.length,pages:active.pages},history:{events:history.events.length,pages:history.pages,historicalTourCopies:tourIds.map(id=>history.events.filter(e=>represents(e,id)).length)}},liveWrites:0};
 await fs.writeFile(path.join(path.dirname(resultPath),'independent-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await admin.app().delete();}
