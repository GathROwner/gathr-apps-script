import type {EventData} from '../types/index.js';

/** A stable product, amount and serving slot can bind a daily offer despite
 * cosmetic Happy Hour wording. Ambiguous bundles and changed sizes/prices do
 * not match. This is deliberately narrower than general title similarity. */
export function samePricedDailyOffer(a: Partial<EventData>,b: Partial<EventData>): boolean {
 if (a.recurringPattern!=='daily' || b.recurringPattern!=='daily' || a.category!=='Happy Hour' || b.category!=='Happy Hour' ||
     !a.startTime || a.startTime!==b.startTime || !a.venueId || a.venueId!==b.venueId) return false;
 const key=(e:Partial<EventData>):string=>{
  const title=String(e.eventName || e.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const text=[title,e.description,e.price,e.ticketPrice].filter(Boolean).join(' ');
  const prices=[...new Set([...text.matchAll(/\$\s*(\d+(?:\.\d{1,2})?)/g)].map(m=>Number(m[1])))];
  if(prices.length!==1)return '';
  const size=[...new Set([...text.matchAll(/\b(\d+(?:\.\d+)?)\s*(oz|ml)\b/gi)].map(m=>`${Number(m[1])}${m[2].toLowerCase()}`))];
  if(size.length>1)return '';
  if(/\boysters?\b/.test(title)){
   const count=[...new Set([...text.matchAll(/\b(\d+)\s+oysters?\b/gi)].map(m=>Number(m[1])))];
   return count.length===1?`oyster:${count[0]}:${prices[0]}`:'';
  }
  const kind=/\bbeer\b/.test(title)?'beer':/\b(?:wine|rose|nova)\b/.test(title)?'wine':'';
  if(!kind || !size.length)return '';
  const brand=title.replace(/\$\s*\d+(?:\.\d+)?|\b\d+(?:\.\d+)?\s*(?:oz|ml)\b|\d+/g,' ')
   .replace(/\b(?:happy|hour|beer|wine|nova|rose|nv|or|and|for|the|only)\b/g,' ').replace(/[^a-z]+/g,' ').trim().split(/\s+/).filter(Boolean).sort();
  if(brand.length<(kind==='wine'?2:1))return '';
  return `${kind}:${brand.join(' ')}:${size[0]}:${prices[0]}`;
 };
 const identity=key(a);return Boolean(identity && identity===key(b));
}
