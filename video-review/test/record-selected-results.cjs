const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const auth=require('C:/Users/craig/.codex/worktrees/luna-accounting-release/gathr-apps-script/functions/artifacts/ocr-caption-fooddrive-oct18/tools/normal-auth.cjs');
const root='C:/Users/craig/Documents/Codex/2026-10-30/video-model-comparison/selected-publication',trial=root+'/../hokum-longer-trial';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
(async()=>{
 await auth.signIn();const cap=JSON.parse(await fs.readFile(root+'/CAPTURE.json','utf8'));
 const publication=JSON.parse(await fs.readFile(root+'/PUBLICATION_VERIFIED.json','utf8'));
 const plans=JSON.parse(await fs.readFile(root+'/PUBLICATION_PLAN.json','utf8')).plans;
 const longer=JSON.parse(await fs.readFile(trial+'/RESULT.json','utf8'));
 const already={
  '1850333096322421':{path:'venues/slug_royaltycrossing/events/6idnDEErpAB7Ex2skVxQ',reason:'The event already has the other market video you also selected; one video per listing is currently supported.'},
  '1582649633172659':{path:'venues/slug_royaltycrossing/events/6idnDEErpAB7Ex2skVxQ',reason:'Your selected market video was already published.'},
  '1758094778823149':{path:'venues/BKaKU7O4J56sipdJRrHM/events/ko0acxhAluPpblFGlvXN',reason:'Your selected Ben Kunder video was already published.'},
  '1093074256958235':{path:'venues/slug_harbourfronttheatre/events/z8SX5iklVWSITkroSaht',reason:'Your selected Cowboy Christmas video was already published.'}
 };
 const held={
  '1151769894376124':'The source says today and was posted October 27. No current matching poutine listing exists; not attached to a different day or the freezer sale.',
  '1433521478237078':'The video poster says October 31; the newer official Friday dinner post and current $18 lasagna listing say October 30. Hold the conflicting poster until the date is resolved.',
  '29106205172342675':'No official December 5 Johnny Reid event listing exists at Credit Union Place. The separate root listing is a third-party ticket resale, which is not an eligible match.',
  '1068937392790830':'Longer-clip review completed. Publication needs app support for videos longer than 60 seconds; the general duration limit remains unchanged.'
 };
 const paths=[...new Set(Object.values(already).map(x=>x.path))];
 const r=await fetch('https://northamerica-northeast1-gathr-migrated.cloudfunctions.net/getListingVideos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paths})});if(!r.ok)throw Error('Existing video metadata read failed');const rpc=await r.json();
 for(const p of paths)if(!rpc.videos[p])throw Error('Previously published video not resolving '+p);
 const {initializeApp,cert}=require('firebase-admin/app'),{getStorage}=require('firebase-admin/storage');
 const bucket=getStorage(initializeApp({credential:cert(require('C:/Users/craig/Dev/gathr-apps-script/firebase/service-account.json'))})).bucket('gathr-private-video-reviews');
 const backups=[],updates=[],results=[];
 for(const row of cap.selected){const p=row.candidate.name.split('/documents/')[1],doc=await auth.get(p),c=auth.data(doc),old=auth.data(row.candidate);
  if(!isDeepStrictEqual(c.humanJudgment,old.humanJudgment))throw Error('Human decision changed; reconcile '+p);
  backups.push(doc);const plan=plans.find(x=>x.plan.sourceVideoId===c.sourceVideoId),existing=already[c.sourceVideoId];
  const status=plan?{state:'published',paths:[plan.plan.bindings[0].path],assetId:plan.plan.sha256,reason:'Explicit Use selection published and app metadata/public bytes verified.'}:existing?{state:'already_covered',paths:[existing.path],assetId:rpc.videos[existing.path].assetId,reason:existing.reason}:{state:'held',paths:[],reason:held[c.sourceVideoId]};
  if(!status.reason)throw Error('Unaccounted selected video');status.checkedAt=new Date().toISOString();
  const delta={manualPublication:status};
  if(c.sourceVideoId==='1068937392790830'){
   if(c.object||longer.sourceVideoId!==c.sourceVideoId||longer.durationSeconds>90||longer.review.contentAssessment.decision!=='useful')throw Error('Longer trial mismatch');
   const bytes=await fs.readFile(trial+'/video.mp4');if(sha(bytes)!==longer.sha256)throw Error('Longer media drift');
   const object=`clips/${p.split('/').at(-1)}.mp4`;
   await bucket.file(object).save(bytes,{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:'video/mp4',cacheControl:'private, no-store',metadata:{sha256:longer.sha256,owner:'daily-video-review-v1'}}});
   const prefix=`evidence/${p.split('/').at(-1)}/hokum-longer-trial-v1`;
   for(const file of ['RESULT.json','prepared/prepared.json','transcripts/transcripts.json']){const data=await fs.readFile(trial+'/'+file);await bucket.file(prefix+'/'+file).save(data,{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{cacheControl:'private, no-store',metadata:{sha256:sha(data),owner:'daily-video-review-v1'}}});}
   Object.assign(delta,{object,sha256:longer.sha256,bytes:bytes.length,durationSeconds:longer.durationSeconds,hasAudio:true,sourceAudio:true,
    state:'held',decision:'hold',reasons:['app_duration_support_required'],contentAssessment:longer.review.contentAssessment,
    listingCheck:{status:'matched',reason:'Exact current City Cinema source-linked Hokum screenings: October 30 at 19:00 and October 31 at 16:00.'},
    luna:longer.review.luna,terra:null,audioNotes:longer.review.audioNotes,callSummary:longer.review.callSummary,
    reviewVersion:'hokum-longer-trial-v1',artifacts:prefix,finishedAt:longer.atUTC,revision:sha(JSON.stringify([c.revision,longer.sha256,longer.review])),
    trialCosts:{transcriptionUSD:longer.transcriptionEstimatedUSD,reviewUSD:longer.review.callSummary.estimatedNewCostUSD,totalEstimatedUSD:longer.transcriptionEstimatedUSD+longer.review.callSummary.estimatedNewCostUSD,basis:longer.costBasis}});
  }
  updates.push({update:{name:doc.name,fields:auth.fields(delta)},updateMask:{fieldPaths:Object.keys(delta)},currentDocument:{updateTime:doc.updateTime}});results.push({candidateId:p.split('/').at(-1),sourceVideoId:c.sourceVideoId,...status});
 }
 await fs.writeFile(root+'/PRIVATE_RESULT_BACKUPS.json',JSON.stringify(backups,null,2),{flag:'wx'});
 const receipt=await auth.request(auth.database+'/documents:commit','POST',{writes:updates});
 await fs.writeFile(root+'/PRIVATE_RESULTS_COMMITTED.json',JSON.stringify({receipt,results},null,2),{flag:'wx'});
 for(const old of backups){const fresh=await auth.get(old.name.split('/documents/')[1]);if(!isDeepStrictEqual(auth.data(old).humanJudgment,auth.data(fresh).humanJudgment))throw Error('Human choice changed during result recording');}
 const summary={atUTC:new Date().toISOString(),results,published:publication.results.length,alreadyCovered:results.filter(x=>x.state==='already_covered').length,held:results.filter(x=>x.state==='held').length,hokumCostUSD:longer.transcriptionEstimatedUSD+longer.review.callSummary.estimatedNewCostUSD,hokumPrivatePlayback:true,humanChoicesPreserved:true};
 await fs.writeFile(root+'/RESULTS.json',JSON.stringify(summary,null,2),{flag:'wx'});console.log(JSON.stringify(summary));
})().catch(e=>{console.error(e.message);process.exitCode=1});
