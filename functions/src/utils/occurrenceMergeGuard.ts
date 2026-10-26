import {corroboratedCalendarStart} from './calendarTileTiming.js';
import { hasConflictingBookableActivitySlot, hasConflictingProgrammeSlot } from './eventSlotIdentity.js';
import {hasConflictingStandingKaraokeOccurrence} from '../services/standingKaraokeOccurrence.js';
import {EventData} from '../types/index.js';
import {hasCrossSourceRecurringLifecycleConflict} from './recurringSeriesLifecycle.js';

type Occurrence = {
  name?: string; eventName?: string; description?: string; category?: string; establishment?: string;
  venue?: string; startDate?: string; startTime?: string; endTime?: string;
  isRecurring?: unknown; recurringPattern?: string; totalOccurrences?: unknown;
  recurrenceUntilDate?: string; recurringDaysOfWeek?: unknown; recurringWeekInterval?: unknown;
  uniqueId?: string; timeFlags?: unknown;
  _sourceType?: string; sourceType?: string;
  venueId?: string | null; sourceOccurrenceCount?: number;
};
const title = (e: Occurrence) => String(e.eventName || e.name || '');
const source = (e: Occurrence) => String(e.uniqueId || '').split('_')[0];
const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

/** Two explicitly printed starts in one class post are separate occurrences,
 * not a fuzzy time correction. Single-item corrections retain existing rules. */
export function hasConflictingSameSourceClassClock(a:Occurrence,b:Occurrence):boolean {
  if(!/^\d{8,}$/.test(source(a))||source(a)!==source(b)||a.startDate!==b.startDate||
      a.category!=='Workshops & Classes'||b.category!==a.category||
      title(a).toLowerCase().replace(/[^a-z0-9]/g,'')!==title(b).toLowerCase().replace(/[^a-z0-9]/g,'')||
      Math.max(Number(a.sourceOccurrenceCount)||0,Number(b.sourceOccurrenceCount)||0)<2)return false;
  const known=(e:Occurrence)=>/^\d{2}:\d{2}$/.test(e.startTime||'')&&(e.timeFlags as any)?.start?.source==='explicit';
  return known(a)&&known(b)&&a.startTime!==b.startTime;
}

/** Explicit plus-separated contents identify separate offers in one source.
 * Price changes alone never create this distinction. */
export function hasConflictingSameSourceBundle(a: Occurrence, b: Occurrence): boolean {
  if (!source(a) || source(a) !== source(b) ||
      a.category !== 'Food Special' || b.category !== 'Food Special') return false;
  const parts = (e: Occurrence) => title(e).toLowerCase().split(/\s*\+\s*|\s+plus\s+/)
    .map(s => s.replace(/[^a-z0-9]+/g,' ').trim()).filter(Boolean);
  const left = parts(a), right = parts(b);
  if (left.length < 2 || right.length < 2) return false;
  const shared = left.filter(s => right.includes(s));
  return shared.length >= 2 && (left.some(s => !right.includes(s)) || right.some(s => !left.includes(s)));
}

/** Cinema clocks are occurrence identity, not a three-hour fuzzy tolerance. */
export function hasConflictingCinemaClock(a: Occurrence, b: Occurrence): boolean {
  if (corroboratedCalendarStart(a,b) || corroboratedCalendarStart(b,a)) return false;
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
    const datedCalendarSlot = ['calendar', 'schedule'].includes(String(incoming._sourceType || incoming.sourceType || ''));
    if (!datedCalendarSlot && !/\b(?:course|class(?:es)?|session\s+\d+\s+of\s+\d+)\b/i.test(title(series))) return false;
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
  return hasConflictingSameSourceClassClock(a,b) || hasConflictingSameSourceBundle(a,b) || hasConflictingProgrammeSlot(a,b) || hasConflictingCinemaClock(a,b) || hasConflictingBoundedClassCycle(a,b) || hasConflictingBookableActivitySlot(a,b) ||
    hasCrossSourceRecurringLifecycleConflict(a as Partial<EventData>, b as Partial<EventData>) ||
    hasConflictingStandingKaraokeOccurrence(a as Partial<EventData>, b as Partial<EventData>);
}

export function findConflictingSourceCinemaDate(incoming: Occurrence, existing: Occurrence[], venueId: string): Occurrence | undefined {
  if (incoming.category !== 'Cinema' || incoming.sourceOccurrenceCount !== 1 || !source(incoming)) return undefined;
  const normalized = (e: Occurrence) => title(e).toLowerCase().replace(/[^a-z0-9]/g,'');
  return existing.find(e=>e.venueId===venueId && source(e)===source(incoming) &&
    normalized(e)===normalized(incoming) && e.recurringPattern==='none' &&
    /^\d{4}-\d{2}-\d{2}$/.test(e.startDate || '') && e.startDate!==incoming.startDate);
}
