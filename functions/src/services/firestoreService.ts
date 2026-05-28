/**
 * Firestore Service
 * CRUD operations for venues, events, and processing state
 */

import * as admin from 'firebase-admin';
import { createHash, randomUUID } from 'crypto';
import {
  EventData,
  VenueData,
  OperatingHours,
  BatchState,
  CheckpointData,
  ProcessingStats,
  ProcessingLock,
  MatchInfo,
  ParseSnapshot,
  CityLevelEventReviewRecord,
  CityLevelEventReviewSample,
  FinalizeCityLevelEventReviewInput,
  FinalizeCityLevelEventReviewResult,
  QueueCityLevelEventReviewInput,
  QueueCityLevelEventReviewResult,
  QueueUnrecognizedVenueInput,
  QueueUnrecognizedVenueResult,
  RawRowData,
  UnrecognizedVenueRecord,
  UnrecognizedVenueSampleEvent,
  UnrecognizedVenueStatus,
} from '../types/index.js';
import { logger } from '../utils/logger.js';
import {
  normalizeVenueName,
  extractFacebookSlug,
  calculateEnhancedSimilarity,
  isDuplicateEntry,
  normalizeUrl,
} from '../utils/similarity.js';
import { getVenueAliasCandidates } from './venueAliases.js';
import { pickCompatibleExactUniqueIdMatch } from './exactUniqueIdCompatibility.js';
import { pickRecurringFamilyFallbackMatch } from './recurringFamilyFallback.js';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

// Collection names
const COLLECTIONS = {
  VENUES: 'venues',
  EVENTS: 'events',
  BATCH_STATE: 'batch_states',
  CHECKPOINTS: 'checkpoints',
  PROCESSED_DATASETS: 'processed_datasets',
  PARSE_SNAPSHOTS: 'parse_snapshots',
  PROCESSING_LOCKS: 'processing_locks',
  UNRECOGNIZED_VENUES: 'unrecognized_venues',
  CITY_LEVEL_EVENT_REVIEWS: 'city_level_event_reviews',
  EVENT_UPDATE_AUDITS: 'event_update_audits',
} as const;

const MAX_SNAPSHOT_TEXT_LENGTH = 20000;
const EVENT_UPDATE_AUDIT_TEXT_LIMIT = 1600;
const EVENT_UPDATE_AUDIT_ARRAY_LIMIT = 12;
const EVENT_UPDATE_AUDIT_BASE_FIELDS = [
  'uniqueId',
  'eventName',
  'name',
  'establishment',
  'venueId',
  'startDate',
  'startTime',
  'endDate',
  'endTime',
  'description',
  'category',
  'eventType',
  'facebookUrl',
  'cleanedFacebookUrl',
  'ticketsBuyUrl',
  'ticketLink',
  'ticketPrice',
  'price',
  'mediaUrls',
  'imageUrl',
  'image',
  'relevantImageUrl',
  'usersResponded',
  'usersGoing',
  'usersInterested',
  'facebookUsersResponded',
  'likes',
  'shares',
  'comments',
  'topReactionsCount',
  'locationScope',
  'locationLabel',
  'locationPrecision',
  'mapMode',
  'address',
  'city',
  'streetAddress',
  'latitude',
  'longitude',
  'sourceContentSignature',
] as const;
const DEFAULT_LOCK_TTL_MS = 30 * 60 * 1000;
const CITY_SUFFIX_REGEX =
  /^(.*?)(?:\s*[|,-]\s*)([A-Za-z .'-]+?)\s*,?\s*(PEI?|NS|NB|NL|ON|QC|AB|BC|SK|MB)\s*$/i;
const UNKNOWN_VENUE_SAMPLE_LIMIT = 5;
const UNKNOWN_VENUE_DESCRIPTION_PREVIEW_LEN = 240;
const CITY_LEVEL_EVENT_REVIEW_SAMPLE_LIMIT = 10;
const CITY_LEVEL_EVENT_REVIEW_DESCRIPTION_PREVIEW_LEN = 360;
const NON_VENUE_LABEL_EXACT_BLOCKLIST = new Set(
  [
    'Aquafit',
    'Aqua Fit',
    'Lane Swim',
    'Leisure Pool',
    'All Pools',
    'Toddler Pool',
    'Gen XX',
  ]
    .map((value) => normalizeVenueName(value))
    .filter(Boolean)
);
const NON_VENUE_POOL_ACTIVITY_PREFIXES = [
  /^lane\s+swim\b/i,
  /^public\s+swim\b/i,
  /^family\s+swim\b/i,
  /^adult\s+swim\b/i,
  /^open\s+swim\b/i,
  /^leisure\s+swim\b/i,
  /^lap\s+swim\b/i,
  /^aqua\s*fit\b/i,
  /^aquafit\b/i,
];
const NON_VENUE_POOL_ACTIVITY_PHRASES = new Set([
  'lane swim',
  'leisure pool',
  'all pools',
  'toddler pool',
  'public swim',
  'family swim',
  'adult swim',
  'open swim',
  'lap swim',
]);
const NON_VENUE_VENUE_HINT_WORDS = new Set([
  'hall',
  'church',
  'centre',
  'center',
  'club',
  'arena',
  'stadium',
  'brewery',
  'brewpub',
  'brew',
  'cafe',
  'coffee',
  'restaurant',
  'bar',
  'pub',
  'kitchen',
  'casino',
  'hotel',
  'inn',
  'resort',
  'theatre',
  'theater',
  'school',
  'legion',
  'library',
  'museum',
  'park',
  'campus',
  'market',
  'mall',
  'show',
]);
const PEI_CITY_HINTS: Array<{ city: string; province: string; patterns: RegExp[] }> = [
  { city: 'Charlottetown', province: 'PE', patterns: [/\bcharlottetown\b/i, /\bch[\s-]?town\b/i] },
  { city: 'Summerside', province: 'PE', patterns: [/\bsummerside\b/i] },
  { city: 'Stratford', province: 'PE', patterns: [/\bstratford\b/i] },
  { city: 'Cornwall', province: 'PE', patterns: [/\bcornwall\b/i] },
  { city: 'Montague', province: 'PE', patterns: [/\bmontague\b/i] },
  { city: 'Souris', province: 'PE', patterns: [/\bsouris\b/i] },
];
const MEDIA_FALLBACK_TOKEN_BLOCKLIST = new Set([
  'about',
  'after',
  'again',
  'april',
  'bring',
  'brings',
  'closed',
  'crew',
  'dates',
  'deliciously',
  'different',
  'dinner',
  'every',
  'evening',
  'evenings',
  'event',
  'events',
  'experience',
  'feast',
  'food',
  'friday',
  'fridays',
  'gather',
  'great',
  'join',
  'just',
  'march',
  'mexican',
  'night',
  'nights',
  'park',
  'remember',
  'reservations',
  'reserve',
  'saturday',
  'saturdays',
  'special',
  'table',
  'theme',
  'themes',
  'this',
  'top',
  'unforgettable',
  'vibes',
  'weekend',
  'with',
  'world',
]);

type UnknownVenuePipelineConfig = {
  enabled: boolean;
  testMode: boolean;
  allowlist: Set<string>;
};

function parseBooleanEnvValue(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function splitUnknownVenueTestAllowlist(rawInput: string): string[] {
  const raw = String(rawInput || '');
  if (!raw.trim()) return [];

  // Support newline and pipe as explicit separators.
  const primarySegments = raw.split(/[\n|]+/);
  const tokens: string[] = [];

  for (const segment of primarySegments) {
    const value = String(segment || '');
    if (!value.trim()) continue;

    let current = '';
    let parenDepth = 0;
    let quoteChar: '"' | "'" | '' = '';

    for (let i = 0; i < value.length; i += 1) {
      const ch = value[i] || '';

      if (quoteChar) {
        current += ch;
        if (ch === quoteChar && value[i - 1] !== '\\') {
          quoteChar = '';
        }
        continue;
      }

      if (ch === '"' || ch === '\'') {
        quoteChar = ch as '"' | "'";
        current += ch;
        continue;
      }

      if (ch === '(') {
        parenDepth += 1;
        current += ch;
        continue;
      }

      if (ch === ')') {
        parenDepth = Math.max(0, parenDepth - 1);
        current += ch;
        continue;
      }

      if (ch === ',' && parenDepth === 0) {
        const piece = current.trim();
        if (piece) tokens.push(piece);
        current = '';
        continue;
      }

      current += ch;
    }

    const tail = current.trim();
    if (tail) tokens.push(tail);
  }

  return tokens.map((token) => {
    const trimmed = token.trim();
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith('\'') && trimmed.endsWith('\''))
    ) {
      return trimmed.slice(1, -1).trim();
    }
    return trimmed;
  }).filter(Boolean);
}

function getUnknownVenuePipelineConfig(): UnknownVenuePipelineConfig {
  const enabled = parseBooleanEnvValue(process.env.UNKNOWN_VENUE_PIPELINE_ENABLED, false);
  const testMode = parseBooleanEnvValue(process.env.UNKNOWN_VENUE_TEST_MODE, false);
  const allowlistRaw = String(process.env.UNKNOWN_VENUE_TEST_ALLOWLIST || '');
  const allowlist = new Set(
    splitUnknownVenueTestAllowlist(allowlistRaw)
      .map((value) => normalizeVenueName(String(value || '')))
      .filter(Boolean)
  );

  return { enabled, testMode, allowlist };
}

function shouldQueueUnknownVenue(
  venueName: string
): { allowed: boolean; reason?: string; testMode: boolean } {
  const cfg = getUnknownVenuePipelineConfig();
  if (!cfg.enabled) {
    return { allowed: false, reason: 'unknown_venue_pipeline_disabled', testMode: cfg.testMode };
  }

  if (!cfg.testMode) {
    return { allowed: true, testMode: false };
  }

  const normalized = normalizeVenueName(venueName || '');
  if (!normalized) {
    return { allowed: false, reason: 'empty_name', testMode: true };
  }

  if (cfg.allowlist.size === 0) {
    return { allowed: false, reason: 'test_mode_allowlist_empty', testMode: true };
  }

  const candidates = new Set<string>([normalized]);
  const suffix = splitCitySuffix(venueName);
  if (suffix?.baseName) {
    candidates.add(normalizeVenueName(suffix.baseName));
  }
  for (const alias of getVenueAliasCandidates(venueName)) {
    candidates.add(normalizeVenueName(alias));
    const aliasSuffix = splitCitySuffix(alias);
    if (aliasSuffix?.baseName) {
      candidates.add(normalizeVenueName(aliasSuffix.baseName));
    }
  }

  const isAllowed = Array.from(candidates).some((candidate) => cfg.allowlist.has(candidate));
  if (!isAllowed) {
    return { allowed: false, reason: 'test_mode_not_allowlisted', testMode: true };
  }

  return { allowed: true, testMode: true };
}

function classifySuspectedNonVenueLabel(
  input: QueueUnrecognizedVenueInput
): { isNonVenue: boolean; rule?: string } {
  const rawVenueName = String(input.venueName || '').trim();
  const normalized = normalizeVenueName(rawVenueName);
  if (!normalized) return { isNonVenue: false };

  if (NON_VENUE_LABEL_EXACT_BLOCKLIST.has(normalized)) {
    return { isNonVenue: true, rule: 'exact_activity_label_blocklist' };
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  if (!words.length) return { isNonVenue: false };

  const hasVenueHint = words.some((word) => NON_VENUE_VENUE_HINT_WORDS.has(word));
  if (hasVenueHint) {
    return { isNonVenue: false };
  }

  const normalizedCollapsed = words.join(' ');
  const activityLikePoolLabel = (
    NON_VENUE_POOL_ACTIVITY_PHRASES.has(normalizedCollapsed) ||
    NON_VENUE_POOL_ACTIVITY_PREFIXES.some((pattern) => pattern.test(rawVenueName)) ||
    (
      words.length <= 3 &&
      (
        words.includes('swim') ||
        words.includes('aquafit') ||
        (words.includes('aqua') && words.includes('fit')) ||
        (words.includes('pool') && (words.includes('toddler') || words.includes('leisure') || words.includes('all')))
      )
    )
  );

  if (!activityLikePoolLabel) {
    return { isNonVenue: false };
  }

  const contextCorpus = [
    String(input.eventName || '').trim(),
    String(input.description || '').trim(),
    String(input.aggregatorName || '').trim(),
  ].filter(Boolean).join(' ');
  const hasPoolContext = /\b(pool|swim|aquatic|aquatics|aquafit)\b/i.test(contextCorpus);

  if (hasPoolContext || /\b(swim|pool|aquafit|aqua\s*fit)\b/i.test(rawVenueName)) {
    return { isNonVenue: true, rule: 'pool_program_activity_label' };
  }

  return { isNonVenue: false };
}

function normalizeProvinceToken(value?: string): string | undefined {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return undefined;
  if (raw === 'PEI') return 'PE';
  return raw;
}

function inferPEICityProvinceHintsFromCorpus(corpusInput?: string): { cityHint?: string; provinceHint?: string } {
  const corpus = String(corpusInput || '').trim();
  if (!corpus) return {};

  for (const entry of PEI_CITY_HINTS) {
    if (entry.patterns.some((pattern) => pattern.test(corpus))) {
      return {
        cityHint: entry.city,
        provinceHint: entry.province,
      };
    }
  }

  if (
    /\bpei\b/i.test(corpus) ||
    /prince\s+edward\s+island/i.test(corpus) ||
    /\b,\s*pe\b/i.test(corpus)
  ) {
    return { provinceHint: 'PE' };
  }

  return {};
}

function inferHintsFromAggregatorVenue(venue: VenueData | null): { cityHint?: string; provinceHint?: string } {
  if (!venue) return {};

  const explicitCity = String(venue.city || '').trim() || undefined;
  const explicitProvince = normalizeProvinceToken(String(venue.province || '').trim()) || undefined;
  if (explicitCity || explicitProvince) {
    return {
      cityHint: explicitCity,
      provinceHint: explicitProvince,
    };
  }

  const venueAny = venue as unknown as Record<string, unknown>;
  const corpus = [
    String(venue.name || '').trim(),
    String(venueAny.pagename || '').trim(),
    String(venue.address || '').trim(),
  ].filter(Boolean).join(' ');

  return inferPEICityProvinceHintsFromCorpus(corpus);
}

async function inferUnknownVenueCityProvinceHints(params: {
  venueName: string;
  aggregatorName?: string;
  description?: string;
  aggregatorFacebookUrl?: string;
}): Promise<{ cityHint?: string; provinceHint?: string }> {
  const venueName = String(params.venueName || '').trim();
  const fromVenue = splitCitySuffix(venueName);
  if (fromVenue?.city || fromVenue?.region) {
    return {
      cityHint: fromVenue.city || undefined,
      provinceHint: normalizeProvinceToken(fromVenue.region),
    };
  }

  const corpus = [
    venueName,
    String(params.aggregatorName || '').trim(),
    String(params.description || '').trim(),
  ].filter(Boolean).join(' ');
  const fromText = inferPEICityProvinceHintsFromCorpus(corpus);
  if (fromText.cityHint || fromText.provinceHint) {
    return fromText;
  }

  const aggregatorFacebookUrl = String(params.aggregatorFacebookUrl || '').trim();
  if (aggregatorFacebookUrl) {
    try {
      const aggregatorVenue = await findVenueByFacebookUrl(aggregatorFacebookUrl);
      const fromAggregatorVenue = inferHintsFromAggregatorVenue(aggregatorVenue);
      if (fromAggregatorVenue.cityHint || fromAggregatorVenue.provinceHint) {
        return fromAggregatorVenue;
      }
    } catch (error) {
      logger.debug('Failed aggregator venue lookup for unknown venue hint inference', {
        venueName,
        aggregatorFacebookUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {};
}

function trimUnknownVenuePreview(value?: string, maxLength: number = UNKNOWN_VENUE_DESCRIPTION_PREVIEW_LEN): string | undefined {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function dedupeStringList(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = String(value || '').trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function normalizeStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? dedupeStringList(value.map((entry) => String(entry || '').trim()).filter(Boolean))
    : [];
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = String(key || '').trim();
    const normalizedEntry = String(entry || '').trim();
    if (normalizedKey && normalizedEntry) {
      result[normalizedKey] = normalizedEntry;
    }
  }
  return result;
}

function buildUnrecognizedVenueDocId(
  establishmentNormalized: string,
  cityHint?: string,
  provinceHint?: string
): string {
  const raw = [
    establishmentNormalized,
    normalizeVenueName(cityHint || ''),
    normalizeVenueName(provinceHint || ''),
  ].join('|');
  const hash = createHash('sha1').update(raw).digest('hex').slice(0, 24);
  return `uv_${hash}`;
}

export function pickUnrecognizedVenueDocIdForSource(
  records: UnrecognizedVenueRecord[],
  establishmentNormalized: string
): string {
  const normalized = normalizeVenueName(establishmentNormalized);
  if (!normalized) return '';

  const matchingRecords = records
    .filter((record) => normalizeVenueName(record.establishmentNormalized || record.establishment || '') === normalized)
    .filter((record) => String(record.id || '').trim());

  const activeRecord = matchingRecords.find((record) =>
    !isTerminalUnrecognizedStatus(String(record.status || 'pending'))
  );
  return String(activeRecord?.id || matchingRecords[0]?.id || '').trim();
}

function buildUnrecognizedVenueSample(
  input: QueueUnrecognizedVenueInput,
  establishmentNormalized: string
): UnrecognizedVenueSampleEvent {
  return {
    source: input.source,
    parserMode: input.parserMode,
    rowIndex: input.rowIndex,
    fileId: input.fileId,
    fileName: input.fileName,
    aggregatorName: input.aggregatorName,
    aggregatorFacebookUrl: input.aggregatorFacebookUrl,
    aggregatorAddress: input.aggregatorAddress,
    topLevelUrl: input.topLevelUrl,
    sourceUniqueId: input.sourceUniqueId,
    sourceContentSignature: input.sourceContentSignature,
    eventName: input.eventName,
    eventDate: input.eventDate,
    eventTime: input.eventTime,
    descriptionPreview: trimUnknownVenuePreview(input.description),
    observedVenueName: input.venueName,
    observedVenueNormalized: establishmentNormalized,
    createdAt: new Date(),
  };
}

function mergeUnrecognizedSamples(
  existingRaw: unknown,
  nextSample: UnrecognizedVenueSampleEvent
): UnrecognizedVenueSampleEvent[] {
  const existing = Array.isArray(existingRaw)
    ? (existingRaw.filter((value) => value && typeof value === 'object') as UnrecognizedVenueSampleEvent[])
    : [];

  const fingerprint = [
    nextSample.observedVenueNormalized || '',
    nextSample.aggregatorName || '',
    nextSample.sourceUniqueId || '',
    nextSample.topLevelUrl || '',
    nextSample.eventName || '',
    nextSample.eventDate || '',
    nextSample.source || '',
  ].join('|').toLowerCase();

  const result = existing.filter((sample) => {
    const sampleFingerprint = [
      String(sample.observedVenueNormalized || ''),
      String(sample.aggregatorName || ''),
      String(sample.sourceUniqueId || ''),
      String(sample.topLevelUrl || ''),
      String(sample.eventName || ''),
      String(sample.eventDate || ''),
      String(sample.source || ''),
    ].join('|').toLowerCase();
    return sampleFingerprint !== fingerprint;
  });

  result.unshift(nextSample);
  return result.slice(0, UNKNOWN_VENUE_SAMPLE_LIMIT);
}

function isTerminalUnrecognizedStatus(status: string): status is UnrecognizedVenueStatus {
  return ['resolved_existing', 'created_new', 'ignored'].includes(status);
}

function trimCityLevelEventPreview(value?: string): string | undefined {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  if (normalized.length <= CITY_LEVEL_EVENT_REVIEW_DESCRIPTION_PREVIEW_LEN) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, CITY_LEVEL_EVENT_REVIEW_DESCRIPTION_PREVIEW_LEN - 3)).trimEnd()}...`;
}

function compactRecord<T extends Record<string, unknown>>(value: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) {
      result[key] = entry;
    }
  }
  return result as T;
}

function buildCityLevelEventReviewDocId(input: QueueCityLevelEventReviewInput): string {
  const fingerprint = [
    input.uniqueId,
    input.facebookUrl,
    input.eventName,
    input.eventDate,
    input.locationLabel,
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .join('|');
  const stableKey = fingerprint || [
    input.fileId,
    input.rowIndex,
    input.locationLabel,
  ].join('|');
  return `cityevt_${createHash('sha1').update(stableKey).digest('hex').slice(0, 24)}`;
}

function buildCityLevelEventReviewSample(
  input: QueueCityLevelEventReviewInput
): CityLevelEventReviewSample {
  const mediaUrls = dedupeUrls([
    ...tokenizeMediaUrls(input.mediaUrls),
    ...tokenizeMediaUrls(input.imageUrl),
  ]);
  const externalLinks = dedupeUrls(tokenizeMediaUrls(input.externalLinks));

  return compactRecord({
    fileId: input.fileId,
    fileName: input.fileName,
    rowIndex: input.rowIndex,
    parserMode: input.parserMode,
    eventName: input.eventName,
    eventDate: input.eventDate,
    eventTime: input.eventTime,
    endDate: input.endDate,
    endTime: input.endTime,
    observedLocationName: input.locationLabel,
    organizerName: input.organizerName,
    facebookUrl: input.facebookUrl,
    topLevelUrl: input.topLevelUrl,
    descriptionPreview: trimCityLevelEventPreview(input.description),
    imageUrl: asOptionalTrimmedString(input.imageUrl) || mediaUrls[0],
    mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
    usersResponded: asOptionalTrimmedString(input.usersResponded),
    usersGoing: asOptionalTrimmedString(input.usersGoing),
    usersInterested: asOptionalTrimmedString(input.usersInterested),
    facebookUsersResponded: asOptionalTrimmedString(input.facebookUsersResponded),
    likes: input.likes,
    shares: input.shares,
    comments: input.comments,
    topReactionsCount: input.topReactionsCount,
    ticketsBuyUrl: asOptionalTrimmedString(input.ticketsBuyUrl),
    externalLinks: externalLinks.length > 0 ? externalLinks : undefined,
    createdAt: new Date(),
  });
}

function mergeCityLevelEventReviewSamples(
  existingSamples: unknown,
  nextSample: CityLevelEventReviewSample
): CityLevelEventReviewSample[] {
  const existing = Array.isArray(existingSamples)
    ? (existingSamples.filter((value) => value && typeof value === 'object') as CityLevelEventReviewSample[])
    : [];
  const fingerprint = [
    nextSample.fileId,
    nextSample.rowIndex,
    nextSample.eventName,
    nextSample.eventDate,
    nextSample.eventTime,
    nextSample.observedLocationName,
  ].join('|').toLowerCase();

  const result = existing.filter((sample) => {
    const sampleFingerprint = [
      sample.fileId,
      sample.rowIndex,
      sample.eventName,
      sample.eventDate,
      sample.eventTime,
      sample.observedLocationName,
    ].join('|').toLowerCase();
    return sampleFingerprint !== fingerprint;
  });

  result.unshift(nextSample);
  return result.slice(0, CITY_LEVEL_EVENT_REVIEW_SAMPLE_LIMIT);
}

function shouldRefreshCityLevelReviewTiming(
  existing: Partial<CityLevelEventReviewRecord> & Record<string, unknown>,
  input: QueueCityLevelEventReviewInput
): boolean {
  if ((input.sourceScraperType || existing.sourceScraperType) !== 'events') {
    return false;
  }

  const inputEndDate = asOptionalTrimmedString(input.endDate);
  const inputEndTime = asOptionalTrimmedString(input.endTime);
  if (!inputEndDate && !inputEndTime) {
    return false;
  }

  const existingFacebookUrl = asOptionalTrimmedString(existing.facebookUrl)?.toLowerCase();
  const inputFacebookUrl = asOptionalTrimmedString(input.facebookUrl)?.toLowerCase();
  const existingEventName = asOptionalTrimmedString(existing.eventName)?.toLowerCase();
  const inputEventName = asOptionalTrimmedString(input.eventName)?.toLowerCase();
  const sameFacebookUrl = Boolean(existingFacebookUrl && inputFacebookUrl && existingFacebookUrl === inputFacebookUrl);
  const sameEventName = Boolean(existingEventName && inputEventName && existingEventName === inputEventName);
  if (!sameFacebookUrl && !sameEventName) {
    return false;
  }

  const existingEventDate = asOptionalTrimmedString(existing.eventDate);
  const inputEventDate = asOptionalTrimmedString(input.eventDate);
  if (existingEventDate && inputEventDate && existingEventDate !== inputEventDate) {
    return false;
  }

  const existingEventTime = asOptionalTrimmedString(existing.eventTime);
  const inputEventTime = asOptionalTrimmedString(input.eventTime);
  if (existingEventTime && inputEventTime && existingEventTime !== inputEventTime) {
    return false;
  }

  const existingEndDate = asOptionalTrimmedString(existing.endDate);
  const existingEndTime = asOptionalTrimmedString(existing.endTime);
  return Boolean(
    (inputEndDate && inputEndDate !== existingEndDate) ||
      (inputEndTime && inputEndTime !== existingEndTime)
  );
}

function normalizeCityLevelReviewStatus(status: string): CityLevelEventReviewRecord['status'] {
  if (['approved', 'rejected', 'published', 'ignored'].includes(status)) {
    return status as CityLevelEventReviewRecord['status'];
  }
  return 'needs_review';
}

function normalizeLocationReviewStatus(
  status: CityLevelEventReviewRecord['status']
): CityLevelEventReviewRecord['locationReviewStatus'] {
  if (status === 'approved' || status === 'published') return 'approved';
  if (status === 'rejected' || status === 'ignored') return 'rejected';
  return 'needs_review';
}

function truncateText(value?: string): { text?: string; length?: number } {
  if (!value) return { text: undefined, length: 0 };
  const length = value.length;
  if (length <= MAX_SNAPSHOT_TEXT_LENGTH) {
    return { text: value, length };
  }
  return { text: value.slice(0, MAX_SNAPSHOT_TEXT_LENGTH), length };
}

function getProcessingLockTtlMs(): number {
  const raw = Number(process.env.PROCESSING_LOCK_TTL_MS);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return DEFAULT_LOCK_TTL_MS;
}

const IMAGE_BACKFILL = {
  DEFAULT_SCAN_LIMIT: 200,
  MAX_SCAN_LIMIT: 1000,
  DEFAULT_UPDATE_LIMIT: 60,
  MAX_UPDATE_LIMIT: 300,
  DOWNLOAD_TIMEOUT_MS: 15000,
  UPLOAD_TIMEOUT_MS: 30000,
  MAX_IMAGE_BYTES: 15 * 1024 * 1024,
};

const IMAGE_CLEANUP = {
  QUERY_CHUNK_SIZE: 30,
  DELETE_TIMEOUT_MS: 15000,
  DELETE_RETRIES: 3,
};

const EVENT_IMAGE_REFERENCE_FIELDS = [
  'image',
  'imageUrl',
  'relevantImageUrl',
  'cachedImageUrl',
  'sharedPostThumbnail',
  'metadata.image',
  'metadata.imageUrl',
  'metadata.relevantImageUrl',
  'metadata.cachedImageUrl',
  'metadata.sharedPostThumbnail',
] as const;

const EVENT_IMAGE_ARRAY_REFERENCE_FIELDS = [
  'mediaUrls',
  'metadata.mediaUrls',
] as const;

export interface BackfillEventImagesOptions {
  cursor?: string;
  scanLimit?: number;
  maxUpdatedDocs?: number;
  dryRun?: boolean;
}

export interface BackfillEventImagesResult {
  scannedDocs: number;
  updatedDocs: number;
  unchangedDocs: number;
  skippedByLimit: number;
  convertedFields: number;
  convertedUrls: number;
  failedUrls: number;
  nextCursor?: string;
  exhausted: boolean;
  dryRun: boolean;
}

export interface BackfillVenueProfileImagesOptions {
  cursor?: string;
  scanLimit?: number;
  maxUpdatedDocs?: number;
  maxEventsPerVenue?: number;
  dryRun?: boolean;
}

export interface BackfillVenueProfileImagesResult {
  scannedDocs: number;
  updatedDocs: number;
  unchangedDocs: number;
  skippedByLimit: number;
  convertedFields: number;
  convertedUrls: number;
  failedUrls: number;
  eventDerivedProfiles: number;
  nextCursor?: string;
  exhausted: boolean;
  dryRun: boolean;
}

export interface DeleteExpiredEventsOptions {
  recurringGraceDays?: number;
  staleRecurringDays?: number;
  maxScannedPerVenue?: number;
  venueIds?: string[];
}

export interface BackfillRecurringLifecycleOptions {
  cursor?: string;
  scanLimit?: number;
  maxUpdatedDocs?: number;
  dryRun?: boolean;
  onlyRecurring?: boolean;
}

export interface BackfillRecurringLifecycleResult {
  scannedDocs: number;
  recurringDocs: number;
  updatedDocs: number;
  unchangedDocs: number;
  skippedByLimit: number;
  populatedLastSeenAt: number;
  populatedTotalOccurrences: number;
  populatedRecurrenceUntilDate: number;
  nextCursor?: string;
  exhausted: boolean;
  dryRun: boolean;
}

const DEFAULT_RECURRING_GRACE_DAYS = 30;
const DEFAULT_RECURRING_STALE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_EVENTS_SCAN_CAP = 20000;
const MIN_EVENTS_SCAN_CAP = 250;

const TOTAL_OCCURRENCE_FIELD_CANDIDATES = [
  'totalOccurrences',
  'occurrenceCount',
  'occurrences',
  'numberOfOccurrences',
  'numberOfRecurrences',
  'numRecurrences',
  'recurrenceCount',
  'totalRecurrences',
] as const;

const RECURRENCE_UNTIL_FIELD_CANDIDATES = [
  'recurrenceUntilDate',
  'recurrenceEndDate',
  'recurrenceUntil',
  'untilDate',
  'repeatUntil',
  'recursUntil',
] as const;

function parseTimestampMillis(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof admin.firestore.Timestamp) {
    return value.toMillis();
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'number') {
    return value;
  }
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : parsed;
}

function splitCitySuffix(
  name: string
): { baseName: string; city: string; region: string } | null {
  const raw = String(name || '').trim();
  if (!raw) return null;
  const match = raw.match(CITY_SUFFIX_REGEX);
  if (!match) return null;
  const baseName = match[1].trim();
  const city = match[2].trim();
  const region = match[3].trim().toUpperCase();
  if (!baseName || !city || !region) return null;
  return { baseName, city, region };
}

function getVenueNameVariants(
  name: string
): { variants: string[]; cityHint?: string; regionHint?: string } {
  const raw = String(name || '').trim();
  const variants = new Set<string>();

  if (raw) {
    variants.add(raw);
    getVenueAliasCandidates(raw).forEach((alias) => variants.add(alias));

    // Sub-location labels often prefix the real venue using commas, e.g.
    // "Day Lounge, W.A. Murphy Student Centre". Add trailing segments so
    // alias/exact matching can still hit the base venue.
    const commaSegments = raw
      .split(',')
      .map((segment) => segment.trim())
      .filter(Boolean);
    if (commaSegments.length > 1) {
      for (let i = 1; i < commaSegments.length; i += 1) {
        const tail = commaSegments.slice(i).join(', ').trim();
        if (!tail) continue;
        variants.add(tail);
        getVenueAliasCandidates(tail).forEach((alias) => variants.add(alias));
      }
    }
  }

  const suffix = splitCitySuffix(raw);
  if (suffix?.baseName) {
    variants.add(suffix.baseName);
    getVenueAliasCandidates(suffix.baseName).forEach((alias) => variants.add(alias));
    const cityLabel = `${suffix.city} ${suffix.region}`.trim();
    if (cityLabel) {
      variants.add(`${suffix.baseName} | ${cityLabel}`);
      variants.add(`${suffix.baseName} - ${cityLabel}`);
    }
  }

  return {
    variants: Array.from(variants),
    cityHint: suffix?.city,
    regionHint: suffix?.region,
  };
}

/**
 * Extract all possible name variants from a venue for fuzzy matching.
 * This includes the raw name fields plus parsed variants.
 */
function getVenueMatchNames(venue: VenueData): string[] {
  const venueRecord = venue as unknown as Record<string, unknown>;
  const names = new Set<string>();

  // Direct name fields
  const rawName = venue.name || '';
  const pagename = String(venueRecord.pagename || '');
  const title = String(venueRecord.title || '');

  if (rawName) names.add(rawName);
  if (pagename) names.add(pagename);
  if (title) names.add(title);

  // Extract name from placeDetailsParsed if available
  const placeDetails = venueRecord.placeDetailsParsed as Record<string, unknown> | undefined;
  if (placeDetails?.name) {
    names.add(String(placeDetails.name));
  }

  // Include explicit aliases captured on the venue document so
  // manual alias finalization can improve future automatic matching.
  const aliases = Array.isArray(venueRecord.aliases)
    ? venueRecord.aliases.map((value) => String(value))
    : [];
  for (const alias of aliases) {
    if (alias) names.add(alias);
  }

  // Parse out base names from "Name | City, Province" format
  // Also handles "Name - City" and "Name, City" formats
  for (const fullName of [pagename, title]) {
    if (!fullName) continue;
    // Split on common separators: |, -, comma followed by province code
    const match = fullName.match(/^(.+?)(?:\s*[|,-]\s*[A-Za-z\s]+(?:PE|PEI|NS|NB|NL|ON|QC|AB|BC|SK|MB)?\s*$)/i);
    if (match && match[1]) {
      const baseName = match[1].trim();
      if (baseName && baseName !== fullName) {
        names.add(baseName);
      }
    }
  }

  return Array.from(names).filter(n => n.length > 0);
}

function hydrateVenueNameFallback(venue: VenueData): VenueData {
  if (!venue) return venue;

  const venueRecord = venue as unknown as Record<string, unknown>;
  const existingName = String(venueRecord.name || '').trim();
  const existingWebsite = String(venueRecord.website || '').trim();
  const placeDetails = venueRecord.placeDetailsParsed as Record<string, unknown> | undefined;
  const fallbackWebsite = String(placeDetails?.website || '').trim();

  const fallback = String(
    venueRecord.pagename ||
    venueRecord.pageName ||
    venueRecord.title ||
    ''
  ).trim();
  if (existingName && (existingWebsite || !fallbackWebsite)) return venue;

  const nextVenue: VenueData = { ...venue };
  if (!existingName && fallback) {
    nextVenue.name = fallback;
  }
  if (!existingWebsite && fallbackWebsite) {
    nextVenue.website = fallbackWebsite;
  }

  return nextVenue;
}

function venueMatchesCityHint(
  venue: VenueData,
  cityHint?: string,
  regionHint?: string
): boolean {
  if (!cityHint) return false;
  const normalizedHint = normalizeVenueName(cityHint);
  if (!normalizedHint) return false;

  const venueRecord = venue as unknown as Record<string, unknown>;
  const venueCity = normalizeVenueName(venueRecord.city as string);
  if (venueCity && venueCity === normalizedHint) return true;

  const venueAddress = normalizeVenueName(venueRecord.address as string);
  if (venueAddress && venueAddress.includes(normalizedHint)) return true;

  if (regionHint) {
    const normalizedRegion = normalizeVenueName(regionHint);
    if (normalizedRegion && venueAddress.includes(normalizedRegion)) return true;
  }

  const venueName =
    venue.name ||
    (venue as unknown as Record<string, unknown>).pagename ||
    (venue as unknown as Record<string, unknown>).title ||
    '';
  const normalizedName = normalizeVenueName(String(venueName));
  return normalizedName.includes(normalizedHint);
}

const TOKEN_FUZZY_STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'in',
  'on',
  'at',
  'to',
  'for',
  'from',
  'with',
  'by',
  'st',
  'street',
  'ave',
  'avenue',
  'road',
  'rd',
  'drive',
  'dr',
  'charlottetown',
  'summerside',
  'pei',
  'pe',
  'prince',
  'edward',
  'island',
  'canada',
]);

const TOKEN_FUZZY_GENERIC_WORDS = new Set([
  'venue',
  'centre',
  'center',
  'hall',
  'hallway',
  'building',
  'room',
  'club',
  'arena',
  'theatre',
  'theater',
  'restaurant',
  'bar',
  'pub',
  'cafe',
  'coffee',
  'kitchen',
  'house',
  'hotel',
  'inn',
  'mall',
  'park',
  'campus',
  'school',
  'university',
  'community',
]);

type TokenOverlapEvidence = {
  overlapCount: number;
  minTokenCount: number;
  jaccard: number;
  overlapRatio: number;
  score: number;
  meaningfulOverlapCount: number;
};

function extractVenueMatchTokens(value: string): string[] {
  const normalized = normalizeVenueName(value || '');
  if (!normalized) return [];

  const unique = new Set<string>();
  for (const token of normalized.split(/\s+/).filter(Boolean)) {
    if (!token) continue;
    if (TOKEN_FUZZY_STOP_WORDS.has(token)) continue;
    // Keep short numeric tokens, but skip noisy one-character alpha tokens.
    if (token.length <= 1 && !/^\d+$/.test(token)) continue;
    unique.add(token);
  }
  return Array.from(unique);
}

function computeTokenOverlapEvidence(candidate: string, target: string): TokenOverlapEvidence {
  const candidateTokens = extractVenueMatchTokens(candidate);
  const targetTokens = extractVenueMatchTokens(target);
  if (!candidateTokens.length || !targetTokens.length) {
    return {
      overlapCount: 0,
      minTokenCount: 0,
      jaccard: 0,
      overlapRatio: 0,
      score: 0,
      meaningfulOverlapCount: 0,
    };
  }

  const candidateSet = new Set(candidateTokens);
  const targetSet = new Set(targetTokens);
  const overlap: string[] = [];
  for (const token of candidateSet) {
    if (targetSet.has(token)) overlap.push(token);
  }

  const overlapCount = overlap.length;
  const minTokenCount = Math.max(1, Math.min(candidateSet.size, targetSet.size));
  const unionCount = new Set<string>([...candidateSet, ...targetSet]).size;
  const overlapRatio = overlapCount / minTokenCount;
  const jaccard = unionCount > 0 ? overlapCount / unionCount : 0;
  const meaningfulOverlapCount = overlap.filter(
    (token) => !TOKEN_FUZZY_GENERIC_WORDS.has(token)
  ).length;

  // Favor deep overlap of the shorter side while still rewarding clean unions.
  const score = overlapRatio * 0.7 + jaccard * 0.3;

  return {
    overlapCount,
    minTokenCount,
    jaccard,
    overlapRatio,
    score,
    meaningfulOverlapCount,
  };
}

/**
 * Queue a city/area-scoped Facebook Event for explicit review.
 * These records are display-location candidates, not matchable venue candidates.
 */
export async function queueCityLevelEventReview(
  input: QueueCityLevelEventReviewInput
): Promise<QueueCityLevelEventReviewResult> {
  const locationLabel = String(input.locationLabel || '').trim();
  if (!locationLabel) {
    return { queued: false, reason: 'empty_location_label' };
  }

  const docId = buildCityLevelEventReviewDocId(input);
  const docRef = db.collection(COLLECTIONS.CITY_LEVEL_EVENT_REVIEWS).doc(docId);
  const sample = buildCityLevelEventReviewSample({
    ...input,
    locationLabel,
  });
  const locationScope = input.locationScope || 'city';
  const locationPrecision = input.locationPrecision || 'city_centroid';
  const mediaUrls = dedupeUrls([
    ...tokenizeMediaUrls(input.mediaUrls),
    ...tokenizeMediaUrls(input.imageUrl),
  ]);
  const imageUrl = asOptionalTrimmedString(input.imageUrl) || mediaUrls[0];
  const externalLinks = dedupeUrls(tokenizeMediaUrls(input.externalLinks));
  const descriptionPreview = trimCityLevelEventPreview(input.description);
  const usersResponded = asOptionalTrimmedString(input.usersResponded);
  const usersGoing = asOptionalTrimmedString(input.usersGoing);
  const usersInterested = asOptionalTrimmedString(input.usersInterested);
  const facebookUsersResponded = asOptionalTrimmedString(input.facebookUsersResponded);
  let created = false;
  let shouldRefreshPublishedEvent = false;

  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(docRef);
    const now = admin.firestore.FieldValue.serverTimestamp();

    if (!snapshot.exists) {
      created = true;
      const payload: CityLevelEventReviewRecord = {
        status: 'needs_review',
        uniqueId: String(input.uniqueId || '').trim() || undefined,
        fileId: String(input.fileId || '').trim() || undefined,
        fileName: String(input.fileName || '').trim() || undefined,
        rowIndex: Number.isFinite(Number(input.rowIndex)) ? Number(input.rowIndex) : undefined,
        lastSeenFileId: String(input.fileId || '').trim() || undefined,
        lastSeenRowIndex: Number.isFinite(Number(input.rowIndex)) ? Number(input.rowIndex) : undefined,
        sourceScraperType: input.sourceScraperType,
        sourceContentSignature: asOptionalTrimmedString(input.sourceContentSignature),
        locationScope,
        locationLabel,
        locationCity: String(input.locationCity || '').trim() || undefined,
        locationProvince: String(input.locationProvince || '').trim() || undefined,
        locationPrecision,
        locationReviewStatus: 'needs_review',
        eventName: String(input.eventName || '').trim() || undefined,
        eventDate: String(input.eventDate || '').trim() || undefined,
        eventTime: String(input.eventTime || '').trim() || undefined,
        endDate: String(input.endDate || '').trim() || undefined,
        endTime: String(input.endTime || '').trim() || undefined,
        eventType: String(input.eventType || '').trim() || undefined,
        category: String(input.category || '').trim() || undefined,
        descriptionPreview,
        imageUrl,
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
        usersResponded,
        usersGoing,
        usersInterested,
        facebookUsersResponded,
        likes: input.likes,
        shares: input.shares,
        comments: input.comments,
        topReactionsCount: input.topReactionsCount,
        ticketsBuyUrl: asOptionalTrimmedString(input.ticketsBuyUrl),
        externalLinks: externalLinks.length > 0 ? externalLinks : undefined,
        organizerName: String(input.organizerName || '').trim() || undefined,
        facebookUrl: String(input.facebookUrl || '').trim() || undefined,
        topLevelUrl: String(input.topLevelUrl || '').trim() || undefined,
        occurrences: 1,
        sampleRows: [sample],
      };

      tx.set(docRef, {
        ...payload,
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
      });
      return;
    }

    const existing = (snapshot.data() || {}) as Partial<CityLevelEventReviewRecord> & Record<string, unknown>;
    const nextStatus = normalizeCityLevelReviewStatus(String(existing.status || 'needs_review'));
    shouldRefreshPublishedEvent = nextStatus === 'published';
    const sampleRows = mergeCityLevelEventReviewSamples(existing.sampleRows, sample);
    const mergedMediaUrls = mergeCityLevelEventMediaUrls(
      tokenizeMediaUrls(existing.mediaUrls),
      mediaUrls
    );
    const mergedExternalLinks = dedupeUrls([
      ...tokenizeMediaUrls(existing.externalLinks),
      ...externalLinks,
    ]);
    const shouldRefreshTiming = shouldRefreshCityLevelReviewTiming(existing, input);
    const nextEndDate = shouldRefreshTiming
      ? asOptionalTrimmedString(input.endDate) || asOptionalTrimmedString(existing.endDate)
      : asOptionalTrimmedString(existing.endDate) || asOptionalTrimmedString(input.endDate);
    const nextEndTime = shouldRefreshTiming
      ? asOptionalTrimmedString(input.endTime) || asOptionalTrimmedString(existing.endTime)
      : asOptionalTrimmedString(existing.endTime) || asOptionalTrimmedString(input.endTime);

    tx.set(
      docRef,
      compactRecord({
        status: nextStatus,
        uniqueId: String(existing.uniqueId || input.uniqueId || '').trim() || undefined,
        fileId: String(existing.fileId || input.fileId || '').trim() || undefined,
        fileName: String(existing.fileName || input.fileName || '').trim() || undefined,
        rowIndex: existing.rowIndex ?? (Number.isFinite(Number(input.rowIndex)) ? Number(input.rowIndex) : undefined),
        lastSeenFileId: String(input.fileId || existing.lastSeenFileId || '').trim() || undefined,
        lastSeenRowIndex: Number.isFinite(Number(input.rowIndex))
          ? Number(input.rowIndex)
          : existing.lastSeenRowIndex,
        sourceScraperType: existing.sourceScraperType || input.sourceScraperType,
        sourceContentSignature: asOptionalTrimmedString(input.sourceContentSignature) ||
          asOptionalTrimmedString(existing.sourceContentSignature),
        locationScope: existing.locationScope || locationScope,
        locationLabel: String(existing.locationLabel || locationLabel).trim(),
        locationCity: String(existing.locationCity || input.locationCity || '').trim() || undefined,
        locationProvince: String(existing.locationProvince || input.locationProvince || '').trim() || undefined,
        locationPrecision: existing.locationPrecision || locationPrecision,
        locationReviewStatus: normalizeLocationReviewStatus(nextStatus),
        eventName: String(existing.eventName || input.eventName || '').trim() || undefined,
        eventDate: String(existing.eventDate || input.eventDate || '').trim() || undefined,
        eventTime: String(existing.eventTime || input.eventTime || '').trim() || undefined,
        endDate: nextEndDate,
        endTime: nextEndTime,
        eventType: String(existing.eventType || input.eventType || '').trim() || undefined,
        category: String(existing.category || input.category || '').trim() || undefined,
        descriptionPreview: descriptionPreview || asOptionalTrimmedString(existing.descriptionPreview),
        imageUrl: imageUrl || asOptionalTrimmedString(existing.imageUrl),
        mediaUrls: mergedMediaUrls.length > 0 ? mergedMediaUrls : undefined,
        usersResponded: usersResponded || asOptionalTrimmedString(existing.usersResponded),
        usersGoing: usersGoing || asOptionalTrimmedString(existing.usersGoing),
        usersInterested: usersInterested || asOptionalTrimmedString(existing.usersInterested),
        facebookUsersResponded: facebookUsersResponded || asOptionalTrimmedString(existing.facebookUsersResponded),
        likes: input.likes ?? existing.likes,
        shares: input.shares ?? existing.shares,
        comments: input.comments ?? existing.comments,
        topReactionsCount: input.topReactionsCount ?? existing.topReactionsCount,
        ticketsBuyUrl: asOptionalTrimmedString(input.ticketsBuyUrl) || asOptionalTrimmedString(existing.ticketsBuyUrl),
        externalLinks: mergedExternalLinks.length > 0 ? mergedExternalLinks : undefined,
        organizerName: String(existing.organizerName || input.organizerName || '').trim() || undefined,
        facebookUrl: String(existing.facebookUrl || input.facebookUrl || '').trim() || undefined,
        topLevelUrl: String(existing.topLevelUrl || input.topLevelUrl || '').trim() || undefined,
        occurrences: Number(existing.occurrences || 0) + 1,
        sampleRows,
        updatedAt: now,
        lastSeenAt: now,
      }),
      { merge: true }
    );
  });

  logger.info(created ? 'Queued new city-level event review' : 'Updated city-level event review', {
    docId,
    locationLabel,
    locationScope,
    eventName: input.eventName,
    eventDate: input.eventDate,
    rowIndex: input.rowIndex,
    fileId: input.fileId,
    organizerName: input.organizerName,
    created,
  });

  if (shouldRefreshPublishedEvent) {
    try {
      await refreshPublishedCityLevelEventFromReview(docId);
    } catch (error) {
      logger.warn('Failed to refresh published city-level event after new occurrence', {
        docId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    queued: true,
    docId,
    created,
  };
}

function asOptionalTrimmedString(value: unknown): string | undefined {
  const normalized = String(value || '').trim();
  return normalized || undefined;
}

function requireCityLevelEventField(value: unknown, fieldName: string): string {
  const normalized = asOptionalTrimmedString(value);
  if (!normalized) {
    throw new Error(`City-level event review is missing ${fieldName}`);
  }
  return normalized;
}

function normalizePublishedCityLevelScope(value: unknown): 'city' | 'area' {
  return String(value || '').trim() === 'area' ? 'area' : 'city';
}

function normalizePublishedCityLevelPrecision(
  value: unknown,
  scope: 'city' | 'area'
): 'city_centroid' | 'approximate' | 'none' {
  const normalized = String(value || '').trim();
  if (normalized === 'none' || normalized === 'approximate' || normalized === 'city_centroid') {
    return normalized;
  }
  return scope === 'city' ? 'city_centroid' : 'approximate';
}

function normalizePublishedCityLevelEventType(value: unknown): string {
  const normalized = String(value || '').trim();
  return normalized || 'community';
}

function normalizePublishedCityLevelCategory(value: unknown): string {
  const normalized = String(value || '').trim();
  return normalized || 'Community';
}

function normalizePublishedCityLevelEngagement(
  manual: FinalizeCityLevelEventReviewInput['manual'] = {},
  record: CityLevelEventReviewRecord
): {
  usersResponded?: string;
  usersGoing?: string;
  usersInterested?: string;
  facebookUsersResponded?: string;
} {
  const usersGoing = asOptionalTrimmedString(manual.usersGoing || record.usersGoing);
  const usersInterested = asOptionalTrimmedString(manual.usersInterested || record.usersInterested);
  const facebookUsersResponded = asOptionalTrimmedString(
    manual.facebookUsersResponded || record.facebookUsersResponded || record.usersResponded
  );
  return {
    usersResponded: asOptionalTrimmedString(manual.usersResponded) || usersGoing || asOptionalTrimmedString(record.usersResponded),
    usersGoing,
    usersInterested,
    facebookUsersResponded,
  };
}

function collectPublishedCityLevelSourceMedia(
  manual: FinalizeCityLevelEventReviewInput['manual'] = {},
  record: CityLevelEventReviewRecord
): string[] {
  return dedupeUrls([
    ...tokenizeMediaUrls(manual.mediaUrls),
    ...tokenizeMediaUrls(manual.imageUrl),
    ...tokenizeMediaUrls(record.mediaUrls),
    ...tokenizeMediaUrls(record.imageUrl),
  ]);
}

async function buildPublishedCityLevelMediaFields(
  manual: FinalizeCityLevelEventReviewInput['manual'] = {},
  record: CityLevelEventReviewRecord
): Promise<Partial<EventData>> {
  const sourceMediaUrls = collectPublishedCityLevelSourceMedia(manual, record);
  if (sourceMediaUrls.length === 0) {
    throw new Error('City-level event review is missing imageUrl/mediaUrls');
  }

  const uploadUrl = String(process.env.IMAGE_UPLOAD_URL || '').trim();
  const cache = new Map<string, string | null>();
  const outputUrls: string[] = [];

  for (const sourceUrl of sourceMediaUrls) {
    let resolvedUrl = sourceUrl;
    if (uploadUrl) {
      const managedUrl = await convertImageUrlToManaged(sourceUrl, 'postimages', uploadUrl, cache);
      if (managedUrl) {
        resolvedUrl = managedUrl;
      } else {
        logger.warn('City-level event image upload failed; preserving source image URL', {
          sourceUrl,
          eventName: record.eventName || '',
          reviewUniqueId: record.uniqueId || '',
        });
      }
    } else {
      logger.warn('City-level event image upload disabled (IMAGE_UPLOAD_URL not set); preserving source image URL', {
        sourceUrl,
        eventName: record.eventName || '',
        reviewUniqueId: record.uniqueId || '',
      });
    }

    outputUrls.push(resolvedUrl);
  }

  const mediaUrls = dedupeUrls(outputUrls);
  const primaryImageUrl = mediaUrls.find((url) => isManagedImageUrl(url)) || mediaUrls[0];

  return compactRecord({
    imageUrl: primaryImageUrl,
    image: primaryImageUrl,
    relevantImageUrl: primaryImageUrl,
    mediaUrls,
  });
}

function buildPublishedCityLevelEventData(
  reviewId: string,
  record: CityLevelEventReviewRecord,
  manual: FinalizeCityLevelEventReviewInput['manual'] = {},
  mediaFields: Partial<EventData> = {}
): EventData & Record<string, unknown> {
  const locationScope = normalizePublishedCityLevelScope(manual.locationScope || record.locationScope);
  const locationPrecision = normalizePublishedCityLevelPrecision(
    manual.locationPrecision || record.locationPrecision,
    locationScope
  );
  const locationLabel = requireCityLevelEventField(
    manual.locationLabel || record.locationLabel,
    'locationLabel'
  );
  const eventName = requireCityLevelEventField(
    manual.eventName || record.eventName,
    'eventName'
  );
  const startDate = requireCityLevelEventField(
    manual.eventDate || record.eventDate,
    'eventDate'
  );
  const startTime = asOptionalTrimmedString(manual.eventTime || record.eventTime);
  const endDate = asOptionalTrimmedString(manual.endDate || record.endDate) || startDate;
  const description = asOptionalTrimmedString(manual.description || record.descriptionPreview);
  const engagement = normalizePublishedCityLevelEngagement(manual, record);
  const externalLinks = dedupeUrls([
    ...tokenizeMediaUrls(manual.externalLinks),
    ...tokenizeMediaUrls(record.externalLinks),
  ]);

  return compactRecord({
    uniqueId: `${asOptionalTrimmedString(record.uniqueId) || reviewId}_city`,
    cityLevelReviewId: reviewId,
    sourceScraperType: record.sourceScraperType,
    sourceContentSignature: asOptionalTrimmedString(record.sourceContentSignature),
    establishment: locationLabel,
    venue: locationLabel,
    name: eventName,
    eventName,
    description,
    eventType: normalizePublishedCityLevelEventType(manual.eventType || record.eventType),
    category: normalizePublishedCityLevelCategory(manual.category || record.category),
    isEvent: 'Yes',
    isFoodSpecial: 'No',
    startDate,
    startTime,
    endDate,
    endTime: asOptionalTrimmedString(manual.endTime || record.endTime),
    ...mediaFields,
    venueId: null,
    locationScope,
    locationLabel,
    locationCity: asOptionalTrimmedString(manual.locationCity || record.locationCity),
    locationProvince: asOptionalTrimmedString(manual.locationProvince || record.locationProvince),
    locationPrecision,
    locationReviewStatus: 'approved',
    mapMode: locationPrecision === 'none' ? 'none' : 'area',
    address: locationLabel,
    facebookUrl: asOptionalTrimmedString(record.facebookUrl),
    cleanedFacebookUrl: asOptionalTrimmedString(record.facebookUrl),
    organizedBy: asOptionalTrimmedString(record.organizerName),
    usersResponded: engagement.usersResponded,
    usersGoing: engagement.usersGoing,
    usersInterested: engagement.usersInterested,
    facebookUsersResponded: engagement.facebookUsersResponded,
    likes: record.likes,
    shares: record.shares,
    comments: record.comments,
    topReactionsCount: record.topReactionsCount,
    ticketsBuyUrl: asOptionalTrimmedString(manual.ticketsBuyUrl || record.ticketsBuyUrl),
    externalLinks: externalLinks.length > 0 ? externalLinks : undefined,
    source: 'city_level_event_review',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
  }) as unknown as EventData & Record<string, unknown>;
}

async function writePublishedCityLevelEvent(
  reviewId: string,
  record: CityLevelEventReviewRecord,
  manual: FinalizeCityLevelEventReviewInput['manual'] = {},
  options: { preserveCreatedAt?: boolean } = {}
): Promise<admin.firestore.DocumentReference> {
  const eventId = asOptionalTrimmedString(record.publishedEventId) || reviewId;
  const eventRef = db.collection(COLLECTIONS.EVENTS).doc(eventId);
  const mediaFields = await buildPublishedCityLevelMediaFields(manual, record);
  const eventData = normalizeRecurringBaseWritePayload(
    buildPublishedCityLevelEventData(reviewId, record, manual, mediaFields)
  ) as EventData & Record<string, unknown>;

  if (options.preserveCreatedAt) {
    delete eventData.createdAt;
  }

  await eventRef.set(eventData, { merge: true });
  return eventRef;
}

async function refreshPublishedCityLevelEventFromReview(reviewId: string): Promise<void> {
  const docRef = db.collection(COLLECTIONS.CITY_LEVEL_EVENT_REVIEWS).doc(reviewId);
  const snapshot = await docRef.get();
  if (!snapshot.exists) return;

  const record = {
    id: snapshot.id,
    ...(snapshot.data() || {}),
  } as CityLevelEventReviewRecord;

  if (normalizeCityLevelReviewStatus(String(record.status || '')) !== 'published') {
    return;
  }

  const eventRef = await writePublishedCityLevelEvent(reviewId, record, {}, { preserveCreatedAt: true });
  await docRef.set(
    compactRecord({
      publishedEventId: eventRef.id,
      publishedEventPath: eventRef.path,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }),
    { merge: true }
  );
}

export async function finalizeCityLevelEventReview(
  input: FinalizeCityLevelEventReviewInput
): Promise<FinalizeCityLevelEventReviewResult> {
  const reviewId = String(input.reviewId || '').trim();
  if (!reviewId) {
    throw new Error('reviewId is required');
  }

  const action = input.action || 'reject';
  if (!['approve_publish', 'reject', 'ignore'].includes(action)) {
    throw new Error('action must be approve_publish, reject, or ignore');
  }

  const docRef = db.collection(COLLECTIONS.CITY_LEVEL_EVENT_REVIEWS).doc(reviewId);
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    throw new Error(`City-level event review not found: ${reviewId}`);
  }

  const record = {
    id: snapshot.id,
    ...(snapshot.data() || {}),
  } as CityLevelEventReviewRecord;

  const resolvedBy = asOptionalTrimmedString(input.resolvedBy) || 'finalizeCityLevelEventReview';
  const notes = asOptionalTrimmedString(input.notes);

  if (action === 'reject' || action === 'ignore') {
    const status = action === 'reject' ? 'rejected' : 'ignored';
    await docRef.set(
      compactRecord({
        status,
        locationReviewStatus: 'rejected',
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        resolvedBy,
        notes,
        finalization: {
          action,
          manual: input.manual || {},
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }),
      { merge: true }
    );

    return {
      success: true,
      reviewId,
      action,
      status,
    };
  }

  const eventRef = await writePublishedCityLevelEvent(reviewId, record, input.manual);
  await docRef.set(
    compactRecord({
      status: 'published',
      locationReviewStatus: 'approved',
      publishedEventId: eventRef.id,
      publishedEventPath: eventRef.path,
      publishedAt: admin.firestore.FieldValue.serverTimestamp(),
      resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
      resolvedBy,
      notes,
      finalization: {
        action,
        manual: input.manual || {},
        publishedEventPath: eventRef.path,
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }),
    { merge: true }
  );

  logger.info('Published city-level event review', {
    reviewId,
    eventId: eventRef.id,
    eventPath: eventRef.path,
    eventName: input.manual?.eventName || record.eventName || '',
    locationLabel: input.manual?.locationLabel || record.locationLabel || '',
  });

  return {
    success: true,
    reviewId,
    action,
    status: 'published',
    publishedEventId: eventRef.id,
    publishedEventPath: eventRef.path,
  };
}

/**
 * Queue an unrecognized venue for manual review / lookup pipeline.
 * This is gated by env flags so we can safely enable it for targeted wet runs first.
 */
export async function queueUnrecognizedVenue(
  input: QueueUnrecognizedVenueInput
): Promise<QueueUnrecognizedVenueResult> {
  const venueName = String(input.venueName || '').trim();
  const establishmentNormalized = normalizeVenueName(venueName);

  if (!venueName || !establishmentNormalized) {
    return { queued: false, reason: 'empty_name' };
  }

  const nonVenueClassification = classifySuspectedNonVenueLabel(input);
  if (nonVenueClassification.isNonVenue) {
    logger.debug('Unknown venue queue skipped by non-venue label heuristic', {
      venueName,
      normalizedName: establishmentNormalized,
      rule: nonVenueClassification.rule,
      rowIndex: input.rowIndex,
      fileId: input.fileId,
      source: input.source,
      parserMode: input.parserMode,
    });
    return { queued: false, reason: 'suspected_non_venue_label' };
  }

  const gate = shouldQueueUnknownVenue(venueName);
  if (!gate.allowed) {
    logger.debug('Unknown venue queue skipped by config gate', {
      venueName,
      normalizedName: establishmentNormalized,
      reason: gate.reason,
      testMode: gate.testMode,
      rowIndex: input.rowIndex,
      fileId: input.fileId,
    });
    return {
      queued: false,
      reason: gate.reason,
      testMode: gate.testMode,
    };
  }

  const inferredHints = await inferUnknownVenueCityProvinceHints({
    venueName,
    aggregatorName: input.aggregatorName,
    description: input.description,
    aggregatorFacebookUrl: input.aggregatorFacebookUrl,
  });
  const cityHint = String(input.cityHint || inferredHints.cityHint || '').trim() || undefined;
  const provinceHint = normalizeProvinceToken(
    String(input.provinceHint || inferredHints.provinceHint || '').trim()
  );
  const aliasCandidates = dedupeStringList(getVenueAliasCandidates(venueName));
  const sourceUniqueId = asOptionalTrimmedString(input.sourceUniqueId);
  const sourceContentSignature = asOptionalTrimmedString(input.sourceContentSignature);
  const existingSourceRecords = sourceUniqueId
    ? await findUnrecognizedVenuesBySourceUniqueId(sourceUniqueId)
    : [];
  const existingSourceDocId = pickUnrecognizedVenueDocIdForSource(
    existingSourceRecords,
    establishmentNormalized
  );
  const docId =
    existingSourceDocId || buildUnrecognizedVenueDocId(establishmentNormalized, cityHint, provinceHint);
  const docRef = db.collection(COLLECTIONS.UNRECOGNIZED_VENUES).doc(docId);
  const sample = buildUnrecognizedVenueSample(input, establishmentNormalized);

  let created = false;

  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(docRef);
    const now = admin.firestore.FieldValue.serverTimestamp();

    if (!snapshot.exists) {
      created = true;
      const payload: UnrecognizedVenueRecord = {
        establishment: venueName,
        establishmentNormalized,
        status: 'pending',
        occurrences: 1,
        cityHint,
        provinceHint,
        aliasCandidates,
        sourceTypes: [input.source],
        sourceUniqueIds: sourceUniqueId ? [sourceUniqueId] : [],
        sourceContentSignaturesBySourceId:
          sourceUniqueId && sourceContentSignature
            ? { [sourceUniqueId]: sourceContentSignature }
            : {},
        sampleEvents: [sample],
        suggestedMatches: aliasCandidates.map((alias) => ({
          venueName: alias,
          confidence: 1,
          matchType: 'alias',
          note: 'Static alias candidate',
        })),
        testMode: gate.testMode,
      };

      tx.set(docRef, {
        ...payload,
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
      });
      return;
    }

    const existing = (snapshot.data() || {}) as Partial<UnrecognizedVenueRecord> & Record<string, unknown>;
    const existingOccurrences = Number(existing.occurrences || 0);
    const existingStatusRaw = String(existing.status || 'pending');
    const existingStatus = existingStatusRaw as UnrecognizedVenueStatus;
    const nextStatus: UnrecognizedVenueStatus = isTerminalUnrecognizedStatus(existingStatusRaw)
      ? existingStatus
      : ['pending', 'lookup_running', 'candidate_found', 'manual_review'].includes(existingStatusRaw)
        ? existingStatus
        : 'pending';

    const existingAliases = Array.isArray(existing.aliasCandidates)
      ? existing.aliasCandidates.map((value) => String(value))
      : [];
    const existingSources = Array.isArray(existing.sourceTypes)
      ? existing.sourceTypes.map((value) => String(value))
      : [];
    const existingSourceUniqueIds = normalizeStringList(existing.sourceUniqueIds);
    const existingSourceContentSignaturesBySourceId = normalizeStringRecord(
      existing.sourceContentSignaturesBySourceId
    );

    const mergedAliases = dedupeStringList([...existingAliases, ...aliasCandidates]);
    const mergedSources = dedupeStringList([...existingSources, input.source]);
    const mergedSourceUniqueIds = dedupeStringList([
      ...existingSourceUniqueIds,
      ...(sourceUniqueId ? [sourceUniqueId] : []),
    ]);
    const mergedSourceContentSignaturesBySourceId = {
      ...existingSourceContentSignaturesBySourceId,
      ...(sourceUniqueId && sourceContentSignature
        ? { [sourceUniqueId]: sourceContentSignature }
        : {}),
    };
    const mergedSamples = mergeUnrecognizedSamples(existing.sampleEvents, sample);

    const nextSuggestedMatches =
      Array.isArray(existing.suggestedMatches) && existing.suggestedMatches.length > 0
        ? existing.suggestedMatches
        : mergedAliases.map((alias) => ({
            venueName: alias,
            confidence: 1,
            matchType: 'alias' as const,
            note: 'Static alias candidate',
          }));

    tx.set(
      docRef,
      {
        establishment: String(existing.establishment || venueName),
        establishmentNormalized,
        status: nextStatus,
        occurrences: existingOccurrences + 1,
        cityHint: String(existing.cityHint || cityHint || '').trim() || undefined,
        provinceHint: normalizeProvinceToken(String(existing.provinceHint || provinceHint || '').trim()),
        aliasCandidates: mergedAliases,
        sourceTypes: mergedSources,
        sourceUniqueIds: mergedSourceUniqueIds,
        sourceContentSignaturesBySourceId: mergedSourceContentSignaturesBySourceId,
        sampleEvents: mergedSamples,
        suggestedMatches: nextSuggestedMatches,
        testMode: Boolean(existing.testMode || gate.testMode),
        updatedAt: now,
        lastSeenAt: now,
      },
      { merge: true }
    );
  });

  logger.info(created ? 'Queued new unrecognized venue' : 'Updated unrecognized venue queue entry', {
    docId,
    venueName,
    normalizedName: establishmentNormalized,
    cityHint,
    provinceHint,
    aliasCandidates,
    sourceUniqueId,
    hasSourceContentSignature: Boolean(sourceContentSignature),
    source: input.source,
    parserMode: input.parserMode,
    rowIndex: input.rowIndex,
    fileId: input.fileId,
    created,
    testMode: gate.testMode,
  });

  return {
    queued: true,
    docId,
    testMode: gate.testMode,
  };
}

export async function getUnrecognizedVenue(
  docId: string
): Promise<UnrecognizedVenueRecord | null> {
  const normalizedId = String(docId || '').trim();
  if (!normalizedId) return null;
  const doc = await db.collection(COLLECTIONS.UNRECOGNIZED_VENUES).doc(normalizedId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...(doc.data() as UnrecognizedVenueRecord) };
}

export async function findUnrecognizedVenuesBySourceUniqueId(
  sourceUniqueId: string
): Promise<UnrecognizedVenueRecord[]> {
  const normalizedSourceUniqueId = String(sourceUniqueId || '').trim();
  if (!normalizedSourceUniqueId) return [];

  const snapshot = await db.collection(COLLECTIONS.UNRECOGNIZED_VENUES)
    .where('sourceUniqueIds', 'array-contains', normalizedSourceUniqueId)
    .limit(10)
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as UnrecognizedVenueRecord),
  }));
}

export async function listUnrecognizedVenues(options?: {
  limit?: number;
  statuses?: string[];
  orderBy?: 'createdAt' | 'updatedAt' | 'lastSeenAt';
  orderDirection?: 'asc' | 'desc';
}): Promise<UnrecognizedVenueRecord[]> {
  const limit = Math.min(Math.max(Number(options?.limit || 20), 1), 100);
  const orderBy = options?.orderBy || 'updatedAt';
  const orderDirection = options?.orderDirection || 'desc';
  const statuses = Array.isArray(options?.statuses)
    ? options?.statuses.map((value) => String(value || '').trim()).filter(Boolean)
    : [];

  let query: admin.firestore.Query = db.collection(COLLECTIONS.UNRECOGNIZED_VENUES);
  if (statuses.length === 1) {
    query = query.where('status', '==', statuses[0]);
  } else if (statuses.length > 1 && statuses.length <= 10) {
    query = query.where('status', 'in', statuses);
  }

  query = query.orderBy(orderBy, orderDirection).limit(limit);

  const snapshot = await query.get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as UnrecognizedVenueRecord),
  }));
}

export async function claimUnrecognizedVenueForLookup(
  docId: string,
  options?: {
    lockMs?: number;
  }
): Promise<{
  claimed: boolean;
  reason?: string;
  record?: UnrecognizedVenueRecord;
}> {
  const normalizedId = String(docId || '').trim();
  if (!normalizedId) {
    return { claimed: false, reason: 'missing_doc_id' };
  }

  const lockMsRaw = Number(options?.lockMs || process.env.UNKNOWN_VENUE_LOOKUP_LOCK_MS || 5 * 60 * 1000);
  const lockMs = Number.isFinite(lockMsRaw) && lockMsRaw > 0 ? lockMsRaw : 5 * 60 * 1000;
  const docRef = db.collection(COLLECTIONS.UNRECOGNIZED_VENUES).doc(normalizedId);
  let result: { claimed: boolean; reason?: string; record?: UnrecognizedVenueRecord } = { claimed: false };

  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(docRef);
    if (!snapshot.exists) {
      result = { claimed: false, reason: 'not_found' };
      return;
    }

    const data = (snapshot.data() || {}) as Record<string, unknown>;
    const status = String(data.status || 'pending');
    if (isTerminalUnrecognizedStatus(status)) {
      result = { claimed: false, reason: `terminal_status:${status}` };
      return;
    }

    const lockUntilMs = parseTimestampMillis(data.lookupLockExpiresAt) ?? 0;
    if (status === 'lookup_running' && lockUntilMs > Date.now()) {
      result = { claimed: false, reason: 'locked' };
      return;
    }

    const lookupAttempts = Number(data.lookupAttempts || 0);
    tx.set(
      docRef,
      {
        status: 'lookup_running',
        lookupAttempts: lookupAttempts + 1,
        lookupStartedAt: admin.firestore.FieldValue.serverTimestamp(),
        lookupLockExpiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + lockMs),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    result = {
      claimed: true,
      record: {
        id: snapshot.id,
        ...(snapshot.data() as UnrecognizedVenueRecord),
        status: 'lookup_running',
      },
    };
  });

  return result;
}

export async function updateUnrecognizedVenue(
  docId: string,
  updates: Partial<UnrecognizedVenueRecord> & Record<string, unknown>
): Promise<void> {
  const normalizedId = String(docId || '').trim();
  if (!normalizedId) return;

  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (!('lookupLockExpiresAt' in updates)) {
    payload.lookupLockExpiresAt = admin.firestore.FieldValue.delete();
  }

  await db.collection(COLLECTIONS.UNRECOGNIZED_VENUES).doc(normalizedId).set(payload, { merge: true });
}

// ===================
// Venue Operations
// ===================

/**
 * Get all venues for matching
 */
export async function getAllVenues(): Promise<VenueData[]> {
  const snapshot = await db.collection(COLLECTIONS.VENUES).get();
  return snapshot.docs.map(doc => hydrateVenueNameFallback({
    id: doc.id,
    ...doc.data(),
  } as VenueData));
}

/**
 * Get a venue by ID
 */
export async function getVenue(venueId: string): Promise<VenueData | null> {
  const doc = await db.collection(COLLECTIONS.VENUES).doc(venueId).get();
  if (!doc.exists) return null;
  return hydrateVenueNameFallback({ id: doc.id, ...doc.data() } as VenueData);
}

function dedupeCaseInsensitiveStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = String(value || '').trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

export async function addVenueAliases(
  venueId: string,
  aliases: string[]
): Promise<void> {
  const normalizedVenueId = String(venueId || '').trim();
  if (!normalizedVenueId) return;

  const incomingAliases = dedupeCaseInsensitiveStrings(aliases || []);
  if (incomingAliases.length === 0) return;

  const venue = await getVenue(normalizedVenueId);
  if (!venue) {
    throw new Error(`Venue not found: ${normalizedVenueId}`);
  }

  const venueRecord = venue as unknown as Record<string, unknown>;
  const existingAliases = Array.isArray(venueRecord.aliases)
    ? venueRecord.aliases.map((value) => String(value))
    : [];
  const mergedAliases = dedupeCaseInsensitiveStrings([...existingAliases, ...incomingAliases]);
  const aliasesNormalized = Array.from(
    new Set(
      mergedAliases
        .map((value) => normalizeVenueName(value))
        .filter(Boolean)
    )
  );

  await db.collection(COLLECTIONS.VENUES).doc(normalizedVenueId).set(
    {
      aliases: mergedAliases,
      aliasesNormalized,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function mergeVenueFieldsIfEmpty(
  venueId: string,
  updates: Partial<VenueData> & Record<string, unknown>
): Promise<void> {
  const normalizedVenueId = String(venueId || '').trim();
  if (!normalizedVenueId) return;
  const venue = await getVenue(normalizedVenueId);
  if (!venue) throw new Error(`Venue not found: ${normalizedVenueId}`);

  const existing = venue as unknown as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates || {})) {
    if (value === undefined || value === null) continue;
    const existingValue = existing[key];
    const existingHasValue = !(
      existingValue === undefined ||
      existingValue === null ||
      (typeof existingValue === 'string' && existingValue.trim() === '')
    );
    if (!existingHasValue) {
      patch[key] = value;
    }
  }

  if (Object.keys(patch).length === 0) return;

  patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  await db.collection(COLLECTIONS.VENUES).doc(normalizedVenueId).set(patch, { merge: true });
}

/**
 * Find a venue by Facebook URL
 */
export async function findVenueByFacebookUrl(facebookUrl: string): Promise<VenueData | null> {
  if (!facebookUrl) return null;

  const raw = String(facebookUrl).trim();
  if (!raw) return null;

  const variants = new Set<string>();
  variants.add(raw);
  variants.add(raw.replace(/^https?:\/\/m\./i, 'https://www.'));
  variants.add(raw.replace(/\/+$/, ''));
  variants.add(`${raw.replace(/\/+$/, '')}/`);

  const normalized = normalizeUrl(raw);
  if (normalized) {
    const normalizedNoSlash = normalized.replace(/\/+$/, '');
    const normalizedWithSlash = `${normalizedNoSlash}/`;

    variants.add(normalizedNoSlash);
    variants.add(normalizedWithSlash);

    variants.add(`https://${normalizedNoSlash}`);
    variants.add(`http://${normalizedNoSlash}`);
    variants.add(`https://www.${normalizedNoSlash}`);
    variants.add(`http://www.${normalizedNoSlash}`);

    variants.add(`https://${normalizedWithSlash}`);
    variants.add(`http://${normalizedWithSlash}`);
    variants.add(`https://www.${normalizedWithSlash}`);
    variants.add(`http://www.${normalizedWithSlash}`);
  }

  for (const variant of variants) {
    let snapshot = await db.collection(COLLECTIONS.VENUES)
      .where('facebookUrl', '==', variant)
      .limit(1)
      .get();
    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      return hydrateVenueNameFallback({ id: doc.id, ...doc.data() } as VenueData);
    }

    snapshot = await db.collection(COLLECTIONS.VENUES)
      .where('pageurl', '==', variant)
      .limit(1)
      .get();
    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      return hydrateVenueNameFallback({ id: doc.id, ...doc.data() } as VenueData);
    }
  }

  // Fallback by page slug so URL formatting differences
  // (trailing slash, protocol, etc.) do not block linking.
  const slug = extractFacebookSlug(raw);
  if (slug) {
    let snapshot = await db.collection(COLLECTIONS.VENUES)
      .where('facebookSlug', '==', slug)
      .limit(1)
      .get();
    if (snapshot.empty) {
      snapshot = await db.collection(COLLECTIONS.VENUES)
        .where('pagenameSlug', '==', slug)
        .limit(1)
        .get();
    }
    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      return hydrateVenueNameFallback({ id: doc.id, ...doc.data() } as VenueData);
    }
  }

  return null;
}

/**
 * Find a venue by Google Place ID.
 */
export async function findVenueByGooglePlaceId(placeId: string): Promise<VenueData | null> {
  const raw = String(placeId || '').trim();
  if (!raw) return null;

  const variants = new Set<string>([
    raw,
    raw.replace(/^place_id:/i, '').trim(),
  ]);

  const fields = [
    'placeId',
    'placeid',
    'googlePlaceId',
    'placeDetailsParsed.place_id',
  ];

  for (const value of variants) {
    if (!value) continue;
    for (const field of fields) {
      const snapshot = await db.collection(COLLECTIONS.VENUES)
        .where(field, '==', value)
        .limit(1)
        .get();
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        return hydrateVenueNameFallback({ id: doc.id, ...doc.data() } as VenueData);
      }
    }
  }

  return null;
}

/**
 * Find a venue by normalized name
 */
export async function findVenueByName(name: string): Promise<VenueData | null> {
  const normalizedName = normalizeVenueName(name);
  if (!normalizedName) return null;

  let snapshot = await db.collection(COLLECTIONS.VENUES)
    .where('normalizedName', '==', normalizedName)
    .limit(1)
    .get();

  if (snapshot.empty) {
    snapshot = await db.collection(COLLECTIONS.VENUES)
      .where('pagenameNormalized', '==', normalizedName)
      .limit(1)
      .get();
  }

  if (snapshot.empty) {
    snapshot = await db.collection(COLLECTIONS.VENUES)
      .where('aliasesNormalized', 'array-contains', normalizedName)
      .limit(1)
      .get();
  }

  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return hydrateVenueNameFallback({ id: doc.id, ...doc.data() } as VenueData);
}

const ADDRESS_CIVIC_REGEX =
  /\b\d{1,6}\s+[A-Za-z0-9][A-Za-z0-9'.#-]*(?:\s+[A-Za-z0-9][A-Za-z0-9'.#-]*){0,7}\s(?:street|st|road|rd|avenue|ave|drive|dr|lane|ln|boulevard|blvd|court|ct|way|highway|hwy|route|rte|place|pl|terrace|ter)\b/i;

function extractCivicAddress(value?: string): string {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const match = raw.match(ADDRESS_CIVIC_REGEX);
  return String(match?.[0] || raw.split(',')[0] || '').replace(/[;:.]+$/g, '').trim();
}

function normalizeStreetTypeTokens(value: string): string {
  return String(value || '')
    .replace(/\bstreet\b/g, 'st')
    .replace(/\broad\b/g, 'rd')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\blane\b/g, 'ln')
    .replace(/\bboulevard\b/g, 'blvd')
    .replace(/\bcourt\b/g, 'ct')
    .replace(/\bhighway\b/g, 'hwy')
    .replace(/\broute\b/g, 'rte')
    .replace(/\bplace\b/g, 'pl')
    .replace(/\bterrace\b/g, 'ter');
}

function normalizeAddressCivic(value?: string): string {
  const civic = normalizeVenueName(extractCivicAddress(value));
  if (!civic) return '';
  return normalizeStreetTypeTokens(civic)
    .replace(/\b(unit|suite|ste|apt|floor)\s*[a-z0-9-]+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPostalCode(value?: string): string {
  const normalized = String(value || '').toUpperCase();
  const match = normalized.match(/\b([A-Z]\d[A-Z])\s?(\d[A-Z]\d)\b/);
  return match ? `${match[1]}${match[2]}`.toLowerCase() : '';
}

function parseAddressCityProvince(value?: string): { city?: string; province?: string } {
  const raw = String(value || '').trim();
  if (!raw) return {};
  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  const firstNonCivic = parts.slice(1).find((part) => {
    const normalized = normalizeVenueName(part);
    return Boolean(normalized) && normalized !== 'canada' && !/\b[a-z]\d[a-z]\s?\d[a-z]\d\b/i.test(part);
  });
  const city = firstNonCivic
    ? firstNonCivic.replace(/\b(PEI?|NS|NB|NL|ON|QC|AB|BC|SK|MB)\b.*$/i, '').trim()
    : undefined;

  let province = '';
  for (const part of parts) {
    const match = part.match(/\b(PEI?|NS|NB|NL|ON|QC|AB|BC|SK|MB)\b/i);
    if (match) {
      province = normalizeProvinceToken(match[1]) || '';
      break;
    }
  }

  return {
    city: city || undefined,
    province: province || undefined,
  };
}

function normalizeAddressExactKey(value?: string): string {
  const civic = normalizeAddressCivic(value);
  const postal = extractPostalCode(value);
  if (civic && postal) return `${civic}|${postal}`;
  return '';
}

function normalizeAddressLooseKey(value?: string): string {
  const civic = normalizeAddressCivic(value);
  if (!civic) return '';
  const hints = parseAddressCityProvince(value);
  const city = normalizeVenueName(hints.city || '');
  const province = normalizeVenueName(hints.province || '');
  if (!city && !province) return '';
  return [civic, city, province].filter(Boolean).join('|');
}

function venueAddressMatchesHints(venue: VenueData, address: string): boolean {
  const inputHints = parseAddressCityProvince(address);
  const venueHints = parseAddressCityProvince(venue.address || '');
  const inputCity = normalizeVenueName(inputHints.city || '');
  const inputProvince = normalizeProvinceToken(inputHints.province || '');
  const explicitVenueCity = String(venue.city || '').trim();
  const venueCity = normalizeVenueName(
    explicitVenueCity && !/^canada$/i.test(explicitVenueCity)
      ? explicitVenueCity
      : String(venueHints.city || '').trim()
  );
  const venueProvince = normalizeProvinceToken(String((venue as unknown as Record<string, unknown>).province || venueHints.province || '').trim());

  if (inputCity && venueCity && inputCity !== venueCity) return false;
  if (inputProvince && venueProvince && inputProvince !== venueProvince) return false;
  return true;
}

function pickUniqueAddressMatch(
  matches: VenueData[],
  address: string,
  matchType: 'exact' | 'fuzzy',
  similarity: number
): MatchInfo {
  if (matches.length === 1) {
    return {
      isMatch: true,
      matchType,
      similarity,
      matchedVenue: matches[0],
    };
  }

  if (matches.length > 1) {
    logger.info('Skipped venue address match due to ambiguity', {
      address,
      matchType,
      candidateCount: matches.length,
      candidateVenueIds: matches.map((venue) => venue.id).filter(Boolean),
    });
  }

  return {
    isMatch: false,
    matchType: 'none',
    similarity: 0,
  };
}

export async function findVenueByAddress(address: string): Promise<MatchInfo> {
  const normalizedAddress = String(address || '').trim();
  if (!normalizedAddress) {
    return {
      isMatch: false,
      matchType: 'none',
      similarity: 0,
    };
  }

  const venues = await getAllVenues();
  const targetExactKey = normalizeAddressExactKey(normalizedAddress);
  if (targetExactKey) {
    const exactMatches = venues.filter((venue) => (
      normalizeAddressExactKey(venue.address || '') === targetExactKey &&
      venueAddressMatchesHints(venue, normalizedAddress)
    ));
    const exact = pickUniqueAddressMatch(exactMatches, normalizedAddress, 'exact', 0.99);
    if (exact.isMatch) return exact;
  }

  const targetLooseKey = normalizeAddressLooseKey(normalizedAddress);
  if (targetLooseKey) {
    const looseMatches = venues.filter((venue) => (
      normalizeAddressLooseKey(venue.address || '') === targetLooseKey &&
      venueAddressMatchesHints(venue, normalizedAddress)
    ));
    return pickUniqueAddressMatch(looseMatches, normalizedAddress, 'fuzzy', 0.93);
  }

  return {
    isMatch: false,
    matchType: 'none',
    similarity: 0,
  };
}

/**
 * Find the best matching venue using fuzzy matching
 */
export async function findMatchingVenue(
  name: string,
  facebookUrl?: string
): Promise<MatchInfo> {
  // Try exact Facebook URL match first
  if (facebookUrl) {
    const urlMatch = await findVenueByFacebookUrl(facebookUrl);
    if (urlMatch) {
      return {
        isMatch: true,
        matchType: 'exact',
        similarity: 1.0,
        matchedVenue: urlMatch,
      };
    }

    // Try Facebook slug match
    const slug = extractFacebookSlug(facebookUrl);
    if (slug) {
      let snapshot = await db.collection(COLLECTIONS.VENUES)
        .where('facebookSlug', '==', slug)
        .limit(1)
        .get();

      if (snapshot.empty) {
        snapshot = await db.collection(COLLECTIONS.VENUES)
          .where('pagenameSlug', '==', slug)
          .limit(1)
          .get();
      }

      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        return {
          isMatch: true,
          matchType: 'exact',
          similarity: 1.0,
          matchedVenue: hydrateVenueNameFallback({ id: doc.id, ...doc.data() } as VenueData),
        };
      }
    }
  }

  // Try exact name match (with alias/city variants)
  const { variants, cityHint, regionHint } = getVenueNameVariants(name);
  for (const variant of variants) {
    const exactMatch = await findVenueByName(variant);
    if (exactMatch) {
      return {
        isMatch: true,
        matchType: 'exact',
        similarity: 1.0,
        matchedVenue: exactMatch,
      };
    }
  }

  const venues = await getAllVenues();

  if (facebookUrl) {
    const normalizedUrl = normalizeUrl(facebookUrl);
    if (normalizedUrl) {
      const urlMatch = venues.find(venue => {
        const venueUrl = (venue as unknown as Record<string, unknown>).facebookUrl
          || (venue as unknown as Record<string, unknown>).pageurl
          || '';
        return normalizeUrl(String(venueUrl)) === normalizedUrl;
      });
      if (urlMatch) {
        return {
          isMatch: true,
          matchType: 'exact',
          similarity: 1.0,
          matchedVenue: urlMatch,
        };
      }
    }
  }

  // Fuzzy match against all venues
  let bestMatch: VenueData | null = null;
  let bestSimilarity = 0;

  const candidateNames = variants.length > 0 ? variants : [name];

  for (const venue of venues) {
    // Get all possible names for this venue
    const venueNames = getVenueMatchNames(venue);
    if (venueNames.length === 0) continue;

    for (const candidate of candidateNames) {
      for (const venueName of venueNames) {
        let similarity = calculateEnhancedSimilarity(candidate, venueName);
        const cityHintMatch = Boolean(cityHint && venueMatchesCityHint(venue, cityHint, regionHint));
        if (cityHintMatch) {
          similarity = Math.min(1, similarity + 0.03);
        }

        const tokenEvidence = computeTokenOverlapEvidence(candidate, venueName);
        const hasPerfectShortNameTokenContainment =
          tokenEvidence.minTokenCount >= 2 &&
          tokenEvidence.overlapRatio >= 0.999;
        const tokenScoreThreshold = cityHintMatch
          ? 0.84
          : (hasPerfectShortNameTokenContainment ? 0.84 : 0.88);
        const minSimilarityForTokenFallback = cityHintMatch ? 0.42 : 0.48;
        const tokenFallbackMatch = (
          tokenEvidence.overlapCount >= 2
          && tokenEvidence.meaningfulOverlapCount >= 1
          && tokenEvidence.score >= tokenScoreThreshold
          && similarity >= minSimilarityForTokenFallback
        );

        const passThreshold = similarity >= 0.85 || tokenFallbackMatch;
        if (!passThreshold) continue;

        let effectiveSimilarity = similarity;
        if (tokenFallbackMatch && similarity < 0.85) {
          const tokenConfidenceBoost = Math.min(
            0.10,
            Math.max(0, (tokenEvidence.score - tokenScoreThreshold) * 0.4)
              + Math.min(0.04, tokenEvidence.meaningfulOverlapCount * 0.02)
          );
          effectiveSimilarity = Math.max(similarity, 0.85 + tokenConfidenceBoost);
        }

        if (effectiveSimilarity > bestSimilarity) {
          bestSimilarity = effectiveSimilarity;
          bestMatch = venue;
        }
      }
    }
  }

  if (bestMatch) {
    return {
      isMatch: true,
      matchType: 'fuzzy',
      similarity: bestSimilarity,
      matchedVenue: bestMatch,
    };
  }

  return {
    isMatch: false,
    matchType: 'none',
    similarity: 0,
  };
}

/**
 * Create or update a venue
 */
export async function upsertVenue(venue: Partial<VenueData>): Promise<string> {
  const normalizedName = normalizeVenueName(venue.name || '');
  const slug = venue.facebookUrl ? extractFacebookSlug(venue.facebookUrl) : null;

  const data = {
    ...venue,
    normalizedName,
    facebookSlug: slug,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (venue.id) {
    await db.collection(COLLECTIONS.VENUES).doc(venue.id).set(data, { merge: true });
    return venue.id;
  }

  // Create new venue
  (data as Record<string, unknown>).createdAt = admin.firestore.FieldValue.serverTimestamp();
  const docRef = await db.collection(COLLECTIONS.VENUES).add(data);
  return docRef.id;
}

/**
 * Cache operating hours from Google Places onto an existing venue doc.
 * Uses a dedicated timestamp so we can enforce a minimum cache TTL.
 */
export async function updateVenueOperatingHours(
  venueId: string,
  operatingHours: OperatingHours,
  googlePlaceId?: string,
  coordinates?: { latitude: number; longitude: number }
): Promise<void> {
  if (!venueId) return;

  const update: Record<string, unknown> = {
    operatingHours,
    operatingHoursUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (googlePlaceId) {
    update.googlePlaceId = googlePlaceId;
  }

  if (
    coordinates &&
    Number.isFinite(Number(coordinates.latitude)) &&
    Number.isFinite(Number(coordinates.longitude))
  ) {
    const latitude = Number(coordinates.latitude);
    const longitude = Number(coordinates.longitude);
    update.latitude = latitude;
    update.longitude = longitude;
    update.coordinates = { latitude, longitude };
  }

  await db.collection(COLLECTIONS.VENUES).doc(venueId).set(update, { merge: true });
}

/**
 * Update canonical profile image for a venue.
 * This is the single source of truth used for event icon assignment.
 */
export async function updateVenueProfileImage(
  venueId: string,
  profileImage: string,
  options?: {
    sourceSignature?: string;
  }
): Promise<void> {
  const normalizedVenueId = String(venueId || '').trim();
  const normalizedImage = String(profileImage || '').trim();
  if (!normalizedVenueId || !normalizedImage) return;

  const normalizedSourceSignature = String(options?.sourceSignature || '').trim();
  const updatePayload: Record<string, unknown> = {
    profileImage: normalizedImage,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (normalizedSourceSignature) {
    updatePayload.profileImageSourceSignature = normalizedSourceSignature;
  }

  await db.collection(COLLECTIONS.VENUES).doc(normalizedVenueId).set(
    updatePayload,
    { merge: true }
  );
}

// ===================
// Event Operations
// ===================

/**
 * Get events for a venue
 */
export async function getVenueEvents(
  venueId: string,
  options?: {
    startDate?: string;
    endDate?: string;
    limit?: number;
  }
): Promise<EventData[]> {
  let query: admin.firestore.Query = db
    .collection(COLLECTIONS.VENUES)
    .doc(venueId)
    .collection(COLLECTIONS.EVENTS);

  if (options?.startDate) {
    query = query.where('startDate', '>=', options.startDate);
  }
  if (options?.endDate) {
    query = query.where('startDate', '<=', options.endDate);
  }

  query = query.orderBy('startDate', 'asc');

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const snapshot = await query.get();
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as EventData[];
}

function extractMediaFallbackTokens(text: string): string[] {
  const normalized = normalizeVenueName(String(text || ''));
  if (!normalized) return [];
  return Array.from(
    new Set(
      normalized
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 4 && !MEDIA_FALLBACK_TOKEN_BLOCKLIST.has(token))
    )
  );
}

function collectManagedEventMediaUrls(event: Partial<EventData>): string[] {
  const urls = new Set<string>();
  const pushIfManaged = (value: unknown) => {
    const normalized = String(value || '').trim();
    if (normalized && isManagedImageUrl(normalized)) {
      urls.add(normalized);
    }
  };

  pushIfManaged(event.relevantImageUrl);
  pushIfManaged((event as EventData).image);
  pushIfManaged(event.imageUrl);

  if (Array.isArray(event.mediaUrls)) {
    for (const value of event.mediaUrls) {
      pushIfManaged(value);
    }
  }

  return Array.from(urls);
}

export async function findVenueManagedMediaFallbacks(
  venueId: string,
  combinedText: string,
  options: { limit?: number; facebookUrl?: string } = {}
): Promise<string[]> {
  const normalizedVenueId = String(venueId || '').trim();
  if (!normalizedVenueId) return [];

  const targetTokens = extractMediaFallbackTokens(combinedText);
  if (targetTokens.length === 0) return [];

  const maxUrlsRaw = Number(options.limit);
  const maxUrls = Number.isFinite(maxUrlsRaw) && maxUrlsRaw > 0 ? Math.floor(maxUrlsRaw) : 4;
  const targetFacebookSlug = extractFacebookSlug(String(options.facebookUrl || '').trim());

  const snapshot = await db
    .collection(COLLECTIONS.VENUES)
    .doc(normalizedVenueId)
    .collection(COLLECTIONS.EVENTS)
    .get();

  const candidates = snapshot.docs
    .map((doc) => {
      const data = doc.data() as EventData;
      const urls = collectManagedEventMediaUrls(data);
      if (urls.length === 0) return null;

      const docText = [
        String(data.name || ''),
        String(data.eventName || ''),
        String(data.description || ''),
        String(data.additionalLocation || ''),
      ].join(' ');
      const docTokens = new Set(extractMediaFallbackTokens(docText));
      const sharedTokenCount = targetTokens.filter((token) => docTokens.has(token)).length;
      if (sharedTokenCount === 0) return null;

      const docFacebookSlug = extractFacebookSlug(String(data.facebookUrl || '').trim());
      const facebookSlugBonus =
        targetFacebookSlug && docFacebookSlug && targetFacebookSlug === docFacebookSlug ? 25 : 0;

      return {
        path: doc.ref.path,
        urls,
        score: sharedTokenCount * 100 + facebookSlugBonus + urls.length,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const scoreDelta = (right!.score - left!.score);
      if (scoreDelta !== 0) return scoreDelta;
      return left!.path.localeCompare(right!.path);
    }) as Array<{ path: string; urls: string[]; score: number }>;

  const selected: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    for (const url of candidate.urls) {
      if (seen.has(url)) continue;
      seen.add(url);
      selected.push(url);
      if (selected.length >= maxUrls) {
        logger.debug('Recovered managed media fallback candidates', {
          venueId: normalizedVenueId,
          selectedCount: selected.length,
          candidateCount: candidates.length,
        });
        return selected;
      }
    }
  }

  if (selected.length > 0) {
    logger.debug('Recovered managed media fallback candidates', {
      venueId: normalizedVenueId,
      selectedCount: selected.length,
      candidateCount: candidates.length,
    });
  }

  return selected;
}

function extractUniqueIdRoot(value: unknown): string {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  const separatorIndex = normalized.lastIndexOf('_');
  if (separatorIndex <= 0) return normalized;
  const suffix = normalized.slice(separatorIndex + 1);
  if (!/^\d+$/.test(suffix)) return normalized;
  return normalized.slice(0, separatorIndex);
}

export function shouldSkipSiblingUniqueIdDuplicateCheck(
  incoming: EventData,
  existing: EventData
): boolean {
  const incomingUniqueId = String(incoming.uniqueId || '').trim();
  const existingUniqueId = String(existing.uniqueId || '').trim();
  if (!incomingUniqueId || !existingUniqueId || incomingUniqueId === existingUniqueId) {
    return false;
  }

  const incomingRoot = extractUniqueIdRoot(incomingUniqueId);
  const existingRoot = extractUniqueIdRoot(existingUniqueId);
  if (!incomingRoot || incomingRoot !== existingRoot) return false;

  const incomingStartDate = String(incoming.startDate || '').trim();
  const existingStartDate = String(existing.startDate || '').trim();
  if (!incomingStartDate || incomingStartDate !== existingStartDate) return false;

  const incomingStartTime = String(incoming.startTime || '').trim();
  const existingStartTime = String(existing.startTime || '').trim();
  if (incomingStartTime && existingStartTime && incomingStartTime !== existingStartTime) {
    if (isDuplicateEntry(incoming, existing, { requireEstablishmentMatch: false })) {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Find a venue-scoped event by its exact source unique id.
 */
export async function findVenueEventByUniqueId(
  venueId: string,
  uniqueId: string
): Promise<EventData | null> {
  const normalizedVenueId = String(venueId || '').trim();
  const normalizedUniqueId = String(uniqueId || '').trim();
  if (!normalizedVenueId || !normalizedUniqueId) return null;

  const snapshot = await db
    .collection(COLLECTIONS.VENUES)
    .doc(normalizedVenueId)
    .collection(COLLECTIONS.EVENTS)
    .where('uniqueId', '==', normalizedUniqueId)
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return {
    id: doc.id,
    venueId: normalizedVenueId,
    ...(doc.data() as EventData),
  };
}

/**
 * Find a city-level Facebook event review by its exact source unique id.
 */
export async function findCityLevelEventReviewByUniqueId(
  uniqueId: string
): Promise<CityLevelEventReviewRecord | null> {
  const normalizedUniqueId = String(uniqueId || '').trim();
  if (!normalizedUniqueId) return null;

  const snapshot = await db
    .collection(COLLECTIONS.CITY_LEVEL_EVENT_REVIEWS)
    .where('uniqueId', '==', normalizedUniqueId)
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return {
    id: doc.id,
    ...(doc.data() as CityLevelEventReviewRecord),
  };
}

/**
 * Check if an event is a duplicate
 */
export async function checkDuplicate(
  event: EventData,
  venueId: string,
  currentRunEntries: EventData[] = []
): Promise<{ isDuplicate: boolean; existingEvent?: EventData }> {
  const normalizedUniqueId = String(event.uniqueId || '').trim();

  if (normalizedUniqueId) {
    const exactCurrentRunMatches = currentRunEntries.filter((existing) => {
      const sameVenue = String(existing.venueId || '').trim() === String(venueId || '').trim();
      if (!sameVenue) return false;
      return String(existing.uniqueId || '').trim() === normalizedUniqueId;
    });

    const compatibleCurrentRunMatch = pickCompatibleExactUniqueIdMatch(event, exactCurrentRunMatches, {
      venueId,
    });
    if (compatibleCurrentRunMatch) {
      return { isDuplicate: true, existingEvent: compatibleCurrentRunMatch };
    }

    const exactUniqueIdSnapshot = await db
      .collection(COLLECTIONS.VENUES)
      .doc(venueId)
      .collection(COLLECTIONS.EVENTS)
      .where('uniqueId', '==', normalizedUniqueId)
      .get();

    if (!exactUniqueIdSnapshot.empty) {
      const exactMatches = exactUniqueIdSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as EventData),
      }));
      const compatibleExactMatch = pickCompatibleExactUniqueIdMatch(event, exactMatches, { venueId });
      if (compatibleExactMatch) {
        return {
          isDuplicate: true,
          existingEvent: compatibleExactMatch,
        };
      }

      logger.warn('Exact uniqueId collision is incompatible; skipping duplicate event create', {
        venueId,
        uniqueId: normalizedUniqueId,
        incomingTitle: event.eventName || event.name || '',
        incomingStartDate: event.startDate || '',
        existingCandidates: exactMatches.map((candidate) => ({
          eventId: candidate.id || '',
          title: candidate.eventName || candidate.name || '',
          startDate: candidate.startDate || '',
          startTime: candidate.startTime || '',
        })),
      });
      return {
        isDuplicate: true,
      };
    }
  }

  // Check against current run entries first
  for (const existing of currentRunEntries) {
    const sameVenue = String(existing.venueId || '').trim() === String(venueId || '').trim();
    if (sameVenue && shouldSkipSiblingUniqueIdDuplicateCheck(event, existing)) {
      continue;
    }
    if (isDuplicateEntry(event, existing, { requireEstablishmentMatch: !sameVenue })) {
      return { isDuplicate: true, existingEvent: existing };
    }
  }

  // Check against Firestore events for this venue
  const existingEvents = await getVenueEvents(venueId, {
    startDate: event.startDate,
    endDate: event.startDate,
  });

  for (const existing of existingEvents) {
    if (shouldSkipSiblingUniqueIdDuplicateCheck(event, existing)) {
      continue;
    }
    if (isDuplicateEntry(event, existing, { requireEstablishmentMatch: false })) {
      return { isDuplicate: true, existingEvent: existing };
    }
  }

  const currentRunRecurringFallbackMatch = pickRecurringFamilyFallbackMatch(
    event,
    currentRunEntries,
    {
      venueId,
    }
  );
  if (currentRunRecurringFallbackMatch) {
    logger.info('Recurring-family fallback matched current-run keeper', {
      venueId,
      incomingUniqueId: event.uniqueId,
      incomingTitle: event.eventName || event.name,
      incomingStartDate: event.startDate,
      existingUniqueId: currentRunRecurringFallbackMatch.uniqueId,
      existingTitle: currentRunRecurringFallbackMatch.eventName || currentRunRecurringFallbackMatch.name,
      existingStartDate: currentRunRecurringFallbackMatch.startDate,
      existingEventId: currentRunRecurringFallbackMatch.id,
    });
    return { isDuplicate: true, existingEvent: currentRunRecurringFallbackMatch };
  }

  const fallbackAnchorDate = parseDateOnlyValue(event.startDate);
  const fallbackWindowStart = fallbackAnchorDate ? addDaysToIsoDate(fallbackAnchorDate, -120) : null;
  const fallbackWindowEnd = fallbackAnchorDate ? addDaysToIsoDate(fallbackAnchorDate, 21) : null;
  if (fallbackWindowStart && fallbackWindowEnd) {
    const recurringFallbackCandidates = await getVenueEvents(venueId, {
      startDate: fallbackWindowStart,
      endDate: fallbackWindowEnd,
      limit: 250,
    });

    const recurringFallbackMatch = pickRecurringFamilyFallbackMatch(event, recurringFallbackCandidates, {
      venueId,
    });
    if (recurringFallbackMatch) {
      logger.info('Recurring-family fallback matched Firestore keeper', {
        venueId,
        incomingUniqueId: event.uniqueId,
        incomingTitle: event.eventName || event.name,
        incomingStartDate: event.startDate,
        existingUniqueId: recurringFallbackMatch.uniqueId,
        existingTitle: recurringFallbackMatch.eventName || recurringFallbackMatch.name,
        existingStartDate: recurringFallbackMatch.startDate,
        existingEventId: recurringFallbackMatch.id,
      });
      return {
        isDuplicate: true,
        existingEvent: recurringFallbackMatch,
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * Create a new event
 */
export async function createEvent(
  venueId: string,
  event: Omit<EventData, 'id' | 'createdAt' | 'venueId'>
): Promise<string> {
  const normalizedMediaUrls = Array.isArray(event.mediaUrls)
    ? event.mediaUrls
        .map((url) => String(url || '').trim())
        .filter((url) => url.length > 0)
    : [];
  const preferredMediaUrl =
    normalizedMediaUrls.find((url) => isManagedImageUrl(url)) ||
    normalizedMediaUrls[0] ||
    undefined;
  const resolvedImage = String(event.image || event.imageUrl || '').trim() || preferredMediaUrl;
  const resolvedRelevantImage =
    String(event.relevantImageUrl || '').trim() || resolvedImage || preferredMediaUrl;
  const resolvedImageUrl = String(event.imageUrl || '').trim() || resolvedImage || preferredMediaUrl;

  const data = normalizeRecurringBaseWritePayload({
    ...event,
    imageUrl: resolvedImageUrl,
    image: resolvedImage,
    relevantImageUrl: resolvedRelevantImage,
    mediaUrls: normalizedMediaUrls,
    venueId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const docRef = await db
    .collection(COLLECTIONS.VENUES)
    .doc(venueId)
    .collection(COLLECTIONS.EVENTS)
    .add(data);

  logger.debug('Created event', { venueId, eventId: docRef.id, eventType: event.eventType });
  return docRef.id;
}

/**
 * Update an existing event
 */
export async function updateEvent(
  venueId: string,
  eventId: string,
  updates: Partial<EventData>
): Promise<void> {
  const data = normalizeRecurringBaseWritePayload({
    ...updates,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db
    .collection(COLLECTIONS.VENUES)
    .doc(venueId)
    .collection(COLLECTIONS.EVENTS)
    .doc(eventId)
    .update(data);

  logger.debug('Updated event', { venueId, eventId });
}

interface EventUpdateAuditInput {
  fileId?: string;
  fileName?: string;
  runId?: string;
  batchNumber?: number;
  rowIndex: number;
  parserMode: 'legacy' | 'full5stage';
  venueId: string;
  venueName?: string;
  eventId: string;
  changedFields: string[];
  descriptionImproved?: boolean;
  timeImproved?: boolean;
  beforeEvent: EventData;
  incomingEvent: EventData;
  afterEvent: EventData;
  updatePayload: Partial<EventData>;
  row?: RawRowData;
}

/**
 * Persist a compact audit record for duplicate-event enrichment updates.
 */
export async function recordEventUpdateAudit(input: EventUpdateAuditInput): Promise<string | undefined> {
  const changedFields = input.changedFields
    .map((field) => String(field || '').trim())
    .filter(Boolean);

  if (!input.venueId || !input.eventId || changedFields.length === 0) {
    return undefined;
  }

  const before = buildEventUpdateAuditSnapshot(input.beforeEvent, changedFields);
  const incoming = buildEventUpdateAuditSnapshot(input.incomingEvent, changedFields);
  const after = buildEventUpdateAuditSnapshot(input.afterEvent, changedFields);
  const updatePayload = buildEventUpdateAuditSnapshot(
    input.updatePayload as Partial<EventData>,
    changedFields,
    false
  );
  const row = buildRowUpdateAuditSnapshot(input.row);
  const originalPostUrl = firstMeaningfulString(
    input.incomingEvent.facebookUrl,
    input.row?.facebookUrl,
    input.row?.topLevelUrl
  );
  const eventName = firstMeaningfulString(
    input.afterEvent.eventName,
    input.afterEvent.name,
    input.incomingEvent.eventName,
    input.incomingEvent.name,
    input.beforeEvent.eventName,
    input.beforeEvent.name
  );

  const payload = compactRecord({
    fileId: input.fileId,
    fileName: input.fileName,
    runId: input.runId,
    batchNumber: input.batchNumber,
    rowIndex: input.rowIndex,
    parserMode: input.parserMode,
    venueId: input.venueId,
    venueName: input.venueName,
    eventId: input.eventId,
    eventPath: `${COLLECTIONS.VENUES}/${input.venueId}/${COLLECTIONS.EVENTS}/${input.eventId}`,
    eventName,
    originalPostUrl,
    facebookUrl: originalPostUrl,
    topLevelUrl: firstMeaningfulString(input.row?.topLevelUrl),
    sourceScraperType: firstMeaningfulString(
      input.incomingEvent.sourceScraperType,
      input.row?.sourceScraperType
    ),
    uniqueId: firstMeaningfulString(input.incomingEvent.uniqueId, input.row?.uniqueId),
    changedFields,
    descriptionImproved: input.descriptionImproved,
    timeImproved: input.timeImproved,
    updatePayload,
    before,
    incoming,
    after,
    row,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const docRef = await db.collection(COLLECTIONS.EVENT_UPDATE_AUDITS).add(payload);
  logger.debug('Recorded event update audit', {
    auditId: docRef.id,
    fileId: input.fileId,
    runId: input.runId,
    rowIndex: input.rowIndex,
    venueId: input.venueId,
    eventId: input.eventId,
    changedFields,
  });
  return docRef.id;
}

function buildEventUpdateAuditSnapshot(
  event: Partial<EventData> | undefined,
  changedFields: string[],
  includeBaseFields = true
): Record<string, unknown> {
  if (!event) return {};

  const fields = new Set<string>(includeBaseFields ? EVENT_UPDATE_AUDIT_BASE_FIELDS : []);
  for (const field of changedFields) fields.add(field);

  const snapshot: Record<string, unknown> = {};
  const record = event as Record<string, unknown>;
  for (const field of fields) {
    const sanitized = sanitizeAuditValue(record[field]);
    if (sanitized !== undefined) {
      snapshot[field] = sanitized;
    }
  }

  const mediaUrls = Array.isArray(record.mediaUrls)
    ? record.mediaUrls.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  if (mediaUrls.length > 0) {
    snapshot.mediaUrlCount = mediaUrls.length;
    snapshot.primaryMediaUrl = mediaUrls[0];
  }

  return snapshot;
}

function buildRowUpdateAuditSnapshot(row?: RawRowData): Record<string, unknown> | undefined {
  if (!row) return undefined;

  const mediaUrls = Array.isArray(row.mediaUrls)
    ? row.mediaUrls.map((url) => String(url || '').trim()).filter(Boolean)
    : [];

  return compactRecord({
    uniqueId: row.uniqueId,
    userName: row.userName,
    pageName: row.pageName,
    timestamp: row.timestamp,
    facebookUrl: row.facebookUrl,
    topLevelUrl: row.topLevelUrl,
    sourceScraperType: row.sourceScraperType,
    address: row.address,
    facebookEventLocationName: row.facebookEventLocationName,
    facebookEventLocationIsCityLevel: row.facebookEventLocationIsCityLevel,
    facebookEventOrganizerName: row.facebookEventOrganizerName,
    ticketsBuyUrl: row.ticketsBuyUrl,
    externalLinks: sanitizeAuditValue(row.externalLinks),
    mediaUrls: sanitizeAuditValue(mediaUrls),
    mediaUrlCount: mediaUrls.length || undefined,
    usersResponded: row.usersResponded,
    usersGoing: row.usersGoing,
    usersInterested: row.usersInterested,
    facebookUsersResponded: row.facebookUsersResponded,
    likes: row.likes,
    shares: row.shares,
    comments: row.comments,
    topReactionsCount: row.topReactionsCount,
    textPreview: trimAuditText(row.text),
    sharedPostTextPreview: trimAuditText(row.sharedPostText),
    ocrTextPreview: trimAuditText(row.ocrText),
  });
}

function sanitizeAuditValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string') return trimAuditText(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) {
    return value
      .slice(0, EVENT_UPDATE_AUDIT_ARRAY_LIMIT)
      .map((entry) => sanitizeAuditValue(entry))
      .filter((entry) => entry !== undefined);
  }
  if (typeof value === 'object') {
    if (
      'toDate' in (value as Record<string, unknown>) &&
      typeof (value as { toDate?: unknown }).toDate === 'function'
    ) {
      try {
        return (value as { toDate: () => Date }).toDate().toISOString();
      } catch {
        return undefined;
      }
    }

    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const sanitized = sanitizeAuditValue(entry);
      if (sanitized !== undefined) {
        output[key] = sanitized;
      }
    }
    return Object.keys(output).length > 0 ? output : undefined;
  }
  return String(value);
}

function trimAuditText(value: unknown): string | undefined {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  if (text.length <= EVENT_UPDATE_AUDIT_TEXT_LIMIT) return text;
  return `${text.slice(0, EVENT_UPDATE_AUDIT_TEXT_LIMIT - 3).trimEnd()}...`;
}

function firstMeaningfulString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const text = typeof value === 'string' ? value.trim() : String(value || '').trim();
    if (text) return text;
  }
  return undefined;
}

function parseDateOnlyValue(value: unknown): string | null {
  if (!value) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const directMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (directMatch) return directMatch[1];

    const parsedFromString = new Date(trimmed);
    if (!Number.isNaN(parsedFromString.getTime())) {
      return parsedFromString.toISOString().slice(0, 10);
    }
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }

  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate().toISOString().slice(0, 10);
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in (value as Record<string, unknown>) &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    try {
      const parsed = (value as { toDate: () => Date }).toDate();
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
      }
    } catch {
      return null;
    }
  }

  return null;
}

function parseBooleanLike(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  if (['true', 'yes', 'y', '1'].includes(normalized)) return true;
  if (['false', 'no', 'n', '0'].includes(normalized)) return false;
  return null;
}

function parsePositiveInteger(value: unknown): number | null {
  if (value == null) return null;
  const parsed =
    typeof value === 'number' ? value : Number(String(value).trim().replace(/,/g, ''));
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : null;
}

function isIsoDateValue(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function addDaysToIsoDate(isoDate: string, days: number): string | null {
  if (!isIsoDateValue(isoDate)) return null;
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + Math.trunc(days));
  return date.toISOString().slice(0, 10);
}

function getDifferenceInDays(fromIsoDate: string, toIsoDate: string): number | null {
  if (!isIsoDateValue(fromIsoDate) || !isIsoDateValue(toIsoDate)) return null;
  const from = new Date(`${fromIsoDate}T00:00:00.000Z`);
  const to = new Date(`${toIsoDate}T00:00:00.000Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function getNthMonthlyOccurrenceDate(startDate: string, totalOccurrences: number): string | null {
  if (!isIsoDateValue(startDate)) return null;
  if (totalOccurrences <= 1) return startDate;

  const start = new Date(`${startDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return null;

  const targetDay = start.getUTCDate();
  const startYear = start.getUTCFullYear();
  const startMonth = start.getUTCMonth();
  let found = 1;

  for (let monthOffset = 1; monthOffset < totalOccurrences * 15; monthOffset += 1) {
    const monthIndex = startMonth + monthOffset;
    const year = startYear + Math.floor(monthIndex / 12);
    const month = ((monthIndex % 12) + 12) % 12;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    if (targetDay > lastDay) {
      continue;
    }

    found += 1;
    if (found === totalOccurrences) {
      return new Date(Date.UTC(year, month, targetDay)).toISOString().slice(0, 10);
    }
  }

  return null;
}

function getEventMetadataRecord(eventData: Record<string, unknown>): Record<string, unknown> {
  const metadata = eventData.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  return metadata as Record<string, unknown>;
}

function getLifecycleFieldValue(
  eventData: Record<string, unknown>,
  fieldCandidates: readonly string[]
): unknown {
  const metadata = getEventMetadataRecord(eventData);
  for (const field of fieldCandidates) {
    if (eventData[field] != null && String(eventData[field]).trim() !== '') {
      return eventData[field];
    }
    if (metadata[field] != null && String(metadata[field]).trim() !== '') {
      return metadata[field];
    }
  }
  return undefined;
}

function normalizeRecurringPattern(value: unknown): string {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[.,;:]+$/, '');
  if (normalized === 'weekly_multi' || normalized === 'weekly_sequence') {
    return 'weekly_custom';
  }
  return normalized;
}

function getRecurringPattern(eventData: Record<string, unknown>): string {
  const metadata = getEventMetadataRecord(eventData);
  const raw =
    eventData.recurringPattern ??
    eventData.recurrencePattern ??
    metadata.recurringPattern ??
    metadata.recurrencePattern;
  return normalizeRecurringPattern(raw);
}

type ResolvedRecurringRule = {
  kind: 'none' | 'daily' | 'monthly' | 'weekly_multi' | 'weekly_sequence';
  pattern: string;
  recurringDaysOfWeek: string[];
  recurringWeekdaySequence: string[];
  recurringWeekInterval: number;
};

const RECURRING_WEEKDAY_TOKEN_TO_CANONICAL: Record<string, string> = {
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

function normalizeRecurringWeekdayToken(value: unknown): string {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/s$/, '');
  return RECURRING_WEEKDAY_TOKEN_TO_CANONICAL[normalized] || '';
}

function normalizeRecurringWeekdayListValue(value: unknown): string[] {
  if (value == null) return [];

  let rawValues: unknown[] = [];
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

  return Array.from(
    new Set(
      rawValues
        .map((entry) => normalizeRecurringWeekdayToken(entry))
        .filter(Boolean)
    )
  );
}

function normalizeRecurringWeekIntervalValue(value: unknown): number {
  const parsed = parsePositiveInteger(value);
  return parsed && parsed > 0 ? parsed : 1;
}

function resolveRecurringRule(eventData: Record<string, unknown>): ResolvedRecurringRule {
  const recurringPattern = getRecurringPattern(eventData);
  const recurringDaysOfWeek = normalizeRecurringWeekdayListValue(
    getLifecycleFieldValue(eventData, ['recurringDaysOfWeek', 'recurrenceDaysOfWeek'] as const)
  );
  const recurringWeekdaySequence = normalizeRecurringWeekdayListValue(
    getLifecycleFieldValue(
      eventData,
      ['recurringWeekdaySequence', 'recurrenceWeekdaySequence'] as const
    )
  );
  const recurringWeekInterval = normalizeRecurringWeekIntervalValue(
    getLifecycleFieldValue(eventData, ['recurringWeekInterval', 'recurrenceWeekInterval'] as const)
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

  const weeklyMatch = recurringPattern.match(/^weekly_([a-z]+)$/);
  if (weeklyMatch) {
    const weekday = normalizeRecurringWeekdayToken(weeklyMatch[1]);
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

function isRecurringRuleActive(rule: ResolvedRecurringRule): boolean {
  return rule.kind !== 'none';
}

function getIsoWeekdayValue(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return '';
  return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][
    date.getUTCDay()
  ]!;
}

function isOccurrenceOnDate(
  baseStartDate: string,
  rule: ResolvedRecurringRule,
  occurrenceDate: string
): boolean {
  if (!isIsoDateValue(baseStartDate) || !isIsoDateValue(occurrenceDate)) return false;
  const diffDays = getDifferenceInDays(baseStartDate, occurrenceDate);
  if (diffDays === null || diffDays < 0) return false;

  if (rule.kind === 'daily') {
    return true;
  }

  if (rule.kind === 'monthly') {
    const base = new Date(`${baseStartDate}T00:00:00.000Z`);
    const occurrence = new Date(`${occurrenceDate}T00:00:00.000Z`);
    return (
      !Number.isNaN(base.getTime()) &&
      !Number.isNaN(occurrence.getTime()) &&
      base.getUTCDate() === occurrence.getUTCDate()
    );
  }

  const occurrenceWeekday = getIsoWeekdayValue(occurrenceDate);
  if (!occurrenceWeekday) return false;
  const weekIndex = Math.floor(diffDays / 7);

  if (rule.kind === 'weekly_sequence') {
    if (weekIndex % rule.recurringWeekInterval !== 0) return false;
    const sequenceIndex =
      Math.floor(weekIndex / rule.recurringWeekInterval) % rule.recurringWeekdaySequence.length;
    return rule.recurringWeekdaySequence[sequenceIndex] === occurrenceWeekday;
  }

  if (rule.kind === 'weekly_multi') {
    return (
      weekIndex % rule.recurringWeekInterval === 0 &&
      rule.recurringDaysOfWeek.includes(occurrenceWeekday)
    );
  }

  return false;
}

function getNthRecurringOccurrenceDate(
  startDate: string,
  rule: ResolvedRecurringRule,
  totalOccurrences: number
): string | null {
  if (!isIsoDateValue(startDate) || totalOccurrences <= 0) return null;

  if (rule.kind === 'daily') {
    return addDaysToIsoDate(startDate, totalOccurrences - 1);
  }
  if (rule.kind === 'monthly') {
    return getNthMonthlyOccurrenceDate(startDate, totalOccurrences);
  }
  if (
    rule.kind === 'weekly_multi' &&
    rule.recurringDaysOfWeek.length === 1 &&
    rule.recurringWeekInterval === 1
  ) {
    return addDaysToIsoDate(startDate, (totalOccurrences - 1) * 7);
  }

  let cursor = startDate;
  let found = 0;
  for (let guard = 0; guard < 3660; guard += 1) {
    if (isOccurrenceOnDate(startDate, rule, cursor)) {
      found += 1;
      if (found === totalOccurrences) {
        return cursor;
      }
    }
    const nextCursor = addDaysToIsoDate(cursor, 1);
    if (!nextCursor) break;
    cursor = nextCursor;
  }

  return null;
}

function isRecurringEventRecord(eventData: Record<string, unknown>): boolean {
  const recurringRule = resolveRecurringRule(eventData);
  const hasRecurringPattern =
    recurringRule.pattern.length > 0 &&
    recurringRule.pattern !== 'none' &&
    recurringRule.pattern !== 'n/a' &&
    recurringRule.pattern !== 'false' &&
    isRecurringRuleActive(recurringRule);
  const explicitRecurring = parseBooleanLike(eventData.isRecurring);

  if (explicitRecurring !== null) {
    return explicitRecurring || hasRecurringPattern;
  }
  return hasRecurringPattern;
}

function computeRecurringSeriesEndDate(eventData: Record<string, unknown>): string | null {
  const startDate = parseDateOnlyValue(eventData.startDate);
  if (!startDate) return null;

  const recurrenceUntilDate = parseDateOnlyValue(
    getLifecycleFieldValue(eventData, RECURRENCE_UNTIL_FIELD_CANDIDATES)
  );
  if (recurrenceUntilDate) {
    return recurrenceUntilDate;
  }

  const totalOccurrences = parsePositiveInteger(
    getLifecycleFieldValue(eventData, TOTAL_OCCURRENCE_FIELD_CANDIDATES)
  );
  if (!totalOccurrences) {
    return null;
  }

  return getNthRecurringOccurrenceDate(startDate, resolveRecurringRule(eventData), totalOccurrences);
}

function normalizeRecurringBaseWritePayload<T extends Record<string, unknown>>(payload: T): T {
  const recurringPattern = getRecurringPattern(payload);
  if (!recurringPattern || recurringPattern === 'none' || recurringPattern === 'n/a' || recurringPattern === 'false') {
    return payload;
  }

  const startDate = parseDateOnlyValue(payload.startDate);
  if (!startDate) {
    return payload;
  }

  const parseTimeMinutes = (value: unknown): number | null => {
    const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return hours * 60 + minutes;
  };

  const startMinutes = parseTimeMinutes(payload.startTime);
  const endMinutes = parseTimeMinutes(payload.endTime);
  const occurrenceLocalEndDate =
    startMinutes !== null && endMinutes !== null && endMinutes < startMinutes
      ? addDaysToIsoDate(startDate, 1) || startDate
      : startDate;

  const currentEndDate = parseDateOnlyValue(payload.endDate) || startDate;
  if (currentEndDate !== occurrenceLocalEndDate) {
    (payload as Record<string, unknown>).endDate = occurrenceLocalEndDate;
  }

  return payload;
}

function resolveLastSeenTimestampMs(eventData: Record<string, unknown>): number | null {
  return (
    parseTimestampMillis(eventData.lastSeenAt) ??
    parseTimestampMillis(eventData.updatedAt) ??
    parseTimestampMillis(eventData.createdAt)
  );
}

function normalizeCleanupDays(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(Math.trunc(parsed), max));
}

type ExpiredDeleteReason =
  | 'deleted_non_recurring_ended'
  | 'deleted_recurring_ended'
  | 'deleted_recurring_stale'
  | 'skipped_recurring_active'
  | 'skipped_recurring_missing_lifecycle'
  | 'skipped_non_recurring_not_expired'
  | 'skipped_non_recurring_invalid_dates';

interface ExpiredDeleteDecision {
  shouldDelete: boolean;
  reason: ExpiredDeleteReason;
}

function evaluateExpiredDeleteDecision(
  eventData: Record<string, unknown>,
  beforeDate: string,
  nowMs: number,
  policy: {
    recurringGraceDays: number;
    staleRecurringDays: number;
  }
): ExpiredDeleteDecision {
  const effectiveEndDate =
    parseDateOnlyValue(eventData.endDate) || parseDateOnlyValue(eventData.startDate);
  const isRecurring = isRecurringEventRecord(eventData);

  if (!isRecurring) {
    if (!effectiveEndDate) {
      return { shouldDelete: false, reason: 'skipped_non_recurring_invalid_dates' };
    }
    if (effectiveEndDate < beforeDate) {
      return { shouldDelete: true, reason: 'deleted_non_recurring_ended' };
    }
    return { shouldDelete: false, reason: 'skipped_non_recurring_not_expired' };
  }

  const seriesEndDate = computeRecurringSeriesEndDate(eventData);
  if (seriesEndDate) {
    const recurringExpiryDate = addDaysToIsoDate(seriesEndDate, policy.recurringGraceDays);
    if (recurringExpiryDate && recurringExpiryDate < beforeDate) {
      return { shouldDelete: true, reason: 'deleted_recurring_ended' };
    }
    return { shouldDelete: false, reason: 'skipped_recurring_active' };
  }

  const lastSeenAtMs = resolveLastSeenTimestampMs(eventData);
  if (lastSeenAtMs != null) {
    const staleCutoffMs = nowMs - policy.staleRecurringDays * DAY_MS;
    if (lastSeenAtMs < staleCutoffMs) {
      return { shouldDelete: true, reason: 'deleted_recurring_stale' };
    }
    return { shouldDelete: false, reason: 'skipped_recurring_active' };
  }

  return { shouldDelete: false, reason: 'skipped_recurring_missing_lifecycle' };
}

/**
 * Delete events older than a specified date
 */
export async function deleteExpiredEvents(
  beforeDate: string,
  batchSize: number = 500,
  options: DeleteExpiredEventsOptions = {}
): Promise<number> {
  const requestedVenueIds = Array.isArray(options.venueIds)
    ? Array.from(
        new Set(
          options.venueIds
            .map((id) => String(id || '').trim())
            .filter((id) => id.length > 0)
        )
      )
    : [];
  const missingRequestedVenueIds: string[] = [];

  const venues: VenueData[] =
    requestedVenueIds.length > 0
      ? (
          await Promise.all(
            requestedVenueIds.map(async (venueId) => {
              const venueDoc = await db.collection(COLLECTIONS.VENUES).doc(venueId).get();
              if (!venueDoc.exists) {
                missingRequestedVenueIds.push(venueId);
                return null;
              }
              return {
                id: venueDoc.id,
                ...venueDoc.data(),
              } as VenueData;
            })
          )
        ).filter((venue): venue is VenueData => Boolean(venue))
      : await getAllVenues();
  const maxDeletesPerRun = normalizeBackfillLimit(batchSize, 500, 5000);
  const recurringGraceDays = normalizeCleanupDays(
    options.recurringGraceDays,
    DEFAULT_RECURRING_GRACE_DAYS,
    0,
    365
  );
  const staleRecurringDays = normalizeCleanupDays(
    options.staleRecurringDays,
    DEFAULT_RECURRING_STALE_DAYS,
    1,
    3650
  );
  const maxScannedPerVenue = normalizeBackfillLimit(
    options.maxScannedPerVenue,
    Math.max(maxDeletesPerRun * 5, MIN_EVENTS_SCAN_CAP),
    MAX_EVENTS_SCAN_CAP
  );
  const pageSize = Math.min(200, Math.max(25, maxDeletesPerRun));
  const nowMs = Date.now();

  let deletedCount = 0;
  const candidatePostImageUrls = new Set<string>();
  const aggregateStats = {
    venuesScanned: 0,
    pagesScanned: 0,
    candidateDocsScanned: 0,
    scanCapHits: 0,
    deletedNonRecurring: 0,
    deletedRecurringEnded: 0,
    deletedRecurringStale: 0,
    skippedRecurringActive: 0,
    skippedRecurringMissingLifecycle: 0,
    skippedNonRecurringNotExpired: 0,
    skippedNonRecurringInvalidDates: 0,
  };

  for (const venue of venues) {
    if (deletedCount >= maxDeletesPerRun) break;

    const venueStats = {
      pagesScanned: 0,
      candidateDocsScanned: 0,
      scanCapHit: false,
      deletedNonRecurring: 0,
      deletedRecurringEnded: 0,
      deletedRecurringStale: 0,
      skippedRecurringActive: 0,
      skippedRecurringMissingLifecycle: 0,
      skippedNonRecurringNotExpired: 0,
      skippedNonRecurringInvalidDates: 0,
    };

    let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
    let hasMore = true;

    while (
      hasMore &&
      deletedCount < maxDeletesPerRun &&
      venueStats.candidateDocsScanned < maxScannedPerVenue
    ) {
      let query: admin.firestore.Query = db
        .collection(COLLECTIONS.VENUES)
        .doc(venue.id)
        .collection(COLLECTIONS.EVENTS)
        .where('startDate', '<', beforeDate)
        .orderBy('startDate', 'asc')
        .limit(pageSize);

      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const expiredEvents = await query.get();
      if (expiredEvents.empty) break;

      venueStats.pagesScanned += 1;
      aggregateStats.pagesScanned += 1;

      const batch = db.batch();
      let venuePageDeleteCount = 0;

      for (const doc of expiredEvents.docs) {
        if (deletedCount >= maxDeletesPerRun) break;
        if (venueStats.candidateDocsScanned >= maxScannedPerVenue) {
          venueStats.scanCapHit = true;
          break;
        }

        venueStats.candidateDocsScanned += 1;
        aggregateStats.candidateDocsScanned += 1;

        const eventData = (doc.data() || {}) as Record<string, unknown>;
        const decision = evaluateExpiredDeleteDecision(eventData, beforeDate, nowMs, {
          recurringGraceDays,
          staleRecurringDays,
        });

        if (decision.shouldDelete) {
          const managedPostImages = collectEventPostImageUrls(eventData);
          for (const imageUrl of managedPostImages) {
            candidatePostImageUrls.add(imageUrl);
          }
          batch.delete(doc.ref);
          venuePageDeleteCount += 1;
          deletedCount += 1;
        }

        switch (decision.reason) {
          case 'deleted_non_recurring_ended':
            venueStats.deletedNonRecurring += 1;
            aggregateStats.deletedNonRecurring += 1;
            break;
          case 'deleted_recurring_ended':
            venueStats.deletedRecurringEnded += 1;
            aggregateStats.deletedRecurringEnded += 1;
            break;
          case 'deleted_recurring_stale':
            venueStats.deletedRecurringStale += 1;
            aggregateStats.deletedRecurringStale += 1;
            break;
          case 'skipped_recurring_active':
            venueStats.skippedRecurringActive += 1;
            aggregateStats.skippedRecurringActive += 1;
            break;
          case 'skipped_recurring_missing_lifecycle':
            venueStats.skippedRecurringMissingLifecycle += 1;
            aggregateStats.skippedRecurringMissingLifecycle += 1;
            break;
          case 'skipped_non_recurring_not_expired':
            venueStats.skippedNonRecurringNotExpired += 1;
            aggregateStats.skippedNonRecurringNotExpired += 1;
            break;
          case 'skipped_non_recurring_invalid_dates':
            venueStats.skippedNonRecurringInvalidDates += 1;
            aggregateStats.skippedNonRecurringInvalidDates += 1;
            break;
        }
      }

      if (venuePageDeleteCount > 0) {
        await batch.commit();
      }

      lastDoc = expiredEvents.docs[expiredEvents.docs.length - 1] || null;
      hasMore = expiredEvents.size === pageSize && Boolean(lastDoc);
    }

    aggregateStats.venuesScanned += 1;
    if (venueStats.scanCapHit) {
      aggregateStats.scanCapHits += 1;
    }

    logger.info('Deleted expired events', {
      venueId: venue.id,
      deletedNonRecurring: venueStats.deletedNonRecurring,
      deletedRecurringEnded: venueStats.deletedRecurringEnded,
      deletedRecurringStale: venueStats.deletedRecurringStale,
      skippedRecurringActive: venueStats.skippedRecurringActive,
      skippedRecurringMissingLifecycle: venueStats.skippedRecurringMissingLifecycle,
      skippedNonRecurringNotExpired: venueStats.skippedNonRecurringNotExpired,
      skippedNonRecurringInvalidDates: venueStats.skippedNonRecurringInvalidDates,
      candidateDocsScanned: venueStats.candidateDocsScanned,
      pagesScanned: venueStats.pagesScanned,
      scanCapHit: venueStats.scanCapHit,
    });
  }

  const cleanupResult = await cleanupUnreferencedExpiredEventImages(
    Array.from(candidatePostImageUrls)
  );
  if (cleanupResult.candidateUrls > 0 || cleanupResult.deletedUrls > 0) {
    logger.info('Expired event image cleanup complete', { ...cleanupResult });
  }

  logger.info('Expired event delete filters applied', {
    beforeDate,
    requestedVenueCount: requestedVenueIds.length,
    missingRequestedVenueCount: missingRequestedVenueIds.length,
    missingRequestedVenueIds,
    maxDeletesPerRun,
    recurringGraceDays,
    staleRecurringDays,
    maxScannedPerVenue,
    ...aggregateStats,
  });

  return deletedCount;
}

// ===================
// Batch State Operations
// ===================

/**
 * Create or update batch processing state
 */
export async function saveBatchState(state: BatchState): Promise<string> {
  const docId = `${state.fileId}_${state.batchNumber}`;

  await db.collection(COLLECTIONS.BATCH_STATE).doc(docId).set({
    ...state,
    lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return docId;
}

/**
 * Get batch state for a file
 */
export async function getBatchState(fileId: string): Promise<BatchState | null> {
  const snapshot = await db.collection(COLLECTIONS.BATCH_STATE)
    .where('fileId', '==', fileId)
    .orderBy('batchNumber', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  return snapshot.docs[0].data() as BatchState;
}

/**
 * Update batch state status
 */
export async function updateBatchStatus(
  fileId: string,
  batchNumber: number,
  status: BatchState['status'],
  stats?: Partial<ProcessingStats>
): Promise<void> {
  const docId = `${fileId}_${batchNumber}`;

  const updates: Record<string, unknown> = {
    status,
    lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (stats) {
    for (const [key, value] of Object.entries(stats)) {
      updates[`stats.${key}`] = value;
    }
  }

  await db.collection(COLLECTIONS.BATCH_STATE).doc(docId).update(updates);
}

// ===================
// Processing Lock Operations
// ===================

export async function acquireProcessingLock(
  fileId: string,
  options?: {
    runId?: string;
    ttlMs?: number;
    source?: string;
    force?: boolean;
  }
): Promise<{
  acquired: boolean;
  runId?: string;
  reason: string;
  lock?: ProcessingLock;
}> {
  const now = Date.now();
  const ttlMs = options?.ttlMs ?? getProcessingLockTtlMs();
  const requestedRunId = options?.runId ?? randomUUID();
  const lockRef = db.collection(COLLECTIONS.PROCESSING_LOCKS).doc(fileId);

  return db.runTransaction(async (tx) => {
    const doc = await tx.get(lockRef);
    if (doc.exists) {
      const existing = doc.data() as ProcessingLock;
      const expiresAtMs = parseTimestampMillis(existing.expiresAt);
      const isExpired = expiresAtMs === null || expiresAtMs <= now;

      if (!isExpired && existing.runId !== requestedRunId && !options?.force) {
        return {
          acquired: false,
          runId: existing.runId,
          reason: 'active_lock',
          lock: existing,
        };
      }

      const runId = existing.runId === requestedRunId ? existing.runId : requestedRunId;
      const startedAt = existing.runId === runId && existing.startedAt
        ? existing.startedAt
        : new Date(now);

      tx.set(
        lockRef,
        {
          fileId,
          runId,
          status: 'running',
          startedAt,
          lastHeartbeat: new Date(now),
          expiresAt: new Date(now + ttlMs),
          source: options?.source,
        },
        { merge: true }
      );

      return {
        acquired: true,
        runId,
        reason: existing.runId === runId
          ? (isExpired ? 'expired_refresh' : 'refreshed')
          : (isExpired ? 'expired_replaced' : 'force_replaced'),
      };
    }

    const lock: ProcessingLock = {
      fileId,
      runId: requestedRunId,
      status: 'running',
      startedAt: new Date(now),
      lastHeartbeat: new Date(now),
      expiresAt: new Date(now + ttlMs),
      source: options?.source,
    };

    tx.set(lockRef, lock);

    return {
      acquired: true,
      runId: requestedRunId,
      reason: 'acquired',
      lock,
    };
  });
}

export async function refreshProcessingLock(
  fileId: string,
  runId: string,
  options?: {
    ttlMs?: number;
    status?: ProcessingLock['status'];
    source?: string;
  }
): Promise<{
  refreshed: boolean;
  reason: string;
  lock?: ProcessingLock;
}> {
  const now = Date.now();
  const ttlMs = options?.ttlMs ?? getProcessingLockTtlMs();
  const lockRef = db.collection(COLLECTIONS.PROCESSING_LOCKS).doc(fileId);

  return db.runTransaction(async (tx) => {
    const doc = await tx.get(lockRef);
    if (!doc.exists) {
      return { refreshed: false, reason: 'missing_lock' };
    }

    const existing = doc.data() as ProcessingLock;
    if (existing.status === 'completed' || existing.status === 'failed') {
      return {
        refreshed: false,
        reason: 'terminal_status',
        lock: existing,
      };
    }

    if (existing.runId !== runId) {
      return {
        refreshed: false,
        reason: 'run_id_mismatch',
        lock: existing,
      };
    }

    const expiresAtMs = parseTimestampMillis(existing.expiresAt);
    const isExpired = expiresAtMs === null || expiresAtMs <= now;
    const status = options?.status ?? existing.status;

    const updated: ProcessingLock = {
      ...existing,
      status,
      lastHeartbeat: new Date(now),
      expiresAt: new Date(now + ttlMs),
      source: options?.source ?? existing.source,
    };

    tx.set(lockRef, updated, { merge: true });

    return {
      refreshed: true,
      reason: isExpired ? 'expired_refresh' : 'refreshed',
      lock: updated,
    };
  });
}

export async function releaseProcessingLock(
  fileId: string,
  runId: string,
  status: ProcessingLock['status'],
  source?: string
): Promise<boolean> {
  const now = Date.now();
  const lockRef = db.collection(COLLECTIONS.PROCESSING_LOCKS).doc(fileId);

  return db.runTransaction(async (tx) => {
    const doc = await tx.get(lockRef);
    if (!doc.exists) {
      return false;
    }

    const existing = doc.data() as ProcessingLock;
    if (existing.runId !== runId) {
      return false;
    }

    tx.set(
      lockRef,
      {
        status,
        lastHeartbeat: new Date(now),
        expiresAt: new Date(now),
        source: source ?? existing.source,
      },
      { merge: true }
    );

    return true;
  });
}

// ===================
// Checkpoint Operations
// ===================

/**
 * Save processing checkpoint
 */
export async function saveCheckpoint(checkpoint: CheckpointData): Promise<void> {
  const docId = checkpoint.fileId;

  await db.collection(COLLECTIONS.CHECKPOINTS).doc(docId).set({
    ...checkpoint,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  logger.logCheckpoint({
    rowIndex: checkpoint.rowIndex,
    batchNumber: checkpoint.batchNumber,
    stats: checkpoint.stats,
  });
}

/**
 * Get checkpoint for a file
 */
export async function getCheckpoint(fileId: string): Promise<CheckpointData | null> {
  const doc = await db.collection(COLLECTIONS.CHECKPOINTS).doc(fileId).get();
  if (!doc.exists) return null;
  return doc.data() as CheckpointData;
}

/**
 * Delete checkpoint after processing completes
 */
export async function deleteCheckpoint(fileId: string): Promise<void> {
  await db.collection(COLLECTIONS.CHECKPOINTS).doc(fileId).delete();
}

// ===================
// Processed Datasets Tracking
// ===================

/**
 * Mark a dataset file as processed
 */
export async function markDatasetProcessed(
  fileId: string,
  fileName: string,
  stats: ProcessingStats
): Promise<void> {
  await db.collection(COLLECTIONS.PROCESSED_DATASETS).doc(fileId).set({
    fileId,
    fileName,
    stats,
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Check if a dataset has been processed
 */
export async function isDatasetProcessed(fileId: string): Promise<boolean> {
  const doc = await db.collection(COLLECTIONS.PROCESSED_DATASETS).doc(fileId).get();
  return doc.exists;
}

/**
 * Get list of processed dataset IDs
 */
export async function getProcessedDatasetIds(): Promise<Set<string>> {
  const snapshot = await db.collection(COLLECTIONS.PROCESSED_DATASETS)
    .select('fileId')
    .get();

  return new Set(snapshot.docs.map(doc => doc.id));
}

// ===================
// Parsing Snapshot Operations
// ===================

/**
 * Save per-row parsing snapshot for debugging
 */
export async function saveParseSnapshot(snapshot: ParseSnapshot): Promise<string> {
  const docId = `${snapshot.fileId}_${snapshot.rowIndex}_${Date.now()}`;
  const textInfo = truncateText(snapshot.inputText);

  const data = {
    ...snapshot,
    inputText: textInfo.text,
    inputTextLength: textInfo.length,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await db.collection(COLLECTIONS.PARSE_SNAPSHOTS).doc(docId).set(data);
  return docId;
}

export async function getParseSnapshotById(
  docId: string
): Promise<(ParseSnapshot & { id: string; createdAt?: Date }) | null> {
  const normalizedDocId = String(docId || '').trim();
  if (!normalizedDocId) return null;

  const doc = await db.collection(COLLECTIONS.PARSE_SNAPSHOTS).doc(normalizedDocId).get();
  if (!doc.exists) return null;

  const data = (doc.data() || {}) as Record<string, unknown>;
  const createdAtRaw = data.createdAt;
  const createdAt =
    createdAtRaw instanceof admin.firestore.Timestamp
      ? createdAtRaw.toDate()
      : createdAtRaw instanceof Date
        ? createdAtRaw
        : undefined;

  return {
    ...(data as unknown as ParseSnapshot),
    id: doc.id,
    createdAt,
  };
}

/**
 * Clean up old processed dataset records (older than specified days)
 */
export async function cleanupOldProcessedRecords(
  olderThanDays: number = 30
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const snapshot = await db.collection(COLLECTIONS.PROCESSED_DATASETS)
    .where('processedAt', '<', cutoffDate)
    .get();

  if (snapshot.empty) return 0;

  const batch = db.batch();
  for (const doc of snapshot.docs) {
    batch.delete(doc.ref);
  }
  await batch.commit();

  return snapshot.size;
}

export async function backfillEventImages(
  options: BackfillEventImagesOptions = {}
): Promise<BackfillEventImagesResult> {
  const uploadUrl = String(process.env.IMAGE_UPLOAD_URL || '').trim();
  if (!uploadUrl) {
    throw new Error('IMAGE_UPLOAD_URL is not configured');
  }

  const scanLimit = normalizeBackfillLimit(
    options.scanLimit,
    IMAGE_BACKFILL.DEFAULT_SCAN_LIMIT,
    IMAGE_BACKFILL.MAX_SCAN_LIMIT
  );
  const maxUpdatedDocs = normalizeBackfillLimit(
    options.maxUpdatedDocs,
    IMAGE_BACKFILL.DEFAULT_UPDATE_LIMIT,
    IMAGE_BACKFILL.MAX_UPDATE_LIMIT
  );
  const dryRun = options.dryRun === true;

  let query: admin.firestore.Query = db
    .collectionGroup(COLLECTIONS.EVENTS)
    .orderBy(admin.firestore.FieldPath.documentId())
    .limit(scanLimit);

  const cursor = String(options.cursor || '').trim();
  if (cursor) {
    query = query.startAfter(cursor);
  }

  const snapshot = await query.get();
  const result: BackfillEventImagesResult = {
    scannedDocs: snapshot.size,
    updatedDocs: 0,
    unchangedDocs: 0,
    skippedByLimit: 0,
    convertedFields: 0,
    convertedUrls: 0,
    failedUrls: 0,
    nextCursor: snapshot.docs[snapshot.docs.length - 1]?.ref.path,
    exhausted: snapshot.size < scanLimit,
    dryRun,
  };

  const urlCache = new Map<string, string | null>();
  const venueProfileCache = new Map<string, string>();

  for (const doc of snapshot.docs) {
    if (result.updatedDocs >= maxUpdatedDocs) {
      result.skippedByLimit += 1;
      continue;
    }

    const data = (doc.data() || {}) as EventData;
    const venueProfileImage = await getVenueProfileImageForEventDoc(doc.ref, venueProfileCache);
    const updates = await computeEventImageBackfillUpdates(
      data,
      uploadUrl,
      urlCache,
      result,
      venueProfileImage
    );

    if (Object.keys(updates).length === 0) {
      result.unchangedDocs += 1;
      continue;
    }

    result.updatedDocs += 1;
    if (!dryRun) {
      await doc.ref.update({
        ...updates,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }

  return result;
}

export async function backfillVenueProfileImages(
  options: BackfillVenueProfileImagesOptions = {}
): Promise<BackfillVenueProfileImagesResult> {
  const uploadUrl = String(process.env.IMAGE_UPLOAD_URL || '').trim();
  if (!uploadUrl) {
    throw new Error('IMAGE_UPLOAD_URL is not configured');
  }

  const scanLimit = normalizeBackfillLimit(
    options.scanLimit,
    IMAGE_BACKFILL.DEFAULT_SCAN_LIMIT,
    IMAGE_BACKFILL.MAX_SCAN_LIMIT
  );
  const maxUpdatedDocs = normalizeBackfillLimit(
    options.maxUpdatedDocs,
    IMAGE_BACKFILL.DEFAULT_UPDATE_LIMIT,
    IMAGE_BACKFILL.MAX_UPDATE_LIMIT
  );
  const maxEventsPerVenue = normalizeBackfillLimit(
    options.maxEventsPerVenue,
    50,
    500
  );
  const dryRun = options.dryRun === true;

  let query: admin.firestore.Query = db
    .collection(COLLECTIONS.VENUES)
    .orderBy(admin.firestore.FieldPath.documentId())
    .limit(scanLimit);

  const cursor = String(options.cursor || '').trim();
  if (cursor) {
    query = query.startAfter(cursor);
  }

  const snapshot = await query.get();
  const result: BackfillVenueProfileImagesResult = {
    scannedDocs: snapshot.size,
    updatedDocs: 0,
    unchangedDocs: 0,
    skippedByLimit: 0,
    convertedFields: 0,
    convertedUrls: 0,
    failedUrls: 0,
    eventDerivedProfiles: 0,
    nextCursor: snapshot.docs[snapshot.docs.length - 1]?.id,
    exhausted: snapshot.size < scanLimit,
    dryRun,
  };

  const urlCache = new Map<string, string | null>();

  for (const doc of snapshot.docs) {
    if (result.updatedDocs >= maxUpdatedDocs) {
      result.skippedByLimit += 1;
      continue;
    }

    const venueData = (doc.data() || {}) as VenueData;
    const updates = await computeVenueProfileImageBackfillUpdates(
      doc.ref,
      venueData,
      uploadUrl,
      urlCache,
      result,
      maxEventsPerVenue
    );

    if (Object.keys(updates).length === 0) {
      result.unchangedDocs += 1;
      continue;
    }

    result.updatedDocs += 1;
    if (!dryRun) {
      await doc.ref.set(
        {
          ...updates,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  }

  return result;
}

export async function backfillRecurringLifecycle(
  options: BackfillRecurringLifecycleOptions = {}
): Promise<BackfillRecurringLifecycleResult> {
  const scanLimit = normalizeBackfillLimit(
    options.scanLimit,
    IMAGE_BACKFILL.DEFAULT_SCAN_LIMIT,
    IMAGE_BACKFILL.MAX_SCAN_LIMIT
  );
  const maxUpdatedDocs = normalizeBackfillLimit(
    options.maxUpdatedDocs,
    IMAGE_BACKFILL.DEFAULT_UPDATE_LIMIT,
    IMAGE_BACKFILL.MAX_UPDATE_LIMIT
  );
  const dryRun = options.dryRun === true;
  const onlyRecurring = options.onlyRecurring !== false;

  let query: admin.firestore.Query = db
    .collectionGroup(COLLECTIONS.EVENTS)
    .orderBy(admin.firestore.FieldPath.documentId())
    .limit(scanLimit);

  const cursor = String(options.cursor || '').trim();
  if (cursor) {
    query = query.startAfter(cursor);
  }

  const snapshot = await query.get();
  const result: BackfillRecurringLifecycleResult = {
    scannedDocs: snapshot.size,
    recurringDocs: 0,
    updatedDocs: 0,
    unchangedDocs: 0,
    skippedByLimit: 0,
    populatedLastSeenAt: 0,
    populatedTotalOccurrences: 0,
    populatedRecurrenceUntilDate: 0,
    nextCursor: snapshot.docs[snapshot.docs.length - 1]?.id,
    exhausted: snapshot.size < scanLimit,
    dryRun,
  };

  for (const doc of snapshot.docs) {
    const eventData = (doc.data() || {}) as Record<string, unknown>;
    const isRecurring = isRecurringEventRecord(eventData);
    if (isRecurring) {
      result.recurringDocs += 1;
    }

    if (onlyRecurring && !isRecurring) {
      result.unchangedDocs += 1;
      continue;
    }

    if (result.updatedDocs >= maxUpdatedDocs) {
      result.skippedByLimit += 1;
      continue;
    }

    const updates = buildRecurringLifecycleBackfillUpdates(eventData);
    if (Object.keys(updates.payload).length === 0) {
      result.unchangedDocs += 1;
      continue;
    }

    result.updatedDocs += 1;
    if (updates.populatedLastSeenAt) {
      result.populatedLastSeenAt += 1;
    }
    if (updates.populatedTotalOccurrences) {
      result.populatedTotalOccurrences += 1;
    }
    if (updates.populatedRecurrenceUntilDate) {
      result.populatedRecurrenceUntilDate += 1;
    }

    if (!dryRun) {
      await doc.ref.set(updates.payload, { merge: true });
    }
  }

  return result;
}

function buildRecurringLifecycleBackfillUpdates(eventData: Record<string, unknown>): {
  payload: Record<string, unknown>;
  populatedLastSeenAt: boolean;
  populatedTotalOccurrences: boolean;
  populatedRecurrenceUntilDate: boolean;
} {
  const payload: Record<string, unknown> = {};
  let populatedLastSeenAt = false;
  let populatedTotalOccurrences = false;
  let populatedRecurrenceUntilDate = false;

  const existingLastSeenMs = parseTimestampMillis(eventData.lastSeenAt);
  if (existingLastSeenMs == null) {
    const fallbackMs =
      parseTimestampMillis(eventData.updatedAt) ?? parseTimestampMillis(eventData.createdAt);
    if (fallbackMs != null) {
      payload.lastSeenAt = admin.firestore.Timestamp.fromMillis(fallbackMs);
    } else {
      payload.lastSeenAt = admin.firestore.FieldValue.serverTimestamp();
    }
    populatedLastSeenAt = true;
  }

  const existingTotalOccurrences = parsePositiveInteger(eventData.totalOccurrences);
  if (existingTotalOccurrences == null) {
    const candidateTotalOccurrences = parsePositiveInteger(
      getLifecycleFieldValue(eventData, TOTAL_OCCURRENCE_FIELD_CANDIDATES)
    );
    if (candidateTotalOccurrences != null) {
      payload.totalOccurrences = candidateTotalOccurrences;
      populatedTotalOccurrences = true;
    }
  }

  const existingRecurrenceUntilDate = parseDateOnlyValue(eventData.recurrenceUntilDate);
  if (!existingRecurrenceUntilDate) {
    const candidateRecurrenceUntilDate = parseDateOnlyValue(
      getLifecycleFieldValue(eventData, RECURRENCE_UNTIL_FIELD_CANDIDATES)
    );
    if (candidateRecurrenceUntilDate) {
      payload.recurrenceUntilDate = candidateRecurrenceUntilDate;
      populatedRecurrenceUntilDate = true;
    }
  }

  return {
    payload,
    populatedLastSeenAt,
    populatedTotalOccurrences,
    populatedRecurrenceUntilDate,
  };
}

function normalizeBackfillLimit(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

type BackfillFolder = 'postimages' | 'profilepictures';

async function computeEventImageBackfillUpdates(
  data: EventData,
  uploadUrl: string,
  cache: Map<string, string | null>,
  stats: BackfillEventImagesResult,
  venueProfileImage?: string
): Promise<Partial<EventData>> {
  const updates: Partial<EventData> = {};
  const venueProfile = String(venueProfileImage || '').trim();

  const processSingle = async (field: keyof EventData, folder: BackfillFolder): Promise<void> => {
    const current = String(data[field] || '').trim();
    if (!needsImageBackfill(current)) return;

    const converted = await convertImageUrlToManaged(current, folder, uploadUrl, cache);
    if (!converted) {
      stats.failedUrls += 1;
      return;
    }
    if (converted === current) return;

    (updates[field] as EventData[typeof field]) = converted as EventData[typeof field];
    stats.convertedFields += 1;
    stats.convertedUrls += 1;
  };

  await processSingle('image', 'postimages');
  await processSingle('relevantImageUrl', 'postimages');
  await processSingle('cachedImageUrl', 'postimages');
  await processSingle('sharedPostThumbnail', 'postimages');

  if (venueProfile) {
    const currentIcon = String(data.icon || '').trim();
    if (currentIcon !== venueProfile) {
      updates.icon = venueProfile;
      stats.convertedFields += 1;
      stats.convertedUrls += 1;
    }
  } else {
    await processSingle('icon', 'profilepictures');
  }

  const rawMediaUrls = (data as unknown as Record<string, unknown>).mediaUrls;
  const mediaTokens = tokenizeMediaUrls(rawMediaUrls);
  if (mediaTokens.length > 0) {
    const convertedUrls: string[] = [];
    let changed = false;

    for (const original of mediaTokens) {
      if (!needsImageBackfill(original)) {
        convertedUrls.push(original);
        continue;
      }

      const converted = await convertImageUrlToManaged(original, 'postimages', uploadUrl, cache);
      if (!converted) {
        stats.failedUrls += 1;
        convertedUrls.push(original);
        continue;
      }

      convertedUrls.push(converted);
      if (converted !== original) {
        changed = true;
        stats.convertedUrls += 1;
      }
    }

    const deduped = dedupeUrls(convertedUrls);
    if (Array.isArray(rawMediaUrls)) {
      if (changed || !sameUrlArray(rawMediaUrls as string[], deduped)) {
        updates.mediaUrls = deduped;
        stats.convertedFields += 1;
      }
    } else if (typeof rawMediaUrls === 'string') {
      const existingString = rawMediaUrls.trim();
      const nextString = deduped.join(' ');
      if (changed || existingString !== nextString) {
        (updates as Record<string, unknown>).mediaUrls = nextString;
        stats.convertedFields += 1;
      }
    }
  }

  return updates;
}

async function computeVenueProfileImageBackfillUpdates(
  venueRef: admin.firestore.DocumentReference,
  data: VenueData,
  uploadUrl: string,
  cache: Map<string, string | null>,
  stats: BackfillVenueProfileImagesResult,
  maxEventsPerVenue: number
): Promise<Partial<VenueData>> {
  const updates: Partial<VenueData> = {};
  const venueRecord = data as unknown as Record<string, unknown>;
  const currentProfile = String(venueRecord.profileImage || '').trim();

  if (isManagedImageUrl(currentProfile)) {
    return updates;
  }

  let nextProfile = '';

  if (needsImageBackfill(currentProfile)) {
    const converted = await convertImageUrlToManaged(
      currentProfile,
      'profilepictures',
      uploadUrl,
      cache
    );
    if (!converted) {
      stats.failedUrls += 1;
    } else if (converted !== currentProfile && isManagedImageUrl(converted)) {
      nextProfile = converted;
      stats.convertedFields += 1;
      stats.convertedUrls += 1;
    }
  }

  if (!nextProfile) {
    const candidate = await getManagedEventIconForVenue(venueRef, data, maxEventsPerVenue);
    if (candidate && candidate !== currentProfile) {
      nextProfile = candidate;
      stats.convertedFields += 1;
      stats.convertedUrls += 1;
      stats.eventDerivedProfiles += 1;
    }
  }

  if (!nextProfile || nextProfile === currentProfile) {
    return updates;
  }

  updates.profileImage = nextProfile;
  return updates;
}

async function getManagedEventIconForVenue(
  venueRef: admin.firestore.DocumentReference,
  venueData: VenueData,
  maxEventsPerVenue: number
): Promise<string> {
  const snapshot = await venueRef
    .collection(COLLECTIONS.EVENTS)
    .orderBy(admin.firestore.FieldPath.documentId())
    .limit(maxEventsPerVenue)
    .get();

  if (snapshot.empty) return '';

  let fallbackCandidate = '';

  for (const doc of snapshot.docs) {
    const eventData = (doc.data() || {}) as Record<string, unknown>;
    const iconCandidates = getEventIconCandidates(eventData);
    if (!iconCandidates.length) continue;

    for (const candidate of iconCandidates) {
      if (!isManagedImageUrl(candidate)) continue;
      if (eventLooksFirstPartyForVenue(eventData, venueData)) {
        return candidate;
      }
      if (!fallbackCandidate) {
        fallbackCandidate = candidate;
      }
    }
  }

  return fallbackCandidate;
}

function getEventIconCandidates(eventData: Record<string, unknown>): string[] {
  const metadata = (eventData.metadata || {}) as Record<string, unknown>;
  const tokens = [
    String(eventData.icon || '').trim(),
    String(eventData.profileUrl || '').trim(),
    String(metadata.icon || '').trim(),
  ].filter(Boolean);

  return dedupeUrls(tokens);
}

function eventLooksFirstPartyForVenue(
  eventData: Record<string, unknown>,
  venueData: VenueData
): boolean {
  const venueRecord = venueData as unknown as Record<string, unknown>;

  const venueUrls = collectNormalizedUrlSet([
    venueRecord.facebookUrl,
    venueRecord.pageurl,
  ]);
  const eventMetadata = (eventData.metadata || {}) as Record<string, unknown>;
  const eventUrls = collectNormalizedUrlSet([
    eventData.cleanedFacebookUrl,
    eventData.facebookUrl,
    eventData.pageurl,
    eventMetadata.cleanedFacebookUrl,
    eventMetadata.facebookUrl,
  ]);

  if (venueUrls.size > 0 && eventUrls.size > 0) {
    for (const venueUrl of venueUrls) {
      if (eventUrls.has(venueUrl)) return true;
    }
  }

  const venueSlugByField = String(venueRecord.pagenameSlug || '').trim().toLowerCase();
  const venueSlugByUrl = String(
    extractFacebookSlug(String(venueRecord.facebookUrl || venueRecord.pageurl || '').trim()) || ''
  )
    .trim()
    .toLowerCase();
  const venueSlug = venueSlugByField || venueSlugByUrl;
  if (!venueSlug) return false;

  for (const rawEventUrl of eventUrls) {
    const slug = String(extractFacebookSlug(rawEventUrl) || '').trim().toLowerCase();
    if (slug && slug === venueSlug) return true;
  }

  return false;
}

function collectNormalizedUrlSet(values: unknown[]): Set<string> {
  const result = new Set<string>();
  for (const value of values) {
    const raw = String(value || '').trim();
    if (!raw) continue;
    const normalized = normalizeUrl(raw);
    if (normalized) result.add(normalized);
  }
  return result;
}

async function getVenueProfileImageForEventDoc(
  eventRef: admin.firestore.DocumentReference,
  cache: Map<string, string>
): Promise<string> {
  const venueRef = eventRef.parent?.parent;
  if (!venueRef) return '';

  const venueId = venueRef.id;
  if (cache.has(venueId)) {
    return cache.get(venueId) || '';
  }

  try {
    const venueDoc = await venueRef.get();
    const profileImage = String((venueDoc.data()?.profileImage as string) || '').trim();
    cache.set(venueId, profileImage);
    return profileImage;
  } catch {
    cache.set(venueId, '');
    return '';
  }
}

interface ExpiredImageCleanupResult {
  candidateUrls: number;
  referencedUrls: number;
  deletedUrls: number;
  failedDeletes: number;
  skippedWithoutDeleteUrl: number;
}

async function cleanupUnreferencedExpiredEventImages(
  candidateUrls: string[]
): Promise<ExpiredImageCleanupResult> {
  const uniqueCandidates = dedupeUrls(candidateUrls);
  const result: ExpiredImageCleanupResult = {
    candidateUrls: uniqueCandidates.length,
    referencedUrls: 0,
    deletedUrls: 0,
    failedDeletes: 0,
    skippedWithoutDeleteUrl: 0,
  };

  if (uniqueCandidates.length === 0) {
    return result;
  }

  const deleteUrl = getImageDeleteUrl();
  if (!deleteUrl) {
    result.skippedWithoutDeleteUrl = uniqueCandidates.length;
    logger.warn('Skipping expired image cleanup: IMAGE_DELETE_URL is not configured');
    return result;
  }

  const referenced = await findReferencedEventImageUrls(uniqueCandidates);
  result.referencedUrls = referenced.size;

  const unreferenced = uniqueCandidates.filter((url) => !referenced.has(url));
  for (const imageUrl of unreferenced) {
    const deleted = await deleteManagedImageWithRetry(imageUrl, deleteUrl);
    if (deleted) {
      result.deletedUrls += 1;
    } else {
      result.failedDeletes += 1;
    }
  }

  return result;
}

function collectEventPostImageUrls(data: Record<string, unknown>): string[] {
  const urls = new Set<string>();

  for (const field of EVENT_IMAGE_REFERENCE_FIELDS) {
    const raw = getNestedValue(data, field);
    const normalized = normalizeManagedPostImageUrl(String(raw || ''));
    if (normalized) urls.add(normalized);
  }

  for (const field of EVENT_IMAGE_ARRAY_REFERENCE_FIELDS) {
    const raw = getNestedValue(data, field);
    const mediaUrls = tokenizeMediaUrls(raw);
    for (const mediaUrl of mediaUrls) {
      const normalized = normalizeManagedPostImageUrl(mediaUrl);
      if (normalized) urls.add(normalized);
    }
  }

  return Array.from(urls);
}

async function findReferencedEventImageUrls(candidateUrls: string[]): Promise<Set<string>> {
  const referenced = new Set<string>();
  if (candidateUrls.length === 0) return referenced;

  const collection = db.collectionGroup(COLLECTIONS.EVENTS);
  const chunks = chunkValues(candidateUrls, IMAGE_CLEANUP.QUERY_CHUNK_SIZE);

  for (const chunk of chunks) {
    const chunkSet = new Set(chunk);

    for (const field of EVENT_IMAGE_REFERENCE_FIELDS) {
      try {
        const snapshot = await collection.where(field, 'in', chunk).get();
        for (const doc of snapshot.docs) {
          const normalized = normalizeManagedPostImageUrl(String(doc.get(field) || ''));
          if (normalized && chunkSet.has(normalized)) {
            referenced.add(normalized);
          }
        }
      } catch (error) {
        logger.warn('Image reference query failed', {
          field,
          operator: 'in',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    for (const field of EVENT_IMAGE_ARRAY_REFERENCE_FIELDS) {
      try {
        const snapshot = await collection.where(field, 'array-contains-any', chunk).get();
        for (const doc of snapshot.docs) {
          const mediaUrls = tokenizeMediaUrls(doc.get(field));
          for (const mediaUrl of mediaUrls) {
            const normalized = normalizeManagedPostImageUrl(mediaUrl);
            if (normalized && chunkSet.has(normalized)) {
              referenced.add(normalized);
            }
          }
        }
      } catch (error) {
        logger.warn('Image reference query failed', {
          field,
          operator: 'array-contains-any',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return referenced;
}

function getNestedValue(data: Record<string, unknown>, path: string): unknown {
  const segments = path.split('.');
  let cursor: unknown = data;

  for (const segment of segments) {
    if (!cursor || typeof cursor !== 'object') {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }

  return cursor;
}

function normalizeManagedPostImageUrl(url: string): string | null {
  const raw = String(url || '').trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    const isGcs = parsed.hostname === 'storage.googleapis.com';
    const isPostImage = parsed.pathname.includes('/gathr-uploaded-images/postimages/');
    if (!isGcs || !isPostImage) return null;

    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
  } catch {
    return null;
  }
}

function chunkValues<T>(values: T[], chunkSize: number): T[][] {
  if (values.length === 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

async function deleteManagedImageWithRetry(imageUrl: string, deleteUrl: string): Promise<boolean> {
  for (let attempt = 1; attempt <= IMAGE_CLEANUP.DELETE_RETRIES; attempt++) {
    const deleted = await deleteManagedImage(imageUrl, deleteUrl, attempt);
    if (deleted) return true;
  }
  return false;
}

async function deleteManagedImage(
  imageUrl: string,
  deleteUrl: string,
  attempt: number
): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(
      deleteUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl }),
      },
      IMAGE_CLEANUP.DELETE_TIMEOUT_MS
    );

    const responseText = await response.text();
    if (!response.ok) {
      const parsed = safeJsonParse(responseText);
      const detailsRaw = String(parsed?.details || parsed?.error || responseText || '').trim();
      if (/no such object/i.test(detailsRaw)) {
        logger.debug('Expired image already removed', { attempt, imageUrl });
        return true;
      }

      logger.warn('Failed to delete expired event image', {
        status: response.status,
        attempt,
        imageUrl,
        details: detailsRaw.slice(0, 220),
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.warn('Error deleting expired event image', {
      attempt,
      imageUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

function getImageDeleteUrl(): string | null {
  const explicit = String(process.env.IMAGE_DELETE_URL || '').trim();
  if (explicit) return explicit;

  const uploadUrl = String(process.env.IMAGE_UPLOAD_URL || '').trim();
  if (!uploadUrl) return null;

  if (uploadUrl.includes('/upload-image')) {
    return uploadUrl.replace(/\/upload-image\/?$/, '/delete-image/');
  }

  return null;
}

function dedupeUrls(urls: string[]): string[] {
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const url = String(raw || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    deduped.push(url);
  }
  return deduped;
}

function mergeCityLevelEventMediaUrls(existingUrls: string[], incomingUrls: string[]): string[] {
  const incoming = dedupeUrls(incomingUrls);
  const incomingManaged = incoming.filter((url) => isManagedImageUrl(url));
  if (incomingManaged.length > 0) {
    return incomingManaged;
  }

  return dedupeUrls(existingUrls);
}

function sameUrlArray(existing: string[] | undefined, next: string[]): boolean {
  const a = Array.isArray(existing) ? existing.map((value) => String(value || '').trim()).filter(Boolean) : [];
  if (a.length !== next.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== next[i]) return false;
  }
  return true;
}

function tokenizeMediaUrls(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    const matches = trimmed.match(/https?:\/\/\S+/g);
    if (!matches) return [];
    return matches.map((entry) => entry.trim()).filter(Boolean);
  }

  return [];
}

function needsImageBackfill(url: string): boolean {
  const normalized = String(url || '').trim();
  if (!normalized) return false;
  if (!/^https?:\/\//i.test(normalized)) return false;
  if (isManagedImageUrl(normalized)) return false;
  return looksLikeExternalImageUrl(normalized);
}

function looksLikeExternalImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    if (/\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(path)) return true;
    if (host.includes('fbcdn.net') || host.includes('scontent')) return true;
    if (host.includes('instagram.com') || host.includes('cdninstagram.com')) return true;
    if (host.includes('googleusercontent.com')) return true;
    return false;
  } catch {
    return false;
  }
}

function isManagedImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === 'storage.googleapis.com' &&
      parsed.pathname.includes('/gathr-uploaded-images/')
    );
  } catch {
    return false;
  }
}

function guessContentType(url: string): string {
  const lower = String(url || '').toLowerCase();
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.webp')) return 'image/webp';
  if (lower.includes('.gif')) return 'image/gif';
  if (lower.includes('.bmp')) return 'image/bmp';
  return 'image/jpeg';
}

async function convertImageUrlToManaged(
  sourceUrl: string,
  folder: BackfillFolder,
  uploadUrl: string,
  cache: Map<string, string | null>
): Promise<string | null> {
  if (!needsImageBackfill(sourceUrl)) return sourceUrl;

  const cached = cache.get(sourceUrl);
  if (cached !== undefined) return cached;

  const downloaded = await downloadImageBuffer(sourceUrl);
  if (!downloaded) {
    cache.set(sourceUrl, null);
    return null;
  }

  const uploaded = await uploadImageBuffer(downloaded.buffer, downloaded.contentType, uploadUrl, folder);
  if (!uploaded || !isManagedImageUrl(uploaded)) {
    cache.set(sourceUrl, null);
    return null;
  }

  cache.set(sourceUrl, uploaded);
  return uploaded;
}

async function downloadImageBuffer(
  imageUrl: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const response = await fetchWithTimeout(
      imageUrl,
      { method: 'GET', redirect: 'follow' },
      IMAGE_BACKFILL.DOWNLOAD_TIMEOUT_MS
    );
    if (!response.ok) return null;

    const contentTypeHeader = response.headers.get('content-type') || '';
    const contentType = contentTypeHeader || guessContentType(imageUrl);
    if (!contentType.startsWith('image/')) return null;

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > IMAGE_BACKFILL.MAX_IMAGE_BYTES) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > IMAGE_BACKFILL.MAX_IMAGE_BYTES) return null;

    return { buffer, contentType };
  } catch {
    return null;
  }
}

async function uploadImageBuffer(
  buffer: Buffer,
  contentType: string,
  uploadUrl: string,
  folder: BackfillFolder
): Promise<string | null> {
  try {
    const form = new FormData();
    const blob = new Blob([buffer], { type: contentType || 'image/jpeg' });
    const fileName = `backfill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

    form.append('folder', folder);
    form.append('image', blob, fileName);
    form.append('filename', fileName);
    form.append('ocr', 'false');

    const response = await fetchWithTimeout(
      uploadUrl,
      { method: 'POST', body: form },
      IMAGE_BACKFILL.UPLOAD_TIMEOUT_MS
    );
    if (!response.ok) return null;

    const payload = safeJsonParse(await response.text());
    const imageUrl = String(payload?.imageUrl || payload?.publicUrl || '').trim();
    return imageUrl || null;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
