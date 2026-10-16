// Saved-source inventory only. No API model calls or Firestore writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const admin=require('firebase-admin');
const {verifyFestivalFullRun}=require('../functions/lib/services/festivalLinkShadowJob.js');
const {reviewedFestivalEdition}=require('../functions/lib/services/festivalEditionRegistry.js');
const credential=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));
assert.equal(credential.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(credential),projectId:credential.project_id});
const db=admin.firestore(),out=path.resolve('functions/artifacts/festival-week-oct15');
const plain=x=>JSON.parse(JSON.stringify(x));
const pattern=/\bfest(?:ival)?\b|\b[a-z]+fest\b|\bcarnival\b|\b(?:craft|holiday|christmas|harvest|fall)\s+(?:fair|market)\b|\barts?\s+week\b/i;
try{
 await fs.mkdir(out,{recursive:true});
 const markers=await db.collection('processed_datasets').where('processedAt','>=',admin.firestore.Timestamp.fromDate(new Date('2026-10-08T03:00:00Z'))).limit(101).get();
 assert(markers.size<=100,'Dataset inventory overflow');
 const runs=[],sources=[];
 for(const marker of markers.docs){
  const fileId=marker.id;
  const [lock,checkpoint,batches]=await Promise.all([db.doc('processing_locks/'+fileId).get(),db.doc('checkpoints/'+fileId).get(),db.collection('batch_states').where('fileId','==',fileId).get()]);
  const batch=[...batches.docs].sort((a,b)=>Number(b.get('batchNumber'))-Number(a.get('batchNumber')))[0];
  const gate=verifyFestivalFullRun({fileId,checkpointExists:checkpoint.exists,lock:lock.data(),marker:marker.data(),batch:batch?.data()});
  const run={fileId,processedAt:marker.get('processedAt')?.toDate().toISOString(),gate};runs.push(run);
  if(!gate.ready)continue;
  const snapshots=await db.collection('parse_snapshots').where('fileId','==',fileId).limit(2001).get();assert(snapshots.size<=2000);
  const start=lock.get('startedAt')?.toMillis?.(),end=marker.get('processedAt')?.toMillis?.();
  const latest=new Map();
  for(const doc of snapshots.docs){const s=doc.data(),t=doc.updateTime.toMillis();if(t<start||t>end||s.rowMeta?.dryRun||s.rowMeta?.selectedRows||s.rowMeta?.parserMode!=='full5stage')continue;const old=latest.get(s.uniqueId);if(!old||old.version<t)latest.set(s.uniqueId,{path:doc.ref.path,version:t,...plain(s)});}
  run.snapshotCount=snapshots.size;run.regularSources=latest.size;
  for(const s of latest.values()){
   const format=s.stages?.find(x=>x.stage==='format')?.output;
   const items=format?.stageArtifacts?.stage3Items||[];
   if(!pattern.test(s.inputText||'')&&!items.some(i=>pattern.test(i.name||'')))continue;
   sources.push({fileId,processedAt:run.processedAt,uniqueId:s.uniqueId,inputText:s.inputText,facebookUrl:s.facebookUrl,venueId:s.venueId,rowMeta:s.rowMeta,items,stages:s.stages,snapshotPath:s.path});
  }
 }
 const allEvents=await db.collectionGroup('events').get();assert(allEvents.size<=15000,'Event inventory overflow');
 const events=allEvents.docs.filter(d=>pattern.test([d.get('eventName'),d.get('name'),d.get('description')].filter(Boolean).join(' '))).map(d=>({path:d.ref.path,data:plain(d.data())}));
 const reviews=await db.collection('city_level_event_reviews').get();assert(reviews.size<=3000,'Review inventory overflow');
 const matchingReviews=reviews.docs.filter(d=>pattern.test(JSON.stringify(d.data()))).map(d=>({path:d.ref.path,data:plain(d.data())}));
 const editions=[];
 for(const event of events){const r=reviews.docs.find(d=>d.id===event.data.cityLevelReviewId);if(r){const edition=reviewedFestivalEdition(event,{path:r.ref.path,data:r.data()},'2026-10-15');if(edition)editions.push(edition);}}
 const report={checkedAt:new Date().toISOString(),from:'2026-10-08',asOf:'2026-10-15',runs,sources,events,reviews:matchingReviews,editions,liveWrites:0,paidCalls:0};
 await fs.writeFile(path.join(out,'inventory.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({runs,sources:sources.map(s=>({fileId:s.fileId,id:s.uniqueId,text:s.inputText?.slice(0,750),images:s.rowMeta?.mediaUrls?.length,items:s.items.filter(i=>pattern.test(i.name||'')).map(i=>({name:i.name,date:i.date,time:i.time,venue:i.venue}))})),events:events.map(e=>({path:e.path,title:e.data.eventName||e.data.name,start:e.data.startDate,end:e.data.endDate,scope:e.data.locationScope,locations:e.data.areaData?.locations?.length})),editions:editions.map(e=>({id:e.id,name:e.name})),reviews:matchingReviews.map(r=>({path:r.path,status:r.data.status,name:r.data.eventName||r.data.title})),report:path.join(out,'inventory.json')},null,2));
}finally{await admin.app().delete();}
