// Actual full-run gate/source/canonical reads; only proposed edition metadata and
// already captured model evidence are overlaid locally. Every write is denied.
import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
const {runFestivalLinkWorker}=require('../functions/lib/services/festivalLinkWorker.js');
const dir='functions/artifacts/pumpkin-overview-oct16',draft=JSON.parse(await fs.readFile(dir+'/draft-worker-inputs.json','utf8'));assert.equal(draft.proposedOnly,true);
const planArg=process.argv.find(a=>a.startsWith('--plan='));if(planArg){const plan=JSON.parse(await fs.readFile(planArg.slice(7),'utf8'));draft.umbrella=plan.changes.find(c=>c.path==='events/'+draft.rootId).data;draft.review=plan.changes.find(c=>c.path==='city_level_event_reviews/'+draft.reviewId).data;}
const credential=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));assert.equal(credential.project_id,'gathr-migrated');admin.initializeApp({credential:admin.credential.cert(credential),projectId:credential.project_id});
const db=admin.firestore(),rootPath='events/'+draft.rootId,reviewPath='city_level_event_reviews/'+draft.reviewId;
const forbidden=()=>{throw Error('All writes forbidden in proposed-edition read-only replay');};
const virtual=(p,data)=>({id:p.split('/').at(-1),ref:db.doc(p),exists:true,updateTime:admin.firestore.Timestamp.fromMillis(0),data:()=>data,get:k=>k.split('.').reduce((x,n)=>x?.[n],data)});
const wrapQuery=q=>new Proxy(q,{get(target,property){if(['add','set','update','delete','create'].includes(String(property)))return forbidden;if(property==='get')return async()=>{
 const actual=await target.get();const docs=[...actual.docs,virtual(rootPath,draft.umbrella)];return{docs,size:docs.length,empty:false,actualRegistryRecordsNotModified:actual.size};
};const value=target[property];return typeof value==='function'? (...args)=>{const next=value.apply(target,args);return next&&typeof next.get==='function'?wrapQuery(next):next;}:value;}});
const readonly=new Proxy(db,{get(target,property){if(['runTransaction','batch','bulkWriter','recursiveDelete'].includes(String(property)))return forbidden;
 if(property==='collection')return name=>name==='events'?wrapQuery(target.collection(name)):target.collection(name);
 if(property==='doc')return p=>p===reviewPath?{...target.doc(p),path:p,get:async()=>virtual(p,draft.review)}:target.doc(p);
 const value=target[property];return typeof value==='function'?value.bind(target):value;}});
try{
 const [root,review,locks]=await Promise.all([db.doc(rootPath).get(),db.doc(reviewPath).get(),db.collection('processing_locks').get()]);assert(!root.exists&&!review.exists,'Proposed edition unexpectedly already exists');assert(locks.docs.every(d=>['completed','failed','cancelled','canceled','released'].includes(String(d.get('status')))),'Active/unknown parser');
 const result=await runFestivalLinkWorker(readonly,{mode:'publish',dryRun:true,asOf:'2026-10-16',fileId:draft.fileId,editionId:draft.rootId,localCaptures:new Map([[draft.key,draft.cache]])});
 const output={checkedAt:new Date().toISOString(),mode:'actual_worker_fresh_firestore_dry_run',proposedEditionOverlayOnly:true,fullRunAndAllSourceRowsFromFirestore:true,manualChildLinksSeeded:0,paidCalls:0,liveWrites:0,...result};
 await fs.writeFile(dir+'/actual-worker-readonly.json',JSON.stringify(output,null,2));console.log(JSON.stringify({...output,reports:result.reports?.map(r=>({editionId:r.editionId,status:r.status,reason:r.reason,gaps:r.gaps,unconfirmedItems:r.unconfirmedItems,additions:r.addedEventIds}))}));
 assert.equal(result.eventWrites,0);assert.equal(result.paidSources,0);assert.equal(result.status,'completed','Worker still has a real source/publication blocker');assert.equal(result.reports[0].addedEventIds.length,13);
}finally{await admin.app().delete();}
