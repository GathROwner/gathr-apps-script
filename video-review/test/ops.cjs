// Coordinator-only scoped operations. Credentials remain in the existing CLI session.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const auth=require('C:/Users/craig/.codex/worktrees/luna-accounting-release/gathr-apps-script/functions/artifacts/ocr-caption-fooddrive-oct18/tools/normal-auth.cjs');
const folder='C:/Users/craig/Documents/Codex/2026-10-30/video-model-comparison/daily-release';
const bucket='gathr-private-video-reviews';
const uid='odDPRQwbUmQlZz4bzdGf5fYxeeB2';
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const mode=process.argv[2]||'preflight';
const resource=auth.database.replace('https://firestore.googleapis.com/v1/','');
async function save(name,value){await fs.mkdir(folder,{recursive:true});await fs.writeFile(path.join(folder,name),JSON.stringify(value,null,2));}
async function commit(writes){return auth.request(auth.database+'/documents:commit','POST',{writes});}
(async()=>{
 await auth.signIn();
 if(mode==='preflight'){
  const idle=await auth.idle();
  const functions=await auth.request('https://cloudfunctions.googleapis.com/v2/projects/gathr-migrated/locations/-/functions');
  const parser=functions.functions.filter(f=>['processDataset','processDatasetResume','processDatasetSelectedRows'].includes(f.name.split('/').at(-1))).map(f=>({name:f.name,hash:f.labels?.['firebase-functions-hash'],revision:f.serviceConfig.revision}));
  if(parser.length!==3||parser.some(p=>p.hash!=='e179029b583fc29c700f8c66e4ca39beb259f6df'))throw Error('Accepted parser baseline changed; reconcile before release');
  const meta=await auth.request(`https://storage.googleapis.com/storage/v1/b/${bucket}`);
  const existing=await auth.get('runtime_metadata/video_review');
  await save('PREFLIGHT.json',{atUTC:new Date().toISOString(),parser,idle:{activeLocks:idle.activeLocks,checkpointCount:idle.checkpointCount},bucketExists:!!meta,existingConfig:existing});
  console.log(JSON.stringify({parser,bucketExists:!!meta,existingConfig:!!existing,activeLocks:idle.activeLocks}));
 }
 if(mode==='provision'){
  const pre=JSON.parse(await fs.readFile(path.join(folder,'PREFLIGHT.json'),'utf8'));
  if(Date.now()-Date.parse(pre.atUTC)>3600000)throw Error('Refresh preflight');
  let meta=await auth.request(`https://storage.googleapis.com/storage/v1/b/${bucket}`);
  if(!meta)meta=await auth.request('https://storage.googleapis.com/storage/v1/b?project=gathr-migrated','POST',{
   name:bucket,location:'northamerica-northeast1',storageClass:'STANDARD',
   iamConfiguration:{uniformBucketLevelAccess:{enabled:true},publicAccessPrevention:'enforced'},
   lifecycle:{rule:[{action:{type:'Delete'},condition:{age:14}}]},softDeletePolicy:{retentionDurationSeconds:'604800'}
  });
  if(meta.iamConfiguration?.publicAccessPrevention!=='enforced'||!meta.iamConfiguration?.uniformBucketLevelAccess?.enabled)throw Error('Private bucket guard failed');
  if(await auth.get('runtime_metadata/video_review'))throw Error('Activation config already exists; inspect drift');
  const disabled={enabled:false,enabledAt:'2026-10-30T00:00:00.000Z',adminUids:[uid],automaticPublication:false,createdAt:new Date().toISOString()};
  const receipt=await commit([{update:{name:resource+'/documents/runtime_metadata/video_review',fields:auth.fields(disabled)},currentDocument:{exists:false}}]);
  await save('PROVISIONED.json',{bucket:meta,disabledConfig:disabled,receipt});console.log(JSON.stringify({bucket:meta.name,publicAccess:meta.iamConfiguration.publicAccessPrevention,enabled:false}));
 }
 if(mode==='seed'){
  const root='C:/Users/craig/Documents/Codex/2026-10-30/video-model-comparison/v2-triage';
  const input=JSON.parse((await fs.readFile(root+'/INPUT.json','utf8')).replace(/^\uFEFF/,''));const report=JSON.parse(await fs.readFile(root+'/triage/triage.json','utf8'));
  const {initializeApp,cert}=require('firebase-admin/app');const {getStorage}=require('firebase-admin/storage');
  const a=initializeApp({credential:cert(require('C:/Users/craig/Dev/gathr-apps-script/firebase/service-account.json'))});const storage=getStorage(a).bucket(bucket);
  const ids=[];
  for(const e of report.entries){const c=input.clips.find(c=>c.id===e.id);const bytes=await fs.readFile(c.videoPath),sha=hash(bytes);
   const id=hash(JSON.stringify([c.sourcePostId,c.sourceVideoId,c.caption,'daily-video-review-v1']));
   const prior=await auth.get('private_video_candidates/'+id);if(prior)throw Error('Seed candidate exists; inspect before any retry');
   const object=`clips/${id}.mp4`;
   await storage.file(object).save(bytes,{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:'video/mp4',cacheControl:'private, no-store',metadata:{sha256:sha,owner:'daily-video-review-v1'}}});
   const at=new Date().toISOString(),expires=new Date(Date.now()+14*86400000).toISOString();
   const data={id,sourcePostId:c.sourcePostId,sourceVideoId:c.sourceVideoId,caption:c.caption,sourcePage:`https://www.facebook.com/reel/${c.sourceVideoId}/`,
    fileId:'saved-video-trial-20261030',importedFrom:'Saved October 30 comparison; no new model calls',discoveredAt:at,finishedAt:at,expiresAt:expires,cleanupAt:expires,
    sha256:sha,object,bytes:bytes.length,durationSeconds:c.probe.durationSeconds,hasAudio:c.sourceAudio,sourceAudio:c.sourceAudio,
    state:e.terminalDecision==='recommend_for_manual_review'?'recommended':e.terminalDecision==='reject'?'rejected':'held',decision:e.terminalDecision,
    reasons:e.holdReasons,route:e.route,luna:e.luna?.modelAssessment??null,terra:e.terra?.modelAssessment??null,
    listings:c.listingContext?.sourceMatched?[c.listingContext]:[],revision:hash(JSON.stringify([sha,e])),policy:'daily-video-review-v1'};
   const receipt=await commit([{update:{name:resource+'/documents/private_video_candidates/'+id,fields:auth.fields(data)},currentDocument:{exists:false}}]);
   ids.push({id,clip:c.id,sha256:sha,state:data.state,commitTime:receipt.commitTime});await save('SEEDED.json',{atUTC:at,ids});
  }
  console.log(JSON.stringify({imported:ids.length,newPaidCalls:0,states:ids.reduce((o,x)=>(o[x.state]=(o[x.state]||0)+1,o),{})}));
 }
 if(mode==='activate'){
  const d=await auth.get('runtime_metadata/video_review');const before=auth.data(d);
  if(before.enabled!==false||JSON.stringify(before.adminUids)!==JSON.stringify([uid])||before.automaticPublication!==false)throw Error('Activation drift');
  const receipt=await commit([{update:{name:d.name,fields:auth.fields({enabled:true,activatedAt:new Date().toISOString()})},updateMask:{fieldPaths:['enabled','activatedAt']},currentDocument:{updateTime:d.updateTime}}]);
  await save('ACTIVATED.json',{before,receipt});console.log(JSON.stringify({enabled:true,automaticPublication:false}));
 }
 if(mode==='verify'){
  const functions=await auth.request('https://cloudfunctions.googleapis.com/v2/projects/gathr-migrated/locations/-/functions');
  const names=['discoverListingVideos','reviewListingVideos','cleanupVideoReviews','videoReviewPortal'];
  const deployed=functions.functions.filter(f=>names.includes(f.name.split('/').at(-1))).map(f=>({name:f.name,revision:f.serviceConfig.revision,uri:f.serviceConfig.uri,state:f.state,codebase:f.labels?.['firebase-functions-codebase'],hash:f.labels?.['firebase-functions-hash'],secretKeys:f.serviceConfig.secretEnvironmentVariables?.map(x=>x.key)}));
  const pre=JSON.parse(await fs.readFile(path.join(folder,'PREFLIGHT.json'),'utf8'));
  for(const p of pre.parser){const live=functions.functions.find(f=>f.name===p.name);if(live.serviceConfig.revision!==p.revision||live.labels?.['firebase-functions-hash']!==p.hash)throw Error('Parser deployment drift');}
  const config=auth.data(await auth.get('runtime_metadata/video_review')),health=auth.data(await auth.get('runtime_metadata/video_review_health'));
  const all=await auth.query('private_video_candidates',['state','sourcePostId','sourceVideoId','reasons','object','sha256','decision','route','callSummary','fileId']);
  const data={atUTC:new Date().toISOString(),deployed,parserUnchanged:true,config,health,candidates:all.map(d=>({id:d.name.split('/').at(-1),...auth.data(d)}))};
  await save('LIVE_VERIFIED.json',data);console.log(JSON.stringify({deployed,parserUnchanged:true,enabled:config?.enabled,health,count:all.length,states:data.candidates.reduce((o,x)=>(o[x.state]=(o[x.state]||0)+1,o),{})}));
 }
})().catch(e=>{console.error(e.message);process.exitCode=1});
