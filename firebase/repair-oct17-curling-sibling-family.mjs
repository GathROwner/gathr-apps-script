/** Exact four-record family metadata refresh. Default dry run; timing is untouched. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const args=process.argv.slice(2);assert(args.every(a=>a==='--apply'),'Unexpected option');
const apply=args.includes('--apply'),out=new URL('./artifacts/oct17-curling-siblings/',import.meta.url);
const evidence=JSON.parse(await fs.readFile(new URL('curling-live-readback.json',out),'utf8'));
const targets=new Map([['OIRtvQql4zXietvUNQ2L',100],['c8LLevWr1BIaAxFyHscb',70],['jW8Aw7dBxPi1Y9BBUEvR',100],['xeMgDmynvM7nuYntOGtQ',70]]);
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
const scorer=require('../functions/artifacts/oct17-eight-group-release/parser-release/lib/utils/familyFriendlyScoring.js');
assert.equal(scorer.FAMILY_FRIENDLY_SCORING_VERSION,'family-friendly-v6');
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const hash=x=>createHash('sha256').update(JSON.stringify(stable(JSON.parse(JSON.stringify(x))))).digest('hex');
const roots=d=>[d.uniqueId,d.sourceUniqueId,...(d.sourceUniqueIds||[])].some(x=>String(x||'').split('_')[0]==='1732518712212204');
assert.equal(evidence.events.length,5);assert.equal(evidence.snapshots.length,2);assert.equal(evidence.feed.data.version,302);
assert(evidence.snapshots.every(s=>s.data.inputText.startsWith('Looking for an affordable, social and fun winter activity for your kids?! Check out Junior Curling!')));
const operations=evidence.events.filter(d=>targets.has(d.path.split('/').at(-1))).map(d=>{
 assert(roots(d.data));assert.equal(d.data.familyFriendlyScore,15);assert.equal(d.data.familyFriendlyScoringVersion,'family-friendly-v4');
 const patch=scorer.scoreFamilyFriendly(d.data);assert.equal(patch.familyFriendlyScore,targets.get(d.path.split('/').at(-1)));
 assert(Object.keys(patch).every(k=>k.startsWith('familyFriendly')),'Non-family field');
 return {path:d.path,name:d.data.name,patch};
});assert.equal(operations.length,4);
const controls=[evidence.venue,...evidence.events,...evidence.snapshots,evidence.feed];
const plan={schema:'oct17-curling-four-family-v1',operations,feedBefore:302,feedAfter:303,sourceSiblingPaths:evidence.events.map(d=>d.path).sort(),preconditions:controls.map(d=>({path:d.path,sha256:hash(d.data),version:d.updateTime}))};
const credential=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));assert.equal(credential.project_id,'gathr-migrated');
const app=admin.initializeApp({credential:admin.credential.cert(credential),projectId:credential.project_id}),db=app.firestore();
const refs=controls.map(d=>db.doc(d.path)),locks=db.collection('processing_locks'),catalog=db.collectionGroup('events');
const wrap=d=>({path:d.ref.path,exists:d.exists,data:d.exists?d.data():null,version:d.updateTime?{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}:null});
const guard=(docs,lockset,siblings)=>{
 assert(lockset.docs.every(d=>['completed','failed','cancelled','canceled','released'].includes(d.get('status'))),'Active parser');
 assert.deepEqual(siblings.docs.filter(d=>roots(d.data())).map(d=>d.ref.path).sort(),plan.sourceSiblingPaths,'Cross-venue source sibling drift');
 for(const p of plan.preconditions){const live=docs.find(d=>d.ref.path===p.path);assert(live?.exists,'Missing '+p.path);assert.equal(hash(live.data()),p.sha256,'Document drift '+p.path);
  assert.deepEqual({seconds:live.updateTime.seconds,nanoseconds:live.updateTime.nanoseconds},p.version,'Version drift '+p.path);}
};
try{
 const [docs,lockset,siblings]=await Promise.all([db.getAll(...refs),locks.get(),catalog.get()]);guard(docs,lockset,siblings);
 if(!apply){await fs.writeFile(new URL('four-family-reviewed-plan.json',out),JSON.stringify(plan,null,2));console.log(JSON.stringify({status:'dry_run',operations,feedBefore:302,feedAfter:303,untouchedReadSet:controls.length-5,liveWrites:0}));}
 else{
  const approved=JSON.parse(await fs.readFile(new URL('four-family-reviewed-plan.json',out),'utf8'));assert.equal(hash(plan),hash(approved),'Plan drift');
  const stamp=new Date().toISOString().replace(/[:.]/g,'-'),backup='four-family-prewrite-backup-'+stamp+'.json',result='four-family-result-'+stamp+'.json';
  await fs.writeFile(new URL(backup,out),JSON.stringify({createdAt:new Date().toISOString(),plan,documents:docs.map(wrap),sourceSiblings:siblings.docs.filter(d=>roots(d.data())).map(wrap),locks:lockset.docs.map(wrap)},null,2));
  await fs.writeFile(new URL(result,out),JSON.stringify({status:'prepared',backup,plan},null,2));
  await db.runTransaction(async tx=>{
   const [fresh,freshLocks,freshSiblings]=await Promise.all([tx.getAll(...refs),tx.get(locks),tx.get(catalog)]);guard(fresh,freshLocks,freshSiblings);
   for(const o of operations)tx.update(db.doc(o.path),{...o.patch,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
   tx.update(db.doc(evidence.feed.path),{version:303,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
  });
  await fs.writeFile(new URL(result,out),JSON.stringify({status:'applied_pending_verification',backup,plan},null,2));
  const after=await db.getAll(...refs);
  for(const d of after){const expected=JSON.parse(JSON.stringify(controls.find(e=>e.path===d.ref.path).data)),actual=d.data();assert(d.exists);
   const op=operations.find(o=>o.path===d.ref.path);if(op)Object.assign(expected,op.patch);if(d.ref.path===evidence.feed.path)expected.version=303;
   if(op||d.ref.path===evidence.feed.path){delete expected.updatedAt;delete actual.updatedAt;}assert.equal(hash(actual),hash(expected),'Unexpected delta '+d.ref.path);}
  await fs.writeFile(new URL(result,out),JSON.stringify({status:'applied',backup,plan,verifiedAt:new Date().toISOString(),after:after.map(wrap)},null,2));
  console.log(JSON.stringify({status:'applied',backup,result,exactDeltas:5,feedVersion:303}));
 }
}finally{await app.delete();}
