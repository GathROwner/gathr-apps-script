/** Prepare/read-only by default. Exact six venue/session creates and one private capture recovery. */
import fs from 'node:fs/promises';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const args=process.argv.slice(2),apply=args.includes('--apply'),shaArg=args.find(a=>a.startsWith('--sha256='))?.slice(9);
assert(args.every(a=>a==='--apply'||a.startsWith('--sha256=')));if(apply)assert(/^[a-f0-9]{64}$/.test(shaArg||''),'Reviewed plan SHA required');
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const out=new URL('./artifacts/oct17-remaining-followups/',import.meta.url),planFile=new URL('remaining-reviewed-plan.json',out);
const task=new URL('./artifacts/oct17-remaining-followups/festival-evidence/',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1');
const serving=new URL('../functions/artifacts/oct17-eight-group-release/festival-release/',import.meta.url);
const extractor=await import(new URL('scripts/festival-evidence-extractor.mjs',serving));
const {festivalShadowFingerprint:fp}=await import(new URL('lib/services/festivalLinkShadowJob.js',serving));
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const hash=x=>createHash('sha256').update(JSON.stringify(stable(JSON.parse(JSON.stringify(x))))).digest('hex');
const sha=x=>createHash('sha256').update(x).digest('hex');
const [offline,festival,savedSources,completion]=await Promise.all([read(new URL('donation-recovery-offline-plan.json',out)),read(task+'proposal.json'),read(task+'sources.json'),read(new URL('../functions/artifacts/luna-oct17-production-audit/completion.json',import.meta.url))]);
const capturedSnapshots=await read(new URL('../functions/artifacts/luna-oct17-production-audit/snapshots.json',import.meta.url));
const capture=festival.anchor.capturePatch,oldCapturePath=capture.after.recovery.originalCapturePath;
const expectedPaths=[
 'venues/place_d5c0c0e38cd71fdd','venues/place_d5c0c0e38cd71fdd/events/oct17_recovery_e91580a39c6b3b45bc86',
 'venues/place_ae278e31081b5555','venues/place_ae278e31081b5555/events/oct17_recovery_ceccf3059aa60dbaf8f3',
 'venues/place_f12b183ec2b477d2','venues/place_f12b183ec2b477d2/events/oct17_recovery_9fa4d871c66cda23f10b',
 'venues/place_933863c47c88487a','venues/place_933863c47c88487a/events/oct17_recovery_673e6cdcf93898b6bb94',
 'venues/place_b6bbbbce247714b6','venues/place_b6bbbbce247714b6/events/oct17_recovery_0d83005538a02348633b',
 'venues/place_cddaaf15d9df257b','venues/place_cddaaf15d9df257b/events/oct17_recovery_3bcf86fe23b48cf44bbe'];
assert.deepEqual(offline.operations.map(o=>o.path),expectedPaths);assert(offline.operations.every(o=>o.action==='create'));
assert.equal(capture.path,'festival_link_captures/8b166e1876f6c5234a4ff5202eaea6f16d18747151bce7b4bfbbf73dadf499fb');
const fileId='1JFQdQB-pAXdAb0usJhNFf5mrWnWyBd7g',jobPath='festival_link_jobs/b8264bc86be9ca5be08da366b2880e654efcb227a409e291d0fa956bce92bcfc';
const finalBatch=completion.batches.filter(d=>d.data.status==='completed').sort((a,b)=>(b.data.batchNumber||0)-(a.data.batchNumber||0))[0].path;
const sourceDocs=savedSources.filter(s=>s.data.uniqueId==='1650364973767084');assert.equal(sourceDocs.length,2);
const held=['city_level_event_reviews/cityevt_1d8f8c8689925f63d077c957','city_level_event_reviews/cityevt_711783010369fad6f5e8e36f',
 'event_integrity_holds/oct17_coats_distribution_1118550040924946','event_integrity_holds/oct17_mothlane_clock_1720610070064632'];
const paths=[...new Set([...expectedPaths,...offline.sources.map(s=>s.path),...sourceDocs.map(s=>s.path),capture.path,oldCapturePath,jobPath,finalBatch,
 'processed_datasets/'+fileId,'processing_locks/'+fileId,'runtime_metadata/event_feed',...held])];
const credential=await read(process.env.ANCHOR_CREDENTIAL_PATH);assert.equal(credential.project_id,'gathr-migrated');
const app=admin.initializeApp({credential:admin.credential.cert(credential),projectId:credential.project_id}),db=app.firestore();
const wrap=d=>({path:d.ref.path,exists:d.exists,version:d.updateTime?{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}:null,data:d.exists?d.data():null});
const decode=v=>Array.isArray(v)?v.map(decode):v&&typeof v==='object'?
 Object.keys(v).length===2&&Number.isInteger(v._seconds)&&Number.isInteger(v._nanoseconds)?new admin.firestore.Timestamp(v._seconds,v._nanoseconds):Object.fromEntries(Object.entries(v).map(([k,x])=>[k,decode(x)])):v;
const terminal=new Set(['completed','failed','cancelled','canceled','released']);
const roots=d=>[d.uniqueId,d.sourceUniqueId,...(d.sourceUniqueIds||[])].map(x=>String(x||'').split('_')[0]);
const eventQuery=db.collectionGroup('events').select('uniqueId','sourceUniqueId','sourceUniqueIds','name','eventName','startDate','startTime','endDate','endTime','venueId');
const venueQuery=db.collection('venues').select('name','pagename','normalizedName','aliases','aliasesNormalized','address','googlePlaceId','placeId','placeid','placeDetailsParsed');
const sourceRoots=['1735968125204476','1565917082242490'];
const readState=async tx=>{const get=ref=>tx?tx.get(ref):ref.get();return Promise.all([tx?tx.getAll(...paths.map(p=>db.doc(p))):db.getAll(...paths.map(p=>db.doc(p))),get(db.collection('processing_locks')),get(db.doc('checkpoints/'+fileId)),get(db.collection('checkpoints').where('fileId','==',fileId)),get(eventQuery),get(venueQuery)]);};
const validate=async state=>{
 const [docs,locks,checkpoint,checkpoints,events,venues]=state,at=p=>docs.find(d=>d.ref.path===p);
 assert(locks.docs.every(d=>terminal.has(String(d.get('status')||''))),'Active parser');assert(!checkpoint.exists&&checkpoints.empty,'Checkpoint present');
 assert.equal(at('processing_locks/'+fileId).get('runId'),'24bd52c0-fe67-4c1e-929c-ada0766febe6');assert.equal(at('processing_locks/'+fileId).get('status'),'completed');
 assert(at('processed_datasets/'+fileId).exists);assert.equal(at(finalBatch).get('currentRowIndex'),367);assert.equal(at(finalBatch).get('status'),'completed');assert.equal(at(finalBatch).get('totalRows'),367);
 assert.equal(at(jobPath).get('status'),'held');assert.equal(at(jobPath).get('leaseUntilMs'),0,'Active festival lease');
 for(const reference of offline.sources){const d=at(reference.path);assert(d?.exists,'Missing reviewed source '+reference.path);
  if(reference.expectedDataHash)assert.equal(sha(JSON.stringify(d.data())),reference.expectedDataHash,'Reviewed queue/review changed '+reference.path);
  else {const saved=capturedSnapshots.find(s=>s.path===reference.path);assert(saved,'Missing immutable source capture');assert.equal(hash(d.data()),hash(saved.data),'Original source changed '+reference.path);}
 }
 for(const p of expectedPaths)assert(!at(p).exists,'Create target exists '+p);
 assert.equal(events.docs.filter(d=>roots(d.data()).some(s=>sourceRoots.includes(s))).length,0,'Source event already exists; review instead');
 const newVenues=offline.operations.filter(o=>/^venues\/[^/]+$/.test(o.path));
 const normalize=s=>String(s||'').normalize('NFKD').replace(/[’']/g,'').replace(/&/g,'and').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 for(const o of newVenues){const names=new Set([o.payload.name,...o.payload.aliases].map(normalize));
  for(const d of venues.docs){const v=d.data();assert(![v.googlePlaceId,v.placeId,v.placeid,v.placeDetailsParsed?.place_id].includes(o.payload.googlePlaceId),'Place identity already exists '+d.ref.path);
   assert(![v.name,v.pagename,v.normalizedName,...(v.aliases||[]),...(v.aliasesNormalized||[])].some(n=>names.has(normalize(n))),'Venue name/alias already exists '+d.ref.path);}
 }
 const current=sourceDocs.find(s=>s.data.fileId===fileId),prior=sourceDocs.find(s=>s.data.fileId!==fileId);assert(current&&prior);
 for(const s of sourceDocs)assert.equal(hash(at(s.path).data()),hash(s.data),'Anchor source drift');
 assert.equal(current.data.inputText,prior.data.inputText);assert.equal(fp(at(capture.path).data()),capture.beforeFingerprint,'Failed capture drift');
 assert.equal(fp(at(oldCapturePath).get('result')),capture.after.recovery.originalResultFingerprint,'Older capture drift');
 assert.equal(extractor.festivalEvidenceSourceFingerprint({caption:current.data.inputText,imageUrls:current.data.rowMeta.mediaUrls}),capture.after.result.sourceFingerprint);
 for(const image of capture.after.recovery.orderedGallery){const old=await fs.readFile(image.oldPath),fresh=await fs.readFile(image.newPath);assert(old.equals(fresh));assert.equal(sha(old),image.sha256);}
 const validated=extractor.validateFestivalEvidenceCapture(structuredClone(capture.after.result),{caption:current.data.inputText,imageUrls:current.data.rowMeta.mediaUrls});assert(validated.complete&&validated.activities.every(a=>a.verification.accepted));
 return docs;
};
try {
 const state=await readState(),docs=await validate(state);
 const feed=docs.find(d=>d.ref.path==='runtime_metadata/event_feed').get('version');assert.equal(feed,301,'Feed changed; re-review batch');
 const operations=[...offline.operations,{action:'replace',path:capture.path,payload:capture.after},{action:'update',path:'runtime_metadata/event_feed',payload:{version:302},timestampFields:['updatedAt']}];
 const plan={schema:'oct17-remaining-exact-recovery-v1',preparedAt:new Date().toISOString(),fileId,runId:'24bd52c0-fe67-4c1e-929c-ada0766febe6',finalBatch,manifest:offline.manifest,operations,holds:offline.holds,
  preconditions:docs.map(d=>({...wrap(d),sha256:d.exists?hash(d.data()):null})),sourceRoots,sourceSiblingPaths:[],publicationChanges:0,newModelCalls:0,rowReplays:0};
 if(!apply){await fs.writeFile(planFile,JSON.stringify(plan,null,2));console.log(JSON.stringify({status:'dry_run_ready',plan:planFile.pathname,sha256:sha(await fs.readFile(planFile)),operations:operations.map(o=>({action:o.action,path:o.path})),liveWrites:0}));}
 else {
  const bytes=await fs.readFile(planFile);assert.equal(sha(bytes),shaArg,'Reviewed plan changed');const approved=JSON.parse(bytes);assert.equal(approved.schema,plan.schema);
  assert.equal(hash(approved.operations),hash(operations),'Payload drift');for(const p of approved.preconditions){const d=docs.find(d=>d.ref.path===p.path);assert.equal(d.exists,p.exists);if(d.exists)assert.equal(hash(d.data()),p.sha256,'Reviewed input drift '+p.path);}
  const stamp=new Date().toISOString().replace(/[:.]/g,'-'),backup='remaining-prewrite-backup-'+stamp+'.json',result='remaining-result-'+stamp+'.json';
  await fs.writeFile(new URL(backup,out),JSON.stringify({plan:approved,documents:docs.map(wrap),locks:state[1].docs.map(wrap),eventIdentities:state[4].docs.map(wrap),venueIdentities:state[5].docs.map(wrap)},null,2));
  await fs.writeFile(new URL(result,out),JSON.stringify({status:'prepared',backup,planSHA256:shaArg},null,2));
  await db.runTransaction(async tx=>{const fresh=await validate(await readState(tx));for(const p of approved.preconditions){const d=fresh.find(d=>d.ref.path===p.path);assert.equal(d.exists,p.exists);if(d.exists)assert.equal(hash(d.data()),p.sha256,'Transaction drift '+p.path);}
   for(const o of operations){const payload=decode(o.payload);for(const f of o.timestampFields||[])payload[f]=admin.firestore.FieldValue.serverTimestamp();
    if(o.action==='create')tx.create(db.doc(o.path),payload);else if(o.action==='replace')tx.set(db.doc(o.path),payload);else tx.update(db.doc(o.path),payload);}
  });
  await fs.writeFile(new URL(result,out),JSON.stringify({status:'applied_pending_independent_verification',backup,planSHA256:shaArg,operations:operations.map(o=>({path:o.path,action:o.action}))},null,2));
  const after=await db.getAll(...paths.map(p=>db.doc(p)));
  for(const d of after){const o=operations.find(o=>o.path===d.ref.path),before=docs.find(b=>b.ref.path===d.ref.path);assert.equal(d.exists,o?true:before.exists);if(!d.exists)continue;
   const actual=d.data(),expected=o?(o.action==='update'?{...before.data(),...o.payload}:JSON.parse(JSON.stringify(o.payload))):before.data();for(const f of o?.timestampFields||[]){delete actual[f];delete expected[f];}assert.equal(hash(actual),hash(expected),'Unexpected delta '+d.ref.path);}
  await fs.writeFile(new URL(result,out),JSON.stringify({status:'applied',backup,planSHA256:shaArg,verifiedAt:new Date().toISOString(),exactOperations:operations.length,after:after.map(wrap)},null,2));console.log(JSON.stringify({status:'applied',backup,result,operations:14,newVenues:6,newEvents:6,privateCapture:1,feed:302}));
 }
}finally{await app.delete();}
