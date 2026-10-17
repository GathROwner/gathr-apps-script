/** Independent exact delta, detail, full feed and managed-media check. Read only. */
import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
assert(process.argv.slice(2).every(a=>a==='--after'),'Unexpected option');const after=process.argv.includes('--after');
const out=new URL('./artifacts/oct17-curling-siblings/',import.meta.url),evidence=JSON.parse(await fs.readFile(new URL('curling-live-readback.json',out),'utf8'));
const plan=JSON.parse(await fs.readFile(new URL('four-family-reviewed-plan.json',out),'utf8'));
if(after){const results=(await fs.readdir(out)).filter(f=>/^four-family-result-.*\.json$/.test(f));assert.equal(results.length,1);assert.equal(JSON.parse(await fs.readFile(new URL(results[0],out),'utf8')).status,'applied');}
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
const credential=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));assert.equal(credential.project_id,'gathr-migrated');
const app=admin.initializeApp({credential:admin.credential.cert(credential),projectId:credential.project_id}),db=app.firestore();
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const hash=x=>createHash('sha256').update(JSON.stringify(stable(JSON.parse(JSON.stringify(x))))).digest('hex');
try{
 const controls=[evidence.venue,...evidence.events,...evidence.snapshots,evidence.feed],fresh=await db.getAll(...controls.map(d=>db.doc(d.path)));
 for(const d of fresh){assert(d.exists);const expected=JSON.parse(JSON.stringify(controls.find(e=>e.path===d.ref.path).data)),actual=d.data(),op=plan.operations.find(o=>o.path===d.ref.path);
  if(after&&(op||d.ref.path===evidence.feed.path)){if(op)Object.assign(expected,op.patch);else expected.version=303;delete expected.updatedAt;delete actual.updatedAt;}
  assert.equal(hash(actual),hash(expected),'Unexpected delta '+d.ref.path);}
 const base='https://gathr-backend-924732524090.northamerica-northeast1.run.app',details=[];
 for(const doc of evidence.events){const id=doc.path.split('/').at(-1),r=await fetch(base+'/api/v2/firestore/events/'+id,{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);const body=await r.json(),event=body.event||body;
  const expected=after?(plan.operations.find(o=>o.path===doc.path)?.patch.familyFriendlyScore??doc.data.familyFriendlyScore):doc.data.familyFriendlyScore;
  assert.equal(event.familyFriendlyScore??event.metadata?.familyFriendlyScore,expected);details.push({id,status:r.status,score:expected});}
 const feed=[],seen=new Set();let cursor='',pages=0;
 do{const u=new URL(base+'/api/v2/firestore/events');u.searchParams.set('includeExpired','false');u.searchParams.set('dateOnlyActivities','v1');u.searchParams.set('limit','100');if(cursor)u.searchParams.set('startAfter',cursor);
  const r=await fetch(u,{signal:AbortSignal.timeout(30000)});assert(r.ok);const b=await r.json();assert(Array.isArray(b.events));feed.push(...b.events);cursor=b.nextPageToken||'';assert(++pages<40);
  if(cursor){assert(!seen.has(cursor));seen.add(cursor);}
 }while(cursor);
 const occurrences=evidence.events.map(doc=>{const id=doc.path.split('/').at(-1),found=feed.filter(e=>e.id===id||e.originalEventId===id||e.metadata?.originalEventId===id||String(e.id).startsWith(id+'_'));
  const expected=after?(plan.operations.find(o=>o.path===doc.path)?.patch.familyFriendlyScore??doc.data.familyFriendlyScore):doc.data.familyFriendlyScore;
  for(const e of found)assert.equal(e.familyFriendlyScore??e.metadata?.familyFriendlyScore,expected);
  return {path:doc.path,occurrences:found};});
 const media=[];for(const url of new Set(evidence.events.flatMap(d=>[d.data.image,d.data.imageUrl,d.data.relevantImageUrl,...(d.data.mediaUrls||[])]).filter(Boolean))){const r=await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);media.push({url,status:200});}
 const summary={checkedAt:new Date().toISOString(),state:after?'after':'before',exactDeltas:after?5:0,readSetDocuments:fresh.length,feedVersion:after?303:302,details,pages,feedCount:feed.length,counts:occurrences.map(o=>({path:o.path,count:o.occurrences.length})),media,liveWrites:0,paidCalls:0};
 await fs.writeFile(new URL(after?'four-family-independent-verification.json':'curling-current-api-verification.json',out),JSON.stringify({...summary,occurrences},null,2));console.log(JSON.stringify(summary));
}finally{await app.delete();}
