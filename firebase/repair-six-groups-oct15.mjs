// One exact reviewed batch. Default dry-run. No models, geocoding or reparse.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';import {exec} from 'node:child_process';import {promisify} from 'node:util';
import {buildSixGroupChanges,queuePaths,feeds} from './six-groups-spec.mjs';
const args=process.argv.slice(2),apply=args.includes('--apply'),planArg=args.find(a=>a.startsWith('--plan='));assert(args.every(a=>a==='--apply'||a.startsWith('--plan=')));assert.equal(apply,Boolean(planArg));
const out=path.join(import.meta.dirname,'artifacts/six-groups-oct15'),load=async f=>JSON.parse(await fs.readFile(path.join(out,f),'utf8'));
const c=await load('capture.json'),extra=await load('extra-evidence.json'),evidence=await load('web-and-media-evidence.json'),changes=buildSixGroupChanges(c,extra,evidence);
const plannedAssetUrls=new Set(evidence.media.map(m=>m.url));const hash=x=>createHash('sha256').update(Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const plain=x=>JSON.parse(JSON.stringify(x)),wrap=d=>({path:d.ref.path,exists:d.exists,version:d.updateTime?{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}:null,data:d.exists?plain(d.data()):null});
const idle=docs=>assert(!docs.some(d=>!['completed','failed','cancelled','canceled','released'].includes(String(d.get('status')||''))),'Active parser blocks repair');
const refsBefore=[...new Map([...c.documents.filter(d=>!d.path.startsWith('unrecognized_venues/')&&!d.path.startsWith('city_level_event_reviews/')||queuePaths.includes(d.path)),...extra.skeletonVenueCandidates,...extra.oldRubySources.map(d=>({exists:true,...d}))].map(d=>[d.path,d])).values()].sort((a,b)=>a.path.localeCompare(b.path));
async function freshProof(){
 const urls=['https://millriver.ca/package/late-fall-stay-play/','https://golfpei.ca/course_dates/','https://confederationcentre.com/exhibition/soft-internet-theory/'];
 const text=await Promise.all(urls.map(async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(25000)});assert.equal(r.status,200);const html=await r.text();return html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');}));
 assert(/Available October 16, 2026/.test(text[0]));assert(/149\.00/.test(text[0]));assert(/2026 Season Dates/.test(text[1]));assert(/Mill River\s+May 7\*?\s+Oct 27/.test(text[1]));assert(/From\s+October 3, 2026\s+Until\s+January 24, 2027/.test(text[2]));
 const shows=[];for(const n of [1,2,3]){const r=await fetch('https://www.showpass.com/api/public/events/kings-christmas'+n+'/',{signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);const j=await r.json(),saved=await load('showpass-exact-'+n+'.json');
  for(const k of ['id','slug','name','starts_on','ends_on','timezone'])assert.equal(j[k],saved[k],'Exact show drift '+k);assert.equal(j.location.street_name,'65 Grafton St');assert.equal(j.location.city,'Georgetown');
  assert(j.ticket_types.some(t=>t.name==='General'&&t.price==='20.00'),'Reviewed ticket price changed');
  shows.push({id:j.id,slug:j.slug,start:j.starts_on,end:j.ends_on,timezone:j.timezone,venue:j.location.street_name,city:j.location.city});}
 return{packageStart:'2026-10-16',announcedCourseClose:'2026-10-27',packagePrice:'149.00 + HST per person, double occupancy',exhibition:['2026-10-03','2027-01-24'],shows};
}
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');const key=JSON.parse(await fs.readFile(process.env.GATHR_SERVICE_ACCOUNT_PATH,'utf8'));assert.equal(key.project_id,'gathr-migrated');admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});const db=admin.firestore();
const roots=new Set(c.sources.map(s=>s.sourceId));const selectedVenues=new Set(c.documents.filter(d=>d.path.startsWith('venues/')&&d.path.split('/').length===2).map(d=>d.path.split('/')[1]));
const related=d=>selectedVenues.has(d.get('venueId'))||roots.has(String(d.get('uniqueId')||'').split('_')[0])||(d.get('sourceUniqueIds')||[]).some(id=>roots.has(id));
const siblings=docs=>docs.filter(related).map(wrap).sort((a,b)=>a.path.localeCompare(b.path));
try{
 const paths=[...new Set([...refsBefore.map(d=>d.path),...changes.map(d=>d.path),feeds])].sort();
 const [docs,all,locks,proof]=await Promise.all([db.getAll(...paths.map(p=>db.doc(p))),db.collectionGroup('events').get(),db.collection('processing_locks').get(),freshProof()]);idle(locks.docs);const documents=docs.map(wrap),by=new Map(documents.map(d=>[d.path,d]));
 for(const old of refsBefore)assert.deepEqual(by.get(old.path),{exists:true,...old},'Reviewed source/venue/event/queue drift '+old.path);
 for(const change of changes)if(change.kind==='create')assert.equal(by.get(change.path).exists,false,'Target already exists '+change.path);
 assert.equal(by.get(feeds).data.version,266,'Feed marker changed; review regenerated plan');
 const deleted=new Set(changes.filter(c=>c.kind==='delete').map(c=>c.path));
 for(const change of changes.filter(c=>c.kind==='create'&&c.payload.uniqueId))assert(!all.docs.some(d=>!deleted.has(d.ref.path)&&d.get('uniqueId')===change.payload.uniqueId),'Exact source occurrence already exists');
 const media=[];for(const m of evidence.media){const bytes=await fs.readFile(m.localFile);assert.equal(hash(bytes),m.sha256);assert.equal(bytes.length,m.bytes);media.push({...m});}
 const urls=[...new Set(changes.flatMap(c=>{const d=c.payload||c.patch||{};return[d.icon,d.image,d.imageUrl,d.relevantImageUrl,...(d.mediaUrls||[])].filter(u=>/^https:\/\//.test(u||'')&&!plannedAssetUrls.has(u));}))];
 for(const url of urls)assert.equal((await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(20000)})).status,200,'Retained source/profile unavailable');
 const capture={schema:1,changes,feedVersionChange:{path:feeds,from:266,to:267},documents,siblings:siblings(all.docs),media,proof,retainedMediaUrls:urls};
 const snapshotHash=hash(capture),stamp=new Date().toISOString().replace(/[:.]/g,'-'),backupPath=path.join(out,`${apply?'prewrite':'backup'}-${stamp}.json`);await fs.writeFile(backupPath,JSON.stringify(capture,null,2));
 if(!apply){const planPath=path.join(out,`plan-${stamp}.json`);const counts={creates:changes.filter(c=>c.kind==='create').length,updates:changes.filter(c=>c.kind==='update').length,deletes:deleted.size,originalUploads:media.length};await fs.writeFile(planPath,JSON.stringify({mode:'dry_run',snapshotHash,backupPath,changes,feedVersionChange:capture.feedVersionChange,media,counts,liveWrites:0},null,2));console.log(JSON.stringify({planPath,backupPath,...counts,guardedReferences:documents.length,relatedEvents:capture.siblings.length,liveWrites:0}));}
 else{
  const plan=JSON.parse(await fs.readFile(path.resolve(planArg.slice(7)),'utf8'));assert.equal(plan.snapshotHash,snapshotHash,'Approved batch drift');assert.deepEqual(plan.changes,changes);assert.deepEqual(plan.media,media);
  const checked=await load('serving-after.json'),expected=process.env.SIX_GROUPS_RELEASE_HASH;assert(/^[a-f0-9]{40}$/.test(expected||''));assert.notEqual(expected,'8a3e2aaeaf3c7d56648fc5ce15b5c709a6fbadaa');assert.equal(checked.rows.length,3);assert(checked.rows.every(r=>r.state==='ACTIVE'&&r.hash===expected&&r.trafficPercent===100));
  const run=promisify(exec);await Promise.all([['processDataset','northamerica-northeast2'],['processDatasetResume','northamerica-northeast1'],['processDatasetSelectedRows','northamerica-northeast1']].map(async([name,region])=>{const r=await run(`gcloud functions describe ${name} --gen2 --region=${region} --project=gathr-migrated --format="json(state,labels.firebase-functions-hash)"`);const f=JSON.parse(r.stdout);assert.equal(f.state,'ACTIVE');assert.equal(f.labels['firebase-functions-hash'],expected);}));
  const uploaded=[];const bucket=admin.storage().bucket('gathr-uploaded-images');
  for(const m of media){const file=bucket.file(m.objectName),bytes=await fs.readFile(m.localFile),[exists]=await file.exists();if(exists){const[old]=await file.download();assert.equal(hash(old),m.sha256,'Existing immutable image mismatch');}else await file.save(bytes,{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:'image/jpeg',cacheControl:'public,max-age=31536000,immutable',metadata:{reviewId:'six-groups-oct15',sha256:m.sha256,sourceId:m.sourceId}}});uploaded.push({url:m.url,reused:exists,sha256:m.sha256});}
  const hydrate=v=>Array.isArray(v)?v.map(hydrate):v&&typeof v==='object'?Object.keys(v).length===2&&Number.isFinite(v._seconds)&&Number.isFinite(v._nanoseconds)?new admin.firestore.Timestamp(v._seconds,v._nanoseconds):Object.fromEntries(Object.entries(v).map(([k,x])=>[k,hydrate(x)])):v;
  await db.runTransaction(async tx=>{idle((await tx.get(db.collection('processing_locks'))).docs);assert.deepEqual((await tx.getAll(...docs.map(d=>d.ref))).map(wrap),documents);assert.deepEqual(siblings((await tx.get(db.collectionGroup('events'))).docs),capture.siblings);
   for(const change of changes){const ref=db.doc(change.path);if(change.kind==='delete')tx.delete(ref);else if(change.kind==='create')tx.create(ref,{...hydrate(change.payload),...(!change.preserveCreatedAt?{createdAt:admin.firestore.FieldValue.serverTimestamp()}:{}),updatedAt:admin.firestore.FieldValue.serverTimestamp()});else tx.update(ref,{...hydrate(change.patch),updatedAt:admin.firestore.FieldValue.serverTimestamp()});}
   tx.update(db.doc(feeds),{version:267,updatedAt:admin.firestore.FieldValue.serverTimestamp()});});
  const resultPath=path.join(out,`applied-${stamp}.json`);await fs.writeFile(resultPath,JSON.stringify({appliedAt:new Date().toISOString(),backupPath,changes,feedVersionChange:capture.feedVersionChange,uploaded,releaseHash:expected},null,2));console.log(JSON.stringify({resultPath,documentChanges:changes.length+1,uploads:uploaded.length}));
 }
}finally{await admin.app().delete();}
