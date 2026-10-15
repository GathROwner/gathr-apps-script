// Read-only independent verification of the exact approved recovery and app API.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire}from'node:module';
const args=process.argv.slice(2);assert.equal(args.length,1);assert(args[0].startsWith('--result='));
const resultPath=path.resolve(args[0].slice(9)),result=JSON.parse(await fs.readFile(resultPath,'utf8')),before=JSON.parse(await fs.readFile(result.backupPath,'utf8'));
assert.equal(before.targets.length,17);assert(before.targets.every(t=>t.path.startsWith('venues/ItWg0uH2yXtETbhlepAJ/events/oct14_apm_')));
assert.deepEqual(result.created,before.targets.map(t=>t.path));
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
const key=JSON.parse(await fs.readFile(process.env.GATHR_SERVICE_ACCOUNT_PATH,'utf8'));assert.equal(key.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});const db=admin.firestore();const plain=x=>JSON.parse(JSON.stringify(x));
const version=d=>({seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds});
const api='https://gathr-backend-924732524090.northamerica-northeast1.run.app/api/v2/firestore/events';
try{
 const [created,untouched]=await Promise.all([db.getAll(...before.targets.map(t=>db.doc(t.path))),db.getAll(...[before.venue,...before.related,...before.sources].map(d=>db.doc(d.path)))]);
 created.forEach((d,i)=>{assert(d.exists);const data=plain(d.data());delete data.createdAt;delete data.updatedAt;assert.deepEqual(data,before.targets[i].payload);});
 untouched.forEach((d,i)=>{assert(d.exists);const ref=[before.venue,...before.related,...before.sources][i];assert.deepEqual(plain(d.data()),ref.data);if(typeof ref.updateTime==='string')assert.equal(d.updateTime.toDate().toISOString(),ref.updateTime);else assert.deepEqual(version(d),ref.updateTime);});
 const all=await db.collectionGroup('events').get();for(const t of before.targets)assert.equal(all.docs.filter(d=>d.get('uniqueId')===t.payload.uniqueId).length,1,'Duplicate exact source identity');
 const details=[];for(const t of before.targets){const r=await fetch(api+'/'+t.path.split('/').at(-1),{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);const e=(await r.json()).event;for(const f of ['venueId','startDate','endDate','startTime','endTime'])assert.equal(e[f]||'',t.payload[f]||'',`${t.path}:${f}`);details.push({id:e.id,status:r.status,date:e.startDate,start:e.startTime,end:e.endTime});}
 const ids=before.targets.map(t=>t.path.split('/').at(-1)),counts=new Map(ids.map(id=>[id,0])),feed=[];let cursor='',pages=0;const seen=new Set();
 do{const u=new URL(api);u.searchParams.set('includeExpired','false');u.searchParams.set('limit','100');if(cursor)u.searchParams.set('startAfter',cursor);const r=await fetch(u,{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);const j=await r.json();assert(Array.isArray(j.events));for(const e of j.events){feed.push(e);if(counts.has(e.id))counts.set(e.id,counts.get(e.id)+1);}cursor=j.nextPageToken||'';assert(++pages<100);if(cursor){assert(!seen.has(cursor));seen.add(cursor);}}while(cursor);
 assert([...counts.values()].every(n=>n===1),'Each approved target must appear exactly once');
 const norm=v=>String(v||'').trim().toLowerCase();for(const t of before.targets)assert.equal(feed.filter(e=>e.venueId===t.payload.venueId&&e.startDate===t.payload.startDate&&e.startTime===t.payload.startTime&&norm(e.title||e.eventName||e.name)===norm(t.payload.eventName||t.payload.name)).length,1,'Same-session duplicate in feed');
 const media=[...new Set(before.targets.map(t=>t.payload.imageUrl))];for(const url of media){assert(url.startsWith('https://storage.googleapis.com/gathr-uploaded-images/postimages/'));assert.equal((await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(15000)})).status,200);}
 const verified={verifiedAt:new Date().toISOString(),createdAndExactPayloadVerified:17,untouchedReferencesVerified:untouched.length,detail200:details.length,feedCount:feed.length,pages,feedCounts:Object.fromEntries(counts),duplicateSourceOccurrences:0,sourceImages200:media.length,meeting:details.find(d=>d.id.includes('1744647037666117')),publicWrites:0,details};
 const out=path.join(path.dirname(resultPath),'independent-verification-2026-10-15.json');await fs.writeFile(out,JSON.stringify(verified,null,2));console.log(JSON.stringify({out,...verified,details:undefined,feedCounts:undefined}));
}finally{await admin.app().delete();}
