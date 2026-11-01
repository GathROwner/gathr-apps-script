import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import ffprobe from 'ffprobe-static';
import {FieldPath,FieldValue} from 'firebase-admin/firestore';
import {POLICY,hash} from './policy.mjs';
import {EDITORIAL_VERSION} from './editorial-review.mjs';
import {exactListings,normalize} from './pipeline.mjs';
import {expiryFor} from './manual-publication.mjs';
import {recurringListing,scheduleFingerprint} from './listing-schedule.mjs';
import {PUBLIC_POLICY,REGISTRY_LOCK,publicPath,listingFingerprint,bindingIsCurrent,humanChoice,reviewedListings,eligibility,validatePublicProbe,cleanupDue} from './published-policy.mjs';
const exec=promisify(execFile),iso=()=>new Date().toISOString(),version=s=>s.updateTime?`${s.updateTime.seconds}:${s.updateTime.nanoseconds}`:'';
const terminal=new Set(['completed','released','failed','error','aborted','expired','cancelled','canceled']);
export async function parserIdle(db,tx) {
 const locks=await(tx?tx.get(db.collection('processing_locks').limit(1000)):db.collection('processing_locks').limit(1000).get());
 const checkpoints=await(tx?tx.get(db.collection('processing_checkpoints').limit(1)):db.collection('processing_checkpoints').limit(1).get());
 const resumes=await(tx?tx.get(db.collection('checkpoints').limit(1000)):db.collection('checkpoints').limit(1000).get());
 const config=(await(tx?tx.get(db.doc('runtime_metadata/video_review')):db.doc('runtime_metadata/video_review').get())).data()||{};
 const since=Date.parse(config.enabledAt||config.automaticPublicationEnabledAt||'');
 // This legacy collection retains abandoned February/March checkpoints. All live locks
 // still block; a legacy checkpoint written during the video service's lifetime also blocks.
 const newCheckpoint=resumes.docs.some(d=>d.updateTime&&d.updateTime.seconds*1000+d.updateTime.nanoseconds/1e6>=since);
 if(!Number.isFinite(since)||locks.size===1000||resumes.size===1000||locks.docs.some(d=>!terminal.has(String(d.data().status||'').toLowerCase()))||!checkpoints.empty||newCheckpoint)throw Error('parser_busy_or_uncertain');
}
async function registryLease(db,run) {
 const ref=db.doc(REGISTRY_LOCK),owner=randomUUID();
 const ok=await db.runTransaction(async tx=>{const d=await tx.get(ref);if(Date.parse(d.data()?.until||'')>Date.now())return false;tx.set(ref,{owner,until:new Date(Date.now()+10*60000).toISOString()});return true;});
 if(!ok)return {busy:true};
 const fence=async tx=>{if((await tx.get(ref)).data()?.owner!==owner)throw Error('registry_lease_lost');};
 try{return await run(fence);}finally{await db.runTransaction(async tx=>{if((await tx.get(ref)).data()?.owner===owner)tx.delete(ref);});}
}
async function status(ref,publication) {
 return ref.firestore.runTransaction(async tx=>{const s=await tx.get(ref),old=s.data()?.publication;
  if(!s.exists)return;
  const comparable=x=>JSON.stringify(x&&Object.fromEntries(Object.entries(x).filter(([k])=>k!=='checkedAt')));
  if(comparable(old)!==comparable(publication))tx.update(ref,{publication:{...publication,checkedAt:iso()}});
 });
}
async function queueReview(snapshot,reason) {
 return snapshot.ref.firestore.runTransaction(async tx=>{const s=await tx.get(snapshot.ref),c=s.data();
  if(!c||version(s)!==version(snapshot)||['queued','processing'].includes(c.state)||humanChoice(c.humanJudgment)==='dont_use')return false;
  const archive=s.ref.collection('assessments').doc(`auto90-${c.revision}`),old=await tx.get(archive);
  if(!old.exists)tx.create(archive,Object.fromEntries(['state','decision','reasons','contentAssessment','listingCheck','luna','terra','revision','reviewVersion','sha256','artifacts'].filter(k=>c[k]!==undefined).map(k=>[k,c[k]])));
  tx.update(s.ref,{state:'queued',requestedReviewVersion:EDITORIAL_VERSION,publication:{state:'waiting',reason,checkedAt:iso()},lastQueuedAt:iso()});return true;
 });
}
async function existingCoverage(db,c) {
 const old=c.publication||c.manualPublication,paths=old?.paths||[];
 if(!paths.length)return null;
 for(const path of paths){const link=(await db.doc(`listing_video_links/${hash(path)}`).get()).data();if(!link||link.state!=='ready'||link.binding?.path!==path)return null;
  const [a,e]=await db.getAll(db.doc(`listing_video_assets/${link.assetId}`),db.doc(path));
  if(a.data()?.state!=='ready'||!bindingIsCurrent(link.binding,e.data())||listingFingerprint(e.data())!==link.fingerprint)return null;
 }
 return {state:old.state==='already_covered'?'already_covered':'published',paths,assetId:old.assetId,reason:old.reason||'This video is available in GathR.'};
}
export async function retireRequestedVideo({db},snapshot,config,fence) {
 const c=snapshot.data(),p=c.publication||c.manualPublication;
 const activated=Date.parse(config.automaticPublicationEnabledAt||'');
 const choice=humanChoice(c.humanJudgment);
 if(!Number.isFinite(activated)||!['dont_use','unsure'].includes(choice)||Date.parse(c.humanJudgment.reviewedAt)<activated)return false;
 if(!p?.paths?.length||!p.assetId)return false;
 return db.runTransaction(async tx=>{await fence(tx);await parserIdle(db,tx);const fresh=await tx.get(snapshot.ref),latest=fresh.data();
  if(version(fresh)!==version(snapshot)||humanChoice(latest?.humanJudgment)!==choice)throw Error('human_choice_changed');
  const refs=p.paths.map(path=>db.doc(`listing_video_links/${hash(path)}`)),links=await tx.getAll(...refs);
  const owned=links.filter(s=>s.data()?.state==='ready'&&s.data()?.assetId===p.assetId&&s.data()?.binding?.path===p.paths[links.indexOf(s)]);
  // A second selected clip for an already-covered listing does not own the existing video.
  if(p.state==='already_covered'&&p.assetId!==c.sha256)return false;
  for(const s of owned)tx.update(s.ref,{state:'retired',retiredAt:iso(),retiredByCandidate:snapshot.id});
  tx.update(snapshot.ref,{publication:{state:choice==='unsure'?'needs_review':'declined',reason:choice==='unsure'?'Paused in GathR while you decide. Choose Use to restore it.':'Removed from GathR following your Don’t use decision.',paths:[],checkedAt:iso()}});return true;
 });
}
export async function publishCandidate(svc,snapshot,fence,{probeFile=probe,normalizeFile=normalize}={}) {
 const {db,bucket,publicBucket}=svc,c=snapshot.data(),target=reviewedListings(c)[0];
 if(!/^[a-f0-9]{64}$/.test(snapshot.id))throw Error('candidate_identity_invalid');
 if(!target?.fingerprint)return queueReview(snapshot,'Checking this clip against the current listing.');
 const config=(await db.doc('runtime_metadata/video_review').get()).data();if(!config?.enabled||config.automaticPublication!==true)throw Error('automatic_publication_disabled');
 if(eligibility(c,EDITORIAL_VERSION).state!=='eligible')throw Error('publication_not_eligible');
 const eventRef=db.doc(target.path),event=await eventRef.get(),data=event.data();
 if(recurringListing(data||{})&&target.scheduleFingerprint!==scheduleFingerprint(data))return queueReview(snapshot,'Checking the current recurring schedule against this video.');
 const binding={path:target.path,sourceId:c.sourcePostId,updateTime:version(event),expiresAt:expiryFor(data||{},Date.now(),c.expiresAt),...(target.scheduleFingerprint?{scheduleFingerprint:target.scheduleFingerprint}:{})};
 if(!bindingIsCurrent(binding,data)||target.fingerprint!==listingFingerprint(data)||target.updateTime!==version(event)) {
  const latest=await exactListings(db,c),one=latest.find(x=>x.path===target.path);
  if(!one||one.fingerprint!==target.fingerprint)return queueReview(snapshot,'The listing changed; checking the video against its current details.');
  binding.updateTime=version(event); // Unchanged substantive listing; a likes/counter write is harmless.
 }
 if(target.path.startsWith('venues/')&&data.venueId!==target.path.split('/')[1])throw Error('listing_parent_mismatch');
 if(c.object!==`clips/${snapshot.id}.mp4`)throw Error('private_clip_namespace_invalid');
 const privateFile=bucket.file(c.object),[metadata]=await privateFile.getMetadata();
 if(metadata.metadata?.owner!==POLICY.version||metadata.metadata?.sha256!==c.sha256||Number(metadata.size)>8000000)throw Error('private_clip_ownership_invalid');
 const [original]=await privateFile.download();if(hash(original)!==c.sha256)throw Error('private_clip_hash_invalid');
 const ownedRoot=resolve(tmpdir(),'gathr-auto-publish',snapshot.id),folder=resolve(ownedRoot,randomUUID());await fs.mkdir(folder,{recursive:true});
 try {
  const input=join(folder,'reviewed.mp4');await fs.writeFile(input,original,{flag:'wx'});let bytes=original,media=await probeFile(input);
  if(Math.min(media.width,media.height)>720||Math.max(media.width,media.height)>1280){const out=join(folder,'public.mp4'),normalized=await normalizeFile(input,out);bytes=normalized.bytes;media=await probeFile(out);}
  validatePublicProbe(media,c.sourceAudio);if(Math.abs(media.durationSeconds-c.durationSeconds)>.15)throw Error('public_timeline_changed');
  const sha=hash(bytes),assetRef=db.doc(`listing_video_assets/${sha}`),linkRef=db.doc(`listing_video_links/${hash(target.path)}`),fingerprint=listingFingerprint(data);
  const plan={version:PUBLIC_POLICY,sourcePostId:c.sourcePostId,sourceVideoId:c.sourceVideoId,sourceAudio:c.sourceAudio?'available':'unavailable',sha256:sha,probe:media,bindings:[binding],review:{method:humanChoice(c.humanJudgment)==='use'?'human_use_confirmed_match':'automatic_luna_first_review',candidateId:snapshot.id,assessmentRevision:c.revision,reviewedSHA256:c.sha256,reviewVersion:c.reviewVersion,content:c.contentAssessment.decision,listing:'matched',reviewedAt:c.finishedAt}};
  const reservation=await db.runTransaction(async tx=>{
   await fence(tx);await parserIdle(db,tx);const [cfg,fresh,e,a,l]=await tx.getAll(db.doc('runtime_metadata/video_review'),snapshot.ref,eventRef,assetRef,linkRef);
   if(cfg.data()?.automaticPublication!==true||!cfg.data()?.enabled)throw Error('automatic_publication_disabled');
   if(version(fresh)!==version(snapshot)||eligibility(fresh.data(),EDITORIAL_VERSION).state!=='eligible')throw Error('candidate_or_human_choice_changed');
   if(version(e)!==binding.updateTime||listingFingerprint(e.data())!==fingerprint||!bindingIsCurrent(binding,e.data()))throw Error('listing_changed_during_publication');
   if(l.exists){const old=l.data();
    if(old.state==='ready'&&bindingIsCurrent(old.binding,e.data())&&old.fingerprint===fingerprint){const existingAsset=old.assetId===sha?a:await tx.get(db.doc(`listing_video_assets/${old.assetId}`));if(existingAsset.data()?.state==='ready')return {covered:old.assetId};throw Error('existing_video_asset_not_ready');}
    const resumable=old.assetId===sha&&((old.state==='preparing'&&old.ownerCandidateId===snapshot.id)||(old.state==='retired'&&old.retiredByCandidate===snapshot.id)||(old.state==='ready'&&old.ownerCandidateId===snapshot.id));
    if(!resumable||!['preparing','ready'].includes(a.data()?.state))throw Error('existing_listing_video_needs_review');
    if(a.data().state==='preparing'&&(a.data().ownerCandidateId!==snapshot.id||a.data().reviewedPrivateSHA256!==c.sha256))throw Error('asset_reservation_conflict');
    tx.update(linkRef,{state:'preparing',binding,fingerprint});
    if(a.data().state==='ready')tx.update(assetRef,{'plan.bindings':a.data().plan.bindings.map(b=>b.path===binding.path?binding:b),unreferencedSince:FieldValue.delete()});
    else tx.update(assetRef,{plan,fingerprints:[fingerprint]});
    return {reuse:a.data().state==='ready'};
   }
   const owned=a.exists&&a.data().ownerCandidateId===snapshot.id&&a.data().reviewedPrivateSHA256===c.sha256;
   if(a.exists&&a.data().state!=='ready'&&!(owned&&a.data().state==='preparing'))throw Error('asset_reservation_conflict');
   const at=iso();
   if(!a.exists)tx.create(assetRef,{state:'preparing',plan,ownerCandidateId:snapshot.id,reviewedPrivateSHA256:c.sha256,fingerprints:[fingerprint],objectPath:publicPath(sha),createdAt:at,stagingExpiresAt:new Date(Date.now()+86400000).toISOString()});
   else if(a.data().state==='ready'&&!a.data().plan.bindings.some(b=>b.path===binding.path))tx.update(assetRef,{'plan.bindings':[...a.data().plan.bindings,binding],unreferencedSince:FieldValue.delete()});
   tx.create(linkRef,{state:'preparing',assetId:sha,binding,fingerprint,ownerCandidateId:snapshot.id,createdAt:at});
   return {reuse:a.exists&&a.data().state==='ready'};
  });
  if(reservation.covered){await status(snapshot.ref,{state:'already_covered',assetId:reservation.covered,paths:[target.path],reason:'This listing already has an approved video.'});return {covered:true};}
  if(!reservation.reuse){const file=publicBucket.file(publicPath(sha));
   try{await file.save(bytes,{resumable:false,validation:'crc32c',preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:'video/mp4',cacheControl:'public,max-age=3600',metadata:{sha256:sha,policy:PUBLIC_POLICY}}});}
   catch(e){if(e.code!==412)throw e;const [m]=await file.getMetadata();if(m.metadata?.sha256!==sha||Number(m.size)!==bytes.length||!['listing-video-pilot-v1',PUBLIC_POLICY].includes(m.metadata?.policy))throw Error('public_object_drift');}
  }
  await db.runTransaction(async tx=>{
   await fence(tx);await parserIdle(db,tx);const [cfg,fresh,e,a,l]=await tx.getAll(db.doc('runtime_metadata/video_review'),snapshot.ref,eventRef,assetRef,linkRef);
   if(!cfg.data()?.enabled||cfg.data()?.automaticPublication!==true||version(fresh)!==version(snapshot)||eligibility(fresh.data(),EDITORIAL_VERSION).state!=='eligible')throw Error('publication_or_human_choice_changed');
   if(version(e)!==binding.updateTime||!bindingIsCurrent(binding,e.data())||listingFingerprint(e.data())!==fingerprint)throw Error('listing_changed_during_upload');
   if(!['preparing','ready'].includes(a.data()?.state)||l.data()?.state!=='preparing'||l.data()?.assetId!==sha)throw Error('publication_reservation_changed');
   const at=iso();if(a.data().state==='preparing')tx.update(assetRef,{state:'ready',publishedAt:at});tx.update(linkRef,{state:'ready',publishedAt:at});
   tx.update(snapshot.ref,{publication:{state:'published',assetId:sha,paths:[target.path],reason:humanChoice(c.humanJudgment)==='use'?'Added following your Use decision.':'Automatically added after a clear content and listing match.',checkedAt:at}});
  });
  return {published:true};
 }finally{if(dirname(folder)!==ownedRoot)throw Error('temporary_cleanup_path_invalid');await fs.rm(folder,{recursive:true,force:true});}
}
async function probe(file) {
 const p=JSON.parse((await exec(ffprobe.path,['-v','error','-protocol_whitelist','file','-f','mov','-i',file,'-show_streams','-show_format','-of','json'],{timeout:45000,maxBuffer:1000000,windowsHide:true})).stdout);
 const videos=p.streams.filter(x=>x.codec_type==='video'),audios=p.streams.filter(x=>x.codec_type==='audio');if(videos.length!==1||audios.length>1)throw Error('public_streams_invalid');
 return {durationSeconds:Number(p.format.duration),bytes:(await fs.stat(file)).size,width:videos[0].width,height:videos[0].height,codec:videos[0].codec_name,hasAudio:audios.length===1,...(audios.length?{audioCodec:audios[0].codec_name}:{})};
}
export async function publishTick(svc) {
 const {db}=svc,config=(await db.doc('runtime_metadata/video_review').get()).data();if(!config?.enabled||config.automaticPublication!==true)return {disabled:true};
 return registryLease(db,async fence=>{
  try{await parserIdle(db);}catch{return {parserBusy:true};}
  const healthRef=db.doc('runtime_metadata/video_publication_health'),health=(await healthRef.get()).data()||{},cursor=health.cursor||null;
  let query=db.collection(POLICY.queue).orderBy(FieldPath.documentId());if(cursor)query=query.startAfter(cursor);
  const page=await query.limit(100).get(),deadline=Date.now()+230000;let published=0,reviewQueued=0,checked=0,last=null,errors=0;
  for(const snapshot of page.docs){if(Date.now()>deadline||published>=5)break;last=snapshot.id;checked++;const c=snapshot.data();
   try{
    if(await retireRequestedVideo(svc,snapshot,config,fence))continue;
    const covered=await existingCoverage(db,c);if(covered){await status(snapshot.ref,covered);continue;}
    let decision=eligibility(c,EDITORIAL_VERSION);
    if(decision.state==='upgrade_review'){if(await queueReview(snapshot,decision.reason))reviewQueued++;continue;}
    if(c.contentAssessment?.decision==='useful'&&c.reviewVersion===EDITORIAL_VERSION&&!['queued','processing'].includes(c.state)&&humanChoice(c.humanJudgment)!=='dont_use'){
     const fresh=await exactListings(db,c),old=c.listings||[];
     const signature=x=>[x.path,x.fingerprint,x.scheduleFingerprint||null];
     if(JSON.stringify(fresh.map(signature))!==JSON.stringify(old.map(signature))){if(await queueReview(snapshot,'Checking a new or changed listing match.'))reviewQueued++;continue;}
    }
    if(decision.state!=='eligible'){await status(snapshot.ref,decision);continue;}
    const stopped=c.publication;
    if(stopped?.state==='needs_review'&&stopped.code&&stopped.assessmentRevision===c.revision&&stopped.manualRequestAt===(c.publicationRequestedAt||null))continue;
    const result=await publishCandidate(svc,snapshot,fence);if(result?.published)published++;
   }catch(e){if(e.message==='parser_busy_or_uncertain'){await status(snapshot.ref,{state:'waiting',reason:'Waiting for the active parse to finish.'});continue;}errors++;await status(snapshot.ref,{state:'needs_review',reason:'Automatic attachment stopped safely; source, listing or media needs checking.',code:/^[a-z0-9_]+$/.test(e.message||'')?e.message:'publication_failed',assessmentRevision:c.revision,manualRequestAt:c.publicationRequestedAt||null});}
  }
  await healthRef.set({checkedAt:iso(),checked,published,reviewQueued,errors,cursor:page.empty||last===page.docs.at(-1)?.id?null:last},{merge:true});
  return {checked,published,reviewQueued,errors};
 });
}
export async function cleanupPublished(svc) {
 const {db,publicBucket}=svc;if((await db.doc('runtime_metadata/video_review').get()).data()?.publishedCleanupEnabled!==true)return {disabled:true};
 return registryLease(db,async fence=>{
  const health=db.doc('runtime_metadata/published_video_cleanup_health'),cursor=(await health.get()).data()?.cursor||null,deadline=Date.now()+430000;
  let last=cursor,inspected=0,deleted=0,protectedCount=0,finished=false;
  while(Date.now()<deadline){let q=db.collection('listing_video_assets').orderBy(FieldPath.documentId());if(last)q=q.startAfter(last);const page=await q.limit(100).get();if(page.empty){finished=true;break;}
   for(const snapshot of page.docs){if(Date.now()>=deadline)break;last=snapshot.id;inspected++;
    const claim=await db.runTransaction(async tx=>{
     await fence(tx);const s=await tx.get(snapshot.ref),a=s.data();if(!a||a.state==='deleted')return null;
     if(a.objectPath!==publicPath(s.id)||!Array.isArray(a.plan?.bindings)||!a.plan.bindings.length||a.plan.bindings.some(b=>!/^(venues\/[A-Za-z0-9_.-]+\/events\/[A-Za-z0-9_.-]+|events\/[A-Za-z0-9_.-]+)$/.test(b.path)||!/^\d+$/.test(b.sourceId)||!Number.isFinite(Date.parse(b.expiresAt))))throw Error('cleanup_asset_identity_invalid');
     const bindings=a.plan.bindings,docs=await tx.getAll(...bindings.map(b=>db.doc(b.path))),links=await tx.getAll(...bindings.map(b=>db.doc(`listing_video_links/${hash(b.path)}`)));
     const active=bindings.some((b,i)=>links[i].data()?.state==='ready'&&links[i].data()?.assetId===s.id&&bindingIsCurrent(b,docs[i].data()));
     if(active&&a.state==='ready'){protectedCount++;if(a.unreferencedSince)tx.update(s.ref,{unreferencedSince:FieldValue.delete()});return null;}
     if(a.state==='ready'&&!a.unreferencedSince){tx.update(s.ref,{unreferencedSince:iso()});return null;}
     if(!cleanupDue(a))return null;
     tx.update(s.ref,{state:'deleting',deletionClaimedAt:iso()});links.forEach(l=>{if(l.data()?.assetId===s.id)tx.update(l.ref,{state:'retired'});});return a.objectPath;
    });
    if(!claim)continue;
    const file=publicBucket.file(claim);try{const [m]=await file.getMetadata();if(m.metadata?.sha256!==snapshot.id||!['listing-video-pilot-v1',PUBLIC_POLICY].includes(m.metadata?.policy)||!m.generation)throw Error('public_cleanup_ownership_drift');await file.delete({ifGenerationMatch:m.generation});}catch(e){if(e.code!==404)throw e;}
    await snapshot.ref.update({state:'deleted',deletedAt:iso()});deleted++;
   }
   if(page.size<100){finished=true;break;}
  }
  const result={checkedAt:iso(),inspected,deleted,protected:protectedCount,cursor:finished?null:last};await health.set(result,{merge:true});return result;
 });
}
