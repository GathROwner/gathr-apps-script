// Independent exact-delta, venue, source and complete app-feed checks. Read only.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {venuePath,sourceId,feedPath,keepers,retired,dates,eventPath,poster,website} from './harvest-oct15-spec.mjs';
assert.equal(process.argv.length,3);const resultPath=path.resolve(process.argv[2]),result=JSON.parse(await fs.readFile(resultPath,'utf8'));
const before=JSON.parse(await fs.readFile(result.backupPath,'utf8'));assert.deepEqual(result.changes,before.changes);assert.equal(result.creates,9);assert.equal(result.deletes,5);assert.equal(result.mediaWrites,0);
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
const key=JSON.parse(await fs.readFile(process.env.GATHR_SERVICE_ACCOUNT_PATH,'utf8'));assert.equal(key.project_id,'gathr-migrated');admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});const db=admin.firestore();
const plain=x=>JSON.parse(JSON.stringify(x)),wrap=d=>({path:d.ref.path,exists:d.exists,version:d.updateTime?{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}:null,data:d.exists?plain(d.data()):null});
const api='https://gathr-backend-924732524090.northamerica-northeast1.run.app/api/v2/firestore/events';
const get=async u=>{const r=await fetch(u,{signal:AbortSignal.timeout(60000)});assert.equal(r.status,200);return r.json();};
const deleted=retired.map(([id])=>id),canonical=result.changes.filter(c=>c.kind==='create'||keepers.some(id=>c.path===eventPath(id)));
const represents=(e,id)=>e.id===id||e.originalEventId===id||e.parentEventId===id||String(e.id||'').startsWith(id+'_')||String(e.id||'').startsWith(id+'::');
function check(e,c){const p=c.payload||c.patch;assert.equal(e.id,c.path.split('/').at(-1));assert.equal(e.venueId,venuePath.split('/')[1]);assert.equal(e.title,p.eventName);assert.equal(e.startDate,p.startDate);assert.equal(e.endDate,p.endDate);assert.equal(e.startTime,'17:00');assert.equal(e.endTime,'21:30');assert.equal(e.imageUrl,poster);assert.equal(e.price,'$305 plus tax per person');assert.equal(e.isRecurring,false);assert.equal(e.metadata.ticketsBuyUrl||e.metadata.ticketLink,website);}
async function feed(includeExpired){const events=[],seen=new Set();let cursor='',pages=0;do{const u=new URL(api);u.searchParams.set('includeExpired',String(includeExpired));u.searchParams.set('dateOnlyActivities','v1');u.searchParams.set('limit','100');if(cursor)u.searchParams.set('startAfter',cursor);const p=await get(u);assert(Array.isArray(p.events));events.push(...p.events);cursor=p.nextPageToken||'';assert(++pages<100);if(cursor){assert(!seen.has(cursor));seen.add(cursor);}}while(cursor);return{events,pages};}
try{
 const [docs,all]=await Promise.all([db.getAll(...before.documents.map(d=>db.doc(d.path))),db.collectionGroup('events').get()]);let untouched=0;
 for(let i=0;i<docs.length;i++){const old=before.documents[i],d=docs[i],c=result.changes.find(c=>c.path===old.path);
  if(c?.kind==='delete'){assert(!d.exists,'Deleted parent remains '+old.path);continue;}
  if(c||old.path===feedPath){assert(d.exists);const expected=c?.kind==='create'?{...c.payload}:c?{...old.data,...c.patch}:{...old.data,version:266};const actual=plain(d.data());delete actual.updatedAt;delete expected.updatedAt;if(c?.kind==='create')delete actual.createdAt;assert.deepEqual(actual,expected,'Exact delta '+old.path);}
  else{assert.deepEqual(wrap(d),old,'Untouched reference '+old.path);untouched++;}
 }
 const venueEvents=all.docs.filter(d=>d.ref.path.startsWith(venuePath+'/events/'));assert.equal(venueEvents.length,15);assert.deepEqual(venueEvents.filter(d=>keepers.includes(d.id)||d.id.startsWith('harvest_20261015_')).map(d=>d.get('startDate')).sort(),dates);
 assert(!all.docs.some(d=>deleted.includes(d.id)||retired.some(r=>d.get('uniqueId')===r[1])));
 for(const c of canonical)check((await get(api+'/'+c.path.split('/').at(-1)+'?dateOnlyActivities=v1')).event,c);
 for(const id of deleted)assert.equal((await fetch(api+'/'+id,{signal:AbortSignal.timeout(60000)})).status,404);
 const active=await feed(false),history=await feed(true);
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Halifax',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
 const localNow=`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
 for(const f of [active,history]){
  assert(!f.events.some(e=>deleted.some(id=>represents(e,id))),'Retired parent or generated occurrence still in feed');
  const expected=canonical.filter(c=>f===history||`${(c.payload||c.patch).startDate}T21:30`>=localNow);
  for(const c of canonical){const id=c.path.split('/').at(-1),matches=f.events.filter(e=>represents(e,id));assert.equal(matches.length,expected.includes(c)?1:0,'Canonical count '+id);if(matches.length)check(matches[0],c);}
  const harvest=f.events.filter(e=>e.venueId===venuePath.split('/')[1]&&/harvest|exclusive culinary|experimental workshop/i.test(e.title||''));assert.equal(harvest.length,expected.length,'Unexpected generic/recurring Harvest copy');
 }
 for(const m of before.media)assert.equal((await fetch(m.url,{method:'HEAD',signal:AbortSignal.timeout(20000)})).status,200);
 let marker;for(let n=0;n<3;n++){marker=await get(api+'/version');if(marker.version===266)break;if(n<2)await new Promise(resolve=>setTimeout(resolve,20000));}assert.equal(marker.version,266);
 const report={verifiedAt:new Date().toISOString(),resultPath,exactDelta:true,keeperUpdates:3,creates:9,deletes:5,venuePolicyUpdates:1,feedVersion:266,untouchedReferences:untouched,
  canonicalDates:dates,details200:12,deletedDetails404:5,canonicalPerActiveFeed:canonical.filter(c=>`${(c.payload||c.patch).startDate}T21:30`>=localNow).length,canonicalPerHistoryFeed:12,retiredGeneratedOccurrences:0,otherVenueActivitiesUnchanged:3,media200:before.media.length,
  activeFeedTotal:active.events.length,activeFeedPages:active.pages,historyFeedTotal:history.events.length,historyFeedPages:history.pages,liveWrites:0};
 await fs.writeFile(path.join(path.dirname(resultPath),'independent-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await admin.app().delete();}
