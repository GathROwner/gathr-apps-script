import type {ExtractedItem, FormattedEvent, RecurringPattern} from './types.js';
import {bindProgrammeMonth,restoreExplainedOccurrenceDate,earlierProgrammeCutoff,restoreMonthlyProgrammeWeekday,hasOnlyDescriptiveSkillRecurrence} from './programmeSourceGuards.js';

const key = (value: unknown) => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const captionOnly = (text: string) => text.split(/(?:^|\n)\s*OCR TEXT:/i)[0];
const weekdays = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const cadence = /\b(?:daily|every\s+day|each\s+day|weekly|(?:every|each)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)s)\b/i;

/** A dated stop has its own location even when the parent caption lists a tour. */
export function datedOccurrenceLocation(input: {
  date?: unknown; location?: unknown; name?: unknown; description?: unknown; combinedText?: unknown;
  modelSpatialEvidence?: {kind?: unknown; locations?: unknown} | null;
}): string | null {
  const date = String(input.date || '');
  const location = String(input.location || '').trim();
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(date) || !location ||
      /\b(?:route|parade|procession|marathon|race|walkathon|bike\s+ride)\b/i.test(String(input.name || '')) ||
      input.modelSpatialEvidence?.kind === 'route') return null;
  const locations = input.modelSpatialEvidence?.locations;
  if (Array.isArray(locations) && locations.some(x => x && typeof x === 'object' &&
      ['start','finish','stop'].includes(String(x.role || '')))) return null;
  const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const lines = captionOnly(String(input.combinedText || '')).split(/[\n;]+/).map(line => line.replace(/^\s*[•*–—-]\s*/, ''))
    .filter(line => /^\s*(?:(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+)?(?:20\d{2}-\d{2}-\d{2}|(?:jan\w*|feb\w*|mar\w*|apr\w*|may|jun\w*|jul\w*|aug\w*|sep\w*|oct\w*|nov\w*|dec\w*)\.?\s+\d{1,2})\b/i.test(line))
    .map(line => {
    const iso = line.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    const named = line.match(/\b(jan\w*|feb\w*|mar\w*|apr\w*|may|jun\w*|jul\w*|aug\w*|sep\w*|oct\w*|nov\w*|dec\w*)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
    return {line, date: iso?.[0] || (named ? `${date.slice(0,4)}-${String(monthNames.indexOf(named[1].slice(0,3).toLowerCase())+1).padStart(2,'0')}-${named[2].padStart(2,'0')}` : '')};
  }).filter(x => x.date);
  // Single-date global headings and two simultaneous sites do not establish a split stop.
  if (new Set(lines.map(x => x.date)).size < 2) return null;
  const matching = lines.filter(x => x.date === date);
  if (matching.length !== 1) return null;
  const matchingLine = key(matching[0].line);
  if (/\b(?:at both|multiple locations|multiple venues|two locations|two venues|simultaneously)\b/.test(matchingLine)) return null;
  if (input.modelSpatialEvidence?.kind === 'multi_location' && Array.isArray(locations)) {
    const sameDatePlaces = locations.map(x => key(typeof x === 'string' ? x : x?.label))
      .filter(label => label.split(' ').length >= 2 && matchingLine.includes(label));
    if (new Set(sameDatePlaces).size > 1) return null;
  }
  const words = key(location).split(' ').filter(x => !['the','and','in','at','of'].includes(x));
  if (words.length < 2 || /\b(?:locations?|island wide|pei|province wide)\b/i.test(location)) return null;
  const lineWords = new Set(key(matching[0].line).split(' '));
  return words.every(x => lineWords.has(x)) ? matching[0].line.trim() : null;
}

/** Remove only a clearly separate alternative depot sentence, never own cadence. */
export function recurrenceOwnershipText(item: {name?: unknown; description?: unknown; venue?: unknown}): {
  text: string; hasSeparateAlternative: boolean;
} {
  const venueWords = key(item.venue).split(' ').filter(x => x.length > 2);
  const sentences = String(item.description || '').split(/(?<=[.!?])\s+|\n+/);
  let hasSeparateAlternative = false;
  const owned = sentences.filter(sentence => {
    if (!venueWords.length || !/\b(?:an?\s+alternative|another|separate|other)\b/i.test(sentence) ||
        !/\b(?:depot|drop[ -]?off|collection\s+(?:spot|site|point))\b/i.test(sentence) ||
        !cadence.test(sentence) || !/\b(?:at|in)\s+(?:the\s+)?[A-Z]/.test(sentence)) return true;
    const words = new Set(key(sentence).split(' '));
    if (venueWords.every(x => words.has(x))) return true;
    hasSeparateAlternative = true;
    return false;
  });
  return {text: `${item.name || ''} ${owned.join(' ')}`, hasSeparateAlternative};
}

export function hasOnlyAlternativeRecurrence(item: {name?: unknown; description?: unknown; venue?: unknown; date?: unknown}): boolean {
  const owned = recurrenceOwnershipText(item);
  return /^20\d{2}-\d{2}-\d{2}$/.test(String(item.date || '')) && owned.hasSeparateAlternative && !cadence.test(owned.text);
}

/** A labelled plural weekday in a starting programme is affirmative weekly intent. */
export function explicitStartingProgramPattern(item: {name?: unknown; description?: unknown; date?: unknown}, caption: string): RecurringPattern | null {
  const text = String(item.description || '');
  const name = String(item.name || '').trim();
  if (!name || !key(captionOnly(caption)).includes(key(name)) || !/\bprogram(?:me)?\b/i.test(name) ||
      !/\bstarting\s+(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(text) ||
      /\b(?:cancelled|canceled|not|formerly|previously|one[ -]off|one[ -]time)\b/i.test(text)) return null;
  const labels = [...text.matchAll(/\bDay\s*:\s*(Mondays|Tuesdays|Wednesdays|Thursdays|Fridays|Saturdays|Sundays)\b/gi)];
  if (labels.length !== 1 || !/^20\d{2}-\d{2}-\d{2}$/.test(String(item.date || ''))) return null;
  const day = labels[0][1].toLowerCase().slice(0,-1);
  const source = captionOnly(caption);
  const sourceLabels = [...source.matchAll(/\bDay\s*:\s*(Mondays|Tuesdays|Wednesdays|Thursdays|Fridays|Saturdays|Sundays)\b/gi)];
  if (sourceLabels.length !== 1 || sourceLabels[0][1].toLowerCase() !== `${day}s` ||
      !new RegExp(`\\bstarting\\s+(?:on\\s+)?${day}\\b`, 'i').test(source) ||
      !new RegExp(`\\bstarting\\s+(?:on\\s+)?${day}\\b`, 'i').test(text)) return null;
  if (new Date(`${item.date}T12:00:00Z`).getUTCDay() !== weekdays.indexOf(day)) return null;
  return `weekly_${day}` as RecurringPattern;
}

/** Collection partner identity is not proof of the attendee-facing event's venue. */
export function hasExplicitVenueAbsence(item: {venue?: unknown; spatial?: {kind?: unknown; locations?: unknown; evidenceNotes?: unknown}}): boolean {
  const spatial = item.spatial;
  const notes = String(spatial?.evidenceNotes || '');
  return !String(item.venue || '').trim() && spatial?.kind === 'unknown' &&
    Array.isArray(spatial.locations) && spatial.locations.length === 0 &&
    /\b(?:does not|doesn't|not)\s+(?:state|specify|identify|give)|\b(?:unspecified|unstated|unknown)\b/i.test(notes) &&
    /\b(?:event\s+venue|distribution\s+(?:venue|location))\b/i.test(notes) &&
    /\bcollection\s+(?:spots?|partners?|points?|sites?)\b/i.test(notes);
}

/** Compare conflicting advertised starts without guessing AM/PM or caption priority.
 * Only a single named item and a literal starting range qualify. Doors are separate. */
export function materialCaptionClockConflict(item: {
  name?: unknown; startTime?: unknown; timeFlags?: {start?: {source?: unknown; evidence?: unknown}};
}, caption: string, itemCount: number): boolean {
  if (itemCount !== 1 || item.timeFlags?.start?.source !== 'explicit') return false;
  const text = captionOnly(caption);
  if (!key(text).includes(key(item.name)) || !key(item.name)) return false;
  const ranges = [...text.matchAll(/\bstarting\s+(?:at\s+)?(\d{1,2})(?::([0-5]\d))?\s*(?:[ap]\.?m\.?)?\s*(?:till|until|to|[-–—])\s*\d{1,2}(?::[0-5]\d)?\b/gi)];
  if (ranges.length !== 1 || /\bdoors?\b/i.test(ranges[0][0])) return false;
  const lineStart = text.lastIndexOf('\n', ranges[0].index) + 1;
  if (/\bdoors?\b/i.test(text.slice(lineStart, ranges[0].index))) return false;
  const start = String(item.startTime || '').match(/^(\d{1,2}):([0-5]\d)$/);
  const evidence = String(item.timeFlags.start.evidence || '');
  if (!start || !/\b(?:starts?|starting|begins?|show)\b/i.test(evidence) || /\bdoors?\b/i.test(evidence)) return false;
  return Number(start[1])%12 !== Number(ranges[0][1])%12 || Number(start[2]) !== Number(ranges[0][2] || 0);
}

export function prepareOccurrenceSourceItem<T extends ExtractedItem>(item: T, caption: string): T {
  item=bindProgrammeMonth(restoreMonthlyProgrammeWeekday(restoreExplainedOccurrenceDate(item,caption),caption),caption);
  const own=`${item.name} ${item.description||''}`;
  if((item as ExtractedItem & {recurringPattern?:string}).recurringPattern==='daily' &&
      hasOnlyDescriptiveSkillRecurrence(own))item={...item,recurringPattern:'none',_recurrenceEvidence:undefined};
  const pattern = explicitStartingProgramPattern(item, caption);
  const currentPattern = (item as ExtractedItem & {recurringPattern?: string}).recurringPattern;
  return {...item,
    ...(currentPattern === 'daily' && hasOnlyAlternativeRecurrence(item) ? {recurringPattern:'none' as const} : {}),
    ...(hasExplicitVenueAbsence(item) ? {sourceLocationRole:'collection_partner_only' as const} : {}),
    ...(pattern && (!currentPattern || currentPattern === 'none' || currentPattern === pattern)
      ? {recurringPattern:pattern, _sourceWeeklyProgramPattern:pattern} : {}),
  };
}

/** Rebind local evidence after formatting by identity, never by array position. */
export function restoreOccurrenceSourceOwnership<T extends FormattedEvent>(events: T[], sources: ExtractedItem[]): T[] {
  return events.map(event => {
    const matches = sources.filter(source => key(source.name) === key(event.name) &&
      source.date === event.startDate && source.startTime === event.startTime);
    if (matches.length !== 1) return event;
    const source = matches[0] as ExtractedItem & {recurringPattern?: RecurringPattern;totalOccurrences?: number;recurrenceUntilDate?: string};
    return {...event,
      ...(source._sourceProgrammeMonthEnd && source.recurrenceUntilDate===source._sourceProgrammeMonthEnd &&
          /^weekly_/.test(String(source.recurringPattern||'')) && source.recurringPattern===event.recurringPattern
        ? {recurrenceUntilDate:earlierProgrammeCutoff(event.recurrenceUntilDate,source._sourceProgrammeMonthEnd),_sourceProgrammeMonthEnd:source._sourceProgrammeMonthEnd}:{}),
      ...(source.sourceLocationRole === 'collection_partner_only'
        ? {sourceLocationRole:source.sourceLocationRole, venue:'', establishment:'', additionalLocation:'', address:'', spatial:source.spatial} : {}),
      ...(source._sourceWeeklyProgramPattern && source.recurringPattern === source._sourceWeeklyProgramPattern
        ? {recurringPattern:source.recurringPattern, isRecurring:'Yes' as const, _sourceWeeklyProgramPattern:source._sourceWeeklyProgramPattern,
          totalOccurrences:source.totalOccurrences, recurrenceUntilDate:source._sourceProgrammeMonthEnd&&source.recurrenceUntilDate===source._sourceProgrammeMonthEnd
            ? earlierProgrammeCutoff(event.recurrenceUntilDate,source._sourceProgrammeMonthEnd):source.recurrenceUntilDate} : {}),
      ...(source.recurringPattern === 'none' && hasOnlyAlternativeRecurrence(source)
        ? {recurringPattern:'none' as const, isRecurring:'No' as const, totalOccurrences:undefined, recurrenceUntilDate:undefined,
          recurringDaysOfWeek:undefined, recurringWeekdaySequence:undefined, recurringWeekInterval:undefined} : {}),
    };
  });
}
