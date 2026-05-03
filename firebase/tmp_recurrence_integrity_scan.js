const fs = require('fs');
const path = require('path');
let admin = null;
let db = null;
const AS_OF_DATE = process.argv[2] || '2026-04-01';
const NEXT_7_END = addDays(AS_OF_DATE, 7) || AS_OF_DATE;

function getDb() {
  if (db) return db;
  admin = require('firebase-admin');
  const serviceAccount = require(path.join(process.cwd(), 'service-account.json'));
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  db = admin.firestore();
  return db;
}

async function shutdownDb() {
  if (admin && admin.apps.length) {
    await admin.app().delete();
  }
  admin = null;
  db = null;
}

const WEEKDAY_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY_INDEX = Object.fromEntries(WEEKDAY_ORDER.map((day, index) => [day, index]));
const WEEKDAY_TOKEN_TO_CANONICAL = {
  sunday: 'sunday',
  sundays: 'sunday',
  sun: 'sunday',
  monday: 'monday',
  mondays: 'monday',
  mon: 'monday',
  tuesday: 'tuesday',
  tuesdays: 'tuesday',
  tue: 'tuesday',
  tues: 'tuesday',
  wednesday: 'wednesday',
  wednesdays: 'wednesday',
  wed: 'wednesday',
  thursday: 'thursday',
  thursdays: 'thursday',
  thu: 'thursday',
  thur: 'thursday',
  thurs: 'thursday',
  friday: 'friday',
  fridays: 'friday',
  fri: 'friday',
  saturday: 'saturday',
  saturdays: 'saturday',
  sat: 'saturday',
};

function normalizeWeekdayExtractionText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\u2012|\u2013|\u2014|\u2015|â€“|â€”/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstPresent(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return undefined;
}

function parseBoolLike(value) {
  if (value === true || value === false) return value;
  const s = String(value ?? '').trim().toLowerCase();
  if (!s) return null;
  if (['true', '1', 'yes', 'y'].includes(s)) return true;
  if (['false', '0', 'no', 'n'].includes(s)) return false;
  return null;
}

function normalizePattern(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[.,;:]+$/, '');
  if (normalized === 'weekly_multi' || normalized === 'weekly_sequence') {
    return 'weekly_custom';
  }
  return normalized;
}

function normalizeIsoDate(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string') {
    const s = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return undefined;
  }
  if (value && typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      const d = value.toDate();
      if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    if (typeof value._seconds === 'number') {
      const d = new Date(value._seconds * 1000);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }
  return undefined;
}

function timestampToIso(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    return undefined;
  }
  if (value && typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      const d = value.toDate();
      if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString();
    }
    if (typeof value._seconds === 'number') {
      const d = new Date(value._seconds * 1000);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  }
  return undefined;
}

function parsePositiveInt(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.trunc(n);
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffDays(a, b) {
  const da = new Date(`${a}T00:00:00Z`);
  const db = new Date(`${b}T00:00:00Z`);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return null;
  return Math.round((db - da) / 86400000);
}

function getDow(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCDay();
}

function normalizeRecurringWeekdayToken(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/s$/, '');
  return WEEKDAY_TOKEN_TO_CANONICAL[normalized] || '';
}

function normalizeRecurringWeekdayList(value) {
  if (value == null) return [];

  let rawValues = [];
  if (Array.isArray(value)) {
    rawValues = value;
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        rawValues = parsed;
      } else {
        rawValues = trimmed.split(/[\s,|/]+/);
      }
    } catch {
      rawValues = trimmed.split(/[\s,|/]+/);
    }
  } else {
    rawValues = [value];
  }

  return [...new Set(rawValues.map((entry) => normalizeRecurringWeekdayToken(entry)).filter(Boolean))];
}

function normalizeRecurringWeekInterval(value) {
  const parsed = parsePositiveInt(value);
  return parsed && parsed > 0 ? parsed : 1;
}

function getRecurringPattern(data) {
  const meta = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
  return normalizePattern(
    firstPresent(data.recurringPattern, data.recurrencePattern, meta.recurringPattern, meta.recurrencePattern) ||
      'none'
  );
}

function resolveRecurringRule(data) {
  const meta = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
  const recurringPattern = getRecurringPattern(data);
  const recurringDaysOfWeek = normalizeRecurringWeekdayList(
    firstPresent(
      data.recurringDaysOfWeek,
      data.recurrenceDaysOfWeek,
      meta.recurringDaysOfWeek,
      meta.recurrenceDaysOfWeek
    )
  );
  const recurringWeekdaySequence = normalizeRecurringWeekdayList(
    firstPresent(
      data.recurringWeekdaySequence,
      data.recurrenceWeekdaySequence,
      meta.recurringWeekdaySequence,
      meta.recurrenceWeekdaySequence
    )
  );
  const recurringWeekInterval = normalizeRecurringWeekInterval(
    firstPresent(
      data.recurringWeekInterval,
      data.recurrenceWeekInterval,
      meta.recurringWeekInterval,
      meta.recurrenceWeekInterval
    )
  );

  if (recurringWeekdaySequence.length > 0) {
    return {
      kind: 'weekly_sequence',
      pattern: 'weekly_custom',
      recurringDaysOfWeek: [],
      recurringWeekdaySequence,
      recurringWeekInterval,
    };
  }

  if (recurringDaysOfWeek.length > 0) {
    return {
      kind: 'weekly_multi',
      pattern: recurringDaysOfWeek.length === 1 ? `weekly_${recurringDaysOfWeek[0]}` : 'weekly_custom',
      recurringDaysOfWeek,
      recurringWeekdaySequence: [],
      recurringWeekInterval,
    };
  }

  if (recurringPattern === 'daily') {
    return {
      kind: 'daily',
      pattern: recurringPattern,
      recurringDaysOfWeek: [],
      recurringWeekdaySequence: [],
      recurringWeekInterval: 1,
    };
  }

  if (recurringPattern === 'monthly') {
    return {
      kind: 'monthly',
      pattern: recurringPattern,
      recurringDaysOfWeek: [],
      recurringWeekdaySequence: [],
      recurringWeekInterval: 1,
    };
  }

  const match = recurringPattern.match(/^weekly_([a-z]+)$/);
  if (match) {
    const weekday = normalizeRecurringWeekdayToken(match[1]);
    if (weekday) {
      return {
        kind: 'weekly_multi',
        pattern: recurringPattern,
        recurringDaysOfWeek: [weekday],
        recurringWeekdaySequence: [],
        recurringWeekInterval: 1,
      };
    }
  }

  return {
    kind: 'none',
    pattern: 'none',
    recurringDaysOfWeek: [],
    recurringWeekdaySequence: [],
    recurringWeekInterval: 1,
  };
}

function getLifecycle(data) {
  const meta = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
  return {
    recurrenceUntilDate: normalizeIsoDate(
      firstPresent(
        data.recurrenceUntilDate,
        data.recurrenceEndDate,
        data.recurrenceUntil,
        data.untilDate,
        data.repeatUntil,
        data.recursUntil,
        meta.recurrenceUntilDate,
        meta.recurrenceEndDate,
        meta.recurrenceUntil,
        meta.untilDate,
        meta.repeatUntil,
        meta.recursUntil
      )
    ),
    totalOccurrences: parsePositiveInt(
      firstPresent(
        data.totalOccurrences,
        data.occurrenceCount,
        data.occurrences,
        data.numberOfOccurrences,
        data.numberOfRecurrences,
        data.numRecurrences,
        data.recurrenceCount,
        data.totalRecurrences,
        meta.totalOccurrences,
        meta.occurrenceCount,
        meta.occurrences,
        meta.numberOfOccurrences,
        meta.numberOfRecurrences,
        meta.numRecurrences,
        meta.recurrenceCount,
        meta.totalRecurrences
      )
    ),
  };
}

function isOccurrenceOnDate(baseStartDate, recurringRule, occurrenceDate) {
  const daysDiff = diffDays(baseStartDate, occurrenceDate);
  if (daysDiff === null || daysDiff < 0) return false;

  if (recurringRule.kind === 'daily') return true;

  if (recurringRule.kind === 'monthly') {
    const base = new Date(`${baseStartDate}T00:00:00Z`);
    const occ = new Date(`${occurrenceDate}T00:00:00Z`);
    if (Number.isNaN(base.getTime()) || Number.isNaN(occ.getTime())) return false;
    return base.getUTCDate() === occ.getUTCDate();
  }

  const occurrenceDow = getDow(occurrenceDate);
  if (occurrenceDow === null) return false;
  const weekIndex = Math.floor(daysDiff / 7);

  if (recurringRule.kind === 'weekly_sequence') {
    if (weekIndex % recurringRule.recurringWeekInterval !== 0) return false;
    const sequenceIndex =
      Math.floor(weekIndex / recurringRule.recurringWeekInterval) % recurringRule.recurringWeekdaySequence.length;
    const targetDow = WEEKDAY_INDEX[recurringRule.recurringWeekdaySequence[sequenceIndex]];
    return targetDow !== undefined && targetDow === occurrenceDow;
  }

  if (recurringRule.kind === 'weekly_multi') {
    if (weekIndex % recurringRule.recurringWeekInterval !== 0) return false;
    return recurringRule.recurringDaysOfWeek.some((day) => WEEKDAY_INDEX[day] === occurrenceDow);
  }

  return false;
}

function calculateOccurrenceNumber(baseStartDate, recurringRule, occurrenceDate) {
  const daysDiff = diffDays(baseStartDate, occurrenceDate);
  if (daysDiff === null || daysDiff < 0) return null;

  if (recurringRule.kind === 'daily') return daysDiff + 1;

  if (recurringRule.kind === 'monthly') {
    const base = new Date(`${baseStartDate}T00:00:00Z`);
    const occ = new Date(`${occurrenceDate}T00:00:00Z`);
    if (base.getUTCDate() !== occ.getUTCDate()) return null;
    return (
      (occ.getUTCFullYear() - base.getUTCFullYear()) * 12 +
      (occ.getUTCMonth() - base.getUTCMonth()) +
      1
    );
  }

  let cursor = baseStartDate;
  let found = 0;
  for (let guard = 0; guard < 3660; guard += 1) {
    if (isOccurrenceOnDate(baseStartDate, recurringRule, cursor)) {
      found += 1;
      if (cursor === occurrenceDate) return found;
    }
    if (cursor === occurrenceDate) return null;
    cursor = addDays(cursor, 1);
    if (!cursor) break;
  }
  return null;
}

function isOccurrenceWithinLifecycle(baseStartDate, recurringRule, occurrenceDate, lifecycle) {
  if (!occurrenceDate) return false;
  if (lifecycle.recurrenceUntilDate && occurrenceDate > lifecycle.recurrenceUntilDate) return false;
  if (lifecycle.totalOccurrences) {
    const occurrenceNumber = calculateOccurrenceNumber(baseStartDate, recurringRule, occurrenceDate);
    if (occurrenceNumber !== null && occurrenceNumber > lifecycle.totalOccurrences) return false;
  }
  return true;
}

function getNextOccurrence(baseStartDate, recurringRule, referenceDate, lifecycle) {
  let cursor = baseStartDate >= referenceDate ? baseStartDate : referenceDate;

  for (let guard = 0; guard < 366; guard += 1) {
    if (
      isOccurrenceOnDate(baseStartDate, recurringRule, cursor) &&
      isOccurrenceWithinLifecycle(baseStartDate, recurringRule, cursor, lifecycle)
    ) {
      return cursor;
    }
    cursor = addDays(cursor, 1);
    if (!cursor) break;
  }
  return null;
}

function parseTimeToMinutes(value) {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function minutesToTime(value) {
  if (!Number.isFinite(value)) return null;
  const normalized = ((value % 1440) + 1440) % 1440;
  const hours = String(Math.floor(normalized / 60)).padStart(2, '0');
  const minutes = String(normalized % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function getDurationDays(startDate, endDate, startTime, endTime) {
  const daysDiff = diffDays(startDate, endDate);
  if (daysDiff === null) return 0;
  if (daysDiff > 0) return daysDiff;
  if (daysDiff === 0 && startTime && endTime) {
    const startMinutes = parseTimeToMinutes(startTime);
    const endMinutes = parseTimeToMinutes(endTime);
    if (startMinutes !== null && endMinutes !== null && endMinutes < startMinutes) return 1;
  }
  return 0;
}

function getExpectedOccurrenceLocalEndDate(startDate, startTime, endTime, recurringRule) {
  if (!startDate || !recurringRule || recurringRule.kind === 'none') return null;
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  if (startMinutes !== null && endMinutes !== null && endMinutes < startMinutes) {
    return addDays(startDate, 1) || startDate;
  }
  return startDate;
}

function isLegitimateOvernightCarryover(baseStartDate, asOfDate, startTime, endTime, recurringRule) {
  if (!baseStartDate || !asOfDate || !recurringRule || recurringRule.kind === 'none') return false;

  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  if (startMinutes === null || endMinutes === null || endMinutes >= startMinutes) {
    return false;
  }

  const expectedEndDate = getExpectedOccurrenceLocalEndDate(
    baseStartDate,
    startTime,
    endTime,
    recurringRule
  );
  if (!expectedEndDate || expectedEndDate !== asOfDate) {
    return false;
  }

  return isOccurrenceOnDate(baseStartDate, recurringRule, baseStartDate);
}

function getDurationMinutes(startDate, endDate, startTime, endTime) {
  if (!startDate || !endDate || !startTime || !endTime) return null;
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  const daySpan = diffDays(startDate, endDate);
  if (startMinutes === null || endMinutes === null || daySpan === null) return null;
  if (daySpan === 0) {
    return endMinutes >= startMinutes ? endMinutes - startMinutes : endMinutes + 1440 - startMinutes;
  }
  if (daySpan === 1 && endMinutes < startMinutes) {
    return 1440 - startMinutes + endMinutes;
  }
  return null;
}

function getText(data) {
  const meta = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
  return [
    data.title,
    data.name,
    data.eventName,
    meta.title,
    meta.name,
    meta.eventName,
    data.description,
    meta.description,
  ]
    .filter(Boolean)
    .join(' ');
}

function getTitle(data) {
  const meta = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
  return firstPresent(data.eventName, data.name, data.title, meta.eventName, meta.name, meta.title) || '';
}

function parseIsEvent(data) {
  const meta = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
  const isFoodSpecial = parseBoolLike(firstPresent(data.isFoodSpecial, meta.isFoodSpecial)) === true;
  if (isFoodSpecial) return false;
  const isEvent = parseBoolLike(firstPresent(data.isEvent, meta.isEvent));
  return isEvent !== null ? isEvent : true;
}

function getVenueName(data, docPath) {
  const meta = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
  const pathVenueId = docPath.split('/')[1] || '';
  return (
    firstPresent(
      data.venue,
      data.venueName,
      data.establishment,
      meta.venue,
      meta.venueName,
      meta.establishment,
      data.venueId,
      pathVenueId
    ) || pathVenueId
  );
}

function getRuleWeekdays(recurringRule) {
  if (recurringRule.kind === 'weekly_sequence') {
    return [...new Set(recurringRule.recurringWeekdaySequence)];
  }
  if (recurringRule.kind === 'weekly_multi') {
    return [...new Set(recurringRule.recurringDaysOfWeek)];
  }
  return [];
}

function expandWeekdayRange(startDay, endDay) {
  const startIndex = WEEKDAY_INDEX[startDay];
  const endIndex = WEEKDAY_INDEX[endDay];
  if (startIndex === undefined || endIndex === undefined) return [];
  const days = [];
  let index = startIndex;
  for (let guard = 0; guard < 7; guard += 1) {
    days.push(WEEKDAY_ORDER[index]);
    if (index === endIndex) return days;
    index = (index + 1) % 7;
  }
  return days;
}

function extractWeekdaysFromText(text) {
  const normalized = normalizeWeekdayExtractionText(text);
  const days = new Set();
  let hasStructuredCue = false;

  const rangePatterns = [
    /\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b\s*(?:to|through|thru|-)\s*\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/g,
    /\bbetween\s+(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b\s+and\s+\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/g,
    /\bfrom\s+(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b\s+to\s+\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/g,
  ];
  for (const rangePattern of rangePatterns) {
    for (const match of normalized.matchAll(rangePattern)) {
      const start = normalizeRecurringWeekdayToken(match[1]);
      const end = normalizeRecurringWeekdayToken(match[2]);
      for (const day of expandWeekdayRange(start, end)) days.add(day);
      hasStructuredCue = true;
    }
  }

  const listPattern =
    /\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b(?:\s*(?:,|&|and|\/)\s*\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b)+/g;
  for (const match of normalized.matchAll(listPattern)) {
    const parts = match[0].split(/\s*(?:,|&|and|\/)\s*/);
    for (const part of parts) {
      const day = normalizeRecurringWeekdayToken(part);
      if (day) days.add(day);
    }
    hasStructuredCue = true;
  }

  const singlePattern =
    /\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/g;
  for (const match of normalized.matchAll(singlePattern)) {
    const day = normalizeRecurringWeekdayToken(match[1]);
    if (day) days.add(day);
  }

  return {
    days: WEEKDAY_ORDER.filter((day) => days.has(day)),
    hasStructuredCue,
  };
}

function applyMeridiem(minutes, meridiem) {
  if (minutes === null || !meridiem) return null;
  const hour12 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  let hour24 = hour12 % 12;
  if (meridiem === 'pm') hour24 += 12;
  return hour24 * 60 + minute;
}

function inferRangeTimes(startToken, startMeridiem, endToken, endMeridiem) {
  const parseToken = (token) => {
    const match = String(token || '').trim().match(/^(\d{1,2})(?::(\d{2}))?$/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2] || 0);
  };

  const startBase = parseToken(startToken);
  const endBase = parseToken(endToken);
  if (startBase === null || endBase === null) return null;
  const normalizedStartMeridiem = String(startMeridiem || '').trim().toLowerCase();
  const normalizedEndMeridiem = String(endMeridiem || '').trim().toLowerCase();
  if (!normalizedStartMeridiem && !normalizedEndMeridiem) return null;

  if (normalizedStartMeridiem && normalizedEndMeridiem) {
    return {
      startMinutes: applyMeridiem(startBase, normalizedStartMeridiem),
      endMinutes: applyMeridiem(endBase, normalizedEndMeridiem),
    };
  }

  if (!normalizedStartMeridiem && normalizedEndMeridiem) {
    const endMinutes = applyMeridiem(endBase, normalizedEndMeridiem);
    let startMinutes = applyMeridiem(startBase, normalizedEndMeridiem);
    if (startMinutes > endMinutes) {
      startMinutes -= 12 * 60;
    }
    if (startMinutes < 0) startMinutes += 24 * 60;
    return { startMinutes, endMinutes };
  }

  if (normalizedStartMeridiem && !normalizedEndMeridiem) {
    const startMinutes = applyMeridiem(startBase, normalizedStartMeridiem);
    let endMinutes = applyMeridiem(endBase, normalizedStartMeridiem);
    if (endMinutes < startMinutes) {
      endMinutes += 12 * 60;
    }
    return { startMinutes, endMinutes: endMinutes % (24 * 60) };
  }

  return null;
}

function extractExplicitTimeRanges(text) {
  const normalized = String(text || '')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\s+/g, ' ');

  const ranges = [];
  const seen = new Set();
  const patterns = [
    /\b(\d{1,2}(?::\d{2})?)\s*(am|pm)\s*(?:-|to)\s*(\d{1,2}(?::\d{2})?)\s*(am|pm)\b/gi,
    /\b(\d{1,2}(?::\d{2})?)\s*(am|pm)?\s*(?:-|to)\s*(\d{1,2}(?::\d{2})?)\s*(am|pm)\b/gi,
  ];

  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const inferred = inferRangeTimes(match[1], match[2] || '', match[3], match[4] || '');
      if (!inferred) continue;
      const duration = inferred.endMinutes >= inferred.startMinutes
        ? inferred.endMinutes - inferred.startMinutes
        : inferred.endMinutes + 1440 - inferred.startMinutes;
      if (duration <= 0 || duration > 12 * 60) continue;
      const startTime = minutesToTime(inferred.startMinutes);
      const endTime = minutesToTime(inferred.endMinutes);
      const key = `${startTime}|${endTime}|${match.index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ranges.push({
        raw: match[0],
        startTime,
        endTime,
        durationMinutes: duration,
      });
    }
  }

  return ranges;
}

function timeDistanceMinutes(a, b) {
  const aMinutes = parseTimeToMinutes(a);
  const bMinutes = parseTimeToMinutes(b);
  if (aMinutes === null || bMinutes === null) return Number.POSITIVE_INFINITY;
  const direct = Math.abs(aMinutes - bMinutes);
  return Math.min(direct, 1440 - direct);
}

function selectBestExplicitTimeRange(text, startTime, endTime) {
  const ranges = extractExplicitTimeRanges(text);
  if (ranges.length === 0) return null;
  if (!startTime && !endTime) return ranges[0];

  let best = ranges[0];
  let bestScore = Number.POSITIVE_INFINITY;

  for (const range of ranges) {
    const startScore = startTime ? timeDistanceMinutes(startTime, range.startTime) : 0;
    const endScore = endTime ? timeDistanceMinutes(endTime, range.endTime) : 0;
    const score = startScore + endScore;
    if (score < bestScore) {
      best = range;
      bestScore = score;
    }
  }

  return best;
}

function looksLikeShortFormProgram(text, category) {
  if (
    /\b(food special|drink special|happy hour|wing night|lunch|dinner|brunch|breakfast|supper)\b/i.test(
      `${String(category || '')} ${String(text || '')}`
    )
  ) {
    return false;
  }
  const normalized = `${String(category || '')} ${String(text || '')}`.toLowerCase();
  return /\b(class|classes|workshop|workshops|tai chi|yoga|dance|lesson|lessons|training|fitness|body bar|rueda|salsa|bachata|heels|belly dance|kids|art|craft|trivia|masterclass|beginner|session|sessions|group|drop-?in)\b/.test(
    normalized
  );
}

function matchesStoredTimeRange(explicitTimeRange, startTime, endTime) {
  if (!explicitTimeRange || !startTime || !endTime) return false;
  const explicitStartMinutes = parseTimeToMinutes(explicitTimeRange.startTime);
  const explicitEndMinutes = parseTimeToMinutes(explicitTimeRange.endTime);
  const storedStartMinutes = parseTimeToMinutes(startTime);
  const storedEndMinutes = parseTimeToMinutes(endTime);
  return (
    explicitStartMinutes !== null &&
    explicitEndMinutes !== null &&
    storedStartMinutes !== null &&
    storedEndMinutes !== null &&
    explicitStartMinutes === storedStartMinutes &&
    explicitEndMinutes === storedEndMinutes
  );
}

function isExplicitBoundedOpenHoursSeries({
  title,
  text,
  category,
  startTime,
  endTime,
  explicitTimeRange,
  recurringRule,
  lifecycle,
}) {
  if (!matchesStoredTimeRange(explicitTimeRange, startTime, endTime)) return false;
  if (!lifecycle?.recurrenceUntilDate) return false;
  if (recurringRule.kind !== 'weekly_multi' || recurringRule.recurringDaysOfWeek.length < 2) return false;

  const normalized = `${String(title || '')} ${String(category || '')} ${String(text || '')}`.toLowerCase();
  const hasOpenHoursCue =
    /\bopen(?::|\s)/.test(normalized) ||
    /\b(mon|monday)\s*-\s*(fri|friday)\b/.test(normalized) ||
    /\bmonday\s*-\s*friday\b/.test(normalized);
  const hasExhibitCue =
    /\b(show|showcase|sale|gallery|framing|exhibit|exhibition|opening reception|open house|art show)\b/.test(
      normalized
    );

  return hasOpenHoursCue && hasExhibitCue;
}

function shouldFlagSuspiciousLongDuration({
  title,
  text,
  category,
  startTime,
  endTime,
  durationMinutes,
  explicitTimeRange,
  recurringRule,
  lifecycle,
}) {
  const isProgramLike = looksLikeShortFormProgram(text, category);
  const isMatchingDropInWorkshop =
    /\bdrop-?in\b/i.test(String(text || '')) && matchesStoredTimeRange(explicitTimeRange, startTime, endTime);
  const isMatchingBoundedOpenHoursSeries = isExplicitBoundedOpenHoursSeries({
    title,
    text,
    category,
    startTime,
    endTime,
    explicitTimeRange,
    recurringRule,
    lifecycle,
  });

  return (
    durationMinutes !== null &&
    durationMinutes >= 6 * 60 &&
    isProgramLike &&
    !isMatchingDropInWorkshop &&
    !isMatchingBoundedOpenHoursSeries
  );
}

function severityRank(severity) {
  return { high: 0, medium: 1, low: 2 }[severity] ?? 3;
}

function getRuleWeekdaysFromFinding(finding) {
  if (Array.isArray(finding.recurringWeekdaySequence) && finding.recurringWeekdaySequence.length > 0) {
    return [...new Set(finding.recurringWeekdaySequence)];
  }
  if (Array.isArray(finding.recurringDaysOfWeek) && finding.recurringDaysOfWeek.length > 0) {
    return [...new Set(finding.recurringDaysOfWeek)];
  }
  const match = String(finding.recurringPattern || '').match(/^weekly_([a-z]+)$/);
  if (!match) return [];
  const weekday = normalizeRecurringWeekdayToken(match[1]);
  return weekday ? [weekday] : [];
}

function normalizeComparableText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function suppressSplitWeekdayMismatchFindings(findings) {
  const grouped = new Map();

  for (const finding of findings) {
    const hasWeekdayMismatch = Array.isArray(finding.issues)
      ? finding.issues.some((issue) => issue?.type === 'weekday_mismatch')
      : false;
    if (!hasWeekdayMismatch) continue;

    const textWeekdays = Array.isArray(finding.textWeekdays) ? [...new Set(finding.textWeekdays)] : [];
    const ruleWeekdays = getRuleWeekdaysFromFinding(finding);
    if (textWeekdays.length < 2 || ruleWeekdays.length !== 1) continue;

    const venuePath = String(finding.path || '')
      .split('/')
      .slice(0, 2)
      .join('/');
    const key = [
      venuePath,
      normalizeComparableText(finding.title),
      normalizeComparableText(finding.category),
      String(finding.startTime || ''),
      String(finding.endTime || ''),
      textWeekdays.join(','),
    ].join('|');

    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push({
      finding,
      textWeekdays,
      ruleWeekdays,
    });
  }

  for (const entries of grouped.values()) {
    if (entries.length < 2) continue;

    const textWeekdays = entries[0].textWeekdays;
    const unionRuleWeekdays = new Set(entries.flatMap((entry) => entry.ruleWeekdays));
    if (unionRuleWeekdays.size < 2) continue;

    const matchesTextWeekdays =
      unionRuleWeekdays.size === textWeekdays.length &&
      textWeekdays.every((day) => unionRuleWeekdays.has(day));
    if (!matchesTextWeekdays) continue;

    for (const entry of entries) {
      entry.finding.issues = entry.finding.issues.filter((issue) => issue?.type !== 'weekday_mismatch');
    }
  }
}

function suppressSourceFamilyWeekdayMismatchFindings(findings) {
  const grouped = new Map();

  for (const finding of findings) {
    const hasWeekdayMismatch = Array.isArray(finding.issues)
      ? finding.issues.some((issue) => issue?.type === 'weekday_mismatch')
      : false;
    if (!hasWeekdayMismatch) continue;

    const textWeekdays = Array.isArray(finding.textWeekdays) ? [...new Set(finding.textWeekdays)] : [];
    const ruleWeekdays = getRuleWeekdaysFromFinding(finding);
    if (textWeekdays.length < 2 || ruleWeekdays.length !== 1) continue;

    const venuePath = String(finding.path || '')
      .split('/')
      .slice(0, 2)
      .join('/');
    const sourceTimestamp = String(finding.sourceTimestamp || '').trim();
    const titleKey = normalizeComparableText(finding.title);
    const categoryKey = normalizeComparableText(finding.category);
    const recurrenceUntilDate = String(finding.recurrenceUntilDate || '').trim();

    const keys = [];
    if (venuePath && sourceTimestamp) {
      keys.push(['source', venuePath, sourceTimestamp].join('|'));
    }
    if (venuePath && titleKey && categoryKey && recurrenceUntilDate) {
      keys.push(['family', venuePath, titleKey, categoryKey, recurrenceUntilDate].join('|'));
    }
    if (keys.length === 0) continue;

    for (const key of keys) {
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push({
        finding,
        textWeekdays,
        ruleWeekdays,
      });
    }
  }

  for (const entries of grouped.values()) {
    if (entries.length < 2) continue;

    const unionRuleWeekdays = new Set(entries.flatMap((entry) => entry.ruleWeekdays));
    if (unionRuleWeekdays.size < 2) continue;

    for (const entry of entries) {
      const coversTextWeekdays =
        entry.textWeekdays.length > 1 && entry.textWeekdays.every((day) => unionRuleWeekdays.has(day));
      if (!coversTextWeekdays) continue;
      entry.finding.issues = entry.finding.issues.filter((issue) => issue?.type !== 'weekday_mismatch');
    }
  }
}

async function main() {
  const snapshot = await getDb()
    .collectionGroup('events')
    .select(
      'title',
      'name',
      'eventName',
      'description',
      'startDate',
      'endDate',
      'startTime',
      'endTime',
      'isRecurring',
      'recurringPattern',
      'recurringDaysOfWeek',
      'recurringWeekdaySequence',
      'recurringWeekInterval',
      'recurrencePattern',
      'recurrenceUntilDate',
      'recurrenceEndDate',
      'recurrenceUntil',
      'untilDate',
      'repeatUntil',
      'recursUntil',
      'totalOccurrences',
      'occurrenceCount',
      'occurrences',
      'numberOfOccurrences',
      'numberOfRecurrences',
      'numRecurrences',
      'recurrenceCount',
      'totalRecurrences',
      'createdAt',
      'updatedAt',
      'lastSeenAt',
      'sourceTimestamp',
      'venue',
      'venueName',
      'venueId',
      'establishment',
      'category',
      'isEvent',
      'isFoodSpecial',
      'metadata'
    )
    .get();

  const summary = {
    asOfDate: AS_OF_DATE,
    next7WindowEnd: NEXT_7_END,
    scanned: snapshot.size,
    recurringScanned: 0,
    docsWithIssues: 0,
    highSeverityDocs: 0,
    todayWindowMismatchDocs: 0,
    stretchedSeriesEndDateDocs: 0,
    explicitTimeMismatchDocs: 0,
    suspiciousLongDurationDocs: 0,
    weekdayMismatchDocs: 0,
    issuesMaterializingNext7: 0,
  };

  const findings = [];

  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    const meta = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
    const recurringRule = resolveRecurringRule(data);
    const explicitRecurring = parseBoolLike(firstPresent(data.isRecurring, meta.isRecurring));
    const hasPattern =
      recurringRule.kind !== 'none' &&
      recurringRule.pattern &&
      recurringRule.pattern !== 'none' &&
      recurringRule.pattern !== 'n/a' &&
      recurringRule.pattern !== 'false';
    const isRecurring = explicitRecurring !== null ? explicitRecurring || hasPattern : Boolean(hasPattern);
    if (!isRecurring) continue;

    summary.recurringScanned += 1;

    const title = getTitle(data);
    const text = getText(data);
    const category = firstPresent(data.category, meta.category) || '';
    const startDate = normalizeIsoDate(firstPresent(data.startDate, meta.startDate));
    const endDate = normalizeIsoDate(firstPresent(data.endDate, meta.endDate)) || startDate;
    const startTime = firstPresent(data.startTime, meta.startTime) || '';
    const endTime = firstPresent(data.endTime, meta.endTime) || '';
    const lifecycle = getLifecycle(data);
    const nextOccurrence = startDate ? getNextOccurrence(startDate, recurringRule, AS_OF_DATE, lifecycle) : null;
    const occursToday =
      startDate &&
      isOccurrenceOnDate(startDate, recurringRule, AS_OF_DATE) &&
      isOccurrenceWithinLifecycle(startDate, recurringRule, AS_OF_DATE, lifecycle);
    const baseWindowIncludesToday = Boolean(startDate && endDate && startDate <= AS_OF_DATE && endDate >= AS_OF_DATE);
    const durationDays = startDate && endDate ? getDurationDays(startDate, endDate, startTime, endTime) : 0;
    const durationMinutes = getDurationMinutes(startDate, endDate, startTime, endTime);
    const expectedOccurrenceLocalEndDate = getExpectedOccurrenceLocalEndDate(
      startDate,
      startTime,
      endTime,
      recurringRule
    );
    const ruleWeekdays = getRuleWeekdays(recurringRule);
    const textWeekdaysInfo = extractWeekdaysFromText(text);
    const textWeekdays = textWeekdaysInfo.days;
    const explicitTimeRange = selectBestExplicitTimeRange(text, startTime, endTime);
    const issues = [];

    const canFlagTodayWindowMismatch =
      recurringRule.kind !== 'none' &&
      !isLegitimateOvernightCarryover(startDate, AS_OF_DATE, startTime, endTime, recurringRule);

    if (canFlagTodayWindowMismatch && baseWindowIncludesToday && !occursToday) {
      issues.push({
        type: 'today_window_mismatch',
        severity: 'high',
        reason: `Base doc spans ${startDate} to ${endDate}, so a naive consumer can treat it as active on ${AS_OF_DATE} even though the recurrence rule does not occur today.`,
      });
      summary.todayWindowMismatchDocs += 1;
    }

    if (
      startDate &&
      endDate &&
      expectedOccurrenceLocalEndDate &&
      endDate !== expectedOccurrenceLocalEndDate
    ) {
      const spanDays = diffDays(startDate, endDate);
      issues.push({
        type: 'stretched_series_end_date',
        severity: baseWindowIncludesToday && !occursToday ? 'high' : spanDays >= 7 ? 'high' : 'medium',
        reason: `Recurring base doc stores endDate ${endDate}, but the occurrence-local endDate should be ${expectedOccurrenceLocalEndDate}.`,
      });
      summary.stretchedSeriesEndDateDocs += 1;
    }

    if (explicitTimeRange && startTime && endTime) {
      const storedStartMinutes = parseTimeToMinutes(startTime);
      const storedEndMinutes = parseTimeToMinutes(endTime);
      const explicitStartMinutes = parseTimeToMinutes(explicitTimeRange.startTime);
      const explicitEndMinutes = parseTimeToMinutes(explicitTimeRange.endTime);
      const startDelta =
        storedStartMinutes !== null && explicitStartMinutes !== null
          ? Math.abs(storedStartMinutes - explicitStartMinutes)
          : 0;
      const endDelta =
        storedEndMinutes !== null && explicitEndMinutes !== null
          ? Math.abs(storedEndMinutes - explicitEndMinutes)
          : 0;
      if (startDelta >= 30 || endDelta >= 30) {
        issues.push({
          type: 'explicit_time_mismatch',
          severity: startDelta >= 60 || endDelta >= 60 ? 'high' : 'medium',
          reason: `Text says ${explicitTimeRange.startTime}-${explicitTimeRange.endTime} (${explicitTimeRange.raw}), but stored time is ${startTime}-${endTime}.`,
        });
        summary.explicitTimeMismatchDocs += 1;
      }
    }

    if (
      shouldFlagSuspiciousLongDuration({
        title,
        text,
        category,
        startTime,
        endTime,
        durationMinutes,
        explicitTimeRange,
        recurringRule,
        lifecycle,
      })
    ) {
      issues.push({
        type: 'suspicious_long_duration',
        severity: durationMinutes >= 10 * 60 ? 'high' : 'medium',
        reason: `Stored time window is ${startTime}-${endTime} (${Math.round(durationMinutes / 60)}h) for a program/class-style event.`,
      });
      summary.suspiciousLongDurationDocs += 1;
    }

    if (textWeekdays.length > 0 && ruleWeekdays.length > 0) {
      const textSet = new Set(textWeekdays);
      const ruleSet = new Set(ruleWeekdays);
      const sameWeekdays =
        textSet.size === ruleSet.size && [...textSet].every((day) => ruleSet.has(day));
      const shouldCompareWeekdays =
        textWeekdays.length === 1 || (textWeekdaysInfo.hasStructuredCue && textWeekdays.length > 1);
      if (shouldCompareWeekdays && !sameWeekdays) {
        issues.push({
          type: 'weekday_mismatch',
          severity: textWeekdays.length === 1 && ruleWeekdays.length === 1 ? 'high' : 'medium',
          reason: `Text weekday cue is [${textWeekdays.join(', ')}], but recurrence rule resolves to [${ruleWeekdays.join(', ')}].`,
        });
        summary.weekdayMismatchDocs += 1;
      }
    }

    if (issues.length === 0) continue;

    const highestSeverity = issues.map((issue) => issue.severity).sort((a, b) => severityRank(a) - severityRank(b))[0];
    if (highestSeverity === 'high') summary.highSeverityDocs += 1;
    if (nextOccurrence && nextOccurrence >= AS_OF_DATE && nextOccurrence <= NEXT_7_END) {
      summary.issuesMaterializingNext7 += 1;
    }
    summary.docsWithIssues += 1;

    findings.push({
      severity: highestSeverity,
      path: doc.ref.path,
      id: doc.id,
      venue: getVenueName(data, doc.ref.path),
      title,
      category,
      startDate,
      endDate,
      startTime,
      endTime,
      durationDays,
      durationMinutes,
      recurringPattern: recurringRule.pattern,
      recurringDaysOfWeek: recurringRule.recurringDaysOfWeek,
      recurringWeekdaySequence: recurringRule.recurringWeekdaySequence,
      recurringWeekInterval: recurringRule.recurringWeekInterval,
      recurrenceUntilDate: lifecycle.recurrenceUntilDate || null,
      totalOccurrences: lifecycle.totalOccurrences ?? null,
      baseWindowIncludesToday,
      occursToday,
      nextOccurrence,
      textWeekdays,
      explicitTimeRange,
      createdAt: timestampToIso(data.createdAt),
      updatedAt: timestampToIso(data.updatedAt),
      lastSeenAt: timestampToIso(data.lastSeenAt),
      sourceTimestamp: timestampToIso(data.sourceTimestamp),
      issues,
      descriptionPreview: String(data.description || meta.description || '').slice(0, 260),
    });
  }

  suppressSourceFamilyWeekdayMismatchFindings(findings);
  suppressSplitWeekdayMismatchFindings(findings);

  const finalizedFindings = findings
    .filter((finding) => Array.isArray(finding.issues) && finding.issues.length > 0)
    .map((finding) => ({
      ...finding,
      severity: finding.issues
        .map((issue) => issue.severity)
        .sort((a, b) => severityRank(a) - severityRank(b))[0],
    }));

  summary.docsWithIssues = finalizedFindings.length;
  summary.highSeverityDocs = finalizedFindings.filter((finding) => finding.severity === 'high').length;
  summary.todayWindowMismatchDocs = finalizedFindings.filter((finding) =>
    finding.issues.some((issue) => issue.type === 'today_window_mismatch')
  ).length;
  summary.stretchedSeriesEndDateDocs = finalizedFindings.filter((finding) =>
    finding.issues.some((issue) => issue.type === 'stretched_series_end_date')
  ).length;
  summary.explicitTimeMismatchDocs = finalizedFindings.filter((finding) =>
    finding.issues.some((issue) => issue.type === 'explicit_time_mismatch')
  ).length;
  summary.suspiciousLongDurationDocs = finalizedFindings.filter((finding) =>
    finding.issues.some((issue) => issue.type === 'suspicious_long_duration')
  ).length;
  summary.weekdayMismatchDocs = finalizedFindings.filter((finding) =>
    finding.issues.some((issue) => issue.type === 'weekday_mismatch')
  ).length;
  summary.issuesMaterializingNext7 = finalizedFindings.filter((finding) =>
    finding.nextOccurrence && finding.nextOccurrence >= AS_OF_DATE && finding.nextOccurrence <= NEXT_7_END
  ).length;

  finalizedFindings.sort((a, b) => {
    if (severityRank(a.severity) !== severityRank(b.severity)) {
      return severityRank(a.severity) - severityRank(b.severity);
    }
    const aToday = a.issues.some((issue) => issue.type === 'today_window_mismatch');
    const bToday = b.issues.some((issue) => issue.type === 'today_window_mismatch');
    if (aToday !== bToday) return aToday ? -1 : 1;
    const aNext = a.nextOccurrence || '';
    const bNext = b.nextOccurrence || '';
    return aNext.localeCompare(bNext);
  });

  const issuesByType = Object.entries(
    finalizedFindings.reduce((acc, finding) => {
      for (const issue of finding.issues) {
        acc[issue.type] = (acc[issue.type] || 0) + 1;
      }
      return acc;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ type, count }));

  const topVenues = Object.entries(
    finalizedFindings.reduce((acc, finding) => {
      acc[finding.venue] = (acc[finding.venue] || 0) + 1;
      return acc;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([venue, count]) => ({ venue, count }));

  const report = {
    summary,
    issuesByType,
    topVenues,
    allResultsCount: finalizedFindings.length,
    findings: finalizedFindings,
    samples: finalizedFindings.slice(0, 100),
  };

  const outPath = path.join(process.cwd(), `tmp_recurrence_integrity_report_${AS_OF_DATE}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outPath, summary, issuesByType, sampleCount: report.samples.length }, null, 2));
}

module.exports = {
  addDays,
  resolveRecurringRule,
  getLifecycle,
  isOccurrenceOnDate,
  isOccurrenceWithinLifecycle,
  getNextOccurrence,
  selectBestExplicitTimeRange,
  looksLikeShortFormProgram,
  matchesStoredTimeRange,
  isExplicitBoundedOpenHoursSeries,
  shouldFlagSuspiciousLongDuration,
};

if (require.main === module) {
  main()
    .then(async () => {
      await shutdownDb();
    })
    .catch(async (error) => {
      console.error(error);
      try {
        await shutdownDb();
      } catch {}
      process.exit(1);
    });
}
