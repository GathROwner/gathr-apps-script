import type {EventData} from '../types/index.js';
import {DateTime} from 'luxon';

/** Reviewed source-specific limits, never a title match or source-wide ban. */
export interface ReviewedOccurrenceConstraint {
  sourceUniqueId:string; uniqueIds:string[]; reviewId:string; sourceUrls:string[];
  action:'hold'|'season_bound'; untilDate?:string; startTime?:string; recurringPattern?:string;
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
      !['hold','season_bound'].includes(rule.action))return 'hold';
    if(root!==rule.sourceUniqueId||!rule.uniqueIds.includes(uid))continue;
    if(rule.action==='hold')return 'hold';
    if(typeof rule.untilDate!=='string'||DateTime.fromISO(rule.untilDate).toISODate()!==rule.untilDate||!rule.startTime||!rule.recurringPattern)return 'hold';
    // An older unbounded representation cannot lengthen or repaint the reviewed series.
    const end=String(event.recurrenceUntilDate||'');
    if(!end||DateTime.fromISO(end).toISODate()!==end||end>rule.untilDate||event.startTime!==rule.startTime||event.recurringPattern!==rule.recurringPattern||
      (event.endTime&&(event.timeFlags as {end?:{source?:string}}|undefined)?.end?.source!=='explicit'))return 'hold';
  }
  return 'none';
}
