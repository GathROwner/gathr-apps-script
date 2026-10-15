// Exact reviewed single-event correction. Default dry run; no replay or media deletion.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
const args=process.argv.slice(2),apply=args.includes('--apply'),planArg=args.find(x=>x.startsWith('--plan='));
assert(args.every(x=>x==='--apply'||x.startsWith('--plan=')));
assert.equal(apply,Boolean(planArg),'Apply requires the exact approved saved plan');
const out=path.resolve(import.meta.dirname,'../functions/artifacts/arts-mixer-oct15');
const captured=JSON.parse(await fs.readFile(path.join(out,'live-evidence.json'),'utf8'));
const eventPath='events/location_4a23fba2153afb4b591c2675';
const reviewPath='city_level_event_reviews/cityevt_1eacc2fb688bed5d5af74314';
const venuePath='venues/slug_confedcentre';
const oldChildPath='venues/slug_confedcentre/events/tzoUblUahp59XP7sgK6H';
const snapshot=captured.snapshots[0];
assert.equal(snapshot.data.uniqueId,'1506646261500744');
const formatted=snapshot.data.stages[0].output.events[0];
assert.equal(formatted.startDate,'2026-10-15');assert.equal(formatted.startTime,'16:00');
assert.equal(formatted.endDate,'2026-10-15');assert.equal(formatted.endTime,'19:00');
assert.equal(formatted.timeFlags.end.source,'explicit');assert.equal(formatted.timeFlags.end.evidence,'4-7 p.m.');
assert(!/Review reasons:|Observed broad location:/i.test(formatted.description));
const changes=[
 {path:eventPath,patch:{locationScope:'venue',locationPrecision:'exact',additionalLocation:'Mavor’s Lounge',
  description:formatted.description+'\n\nVenue: Mavor’s Lounge, Confederation Centre of the Arts.',
  timeFlags:formatted.timeFlags,timeResolution:formatted.timeResolution}},
 {path:reviewPath,patch:{resolvedVenueId:'slug_confedcentre',resolvedLocationScope:'venue',
  resolutionNotes:'Single October 15 Arts Mixer at Mavor’s Lounge inside Confederation Centre. Anchor Fest downtown programme is partnership context, not a second event location. Source explicitly prints 4–7 p.m.; parser time provenance restored to the existing publication.'}},
];
const key=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));
assert.equal(key.project_id,'gathr-migrated');admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});
const db=admin.firestore(),plain=x=>JSON.parse(JSON.stringify(x));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const wrap=d=>({path:d.ref.path,exists:d.exists,updateTime:d.updateTime?.toDate().toISOString(),version:d.updateTime?{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}:null,data:d.data()});
try{
 const [docs,locks,occurrences]=await Promise.all([
  db.getAll(...[eventPath,reviewPath,venuePath,oldChildPath,snapshot.path].map(p=>db.doc(p))),
  db.collection('processing_locks').get(),db.collectionGroup('events').where('startDate','==','2026-10-15').get()]);
 const [event,review,venue,oldChild,source]=docs;
 assert(event.exists&&review.exists&&venue.exists&&source.exists);
 assert.equal(event.get('venueId'),'slug_confedcentre');assert.equal(event.get('uniqueId'),'1506646261500744_location');
 assert.equal(event.get('eventName'),'arts mixers');assert.equal(event.get('locationScope'),'city');
 for(const k of ['startDate','startTime','endDate','endTime']) assert.equal(event.get(k),formatted[k]);
 assert.equal(review.get('publishedEventPath'),eventPath);assert.equal(review.get('status'),'published_as_venue_event');
 assert.equal(venue.get('name'),'Confederation Centre of the Arts');assert(!oldChild.exists,'Old duplicate reappeared');
 assert.equal(hash(source.data()),hash(snapshot.data),'Source snapshot changed');
 const siblings=occurrences.docs.filter(d=>d.get('venueId')==='slug_confedcentre'||/arts.?mixer/i.test(d.get('eventName')||'')).map(wrap).sort((a,b)=>a.path.localeCompare(b.path));
 assert.equal(siblings.filter(d=>/arts.?mixer/i.test(d.data.eventName||'')).length,1,'New mixer duplicate requires review');
 const active=locks.docs.filter(d=>!['completed','failed','cancelled'].includes(d.get('status')));
 const inputs=docs.map(wrap),plan={version:1,project:key.project_id,changes,inputHash:hash(inputs),siblingsHash:hash(siblings)};
 const stamp=new Date().toISOString().replace(/[:.]/g,'-');
 const backupPath=path.join(out,`repair-backup-${stamp}.json`);
 await fs.writeFile(backupPath,JSON.stringify({capturedAt:new Date().toISOString(),documents:inputs,siblings,changes},null,2));
 if(!apply){
  const planPath=path.join(out,`repair-plan-${stamp}.json`);
  await fs.writeFile(planPath,JSON.stringify({...plan,backupPath,activeParserPaths:active.map(d=>d.ref.path)},null,2));
  console.log(JSON.stringify({mode:'dry-run',planPath,backupPath,changes,eventIdUnchanged:true,activeParser:active.length>0,liveWrites:0}));
 }else{
  assert.equal(active.length,0,'Active parse prevents live repair');
  const approved=JSON.parse(await fs.readFile(path.resolve(planArg.slice(7)),'utf8'));
  for(const k of ['version','project','changes','inputHash','siblingsHash'])assert.deepEqual(plan[k],approved[k],'Approved plan drift: '+k);
  await db.runTransaction(async tx=>{
   const freshLocks=await tx.get(db.collection('processing_locks'));
   assert(!freshLocks.docs.some(d=>!['completed','failed','cancelled'].includes(d.get('status'))),'Parser became active');
   const fresh=await Promise.all(docs.map(d=>tx.get(d.ref)));
   fresh.forEach((d,i)=>assert.equal(hash(wrap(d)),hash(wrap(docs[i])),'Input changed: '+d.ref.path));
   const freshOccurrences=await tx.get(db.collectionGroup('events').where('startDate','==','2026-10-15'));
   const related=freshOccurrences.docs.filter(d=>d.get('venueId')==='slug_confedcentre'||/arts.?mixer/i.test(d.get('eventName')||'')).map(wrap).sort((a,b)=>a.path.localeCompare(b.path));
   assert.equal(hash(related),plan.siblingsHash,'Occurrence changed before write');
   for(const c of changes)tx.update(db.doc(c.path),{...c.patch,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
  });
  const after=await db.getAll(...docs.map(d=>d.ref));
  for(let i=0;i<after.length;i++){
   const c=changes.find(c=>c.path===after[i].ref.path);
   const expected=plain(docs[i].data()),actual=plain(after[i].data());
   if(c){Object.assign(expected,c.patch);delete expected.updatedAt;delete actual.updatedAt;}
   assert.deepEqual(actual,expected,'Unexpected live delta: '+after[i].ref.path);
  }
  const base='https://gathr-backend-924732524090.northamerica-northeast1.run.app/api/v2/firestore/events';
  const request=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(30000),headers:{'Cache-Control':'no-cache'}});assert.equal(r.status,200);return r.json();};
  const detail=(await request(base+'/'+event.id)).event;
  assert.equal(detail.locationScope,'venue');assert.equal(detail.venueId,'slug_confedcentre');
  assert.equal(detail.endTime,'19:00');assert.equal(detail.metadata.timeFlags.end.source,'explicit');
  assert(!/Review reasons:|Observed broad location:/i.test(detail.description));
  const matches=[];let cursor='',pages=0;const seen=new Set();
  do{
   const url=new URL(base);url.searchParams.set('includeExpired','false');url.searchParams.set('limit','100');if(cursor)url.searchParams.set('startAfter',cursor);
   const page=await request(url);assert(Array.isArray(page.events));matches.push(...page.events.filter(e=>e.id===event.id));
   cursor=page.nextPageToken||'';assert(++pages<100);if(cursor){assert(!seen.has(cursor));seen.add(cursor);}
  }while(cursor);
  assert.equal(matches.length,1);assert.equal(matches[0].locationScope??matches[0].metadata?.locationScope,'venue');
  const resultPath=path.join(out,`repair-result-${stamp}.json`);
  await fs.writeFile(resultPath,JSON.stringify({verifiedAt:new Date().toISOString(),backupPath,changes,exactDeltaVerified:true,detailVerified:true,feedCount:1,pages},null,2));
  console.log(JSON.stringify({mode:'applied',resultPath,backupPath,liveWrites:2,verified:true}));
 }
}finally{await admin.app().delete();}
