import { parseScheduleText } from './eventExtractor.js';
import { ExtractedItem, TimeResolvedEvent } from './types.js';
import {DateTime} from 'luxon';
export const SEPARATE_STARTS_WITHOUT_END='separate printed starts; no advertised finish';

/** One printed source date is one occurrence unless the source states cadence.
 * A publisher masthead and a generic series title do not establish recurrence. */
export function reconcileDatedPosterOccurrences(events:TimeResolvedEvent[],source:string,postedDate:string):TimeResolvedEvent[] {
  const month='Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
  if(new RegExp(`\\b(?:${month})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\s*(?:[-–—]|to|through|until|thru|till)\\s*(?:(?:${month})\\.?\\s*)?\\d{1,2}\\b`,'i').test(source))return events;
  if(new RegExp(`\\b(?:${month})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\s*(?:,|and|&)\\s*\\d{1,2}\\b`,'i').test(source))return events;
  const cadence=source.replace(/\b[\p{L}]+['’]s\s+daily\b|\bdaily\s+[\p{L}]+['’]s\b/giu,' ');
  // Preserve explicit recurrence even when its frequency has no encoded interval.
  // A bounded phrase ending in a calendar unit avoids enumerating frequency words
  // and cannot reach across a sentence to the dated poster's separate header.
  const explicitCadence=/\b(?:every|each)\s+(?:[\p{L}\d-]+\s+){0,3}(?:days?|weeks?|weekends?|months?|years?|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/iu;
  if(explicitCadence.test(cadence)||/\b(?:daily|weekly|biweekly|fortnightly|monthly|recurring|repeats?|weekdays|weekends|mondays|tuesdays|wednesdays|thursdays|fridays|saturdays|sundays)\b/i.test(cadence))return events;
  const dates=new Set<string>();const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  for(const m of source.matchAll(new RegExp(`\\b(${month})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d{2}))?\\b`,'gi'))){const year=Number(m[3]||postedDate.slice(0,4)),date=DateTime.fromObject({year,month:months.indexOf(m[1].slice(0,3).toLowerCase())+1,day:Number(m[2])});if(date.isValid)dates.add(date.toISODate()!);}
  for(const m of source.matchAll(/\b20\d{2}-\d{2}-\d{2}\b/g))if(DateTime.fromISO(m[0]).isValid)dates.add(m[0]);
  if(dates.size!==1)return events;const date=[...dates][0];
  const separateStarts=/\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\s*(?:&|and)\s*\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)/i.test(source);
  return events.map(e=>{
    if(e.startDate!==date||e.endDate&&e.endDate!==date||Number(e.totalOccurrences)>1||Number(e.recurringWeekInterval)>1||e.recurrenceUntilDate&&e.recurrenceUntilDate>e.startDate)return e;
    const out={...e,isRecurring:'No',recurringPattern:'none'} as TimeResolvedEvent;
    for(const k of ['totalOccurrences','recurrenceUntilDate','recurringDaysOfWeek','recurringWeekdaySequence','recurringWeekInterval'])delete (out as any)[k];
    if(e.timeFlags&&separateStarts&&/next grouped start|grouped duration default/i.test(String(e.timeFlags.end?.evidence||''))){
      out.endTime='';out.endDate=date;out.timeFlags={...e.timeFlags,end:{source:'none',toClose:false,evidence:SEPARATE_STARTS_WITHOUT_END}};
      out.timeResolution={...e.timeResolution,hoursUsed:false};delete out.timeResolution.endFromHours;
    }
    return out;
  });
}

const poolLine = /^(lane\s+swim|(?:leisure|toddler|all)\s+pools?\s+open|waterslide\s+open|splash\s+pad\s+open)\b/i;
const dateHeader = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2}(?:st|nd|rd|th)?\b|\b\d{4}-\d{2}-\d{2}\b/i;
const clock = /^\d{2}:\d{2}$/;

/** Restore only explicitly dated caption windows, never venue hours or OCR guesses. */
export function reconcilePublicPoolWindows(
  items: ExtractedItem[], caption: string, postedLocalDate: string, venue: string
): ExtractedItem[] {
  const windows: ExtractedItem[] = [];
  let header = '';
  const source = String(caption || '').split(/\n\s*OCR TEXT:/i)[0];
  for (const line of source.split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
    if (dateHeader.test(line)) header = line;
    else if (/^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*:?(?:\s+schedule)?$/i.test(line)) header = '';
    const label = line.match(poolLine)?.[1];
    if (!header || !label || /\b(?:closed|private|staff|maintenance|lessons?)\b/i.test(line)) continue;
    // Both complete meridiem-qualified endpoints are printed in the same
    // dated public-access line. A missing dash must not silently erase a slot.
    // Do not infer a meridiem or apply this to general prose/calendar cells.
    const rangeLine = line.replace(/(\b\d{1,2}(?::\d{2})?\s*[ap]m)\s+(?=\d{1,2}(?::\d{2})?\s*[ap]m\b)/gi, '$1 - ');
    const parsed = parseScheduleText(`${header}\n${rangeLine}`, postedLocalDate, venue, 'schedule');
    for (const item of parsed) {
      if (!poolLine.test(item.name) || !clock.test(item.startTime || '') || !clock.test(item.endTime || '') ||
          item.timeFlags?.start?.source !== 'explicit' || item.timeFlags?.end?.source !== 'explicit') continue;
      const candidate = { ...item, name: label, description: line, relevantImageIndex: -1,
        recurringPattern: 'none' as const, extractionReason: 'schedule_text_public_access' };
      if (!windows.some(existing => existing.name.toLowerCase() === label.toLowerCase() &&
          existing.date === item.date && existing.startTime === item.startTime && existing.endTime === item.endTime)) {
        windows.push(candidate);
      }
    }
  }
  if (!windows.length) return items;
  // Replace a named pool/day as a group: adding missing ranges creates no twins.
  const remaining = items.filter(item => {
    const label = String(item.name || '').match(poolLine)?.[1]?.toLowerCase();
    return !label || !windows.some(window => window.name.toLowerCase() === label && window.date === item.date);
  });
  return [...remaining, ...windows];
}

/** A model's own admission of an unanchored post-date fallback is not date evidence. */
export function hasUnsupportedPostDateFallback(item: ExtractedItem, postedLocalDate: string, caption = ''): boolean {
  const evidence = `${item.extractionReason || ''} ${item.description || ''}`;
  const source = caption.split(/\n\s*OCR TEXT:/i)[0];
  const unknownLaunch = /\b(?:not\s+sure\s+when\s+(?:day\s*1|we\s+(?:open|start))|(?:opening|start|launch)\s+date\s+(?:is\s+)?(?:unknown|undecided|tba|not\s+(?:set|confirmed)))\b/i.test(source);
  // Generated present-tense prose, omitted uncertainty, or an invented future
  // date cannot override the original caption's explicitly unknown launch.
  // A separate caption line can independently advertise a distinct dated item;
  // only that raw item/date evidence permits an exception.
  if (unknownLaunch) {
    const words = (text: string): string[] => text.toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').match(/[a-z]{3,}/g) || [];
    const generic = new Set(['the','and','our','for','with','from','daily','special','offer','offers','event','open','today','tonight','dinner','meal']);
    const identity = words(item.name || '').filter(word => !generic.has(word));
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(item.date || '');
    const months = ['Jan(?:uary)?','Feb(?:ruary)?','Mar(?:ch)?','Apr(?:il)?','May','Jun(?:e)?','Jul(?:y)?','Aug(?:ust)?','Sep(?:t(?:ember)?)?','Oct(?:ober)?','Nov(?:ember)?','Dec(?:ember)?'];
    const printedDate = match && new RegExp(`\\b${months[Number(match[2])-1]}\\.?\\s+${Number(match[3])}(?:st|nd|rd|th)?\\b`, 'i');
    const independentlyDated = identity.length > 0 && source.split(/\r?\n/).some(line => {
      if (/\b(?:will|soon|planned|off[- ]season|not\s+sure|(?:opening|start|launch)\s+date)\b/i.test(line)) return false;
      const rawWords = new Set(words(line));
      if (!identity.every(word => rawWords.has(word))) return false;
      if (item.date === postedLocalDate && /\b(?:today|tonight)\b/i.test(line)) return true;
      if (!match || [...line.matchAll(/\b20\d{2}\b/g)].some(value => value[0] !== match[1])) return false;
      return line.includes(item.date) || Boolean(printedDate?.test(line));
    });
    if (!independentlyDated) return true;
  }
  if (item.date !== postedLocalDate) return false;
  // A teaser with no availability date cannot inherit today's date merely
  // because it mentions a special. Scope this to this item's own evidence.
  if (/\b(?:later this (?:month|week)|coming soon|exact (?:availability )?date.{0,25}not specified)\b/i.test(evidence) &&
      /\b(?:upcoming|will|coming|later|not specified)\b/i.test(evidence)) return true;
  if (item._sourceType === 'special' || ('type' in item && item.type === 'special')) return false;
  return /\bpost(?:ed|ing)? date\b.{0,55}\b(?:fallback|used|use)\b|\b(?:used|using)\b.{0,35}\bpost(?:ed|ing)? date\b.{0,40}\bfallback\b/i.test(evidence);
}

export function isSourcePublicPoolWindow(item: ExtractedItem): boolean {
  return item.extractionReason === 'schedule_text_public_access' && poolLine.test(item.name) &&
    /^\d{4}-\d{2}-\d{2}$/.test(item.date || '') && clock.test(item.startTime || '') && clock.test(item.endTime || '') &&
    item.timeFlags?.start?.source === 'explicit' && item.timeFlags?.end?.source === 'explicit';
}
