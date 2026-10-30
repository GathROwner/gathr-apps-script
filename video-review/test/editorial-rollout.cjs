// Explicit coordinator operations for this reviewed private-queue update, never deployed.
const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url'),crypto=require('node:crypto');
const auth=require('C:/Users/craig/.codex/worktrees/luna-accounting-release/gathr-apps-script/functions/artifacts/ocr-caption-fooddrive-oct18/tools/normal-auth.cjs');
const root='C:/Users/craig/Documents/Codex/2026-10-30/video-model-comparison/editorial-rollout';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const mode=process.argv[2]||'snapshot',resource=auth.database.replace('https://firestore.googleapis.com/v1/','');
const loadModule=name=>import(pathToFileURL(path.resolve(__dirname,'..',name)).href);
async function save(name,data){await fs.mkdir(root,{recursive:true});await fs.writeFile(path.join(root,name),JSON.stringify(data,null,2),{flag:'wx'});}
async function main(){
 await auth.signIn();
 const {initializeApp,cert}=require('firebase-admin/app'),{getStorage}=require('firebase-admin/storage');
 const bucket=getStorage(initializeApp({credential:cert(require('C:/Users/craig/Dev/gathr-apps-script/firebase/service-account.json'))})).bucket('gathr-private-video-reviews');
 const engine=await loadModule('evidence-worker.mjs'),editorial=await loadModule('editorial-review.mjs');
 if(mode==='snapshot'){
  const docs=await auth.query('private_video_candidates',null);
  await save('BEFORE.json',{atUTC:new Date().toISOString(),config:await auth.get('runtime_metadata/video_review'),candidates:docs});
  console.log(JSON.stringify({snapshotted:docs.length,playable:docs.filter(d=>auth.data(d).object).length}));
 }
 if(mode==='cache'){
  const snapshot=JSON.parse(await fs.readFile(path.join(root,'BEFORE.json'),'utf8'));
  const sources=[];
  sources.push(JSON.parse(await fs.readFile('C:/Users/craig/Documents/Codex/2026-10-30/video-model-comparison/v2-triage/rebound/transcripts.json','utf8')));
  for(const doc of snapshot.candidates){const c=auth.data(doc);if(!c.artifacts)continue;
   if(c.artifacts!==`evidence/${doc.name.split('/').at(-1)}`)throw Error('Unexpected old evidence prefix');
   try{const [bytes]=await bucket.file(c.artifacts+'/transcripts/transcripts.json').download();sources.push(JSON.parse(bytes.toString()));}catch(e){if(e.code!==404)throw e;}
  }
  const inserted=[];
  for(const report of sources){
   if(report.digest!==sha(engine.canonical(report.entries)))throw Error('Source speech digest mismatch');
   for(const entry of report.entries.filter(e=>e.status==='transcribed')){
    if(entry.call?.status!=='completed'||entry.transcriptHash!==sha(entry.text)||entry.call.modelRequested!=='gpt-transcribe')throw Error('Invalid completed speech evidence');
    const bytes=Buffer.from(JSON.stringify(report)),file=bucket.file(`speech-cache/${entry.audioSha256}.json`);
    try{await file.save(bytes,{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{cacheControl:'private, no-store',metadata:{sha256:sha(bytes),owner:'daily-video-review-v1'}}});inserted.push(entry.audioSha256);}catch(e){if(e.code!==412)throw e;}
   }
  }
  await save('SPEECH_CACHE_SEEDED.json',{inserted,completedSourceReports:sources.length,newPaidCalls:0});console.log(JSON.stringify({cachedAudioHashes:inserted.length,newPaidCalls:0}));
 }
 if(mode==='smoke'){
  const {prepare,speechEvidence}= {...engine,...await loadModule('pipeline.mjs')};
  const snapshot=JSON.parse(await fs.readFile(path.join(root,'BEFORE.json'),'utf8'));
  const candidates=snapshot.candidates.map(d=>({id:d.name.split('/').at(-1),...auth.data(d)}));
  const selectors=[['spa',c=>/Relax the facial muscles/i.test(c.caption)],['faith',c=>c.listings?.some(l=>/Faith Talk.*Peace/i.test(l.title))],['chefs',c=>/This is Halloween at Chefs/i.test(c.caption)],['dinner',c=>c.sourceVideoId==='1433521478237078'],['poutine',c=>c.sourceVideoId==='1151769894376124'],['tarot',c=>c.sourceVideoId==='1634610118071598'],['animated',c=>c.sourceVideoId==='1582649633172659']];
  const secret=await auth.request('https://secretmanager.googleapis.com/v1/projects/gathr-migrated/secrets/GATHR_OPENAI_API_KEY/versions/latest:access');
  const apiKey=Buffer.from(secret.payload.data,'base64').toString().trim();
  const results=[];
  for(const [label,select]of selectors){
   const c=candidates.find(c=>c.object&&select(c));if(!c)throw Error('Regression clip not found: '+label);
   const dir=path.join(root,'cases',c.id);await fs.mkdir(dir,{recursive:true});
   const [bytes]=await bucket.file(c.object).download();if(sha(bytes)!==c.sha256)throw Error('Clip hash mismatch');
   await fs.writeFile(path.join(dir,'video.mp4'),bytes);
   const listingContext=c.listings?.length===1?c.listings[0]:{sourceMatched:false};
   await fs.writeFile(path.join(dir,'input.json'),JSON.stringify({clips:[{id:c.id,videoPath:path.join(dir,'video.mp4'),sourcePostId:c.sourcePostId,sourceVideoId:c.sourceVideoId,caption:c.caption,listingContext,sourceAudio:c.sourceAudio}]}));
   let prepared;try{prepared=JSON.parse(await fs.readFile(path.join(dir,'prepared/prepared.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;prepared=await prepare({manifestPath:path.join(dir,'input.json'),out:path.join(dir,'prepared')});}
   const speech=await speechEvidence({bucket,root:dir,prepared,apiKey});
   const report=await editorial.reviewEditorial({preparedPath:path.join(dir,'prepared/prepared.json'),transcriptsPath:path.join(dir,'transcripts/transcripts.json'),out:path.join(dir,'editorial'),execute:true,apiKey});
   const r=report.entries[0];results.push({label,id:c.id,state:r.state,content:r.contentAssessment,reasons:r.reasons,audioNotes:r.audioNotes,route:r.route,speechReused:speech.reused,calls:r.callSummary});
   console.log(JSON.stringify({label,state:r.state,content:r.contentAssessment.decision,kind:r.contentAssessment.kind,reasons:r.reasons,speechReused:speech.reused}));
  }
  const failed=results.filter(r=>r.label==='spa'?r.state!=='rejected'||r.content.kind!=='generic_business_advertising':r.content.decision!=='useful');
  await save('SMOKE_RESULTS.json',{atUTC:new Date().toISOString(),results,passed:failed.length===0});
  if(failed.length)throw Error('Real-media regression needs review: '+failed.map(x=>x.label).join(','));
 }
 if(mode==='migrate'){
  const config=await auth.get('runtime_metadata/video_review');if(auth.data(config).enabled!==false)throw Error('Pause video worker before migrating');
  if(await auth.get('runtime_metadata/video_review_worker_lock'))throw Error('Video worker is active');
  const docs=(await auth.query('private_video_candidates',null)).filter(d=>{const c=auth.data(d);return c.object&&Date.parse(c.expiresAt)>Date.now()&&c.reviewVersion!==editorial.EDITORIAL_VERSION&&c.requestedReviewVersion!==editorial.EDITORIAL_VERSION;});
  if(!docs.length)throw Error('No untouched candidates to migrate');
  const backup=`MIGRATION_BEFORE_${Date.now()}.json`;await save(backup,{config,candidates:docs});
  const writes=[{verify:config.name,currentDocument:{updateTime:config.updateTime}}];
  for(const d of docs){const c=auth.data(d),revision=c.revision;if(!/^[a-f0-9]{64}$/.test(revision))throw Error('Missing exact old revision');
   const old=Object.fromEntries(['state','decision','reasons','luna','terra','contentAssessment','listingCheck','audioNotes','callSummary','revision','sha256','artifacts','finishedAt','reviewVersion'].filter(k=>c[k]!==undefined).map(k=>[k,c[k]]));
   writes.push({update:{name:d.name+'/assessments/'+revision,fields:auth.fields(old)},currentDocument:{exists:false}});
   writes.push({update:{name:d.name,fields:auth.fields({state:'queued',requestedReviewVersion:editorial.EDITORIAL_VERSION,lastQueuedAt:new Date().toISOString()})},updateMask:{fieldPaths:['state','requestedReviewVersion','lastQueuedAt']},currentDocument:{updateTime:d.updateTime}});
  }
  const receipt=await auth.request(auth.database+'/documents:commit','POST',{writes});
  await save('MIGRATION_COMMITTED.json',{atUTC:new Date().toISOString(),backup,ids:docs.map(d=>d.name.split('/').at(-1)),receipt,humanJudgments:'Preserved: not included in update masks'});
  console.log(JSON.stringify({requeued:docs.length,automatedAssessmentsArchived:docs.length,humanJudgmentsPreserved:true}));
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
