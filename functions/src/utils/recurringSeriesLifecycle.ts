import type {EventData} from '../types/index.js';
type Series = Partial<EventData>;
const norm = (value: unknown) => String(value || '').trim().toLowerCase();
const source = (event: Series) => String(event.uniqueId || '').split('_')[0];
const count = (event: Series) => Number(event.totalOccurrences) > 0 ? Number(event.totalOccurrences) : 0;
const until = (event: Series) => /^\d{4}-\d{2}-\d{2}$/.test(event.recurrenceUntilDate || '') ? event.recurrenceUntilDate : '';
export function isRecurringSeries(event: Series): boolean {
  return /^(?:daily|monthly|weekly_[a-z]+)$/.test(norm(event.recurringPattern));
}
const schedule = (event: Series) => {
  const sequence = (event.recurringWeekdaySequence || []).map(norm);
  const pattern = norm(event.recurringPattern);
  const days = [...new Set((event.recurringDaysOfWeek || []).map(norm))].sort();
  if (!days.length && /^weekly_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/.test(pattern)) days.push(pattern.slice(7));
  return JSON.stringify([sequence.length ? 'sequence' : days.length ? 'weekly' : pattern,
    days, sequence, Number(event.recurringWeekInterval) || 1]);
};
export function sameRecurringSeriesSchedule(a: Series, b: Series): boolean {
  return isRecurringSeries(a) && isRecurringSeries(b) && schedule(a) === schedule(b);
}

export function recurringSeriesLabelsCompatible(a: Series, b: Series): boolean {
  const label = (value: unknown) => norm(value).replace(/[^a-z0-9]+/g, ' ').trim().replace(/ bar$/, '');
  const venueLabels = new Set([label(a.establishment), label(b.establishment)].filter(Boolean));
  for (const field of ['subVenue', 'additionalLocation', 'ageRestriction'] as const) {
    const left = label(a[field]), right = label(b[field]);
    if (field === 'additionalLocation' && (!left || venueLabels.has(left)) && (!right || venueLabels.has(right))) continue;
    if (left && right && left !== right) return false;
    if (field === 'subVenue' && left !== right) return false;
  }
  return true;
}

/** Overlap of the first date does not establish the identity of two finite
 * series. Keep their complete lifecycle distinct instead of truncating one. */
export function incompatibleRecurringSeriesLifecycle(a: Series, b: Series): boolean {
  if (!isRecurringSeries(a) || !isRecurringSeries(b)) return false;
  if (!count(a) && !count(b) && !until(a) && !until(b)) return false;
  return count(a) !== count(b) || until(a) !== until(b) ||
    a.startDate !== b.startDate || schedule(a) !== schedule(b);
}

export function hasCrossSourceRecurringLifecycleConflict(a: Series, b: Series): boolean {
  // An exact source can legitimately correct its own previously parsed shape;
  // existing authoritative-source correction rules still govern that path.
  if (a.uniqueId && a.uniqueId === b.uniqueId) return false;
  if (/^\d{8,}$/.test(source(a)) && source(a) === source(b)) return false;
  return incompatibleRecurringSeriesLifecycle(a, b);
}
