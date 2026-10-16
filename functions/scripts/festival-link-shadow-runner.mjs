// Completed-dataset shadow runner. The ONLY optional Firestore writes are to
// festival_link_shadow_jobs. Never publishes, merges, deletes or replays events.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {extractFestivalEvidence,FESTIVAL_EVIDENCE_POLICY,festivalEvidenceSourceFingerprint,festivalEvidenceEditionFingerprint} from './festival-evidence-extractor.mjs';
import {verifyFestivalFullRun,festivalShadowFingerprint,festivalShadowJobId,claimFestivalShadowJob,finishFestivalShadowJob,FESTIVAL_SHADOW_COLLECTION} from '../lib/services/festivalLinkShadowJob.js';
import {resolveFestivalMembership} from '../lib/services/festivalLinker.js';
const require=createRequire(import.meta.url),admin=require('firebase-admin');
const args=process.argv.slice(2),opt=n=>args.find(x=>x.startsWith(`--${n}=`))?.slice(n.length+3);
assert(args.every(x=>/^--(?:file-id|registry|out|max-sources)=/.test(x)||['--persist-shadow-job','--execute-evidence'].includes(x)),'Unknown argument');
const fileId=opt('file-id');assert(fileId&&/^[A-Za-z0-9_-]+$/.test(fileId),'Explicit regular dataset ID required');
const registry=JSON.parse(await fs.readFile(opt('registry'),'utf8'));
assert(registry.version===1&&Array.isArray(registry.editions),'Registry version required');
const out=path.resolve(opt('out'));await fs.mkdir(out,{recursive:true});
const clean=x=>JSON.parse(JSON.stringify(x));
const normalize=x=>String(x||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const credential=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));assert.equal(credential.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(credential),projectId:credential.project_id});const db=admin.firestore();
let claimed,jobRef;
try{
 const [lock,marker,checkpoint,batches]=await Promise.all([db.doc(`processing_locks/${fileId}`).get(),db.doc(`processed_datasets/${fileId}`).get(),db.doc(`checkpoints/${fileId}`).get(),db.collection('batch_states').where('fileId','==',fileId).get()]);
 const batch=[...batches.docs].sort((a,b)=>Number(b.get('batchNumber'))-Number(a.get('batchNumber')))[0];
 const completion={fileId,checkpointExists:checkpoint.exists,lock:lock.data(),marker:marker.data(),batch:batch?.data()};
 const gate=verifyFestivalFullRun(completion);await fs.writeFile(path.join(out,'completion.json'),JSON.stringify(clean({checkedAt:new Date().toISOString(),...completion,gate}),null,2));
 if(!gate.ready){console.log(JSON.stringify({mode:'waiting',...gate,eventWrites:0}));process.exitCode=0;}
 else{
  const start=lock.get('startedAt')?.toMillis?.(),end=marker.get('processedAt')?.toMillis?.();assert(Number.isFinite(start)&&Number.isFinite(end)&&end>=start,'Invalid full-run time bounds');
  const rawSnapshots=await db.collection('parse_snapshots').where('fileId','==',fileId).limit(2001).get();assert(rawSnapshots.size<=2000,'Snapshot scan overflow');
  const snapshots=rawSnapshots.docs.map(d=>({id:d.id,updateTime:d.updateTime.toDate().toISOString(),...d.data()})).filter(s=>{
   const t=Date.parse(s.updateTime);return t>=start&&t<=end&&!s.rowMeta?.dryRun&&!s.rowMeta?.selectedRows&&s.rowMeta?.parserMode==='full5stage';
  });
  const latest=new Map();for(const s of snapshots){const previous=latest.get(s.uniqueId);if(!previous||s.updateTime>previous.updateTime)latest.set(s.uniqueId,s);}
  const editions=registry.editions;
  assert(editions.length>0&&editions.length<=20,'Explicit source-backed edition registry required');
  const minimum=editions.map(e=>e.startDate).sort()[0],maximum=editions.map(e=>e.endDate).sort().at(-1);
  const catalogue=await db.collectionGroup('events').where('startDate','>=',minimum).where('startDate','<=',maximum).limit(5001).get();assert(catalogue.size<=5000,'Canonical scan incomplete; no proposals');
  const candidates=catalogue.docs.map(d=>({path:d.ref.path,data:clean(d.data()),revision:d.updateTime.toDate().toISOString()}));
  const venueIds=[...new Set(candidates.map(c=>c.data.venueId).filter(x=>typeof x==='string'&&/^[A-Za-z0-9_-]+$/.test(x)))].sort();
  const venues=[];for(let i=0;i<venueIds.length;i+=100){const docs=await db.getAll(...venueIds.slice(i,i+100).map(id=>db.doc(`venues/${id}`)));for(const d of docs)if(d.exists){const v=d.data();venues.push({id:d.id,label:v.name||v.venueName||v.establishment||'',aliases:Array.isArray(v.aliases)?v.aliases:[],latitude:Number(v.latitude),longitude:Number(v.longitude)});}}
  for(const venue of venues)venue.aliases=[...new Set([...venue.aliases,...editions.flatMap(e=>e.venueAliases?.[venue.id]||[])])].sort();
  const matcherPolicy=festivalShadowFingerprint(await fs.readFile(new URL('../lib/services/festivalLinker.js',import.meta.url),'utf8'));
  const fingerprint=festivalShadowFingerprint({fileId,editions:registry.editions,matcherPolicy,evidencePolicy:FESTIVAL_EVIDENCE_POLICY,sources:[...latest.values()].map(s=>({id:s.uniqueId,revision:s.updateTime})).sort((a,b)=>String(a.id).localeCompare(String(b.id))),candidates:candidates.map(c=>({path:c.path,revision:c.revision})).sort((a,b)=>a.path.localeCompare(b.path)),venues});
  jobRef=db.collection(FESTIVAL_SHADOW_COLLECTION).doc(festivalShadowJobId(fileId));
  if(args.includes('--execute-evidence'))assert(args.includes('--persist-shadow-job'),'Paid automatic work requires a durable worker claim');
  if(args.includes('--persist-shadow-job')){
   claimed=await db.runTransaction(async tx=>{const snap=await tx.get(jobRef);const claim=claimFestivalShadowJob(snap.data(),{fileId,inputFingerprint:fingerprint,workerToken:randomUUID(),nowMs:Date.now(),leaseMs:1200000});if(claim.decision==='claimed')tx.set(jobRef,claim.job);return claim;});
   if(claimed.decision!=='claimed'){const skip=Error('shadow_skip');skip.shadowSkip=claimed.decision;throw skip;}
  }
  const cacheDir=path.join(out,'evidence');await fs.mkdir(cacheDir,{recursive:true});let paidSources=0;const maxSources=Number(opt('max-sources')??3);assert(Number.isInteger(maxSources)&&maxSources>=0&&maxSources<=3);
  const evaluations=[];const gaps=[];const captures=[];
  for(const edition of editions){
   if(editions.filter(e=>normalize(e.name)===normalize(edition.name)&&e.year===edition.year).length!==1){gaps.push({edition:edition.id,reason:'ambiguous_edition_registry'});continue;}
   const scoped=[...latest.values()].filter(s=>{
    const output=s.stages?.find(x=>x.stage==='format')?.output;
    return normalize(s.inputText).includes(normalize(edition.name))||output?.stageArtifacts?.stage3Items?.some(i=>normalize(i.name).includes(normalize(edition.name))||i.spatial?.kind==='multi_location')||
     (edition.venueIds?.includes(s.venueId)&&output?.stageArtifacts?.stage3Items?.some(i=>i.date>=edition.startDate&&i.date<=edition.endDate));
   }).sort((a,b)=>String(a.uniqueId).localeCompare(String(b.uniqueId)));
   const evidence=[];
   for(const s of scoped){
    const imageUrls=s.rowMeta?.mediaUrls;const caption=s.inputText||'';
    const stage3Kind=s.stages?.find(x=>x.stage==='format')?.output?.stageArtifacts?.stage3InputKind;
    if(!Array.isArray(imageUrls)||s.rowMeta?.sourceMediaUnavailable||imageUrls.length===0&&!['caption_only','text_only'].includes(stage3Kind)){gaps.push({edition:edition.id,sourceId:s.uniqueId,reason:'original_gallery_unavailable'});continue;}
    const captureKey=festivalShadowFingerprint({source:festivalEvidenceSourceFingerprint({caption,imageUrls}),edition:festivalEvidenceEditionFingerprint(edition),policy:FESTIVAL_EVIDENCE_POLICY});const cachePath=path.join(cacheDir,`${captureKey}.json`);let captured;
    try{captured=JSON.parse(await fs.readFile(cachePath,'utf8'));assert.equal(captured.captureKey,captureKey);if(captured.result){assert.equal(captured.result.sourceFingerprint,festivalEvidenceSourceFingerprint({caption,imageUrls}),'Cached source identity changed');assert.equal(captured.result.editionFingerprint,festivalEvidenceEditionFingerprint(edition),'Cached edition changed');assert.equal(captured.result.evidencePolicy,FESTIVAL_EVIDENCE_POLICY,'Cached evidence policy changed');}}catch(error){if(error.code!=='ENOENT')throw error;}
    if(!captured&&args.includes('--execute-evidence')&&paidSources<maxSources){
     paidSources++;
     try{captured={captureKey,sourceId:s.uniqueId,result:await extractFestivalEvidence({caption,imageUrls,edition,apiKey:process.env.OPENAI_API_KEY,verify:true})};}
     catch(error){captured={captureKey,sourceId:s.uniqueId,error:error.message,diagnostics:error.evidenceDiagnostics??null};}
     await fs.writeFile(cachePath,JSON.stringify(captured,null,2));
    }
    if(!captured?.result){gaps.push({edition:edition.id,sourceId:s.uniqueId,reason:captured?.error||'source_evidence_not_captured'});continue;}
    captures.push({captureKey,sourceId:s.uniqueId,requests:captured.result.requests});
    const result=captured.result;
    for(const [index,item] of result.activities.entries()){
     if(item.verification?.accepted!==true){gaps.push({edition:edition.id,sourceId:s.uniqueId,item:index,reason:'source_evidence_unconfirmed'});continue;}
     const matches=venues.filter(v=>[v.label,...v.aliases].some(n=>normalize(n.replace(/^the /i,''))===normalize(item.venueText.replace(/^the /i,''))));
     const publisherId='publisher_'+festivalShadowFingerprint(s.facebookUrl||'').slice(0,24);
     const binding=edition.sourceBindings?.[s.uniqueId];
     const namedSourceActivity=Boolean(item.activityRowText&&item.dateHeaderText&&normalize(item.eventText).startsWith(normalize(edition.name))&&normalize(item.eventText).length>normalize(edition.name).length);
     evidence.push({id:'e_'+festivalShadowFingerprint({source:s.uniqueId,index,scope:item.scopeText}).slice(0,40),
      source:{id:String(s.uniqueId),url:s.facebookUrl,text:result.sourceText,documents:result.documents,publisherId,revision:s.updateTime,...(binding?{organizerId:binding.organizerId}:{})},
      kind:namedSourceActivity?'same_source_named_activity':item.kind,scopeText:item.scopeText,membershipText:namedSourceActivity?item.eventText:item.membershipText,festivalNameText:item.festivalNameText,yearText:item.yearText,organizerText:item.organizerText,
      ...(item.activityRowText?{activityRowText:item.activityRowText,dateHeaderText:item.dateHeaderText}:{}),
      ...(item.captionScope?{captionScope:item.captionScope}:{}),...(item.sourceScope?{sourceScope:item.sourceScope}:{}),
      activity:{name:item.name,venueId:matches.length===1?matches[0].id:'',startDate:item.startDate,startTime:item.startTime,...(item.ticketUrl?{ticketUrl:item.ticketUrl}:{})},
      eventText:item.eventText,dateText:item.dateText,timeText:item.timeText,venueText:item.venueText});
    }
   }
   evaluations.push(await resolveFestivalMembership({umbrella:edition,sources:evidence,candidates,venues}));
  }
  const report={checkedAt:new Date().toISOString(),mode:'shadow',fileId,inputFingerprint:fingerprint,completion:gate,uniqueSources:latest.size,canonicalRecords:candidates.length,evaluations,gaps,captures,
   eligibleLinks:evaluations.reduce((n,x)=>n+x.links.length,0),paidSources,complete:gaps.length===0,eventWrites:0,venueWrites:0,published:false};
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  if(claimed?.decision==='claimed')await db.runTransaction(async tx=>{const s=await tx.get(jobRef);const finished=finishFestivalShadowJob(s.data(),claimed.job,Date.now(),report.complete?'completed':'held');tx.set(jobRef,{...finished,summary:{eligibleLinks:report.eligibleLinks,gaps:gaps.length,complete:report.complete,eventWrites:0},reportFingerprint:festivalShadowFingerprint(report)});});
  console.log(JSON.stringify({mode:'shadow',fileId,uniqueSources:latest.size,eligibleLinks:report.eligibleLinks,gaps:gaps.length,paidSources,complete:report.complete,eventWrites:0,shadowJob:claimed?.decision||'local-only',report:path.join(out,'report.json')}));
 }
}catch(error){
 if(error.shadowSkip){console.log(JSON.stringify({mode:'shadow',fileId,decision:error.shadowSkip,eventWrites:0}));}
 else{
  if(claimed?.decision==='claimed'&&jobRef)await db.runTransaction(async tx=>{const s=await tx.get(jobRef);try{tx.set(jobRef,{...finishFestivalShadowJob(s.data(),claimed.job,Date.now(),'retryable'),lastError:String(error.message).slice(0,300)});}catch{/* A successor owns the lease; stale worker cannot change it. */}});
  throw error;
 }
}finally{await admin.app().delete();}
