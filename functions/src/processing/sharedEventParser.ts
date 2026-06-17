import { createHash } from 'crypto';
import { DateTime } from 'luxon';
import {
  ParsedSharedEvent,
  SharedEventSourcePlatform,
  SharedEventSourceVisibility,
  SharedEventSubmitPayload,
  SharedEventVisibilityEvidence,
} from '../types/sharedEvent.js';

export const SHARED_EVENT_PARSER_VERSION = 'shared-event-parser-v1';

const DEFAULT_TIMEZONE = 'America/Halifax';
const MAX_TEXT_LENGTH = 12000;
const MAX_SHORT_FIELD_LENGTH = 500;
const MAX_MEDIA_URLS = 8;
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
  const raw = cleanString(value, 100).toLowerCase();
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

function extractMetaContent(html: string, property: string): string {
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
      return cleanString(match[1].replace(/&amp;/g, '&').replace(/&#039;/g, "'"), 300);
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

function hasFacebookLoginPrompt(html: string): boolean {
  const lowered = html.toLowerCase();
  return lowered.includes('you must log in') ||
    lowered.includes('log in to facebook');
}

function looksLikeUnavailableFacebookResponse(html: string): boolean {
  const lowered = html.toLowerCase();
  return lowered.includes("this content isn't") ||
    lowered.includes('this content is not') ||
    lowered.includes('content not found') ||
    lowered.includes('checkpoint') ||
    lowered.includes('temporarily unavailable') ||
    lowered.includes('not available right now');
}

async function probePublicUrl(url: string): Promise<SharedEventVisibilityEvidence & { visibility: SharedEventSourceVisibility }> {
  const checkedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'user-agent': 'GathR shared-event public-access probe/1.0',
      },
    });
    const finalUrl = response.url || url;
    const html = await response.text();
    const clipped = html.slice(0, 250000);
    const ogTitle = extractMetaContent(clipped, 'og:title');
    const ogDescription = extractMetaContent(clipped, 'og:description') ||
      extractMetaContent(clipped, 'description');
    const imageCandidate = extractMetaContent(clipped, 'og:image') ||
      extractMetaContent(clipped, 'twitter:image');
    const ogImageUrl = resolveMaybeRelativeUrl(imageCandidate, finalUrl || url);
    const ogType = extractMetaContent(clipped, 'og:type');
    const hasLogin = hasFacebookLoginPrompt(clipped);
    const isUnavailable = looksLikeUnavailableFacebookResponse(clipped);
    const hasUsefulMetadata =
      Boolean(ogTitle && ogTitle.toLowerCase() !== 'facebook') &&
      (Boolean(ogDescription) || Boolean(ogType));

    if (response.ok && hasUsefulMetadata) {
      return {
        visibility: 'public_verified',
        method: 'public_url_probe',
        checkedAt,
        url,
        finalUrl,
        httpStatus: response.status,
        reason: 'Public URL returned usable metadata without user credentials.',
        titleFound: Boolean(ogTitle),
        descriptionFound: Boolean(ogDescription),
        title: ogTitle || undefined,
        description: ogDescription || undefined,
        imageUrl: ogImageUrl,
        ogType: ogType || undefined,
      };
    }

    return {
      visibility: response.status === 401 || response.status === 403 || hasLogin || isUnavailable
        ? 'restricted_unverified'
        : 'unknown',
      method: 'public_url_probe',
      checkedAt,
      url,
      finalUrl,
      httpStatus: response.status,
      reason: isUnavailable
        ? 'Public probe reached a checkpoint or unavailable-content response.'
        : hasLogin
          ? 'Public probe reached a login response without enough event metadata.'
        : 'Public probe did not return enough usable event metadata.',
      titleFound: Boolean(ogTitle),
      descriptionFound: Boolean(ogDescription),
      title: ogTitle || undefined,
      description: ogDescription || undefined,
      imageUrl: ogImageUrl,
      ogType: ogType || undefined,
    };
  } catch (error) {
    return {
      visibility: 'restricted_unverified',
      method: 'public_url_probe',
      checkedAt,
      url,
      reason: error instanceof Error ? error.message : 'Public probe failed.',
    };
  } finally {
    clearTimeout(timeout);
  }
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
  const startDate = normalizeIsoDate(payload.startDate, timezone) ||
    extractDateFromText(combinedText, timezone);
  const endDate = normalizeIsoDate(payload.endDate, timezone) || startDate;
  const startTime = normalizeTime(payload.startTime) || normalizeTime(combinedText);
  const endTime = normalizeTime(payload.endTime);
  const { locationName, address } = extractLocation(payload, combinedText);
  const mediaUrls = normalizeMediaUrls([
    ...(Array.isArray(payload.mediaUrls) ? payload.mediaUrls : []),
    visibilityEvidence.imageUrl,
  ]);
  const reviewReasons: string[] = [];

  if (!title) reviewReasons.push('missing_title');
  if (!startDate) reviewReasons.push('missing_start_date');
  if (!locationName && !address) reviewReasons.push('missing_location');

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
    confidence < 55;
  const routing = sourceVisibility === 'public_verified' ? 'public_candidate' : 'private_only';
  const status = routing === 'public_candidate'
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
