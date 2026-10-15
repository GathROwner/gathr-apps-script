// Exact plan replay only, after approval and a compatible-client rollout decision.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
const args=process.argv.slice(2),apply=args.includes('--apply'),planPath=args.find(x=>x.startsWith('--plan='))?.slice(7);
assert(planPath&&args.every(x=>x==='--apply'||x.startsWith('--plan=')),'Explicit reviewed plan required; default dry run');
const plan=JSON.parse(await fs.readFile(path.resolve(planPath),'utf8')),backup=JSON.parse(await fs.readFile(plan.backup,'utf8'));
assert.deepEqual(plan.changes.map(c=>c.path),['venues/slug_confedcentre/events/bqk2pKnr1HHZQvhaz6Qo','venues/fb_100063617721610/events/L5dAjm7VnQOOCMMze25W']);
const allowed=new Set(['startTime','endTime','endDate','timeFlags','timeResolution','timing','image','imageUrl','relevantImageUrl','imageProvenance']);
for(const c of plan.changes){assert(Object.keys(c.patch).every(k=>allowed.has(k)));assert.equal(c.patch.startTime,'');assert.equal(c.patch.endTime,'');
 assert.equal(c.patch.timing?.estimate?.method,'source_dated_activity_unknown_clock');assert.equal(c.patch.timing?.estimate?.estimateVersion,'date-only-activity-v1');}
const key=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));assert.equal(key.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});const db=admin.firestore();
const plain=x=>JSON.parse(JSON.stringify(x));const wrap=d=>({path:d.ref.path,data:plain(d.data()),version:{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}});
const references=[...new Map([...backup.documents,...backup.sources,...backup.siblings].map(x=>[x.path,x])).values()];
const siblingQueries=plan.changes.flatMap(c=>{const collection=db.doc(c.path).parent;return [collection.where('startDate','==',c.patch.endDate).limit(65),
  collection.where('uniqueId','>=',c.source+'_').where('uniqueId','<',c.source+'_\uf8ff').limit(65)];});
async function checkSiblingSets(reader){const paths=[];for(const q of siblingQueries){const s=await reader(q);assert(s.size<65);paths.push(...s.docs.map(d=>d.ref.path));}
 assert.deepEqual([...new Set(paths)].sort(),backup.siblings.map(x=>x.path).sort(),'New or missing same-day/source sibling');}
async function idle(){const locks=await db.collection('processing_locks').get();assert(!locks.docs.some(d=>!['completed','failed','cancelled','canceled','released'].includes(String(d.get('status')||''))),'Active parser blocks repair');}
try{
 await idle();const fresh=await db.getAll(...references.map(x=>db.doc(x.path)));fresh.forEach((d,i)=>assert.deepEqual(wrap(d),references[i],'Reviewed target/source/sibling changed'));
 await checkSiblingSets(q=>q.get());
 for(const c of plan.changes)if(c.patch.image)assert.equal((await fetch(c.patch.image,{signal:AbortSignal.timeout(15000)})).status,200);
 if(!apply){console.log(JSON.stringify({mode:'dry_run',planPath,targets:plan.changes.map(c=>({path:c.path,title:c.title,patchFields:Object.keys(c.patch)})),references:references.length,liveWrites:0}));}
 else{
  const out=path.dirname(path.resolve(planPath)),stamp=new Date().toISOString().replace(/[:.]/g,'-'),prewrite=path.join(out,`time-prewrite-${stamp}.json`);
  await fs.writeFile(prewrite,JSON.stringify({plan,documents:fresh.map(wrap)},null,2));await idle();
  await db.runTransaction(async tx=>{const docs=await tx.getAll(...references.map(x=>db.doc(x.path)));docs.forEach((d,i)=>assert.deepEqual(wrap(d),references[i],'Transaction drift'));
    await checkSiblingSets(q=>tx.get(q));
    for(const c of plan.changes)tx.update(db.doc(c.path),{...c.patch,updatedAt:admin.firestore.FieldValue.serverTimestamp()});});
  const after=await db.getAll(...references.map(x=>db.doc(x.path)));for(let i=0;i<after.length;i++){
    const change=plan.changes.find(c=>c.path===after[i].ref.path);let expected=plain(references[i].data),actual=plain(after[i].data());
    if(change){expected={...expected,...change.patch};delete expected.updatedAt;delete actual.updatedAt;}
    assert.deepEqual(actual,expected,'Unexpected approved delta');
  }
  const api='https://gathr-backend-924732524090.northamerica-northeast1.run.app/api/v2/firestore/events',ids=plan.changes.map(c=>c.path.split('/').at(-1));
  for(const id of ids){const response=await fetch(api+'/'+id,{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);const event=(await response.json()).event;
    assert.equal(event.startTime||'','');assert.equal(event.endTime||'','');assert.equal((event.timing??event.metadata?.timing)?.estimate?.estimateVersion,'date-only-activity-v1');}
  let cursor='',pages=0;const seen=new Set(),counts=new Map(ids.map(id=>[id,0]));
  do{const url=new URL(api);url.searchParams.set('includeExpired','false');url.searchParams.set('limit','100');if(cursor)url.searchParams.set('startAfter',cursor);
    const response=await fetch(url,{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);const page=await response.json();assert(Array.isArray(page.events));
    for(const e of page.events)if(counts.has(e.id))counts.set(e.id,counts.get(e.id)+1);cursor=page.nextPageToken||'';assert(++pages<100);if(cursor){assert(!seen.has(cursor));seen.add(cursor);}
  }while(cursor);
  const localDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Halifax',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  for(const c of plan.changes)assert.equal(counts.get(c.path.split('/').at(-1)),c.patch.endDate>=localDate?1:0);
  const result={appliedAt:new Date().toISOString(),prewrite,changes:plan.changes,exactDeltaVerified:true,apiVerified:true,feedPages:pages,feedCounts:Object.fromEntries(counts),mediaDeleted:0};
  const resultPath=path.join(out,`time-applied-${stamp}.json`);await fs.writeFile(resultPath,JSON.stringify(result,null,2));console.log(JSON.stringify({resultPath,applied:2,exactDeltaVerified:true,apiVerified:true}));
 }
}finally{await admin.app().delete();}
