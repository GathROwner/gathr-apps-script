// Fixed, authorized four-clip batch; no event edits, automatic hook, or general matching.
const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const auth=require('C:/Users/craig/.codex/worktrees/luna-accounting-release/gathr-apps-script/functions/artifacts/ocr-caption-fooddrive-oct18/tools/normal-auth.cjs');
const root='C:/Users/craig/Documents/Codex/2026-10-30/video-model-comparison/selected-publication',mode=process.argv[2]||'prepare';
const requestText='Okay, match the videos I marked Use to the right listings and get them into the app. Also test Hokum so we can see what a longer clip actually costs.';
const specs=[
 {video:'2140658959887034',path:'venues/slug_upeisu/events/wt1jmdKU11NwhyFrjev5',date:'2026-10-30',source:'1771394421660793',mode:'same_post',reason:'Same UPEI student-union source post, October 30 party, 22:00; current local party rather than a past-only recap.'},
 {video:'1110993928391583',path:'venues/slug_stpaulschurchinpei/events/Rc7yZb5itaERchXAQ83p',date:'2026-11-10',source:'1588554646630954',mode:'same_post',reason:'Same original post and poster: Faith Talk Peace, November 10 at 19:00, St Paul’s Parish Hall, 101 Prince Street.'},
 {video:'1634610118071598',path:'venues/fb_100063555340128/events/kwDxQf54x5dXfVASOifz',date:'2026-10-30',source:'1786099760185185',mode:'same_post',reason:'Exact source membership and the Tarot Card Reading package occurrence: one-night Friday October 30 package, private tarot reading and overnight stay. Not attached to yoga, meditation or happy-hour children.'},
 {video:'1105723392177986',path:'venues/fb_100063617721610/events/harvest_20261015_20261031_1700',date:'2026-10-31',source:'1727757279354846',mode:'verified_same_occurrence',reason:'Official Inn at Bay Fortune Halloween caption names October 31, Chefs’ Harvest and chef Mackenzie Brown; retained October 31 programme is the same venue/date/chef dining occurrence. Attach only to October 31. The $950 overnight package is optional and does not replace the listing’s dining-only price or schedule.'},
];
async function save(name,value){await fs.writeFile(root+'/'+name,JSON.stringify(value,null,2),{flag:'wx'});}
(async()=>{
 await auth.signIn();
 const policy=await import(pathToFileURL(path.resolve(__dirname,'../manual-publication.mjs')));
 const {digest,validateSelection,validateMatch,expiryFor,selected}=policy;
 const backend='C:/Users/craig/.codex/worktrees/listing-video-pilot';
 const store=require(backend+'/lib/video/store.js'),media=require(backend+'/lib/video/media.js');
 process.env.FFPROBE_PATH=require('ffprobe-static').path;
 const admin=require('firebase-admin');admin.initializeApp({credential:admin.credential.cert(require('C:/Users/craig/Dev/gathr-apps-script/firebase/service-account.json')),projectId:'gathr-migrated'});
 const db=admin.firestore(),privateBucket=admin.storage().bucket('gathr-private-video-reviews'),publicBucket=admin.storage().bucket('gathr-uploaded-images');
 const config=auth.data(await auth.get('runtime_metadata/video_review'));
 const cap=JSON.parse(await fs.readFile(root+'/CAPTURE.json','utf8'));
 const version=store.documentVersion;
 async function idle(tx){
  const locks=tx?await tx.get(db.collection('processing_locks').limit(1000)):await db.collection('processing_locks').limit(1000).get();
  if(locks.size===1000||locks.docs.some(d=>!['completed','failed','cancelled','canceled','released'].includes(d.data().status)))throw Error('Parser is active or unknown');
  const cp=tx?await tx.get(db.collection('processing_checkpoints').limit(1)):await db.collection('processing_checkpoints').limit(1).get();
  if(!cp.empty)throw Error('Parser checkpoint requires review');
 }
 if(mode==='prepare'){
  await idle();const plans=[];
  for(const spec of specs){const entry=cap.selected.find(x=>auth.data(x.candidate).sourceVideoId===spec.video);if(!entry)throw Error('Selected source missing');
   const candidatePath=entry.candidate.name.split('/documents/')[1],candidate=await db.doc(candidatePath).get(),c=candidate.data();
   const event=await db.doc(spec.path).get();if(!event.exists)throw Error('Listing missing');
   const match={...spec,listingSourceId:spec.source,venueId:spec.path.split('/')[1],evidenceDigest:digest(JSON.stringify([spec,c.caption,event.data().description,event.data().timeFlags]))};
   validateMatch(c,event.data(),match);
   if(c.object!==`clips/${candidate.id}.mp4`)throw Error('Private clip namespace drift');
   const object=privateBucket.file(c.object),[meta]=await object.getMetadata();if(meta.metadata?.sha256!==c.sha256||meta.metadata?.owner!=='daily-video-review-v1')throw Error('Private media ownership mismatch');
   const [bytes]=await object.download();if(digest(bytes)!==c.sha256)throw Error('Private media hash mismatch');
   const file=root+'/'+c.sha256+'.mp4';try{await fs.writeFile(file,bytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST'||digest(await fs.readFile(file))!==c.sha256)throw e;}
   const probe=await media.probeVideo(file);validateSelection(c,config,probe);
   const expiresAt=expiryFor(event.data());if(Date.parse(expiresAt)<=Date.now())throw Error('Listing expired');
   const binding={path:spec.path,updateTime:version(event.updateTime),sourceId:spec.source,expiresAt};
   const plan={version:'listing-video-portal-manual-v1',sourceVideoId:c.sourceVideoId,sourcePostId:c.sourcePostId,sourceAudio:c.sourceAudio?'available':'unavailable',sha256:c.sha256,probe,bindings:[binding],review:{decision:'approve',method:'explicit_private_portal_use',reviewedAt:c.humanJudgment.reviewedAt,sha256:c.sha256,selectionDigest:digest(JSON.stringify(c.humanJudgment)),candidateRevision:c.revision,reviewer:'Authorized GathR reviewer',fullClipWatched:null,audioReviewed:null,authorization:requestText,evidence:spec.reason},matching:match};
   plans.push({candidatePath,candidateVersion:version(candidate.updateTime),plan,fingerprint:store.listingFingerprint(event.data()),file});
  }
  const paths=[...new Set(plans.flatMap(x=>[x.candidatePath,x.plan.bindings[0].path,'listing_video_assets/'+x.plan.sha256,'listing_video_links/'+digest(x.plan.bindings[0].path)]).concat(['runtime_metadata/listing_video_pilot','runtime_metadata/video_review']))];
  const backup=await Promise.all(paths.map(p=>auth.get(p).then(document=>({path:p,document}))));
  const packet={atUTC:new Date().toISOString(),requestText,plans,backup,eventWrites:0,feedWrites:0};
  await save('PUBLICATION_PLAN.json',packet);console.log(JSON.stringify({prepared:plans.length,eventWrites:0,paths:plans.map(p=>p.plan.bindings[0].path)}));return;
 }
 const packet=JSON.parse(await fs.readFile(root+'/PUBLICATION_PLAN.json','utf8'));
 const quotaRef=db.doc('runtime_metadata/listing_video_pilot');
 async function validateFresh(tx,allowReserved){
  await idle(tx);
  const cfg=(await tx.get(db.doc('runtime_metadata/video_review'))).data();
  const docs=await tx.getAll(...packet.plans.flatMap(x=>[db.doc(x.candidatePath),db.doc(x.plan.bindings[0].path),db.doc('listing_video_assets/'+x.plan.sha256),db.doc('listing_video_links/'+digest(x.plan.bindings[0].path))]));
  packet.plans.forEach((x,i)=>{const [candidate,event,asset,link]=docs.slice(i*4,i*4+4),c=candidate.data();
   if(!candidate.exists||version(candidate.updateTime)!==x.candidateVersion||c.sha256!==x.plan.sha256||!selected(c.humanJudgment))throw Error('Human decision or source drift');
   validateSelection(c,cfg,x.plan.probe);validateMatch(c,event.data(),x.plan.matching);
   if(version(event.updateTime)!==x.plan.bindings[0].updateTime||store.listingFingerprint(event.data())!==x.fingerprint)throw Error('Listing changed');
   if(allowReserved?(asset.data()?.state!=='preparing'||link.data()?.state!=='preparing'||link.data()?.assetId!==x.plan.sha256):(asset.exists||link.exists))throw Error('Publication reservation drift');
  });
 }
 if(mode==='apply'){
  await fs.writeFile(root+'/PUBLICATION_ATTEMPT.json',JSON.stringify({atUTC:new Date().toISOString(),planDigest:digest(JSON.stringify(packet))}),{flag:'wx'});
  await idle();
  const reserved=await db.runTransaction(async tx=>{
   await validateFresh(tx,false);const quota=await tx.get(quotaRef),ids=quota.data()?.assetIds||[];
   if(new Set(ids).size!==ids.length||ids.length+packet.plans.length>20)throw Error('Existing pilot registry capacity exceeded');
   const at=new Date().toISOString();
   tx.set(quotaRef,{version:'listing-video-pilot-v1',assetIds:[...ids,...packet.plans.map(x=>x.plan.sha256)],updatedAt:at});
   for(const x of packet.plans){tx.create(db.doc('listing_video_assets/'+x.plan.sha256),{state:'preparing',plan:x.plan,fingerprints:[x.fingerprint],objectPath:'listingvideos/'+x.plan.sha256+'.mp4',createdAt:at,stagingExpiresAt:new Date(Date.now()+86400000).toISOString()});tx.create(db.doc('listing_video_links/'+digest(x.plan.bindings[0].path)),{assetId:x.plan.sha256,binding:x.plan.bindings[0],fingerprint:x.fingerprint,state:'preparing'});}
   return{at,assets:packet.plans.map(x=>x.plan.sha256)};
  });
  await save('PUBLICATION_RESERVED.json',reserved);console.log(JSON.stringify({reserved:reserved.assets.length,receipt:root+'/PUBLICATION_RESERVED.json'}));
  for(const x of packet.plans){const bytes=await fs.readFile(x.file);if(digest(bytes)!==x.plan.sha256)throw Error('Reviewed bytes changed');
   await publicBucket.file('listingvideos/'+x.plan.sha256+'.mp4').save(bytes,{resumable:false,validation:'crc32c',preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:'video/mp4',cacheControl:'public,max-age=3600',metadata:{sha256:x.plan.sha256,policy:'listing-video-pilot-v1'}}});
  }
  const committed=await db.runTransaction(async tx=>{
   await validateFresh(tx,true);const at=new Date().toISOString();for(const x of packet.plans){tx.update(db.doc('listing_video_assets/'+x.plan.sha256),{state:'ready',publishedAt:at});tx.update(db.doc('listing_video_links/'+digest(x.plan.bindings[0].path)),{state:'ready'});}return{at,assets:packet.plans.map(x=>x.plan.sha256),paths:packet.plans.map(x=>x.plan.bindings[0].path),eventWrites:0};
  });
  await save('PUBLICATION_COMMITTED.json',committed);console.log(JSON.stringify({committed:true,...committed,receipt:root+'/PUBLICATION_COMMITTED.json'}));return;
 }
 if(mode==='verify'){
  const paths=packet.plans.map(x=>x.plan.bindings[0].path);
  const response=await fetch('https://northamerica-northeast1-gathr-migrated.cloudfunctions.net/getListingVideos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paths})});if(!response.ok)throw Error('App metadata request failed');
  const rpc=await response.json(),results=[];
  for(const x of packet.plans){const binding=x.plan.bindings[0],v=rpc.videos[binding.path];if(v?.assetId!==x.plan.sha256)throw Error('App video metadata mismatch');
   const event=await db.doc(binding.path).get();if(version(event.updateTime)!==binding.updateTime||store.listingFingerprint(event.data())!==x.fingerprint)throw Error('Event mutated');
   const r=await fetch(v.url);if(!r.ok||digest(Buffer.from(await r.arrayBuffer()))!==x.plan.sha256)throw Error('Public video byte mismatch');
   const range=await fetch(v.url,{headers:{Range:'bytes=0-63'}});if(range.status!==206||(await range.arrayBuffer()).byteLength!==64)throw Error('Public byte-range delivery failed');
   results.push({path:binding.path,sha256:v.assetId,seconds:v.durationSeconds,bytes:v.bytes,appMetadata:true,publicSHA256:true,range206:true,eventUnchanged:true});
  }
  await save('PUBLICATION_VERIFIED.json',{atUTC:new Date().toISOString(),results});console.log(JSON.stringify({verified:results.length,results}));return;
 }
 throw Error('Unknown operation');
})().catch(e=>{console.error(e.message);process.exitCode=1});
