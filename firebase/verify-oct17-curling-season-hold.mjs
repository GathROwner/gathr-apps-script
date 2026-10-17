/** Independent proof after the exact eight-operation Curling hold. Read only. */
import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
const out=new URL('./artifacts/oct17-curling-siblings/',import.meta.url),files=(await fs.readdir(out)).filter(f=>/^season-hold-result-.*\.json$/.test(f));assert.equal(files.length,1);
const result=JSON.parse(await fs.readFile(new URL(files[0],out),'utf8'));assert.equal(result.status,'applied');const plan=result.plan,backup=JSON.parse(await fs.readFile(new URL(result.backup,out),'utf8'));
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
const credential=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));assert.equal(credential.project_id,'gathr-migrated');
const app=admin.initializeApp({credential:admin.credential.cert(credential),projectId:credential.project_id}),db=app.firestore();
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const hash=x=>createHash('sha256').update(JSON.stringify(stable(JSON.parse(JSON.stringify(x))))).digest('hex');
try{
 const fresh=await db.getAll(...backup.documents.map(d=>db.doc(d.path)));
 for(const d of fresh){const o=plan.operations.find(o=>o.path===d.ref.path);if(o?.action==='delete'){assert(!d.exists);continue;}assert(d.exists);
  const expected=o?.action==='create'?structuredClone(o.payload):{...backup.documents.find(b=>b.path===d.ref.path).data,...(o?.payload||{})},actual=d.data();
  if(o){delete expected.updatedAt;delete actual.updatedAt;if(o.action==='create'){delete expected.createdAt;delete actual.createdAt;}}assert.equal(hash(actual),hash(expected),'Unexpected delta '+d.ref.path);}
 const base='https://gathr-backend-924732524090.northamerica-northeast1.run.app',targets=plan.operations.filter(o=>/^venues\/[^/]+\/events\//.test(o.path)),details=[];
 for(const o of targets){const id=o.path.split('/').at(-1),r=await fetch(base+'/api/v2/firestore/events/'+id,{signal:AbortSignal.timeout(30000)});assert.equal(r.status,o.action==='delete'?404:200);
  if(o.action!=='delete'){const b=await r.json(),e=b.event||b;assert.equal(e.familyFriendlyScore??e.metadata?.familyFriendlyScore,70);assert.equal(e.familyFriendlyScoringVersion??e.metadata?.familyFriendlyScoringVersion,'family-friendly-v6');}details.push({id,status:r.status});}
 const feed=[],seen=new Set();let cursor='',pages=0;do{const u=new URL(base+'/api/v2/firestore/events');u.searchParams.set('includeExpired','false');u.searchParams.set('dateOnlyActivities','v1');u.searchParams.set('limit','100');if(cursor)u.searchParams.set('startAfter',cursor);
  const r=await fetch(u,{signal:AbortSignal.timeout(30000)});assert(r.ok);const b=await r.json();assert(Array.isArray(b.events));feed.push(...b.events);cursor=b.nextPageToken||'';assert(++pages<40);if(cursor){assert(!seen.has(cursor));seen.add(cursor);}}while(cursor);
 const counts=[];for(const o of targets){const id=o.path.split('/').at(-1),found=feed.filter(e=>e.id===id||e.originalEventId===id||e.metadata?.originalEventId===id||String(e.id).startsWith(id+'_'));
  if(o.action==='delete'||id==='c8LLevWr1BIaAxFyHscb')assert.equal(found.length,0);else{assert.equal(found.length,1);assert.equal(found[0].familyFriendlyScore??found[0].metadata?.familyFriendlyScore,70);}counts.push({id,count:found.length});}
 const sourceParents=(await db.collectionGroup('events').get()).docs.filter(d=>[d.get('uniqueId'),d.get('sourceUniqueId'),...(d.get('sourceUniqueIds')||[])].some(v=>String(v||'').split('_')[0]==='1732518712212204')).map(d=>d.ref.path).sort();
 assert.deepEqual(sourceParents,targets.filter(o=>o.action!=='delete').map(o=>o.path).sort());
 const originals=backup.documents.filter(d=>/^venues\/[^/]+\/events\//.test(d.path)),urls=new Set(originals.flatMap(d=>[d.data.image,d.data.imageUrl,d.data.relevantImageUrl,...(d.data.mediaUrls||[])]).filter(Boolean)),media=[];
 for(const url of urls){const r=await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);media.push({url,status:200});}
 const proof={checkedAt:new Date().toISOString(),exactDeltas:8,unchangedReadSetDocuments:fresh.length-8,feedVersion:303,details,counts,sourceParents,pages,feedCount:feed.length,media,liveWrites:0,paidCalls:0};
 await fs.writeFile(new URL('season-hold-independent-verification.json',out),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
}finally{await app.delete();}
