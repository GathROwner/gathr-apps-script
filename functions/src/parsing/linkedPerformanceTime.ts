import {DateTime} from 'luxon';
import type {ExtractedItem} from './types.js';
import {logger} from '../utils/logger.js';

function eventTokens(text: string): Set<string> {
  const ignored = new Set(['the','and','with','live','at','in','of','on','to','am','pm','st','nd','rd','th',
    'january','february','march','april','may','june','july','august','september','october','november','december',
    'doors','advance','show']);
  return new Set(text.toLowerCase().match(/[a-z]{2,}/g)?.filter(x=>!ignored.has(x)) || []);
}

export interface LinkedPerformanceSource {
  caption: string;
  venueName: string;
  imagesTextFree: boolean;
}

/** Unknown or text-bearing galleries cannot authorize a caption-only year correction. */
export function linkedPerformanceImagesTextFree(imageCount: number, analyses: unknown[]): boolean {
  if (imageCount === 0) return true;
  if (!Array.isArray(analyses) || analyses.length !== imageCount) return false;
  return Array.from({length:imageCount},(_,i)=>i).every(index=>{
    const matching=analyses.filter((a:any)=>a?.imageIndex===index) as any[];
    const a=matching.length===1 ? matching[0] : undefined,c=a?.imageComplexity;
    return c?.isPromotionalPhoto===true && c.textDensityScore===0 &&
      !c.hasCalendarGrid && !c.hasDenseText && !c.hasMultipleEventListings &&
      /no\s+(?:readable|visible|meaningful)\s+text/i.test(String(a?.description||''));
  });
}

const identity=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
function canVerifyUrlYear(item: ExtractedItem, url: string, date: string, event: any, source?: LinkedPerformanceSource): boolean {
  if (!source?.imagesTextFree || !source.caption.includes(url) || !/^\d{4}-\d{2}-\d{2}$/.test(item.date||'') ||
      date.slice(5)!==item.date.slice(5) || item._sourceType==='calendar' || item._sourceType==='schedule') return false;
  const prose=source.caption.replace(/https?:\/\/\S+/gi,'');
  if (/\b20\d{2}\b/.test(prose)) return false;
  const priceLikeYear=new URL(url).pathname.match(/-(\d{2})-doors?(?:-|$)/i)?.[1];
  if (!priceLikeYear || item.date.slice(0,4)!=='20'+priceLikeYear ||
      !/\b(?:url|slug|link)\b/i.test(`${item.description} ${item.extractionReason}`) ||
      !/\b(?:year|date\s+marker)\b/i.test(`${item.description} ${item.extractionReason}`)) return false;
  const month=['january','february','march','april','may','june','july','august','september','october','november','december'][+date.slice(5,7)-1];
  if (!new RegExp(`\\b${month}\\s+${+date.slice(8)}(?:st|nd|rd|th)?\\b`,'i').test(prose)) return false;
  const linkedVenue=String(event.location?.name||'');
  if (!source.venueName || identity(source.venueName)!==identity(linkedVenue) ||
      item.venue && identity(item.venue)!==identity(linkedVenue)) return false;
  if (item.spatial && item.spatial.kind!=='single_location') return false;
  const venueWord=source.venueName.toLowerCase().match(/[a-z]{4,}/g)?.find(x=>!['the','music','hall','centre','center'].includes(x));
  if (!venueWord || !new RegExp(`\\b${venueWord}\\b`,'i').test(prose)) return false;
  const places=item.spatial?.locations;
  if (places!==undefined && !Array.isArray(places)) return false;
  return (places || []).every((p:any)=>p.certainty==='confirmed' && new RegExp(`\\b${venueWord}\\b`,'i').test(p.label));
}

/** Match the source-linked event itself, and convert an explicit instant using the event date's offset. */
export function parseLinkedPerformanceStart(html: string, url: string, item: ExtractedItem, timezone: string, source?: LinkedPerformanceSource): ExtractedItem | undefined {
  const linkedId = /^https:\/\/locarius\.io\/events\/(\d+)\//.exec(url)?.[1];
  if (!linkedId) return undefined;
  const candidates: ExtractedItem[] = [];
  for (const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let values: any[];
    try { const raw = JSON.parse(m[1]); values = Array.isArray(raw) ? raw : raw['@graph'] || [raw]; } catch { continue; }
    for (const event of values) {
      if (event?.['@type'] !== 'Event' || event.eventStatus !== 'https://schema.org/EventScheduled' ||
          event.offers?.url !== url) continue;
      const headline=item.name.replace(/\s+live\s+at\s+(?:the\s+)?(.+)$/i,(whole,place:string)=>
        source?.venueName && identity(place).length>=4 && identity(source.venueName).startsWith(identity(place)) ? '' : whole);
      const itemWords = eventTokens(headline), linkedWords = eventTokens(String(event.name || ''));
      const shared = [...itemWords].filter(x=>linkedWords.has(x)).length;
      if (shared < 2 || shared / Math.max(1,itemWords.size) < 0.8) continue;
      const raw = String(event.startDate || '');
      let instant: DateTime;
      if (/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) instant = DateTime.fromISO(raw,{setZone:true});
      else if (/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) [A-Za-z]{3} \d{2} \d{4} \d{2}:\d{2}:\d{2} GMT\+0000 \(Coordinated Universal Time\)$/.test(raw))
        instant = DateTime.fromJSDate(new Date(raw),{zone:'utc'});
      else continue;
      const local = instant.setZone(timezone);
      if (!local.isValid) continue;
      const date=local.toISODate()!;
      const correctedYear=date!==item.date && canVerifyUrlYear(item,url,date,event,source);
      if (date!==item.date && !correctedYear) continue;
      const startTime = local.toFormat('HH:mm');
      const updated: ExtractedItem = {...item,date,startTime,
        timeFlags:{start:{source:'explicit',evidence:`Linked performance timestamp ${raw}; ${timezone} ${date} ${startTime}; ticket event ${linkedId}`},
          end:item.timeFlags?.end || {source:'none',toClose:false,evidence:''}}};
      if (correctedYear) {
        updated.description=source!.caption.replace(/https?:\/\/\S+/gi,'').trim();
        updated.extractionReason=`Exact linked scheduled performance verifies ${date}; bare URL token did not substantiate prior ${item.date}`;
      }
      const doors=String(event.name||'').match(/\bdoors?\s*(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?\b/i);
      if (doors && +doors[1]>=1 && +doors[1]<=12 && +(doors[2]||0)<60) {
        const doorText=`Doors open at ${+doors[1]}:${doors[2]||'00'} ${doors[3].toLowerCase()}.m.`;
        updated.description=`${doorText} ${updated.description||''}`.trim();
      }
      if (updated._sourceTimeConstraint?.reason === 'doors_without_showtime') delete updated._sourceTimeConstraint;
      candidates.push(updated);
    }
  }
  return candidates.length === 1 ? candidates[0] : undefined;
}

/** No bootstrap, URL discovery, redirects, price changes or image substitution. */
export async function enrichLinkedPerformanceStarts(items: ExtractedItem[], caption: string, timezone: string, source?: LinkedPerformanceSource): Promise<ExtractedItem[]> {
  const urls = [...new Set(items.filter(item=>item._sourceTimeConstraint?.reason === 'doors_without_showtime')
    .map(item=>item.ticketLink || '').filter(url=>/^https:\/\/locarius\.io\/events\/\d+\/[^\s]+$/.test(url) && caption.includes(url)))].slice(0,4);
  const pages = new Map<string,string>();
  for (let offset=0;offset<urls.length;offset+=2) {
    await Promise.all(urls.slice(offset,offset+2).map(async url=>{
      try {
        const response = await fetch(url,{redirect:'error',signal:AbortSignal.timeout(4000)});
        if (!response.ok || !response.body || !/text\/html/i.test(response.headers.get('content-type') || '')) return;
        const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size=0;
        while (true) { const part=await reader.read(); if(part.done)break;
          size+=part.value.byteLength; if(size>262144){await reader.cancel();return;} chunks.push(part.value); }
        pages.set(url,Buffer.concat(chunks).toString('utf8'));
      } catch { logger.warn('Linked performance timestamp unavailable; retaining source-time hold',{url}); }
    }));
  }
  return items.map(item=>{
    if (item._sourceTimeConstraint?.reason !== 'doors_without_showtime') return item;
    const url=item.ticketLink || '',html=pages.get(url);
    const resolved=html && parseLinkedPerformanceStart(html,url,item,timezone,source);
    if (resolved) logger.info('Resolved linked performance timestamp',{name:item.name,date:resolved.date,priorDate:item.date,startTime:resolved.startTime,url});
    return resolved || item;
  });
}
