import type { EventData, EventTimingContract } from '../types/index.js';

export const EVENT_TIMING_POLICY_VERSION = 'honest-end-times-v2';
export const UNKNOWN_END_DISCOVERY_CUTOFF_MINUTES = 120;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const text = (value: unknown): string => String(value || '').trim();

const parseMinutes = (value: unknown): number | null => {
  const raw = text(value);
  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = match[3]?.toUpperCase();
  if (minute > 59) return null;
  if (meridiem === 'AM') hour = hour === 12 ? 0 : hour;
  if (meridiem === 'PM') hour = hour === 12 ? 12 : hour + 12;
  if (hour < 0 || hour > 23) return null;
  return hour * 60 + minute;
};

const formatMinutes = (minutes: number): string => {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
};

const addDays = (dateKey: string, days: number): string => {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return dateKey;
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

export function buildEventTimingContract(
  event: Pick<
    EventData,
    | 'startDate'
    | 'startTime'
    | 'endDate'
    | 'endTime'
    | 'timeFlags'
    | 'timeResolution'
    | 'facebookUrl'
    | 'sourceTimestamp'
    | 'sourceContentSignature'
    | 'isRecurring'
  >,
  timeZone = 'America/Halifax'
): EventTimingContract {
  const timeFlags = asRecord(event.timeFlags);
  const endFlags = asRecord(timeFlags?.end);
  const startFlags = asRecord(timeFlags?.start);
  const resolution = asRecord(event.timeResolution);
  const endResolutionMethod = text(resolution?.endFromHours);
  const endSource = text(endFlags?.source).toLowerCase();
  const startSource = text(startFlags?.source).toLowerCase();
  const untilClose = endFlags?.toClose === true || endResolutionMethod === 'to_close';
  const inferredLegacyEnd =
    endResolutionMethod === 'category_default' || endResolutionMethod === 'duration_default';
  const structuredEnd = Boolean(resolution?.endFromFacebookEvent);
  const explicitEnd = !inferredLegacyEnd && (endSource === 'explicit' || structuredEnd);
  const endStatus = untilClose
    ? 'until_close'
    : explicitEnd
      ? 'observed'
      : 'unknown';
  const startDate = text(event.startDate).slice(0, 10);
  const startTime = text(event.startTime);
  const legacyEndDate = text(event.endDate).slice(0, 10) || startDate;
  const legacyEndTime = text(event.endTime);
  const startMinutes = parseMinutes(startTime);
  const legacyEndMinutes = parseMinutes(legacyEndTime);
  const crossesMidnight =
    startMinutes !== null && legacyEndMinutes !== null && legacyEndMinutes < startMinutes && legacyEndDate === startDate;
  const resolvedEndDate = crossesMidnight ? addDays(legacyEndDate, 1) : legacyEndDate;

  let estimate: EventTimingContract['estimate'] = null;
  if (endStatus === 'unknown' && legacyEndTime) {
    estimate = {
      confidence: 'low',
      discoveryCutoffDate: resolvedEndDate,
      discoveryCutoffTime: legacyEndTime,
      method: endResolutionMethod || 'legacy_policy_cutoff',
      estimateVersion: EVENT_TIMING_POLICY_VERSION,
      evidenceRefs: text(endFlags?.evidence) ? [text(endFlags?.evidence)] : [],
    };
  } else if (endStatus === 'unknown' && startMinutes !== null) {
    const cutoff = startMinutes + UNKNOWN_END_DISCOVERY_CUTOFF_MINUTES;
    estimate = {
      confidence: 'low',
      discoveryCutoffDate: addDays(startDate, Math.floor(cutoff / 1440)),
      discoveryCutoffTime: formatMinutes(cutoff),
      method: 'conservative_discovery_cutoff',
      estimateVersion: EVENT_TIMING_POLICY_VERSION,
    };
  }

  const observedAt = event.sourceTimestamp instanceof Date
    ? event.sourceTimestamp.toISOString()
    : null;

  return {
    version: 2,
    timeZone,
    scheduleKind: untilClose
      ? 'until_close'
      : legacyEndDate !== startDate && event.isRecurring !== true && event.isRecurring !== 'Yes'
        ? 'multi_day'
        : 'timed_session',
    schedule: {
      start: {
        localDate: startDate,
        localTime: startTime || null,
        timeZone,
        status: startSource === 'semantic' ? 'semantic' : startTime ? 'observed' : 'unknown',
        sourceType: startSource || null,
        evidence: text(startFlags?.evidence) || null,
        sourceUrl: text(event.facebookUrl) || null,
        observedAt,
        sourceRevision: text(event.sourceContentSignature) || null,
      },
      end: {
        localDate: endStatus === 'unknown' ? null : resolvedEndDate,
        localTime: endStatus === 'unknown' ? null : legacyEndTime || null,
        timeZone,
        status: endStatus,
        sourceType: endSource || (structuredEnd ? 'structured_facebook' : null),
        evidence: text(endFlags?.evidence) || null,
        sourceUrl: text(event.facebookUrl) || null,
        observedAt,
        sourceRevision: text(event.sourceContentSignature) || null,
      },
    },
    estimate,
    policyVersion: EVENT_TIMING_POLICY_VERSION,
  };
}
