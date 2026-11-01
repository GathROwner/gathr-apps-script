// Local, explicitly human-selected publication only. This is not an automatic worker hook.
import {createHash} from 'node:crypto';
import {nextListingOccurrence,recurringListing,halifaxDayEnd} from './listing-schedule.mjs';
export const digest=x=>createHash('sha256').update(x).digest('hex');
export const selected=j=>j?.choice==='use'||j?.judgment==='want_video';
export function validateSelection(c,config,probe,now=Date.now(),longerTrial=null) {
 const hokumTrial=longerTrial?.sourceVideoId==='1068937392790830'&&c.sourceVideoId===longerTrial.sourceVideoId&&
  longerTrial.reviewedSHA256===c.sha256&&longerTrial.maximumSeconds===90&&c.reviewVersion==='hokum-longer-trial-v1';
 const byteOrSourceBound=c.humanJudgment?.sha256===c.sha256||hokumTrial&&c.humanJudgment?.sha256===null&&c.humanJudgment?.judgment==='use_video';
 if(!selected(c.humanJudgment)||!config.adminUids?.includes(c.humanJudgment.reviewerUid)||
  !/^[a-f0-9]{64}$/.test(c.sha256)||!byteOrSourceBound||
  !Number.isFinite(Date.parse(c.humanJudgment.reviewedAt))||Date.parse(c.humanJudgment.reviewedAt)>now||
  now-Date.parse(c.humanJudgment.reviewedAt)>86400000)throw Error('Current byte-bound human Use selection required');
 if(c.contentAssessment?.decision!=='useful')throw Error('Content review is unresolved');
 if(typeof c.sourceAudio!=='boolean'||c.sourceAudio!==probe.hasAudio)throw Error('Source audio fidelity unresolved');
 if(!Number.isFinite(probe.durationSeconds)||probe.durationSeconds<=0||probe.durationSeconds>90||
  !Number.isInteger(probe.bytes)||probe.bytes<=0||probe.bytes>8000000||probe.codec!=='h264'||
  !Number.isInteger(probe.width)||!Number.isInteger(probe.height)||Math.min(probe.width,probe.height)<1||
  Math.min(probe.width,probe.height)>720||Math.max(probe.width,probe.height)>1280||
  probe.hasAudio&&probe.audioCodec!=='aac'||Math.abs(probe.durationSeconds-c.durationSeconds)>.1)throw Error('Public media format or duration invalid');
}
export function validateMatch(c,event,match) {
 const ids=[...(Array.isArray(event.sourceUniqueIds)?event.sourceUniqueIds:[]),event.uniqueId,event.sourceUniqueId,event.metadata?.uniqueId].filter(x=>typeof x==='string');
 if(!/^venues\/[A-Za-z0-9_.-]+\/events\/[A-Za-z0-9_.-]+$/.test(match.path)||
  match.path.split('/')[1]!==match.venueId||event.venueId!==match.venueId||
  event.startDate!==match.date||!ids.includes(match.listingSourceId)||!match.reason?.trim()||
  !['same_post','verified_same_occurrence'].includes(match.mode)||
  match.mode==='same_post'&&match.listingSourceId!==c.sourcePostId||
  match.mode==='verified_same_occurrence'&&(!match.evidenceDigest||!/^[a-f0-9]{64}$/.test(match.evidenceDigest)))throw Error('Exact listing/source/occurrence proof required');
 if([event.isExpired,event.isCancelled,event.cancelled,event.canceled,event.metadata?.isExpired,event.metadata?.isCancelled].some(v=>v===true||v===1||String(v).toLowerCase()==='true')||
  ['expired','cancelled','deleted','archived'].includes(String(event.status||event.metadata?.status||'').toLowerCase()))throw Error('Listing is not current');
}
export function expiryFor(event,now=Date.now(),mediaExpiresAt=null) {
 const occurrence=recurringListing(event)?nextListingOccurrence(event,now):null;
 if(recurringListing(event)&&!occurrence)throw Error('Listing recurrence unresolved or ended');
 const expiry=halifaxDayEnd(occurrence?.endDate||event.endDate||event.startDate);
 // A recurring clip never outlives its private source/evidence retention window.
 if(occurrence&&mediaExpiresAt){if(!Number.isFinite(Date.parse(mediaExpiresAt)))throw Error('Video expiry unknown');return new Date(Math.min(Date.parse(expiry),Date.parse(mediaExpiresAt))).toISOString();}
 return expiry;
}
