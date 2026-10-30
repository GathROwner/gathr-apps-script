// Exact two-screening attachment for the authorized 83-second cost trial.
const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const auth=require('C:/Users/craig/.codex/worktrees/luna-accounting-release/gathr-apps-script/functions/artifacts/ocr-caption-fooddrive-oct18/tools/normal-auth.cjs');
const root='C:/Users/craig/Documents/Codex/2026-10-30/video-model-comparison/hokum-longer-trial',mode=process.argv[2]||'prepare';
(async()=>{
 await auth.signIn();const p=await import(pathToFileURL(path.resolve(__dirname,'../manual-publication.mjs')));
 const backend='C:/Users/craig/.codex/worktrees/listing-video-pilot',store=require(backend+'/lib/video/store.js'),media=require(backend+'/lib/video/media.js');
 const admin=require('firebase-admin');admin.initializeApp({credential:admin.credential.cert(require('C:/Users/craig/Dev/gathr-apps-script/firebase/service-account.json')),projectId:'gathr-migrated'});
 const db=admin.firestore(),bucket=admin.storage().bucket('gathr-uploaded-images'),version=store.documentVersion;
 const candidatePath='private_video_candidates/18f8fbc8f18ab28887e96c777ddb77b5167c8e2c6b5e051a867222600940785f';
 const result=JSON.parse(await fs.readFile(root+'/RESULT.json','utf8'));
 const proof={sourceVideoId:'1068937392790830',reviewedSHA256:result.sha256,maximumSeconds:90};
 const paths=['venues/slug_citycinemachtown/events/eOgxECuJQTd8mDr9nuLI','venues/slug_citycinemachtown/events/2WeB14bM4anHk3Eujh2A'];
 const config=auth.data(await auth.get('runtime_metadata/video_review'));
 const save=(n,x)=>fs.writeFile(root+'/'+n,JSON.stringify(x,null,2),{flag:'wx'});
 async function idle(tx){const locks=await tx.get(db.collection('processing_locks').limit(1000)),cp=await tx.get(db.collection('processing_checkpoints').limit(1));if(locks.size===1000||locks.docs.some(d=>!['completed','failed','cancelled','canceled','released'].includes(d.data().status))||!cp.empty)throw Error('Parser is active or uncertain');}
 if(mode==='prepare'){
  const cdoc=await db.doc(candidatePath).get(),c=cdoc.data();process.env.FFPROBE_PATH=require('ffprobe-static').path;
  const probe=await media.probeVideo(root+'/video.mp4');p.validateSelection(c,config,probe,Date.now(),proof);
  if(p.digest(await fs.readFile(root+'/video.mp4'))!==c.sha256)throw Error('Hokum rendition drift');
  const events=await db.getAll(...paths.map(x=>db.doc(x))),bindings=[],fingerprints=[],matches=[];
  for(let i=0;i<events.length;i++){const d=events[i],e=d.data();if(!d.exists||e.startDate!==['2026-10-30','2026-10-31'][i]||e.startTime!==['19:00','16:00'][i]||e.name!=='Hokum')throw Error('Hokum occurrence drift');
   const match={path:paths[i],venueId:'slug_citycinemachtown',date:e.startDate,listingSourceId:c.sourcePostId,mode:'same_post',reason:'Official City Cinema post explicitly advertises Friday at 19:00 and Saturday at 16:00 for Hokum. Original film-release end-card is not the local cinema screening schedule.'};p.validateMatch(c,e,match);
   bindings.push({path:paths[i],sourceId:c.sourcePostId,updateTime:version(d.updateTime),expiresAt:p.expiryFor(e)});fingerprints.push(store.listingFingerprint(e));matches.push(match);
  }
  const plan={version:'listing-video-portal-manual-v1',sourcePostId:c.sourcePostId,sourceVideoId:c.sourceVideoId,sourceAudio:'available',sha256:c.sha256,probe,bindings,
   review:{decision:'approve',method:'explicit_original_source_use_plus_reviewed_rendition',selectionDigest:p.digest(JSON.stringify(c.humanJudgment)),reviewedAt:c.humanJudgment.reviewedAt,fullClipWatched:null,audioReviewed:null,evidence:'Craig selected this exact original source video and explicitly requested publication of Use selections. The complete source rendition was recovered anonymously, fully decoded, sampled over its full 83-second timeline and reviewed by Luna; byte hash is bound to the one-video cost trial. No audio or footage was removed.'}};
  const packet={atUTC:new Date().toISOString(),candidateVersion:version(cdoc.updateTime),proof,plan,fingerprints,matches};
  const targets=[candidatePath,...paths,'runtime_metadata/listing_video_pilot','listing_video_assets/'+c.sha256,...paths.map(x=>'listing_video_links/'+p.digest(x))];
  await save('PUBLICATION_BEFORE.json',await Promise.all(targets.map(x=>auth.get(x).then(document=>({path:x,document})))));await save('PUBLICATION_PLAN.json',packet);
  console.log(JSON.stringify({prepared:true,seconds:probe.durationSeconds,paths}));return;
 }
 const packet=JSON.parse(await fs.readFile(root+'/PUBLICATION_PLAN.json','utf8')),plan=packet.plan,asset=db.doc('listing_video_assets/'+plan.sha256),linkRefs=paths.map(x=>db.doc('listing_video_links/'+p.digest(x))),quota=db.doc('runtime_metadata/listing_video_pilot');
 async function fresh(tx,expectedState){
  await idle(tx);const docs=await tx.getAll(db.doc(candidatePath),...paths.map(x=>db.doc(x)),asset,...linkRefs),c=docs[0].data();
  if(version(docs[0].updateTime)!==packet.candidateVersion)throw Error('Hokum selection changed');p.validateSelection(c,config,plan.probe,Date.now(),packet.proof);
  docs.slice(1,3).forEach((d,i)=>{p.validateMatch(c,d.data(),packet.matches[i]);if(version(d.updateTime)!==plan.bindings[i].updateTime||store.listingFingerprint(d.data())!==packet.fingerprints[i])throw Error('Hokum listing changed');});
  for(const d of docs.slice(3))if(expectedState?d.data()?.state!==expectedState:d.exists)throw Error('Hokum reservation drift');
 }
 if(mode==='apply'){
  const ota=JSON.parse(await fs.readFile(root+'/OTA_VERIFIED.json','utf8'));if(ota.commit!=='1cb68ecc37e19fe665cc1067cb6a04bc7c64f765'||ota.runtime!=='1.1.20'||ota.platform!=='ios'||!ota.newest)throw Error('Longer playback release not verified');
  await save('PUBLICATION_ATTEMPT.json',{atUTC:new Date().toISOString(),packetSHA256:p.digest(JSON.stringify(packet))});
  await db.runTransaction(async tx=>{await fresh(tx,null);const q=await tx.get(quota),ids=q.data()?.assetIds||[];if(ids.length>=20||ids.includes(plan.sha256))throw Error('Registry drift');const at=new Date().toISOString();
   tx.set(quota,{version:'listing-video-pilot-v1',assetIds:[...ids,plan.sha256],updatedAt:at});tx.create(asset,{state:'preparing',plan,fingerprints:packet.fingerprints,objectPath:'listingvideos/'+plan.sha256+'.mp4',createdAt:at,stagingExpiresAt:new Date(Date.now()+86400000).toISOString()});linkRefs.forEach((ref,i)=>tx.create(ref,{state:'preparing',assetId:plan.sha256,binding:plan.bindings[i],fingerprint:packet.fingerprints[i]}));});
  await save('PUBLICATION_RESERVED.json',{atUTC:new Date().toISOString(),assetId:plan.sha256});
  const bytes=await fs.readFile(root+'/video.mp4');if(p.digest(bytes)!==plan.sha256)throw Error('Hokum bytes changed');await bucket.file('listingvideos/'+plan.sha256+'.mp4').save(bytes,{resumable:false,validation:'crc32c',preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:'video/mp4',cacheControl:'public,max-age=3600',metadata:{sha256:plan.sha256,policy:'listing-video-pilot-v1'}}});
  const receipt=await db.runTransaction(async tx=>{await fresh(tx,'preparing');const at=new Date().toISOString();tx.update(asset,{state:'ready',publishedAt:at});linkRefs.forEach(ref=>tx.update(ref,{state:'ready'}));return{at,assetId:plan.sha256,paths,eventWrites:0};});
  await save('PUBLICATION_COMMITTED.json',receipt);console.log(JSON.stringify({committed:true,receipt:root+'/PUBLICATION_COMMITTED.json',...receipt}));return;
 }
 if(mode==='verify'){
  const r=await fetch('https://northamerica-northeast1-gathr-migrated.cloudfunctions.net/getListingVideos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paths})}),v=await r.json();
  for(let i=0;i<paths.length;i++){if(v.videos[paths[i]]?.assetId!==plan.sha256||v.videos[paths[i]].durationSeconds!==plan.probe.durationSeconds)throw Error('App metadata missing longer video');const d=await db.doc(paths[i]).get();if(version(d.updateTime)!==plan.bindings[i].updateTime)throw Error('Hokum event changed');}
  const url=v.videos[paths[0]].url,full=await fetch(url);if(!full.ok||p.digest(Buffer.from(await full.arrayBuffer()))!==plan.sha256)throw Error('Longer public bytes mismatch');const range=await fetch(url,{headers:{Range:'bytes=0-63'}});if(range.status!==206||(await range.arrayBuffer()).byteLength!==64)throw Error('Longer byte range failed');
  const cdoc=await auth.get(candidatePath),c=auth.data(cdoc),delta={manualPublication:{state:'published',paths,assetId:plan.sha256,checkedAt:new Date().toISOString(),reason:'83-second human-selected trial published after compatible iOS Production update; both current screening links verified.'},reasons:[],state:'recommended'};
  await save('PRIVATE_STATUS_BEFORE.json',cdoc);const receipt=await auth.request(auth.database+'/documents:commit','POST',{writes:[{update:{name:cdoc.name,fields:auth.fields(delta)},updateMask:{fieldPaths:Object.keys(delta)},currentDocument:{updateTime:cdoc.updateTime}}]});
  const out={atUTC:new Date().toISOString(),assetId:plan.sha256,paths,seconds:plan.probe.durationSeconds,bytes:plan.probe.bytes,appMetadata:true,publicSHA256:true,range206:true,eventsUnchanged:true,privateStatusReceipt:receipt};await save('PUBLICATION_VERIFIED.json',out);console.log(JSON.stringify(out));return;
 }
 throw Error('Unknown mode');
})().catch(e=>{console.error(e.message);process.exitCode=1});
