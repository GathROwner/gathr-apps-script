import type {EventData} from '../types/index.js';
import {isRecurringFamilyFallbackCompatible} from './recurringFamilyFallback.js';
import {coversStandingKaraokeOccurrence, isPlainKaraoke} from './standingKaraokeOccurrence.js';
import {recurringSeriesLabelsCompatible, incompatibleRecurringSeriesLifecycle, sameRecurringSeriesSchedule} from '../utils/recurringSeriesLifecycle.js';
export type SeriesCatalog = {events: EventData[]; complete: boolean; scanned: number};
type Page = {events: EventData[]; nextCursor?: unknown};
type FetchPage = (cursor?: unknown) => Promise<Page>;

/** A retired source explicitly linked during repair must not recreate its old
 * parent on replay. This is provenance-only and never backdates the keeper. */
export function sourceLinkedHistoricalSeriesKeepers(incoming: EventData, candidates: EventData[]): EventData[] {
  const root = String(incoming.uniqueId || '').split('_')[0];
  if (!/^\d{8,}$/.test(root)) return [];
  return candidates.filter(existing => incoming.venueId && existing.venueId === incoming.venueId &&
    (existing.sourceUniqueIds || []).includes(root) && String(existing.uniqueId || '').split('_')[0] !== root &&
    /^\d{4}-\d{2}-\d{2}$/.test(incoming.startDate || '') && incoming.startDate < existing.startDate &&
    incoming.startTime === existing.startTime && recurringSeriesLabelsCompatible(incoming, existing) &&
    sameRecurringSeriesSchedule(incoming, existing) &&
    !incompatibleRecurringSeriesLifecycle(incoming, existing) &&
    ((isPlainKaraoke(incoming) && isPlainKaraoke(existing) && coversStandingKaraokeOccurrence(existing, incoming)) ||
      isRecurringFamilyFallbackCompatible(incoming, existing, {venueId:incoming.venueId,startTimeToleranceHours:0})));
}

/** Cache recurring records only, never a venue's entire dated history. Failed
 * loads are not cached, and invalidation also fences an in-flight old load. */
export function createRecurringSeriesCatalogCache(options: {ttlMs?: number; maxPages?: number; maxVenues?: number; now?: () => number} = {}) {
  const entries = new Map<string, {expires: number; promise: Promise<SeriesCatalog>}>();
  const now = options.now || Date.now;
  return {
    invalidate(venueId: string) { entries.delete(venueId); },
    async get(venueId: string, fetchPage: FetchPage): Promise<SeriesCatalog> {
      const old = entries.get(venueId);
      if (old && old.expires > now()) return old.promise;
      const entry = {expires: now() + (options.ttlMs ?? 30000), promise: Promise.resolve(null as unknown as SeriesCatalog)};
      entry.promise = (async () => {
        const events: EventData[] = [];
        let cursor: unknown;
        for (let page = 0; page < (options.maxPages ?? 12); page++) {
          const result = await fetchPage(cursor);
          events.push(...result.events);
          if (result.nextCursor == null) return {events, complete: true, scanned: events.length};
          cursor = result.nextCursor;
        }
        return {events, complete: false, scanned: events.length};
      })();
      if (entries.size >= (options.maxVenues ?? 256)) entries.delete(entries.keys().next().value!);
      entries.set(venueId, entry);
      try { return await entry.promise; }
      catch (error) { if (entries.get(venueId) === entry) entries.delete(venueId); throw error; }
    },
  };
}
