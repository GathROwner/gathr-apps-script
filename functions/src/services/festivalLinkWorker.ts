import * as admin from 'firebase-admin';
import {randomUUID} from 'node:crypto';import {pathToFileURL} from 'node:url';import path from 'node:path';
import {DateTime} from 'luxon';
import {reviewedFestivalEdition} from './festivalEditionRegistry.js';
import {festivalShadowFingerprint,festivalShadowJobId,claimFestivalShadowJob,finishFestivalShadowJob,verifyFestivalFullRun} from './festivalLinkShadowJob.js';
import type {FestivalShadowJob,FullRunEvidence} from './festivalLinkShadowJob.js';
import {planFestivalLinkPublication,assertFestivalPublicationFence} from './festivalLinkPublication.js';
import type {FestivalPinnedDocument,FestivalPublicationInput,FestivalPublicationOwnership} from './festivalLinkPublication.js';
import type {FestivalCanonicalVenue,FestivalSourceEvidence} from './festivalLinker.js';
import {validFestivalNonmembership} from './festivalSourceDecision.js';

const terminal=new Set(['completed','failed','cancelled','canceled','released']);
const active=(docs:admin.firestore.QueryDocumentSnapshot[])=>docs.some(d=>!terminal.has(String(d.get('status')||'')));
const normalize=(v:unknown)=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const plain=(v:any):any=>JSON.parse(JSON.stringify(v));
const pin=(d:admin.firestore.DocumentSnapshot):FestivalPinnedDocument=>{if(!d.exists||!d.updateTime)throw Error('Missing pinned document');return{path:d.ref.path,version:{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}};};
const captureModule=()=>import(pathToFileURL(path.join(__dirname,'../../scripts/festival-evidence-extractor.mjs')).href);
export interface FestivalWorkerOptions {mode:'off'|'shadow'|'publish';apiKey?:string;asOf?:string;fileId?:string;dryRun?:boolean;localCaptures?:ReadonlyMap<string,any>;localDecisions?:ReadonlyMap<string,any>;}

/** One bounded source capture per invocation. No stage/parser/review/venue mutations. */
export async function runFestivalLinkWorker(db:admin.firestore.Firestore,options:FestivalWorkerOptions):Promise<Record<string,any>>{
 if(options.mode==='off')return{mode:'off',eventWrites:0};
 if((options.localCaptures||options.localDecisions)&&!options.dryRun)throw Error('Local source playback is dry-run only');
 if(active((await db.collection('processing_locks').get()).docs))return{mode:options.mode,status:'parser_active',eventWrites:0};
 const markers=options.fileId?[await db.doc(`processed_datasets/${options.fileId}`).get()]:(await db.collection('processed_datasets').orderBy('processedAt','desc').limit(10).get()).docs;
 let completion:FullRunEvidence|undefined;let completionRefs:FestivalPinnedDocument[]=[];let start=0,end=0;
 for(const marker of markers){
  if(!marker.exists)continue;const fileId=marker.id;
  const [lock,checkpoint,batches]=await Promise.all([db.doc(`processing_locks/${fileId}`).get(),db.doc(`checkpoints/${fileId}`).get(),db.collection('batch_states').where('fileId','==',fileId).get()]);
  const batch=[...batches.docs].sort((a,b)=>Number(b.get('batchNumber'))-Number(a.get('batchNumber')))[0];
  const candidate={fileId,checkpointExists:checkpoint.exists,lock:lock.data(),marker:marker.data(),batch:batch?.data()} as FullRunEvidence;
  if(verifyFestivalFullRun(candidate).ready){completion=candidate;completionRefs=[pin(marker),pin(lock),pin(batch)];start=lock.get('startedAt')?.toMillis?.();end=marker.get('processedAt')?.toMillis?.();break;}
 }
 if(!completion)return{mode:options.mode,status:'no_completed_regular_run',eventWrites:0};
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)throw Error('Invalid full-run time bounds');
 const fileId=completion.fileId,asOf=options.asOf||DateTime.now().setZone('America/Halifax').toISODate()!;
 const area=await db.collection('events').where('locationScope','==','area').limit(1001).get();if(area.size>1000)throw Error('Umbrella scan overflow');
 const registered:{edition:NonNullable<ReturnType<typeof reviewedFestivalEdition>>;umbrella:admin.firestore.QueryDocumentSnapshot;review:admin.firestore.DocumentSnapshot}[]=[];
 for(const umbrella of area.docs){const id=umbrella.get('cityLevelReviewId');if(typeof id!=='string'||!/^[A-Za-z0-9_-]+$/.test(id)||umbrella.get('endDate')<asOf)continue;
  const review=await db.doc(`city_level_event_reviews/${id}`).get();if(!review.exists)continue;
  const edition=reviewedFestivalEdition({path:umbrella.ref.path,data:umbrella.data()},{path:review.ref.path,data:review.data()!},asOf);
  if(edition)registered.push({edition,umbrella,review});
 }
 if(!registered.length)return{mode:options.mode,status:'no_reviewed_active_editions',eventWrites:0};
 if(registered.length>20)throw Error('Edition inventory overflow');
 const raw=await db.collection('parse_snapshots').where('fileId','==',fileId).limit(2001).get();if(raw.size>2000)throw Error('Source inventory overflow');
 const latest=new Map<string,admin.firestore.QueryDocumentSnapshot>();
 for(const source of raw.docs){const t=source.updateTime.toMillis(),s=source.data();if(t<start||t>end||s.rowMeta?.dryRun||s.rowMeta?.selectedRows||s.rowMeta?.parserMode!=='full5stage'||!s.uniqueId)continue;
  const old=latest.get(String(s.uniqueId));if(!old||source.updateTime.toMillis()>old.updateTime.toMillis())latest.set(String(s.uniqueId),source);
 }
 const minimum=registered.map(x=>x.edition.startDate).sort()[0],maximum=registered.map(x=>x.edition.endDate).sort().at(-1)!;
 const children=await db.collectionGroup('events').where('startDate','>=',minimum).where('startDate','<=',maximum).limit(5001).get();if(children.size>5000)throw Error('Canonical inventory overflow');
 const candidates=children.docs.map(d=>({path:d.ref.path,data:plain(d.data())}));
 const venueIds=[...new Set<string>([...candidates.map(c=>c.data.venueId),...registered.flatMap(r=>r.edition.venueIds||[])].filter(x=>typeof x==='string'&&/^[A-Za-z0-9_-]+$/.test(x)))].sort();
 const venueDocs:admin.firestore.DocumentSnapshot[]=[];for(let i=0;i<venueIds.length;i+=100)venueDocs.push(...await db.getAll(...venueIds.slice(i,i+100).map(id=>db.doc(`venues/${id}`))));
 const venues:FestivalCanonicalVenue[]=venueDocs.filter(d=>d.exists).map(d=>({id:d.id,label:d.get('name')||d.get('venueName')||d.get('establishment')||'',aliases:[...(Array.isArray(d.get('aliases'))?d.get('aliases'):[]),...registered.flatMap(r=>r.edition.venueAliases[d.id]||[])],latitude:Number(d.get('latitude')),longitude:Number(d.get('longitude'))}));
 const extractor=await captureModule();const items:any[]=[];const cacheSnapshots:admin.firestore.DocumentSnapshot[]=[];
 for(const r of registered){
  if(registered.filter(other=>normalize(other.edition.name)===normalize(r.edition.name)&&other.edition.year===r.edition.year).length!==1)throw Error('Ambiguous edition registry');
  const scoped=[...latest.values()].filter(d=>{const s=d.data(),output=s.stages?.find((x:any)=>x.stage==='format')?.output;
   return normalize(s.inputText).includes(normalize(r.edition.name))||output?.stageArtifacts?.stage3Items?.some((i:any)=>normalize(i.name).includes(normalize(r.edition.name))||i.spatial?.kind==='multi_location')||
    r.edition.venueIds?.includes(s.venueId)&&output?.stageArtifacts?.stage3Items?.some((i:any)=>i.date>=r.edition.startDate&&i.date<=r.edition.endDate);
  }).sort((a,b)=>String(a.get('uniqueId')).localeCompare(String(b.get('uniqueId'))));
  for(const source of scoped){const s=source.data(),caption=s.inputText||'',imageUrls=s.rowMeta?.mediaUrls,kind=s.stages?.find((x:any)=>x.stage==='format')?.output?.stageArtifacts?.stage3InputKind;
   if(!Array.isArray(imageUrls)||s.rowMeta?.sourceMediaUnavailable||imageUrls.length===0&&!['caption_only','text_only'].includes(kind)){items.push({r,source,gap:'original_gallery_unavailable'});continue;}
   const identity={source:extractor.festivalEvidenceSourceFingerprint({caption,imageUrls}),edition:extractor.festivalEvidenceEditionFingerprint(r.edition)};
   let capturePolicy=extractor.FESTIVAL_EVIDENCE_POLICY,key=festivalShadowFingerprint({...identity,policy:capturePolicy});
   let cache=await db.doc(`festival_link_captures/${key}`).get(),decision=await db.doc(`festival_link_source_decisions/${key}`).get();cacheSnapshots.push(cache,decision);
   if(!cache.exists&&!decision.exists&&!options.localCaptures?.has(key)&&!options.localDecisions?.has(key)){
    const previousKey=festivalShadowFingerprint({...identity,policy:extractor.FESTIVAL_PREVIOUS_EVIDENCE_POLICY});
    const previousCache=await db.doc(`festival_link_captures/${previousKey}`).get(),previousDecision=await db.doc(`festival_link_source_decisions/${previousKey}`).get();cacheSnapshots.push(previousCache,previousDecision);
    if(previousCache.exists||previousDecision.exists){key=previousKey;capturePolicy=extractor.FESTIVAL_PREVIOUS_EVIDENCE_POLICY;cache=previousCache;decision=previousDecision;}
   }
   const decisionData=options.localDecisions?.get(key)||decision.data(),nonmember=validFestivalNonmembership(decisionData,{editionId:r.edition.id,sourceId:String(s.uniqueId),captureKey:key,sourceFingerprint:identity.source,evidencePolicy:capturePolicy});
   items.push({r,source,caption,imageUrls,key,capturePolicy,cache,decision,nonmember,decisionData,captureData:options.localCaptures?.get(key)||cache.data()});
  }
 }
 const jobRef=db.doc(`festival_link_jobs/${festivalShadowJobId(fileId)}`),fingerprint=festivalShadowFingerprint({fileId,mode:options.mode,policy:'publication-worker-v1',editions:registered.map(r=>({edition:r.edition,umbrella:pin(r.umbrella),review:pin(r.review)})),sources:[...latest.values()].map(pin).sort((a,b)=>a.path.localeCompare(b.path)),children:children.docs.map(pin).sort((a,b)=>a.path.localeCompare(b.path)),venues:venueDocs.filter(d=>d.exists).map(pin),captures:cacheSnapshots.map(d=>({path:d.ref.path,version:d.exists?pin(d).version:null}))});
 const claimed=options.dryRun?claimFestivalShadowJob(undefined,{fileId,inputFingerprint:fingerprint,workerToken:randomUUID(),nowMs:Date.now(),leaseMs:600000}):await db.runTransaction(async tx=>{if(active((await tx.get(db.collection('processing_locks'))).docs))return{decision:'busy'} as const;const old=await tx.get(jobRef);if(old.get('status')==='held'&&old.get('inputFingerprint')===fingerprint)return{decision:'already_held'} as const;const claim=claimFestivalShadowJob(old.data() as FestivalShadowJob|undefined,{fileId,inputFingerprint:fingerprint,workerToken:randomUUID(),nowMs:Date.now(),leaseMs:600000});if(claim.decision==='claimed')tx.set(jobRef,claim.job);return claim;});
 if(claimed.decision!=='claimed')return{mode:options.mode,status:claimed.decision,eventWrites:0};
 const claim=claimed.job;let paidSources=0;
 try{
  const missing=items.find(i=>!i.gap&&!i.captureData&&!i.nonmember);
  if(missing){
   if(options.dryRun)return{mode:options.mode,fileId,status:'source_evidence_not_captured',sourceId:missing.source.get('uniqueId'),paidSources:0,eventWrites:0,dryRun:true};
   if(!options.apiKey)throw Error('Existing OpenAI secret required');paidSources=1;let capture:any;
   try{const result=await extractor.extractFestivalEvidence({caption:missing.caption,imageUrls:missing.imageUrls,edition:missing.r.edition,apiKey:options.apiKey,verify:true});delete result.rawResponses;capture={captureKey:missing.key,sourceId:String(missing.source.get('uniqueId')),result};}
   catch(error:any){capture={captureKey:missing.key,sourceId:String(missing.source.get('uniqueId')),error:String(error.message).slice(0,300),requests:error.evidenceDiagnostics?.requests||[]};}
   if(Buffer.byteLength(JSON.stringify(capture),'utf8')>700000)capture={captureKey:missing.key,sourceId:String(missing.source.get('uniqueId')),error:'capture_document_size_hold',requests:capture.result?.requests||capture.requests||[]};
   await db.runTransaction(async tx=>{const [job,cache]=await tx.getAll(jobRef,missing.cache.ref);const source=await tx.get(missing.source.ref as admin.firestore.DocumentReference);assertFestivalPublicationFence(job.data() as FestivalShadowJob,claim,Date.now(),[pin(missing.source)],new Map([[source.ref.path,{exists:source.exists,version:source.exists?pin(source).version:undefined}]]),false);if(cache.exists)throw Error('Capture already committed by another worker');tx.create(cache.ref,plain(capture));tx.set(jobRef,{...finishFestivalShadowJob(job.data() as FestivalShadowJob,claim,Date.now(),'retryable'),summary:{mode:options.mode,paidSources,eventWrites:0,status:'capture_progress'}});});
   return{mode:options.mode,fileId,status:'capture_progress',paidSources,eventWrites:0,captureError:capture.error||null};
  }
  let eventWrites=0;const reports:any[]=[];
  for(const r of registered){
   const sourceItems=items.filter(i=>i.r===r),sources:FestivalSourceEvidence[]=[],gaps:any[]=[],reviewedNonmembers:any[]=[];
   for(const item of sourceItems){if(item.gap){gaps.push({sourceId:item.source.get('uniqueId'),reason:item.gap});continue;}
    if(item.nonmember){reviewedNonmembers.push({sourceId:item.source.get('uniqueId'),reviewId:item.decisionData.reviewId,reason:item.decisionData.reason,captureStillIncomplete:item.captureData?.result?.complete!==true});continue;}
    const c=item.captureData;
    if(!c?.result){gaps.push({sourceId:item.source.get('uniqueId'),reason:c?.error||'source_evidence_not_captured'});continue;}
    let result=c.result;if(c.captureKey!==item.key||result.evidencePolicy!==item.capturePolicy||result.sourceFingerprint!==extractor.festivalEvidenceSourceFingerprint(item)||result.editionFingerprint!==extractor.festivalEvidenceEditionFingerprint(r.edition))throw Error('Cached source identity changed');
    result=extractor.validateFestivalEvidenceCapture(result,item);
    for(const [index,a]of result.activities.entries()){
     if(a.verification?.accepted!==true){gaps.push({sourceId:item.source.get('uniqueId'),item:index,reason:'source_evidence_unconfirmed'});continue;}
     const matches=venues.filter(v=>[v.label,...(v.aliases||[])].some(n=>normalize(n.replace(/^the /i,''))===normalize(a.venueText.replace(/^the /i,''))));const sid=String(item.source.get('uniqueId')),binding=r.edition.sourceBindings[sid];
     const named=Boolean(a.activityRowText&&a.dateHeaderText&&normalize(a.eventText).startsWith(normalize(r.edition.name))&&normalize(a.eventText).length>normalize(r.edition.name).length);
     sources.push({id:'e_'+festivalShadowFingerprint({source:sid,index,scope:a.scopeText}).slice(0,40),source:{id:sid,url:item.source.get('facebookUrl'),text:result.sourceText,documents:result.documents,publisherId:'publisher_'+festivalShadowFingerprint(item.source.get('facebookUrl')||'').slice(0,24),revision:item.source.updateTime.toDate().toISOString(),...(binding?{organizerId:binding.organizerId}:{})},kind:named?'same_source_named_activity':a.kind,scopeText:a.scopeText,membershipText:named?a.eventText:a.membershipText,festivalNameText:a.festivalNameText,yearText:a.yearText,organizerText:a.organizerText,...(a.activityRowText?{activityRowText:a.activityRowText,dateHeaderText:a.dateHeaderText}:{}),...(a.captionScope?{captionScope:a.captionScope}:{}),...(a.sourceScope?{sourceScope:a.sourceScope}:{}),activity:{name:a.name,venueId:matches.length===1?matches[0].id:'',startDate:a.startDate,startTime:a.startTime,...(a.ticketUrl?{ticketUrl:a.ticketUrl}:{})},eventText:a.eventText,dateText:a.dateText,timeText:a.timeText,venueText:a.venueText});
    }
   }
   const ownershipRef=db.doc(`festival_link_publications/${r.edition.id}`),ownership=await ownershipRef.get();
   const input:FestivalPublicationInput={edition:r.edition,umbrella:{path:r.umbrella.ref.path,data:plain(r.umbrella.data())},review:{path:r.review.ref.path,data:plain(r.review.data()!)},sources,candidates,venues,completion,sourceInventoryComplete:gaps.length===0,ownership:ownership.data() as FestivalPublicationOwnership|undefined};
   const proposal=await planFestivalLinkPublication(input);reports.push({editionId:r.edition.id,status:proposal.status,reason:proposal.reason,gaps,reviewedNonmembers,outcomes:proposal.result?.outcomes||[],addedEventIds:proposal.addedEventIds});
   if(options.dryRun||options.mode!=='publish'||proposal.status!=='ready')continue;
   const refs=[...completionRefs,pin(r.umbrella),pin(r.review),...sourceItems.map(i=>pin(i.source)),...sourceItems.filter(i=>i.cache?.exists).map(i=>pin(i.cache)),...sourceItems.filter(i=>i.nonmember&&i.decision?.exists).map(i=>pin(i.decision)),...children.docs.map(pin),...venueDocs.filter(d=>d.exists).map(pin)];
   const references=[...new Map(refs.map(p=>[p.path,p])).values()];
   await db.runTransaction(async tx=>{
    const locks=await tx.get(db.collection('processing_locks')),checkpoint=await tx.get(db.doc(`checkpoints/${fileId}`));if(checkpoint.exists)throw Error('Checkpoint reappeared');
    const [job,owned,feed]=await tx.getAll(jobRef,ownershipRef,db.doc('runtime_metadata/event_feed'));const read=await tx.getAll(...references.map(p=>db.doc(p.path)));
    const captureState=[...new Map(cacheSnapshots.map(d=>[d.ref.path,d])).values()];
    const currentCaptures=captureState.length?await tx.getAll(...captureState.map(d=>db.doc(d.ref.path))):[];
    const cachePins=(docs:admin.firestore.DocumentSnapshot[])=>docs.map(d=>({path:d.ref.path,version:d.exists?pin(d).version:null}));
    if(festivalShadowFingerprint(cachePins(currentCaptures))!==festivalShadowFingerprint(cachePins(captureState)))throw Error('festival_reference_drift:source_capture_state');
    const currentChildren=await tx.get(db.collectionGroup('events').where('startDate','>=',minimum).where('startDate','<=',maximum).limit(5001));
    if(festivalShadowFingerprint(currentChildren.docs.map(pin).sort((a,b)=>a.path.localeCompare(b.path)))!==festivalShadowFingerprint(children.docs.map(pin).sort((a,b)=>a.path.localeCompare(b.path))))throw Error('Canonical inventory changed');
    assertFestivalPublicationFence(job.data() as FestivalShadowJob,claim,Date.now(),references,new Map(read.map(d=>[d.ref.path,{exists:d.exists,version:d.exists?pin(d).version:undefined}])),active(locks.docs));
    if(ownership.exists!==owned.exists||ownership.exists&&festivalShadowFingerprint(pin(ownership))!==festivalShadowFingerprint(pin(owned)))throw Error('Publication ownership drift');
    if(proposal.addedEventIds.length){if(!feed.exists||!Number.isSafeInteger(feed.get('version')))throw Error('Feed version unavailable');tx.update(r.umbrella.ref,{areaData:proposal.areaData,updatedAt:admin.firestore.FieldValue.serverTimestamp()});tx.update(feed.ref,{version:feed.get('version')+1,updatedAt:admin.firestore.FieldValue.serverTimestamp()});}
    const proofs={...(owned.get('proofs')||{})};for(const link of proposal.result?.links||[])if(proposal.addedEventIds.includes(link.eventId))proofs[link.eventId]={fingerprint:link.fingerprint,evidence:link.evidence,provenance:link.provenance};
    const state=plain({...proposal.ownership!,proofs,lastDataset:fileId});if(Buffer.byteLength(JSON.stringify(state),'utf8')>700000)throw Error('Publication proof inventory too large');tx.set(ownershipRef,state);
   });eventWrites+=proposal.addedEventIds.length?1:0;
  }
  if(!options.dryRun)await db.runTransaction(async tx=>{const job=await tx.get(jobRef);tx.set(jobRef,{...finishFestivalShadowJob(job.data() as FestivalShadowJob,claim,Date.now(),reports.some(r=>r.status==='held')?'held':'completed'),summary:plain({mode:options.mode,paidSources,eventWrites,reports})});});
  return{mode:options.mode,fileId,status:reports.some(r=>r.status==='held')?'held':'completed',sourceCount:latest.size,paidSources,eventWrites,reports,dryRun:options.dryRun||false};
 }catch(error:any){if(!options.dryRun)await db.runTransaction(async tx=>{const job=await tx.get(jobRef);try{tx.set(jobRef,{...finishFestivalShadowJob(job.data() as FestivalShadowJob,claim,Date.now(),'retryable'),lastError:String(error.message).slice(0,300)});}catch{/* Successor's lease is protected. */}});throw error;}
}
