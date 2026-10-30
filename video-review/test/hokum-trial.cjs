// One explicitly authorized longer-clip experiment. Does not change deployed limits or publish.
const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url'),{promisify}=require('node:util'),{execFile}=require('node:child_process');
const auth=require('C:/Users/craig/.codex/worktrees/luna-accounting-release/gathr-apps-script/functions/artifacts/ocr-caption-fooddrive-oct18/tools/normal-auth.cjs');
const root='C:/Users/craig/Documents/Codex/2026-10-30/video-model-comparison/hokum-longer-trial',run=promisify(execFile);
const service=path.resolve(__dirname,'..');
(async()=>{
 await fs.mkdir(root,{recursive:true});await auth.signIn();
 let engineSource=await fs.readFile(service+'/evidence-worker.mjs','utf8');
 engineSource=engineSource.replace('seconds: 60,','seconds: 90,').replace('decodedSeconds <= 60.25','decodedSeconds <= LIMITS.seconds + .25').replace('clip.video.durationSeconds <= 60,','clip.video.durationSeconds <= LIMITS.seconds,');
 if(engineSource.includes('seconds: 60,')||engineSource.includes('decodedSeconds <= 60.25')||engineSource.includes('clip.video.durationSeconds <= 60,'))throw Error('Trial bounds patch failed');
 await fs.writeFile(root+'/evidence-worker.mjs',engineSource,{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
 await fs.copyFile(service+'/editorial-review.mjs',root+'/editorial-review.mjs');
 const engine=await import(pathToFileURL(root+'/evidence-worker.mjs'));
 const pipeline=await import(pathToFileURL(service+'/pipeline.mjs'));
 const editorial=await import(pathToFileURL(root+'/editorial-review.mjs'));
 const source=JSON.parse(await fs.readFile('C:/Users/craig/Documents/Codex/2026-10-30/video-model-comparison/editorial-rollout/HOKUM_PRIVATE_EXTRACTION.json','utf8'));
 if(String(source.id)!=='1068937392790830'||source.duration<82||source.duration>84)throw Error('Wrong longer trial source');
 const candidate=await auth.get('private_video_candidates/18f8fbc8f18ab28887e96c777ddb77b5167c8e2c6b5e051a867222600940785f'),c=auth.data(candidate);
 const fmt=source.formats.find(f=>f.format_id==='sd');
 try{await fs.access(root+'/original.mp4');}catch{await pipeline.download(fmt.url,root+'/original.mp4');}
 const ffmpeg=require('ffmpeg-static'),probe=require('ffprobe-static').path;
 process.env.FFMPEG_PATH=ffmpeg;process.env.FFPROBE_PATH=probe;
 try{await fs.access(root+'/video.mp4');}catch{await run(ffmpeg,['-nostdin','-v','error','-n','-xerror','-protocol_whitelist','file','-f','mov','-enable_drefs','0','-use_absolute_path','0','-i',root+'/original.mp4','-map','0:v:0','-map','0:a:0?','-map_metadata','-1','-vf',"scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",'-c:v','libx264','-preset','fast','-crf','27','-maxrate','800k','-bufsize','1600k','-pix_fmt','yuv420p','-c:a','aac','-b:a','80k','-movflags','+faststart',root+'/video.mp4'],{timeout:180000,maxBuffer:1000000,windowsHide:true});}
 const media=await fs.readFile(root+'/video.mp4');if(media.length>8_000_000)throw Error('Trial rendition size exceeded');
 const cap=JSON.parse(await fs.readFile('C:/Users/craig/Documents/Codex/2026-10-30/video-model-comparison/selected-publication/CAPTURE.json','utf8'));
 const events=cap.selected.find(r=>auth.data(r.candidate).sourceVideoId===c.sourceVideoId).events.map(d=>({path:d.name.split('/documents/')[1],...auth.data(d)}));
 const event=events.find(e=>e.startDate==='2026-10-30');if(!event)throw Error('Exact Hokum listing unavailable');
 const manifest={clips:[{id:c.id,videoPath:root+'/video.mp4',sourcePostId:c.sourcePostId,sourceVideoId:c.sourceVideoId,caption:c.caption,sourceAudio:true,listingContext:{sourceMatched:true,path:event.path,title:event.name,date:event.startDate,time:event.startTime,venue:'City Cinema',description:event.description}}]};
 await fs.writeFile(root+'/input.json',JSON.stringify(manifest,null,2));
 let prepared;try{prepared=JSON.parse(await fs.readFile(root+'/prepared/prepared.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;prepared=await engine.prepare({manifestPath:root+'/input.json',out:root+'/prepared'});}
 console.log(JSON.stringify({prepared:true,seconds:prepared.clips[0].video.durationSeconds,frames:prepared.clips[0].frames.length,bytes:media.length}));
 const secret=await auth.request('https://secretmanager.googleapis.com/v1/projects/gathr-migrated/secrets/GATHR_OPENAI_API_KEY/versions/latest:access');
 const apiKey=Buffer.from(secret.payload.data,'base64').toString().trim();
 const speech=await engine.transcribe({preparedPath:root+'/prepared/prepared.json',out:root+'/transcripts',execute:true,apiKey});
 const result=await editorial.reviewEditorial({preparedPath:root+'/prepared/prepared.json',transcriptsPath:root+'/transcripts/transcripts.json',out:root+'/editorial',execute:true,apiKey});
 const transcription=speech.entries.filter(e=>e.call).map(e=>e.call),seconds=transcription.reduce((n,c)=>n+(c.usage?.seconds||0),0);
 const report={atUTC:new Date().toISOString(),sourceVideoId:c.sourceVideoId,durationSeconds:prepared.clips[0].video.durationSeconds,inputBytes:(await fs.stat(root+'/original.mp4')).size,renditionBytes:media.length,sha256:engine.sha256(media),frames:prepared.clips[0].frames.length,review:result.entries[0],transcriptionCalls:transcription.map(c=>({status:c.status,usage:c.usage,elapsedMs:c.elapsedMs})),transcriptionSeconds:seconds,transcriptionEstimatedUSD:seconds/60*.0045,costBasis:'Actual response usage at documented standard API rates; estimate, not an invoice. Local CPU, storage and playback transfer excluded.',published:false,deployedLimitChanged:false};
 await fs.writeFile(root+'/RESULT.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
})().catch(e=>{console.error(/^[a-zA-Z0-9_ ]+$/.test(e.message)?e.message:'Hokum trial stopped; inspect private artifacts');process.exitCode=1});
