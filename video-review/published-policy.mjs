import {hash} from './policy.mjs';
export const PUBLIC_POLICY='listing-video-auto-v1';
export const PUBLIC_BUCKET='gathr-uploaded-images';
export const REGISTRY_LOCK='runtime_metadata/listing_video_registry_lock';
export const publicPath=sha=>{if(!/^[a-f0-9]{64}$/.test(sha))throw Error('invalid_public_video_hash');return `listingvideos/${sha}.mp4`;};
export const publicUrl=sha=>`https://storage.googleapis.com/${PUBLIC_BUCKET}/${publicPath(sha)}`;
// Must match the existing public getListingVideos reader; do not change field order.
export function listingFingerprint(data) {
 return hash(JSON.stringify([data.uniqueId||data.sourceUniqueId||data.metadata?.uniqueId,data.sourceUniqueIds,
  data.name,data.title,data.description,data.price,data.pricing,data.category,data.ageRestriction,
  data.startDate,data.endDate,data.startTime,data.endTime,data.status,
  data.isCancelled,data.isExpired,data.timing||data.metadata?.timing]));
}
export function bindingIsCurrent(binding,data,now=Date.now()) {
 const truth=v=>v===true||v===1||String(v).toLowerCase()==='true';
 if(!data||!Number.isFinite(Date.parse(binding.expiresAt))||Date.parse(binding.expiresAt)<=now||
  [data.isExpired,data.isCancelled,data.cancelled,data.canceled,data.metadata?.isExpired,data.metadata?.isCancelled,data.metadata?.cancelled].some(truth)||
  ['expired','cancelled','deleted','archived'].includes(String(data.status||data.metadata?.status||'').toLowerCase()))return false;
 return (Array.isArray(data.sourceUniqueIds)&&data.sourceUniqueIds.some(x=>typeof x==='string'&&x===binding.sourceId))||String(data.uniqueId||data.sourceUniqueId||data.metadata?.uniqueId||'')===binding.sourceId;
}
export const humanChoice=j=>j?.choice||({want_video:'use',use_video:'use',dont_use_video:'dont_use',unsure:'unsure',agree_with_decision:'legacy_agreement'}[j?.judgment]||null);
export const reviewedListings=c=>c.reviewedListingPath?(c.listings||[]).filter(l=>l.path===c.reviewedListingPath):(c.listings||[]);
export function eligibility(c,editorialVersion) {
 const choice=humanChoice(c.humanJudgment);
 if(choice==='dont_use')return {state:'declined',reason:'You chose not to use this video.'};
 if(choice==='unsure'||choice==='legacy_agreement')return {state:'needs_review',reason:'Waiting for your decision.'};
 if(c.state==='queued'||c.state==='processing')return {state:'waiting',reason:'Video review is still running.'};
 if(c.state==='expired'||Date.parse(c.expiresAt)<=Date.now())return {state:'unavailable',reason:'The retained private preview expired.'};
 if(!c.object||!/^[a-f0-9]{64}$/.test(c.sha256||'')||typeof c.sourceAudio!=='boolean')return {state:'needs_review',reason:'The complete video or its source audio is unavailable.'};
 if((c.reasons||[]).some(x=>/interrupted|paid.*unknown|processing_failed/.test(x)))return {state:'needs_review',reason:'An interrupted processing attempt needs inspection.'};
 if(choice==='use'&&c.humanJudgment.listingPath&&c.humanJudgment.listingPath!==c.reviewedListingPath)return {state:'upgrade_review',reason:'Checking the listing you selected against this video.'};
 if(c.contentAssessment?.decision==='reject'&&choice!=='use')return {state:'filtered',reason:c.contentAssessment.reason||'This clip does not fit GathR.'};
 if(c.reviewVersion!==editorialVersion)return {state:'upgrade_review',reason:'The current automatic-publication review is required.'};
 if((c.reasons||[]).some(x=>/incomplete|missing|interrupted|failed|conflict|invalid|mismatch/.test(x)||x.includes('disagree')&&choice!=='use'))return {state:'needs_review',reason:'Evidence is incomplete or conflicting; publication is held.'};
 if(c.contentAssessment?.decision!=='useful'&&choice!=='use')return {state:'needs_review',reason:'Content usefulness needs your decision.'};
 if(c.listingCheck?.status!=='matched'||reviewedListings(c).length!==1)return {state:'needs_review',reason:'A confirmed event or special match is needed.'};
 if(choice!=='use'&&(c.state!=='recommended'||(c.reasons||[]).length))return {state:'needs_review',reason:'The automated review did not approve a clear match.'};
 if(choice==='use'&&c.humanJudgment.sha256!==c.sha256)return {state:'needs_review',reason:'Review the downloaded clip before using it.'};
 return {state:'eligible',reason:choice==='use'?'Your Use decision has a confirmed listing match.':'Useful video with one confirmed source-linked listing.'};
}
export function validatePublicProbe(p,sourceAudio) {
 if(!Number.isFinite(p.durationSeconds)||p.durationSeconds<=0||p.durationSeconds>90||!Number.isInteger(p.bytes)||p.bytes<1||p.bytes>8000000||
  !Number.isInteger(p.width)||!Number.isInteger(p.height)||Math.min(p.width,p.height)<1||Math.min(p.width,p.height)>720||Math.max(p.width,p.height)>1280||
  p.codec!=='h264'||typeof sourceAudio!=='boolean'||p.hasAudio!==sourceAudio||p.hasAudio&&p.audioCodec!=='aac')throw Error('public_video_fidelity_or_format_invalid');
}
export function cleanupDue(asset,now=Date.now()) {
 return asset.state==='preparing'?Date.parse(asset.stagingExpiresAt||'')<=now:
  asset.state==='deleting'||asset.state==='ready'&&Number.isFinite(Date.parse(asset.unreferencedSince||''))&&now-Date.parse(asset.unreferencedSince)>=7*86400000;
}
