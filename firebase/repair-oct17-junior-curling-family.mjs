/** Exact family-score refresh; no timing, recurrence, source, image or venue changes. */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const args=process.argv.slice(2);assert(args.every(a=>a==='--apply'),'Only --apply is supported');
const apply=args.includes('--apply'),target='venues/1ehK5wrBKC460QSpqUMq/events/A3QGhNGCFKfVvEElf4WB';
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
const scorer=require('../functions/artifacts/oct17-eight-group-release/parser-release/lib/utils/familyFriendlyScoring.js');
assert.equal(scorer.FAMILY_FRIENDLY_SCORING_VERSION,'family-friendly-v6');
const evidence=JSON.parse(await fs.readFile(new URL('./artifacts/oct17-remaining-followups/housekeeping-readback.json',import.meta.url),'utf8'));
const old=evidence.events.find(e=>e.path===target);assert(old);
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const hash=x=>createHash('sha256').update(JSON.stringify(stable(JSON.parse(JSON.stringify(x))))).digest('hex');
assert.equal(old.data.uniqueId,'1732518712212204_98935f72d5b053d0');assert.equal(old.data.startTime,'15:30');
assert.equal(old.data.recurringPattern,'weekly_thursday');assert.equal(old.data.familyFriendlyScore,15);
assert.equal(old.data.familyFriendlyScoringVersion,'family-friendly-v4');
assert(evidence.snapshots.length===2&&evidence.snapshots.every(s=>s.data.inputText.startsWith('Looking for an affordable, social and fun winter activity for your kids?! Check out Junior Curling!')));
const patch=scorer.scoreFamilyFriendly(old.data);assert.equal(patch.familyFriendlyScore,70);assert.equal(patch.familyFriendlyLevel,'likely');
const credential=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));assert.equal(credential.project_id,'gathr-migrated');
const app=admin.initializeApp({credential:admin.credential.cert(credential),projectId:credential.project_id}),db=app.firestore();
const out=new URL('./artifacts/oct17-remaining-followups/',import.meta.url),stamp=new Date().toISOString().replace(/[:.]/g,'-');
const wrap=d=>({path:d.ref.path,exists:d.exists,data:d.exists?d.data():null,updateTime:d.updateTime?{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}:null});
const paths=[...new Set([target,evidence.venue.path,...evidence.events.map(e=>e.path),...evidence.snapshots.map(s=>s.path),'runtime_metadata/event_feed'])];
const refs=paths.map(p=>db.doc(p)),locks=db.collection('processing_locks');
const guard=(docs,lockDocs)=>{
 const active=lockDocs.filter(d=>!['completed','failed','cancelled','canceled','released'].includes(d.get('status')));assert.equal(active.length,0,'Active parser');
 for(const e of [evidence.venue,...evidence.events,...evidence.snapshots,evidence.feed]){
  const live=docs.find(d=>d.ref.path===e.path);assert(live?.exists,'Missing '+e.path);assert.equal(hash(live.data()),hash(e.data),'Source/document drift '+e.path);
 }
};
try {
 const [docs,lockset,siblings]=await Promise.all([db.getAll(...refs),locks.get(),db.collection('venues/1ehK5wrBKC460QSpqUMq/events').get()]);
 guard(docs,lockset.docs);
 const sourcePaths=siblings.docs.filter(d=>String(d.get('uniqueId')||'').startsWith('1732518712212204')).map(d=>d.ref.path).sort();
 assert.deepEqual(sourcePaths,evidence.events.map(d=>d.path).sort(),'Exact source sibling drift');
 const version=evidence.feed.data.version;assert(Number.isSafeInteger(version));
 const plan={target,patch,feedBefore:version,feedAfter:version+1,exactSourceSiblings:sourcePaths,untouchedSiblingCount:evidence.events.length-1,backup:null};
 await fs.mkdir(out,{recursive:true});
 if(!apply){await fs.writeFile(new URL('junior-family-reviewed-plan.json',out),JSON.stringify(plan,null,2));console.log(JSON.stringify({status:'dry_run',...plan,liveWrites:0}));}
 else {
  const approved=JSON.parse(await fs.readFile(new URL('junior-family-reviewed-plan.json',out),'utf8'));assert.equal(hash(plan),hash(approved),'Dry-run plan drift');
  const backup='junior-family-prewrite-backup-'+stamp+'.json',result='junior-family-result-'+stamp+'.json';plan.backup=backup;
  await fs.writeFile(new URL(backup,out),JSON.stringify({createdAt:new Date().toISOString(),plan,documents:docs.map(wrap),locks:lockset.docs.map(wrap)},null,2));
  await fs.writeFile(new URL(result,out),JSON.stringify({status:'prepared',plan},null,2));
  await db.runTransaction(async tx=>{
   const fresh=await tx.getAll(...refs),freshLocks=await tx.get(locks),freshSiblings=await tx.get(db.collection('venues/1ehK5wrBKC460QSpqUMq/events'));
   guard(fresh,freshLocks.docs);assert.deepEqual(freshSiblings.docs.filter(d=>String(d.get('uniqueId')||'').startsWith('1732518712212204')).map(d=>d.ref.path).sort(),sourcePaths);
   tx.update(db.doc(target),{...patch,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
   tx.update(db.doc('runtime_metadata/event_feed'),{version:version+1,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
  });
  await fs.writeFile(new URL(result,out),JSON.stringify({status:'applied_pending_verification',plan},null,2));
  const after=await db.getAll(...refs);
  for(const d of after){const before=docs.find(b=>b.ref.path===d.ref.path).data(),actual=d.data();
   if(d.ref.path===target)Object.assign(before,patch);
   if(d.ref.path==='runtime_metadata/event_feed')before.version=version+1;
   if([target,'runtime_metadata/event_feed'].includes(d.ref.path)){delete before.updatedAt;delete actual.updatedAt;}
   assert.equal(hash(actual),hash(before),'Unexpected delta '+d.ref.path);
  }
  await fs.writeFile(new URL(result,out),JSON.stringify({status:'applied',verifiedAt:new Date().toISOString(),plan,after:after.map(wrap),verifiedExactDeltas:true},null,2));
  console.log(JSON.stringify({status:'applied',target,familyScore:70,version:version+1,untouchedSiblings:evidence.events.length-1,backup,result}));
 }
}finally{await app.delete();}
