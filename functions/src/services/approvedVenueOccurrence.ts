import type {EventData} from '../types/index.js';
import {KNOWN_LOCATION_RELATIONSHIPS} from '../parsing/locationMentionRoles.js';
import {isHighConfidenceSameOccurrenceDuplicate} from '../utils/similarity.js';

/** Generic homepages and ticket-series listings cannot establish identity. */
export function ticketOccurrenceKey(value:unknown):string {
  try{
    const url=new URL(String(value||''));if(url.protocol!=='https:')return '';
    if(url.hostname==='purchase.eastlinkcentrepei.com' && /^\/EventAvailability\/?$/i.test(url.pathname)){
      const ids=Array.from(url.searchParams).filter(([k])=>k.toLowerCase()==='eventid').map(([,v])=>v);
      return ids.length===1 && /^\d+$/.test(ids[0]) ? 'eastlink:'+ids[0] : '';
    }
    if(url.hostname==='locarius.io'){
      const id=url.pathname.match(/^\/events\/(\d+)(?:\/|$)/)?.[1];return id?'locarius:'+id:'';
    }
  }catch{/* Unknown/malformed ticket URL cannot establish identity. */}
  return '';
}

export function isApprovedVenueOccurrenceMatch(incoming:EventData,existing:EventData):boolean {
  const relation=KNOWN_LOCATION_RELATIONSHIPS.find(x=>x.venueId===incoming.venueId);
  const record=existing as EventData & {source?:string};
  if(!relation || existing.venueId!==incoming.venueId || record.source!=='approved_location_review' || existing.locationReviewStatus!=='approved')return false;
  if(existing.startDate!==incoming.startDate || !incoming.startTime || existing.startTime!==incoming.startTime)return false;
  const key=ticketOccurrenceKey(incoming.ticketsBuyUrl||incoming.ticketLink);
  if(!key || key!==ticketOccurrenceKey(existing.ticketsBuyUrl||existing.ticketLink))return false;
  // The relationship never makes two distinct event rooms equivalent. Context
  // wording has already been moved out of additionalLocation by role resolution.
  const canonical=(e:EventData)=>({...e,establishment:relation.venue,
    additionalLocation:e.additionalLocation && ![relation.venue,...relation.contextAliases].includes(e.additionalLocation as any)?e.additionalLocation:relation.venue});
  return isHighConfidenceSameOccurrenceDuplicate(canonical(incoming),canonical(existing));
}

export function approvedVenueOccurrenceSourcePatch(existing:EventData,incoming:EventData):Pick<EventData,'sourceUniqueIds'|'sourceUrls'> {
  return {
    sourceUniqueIds:Array.from(new Set([...(existing.sourceUniqueIds||[]),String(existing.uniqueId||'').split('_')[0],
      ...(incoming.sourceUniqueIds||[]),String(incoming.uniqueId||'').split('_')[0]].filter(Boolean))).slice(0,128),
    sourceUrls:Array.from(new Set([...(existing.sourceUrls||[]),String((existing as any).topLevelUrl||existing.facebookUrl||''),...(incoming.sourceUrls||[])].filter(Boolean))).slice(0,128),
  };
}
