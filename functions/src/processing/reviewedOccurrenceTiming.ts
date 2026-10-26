import type {EventData} from '../types/index.js';import {DateTime} from 'luxon';
export interface ReviewedOccurrenceTiming {version:1;reviewId:string;venueId:string;startDate:string;endDate:string;startTime:string;endTime:string;sourceUrls:string[];}
/** The duplicate selector has already chosen this exact keeper. A later source
 * cannot move its manually verified occurrence or restore a fabricated finish. */
export function contradictsReviewedOccurrenceTiming(existing:EventData,incoming:EventData):boolean{
 const p=(existing as EventData&{reviewedOccurrenceTiming?:ReviewedOccurrenceTiming}).reviewedOccurrenceTiming;
 if(p===undefined)return false;
 const date=(v:unknown)=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&DateTime.fromISO(v).toISODate()===v;
 const clock=(v:unknown)=>typeof v==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
 if(!p||p.version!==1||!p.reviewId||p.venueId!==existing.venueId||!date(p.startDate)||!date(p.endDate)||p.endDate<p.startDate||
    !clock(p.startTime)||typeof p.endTime!=='string'||p.endTime!==''&&!clock(p.endTime)||
    !Array.isArray(p.sourceUrls)||!p.sourceUrls.length||!p.sourceUrls.every(url=>{try{return new URL(url).protocol==='https:';}catch{return false;}}))return true;
 for(const field of ['startDate','endDate','startTime','endTime'] as const){
  if(String(existing[field]||'')!==p[field])return true;
  if(incoming[field]!==undefined&&String(incoming[field]||'')!==p[field])return true;
 }
 return incoming.venueId!==undefined&&incoming.venueId!==p.venueId;
}
