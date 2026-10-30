import {createHash} from 'node:crypto';
export const POLICY = Object.freeze({version:'daily-video-review-v1', bucket:'gathr-private-video-reviews',
  queue:'private_video_candidates', files:'private_video_datasets', days:14, maxBytes:50_000_000});
export const hash = v => createHash('sha256').update(v).digest('hex');
export const canonical = v => JSON.stringify(v, Object.keys(v).sort());
export function cdnUrl(value) {
  const u = new URL(String(value));
  if(u.protocol!=='https:' || u.username || u.password || u.port ||
    !/^video[.-][a-z0-9.-]+\.fbcdn\.net$/.test(u.hostname)) throw Error('unsupported_video_host');
  return u.toString();
}
function flatten(value, prefix='', out={}) {
  if (value && typeof value==='object') for(const [k,v] of Object.entries(value)) flatten(v,prefix?`${prefix}/${k}`:k,out);
  else out[prefix]=value;
  return out;
}
/** Both XLSX slash columns and nested actor JSON; retain OUTER post identity for shares. */
export function discover(rows, fileId, now=Date.now()) {
  const candidates=new Map();
  for(const original of rows) {
    const r=flatten(original); const sourcePostId=String(r.id??r.postId??'');
    if(!/^\d{5,30}$/.test(sourcePostId)) continue;
    const prefixes=[...new Set(Object.keys(r).flatMap(k=>/^(.*(?:^|\/)media\/\d+)\/__typename$/i.exec(k)?.[1]??[]))];
    for(const p of prefixes) {
      if(r[`${p}/__typename`]!=='Video') continue;
      const sourceVideoId=String(r[`${p}/videoId`]??r[`${p}/id`]??'');
      if(!/^\d{5,30}$/.test(sourceVideoId)) continue;
      const rawUrls=[r[`${p}/videoDeliveryLegacyFields/browser_native_sd_url`],r[`${p}/videoDeliveryLegacyFields/browser_native_hd_url`],r[`${p}/videoUrl`]];
      const milliseconds=Number(r[`${p}/playable_duration_in_ms`]);
      const seconds=Number.isFinite(milliseconds)&&milliseconds>0?milliseconds/1000:Number(r[`${p}/duration`]);
      let sourceUrl=null,reason=null;
      for(const rawUrl of rawUrls){try{sourceUrl=cdnUrl(rawUrl);break;}catch{}}
      if(!sourceUrl)reason='direct_video_url_unavailable';
      if(Number.isFinite(seconds)&&seconds>60) reason='clip_over_60_seconds';
      const caption=[r.text??r.Text??'',r['sharedPost/text']??''].filter(Boolean).join('\n\n').slice(0,16000);
      const id=hash(JSON.stringify([sourcePostId,sourceVideoId,caption,POLICY.version]));
      const audio=String(r[`${p}/audio_availability`]??r[`${p}/audioAvailability`]??'unknown');
      candidates.set(id,{id,sourcePostId,sourceVideoId,caption,fileId,mediaPath:p,sourceUrl,
        sourceAudio:audio==='UNAVAILABLE'?false:['AVAILABLE','AVAILABLE_BUT_MUTED'].includes(audio)?true:'unknown',
        durationSeconds:Number.isFinite(seconds)?seconds:null,sourcePage:`https://www.facebook.com/reel/${sourceVideoId}/`,
        discoveredAt:new Date(now).toISOString(),expiresAt:new Date(now+POLICY.days*86400000).toISOString(),
        state:reason?'held':'queued',decision:'hold',reasons:reason?[reason]:[],policy:POLICY.version,
        cleanupAt:new Date(now+POLICY.days*86400000).toISOString(),
        ...(reason?{revision:hash(JSON.stringify([id,reason]))}:{})});
    }
  }
  return [...candidates.values()];
}
export function rangeRequest(value,size) {
  if(!value) return {start:0,end:size-1,partial:false};
  const m=/^bytes=(\d*)-(\d*)$/.exec(value);
  if(!m||(!m[1]&&!m[2])) throw Error('invalid_range');
  const start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2]));
  const end=m[1]?(m[2]?Math.min(size-1,Number(m[2])):size-1):size-1;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start) throw Error('invalid_range');
  return {start,end,partial:true};
}
export function publicCandidate(c) {
  const {sourceUrl,lease,artifacts,...safe}=c;
  return safe;
}
export function validateJudgment(body) {
  if(!['use_video','dont_use_video','unsure','want_video','agree_with_decision'].includes(body?.judgment)||
      typeof body.notes!=='string'||body.notes.length>2000||!/^[a-f0-9]{64}$/.test(body.revision??'')) throw Error('invalid_judgment');
  const choice={use_video:'use',want_video:'use',dont_use_video:'dont_use',unsure:'unsure',agree_with_decision:'legacy_agreement'}[body.judgment];
  return {judgment:body.judgment,choice,notes:body.notes};
}
export function allowedIdentity(decoded,config) {
  return decoded?.email_verified===true&&typeof decoded.uid==='string'&&
    Array.isArray(config?.adminUids)&&config.adminUids.includes(decoded.uid);
}
