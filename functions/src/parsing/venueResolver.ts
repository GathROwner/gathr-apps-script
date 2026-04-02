/**
 * Stage 5.5: Hours-Based Time Resolution
 * Ported from postParser.js - resolveTimesWithOperatingHours function
 *
 * Uses venue operating hours from Firestore or Google Places to resolve
 * missing start/end times for events and specials.
 */

import { DateTime } from 'luxon';
import {
  FormattedEvent,
  TimeResolvedEvent,
  TimeResolution,
  Category,
  ParsingConfig,
  DEFAULT_PARSING_CONFIG,
  OperatingHours,
  DayHours,
} from './types.js';
import { logger } from '../utils/logger.js';
import { convertToOperatingHours, findVenue, getHoursForDay, getPlaceDetails } from '../services/placesService.js';
import { findVenueByName, updateVenueOperatingHours } from '../services/firestoreService.js';

// Category defaults for closing times
const CATEGORY_END_DEFAULTS: Record<string, string> = {
  'Happy Hour': '19:00',
  'Wing Night': '21:00',
  'Food Special': '21:00',
  'Drink Special': '23:00',
  'Live Music': '01:00',
  'DJ/Nightlife': '02:00',
  'Comedy': '23:00',
  'Trivia Night': '22:00',
  'Karaoke': '01:00',
  'Open Mic': '23:00',
  'Workshops & Classes': '21:00',
  'Sports': '23:00',
  'Family Friendly': '21:00',
  'Gatherings & Parties': '23:00',
  'Religious': '21:00',
  'Cinema': '23:00',
};

// Event categories that are safe to default to posted time
const EVENT_CATEGORIES_FOR_FALLBACK = [
  'Live Music',
  'Comedy',
  'Trivia Night',
  'Open Mic',
  'Karaoke',
  'DJ/Nightlife',
  'Gatherings & Parties',
];

const DEFAULT_OPERATING_HOURS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SPECIAL_LIKE_CATEGORY_PATTERN = /\b(food special|drink special|happy hour|wing night)\b/i;
const SHORT_FORM_PROGRAM_PATTERN =
  /\b(class|classes|workshop|workshops|lesson|lessons|training|fitness|tai chi|yoga|dance|body bar|rueda|salsa|bachata|heels|belly dance|masterclass|session|sessions|drop-?in|beginner|group)\b/i;

function getOperatingHoursCacheTtlMs(): number {
  const raw = Number(process.env.OPERATING_HOURS_CACHE_TTL_MS);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return DEFAULT_OPERATING_HOURS_CACHE_TTL_MS;
}

function parseTimestampMillis(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  const maybeTimestamp = value as { toMillis?: () => number };
  if (maybeTimestamp && typeof maybeTimestamp.toMillis === 'function') {
    return maybeTimestamp.toMillis();
  }
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : parsed;
}

function cacheKeyForVenueHours(venueName: string, address?: string): string {
  const nameKey = String(venueName || '').trim().toLowerCase();
  const addressKey = String(address || '').trim().toLowerCase();
  return `${nameKey}||${addressKey}`;
}

/**
 * Stage 5.5: Resolve times using venue operating hours
 */
export async function resolveTimesWithOperatingHours(
  formattedEvents: FormattedEvent[],
  userName: string,
  partialAddress: string,
  timestamp: string,
  config: Partial<ParsingConfig> = {}
): Promise<TimeResolvedEvent[]> {
  const cfg = { ...DEFAULT_PARSING_CONFIG, ...config };

  logger.info('Stage 5.5: Starting hours-based time resolution', {
    eventCount: formattedEvents.length,
    userName,
  });

  const resolvedEvents: TimeResolvedEvent[] = [];
  const operatingHoursMemo = new Map<string, Promise<OperatingHours | null>>();

  // Get posted time for fallback
  const postedHHMM = extractPostedTime(timestamp);

  for (const event of formattedEvents) {
    try {
      const resolved = await resolveEventTimes(
        event,
        userName,
        partialAddress,
        postedHHMM,
        cfg,
        operatingHoursMemo
      );
      resolvedEvents.push(resolved);
    } catch (error) {
      logger.error(`Error resolving times for "${event.name}"`, error);
      resolvedEvents.push({ ...event });
    }
  }

  // Log summary
  logResolutionSummary(resolvedEvents);

  return resolvedEvents;
}

/**
 * Resolve times for a single event
 */
async function resolveEventTimes(
  event: FormattedEvent,
  userName: string,
  partialAddress: string,
  postedHHMM: string,
  config: ParsingConfig,
  operatingHoursMemo: Map<string, Promise<OperatingHours | null>>
): Promise<TimeResolvedEvent> {
  const resolved: TimeResolvedEvent = { ...event };
  resolved.timeResolution = {
    hoursUsed: false,
  };

  // Check if we need to resolve times
  const needsStartTime = !event.startTime || event.startTime.trim() === '';
  const needsEndTime = !event.endTime || event.endTime.trim() === '';
  const toClose = event.timeFlags?.end?.toClose === true;

  if (!needsStartTime && !needsEndTime && !toClose) {
    // Nothing to resolve
    return resolved;
  }

  // Check if we have a date to work with
  if (!event.startDate || event.startDate.trim() === '') {
    resolved.timeResolution.reason = 'no_date';
    return applyFallbackTimes(resolved, event, postedHHMM);
  }

  // Try to get venue operating hours
  const operatingHours = await getVenueOperatingHoursCached(
    operatingHoursMemo,
    event.establishment || userName,
    partialAddress
  );

  if (!operatingHours) {
    resolved.timeResolution.reason = 'no_place_match';
    return applyFallbackTimes(resolved, event, postedHHMM);
  }

  // Get the day of week for the event
  const eventDt = DateTime.fromFormat(event.startDate, 'yyyy-MM-dd', {
    zone: config.timezone,
  });
  const dayName = eventDt.toFormat('EEEE').toLowerCase();

  const dayHours = getHoursForDay(operatingHours, dayName);

  if (!dayHours || dayHours.closed) {
    resolved.timeResolution.reason = 'no_hours';
    return applyFallbackTimes(resolved, event, postedHHMM);
  }

  // Mark that we used operating hours
  resolved.timeResolution.hoursUsed = true;

  // Resolve start time if needed
  if (needsStartTime) {
    // Use venue opening time or a sensible default based on category
    const startTime = getDefaultStartTime(event.category, dayHours);
    resolved.startTime = startTime;
    resolved.timeResolution.startFromHours = true;

    // Update timeFlags
    resolved.timeFlags = resolved.timeFlags || { start: { source: 'none', evidence: '' }, end: { toClose: false, evidence: '' } };
    resolved.timeFlags.start = {
      source: 'semantic',
      evidence: `Start from venue hours (opens ${dayHours.open})`,
    };

    logger.debug(`Resolved start time for "${event.name}"`, {
      startTime,
      source: 'venue_hours',
    });
  }

  // Resolve end time if needed
  if (needsEndTime || toClose) {
    if (toClose) {
      // Use venue closing time
      resolved.endTime = dayHours.close;
      resolved.timeResolution.endFromHours = 'to_close';

      logger.debug(`Resolved end time (to close) for "${event.name}"`, {
        endTime: dayHours.close,
      });
    } else {
      const inferred = inferEndFromStartAndCategory(
        resolved.startTime || event.startTime || '',
        event.category,
        event
      );
      resolved.endTime = inferred.endTime;
      resolved.timeResolution.endFromHours = inferred.source;

      logger.debug(`Resolved end time for "${event.name}"`, {
        endTime: inferred.endTime,
        source: inferred.source,
      });
    }
  }

  return resolved;
}

async function getVenueOperatingHoursCached(
  memo: Map<string, Promise<OperatingHours | null>>,
  venueName: string,
  address?: string
): Promise<OperatingHours | null> {
  const key = cacheKeyForVenueHours(venueName, address);
  const existing = memo.get(key);
  if (existing) return existing;
  const promise = getVenueOperatingHours(venueName, address);
  memo.set(key, promise);
  return promise;
}

/**
 * Get venue operating hours from Firestore or Google Places
 */
async function getVenueOperatingHours(
  venueName: string,
  address?: string
): Promise<OperatingHours | null> {
  try {
    // First try Firestore
    const firestoreVenue = await findVenueByName(venueName);
    const cachedHours = firestoreVenue?.operatingHours ?? null;
    const ttlMs = getOperatingHoursCacheTtlMs();

    if (cachedHours) {
      const updatedAtMs =
        parseTimestampMillis((firestoreVenue as unknown as Record<string, unknown>)?.operatingHoursUpdatedAt) ??
        parseTimestampMillis((firestoreVenue as unknown as Record<string, unknown>)?.updatedAt);
      const ageMs = updatedAtMs ? Date.now() - updatedAtMs : null;
      if (ageMs === null || ageMs < ttlMs) {
        logger.debug(`Found operating hours in Firestore for "${venueName}"`);
        return cachedHours;
      }
      logger.debug(`Operating hours cache is stale for "${venueName}", refreshing via Google Places`, {
        cacheAgeMinutes: Math.round(ageMs / 60000),
      });
    }

    // If we already have a place id, skip text search.
    const existingPlaceId = firestoreVenue?.googlePlaceId;
    if (existingPlaceId) {
      const details = await getPlaceDetails(existingPlaceId);
      const refreshed = details ? convertToOperatingHours(details) : null;
      if (refreshed) {
        const detailsCoords = details?.location
          ? { latitude: details.location.lat, longitude: details.location.lng }
          : undefined;
        await updateVenueOperatingHours(firestoreVenue.id, refreshed, existingPlaceId, detailsCoords);
        logger.debug(`Refreshed operating hours via Google Places details for "${venueName}"`);
        return refreshed;
      }
    }

    // Fall back to Google Places
    const { placeResult, operatingHours } = await findVenue(venueName, address);
    if (operatingHours) {
      if (firestoreVenue?.id) {
        const placeCoords = placeResult?.location
          ? { latitude: placeResult.location.lat, longitude: placeResult.location.lng }
          : undefined;
        await updateVenueOperatingHours(
          firestoreVenue.id,
          operatingHours,
          placeResult?.placeId || undefined,
          placeCoords
        );
      }
      logger.debug(`Found operating hours via Google Places for "${venueName}"`);
      return operatingHours;
    }

    return cachedHours;
  } catch (error) {
    logger.debug(`Could not get operating hours for "${venueName}"`, { error });
    return null;
  }
}

/**
 * Apply fallback times when venue hours are unavailable
 */
function applyFallbackTimes(
  resolved: TimeResolvedEvent,
  event: FormattedEvent,
  postedHHMM: string
): TimeResolvedEvent {
  const isSpecial =
    event.isFoodSpecial === 'Yes' ||
    /special/i.test(String(event.category || ''));

  const isEventLikely =
    event.isEvent === 'Yes' ||
    EVENT_CATEGORIES_FOR_FALLBACK.includes(event.category as string);

  // Check for "today/tonight" semantic cue
  const hasTodayCue = /today|tonight|this\s*(evening|afternoon|morning|weekend)/i.test(
    `${event.description || ''}`
  );

  const hasExplicitStart = event.timeFlags?.start?.source === 'explicit';
  const hasStartClock = event.startTime && event.startTime.trim() !== '';

  // Apply post time for specials or events with today cues
  if (
    (isSpecial || (isEventLikely && hasTodayCue)) &&
    !hasStartClock &&
    !hasExplicitStart &&
    postedHHMM
  ) {
    resolved.startTime = postedHHMM;

    // Update timeFlags
    resolved.timeFlags = resolved.timeFlags || { start: { source: 'none', evidence: '' }, end: { toClose: false, evidence: '' } };
    resolved.timeFlags.start = {
      source: 'semantic',
      evidence: `Start from post time ${postedHHMM}`,
    };
    resolved.timeResolution = resolved.timeResolution || { hoursUsed: false };
    resolved.timeResolution.startFromPostTime = true;

    logger.debug(`Applied post time fallback for "${event.name}"`, {
      startTime: postedHHMM,
    });
  }

  // Apply category default for end time if missing and toClose was set
  const hasEndClock = resolved.endTime && resolved.endTime.trim() !== '';
  if (!hasEndClock) {
    resolved.timeResolution = resolved.timeResolution || { hoursUsed: false };

    if (event.timeFlags?.end?.toClose) {
      const categoryDefault = getCategoryEndDefault(event.category);
      resolved.endTime = categoryDefault;
      resolved.timeResolution.endFromHours = 'category_default';

      logger.debug(`Applied category default end time for "${event.name}"`, {
        endTime: categoryDefault,
        source: 'to_close_fallback',
      });
    } else if (resolved.startTime && resolved.startTime.trim() !== '') {
      const inferred = inferEndFromStartAndCategory(resolved.startTime, event.category, event);
      if (inferred.endTime) {
        resolved.endTime = inferred.endTime;
        resolved.timeResolution.endFromHours = inferred.source;

        logger.debug(`Applied inferred end time for "${event.name}"`, {
          startTime: resolved.startTime,
          endTime: inferred.endTime,
          source: inferred.source,
        });
      }
    }
  }

  return resolved;
}

/**
 * Get default start time based on category and venue hours
 */
function getDefaultStartTime(category: Category, dayHours: DayHours): string {
  // For specials like happy hour, use a typical start time
  if (category === 'Happy Hour') {
    return '16:00'; // 4 PM typical happy hour start
  }

  // For evening events, use a reasonable evening start
  const eveningCategories = [
    'Live Music',
    'Comedy',
    'DJ/Nightlife',
    'Karaoke',
    'Open Mic',
    'Trivia Night',
  ];
  if (eveningCategories.includes(category)) {
    return '20:00'; // 8 PM for evening entertainment
  }

  // Default to venue opening time or a sensible default
  return dayHours.open || '18:00';
}

/**
 * Get category default end time
 */
function getCategoryEndDefault(category: Category): string {
  return CATEGORY_END_DEFAULTS[category] || '23:00';
}

function inferEndFromStartAndCategory(
  startTime: string,
  category: Category,
  event?: Pick<FormattedEvent, 'name' | 'description' | 'timeFlags' | 'category'>
): { endTime: string; source: 'category_default' | 'duration_default' } {
  const startHHMM = normalizeTimeString(startTime);
  if (!startHHMM) {
    return { endTime: '', source: 'duration_default' };
  }

  if (shouldPreferDurationDefaultForMissingEnd(event)) {
    return {
      endTime: addMinutesToHHMM(startHHMM, 120),
      source: 'duration_default',
    };
  }

  const categoryDefault = getCategoryEndDefault(category);
  const startMinutes = hhmmToMinutes(startHHMM);
  const categoryMinutes = hhmmToMinutes(categoryDefault);

  if (startMinutes !== null && categoryMinutes !== null) {
    const categoryLooksOvernight = categoryMinutes <= 6 * 60;
    if (categoryMinutes > startMinutes || categoryLooksOvernight) {
      return { endTime: categoryDefault, source: 'category_default' };
    }
  }

  return {
    endTime: addMinutesToHHMM(startHHMM, 120),
    source: 'duration_default',
  };
}

function shouldPreferDurationDefaultForMissingEnd(
  event?: Pick<FormattedEvent, 'name' | 'description' | 'timeFlags' | 'category'>
): boolean {
  if (!event) return false;
  if (SPECIAL_LIKE_CATEGORY_PATTERN.test(String(event.category || ''))) {
    return false;
  }

  const startSource = String(event.timeFlags?.start?.source || '').trim().toLowerCase();
  if (startSource !== 'explicit') {
    return false;
  }

  const endSource = String(event.timeFlags?.end?.source || '').trim().toLowerCase();
  if (endSource === 'explicit' || event.timeFlags?.end?.toClose === true) {
    return false;
  }

  const haystack = `${String(event.name || '')} ${String(event.description || '')}`.toLowerCase();
  return SHORT_FORM_PROGRAM_PATTERN.test(haystack);
}

/**
 * Extract posted time as HH:mm from timestamp
 */
function extractPostedTime(timestamp: string): string {
  try {
    const dt = DateTime.fromISO(timestamp);
    if (dt.isValid) {
      return dt.toFormat('HH:mm');
    }
  } catch {
    // Ignore parse errors
  }
  return '';
}

/**
 * Normalize time string to HH:mm format
 */
function normalizeTimeString(timeStr: string): string {
  const raw = String(timeStr || '').trim();
  if (!raw) return '';

  // Try 12-hour format with AM/PM
  const m12 = raw.match(/(\d{1,2})(?::([0-5]\d))?(?::\d{2})?\s*(AM|PM)/i);
  if (m12) {
    let hh = parseInt(m12[1], 10);
    const mm = m12[2] || '00';
    const mer = m12[3].toUpperCase();
    if (mer === 'PM' && hh !== 12) hh += 12;
    if (mer === 'AM' && hh === 12) hh = 0;
    return `${String(hh).padStart(2, '0')}:${mm}`;
  }

  // Try 24-hour format
  const m24 = raw.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (m24) {
    return `${String(parseInt(m24[1], 10)).padStart(2, '0')}:${m24[2]}`;
  }

  return '';
}

function hhmmToMinutes(hhmm: string): number | null {
  const normalized = normalizeTimeString(hhmm);
  if (!normalized) return null;
  const [hh, mm] = normalized.split(':').map((v) => parseInt(v, 10));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function addMinutesToHHMM(hhmm: string, deltaMinutes: number): string {
  const minutes = hhmmToMinutes(hhmm);
  if (minutes === null) return '';
  const day = 24 * 60;
  const normalized = ((minutes + deltaMinutes) % day + day) % day;
  const hh = Math.floor(normalized / 60);
  const mm = normalized % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Log resolution summary for Stage 5.5
 */
function logResolutionSummary(events: TimeResolvedEvent[]): void {
  const total = events.length;
  let used = 0;
  let toClose = 0;
  let startFromHours = 0;
  let catDefault = 0;
  let durationDefault = 0;
  let noPlace = 0;
  let noHours = 0;
  let noDate = 0;

  events.forEach((it) => {
    if (it.timeResolution?.hoursUsed) used++;
    if (it.timeResolution?.endFromHours === 'to_close') toClose++;
    if (it.timeResolution?.startFromHours) startFromHours++;
    if (it.timeResolution?.endFromHours === 'category_default') catDefault++;
    if (it.timeResolution?.endFromHours === 'duration_default') durationDefault++;
    if (it.timeResolution?.reason === 'no_place_match') noPlace++;
    if (it.timeResolution?.reason === 'no_hours') noHours++;
    if (it.timeResolution?.reason === 'no_date') noDate++;
  });

  logger.info('Stage 5.5 summary', {
    total,
    hoursUsed: used,
    startFromHours,
    endToClose: toClose,
    categoryDefault: catDefault,
    durationDefault,
    noPlaceMatch: noPlace,
    noHours,
    noDate,
  });
}

// Re-export types for convenience
export type { OperatingHours, DayHours };
