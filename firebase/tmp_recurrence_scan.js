const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const serviceAccount = require(path.join(process.cwd(), 'service-account.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();
const AS_OF_DATE = '2026-04-01';
const NEXT_7_END = '2026-04-08';

function parseBoolLike(value) {
  if (value === true || value === false) return value;
  const s = String(value ?? '').trim().toLowerCase();
  if (!s) return null;
  if (['true', '1', 'yes', 'y'].includes(s)) return true;
  if (['false', '0', 'no', 'n'].includes(s)) return false;
  return null;
}

function firstPresent(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return undefined;
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

const WEEKDAY_TOKEN_TO_CANONICAL = {
  sunday: 'sunday',
  sun: 'sunday',
  monday: 'monday',
  mon: 'monday',
  tuesday: 'tuesday',
  tue: 'tuesday',
  tues: 'tuesday',
  wednesday: 'wednesday',
  wed: 'wednesday',
  thursday: 'thursday',
  thu: 'thursday',
  thur: 'thursday',
  thurs: 'thursday',
  friday: 'friday',
  fri: 'friday',
  saturday: 'saturday',
  sat: 'saturday',
};

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

  if (recurringRule.kind === 'daily') {
    return true;
  }

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
    const dayMap = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };
    const sequenceIndex =
      Math.floor(weekIndex / recurringRule.recurringWeekInterval) %
      recurringRule.recurringWeekdaySequence.length;
    const targetDow = dayMap[recurringRule.recurringWeekdaySequence[sequenceIndex]];
    return targetDow !== undefined && targetDow === occurrenceDow;
  }

  if (recurringRule.kind === 'weekly_multi') {
    if (weekIndex % recurringRule.recurringWeekInterval !== 0) return false;
    const dayMap = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };
    return recurringRule.recurringDaysOfWeek.some((day) => dayMap[day] === occurrenceDow);
  }

  return false;
}

function calculateOccurrenceNumber(baseStartDate, recurringRule, occurrenceDate) {
  const daysDiff = diffDays(baseStartDate, occurrenceDate);
  if (daysDiff === null || daysDiff < 0) return null;

  if (recurringRule.kind === 'daily') {
    return daysDiff + 1;
  }

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

  if (
    recurringRule.kind === 'weekly_multi' &&
    recurringRule.recurringDaysOfWeek.length === 1 &&
    recurringRule.recurringWeekInterval === 1
  ) {
    const dayMap = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };
    const targetDow = dayMap[recurringRule.recurringDaysOfWeek[0]];
    if (targetDow === undefined || getDow(occurrenceDate) !== targetDow || daysDiff % 7 !== 0) {
      return null;
    }
    return Math.floor(daysDiff / 7) + 1;
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
    const n = calculateOccurrenceNumber(baseStartDate, recurringRule, occurrenceDate);
    if (n !== null && n > lifecycle.totalOccurrences) return false;
  }
  return true;
}

function getNextOccurrence(baseStartDate, recurringRule, referenceDate) {
  const anchor = baseStartDate >= referenceDate ? baseStartDate : referenceDate;

  if (recurringRule.kind === 'daily') {
    return anchor;
  }

  if (recurringRule.kind === 'monthly') {
    const base = new Date(`${baseStartDate}T00:00:00Z`);
    const ref = new Date(`${anchor}T00:00:00Z`);
    const targetDay = base.getUTCDate();

    for (let monthOffset = 0; monthOffset < 24; monthOffset += 1) {
      const monthIndex = ref.getUTCMonth() + monthOffset;
      const year = ref.getUTCFullYear() + Math.floor(monthIndex / 12);
      const month = ((monthIndex % 12) + 12) % 12;
      const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      if (targetDay > lastDay) continue;
      const candidate = new Date(Date.UTC(year, month, targetDay)).toISOString().slice(0, 10);
      if (candidate >= anchor) return candidate;
    }
    return null;
  }

  if (
    recurringRule.kind === 'weekly_multi' &&
    recurringRule.recurringDaysOfWeek.length === 1 &&
    recurringRule.recurringWeekInterval === 1
  ) {
    const dayMap = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };
    const targetDow = dayMap[recurringRule.recurringDaysOfWeek[0]];
    const anchorDow = getDow(anchor);
    if (targetDow === undefined || anchorDow === null) return null;
    const delta = (targetDow - anchorDow + 7) % 7;
    return addDays(anchor, delta);
  }

  let cursor = anchor;
  for (let guard = 0; guard < 366; guard += 1) {
    if (isOccurrenceOnDate(baseStartDate, recurringRule, cursor)) {
      return cursor;
    }
    cursor = addDays(cursor, 1);
    if (!cursor) break;
  }
  return null;
}

function getDurationDays(startDate, endDate, startTime, endTime) {
  const daysDiff = diffDays(startDate, endDate);
  if (daysDiff === null) return 0;
  if (daysDiff > 0) return daysDiff;
  if (daysDiff === 0 && startTime && endTime) {
    const parseTime = (value) => {
      const match = String(value).trim().match(/^(\d{1,2}):(\d{2})/);
      return match ? Number(match[1]) * 60 + Number(match[2]) : null;
    };
    const startMinutes = parseTime(startTime);
    const endMinutes = parseTime(endTime);
    if (startMinutes !== null && endMinutes !== null && endMinutes < startMinutes) return 1;
  }
  return 0;
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

function hasStrongRecurringCue(text) {
  return /\b(every|each|weekly|daily|everyday|monthly|recurring|repeats?|weekdays?|weekends?|every other|biweekly|mondays|tuesdays|wednesdays|thursdays|fridays|saturdays|sundays)\b/i.test(
    text
  );
}

function hasDailyCue(text) {
  return /\b(everyday|daily|weekdays?|weekends?)\b/i.test(text);
}

function hasConcreteDateCue(text) {
  return (
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?\b/i.test(
      text
    ) ||
    /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i.test(
      text
    ) ||
    /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/.test(text) ||
    /\b\d{4}-\d{2}-\d{2}\b/.test(text)
  );
}

function hasOneOffCue(text) {
  return /\b(tonight|tomorrow|this\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|one night only|doors open|tickets on sale)\b/i.test(text);
}

async function main() {
  const snapshot = await db
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
    scanned: snapshot.size,
    recurring: 0,
    openEndedRecurring: 0,
    openEndedRecurringEvents: 0,
    highRisk: 0,
    mediumRisk: 0,
    activeHighRiskNext7: 0,
    activeMediumRiskNext7: 0,
  };
  const findings = [];

  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    const meta = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
    const recurringRule = resolveRecurringRule(data);
    const recurringPattern = recurringRule.pattern;
    const explicitRecurring = parseBoolLike(firstPresent(data.isRecurring, meta.isRecurring));
    const hasPattern =
      recurringRule.kind !== 'none' &&
      recurringPattern &&
      recurringPattern !== 'none' &&
      recurringPattern !== 'n/a' &&
      recurringPattern !== 'false';
    const isRecurring = explicitRecurring !== null ? explicitRecurring || hasPattern : Boolean(hasPattern);
    if (!isRecurring) continue;
    summary.recurring += 1;

    const lifecycle = getLifecycle(data);
    const openEndedRecurring = !lifecycle.recurrenceUntilDate && !lifecycle.totalOccurrences;
    if (!openEndedRecurring) continue;
    summary.openEndedRecurring += 1;

    const isEvent = parseIsEvent(data);
    if (isEvent) summary.openEndedRecurringEvents += 1;

    const title = getTitle(data);
    const text = getText(data);
    const strongRecurringCue = hasStrongRecurringCue(text);
    const dailyCue = hasDailyCue(text);
    const concreteDateCue = hasConcreteDateCue(text);
    const oneOffCue = hasOneOffCue(text);

    let risk = null;
    if (isEvent && !strongRecurringCue && (concreteDateCue || oneOffCue)) {
      risk = 'high';
      summary.highRisk += 1;
    } else if (isEvent && recurringPattern === 'daily' && !dailyCue) {
      risk = 'medium';
      summary.mediumRisk += 1;
    }
    if (!risk) continue;

    const startDate = normalizeIsoDate(firstPresent(data.startDate, meta.startDate));
    const endDate = normalizeIsoDate(firstPresent(data.endDate, meta.endDate)) || startDate;
    const startTime = firstPresent(data.startTime, meta.startTime) || '';
    const endTime = firstPresent(data.endTime, meta.endTime) || '';
    const nextOccurrence = startDate ? getNextOccurrence(startDate, recurringRule, AS_OF_DATE) : null;
    const durationDays = startDate && endDate ? getDurationDays(startDate, endDate, startTime, endTime) : 0;
    const materializesNext7 = Boolean(
      nextOccurrence &&
        nextOccurrence >= AS_OF_DATE &&
        nextOccurrence <= NEXT_7_END &&
        isOccurrenceWithinLifecycle(startDate, recurringRule, nextOccurrence, lifecycle)
    );
    const synthesizedEndDate = nextOccurrence ? addDays(nextOccurrence, durationDays) || nextOccurrence : null;

    if (risk === 'high' && materializesNext7) summary.activeHighRiskNext7 += 1;
    if (risk === 'medium' && materializesNext7) summary.activeMediumRiskNext7 += 1;

    findings.push({
      risk,
      path: doc.ref.path,
      id: doc.id,
      venue: getVenueName(data, doc.ref.path),
      title,
      category: data.category || meta.category || '',
      startDate,
      endDate,
      startTime,
      endTime,
      isRecurring: explicitRecurring,
      recurringPattern,
      recurrenceUntilDate: lifecycle.recurrenceUntilDate || null,
      totalOccurrences: lifecycle.totalOccurrences ?? null,
      concreteDateCue,
      oneOffCue,
      strongRecurringCue,
      nextOccurrence,
      synthesizedEndDate,
      materializesNext7,
      createdAt: timestampToIso(data.createdAt),
      updatedAt: timestampToIso(data.updatedAt),
      lastSeenAt: timestampToIso(data.lastSeenAt),
      sourceTimestamp: timestampToIso(data.sourceTimestamp),
      descriptionPreview: String(data.description || meta.description || '').slice(0, 220),
    });
  }

  findings.sort((a, b) => {
    const rank = { high: 0, medium: 1 };
    if (rank[a.risk] !== rank[b.risk]) return rank[a.risk] - rank[b.risk];
    if (a.materializesNext7 !== b.materializesNext7) return a.materializesNext7 ? -1 : 1;
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  });

  const topCreatedDates = Object.entries(
    findings.reduce((acc, finding) => {
      const key = finding.createdAt ? finding.createdAt.slice(0, 10) : 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([date, count]) => ({ date, count }));

  const topVenues = Object.entries(
    findings.reduce((acc, finding) => {
      acc[finding.venue] = (acc[finding.venue] || 0) + 1;
      return acc;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([venue, count]) => ({ venue, count }));

  const report = {
    asOfDate: AS_OF_DATE,
    next7WindowEnd: NEXT_7_END,
    summary,
    allResultsCount: findings.length,
    topCreatedDates,
    topVenues,
    findings,
    samples: findings.slice(0, 80),
  };

  const outPath = path.join(process.cwd(), '..', 'tmp_recurrence_anomaly_report_2026-04-01.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outPath, ...report }, null, 2));
}

main()
  .then(async () => {
    await admin.app().delete();
  })
  .catch(async (error) => {
    console.error(error);
    try {
      await admin.app().delete();
    } catch {}
    process.exit(1);
  });
