import type { ExtractedItem } from './types.js';

export interface PrintedScheduleAnchor { date: string; clock: string; group: string }

/** Use only the embedded public image reference on Facebook shared thumbnails. */
export function sharedScheduleSource(url: string): string | null {
  try {
    const source = new URL(url);
    if (!source.hostname.endsWith('.fbcdn.net') || !source.pathname.includes('/emg')) return null;
    const original = new URL(source.searchParams.get('url') || '');
    return original.protocol === 'https:' && original.hostname.endsWith('.googleusercontent.com')
      ? original.href : source.href;
  } catch { return null; }
}

export function printedScheduleAnchors(raw: string, year: number): PrintedScheduleAnchor[] {
  let text = raw;
  try { const parsed = JSON.parse(raw); text = parsed.images.map((x: {text: string}) => x.text).join('\n'); }
  catch { /* Plain transcription is also accepted; model prose is not date evidence. */ }
  const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  let group = '';
  const anchors: PrintedScheduleAnchor[] = [];
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^\s*(U\s*\d{1,2})\b/i);
    if (heading) group = heading[1].replace(/\s/g, '').toUpperCase();
    if (/\bdeadline|register\s+by|sign[- ]?up\s+by\b/i.test(line)) continue;
    const match = line.match(/\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\s*[-–—:]\s*(\d{1,2}:\d{2}(?:\s*[ap]\.?\s*m\.?)?)\b/i);
    if (!match) continue;
    const month = months.findIndex(x => x === match[1].toLowerCase() || x.slice(0,3) === match[1].toLowerCase().replace(/\.$/, '')) + 1;
    const y = Number(match[3] || year), day = Number(match[2]);
    if (!month || new Date(Date.UTC(y, month-1, day)).getUTCDate() !== day) continue;
    anchors.push({date:`${y}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`, clock:match[4].trim(), group});
  }
  return anchors;
}

/** Cross-check, never move a printed date forward or guess its meridiem. */
export function checkPrintedScheduleItem(item: ExtractedItem, anchors: PrintedScheduleAnchor[]): string | null {
  const group = item.name.match(/\bU\s*\d{1,2}\b/i)?.[0].replace(/\s/g,'').toUpperCase();
  const relevant = anchors.filter(x => !group || x.group === group);
  if (!relevant.length) return 'printed_schedule_unverified';
  const dated = relevant.filter(x => x.date === item.date);
  if (!dated.length) return 'printed_schedule_date_conflict';
  const candidates = dated.filter(x => /[ap]\.?\s*m\.?$/i.test(x.clock) || Number(x.clock.split(':')[0]) > 12 || /^0[0-9]:/.test(x.clock));
  if (!candidates.length) return 'printed_schedule_meridiem_unresolved';
  const normalized = (clock: string): string => {
    const m = clock.match(/^(\d{1,2}):(\d{2})(?:\s*([ap])\.?\s*m\.?)?$/i);
    if (!m) return '';
    const hour = m[3] ? Number(m[1])%12+(m[3].toLowerCase()==='p'?12:0) : Number(m[1]);
    return `${String(hour).padStart(2,'0')}:${m[2]}`;
  };
  return candidates.some(x => normalized(x.clock) === normalized(String(item.startTime || '')))
    ? null : 'printed_schedule_clock_conflict';
}
