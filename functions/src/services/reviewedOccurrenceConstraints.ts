import type {EventData} from '../types/index.js';
import {DateTime} from 'luxon';

/** Reviewed source-specific limits, never a title match or source-wide ban. */
export interface ReviewedOccurrenceConstraint {
  sourceUniqueId:string; uniqueIds:string[]; reviewId:string; sourceUrls:string[];
  action:'hold'|'season_bound'|'fixed_occurrence'|'retired_occurrence'; untilDate?:string; startTime?:string; recurringPattern?:string;
  startDate?:string; endDate?:string; endTime?:string;
  eventNames?:string[]; canonicalEventPath?:string;
  match?:'source_date_clock_name';
}
export function classifyReviewedOccurrenceConstraint(event:EventData,venue:{id:string;reviewedOccurrenceConstraints?:ReviewedOccurrenceConstraint[]}):'none'|'hold' {
  if(event.venueId!==venue.id||!venue.reviewedOccurrenceConstraints)return 'none';
  const rules=venue.reviewedOccurrenceConstraints;
  if(!Array.isArray(rules)||rules.length>32)return 'hold';
  const uid=String(event.uniqueId||''),root=uid.split('_')[0];
  for(const rule of rules){
    if(!rule||!/^\d{8,}$/.test(rule.sourceUniqueId)||!Array.isArray(rule.uniqueIds)||!rule.uniqueIds.length||rule.uniqueIds.length>16||
      !rule.uniqueIds.every(id=>typeof id==='string'&&id.startsWith(rule.sourceUniqueId+'_'))||typeof rule.reviewId!=='string'||!rule.reviewId.trim()||
      !Array.isArray(rule.sourceUrls)||!rule.sourceUrls.length||!rule.sourceUrls.every(url=>{try{return new URL(url).protocol==='https:';}catch{return false;}})||
      !['hold','season_bound','fixed_occurrence','retired_occurrence'].includes(rule.action))return 'hold';
    if(rule.action==='retired_occurrence'){
      // A reviewed mislocated occurrence may now have a different semantic ID
      // because title/end normalization changed. Bind its hold to the exact
      // source/date/start/literal names, not the outer publisher or source alone.
      if(typeof rule.startDate!=='string'||DateTime.fromISO(rule.startDate).toISODate()!==rule.startDate||
         !/^20\d{2}-\d{2}-\d{2}$/.test(rule.startDate)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(rule.startTime||'')||
         !Array.isArray(rule.eventNames)||!rule.eventNames.length||rule.eventNames.length>16||
         !rule.eventNames.every(name=>typeof name==='string'&&name.trim().length>=8)||
         !/^venues\/[^/]+\/events\/[^/]+$/.test(rule.canonicalEventPath||''))return 'hold';
      const key=(value:unknown)=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
      if(root===rule.sourceUniqueId&&(rule.uniqueIds.includes(uid)||
        event.startDate===rule.startDate&&event.startTime===rule.startTime&&
        rule.eventNames.some(name=>key(name)===key(event.eventName||event.name))))return 'hold';
      continue;
    }
    // A reviewed source/date/start/literal title can survive changes to the
    // parser's generated end or venue label. Existing UID-only holds retain
    // their old behavior; this never becomes a whole-source/title-only ban.
    let exactHeldActivity=false;
    if(rule.match!==undefined&&rule.match!=='source_date_clock_name')return 'hold';
    if(rule.action==='hold' && rule.match==='source_date_clock_name'){
      if(typeof rule.startDate!=='string'||DateTime.fromISO(rule.startDate).toISODate()!==rule.startDate||
         !/^20\d{2}-\d{2}-\d{2}$/.test(rule.startDate)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(rule.startTime||'')||
         !Array.isArray(rule.eventNames)||!rule.eventNames.length||rule.eventNames.length>16||
         !rule.eventNames.every(name=>typeof name==='string'&&name.trim().length>=8))return 'hold';
      const key=(value:unknown)=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
      exactHeldActivity=event.startDate===rule.startDate&&event.startTime===rule.startTime&&
        rule.eventNames.some(name=>key(name)===key(event.eventName||event.name));
    }
    if(root!==rule.sourceUniqueId||!rule.uniqueIds.includes(uid)&&!exactHeldActivity)continue;
    if(rule.action==='hold')return 'hold';
    if(rule.action==='fixed_occurrence'){
      const date=(v:unknown):v is string=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&DateTime.fromISO(v).toISODate()===v;
      const clock=(v:unknown):v is string=>typeof v==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
      if(!date(rule.startDate)||!date(rule.endDate)||rule.endDate<rule.startDate||!clock(rule.startTime)||
         typeof rule.endTime!=='string'||rule.endTime!==''&&!clock(rule.endTime))return 'hold';
      const flags=event.timeFlags as {start?:{source?:string};end?:{source?:string}}|undefined;
      const recurring=String(event.recurringPattern||'none').toLowerCase();
      // Reject obsolete source renderings instead of silently changing their
      // clocks or copying a separately reviewed date into the model response.
      if(event.startDate!==rule.startDate||event.endDate!==rule.endDate||event.startTime!==rule.startTime||
         String(event.endTime||'')!==rule.endTime||flags?.start?.source!=='explicit'||
         Boolean(rule.endTime)&&flags?.end?.source!=='explicit'||!['none',''].includes(recurring)||
         ['yes','true'].includes(String(event.isRecurring||'').toLowerCase()))return 'hold';
      continue;
    }
    if(typeof rule.untilDate!=='string'||DateTime.fromISO(rule.untilDate).toISODate()!==rule.untilDate||!rule.startTime||!rule.recurringPattern)return 'hold';
    // An older unbounded representation cannot lengthen or repaint the reviewed series.
    const end=String(event.recurrenceUntilDate||'');
    if(!end||DateTime.fromISO(end).toISODate()!==end||end>rule.untilDate||event.startTime!==rule.startTime||event.recurringPattern!==rule.recurringPattern||
      (event.endTime&&(event.timeFlags as {end?:{source?:string}}|undefined)?.end?.source!=='explicit'))return 'hold';
  }
  return 'none';
}
