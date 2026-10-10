import { parseScheduleText } from './eventExtractor.js';
import { ExtractedItem } from './types.js';

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
    const parsed = parseScheduleText(`${header}\n${line}`, postedLocalDate, venue, 'schedule');
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
export function hasUnsupportedPostDateFallback(item: ExtractedItem, postedLocalDate: string): boolean {
  if (item.date !== postedLocalDate) return false;
  const evidence = `${item.extractionReason || ''} ${item.description || ''}`;
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
