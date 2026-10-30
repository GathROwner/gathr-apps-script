import * as fs from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import ffmpeg from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
import {google} from 'googleapis';
import XLSX from 'xlsx';
import {Timestamp,FieldValue} from 'firebase-admin/firestore';
import {POLICY,hash,cdnUrl,discover} from './policy.mjs';
import {prepare,transcribe,triage} from './evidence-worker.mjs';
const exec=promisify(execFile);
process.env.FFMPEG_PATH=ffmpeg; process.env.FFPROBE_PATH=ffprobe.path;
const now=()=>new Date().toISOString();
export function services(db,storage) { return {db,bucket:storage.bucket(POLICY.bucket)}; }
async function createOnly(ref,data) {try {await ref.create(data);return true;}catch(e){if(e.code===6)return false;throw e;}}
export async function scan({db}) {
  const config=(await db.doc('runtime_metadata/video_review').get()).data();
  if(!config?.enabled) return {disabled:true};
  const enabledAt=Date.parse(config.enabledAt);
  if(!Number.isFinite(enabledAt))throw Error('invalid_video_review_activation');
  const after=new Date(Math.max(enabledAt,Date.now()-48*3600000));
  const files=await db.collection('processed_datasets').where('processedAt','>=',Timestamp.fromDate(after)).orderBy('processedAt','desc').limit(30).get();
  const auth=new google.auth.GoogleAuth({scopes:['https://www.googleapis.com/auth/drive.readonly']});
  const drive=google.drive({version:'v3',auth}); let created=0,completed=0;
  for(const file of files.docs) {
    if(completed>=3) break;
    const ref=db.collection(POLICY.files).doc(hash(file.id));
    const previous=await ref.get();if(previous.data()?.state==='complete')continue;
    const started=Date.now(); let rows;
    if(file.id.startsWith('apify-dataset:')) {
      // Do not silently treat unsupported virtual captures as a clean zero-video result.
      await ref.set({fileId:file.id,state:'held',reason:'virtual_dataset_needs_retained_raw_capture',updatedAt:now()});continue;
    }
    try {
      const meta=await drive.files.get({fileId:file.id,fields:'mimeType,size'});
      if(Number(meta.data.size)>30_000_000)throw Error('dataset_size_limit');
      const response=meta.data.mimeType==='application/vnd.google-apps.spreadsheet'
        ?await drive.files.export({fileId:file.id,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},{responseType:'arraybuffer'})
        :await drive.files.get({fileId:file.id,alt:'media'},{responseType:'arraybuffer'});
      const buffer=Buffer.from(response.data);if(buffer.length>30_000_000)throw Error('dataset_size_limit');
      const book=XLSX.read(buffer,{type:'buffer'});rows=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{defval:null});
      if(rows.length>5000)throw Error('dataset_row_limit');
      const candidates=discover(rows,file.id);
      for(const c of candidates) {if(await createOnly(db.collection(POLICY.queue).doc(c.id),c))created++;}
      await ref.set({fileId:file.id,state:'complete',candidateCount:candidates.length,datasetSHA256:hash(buffer),completedAt:now(),elapsedMs:Date.now()-started});completed++;
    } catch {await ref.set({fileId:file.id,state:'held',reason:'dataset_read_failed',updatedAt:now()});}
  }
  await db.doc('runtime_metadata/video_review_health').set({scanAt:now(),created,completed},{merge:true});
  return {created,completed};
}
export async function download(url,target,fetchImpl=fetch) {
  let current=cdnUrl(url);const signal=AbortSignal.timeout(45000);
  for(let n=0;n<4;n++) {
    const r=await fetchImpl(current,{redirect:'manual',signal});
    if([301,302,303,307,308].includes(r.status)){await r.body?.cancel();current=cdnUrl(new URL(r.headers.get('location')||'',current));continue;}
    if(!r.ok||!r.body||Number(r.headers.get('content-length'))>POLICY.maxBytes||
      !/^(video\/mp4|application\/octet-stream)(;|$)/i.test(r.headers.get('content-type')||'')){await r.body?.cancel();throw Error('video_download_unavailable');}
    const handle=await fs.open(target,'wx');let size=0;
    try {for await(const chunk of r.body){size+=chunk.length;if(size>POLICY.maxBytes)throw Error('video_too_large');await handle.writeFile(chunk);}}
    finally{await handle.close();}
    const b=await fs.readFile(target);if(b.toString('ascii',4,8)!=='ftyp')throw Error('not_mp4');return b;
  }
  throw Error('redirect_limit');
}
export async function normalize(input,output) {
  const probe=JSON.parse((await exec(ffprobe.path,['-v','error','-protocol_whitelist','file','-f','mov','-i',input,'-show_streams','-show_format','-of','json'],{timeout:45000,maxBuffer:1000000,windowsHide:true})).stdout);
  const video=probe.streams.filter(s=>s.codec_type==='video'),audio=probe.streams.filter(s=>s.codec_type==='audio');
  const duration=Number(probe.format.duration);
  if(video.length!==1||audio.length>1||!Number.isFinite(duration)||duration<=0||duration>60||
    video[0].width*video[0].height>16777216)throw Error('unsupported_duration_or_streams');
  await exec(ffmpeg,['-nostdin','-v','error','-n','-xerror','-protocol_whitelist','file','-f','mov','-enable_drefs','0','-use_absolute_path','0','-i',input,
    '-map','0:v:0','-map','0:a:0?','-map_metadata','-1','-vf',"scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
    '-c:v','libx264','-preset','fast','-crf','27','-maxrate','800k','-bufsize','1600k','-pix_fmt','yuv420p','-c:a','aac','-b:a','80k','-movflags','+faststart',output],{timeout:120000,maxBuffer:1000000,windowsHide:true});
  const bytes=await fs.readFile(output);if(bytes.length>8_000_000)throw Error('review_rendition_over_size');
  return {bytes,hasAudio:audio.length===1,durationSeconds:duration,originalWidth:video[0].width,originalHeight:video[0].height};
}
export async function exactListings(db,c) {
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Halifax',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const results=await db.collectionGroup('events').where('sourceUniqueIds','array-contains',c.sourcePostId).limit(51).get();
  if(results.size>50)return [];
  const all=[];
  for(const d of results.docs) {
    if(!/^(venues\/[^/]+\/events\/[^/]+|events\/[^/]+)$/.test(d.ref.path))continue;
    const v=d.data(); if(v.isExpired||v.isCancelled||v.cancelled||['expired','cancelled','deleted','archived'].includes(v.status))continue;
    const end=String(v.endDate||v.startDate||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(end)||end<today)continue;
    let venue=v.venueName||v.locationName||'';
    if(d.ref.path.startsWith('venues/')) {const p=await d.ref.parent.parent.get();venue=p.data()?.name||venue;}
    all.push({path:d.ref.path,updateTime:`${d.updateTime.seconds}:${d.updateTime.nanoseconds}`,title:v.title||v.name||'',date:String(v.startDate||''),time:String(v.startTime||''),venue,sourceMatched:true});
  }
  return all;
}
export async function uploadDirectory(bucket,root,prefix,uploaded=new Map()) {
  async function walk(dir,relative='') {
    for(const entry of await fs.readdir(dir,{withFileTypes:true})) {
      const rel=relative?`${relative}/${entry.name}`:entry.name;
      if(entry.isDirectory())await walk(join(dir,entry.name),rel);
      else if(entry.isFile()&&!['input.mp4','video.mp4','input.json'].includes(entry.name)) {
        const bytes=await fs.readFile(join(dir,entry.name)),sha=hash(bytes);
        if(uploaded.get(rel)===sha)continue;
        const object=bucket.file(`${prefix}/${rel}`);
        try{await object.save(bytes,{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{cacheControl:'private, no-store',metadata:{sha256:sha,owner:POLICY.version}}});}
        catch(e){if(e.code!==412)throw e;const [m]=await object.getMetadata();if(m.metadata?.sha256!==sha||m.metadata?.owner!==POLICY.version||Number(m.size)!==bytes.length)throw Error('evidence_object_drift');}
        uploaded.set(rel,sha);
      }
    }
  }
  await walk(root);
}
async function recordUsage(db,kind) {
  const day=new Date().toISOString().slice(0,10),ref=db.doc(`private_video_usage/${day}`);
  await db.runTransaction(async tx=>{const s=await tx.get(ref);const count=Number(s.data()?.[kind]||0);tx.set(ref,{[kind]:count+1,updatedAt:now()},{merge:true});});
}
export async function work({db,bucket},apiKey) {
  if(!(await db.doc('runtime_metadata/video_review').get()).data()?.enabled)return {disabled:true};
  // One fenced owner across scheduler retries, cold starts and manual invocations.
  const lock=db.doc('runtime_metadata/video_review_worker_lock'); const owner=crypto.randomUUID();
  const acquired=await db.runTransaction(async tx=>{const d=await tx.get(lock);if(Date.parse(d.data()?.until||'')>Date.now())return false;tx.set(lock,{owner,until:new Date(Date.now()+32*60000).toISOString()});return true;});
  if(!acquired)return {busy:true};
  let processed=0;
  try {
    const stuck=await db.collection(POLICY.queue).where('state','==','processing').limit(100).get();
    for(const d of stuck.docs)if(Date.parse(d.data().lease?.until||'')<Date.now())await d.ref.update({state:'held',decision:'hold',reasons:['worker_interrupted_inspect_paid_intents_before_retry'],finishedAt:now(),revision:hash(`${d.id}:interrupted:${d.data().lease?.owner}`)});
    const queue=await db.collection(POLICY.queue).where('state','==','queued').limit(5).get();
    const deadline=Date.now()+600000;
    for(const doc of queue.docs) {
      if(Date.now()>deadline)break;
      const c=doc.data(); if(Date.parse(c.expiresAt)<=Date.now()){await doc.ref.update({state:'expired',reasons:['review_retention_expired']});continue;}
      const root=join(tmpdir(),'gathr-video-review',doc.id);const prefix=`evidence/${doc.id}`;const uploaded=new Map();
      // Never reset a paid attempt: crash recovery creates a hold, not another charge.
      await doc.ref.update({state:'processing',lease:{owner,until:new Date(Date.now()+32*60000).toISOString()},startedAt:now()});
      try {
        await recordUsage(db,'clips');await fs.mkdir(root,{recursive:true});
        const raw=await download(c.sourceUrl,join(root,'input.mp4'));
        const rendition=await normalize(join(root,'input.mp4'),join(root,'video.mp4'));
        const sha=hash(rendition.bytes),object=`clips/${doc.id}.mp4`;
        await bucket.file(object).save(rendition.bytes,{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:'video/mp4',cacheControl:'private, no-store',metadata:{sha256:sha,owner:'daily-video-review-v1'}}});
        const listings=await exactListings(db,c);
        const base={object,sha256:sha,originalSHA256:hash(raw),bytes:rendition.bytes.length,durationSeconds:rendition.durationSeconds,hasAudio:rendition.hasAudio,listings};
        await doc.ref.update(base);
        const blockers=[];
        if(listings.length!==1)blockers.push(listings.length?'multiple_exact_listings_need_selection':'no_current_exact_source_listing');
        if(c.sourceAudio==='unknown'||c.sourceAudio!==rendition.hasAudio)blockers.push('source_audio_unknown_or_mismatched');
        if(blockers.length){await doc.ref.update({state:'held',decision:'hold',reasons:blockers,finishedAt:now(),revision:hash(JSON.stringify([sha,listings,blockers]))});processed++;continue;}
        await fs.writeFile(join(root,'input.json'),JSON.stringify({clips:[{id:doc.id,videoPath:join(root,'video.mp4'),sourcePostId:c.sourcePostId,sourceVideoId:c.sourceVideoId,caption:c.caption,listingContext:listings[0],sourceAudio:c.sourceAudio}]}));
        await prepare({manifestPath:join(root,'input.json'),out:join(root,'prepared')});
        const boundedFetch=async(url,options)=>{
          const model=options.body instanceof FormData?String(options.body.get('model')):JSON.parse(options.body).model;
          const kind=model==='gpt-6-luna'?'luna':model==='gpt-6.1-terra'?'terra':model==='gpt-transcribe'?'transcriptions':null;
          if(!kind)throw Error('unexpected_paid_model');
          // Worker has already fsynced an intent; persist it remotely BEFORE sending money.
          await uploadDirectory(bucket,root,prefix,uploaded);await recordUsage(db,kind);
          return fetch(url,options);
        };
        await transcribe({preparedPath:join(root,'prepared/prepared.json'),out:join(root,'transcripts'),execute:true,apiKey,fetchImpl:boundedFetch});
        await uploadDirectory(bucket,root,prefix,uploaded);
        const report=await triage({preparedPath:join(root,'prepared/prepared.json'),transcriptsPath:join(root,'transcripts/transcripts.json'),out:join(root,'triage'),execute:true,apiKey,fetchImpl:boundedFetch});
        await uploadDirectory(bucket,root,prefix,uploaded);
        const e=report.entries[0]; const decision=e.terminalDecision;
        await doc.ref.update({state:decision==='reject'?'rejected':decision==='hold'?'held':'recommended',decision,
          reasons:[...e.holdReasons,...e.routeReasons],route:e.route,luna:e.luna?.modelAssessment??null,terra:e.terra?.modelAssessment??null,
          callSummary:report.callSummary,finishedAt:now(),revision:hash(JSON.stringify([sha,listings,e])),artifacts:prefix});processed++;
      } catch(e) {
        await uploadDirectory(bucket,root,prefix,uploaded).catch(()=>{});
        const code=/^[a-z0-9_]+$/.test(e.message||'')?e.message:'video_processing_failed_private_evidence_retained';
        await doc.ref.update({state:'held',decision:'hold',reasons:[code],finishedAt:now(),revision:hash(`${doc.id}:${code}`)});
      } finally {await fs.rm(root,{recursive:true,force:true}).catch(()=>{});}
    }
    await db.doc('runtime_metadata/video_review_health').set({workerAt:now(),processed},{merge:true});
    return {processed};
  } finally {
    await db.runTransaction(async tx=>{const d=await tx.get(lock);if(d.data()?.owner===owner)tx.delete(lock);});
  }
}
export async function cleanup({db,bucket}) {
  const expired=await db.collection(POLICY.queue).where('cleanupAt','<=',now()).limit(100).get();let count=0;
  for(const d of expired.docs) {
    if(d.data().state==='processing')continue;
    if(d.data().object) {
      if(d.data().object!==`clips/${d.id}.mp4`)throw Error('cleanup_namespace_drift');
      const f=bucket.file(d.data().object);try{const [meta]=await f.getMetadata();if(meta.metadata?.owner!==POLICY.version||meta.metadata?.sha256!==d.data().sha256)throw Error('cleanup_owner_drift');await f.delete({ifGenerationMatch:meta.generation});}catch(e){if(e.code!==404)throw e;}
    }
    // Preserve decisions/audit metadata; raw source URLs and playback are no longer served.
    await d.ref.update({state:'expired',object:FieldValue.delete(),sourceUrl:FieldValue.delete(),cleanupAt:FieldValue.delete(),expiredAt:now()});count++;
  }
  return {expired:count};
}
