/** Reviewed eight-operation Curling correction. Default dry run. No media writes. */
import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
const args=process.argv.slice(2);assert(args.every(a=>a==='--apply'),'Unexpected option');const apply=args.includes('--apply');
const out=new URL('./artifacts/oct17-curling-siblings/',import.meta.url),e=JSON.parse(await fs.readFile(new URL('curling-live-readback.json',out),'utf8'));
const retiredIds=['A3QGhNGCFKfVvEElf4WB','OIRtvQql4zXietvUNQ2L','jW8Aw7dBxPi1Y9BBUEvR'],registrationIds=['c8LLevWr1BIaAxFyHscb','xeMgDmynvM7nuYntOGtQ'];
const retired=e.events.filter(d=>retiredIds.includes(d.path.split('/').at(-1))),registrations=e.events.filter(d=>registrationIds.includes(d.path.split('/').at(-1)));
assert.equal(retired.length,3);assert.equal(registrations.length,2);assert.equal(e.feed.data.version,302);
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const hash=x=>createHash('sha256').update(JSON.stringify(stable(JSON.parse(JSON.stringify(x))))).digest('hex');
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
const scorer=require('../functions/artifacts/oct17-eight-group-release/parser-release/lib/utils/familyFriendlyScoring.js');
const classifier=require('../functions/artifacts/oct17-eight-group-release/parser-release/lib/services/reviewedOccurrenceConstraints.js');
assert.equal(scorer.FAMILY_FRIENDLY_SCORING_VERSION,'family-friendly-v6');
const sourceUrls=['https://montaguecurling.ca/','https://montague.curling.io/en/events/30555-tuesday-afternoon-u9-juniors','https://montague.curling.io/en/events/30556-thursday-afternoon-juniors-ages-10','https://montague.curling.io/en/events/30558-sunday-afternoon-u9-juniors'];
const rule={sourceUniqueId:'1732518712212204',uniqueIds:retired.map(d=>d.data.uniqueId),reviewId:'oct17-curling-start-conflict',sourceUrls,action:'hold'};
const venuePatch={reviewedOccurrenceConstraints:[...(e.venue.data.reviewedOccurrenceConstraints||[]),rule]};
for(const d of retired)assert.equal(classifier.classifyReviewedOccurrenceConstraint(d.data,{id:e.venue.path.split('/').at(-1),...venuePatch}),'hold');
for(const d of registrations)assert.equal(classifier.classifyReviewedOccurrenceConstraint(d.data,{id:e.venue.path.split('/').at(-1),...venuePatch}),'none');
const holdPath='event_integrity_holds/oct17_curling_programme_start_1732518712212204';
const hold={version:1,status:'held',reason:'programme_commencement_conflicts_with_published_october_recurrence',sourceUniqueIds:['1732518712212204'],sourceUrls,
 originalEvents:retired.map(d=>({path:d.path,event:d.data,sha256:hash(d.data)})),sourceSnapshotPaths:e.snapshots.map(s=>s.path),sourceSnapshotHashes:e.snapshots.map(s=>hash(s.data)),
 evidence:{posterProgrammeStart:'Nov 2nd (no printed year)',websiteSeasonStart:'2026-11-04 (Wednesday, inconsistent with session weekdays)',registrationSessions:[{date:'2026-10-17',start:'13:00',end:'15:00'},{date:'2026-10-25',start:'15:00',end:'17:00'}]},publicReplacement:null};
const operations=[...retired.map(d=>({action:'delete',path:d.path})),{action:'create',path:holdPath,payload:hold},{action:'update',path:e.venue.path,payload:venuePatch},...registrations.map(d=>{
 assert.equal(d.data.recurringPattern,'none');const patch=scorer.scoreFamilyFriendly(d.data);assert.equal(patch.familyFriendlyScore,70);return{action:'update',path:d.path,payload:patch};}),{action:'update',path:e.feed.path,payload:{version:303}}];assert.equal(operations.length,8);
const controls=[e.venue,...e.events,...e.snapshots,e.feed,{path:holdPath,exists:false,data:null,updateTime:null}];
const plan={schema:'oct17-curling-reviewed-season-hold-v1',operations,feedBefore:302,feedAfter:303,sourceSiblingPaths:e.events.map(d=>d.path).sort(),preconditions:controls.map(d=>({path:d.path,exists:d.exists,sha256:d.exists?hash(d.data):null,version:d.updateTime}))};
const credential=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));assert.equal(credential.project_id,'gathr-migrated');
const app=admin.initializeApp({credential:admin.credential.cert(credential),projectId:credential.project_id}),db=app.firestore(),refs=controls.map(d=>db.doc(d.path)),locks=db.collection('processing_locks'),catalog=db.collectionGroup('events');
const roots=d=>[d.uniqueId,d.sourceUniqueId,...(d.sourceUniqueIds||[])].some(v=>String(v||'').split('_')[0]==='1732518712212204');
const wrap=d=>({path:d.ref.path,exists:d.exists,data:d.exists?d.data():null,version:d.updateTime?{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}:null});
const guard=(docs,ls,siblings)=>{assert(ls.docs.every(d=>['completed','failed','cancelled','canceled','released'].includes(d.get('status'))),'Active parser');assert.deepEqual(siblings.docs.filter(d=>roots(d.data())).map(d=>d.ref.path).sort(),plan.sourceSiblingPaths,'Cross-venue sibling drift');
 for(const p of plan.preconditions){const d=docs.find(d=>d.ref.path===p.path);assert(d);assert.equal(d.exists,p.exists,'Existence drift '+p.path);if(d.exists){assert.equal(hash(d.data()),p.sha256,'Document drift '+p.path);assert.deepEqual({seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds},p.version,'Version drift '+p.path);}}};
const decode=v=>Array.isArray(v)?v.map(decode):v&&typeof v==='object'?Object.keys(v).length===2&&Number.isInteger(v._seconds)&&Number.isInteger(v._nanoseconds)?new admin.firestore.Timestamp(v._seconds,v._nanoseconds):Object.fromEntries(Object.entries(v).map(([k,x])=>[k,decode(x)])):v;
try{
 const [docs,ls,siblings]=await Promise.all([db.getAll(...refs),locks.get(),catalog.get()]);guard(docs,ls,siblings);
 if(!apply){await fs.writeFile(new URL('season-hold-reviewed-plan.json',out),JSON.stringify(plan,null,2));console.log(JSON.stringify({status:'dry_run',operations:operations.map(o=>({path:o.path,action:o.action,fields:Object.keys(o.payload||{})})),feedBefore:302,feedAfter:303,sourceSiblings:5,liveWrites:0,paidCalls:0}));}
 else{
  assert.equal(hash(plan),hash(JSON.parse(await fs.readFile(new URL('season-hold-reviewed-plan.json',out),'utf8'))),'Plan drift');
  const stamp=new Date().toISOString().replace(/[:.]/g,'-'),backup='season-hold-prewrite-backup-'+stamp+'.json',result='season-hold-result-'+stamp+'.json';
  await fs.writeFile(new URL(backup,out),JSON.stringify({createdAt:new Date().toISOString(),plan,documents:docs.map(wrap),locks:ls.docs.map(wrap)},null,2));await fs.writeFile(new URL(result,out),JSON.stringify({status:'prepared',backup,plan},null,2));
  await db.runTransaction(async tx=>{const [fresh,fl,fsib]=await Promise.all([tx.getAll(...refs),tx.get(locks),tx.get(catalog)]);guard(fresh,fl,fsib);
   for(const o of operations){const ref=db.doc(o.path);if(o.action==='delete')tx.delete(ref);else if(o.action==='create')tx.create(ref,{...decode(o.payload),createdAt:admin.firestore.FieldValue.serverTimestamp()});else tx.update(ref,{...decode(o.payload),updatedAt:admin.firestore.FieldValue.serverTimestamp()});}});
  await fs.writeFile(new URL(result,out),JSON.stringify({status:'applied_pending_verification',backup,plan},null,2));
  const after=await db.getAll(...refs);for(const d of after){const op=operations.find(o=>o.path===d.ref.path);if(op?.action==='delete'){assert(!d.exists);continue;}assert(d.exists);
   const actual=d.data(),expected=op?.action==='create'?decode(op.payload):{...docs.find(b=>b.ref.path===d.ref.path).data(),...(op?decode(op.payload):{})};
   if(op){delete actual.updatedAt;delete expected.updatedAt;if(op.action==='create'){delete actual.createdAt;delete expected.createdAt;}}assert.equal(hash(actual),hash(expected),'Unexpected delta '+d.ref.path);}
  await fs.writeFile(new URL(result,out),JSON.stringify({status:'applied',backup,plan,verifiedAt:new Date().toISOString(),after:after.map(wrap)},null,2));console.log(JSON.stringify({status:'applied',exactDeltas:8,backup,result,feedVersion:303}));
 }
}finally{await app.delete();}
