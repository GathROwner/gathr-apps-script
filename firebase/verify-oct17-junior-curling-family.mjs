/** Independent Firestore, detail and fully paginated active-feed verification. */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
const out=new URL('./artifacts/oct17-remaining-followups/',import.meta.url);
const files=(await fs.readdir(out)).filter(f=>/^junior-family-result-.*\.json$/.test(f)).sort();assert.equal(files.length,1);
const applied=JSON.parse(await fs.readFile(new URL(files[0],out),'utf8'));assert.equal(applied.status,'applied');
const backup=JSON.parse(await fs.readFile(new URL(applied.plan.backup,out),'utf8'));
const credential=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));assert.equal(credential.project_id,'gathr-migrated');
const app=admin.initializeApp({credential:admin.credential.cert(credential),projectId:credential.project_id}),db=app.firestore();
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const hash=x=>createHash('sha256').update(JSON.stringify(stable(JSON.parse(JSON.stringify(x))))).digest('hex');
try {
 const fresh=await db.getAll(...backup.documents.map(d=>db.doc(d.path)));
 for(const d of fresh){const before=backup.documents.find(b=>b.path===d.ref.path).data,after=d.data();assert(d.exists);
  if(d.ref.path===applied.plan.target)Object.assign(before,applied.plan.patch);
  if(d.ref.path==='runtime_metadata/event_feed')before.version=applied.plan.feedAfter;
  if([applied.plan.target,'runtime_metadata/event_feed'].includes(d.ref.path)){delete before.updatedAt;delete after.updatedAt;}
  assert.equal(hash(before),hash(after),'Unexpected delta '+d.ref.path);
 }
 const base='https://gathr-backend-924732524090.northamerica-northeast1.run.app',id=applied.plan.target.split('/').at(-1);
 const response=await fetch(base+'/api/v2/firestore/events/'+id,{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);
 const detail=await response.json(),event=detail.event||detail;
 assert.equal(event.familyFriendlyScore??event.metadata?.familyFriendlyScore,70);assert.equal(event.familyFriendlyScoringVersion??event.metadata?.familyFriendlyScoringVersion,'family-friendly-v6');
 const feed=[],tokens=new Set();let cursor='',pages=0;
 do {const url=new URL(base+'/api/v2/firestore/events');url.searchParams.set('includeExpired','false');url.searchParams.set('dateOnlyActivities','v1');url.searchParams.set('limit','100');if(cursor)url.searchParams.set('startAfter',cursor);
  const r=await fetch(url,{signal:AbortSignal.timeout(30000)});assert(r.ok);const body=await r.json();assert(Array.isArray(body.events));feed.push(...body.events);cursor=body.nextPageToken||'';
  assert(++pages<40,'Unbounded feed');if(cursor){assert(!tokens.has(cursor),'Repeated cursor');tokens.add(cursor);}
 }while(cursor);
 const occurrences=feed.filter(e=>e.id===id||e.originalEventId===id||e.metadata?.originalEventId===id||String(e.id).startsWith(id+'_'));
 assert(occurrences.length>0,'Missing upcoming Thursday occurrence');
 for(const e of occurrences)assert.equal(e.familyFriendlyScore??e.metadata?.familyFriendlyScore,70);
 const original=backup.documents.find(d=>d.path===applied.plan.target).data,urls=[...new Set([original.image,original.imageUrl,original.relevantImageUrl,...original.mediaUrls])];
 const media=[];for(const url of urls){const r=await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);media.push({url,status:r.status});}
 const result={checkedAt:new Date().toISOString(),target:applied.plan.target,verifiedExactDeltas:2,untouchedReadSetDocuments:fresh.length-2,detailStatus:200,familyScore:70,feedVersion:applied.plan.feedAfter,pages,feedCount:feed.length,targetOccurrences:occurrences.length,media,liveWrites:0,paidCalls:0};
 await fs.writeFile(new URL('junior-family-api-verification.json',out),JSON.stringify({...result,detail,occurrences},null,2));
 console.log(JSON.stringify(result));
}finally{await app.delete();}
