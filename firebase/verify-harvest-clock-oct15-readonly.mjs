// Independent exact-delta and app-feed verification; cannot mutate live data.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
assert.equal(process.argv.length,3,'Applied result path required');
const resultPath=path.resolve(process.argv[2]),result=JSON.parse(await fs.readFile(resultPath,'utf8'));
const before=JSON.parse(await fs.readFile(result.backupPath,'utf8'));
const target='venues/fb_100063617721610/events/L5dAjm7VnQOOCMMze25W',id=target.split('/').at(-1);
assert.equal(result.target,target);assert.equal(result.updated,1);assert.equal(result.mediaWrites,0);
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
const key=JSON.parse(await fs.readFile(process.env.GATHR_SERVICE_ACCOUNT_PATH,'utf8'));assert.equal(key.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});const db=admin.firestore();
const plain=x=>JSON.parse(JSON.stringify(x));
const wrap=d=>({path:d.ref.path,exists:d.exists,version:d.updateTime?{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}:null,data:d.exists?plain(d.data()):null});
const api='https://gathr-backend-924732524090.northamerica-northeast1.run.app/api/v2/firestore/events';
const get=async u=>{const r=await fetch(u,{signal:AbortSignal.timeout(60000),headers:{'Cache-Control':'no-cache'}});assert.equal(r.status,200);return r.json();};
function checkEvent(e){assert.equal(e.id,id);assert.equal(e.startDate,'2026-10-15');assert.equal(e.endDate,'2026-10-15');assert.equal(e.startTime,'17:00');assert.equal(e.endTime,'21:30');assert.equal(e.venueId,'fb_100063617721610');assert.equal(e.title,before.documents[0].data.eventName);assert.equal(e.imageUrl,before.documents[0].data.imageUrl);assert.equal(e.metadata.timeFlags.start.source,'explicit');assert.equal(e.metadata.timeFlags.end.source,'explicit');assert.equal(e.metadata.timeResolution.startFromPostTime,undefined);assert.equal(e.isRecurring,false);}
try{
 const guarded=[...new Map([...before.documents,...before.siblings].map(d=>[d.path,d])).values()];
 const [docs,all]=await Promise.all([db.getAll(...guarded.map(d=>db.doc(d.path))),db.collectionGroup('events').get()]);
 for(let i=0;i<docs.length;i++){const d=docs[i],old=guarded[i];assert(d.exists);if(d.ref.path===target){const expected={...old.data,...before.patch},actual=plain(d.data());delete expected.updatedAt;delete actual.updatedAt;assert.deepEqual(actual,expected,'Exact approved delta');}else assert.deepEqual(wrap(d),old,'Untouched reference '+d.ref.path);}
 const related=all.docs.filter(d=>d.ref.path.startsWith('venues/fb_100063617721610/events/')||String(d.get('uniqueId')||'').startsWith('1727757279354846_')||(d.get('sourceUniqueIds')||[]).includes('1727757279354846'));
 assert.deepEqual(related.map(d=>d.ref.path).sort(),before.siblings.map(d=>d.path).sort(),'Sibling membership changed');
 const detail=(await get(api+'/'+id)).event;checkEvent(detail);
 const feed=[],seen=new Set();let cursor='',pages=0;do{const u=new URL(api);u.searchParams.set('includeExpired','false');u.searchParams.set('limit','100');if(cursor)u.searchParams.set('startAfter',cursor);const p=await get(u);assert(Array.isArray(p.events));feed.push(...p.events);cursor=p.nextPageToken||'';assert(++pages<100);if(cursor){assert(!seen.has(cursor));seen.add(cursor);}}while(cursor);
 const matches=feed.filter(e=>e.id===id||e.originalEventId===id||String(e.id).startsWith(id+'_'));
 const expired=Date.now()>Date.parse('2026-10-16T00:35:00Z');assert.equal(matches.length,expired?0:1,'Occurrence feed visibility');if(matches.length)checkEvent(matches[0]);
 const sameSession=feed.filter(e=>e.venueId===detail.venueId&&e.startDate===detail.startDate&&e.startTime===detail.startTime&&e.title===detail.title);assert.equal(sameSession.length,matches.length,'Same-session duplicate');
 const media=[...new Set([before.documents[0].data.imageUrl,...before.documents[0].data.mediaUrls,before.documents[0].data.icon].filter(Boolean))];
 const images=await Promise.all(media.map(async url=>({url,status:(await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(30000)})).status})));assert(images.every(x=>x.status===200));
 const verified={verifiedAt:new Date().toISOString(),resultPath,target,exactDeltaVerified:true,untouchedReferences:guarded.length-1,siblingMembershipUnchanged:true,detail200:true,feedCount:matches.length,feedTotal:feed.length,feedPages:pages,sameSessionDuplicate:false,images,liveWrites:0};
 const out=path.join(path.dirname(resultPath),'independent-verification.json');await fs.writeFile(out,JSON.stringify(verified,null,2));console.log(JSON.stringify({...verified,images:images.length,out}));
}finally{await admin.app().delete();}
