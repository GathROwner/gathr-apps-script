import {DateTime} from 'luxon';
import type {ExtractedItem} from './types.js';
import {logger} from '../utils/logger.js';

function eventTokens(text: string): Set<string> {
  const ignored = new Set(['the','and','with','live','november','october','september','doors','advance','show']);
  return new Set(text.toLowerCase().match(/[a-z]{3,}/g)?.filter(x=>!ignored.has(x)) || []);
}

/** Match the source-linked event itself, and convert an explicit instant using the event date's offset. */
export function parseLinkedPerformanceStart(html: string, url: string, item: ExtractedItem, timezone: string): ExtractedItem | undefined {
  const linkedId = /^https:\/\/locarius\.io\/events\/(\d+)\//.exec(url)?.[1];
  if (!linkedId) return undefined;
  const candidates: ExtractedItem[] = [];
  for (const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let values: any[];
    try { const raw = JSON.parse(m[1]); values = Array.isArray(raw) ? raw : raw['@graph'] || [raw]; } catch { continue; }
    for (const event of values) {
      if (event?.['@type'] !== 'Event' || event.eventStatus !== 'https://schema.org/EventScheduled' ||
          event.offers?.url !== url) continue;
      const itemWords = eventTokens(item.name), linkedWords = eventTokens(String(event.name || ''));
      const shared = [...itemWords].filter(x=>linkedWords.has(x)).length;
      if (shared < 2 || shared / Math.max(1,itemWords.size) < 0.8) continue;
      const raw = String(event.startDate || '');
      let instant: DateTime;
      if (/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) instant = DateTime.fromISO(raw,{setZone:true});
      else if (/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) [A-Za-z]{3} \d{2} \d{4} \d{2}:\d{2}:\d{2} GMT\+0000 \(Coordinated Universal Time\)$/.test(raw))
        instant = DateTime.fromJSDate(new Date(raw),{zone:'utc'});
      else continue;
      const local = instant.setZone(timezone);
      if (!local.isValid || local.toISODate() !== item.date) continue;
      const startTime = local.toFormat('HH:mm');
      const updated: ExtractedItem = {...item,startTime,
        timeFlags:{start:{source:'explicit',evidence:`Linked performance timestamp ${raw}; ${timezone} ${item.date} ${startTime}; ticket event ${linkedId}`},
          end:item.timeFlags?.end || {source:'none',toClose:false,evidence:''}}};
      if (updated._sourceTimeConstraint?.reason === 'doors_without_showtime') delete updated._sourceTimeConstraint;
      candidates.push(updated);
    }
  }
  return candidates.length === 1 ? candidates[0] : undefined;
}

/** No bootstrap, URL discovery, redirects, date overrides, price changes or image substitution. */
export async function enrichLinkedPerformanceStarts(items: ExtractedItem[], caption: string, timezone: string): Promise<ExtractedItem[]> {
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
    const resolved=html && parseLinkedPerformanceStart(html,url,item,timezone);
    if (resolved) logger.info('Resolved linked performance timestamp',{name:item.name,date:item.date,startTime:resolved.startTime,url});
    return resolved || item;
  });
}
