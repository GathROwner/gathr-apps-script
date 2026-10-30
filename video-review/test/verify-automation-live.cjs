// Read-only release evidence; private snapshots stay outside Git.
const fs=require('node:fs/promises'),path=require('node:path'),{isDeepStrictEqual}=require('node:util'),{createHash}=require('node:crypto');
const auth=require('C:/Users/craig/.codex/worktrees/luna-accounting-release/gathr-apps-script/functions/artifacts/ocr-caption-fooddrive-oct18/tools/normal-auth.cjs');
const root='C:/Users/craig/Documents/Codex/2026-10-30/video-model-comparison/automation-90s',portal='https://videoreviewportal-6ju7yi5g2a-nn.a.run.app';
(async()=>{
 await auth.signIn();const before=JSON.parse(await fs.readFile(root+'/BEFORE.json','utf8'));
 const docs=await auth.query('private_video_candidates',null),map=new Map(docs.map(d=>[d.name,auth.data(d)]));
 for(const d of before.candidates){const now=map.get(d.name),old=auth.data(d);if(!now||!isDeepStrictEqual(now.humanJudgment,old.humanJudgment)||now.sourcePostId!==old.sourcePostId||now.sourceVideoId!==old.sourceVideoId)throw Error('Candidate choice/source changed');}
 const frontend=[];for(const name of ['index.html','app.js','review-ui.js','style.css']){const r=await fetch(portal+(name==='index.html'?'/':'/'+name)),body=await r.text(),local=await fs.readFile(path.resolve(__dirname,'../public',name),'utf8');if(!r.ok||body!==local)throw Error('Serving frontend differs: '+name);frontend.push(name);}
 const anonymous=await fetch(portal+'/api/candidates');if(anonymous.status!==401)throw Error('Private API auth boundary changed');
 const links=await auth.query('listing_video_links',null),assets=await auth.query('listing_video_assets',null),baseline=before.links.map(auth.data),paths=baseline.map(l=>l.binding.path);
 const response=await fetch('https://northamerica-northeast1-gathr-migrated.cloudfunctions.net/getListingVideos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paths})}),rpc=await response.json();if(!response.ok||paths.some(p=>!rpc.videos[p]))throw Error('Baseline public video failed to resolve');
 const hashes=[];for(const a of before.assets){const data=auth.data(a),r=await fetch('https://storage.googleapis.com/gathr-uploaded-images/'+data.objectPath),bytes=Buffer.from(await r.arrayBuffer());if(!r.ok||createHash('sha256').update(bytes).digest('hex')!==a.name.split('/').at(-1))throw Error('Baseline public video hash changed');hashes.push(a.name.split('/').at(-1));}
 const scheduler='https://cloudscheduler.googleapis.com/v1/projects/gathr-migrated/locations/northamerica-northeast1/jobs/';
 const jobs={};for(const name of ['publishListingVideos','cleanupPublishedListingVideos','scheduledListingVideoCleanup'])jobs[name]=(await auth.request(scheduler+`firebase-schedule-${name}-northamerica-northeast1`)).state;
 const functions=await auth.request('https://cloudfunctions.googleapis.com/v2/projects/gathr-migrated/locations/-/functions');
 const deployed=functions.functions.filter(f=>['discoverListingVideos','reviewListingVideos','videoReviewPortal','publishListingVideos','cleanupPublishedListingVideos'].includes(f.name.split('/').at(-1))).map(f=>({name:f.name.split('/').at(-1),state:f.state,revision:f.serviceConfig.revision,hash:f.labels?.['firebase-functions-hash'],identity:f.serviceConfig.serviceAccountEmail}));
 const result={atUTC:new Date().toISOString(),humanChoicesPreserved:before.candidates.length,sourceIdentitiesPreserved:true,frontendFilesMatch:frontend,anonymousAPIStatus:anonymous.status,baselinePublicLinksResolve:paths.length,baselinePublicHashesVerified:hashes.length,assets:assets.length,links:links.length,jobs,functions:deployed};
 await fs.writeFile(root+'/SERVING_VERIFIED.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.message);process.exitCode=1});
