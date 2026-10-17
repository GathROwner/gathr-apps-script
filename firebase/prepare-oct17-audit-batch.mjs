/** Read-only live reconciliation of the approved October17 audit scope. */
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
const scoring=require('../functions/artifacts/oct17-eight-group-release/parser-release/lib/utils/familyFriendlyScoring.js');
assert.equal(scoring.FAMILY_FRIENDLY_SCORING_VERSION,'family-friendly-v6','Build the final parser assembly first');
const base='C:/Users/craig/.codex/worktrees/',audit=base+'luna-accounting-release/gathr-apps-script/functions/artifacts/luna-oct17-production-audit/';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const [session,category,capturedEvents,capturedVenues,capturedReviews,snapshots,input,completion]=await Promise.all([
 read(base+'c0ca/gathr-apps-script/firebase/artifacts/oct16-eight-group/oct17-session-identity/live-plan.json'),
 read(base+'2f89/gathr-apps-script/functions/tmp/oct17-category-family/repair-plan.json'),
 read(audit+'live-events.json'),read(audit+'venues.json'),read(audit+'city-reviews.json'),read(audit+'snapshots.json'),read(audit+'input-rows.json'),read(audit+'completion.json')]);
assert(session.readyForCoordinatorReview&&session.holds.length===0);assert.equal(category.targets.length,5);
const credential=await read(process.env.ANCHOR_CREDENTIAL_PATH);assert.equal(credential.project_id,'gathr-migrated');
const app=admin.initializeApp({credential:admin.credential.cert(credential),projectId:credential.project_id}),db=app.firestore();
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(canonical(JSON.parse(JSON.stringify(v))))).digest('hex');
const semantic=d=>Object.fromEntries(Object.entries(d).filter(([k])=>!['updatedAt','createdAt','lastSeenAt','likes','shares','topReactionsCount','comments'].includes(k)));
const root=x=>String(x||'').split('_')[0],roots=d=>[d.uniqueId,d.sourceUniqueId,...(d.sourceUniqueIds||[])].map(root);
const fileId='1JFQdQB-pAXdAb0usJhNFf5mrWnWyBd7g',runId='24bd52c0-fe67-4c1e-929c-ada0766febe6';
try{
 const [events,venues,reviews,locks,feed]=await Promise.all([db.collectionGroup('events').get(),db.collection('venues').get(),
  db.collection('city_level_event_reviews').get(),db.collection('processing_locks').get(),db.doc('runtime_metadata/event_feed').get()]);
 assert(locks.docs.every(d=>['completed','failed','cancelled','canceled','released'].includes(d.get('status'))),'Active parser');
 assert(feed.exists&&Number.isSafeInteger(feed.get('version')));
 const live=new Map([...events.docs,...venues.docs,...reviews.docs,feed].map(d=>[d.ref.path,d]));
 const readPaths=new Set(),operations=[],sourceRoots=new Set(),alreadyAbsent=[];
 const exact=(p,old,optional=false)=>{const d=live.get(p);readPaths.add(p);if(!d?.exists){assert(optional,'Missing target '+p);alreadyAbsent.push(p);return null;}
  assert(old,'Missing captured identity '+p);assert.equal(hash(semantic(d.data())),hash(semantic(old.data)),'Decision/source drift '+p);return d;};
 const add=o=>{assert(!operations.some(x=>x.path===o.path),'Duplicate operation '+o.path);operations.push(o);readPaths.add(o.path);};
 for(const o of session.operations){
  if(o.action==='create'){
   assert(!live.has(o.path),'Restore already exists');const raw=input.find(r=>String(r.postId)==='1733964295400114');assert(raw);
   const payload=scoring.withFamilyFriendlyScore({...o.payload,likes:Number(raw.likes||0),shares:Number(raw.shares||0),topReactionsCount:Number(raw.topReactionsCount||0)});
   add({action:'create',path:o.path,payload,timestampFields:['createdAt','updatedAt','lastSeenAt']});
  }else{
   const old=[...capturedEvents,...capturedVenues].find(d=>d.path===o.path);exact(o.path,old);
   const payload=o.path.includes('/events/nOz8TgJISaSmdkMUVNzY')?{...o.payload,...Object.fromEntries(Object.entries(scoring.withFamilyFriendlyScore({...old.data,...o.payload})).filter(([k])=>k.startsWith('familyFriendly')||k==='familyAudienceEvidence'))}:o.payload;
   add({action:o.action,path:o.path,...(payload?{payload}:{}),...(o.action==='update'&&o.path.includes('/events/')?{timestampFields:['updatedAt']}:{} )});
  }
 }
 for(const t of category.targets){exact(t.path,capturedEvents.find(d=>d.path===t.path));
  const payload={...t.patch};if(t.path.endsWith('/NvtBo0lQs208nlxrHSYH'))Object.assign(payload,{isRecurring:'Yes',recurringPattern:'weekly_saturday'});
  add({action:'update',path:t.path,payload,timestampFields:['updatedAt']});
 }
 for(const spec of [
  {id:'2DjVdRAtNrcyKPPgjjQU',sid:'1118550040924946',hold:'oct17_coats_distribution_1118550040924946',reason:'attendance_venue_unstated_collection_partner_only'},
  {id:'dqtPfabTkUTz0dn2pHVW',sid:'1720610070064632',hold:'oct17_mothlane_clock_1720610070064632',reason:'conflicting_advertised_start_and_occurrence_evidence'},
 ]){
  const old=capturedEvents.find(d=>d.id===spec.id);assert(old);const current=exact(old.path,old,spec.id==='dqtPfabTkUTz0dn2pHVW');
  const venuePath=old.path.split('/events/')[0],v=exact(venuePath,capturedVenues.find(d=>d.path===venuePath));
  assert(roots(old.data).includes(spec.sid));assert(root(old.data.uniqueId)===spec.sid);
  const urls=old.data.sourceUrls?.filter(u=>u.includes(spec.sid));assert(urls?.length,'Exact source URL missing');
  const rule={sourceUniqueId:spec.sid,uniqueIds:[old.data.uniqueId],reviewId:'oct17-audit-source-hold',sourceUrls:urls,action:'hold'};
  const constraints=[...(v.get('reviewedOccurrenceConstraints')||[]),rule];assert(constraints.length<=32);
  add({action:'update',path:venuePath,payload:{reviewedOccurrenceConstraints:constraints}});
  const source=snapshots.find(s=>s.data.uniqueId===spec.sid);assert(source);readPaths.add(source.path);
  add({action:'create',path:'event_integrity_holds/'+spec.hold,payload:{version:1,status:'held',reason:spec.reason,
   originalEventPath:old.path,sourceUniqueIds:[spec.sid],sourceSnapshotPath:source.path,sourceUrls:urls,
   originalEvent:old.data,sourceCaptureSha256:hash(source.data),publicReplacement:null},timestampFields:['createdAt']});
  if(current)add({action:'delete',path:old.path});
 }
 for(const p of session.preconditions)readPaths.add(p.path);
 for(const t of category.targets)sourceRoots.add(t.sourceRoot);
 for(const d of [...capturedEvents].filter(d=>session.operations.some(o=>o.path===d.path)||category.targets.some(t=>t.path===d.path)))roots(d.data).filter(Boolean).forEach(r=>sourceRoots.add(r));
 ['1733964295400114','1629374475648571','1657280322681436','1855093525983557','1726522892816557','1565799665587565','1566791205488411','1118550040924946','1720610070064632'].forEach(r=>sourceRoots.add(r));
 const related=events.docs.filter(d=>roots(d.data()).some(r=>sourceRoots.has(r)));
 const oldPaths=capturedEvents.filter(d=>roots(d.data).some(r=>sourceRoots.has(r))).map(d=>d.path).filter(p=>!alreadyAbsent.includes(p)).sort();
 assert.deepEqual(related.map(d=>d.ref.path).sort(),oldPaths,'Exact source sibling set drifted');
 related.forEach(d=>readPaths.add(d.ref.path));
 const heldReviews=capturedReviews.filter(d=>d.data.uniqueId==='1735968125204476');assert.equal(heldReviews.length,6);
 for(const r of heldReviews){exact(r.path,r);assert.equal(live.get(r.path).get('status'),'needs_review');}
 readPaths.add('unrecognized_venues/uv_9532e4fe995e32f35d902f3e');
 const finalBatchPath=completion.batches.filter(x=>x.data.status==='completed').sort((a,b)=>(b.data.batchNumber||0)-(a.data.batchNumber||0))[0].path;
 [finalBatchPath,'processed_datasets/'+fileId,'processing_locks/'+fileId].forEach(p=>readPaths.add(p));
 const sourceSnapshots=snapshots.filter(s=>s.data.fileId===fileId&&sourceRoots.has(s.data.uniqueId));
 sourceSnapshots.forEach(s=>readPaths.add(s.path));
 add({action:'update',path:'runtime_metadata/event_feed',payload:{version:feed.get('version')+1},timestampFields:['updatedAt']});
 const docs=await db.getAll(...[...readPaths].sort().map(p=>db.doc(p)));
 for(const source of sourceSnapshots){const current=docs.find(d=>d.ref.path===source.path);assert(current?.exists&&hash(current.data())===hash(source.data),'Captured source changed: '+source.path);}
 const plan={schema:'oct17-audit-approved-batch-v1',preparedAt:new Date().toISOString(),fileId,runId,finalBatchPath,
  sourceRoots:[...sourceRoots].sort(),sourceSiblingPaths:related.map(d=>d.ref.path).sort(),alreadyAbsent,
  operations,preconditions:docs.map(d=>({path:d.ref.path,exists:d.exists,...(d.exists?{sha256:hash(d.data()),version:{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}}:{} )})),
  retainedHolds:{cfcyReviews:heldReviews.map(d=>d.path),sobeys:'unrecognized_venues/uv_9532e4fe995e32f35d902f3e',festival:'source/edition evidence remains held'},liveWrites:0,paidCalls:0};
 const dir=path.resolve('firebase/artifacts/oct17-eight-group');await fs.mkdir(dir,{recursive:true});
 const output=path.join(dir,'reviewed-plan-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');const bytes=JSON.stringify(plan,null,2);
 await fs.writeFile(output,bytes);console.log(JSON.stringify({output,sha256:createHash('sha256').update(bytes).digest('hex'),counts:operations.reduce((a,o)=>(a[o.action]=(a[o.action]||0)+1,a),{}),feedBefore:feed.get('version'),feedAfter:feed.get('version')+1,alreadyAbsent,readSet:docs.length,liveWrites:0}));
}finally{await app.delete();}
