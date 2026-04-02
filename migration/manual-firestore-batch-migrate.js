/**
 * Manual, safety-first migration runner for local "GPT Processed.xlsx" Sheet1.
 *
 * Scope:
 * - Migrates columns A..AM, excluding AI (user-requested).
 * - Processes explicit row selections in small batches (max 10 by default).
 * - Performs per-row venue resolution + duplicate/conflict checks before write.
 * - Handles image migration to managed storage when needed.
 * - NEVER overwrites an existing venue profile image from sheet Icon.
 *
 * Usage examples:
 *   node manual-firestore-batch-migrate.js --date 2026-02-18 --max 5
 *   node manual-firestore-batch-migrate.js --rows 195,319,416,477,478 --apply
 *   node manual-firestore-batch-migrate.js --rows 195,319 --apply --max 10
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const admin = require('firebase-admin');
const { VenueMatcher, normalizeVenueName, normalizeUrl, calculateEnhancedSimilarity } = require('./venue-matcher');

let XLSX = null;
try {
  XLSX = require('xlsx');
} catch (_) {
  XLSX = require('../functions/node_modules/xlsx');
}

const DEFAULT_FILE = path.resolve(__dirname, '..', 'GPT Processed.xlsx');
const DEFAULT_SHEET = 'Sheet1';
const DEFAULT_DATE = '2026-02-18';
const DEFAULT_MAX = 10;
const DEFAULT_UPLOAD_URL =
  'https://gathr-backend-924732524090.northamerica-northeast1.run.app/upload-image';
const DEFAULT_FIRESTORE_EVENTS_API =
  'https://gathr-backend-924732524090.northamerica-northeast1.run.app/api/v2/firestore/events';

const COLUMN_SPECS = [
  { letter: 'A', key: 'eventFlag', header: 'Event?', index: 0 },
  { letter: 'B', key: 'foodSpecialFlag', header: 'Food Special?', index: 1 },
  { letter: 'C', key: 'recurringFlag', header: 'Recurring?', index: 2 },
  { letter: 'D', key: 'recurrencePattern', header: 'Recurrence Pattern', index: 3 },
  { letter: 'E', key: 'category', header: 'Category', index: 4 },
  { letter: 'F', key: 'name', header: 'Event Name', index: 5 },
  { letter: 'G', key: 'description', header: 'Description', index: 6 },
  { letter: 'H', key: 'establishment', header: 'Hosting Establishment', index: 7 },
  { letter: 'I', key: 'address', header: 'Address', index: 8 },
  { letter: 'J', key: 'startDate', header: 'Start Date', index: 9 },
  { letter: 'K', key: 'endDate', header: 'End Date', index: 10 },
  { letter: 'L', key: 'startTime', header: 'Start Time', index: 11 },
  { letter: 'M', key: 'endTime', header: 'End Time', index: 12 },
  { letter: 'N', key: 'ticketPrice', header: 'Ticket Price', index: 13 },
  { letter: 'O', key: 'icon', header: 'Icon', index: 14 },
  { letter: 'P', key: 'image', header: 'Image', index: 15 },
  { letter: 'Q', key: 'profileUrl', header: 'Profile Url', index: 16 },
  { letter: 'R', key: 'sharedPostThumbnail', header: 'SharedPostThumbnail', index: 17 },
  { letter: 'S', key: 'operatingHours', header: 'Operating Hours', index: 18 },
  { letter: 'T', key: 'rating', header: 'Rating', index: 19 },
  { letter: 'U', key: 'reviews', header: 'Reviews', index: 20 },
  { letter: 'V', key: 'columnV', header: '', index: 21 },
  { letter: 'W', key: 'ticketLink', header: 'Link to Event / Tickets', index: 22 },
  { letter: 'X', key: 'latitude', header: 'latitude', index: 23 },
  { letter: 'Y', key: 'longitude', header: 'longitude', index: 24 },
  { letter: 'Z', key: 'cityAddress', header: 'City Address', index: 25 },
  { letter: 'AA', key: 'streetAddress', header: 'Street Address', index: 26 },
  { letter: 'AB', key: 'organizedBy', header: 'organizedBy', index: 27 },
  { letter: 'AC', key: 'usersResponded', header: 'usersResponded', index: 28 },
  { letter: 'AD', key: 'utcStartDate', header: 'utcStartDate', index: 29 },
  { letter: 'AE', key: 'ticketsBuyUrl', header: 'ticketsBuyUrl', index: 30 },
  { letter: 'AF', key: 'ticketProvider', header: 'ticketProvider', index: 31 },
  { letter: 'AG', key: 'eventId', header: 'Event ID', index: 32 },
  { letter: 'AH', key: 'relevantImageUrl', header: 'RelevantImageUrlColumn', index: 33 },
  // AI (index 34) intentionally excluded
  { letter: 'AJ', key: 'likes', header: 'likes', index: 35 },
  { letter: 'AK', key: 'shares', header: 'shares', index: 36 },
  { letter: 'AL', key: 'comments', header: 'comments', index: 37 },
  { letter: 'AM', key: 'topReactionsCount', header: 'topReactionsCount', index: 38 },
];

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const args = { apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--file') {
      args.file = argv[++i];
    } else if (arg === '--sheet') {
      args.sheet = argv[++i];
    } else if (arg === '--date') {
      args.date = argv[++i];
    } else if (arg === '--rows') {
      args.rows = argv[++i];
    } else if (arg === '--max') {
      args.max = argv[++i];
    } else if (arg === '--report') {
      args.report = argv[++i];
    }
  }
  return args;
}

function parseRowList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((token) => Number(token.trim()))
    .filter((n) => Number.isFinite(n) && n >= 2);
}

function parseBool(value) {
  const s = String(value || '').trim().toLowerCase();
  return s === 'yes' || s === 'true' || s === '1' || s === 'y';
}

function toStringValue(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseDate(value) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (Number.isFinite(n) && n > 20000 && n < 60000) {
    const ms = Math.round((n - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = toStringValue(value);
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
}

function parseTime(value) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0 && n < 1) {
    const totalMinutes = Math.round(n * 24 * 60);
    const hh = Math.floor(totalMinutes / 60) % 24;
    const mm = totalMinutes % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  const s = toStringValue(value);
  if (!s) return '';
  const m12 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (m12) {
    let hh = Number(m12[1]);
    const mm = m12[2];
    const period = m12[3].toUpperCase();
    if (period === 'PM' && hh !== 12) hh += 12;
    if (period === 'AM' && hh === 12) hh = 0;
    return `${String(hh).padStart(2, '0')}:${mm}`;
  }
  const m24 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m24) {
    return `${String(Number(m24[1])).padStart(2, '0')}:${m24[2]}`;
  }
  return s;
}

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTextForSimilarity(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeForSimilarity(value) {
  const text = normalizeTextForSimilarity(value);
  if (!text) return [];
  return text
    .split(' ')
    .filter((token) => token.length >= 3);
}

function tokenJaccardSimilarity(aText, bText) {
  const aTokens = new Set(tokenizeForSimilarity(aText));
  const bTokens = new Set(tokenizeForSimilarity(bText));
  if (!aTokens.size || !bTokens.size) return 0;

  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection += 1;
  }
  const union = aTokens.size + bTokens.size - intersection;
  if (!union) return 0;
  return intersection / union;
}

function normalizeCategory(category, isFoodSpecial) {
  const raw = toStringValue(category);
  if (!raw && isFoodSpecial) return 'Food Special';
  return raw;
}

function canonicalizeCategoryLabel(category) {
  const raw = toStringValue(category);
  const normalized = normalizeTextForSimilarity(raw);
  if (!normalized) return '';

  if (normalized === 'gathering parties') return 'Gatherings & Parties';
  if (normalized === 'gatherings parties') return 'Gatherings & Parties';
  if (normalized === 'workshops classes') return 'Workshops & Classes';
  if (normalized === 'trivia night') return 'Trivia Night';
  if (normalized === 'food special') return 'Food Special';
  if (normalized === 'live music') return 'Live Music';
  if (normalized === 'family friendly') return 'Family Friendly';
  if (normalized === 'sports') return 'Sports';
  if (normalized === 'wing night') return 'Wing Night';
  if (normalized === 'gatherings parties') return 'Gatherings & Parties';
  if (normalized === 'gathering and parties') return 'Gatherings & Parties';
  if (normalized === 'gatherings and parties') return 'Gatherings & Parties';

  return raw;
}

function inferCategoryFromContent(row, currentCategory) {
  const text = normalizeTextForSimilarity(`${row.name || ''} ${row.description || ''}`);
  const has = (pattern) => pattern.test(text);

  const hasComedy = has(/\b(comedy|stand up|standup|improv|roast|comedian)\b/);
  const hasOpenMic = has(/\bopen mic\b/);
  const hasKaraoke = has(/\bkaraoke\b/);
  const hasMusic = has(
    /\b(live music|country music|acoustic|band|concert|dj set|dj night|singer|songwriter|jam session|music night|showcase|island jazz)\b/
  );
  const hasTourMusicSignals = has(/\b(album release|release tour|world tour|tour dates|tribute|live at)\b/);
  const hasCinema = has(/\b(cinema|film|movie|screening)\b/);
  const hasTrivia = has(/\b(trivia|bingo|quiz night)\b/);
  const hasSports = has(
    /\b(ski|skis|skiing|snowshoe|hockey|soccer|basketball|baseball|volleyball|swim|swimming|aquafit|zumba|marathon|tournament|cup|league|match|game|vs|versus|quarterfinal|semifinal|semi final|championship|final|islanders\s+vs)\b/
  );
  const hasFoodSignals = has(
    /\b(taco tuesday|wing night|brunch|pizza|burger|burgers|wings|special|platter|dine|dinner|lunch|deal)\b/
  );
  const hasDanceClassSignals = has(
    /\b(dance 101|dance class|social dancing|partner dancing|ballroom|salsa|swing dancing|learn to dance)\b/
  );
  const hasWorkshopClassSignals = has(
    /\b(workshop|workshops|class|classes|lesson|lessons|training|introductory|introduction|beginner)\b/
  );

  if (row.isFoodSpecial) {
    return { category: 'Food Special', method: 'food_special_flag' };
  }
  if (
    hasFoodSignals &&
    !hasComedy &&
    !hasMusic &&
    !hasTourMusicSignals &&
    !hasCinema &&
    !hasSports &&
    !hasTrivia
  ) {
    return { category: 'Food Special', method: 'food_keyword' };
  }

  if (hasDanceClassSignals) {
    return { category: 'Workshops & Classes', method: 'dance_class_signal' };
  }
  if (hasWorkshopClassSignals && !hasComedy && !hasMusic && !hasTourMusicSignals && !hasTrivia) {
    return { category: 'Workshops & Classes', method: 'workshop_class_signal' };
  }

  // High confidence: open mic is live music unless explicitly comedy.
  if (hasOpenMic && !hasComedy) {
    return { category: 'Live Music', method: 'open_mic_live_music' };
  }
  if (hasKaraoke) {
    return { category: 'Live Music', method: 'karaoke_live_music' };
  }
  // If a post explicitly references a movie/screening, prefer cinema even if
  // "band" appears in the title (e.g. "Nirvanna the Band the Show the Movie").
  if (hasCinema) {
    return { category: 'Cinema', method: 'cinema_keyword' };
  }
  if (hasComedy) {
    return { category: 'Comedy', method: 'comedy_keyword' };
  }
  if (hasMusic) {
    return { category: 'Live Music', method: 'music_keyword' };
  }
  if (hasTourMusicSignals && !hasTrivia) {
    return { category: 'Live Music', method: 'tour_release_signal' };
  }
  if (hasSports) {
    return { category: 'Sports', method: 'sports_keyword' };
  }
  if (hasTrivia) {
    return { category: 'Trivia Night', method: 'trivia_keyword' };
  }
  return { category: currentCategory, method: 'as_is' };
}

function deriveEventType(category, isFoodSpecial) {
  if (isFoodSpecial) return 'food_special';
  const normalized = toStringValue(category)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'event';
}

function parseOperatingHoursRange(text) {
  const raw = toStringValue(text);
  if (!raw) return { open: '', close: '' };
  const m = raw.match(
    /(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)\s*(?:-|to|through|thru|–|—)\s*(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)/i
  );
  if (!m) return { open: '', close: '' };
  return {
    open: parseTime(m[1]),
    close: parseTime(m[2]),
  };
}

function fillMissingTimes(row) {
  const next = { ...row };
  const range = parseOperatingHoursRange(row.operatingHours);
  if (!next.startTime && range.open) next.startTime = range.open;
  if (!next.endTime && range.close) next.endTime = range.close;
  return next;
}

function toMinutesOfDay(timeValue) {
  const normalized = parseTime(timeValue);
  if (!/^\d{2}:\d{2}$/.test(normalized)) return null;
  const [hh, mm] = normalized.split(':').map((token) => Number(token));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function fromMinutesOfDay(totalMinutes) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hh = Math.floor(normalized / 60);
  const mm = normalized % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function addDaysToIsoDate(isoDate, dayOffset) {
  if (!dayOffset) return isoDate;
  const base = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return isoDate;
  base.setUTCDate(base.getUTCDate() + dayOffset);
  return base.toISOString().slice(0, 10);
}

function categoryDefaultDurationMinutes(row) {
  const category = normalizeTextForSimilarity(row.category);
  const name = normalizeTextForSimilarity(row.name);

  if (row.isFoodSpecial || category.includes('food special')) return 360;
  if (name.includes('open mic')) return 120;
  if (category.includes('workshop') || category.includes('class')) return 120;
  if (category.includes('cinema') || category.includes('movie')) return 120;
  if (category.includes('trivia')) return 120;
  if (category.includes('gatherings') || category.includes('party')) return 120;
  if (category.includes('religious')) return 120;
  if (category.includes('sports')) return 120;
  return 120;
}

function weekdayKeyFromIsoDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  const keys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return keys[date.getUTCDay()] || '';
}

function recurringWeekdayFromPattern(pattern) {
  const raw = normalizeTextForSimilarity(pattern);
  if (!raw) return '';

  const weekdayMatch = raw.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (!weekdayMatch) return '';

  if (raw.includes('weekly') || raw.includes('every') || raw.includes('recurring')) {
    return weekdayMatch[1];
  }

  // Handles forms like "tuesdays in february".
  const pluralWeekdayMatch = raw.match(
    /\b(sundays|mondays|tuesdays|wednesdays|thursdays|fridays|saturdays)\b/
  );
  if (!pluralWeekdayMatch) return '';

  const singular = pluralWeekdayMatch[1].replace(/s$/, '');
  return singular;
}

function isMeaningfulRecurringPattern(pattern) {
  const normalized = normalizeTextForSimilarity(pattern);
  if (!normalized) return false;
  if (normalized === 'none' || normalized === 'no' || normalized === 'na' || normalized === 'n a') {
    return false;
  }
  if (normalized.includes('not recurring')) return false;
  return true;
}

function alignRecurringDateToPattern(row) {
  const targetWeekday = recurringWeekdayFromPattern(row.recurringPattern);
  if (!targetWeekday || !row.startDate) {
    return { changed: false };
  }

  const startDate = toStringValue(row.startDate);
  const endDate = toStringValue(row.endDate || row.startDate);
  const startWeekday = weekdayKeyFromIsoDate(startDate);
  const endWeekday = weekdayKeyFromIsoDate(endDate);
  if (!startWeekday || !endWeekday) {
    return { changed: false };
  }

  if (startWeekday === targetWeekday) {
    return { changed: false };
  }

  if (endWeekday === targetWeekday) {
    return {
      changed: true,
      method: 'end_date_matches_recurring_weekday',
      targetWeekday,
      originalStartDate: startDate,
      originalEndDate: endDate,
      adjustedStartDate: endDate,
      adjustedEndDate: endDate,
      row: {
        ...row,
        startDate: endDate,
        endDate,
      },
    };
  }

  const weekdayOrder = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  const startIdx = weekdayOrder[startWeekday];
  const targetIdx = weekdayOrder[targetWeekday];
  if (!Number.isInteger(startIdx) || !Number.isInteger(targetIdx)) {
    return { changed: false };
  }

  const dayOffset = (targetIdx - startIdx + 7) % 7;
  if (!dayOffset) {
    return { changed: false };
  }

  const adjustedStartDate = addDaysToIsoDate(startDate, dayOffset);
  const adjustedEndDate = addDaysToIsoDate(endDate, dayOffset);
  if (!adjustedStartDate || !adjustedEndDate) {
    return { changed: false };
  }

  return {
    changed: true,
    method: 'forward_shift_to_recurring_weekday',
    targetWeekday,
    dayOffset,
    originalStartDate: startDate,
    originalEndDate: endDate,
    adjustedStartDate,
    adjustedEndDate,
    row: {
      ...row,
      startDate: adjustedStartDate,
      endDate: adjustedEndDate,
    },
  };
}

function parseWeekCountFromText(text) {
  const normalized = normalizeTextForSimilarity(text);
  if (!normalized) return null;

  const unitPattern = '(?:week|weeks|session|sessions|class|classes)';
  const digitMatch = normalized.match(new RegExp(`\\b(\\d{1,2})\\s*${unitPattern}\\b`));
  if (digitMatch) {
    const count = Number(digitMatch[1]);
    if (Number.isFinite(count) && count >= 2 && count <= 52) return count;
  }

  const wordMap = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
  };
  const wordMatch = normalized.match(
    new RegExp(`\\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\\s*${unitPattern}\\b`)
  );
  if (!wordMatch) return null;
  const count = wordMap[wordMatch[1]];
  return Number.isFinite(count) && count >= 2 ? count : null;
}

function inferRecurrenceWindow(row) {
  if (!row.isRecurring || !row.startDate) return { changed: false };
  const pattern = normalizeTextForSimilarity(row.recurringPattern);
  if (!pattern || !pattern.includes('weekly')) return { changed: false };

  const count = parseWeekCountFromText(`${row.name || ''} ${row.description || ''}`);
  if (!count) return { changed: false };

  const recurrenceEndDate = addDaysToIsoDate(row.startDate, (count - 1) * 7);
  if (!recurrenceEndDate) return { changed: false };

  return {
    changed: true,
    method: 'description_week_count',
    recurrenceCount: count,
    recurrenceEndDate,
  };
}

function closeTimeFromVenueOperatingHours(venue, isoDate) {
  const weekdayKey = weekdayKeyFromIsoDate(isoDate);
  if (!weekdayKey) return '';

  const parsedWeekday = (hoursPayload) => {
    if (!hoursPayload || typeof hoursPayload !== 'object') return '';
    const week = Array.isArray(hoursPayload.week) ? hoursPayload.week : [];
    const target = week.find((entry) =>
      normalizeTextForSimilarity(entry?.weekday).startsWith(weekdayKey.slice(0, 3))
    );
    if (!target) return '';
    const segments = Array.isArray(target.segments) ? target.segments : [];
    if (!segments.length) return '';
    const close = parseTime(segments[0]?.close || '');
    return close || '';
  };

  const parsedFromPayload =
    parsedWeekday(venue?.operatingHoursParsed) ||
    (() => {
      const rawJson = toStringValue(venue?.operatingHoursJson);
      if (!rawJson) return '';
      try {
        return parsedWeekday(JSON.parse(rawJson));
      } catch (_) {
        return '';
      }
    })();
  if (parsedFromPayload) return parsedFromPayload;

  const operatingHours = venue?.operatingHours;
  if (!operatingHours || typeof operatingHours !== 'object') return '';

  const dayCandidate =
    operatingHours[weekdayKey] ||
    operatingHours[weekdayKey.slice(0, 3)] ||
    operatingHours[weekdayKey.charAt(0).toUpperCase() + weekdayKey.slice(1)];

  if (typeof dayCandidate === 'string') {
    return parseOperatingHoursRange(dayCandidate).close;
  }
  if (dayCandidate && typeof dayCandidate === 'object') {
    const closeRaw =
      dayCandidate.close ||
      dayCandidate.end ||
      dayCandidate.closeTime ||
      dayCandidate.closingTime ||
      '';
    const normalizedClose = parseTime(closeRaw);
    if (normalizedClose) return normalizedClose;
    if (dayCandidate.open || dayCandidate.close) {
      return parseOperatingHoursRange(`${dayCandidate.open || ''} - ${dayCandidate.close || ''}`).close;
    }
  }

  if (Array.isArray(operatingHours.weekdayText)) {
    const prefix = weekdayKey.slice(0, 3);
    const line = operatingHours.weekdayText.find((entry) =>
      normalizeTextForSimilarity(entry).startsWith(prefix)
    );
    if (line) {
      return parseOperatingHoursRange(line).close;
    }
  }

  return '';
}

function parseDateDayOffset(startIso, endIso) {
  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function minutesCircularDistance(a, b) {
  const diff = Math.abs(a - b) % 1440;
  return Math.min(diff, 1440 - diff);
}

function parse12HourTokensToMinutes(hourToken, minuteToken, meridiemToken, fallbackMeridiem = '') {
  let hh = Number(hourToken);
  const mm = Number(minuteToken || '0');
  const meridiem = toStringValue(meridiemToken || fallbackMeridiem).toUpperCase();
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 1 || hh > 12 || mm < 0 || mm > 59) return null;
  if (!meridiem || (meridiem !== 'AM' && meridiem !== 'PM')) return null;
  if (meridiem === 'AM' && hh === 12) hh = 0;
  if (meridiem === 'PM' && hh !== 12) hh += 12;
  return hh * 60 + mm;
}

function extractTextTimeRangeMinutes(text) {
  const raw = String(text || '');
  if (!raw.trim()) return null;

  const meridiemRange = raw.match(
    /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*(?:-|–|—|to|through|thru)\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i
  );
  if (meridiemRange) {
    const start = parse12HourTokensToMinutes(
      meridiemRange[1],
      meridiemRange[2],
      meridiemRange[3],
      meridiemRange[6]
    );
    const end = parse12HourTokensToMinutes(
      meridiemRange[4],
      meridiemRange[5],
      meridiemRange[6]
    );
    if (start !== null && end !== null) {
      return { startMinutes: start, endMinutes: end, source: 'text_meridiem_range' };
    }
  }

  const twentyFourHourRange = raw.match(
    /\b(\d{1,2}):(\d{2})\s*(?:-|–|—|to|through|thru)\s*(\d{1,2}):(\d{2})\b/i
  );
  if (twentyFourHourRange) {
    const h1 = Number(twentyFourHourRange[1]);
    const m1 = Number(twentyFourHourRange[2]);
    const h2 = Number(twentyFourHourRange[3]);
    const m2 = Number(twentyFourHourRange[4]);
    if (
      [h1, m1, h2, m2].every(Number.isFinite) &&
      h1 >= 0 && h1 <= 23 &&
      h2 >= 0 && h2 <= 23 &&
      m1 >= 0 && m1 <= 59 &&
      m2 >= 0 && m2 <= 59
    ) {
      return { startMinutes: h1 * 60 + m1, endMinutes: h2 * 60 + m2, source: 'text_24h_range' };
    }
  }

  return null;
}

function inferEndTimeIfInvalid(row, venue) {
  const startMinutes = toMinutesOfDay(row.startTime);
  if (startMinutes === null) {
    return { changed: false };
  }

  const endMinutes = toMinutesOfDay(row.endTime);
  const originalStartTime = toStringValue(row.startTime);
  const originalEndTime = toStringValue(row.endTime);
  const originalEndDate = toStringValue(row.endDate || row.startDate);
  const declaredEndDate = toStringValue(row.endDate || row.startDate);

  const defaultDuration = categoryDefaultDurationMinutes(row);
  const isFoodSpecial = row.isFoodSpecial || normalizeTextForSimilarity(row.category).includes('food special');
  // Keep inference conservative only for clearly broken windows.
  // Some legitimate events (festivals, conferences, markets) can run most of the day.
  const maxDuration = isFoodSpecial ? 18 * 60 : 18 * 60;

  let declaredDuration = null;
  if (endMinutes !== null) {
    const dayOffset = parseDateDayOffset(row.startDate, declaredEndDate);
    declaredDuration = endMinutes + dayOffset * 1440 - startMinutes;
  }
  const invalidWindow =
    endMinutes === null ||
    declaredDuration === null ||
    declaredDuration < 45 ||
    declaredDuration > maxDuration;

  const textRange = extractTextTimeRangeMinutes(`${row.name || ''} ${row.description || ''}`);
  const textStartDistance =
    textRange !== null ? minutesCircularDistance(startMinutes, textRange.startMinutes) : null;
  const textRangeLooksApplicable =
    textRange !== null &&
    textStartDistance !== null &&
    textStartDistance <= 90;

  const startMinuteLooksMisparsed = startMinutes % 5 !== 0;
  if (
    textRange &&
    textStartDistance !== null &&
    textStartDistance >= 20 &&
    textStartDistance <= 90 &&
    startMinuteLooksMisparsed
  ) {
    let candidateEndMinutes = textRange.endMinutes;
    if (candidateEndMinutes <= textRange.startMinutes) {
      candidateEndMinutes += 1440;
    }
    const duration = candidateEndMinutes - textRange.startMinutes;
    if (duration >= 45 && duration <= maxDuration) {
      const nextStartTime = fromMinutesOfDay(textRange.startMinutes);
      const dayOffset = Math.floor(candidateEndMinutes / 1440);
      const nextEndTime = fromMinutesOfDay(candidateEndMinutes);
      const nextEndDate = addDaysToIsoDate(row.startDate, dayOffset);
      row.startTime = nextStartTime;
      row.endTime = nextEndTime;
      row.endDate = nextEndDate;
      return {
        changed: true,
        startChanged: true,
        method: `${textRange.source}_start_end_override`,
        originalStartTime,
        originalEndTime,
        originalEndDate,
        inferredDurationMinutes: duration,
        startTime: nextStartTime,
        endTime: nextEndTime,
        endDate: nextEndDate,
      };
    }
  }

  if (!invalidWindow && textRangeLooksApplicable && endMinutes !== null) {
    const textEndDistance = minutesCircularDistance(endMinutes, textRange.endMinutes);
    if (textEndDistance >= 45) {
      let candidateMinutes = textRange.endMinutes;
      if (candidateMinutes <= startMinutes) {
        candidateMinutes += 1440;
      }
      const duration = candidateMinutes - startMinutes;
      if (duration >= 45 && duration <= maxDuration) {
        const dayOffset = Math.floor(candidateMinutes / 1440);
        const nextEndTime = fromMinutesOfDay(candidateMinutes);
        const nextEndDate = addDaysToIsoDate(row.startDate, dayOffset);
        row.endTime = nextEndTime;
        row.endDate = nextEndDate;
        return {
          changed: true,
          method: `${textRange.source}_override`,
          originalStartTime,
          originalEndTime,
          originalEndDate,
          inferredDurationMinutes: duration,
          endTime: nextEndTime,
          endDate: nextEndDate,
        };
      }
    }
  }
  if (!invalidWindow) {
    return { changed: false };
  }

  const applyCandidate = (candidateMinutesRaw, method) => {
    if (candidateMinutesRaw === null) return null;
    let candidateMinutes = candidateMinutesRaw;
    if (candidateMinutes <= startMinutes) {
      candidateMinutes += 1440;
    }
    const duration = candidateMinutes - startMinutes;
    if (duration < 45 || duration > maxDuration) return null;

    const dayOffset = Math.floor(candidateMinutes / 1440);
    const nextEndTime = fromMinutesOfDay(candidateMinutes);
    const nextEndDate = addDaysToIsoDate(row.startDate, dayOffset);
    row.endTime = nextEndTime;
    row.endDate = nextEndDate;
    return {
      changed: true,
      method,
      originalStartTime,
      originalEndTime,
      originalEndDate,
      inferredDurationMinutes: duration,
      endTime: nextEndTime,
      endDate: nextEndDate,
    };
  };

  const rowHours = parseOperatingHoursRange(row.operatingHours);
  const rowCloseMinutes = toMinutesOfDay(rowHours.close);
  const rowHoursInference = applyCandidate(rowCloseMinutes, 'row_operating_hours_close');
  if (rowHoursInference) return rowHoursInference;

  const venueClose = closeTimeFromVenueOperatingHours(venue, row.startDate);
  const venueCloseMinutes = toMinutesOfDay(venueClose);
  const venueHoursInference = applyCandidate(venueCloseMinutes, 'venue_operating_hours_close');
  if (venueHoursInference) return venueHoursInference;

  if (textRange) {
    const startDistance = minutesCircularDistance(startMinutes, textRange.startMinutes);
    if (startDistance <= 90) {
      const textInference = applyCandidate(textRange.endMinutes, textRange.source);
      if (textInference) return textInference;
    }
  }

  const fallbackDuration = defaultDuration;
  const fallbackCandidateMinutes = startMinutes + fallbackDuration;
  const fallbackDayOffset = Math.floor(fallbackCandidateMinutes / 1440);
  const fallbackEndTime = fromMinutesOfDay(fallbackCandidateMinutes);
  const fallbackEndDate = addDaysToIsoDate(row.startDate, fallbackDayOffset);
  row.endTime = fallbackEndTime;
  row.endDate = fallbackEndDate;
  return {
    changed: true,
    method: 'category_default_duration',
    originalStartTime,
    originalEndTime,
    originalEndDate,
    inferredDurationMinutes: fallbackDuration,
    endTime: fallbackEndTime,
    endDate: fallbackEndDate,
  };
}

function extractColumnsAtoAM(rawRow) {
  const out = {};
  for (const spec of COLUMN_SPECS) {
    out[spec.letter] = rawRow[spec.index] ?? '';
  }
  return out;
}

function parseSourceRow(rawRow, sheetRow) {
  const src = {};
  for (const spec of COLUMN_SPECS) {
    src[spec.key] = rawRow[spec.index];
  }

  const parsed = {
    sheetRow,
    rawColumns: extractColumnsAtoAM(rawRow),
    isEvent: parseBool(src.eventFlag),
    isFoodSpecial: parseBool(src.foodSpecialFlag),
    isRecurring: parseBool(src.recurringFlag),
    recurringPattern: toStringValue(src.recurrencePattern),
    category: toStringValue(src.category),
    name: toStringValue(src.name),
    description: toStringValue(src.description),
    establishment: toStringValue(src.establishment),
    address: toStringValue(src.address),
    startDate: parseDate(src.startDate),
    endDate: parseDate(src.endDate),
    startTime: parseTime(src.startTime),
    endTime: parseTime(src.endTime),
    ticketPrice: toStringValue(src.ticketPrice),
    icon: toStringValue(src.icon),
    image: toStringValue(src.image),
    profileUrl: toStringValue(src.profileUrl),
    sharedPostThumbnail: toStringValue(src.sharedPostThumbnail),
    operatingHours: toStringValue(src.operatingHours),
    rating: toStringValue(src.rating),
    reviews: toStringValue(src.reviews),
    columnV: src.columnV ?? '',
    ticketLink: toStringValue(src.ticketLink),
    latitude: parseNumber(src.latitude),
    longitude: parseNumber(src.longitude),
    cityAddress: toStringValue(src.cityAddress),
    streetAddress: toStringValue(src.streetAddress),
    organizedBy: toStringValue(src.organizedBy),
    usersResponded: toStringValue(src.usersResponded),
    utcStartDate: toStringValue(src.utcStartDate),
    ticketsBuyUrl: toStringValue(src.ticketsBuyUrl),
    ticketProvider: toStringValue(src.ticketProvider),
    eventId: toStringValue(src.eventId),
    relevantImageUrl: toStringValue(src.relevantImageUrl),
    likes: parseNumber(src.likes),
    shares: parseNumber(src.shares),
    comments: parseNumber(src.comments),
    topReactionsCount: parseNumber(src.topReactionsCount),
  };

  if (!parsed.endDate) parsed.endDate = parsed.startDate;
  return fillMissingTimes(parsed);
}
function loadSheetRows(filePath, sheetName) {
  const wb = XLSX.readFile(filePath, { raw: true, cellDates: false });
  const ws = wb.Sheets[sheetName] || wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error(`Sheet not found: ${sheetName}`);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  if (!rows.length) throw new Error('Sheet is empty');
  return rows.slice(1);
}

function createEventDocId(venueId, row) {
  const seed = [
    venueId,
    row.eventId || '',
    normalizeVenueName(row.name),
    row.startDate || '',
    row.startTime || '',
  ].join('|');
  const digest = crypto.createHash('sha1').update(seed).digest('hex').slice(0, 12);
  return `${row.eventId ? 'fb' : 'evt'}_${digest}`;
}

function eventIdTokens(existingEvent) {
  const values = [
    existingEvent.eventId,
    existingEvent.uniqueId,
    existingEvent?.metadata?.eventId,
    existingEvent?.metadata?.uniqueId,
  ]
    .map((v) => toStringValue(v))
    .filter(Boolean);
  const set = new Set(values);
  for (const value of values) {
    const base = value.split('_')[0];
    if (base) set.add(base);
  }
  return set;
}

function isManagedImageUrl(url) {
  const raw = toStringValue(url);
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return (
      parsed.hostname === 'storage.googleapis.com' &&
      parsed.pathname.includes('/gathr-uploaded-images/')
    );
  } catch (_) {
    return false;
  }
}

function looksLikeExternalImageUrl(url) {
  const raw = toStringValue(url);
  if (!raw) return false;
  if (!/^https?:\/\//i.test(raw)) return false;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    if (/\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(pathname)) return true;
    if (host.includes('fbcdn.net') || host.includes('scontent')) return true;
    if (host.includes('instagram.com') || host.includes('cdninstagram.com')) return true;
    if (host.includes('googleusercontent.com')) return true;
    return false;
  } catch (_) {
    return false;
  }
}

function needsImageBackfill(url) {
  const raw = toStringValue(url);
  if (!raw) return false;
  return !isManagedImageUrl(raw) && looksLikeExternalImageUrl(raw);
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function downloadImage(url) {
  const response = await fetchWithTimeout(url, { method: 'GET', redirect: 'follow' }, 15000);
  if (!response.ok) return null;
  const contentType = String(response.headers.get('content-type') || '');
  if (contentType && !contentType.startsWith('image/')) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) return null;
  return {
    buffer,
    contentType: contentType || 'image/jpeg',
  };
}

async function uploadImageToManaged(buffer, contentType, folder, uploadUrl) {
  const blob = new Blob([buffer], { type: contentType || 'image/jpeg' });
  const form = new FormData();
  const fileName = `migration-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  form.append('image', blob, fileName);
  form.append('folder', folder);
  form.append('ocr', 'false');

  const response = await fetchWithTimeout(uploadUrl, { method: 'POST', body: form }, 30000);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload failed (${response.status}): ${text.slice(0, 400)}`);
  }
  const payload = await response.json();
  const imageUrl = payload?.imageUrl || (Array.isArray(payload?.imageUrls) ? payload.imageUrls[0] : '');
  return toStringValue(imageUrl);
}

async function convertImageUrl(url, folder, uploadUrl, cache, imageActions, fieldName) {
  const raw = toStringValue(url);
  if (!raw) return '';
  if (!needsImageBackfill(raw)) return raw;
  if (cache.has(raw)) return cache.get(raw) || '';

  const downloaded = await downloadImage(raw);
  if (!downloaded) {
    cache.set(raw, '');
    imageActions.push({ field: fieldName, source: raw, status: 'download_failed' });
    return '';
  }

  const converted = await uploadImageToManaged(downloaded.buffer, downloaded.contentType, folder, uploadUrl);
  if (!converted || !isManagedImageUrl(converted)) {
    cache.set(raw, '');
    imageActions.push({ field: fieldName, source: raw, status: 'upload_failed' });
    return '';
  }

  cache.set(raw, converted);
  imageActions.push({ field: fieldName, source: raw, target: converted, status: 'converted' });
  return converted;
}

function resolveVenue(row, matcher) {
  const url = toStringValue(row.profileUrl);
  const byUrl = url ? matcher.findMatch(row.establishment, url) : null;
  const byName = matcher.findMatch(row.establishment, null);

  if (!byUrl && !byName) {
    return {
      status: 'unmatched',
      reason: 'no venue match',
    };
  }
  if (!byUrl) {
    return {
      status: 'matched',
      selected: byName,
      flags: ['name_only'],
    };
  }
  if (!byName) {
    return {
      status: 'matched',
      selected: byUrl,
      flags: ['url_only'],
    };
  }
  if (byUrl.venueId === byName.venueId) {
    return {
      status: 'matched',
      selected: byUrl,
      flags: [],
    };
  }

  const urlVenueName = toStringValue(byUrl.venue?.pagename || byUrl.venue?.title || byUrl.venue?.name);
  const nameVenueName = toStringValue(byName.venue?.pagename || byName.venue?.title || byName.venue?.name);
  const urlSimilarity = urlVenueName ? calculateEnhancedSimilarity(row.establishment, urlVenueName).score : 0;
  const nameSimilarity = nameVenueName ? calculateEnhancedSimilarity(row.establishment, nameVenueName).score : 0;
  const scoreGap = nameSimilarity - urlSimilarity;

  if (nameSimilarity >= 0.88 && scoreGap >= 0.12) {
    return {
      status: 'matched',
      selected: byName,
      flags: ['url_name_disagree', 'using_name_over_url'],
      diagnostics: { urlSimilarity, nameSimilarity, urlVenueName, nameVenueName },
    };
  }

  return {
    status: 'review',
    reason: 'url/name venue conflict',
    selected: byUrl,
    flags: ['url_name_disagree', 'manual_review_needed'],
    diagnostics: { urlSimilarity, nameSimilarity, urlVenueName, nameVenueName },
  };
}

async function findDuplicateForRow(db, venueId, row) {
  const snapshot = await db
    .collection('venues')
    .doc(venueId)
    .collection('events')
    .where('startDate', '==', row.startDate)
    .get();

  const events = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const rowTitle = normalizeTitle(row.name);
  const rowEventId = toStringValue(row.eventId);

  for (const existing of events) {
    if (rowEventId) {
      const ids = eventIdTokens(existing);
      const idMatch =
        ids.has(rowEventId) ||
        Array.from(ids).some((token) => token.startsWith(`${rowEventId}_`));
      if (!idMatch) continue;

      // Same legacy post can legitimately produce multiple distinct events.
      // Treat as duplicate only when title or start time also collide.
      const existingTitle = normalizeTitle(existing.name || existing.eventName || existing.title);
      const existingStartTime = toStringValue(existing.startTime);
      const sameTitle = Boolean(existingTitle) && existingTitle === rowTitle;
      const sameStartTime =
        Boolean(existingStartTime) && Boolean(row.startTime) && existingStartTime === row.startTime;
      if (!sameTitle && !sameStartTime) {
        continue;
      }

      return {
        type: 'legacy_event_id',
        existing: {
          id: existing.id,
          title: toStringValue(existing.name || existing.eventName || existing.title),
          startTime: existingStartTime,
          eventId: toStringValue(existing.eventId || existing?.metadata?.eventId),
        },
        eventCountOnDate: events.length,
      };
    }
  }

  for (const existing of events) {
    const existingTitle = normalizeTitle(existing.name || existing.eventName || existing.title);
    if (!existingTitle || existingTitle !== rowTitle) continue;
    const existingStartTime = toStringValue(existing.startTime);
    if (
      (existingStartTime && row.startTime && existingStartTime === row.startTime) ||
      (!existingStartTime && !row.startTime) ||
      (!existingStartTime || !row.startTime)
    ) {
      return {
        type: 'title_time',
        existing: {
          id: existing.id,
          title: toStringValue(existing.name || existing.eventName || existing.title),
          startTime: existingStartTime,
          eventId: toStringValue(existing.eventId || existing?.metadata?.eventId),
        },
        eventCountOnDate: events.length,
      };
    }
  }

  // Cross-date rows that share a legacy eventId/title are often legitimate
  // multi-date listings from a single source post. We only block same-date
  // collisions above; cross-date entries are reviewed and applied manually.

  const rowStartTime = toStringValue(row.startTime);
  const rowEndTime = toStringValue(row.endTime);
  const rowCategory = normalizeTextForSimilarity(row.category);
  const rowDescription = toStringValue(row.description);

  for (const existing of events) {
    const existingTitle = normalizeTitle(existing.name || existing.eventName || existing.title);
    if (existingTitle && existingTitle === rowTitle) continue;

    const existingStartTime = toStringValue(existing.startTime);
    if (!rowStartTime || !existingStartTime || rowStartTime !== existingStartTime) continue;

    const existingEndTime = toStringValue(existing.endTime);
    const endTimeCollision =
      (rowEndTime && existingEndTime && rowEndTime === existingEndTime) ||
      (!rowEndTime && !existingEndTime);
    if (!endTimeCollision) continue;

    const existingCategory = normalizeTextForSimilarity(existing.category);
    const sameCategory = Boolean(rowCategory) && Boolean(existingCategory) && rowCategory === existingCategory;
    const descriptionSimilarity = tokenJaccardSimilarity(
      rowDescription,
      toStringValue(existing.description || existing?.metadata?.description || '')
    );

    // Same venue + same timeframe with either same category or overlapping description
    // should be reviewed manually before migration.
    if (sameCategory || descriptionSimilarity >= 0.10) {
      return {
        type: '',
        existing: null,
        eventCountOnDate: events.length,
        timeframeCollision: {
          id: existing.id,
          title: toStringValue(existing.name || existing.eventName || existing.title),
          startTime: existingStartTime,
          endTime: existingEndTime,
          category: toStringValue(existing.category),
          descriptionSimilarity: Number(descriptionSimilarity.toFixed(3)),
        },
      };
    }
  }

  return {
    type: '',
    existing: null,
    eventCountOnDate: events.length,
    timeframeCollision: null,
  };
}

function canSafelyUpdateExistingDuplicate(existingData, row) {
  const sourceRow = Number(existingData?.sourceRow || existingData?.metadata?.sourceRow);
  if (Number.isFinite(sourceRow) && sourceRow === row.sheetRow) {
    return { safe: true, reason: 'source_row_match' };
  }

  const existingTitle = normalizeTitle(existingData?.name || existingData?.eventName || existingData?.title);
  const rowTitle = normalizeTitle(row.name);
  const sameTitle = Boolean(existingTitle) && Boolean(rowTitle) && existingTitle === rowTitle;

  const existingEventId = toStringValue(existingData?.eventId || existingData?.metadata?.eventId).split('_')[0];
  const rowEventId = toStringValue(row.eventId).split('_')[0];
  const sameLegacyEventId =
    Boolean(existingEventId) && Boolean(rowEventId) && existingEventId === rowEventId;

  if (sameTitle && sameLegacyEventId) {
    return { safe: true, reason: 'title_eventid_match' };
  }

  const existingStartDate = toStringValue(existingData?.startDate);
  const existingStartTime = toStringValue(existingData?.startTime);
  const sameStartDate = Boolean(existingStartDate) && existingStartDate === toStringValue(row.startDate);
  const sameStartTime = Boolean(existingStartTime) && existingStartTime === toStringValue(row.startTime);
  if (sameTitle && sameStartDate && sameStartTime) {
    return { safe: true, reason: 'title_datetime_match' };
  }

  return { safe: false, reason: 'guard_failed' };
}

async function fetchApiEventsForDate(date, apiUrl) {
  const events = [];
  let pageToken = '';
  for (let i = 0; i < 25; i += 1) {
    const url = new URL(apiUrl);
    url.searchParams.set('startDate', date);
    url.searchParams.set('endDate', date);
    url.searchParams.set('limit', '500');
    if (pageToken) {
      url.searchParams.set('startAfter', pageToken);
    }
    const response = await fetchWithTimeout(url.toString(), { method: 'GET' }, 20000);
    if (!response.ok) {
      throw new Error(`Events API query failed (${response.status}) for ${date}`);
    }
    const payload = await response.json();
    const pageEvents = Array.isArray(payload?.events) ? payload.events : [];
    events.push(...pageEvents);
    pageToken = toStringValue(payload?.nextPageToken);
    if (!pageToken) break;
  }
  return events;
}

function findCrossVenueConflict(row, selectedVenueId, apiEventsForDate) {
  const rowTitle = normalizeTitle(row.name);
  const rowEventId = toStringValue(row.eventId).split('_')[0];
  const rowStartTime = toStringValue(row.startTime);

  for (const existing of apiEventsForDate) {
    const venueId = toStringValue(existing.venueId);
    if (!venueId || venueId === selectedVenueId) continue;

    const existingTitle = normalizeTitle(existing.title || existing.name || existing.eventName);
    const existingStartTime = toStringValue(existing.startTime);
    const existingEventId = toStringValue(
      existing?.metadata?.eventId || existing.eventId || existing?.metadata?.uniqueId || ''
    ).split('_')[0];

    const sameTitle = Boolean(rowTitle) && rowTitle === existingTitle;
    const sameStartTime =
      (Boolean(rowStartTime) && Boolean(existingStartTime) && rowStartTime === existingStartTime) ||
      (!rowStartTime && !existingStartTime);
    const sameLegacyId = Boolean(rowEventId) && Boolean(existingEventId) && rowEventId === existingEventId;

    if ((sameLegacyId && (sameTitle || sameStartTime)) || (sameTitle && sameStartTime)) {
      return {
        conflict: true,
        existing: {
          id: toStringValue(existing.id),
          venueId,
          title: toStringValue(existing.title || existing.name || existing.eventName),
          startTime: existingStartTime,
          eventId: existingEventId,
        },
      };
    }
  }

  return { conflict: false };
}

async function initializeFirestore() {
  const serviceAccountPath =
    process.env.SERVICE_ACCOUNT_PATH || path.resolve(__dirname, '..', 'firebase', 'service-account.json');
  const resolvedPath = path.isAbsolute(serviceAccountPath)
    ? serviceAccountPath
    : path.resolve(__dirname, serviceAccountPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Missing service account file: ${resolvedPath}`);
  }
  const serviceAccount = require(resolvedPath);

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
  const db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

async function loadVenues(db) {
  const snapshot = await db.collection('venues').get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function normalizeDateFilter(date) {
  const normalized = parseDate(date);
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`Invalid --date value: ${date}`);
  }
  return normalized;
}

function selectRows(allRows, rowNumbers, targetDate, max) {
  if (rowNumbers.length > 0) {
    return rowNumbers
      .map((sheetRow) => {
        const index = sheetRow - 2;
        const rawRow = allRows[index];
        if (!rawRow) return null;
        return parseSourceRow(rawRow, sheetRow);
      })
      .filter(Boolean);
  }

  const selected = [];
  for (let i = 0; i < allRows.length; i += 1) {
    const sheetRow = i + 2;
    const parsed = parseSourceRow(allRows[i], sheetRow);
    if (parsed.startDate === targetDate) {
      selected.push(parsed);
      if (selected.length >= max) break;
    }
  }
  return selected;
}
async function run() {
  // Load env for local runs
  loadEnvFile(path.resolve(__dirname, '.env'));
  loadEnvFile(path.resolve(__dirname, '..', 'functions', '.env'));

  const args = parseArgs(process.argv.slice(2));
  const filePath = path.resolve(args.file || process.env.XLSX_PATH || DEFAULT_FILE);
  const sheetName = args.sheet || process.env.EVENTS_SHEET_NAME || DEFAULT_SHEET;
  const maxBatch = Math.min(Math.max(Number(args.max || process.env.BATCH_SIZE || DEFAULT_MAX), 1), 10);
  const targetDate = normalizeDateFilter(args.date || process.env.TARGET_DATE || DEFAULT_DATE);
  const rowNumbers = parseRowList(args.rows || process.env.ROW_NUMBERS || '');
  const apply = Boolean(args.apply);
  const uploadUrl = toStringValue(process.env.IMAGE_UPLOAD_URL) || DEFAULT_UPLOAD_URL;
  const firestoreEventsApiUrl =
    toStringValue(process.env.FIRESTORE_EVENTS_API_URL) || DEFAULT_FIRESTORE_EVENTS_API;
  const nowIso = new Date().toISOString();
  const batchId = `manual-${targetDate}-${nowIso.replace(/[:.]/g, '-')}`;
  const reportPath =
    args.report ||
    path.resolve(__dirname, '..', 'functions', 'tmp', `manual-migration-report-${Date.now()}.json`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`XLSX file not found: ${filePath}`);
  }
  if (apply && rowNumbers.length === 0) {
    throw new Error('Apply mode requires explicit --rows (sheet row numbers).');
  }

  const db = await initializeFirestore();
  const venues = await loadVenues(db);
  const matcher = new VenueMatcher(venues);
  const allRows = loadSheetRows(filePath, sheetName);
  const selectedRows = selectRows(allRows, rowNumbers, targetDate, maxBatch).slice(0, maxBatch);

  if (selectedRows.length === 0) {
    throw new Error('No rows selected for processing.');
  }

  const imageCache = new Map();
  const apiEventsByDate = new Map();
  const report = {
    generatedAt: nowIso,
    batchId,
    apply,
    filePath,
    sheetName,
    targetDate,
    maxBatch,
    selectedRows: selectedRows.map((row) => row.sheetRow),
    summary: {
      selected: selectedRows.length,
      matched: 0,
      ready: 0,
      duplicates: 0,
      reviews: 0,
      unmatched: 0,
      written: 0,
      updatedExisting: 0,
      skipped: 0,
      errors: 0,
      datesAligned: 0,
      timesInferred: 0,
      recurrenceWindowsInferred: 0,
      categoriesCorrected: 0,
      iconVenueProfileUpdated: 0,
      imageConversions: 0,
    },
    rows: [],
  };

  for (const row of selectedRows) {
    const rowResult = {
      sheetRow: row.sheetRow,
      name: row.name,
      establishment: row.establishment,
      startDate: row.startDate,
      endDate: row.endDate,
      startTime: row.startTime,
      endTime: row.endTime,
      status: 'pending',
      flags: [],
      imageActions: [],
    };

    try {
      if (!row.name || !row.establishment || !row.startDate) {
        rowResult.status = 'skipped';
        rowResult.reason = 'missing_required_fields';
        report.summary.skipped += 1;
        report.rows.push(rowResult);
        continue;
      }

      const dateAlignment = alignRecurringDateToPattern(row);
      if (dateAlignment.changed) {
        row.startDate = dateAlignment.row.startDate;
        row.endDate = dateAlignment.row.endDate;
        rowResult.startDate = row.startDate;
        rowResult.endDate = row.endDate;
        rowResult.dateAlignment = {
          method: dateAlignment.method,
          targetWeekday: dateAlignment.targetWeekday,
          originalStartDate: dateAlignment.originalStartDate,
          originalEndDate: dateAlignment.originalEndDate,
          adjustedStartDate: dateAlignment.adjustedStartDate,
          adjustedEndDate: dateAlignment.adjustedEndDate,
        };
        rowResult.flags.push('recurring_date_aligned');
        report.summary.datesAligned += 1;
      }

      const recurrenceInference = inferRecurrenceWindow(row);
      if (recurrenceInference.changed) {
        rowResult.recurrenceInference = recurrenceInference;
        rowResult.flags.push('recurrence_window_inferred');
        report.summary.recurrenceWindowsInferred += 1;
      }

      const venueResolution = resolveVenue(row, matcher);
      rowResult.venueResolution = venueResolution;

      if (venueResolution.status === 'unmatched') {
        rowResult.status = 'unmatched';
        rowResult.reason = venueResolution.reason;
        report.summary.unmatched += 1;
        report.summary.skipped += 1;
        report.rows.push(rowResult);
        continue;
      }

      if (venueResolution.status === 'review') {
        rowResult.status = 'review';
        rowResult.reason = venueResolution.reason;
        rowResult.flags.push(...(venueResolution.flags || []));
        report.summary.reviews += 1;
        report.summary.skipped += 1;
        report.rows.push(rowResult);
        continue;
      }

      report.summary.matched += 1;
      rowResult.flags.push(...(venueResolution.flags || []));

      const selectedVenue = venueResolution.selected.venue;
      const venueId = venueResolution.selected.venueId;
      const venueName = toStringValue(selectedVenue.pagename || selectedVenue.title || selectedVenue.name);
      rowResult.venueId = venueId;
      rowResult.venueName = venueName;

      const timeInference = inferEndTimeIfInvalid(row, selectedVenue);
      if (timeInference.changed) {
        rowResult.startTime = row.startTime;
        rowResult.endTime = row.endTime;
        rowResult.endDate = row.endDate;
        rowResult.timeInference = timeInference;
        if (timeInference.startChanged) {
          rowResult.flags.push('start_time_inferred');
        }
        rowResult.flags.push('end_time_inferred');
        report.summary.timesInferred += 1;
      }

      const normalizedCategory = canonicalizeCategoryLabel(normalizeCategory(row.category, row.isFoodSpecial));
      const categoryInference = inferCategoryFromContent(row, normalizedCategory);
      const category = canonicalizeCategoryLabel(categoryInference.category);
      const categoryChanged = Boolean(category) && category !== normalizedCategory;
      if (categoryChanged) {
        rowResult.flags.push('category_corrected');
        rowResult.categoryInference = {
          method: categoryInference.method,
          originalCategory: normalizedCategory,
          inferredCategory: category,
        };
        report.summary.categoriesCorrected += 1;
      }

      const isFoodSpecial = row.isFoodSpecial || /food\s*special/i.test(category);
      const isEvent = row.isEvent || !isFoodSpecial;
      const eventType = deriveEventType(category, isFoodSpecial);

      const duplicate = await findDuplicateForRow(db, venueId, row);
      rowResult.duplicateCheck = duplicate;
      if (duplicate.existing) {
        const hasQualityFix =
          categoryChanged || timeInference.changed || recurrenceInference.changed;
        const canUpdateDuplicateInPlace = duplicate.type !== 'legacy_event_series';
        if (apply && hasQualityFix && duplicate.existing.id && canUpdateDuplicateInPlace) {
          const existingRef = db
            .collection('venues')
            .doc(venueId)
            .collection('events')
            .doc(duplicate.existing.id);
          const existingSnap = await existingRef.get();
          const existingData = existingSnap.exists ? (existingSnap.data() || {}) : {};
          const updateGuard = canSafelyUpdateExistingDuplicate(existingData, row);
          rowResult.duplicateUpdateGuard = updateGuard;

          if (updateGuard.safe) {
            const updatePayload = {
              category,
              eventType,
              isFoodSpecial,
              isEvent,
              startDate: row.startDate,
              endDate: row.endDate || row.startDate,
              startTime: row.startTime || undefined,
              endTime: row.endTime || undefined,
              recurrenceCount: recurrenceInference.changed
                ? recurrenceInference.recurrenceCount
                : undefined,
              recurrenceEndDate: recurrenceInference.changed
                ? recurrenceInference.recurrenceEndDate
                : undefined,
              categoryResolution: categoryChanged
                ? {
                    adjusted: true,
                    method: categoryInference.method,
                    originalCategory: normalizedCategory,
                    inferredCategory: category,
                  }
                : undefined,
              timeResolution: timeInference.changed
                ? {
                    adjusted: true,
                    method: timeInference.method,
                    originalStartTime: timeInference.originalStartTime,
                    inferredStartTime: timeInference.startChanged
                      ? timeInference.startTime
                      : undefined,
                    originalEndTime: timeInference.originalEndTime,
                    originalEndDate: timeInference.originalEndDate,
                    inferredDurationMinutes: timeInference.inferredDurationMinutes,
                  }
                : undefined,
              recurrenceResolution: recurrenceInference.changed
                ? {
                    adjusted: true,
                    method: recurrenceInference.method,
                    recurrenceCount: recurrenceInference.recurrenceCount,
                    recurrenceEndDate: recurrenceInference.recurrenceEndDate,
                  }
                : undefined,
              timeFlags: timeInference.changed
                ? timeInference.startChanged
                  ? ['start_time_inferred', 'end_time_inferred']
                  : ['end_time_inferred']
                : undefined,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };
            await existingRef.set(updatePayload, { merge: true });

            rowResult.status = 'updated_existing';
            rowResult.updatedExistingId = duplicate.existing.id;
            report.summary.updatedExisting += 1;
            report.rows.push(rowResult);
            continue;
          }
        }

        rowResult.status = 'duplicate';
        report.summary.duplicates += 1;
        report.summary.skipped += 1;
        report.rows.push(rowResult);
        continue;
      }
      if (duplicate.timeframeCollision) {
        rowResult.status = 'review';
        rowResult.reason = 'same_venue_timeframe_collision';
        rowResult.flags.push('timeframe_collision');
        report.summary.reviews += 1;
        report.summary.skipped += 1;
        report.rows.push(rowResult);
        continue;
      }

      if (!apiEventsByDate.has(row.startDate)) {
        const apiEvents = await fetchApiEventsForDate(row.startDate, firestoreEventsApiUrl);
        apiEventsByDate.set(row.startDate, apiEvents);
      }
      const crossVenueConflict = findCrossVenueConflict(
        row,
        venueId,
        apiEventsByDate.get(row.startDate) || []
      );
      rowResult.crossVenueConflict = crossVenueConflict;
      if (crossVenueConflict.conflict) {
        rowResult.status = 'review';
        rowResult.reason = 'cross_venue_conflict_existing_event';
        rowResult.flags.push('cross_venue_conflict');
        report.summary.reviews += 1;
        report.summary.skipped += 1;
        report.rows.push(rowResult);
        continue;
      }

      report.summary.ready += 1;

      // Venue profile image rule:
      // - Do NOT override existing venue profileImage from sheet Icon.
      // - Only set from Icon when venue has no profile image.
      const existingVenueProfile = toStringValue(selectedVenue.profileImage);
      let eventIcon = existingVenueProfile;
      if (!eventIcon && row.icon) {
        eventIcon = await convertImageUrl(
          row.icon,
          'profilepictures',
          uploadUrl,
          imageCache,
          rowResult.imageActions,
          'icon'
        );
        if (!eventIcon) {
          eventIcon = toStringValue(row.icon);
        }
      }

      let image = toStringValue(row.image);
      let relevantImageUrl = toStringValue(row.relevantImageUrl) || image;
      let sharedPostThumbnail = toStringValue(row.sharedPostThumbnail);

      image = await convertImageUrl(image, 'postimages', uploadUrl, imageCache, rowResult.imageActions, 'image') || image;
      relevantImageUrl =
        (await convertImageUrl(
          relevantImageUrl,
          'postimages',
          uploadUrl,
          imageCache,
          rowResult.imageActions,
          'relevantImageUrl'
        )) || relevantImageUrl;
      sharedPostThumbnail =
        (await convertImageUrl(
          sharedPostThumbnail,
          'postimages',
          uploadUrl,
          imageCache,
          rowResult.imageActions,
          'sharedPostThumbnail'
        )) || sharedPostThumbnail;

      report.summary.imageConversions += rowResult.imageActions.filter((x) => x.status === 'converted').length;

      const mediaUrls = Array.from(new Set([relevantImageUrl, image, sharedPostThumbnail].filter(Boolean)));
      const docId = createEventDocId(venueId, row);
      rowResult.docId = docId;

      const usersRespondedNum = parseNumber(row.usersResponded);
      const doc = {
        // Core identity
        eventId: row.eventId || undefined,
        uniqueId: row.eventId ? `${row.eventId}_${docId}` : `${docId}_${row.sheetRow}`,
        venueId,

        // Classification
        category,
        eventType,
        isEvent,
        isFoodSpecial,
        isRecurring: row.isRecurring,
        recurringPattern: row.recurringPattern || undefined,
        recurrenceCount: recurrenceInference.changed
          ? recurrenceInference.recurrenceCount
          : undefined,
        recurrenceEndDate: recurrenceInference.changed
          ? recurrenceInference.recurrenceEndDate
          : undefined,

        // Event details
        name: row.name,
        description: row.description || undefined,
        establishment: row.establishment,
        establishmentNormalized: normalizeVenueName(row.establishment),
        venueName,
        address: row.address || row.cityAddress || toStringValue(selectedVenue.address) || undefined,
        city: row.cityAddress || undefined,
        streetAddress: row.streetAddress || undefined,
        latitude: row.latitude !== null ? row.latitude : parseNumber(selectedVenue.latitude),
        longitude: row.longitude !== null ? row.longitude : parseNumber(selectedVenue.longitude),
        startDate: row.startDate,
        endDate: row.endDate || row.startDate,
        startTime: row.startTime || undefined,
        endTime: row.endTime || undefined,
        utcStartDate: row.utcStartDate || undefined,

        // Pricing / links
        price: row.ticketPrice || undefined,
        ticketPrice: row.ticketPrice || undefined,
        ticketLink: row.ticketLink || undefined,
        ticketsBuyUrl: row.ticketsBuyUrl || undefined,
        ticketProvider: row.ticketProvider || undefined,

        // Organizer / engagement
        organizedBy: row.organizedBy || undefined,
        usersResponded: usersRespondedNum !== null ? usersRespondedNum : undefined,
        likes: row.likes !== null ? row.likes : undefined,
        shares: row.shares !== null ? row.shares : undefined,
        comments: row.comments !== null ? row.comments : undefined,
        topReactionsCount: row.topReactionsCount !== null ? row.topReactionsCount : undefined,

        // Media
        icon: eventIcon || undefined,
        profileUrl: eventIcon || undefined,
        image: image || undefined,
        imageUrl: relevantImageUrl || image || undefined,
        relevantImageUrl: relevantImageUrl || image || undefined,
        sharedPostThumbnail: sharedPostThumbnail || undefined,
        mediaUrls,

        // Source / audit
        facebookUrl: row.profileUrl || undefined,
        cleanedFacebookUrl: toStringValue(normalizeUrl(row.profileUrl)),
        sourceSheet: sheetName,
        sourceFileName: path.basename(filePath),
        sourceRow: row.sheetRow,
        sourceColumnsAtoAM: row.rawColumns,
        migrationVersion: 'manual-firestore-batch-v1',
        migrationBatchId: batchId,
        matchType: venueResolution.selected.matchType,
        matchScore: venueResolution.selected.score,
        categoryResolution: categoryChanged
          ? {
              adjusted: true,
              method: categoryInference.method,
              originalCategory: normalizedCategory,
              inferredCategory: category,
            }
          : undefined,
        timeResolution: timeInference.changed
          ? {
              adjusted: true,
              method: timeInference.method,
              originalStartTime: timeInference.originalStartTime,
              inferredStartTime: timeInference.startChanged
                ? timeInference.startTime
                : undefined,
              originalEndTime: timeInference.originalEndTime,
              originalEndDate: timeInference.originalEndDate,
              inferredDurationMinutes: timeInference.inferredDurationMinutes,
            }
          : undefined,
        timeFlags: timeInference.changed
          ? timeInference.startChanged
            ? ['start_time_inferred', 'end_time_inferred']
            : ['end_time_inferred']
          : undefined,
        recurrenceResolution: recurrenceInference.changed
          ? {
              adjusted: true,
              method: recurrenceInference.method,
              recurrenceCount: recurrenceInference.recurrenceCount,
              recurrenceEndDate: recurrenceInference.recurrenceEndDate,
            }
          : undefined,

        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        importedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      rowResult.preview = {
        category: doc.category,
        eventType: doc.eventType,
        isEvent: doc.isEvent,
        isFoodSpecial: doc.isFoodSpecial,
        imageUrl: doc.imageUrl || '',
        relevantImageUrl: doc.relevantImageUrl || '',
        icon: doc.icon || '',
      };

      if (!apply) {
        rowResult.status = 'ready_dry_run';
        report.rows.push(rowResult);
        continue;
      }

      const eventRef = db.collection('venues').doc(venueId).collection('events').doc(docId);
      const existingDoc = await eventRef.get();
      if (existingDoc.exists) {
        rowResult.status = 'duplicate';
        rowResult.reason = 'doc_id_already_exists';
        report.summary.duplicates += 1;
        report.summary.skipped += 1;
        report.rows.push(rowResult);
        continue;
      }

      await eventRef.set(doc, { merge: false });
      rowResult.status = 'written';
      report.summary.written += 1;

      if (!existingVenueProfile && eventIcon) {
        await db.collection('venues').doc(venueId).set(
          {
            profileImage: eventIcon,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        rowResult.venueProfileImageUpdated = true;
        report.summary.iconVenueProfileUpdated += 1;
      }

      report.rows.push(rowResult);
    } catch (error) {
      rowResult.status = 'error';
      rowResult.error = error instanceof Error ? error.message : String(error);
      report.summary.errors += 1;
      report.rows.push(rowResult);
    }
  }

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(
    JSON.stringify(
      {
        reportPath,
        apply,
        selectedRows: report.selectedRows,
        summary: report.summary,
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

