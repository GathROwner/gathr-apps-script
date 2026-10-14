import { hasConflictingBookableActivitySlot } from './eventSlotIdentity.js';
import {hasConflictingStandingKaraokeOccurrence} from '../services/standingKaraokeOccurrence.js';
import {EventData} from '../types/index.js';

type Occurrence = {
  name?: string; eventName?: string; category?: string; establishment?: string;
  venue?: string; startDate?: string; startTime?: string; endTime?: string;
  isRecurring?: unknown; recurringPattern?: string; totalOccurrences?: unknown;
  recurrenceUntilDate?: string; recurringDaysOfWeek?: unknown; recurringWeekInterval?: unknown;
  uniqueId?: string; timeFlags?: unknown;
  venueId?: string | null; sourceOccurrenceCount?: number;
};
const title = (e: Occurrence) => String(e.eventName || e.name || '');
const source = (e: Occurrence) => String(e.uniqueId || '').split('_')[0];
const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

/** Cinema clocks are occurrence identity, not a three-hour fuzzy tolerance. */
export function hasConflictingCinemaClock(a: Occurrence, b: Occurrence): boolean {
  const cinema = (e: Occurrence) => e.category === 'Cinema' ||
    /\b(?:cinema|screening|movie)\b/i.test(`${e.establishment || ''} ${e.venue || ''} ${title(e)}`);
  const known = (e: Occurrence) => {
    const flag = (e.timeFlags as any)?.start?.source;
    return /^\d{2}:\d{2}$/.test(e.startTime || '') &&
      !['none','semantic','implied'].includes(flag) ? e.startTime : '';
  };
  return cinema(a) && cinema(b) && Boolean(known(a) && known(b) && known(a) !== known(b));
}

/** A later class cycle cannot be absorbed into a bounded earlier class series. */
export function hasConflictingBoundedClassCycle(a: Occurrence, b: Occurrence): boolean {
  const outside = (series: Occurrence, incoming: Occurrence): boolean => {
    if (source(series) && source(series) === source(incoming)) return false;
    if (!/\b(?:course|class(?:es)?|session\s+\d+\s+of\s+\d+)\b/i.test(title(series))) return false;
    const pattern = String(series.recurringPattern || '');
    if (pattern !== 'daily' && !pattern.startsWith('weekly_')) return false;
    const count = Number(series.totalOccurrences), until = String(series.recurrenceUntilDate || '');
    const boundedCount = Number.isInteger(count) && count > 0;
    if (!boundedCount && !/^\d{4}-\d{2}-\d{2}$/.test(until)) return false;
    const start = String(series.startDate || ''), date = String(incoming.startDate || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || start === date) return false;
    if (date < start || (until && date > until)) return true;
    if (!boundedCount) return false;
    const days = Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000);
    if (!Number.isFinite(days) || days > 7300) return false;
    if (pattern === 'daily') return days >= count;
    const custom = Array.isArray(series.recurringDaysOfWeek) ? series.recurringDaysOfWeek : [];
    const weekdays = pattern === 'weekly_custom' ? custom : [pattern.slice(7)];
    if (!weekdays.some(day => dayNames.includes(String(day)))) return false;
    const interval = Math.max(1, Number(series.recurringWeekInterval) || 1);
    let occurrences = 0;
    for (let offset=0;offset<=days;offset++) {
      const current = new Date(Date.parse(start+'T00:00:00Z')+offset*86400000);
      if (Math.floor(offset/7)%interval===0 && weekdays.includes(dayNames[current.getUTCDay()])) occurrences++;
    }
    return occurrences > count;
  };
  return outside(a,b) || outside(b,a);
}

export function hasConflictingOccurrenceIdentity(a: Occurrence, b: Occurrence): boolean {
  return hasConflictingCinemaClock(a,b) || hasConflictingBoundedClassCycle(a,b) || hasConflictingBookableActivitySlot(a,b) ||
    hasConflictingStandingKaraokeOccurrence(a as Partial<EventData>, b as Partial<EventData>);
}

export function findConflictingSourceCinemaDate(incoming: Occurrence, existing: Occurrence[], venueId: string): Occurrence | undefined {
  if (incoming.category !== 'Cinema' || incoming.sourceOccurrenceCount !== 1 || !source(incoming)) return undefined;
  const normalized = (e: Occurrence) => title(e).toLowerCase().replace(/[^a-z0-9]/g,'');
  return existing.find(e=>e.venueId===venueId && source(e)===source(incoming) &&
    normalized(e)===normalized(incoming) && e.recurringPattern==='none' &&
    /^\d{4}-\d{2}-\d{2}$/.test(e.startDate || '') && e.startDate!==incoming.startDate);
}
