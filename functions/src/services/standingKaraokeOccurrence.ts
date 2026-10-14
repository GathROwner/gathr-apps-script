import {EventData} from '../types/index.js';
import {incompatibleRecurringSeriesLifecycle} from '../utils/recurringSeriesLifecycle.js';
type KaraokeOccurrence = Partial<EventData>;

const weekdays = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const normalized = (value: unknown): string => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const title = (event: KaraokeOccurrence): string => normalized(event.eventName || event.name);

/** Only the unqualified activity name is equivalent. Hosts, rooms and branded
 * sing-alongs need separate evidence; a shared venue/clock is insufficient. */
export function isPlainKaraoke(event: KaraokeOccurrence): boolean {
  return normalized(event.category) === 'karaoke' && /^karaoke(?: night)?$/.test(title(event));
}

export function isStandingKaraoke(event: KaraokeOccurrence): boolean {
  return isPlainKaraoke(event) && /^weekly_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/.test(event.recurringPattern || '') &&
    /\b(?:weekly|every|each)\b/i.test(event.description || '');
}

/** Uses the stored lifecycle, rather than parent age, to test an occurrence. */
export function coversStandingKaraokeOccurrence(incoming: KaraokeOccurrence, existing: KaraokeOccurrence): boolean {
  if (!isPlainKaraoke(incoming) || !isStandingKaraoke(existing)) return false;
  if (incompatibleRecurringSeriesLifecycle(incoming, existing)) return false;
  if (!existing.venueId || incoming.venueId !== existing.venueId) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(incoming.startDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(existing.startDate || '')) return false;
  if (!/^\d{2}:\d{2}$/.test(incoming.startTime || '') || incoming.startTime !== existing.startTime) return false;
  for (const field of ['subVenue','additionalLocation','ageRestriction'] as const) {
    const a = normalized(incoming[field]), b = normalized(existing[field]);
    // A label naming the canonical venue is redundant, not a distinct room.
    const venueLabel = (value: string): string => value.replace(/ bar$/, '');
    const venueLabels = new Set([venueLabel(normalized(existing.establishment)), venueLabel(normalized(incoming.establishment))]);
    if (field === 'additionalLocation' && (!a || venueLabels.has(venueLabel(a))) && (!b || venueLabels.has(venueLabel(b)))) continue;
    if (a && b && a !== b) return false;
    if (field === 'subVenue' && a !== b) return false;
  }
  const pattern = existing.recurringPattern || '';
  const incomingPattern = incoming.recurringPattern || 'none';
  if (incomingPattern !== 'none' && incomingPattern !== pattern) return false;
  const days = (Date.parse(incoming.startDate+'T00:00:00Z') - Date.parse(existing.startDate+'T00:00:00Z')) / 86400000;
  const interval = Number(existing.recurringWeekInterval || 1);
  if (!Number.isInteger(interval) || interval < 1 || !Number.isInteger(days) || days < 0 || days % (7*interval) !== 0) return false;
  if (weekdays[new Date(incoming.startDate+'T00:00:00Z').getUTCDay()] !== pattern.slice(7)) return false;
  if (existing.recurrenceUntilDate && incoming.startDate! > existing.recurrenceUntilDate) return false;
  const count = Number(existing.totalOccurrences || 0);
  if (count > 0 && days/(7*interval)+1 > count) return false;
  return true;
}

export function hasConflictingStandingKaraokeOccurrence(a: KaraokeOccurrence, b: KaraokeOccurrence): boolean {
  // Similarity callers can omit canonical IDs. Missing venue identity is not
  // evidence of a conflict in those shared callers.
  if (!a.venueId || !b.venueId) return false;
  if (!isPlainKaraoke(a) || !isPlainKaraoke(b) || (!isStandingKaraoke(a) && !isStandingKaraoke(b))) return false;
  return !coversStandingKaraokeOccurrence(a,b) && !coversStandingKaraokeOccurrence(b,a);
}

export function selectStandingKaraokeOccurrence(incoming: EventData, candidates: EventData[]): {
  kind: 'none' | 'match' | 'hold'; existing?: EventData;
  reason?: 'multiple_parents' | 'printed_end_conflict'; matchedParents?: number;
} {
  const matches = candidates.filter(existing => coversStandingKaraokeOccurrence(incoming, existing));
  if (!matches.length) return {kind:'none'};
  if (matches.length > 1) return {kind:'hold',reason:'multiple_parents',matchedParents:matches.length};
  const existing = matches[0];
  const explicitEnd = (event: EventData): string => (event.timeFlags as {end?: {source?: string}} | undefined)?.end?.source === 'explicit' ? event.endTime || '' : '';
  if (explicitEnd(incoming) && explicitEnd(existing) && explicitEnd(incoming) !== explicitEnd(existing)) return {kind:'hold',reason:'printed_end_conflict',matchedParents:1};
  return {kind:'match',existing};
}
