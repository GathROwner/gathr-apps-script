// Independent post-transaction verification; cannot apply or replay the repair.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
assert.equal(process.argv.length,3,'Explicit prewrite backup path required');
const backupPath=path.resolve(process.argv[2]),backup=JSON.parse(await fs.readFile(backupPath,'utf8'));
assert.deepEqual(backup.changes.map(x=>x.path),['events/location_4a23fba2153afb4b591c2675','city_level_event_reviews/cityevt_1eacc2fb688bed5d5af74314']);
const key=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));assert.equal(key.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});const db=admin.firestore();
const plain=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
try{
 const fresh=await db.getAll(...backup.documents.map(x=>db.doc(x.path)));
 for(let i=0;i<fresh.length;i++){
  const old=backup.documents[i],now=fresh[i],change=backup.changes.find(x=>x.path===old.path);
  assert.equal(now.exists,old.exists,'Existence changed: '+old.path);
  let expected=plain(old.data),actual=plain(now.data());
  if(change){expected={...expected,...change.patch};delete expected.updatedAt;delete actual.updatedAt;}
  assert.deepEqual(actual,expected,'Unexpected delta: '+old.path);
 }
 const saved=await db.collectionGroup('events').where('startDate','==','2026-10-15').get();
 const related=saved.docs.filter(d=>d.get('venueId')==='slug_confedcentre'||/arts.?mixer/i.test(d.get('eventName')||''));
 assert.equal(related.filter(d=>/arts.?mixer/i.test(d.get('eventName')||'')).length,1,'Duplicate mixer');
 const base='https://gathr-backend-924732524090.northamerica-northeast1.run.app/api/v2/firestore/events';
 const get=async u=>{const r=await fetch(u,{signal:AbortSignal.timeout(30000),headers:{'Cache-Control':'no-cache'}});assert.equal(r.status,200);return r.json();};
 const id='location_4a23fba2153afb4b591c2675',detail=(await get(base+'/'+id)).event;
 assert.equal(detail.locationScope,'venue');assert.equal(detail.venueId,'slug_confedcentre');
 assert.equal(detail.startTime,'16:00');assert.equal(detail.endTime,'19:00');
 assert.equal(detail.metadata.timeFlags.end.source,'explicit');
 assert(!/Review reasons:|Observed broad location:/i.test(detail.description));
 const matches=[];let cursor='',pages=0,total=0;const seen=new Set();
 do{const u=new URL(base);u.searchParams.set('includeExpired','false');u.searchParams.set('limit','100');if(cursor)u.searchParams.set('startAfter',cursor);
  const p=await get(u);assert(Array.isArray(p.events));total+=p.events.length;matches.push(...p.events.filter(e=>e.id===id));cursor=p.nextPageToken||'';
  assert(++pages<100);if(cursor){assert(!seen.has(cursor));seen.add(cursor);}
 }while(cursor);
 assert.equal(matches.length,1);assert.equal(matches[0].locationScope??matches[0].metadata?.locationScope,'venue');
 const result={verifiedAt:new Date().toISOString(),backupPath,changes:backup.changes,exactDeltaVerified:true,detailVerified:true,feedCount:1,feedTotal:total,pages,eventIdUnchanged:true,mediaUnchanged:true,oldDuplicateAbsent:true,liveWrites:0};
 const resultPath=path.join(path.dirname(backupPath),'repair-independent-verified.json');await fs.writeFile(resultPath,JSON.stringify(result,null,2));
 console.log(JSON.stringify({verified:true,resultPath,feedCount:1,pages,feedTotal:total,liveWrites:0}));
}finally{await admin.app().delete();}
