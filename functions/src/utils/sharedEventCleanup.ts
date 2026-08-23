import { DateTime } from 'luxon';

export interface SharedEventCleanupFields {
  startDate?: unknown;
  endDate?: unknown;
  endTime?: unknown;
  timezone?: unknown;
  recurringPattern?: unknown;
  recurrenceUntilDate?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

function cleanText(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
}

function validIsoDate(value: unknown): string | undefined {
  const text = cleanText(value);
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : undefined;
}

function validTime(value: unknown): string {
  const text = cleanText(value);
  return text && /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(text)
    ? text
    : '23:59:59';
}

export function getSharedEventEffectiveEnd(fields: SharedEventCleanupFields): DateTime | undefined {
  const baseDate = validIsoDate(fields.endDate) || validIsoDate(fields.startDate);
  const recurrenceEnd = validIsoDate(fields.recurrenceUntilDate);
  const isRecurring = Boolean(cleanText(fields.recurringPattern));
  const effectiveDate = isRecurring && recurrenceEnd && (!baseDate || recurrenceEnd > baseDate)
    ? recurrenceEnd
    : baseDate;
  if (!effectiveDate) return undefined;

  const requestedZone = cleanText(fields.timezone) || 'America/Halifax';
  const zone = DateTime.local().setZone(requestedZone).isValid
    ? requestedZone
    : 'America/Halifax';
  const parsed = DateTime.fromISO(`${effectiveDate}T${validTime(fields.endTime)}`, { zone });
  return parsed.isValid ? parsed : undefined;
}

export function isSharedEventStale(params: {
  fields: SharedEventCleanupFields;
  now?: DateTime;
  graceDays?: number;
}): boolean {
  const effectiveEnd = getSharedEventEffectiveEnd(params.fields);
  if (!effectiveEnd) return false;
  const now = (params.now || DateTime.now()).toUTC();
  const graceDays = Math.max(0, Number(params.graceDays ?? 1));
  return effectiveEnd.toUTC().toMillis() <= now.minus({ days: graceDays }).toMillis();
}

function timestampMillis(value: unknown): number | undefined {
  if (typeof value === 'string') {
    const parsed = DateTime.fromISO(value);
    return parsed.isValid ? parsed.toMillis() : undefined;
  }
  if (value && typeof value === 'object') {
    const maybeTimestamp = value as { toMillis?: () => number; seconds?: number; _seconds?: number };
    if (typeof maybeTimestamp.toMillis === 'function') return maybeTimestamp.toMillis();
    const seconds = maybeTimestamp.seconds ?? maybeTimestamp._seconds;
    return Number.isFinite(seconds) ? Number(seconds) * 1000 : undefined;
  }
  return undefined;
}

export function isUndatedSharedEventStale(params: {
  fields: SharedEventCleanupFields;
  now?: DateTime;
  graceDays?: number;
}): boolean {
  if (getSharedEventEffectiveEnd(params.fields)) return false;
  const referenceMillis = timestampMillis(params.fields.updatedAt)
    ?? timestampMillis(params.fields.createdAt);
  if (!Number.isFinite(referenceMillis)) return false;
  const now = (params.now || DateTime.now()).toUTC();
  const graceDays = Math.max(1, Number(params.graceDays ?? 30));
  return Number(referenceMillis) <= now.minus({ days: graceDays }).toMillis();
}
