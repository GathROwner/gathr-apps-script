// Exact one-record recovery; default dry run. Apply requires the approved API
// delivery commit to be live and a separately reviewed compatible Preview rollout.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
import {dateOnlyActivity} from '../functions/lib/parsing/dateOnlyActivity.js';
const args=process.argv.slice(2),apply=args.includes('--apply'),planArg=args.find(a=>a.startsWith('--plan='));
assert(args.every(a=>a==='--apply'||a.startsWith('--plan=')));assert.equal(apply,Boolean(planArg));
const target='venues/slug_confedcentre/events/bqk2pKnr1HHZQvhaz6Qo',venue='venues/slug_confedcentre';
const source='parse_snapshots/1YPf2cKvXfXl8L0HVL63VZ2zeTLEvWlit_337_1792072477009',sourceId='1512432880922082';
const feedMarker='runtime_metadata/event_feed';
const originalPoster='https://storage.googleapis.com/gathr-uploaded-images/postimages/1792072443037-pyz1xz.webp';
const official='https://confederationcentre.com/on-stage/submissions-auditions/';
const out=path.resolve(import.meta.dirname,'../functions/artifacts/oct15-sequential-repairs/auditions');
const plain=x=>JSON.parse(JSON.stringify(x)),hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const wrap=d=>({path:d.ref.path,exists:d.exists,version:d.updateTime?{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}:null,data:d.exists?plain(d.data()):null});
const related=d=>d.ref.path.startsWith(venue+'/events/')||String(d.get('uniqueId')||'').startsWith(sourceId+'_')||(d.get('sourceUniqueIds')||[]).includes(sourceId);
const siblings=docs=>docs.filter(related).map(wrap).sort((a,b)=>a.path.localeCompare(b.path));
const idle=docs=>assert(!docs.some(d=>!['completed','failed','cancelled','canceled','released'].includes(String(d.get('status')||''))),'Active parser blocks recovery');
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
const key=JSON.parse(await fs.readFile(process.env.GATHR_SERVICE_ACCOUNT_PATH,'utf8'));assert.equal(key.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});const db=admin.firestore();
try{
 const [refs,all,locks,website,image]=await Promise.all([db.getAll(db.doc(target),db.doc(venue),db.doc(source),db.doc(feedMarker)),db.collectionGroup('events').get(),db.collection('processing_locks').get(),fetch(official,{signal:AbortSignal.timeout(20000)}),fetch(originalPoster,{signal:AbortSignal.timeout(20000)})]);
 idle(locks.docs);assert(refs.every(d=>d.exists));assert.equal(website.status,200);assert.equal(image.status,200);
 const html=await website.text(),text=html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');assert(/Monday, October 26\s*\(evening\)/i.test(text));
 const data=plain(refs[0].data());assert.equal(data.eventName,'GENERAL MUSICAL THEATRE AUDITIONS FOR PEI RESIDENTS');assert.equal(data.startDate,'2026-10-26');assert.equal(data.endDate,'2026-10-27');assert.equal(data.startTime,'08:00');assert.equal(data.endTime,'01:00');assert.equal(data.isRecurring,'No');assert(!data.timing);assert.equal(refs[2].get('uniqueId'),sourceId);assert(/evening of Monday, October 26/i.test(refs[2].get('inputText')));assert(String(data.uniqueId).startsWith(sourceId+'_'));
 assert.deepEqual(data.mediaUrls,[originalPoster]);assert(data.imageProvenance.media.some(m=>m.url===originalPoster&&m.source==='post_media'&&!m.isFallback));
 const candidate=dateOnlyActivity({...data,name:data.eventName,startTime:'',endTime:'',endDate:'2026-10-26',recurringPattern:'none',_sourceTimeConstraint:{reason:'dated_activity_without_clock',evidence:'October 26 evening; individual audition appointment times are communicated separately'}});assert(candidate);
 const patch=Object.fromEntries(['startTime','endTime','endDate','timeFlags','timeResolution','timing'].map(k=>[k,candidate[k]]));
 Object.assign(patch,{image:originalPoster,imageUrl:originalPoster,relevantImageUrl:originalPoster,imageProvenance:{...data.imageProvenance,primaryUrl:originalPoster,primarySource:'post_media',primaryField:'relevantImageUrl',isFallback:false,selectionReason:'source_verified_original_audition_poster',updatedBy:'manual_repair',media:[...['relevantImageUrl','image','imageUrl'].map(field=>({url:originalPoster,source:'post_media',field,isPrimary:field==='relevantImageUrl',isFallback:false})),...data.imageProvenance.media.filter(m=>['icon','mediaUrls'].includes(m.field)).map(m=>({...m,isPrimary:false}))]}});
 const imageBytes=Buffer.from(await image.arrayBuffer()),imageSha=createHash('sha256').update(imageBytes).digest('hex');
 const oldFeedVersion=refs[3].get('version');assert(Number.isSafeInteger(oldFeedVersion)&&oldFeedVersion>=0,'Existing feed version required');
 const feedVersionChange={path:feedMarker,from:oldFeedVersion,to:oldFeedVersion+1,updatedAt:'server_timestamp'};
 const capture={target,patch,feedVersionChange,documents:refs.map(wrap),siblings:siblings(all.docs),evidence:{official,day:'2026-10-26',wording:'evening',poster:originalPoster,imageSha}};
 const snapshotHash=hash(capture),stamp=new Date().toISOString().replace(/[:.]/g,'-');await fs.mkdir(out,{recursive:true});
 const backupPath=path.join(out,`${apply?'prewrite':'backup'}-${stamp}.json`);await fs.writeFile(backupPath,JSON.stringify(capture,null,2));await fs.writeFile(path.join(out,`official-${stamp}.html`),html);await fs.writeFile(path.join(out,'original-poster.webp'),imageBytes);
 if(!apply){const planPath=path.join(out,`plan-${stamp}.json`);await fs.writeFile(planPath,JSON.stringify({mode:'dry_run',snapshotHash,backupPath,target,patch,feedVersionChange,evidence:capture.evidence,requiredGate:'Exact approval, live capability-gated API commit and reviewed capable Preview release; global parser date-only gate stays OFF'},null,2));console.log(JSON.stringify({planPath,backupPath,target,from:'Oct26 08:00–Oct27 01:00',to:'Oct26 evening; exact times unknown',posterRestored:true,feedVersionChange,liveWrites:0}));}
 else{
  const plan=JSON.parse(await fs.readFile(path.resolve(planArg.slice(7)),'utf8'));assert.equal(snapshotHash,plan.snapshotHash,'Reviewed source/target/venue/sibling/evidence drift');assert.deepEqual(plan.patch,patch);assert.equal(plan.target,target);assert.deepEqual(plan.feedVersionChange,feedVersionChange);
  const expectedCommit=process.env.DATE_ONLY_DELIVERY_COMMIT;assert(/^[a-f0-9]{40}$/.test(expectedCommit||''),'Reviewed delivery release commit required');
  const release=await fetch('https://gathr-backend-924732524090.northamerica-northeast1.run.app/api/release',{signal:AbortSignal.timeout(20000)});assert.equal(release.status,200);assert.equal((await release.json()).commit,expectedCommit,'Approved delivery commit is not serving');
  await db.runTransaction(async tx=>{idle((await tx.get(db.collection('processing_locks'))).docs);assert.deepEqual((await tx.getAll(...refs.map(d=>d.ref))).map(wrap),capture.documents,'Reference drift');assert.deepEqual(siblings((await tx.get(db.collectionGroup('events'))).docs),capture.siblings,'Sibling drift');tx.update(db.doc(target),{...patch,updatedAt:admin.firestore.FieldValue.serverTimestamp()});tx.update(db.doc(feedMarker),{version:admin.firestore.FieldValue.increment(1),updatedAt:admin.firestore.FieldValue.serverTimestamp()});});
  const fresh=plain((await db.doc(target).get()).data()),expected={...data,...patch};delete fresh.updatedAt;delete expected.updatedAt;assert.deepEqual(fresh,expected);
  assert.equal((await db.doc(feedMarker).get()).get('version'),oldFeedVersion+1);
  const resultPath=path.join(out,`applied-${stamp}.json`);await fs.writeFile(resultPath,JSON.stringify({appliedAt:new Date().toISOString(),backupPath,target,patch,feedVersionChange,expectedCommit,updated:1,metadataUpdates:1,mediaWrites:0},null,2));console.log(JSON.stringify({resultPath,target,updated:1,metadataUpdates:1,mediaWrites:0}));
 }
}finally{await admin.app().delete();}
