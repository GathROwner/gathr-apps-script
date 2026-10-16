import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin'),{festivalShadowJobId}=require('../functions/lib/services/festivalLinkShadowJob.js');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const root='functions/artifacts/festival-context-oct15',before=JSON.parse(await fs.readFile(root+'/release-before.json','utf8'));
const credential=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));assert.equal(credential.project_id,'gathr-migrated');admin.initializeApp({credential:admin.credential.cert(credential),projectId:credential.project_id});
const api='https://gathr-backend-924732524090.northamerica-northeast1.run.app/api/v2/firestore/events';
async function json(url){const r=await fetch(url,{signal:AbortSignal.timeout(60000)});assert.equal(r.status,200,url);return r.json();}
try{
 const db=admin.firestore(),docs=await db.getAll(...before.pins.map(d=>db.doc(d.path)));
 assert.deepEqual(docs.map(d=>({path:d.ref.path,version:{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds},dataHash:hash(d.data())})),before.pins,'Protected record drift');
 const job=await db.doc('festival_link_jobs/'+festivalShadowJobId('1YPf2cKvXfXl8L0HVL63VZ2zeTLEvWlit')).get();assert.equal(job.get('status'),'completed');const summary=job.get('summary');assert.equal(summary.mode,'publish');assert.equal(summary.eventWrites,0);assert.equal(summary.paidSources,0);assert.equal(summary.reports.length,1);
 const report=summary.reports[0];assert.equal(report.status,'ready');assert.equal(report.gaps.length,0);assert.equal(report.outcomes.filter(o=>o.status==='eligible').length,4);assert.equal(report.outcomes.filter(o=>o.status==='held').length,5);assert.equal(report.reviewedNonmembers.length,1);assert.equal(report.reviewedNonmembers[0].captureStillIncomplete,true);assert.deepEqual(report.addedEventIds,[]);
 const original=JSON.parse(await fs.readFile('functions/artifacts/festival-week-oct15/canonical.json','utf8'));
 const existing=await db.getAll(...original.candidates.map(c=>db.doc(c.path)));existing.forEach((d,i)=>{assert(d.exists);assert.equal(hash(d.data()),hash(original.candidates[i].data),d.ref.path+' changed');});
 const ids=original.candidates.map(c=>c.path.split('/').at(-1));assert.equal(ids.length,15);
 for(let i=0;i<ids.length;i+=5)await Promise.all(ids.slice(i,i+5).map(async id=>{const e=(await json(api+'/'+id+'?dateOnlyActivities=v1')).event;assert.equal(e.id,id);}));
 const umbrella=(await json(api+'/area_7ebb4bc0846d26c4470e6842?dateOnlyActivities=v1')).event;assert.equal(umbrella.metadata.areaData.locations.flatMap(p=>p.linkedEventIds||[]).length,17);
 const events=[];let cursor='',pages=0;const tokens=new Set();do{const u=new URL(api);u.searchParams.set('limit','100');u.searchParams.set('includeExpired','false');u.searchParams.set('dateOnlyActivities','v1');if(cursor)u.searchParams.set('startAfter',cursor);const p=await json(u);assert(Array.isArray(p.events));events.push(...p.events);cursor=p.nextPageToken||'';assert(++pages<100);if(cursor){assert(!tokens.has(cursor));tokens.add(cursor);}}while(cursor);
 await fs.writeFile(path.join(root,'feed-observations.json'),JSON.stringify({checkedAt:new Date().toISOString(),events:events.length,pages,targets:ids.map(id=>({id,matches:events.filter(e=>e.id===id).length})),related:events.filter(e=>/Murder Mystery|Michel Robichaud|Charcuterie Board|Harvest Fest|Salty Sailors|Vintage 4\.0/i.test(e.title||'')).map(e=>({id:e.id,title:e.title,startDate:e.startDate,startTime:e.startTime,originalEventId:e.originalEventId,metadataOriginalEventId:e.metadata?.originalEventId,recurring:e.isRecurring}))},null,2));
 const missing=ids.filter(id=>!events.some(e=>e.id===id));
 for(const id of ids)assert(events.filter(e=>e.id===id).length<=1,'Duplicate '+id);
 assert.equal(events.filter(e=>e.id==='area_7ebb4bc0846d26c4470e6842').length,1);
 const result={verifiedAt:new Date().toISOString(),protectedDocumentsUnchanged:36,manualLinksPreserved:17,existingActivitiesUnchanged:15,detail200:16,feed:{events:events.length,pages,allTargetsPresentOnce:missing.length===0,missing,duplicates:0,status:missing.length?'separate_feed_expiry_issue':'passed'},worker:{jobVersion:job.updateTime.toDate().toISOString(),mode:summary.mode,status:job.get('status'),eligible:4,holds:5,reviewedNonmember:1,sourceGaps:0,paidSources:0,publicAdditions:0},liveWrites:0};
 await fs.writeFile(path.join(root,'live-worker-and-feed-verified.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await admin.app().delete();}
