/** Evidence for correcting an internally contradictory calendar record, not for
 * identifying two different showings by proximity or shared source root. */
export type CalendarTimingEvent = {description?: string; eventName?: string; name?: string; venueId?: string | null; startDate?: string; startTime?: string; isRecurring?: unknown; recurringPattern?: string; _sourceType?: string; timeFlags?: unknown; timeResolution?: unknown};
const title = (e: CalendarTimingEvent) => String(e.eventName || e.name || '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function clock(s: string): string {
  const m=s.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if(!m || +m[1]<1 || +m[1]>12 || +m[2]>59)return '';
  return String(+m[1]%12+(m[3].toUpperCase()==='PM'?12:0)).padStart(2,'0')+':'+m[2];
}
const oneOff = (e: CalendarTimingEvent) => (e.isRecurring === 'No' || e.isRecurring === false) && e.recurringPattern === 'none';
export function getBoundCalendarTileStart(e: CalendarTimingEvent): string {
  if(e._sourceType!=='calendar'||!oneOff(e)||!/^\d{4}-\d{2}-\d{2}$/.test(e.startDate||''))return '';
  const m=String(e.description||'').trim().match(/^Tile header shows "([A-Za-z]+)\s*(\d{1,2})(?:st|nd|rd|th)?\s*\((\d{1,2}:\d{2}\s*[AP]M)\)" above "([^"\n]+)"\.?$/i);
  if(!m)return '';
  const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  if(months.indexOf(m[1].slice(0,3).toLowerCase())+1!==Number(e.startDate!.slice(5,7))||+m[2]!==Number(e.startDate!.slice(8,10))||title({name:m[4]})!==title(e))return '';
  return clock(m[3]);
}
export function corroboratedCalendarStart(existing: CalendarTimingEvent,incoming?: CalendarTimingEvent): string {
  if((incoming?.timeResolution as any)?.startFromHours === true || (incoming?.timeResolution as any)?.startFromPostTime === true)return '';
  if(!incoming||!oneOff(incoming)||!existing.venueId||existing.venueId!==incoming.venueId||existing.startDate!==incoming.startDate||!title(existing)||title(existing)!==title(incoming))return '';
  const bound=getBoundCalendarTileStart(existing),oldFlag=(existing.timeFlags as any)?.start,newFlag=(incoming.timeFlags as any)?.start;
  if(!bound||bound===existing.startTime||newFlag?.source!=='explicit'||clock(String(newFlag.evidence||''))!==bound||incoming.startTime!==bound)return '';
  if(oldFlag?.source==='explicit'&&clock(String(oldFlag.evidence||''))!==bound)return '';
  return bound;
}
