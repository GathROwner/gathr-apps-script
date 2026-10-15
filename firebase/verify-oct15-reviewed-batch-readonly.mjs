// Independent exact-delta and app-feed verification. No live writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
assert.equal(process.argv.length,3,'Applied result path required');
const resultPath=path.resolve(process.argv[2]),result=JSON.parse(await fs.readFile(resultPath,'utf8'));
const before=JSON.parse(await fs.readFile(result.backupPath,'utf8'));
assert.equal(result.creates,1);assert.equal(result.updates,4);assert.equal(result.mediaWrites,0);assert.deepEqual(result.changes,before.changes);
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
const key=JSON.parse(await fs.readFile(process.env.GATHR_SERVICE_ACCOUNT_PATH,'utf8'));assert.equal(key.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});const db=admin.firestore();
const plain=x=>JSON.parse(JSON.stringify(x));
const wrap=d=>({path:d.ref.path,exists:d.exists,version:d.updateTime?{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}:null,data:d.exists?plain(d.data()):null});
const api='https://gathr-backend-924732524090.northamerica-northeast1.run.app/api/v2/firestore/events';
const get=async u=>{const r=await fetch(u,{signal:AbortSignal.timeout(60000)});assert.equal(r.status,200);return r.json();};
const created=result.changes.find(c=>c.kind==='create'),id=created.path.split('/').at(-1),payload=created.payload;
function checkShow(e){
 assert.equal(e.id,id);assert.equal(e.title,payload.eventName);assert.equal(e.category,'Live Music');assert.equal(e.venueId,payload.venueId);
 assert.equal(e.startDate,'2026-11-19');assert.equal(e.startTime,'20:00');assert.equal(e.endDate,'2026-11-19');assert(!e.endTime,'Unknown finish must stay unknown');
 assert.equal(e.price,'$25');assert.equal(e.imageUrl,payload.imageUrl);assert.equal(e.isRecurring,false);
 assert.equal(e.metadata.ticketsBuyUrl||e.metadata.ticketLink||e.ticketsBuyUrl||e.ticketLink,payload.ticketLink);
 assert.equal(e.metadata.timeFlags.start.source,'explicit');assert.equal(e.metadata.timeFlags.end.source,'none');
}
async function feed(includeExpired){const events=[],seen=new Set();let cursor='',pages=0;
 do{const u=new URL(api);u.searchParams.set('includeExpired',String(includeExpired));u.searchParams.set('limit','100');u.searchParams.set('dateOnlyActivities','v1');if(cursor)u.searchParams.set('startAfter',cursor);
 const p=await get(u);assert(Array.isArray(p.events));events.push(...p.events);cursor=p.nextPageToken||'';assert(++pages<100);if(cursor){assert(!seen.has(cursor));seen.add(cursor);}}while(cursor);return{events,pages};}
try{
 const guarded=[...new Map([...before.documents,...before.siblings].map(d=>[d.path,d])).values()];
 const [docs,all]=await Promise.all([db.getAll(...guarded.map(d=>db.doc(d.path))),db.collectionGroup('events').get()]);
 for(let i=0;i<docs.length;i++){
  const old=guarded[i],d=docs[i],change=result.changes.find(c=>c.path===old.path);assert(d.exists);
  if(change||old.path===result.feedVersionChange.path){
   const expected=change?.kind==='create'?{...change.payload}:change?{...old.data,...change.patch}:{...old.data,version:result.feedVersionChange.to};
   const actual=plain(d.data());delete actual.updatedAt;delete expected.updatedAt;
   if(change?.kind==='create')delete actual.createdAt;
   assert.deepEqual(actual,expected,'Exact delta '+old.path);
  }else assert.deepEqual(wrap(d),old,'Untouched reference '+old.path);
 }
 const sourceIds=['1558539286292403','1564814712352727'];
 const occurrences=before.changes.map(c=>c.kind==='create'?{venueId:c.payload.venueId,date:c.payload.startDate}:{venueId:c.path.split('/')[1],date:before.documents.find(d=>d.path===c.path).data.startDate});
 const related=all.docs.filter(d=>occurrences.some(o=>d.get('venueId')===o.venueId&&d.get('startDate')===o.date)||sourceIds.some(s=>String(d.get('uniqueId')||'').startsWith(s+'_')||(d.get('sourceUniqueIds')||[]).includes(s)));
 assert.deepEqual(related.map(d=>d.ref.path).sort(),[...before.siblings.map(d=>d.path),created.path].sort());
 checkShow((await get(api+'/'+id)).event);checkShow((await get(api+'/'+id+'?dateOnlyActivities=v1')).event);
 for(const change of result.changes.filter(c=>c.kind==='update')){
  const e=(await get(api+'/'+change.path.split('/').at(-1)+'?dateOnlyActivities=v1')).event,old=before.documents.find(d=>d.path===change.path).data;
  assert.equal(e.title,old.eventName||old.name);assert.equal(e.startDate,old.startDate);assert.equal(e.startTime,old.startTime);assert.equal(e.imageUrl,old.imageUrl);
 }
 const active=await feed(false),history=await feed(true);
 for(const f of [active,history]){const found=f.events.filter(e=>e.id===id||e.originalEventId===id);assert.equal(found.length,1);checkShow(found[0]);
 assert.equal(f.events.filter(e=>e.venueId===payload.venueId&&e.startDate===payload.startDate&&/McFadyen|Daniel James/i.test(e.title||'')).length,1,'Duplicate show');}
 for(const url of [payload.imageUrl,payload.icon])assert.equal((await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(20000)})).status,200);
 let marker;for(let attempt=0;attempt<3;attempt++){marker=await get(api+'/version');if(marker.version===265)break;if(attempt<2)await new Promise(resolve=>setTimeout(resolve,20000));}assert.equal(marker.version,265);
 const verified={verifiedAt:new Date().toISOString(),resultPath,exactDeltaVerified:true,creates:1,sourceOnlyUpdates:4,untouchedReferences:guarded.length-6,
  siblingMembershipVerified:true,showDetails200:true,unchangedExistingDetails200:4,activeShowCount:1,historyShowCount:1,duplicateShow:false,
  activeFeedTotal:active.events.length,activeFeedPages:active.pages,historyFeedTotal:history.events.length,historyFeedPages:history.pages,images200:2,feedVersion:265,liveWrites:0};
 await fs.writeFile(path.join(path.dirname(resultPath),'independent-verification.json'),JSON.stringify(verified,null,2));console.log(JSON.stringify(verified));
}finally{await admin.app().delete();}
