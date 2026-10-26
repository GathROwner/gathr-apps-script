import type {EventData} from '../types/index.js';
import {KNOWN_LOCATION_RELATIONSHIPS} from '../parsing/locationMentionRoles.js';
import {isHighConfidenceSameOccurrenceDuplicate, isDuplicateEntry, normalizeVenueName} from '../utils/similarity.js';

const approvedSources = new Set(['approved_location_review', 'approved_existing_venue_review', 'approved_city_review_recovery']);
const recurring = (event: EventData): boolean => /^(?:yes|true|1)$/i.test(String(event.isRecurring || '')) ||
  Boolean(event.recurringPattern && !/^none$/i.test(event.recurringPattern)) || Number(event.totalOccurrences || 0) > 1;
const addressKey = (value: unknown) => normalizeVenueName(String(value || '')).replace(/ canada$/, '');
function specificTicketUrl(event: EventData): string {
  const known = ticketOccurrenceKey(event.ticketsBuyUrl || event.ticketLink);
  if (known) return known;
  try {
    const url = new URL(String(event.ticketsBuyUrl || event.ticketLink || ''));
    if (url.protocol !== 'https:' || !/^\/(?:shows|events|event|e)\/[^/]+/i.test(url.pathname)) return '';
    url.hash = '';
    return url.toString().replace(/\/$/, '').toLowerCase();
  } catch { return ''; }
}

/** Broader than the facility exception, but only for approved, exact one-offs. */
export function classifyApprovedVenueOccurrence(incoming: EventData, existing: EventData): 'match' | 'conflict' | 'none' {
  const metadata = existing as unknown as { source?: string; mapMode?: string };
  if (!approvedSources.has(metadata.source || '') || existing.locationReviewStatus !== 'approved' ||
      !incoming.venueId || existing.venueId !== incoming.venueId || recurring(incoming) || recurring(existing) ||
      ['area', 'route', 'province'].includes(String(existing.locationScope || '')) ||
      (metadata.mapMode && !['point','venue'].includes(metadata.mapMode))) return 'none';
  if (incoming.startDate !== existing.startDate || !/^\d{2}:\d{2}$/.test(incoming.startTime || '') ||
      incoming.startTime !== existing.startTime) return 'none';
  const a = addressKey(incoming.address), b = addressKey(existing.address);
  if (!a || !b || a !== b) return 'none';
  const roomA = normalizeVenueName(incoming.additionalLocation || incoming.subVenue || '');
  const roomB = normalizeVenueName(existing.additionalLocation || existing.subVenue || '');
  // Room A and Room B have high edit similarity but are different locations.
  if (roomA && roomB && roomA !== roomB) return 'none';
  if (!isDuplicateEntry(incoming, existing, { requireEstablishmentMatch: false, timeToleranceHours: 0 })) return 'none';
  if (incoming.endDate && existing.endDate && incoming.endDate !== existing.endDate) return 'conflict';
  const ticket = specificTicketUrl(incoming);
  if (incoming.endTime && existing.endTime && incoming.endTime !== existing.endTime &&
      !(ticket && ticket === specificTicketUrl(existing))) return 'conflict';
  return 'match';
}

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
  if (classifyApprovedVenueOccurrence(incoming, existing) === 'match') return true;
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
  const sourceRoot = (event: EventData) => {
    const root = String(event.uniqueId || '').split('_')[0];
    return /^\d{8,}$/.test(root) ? root : '';
  };
  return {
    sourceUniqueIds:Array.from(new Set([...(existing.sourceUniqueIds||[]),sourceRoot(existing),
      ...(incoming.sourceUniqueIds||[]),sourceRoot(incoming)].filter(Boolean))).slice(0,128),
    sourceUrls:Array.from(new Set([...(existing.sourceUrls||[]),String((existing as any).topLevelUrl||existing.facebookUrl||''),
      ...(incoming.sourceUrls||[]),String((incoming as any).topLevelUrl||incoming.facebookUrl||'')].filter(Boolean))).slice(0,128),
  };
}
