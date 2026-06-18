import { createHash } from 'crypto';
import { DateTime } from 'luxon';
import { extractContentByType } from '../parsing/eventExtractor.js';
import type { ExtractedItem } from '../parsing/types.js';
import {
  ParsedSharedEvent,
  SharedEventSourcePlatform,
  SharedEventSourceVisibility,
  SharedEventSubmitPayload,
  SharedEventVisibilityEvidence,
} from '../types/sharedEvent.js';
import { logger } from '../utils/logger.js';

export const SHARED_EVENT_PARSER_VERSION = 'shared-event-parser-v5';

const DEFAULT_TIMEZONE = 'America/Halifax';
const MAX_TEXT_LENGTH = 12000;
const MAX_SHORT_FIELD_LENGTH = 500;
const MAX_MEDIA_URLS = 8;
const MAX_CALENDAR_IMAGE_EXTRACTION_URLS = 2;
const PUBLIC_PROBE_FETCH_TIMEOUT_MS = 3000;
const PUBLIC_PROBE_TOTAL_BUDGET_MS = 7000;
const MONTH_LOOKUP: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};
const DAY_NAME_PATTERN = '(?:mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday|rday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)';
const WEEKDAY_LOOKUP: Record<string, number> = {
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
  sun: 7,
  sunday: 7,
};

const PRIVATE_VISIBILITY_HINTS = new Set([
  'closed',
  'friends',
  'invite',
  'invite_only',
  'invited',
  'private',
  'restricted',
  'group',
  'members',
]);
const PUBLIC_PROBE_USER_AGENTS = [
  'GathR shared-event public-access probe/1.0',
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'Facebot',
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
] as const;

function cleanString(value: unknown, maxLength = MAX_SHORT_FIELD_LENGTH): string {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, maxLength)
    .trim();
}

function cleanLongText(value: unknown): string {
  return cleanString(value, MAX_TEXT_LENGTH);
}

function decodeHtmlEntities(value: string): string {
  return String(value || '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10))
    )
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'");
}

function normalizeMediaUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const entry of value) {
    const raw = cleanString(entry, 2000);
    if (!raw || seen.has(raw)) continue;
    if (!/^https?:\/\//i.test(raw) && !/^file:\/\//i.test(raw)) continue;
    seen.add(raw);
    urls.push(raw);
    if (urls.length >= MAX_MEDIA_URLS) break;
  }

  return urls;
}

export function extractFirstUrl(text: string): string | undefined {
  const match = text.match(/https?:\/\/[^\s<>"')]+/i);
  return match?.[0]?.replace(/[.,;:!?]+$/, '');
}

export function normalizeSharedEventUrl(value: unknown): string | undefined {
  const raw = cleanString(value, 2000);
  if (!raw) return undefined;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const parsed = new URL(withProtocol);
    if (!['http:', 'https:'].includes(parsed.protocol)) return undefined;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export function detectSharedEventPlatform(url: string | undefined, sourcePlatform?: string): SharedEventSourcePlatform {
  const hinted = cleanString(sourcePlatform).toLowerCase();
  if (hinted.includes('facebook')) return 'facebook';
  if (hinted.includes('instagram')) return 'instagram';

  if (!url) return 'unknown';
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('facebook.com') || host.includes('fb.me')) return 'facebook';
    if (host.includes('instagram.com')) return 'instagram';
    return 'web';
  } catch {
    return 'unknown';
  }
}

function normalizeVisibilityHint(value: unknown): string {
  return cleanString(value, 120)
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function visibilityFromHint(value: unknown): SharedEventSourceVisibility | undefined {
  const hint = normalizeVisibilityHint(value);
  if (!hint) return undefined;
  if (hint === 'public') return undefined;
  if (PRIVATE_VISIBILITY_HINTS.has(hint)) return 'user_private';
  if ([...PRIVATE_VISIBILITY_HINTS].some((entry) => hint.includes(entry))) return 'user_private';
  return undefined;
}

function lineLooksLikeMetadata(line: string): boolean {
  return /^(when|where|location|venue|hosted by|organizer|description|details|date|time|tickets?)\s*:/i.test(line) ||
    /^https?:\/\//i.test(line) ||
    /^facebook$/i.test(line) ||
    /^event$/i.test(line);
}

function isGenericShareTitle(value: string): boolean {
  const normalized = value.toLowerCase().replace(/\s+/g, ' ').trim();
  return normalized === 'facebook' ||
    normalized === 'facebook event' ||
    normalized === 'event' ||
    normalized === 'log in or sign up to view';
}

function extractTitle(payload: SharedEventSubmitPayload, combinedText: string): string {
  const directTitle = cleanString(payload.title, 160);
  if (directTitle && !isGenericShareTitle(directTitle)) return directTitle;

  const lines = combinedText
    .split('\n')
    .map((line) => cleanString(line, 180))
    .filter(Boolean);

  return lines.find((line) => !lineLooksLikeMetadata(line)) || '';
}

function extractDescription(payload: SharedEventSubmitPayload, combinedText: string, title: string): string | undefined {
  const directDescription = cleanLongText(payload.description);
  if (directDescription) return directDescription;

  const lines = combinedText
    .split('\n')
    .map((line) => cleanString(line, 400))
    .filter(Boolean)
    .filter((line) => line !== title)
    .filter((line) => !/^https?:\/\//i.test(line));

  const descriptionLines = lines.filter((line) => !/^(when|where|location|venue|date|time)\s*:/i.test(line));
  return cleanLongText(descriptionLines.join('\n')) || undefined;
}

function normalizeIsoDate(value: unknown, timezone: string): string | undefined {
  const raw = cleanString(value, 100);
  if (!raw) return undefined;

  const isoDateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDateOnly) return `${isoDateOnly[1]}-${isoDateOnly[2]}-${isoDateOnly[3]}`;

  const parsed = DateTime.fromISO(raw, { zone: timezone });
  if (parsed.isValid) return parsed.toFormat('yyyy-MM-dd');

  return undefined;
}

function normalizeTime(value: unknown): string | undefined {
  const raw = cleanString(value, 2000).toLowerCase();
  if (!raw) return undefined;

  const hhmm = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (hhmm) return `${hhmm[1].padStart(2, '0')}:${hhmm[2]}`;

  const ampm = raw.match(/\b(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  if (!ampm) return undefined;

  let hour = Number(ampm[1]);
  const minute = Number(ampm[2] || '0');
  const suffix = ampm[3].toLowerCase();
  if (suffix.startsWith('p') && hour < 12) hour += 12;
  if (suffix.startsWith('a') && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return undefined;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function resolveYear(month: number, day: number, now: DateTime): number {
  let year = now.year;
  const zone = now.zoneName || DEFAULT_TIMEZONE;
  let candidate = DateTime.fromObject({ year, month, day }, { zone });
  if (candidate.isValid && candidate < now.minus({ days: 30 })) {
    year += 1;
    candidate = DateTime.fromObject({ year, month, day }, { zone });
  }
  return candidate.isValid ? year : now.year;
}

function buildDate(monthRaw: string, dayRaw: string, yearRaw: string | undefined, now: DateTime): string | undefined {
  const month = MONTH_LOOKUP[monthRaw.toLowerCase()];
  const day = Number(dayRaw);
  const year = yearRaw ? Number(yearRaw) : resolveYear(month, day, now);
  if (!month || !Number.isFinite(day) || !Number.isFinite(year)) return undefined;

  const parsed = DateTime.fromObject({ year, month, day }, { zone: now.zoneName || DEFAULT_TIMEZONE });
  return parsed.isValid ? parsed.toFormat('yyyy-MM-dd') : undefined;
}

function buildDateInTimezone(monthRaw: string, dayRaw: string, yearRaw: string | undefined, timezone: string): string | undefined {
  return buildDate(monthRaw, dayRaw, yearRaw, DateTime.now().setZone(timezone));
}

function extractDateFromText(text: string, timezone: string): string | undefined {
  const now = DateTime.now().setZone(timezone);
  const monthNamePattern = Object.keys(MONTH_LOOKUP).join('|');
  const monthFirst = new RegExp(
    `\\b(${monthNamePattern})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`,
    'i'
  );
  const dayFirst = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNamePattern})\\.?(?:\\s+(\\d{4}))?\\b`,
    'i'
  );

  const first = text.match(monthFirst);
  if (first) return buildDate(first[1], first[2], first[3], now);

  const second = text.match(dayFirst);
  if (second) return buildDate(second[2], second[1], second[3], now);

  return undefined;
}

function normalizeWeekdayToken(value: string): number | undefined {
  return WEEKDAY_LOOKUP[value.toLowerCase().replace(/\.$/, '')];
}

function resolveRelativeWeekdayDateFromText(
  text: string,
  timezone: string,
  startTime?: string,
  referenceIsoDateTime?: string
): string | undefined {
  const reference = normalizeIsoDateTime(referenceIsoDateTime, timezone);
  if (!reference) return undefined;

  const normalized = decodeHtmlEntities(text).replace(/\u2013|\u2014/g, '-');
  const match = normalized.match(new RegExp(`\\b(?:(this|next|every)\\s+)?(${DAY_NAME_PATTERN})\\b`, 'i'));
  if (!match?.[2]) return undefined;

  const modifier = cleanString(match[1], 20).toLowerCase();
  if (!modifier && !startTime) return undefined;

  const targetWeekday = normalizeWeekdayToken(match[2]);
  if (!targetWeekday) return undefined;

  const now = DateTime.fromISO(reference, { zone: timezone }).setZone(timezone);
  if (!now.isValid) return undefined;

  let daysToAdd = targetWeekday - now.weekday;
  if (daysToAdd < 0) daysToAdd += 7;
  if (modifier === 'next' && daysToAdd === 0) daysToAdd = 7;

  let resolved = now.plus({ days: daysToAdd });
  if (daysToAdd === 0 && startTime) {
    const [hourRaw, minuteRaw] = startTime.split(':');
    const eventStart = resolved.set({
      hour: Number(hourRaw),
      minute: Number(minuteRaw),
      second: 0,
      millisecond: 0,
    });
    if (eventStart.isValid && eventStart < now.minus({ hours: 2 })) {
      resolved = resolved.plus({ days: 7 });
    }
  }

  return resolved.toFormat('yyyy-MM-dd');
}

function cleanVenueCandidate(value: string): string | undefined {
  const cleaned = cleanString(value, 180)
    .replace(/\s+(?:this|next|every)\s+$/i, '')
    .replace(/[,.;:!?]+$/g, '')
    .trim();
  if (!cleaned || /^\d/.test(cleaned)) return undefined;
  if (/^\d{1,2}(?::\d{2})?\s*(?:am|pm)?$/i.test(cleaned)) return undefined;
  return cleaned;
}

function extractLocation(payload: SharedEventSubmitPayload, combinedText: string): { locationName?: string; address?: string } {
  const directLocation = cleanString(payload.locationName || payload.venueName, 180);
  const directAddress = cleanString(payload.address, 260);
  if (directLocation || directAddress) {
    return {
      locationName: directLocation || undefined,
      address: directAddress || undefined,
    };
  }

  const lines = combinedText
    .split('\n')
    .map((line) => cleanString(line, 260))
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^(where|location|venue)\s*:\s*(.+)$/i);
    if (match?.[2]) {
      return { locationName: cleanString(match[2], 180) || undefined };
    }
  }

  const venueBeforeWeekdayPattern = new RegExp(
    `\\bat\\s+([A-Z][A-Za-z0-9&'’., -]{2,90}?)(?=\\s+(?:(?:this|next|every)\\s+)?${DAY_NAME_PATTERN}\\b|[.!?]|$)`,
    'i'
  );
  for (const line of lines) {
    const match = line.match(venueBeforeWeekdayPattern);
    const venue = match?.[1] ? cleanVenueCandidate(match[1]) : undefined;
    if (venue) return { locationName: venue };
  }

  const eventInMatch = combinedText.match(/\b(?:event|festival|concert|show|party)\s+in\s+([^,.]+?)(?:\s+by\b|[,.]|$)/i);
  if (eventInMatch?.[1]) {
    return { locationName: cleanString(eventInMatch[1], 180) || undefined };
  }

  return {};
}

function sourceContentSignature(parts: Array<string | undefined>): string {
  const normalized = parts
    .map((part) => cleanString(part, MAX_TEXT_LENGTH).toLowerCase())
    .filter(Boolean)
    .join('\n---\n');
  return createHash('sha256').update(normalized).digest('hex');
}

function confidenceScore(params: {
  title: string;
  startDate?: string;
  startTime?: string;
  locationName?: string;
  address?: string;
  sourceUrl?: string;
}): number {
  let score = 0;
  if (params.title) score += 30;
  if (params.startDate) score += 35;
  if (params.startTime) score += 10;
  if (params.locationName || params.address) score += 15;
  if (params.sourceUrl) score += 10;
  return Math.min(score, 100);
}

function extractMetaContent(html: string, property: string, maxLength = 300): string {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["'][^>]*>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return cleanString(decodeHtmlEntities(match[1]), maxLength);
    }
  }
  return '';
}

function resolveMaybeRelativeUrl(raw: string, baseUrl: string): string | undefined {
  const normalized = cleanString(raw, 2000);
  if (!normalized) return undefined;
  try {
    return new URL(normalized, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function decodeHtmlAndJsonString(value: string, maxLength = MAX_SHORT_FIELD_LENGTH): string {
  const decoded = String(value || '')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16))
    )
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/\u202f/g, ' ');
  const entityDecoded = decodeHtmlEntities(decoded);
  return maxLength === MAX_TEXT_LENGTH ? cleanLongText(entityDecoded) : cleanString(entityDecoded, maxLength);
}

function extractEmbeddedJsonString(source: string, key: string, maxLength = MAX_SHORT_FIELD_LENGTH): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`"${escaped}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'i'));
  return match?.[1] ? decodeHtmlAndJsonString(match[1], maxLength) : '';
}

function extractEmbeddedJsonNumber(source: string, key: string): number | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`"${escaped}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`, 'i'));
  if (!match?.[1]) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractBalancedObjectAfterKey(source: string, key: string): string {
  const keyToken = `"${key}"`;
  const keyIndex = source.indexOf(keyToken);
  if (keyIndex < 0) return '';

  const start = source.indexOf('{', keyIndex + keyToken.length);
  if (start < 0) return '';

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }

  return '';
}

function extractFacebookEventId(value: string): string | undefined {
  const raw = cleanString(value, 2000);
  if (!raw) return undefined;

  const direct = raw.match(/[?&]event_id=(\d{8,})\b/i) ||
    raw.match(/\/events\/(?:[^/?#]+\/)*(\d{8,})(?:[/?#]|$)/i);
  return direct?.[1];
}

function extractMainFacebookEventWindow(html: string, finalUrl: string): string {
  const eventId = extractFacebookEventId(finalUrl) || extractFacebookEventId(extractMetaContent(html, 'og:url'));
  if (!eventId) return html;

  const candidates: Array<{ score: number; start: number; value: string }> = [];
  const token = `"id":"${eventId}"`;
  let index = html.indexOf(token);
  while (index >= 0) {
    const start = Math.max(0, index - 9000);
    const end = Math.min(html.length, index + 45000);
    const value = html.slice(start, end);
    const lowered = value.toLowerCase();
    const score = [
      lowered.includes('"event_place"') ? 4 : 0,
      lowered.includes('"start_timestamp"') ? 4 : 0,
      lowered.includes('"day_time_sentence"') ? 3 : 0,
      lowered.includes('"cover_media_renderer"') ? 3 : 0,
      lowered.includes('"event_description"') ? 2 : 0,
    ].reduce((sum, entry) => sum + entry, 0);
    candidates.push({ score, start, value });
    index = html.indexOf(token, index + token.length);
  }

  candidates.sort((a, b) => b.score - a.score || a.start - b.start);
  return candidates[0]?.score ? candidates[0].value : html;
}

function timestampToDateTime(timestamp: number | undefined): { date?: string; time?: string } {
  if (!timestamp || timestamp < 0) return {};

  const value = timestamp > 9999999999 ? timestamp / 1000 : timestamp;
  const parsed = DateTime.fromSeconds(value, { zone: DEFAULT_TIMEZONE });
  if (!parsed.isValid) return {};

  return {
    date: parsed.toFormat('yyyy-MM-dd'),
    time: parsed.toFormat('HH:mm'),
  };
}

function timestampToIso(timestamp: number | undefined, timezone: string = DEFAULT_TIMEZONE): string | undefined {
  if (!timestamp || timestamp < 0) return undefined;
  const value = timestamp > 9999999999 ? timestamp / 1000 : timestamp;
  const parsed = DateTime.fromSeconds(value, { zone: timezone });
  return parsed.isValid ? parsed.toISO() || undefined : undefined;
}

function normalizeIsoDateTime(value: unknown, timezone: string): string | undefined {
  const raw = cleanString(value, 200);
  if (!raw) return undefined;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 1000000000) {
    return timestampToIso(numeric, timezone);
  }
  const parsed = DateTime.fromISO(raw, { zone: timezone });
  return parsed.isValid ? parsed.setZone(timezone).toISO() || undefined : undefined;
}

function looksLikeStreetAddress(value: string): boolean {
  const normalized = cleanString(value, 260);
  return /\b\d{1,6}\s+[A-Za-z]/.test(normalized) ||
    /\b(street|st\.?|road|rd\.?|avenue|ave\.?|drive|dr\.?|lane|ln\.?|boulevard|blvd\.?|highway|hwy\.?|route|place|pl\.?)\b/i
      .test(normalized);
}

function isFacebookLookasideCrawlerUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.hostname.toLowerCase() === 'lookaside.fbsbx.com' &&
      parsed.pathname.toLowerCase().includes('/lookaside/crawler/media');
  } catch {
    return false;
  }
}

function extractFacebookCoverImageUrl(block: string, finalUrl: string): string | undefined {
  const cover = extractBalancedObjectAfterKey(block, 'cover_media_renderer');
  const fullImage = cover ? extractBalancedObjectAfterKey(cover, 'full_image') : '';
  const imageCandidate =
    extractEmbeddedJsonString(fullImage, 'uri', 2000) ||
    extractEmbeddedJsonString(cover, 'uri', 2000);
  return resolveMaybeRelativeUrl(imageCandidate, finalUrl);
}

export function extractFacebookEmbeddedEventData(
  html: string,
  finalUrl: string
): Pick<SharedEventVisibilityEvidence, 'title' | 'description' | 'imageUrl' | 'startDate' | 'endDate' | 'startTime' | 'endTime' | 'locationName' | 'address'> {
  const block = extractMainFacebookEventWindow(html, finalUrl);
  const start = timestampToDateTime(
    extractEmbeddedJsonNumber(block, 'start_timestamp') ||
    extractEmbeddedJsonNumber(block, 'current_start_timestamp')
  );
  const end = timestampToDateTime(extractEmbeddedJsonNumber(block, 'end_timestamp'));
  const eventDescription = extractBalancedObjectAfterKey(block, 'event_description');
  const eventPlace = extractBalancedObjectAfterKey(block, 'event_place');
  const placeName =
    extractEmbeddedJsonString(eventPlace, 'contextual_name', 260) ||
    extractEmbeddedJsonString(eventPlace, 'name', 260);
  const oneLineAddress = extractEmbeddedJsonString(block, 'one_line_address', 260);
  const address = oneLineAddress || (looksLikeStreetAddress(placeName) ? placeName : '');
  const locationName = placeName && !looksLikeStreetAddress(placeName) ? placeName : '';

  return {
    title: extractEmbeddedJsonString(block, 'name', 180) || undefined,
    description: extractEmbeddedJsonString(eventDescription, 'text', MAX_TEXT_LENGTH) || undefined,
    imageUrl: extractFacebookCoverImageUrl(block, finalUrl),
    startDate: start.date,
    startTime: start.time || normalizeTime(
      extractEmbeddedJsonString(block, 'start_time_formatted') ||
      extractEmbeddedJsonString(block, 'day_time_sentence')
    ),
    endDate: end.date,
    endTime: end.time,
    locationName: locationName || undefined,
    address: address || undefined,
  };
}

function extractFacebookPostId(value: string): string | undefined {
  const raw = cleanString(value, 2200);
  if (!raw) return undefined;

  const direct = raw.match(/[?&]story_fbid=(\d{8,})\b/i) ||
    raw.match(/\/posts\/(?:[^/?#]+\/)?(\d{8,})(?:[/?#]|$)/i) ||
    raw.match(/"post_id"\s*:\s*"(\d{8,})"/i) ||
    raw.match(/\bstory_fbid[=\\"':]+(\d{8,})\b/i);
  return direct?.[1];
}

function extractFacebookOwnerId(value: string): string | undefined {
  const raw = cleanString(value, 4000);
  if (!raw) return undefined;

  const direct = raw.match(/[?&]id=(\d{8,})\b/i) ||
    raw.match(/"owning_profile_id"\s*:\s*"(\d{8,})"/i) ||
    raw.match(/"actor_id"\s*:\s*"(\d{8,})"/i) ||
    raw.match(/"profile_id"\s*:\s*"(\d{8,})"/i);
  return direct?.[1];
}

function normalizeFacebookEscapedUrlText(value: string): string {
  return decodeHtmlEntities(String(value || ''))
    .replace(/\\\//g, '/')
    .replace(/\\u0025/g, '%')
    .replace(/\\u0026/g, '&')
    .replace(/\\u003d/gi, '=')
    .replace(/%3A/gi, ':')
    .replace(/%2F/gi, '/')
    .replace(/%3F/gi, '?')
    .replace(/%3D/gi, '=')
    .replace(/%26/gi, '&');
}

function extractFacebookStoryIds(value: string): { postId?: string; ownerId?: string } {
  const raw = normalizeFacebookEscapedUrlText(value);
  const storyUrl = raw.match(/facebook\.com\/story\.php\?[^"' <>\n\\]*story_fbid=(\d{8,})[^"' <>\n\\]*[?&]id=(\d{8,})/i);
  if (storyUrl) {
    return { postId: storyUrl[1], ownerId: storyUrl[2] };
  }

  return {
    postId: extractFacebookPostId(raw),
    ownerId: extractFacebookOwnerId(raw),
  };
}

export function extractFacebookCanonicalStoryUrl(html: string, finalUrl: string): string | undefined {
  const sources = [
    finalUrl,
    extractMetaContent(html, 'og:url', 2200),
    html,
  ];

  for (const source of sources) {
    const ids = extractFacebookStoryIds(source);
    if (ids.postId && ids.ownerId) {
      return `https://www.facebook.com/story.php?story_fbid=${ids.postId}&id=${ids.ownerId}`;
    }
  }

  return undefined;
}

function facebookCanonicalPostProbeUrls(value: string): string[] {
  const ids = extractFacebookStoryIds(value);
  if (!ids.postId || !ids.ownerId) {
    return [];
  }

  return [
    `https://www.facebook.com/permalink.php?story_fbid=${ids.postId}&id=${ids.ownerId}`,
    `https://www.facebook.com/${ids.ownerId}/posts/${ids.postId}`,
    `https://m.facebook.com/permalink.php?story_fbid=${ids.postId}&id=${ids.ownerId}`,
    `https://www.facebook.com/story.php?story_fbid=${ids.postId}&id=${ids.ownerId}`,
  ];
}

function extractMainFacebookPostWindow(html: string, finalUrl: string): string {
  const postId = extractFacebookPostId(finalUrl) ||
    extractFacebookPostId(extractMetaContent(html, 'og:url', 2200)) ||
    extractEmbeddedJsonString(html, 'post_id', 80);
  if (!postId) return html;

  const token = `"post_id":"${postId}"`;
  const index = html.indexOf(token);
  if (index >= 0) {
    return html.slice(Math.max(0, index - 16000), Math.min(html.length, index + 90000));
  }

  const fallbackIndex = html.indexOf(postId);
  return fallbackIndex >= 0
    ? html.slice(Math.max(0, fallbackIndex - 16000), Math.min(html.length, fallbackIndex + 90000))
    : html;
}

function looksLikeFacebookPostUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    return path.includes('/share/p') ||
      path.includes('/posts/') ||
      path.includes('/story.php') ||
      Boolean(parsed.searchParams.get('story_fbid'));
  } catch {
    return /facebook\.com\/share\/p|facebook\.com\/.+\/posts\/|story\.php/i.test(url);
  }
}

function extractFacebookPostData(
  html: string,
  finalUrl: string
): Pick<SharedEventVisibilityEvidence, 'description' | 'sourcePublishedAt'> {
  if (!looksLikeFacebookPostUrl(finalUrl) && !looksLikeFacebookPostUrl(extractMetaContent(html, 'og:url', 2200))) {
    return {};
  }

  const block = extractMainFacebookPostWindow(html, finalUrl);
  const messageBlock = extractBalancedObjectAfterKey(block, 'message_container') ||
    extractBalancedObjectAfterKey(block, 'message') ||
    block;
  const text = extractEmbeddedJsonString(messageBlock, 'text', MAX_TEXT_LENGTH);
  const sourcePublishedAt = timestampToIso(
    extractEmbeddedJsonNumber(block, 'creation_time') ||
    extractEmbeddedJsonNumber(block, 'publish_time') ||
    extractEmbeddedJsonNumber(block, 'published_time') ||
    extractEmbeddedJsonNumber(block, 'created_time')
  );

  return {
    ...(text ? { description: text } : {}),
    ...(sourcePublishedAt ? { sourcePublishedAt } : {}),
  };
}

function hasFacebookLoginPrompt(html: string): boolean {
  const lowered = html.toLowerCase();
  return lowered.includes('you must log in') ||
    lowered.includes('log in to facebook');
}

function looksLikeFacebookLoginUrl(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().includes('/login');
  } catch {
    return /facebook\.com\/login/i.test(url);
  }
}

function looksLikeFacebookLoginPage(html: string, finalUrl: string, title: string): boolean {
  if (looksLikeFacebookLoginUrl(finalUrl)) return true;
  const normalizedTitle = cleanString(decodeHtmlEntities(title), 140).toLowerCase();
  if (!hasFacebookLoginPrompt(html) && !normalizedTitle.startsWith('log in')) return false;
  return normalizedTitle.startsWith('log in or sign up') ||
    normalizedTitle === 'facebook' ||
    normalizedTitle.startsWith('log into facebook') ||
    normalizedTitle.startsWith('log in to facebook');
}

function looksLikeUnavailableFacebookResponse(html: string): boolean {
  const lowered = html.toLowerCase();
  const title = cleanString(decodeHtmlEntities((html.match(/<title[^>]*>([^<]*)/i) || [])[1]), 180).toLowerCase();
  const earlyPageText = lowered.slice(0, 40000);
  return title.includes('content not found') ||
    title.includes('not available') ||
    title.includes('checkpoint') ||
    earlyPageText.includes("this content isn't") ||
    earlyPageText.includes('this content is not') ||
    earlyPageText.includes('content not found') ||
    earlyPageText.includes('temporarily unavailable') ||
    earlyPageText.includes('not available right now');
}

async function fetchPublicProbeHtml(url: string, userAgent: string): Promise<{
  response: Response;
  finalUrl: string;
  clippedHtml: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PUBLIC_PROBE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'user-agent': userAgent,
      },
    });
    const finalUrl = response.url || url;
    const html = await response.text();
    return {
      response,
      finalUrl,
      clippedHtml: html.slice(0, 1500000),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildPublicProbeEvidence(params: {
  checkedAt: string;
  url: string;
  response: Response;
  finalUrl: string;
  clippedHtml: string;
}): SharedEventVisibilityEvidence & { visibility: SharedEventSourceVisibility } {
  const { checkedAt, url, response, finalUrl, clippedHtml } = params;
  const ogTitle = extractMetaContent(clippedHtml, 'og:title');
  const ogDescription = extractMetaContent(clippedHtml, 'og:description') ||
    extractMetaContent(clippedHtml, 'description');
  const imageCandidate = extractMetaContent(clippedHtml, 'og:image', 2000) ||
    extractMetaContent(clippedHtml, 'twitter:image', 2000);
  const ogImageUrl = resolveMaybeRelativeUrl(imageCandidate, finalUrl || url);
  const ogType = extractMetaContent(clippedHtml, 'og:type');
  const metaPublishedAt = normalizeIsoDateTime(
    extractMetaContent(clippedHtml, 'article:published_time') ||
    extractMetaContent(clippedHtml, 'og:updated_time'),
    DEFAULT_TIMEZONE
  );
  const embeddedEventData = extractFacebookEmbeddedEventData(clippedHtml, finalUrl || url);
  const embeddedPostData = extractFacebookPostData(clippedHtml, finalUrl || url);
  const facebookStoryIds = extractFacebookStoryIds(`${finalUrl}\n${extractMetaContent(clippedHtml, 'og:url', 2200)}\n${clippedHtml.slice(0, 250000)}`);
  const imageUrl = embeddedEventData.imageUrl ||
    (isFacebookLookasideCrawlerUrl(ogImageUrl) ? undefined : ogImageUrl);
  const bestTitle = embeddedEventData.title || ogTitle;
  const bestDescription = embeddedEventData.description || embeddedPostData.description || ogDescription;
  const sourcePublishedAt = embeddedPostData.sourcePublishedAt || metaPublishedAt;
  const isLoginPage = looksLikeFacebookLoginPage(clippedHtml, finalUrl || url, bestTitle || ogTitle || '');
  const isUnavailable = looksLikeUnavailableFacebookResponse(clippedHtml);
  const hasUsefulMetadata =
    Boolean(bestTitle && bestTitle.toLowerCase() !== 'facebook') &&
    (Boolean(bestDescription) || Boolean(ogType));

  if (response.ok && hasUsefulMetadata && !isLoginPage && !isUnavailable) {
    return {
      visibility: 'public_verified',
      method: 'public_url_probe',
      checkedAt,
      url,
      finalUrl,
      httpStatus: response.status,
      reason: 'Public URL returned usable metadata without user credentials.',
      titleFound: Boolean(bestTitle),
      descriptionFound: Boolean(bestDescription),
      title: bestTitle || undefined,
      description: bestDescription || undefined,
      imageUrl,
      startDate: embeddedEventData.startDate,
      endDate: embeddedEventData.endDate,
      startTime: embeddedEventData.startTime,
      endTime: embeddedEventData.endTime,
      locationName: embeddedEventData.locationName,
      address: embeddedEventData.address,
      ogType: ogType || undefined,
      sourcePostId: facebookStoryIds.postId,
      sourceOwnerId: facebookStoryIds.ownerId,
      sourcePublishedAt,
    };
  }

  return {
    visibility: response.status === 401 || response.status === 403 || isLoginPage || isUnavailable
      ? 'restricted_unverified'
      : 'unknown',
    method: 'public_url_probe',
    checkedAt,
    url,
    finalUrl,
    httpStatus: response.status,
    reason: isUnavailable
      ? 'Public probe reached a checkpoint or unavailable-content response.'
      : isLoginPage
        ? 'Public probe reached a login response without enough event metadata.'
      : 'Public probe did not return enough usable event metadata.',
    titleFound: Boolean(bestTitle),
    descriptionFound: Boolean(bestDescription),
    title: bestTitle || undefined,
    description: bestDescription || undefined,
    imageUrl,
    startDate: embeddedEventData.startDate,
    endDate: embeddedEventData.endDate,
    startTime: embeddedEventData.startTime,
    endTime: embeddedEventData.endTime,
    locationName: embeddedEventData.locationName,
    address: embeddedEventData.address,
    ogType: ogType || undefined,
    sourcePostId: facebookStoryIds.postId,
    sourceOwnerId: facebookStoryIds.ownerId,
    sourcePublishedAt,
  };
}

function textLooksTruncated(value: string): boolean {
  const text = cleanLongText(value);
  return text.endsWith('...') || text.endsWith(String.fromCharCode(8230));
}

function countDatedFacebookPostLines(value: string): number {
  const matches = cleanLongText(value).match(
    /\b(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day)?\s+(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+\d{1,2}\b/gi
  );
  return matches?.length || 0;
}

function isStrongPublicEvidence(evidence: SharedEventVisibilityEvidence): boolean {
  const description = evidence.description ? cleanLongText(evidence.description) : '';
  const eventMetadataLooksComplete = Boolean(
    evidence.title &&
    (evidence.startDate || evidence.startTime) &&
    (evidence.locationName || evidence.address)
  );
  const facebookPostLooksComplete = Boolean(
    evidence.sourcePostId &&
    evidence.sourceOwnerId &&
    description.length >= 280 &&
    !textLooksTruncated(description) &&
    countDatedFacebookPostLines(description) >= 2
  );
  return eventMetadataLooksComplete || facebookPostLooksComplete;
}

function publicEvidenceScore(evidence: SharedEventVisibilityEvidence): number {
  const description = evidence.description ? cleanLongText(evidence.description) : '';
  const descriptionLooksTruncated = textLooksTruncated(description);
  return [
    evidence.title ? 100 : 0,
    description ? Math.min(description.length * 2, 4000) : 0,
    descriptionLooksTruncated ? -500 : 0,
    evidence.imageUrl ? 150 : 0,
    evidence.startDate ? 300 : 0,
    evidence.startTime ? 150 : 0,
    evidence.locationName || evidence.address ? 200 : 0,
    evidence.sourcePostId ? 200 : 0,
    evidence.sourceOwnerId ? 800 : 0,
  ].reduce((sum, value) => sum + value, 0);
}

async function probePublicUrl(url: string): Promise<SharedEventVisibilityEvidence & { visibility: SharedEventSourceVisibility }> {
  const checkedAt = new Date().toISOString();
  const startedAt = Date.now();
  let fallback: (SharedEventVisibilityEvidence & { visibility: SharedEventSourceVisibility }) | undefined;
  let bestPublic: (SharedEventVisibilityEvidence & { visibility: SharedEventSourceVisibility }) | undefined;
  let lastError: unknown;
  const urlsToProbe = [url];
  const seenUrls = new Set<string>();

  for (let urlIndex = 0; urlIndex < urlsToProbe.length && urlIndex < 5; urlIndex += 1) {
    if (Date.now() - startedAt > PUBLIC_PROBE_TOTAL_BUDGET_MS) break;
    const currentUrl = urlsToProbe[urlIndex];
    if (seenUrls.has(currentUrl)) continue;
    seenUrls.add(currentUrl);

    for (const userAgent of PUBLIC_PROBE_USER_AGENTS) {
      if (Date.now() - startedAt > PUBLIC_PROBE_TOTAL_BUDGET_MS) break;
      try {
        const probe = await fetchPublicProbeHtml(currentUrl, userAgent);
        const canonicalStoryUrl = extractFacebookCanonicalStoryUrl(probe.clippedHtml, probe.finalUrl);
        let addedCanonicalProbeUrl = false;
        for (const canonicalUrl of canonicalStoryUrl ? facebookCanonicalPostProbeUrls(canonicalStoryUrl) : []) {
          if (!seenUrls.has(canonicalUrl) && !urlsToProbe.includes(canonicalUrl)) {
            urlsToProbe.push(canonicalUrl);
            addedCanonicalProbeUrl = true;
          }
        }

        const evidence = buildPublicProbeEvidence({ checkedAt, url: currentUrl, ...probe });
        if (evidence.visibility === 'public_verified') {
          if (isStrongPublicEvidence(evidence)) {
            return evidence;
          }
          const currentScore = publicEvidenceScore(evidence);
          const bestScore = bestPublic ? publicEvidenceScore(bestPublic) : -1;
          if (!bestPublic || currentScore > bestScore) {
            bestPublic = evidence;
          }
          continue;
        }
        fallback = fallback || evidence;
        if (
          addedCanonicalProbeUrl &&
          evidence.sourcePostId &&
          evidence.sourceOwnerId &&
          looksLikeFacebookPostUrl(currentUrl)
        ) {
          break;
        }
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (bestPublic) return bestPublic;

  return fallback || {
    visibility: 'restricted_unverified',
    method: 'public_url_probe',
    checkedAt,
    url,
    reason: lastError instanceof Error ? lastError.message : 'Public probe failed.',
  };
}

export async function verifySharedEventSourceVisibility(
  payload: SharedEventSubmitPayload,
  sourceUrl: string | undefined
): Promise<{ visibility: SharedEventSourceVisibility; evidence: SharedEventVisibilityEvidence }> {
  const hint = normalizeVisibilityHint(payload.visibilityHint);
  const hintedVisibility = visibilityFromHint(payload.visibilityHint);
  if (hintedVisibility === 'user_private') {
    return {
      visibility: 'user_private',
      evidence: {
        method: 'share_payload_hint',
        checkedAt: new Date().toISOString(),
        url: sourceUrl,
        reason: 'Share payload indicated private or restricted source visibility.',
        visibilityHint: hint,
      },
    };
  }

  if (!sourceUrl) {
    return {
      visibility: 'user_private',
      evidence: {
        method: 'no_url',
        checkedAt: new Date().toISOString(),
        reason: 'No source URL was supplied; using user-provided share payload only.',
        visibilityHint: hint || undefined,
      },
    };
  }

  const normalizedUrl = normalizeSharedEventUrl(sourceUrl);
  if (!normalizedUrl) {
    return {
      visibility: 'unknown',
      evidence: {
        method: 'invalid_url',
        checkedAt: new Date().toISOString(),
        url: sourceUrl,
        reason: 'Source URL could not be normalized.',
        visibilityHint: hint || undefined,
      },
    };
  }

  const probe = await probePublicUrl(normalizedUrl);
  return {
    visibility: probe.visibility,
    evidence: {
      ...probe,
      visibilityHint: hint || undefined,
    },
  };
}

type ExtractedShareEventLine = {
  title: string;
  description: string;
  startDate: string;
  startTime?: string;
};

function normalizeTimeText(value: string): string {
  return cleanString(value, 500)
    .replace(/\b(\d{1,2})\.(?=\s*[ap]\.?m\.?\b)/gi, '$1')
    .replace(/\b([ap])\.m\.?\b/gi, '$1m');
}

function cleanExtractedEventTitle(value: string): string {
  let title = decodeHtmlEntities(value)
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  title = title
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .replace(/\s*(?:@|at|from|[-\u2013\u2014])\s*\d{1,2}(?::\d{2})?\s*\.?\s*[ap]\.?m\.?.*$/i, '')
    .replace(/[\.\u2026]+$/g, '')
    .trim();

  return cleanString(title, 160);
}

function extractEventLinesFromShareText(text: string, timezone: string): ExtractedShareEventLine[] {
  const source = decodeHtmlEntities(text)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\u2013|\u2014/g, '-')
    .trim();
  if (!source) return [];

  const monthNamePattern = Object.keys(MONTH_LOOKUP)
    .sort((a, b) => b.length - a.length)
    .join('|');
  const pattern = new RegExp(
    `^\\s*(?:[^\\w\\d\\n]{0,8}\\s*)?(?:${DAY_NAME_PATTERN}\\.?\\s+)?` +
    `(${monthNamePattern})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\s*` +
    `(?:[-\\u2014:|]\\s*)?(.+?)$`,
    'i'
  );

  const results: ExtractedShareEventLine[] = [];
  const seen = new Set<string>();
  for (const line of source.split('\n')) {
    const match = cleanString(line, 700).match(pattern);
    if (!match) continue;

    const startDate = buildDateInTimezone(match[1], match[2], match[3], timezone);
    const rawDetails = cleanString(match[4], 600);
    if (!startDate || !rawDetails) continue;

    const firstLine = rawDetails;
    const normalizedDetails = normalizeTimeText(firstLine);
    const title = cleanExtractedEventTitle(firstLine);
    if (!title) continue;

    const key = `${startDate}|${normalizeTime(normalizedDetails) || ''}|${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      title,
      description: cleanString(`${match[0]}`.replace(/^\s+/, ''), 600),
      startDate,
      startTime: normalizeTime(normalizedDetails),
    });
  }

  return results.slice(0, 12);
}

function reviewReasonsForEvent(params: {
  title: string;
  startDate?: string;
  locationName?: string;
  address?: string;
  isExpired?: boolean;
}): string[] {
  const reviewReasons: string[] = [];
  if (!params.title) reviewReasons.push('missing_title');
  if (!params.startDate) reviewReasons.push('missing_start_date');
  if (!params.locationName && !params.address) reviewReasons.push('missing_location');
  if (params.isExpired) reviewReasons.push('event_expired');
  return reviewReasons;
}

function eventLooksExpired(startDate: string | undefined, startTime: string | undefined, timezone: string): boolean {
  if (!startDate) return false;
  const eventDate = DateTime.fromFormat(startDate, 'yyyy-MM-dd', { zone: timezone });
  if (!eventDate.isValid) return false;

  const now = DateTime.now().setZone(timezone);
  if (eventDate.startOf('day') < now.startOf('day')) return true;
  if (eventDate.startOf('day') > now.startOf('day')) return false;
  if (!startTime) return false;

  const [hourRaw, minuteRaw] = startTime.split(':');
  const start = eventDate.set({
    hour: Number(hourRaw),
    minute: Number(minuteRaw),
    second: 0,
    millisecond: 0,
  });
  return start.isValid && start < now.minus({ hours: 8 });
}

function buildExtractedParsedEventsFromShareText(primary: ParsedSharedEvent): ParsedSharedEvent[] {
  if (!looksLikeFacebookPostUrl(primary.sourceUrl || '') && !/video|article/i.test(String(primary.visibilityEvidence.ogType || ''))) {
    return [];
  }

  const lines = extractEventLinesFromShareText(primary.description || '', primary.timezone);
  if (lines.length === 0) return [];

  const inferredVenue = cleanString(primary.visibilityEvidence.locationName, 180) ||
    cleanString(primary.locationName, 180) ||
    cleanString(primary.visibilityEvidence.title, 180);
  const inferredAddress = cleanString(primary.visibilityEvidence.address, 260) ||
    cleanString(primary.address, 260);

  return lines.map((line, index) => {
    const locationName = inferredVenue || undefined;
    const address = inferredAddress || undefined;
    const isExpired = eventLooksExpired(line.startDate, line.startTime, primary.timezone);
    const routing = isExpired
      ? 'not_public_candidate'
      : primary.sourceVisibility === 'public_verified'
        ? 'public_candidate'
        : 'private_only';
    const reviewReasons = reviewReasonsForEvent({
      title: line.title,
      startDate: line.startDate,
      locationName,
      address,
      isExpired,
    });
    const confidence = confidenceScore({
      title: line.title,
      startDate: line.startDate,
      startTime: line.startTime,
      locationName,
      address,
      sourceUrl: primary.sourceUrl,
    });
    const needsUserReview = reviewReasons.includes('missing_title') ||
      reviewReasons.includes('missing_start_date') ||
      reviewReasons.includes('event_expired') ||
      confidence < 55;
    const status = isExpired
      ? 'expired'
      : routing === 'public_candidate'
      ? 'submitted_public_candidate'
      : needsUserReview
        ? 'needs_user_review'
        : 'saved';

    return {
      ...primary,
      title: line.title,
      description: line.description,
      startDate: line.startDate,
      endDate: line.startDate,
      startTime: line.startTime,
      endTime: undefined,
      locationName,
      address,
      routing,
      status,
      confidence,
      needsUserReview,
      reviewReasons,
      isExpired,
      sequenceIndex: index,
      extractedFromShare: true,
      sourceContentSignature: sourceContentSignature([
        primary.sourceUrl,
        line.title,
        line.description,
        line.startDate,
        line.startTime,
        locationName,
        address,
        String(index),
      ]),
    };
  });
}

function shouldAttemptCalendarImageExtraction(primary: ParsedSharedEvent): boolean {
  if (primary.mediaUrls.length === 0) return false;
  if (String(process.env.ENABLE_SHARED_EVENT_IMAGE_CALENDAR_EXTRACTION || 'true').toLowerCase() === 'false') {
    return false;
  }

  const hasStructuredEvent = Boolean(primary.startDate && (primary.locationName || primary.address));
  if (hasStructuredEvent) return false;

  const text = [
    primary.title,
    primary.description,
    primary.visibilityEvidence.title,
    primary.visibilityEvidence.description,
  ].filter(Boolean).join('\n');

  return primary.reviewReasons.includes('missing_start_date') ||
    /\b(calendar|schedule|line[-\s]?up|coming up|this month|next month)\b/i.test(text) ||
    /\b(?:jan|feb|mar|apr|may|jun|june|jul|july|aug|sep|sept|oct|nov|dec)[a-z]*\s*!{0,2}\b/i.test(text);
}

function buildExtractedParsedEventsFromCalendarItems(
  primary: ParsedSharedEvent,
  items: ExtractedItem[]
): ParsedSharedEvent[] {
  const inferredVenue = cleanString(primary.locationName, 180) ||
    cleanString(primary.visibilityEvidence.locationName, 180) ||
    cleanString(primary.visibilityEvidence.title, 180);
  const inferredAddress = cleanString(primary.address, 260) ||
    cleanString(primary.visibilityEvidence.address, 260);

  return items
    .map((item, index): ParsedSharedEvent | undefined => {
      const title = cleanString(item.name, 220);
      const startDate = normalizeIsoDate(item.date, primary.timezone);
      const startTime = normalizeTime(item.startTime);
      const endTime = normalizeTime('endTime' in item ? item.endTime : undefined);
      const locationName = cleanString(item.venue, 180) || inferredVenue || undefined;
      const address = inferredAddress || undefined;
      const description = cleanLongText('description' in item ? item.description : '') ||
        `Extracted from shared calendar image.`;

      if (!title && !startDate) return undefined;

      const isExpired = eventLooksExpired(startDate, startTime, primary.timezone);
      const routing = isExpired
        ? 'not_public_candidate'
        : primary.sourceVisibility === 'public_verified'
          ? 'public_candidate'
          : 'private_only';
      const reviewReasons = reviewReasonsForEvent({
        title,
        startDate,
        locationName,
        address,
        isExpired,
      });
      const confidence = confidenceScore({
        title,
        startDate,
        startTime,
        locationName,
        address,
        sourceUrl: primary.sourceUrl,
      });
      const needsUserReview = reviewReasons.includes('missing_title') ||
        reviewReasons.includes('missing_start_date') ||
        reviewReasons.includes('event_expired') ||
        confidence < 55;
      const status = isExpired
        ? 'expired'
        : routing === 'public_candidate'
        ? 'submitted_public_candidate'
        : needsUserReview
          ? 'needs_user_review'
          : 'saved';

      return {
        ...primary,
        title,
        description,
        startDate,
        endDate: startDate,
        startTime,
        endTime,
        locationName,
        address,
        routing,
        status,
        confidence,
        needsUserReview,
        reviewReasons,
        isExpired,
        sequenceIndex: index,
        extractedFromShare: true,
        sourceContentSignature: sourceContentSignature([
          primary.sourceUrl,
          title,
          description,
          startDate,
          startTime,
          locationName,
          address,
          String(index),
          'calendar_image',
        ]),
      };
    })
    .filter((event): event is ParsedSharedEvent => Boolean(event));
}

async function buildExtractedParsedEventsFromCalendarImage(primary: ParsedSharedEvent): Promise<ParsedSharedEvent[]> {
  if (!shouldAttemptCalendarImageExtraction(primary)) return [];

  try {
    const combinedText = [
      primary.title,
      primary.description,
      primary.visibilityEvidence.title,
      primary.visibilityEvidence.description,
    ].filter(Boolean).join('\n');
    const timestamp = primary.visibilityEvidence.sourcePublishedAt ||
      DateTime.now().setZone(primary.timezone).toISO() ||
      new Date().toISOString();
    const calendarImageUrls = primary.mediaUrls.slice(0, MAX_CALENDAR_IMAGE_EXTRACTION_URLS);
    const items = await extractContentByType(
      'CALENDAR',
      combinedText,
      calendarImageUrls,
      primary.locationName || primary.title || 'Facebook share',
      timestamp,
      {
        gptUsageHandler: async (usage) => {
          logger.info('Shared event calendar image GPT usage', {
            tag: 'shared_event_calendar_image',
            parserVersion: SHARED_EVENT_PARSER_VERSION,
            sourcePlatform: primary.sourcePlatform,
            sourceVisibility: primary.sourceVisibility,
            imageCount: calendarImageUrls.length,
            ...usage,
          });
        },
      }
    );

    logger.info('Shared event calendar image extraction complete', {
      tag: 'shared_event_calendar_image',
      parserVersion: SHARED_EVENT_PARSER_VERSION,
      sourcePlatform: primary.sourcePlatform,
      sourceVisibility: primary.sourceVisibility,
      imageCount: calendarImageUrls.length,
      itemCount: items.length,
    });

    return buildExtractedParsedEventsFromCalendarItems(primary, items);
  } catch {
    return [];
  }
}

export function buildCalendarImageParsedEventsForRegression(
  primary: ParsedSharedEvent,
  items: ExtractedItem[]
): ParsedSharedEvent[] {
  return buildExtractedParsedEventsFromCalendarItems(primary, items);
}

export async function parseSharedEventPayload(
  payload: SharedEventSubmitPayload,
  visibility?: {
    sourceVisibility: SharedEventSourceVisibility;
    visibilityEvidence: SharedEventVisibilityEvidence;
  }
): Promise<ParsedSharedEvent> {
  const sharedText = cleanLongText(payload.sharedText ?? payload.text);
  const directUrl = normalizeSharedEventUrl(payload.sourceUrl ?? payload.url);
  const timezone = cleanString(payload.timezone, 80) || DEFAULT_TIMEZONE;
  const sourceVisibility = visibility?.sourceVisibility ?? 'unknown';
  const visibilityEvidence = visibility?.visibilityEvidence ?? {
    method: 'not_checked',
    checkedAt: new Date().toISOString(),
    reason: 'Source visibility was not checked.',
  };
  const probedPublicUrl = sourceVisibility === 'public_verified'
    ? normalizeSharedEventUrl(visibilityEvidence.finalUrl)
    : undefined;
  const sourceUrl = probedPublicUrl || directUrl || normalizeSharedEventUrl(extractFirstUrl(sharedText));
  const sourcePlatform = detectSharedEventPlatform(sourceUrl, payload.sourcePlatform || payload.sourceApp);
  const evidenceTitle = cleanString(visibilityEvidence.title, 300);
  const evidenceDescription = cleanLongText(visibilityEvidence.description);
  const combinedText = [
    cleanString(payload.title, 300),
    cleanLongText(payload.description),
    sharedText,
    evidenceTitle,
    evidenceDescription,
  ].filter(Boolean).join('\n');

  const title = extractTitle(payload, combinedText);
  const description = extractDescription(payload, combinedText, title);
  const startTime = normalizeTime(payload.startTime) ||
    normalizeTime(visibilityEvidence.startTime) ||
    normalizeTime(combinedText);
  const startDate = normalizeIsoDate(payload.startDate, timezone) ||
    normalizeIsoDate(visibilityEvidence.startDate, timezone) ||
    extractDateFromText(combinedText, timezone) ||
    resolveRelativeWeekdayDateFromText(
      combinedText,
      timezone,
      startTime,
      visibilityEvidence.sourcePublishedAt
    );
  const endDate = normalizeIsoDate(payload.endDate, timezone) ||
    normalizeIsoDate(visibilityEvidence.endDate, timezone) ||
    startDate;
  const endTime = normalizeTime(payload.endTime) || normalizeTime(visibilityEvidence.endTime);
  const extractedLocation = extractLocation(payload, combinedText);
  const locationName = extractedLocation.locationName ||
    cleanString(visibilityEvidence.locationName, 180) ||
    undefined;
  const address = extractedLocation.address ||
    cleanString(visibilityEvidence.address, 260) ||
    undefined;
  const mediaUrls = normalizeMediaUrls([
    ...(Array.isArray(payload.mediaUrls) ? payload.mediaUrls : []),
    visibilityEvidence.imageUrl,
  ]);
  const reviewReasons: string[] = [];
  const isExpired = eventLooksExpired(startDate, startTime, timezone);

  if (!title) reviewReasons.push('missing_title');
  if (!startDate) reviewReasons.push('missing_start_date');
  if (!locationName && !address) reviewReasons.push('missing_location');
  if (isExpired) reviewReasons.push('event_expired');

  const confidence = confidenceScore({
    title,
    startDate,
    startTime,
    locationName,
    address,
    sourceUrl,
  });
  const needsUserReview = reviewReasons.includes('missing_title') ||
    reviewReasons.includes('missing_start_date') ||
    reviewReasons.includes('event_expired') ||
    confidence < 55;
  const routing = isExpired
    ? 'not_public_candidate'
    : sourceVisibility === 'public_verified'
      ? 'public_candidate'
      : 'private_only';
  const status = isExpired
    ? 'expired'
    : routing === 'public_candidate'
    ? 'submitted_public_candidate'
    : needsUserReview
      ? 'needs_user_review'
      : 'saved';

  return {
    sourceUrl,
    sourcePlatform,
    sourceVisibility,
    visibilityEvidence,
    routing,
    status,
    title,
    description,
    startDate,
    endDate,
    startTime,
    endTime,
    locationName,
    address,
    mediaUrls,
    timezone,
    confidence,
    needsUserReview,
    reviewReasons,
    isExpired,
    sourceContentSignature: sourceContentSignature([
      sourceUrl,
      title,
      description,
      startDate,
      startTime,
      endDate,
      endTime,
      locationName,
      address,
    ]),
  };
}

export async function parseSharedEventPayloads(
  payload: SharedEventSubmitPayload,
  visibility?: {
    sourceVisibility: SharedEventSourceVisibility;
    visibilityEvidence: SharedEventVisibilityEvidence;
  }
): Promise<ParsedSharedEvent[]> {
  const primary = await parseSharedEventPayload(payload, visibility);
  const extractedEvents = buildExtractedParsedEventsFromShareText(primary);
  if (extractedEvents.length > 0) return extractedEvents;

  const calendarImageEvents = await buildExtractedParsedEventsFromCalendarImage(primary);
  return calendarImageEvents.length > 0 ? calendarImageEvents : [primary];
}
