// Exact release operations; private native backups stay outside Git.
const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const auth=require('C:/Users/craig/.codex/worktrees/luna-accounting-release/gathr-apps-script/functions/artifacts/ocr-caption-fooddrive-oct18/tools/normal-auth.cjs');
const root='C:/Users/craig/Documents/Codex/2026-10-30/video-model-comparison/automation-90s',mode=process.argv[2]||'capture';
const resource=auth.database.replace('https://firestore.googleapis.com/v1/',''),functionBase='https://cloudfunctions.googleapis.com/v2/projects/gathr-migrated/locations/northamerica-northeast1/functions/';
const scheduler='https://cloudscheduler.googleapis.com/v1/projects/gathr-migrated/locations/northamerica-northeast1/jobs/';
const names=['discoverListingVideos','reviewListingVideos','videoReviewPortal','publishListingVideos','cleanupPublishedListingVideos'];
async function save(name,x){await fs.mkdir(root,{recursive:true});await fs.writeFile(root+'/'+name,JSON.stringify(x,null,2),{flag:'wx'});}
async function update(doc,delta){return auth.request(auth.database+'/documents:commit','POST',{writes:[{update:{name:doc.name,fields:auth.fields(delta)},updateMask:{fieldPaths:Object.keys(delta)},currentDocument:{updateTime:doc.updateTime}}]});}
(async()=>{
 await auth.signIn();await fs.mkdir(root,{recursive:true});
 if(mode==='capture'){
  const all=await auth.request('https://cloudfunctions.googleapis.com/v2/projects/gathr-migrated/locations/-/functions'),config=await auth.get('runtime_metadata/video_review');
  const parser=all.functions.filter(f=>['processDataset','processDatasetResume','processDatasetSelectedRows'].includes(f.name.split('/').at(-1)));
  if(parser.length!==3||parser.some(f=>f.labels?.['firebase-functions-hash']!=='e179029b583fc29c700f8c66e4ca39beb259f6df'))throw Error('Accepted parser baseline changed');
  const candidates=await auth.query('private_video_candidates',null),assets=await auth.query('listing_video_assets',null),links=await auth.query('listing_video_links',null);
  const legacyJob=await auth.request(scheduler+'firebase-schedule-scheduledListingVideoCleanup-northamerica-northeast1');
  await save('BEFORE.json',{atUTC:new Date().toISOString(),config,candidates,assets,links,parser,videoFunctions:all.functions.filter(f=>names.includes(f.name.split('/').at(-1))),legacyJob});
  console.log(JSON.stringify({captured:candidates.length,publicAssets:assets.length,publicLinks:links.length,parserUnchanged:true,legacyJobState:legacyJob?.state}));return;
 }
 if(mode==='smoke'){
  const {createRequire}=require('node:module'),req=createRequire(path.resolve(__dirname,'../package.json'));
  const engine=await import(pathToFileURL(path.resolve(__dirname,'../evidence-worker.mjs'))),editorial=await import(pathToFileURL(path.resolve(__dirname,'../editorial-review.mjs'))),pipeline=await import(pathToFileURL(path.resolve(__dirname,'../pipeline.mjs')));
  const base=root+'/../hokum-longer-trial',media=root+'/smoke';await fs.mkdir(media,{recursive:true});
  try{await fs.access(media+'/video.mp4');}catch{await pipeline.normalize(base+'/original.mp4',media+'/video.mp4');}
  const old=JSON.parse(await fs.readFile(base+'/input.json','utf8')),clip=old.clips[0];clip.videoPath=media+'/video.mp4';clip.listingContext.price='';clip.listingContext.description+=' Original trailer release date is distinct from local screenings.';
  await fs.writeFile(media+'/input.json',JSON.stringify(old));
  let prepared;try{prepared=JSON.parse(await fs.readFile(media+'/prepared/prepared.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;prepared=await engine.prepare({manifestPath:media+'/input.json',out:media+'/prepared'});}
  await engine.rebindTranscripts({preparedPath:media+'/prepared/prepared.json',transcriptsPath:base+'/transcripts/transcripts.json',out:media+'/transcripts',matchByAudioSHA:true});
  const secret=await auth.request('https://secretmanager.googleapis.com/v1/projects/gathr-migrated/secrets/GATHR_OPENAI_API_KEY/versions/latest:access'),apiKey=Buffer.from(secret.payload.data,'base64').toString().trim();
  const report=await editorial.reviewEditorial({preparedPath:media+'/prepared/prepared.json',transcriptsPath:media+'/transcripts/transcripts.json',out:media+'/editorial',execute:true,apiKey});
  const result={atUTC:new Date().toISOString(),seconds:prepared.clips[0].video.durationSeconds,frames:prepared.clips[0].frames.length,entry:report.entries[0],speechReused:true,publicWrites:0};
  await save('REAL_90S_SMOKE.json',result);if(result.entry.state!=='recommended')throw Error('Longer clip review did not pass; inspect evidence');console.log(JSON.stringify({seconds:result.seconds,frames:result.frames,state:result.entry.state,speechReused:true,estimatedAPIUSD:result.entry.callSummary.estimatedNewCostUSD}));return;
 }
 if(mode==='pause'){
  if(await auth.get('runtime_metadata/video_review_worker_lock')||await auth.get('runtime_metadata/listing_video_registry_lock'))throw Error('Video worker is active; defer pause');
  const config=await auth.get('runtime_metadata/video_review'),c=auth.data(config);if(c.enabled!==true||c.automaticPublication!==false)throw Error('Video activation drift');
  const receipt=await update(config,{enabled:false});await save('PAUSED.json',{before:config,receipt});console.log('Video-only review paused for the narrow release');return;
 }
 if(mode==='cleanup-enable'){
  const f=await auth.request(functionBase+'cleanupPublishedListingVideos');if(f?.state!=='ACTIVE'||f.serviceConfig.serviceAccountEmail!=='firebase-adminsdk-fbsvc@gathr-migrated.iam.gserviceaccount.com')throw Error('New owned cleanup is not active');
  const config=await auth.get('runtime_metadata/video_review');if(auth.data(config).enabled!==false)throw Error('Unexpected worker activation');
  const receipt=await update(config,{publishedCleanupEnabled:true});await save('CLEANUP_ENABLED.json',{receipt});
  await auth.request(scheduler+'firebase-schedule-cleanupPublishedListingVideos-northamerica-northeast1:run','POST',{});console.log('New paginated owned-video cleanup triggered');return;
 }
 if(mode==='activate'){
  for(const name of names){const f=await auth.request(functionBase+name);if(f?.state!=='ACTIVE')throw Error(name+' is not active');}
  const health=auth.data(await auth.get('runtime_metadata/published_video_cleanup_health'));if(!health||health.deleted!==0||health.protected<9)throw Error('Baseline cleanup protection not verified');
  const legacy=await auth.request(scheduler+'firebase-schedule-scheduledListingVideoCleanup-northamerica-northeast1');if(!legacy||legacy.state!=='ENABLED')throw Error('Legacy cleanup schedule drift');
  await auth.request(legacy.name.startsWith('projects/')?'https://cloudscheduler.googleapis.com/v1/'+legacy.name+':pause':legacy.name+':pause','POST',{});await save('LEGACY_CLEANUP_PAUSED.json',{before:legacy});
  const docs=await auth.query('private_video_candidates',null),writes=[],migration=[];
  const rows=[...JSON.parse(await fs.readFile(root+'/../daily-release/PRIVATE_INPUT_ROWS.json','utf8')),...JSON.parse(await fs.readFile('C:/Users/craig/Documents/Codex/2026-10-28/task/input-rows.json','utf8')),...JSON.parse(await fs.readFile('C:/Users/craig/Documents/Codex/2026-10-29/task/parse-audit/input-rows.json','utf8'))];
  for(const d of docs){const c=auth.data(d),delta={},source=rows.find(r=>String(r.postId||r.id)===c.sourcePostId);
   if(!c.sourcePostedAt&&source?.time&&Number.isFinite(Date.parse(source.time)))delta.sourcePostedAt=new Date(source.time).toISOString();
   if(c.reasons?.includes('clip_over_60_seconds')){
    if(c.durationSeconds>90)delta.reasons=c.reasons.map(r=>r==='clip_over_60_seconds'?'clip_over_90_seconds':r);
    else if(c.sourceUrl&&!['dont_use','unsure','legacy_agreement'].includes(c.humanJudgment?.choice||({dont_use_video:'dont_use',unsure:'unsure',agree_with_decision:'legacy_agreement'}[c.humanJudgment?.judgment]))){Object.assign(delta,{state:'queued',requestedReviewVersion:'editorial-content-v2',reasons:[],lastQueuedAt:new Date().toISOString()});}
    else if(!c.sourceUrl)delta.reasons=c.reasons.map(r=>r==='clip_over_60_seconds'?'direct_video_url_unavailable':r);
   }
   if(Object.keys(delta).length){writes.push({update:{name:d.name,fields:auth.fields(delta)},updateMask:{fieldPaths:Object.keys(delta)},currentDocument:{updateTime:d.updateTime}});migration.push({id:d.name.split('/').at(-1),fields:Object.keys(delta),queued:delta.state==='queued'});}
  }
  await save('MIGRATION_BEFORE.json',{candidates:docs,migration});
  if(writes.length){const receipt=await auth.request(auth.database+'/documents:commit','POST',{writes});await save('MIGRATION_COMMITTED.json',{receipt,migration});}
  const config=await auth.get('runtime_metadata/video_review'),before=auth.data(config);if(before.enabled!==false||before.automaticPublication!==false||before.publishedCleanupEnabled!==true)throw Error('Activation configuration drift');
  const delta={enabled:true,automaticPublication:true,automaticPublicationEnabledAt:new Date().toISOString(),maxSeconds:90,automaticPublicationPolicy:'listing-video-auto-v1',authorizedBy:'Craig: raise maximum to 90 seconds and automatically attach clear event/special matches; only edge cases need human review.'};
  const receipt=await update(config,delta);await save('ACTIVATED.json',{before:config,delta,receipt});
  for(const name of ['reviewListingVideos','publishListingVideos'])await auth.request(scheduler+`firebase-schedule-${name}-northamerica-northeast1:run`,'POST',{});
  console.log(JSON.stringify({enabled:true,automaticPublication:true,maxSeconds:90,migrationFieldsUpdated:migration.length,longerClipsQueued:migration.filter(x=>x.queued).length,legacyCleanupPaused:true}));return;
 }
 if(mode==='verify'){
  const before=JSON.parse(await fs.readFile(root+'/BEFORE.json','utf8')),docs=await auth.query('private_video_candidates',null),assets=await auth.query('listing_video_assets',null),links=await auth.query('listing_video_links',null),config=auth.data(await auth.get('runtime_metadata/video_review'));
  const parser=await auth.request('https://cloudfunctions.googleapis.com/v2/projects/gathr-migrated/locations/-/functions');for(const p of before.parser){const now=parser.functions.find(f=>f.name===p.name);if(now?.serviceConfig.revision!==p.serviceConfig.revision||now.labels?.['firebase-functions-hash']!==p.labels?.['firebase-functions-hash'])throw Error('Parser deployment drift');}
  const result={atUTC:new Date().toISOString(),config,health:auth.data(await auth.get('runtime_metadata/video_publication_health')),reviewHealth:auth.data(await auth.get('runtime_metadata/video_review_health')),cleanup:auth.data(await auth.get('runtime_metadata/published_video_cleanup_health')),candidates:docs,publicAssets:assets.length,publicLinks:links.length,parserUnchanged:true};
  await fs.writeFile(root+'/LIVE_VERIFIED.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({enabled:config.enabled,automaticPublication:config.automaticPublication,maxSeconds:config.maxSeconds,health:result.health,reviewHealth:result.reviewHealth,publicAssets:assets.length,publicLinks:links.length,states:docs.reduce((o,d)=>{const c=auth.data(d),s=c.publication?.state||c.manualPublication?.state||c.state;o[s]=(o[s]||0)+1;return o;},{}),queued:docs.filter(d=>['queued','processing'].includes(auth.data(d).state)).length,parserUnchanged:true}));return;
 }
 throw Error('Unknown release operation');
})().catch(e=>{console.error(e.message);process.exitCode=1});
