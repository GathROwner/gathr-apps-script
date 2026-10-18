/** Exact approved three-document label refresh. Default read-only; drift aborts. */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const args=process.argv.slice(2);assert(args.every(a=>a==='--apply'));
const apply=args.includes('--apply'),require=createRequire(import.meta.url);
const admin=require('C:/Users/craig/Dev/gathr-apps-script/firebase/node_modules/firebase-admin');
const scorer=require('../functions/artifacts/pool-family-oct18/reviewed-parser/lib/utils/familyFriendlyScoring.js');
assert.equal(scorer.FAMILY_FRIENDLY_SCORING_VERSION,'family-friendly-v7');
const proposal=JSON.parse(await fs.readFile(new URL('../functions/artifacts/pool-family-oct18/reviewed-repair-proposal.json',import.meta.url)));
assert.deepEqual(proposal.targets.map(t=>t.path).sort(),['VdoL6qZ6gnFo3Sw99I4R','fVAKIJWmV21ICSTELKVY','jjOj9C8U4xuOe87fdmGV'].map(id=>'venues/slug_bellaliantcentre/events/'+id).sort());
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const hash=x=>createHash('sha256').update(JSON.stringify(stable(JSON.parse(JSON.stringify(x))))).digest('hex');
const credential=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));assert.equal(credential.project_id,'gathr-migrated');
const app=admin.initializeApp({credential:admin.credential.cert(credential),projectId:credential.project_id}),db=app.firestore();
const file=proposal.activeDataset,feedPath='runtime_metadata/event_feed';
const pins=[...proposal.targets.map(t=>({path:t.path,hash:t.expectedDocumentHash,updateTime:t.expectedUpdateTime})),...proposal.controls,...proposal.sourceSnapshots];
const refs=[...pins.map(p=>db.doc(p.path)),db.doc('venues/slug_bellaliantcentre'),db.doc(feedPath),db.doc('processing_locks/'+file),db.doc('processed_datasets/'+file),db.doc('processing_checkpoints/'+file)];
const locks=db.collection('processing_locks'),batches=db.collection('batch_states').where('fileId','==',file),checkpoints=db.collection('processing_checkpoints').where('fileId','==',file),siblings=db.collection('venues/slug_bellaliantcentre/events');
const sourcePaths=[...proposal.targets,...proposal.controls].map(p=>p.path).sort();
const wrap=d=>({path:d.ref.path,exists:d.exists,updateTime:d.updateTime?.toDate().toISOString(),data:d.exists?d.data():null});
const get=async reader=>{const query=q=>reader===db?q.get():reader.get(q);return {docs:await reader.getAll(...refs),locks:await query(locks),batches:await query(batches),checkpoints:await query(checkpoints),siblings:await query(siblings)};};
const guard=s=>{
 const doc=p=>s.docs.find(d=>d.ref.path===p);
 assert.equal(s.locks.docs.filter(d=>!['completed','failed','cancelled','canceled','released'].includes(d.get('status'))).length,0,'Active parser lock');
 assert.equal(doc('processing_locks/'+file)?.get('status'),'completed');assert(doc('processed_datasets/'+file)?.exists,'No processed marker');
 assert.equal(doc('processed_datasets/'+file).get('stats.errorCount'),0);
 assert(!doc('processing_checkpoints/'+file)?.exists&&s.checkpoints.empty,'Checkpoint remains');
 assert(!s.batches.empty&&s.batches.docs.every(d=>d.get('status')==='completed'&&d.get('currentRowIndex')===d.get('totalRows')),'Final batch incomplete');
 for(const pin of pins){const d=doc(pin.path);assert(d?.exists,'Missing '+pin.path);assert.equal(hash(d.data()),pin.hash,'Document drift '+pin.path);assert.equal(d.updateTime.toDate().toISOString(),pin.updateTime,'Version drift '+pin.path);}
 const matches=s.siblings.docs.filter(d=>JSON.stringify([d.get('uniqueId'),d.get('sourceUniqueId'),d.get('sourceUniqueIds')]).includes('1534850241996227')).map(d=>d.ref.path).sort();
 assert.deepEqual(matches,sourcePaths,'Exact source sibling drift');
 for(const t of proposal.targets){const data=doc(t.path).data();assert.equal(data.startDate,t.startDate);assert.equal(data.startTime,t.startTime);assert.equal(data.endTime,t.endTime);assert.equal(data.eventName||data.name,t.title);assert.deepEqual(scorer.scoreFamilyFriendly(data),t.patch,'Scorer/approved patch mismatch');}
 return doc(feedPath).data().version;
};
const out=new URL('./artifacts/pool-family-oct18/',import.meta.url),stamp=new Date().toISOString().replace(/[:.]/g,'-');
try{
 const before=await get(db),version=guard(before);assert(Number.isSafeInteger(version));await fs.mkdir(out,{recursive:true});
 const plan={targets:proposal.targets.map(t=>({path:t.path,patch:t.patch})),feedBefore:version,feedAfter:version+1,sourcePaths,guardHashes:before.docs.map(d=>({path:d.ref.path,hash:d.exists?hash(d.data()):null}))};
 if(!apply){await fs.writeFile(new URL('reviewed-apply-plan.json',out),JSON.stringify(plan,null,2));console.log(JSON.stringify({status:'dry_run',targetCount:3,score:60,feedBefore:version,feedAfter:version+1,allFingerprintsUnchanged:true,activeParsers:0}));}
 else{
  assert.deepEqual(plan,JSON.parse(await fs.readFile(new URL('reviewed-apply-plan.json',out))),'Dry-run plan drift');
  const release=JSON.parse(await fs.readFile(new URL('../functions/artifacts/pool-family-oct18/release/verified.json',import.meta.url)));assert.equal(release.status,'verified');assert.equal(release.functionCount,6);
  const backup='prewrite-backup-'+stamp+'.json',result='applied-'+stamp+'.json';
  await fs.writeFile(new URL(backup,out),JSON.stringify({at:new Date().toISOString(),plan,documents:before.docs.map(wrap),siblings:before.siblings.docs.map(wrap),locks:before.locks.docs.map(wrap),batches:before.batches.docs.map(wrap)},null,2));
  await fs.writeFile(new URL(result,out),JSON.stringify({status:'prepared',plan,backup},null,2));
  await db.runTransaction(async tx=>{const fresh=await get(tx);assert.equal(guard(fresh),version);for(const p of plan.guardHashes){const d=fresh.docs.find(x=>x.ref.path===p.path);assert.equal(d.exists?hash(d.data()):null,p.hash,'Prewrite drift '+p.path);}for(const t of plan.targets)tx.update(db.doc(t.path),{...t.patch,updatedAt:admin.firestore.FieldValue.serverTimestamp()});tx.update(db.doc(feedPath),{version:version+1,updatedAt:admin.firestore.FieldValue.serverTimestamp()});});
  await fs.writeFile(new URL(result,out),JSON.stringify({status:'applied_pending_verification',plan,backup},null,2));
  const after=await db.getAll(...refs);for(const d of after){const old=before.docs.find(b=>b.ref.path===d.ref.path);assert.equal(d.exists,old.exists);if(!d.exists)continue;const expected=old.data(),actual=d.data(),target=plan.targets.find(t=>t.path===d.ref.path);if(target)Object.assign(expected,target.patch);if(d.ref.path===feedPath)expected.version=version+1;if(target||d.ref.path===feedPath){delete expected.updatedAt;delete actual.updatedAt;}assert.equal(hash(actual),hash(expected),'Unexpected delta '+d.ref.path);}
  await fs.writeFile(new URL(result,out),JSON.stringify({status:'applied',at:new Date().toISOString(),plan,backup,exactDeltaVerified:true,after:after.map(wrap)},null,2));console.log(JSON.stringify({status:'applied',targetCount:3,score:60,feedVersion:version+1,backup,result,exactDeltaVerified:true}));
 }
}finally{await app.delete();}
