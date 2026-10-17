/** Independent exact deltas, APIs, media and released-worker read-only verification. */
import fs from 'node:fs/promises';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const out=new URL('./artifacts/oct17-remaining-followups/',import.meta.url),read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const files=(await fs.readdir(out)).filter(f=>/^remaining-result-.*\.json$/.test(f));assert.equal(files.length,1,'Exactly one applied batch receipt required');
const result=await read(new URL(files[0],out));assert.equal(result.status,'applied');const backup=await read(new URL(result.backup,out)),plan=backup.plan;
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
const key=await read(process.env.ANCHOR_CREDENTIAL_PATH);assert.equal(key.project_id,'gathr-migrated');const app=admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id}),db=app.firestore();
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const hash=x=>createHash('sha256').update(JSON.stringify(stable(JSON.parse(JSON.stringify(x))))).digest('hex');
try {
 const docs=await db.getAll(...plan.preconditions.map(p=>db.doc(p.path)));let untouched=0;
 for(const d of docs){const o=plan.operations.find(o=>o.path===d.ref.path),before=backup.documents.find(b=>b.path===d.ref.path);
  assert.equal(d.exists,o?true:before.exists);if(!d.exists)continue;
  const actual=d.data(),expected=o?(o.action==='update'?{...before.data,...o.payload}:structuredClone(o.payload)):before.data;
  for(const field of o?.timestampFields||[]){delete actual[field];delete expected[field];}
  assert.equal(hash(actual),hash(expected),'Unexpected delta '+d.ref.path);if(!o)untouched++;
 }
 const all=await db.collectionGroup('events').select('uniqueId','sourceUniqueId','sourceUniqueIds','venueId').get();
 const relevant=all.docs.filter(d=>[d.get('uniqueId'),d.get('sourceUniqueId'),...(d.get('sourceUniqueIds')||[])].some(x=>plan.sourceRoots.includes(String(x||'').split('_')[0]))).map(d=>d.ref.path).sort();
 const eventOps=plan.operations.filter(o=>/^venues\/[^/]+\/events\//.test(o.path));assert.equal(eventOps.length,6);assert.deepEqual(relevant,eventOps.map(o=>o.path).sort());
 const base='https://gathr-backend-924732524090.northamerica-northeast1.run.app',details=[];
 for(const o of eventOps){const r=await fetch(base+'/api/v2/firestore/events/'+o.path.split('/').at(-1),{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);const body=await r.json(),e=body.event||body;
  for(const field of ['startDate','startTime','endDate','endTime','venueId','recurringPattern','locationScope','locationPrecision'])assert.equal(e[field]??e.metadata?.[field],o.payload[field],'Detail '+field+' '+o.path);
  details.push({path:o.path,status:200,body});
 }
 const feed=[],tokens=new Set();let cursor='',pages=0;
 do {const url=new URL(base+'/api/v2/firestore/events');for(const [k,v] of Object.entries({includeExpired:'false',dateOnlyActivities:'v1',limit:'100',...(cursor?{startAfter:cursor}:{})}))url.searchParams.set(k,v);
  const r=await fetch(url,{signal:AbortSignal.timeout(30000)});assert(r.ok);const b=await r.json();assert(Array.isArray(b.events));feed.push(...b.events);cursor=b.nextPageToken||'';assert(++pages<40);if(cursor){assert(!tokens.has(cursor));tokens.add(cursor);}
 }while(cursor);
 const feedChecks=eventOps.map(o=>({path:o.path,count:feed.filter(e=>e.id===o.path.split('/').at(-1)||e.originalEventId===o.path.split('/').at(-1)||e.metadata?.originalEventId===o.path.split('/').at(-1)).length}));
 assert(feedChecks.every(c=>c.count===1),'Missing/duplicated one-off in complete active feed');
 const media=[];for(const url of new Set(eventOps.flatMap(o=>[o.payload.imageUrl,...(o.payload.mediaUrls||[])]).filter(Boolean))){const r=await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);media.push({url,status:200});}
 const {runFestivalLinkWorker}=await import(new URL('../functions/artifacts/oct17-eight-group-release/festival-release/lib/services/festivalLinkWorker.js',import.meta.url));
 const worker=await runFestivalLinkWorker(db,{mode:'shadow',asOf:'2026-10-17',fileId:plan.fileId,dryRun:true});assert(!worker.eventWrites&&!worker.paidSources);
 assert(worker.reports?.every(r=>r.reason!=='source_inventory_incomplete'),'Anchor inventory remains incomplete');
 const report={verifiedAt:new Date().toISOString(),exactOperations:plan.operations.length,unchangedDocuments:untouched,exactSourceEvents:relevant,details,feedChecks,pages,feedCount:feed.length,media,worker,liveWrites:0,modelCalls:0};
 await fs.writeFile(new URL('remaining-independent-verification.json',out),JSON.stringify(report,null,2));
 console.log(JSON.stringify({exactOperations:plan.operations.length,unchangedDocuments:untouched,details:details.length,pages,feedCount:feed.length,oneOffFeedCopies:feedChecks.map(c=>c.count),media:media.length,workerStatus:worker.status,workerWrites:0,paidSources:0}));
}finally{await app.delete();}
