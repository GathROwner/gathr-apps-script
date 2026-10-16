// Reviewed source-bound duplicate consolidation. Default dry run; never deletes media or venues.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const admin=require('firebase-admin');
const args=process.argv.slice(2), apply=args.includes('--apply'), planArg=args.find(x=>x.startsWith('--plan='));
assert(args.every(x=>x==='--apply'||x.startsWith('--plan=')));
assert.equal(apply,Boolean(planArg),'Apply requires the exact reviewed saved plan');
const evidenceDir=path.resolve(import.meta.dirname,'../functions/artifacts/city-point-audit-oct16');
const out=path.resolve(import.meta.dirname,'artifacts/city-point-repair-oct16');
await fs.mkdir(out,{recursive:true});
const original=JSON.parse(await fs.readFile(path.join(evidenceDir,'live-evidence.json'),'utf8'));
const trace=JSON.parse(await fs.readFile(path.join(evidenceDir,'trace-evidence.json'),'utf8'));
const key=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));
assert.equal(key.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});
const db=admin.firestore(), plain=x=>JSON.parse(JSON.stringify(x));
const sorted=x=>Array.isArray(x)?x.map(sorted):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,sorted(v)])):x;
const hash=x=>createHash('sha256').update(JSON.stringify(sorted(plain(x)))).digest('hex');
const wrap=d=>({path:d.ref.path,exists:d.exists,version:d.updateTime?{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}:null,data:d.exists?d.data():null});
const uniq=xs=>[...new Set(xs.filter(x=>typeof x==='string'&&x.trim()))];
const museum='DqhaDw4xcuBFIm6WCQSq',irish='slug_irishculturalcentre';
const irelandKeeper='events/location_4a31a72846d2aabe0ca31f21';
const irelandCopies=['events/cityevt_cbb1f0ed500402f7e9d5ede5','events/cityevt_f19b13983b98ad9bc1c310e4'];
const museumCopies=original.events.filter(x=>x.data.uniqueId==='2000138767801772_location').sort((a,b)=>a.data.startDate.localeCompare(b.data.startDate));
assert.equal(museumCopies.length,10);
const museumKeepers=original.events.filter(x=>x.path.startsWith('venues/'+museum+'/events/'));
assert.equal(museumKeepers.length,12);
const provenance=(primary,media)=>({version:1,primarySource:'post_media',primaryField:'relevantImageUrl',primaryUrl:primary,isFallback:false,
 sourceFields:['image','imageUrl','relevantImageUrl','mediaUrls'],media:media.map(url=>({url,source:'post_media',field:'mediaUrls',isPrimary:url===primary,isFallback:false})),
 selectionReason:'source_verified_duplicate_consolidation',updatedBy:'approved_city_point_repair_oct16'});
const withMedia=(data,primary,other)=>{const media=uniq([primary,...(data.mediaUrls||[]),data.imageUrl,data.image,data.relevantImageUrl,...other]);return{imageUrl:primary,image:primary,relevantImageUrl:primary,mediaUrls:media,imageProvenance:provenance(primary,media)};};
const sourceLinks=d=>uniq([...(d.sourceUrls||[]),d.topLevelUrl,d.facebookUrl]);
const dataByPath=new Map(original.events.map(d=>[d.path,d.data]));
const actions=[];
for(const copy of museumCopies){
 const keepers=museumKeepers.filter(k=>k.data.startDate===copy.data.startDate&&k.data.startTime===copy.data.startTime);
 assert.equal(keepers.length,1);const keeper=keepers[0];
 for(const d of [copy.data,keeper.data]){assert.equal(d.venueId,museum);assert.equal(d.startTime,'17:30');assert.equal(d.endTime,'18:30');assert.equal(d.endDate,d.startDate);assert(!/^yes|true$/i.test(String(d.isRecurring||'')));}
 const reviews=trace.city_level_event_reviews.filter(r=>r.data.publishedEventPath===copy.path);
 assert.equal(reviews.length,1);const review=reviews[0];assert.equal(review.data.uniqueId,'2000138767801772');
 actions.push({path:keeper.path,action:'update',patch:{...withMedia(keeper.data,copy.data.imageUrl,copy.data.mediaUrls||[]),
  sourceUniqueIds:uniq([...(keeper.data.sourceUniqueIds||[]),'1528035509358029','2000138767801772']),
  sourceUrls:uniq([...sourceLinks(keeper.data),...sourceLinks(copy.data),...(review.data.sourceUrls||[])])},reason:'Retain exact venue occurrence and first-party poster; corroborate retired duplicate source'});
 actions.push({path:review.path,action:'update',patch:{publishedEventId:keeper.path.split('/').at(-1),publishedEventPath:keeper.path,
  resolvedVenueId:museum,resolvedLocationScope:'venue',resolutionNotes:'Source-verified one-venue candlelight tour; existing dated venue occurrence retained, duplicate root consolidated, source and first-party poster preserved.'},reason:'Redirect resolved source review to retained dated keeper'});
 actions.push({path:copy.path,action:'delete',keeperPath:keeper.path,reason:'Same source-supported venue, date and 17:30–18:30 occurrence already retained'});
}
const ireland=dataByPath.get(irelandKeeper),copies=irelandCopies.map(p=>dataByPath.get(p));
assert(ireland&&copies.every(Boolean));assert.equal(ireland.venueId,irish);
for(const d of [ireland,...copies]){assert.equal(d.startDate,'2026-10-16');assert.equal(d.endDate,'2026-10-16');}
assert.equal(ireland.startTime,'19:30');assert.equal(ireland.endTime,'22:00');assert.equal(copies[0].startTime,'19:00');assert.equal(copies[1].startTime,'18:30');
const irelandReview=trace.city_level_event_reviews.filter(r=>['1408391401435421','1091879233223535','1559194202673746'].includes(r.data.uniqueId));
assert.equal(irelandReview.length,3);
const description="In support of the Global Irish Famine Way, a musical and storytelling journey through Ireland’s history, hosted at the Benevolent Irish Society’s Irish Cultural Centre. The programme explores hardship and rebellion, followed by Irish music, poetry and stories.\n\nDoors open at 6:30 p.m. Tickets: $25.";
actions.push({path:irelandKeeper,action:'update',patch:{locationScope:'venue',locationPrecision:'exact',mapMode:'point',description,
 ...withMedia(ireland,copies[0].imageUrl,copies.flatMap(d=>d.mediaUrls||[])),
 sourceUniqueIds:uniq([...(ireland.sourceUniqueIds||[]),'1559194202673746','1408391401435421','1091879233223535']),
 sourceUrls:uniq([...sourceLinks(ireland),...copies.flatMap(sourceLinks),...irelandReview.flatMap(r=>r.data.sourceUrls||[])]),
 timeFlags:{start:{source:'explicit',evidence:'Original poster: Friday October 16 and Friday October 23, 7:30–10 PM.'},end:{source:'explicit',toClose:false,evidence:'Original poster: 7:30–10 PM.'}},
 timeResolution:{hoursUsed:false}},reason:'Keep source-supported venue/show clock; put doors time in public description; preserve three source galleries'});
for(const r of irelandReview){const patch={status:'published_as_venue_event',publishedEventId:irelandKeeper.split('/').at(-1),publishedEventPath:irelandKeeper,
 resolvedVenueId:irish,resolvedLocationScope:'venue',resolutionNotes:'Poster and BIS source confirm October 16 show 19:30–22:00 at Irish Cultural Centre, doors18:30. Same-show sources consolidated; original structured clock conflicts retained as historical evidence.'};
 if(r.data.finalization)patch.finalization={...r.data.finalization,publishedEventPath:irelandKeeper};
 actions.push({path:r.path,action:'update',patch,reason:'Preserve source review and redirect historical city publication to verified venue keeper'});}
for(const copyPath of irelandCopies)actions.push({path:copyPath,action:'delete',keeperPath:irelandKeeper,reason:'Same October16 show as retained venue event; structured start conflicts resolved by reviewed original poster/BIS evidence'});
const related=d=>{const x=d.data();return x&&([museum,irish].includes(x.venueId)||/beaconsfield.*(?:candle|spooky|haunting)|famine.*freedom/i.test(x.eventName||x.name||''));};
const relatedInventory=docs=>docs.filter(related).map(wrap).sort((a,b)=>a.path.localeCompare(b.path));
const idle=docs=>assert(!docs.some(d=>!['completed','failed','cancelled'].includes(d.get('status'))),'Active parser prevents approved repair');
try{
 const sourcePaths=trace.parse_snapshots.map(s=>s.path),targetPaths=uniq([...actions.map(a=>a.path),'venues/'+museum,'venues/'+irish,'runtime_metadata/event_feed',...sourcePaths]);
 const [refs,all,locks]=await Promise.all([db.getAll(...targetPaths.map(p=>db.doc(p))),db.collectionGroup('events').get(),db.collection('processing_locks').get()]);
 assert(refs.every(d=>d.exists),'Target/reference missing');const refsByPath=new Map(refs.map(d=>[d.ref.path,d]));
 for(const old of [...original.events.filter(e=>actions.some(a=>a.path===e.path)),...trace.city_level_event_reviews.filter(r=>actions.some(a=>a.path===r.path)),...trace.parse_snapshots]){
  assert.equal(hash(refsByPath.get(old.path).data()),hash(old.data),'Captured source/target changed: '+old.path);
 }
 assert.equal(refsByPath.get('venues/'+museum).get('name'),'Beaconsfield Historic House');assert.equal(refsByPath.get('venues/'+irish).get('name'),'Irish Cultural Centre');
 const oldFeed=refsByPath.get('runtime_metadata/event_feed').get('version');assert(Number.isSafeInteger(oldFeed));
 const relatedDocs=relatedInventory(all.docs);
 assert.equal(relatedDocs.filter(d=>d.data.uniqueId==='2000138767801772_location').length,10);
 assert.equal(relatedDocs.filter(d=>d.path.startsWith('venues/'+museum+'/events/')&&String(d.data.uniqueId).startsWith('1528035509358029_')).length,12);
 for(const action of actions.filter(a=>a.action==='delete')){
  const target=refsByPath.get(action.path);assert.equal((await target.ref.listCollections()).length,0,'Delete target has subcollections requiring review');
  assert(!Number(target.get('likes')||0)&&!Number(target.get('shares')||0)&&!Number(target.get('comments')||0),'Delete target has social counters requiring separate review');
 }
 const mediaPins=[];
 for(const [filename,url]of [['location_4f6c94a8e9429d6ccee727c3-1.webp',museumCopies[0].data.imageUrl],['cityevt_cbb1f0ed500402f7e9d5ede5-1.webp',copies[0].imageUrl]]){
  const oldBytes=await fs.readFile(path.join(evidenceDir,filename)),r=await fetch(url,{signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);
  const bytes=Buffer.from(await r.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),createHash('sha256').update(oldBytes).digest('hex'),'Reviewed poster changed');
  mediaPins.push({url,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});
 }
 const feedAction={path:'runtime_metadata/event_feed',action:'update',patch:{version:oldFeed+1},reason:'Refresh client feed after exact approved consolidation'};
 const allActions=[...actions,feedAction];assert.equal(new Set(allActions.map(a=>a.path)).size,allActions.length);
 const documents=refs.map(wrap),plan={version:1,project:key.project_id,actions:allActions,inputsHash:hash(documents),siblingsHash:hash(relatedDocs),mediaPins};
 const stamp=new Date().toISOString().replace(/[:.]/g,'-'),backupPath=path.join(out,'prewrite-backup-'+stamp+'.json');
 await fs.writeFile(backupPath,JSON.stringify({capturedAt:new Date().toISOString(),documents,relatedInventory:relatedDocs,plan},null,2));
 if(!apply){const planPath=path.join(out,'repair-plan-'+stamp+'.json');await fs.writeFile(planPath,JSON.stringify({...plan,backupPath,activeParserPaths:locks.docs.filter(d=>!['completed','failed','cancelled'].includes(d.get('status'))).map(d=>d.ref.path)},null,2));
  console.log(JSON.stringify({mode:'dry-run',planPath,backupPath,deletes:actions.filter(a=>a.action==='delete').length,keeperUpdates:11,reviewUpdates:13,feedVersion:{from:oldFeed,to:oldFeed+1},totalWrites:allActions.length,liveWrites:0}));
 }else{
  idle(locks.docs);const approved=JSON.parse(await fs.readFile(path.resolve(planArg.slice(7)),'utf8'));
  for(const k of ['version','project','actions','inputsHash','siblingsHash','mediaPins'])assert.deepEqual(plan[k],approved[k],'Reviewed plan drift: '+k);
  await db.runTransaction(async tx=>{
   idle((await tx.get(db.collection('processing_locks'))).docs);
   const fresh=await tx.getAll(...refs.map(d=>d.ref));assert.equal(hash(fresh.map(wrap)),plan.inputsHash,'Input drift before write');
   const inventory=await tx.get(db.collectionGroup('events'));assert.equal(hash(relatedInventory(inventory.docs)),plan.siblingsHash,'Related inventory drift');
   for(const a of allActions){const ref=db.doc(a.path);if(a.action==='delete')tx.delete(ref);else tx.update(ref,{...a.patch,updatedAt:admin.firestore.FieldValue.serverTimestamp()});}
  });
  const after=await db.getAll(...refs.map(d=>d.ref));
  for(const d of after){const a=allActions.find(a=>a.path===d.ref.path),before=refsByPath.get(d.ref.path);
   if(a?.action==='delete'){assert(!d.exists,'Deleted duplicate remains');continue;}
   assert(d.exists);const expected=plain(before.data()),actual=plain(d.data());if(a){Object.assign(expected,a.patch);delete expected.updatedAt;delete actual.updatedAt;}assert.deepEqual(actual,expected,'Unexpected delta: '+d.ref.path);
  }
  const resultPath=path.join(out,'applied-'+stamp+'.json');await fs.writeFile(resultPath,JSON.stringify({appliedAt:new Date().toISOString(),approvedPlan:path.resolve(planArg.slice(7)),backupPath,actions:allActions,exactDeltaVerified:true,apiFeedVerification:'required separately'},null,2));
  console.log(JSON.stringify({mode:'applied',resultPath,backupPath,writes:allActions.length,exactDeltaVerified:true,apiFeedVerification:'required separately'}));
 }
}finally{await admin.app().delete();}
