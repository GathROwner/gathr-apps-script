/** Human adjudication inventory. Live reads only; worker writes and paid calls forbidden. */
import fs from 'node:fs/promises';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire(new URL('../functions/artifacts/oct17-festival-corroboration-release/assembly/package.json',import.meta.url)),admin=require('firebase-admin');
const credential=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));assert.equal(credential.project_id,'gathr-migrated');const app=admin.initializeApp({credential:admin.credential.cert(credential),projectId:credential.project_id}),db=app.firestore(),entries=new Map(),evidence=[];
const save=d=>{entries.set(d.ref.path,{path:d.ref.path,exists:d.exists,version:d.updateTime?{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}:null,data:d.exists?d.data():null});return d;};
const q=x=>({where:(...a)=>q(x.where(...a)),orderBy:(...a)=>q(x.orderBy(...a)),limit:(...a)=>q(x.limit(...a)),get:async()=>{const s=await x.get();s.docs.forEach(save);return s;}});
const readonly={collection:n=>q(db.collection(n)),collectionGroup:n=>q(db.collectionGroup(n)),doc:p=>({path:p,id:p.split('/').at(-1),get:async()=>save(await db.doc(p).get())}),getAll:async(...r)=>(await db.getAll(...r.map(x=>db.doc(x.path)))).map(save),runTransaction:async()=>{throw Error('Review forbids live writes');}};
const module=require('./lib/services/festivalReviewedCorroboration.js'),original=module.reviewedFestivalCorroboration;
module.reviewedFestivalCorroboration=input=>{evidence.push({editionId:input.edition.id,evidence:input.source});return original(input);};
try{
 const {runFestivalLinkWorker}=require('./lib/services/festivalLinkWorker.js');
 const report=await runFestivalLinkWorker(readonly,{mode:'publish',dryRun:true,asOf:'2026-10-17',fileId:'1JFQdQB-pAXdAb0usJhNFf5mrWnWyBd7g'});assert.equal(report.status,'completed');assert.equal(report.eventWrites,0);assert.equal(report.paidSources,0);
 const directPaths=['city_level_event_reviews/cityevt_711783010369fad6f5e8e36f','event_integrity_holds/oct17_coats_distribution_1118550040924946','event_integrity_holds/oct17_mothlane_clock_1720610070064632','event_integrity_holds/oct17_curling_programme_start_1732518712212204','venues/1ehK5wrBKC460QSpqUMq','runtime_metadata/event_feed','venues/slug_mothlanebrewing/events/dqtPfabTkUTz0dn2pHVW'];
 (await db.getAll(...directPaths.map(p=>db.doc(p)))).forEach(save);
 for(const id of ['1118550040924946','1720610070064632','1732518712212204']) (await db.collection('parse_snapshots').where('uniqueId','==',id).get()).docs.forEach(save);
 const held=report.reports.flatMap(r=>r.outcomes.filter(o=>o.status==='held').map(o=>({...o,editionId:r.editionId,evidence:evidence.find(e=>e.editionId===r.editionId&&e.evidence.id===o.id)?.evidence})));assert(held.every(o=>o.evidence));
 const out=new URL('./artifacts/oct17-final-hold-adjudication/',import.meta.url);await fs.mkdir(out,{recursive:true});await fs.writeFile(new URL('live-readonly-inventory.json',out),JSON.stringify({checkedAt:new Date().toISOString(),readOnly:true,report,held,entries:[...entries.values()],liveWrites:0,paidCalls:0},null,2));
 console.log(JSON.stringify({sources:report.sourceCount,holds:held.map(o=>({edition:o.editionId,name:o.evidence.activity.name,date:o.evidence.activity.startDate,time:o.evidence.activity.startTime,reason:o.reason,id:o.id})),documents:entries.size,liveWrites:0,paidCalls:0}));
}finally{module.reviewedFestivalCorroboration=original;await app.delete();}
