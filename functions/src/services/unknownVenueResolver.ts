import { createHash } from 'crypto';
import { getFunctions } from 'firebase-admin/functions';
import * as firestoreService from './firestoreService.js';
import * as placesService from './placesService.js';
import * as apifyService from './apifyService.js';
import * as driveService from './driveService.js';
import { getVenueAliasCandidates } from './venueAliases.js';
import { logger } from '../utils/logger.js';
import {
  calculateEnhancedSimilarity,
  extractFacebookSlug,
  normalizeVenueName,
  normalizeUrl,
} from '../utils/similarity.js';
import {
  UnrecognizedVenueRecord,
  UnrecognizedVenueSampleEvent,
  UnrecognizedVenueSuggestedMatch,
  UnrecognizedVenueStatus,
} from '../types/index.js';

type ResolverConfig = {
  enabled: boolean;
  batchLimit: number;
  autoResolveExisting: boolean;
  autoCreateEnabled: boolean;
  autoCreateConfidence: number;
  existingSuggestionFuzzyMin: number;
  apifyEnabled: boolean;
  apifyAutoSuggestionsEnabled: boolean;
  createNewFacebookLookupEnabled: boolean;
  apifyActorId: string;
  apifyToken: string;
  apifyResultsLimit: number;
  emailWebhookUrl: string;
  emailWebhookKey: string;
};

type ResolverResult = {
  docId: string;
  status: UnrecognizedVenueStatus;
  message: string;
  suggestionsCount: number;
  resolvedVenueId?: string;
  notificationSent?: boolean;
};

type ParsedSuggestionNoteMetadata = {
  placeId?: string;
  website?: string;
  phone?: string;
  websiteFacebookUrl?: string;
  latitude?: number;
  longitude?: number;
  placeTypes?: string[];
  categories?: string[];
  businessStatus?: string;
  rating?: number;
  userRatingsTotal?: number;
};

type ParsedAddressComponents = {
  city?: string;
  province?: string;
  postalCode?: string;
};

type CreateNewFacebookLookupResult = {
  attempted: boolean;
  source?: 'apify';
  facebookUrl?: string;
  candidateName?: string;
  confidence?: number;
  warning?: string;
};

type FinalizeUnknownVenueRowReplayGroup = {
  fileId: string;
  fileName?: string;
  parserMode: 'legacy' | 'full5stage';
  rowIndexes: number[];
  taskId?: string;
  status: 'queued' | 'deduped' | 'skipped' | 'failed';
  warning?: string;
};

type FinalizeUnknownVenueRowReplaySummary = {
  attempted: boolean;
  rowCount?: number;
  fileCount?: number;
  queuedTaskCount?: number;
  dedupedTaskCount?: number;
  warning?: string;
  groups?: FinalizeUnknownVenueRowReplayGroup[];
};

export type FinalizeUnknownVenueAction = 'resolve_existing' | 'create_new' | 'ignore';

export type FinalizeUnknownVenueInput = {
  docId: string;
  action: FinalizeUnknownVenueAction;
  venueId?: string;
  candidateIndex?: number;
  manual?: {
    name?: string;
    facebookUrl?: string;
    address?: string;
    website?: string;
    phone?: string;
    email?: string;
    category?: string;
    latitude?: number | string;
    longitude?: number | string;
    city?: string;
    province?: string;
  };
  notes?: string;
  resolvedBy?: string;
};

export type FinalizeUnknownVenueResult = {
  success: boolean;
  docId: string;
  action: FinalizeUnknownVenueAction;
  status: UnrecognizedVenueStatus;
  alreadyApplied?: boolean;
  message?: string;
  venueId?: string;
  venueName?: string;
  facebookUrl?: string;
  driveAppend?: {
    attempted: boolean;
    appendedCount?: number;
    skippedExistingCount?: number;
    warning?: string;
  };
  rowReplay?: FinalizeUnknownVenueRowReplaySummary;
};

function isFinalizedStatus(status: unknown): status is 'resolved_existing' | 'created_new' | 'ignored' {
  const value = String(status || '').trim();
  return value === 'resolved_existing' || value === 'created_new' || value === 'ignored';
}

function getRecordDriveAppendSummary(
  record: UnrecognizedVenueRecord
): FinalizeUnknownVenueResult['driveAppend'] | undefined {
  const finalization = (record as unknown as Record<string, unknown>).finalization as Record<string, unknown> | undefined;
  const driveAppend = finalization?.driveAppend as Record<string, unknown> | undefined;
  if (!driveAppend || typeof driveAppend !== 'object') return undefined;

  const attempted = Boolean(driveAppend.attempted);
  const appendedCount = Number(driveAppend.appendedCount);
  const skippedExistingCount = Number(driveAppend.skippedExistingCount);
  const warning = String(driveAppend.warning || '').trim() || undefined;

  return {
    attempted,
    appendedCount: Number.isFinite(appendedCount) ? appendedCount : undefined,
    skippedExistingCount: Number.isFinite(skippedExistingCount) ? skippedExistingCount : undefined,
    warning,
  };
}

function getRecordRowReplaySummary(
  record: UnrecognizedVenueRecord
): FinalizeUnknownVenueResult['rowReplay'] | undefined {
  const finalization = (record as unknown as Record<string, unknown>).finalization as Record<string, unknown> | undefined;
  const rowReplay = finalization?.rowReplay as Record<string, unknown> | undefined;
  if (!rowReplay || typeof rowReplay !== 'object') return undefined;

  const attempted = Boolean(rowReplay.attempted);
  const rowCount = Number(rowReplay.rowCount);
  const fileCount = Number(rowReplay.fileCount);
  const queuedTaskCount = Number(rowReplay.queuedTaskCount);
  const dedupedTaskCount = Number(rowReplay.dedupedTaskCount);
  const warning = String(rowReplay.warning || '').trim() || undefined;
  const groupsRaw = Array.isArray(rowReplay.groups) ? rowReplay.groups : [];
  const groups = groupsRaw
    .filter((value) => value && typeof value === 'object')
    .map((value) => {
      const group = value as Record<string, unknown>;
      const rowIndexes = Array.isArray(group.rowIndexes)
        ? Array.from(
            new Set(
              group.rowIndexes
                .map((item) => Math.trunc(Number(item)))
                .filter((item) => Number.isFinite(item) && item >= 0)
            )
          ).sort((a, b) => a - b)
        : [];
      return {
        fileId: String(group.fileId || '').trim(),
        fileName: String(group.fileName || '').trim() || undefined,
        parserMode: String(group.parserMode || 'full5stage') === 'legacy' ? 'legacy' : 'full5stage',
        rowIndexes,
        taskId: String(group.taskId || '').trim() || undefined,
        status: (['queued', 'deduped', 'skipped', 'failed'].includes(String(group.status || ''))
          ? String(group.status)
          : 'skipped') as FinalizeUnknownVenueRowReplayGroup['status'],
        warning: String(group.warning || '').trim() || undefined,
      } as FinalizeUnknownVenueRowReplayGroup;
    })
    .filter((group) => Boolean(group.fileId));

  return {
    attempted,
    rowCount: Number.isFinite(rowCount) ? rowCount : undefined,
    fileCount: Number.isFinite(fileCount) ? fileCount : undefined,
    queuedTaskCount: Number.isFinite(queuedTaskCount) ? queuedTaskCount : undefined,
    dedupedTaskCount: Number.isFinite(dedupedTaskCount) ? dedupedTaskCount : undefined,
    warning,
    groups: groups.length ? groups : undefined,
  };
}

function buildAlreadyAppliedResult(
  record: UnrecognizedVenueRecord,
  input: FinalizeUnknownVenueInput
): FinalizeUnknownVenueResult {
  return {
    success: true,
    alreadyApplied: true,
    message: 'This action was already applied earlier.',
    docId: String(record.id || input.docId || '').trim(),
    action: input.action,
    status: (String(record.status || 'failed') as UnrecognizedVenueStatus),
    venueId: String(record.resolvedVenueId || '').trim() || undefined,
    driveAppend: getRecordDriveAppendSummary(record),
    rowReplay: getRecordRowReplaySummary(record),
  };
}

function assertNotContradictingFinalizedRecord(
  record: UnrecognizedVenueRecord,
  input: FinalizeUnknownVenueInput
): FinalizeUnknownVenueResult | null {
  const status = String(record.status || '').trim();
  if (!isFinalizedStatus(status)) return null;

  if (input.action === 'resolve_existing' && status === 'resolved_existing') {
    const requestedVenueId = String(input.venueId || '').trim();
    const existingVenueId = String(record.resolvedVenueId || '').trim();
    if (requestedVenueId && existingVenueId && requestedVenueId !== existingVenueId) {
      throw new Error(
        `Unknown venue already finalized to a different venue (${existingVenueId}); cannot apply resolve_existing to ${requestedVenueId}`
      );
    }
    return buildAlreadyAppliedResult(record, input);
  }

  if (input.action === 'create_new' && status === 'created_new') {
    return buildAlreadyAppliedResult(record, input);
  }

  if (input.action === 'ignore' && status === 'ignored') {
    return buildAlreadyAppliedResult(record, input);
  }

  throw new Error(`Unknown venue already finalized as ${status}; cannot apply action "${input.action}"`);
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function getResolverConfig(): ResolverConfig {
  return {
    enabled: parseBooleanEnv(process.env.UNKNOWN_VENUE_RESOLVER_ENABLED, false),
    batchLimit: Math.max(1, Math.min(Number(process.env.UNKNOWN_VENUE_RESOLVER_BATCH_LIMIT || 5), 25)),
    autoResolveExisting: parseBooleanEnv(process.env.UNKNOWN_VENUE_AUTO_RESOLVE_EXISTING, false),
    autoCreateEnabled: parseBooleanEnv(process.env.UNKNOWN_VENUE_AUTO_CREATE_ENABLED, false),
    autoCreateConfidence: Math.max(0, Math.min(Number(process.env.UNKNOWN_VENUE_AUTO_CREATE_CONFIDENCE || 0.95), 1)),
    existingSuggestionFuzzyMin: Math.max(0.55, Math.min(Number(process.env.UNKNOWN_VENUE_EXISTING_FUZZY_MIN || 0.7), 0.95)),
    apifyEnabled: parseBooleanEnv(process.env.UNKNOWN_VENUE_APIFY_ENABLED, false),
    apifyAutoSuggestionsEnabled: parseBooleanEnv(process.env.UNKNOWN_VENUE_APIFY_AUTO_SUGGESTIONS_ENABLED, false),
    createNewFacebookLookupEnabled: parseBooleanEnv(process.env.UNKNOWN_VENUE_CREATE_NEW_FB_LOOKUP_ENABLED, false),
    apifyActorId: String(process.env.UNKNOWN_VENUE_APIFY_ACTOR_ID || '').trim(),
    apifyToken: String(process.env.APIFY_TOKEN || '').trim(),
    apifyResultsLimit: Math.max(1, Math.min(Number(process.env.UNKNOWN_VENUE_APIFY_RESULTS_LIMIT || 10), 20)),
    emailWebhookUrl: String(process.env.UNKNOWN_VENUE_EMAIL_WEBHOOK_URL || '').trim(),
    emailWebhookKey: String(process.env.UNKNOWN_VENUE_EMAIL_WEBHOOK_KEY || '').trim(),
  };
}

function normalizeCity(value?: string): string {
  return String(value || '').trim();
}

function normalizeProvince(value?: string): string {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'PEI') return 'PE';
  return raw;
}

const RESOLVER_PEI_CITY_HINTS: Array<{ city: string; province: string; patterns: RegExp[] }> = [
  { city: 'Charlottetown', province: 'PE', patterns: [/\bcharlottetown\b/i, /\bch[\s-]?town\b/i] },
  { city: 'Summerside', province: 'PE', patterns: [/\bsummerside\b/i] },
  { city: 'Stratford', province: 'PE', patterns: [/\bstratford\b/i] },
  { city: 'Cornwall', province: 'PE', patterns: [/\bcornwall\b/i] },
  { city: 'Montague', province: 'PE', patterns: [/\bmontague\b/i] },
  { city: 'Souris', province: 'PE', patterns: [/\bsouris\b/i] },
];

type ResolverGeoHints = {
  cityHint?: string;
  provinceHint?: string;
};

function inferResolverGeoHintsFromCorpus(corpusInput?: string): ResolverGeoHints {
  const corpus = String(corpusInput || '').trim();
  if (!corpus) return {};

  for (const entry of RESOLVER_PEI_CITY_HINTS) {
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
    return {
      provinceHint: 'PE',
    };
  }

  return {};
}

function getResolverGeoHints(record: UnrecognizedVenueRecord): ResolverGeoHints {
  const explicitCity = normalizeCity(record.cityHint);
  const explicitProvince = normalizeProvince(record.provinceHint);
  if (explicitCity && explicitProvince) {
    return { cityHint: explicitCity, provinceHint: explicitProvince };
  }

  const sampleEvents = Array.isArray(record.sampleEvents) ? record.sampleEvents : [];
  const corpus = [
    String(record.establishment || '').trim(),
    ...sampleEvents.flatMap((sample) => ([
      String(sample.aggregatorName || '').trim(),
      String(sample.aggregatorAddress || '').trim(),
      String(sample.eventName || '').trim(),
      String(sample.descriptionPreview || '').trim(),
      String(sample.observedVenueName || '').trim(),
    ])),
  ].filter(Boolean).join(' ');

  const inferred = inferResolverGeoHintsFromCorpus(corpus);
  return {
    cityHint: explicitCity || inferred.cityHint,
    provinceHint: explicitProvince || inferred.provinceHint,
  };
}

function inferResolverGeoHintsFromSampleEvents(record: UnrecognizedVenueRecord): ResolverGeoHints {
  const sampleEvents = Array.isArray(record.sampleEvents) ? record.sampleEvents : [];
  if (!sampleEvents.length) return {};
  const sampleCorpus = sampleEvents.flatMap((sample) => ([
    String(sample.aggregatorAddress || '').trim(),
    String(sample.eventName || '').trim(),
    String(sample.descriptionPreview || '').trim(),
    String(sample.observedVenueName || '').trim(),
  ])).filter(Boolean).join(' ');
  return inferResolverGeoHintsFromCorpus(sampleCorpus);
}

const RESOLVER_CIVIC_ADDRESS_REGEX =
  /\b\d{1,6}\s+[A-Za-z0-9][A-Za-z0-9'’.#-]*(?:\s+[A-Za-z0-9][A-Za-z0-9'’.#-]*){0,7}\s(?:street|st|road|rd|avenue|ave|drive|dr|lane|ln|boulevard|blvd|court|ct|way|highway|hwy|route|rte|place|pl|terrace|ter)(?:\s*,?\s*(?:unit|suite|ste|apt|#)\s*[A-Za-z0-9-]+)?\b/i;

function extractResolverCivicAddressFromText(value?: string): string | undefined {
  const text = String(value || '').trim();
  if (!text) return undefined;
  const match = text.match(RESOLVER_CIVIC_ADDRESS_REGEX);
  if (!match) return undefined;
  const candidate = String(match[0] || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .trim()
    .replace(/[;:.]+$/g, '');
  return candidate || undefined;
}

function buildResolverAddressFallbackFromSamples(record: UnrecognizedVenueRecord): string | undefined {
  const sampleEvents = Array.isArray(record.sampleEvents) ? record.sampleEvents : [];
  if (!sampleEvents.length) return undefined;

  let extractedAddress = '';
  for (const sample of sampleEvents) {
    const aggregatorAddress = String(sample.aggregatorAddress || '').trim();
    if (aggregatorAddress) {
      extractedAddress = aggregatorAddress;
      break;
    }
  }

  for (const sample of sampleEvents) {
    if (extractedAddress) break;
    const fromDescription = extractResolverCivicAddressFromText(sample.descriptionPreview);
    if (fromDescription) {
      extractedAddress = fromDescription;
      break;
    }
    const fromEventName = extractResolverCivicAddressFromText(sample.eventName);
    if (fromEventName) {
      extractedAddress = fromEventName;
      break;
    }
  }

  if (!extractedAddress) return undefined;

  const sampleHints = inferResolverGeoHintsFromSampleEvents(record);
  const cityHint = normalizeCity(sampleHints.cityHint || record.cityHint);
  const provinceHint = normalizeProvince(sampleHints.provinceHint || record.provinceHint);

  let resolvedAddress = extractedAddress;
  const normalizedAddress = ` ${normalizeVenueName(resolvedAddress)} `;
  const normalizedCity = normalizeVenueName(cityHint);
  if (normalizedCity && !normalizedAddress.includes(` ${normalizedCity} `)) {
    resolvedAddress = `${resolvedAddress}, ${cityHint}`;
  }

  if (provinceHint) {
    const normalizedWithCity = ` ${normalizeVenueName(resolvedAddress)} `;
    const normalizedProvince = normalizeVenueName(provinceHint);
    const hasProvinceToken = normalizedProvince && normalizedWithCity.includes(` ${normalizedProvince} `);
    const hasPeToken = /\b,\s*pe\b/i.test(resolvedAddress);
    if (!hasProvinceToken && !(provinceHint === 'PE' && hasPeToken)) {
      resolvedAddress = `${resolvedAddress}, ${provinceHint}`;
    }
  }

  return resolvedAddress;
}

function getRecordAddressMatchKeys(record: UnrecognizedVenueRecord): string[] {
  const keys = new Set<string>();
  const addKey = (value?: string): void => {
    const key = normalizeAddressMatchKey(value);
    if (key) keys.add(key);
  };

  addKey(buildResolverAddressFallbackFromSamples(record));
  const sampleEvents = Array.isArray(record.sampleEvents) ? record.sampleEvents : [];
  for (const sample of sampleEvents) {
    addKey(sample?.aggregatorAddress);
    addKey(extractResolverCivicAddressFromText(sample?.descriptionPreview));
    addKey(extractResolverCivicAddressFromText(sample?.eventName));
    addKey(extractResolverCivicAddressFromText(sample?.observedVenueName));
  }

  return Array.from(keys);
}

function getRecordAddressLooseMatchKeys(record: UnrecognizedVenueRecord): string[] {
  const keys = new Set<string>();
  const addKey = (value?: string): void => {
    const key = normalizeAddressLooseMatchKey(value);
    if (key) keys.add(key);
  };

  addKey(buildResolverAddressFallbackFromSamples(record));
  const sampleEvents = Array.isArray(record.sampleEvents) ? record.sampleEvents : [];
  for (const sample of sampleEvents) {
    addKey(sample?.aggregatorAddress);
    addKey(extractResolverCivicAddressFromText(sample?.descriptionPreview));
    addKey(extractResolverCivicAddressFromText(sample?.eventName));
    addKey(extractResolverCivicAddressFromText(sample?.observedVenueName));
  }

  return Array.from(keys);
}

function dedupeSuggestions(
  suggestions: UnrecognizedVenueSuggestedMatch[]
): UnrecognizedVenueSuggestedMatch[] {
  const seen = new Set<string>();
  const result: UnrecognizedVenueSuggestedMatch[] = [];
  for (const suggestion of suggestions) {
    const key = [
      String(suggestion.venueId || ''),
      normalizeVenueName(String(suggestion.venueName || '')),
      normalizeUrl(String(suggestion.facebookUrl || '')),
      normalizeVenueName(String(suggestion.address || '')),
      suggestion.matchType,
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(suggestion);
  }
  result.sort((a, b) => b.confidence - a.confidence);
  return result.slice(0, 10);
}

function getVenueDisplayName(venue: Record<string, unknown>): string {
  return String(
    venue.name ||
    venue.pagename ||
    venue.pageName ||
    venue.title ||
    ''
  ).trim();
}

function getVenueAddress(venue: Record<string, unknown>): string {
  return String(venue.address || '').trim();
}

function getVenueFacebookUrl(venue: Record<string, unknown>): string {
  return String(venue.facebookUrl || venue.pageurl || '').trim();
}

function getVenueGooglePlaceId(venue: Record<string, unknown>): string {
  return String(
    venue.googlePlaceId ||
    venue.placeId ||
    venue.placeid ||
    ''
  ).trim();
}

function getVenueWebsiteUrl(venue: Record<string, unknown>): string {
  const direct = String(
    venue.website ||
    venue.websiteUrl ||
    venue.websiteURI ||
    ''
  ).trim();
  if (direct) return direct;

  const parsed = venue.placeDetailsParsed;
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const nested = String((parsed as Record<string, unknown>).website || '').trim();
    if (nested) return nested;
  }

  const rawJson = String(venue.placeDetailsJson || '').trim();
  if (!rawJson) return '';
  try {
    const decoded = JSON.parse(rawJson) as Record<string, unknown>;
    return String(decoded.website || '').trim();
  } catch {
    return '';
  }
}

function hasCompetingIndependentIdentitySignal(params: {
  suggestion: UnrecognizedVenueSuggestedMatch;
  matchedVenue: Record<string, unknown>;
  matchedVenueName: string;
  nameSimilarity: number;
  rawName: string;
}): {
  hasConflict: boolean;
  reason?: string;
  candidatePlaceId?: string;
  candidateWebsite?: string;
  candidateFacebookUrl?: string;
  rawToCandidateSimilarity?: number;
} {
  const rawName = String(params.rawName || '').trim();
  const candidateName = String(params.suggestion.venueName || '').trim();
  if (!rawName || !candidateName) return { hasConflict: false };

  // Only run this guard when address matching is carrying a weak name match.
  if (Number(params.nameSimilarity || 0) >= 0.45) {
    return { hasConflict: false };
  }

  const rawNameCandidates = Array.from(new Set(
    [rawName, ...getExistingMatchNameCandidates(rawName)]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  ));
  const rawToCandidateSimilarity = Math.max(
    ...rawNameCandidates.map((candidate) => calculateEnhancedSimilarity(candidate, candidateName))
  );
  const candidateLooksLikeUnknown =
    rawToCandidateSimilarity >= 0.72 ||
    rawNameCandidates.some((candidate) => candidateContainsUnknownNameTokens(candidate, candidateName)) ||
    rawNameCandidates.some((candidate) => candidateExtendsUnknownNameByTokens(candidate, candidateName));
  if (!candidateLooksLikeUnknown) {
    return { hasConflict: false };
  }

  const meta = parseSuggestionNoteMetadata(params.suggestion.note);
  const candidatePlaceId = String(meta.placeId || '').trim();
  const candidateWebsite = normalizeUrl(String(meta.website || '').trim());
  const candidateFacebookUrl = normalizeUrl(
    String(params.suggestion.facebookUrl || meta.websiteFacebookUrl || '').trim()
  );

  const matchedPlaceId = String(getVenueGooglePlaceId(params.matchedVenue) || '').trim();
  const matchedWebsite = normalizeUrl(getVenueWebsiteUrl(params.matchedVenue));
  const matchedFacebookUrl = normalizeUrl(getVenueFacebookUrl(params.matchedVenue));
  const matchedNameSimilarity = calculateEnhancedSimilarity(candidateName, params.matchedVenueName);

  const distinctPlaceId = Boolean(candidatePlaceId && matchedPlaceId && candidatePlaceId !== matchedPlaceId);
  const distinctWebsite = Boolean(candidateWebsite && candidateWebsite !== matchedWebsite);
  const distinctFacebookUrl = Boolean(candidateFacebookUrl && candidateFacebookUrl !== matchedFacebookUrl);
  const clearlyDifferentName = matchedNameSimilarity < 0.55;

  if (!clearlyDifferentName) {
    return { hasConflict: false };
  }

  if (!distinctPlaceId && !distinctWebsite && !distinctFacebookUrl) {
    return { hasConflict: false };
  }

  const reason = distinctFacebookUrl
    ? 'candidateFacebook'
    : distinctWebsite
      ? 'candidateWebsite'
      : distinctPlaceId
        ? 'candidatePlaceId'
        : 'candidateIdentity';

  return {
    hasConflict: true,
    reason,
    candidatePlaceId,
    candidateWebsite,
    candidateFacebookUrl,
    rawToCandidateSimilarity,
  };
}

const VENUE_TOKEN_STOPWORDS = new Set([
  'the',
  'and',
  'of',
  'at',
  'in',
  'on',
  'for',
  'to',
  'by',
  'a',
  'an',
]);

function getMeaningfulVenueTokens(value: string): string[] {
  const normalized = normalizeVenueName(value);
  if (!normalized) return [];
  return Array.from(new Set(
    normalized
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
      .filter((token) => !VENUE_TOKEN_STOPWORDS.has(token))
  ));
}

function candidateContainsUnknownNameTokens(
  unknownName: string,
  candidateName: string
): boolean {
  const unknownTokens = getMeaningfulVenueTokens(unknownName);
  if (!unknownTokens.length) return false;
  const candidateTokens = new Set(getMeaningfulVenueTokens(candidateName));
  return unknownTokens.every((token) => candidateTokens.has(token));
}

function candidateExtendsUnknownNameByTokens(
  unknownName: string,
  candidateName: string
): boolean {
  const unknownNormalized = normalizeVenueName(unknownName);
  const candidateNormalized = normalizeVenueName(candidateName);
  if (!unknownNormalized || !candidateNormalized || unknownNormalized === candidateNormalized) {
    return false;
  }
  if (candidateNormalized.includes(unknownNormalized)) return true;

  const unknownTokens = getMeaningfulVenueTokens(unknownName);
  const candidateTokens = getMeaningfulVenueTokens(candidateName);
  if (!unknownTokens.length || candidateTokens.length <= unknownTokens.length) return false;
  const candidateTokenSet = new Set(candidateTokens);
  return unknownTokens.every((token) => candidateTokenSet.has(token));
}

function getResolverGeoMatchSignalsForCandidate(
  record: UnrecognizedVenueRecord | undefined,
  candidateName: string,
  candidateAddress?: string
): { cityMatch: boolean; provinceMatch: boolean; peiMatch: boolean } {
  const cityHint = normalizeCity(record?.cityHint);
  const provinceHint = normalizeProvince(record?.provinceHint);
  const corpus = `${candidateName || ''} ${candidateAddress || ''}`;
  const normalizedCorpus = ` ${normalizeVenueName(corpus)} `;
  const normalizedCity = normalizeVenueName(cityHint);

  const cityMatch = Boolean(normalizedCity) && normalizedCorpus.includes(` ${normalizedCity} `);
  const peiMatch = /\bpei\b/i.test(corpus) || /prince\s+edward\s+island/i.test(corpus) || /\b,\s*pe\b/i.test(corpus);
  const provinceMatch = provinceHint
    ? (provinceHint === 'PE'
      ? peiMatch || normalizedCorpus.includes(' pe ')
      : normalizedCorpus.includes(` ${normalizeVenueName(provinceHint)} `))
    : false;

  return { cityMatch, provinceMatch, peiMatch };
}

function venueMatchesResolverGeoHints(
  record: UnrecognizedVenueRecord,
  venue: Record<string, unknown>
): boolean {
  const hints = getResolverGeoHints(record);
  const cityHint = normalizeCity(hints.cityHint);
  const provinceHint = normalizeProvince(hints.provinceHint);
  if (!cityHint && !provinceHint) return true;

  const geo = getResolverGeoMatchSignalsForCandidate(
    {
      establishment: String(record.establishment || ''),
      establishmentNormalized: String(record.establishmentNormalized || ''),
      status: record.status,
      occurrences: Number(record.occurrences || 0),
      cityHint,
      provinceHint,
    } as UnrecognizedVenueRecord,
    getVenueDisplayName(venue),
    [
      getVenueAddress(venue),
      String(venue.city || '').trim(),
      String(venue.province || '').trim(),
    ].filter(Boolean).join(' ')
  );

  if (cityHint && !geo.cityMatch) return false;
  if (provinceHint && !geo.provinceMatch) return false;
  return true;
}

function getSampleAggregatorFacebookUrls(record: UnrecognizedVenueRecord): string[] {
  const sampleEvents = Array.isArray(record.sampleEvents) ? record.sampleEvents : [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const sample of sampleEvents) {
    const url = String(sample?.aggregatorFacebookUrl || '').trim();
    if (!url) continue;
    const key = normalizeUrl(url) || url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(url);
  }
  return result;
}

function getSampleAggregatorAddresses(record: UnrecognizedVenueRecord): string[] {
  const sampleEvents = Array.isArray(record.sampleEvents) ? record.sampleEvents : [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const sample of sampleEvents) {
    const address = String(sample?.aggregatorAddress || '').trim();
    if (!address) continue;
    const key = normalizeAddressMatchKey(address) || normalizeVenueName(address);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(address);
  }
  return result;
}

function humanizeFacebookPathLabel(rawLabel: string): string {
  const value = String(rawLabel || '').trim();
  if (!value) return '';
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .trim();
}

function extractFacebookPageLabelFromUrl(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(withProtocol);
    if (!parsed.hostname.toLowerCase().endsWith('facebook.com')) return '';
    const segments = parsed.pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
    if (!segments.length) return '';
    const first = String(segments[0] || '').toLowerCase();
    let label = '';
    if (first === 'profile.php') {
      label = '';
    } else if ((first === 'people' || first === 'pages') && segments.length >= 2) {
      label = String(segments[1] || '');
    } else if (first === 'p' && segments.length >= 2) {
      label = String(segments[1] || '').replace(/-?\d{8,}$/g, '');
    } else {
      label = String(segments[0] || '');
    }
    return humanizeFacebookPathLabel(label);
  } catch {
    return '';
  }
}

function getPageSubmissionSourceTokenSets(record: UnrecognizedVenueRecord): string[][] {
  if (!isPageSubmissionVenueDiscoveryRecord(record)) return [];
  const sets = new Map<string, string[]>();
  const seedValues = [
    ...getSampleAggregatorFacebookUrls(record),
    String(record.establishment || ''),
  ].filter(Boolean);
  for (const value of seedValues) {
    const sourceText = extractFacebookPageLabelFromUrl(String(value)) || String(value);
    const tokens = getMeaningfulVenueTokens(sourceText);
    if (tokens.length < 3) continue; // Avoid generic false positives (e.g., "The Club")
    const key = tokens.join('|');
    if (!sets.has(key)) {
      sets.set(key, tokens);
    }
  }
  return Array.from(sets.values());
}

function candidateMatchesPageSubmissionSourceTokens(
  sourceTokenSets: string[][],
  params: { candidateName: string; candidateUrl?: string; slugFallback?: string }
): boolean {
  if (!sourceTokenSets.length) return false;
  const candidateTokens = new Set<string>([
    ...getMeaningfulVenueTokens(params.candidateName),
    ...getMeaningfulVenueTokens(String(params.slugFallback || '')),
    ...getMeaningfulVenueTokens(extractFacebookPageLabelFromUrl(String(params.candidateUrl || ''))),
  ]);
  if (!candidateTokens.size) return false;
  return sourceTokenSets.some((tokenSet) => tokenSet.every((token) => candidateTokens.has(token)));
}

function extractFacebookPageNumericId(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.toLowerCase();
    if (!host.endsWith('facebook.com')) return '';

    const queryId = String(parsed.searchParams.get('id') || '').trim();
    if (/^\d{8,}$/.test(queryId)) return queryId;

    const segments = parsed.pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
    const first = String(segments[0] || '').toLowerCase();
    if (first === 'people' && /^\d{8,}$/.test(String(segments[2] || '').trim())) {
      return String(segments[2] || '').trim();
    }
    if (first === 'pages' && /^\d{8,}$/.test(String(segments[2] || '').trim())) {
      return String(segments[2] || '').trim();
    }
    if (first === 'p') {
      const m = String(segments[1] || '').match(/(\d{8,})$/);
      if (m && m[1]) return m[1];
    }
  } catch {
    return '';
  }
  return '';
}

function getFacebookPageIdentityKey(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const id = extractFacebookPageNumericId(raw);
  if (id) return `id:${id}`;
  const slug = String(extractFacebookSlug(raw) || '').trim().toLowerCase();
  if (slug && !['people', 'p'].includes(slug)) return `slug:${slug}`;
  const normalized = normalizeUrl(raw);
  return normalized ? `url:${normalized}` : '';
}

function isPageSubmissionVenueDiscoveryRecord(record: UnrecognizedVenueRecord): boolean {
  const samples = Array.isArray(record.sampleEvents) ? record.sampleEvents : [];
  return samples.some((sample) => {
    const preview = String(sample?.descriptionPreview || '').toLowerCase();
    return preview.includes('approved page submission venue discovery for');
  });
}

function stripParenthesizedAddressSuffix(rawName: string): string {
  const value = String(rawName || '').trim();
  if (!value) return '';

  const match = value.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  if (!match) return value;

  const base = String(match[1] || '').trim();
  const suffix = String(match[2] || '').trim();
  if (!base || !suffix) return value;

  const looksLikeAddressOrLocation = (
    /,/.test(suffix) ||
    /\d/.test(suffix) ||
    /\b(?:pe|pei|prince\s+edward\s+island|canada)\b/i.test(suffix) ||
    /\b(?:st|street|ave|avenue|rd|road|dr|drive|blvd|boulevard|ln|lane|hwy|highway|ct|court|terrace|trl|trail)\b/i.test(suffix) ||
    /\b(?:room|lounge|hall|hallway|concourse|lobby|foyer|suite|floor|level|wing|atrium|ballroom)\b/i.test(suffix)
  );

  return looksLikeAddressOrLocation ? base : value;
}

function stripContextualParentheticalSegments(rawName: string): string {
  let value = String(rawName || '').trim();
  if (!value || !value.includes('(')) return value;

  let changed = false;
  value = value.replace(/\s*\(([^()]+)\)/g, (fullMatch, inner) => {
    const suffix = String(inner || '').trim();
    if (!suffix) return fullMatch;

    const looksLikeContext = (
      /^(?:in|inside|within|at|located(?:\s+in)?|held(?:\s+at)?|hosted(?:\s+at|(?:\s+in)?)?)\b/i.test(suffix) ||
      /,/.test(suffix) ||
      /\d/.test(suffix) ||
      /\b(?:pe|pei|ns|nb|nl|on|qc|ab|bc|sk|mb|canada|charlottetown|summerside|stratford|cornwall|montague|souris)\b/i.test(suffix) ||
      /\b(?:room|meeting\s+room|conference\s+room|lounge|hall|hallway|concourse|lobby|foyer|suite|floor|level|wing|atrium|ballroom|gallery|studio)\b/i.test(suffix)
    );

    if (!looksLikeContext) return fullMatch;
    changed = true;
    return '';
  });

  if (!changed) return String(rawName || '').trim();
  return value.replace(/\s+,/g, ',').replace(/\s{2,}/g, ' ').trim();
}

function stripCommaAddressSuffix(rawName: string): string {
  const value = String(rawName || '').trim();
  if (!value || !value.includes(',')) return value;

  const firstCommaIndex = value.indexOf(',');
  if (firstCommaIndex <= 0) return value;

  const base = String(value.slice(0, firstCommaIndex) || '').trim();
  const suffix = String(value.slice(firstCommaIndex + 1) || '').trim();
  if (!base || !suffix) return value;

  const looksLikeAddressOrLocation = (
    /\d/.test(suffix) ||
    /\b(?:pe|pei|ns|nb|nl|on|qc|ab|bc|sk|mb|canada|prince\s+edward\s+island)\b/i.test(suffix) ||
    /\b(?:charlottetown|summerside|stratford|cornwall|montague|souris)\b/i.test(suffix) ||
    /\b(?:st|street|ave|avenue|rd|road|dr|drive|blvd|boulevard|ln|lane|hwy|highway|ct|court|terrace|trl|trail)\b/i.test(suffix) ||
    /\b[a-z]\d[a-z]\s?\d[a-z]\d\b/i.test(suffix)
  );

  return looksLikeAddressOrLocation ? base : value;
}

function getExistingMatchNameCandidates(rawName: string): string[] {
  const trimmed = String(rawName || '').trim();
  const strippedContextual = stripContextualParentheticalSegments(trimmed);
  const strippedParenthesized = stripParenthesizedAddressSuffix(trimmed);
  const strippedComma = stripCommaAddressSuffix(strippedParenthesized);
  const strippedCommaContextual = stripContextualParentheticalSegments(strippedComma);
  const candidates = new Set<string>(
    [trimmed, strippedContextual, strippedParenthesized, strippedComma, strippedCommaContextual]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  );

  const addNormalizedVariants = (value: string): void => {
    const v = String(value || '').trim();
    if (!v) return;

    // Remove a leading definite article for better fuzzy matching against
    // venue records that may omit it (e.g. "The Pilot House" -> "Pilot House").
    const withoutLeadingThe = v.replace(/^the\s+/i, '').trim();
    if (withoutLeadingThe) {
      candidates.add(withoutLeadingThe);
    }

    // Strip operational-area suffixes that are often posted as sub-areas of
    // an existing venue page (e.g. "The Pilot House Queue" -> "The Pilot House").
    const suffixMatch = v.match(/^(.*?)(?:\s+[-|,]?\s*)(queue|lobby|foyer|concourse|hallway)\s*$/i);
    if (suffixMatch?.[1]) {
      const base = String(suffixMatch[1] || '').trim();
      if (base) {
        candidates.add(base);
        const baseWithoutThe = base.replace(/^the\s+/i, '').trim();
        if (baseWithoutThe) candidates.add(baseWithoutThe);
      }
    }
  };

  addNormalizedVariants(trimmed);
  addNormalizedVariants(strippedContextual);
  addNormalizedVariants(strippedParenthesized);
  addNormalizedVariants(strippedComma);
  addNormalizedVariants(strippedCommaContextual);

  return Array.from(candidates);
}

function scorePlacesQueryNameCandidateComplexity(rawName: string, candidate: string): number {
  const raw = String(rawName || '').trim();
  const value = String(candidate || '').trim();
  if (!value) return Number.POSITIVE_INFINITY;

  let score = value.length;
  if (value === raw) score += 20;
  if (/[(),]/.test(value)) score += 15;
  if (/\b\d{1,6}\b/.test(value)) score += 10;
  if (/^(?:art\s+fest|festival|showcase|event|series)\b/i.test(value)) score += 12;
  return score;
}

function getPlacesSearchNameCandidates(rawName: string): string[] {
  const raw = String(rawName || '').trim();
  const candidates = getExistingMatchNameCandidates(raw);
  if (!raw) return candidates;
  if (!/[(),]/.test(raw)) return candidates;

  const ordered = [...candidates].sort((a, b) => (
    scorePlacesQueryNameCandidateComplexity(raw, a) - scorePlacesQueryNameCandidateComplexity(raw, b)
  ));
  return Array.from(new Set(ordered));
}

async function linkSuggestionToExistingVenueByFacebookUrl(
  suggestion: UnrecognizedVenueSuggestedMatch,
  params: {
    docId?: string;
    unknownVenueName?: string;
    source: 'places' | 'apify';
  }
): Promise<UnrecognizedVenueSuggestedMatch> {
  const facebookUrl = String(suggestion.facebookUrl || '').trim();
  if (!facebookUrl) return suggestion;

  const existingVenue = await firestoreService.findVenueByFacebookUrl(facebookUrl);
  if (!existingVenue) return suggestion;

  const venueAny = existingVenue as unknown as Record<string, unknown>;
  const linkedSuggestion: UnrecognizedVenueSuggestedMatch = {
    ...suggestion,
    venueId: existingVenue.id,
    venueName: getVenueDisplayName(venueAny) || existingVenue.name || suggestion.venueName,
    address: getVenueAddress(venueAny) || suggestion.address,
    facebookUrl: getVenueFacebookUrl(venueAny) || facebookUrl,
  };

  logger.info('Linked unknown-venue external candidate to existing venue by Facebook URL', {
    docId: params.docId,
    unknownVenueName: params.unknownVenueName,
    source: params.source,
    matchedVenueId: existingVenue.id,
    matchedVenueName: linkedSuggestion.venueName,
    facebookUrl: linkedSuggestion.facebookUrl,
  });

  return linkedSuggestion;
}

async function linkSuggestionToExistingVenueByPlaceId(
  suggestion: UnrecognizedVenueSuggestedMatch,
  placeId: string | undefined,
  params: {
    docId?: string;
    unknownVenueName?: string;
    source: 'places' | 'apify';
  }
): Promise<UnrecognizedVenueSuggestedMatch> {
  const normalizedPlaceId = String(placeId || '').trim();
  if (!normalizedPlaceId) return suggestion;

  const existingVenue = await firestoreService.findVenueByGooglePlaceId(normalizedPlaceId);
  if (!existingVenue) return suggestion;

  const venueAny = existingVenue as unknown as Record<string, unknown>;
  const linkedSuggestion: UnrecognizedVenueSuggestedMatch = {
    ...suggestion,
    confidence: Math.max(0.98, Number(suggestion.confidence || 0)),
    venueId: existingVenue.id,
    venueName: getVenueDisplayName(venueAny) || existingVenue.name || suggestion.venueName,
    address: getVenueAddress(venueAny) || suggestion.address,
    facebookUrl: getVenueFacebookUrl(venueAny) || suggestion.facebookUrl,
    note: buildSuggestionNote([
      ['linkedBy', 'placeId'],
      ['placeId', normalizedPlaceId],
      ['existingVenueId', existingVenue.id],
      ['existingVenueName', getVenueDisplayName(venueAny) || existingVenue.name || ''],
    ]) || suggestion.note,
  };

  logger.info('Linked unknown-venue external candidate to existing venue by Place ID', {
    docId: params.docId,
    unknownVenueName: params.unknownVenueName,
    source: params.source,
    matchedVenueId: existingVenue.id,
    matchedVenueName: linkedSuggestion.venueName,
    placeId: normalizedPlaceId,
  });

  return linkedSuggestion;
}

async function linkSuggestionToExistingVenueByAddress(
  suggestion: UnrecognizedVenueSuggestedMatch,
  record: UnrecognizedVenueRecord,
  params: {
    docId?: string;
    unknownVenueName?: string;
    source: 'places' | 'apify';
  }
): Promise<UnrecognizedVenueSuggestedMatch> {
  if (suggestion.venueId) return suggestion;
  const candidateAddress = String(suggestion.address || '').trim();
  const candidateAddressKey = normalizeAddressMatchKey(candidateAddress);
  const candidateAddressLooseKey = normalizeAddressLooseMatchKey(candidateAddress);
  if (!candidateAddressKey && !candidateAddressLooseKey) return suggestion;

  const rawName = String(record.establishment || params.unknownVenueName || '').trim();
  const normalizedAggregatorUrlKeys = new Set(
    getSampleAggregatorFacebookUrls(record)
      .map((value) => normalizeUrl(value))
      .filter(Boolean)
  );
  const firstAggregatorSourceUrl = getSampleAggregatorFacebookUrls(record)[0] || '';
  const venues = await firestoreService.getAllVenues();
  const venueEntries = venues
    .map((venue) => {
      const venueAny = venue as unknown as Record<string, unknown>;
      return {
        venue,
        venueAny,
        address: getVenueAddress(venueAny),
      };
    });

  const exactMatches = candidateAddressKey
    ? venueEntries
        .filter((entry) => normalizeAddressMatchKey(entry.address) === candidateAddressKey)
        .filter((entry) => venueMatchesResolverGeoHints(record, entry.venueAny))
    : [];

  let matches = exactMatches;
  let linkedByMode: 'addressExact' | 'addressLooseAggregator' = 'addressExact';

  if (!matches.length && candidateAddressLooseKey && normalizedAggregatorUrlKeys.size > 0) {
    const looseMatches = venueEntries
      .filter((entry) => normalizeAddressLooseMatchKey(entry.address) === candidateAddressLooseKey)
      .filter((entry) => venueMatchesResolverGeoHints(record, entry.venueAny));

    const looseCorroborated = looseMatches.filter((entry) => {
      const venueFacebookUrl = normalizeUrl(getVenueFacebookUrl(entry.venueAny));
      return Boolean(venueFacebookUrl) && normalizedAggregatorUrlKeys.has(venueFacebookUrl);
    });

    if (looseCorroborated.length) {
      matches = looseCorroborated;
      linkedByMode = 'addressLooseAggregator';
    }
  }

  if (!matches.length) return suggestion;

  const ranked = matches
    .map((entry) => {
      const venueName = getVenueDisplayName(entry.venueAny) || entry.venue.name || '';
      const similarity = rawName ? calculateEnhancedSimilarity(rawName, venueName) : 0;
      return {
        ...entry,
        venueName,
        similarity,
      };
    })
    .sort((a, b) => b.similarity - a.similarity);

  const top = ranked[0];
  if (!top) return suggestion;

  if (ranked.length > 1) {
    const second = ranked[1];
    if (second && (top.similarity - second.similarity) < 0.08) {
      logger.info('Skipped address-based unknown-venue linking due to ambiguity', {
        docId: params.docId,
        unknownVenueName: rawName,
        source: params.source,
        linkedByMode,
        candidateAddress,
        candidateAddressKey,
        candidateAddressLooseKey,
        candidateCount: ranked.length,
        topVenueId: top.venue.id,
        secondVenueId: second.venue.id,
        topSimilarity: top.similarity,
        secondSimilarity: second.similarity,
      });
      return suggestion;
    }
  }

  const competingIdentity = hasCompetingIndependentIdentitySignal({
    suggestion,
    matchedVenue: top.venueAny,
    matchedVenueName: top.venueName,
    nameSimilarity: top.similarity,
    rawName,
  });
  if (competingIdentity.hasConflict) {
    logger.info('Skipped address-based unknown-venue linking due to competing independent identity', {
      docId: params.docId,
      unknownVenueName: rawName,
      source: params.source,
      linkedByMode,
      candidateAddress,
      candidateAddressKey,
      candidateAddressLooseKey,
      matchedVenueId: top.venue.id,
      matchedVenueName: top.venueName,
      nameSimilarity: top.similarity,
      reason: competingIdentity.reason,
      candidatePlaceId: competingIdentity.candidatePlaceId,
      candidateWebsite: competingIdentity.candidateWebsite,
      candidateFacebookUrl: competingIdentity.candidateFacebookUrl,
      rawToCandidateSimilarity: competingIdentity.rawToCandidateSimilarity,
    });
    return {
      ...suggestion,
      note: mergeSuggestionNotes(suggestion.note, [
        ['addressLinkSkipped', 'competing_independent_identity'],
        ['skipReason', competingIdentity.reason],
        ['existingVenueId', top.venue.id],
        ['existingVenueName', top.venueName],
        ['nameSimilarity', Number(top.similarity || 0).toFixed(3)],
        ['candidatePlaceId', competingIdentity.candidatePlaceId],
        ['candidateWebsite', competingIdentity.candidateWebsite],
        ['candidateFacebookUrl', competingIdentity.candidateFacebookUrl],
        ['rawToCandidateSimilarity', competingIdentity.rawToCandidateSimilarity?.toFixed(3)],
        ['source', params.source],
      ]) || suggestion.note,
    };
  }

  const boostedConfidence = linkedByMode === 'addressLooseAggregator'
    ? (top.similarity >= 0.7
      ? 0.95
      : top.similarity >= 0.45
        ? 0.92
        : 0.90)
    : (top.similarity >= 0.7
      ? 0.97
      : top.similarity >= 0.45
        ? 0.93
        : 0.89);

  const linkedSuggestion: UnrecognizedVenueSuggestedMatch = {
    ...suggestion,
    confidence: Math.max(Number(suggestion.confidence || 0), boostedConfidence),
    venueId: top.venue.id,
    venueName: top.venueName || suggestion.venueName,
    address: top.address || candidateAddress,
    facebookUrl: getVenueFacebookUrl(top.venueAny) || suggestion.facebookUrl,
    note: mergeSuggestionNotes(suggestion.note, [
      ['linkedBy', linkedByMode],
      ['candidateAddress', candidateAddress],
      ['addressKey', candidateAddressKey],
      ['addressLooseKey', candidateAddressLooseKey],
      ['aggregatorSourceUrl', firstAggregatorSourceUrl],
      ['existingVenueId', top.venue.id],
      ['existingVenueName', top.venueName],
      ['nameSimilarity', Number(top.similarity || 0).toFixed(3)],
      ['source', params.source],
    ]) || suggestion.note,
  };

  logger.info('Linked unknown-venue external candidate to existing venue by address', {
    docId: params.docId,
    unknownVenueName: rawName,
    source: params.source,
    linkedByMode,
    matchedVenueId: top.venue.id,
    matchedVenueName: linkedSuggestion.venueName,
    candidateAddress,
    candidateAddressLooseKey,
    nameSimilarity: top.similarity,
    candidateCount: ranked.length,
  });

  return linkedSuggestion;
}

async function buildPageSubmissionApprovedUrlSuggestion(
  record: UnrecognizedVenueRecord
): Promise<UnrecognizedVenueSuggestedMatch | null> {
  if (!isPageSubmissionVenueDiscoveryRecord(record)) return null;
  const approvedUrls = getSampleAggregatorFacebookUrls(record);
  const approvedUrl = String(approvedUrls[0] || '').trim();
  if (!approvedUrl) return null;
  const normalizedApprovedUrl = normalizeFetchedFacebookUrl(approvedUrl) || approvedUrl;
  const displayApprovedUrl = (await resolveFacebookUrlForDisplay(normalizedApprovedUrl, {
    pageLabel: String(record.establishment || '').trim(),
  })) || normalizedApprovedUrl;

  let suggestion: UnrecognizedVenueSuggestedMatch = {
    venueName: String(record.establishment || '').trim() || 'Approved Facebook Page',
    confidence: 1,
    matchType: 'apify',
    facebookUrl: displayApprovedUrl,
    note: 'Approved page submission URL (exact source page)',
  };

  suggestion = await linkSuggestionToExistingVenueByFacebookUrl(suggestion, {
    docId: record.id,
    unknownVenueName: String(record.establishment || '').trim(),
    source: 'apify',
  });

  return suggestion;
}

function decodeHtmlAttr(value: string): string {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;|&#39;/gi, '\'')
    .replace(/&#x2f;|&#47;/gi, '/');
}

function normalizeFetchedFacebookUrl(rawUrl: string): string | undefined {
  const decoded = decodeHtmlAttr(rawUrl).trim();
  if (!decoded) return undefined;

  const withProtocol = decoded.startsWith('//')
    ? `https:${decoded}`
    : decoded;
  if (!/^https?:\/\//i.test(withProtocol)) return undefined;

  try {
    const parsed = new URL(withProtocol);
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname.endsWith('facebook.com')) return undefined;

    // Reject common share/dialog/plugin URLs; we want a page-like URL.
    const pathLower = parsed.pathname.toLowerCase();
    if (
      pathLower.startsWith('/sharer') ||
      pathLower.startsWith('/share') ||
      pathLower.startsWith('/dialog') ||
      pathLower.startsWith('/plugins') ||
      pathLower.startsWith('/login') ||
      pathLower.startsWith('/hashtag') ||
      pathLower.startsWith('/ajax') ||
      pathLower.includes('/2008/fbml')
    ) {
      return undefined;
    }

    if (hostname === 'm.facebook.com') {
      parsed.hostname = 'www.facebook.com';
    }
    parsed.hash = '';

    const segments = parsed.pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
    const first = String(segments[0] || '').toLowerCase();

    // Preserve page identities that require more than one path segment (or query id).
    if (first === 'profile.php') {
      const id = String(parsed.searchParams.get('id') || '').trim();
      if (!/^\d{8,}$/.test(id)) return undefined;
      parsed.pathname = '/profile.php';
      parsed.search = `?id=${encodeURIComponent(id)}`;
      return parsed.toString().replace(/\/$/, '');
    }

    if (first === 'people' && segments.length >= 3 && /^\d{8,}$/.test(String(segments[2] || '').trim())) {
      parsed.search = '';
      parsed.pathname = `/people/${encodeURIComponent(String(segments[1] || '').trim())}/${encodeURIComponent(String(segments[2] || '').trim())}`;
      return parsed.toString().replace(/\/$/, '');
    }

    if (first === 'pages' && segments.length >= 3 && /^\d{8,}$/.test(String(segments[2] || '').trim())) {
      parsed.search = '';
      parsed.pathname = `/pages/${encodeURIComponent(String(segments[1] || '').trim())}/${encodeURIComponent(String(segments[2] || '').trim())}`;
      return parsed.toString().replace(/\/$/, '');
    }

    if (first === 'p' && segments.length >= 2) {
      parsed.search = '';
      parsed.pathname = `/p/${encodeURIComponent(String(segments[1] || '').trim())}`;
      return parsed.toString().replace(/\/$/, '');
    }

    const slug = extractFacebookSlug(parsed.toString());
    if (!slug) return undefined;
    if (['sharer.php', 'share.php', 'permalink.php', 'story.php'].includes(slug)) return undefined;

    // Drop tracking params while preserving page identity.
    parsed.search = '';
    // Canonicalize page-like URLs to the page root so /mentions, /about, /reviews, etc.
    // don't create duplicate-looking candidates or miss existing-venue Facebook matches.
    parsed.pathname = `/${slug}`;

    return parsed.toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

const WEBSITE_TRACKING_QUERY_PARAMS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
]);

function normalizeWebsiteUrlForDisplay(rawUrl?: string): string | undefined {
  const decoded = decodeHtmlAttr(String(rawUrl || '')).trim();
  if (!decoded) return undefined;

  const withProtocol = decoded.startsWith('//')
    ? `https:${decoded}`
    : decoded;
  if (!/^https?:\/\//i.test(withProtocol)) return undefined;

  try {
    const parsed = new URL(withProtocol);
    if (!/^https?:$/i.test(parsed.protocol)) return undefined;

    const keys = Array.from(new Set(Array.from(parsed.searchParams.keys())));
    for (const key of keys) {
      const normalizedKey = String(key || '').trim().toLowerCase();
      if (!normalizedKey) continue;
      if (normalizedKey.startsWith('utm_') || WEBSITE_TRACKING_QUERY_PARAMS.has(normalizedKey)) {
        parsed.searchParams.delete(key);
      }
    }

    parsed.hash = '';
    if (!Array.from(parsed.searchParams.keys()).length) {
      parsed.search = '';
    }

    return parsed.toString();
  } catch {
    return undefined;
  }
}

const FACEBOOK_DISPLAY_URL_CACHE = new Map<string, string>();
const FACEBOOK_DISPLAY_RESOLVE_TIMEOUT_MS = 8000;

function buildFacebookPeopleLabel(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2019\u2018]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function extractCanonicalFacebookUrlFromHtml(html: string): string | undefined {
  const raw = String(html || '');
  if (!raw) return undefined;

  const canonical = raw.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1];
  if (canonical) return canonical;

  const ogUrl = raw.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (ogUrl) return ogUrl;

  return undefined;
}

async function resolveFacebookUrlForDisplay(
  rawUrl: string,
  options?: { pageLabel?: string }
): Promise<string | undefined> {
  const normalized = normalizeFetchedFacebookUrl(rawUrl);
  if (!normalized) return undefined;

  const labelKey = buildFacebookPeopleLabel(String(options?.pageLabel || ''));
  const cacheKey = `${normalized.toLowerCase()}|${labelKey}`;
  const cached = FACEBOOK_DISPLAY_URL_CACHE.get(cacheKey);
  if (cached) return cached;

  let resolved = normalized;
  try {
    const parsed = new URL(normalized);
    const pathLower = parsed.pathname.toLowerCase();
    // Only resolve opaque forms; already-human URLs don't need an extra fetch.
    const shouldResolve = pathLower === '/profile.php' || pathLower.startsWith('/p/');
    if (shouldResolve) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FACEBOOK_DISPLAY_RESOLVE_TIMEOUT_MS);
      try {
        const res = await fetch(normalized, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            'user-agent': 'Mozilla/5.0 (compatible; GathrUnknownVenueResolver/1.0)',
            accept: 'text/html,application/xhtml+xml',
          },
        });

        const candidates: string[] = [];
        if (res.url) candidates.push(res.url);

        const contentType = String(res.headers.get('content-type') || '').toLowerCase();
        if (contentType.includes('html')) {
          const html = await res.text();
          const htmlCanonical = extractCanonicalFacebookUrlFromHtml(html);
          if (htmlCanonical) candidates.push(htmlCanonical);
        }

        const originalId = extractFacebookPageNumericId(normalized);
        const originalSlug = String(extractFacebookSlug(normalized) || '').trim().toLowerCase();

        for (const candidate of candidates) {
          const candidateNormalized = normalizeFetchedFacebookUrl(candidate);
          if (!candidateNormalized) continue;

          const candidateId = extractFacebookPageNumericId(candidateNormalized);
          if (originalId && candidateId && originalId !== candidateId) continue;

          const candidateSlug = String(extractFacebookSlug(candidateNormalized) || '').trim().toLowerCase();
          if (!originalId && originalSlug && candidateSlug && originalSlug !== candidateSlug) continue;

          resolved = candidateNormalized;
          break;
        }
      } finally {
        clearTimeout(timeout);
      }
    }
  } catch {
    // Fall back to normalized URL.
  }

  // Deterministic fallback for opaque profile.php?id=<id> URLs so card links
  // remain human-readable even if Facebook does not expose canonical tags.
  const resolvedId = extractFacebookPageNumericId(resolved);
  if (resolvedId) {
    try {
      const parsed = new URL(resolved);
      if (parsed.pathname.toLowerCase() === '/profile.php') {
        const label = buildFacebookPeopleLabel(String(options?.pageLabel || ''));
        if (label) {
          resolved = `https://www.facebook.com/people/${label}/${resolvedId}/`;
        }
      }
    } catch {
      // Keep resolved as-is.
    }
  }

  FACEBOOK_DISPLAY_URL_CACHE.set(cacheKey, resolved);
  return resolved;
}

function isFacebookDomainUrl(rawUrl: string): boolean {
  const decoded = decodeHtmlAttr(rawUrl).trim();
  if (!decoded) return false;
  const withProtocol = decoded.startsWith('//')
    ? `https:${decoded}`
    : decoded;
  if (!/^https?:\/\//i.test(withProtocol)) return false;
  try {
    const parsed = new URL(withProtocol);
    return parsed.hostname.toLowerCase().endsWith('facebook.com');
  } catch {
    return false;
  }
}

const WEBSITE_FACEBOOK_GENERIC_VENUE_TOKENS = new Set([
  'river',
  'resort',
  'hotel',
  'hotels',
  'inn',
  'spa',
  'golf',
  'lodge',
  'restaurant',
  'bar',
  'club',
  'course',
  'vacation',
  'vacations',
]);

const WEBSITE_FACEBOOK_UMBRELLA_TOKENS = new Set([
  'vacations',
  'hotels',
  'resorts',
  'group',
  'collection',
  'corporate',
  'official',
]);

function getWebsiteFacebookDistinctiveTokens(venueName: string): string[] {
  const normalizedVenue = normalizeVenueName(venueName);
  if (!normalizedVenue) return [];

  return Array.from(new Set(
    normalizedVenue
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token.length >= 4)
      .filter((token) => !WEBSITE_FACEBOOK_GENERIC_VENUE_TOKENS.has(token))
  ));
}

export function scoreWebsiteFacebookCandidate(venueName: string, facebookUrl: string): number {
  const slug = String(extractFacebookSlug(facebookUrl) || '').trim();
  if (!slug) return 0;
  const slugLabel = slug.replace(/[._-]+/g, ' ');
  let score = calculateEnhancedSimilarity(venueName, slugLabel);
  // Some valid page URLs are ID-based (e.g. profile.php?id=...), so they
  // cannot score well from slug text alone. Trust these more when sourced
  // from the venue's own website HTML.
  if (extractFacebookPageNumericId(facebookUrl)) {
    score = Math.max(score, 0.72);
  }
  const normalizedVenue = normalizeVenueName(venueName);
  const normalizedSlug = normalizeVenueName(slugLabel);
  if (normalizedVenue && normalizedSlug && normalizedSlug.includes(normalizedVenue)) {
    score = Math.min(1, score + 0.1);
  }
  const distinctiveTokens = getWebsiteFacebookDistinctiveTokens(venueName);
  const distinctiveMatches = distinctiveTokens.filter((token) => normalizedSlug.includes(token));
  if (distinctiveTokens.length && distinctiveMatches.length) {
    const distinctiveMatchRatio = distinctiveMatches.length / distinctiveTokens.length;
    if (distinctiveMatches.length >= 2) {
      score = Math.max(score, 0.56 + Math.min(0.16, distinctiveMatchRatio * 0.16));
    } else if (distinctiveTokens.length === 1 && distinctiveMatchRatio === 1) {
      score = Math.max(score, 0.5);
    } else {
      score = Math.max(score, score + 0.08 * distinctiveMatchRatio);
    }
  }
  const umbrellaHits = Array.from(WEBSITE_FACEBOOK_UMBRELLA_TOKENS)
    .filter((token) => normalizedSlug.includes(token))
    .length;
  if (umbrellaHits) {
    const protectiveDistinctiveMatches = distinctiveMatches.length >= 2 ? 1 : 0;
    score -= Math.max(0, umbrellaHits - protectiveDistinctiveMatches) * 0.12;
  }
  return Math.max(0, Math.min(1, score));
}

export async function extractFacebookUrlFromWebsite(
  websiteUrl: string,
  venueName: string
): Promise<string | undefined> {
  const url = String(websiteUrl || '').trim();
  if (!url) return undefined;

  const candidateUrls = Array.from(new Set([
    url,
    /^http:\/\//i.test(url) ? url.replace(/^http:\/\//i, 'https://') : '',
  ].filter(Boolean)));

  for (const candidateUrl of candidateUrls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(candidateUrl, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; GathrUnknownVenueResolver/1.0)',
          accept: 'text/html,application/xhtml+xml',
        },
      });

      if (!res.ok) continue;
      const contentType = String(res.headers.get('content-type') || '').toLowerCase();
      if (contentType && !contentType.includes('html')) continue;

      const html = await res.text();
      if (!html) continue;

      const hrefMatches = html.match(/href\s*=\s*["'][^"']*facebook\.com[^"']*["']/gi) || [];
      const rawMatches = html.match(/https?:\/\/[^\s"'<>]*facebook\.com[^\s"'<>]*/gi) || [];
      const escapedMatches = (html.match(/https?:\\\/\\\/(?:www\\\.)?facebook\.com\\\/[^\s"'<>]*/gi) || [])
        .map((value) => String(value || '').replace(/\\\//g, '/'));

      const candidates = Array.from(new Set(
        [
          ...hrefMatches.map((fragment) => {
            const m = fragment.match(/href\s*=\s*["']([^"']+)["']/i);
            return m?.[1] || '';
          }),
          ...rawMatches,
          ...escapedMatches,
        ]
          .map((href) => normalizeFetchedFacebookUrl(href))
          .filter(Boolean) as string[]
      ));

      if (!candidates.length) continue;

      const scored = candidates
        .map((candidate) => ({
          url: candidate,
          score: scoreWebsiteFacebookCandidate(venueName, candidate),
        }))
        .sort((a, b) => b.score - a.score);

      const top = scored[0];
      if (!top) continue;
      // Website-derived social link is generally high precision; keep a modest floor to avoid junk.
      if (top.score < 0.45) continue;
      return (await resolveFacebookUrlForDisplay(top.url, { pageLabel: venueName })) || top.url;
    } catch {
      // Ignore and continue to the next URL variant.
    } finally {
      clearTimeout(timeout);
    }
  }

  return undefined;
}

function parseSuggestionNoteMetadata(note?: string): ParsedSuggestionNoteMetadata {
  const raw = String(note || '').trim();
  if (!raw) return {};

  const result: ParsedSuggestionNoteMetadata = {};
  for (const part of raw.split('|')) {
    const token = String(part || '').trim();
    if (!token) continue;
    const eqIdx = token.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = token.slice(0, eqIdx).trim().toLowerCase();
    const value = decodeSuggestionNoteValue(token.slice(eqIdx + 1).trim());
    if (!value) continue;
    if (key === 'placeid') result.placeId = value;
    if (key === 'website') result.website = value;
    if (key === 'phone') result.phone = value;
    if (key === 'websitefacebookurl') result.websiteFacebookUrl = value;
    if (key === 'lat' || key === 'latitude') result.latitude = parseOptionalNumber(value);
    if (key === 'lng' || key === 'lon' || key === 'longitude') result.longitude = parseOptionalNumber(value);
    if (key === 'types' || key === 'placetypes') result.placeTypes = parseSuggestionNoteList(value);
    if (key === 'categories' || key === 'categorylist') result.categories = parseSuggestionNoteList(value);
    if (key === 'businessstatus') result.businessStatus = value;
    if (key === 'rating') result.rating = parseOptionalNumber(value);
    if (key === 'userratingstotal' || key === 'userratingcount') result.userRatingsTotal = parseOptionalNumber(value);
  }
  return result;
}

function decodeSuggestionNoteValue(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function encodeSuggestionNoteValue(value: unknown): string {
  return encodeURIComponent(String(value ?? '').trim());
}

function buildSuggestionNote(tokens: Array<[string, unknown]>): string {
  const parts: string[] = [];
  for (const [key, value] of tokens) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      const list = value
        .map((v) => String(v || '').trim())
        .filter(Boolean);
      if (!list.length) continue;
      parts.push(`${key}=${encodeSuggestionNoteValue(list.join(','))}`);
      continue;
    }
    const text = String(value).trim();
    if (!text) continue;
    parts.push(`${key}=${encodeSuggestionNoteValue(text)}`);
  }
  return parts.join(' | ');
}

function mergeSuggestionNotes(baseNote: string | undefined, tokens: Array<[string, unknown]>): string | undefined {
  const extra = buildSuggestionNote(tokens);
  if (!extra) return baseNote;
  const existing = String(baseNote || '').trim();
  if (!existing) return extra;
  return `${existing} | ${extra}`;
}

function parseSuggestionNoteList(value?: string): string[] {
  const raw = String(value || '').trim();
  if (!raw) return [];
  return Array.from(new Set(
    raw
      .split(',')
      .map((v) => String(v || '').trim())
      .filter(Boolean)
  ));
}

function parseAddressComponents(address?: string): ParsedAddressComponents {
  const raw = String(address || '').trim();
  if (!raw) return {};

  const result: ParsedAddressComponents = {};
  const postalMatch = raw.match(/\b([A-Z]\d[A-Z])\s?(\d[A-Z]\d)\b/i);
  if (postalMatch) {
    result.postalCode = `${postalMatch[1].toUpperCase()} ${postalMatch[2].toUpperCase()}`;
  }

  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return result;

  let provincePostalPart = '';
  let cityPart = '';

  if (parts.length >= 3) {
    const last = parts[parts.length - 1] || '';
    const secondLast = parts[parts.length - 2] || '';
    const thirdLast = parts[parts.length - 3] || '';

    if (/^canada$/i.test(last)) {
      provincePostalPart = secondLast;
      cityPart = thirdLast;
    } else {
      provincePostalPart = last;
      cityPart = secondLast;
    }
  } else if (parts.length === 2) {
    provincePostalPart = parts[1] || '';
    cityPart = parts[0] || '';
  }

  if (cityPart) {
    result.city = cityPart;
  }

  if (provincePostalPart) {
    const provincePostalMatch = provincePostalPart.match(/\b([A-Z]{2})\b(?:\s+([A-Z]\d[A-Z]\s?\d[A-Z]\d))?/i);
    if (provincePostalMatch) {
      result.province = provincePostalMatch[1].toUpperCase();
      if (!result.postalCode && provincePostalMatch[2]) {
        const postal = provincePostalMatch[2].replace(/\s+/g, '');
        if (postal.length === 6) {
          result.postalCode = `${postal.slice(0, 3).toUpperCase()} ${postal.slice(3).toUpperCase()}`;
        }
      }
    }
  }

  return result;
}

function chooseVenueCategory(params: {
  manualCategory?: string;
  metadataCategories?: string[];
  metadataPlaceTypes?: string[];
}): string | undefined {
  const manualCategory = String(params.manualCategory || '').trim();
  if (manualCategory) return manualCategory;

  const raw = [
    ...(params.metadataCategories || []),
    ...(params.metadataPlaceTypes || []),
  ]
    .map((v) => String(v || '').trim().toLowerCase())
    .filter(Boolean);

  if (!raw.length) return undefined;

  const normalized = Array.from(new Set(raw));

  if (normalized.some((v) => v === 'brewery')) return 'brewery';
  if (normalized.some((v) => v === 'bar' || v === 'pub' || v === 'bar_and_grill')) return 'bar';
  if (normalized.some((v) => v === 'cafe' || v === 'coffee_shop')) return 'cafe';
  if (normalized.some((v) => v === 'night_club' || v === 'nightclub')) return 'night_club';
  if (normalized.some((v) => v === 'restaurant')) return 'restaurant';

  return normalized[0]?.replace(/_/g, ' ');
}

function getFirstString(
  input: Record<string, unknown>,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = input[key];
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return undefined;
}

function getFirstNumber(
  input: Record<string, unknown>,
  keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = parseOptionalNumber(input[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function getStringList(
  input: Record<string, unknown>,
  keys: string[]
): string[] {
  for (const key of keys) {
    const value = input[key];
    if (Array.isArray(value)) {
      const list = value
        .map((entry) => String(entry || '').trim())
        .filter(Boolean);
      if (list.length) return Array.from(new Set(list));
    }
    const text = String(value ?? '').trim();
    if (!text) continue;
    const list = text
      .split(/[|,;]/)
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
    if (list.length) return Array.from(new Set(list));
  }
  return [];
}

function getNestedObject(
  input: Record<string, unknown>,
  key: string
): Record<string, unknown> | undefined {
  const value = input[key];
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function extractApifySuggestionMetadata(item: Record<string, unknown>): ParsedSuggestionNoteMetadata {
  const location = getNestedObject(item, 'location');

  const rawWebsite = getFirstString(item, ['website', 'websiteUrl', 'websiteURI', 'homepage', 'domainUrl']);
  const website = normalizeWebsiteUrlForDisplay(rawWebsite) || rawWebsite;
  const phone = getFirstString(item, ['phone', 'phoneNumber', 'telephone', 'formattedPhoneNumber']);
  const latitude = getFirstNumber(item, ['latitude', 'lat']) ?? (location ? getFirstNumber(location, ['lat', 'latitude']) : undefined);
  const longitude = getFirstNumber(item, ['longitude', 'lng', 'lon']) ?? (location ? getFirstNumber(location, ['lng', 'lon', 'longitude']) : undefined);
  const categories = getStringList(item, ['categories', 'category', 'categoryName', 'types']);

  return {
    website,
    phone,
    latitude,
    longitude,
    categories,
  };
}

async function collectExistingVenueSuggestions(
  record: UnrecognizedVenueRecord,
  cfg: ResolverConfig
): Promise<UnrecognizedVenueSuggestedMatch[]> {
  const suggestions: UnrecognizedVenueSuggestedMatch[] = [];
  const rawName = String(record.establishment || '').trim();
  if (!rawName) return suggestions;
  const matchNameCandidates = getExistingMatchNameCandidates(rawName);
  const normalizedMatchNames = new Set(matchNameCandidates.map((name) => normalizeVenueName(name)));
  const contextHints = getResolverGeoHints(record);
  const cityHint = normalizeCity(contextHints.cityHint);
  const provinceHint = normalizeProvince(contextHints.provinceHint);
  const recordAddressKeys = new Set(getRecordAddressMatchKeys(record));
  const recordAddressLooseKeys = new Set(getRecordAddressLooseMatchKeys(record));
  const unknownLooksAddressLike = isAddressLikeUnknownVenueName(rawName);
  const unknownCivicKey = unknownLooksAddressLike ? normalizeCivicAddressKey(rawName) : '';

  for (const aggregatorFacebookUrl of getSampleAggregatorFacebookUrls(record)) {
    let aggregatorMatch:
      | Awaited<ReturnType<typeof firestoreService.findMatchingVenue>>
      | null = null;
    let matchedInputName = rawName;
    for (const matchName of matchNameCandidates) {
      const attempted = await firestoreService.findMatchingVenue(matchName, aggregatorFacebookUrl);
      if (!attempted.isMatch || !attempted.matchedVenue) continue;
      aggregatorMatch = attempted;
      matchedInputName = matchName;
      break;
    }
    if (!aggregatorMatch?.isMatch || !aggregatorMatch.matchedVenue) continue;

    const venueAny = aggregatorMatch.matchedVenue as unknown as Record<string, unknown>;
    const matchedVenueName = getVenueDisplayName(venueAny) || aggregatorMatch.matchedVenue.name || '';
    if (!matchedVenueName) continue;
    const matchedVenueAddress = getVenueAddress(venueAny);
    const matchedVenueAddressKey = normalizeAddressMatchKey(matchedVenueAddress);
    const matchedVenueAddressLooseKey = normalizeAddressLooseMatchKey(matchedVenueAddress);

    const exactName = normalizeVenueName(matchedVenueName) === normalizeVenueName(rawName);
    const tokenAlias = candidateContainsUnknownNameTokens(rawName, matchedVenueName);
    const addressExact = Boolean(matchedVenueAddressKey && recordAddressKeys.has(matchedVenueAddressKey));
    const addressLoose = Boolean(matchedVenueAddressLooseKey && recordAddressLooseKeys.has(matchedVenueAddressLooseKey));
    const matchedVenueCivicKey = normalizeCivicAddressKey(matchedVenueAddress);
    const addressLikeCivicMatch = Boolean(
      unknownLooksAddressLike
      && unknownCivicKey
      && matchedVenueCivicKey
      && unknownCivicKey === matchedVenueCivicKey
    );
    if (!exactName && !tokenAlias && !addressExact && !addressLoose && !addressLikeCivicMatch) continue;
    if ((cityHint || provinceHint) && !venueMatchesResolverGeoHints(record, venueAny)) continue;

    suggestions.push({
      venueId: aggregatorMatch.matchedVenue.id,
      venueName: matchedVenueName,
      confidence: 1,
      matchType: exactName ? 'exact' : 'alias',
      address: matchedVenueAddress,
      facebookUrl: getVenueFacebookUrl(venueAny),
      note: buildSuggestionNote([
        ['matcher', 'aggregatorFacebookUrl'],
        ['sourceAggregatorUrl', aggregatorFacebookUrl],
        ['inputName', matchedInputName],
        ['exactName', exactName ? '1' : '0'],
        ['tokenAlias', tokenAlias ? '1' : '0'],
        ['addressExact', addressExact ? '1' : '0'],
        ['addressLoose', addressLoose ? '1' : '0'],
        ['addressLikeCivicMatch', addressLikeCivicMatch ? '1' : '0'],
        ['matchedVenueAddress', matchedVenueAddress],
      ]) || (
        exactName
          ? 'Aggregator Facebook URL matched existing venue'
          : addressExact
            ? 'Aggregator Facebook URL matched existing venue (address-exact support)'
            : addressLoose
              ? 'Aggregator Facebook URL matched existing venue (address-loose support)'
              : addressLikeCivicMatch
                ? 'Aggregator Facebook URL matched existing venue (address-like civic support)'
                : 'Aggregator Facebook URL matched existing venue (token-contained alias)'
      ),
    });
    break;
  }

  for (const matchName of matchNameCandidates) {
    const exactMatch = await firestoreService.findMatchingVenue(matchName);
    if (!exactMatch.isMatch || !exactMatch.matchedVenue) continue;

    const venueAny = exactMatch.matchedVenue as unknown as Record<string, unknown>;
    suggestions.push({
      venueId: exactMatch.matchedVenue.id,
      venueName: getVenueDisplayName(venueAny) || exactMatch.matchedVenue.name,
      confidence: exactMatch.similarity,
      matchType: exactMatch.matchType === 'fuzzy' ? 'fuzzy' : 'exact',
      address: getVenueAddress(venueAny),
      facebookUrl: getVenueFacebookUrl(venueAny),
      note: buildSuggestionNote([
        ['matcher', 'findMatchingVenue'],
        ['matchType', exactMatch.matchType],
        ['matchScore', exactMatch.similarity],
        ['inputName', matchName],
        ['inputVariant', matchName === rawName ? 'raw' : 'strippedParenthesizedAddress'],
      ]) || (
        matchName === rawName
          ? `findMatchingVenue (${exactMatch.matchType})`
          : `findMatchingVenue (${exactMatch.matchType}; stripped parenthesized address)`
      ),
    });
    break;
  }

  const aliasCandidates = Array.from(new Set(matchNameCandidates.flatMap((name) => getVenueAliasCandidates(name))));
  for (const alias of aliasCandidates) {
    const aliasMatch = await firestoreService.findMatchingVenue(alias);
    if (!aliasMatch.isMatch || !aliasMatch.matchedVenue) continue;
    const venueAny = aliasMatch.matchedVenue as unknown as Record<string, unknown>;
    suggestions.push({
      venueId: aliasMatch.matchedVenue.id,
      venueName: getVenueDisplayName(venueAny) || aliasMatch.matchedVenue.name,
      confidence: Math.max(0.97, aliasMatch.similarity),
      matchType: 'alias',
      address: getVenueAddress(venueAny),
      facebookUrl: getVenueFacebookUrl(venueAny),
      note: buildSuggestionNote([
        ['matcher', 'staticAlias'],
        ['alias', alias],
        ['matchScore', aliasMatch.similarity],
      ]) || `Static alias candidate "${alias}"`,
    });
  }

  // Add a few fuzzy alternatives for manual review.
  const targetNormalized = normalizeVenueName(matchNameCandidates[matchNameCandidates.length - 1] || rawName);
  const venues = await firestoreService.getAllVenues();
  const fuzzy: UnrecognizedVenueSuggestedMatch[] = [];
  const fuzzyMin = Math.max(0.55, Math.min(Number(cfg.existingSuggestionFuzzyMin || 0.7), 0.95));
  for (const venue of venues) {
    const venueAny = venue as unknown as Record<string, unknown>;
    const venueName = getVenueDisplayName(venueAny) || venue.name || '';
    if (!venueName) continue;

    let score = Math.max(...matchNameCandidates.map((name) => calculateEnhancedSimilarity(name, venueName)));
    const tokenExtensionBoostApplied = matchNameCandidates.some((name) => candidateExtendsUnknownNameByTokens(name, venueName));
    let tokenExtensionBoost = 0;
    let cityBoost = 0;
    let provinceBoost = 0;
    let addressBoost = 0;
    let exactNameBoost = 0;
    if (tokenExtensionBoostApplied) {
      // Boost common "base venue name + city qualifier" cases (e.g. "Eastlink Centre" vs
      // "Eastlink Centre Charlottetown") so they clear the manual-review fuzzy threshold.
      score = Math.min(1, score + 0.08);
      tokenExtensionBoost = 0.08;
    }
    const venueAddress = getVenueAddress(venueAny);
    if (cityHint && normalizeVenueName(venueAddress).includes(normalizeVenueName(cityHint))) {
      score = Math.min(1, score + 0.04);
      cityBoost = 0.04;
    }
    if (provinceHint && normalizeVenueName(venueAddress).includes(normalizeVenueName(provinceHint))) {
      score = Math.min(1, score + 0.02);
      provinceBoost = 0.02;
    }
    const venueAddressKey = normalizeAddressMatchKey(venueAddress);
    if (venueAddressKey && recordAddressKeys.has(venueAddressKey)) {
      score = Math.min(1, score + 0.12);
      addressBoost = 0.12;
    }
    if (normalizedMatchNames.has(normalizeVenueName(venueName)) || normalizeVenueName(venueName) === targetNormalized) {
      if (score < 1) {
        exactNameBoost = Number((1 - score).toFixed(3));
      }
      score = Math.max(score, 1);
    }
    if (score < fuzzyMin) continue;

    fuzzy.push({
      venueId: venue.id,
      venueName,
      confidence: score,
      matchType: score >= 0.98 ? 'exact' : 'fuzzy',
      address: venueAddress,
      facebookUrl: getVenueFacebookUrl(venueAny),
      note: buildSuggestionNote([
        ['matcher', 'fuzzyCollection'],
        ['fuzzyScore', score],
        ['fuzzyMin', fuzzyMin],
        ['tokenExtensionBoost', tokenExtensionBoost],
        ['cityBoost', cityBoost],
        ['provinceBoost', provinceBoost],
        ['addressBoost', addressBoost],
        ['exactNameBoost', exactNameBoost],
      ]) || 'Fuzzy candidate from venues collection',
    });
  }

  fuzzy.sort((a, b) => b.confidence - a.confidence);
  suggestions.push(...fuzzy.slice(0, 5));
  return dedupeSuggestions(suggestions);
}

async function collectPlacesSuggestion(
  record: UnrecognizedVenueRecord
): Promise<UnrecognizedVenueSuggestedMatch[]> {
  const rawName = String(record.establishment || '').trim();
  if (!rawName) return [];
  const placesSearchNameCandidates = getPlacesSearchNameCandidates(rawName);

  const contextHints = getResolverGeoHints(record);
  const cityHint = normalizeCity(contextHints.cityHint);
  const provinceHint = normalizeProvince(contextHints.provinceHint);
  const sampleHints = inferResolverGeoHintsFromSampleEvents(record);
  const sampleCityHint = normalizeCity(sampleHints.cityHint);
  const sampleProvinceHint = normalizeProvince(sampleHints.provinceHint);
  const fallbackAddressFromSamples = buildResolverAddressFallbackFromSamples(record);
  const aggregatorAddresses = getSampleAggregatorAddresses(record);
  const queryCandidates: string[] = [];
  const seenQueryCandidates = new Set<string>();
  const addQueryCandidate = (value: string): void => {
    const normalized = String(value || '').trim();
    if (!normalized) return;
    const key = normalizeVenueName(normalized);
    if (seenQueryCandidates.has(key)) return;
    seenQueryCandidates.add(key);
    queryCandidates.push(normalized);
  };

  for (const searchName of placesSearchNameCandidates) {
    for (const aggregatorAddress of aggregatorAddresses) {
      addQueryCandidate(`${searchName} ${aggregatorAddress}`);
    }
  }
  for (const aggregatorAddress of aggregatorAddresses) {
    addQueryCandidate(aggregatorAddress);
  }

  if (fallbackAddressFromSamples) {
    for (const searchName of placesSearchNameCandidates) {
      addQueryCandidate(`${searchName} ${fallbackAddressFromSamples}`);
    }
    addQueryCandidate(fallbackAddressFromSamples);
  }

  const cityCandidates = Array.from(new Set([sampleCityHint, cityHint].map((v) => String(v || '').trim()).filter(Boolean)));
  const provinceCandidates = Array.from(new Set([sampleProvinceHint, provinceHint, 'PE'].map((v) => String(v || '').trim()).filter(Boolean)));
  for (const searchName of placesSearchNameCandidates) {
    for (const candidateCity of cityCandidates) {
      for (const candidateProvince of provinceCandidates) {
        addQueryCandidate([searchName, candidateCity, candidateProvince].filter(Boolean).join(' '));
      }
      addQueryCandidate([searchName, candidateCity].filter(Boolean).join(' '));
    }
    for (const candidateProvince of provinceCandidates) {
      addQueryCandidate([searchName, candidateProvince].filter(Boolean).join(' '));
    }
    addQueryCandidate(searchName);
  }

  const foodVenuePattern = /\b(brew(?:ery|pub)?|coffee|cafe|restaurant|bar|pub|kitchen|grill|bistro|pizza|diner|eatery)\b/i;
  const preferRestaurantSearchFirst = foodVenuePattern.test(rawName);

  try {
    const scoreRecord = {
      ...record,
      cityHint: cityHint || record.cityHint,
      provinceHint: provinceHint || record.provinceHint,
    } as UnrecognizedVenueRecord;

    const finalizePlaceCandidate = async (
      place: Awaited<ReturnType<typeof placesService.searchPlace>>,
      queryUsed: string,
      searchMode: 'restaurant' | 'broad'
    ): Promise<UnrecognizedVenueSuggestedMatch[]> => {
      const details = place?.placeId ? await placesService.getPlaceDetails(place.placeId) : null;
      const address = details?.formattedAddress || place?.formattedAddress || '';
      const placesName = String(details?.name || place?.name || rawName).trim();
      const placesConfidence = Math.max(
        ...placesSearchNameCandidates.map((candidateName) => scoreApifyCandidate(candidateName, placesName, address, scoreRecord))
      );
      const rawWebsite = details?.website || '';
      const normalizedWebsite = normalizeWebsiteUrlForDisplay(rawWebsite) || rawWebsite;
      const website = isFacebookDomainUrl(normalizedWebsite) ? '' : normalizedWebsite;
      const phone = details?.formattedPhoneNumber || '';
      const directWebsiteFacebookUrl = rawWebsite ? normalizeFetchedFacebookUrl(rawWebsite) : undefined;
      let websiteFacebookUrlRaw = directWebsiteFacebookUrl;
      if (!websiteFacebookUrlRaw && rawWebsite) {
        const websiteFacebookNameCandidates = Array.from(new Set(
          [placesName, ...placesSearchNameCandidates, rawName]
            .map((value) => String(value || '').trim())
            .filter(Boolean)
        ));
        for (const candidateVenueName of websiteFacebookNameCandidates) {
          websiteFacebookUrlRaw = await extractFacebookUrlFromWebsite(rawWebsite, candidateVenueName);
          if (websiteFacebookUrlRaw) break;
        }
      }
      const websiteFacebookUrl = websiteFacebookUrlRaw
        ? ((await resolveFacebookUrlForDisplay(websiteFacebookUrlRaw, { pageLabel: placesName || rawName })) || websiteFacebookUrlRaw)
        : undefined;

      let suggestion: UnrecognizedVenueSuggestedMatch = {
        venueName: placesName,
        confidence: Math.max(0.7, placesConfidence),
        matchType: 'places',
        address,
        facebookUrl: websiteFacebookUrl || undefined,
        note: buildSuggestionNote([
          ['placeId', place?.placeId],
          ['website', website],
          ['phone', phone],
          ['websiteFacebookUrl', websiteFacebookUrl],
          ['lat', place?.location?.lat],
          ['lng', place?.location?.lng],
          ['types', place?.types || []],
          ['businessStatus', place?.businessStatus],
          ['rating', details?.rating],
          ['userRatingsTotal', details?.userRatingsTotal],
          ['placesQuery', queryUsed],
          ['placesSearchMode', searchMode],
        ]) || 'Google Places candidate',
      };

      suggestion = await linkSuggestionToExistingVenueByFacebookUrl(suggestion, {
        docId: record.id,
        unknownVenueName: rawName,
        source: 'places',
      });
      if (!suggestion.venueId) {
        suggestion = await linkSuggestionToExistingVenueByPlaceId(suggestion, place?.placeId, {
          docId: record.id,
          unknownVenueName: rawName,
          source: 'places',
        });
      }
      if (!suggestion.venueId) {
        suggestion = await linkSuggestionToExistingVenueByAddress(suggestion, scoreRecord, {
          docId: record.id,
          unknownVenueName: rawName,
          source: 'places',
        });
      }

      const normalizedAggregatorUrls = new Set(
        getSampleAggregatorFacebookUrls(record)
          .map((value) => normalizeUrl(value))
          .filter(Boolean)
      );
      const linkedVenueFacebookUrlNormalized = normalizeUrl(String(suggestion.facebookUrl || ''));
      const linkedVenueAddressKey = normalizeAddressMatchKey(String(suggestion.address || ''));
      const linkedVenueAddressLooseKey = normalizeAddressLooseMatchKey(String(suggestion.address || ''));
      const aggregatorAddressKeys = new Set(
        [
          ...getSampleAggregatorAddresses(record),
          fallbackAddressFromSamples || '',
        ]
          .map((value) => normalizeAddressMatchKey(value))
          .filter(Boolean)
      );
      const aggregatorAddressLooseKeys = new Set(
        [
          ...getRecordAddressLooseMatchKeys(scoreRecord),
          ...[
            ...getSampleAggregatorAddresses(record),
            fallbackAddressFromSamples || '',
          ].map((value) => normalizeAddressLooseMatchKey(value)),
        ]
          .filter(Boolean)
      );
      const aggregatorSupportsLowConfidencePlaces = Boolean(
        suggestion.venueId && (
          (linkedVenueFacebookUrlNormalized && normalizedAggregatorUrls.has(linkedVenueFacebookUrlNormalized)) ||
          (linkedVenueAddressKey && aggregatorAddressKeys.has(linkedVenueAddressKey)) ||
          (linkedVenueAddressLooseKey && aggregatorAddressLooseKeys.has(linkedVenueAddressLooseKey))
        )
      );

      if (placesConfidence < 0.55 && !aggregatorSupportsLowConfidencePlaces) {
        logger.info('Dropped low-confidence Places candidate for unknown venue', {
          docId: record.id,
          venueName: rawName,
          candidateName: placesName,
          address,
          confidence: placesConfidence,
          queryUsed,
          searchMode,
        });
        if (fallbackAddressFromSamples) {
          return [{
            venueName: rawName,
            confidence: 0.82,
            matchType: 'manual',
            address: fallbackAddressFromSamples,
            note: buildSuggestionNote([
              ['fallbackReason', 'sample_address_low_confidence_places'],
              ['fallbackAddress', fallbackAddressFromSamples],
              ['placesCandidate', placesName],
              ['placesAddress', address],
              ['placesConfidence', placesConfidence],
              ['placesQuery', queryUsed],
            ]) || 'Manual fallback from sample event address',
          }];
        }
        return [];
      }

      if (placesConfidence < 0.55 && aggregatorSupportsLowConfidencePlaces) {
        suggestion.confidence = Math.max(Number(suggestion.confidence || 0), 0.88);
        suggestion.note = mergeSuggestionNotes(suggestion.note, [
          ['rescuedLowConfidence', '1'],
          ['rescueReason', 'aggregator_source_address_or_page_match'],
          ['placesConfidence', placesConfidence],
          ['placesQuery', queryUsed],
          ['placesAddress', address],
          ['linkedVenueAddress', suggestion.address],
        ]) || suggestion.note;
        logger.info('Kept low-confidence Places candidate due to aggregator source corroboration', {
          docId: record.id,
          venueName: rawName,
          candidateName: placesName,
          linkedVenueId: suggestion.venueId,
          linkedVenueName: suggestion.venueName,
          address,
          confidence: placesConfidence,
          queryUsed,
        });
      }

      const shouldAddManualAddressFallback = Boolean(
        fallbackAddressFromSamples &&
        !suggestion.venueId &&
        !placesSearchNameCandidates.some((candidateName) => candidateContainsUnknownNameTokens(candidateName, placesName))
      );
      if (shouldAddManualAddressFallback) {
        const manualFallbackSuggestion: UnrecognizedVenueSuggestedMatch = {
          venueName: rawName,
          confidence: Math.max(0.82, Math.min(0.93, placesConfidence + 0.12)),
          matchType: 'manual',
          address: fallbackAddressFromSamples,
          note: buildSuggestionNote([
            ['fallbackReason', 'sample_address_mismatch'],
            ['fallbackAddress', fallbackAddressFromSamples],
            ['placesCandidate', placesName],
            ['placesAddress', address],
            ['placesConfidence', placesConfidence],
            ['placesQuery', queryUsed],
          ]) || 'Manual fallback from sample event address',
        };
        return dedupeSuggestions([manualFallbackSuggestion, suggestion]);
      }

      return [suggestion];
    };

    const highPrioritySearchNames = placesSearchNameCandidates.filter((candidateName) => (
      candidateName !== rawName && !/[(),]/.test(candidateName)
    ));
    for (const searchName of highPrioritySearchNames.slice(0, 2)) {
      const directQueries = Array.from(new Set([
        [searchName, cityHint, provinceHint || 'PE'].filter(Boolean).join(' '),
        [searchName, cityHint].filter(Boolean).join(' '),
        [searchName, provinceHint || 'PE'].filter(Boolean).join(' '),
        searchName,
      ].filter(Boolean)));

      for (const directQuery of directQueries) {
        const directPlace = await placesService.searchPlace(directQuery);
        if (!directPlace) continue;
        const directPlaceName = String(directPlace.name || '').trim();
        const strongCleanNameMatch = (
          calculateEnhancedSimilarity(searchName, directPlaceName) >= 0.74 ||
          candidateContainsUnknownNameTokens(searchName, directPlaceName) ||
          candidateExtendsUnknownNameByTokens(searchName, directPlaceName)
        );
        if (!strongCleanNameMatch) continue;

        const finalized = await finalizePlaceCandidate(directPlace, directQuery, 'broad');
        if (finalized.length) return finalized;
      }
    }

    let place: Awaited<ReturnType<typeof placesService.searchPlace>> = null;
    let queryUsed = '';
    let searchMode: 'restaurant' | 'broad' = 'restaurant';

    for (const query of queryCandidates.slice(0, 10)) {
      const attempts: Array<{ mode: 'restaurant' | 'broad'; options?: { types?: string[] } }> =
        preferRestaurantSearchFirst
          ? [
              { mode: 'restaurant', options: { types: ['restaurant'] } },
              { mode: 'broad' },
            ]
          : [
              { mode: 'broad' },
              { mode: 'restaurant', options: { types: ['restaurant'] } },
            ];

      for (const attempt of attempts) {
        place = await placesService.searchPlace(query, attempt.options);
        if (place) {
          queryUsed = query;
          searchMode = attempt.mode;
          break;
        }
      }

      if (place) break;
    }

    if (!place) return [];
    return await finalizePlaceCandidate(place, queryUsed, searchMode);
  } catch (error) {
    logger.warn('Google Places suggestion lookup failed for unrecognized venue', {
      docId: record.id,
      venueName: rawName,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

function buildApifySearchInput(record: UnrecognizedVenueRecord, cfg: ResolverConfig): Record<string, unknown> {
  const name = String(record.establishment || '').trim();
  const hints = getResolverGeoHints(record);
  const city = normalizeCity(hints.cityHint);
  const province = normalizeProvince(hints.provinceHint) || 'PE';
  const pageSubmissionMode = isPageSubmissionVenueDiscoveryRecord(record);
  const exactPageSeeds = pageSubmissionMode
    ? Array.from(
        new Set(
          getSampleAggregatorFacebookUrls(record)
            .map((url) => normalizeFetchedFacebookUrl(url) || String(url || '').trim())
            .filter(Boolean)
        )
      )
    : [];

  const searchSeedTerms = exactPageSeeds.length
    ? exactPageSeeds
    : Array.from(
        new Set([
          name,
          city ? `${name} ${city}` : '',
        ].filter(Boolean))
      );

  const categories = Array.from(
    new Set([
      ...searchSeedTerms,
      ...(exactPageSeeds.length
        ? [name, city ? `${name} ${city}` : ''].filter(Boolean)
        : []),
    ])
  );

  return {
    categories,
    searchTerms: searchSeedTerms,
    locations: exactPageSeeds.length ? [] : (city ? [`${city}, ${province}`] : []),
    ...(exactPageSeeds.length ? {} : { country: 'CA' }),
    resultsLimit: cfg.apifyResultsLimit,
  };
}

function scoreApifyCandidate(
  venueName: string,
  candidateName: string,
  candidateAddress?: string,
  record?: UnrecognizedVenueRecord
): number {
  let score = calculateEnhancedSimilarity(venueName, candidateName);
  const geo = getResolverGeoMatchSignalsForCandidate(record, candidateName, candidateAddress);
  if (geo.cityMatch) {
    score = Math.min(1, score + 0.05);
  }
  if (geo.provinceMatch) {
    score = Math.min(1, score + 0.02);
  }

  if ((geo.cityMatch || geo.provinceMatch) && candidateExtendsUnknownNameByTokens(venueName, candidateName)) {
    score = Math.min(1, score + 0.08);
  }

  return Math.max(0, Math.min(1, score));
}

function evaluateApifyCandidateGeo(
  record: UnrecognizedVenueRecord | undefined,
  candidateName: string,
  candidateAddress?: string
): {
  cityMatch: boolean;
  provinceMatch: boolean;
  canadaMatch: boolean;
  usMatch: boolean;
  peiMatch: boolean;
} {
  const cityHint = normalizeCity(record?.cityHint);
  const provinceHint = normalizeProvince(record?.provinceHint);
  const corpus = `${candidateName || ''} ${candidateAddress || ''}`;
  const { cityMatch, provinceMatch, peiMatch } = getResolverGeoMatchSignalsForCandidate(record, candidateName, candidateAddress);
  const canadaMatch = /\bcanada\b/i.test(corpus) || peiMatch || /\b(?:ns|nb|nl|on|qc|ab|bc|sk|mb)\b/i.test(corpus);
  const usMatch = /\b(united states|usa)\b/i.test(corpus) || /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(corpus);

  return { cityMatch, provinceMatch, canadaMatch, usMatch, peiMatch };
}

function shouldKeepApifyCandidate(params: {
  confidence: number;
  record: UnrecognizedVenueRecord;
  candidateName: string;
  candidateAddress?: string;
}): boolean {
  const { confidence, record, candidateName, candidateAddress } = params;
  const geo = evaluateApifyCandidateGeo(record, candidateName, candidateAddress);
  const hasGeoHint = Boolean(normalizeCity(record.cityHint) || normalizeProvince(record.provinceHint));
  const geoMatch = geo.cityMatch || geo.provinceMatch;

  // Global floor to avoid unrelated noise dominating emails.
  if (confidence < 0.55) return false;

  // If the candidate looks US-based, require extremely strong name confidence.
  if (geo.usMatch && confidence < 0.92) return false;

  if (hasGeoHint) {
    if (!geoMatch && confidence < 0.9) return false;
    if (normalizeProvince(record.provinceHint) === 'PE' && !geo.peiMatch && confidence < 0.93) return false;
  } else {
    // No hint: prefer Canada results and very strong name matches.
    if (!geo.canadaMatch && confidence < 0.9) return false;
  }

  return true;
}

async function collectApifySuggestions(
  record: UnrecognizedVenueRecord,
  cfg: ResolverConfig
): Promise<UnrecognizedVenueSuggestedMatch[]> {
  if (!cfg.apifyEnabled || !cfg.apifyActorId || !cfg.apifyToken) return [];

  try {
    const hints = getResolverGeoHints(record);
    const recordForSearch = {
      ...record,
      cityHint: hints.cityHint || record.cityHint,
      provinceHint: hints.provinceHint || record.provinceHint,
    } as UnrecognizedVenueRecord;

    const input = buildApifySearchInput(recordForSearch, cfg);
    const pageSubmissionMode = isPageSubmissionVenueDiscoveryRecord(recordForSearch);
    const forceKeepApifyBySourcePageKey = pageSubmissionMode
      ? new Set(
          getSampleAggregatorFacebookUrls(recordForSearch)
            .map((url) => getFacebookPageIdentityKey(url))
            .filter(Boolean)
        )
      : new Set<string>();
    const items = await apifyService.runActorAndFetchDatasetItems(
      cfg.apifyActorId,
      cfg.apifyToken,
      input,
      {
        waitForFinishSeconds: 90,
        datasetLimit: cfg.apifyResultsLimit,
      }
    );

    const rawName = String(record.establishment || '').trim();
    const suggestions: UnrecognizedVenueSuggestedMatch[] = [];
    let droppedCount = 0;
    let forceKeptBySourcePageMatch = 0;
    for (const item of items) {
      const candidateName = String(item.title || item.pageName || item.name || '').trim();
      const rawCandidateUrl = String(item.facebookUrl || item.pageUrl || item.url || '').trim();
      const normalizedCandidateUrl = normalizeFetchedFacebookUrl(rawCandidateUrl);
      const candidateUrl = normalizedCandidateUrl
        ? ((await resolveFacebookUrlForDisplay(normalizedCandidateUrl, {
            pageLabel: candidateName || rawName,
          })) || normalizedCandidateUrl)
        : undefined;
      const candidateAddress = String(item.address || item.fullAddress || '').trim();
      const scoringUrl = candidateUrl || rawCandidateUrl;
      if (!candidateName && !scoringUrl) continue;

      const slugFallback = scoringUrl
        ? String(extractFacebookSlug(scoringUrl) || '').replace(/[._-]+/g, ' ').trim()
        : '';
      const scoringName = candidateName || slugFallback;
      if (!scoringName) continue;

      const candidateIdentityKey = getFacebookPageIdentityKey(candidateUrl || rawCandidateUrl);
      const exactSourcePageMatch = Boolean(
        candidateIdentityKey && forceKeepApifyBySourcePageKey.has(candidateIdentityKey)
      );
      let confidence = scoreApifyCandidate(rawName, scoringName, candidateAddress, recordForSearch);
      if (exactSourcePageMatch) {
        confidence = Math.max(confidence, 1);
        forceKeptBySourcePageMatch += 1;
      } else if (!shouldKeepApifyCandidate({
        confidence,
        record: recordForSearch,
        candidateName: candidateName || scoringName,
        candidateAddress,
      })) {
        droppedCount += 1;
        continue;
      }
      const apifyMeta = extractApifySuggestionMetadata(item);
      let suggestion: UnrecognizedVenueSuggestedMatch = {
        venueName: candidateName || rawName,
        confidence,
        matchType: 'apify',
        address: candidateAddress || undefined,
        facebookUrl: candidateUrl || undefined,
        note: buildSuggestionNote([
          ['website', apifyMeta.website],
          ['phone', apifyMeta.phone],
          ['lat', apifyMeta.latitude],
          ['lng', apifyMeta.longitude],
          ['categories', apifyMeta.categories || []],
        ]) || 'Apify single-actor candidate',
      };

      suggestion = await linkSuggestionToExistingVenueByFacebookUrl(suggestion, {
        docId: record.id,
        unknownVenueName: rawName,
        source: 'apify',
      });
      if (!suggestion.venueId) {
        suggestion = await linkSuggestionToExistingVenueByAddress(suggestion, recordForSearch, {
          docId: record.id,
          unknownVenueName: rawName,
          source: 'apify',
        });
      }

      suggestions.push(suggestion);
    }
    const deduped = dedupeSuggestions(suggestions).slice(0, 5);
    logger.info('Apify unknown-venue suggestion filter summary', {
      docId: record.id,
      venueName: rawName,
      returnedItems: items.length,
      keptSuggestions: deduped.length,
      droppedCount,
      forceKeptBySourcePageMatch,
    });
    return deduped;
  } catch (error) {
    logger.warn('Apify suggestion lookup failed for unrecognized venue', {
      docId: record.id,
      venueName: record.establishment,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

async function lookupCreateNewFacebookUrl(
  record: UnrecognizedVenueRecord,
  params: {
    venueName: string;
    city?: string;
    province?: string;
    cfg: ResolverConfig;
  }
): Promise<CreateNewFacebookLookupResult> {
  const venueName = String(params.venueName || '').trim();
  if (!venueName) {
    return {
      attempted: false,
      warning: 'Missing venue name for Facebook lookup',
    };
  }

  const cfg = params.cfg;
  if (!cfg.apifyActorId || !cfg.apifyToken) {
    return {
      attempted: false,
      warning: 'APIFY_TOKEN or UNKNOWN_VENUE_APIFY_ACTOR_ID not configured',
    };
  }

  const lookupRecord = {
    ...record,
    establishment: venueName,
    cityHint: params.city || record.cityHint,
    provinceHint: params.province || record.provinceHint,
    establishmentNormalized: normalizeVenueName(venueName) || record.establishmentNormalized,
  } as UnrecognizedVenueRecord;

  // Finalization lookup should still run even if resolver-level Apify suggestions are disabled.
  const apifySuggestions = await collectApifySuggestions(lookupRecord, {
    ...cfg,
    apifyEnabled: true,
  });

  const candidates = apifySuggestions
    .filter((candidate) => Boolean(String(candidate.facebookUrl || '').trim()))
    .sort((a, b) => b.confidence - a.confidence);

  if (!candidates.length) {
    return {
      attempted: true,
      source: 'apify',
      warning: 'No Facebook candidates returned by Apify',
    };
  }

  const top = candidates[0];
  if (!top.facebookUrl) {
    return {
      attempted: true,
      source: 'apify',
      warning: 'Top Apify candidate did not include a Facebook URL',
    };
  }

  // Keep this conservative to avoid appending low-confidence pages to the scraper seed list.
  if (top.confidence < 0.9) {
    return {
      attempted: true,
      source: 'apify',
      candidateName: top.venueName,
      confidence: top.confidence,
      warning: `No high-confidence Facebook candidate (top=${Math.round(top.confidence * 100)}%)`,
    };
  }

  return {
    attempted: true,
    source: 'apify',
    facebookUrl: String(top.facebookUrl).trim(),
    candidateName: top.venueName,
    confidence: top.confidence,
  };
}

function chooseNextStatusAndResolution(
  record: UnrecognizedVenueRecord,
  suggestions: UnrecognizedVenueSuggestedMatch[],
  cfg: ResolverConfig
): {
  status: UnrecognizedVenueStatus;
  resolvedVenueId?: string;
  note: string;
} {
  const topExisting = suggestions.find((s) => Boolean(s.venueId));
  if (topExisting?.venueId && cfg.autoResolveExisting && topExisting.confidence >= 0.98) {
    return {
      status: 'resolved_existing',
      resolvedVenueId: topExisting.venueId,
      note: `Auto-resolved to existing venue (${topExisting.matchType})`,
    };
  }

  if (cfg.autoCreateEnabled) {
    const topNoVenue = suggestions.find((s) => !s.venueId);
    if (topNoVenue && topNoVenue.confidence >= cfg.autoCreateConfidence) {
      return {
        status: 'candidate_found',
        note: 'Auto-create candidate threshold met (creation disabled in this phase)',
      };
    }
  }

  if (suggestions.length > 0) {
    return {
      status: 'manual_review',
      note: 'Suggestions generated; awaiting manual review',
    };
  }

  return {
    status: 'manual_review',
    note: 'No viable suggestions generated; awaiting manual review',
  };
}

function getRestaurantsListFileId(): string {
  return String(process.env.PEI_RESTAURANTS_GDRIVE_FILE_ID || '').trim();
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : undefined;
}

function selectSuggestion(
  record: UnrecognizedVenueRecord,
  candidateIndex?: number
): UnrecognizedVenueSuggestedMatch | null {
  const suggestions = Array.isArray(record.suggestedMatches) ? record.suggestedMatches : [];
  if (!suggestions.length) return null;
  const idx = Number(candidateIndex);
  if (Number.isInteger(idx) && idx >= 0 && idx < suggestions.length) {
    return suggestions[idx] as UnrecognizedVenueSuggestedMatch;
  }
  return (suggestions[0] as UnrecognizedVenueSuggestedMatch) || null;
}

function collectRelatedSuggestionMetadataForExisting(
  record: UnrecognizedVenueRecord,
  params: {
    venueId: string;
    selectedFacebookUrl?: string;
    excludeSuggestion?: UnrecognizedVenueSuggestedMatch | null;
  }
): ParsedSuggestionNoteMetadata {
  const targetVenueId = String(params.venueId || '').trim();
  const targetFacebookUrl = normalizeUrl(String(params.selectedFacebookUrl || '').trim());
  const suggestions = Array.isArray(record.suggestedMatches) ? record.suggestedMatches : [];
  const related = suggestions
    .filter((suggestion): suggestion is UnrecognizedVenueSuggestedMatch => Boolean(suggestion))
    .filter((suggestion) => suggestion !== params.excludeSuggestion)
    .filter((suggestion) => {
      const suggestionVenueId = String(suggestion.venueId || '').trim();
      if (targetVenueId && suggestionVenueId && suggestionVenueId === targetVenueId) return true;
      if (!targetFacebookUrl) return false;
      return normalizeUrl(String(suggestion.facebookUrl || '').trim()) === targetFacebookUrl;
    })
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  const merged: ParsedSuggestionNoteMetadata = {};
  for (const suggestion of related) {
    const meta = parseSuggestionNoteMetadata(suggestion.note);
    if (!merged.placeId && meta.placeId) merged.placeId = meta.placeId;
    if (!merged.website && meta.website) merged.website = meta.website;
    if (!merged.phone && meta.phone) merged.phone = meta.phone;
    if (!merged.websiteFacebookUrl && meta.websiteFacebookUrl) merged.websiteFacebookUrl = meta.websiteFacebookUrl;
    if (merged.latitude === undefined && meta.latitude !== undefined) merged.latitude = meta.latitude;
    if (merged.longitude === undefined && meta.longitude !== undefined) merged.longitude = meta.longitude;
    if ((!merged.placeTypes || merged.placeTypes.length === 0) && Array.isArray(meta.placeTypes) && meta.placeTypes.length) {
      merged.placeTypes = meta.placeTypes;
    }
    if ((!merged.categories || merged.categories.length === 0) && Array.isArray(meta.categories) && meta.categories.length) {
      merged.categories = meta.categories;
    }
    if (!merged.businessStatus && meta.businessStatus) merged.businessStatus = meta.businessStatus;
    if (merged.rating === undefined && meta.rating !== undefined) merged.rating = meta.rating;
    if (merged.userRatingsTotal === undefined && meta.userRatingsTotal !== undefined) merged.userRatingsTotal = meta.userRatingsTotal;
  }

  return merged;
}

function normalizeAddressMatchKey(value?: string): string {
  const raw = String(value || '').replace(/\bcanada\b/gi, '').trim();
  if (!raw) return '';

  const normalized = normalizeVenueName(raw);
  if (!normalized) return '';

  const firstSegment = normalizeVenueName(String(raw.split(',')[0] || '').trim());
  const postalMatch = normalized.match(/\b[a-z]\d[a-z]\s?\d[a-z]\d\b/i);
  const postal = postalMatch ? String(postalMatch[0] || '').replace(/\s+/g, '').toLowerCase() : '';

  if (firstSegment && postal) return `${firstSegment}|${postal}`;
  if (firstSegment) return firstSegment;
  if (postal) return `postal:${postal}`;
  return normalized;
}

function normalizeAddressLooseMatchKey(value?: string): string {
  const raw = String(value || '').replace(/\bcanada\b/gi, '').trim();
  if (!raw) return '';

  const extractedCivic = extractResolverCivicAddressFromText(raw);
  const civicSource = extractedCivic || String(raw.split(',')[0] || '').trim();
  let civic = normalizeVenueName(civicSource);
  if (!civic) return '';

  // Strip suite/unit/floor noise so child venues inside the same building can map to the parent venue.
  civic = civic
    .replace(/\b(level|lvl|unit|suite|ste|apt|floor)\s*[a-z0-9-]+\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!civic) return '';

  const parts = parseAddressComponents(raw);
  const city = normalizeVenueName(parts.city || '');
  const province = normalizeVenueName(parts.province || '');

  return [civic, city, province].filter(Boolean).join('|');
}

function isAddressLikeUnknownVenueName(value?: string): boolean {
  const raw = String(value || '').trim();
  if (!raw) return false;
  const normalized = normalizeVenueName(raw);
  if (!normalized) return false;
  return /^\d{1,6}\s+[a-z]/i.test(normalized);
}

function normalizeCivicAddressKey(value?: string): string {
  const raw = String(value || '').replace(/\bcanada\b/gi, '').trim();
  if (!raw) return '';
  const extractedCivic = extractResolverCivicAddressFromText(raw);
  const civicSource = extractedCivic || String(raw.split(',')[0] || '').trim();
  let civic = normalizeVenueName(civicSource);
  if (!civic) return '';

  civic = civic
    .replace(/\b(level|lvl|unit|suite|ste|apt|floor)\s*[a-z0-9-]+\b/gi, ' ')
    .replace(/\b(street|st|road|rd|avenue|ave|drive|dr|lane|ln|boulevard|blvd|court|ct|terrace|ter|highway|hwy)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return civic;
}

function areLikelySameCreateNewCandidate(
  selected: UnrecognizedVenueSuggestedMatch,
  candidate: UnrecognizedVenueSuggestedMatch
): boolean {
  const selectedFacebookUrl = normalizeUrl(String(selected.facebookUrl || '').trim());
  const candidateFacebookUrl = normalizeUrl(String(candidate.facebookUrl || '').trim());
  if (selectedFacebookUrl && candidateFacebookUrl && selectedFacebookUrl === candidateFacebookUrl) {
    return true;
  }

  const selectedAddressKey = normalizeAddressMatchKey(String(selected.address || ''));
  const candidateAddressKey = normalizeAddressMatchKey(String(candidate.address || ''));
  if (selectedAddressKey && candidateAddressKey && selectedAddressKey === candidateAddressKey) {
    const selectedName = String(selected.venueName || '').trim();
    const candidateName = String(candidate.venueName || '').trim();
    if (!selectedName || !candidateName) return true;

    const exactName = normalizeVenueName(selectedName) === normalizeVenueName(candidateName);
    const tokenContained =
      candidateContainsUnknownNameTokens(selectedName, candidateName) ||
      candidateContainsUnknownNameTokens(candidateName, selectedName);
    const fuzzyEnough = calculateEnhancedSimilarity(selectedName, candidateName) >= 0.6;
    return exactName || tokenContained || fuzzyEnough;
  }

  return false;
}

function collectRelatedSuggestionMetadataForCreateNew(
  record: UnrecognizedVenueRecord,
  params: {
    selectedSuggestion?: UnrecognizedVenueSuggestedMatch | null;
  }
): ParsedSuggestionNoteMetadata {
  const selected = params.selectedSuggestion;
  if (!selected) return {};

  const suggestions = Array.isArray(record.suggestedMatches) ? record.suggestedMatches : [];
  const related = suggestions
    .filter((suggestion): suggestion is UnrecognizedVenueSuggestedMatch => Boolean(suggestion))
    .filter((suggestion) => suggestion !== selected)
    .filter((suggestion) => areLikelySameCreateNewCandidate(selected, suggestion))
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  const merged: ParsedSuggestionNoteMetadata = {};
  for (const suggestion of related) {
    const meta = parseSuggestionNoteMetadata(suggestion.note);
    if (!merged.placeId && meta.placeId) merged.placeId = meta.placeId;
    if (!merged.website && meta.website) merged.website = meta.website;
    if (!merged.phone && meta.phone) merged.phone = meta.phone;
    if (!merged.websiteFacebookUrl && meta.websiteFacebookUrl) merged.websiteFacebookUrl = meta.websiteFacebookUrl;
    if (merged.latitude === undefined && meta.latitude !== undefined) merged.latitude = meta.latitude;
    if (merged.longitude === undefined && meta.longitude !== undefined) merged.longitude = meta.longitude;
    if ((!merged.placeTypes || merged.placeTypes.length === 0) && Array.isArray(meta.placeTypes) && meta.placeTypes.length) {
      merged.placeTypes = meta.placeTypes;
    }
    if ((!merged.categories || merged.categories.length === 0) && Array.isArray(meta.categories) && meta.categories.length) {
      merged.categories = meta.categories;
    }
    if (!merged.businessStatus && meta.businessStatus) merged.businessStatus = meta.businessStatus;
    if (merged.rating === undefined && meta.rating !== undefined) merged.rating = meta.rating;
    if (merged.userRatingsTotal === undefined && meta.userRatingsTotal !== undefined) merged.userRatingsTotal = meta.userRatingsTotal;
  }

  return merged;
}

async function appendVenueUrlToDriveList(facebookUrl?: string): Promise<FinalizeUnknownVenueResult['driveAppend']> {
  const normalizedUrl = String(facebookUrl || '').trim();
  if (!normalizedUrl) {
    return {
      attempted: false,
      warning: 'No facebookUrl available to append',
    };
  }

  const fileId = getRestaurantsListFileId();
  if (!fileId) {
    return {
      attempted: false,
      warning: 'PEI_RESTAURANTS_GDRIVE_FILE_ID not configured',
    };
  }

  try {
    const result = await driveService.appendTextLinesIfMissing(fileId, [normalizedUrl]);
    return {
      attempted: true,
      appendedCount: result.appendedCount,
      skippedExistingCount: result.skippedExistingCount,
    };
  } catch (error) {
    return {
      attempted: true,
      warning: error instanceof Error ? error.message : String(error),
    };
  }
}

const DATASET_SELECTED_ROWS_TASK_QUEUE_LOCATION = 'northamerica-northeast1';
const DATASET_SELECTED_ROWS_TASK_QUEUE_PATH =
  `locations/${DATASET_SELECTED_ROWS_TASK_QUEUE_LOCATION}/functions/processDatasetSelectedRows`;

type UnknownVenueRowReplayTarget = {
  fileId: string;
  fileName?: string;
  parserMode: 'legacy' | 'full5stage';
  rowIndex: number;
};

function isTaskAlreadyExistsError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /task-already-exists|already exists|ALREADY_EXISTS/i.test(msg);
}

function normalizeSampleParserMode(value: unknown): 'legacy' | 'full5stage' {
  return String(value || '').trim() === 'legacy' ? 'legacy' : 'full5stage';
}

function extractReplayTargetsFromSamples(
  record: UnrecognizedVenueRecord
): UnknownVenueRowReplayTarget[] {
  const sampleEvents = Array.isArray(record.sampleEvents)
    ? (record.sampleEvents.filter((value) => value && typeof value === 'object') as UnrecognizedVenueSampleEvent[])
    : [];

  const seen = new Set<string>();
  const targets: UnknownVenueRowReplayTarget[] = [];
  for (const sample of sampleEvents) {
    const fileId = String(sample.fileId || '').trim();
    const rowIndex = Math.trunc(Number(sample.rowIndex));
    if (!fileId || !Number.isFinite(rowIndex) || rowIndex < 0) continue;
    const parserMode = normalizeSampleParserMode(sample.parserMode);
    const key = `${fileId}|${parserMode}|${rowIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({
      fileId,
      fileName: String(sample.fileName || '').trim() || undefined,
      parserMode,
      rowIndex,
    });
  }

  return targets;
}

function groupReplayTargets(
  targets: UnknownVenueRowReplayTarget[]
): Array<{
  fileId: string;
  fileName?: string;
  parserMode: 'legacy' | 'full5stage';
  rowIndexes: number[];
}> {
  const groups = new Map<string, {
    fileId: string;
    fileName?: string;
    parserMode: 'legacy' | 'full5stage';
    rowIndexes: number[];
  }>();

  for (const target of targets) {
    const key = `${target.fileId}|${target.parserMode}`;
    const existing = groups.get(key);
    if (existing) {
      existing.rowIndexes.push(target.rowIndex);
      if (!existing.fileName && target.fileName) existing.fileName = target.fileName;
      continue;
    }
    groups.set(key, {
      fileId: target.fileId,
      fileName: target.fileName,
      parserMode: target.parserMode,
      rowIndexes: [target.rowIndex],
    });
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    rowIndexes: Array.from(new Set(group.rowIndexes)).sort((a, b) => a - b),
  }));
}

async function queueSampleEventRowReplays(
  record: UnrecognizedVenueRecord,
  params: {
    action: 'resolve_existing' | 'create_new';
    venueId?: string;
  }
): Promise<FinalizeUnknownVenueRowReplaySummary> {
  const docId = String(record.id || '').trim();
  const targets = extractReplayTargetsFromSamples(record);
  if (!targets.length) {
    return {
      attempted: false,
      warning: 'No sampled fileId/rowIndex entries were available to replay',
    };
  }

  const grouped = groupReplayTargets(targets);
  const queue = getFunctions().taskQueue(DATASET_SELECTED_ROWS_TASK_QUEUE_PATH);
  const groups: FinalizeUnknownVenueRowReplayGroup[] = [];
  let queuedTaskCount = 0;
  let dedupedTaskCount = 0;

  for (const group of grouped) {
    const rawTaskId = [
      'unknown-venue-row-replay',
      docId,
      params.action,
      params.venueId || '',
      group.fileId,
      group.parserMode,
      group.rowIndexes.join(','),
    ].join('|');
    const taskId = `uvreplay-${createHash('sha1').update(rawTaskId).digest('hex').slice(0, 32)}`;

    try {
      await queue.enqueue(
        {
          fileId: group.fileId,
          fileName: group.fileName,
          rowIndexes: group.rowIndexes,
          parserMode: group.parserMode,
          dryRun: false,
          sourceDocId: docId || undefined,
          triggeredBy: `unknownVenue:${params.action}`,
          resolvedVenueId: params.venueId || undefined,
        },
        {
          scheduleDelaySeconds: 10,
          id: taskId,
        }
      );

      queuedTaskCount += 1;
      groups.push({
        fileId: group.fileId,
        fileName: group.fileName,
        parserMode: group.parserMode,
        rowIndexes: group.rowIndexes,
        taskId,
        status: 'queued',
      });
    } catch (error) {
      if (isTaskAlreadyExistsError(error)) {
        dedupedTaskCount += 1;
        groups.push({
          fileId: group.fileId,
          fileName: group.fileName,
          parserMode: group.parserMode,
          rowIndexes: group.rowIndexes,
          taskId,
          status: 'deduped',
        });
        continue;
      }

      const warning = error instanceof Error ? error.message : String(error);
      logger.warn('Unknown-venue sample row replay enqueue failed', {
        docId,
        action: params.action,
        venueId: params.venueId,
        fileId: group.fileId,
        parserMode: group.parserMode,
        rowIndexes: group.rowIndexes,
        error: warning,
      });
      groups.push({
        fileId: group.fileId,
        fileName: group.fileName,
        parserMode: group.parserMode,
        rowIndexes: group.rowIndexes,
        taskId,
        status: 'failed',
        warning,
      });
    }
  }

  const failedCount = groups.filter((group) => group.status === 'failed').length;
  const warning = failedCount > 0
    ? `${failedCount} row replay task${failedCount === 1 ? '' : 's'} failed to queue`
    : undefined;

  return {
    attempted: true,
    rowCount: targets.length,
    fileCount: grouped.length,
    queuedTaskCount,
    dedupedTaskCount,
    warning,
    groups,
  };
}

async function finalizeResolveExisting(
  record: UnrecognizedVenueRecord,
  input: FinalizeUnknownVenueInput
): Promise<FinalizeUnknownVenueResult> {
  const docId = String(record.id || input.docId || '').trim();
  const manual = input.manual || {};
  const suggestion = selectSuggestion(record, input.candidateIndex);
  const venueId = String(input.venueId || suggestion?.venueId || '').trim();
  if (!venueId) {
    throw new Error('resolve_existing requires venueId or candidateIndex pointing to an existing venue');
  }

  const aliasNames = [
    String(record.establishment || '').trim(),
    ...getVenueAliasCandidates(String(record.establishment || '')),
  ].filter(Boolean);
  await firestoreService.addVenueAliases(venueId, aliasNames);

  const selectedUrl = String(manual.facebookUrl || suggestion?.facebookUrl || '').trim();
  let selectedAddress = String(manual.address || suggestion?.address || '').trim();
  const selectedNoteMeta = parseSuggestionNoteMetadata(suggestion?.note);
  const relatedMeta = collectRelatedSuggestionMetadataForExisting(record, {
    venueId,
    selectedFacebookUrl: selectedUrl,
    excludeSuggestion: suggestion,
  });
  const selectedWebsiteRaw = String(manual.website || selectedNoteMeta.website || relatedMeta.website || '').trim();
  let website = normalizeWebsiteUrlForDisplay(selectedWebsiteRaw) || selectedWebsiteRaw;
  let phone = String(manual.phone || selectedNoteMeta.phone || relatedMeta.phone || '').trim();
  let latitude = parseOptionalNumber(manual.latitude) ?? selectedNoteMeta.latitude ?? relatedMeta.latitude;
  let longitude = parseOptionalNumber(manual.longitude) ?? selectedNoteMeta.longitude ?? relatedMeta.longitude;
  let googlePlaceId = String(selectedNoteMeta.placeId || relatedMeta.placeId || '').trim() || undefined;
  const googlePlaceTypes = Array.from(new Set([
    ...(selectedNoteMeta.placeTypes || []),
    ...(relatedMeta.placeTypes || []),
  ].map((v) => String(v || '').trim()).filter(Boolean)));
  let googleBusinessStatus = String(selectedNoteMeta.businessStatus || relatedMeta.businessStatus || '').trim() || undefined;
  let googleRating = selectedNoteMeta.rating ?? relatedMeta.rating;
  let googleUserRatingsTotal = selectedNoteMeta.userRatingsTotal ?? relatedMeta.userRatingsTotal;
  let operatingHours: ReturnType<typeof placesService.convertToOperatingHours> = null;

  if (googlePlaceId) {
    try {
      const livePlaceDetails = await placesService.getPlaceDetails(googlePlaceId);
      if (livePlaceDetails) {
        selectedAddress = String(selectedAddress || livePlaceDetails.formattedAddress || '').trim();
        const liveWebsiteRaw = String(website || livePlaceDetails.website || '').trim();
        website = normalizeWebsiteUrlForDisplay(liveWebsiteRaw) || liveWebsiteRaw;
        phone = String(phone || livePlaceDetails.formattedPhoneNumber || '').trim();
        if (latitude === undefined && Number.isFinite(Number(livePlaceDetails.location?.lat))) {
          latitude = Number(livePlaceDetails.location?.lat);
        }
        if (longitude === undefined && Number.isFinite(Number(livePlaceDetails.location?.lng))) {
          longitude = Number(livePlaceDetails.location?.lng);
        }
        if (!googleBusinessStatus) {
          googleBusinessStatus = String(livePlaceDetails.businessStatus || '').trim() || undefined;
        }
        if (!googlePlaceTypes.length && Array.isArray(livePlaceDetails.types)) {
          googlePlaceTypes.push(...livePlaceDetails.types.map((v) => String(v || '').trim()).filter(Boolean));
        }
        if (googleRating === undefined) {
          const rating = parseOptionalNumber(livePlaceDetails.rating);
          if (rating !== undefined) googleRating = rating;
        }
        if (googleUserRatingsTotal === undefined) {
          const count = parseOptionalNumber(livePlaceDetails.userRatingsTotal);
          if (count !== undefined) googleUserRatingsTotal = count;
        }
        operatingHours = placesService.convertToOperatingHours(livePlaceDetails);
      }
    } catch (error) {
      logger.warn('Resolve-existing Google Places detail enrichment failed', {
        docId,
        venueId,
        placeId: googlePlaceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const parsedAddress = parseAddressComponents(selectedAddress);
  const city = String(manual.city || parsedAddress.city || record.cityHint || '').trim() || undefined;
  const province = String(manual.province || parsedAddress.province || record.provinceHint || '').trim() || undefined;
  const postalCode = parsedAddress.postalCode;
  const category = chooseVenueCategory({
    manualCategory: manual.category,
    metadataCategories: [
      ...(selectedNoteMeta.categories || []),
      ...(relatedMeta.categories || []),
    ],
    metadataPlaceTypes: googlePlaceTypes,
  });

  await firestoreService.mergeVenueFieldsIfEmpty(venueId, {
    facebookUrl: selectedUrl || undefined,
    pageurl: selectedUrl || undefined,
    address: selectedAddress || undefined,
    website: website || undefined,
    phone: phone || undefined,
    city,
    province,
    postalCode: postalCode || undefined,
    latitude,
    longitude,
    category: category || undefined,
    googlePlaceId,
    googlePlaceTypes: googlePlaceTypes.length ? googlePlaceTypes : undefined,
    googleBusinessStatus,
    googleRating,
    googleUserRatingsTotal,
    operatingHours: operatingHours || undefined,
    operatingHoursUpdatedAt: operatingHours ? new Date() : undefined,
  });

  const driveAppend = await appendVenueUrlToDriveList(selectedUrl);
  let rowReplay: FinalizeUnknownVenueRowReplaySummary | undefined;
  try {
    rowReplay = await queueSampleEventRowReplays(record, {
      action: 'resolve_existing',
      venueId,
    });
  } catch (error) {
    const warning = error instanceof Error ? error.message : String(error);
    logger.warn('Unknown-venue resolve_existing row replay queue failed', {
      docId,
      venueId,
      error: warning,
    });
    rowReplay = {
      attempted: true,
      warning,
    };
  }

  await firestoreService.updateUnrecognizedVenue(docId, {
    status: 'resolved_existing',
    resolvedVenueId: venueId,
    resolvedAt: new Date(),
    resolvedBy: input.resolvedBy || 'unknownVenueManualFinalize',
    notes: String(input.notes || '').trim() || undefined,
    finalization: {
      action: input.action,
      candidateIndex: Number.isInteger(Number(input.candidateIndex)) ? Number(input.candidateIndex) : undefined,
      selectedFacebookUrl: selectedUrl || undefined,
      selectedAddress: selectedAddress || undefined,
      ...(website ? { selectedWebsite: website } : {}),
      ...(phone ? { selectedPhone: phone } : {}),
      ...(latitude !== undefined ? { selectedLatitude: latitude } : {}),
      ...(longitude !== undefined ? { selectedLongitude: longitude } : {}),
      ...(googlePlaceId ? { selectedGooglePlaceId: googlePlaceId } : {}),
      ...(category ? { selectedCategory: category } : {}),
      driveAppend,
      ...(rowReplay ? { rowReplay } : {}),
    },
  });

  return {
    success: true,
    docId,
    action: 'resolve_existing',
    status: 'resolved_existing',
    venueId,
    driveAppend,
    ...(rowReplay ? { rowReplay } : {}),
  };
}

async function finalizeCreateNew(
  record: UnrecognizedVenueRecord,
  input: FinalizeUnknownVenueInput
): Promise<FinalizeUnknownVenueResult> {
  const docId = String(record.id || input.docId || '').trim();
  const suggestion = selectSuggestion(record, input.candidateIndex);
  const manual = input.manual || {};
  const suggestionNoteMeta = parseSuggestionNoteMetadata(suggestion?.note);
  const relatedSuggestionMeta = collectRelatedSuggestionMetadataForCreateNew(record, {
    selectedSuggestion: suggestion,
  });

  const venueName = String(
    manual.name ||
    suggestion?.venueName ||
    record.establishment ||
    ''
  ).trim();
  if (!venueName) {
    throw new Error('create_new requires a venue name (manual.name or candidate)');
  }

  let facebookUrl = String(manual.facebookUrl || suggestion?.facebookUrl || '').trim() || undefined;
  let address = String(manual.address || suggestion?.address || '').trim() || undefined;
  const createWebsiteRaw = String(manual.website || suggestionNoteMeta.website || relatedSuggestionMeta.website || '').trim();
  let website = (normalizeWebsiteUrlForDisplay(createWebsiteRaw) || createWebsiteRaw) || undefined;
  let phone = String(manual.phone || suggestionNoteMeta.phone || relatedSuggestionMeta.phone || '').trim() || undefined;
  const email = String(manual.email || '').trim() || undefined;
  let latitude = parseOptionalNumber(manual.latitude) ?? suggestionNoteMeta.latitude ?? relatedSuggestionMeta.latitude;
  let longitude = parseOptionalNumber(manual.longitude) ?? suggestionNoteMeta.longitude ?? relatedSuggestionMeta.longitude;
  let googlePlaceId = String(suggestionNoteMeta.placeId || relatedSuggestionMeta.placeId || '').trim() || undefined;
  let googlePlaceTypes = Array.from(new Set([
    ...(suggestionNoteMeta.placeTypes || []),
    ...(relatedSuggestionMeta.placeTypes || []),
  ].map((v) => String(v || '').trim()).filter(Boolean)));
  let googleBusinessStatus = String(suggestionNoteMeta.businessStatus || relatedSuggestionMeta.businessStatus || '').trim() || undefined;
  let googleRating = suggestionNoteMeta.rating ?? relatedSuggestionMeta.rating;
  let googleUserRatingsTotal = suggestionNoteMeta.userRatingsTotal ?? relatedSuggestionMeta.userRatingsTotal;
  let operatingHours: ReturnType<typeof placesService.convertToOperatingHours> = null;

  if (googlePlaceId) {
    try {
      const livePlaceDetails = await placesService.getPlaceDetails(googlePlaceId);
      if (livePlaceDetails) {
        address = String(address || livePlaceDetails.formattedAddress || '').trim() || undefined;
        const liveWebsiteRaw = String(website || livePlaceDetails.website || '').trim();
        website = (normalizeWebsiteUrlForDisplay(liveWebsiteRaw) || liveWebsiteRaw) || undefined;
        phone = String(phone || livePlaceDetails.formattedPhoneNumber || '').trim() || undefined;
        if (latitude === undefined && Number.isFinite(Number(livePlaceDetails.location?.lat))) {
          latitude = Number(livePlaceDetails.location?.lat);
        }
        if (longitude === undefined && Number.isFinite(Number(livePlaceDetails.location?.lng))) {
          longitude = Number(livePlaceDetails.location?.lng);
        }
        if (!googleBusinessStatus) {
          googleBusinessStatus = String(livePlaceDetails.businessStatus || '').trim() || undefined;
        }
        if (!googlePlaceTypes.length && Array.isArray(livePlaceDetails.types)) {
          googlePlaceTypes = Array.from(new Set(
            livePlaceDetails.types.map((v) => String(v || '').trim()).filter(Boolean)
          ));
        }
        if (googleRating === undefined) {
          const rating = parseOptionalNumber(livePlaceDetails.rating);
          if (rating !== undefined) {
            googleRating = rating;
          }
        }
        if (googleUserRatingsTotal === undefined) {
          const count = parseOptionalNumber(livePlaceDetails.userRatingsTotal);
          if (count !== undefined) {
            googleUserRatingsTotal = count;
          }
        }
        operatingHours = placesService.convertToOperatingHours(livePlaceDetails);
      }
    } catch (error) {
      logger.warn('Create-new Google Places detail enrichment failed', {
        docId,
        venueName,
        placeId: googlePlaceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const parsedAddress = parseAddressComponents(address);
  const city = String(manual.city || parsedAddress.city || record.cityHint || '').trim() || undefined;
  const province = String(manual.province || parsedAddress.province || record.provinceHint || '').trim() || undefined;
  const postalCode = parsedAddress.postalCode;
  if (!facebookUrl) {
    const websiteFacebookUrl = String(
      suggestionNoteMeta.websiteFacebookUrl ||
      relatedSuggestionMeta.websiteFacebookUrl ||
      ''
    ).trim();
    if (websiteFacebookUrl) {
      const resolvedDisplayFacebookUrl = await resolveFacebookUrlForDisplay(websiteFacebookUrl, { pageLabel: venueName });
      facebookUrl = resolvedDisplayFacebookUrl || normalizeFetchedFacebookUrl(websiteFacebookUrl) || websiteFacebookUrl;
    }
  }
  if (!facebookUrl && website) {
    const extractedFacebookUrl = await extractFacebookUrlFromWebsite(website, venueName);
    if (extractedFacebookUrl) {
      facebookUrl = extractedFacebookUrl;
    }
  }
  const category = chooseVenueCategory({
    manualCategory: manual.category,
    metadataCategories: [
      ...(suggestionNoteMeta.categories || []),
      ...(relatedSuggestionMeta.categories || []),
    ],
    metadataPlaceTypes: googlePlaceTypes,
  });

  const linkedVenueId = String(suggestion?.venueId || '').trim();
  if (linkedVenueId) {
    throw new Error(
      `create_new blocked: selected candidate already links to existing venue (${linkedVenueId}); use resolve_existing instead`
    );
  }

  if (facebookUrl) {
    const existingByFacebookUrl = await firestoreService.findVenueByFacebookUrl(facebookUrl);
    if (existingByFacebookUrl?.id) {
      const existingAny = existingByFacebookUrl as unknown as Record<string, unknown>;
      const existingName = getVenueDisplayName(existingAny) || existingByFacebookUrl.name || '';
      throw new Error(
        `create_new blocked: Facebook URL already exists on venue (${existingByFacebookUrl.id}${existingName ? `: ${existingName}` : ''}); use resolve_existing instead`
      );
    }
  }

  const aliasNames = [
    String(record.establishment || '').trim(),
    ...getVenueAliasCandidates(String(record.establishment || '')),
  ].filter(Boolean);

  const venueId = await firestoreService.upsertVenue({
    name: venueName,
    pagename: venueName,
    facebookUrl,
    pageurl: facebookUrl,
    address,
    city,
    province,
    postalCode,
    website,
    phone,
    email,
    category,
    latitude,
    longitude,
    googlePlaceId,
    googlePlaceTypes: googlePlaceTypes.length ? googlePlaceTypes : undefined,
    googleBusinessStatus,
    googleRating,
    googleUserRatingsTotal,
    operatingHours: operatingHours || undefined,
    aliases: Array.from(new Set(aliasNames)),
    aliasesNormalized: Array.from(new Set(aliasNames.map((v) => normalizeVenueName(v)).filter(Boolean))),
  } as any);

  // Ensure aliases are merged even if the upsert updated an existing doc by id in the future.
  await firestoreService.addVenueAliases(venueId, aliasNames);

  if (operatingHours) {
    await firestoreService.updateVenueOperatingHours(venueId, operatingHours, googlePlaceId);
  }

  const cfg = getResolverConfig();
  let facebookLookup: CreateNewFacebookLookupResult | undefined;
  if (!facebookUrl && cfg.createNewFacebookLookupEnabled) {
    try {
      facebookLookup = await lookupCreateNewFacebookUrl(record, {
        venueName,
        city,
        province,
        cfg,
      });

      if (facebookLookup.facebookUrl) {
        facebookUrl = facebookLookup.facebookUrl;
        await firestoreService.mergeVenueFieldsIfEmpty(venueId, {
          facebookUrl,
          pageurl: facebookUrl,
        });
      }
    } catch (error) {
      facebookLookup = {
        attempted: true,
        source: 'apify',
        warning: error instanceof Error ? error.message : String(error),
      };
      logger.warn('Create-new Facebook URL lookup failed', {
        docId,
        venueId,
        venueName,
        error: facebookLookup.warning,
      });
    }
  }

  const driveAppend = await appendVenueUrlToDriveList(facebookUrl);
  let rowReplay: FinalizeUnknownVenueRowReplaySummary | undefined;
  try {
    rowReplay = await queueSampleEventRowReplays(record, {
      action: 'create_new',
      venueId,
    });
  } catch (error) {
    const warning = error instanceof Error ? error.message : String(error);
    logger.warn('Unknown-venue create_new row replay queue failed', {
      docId,
      venueId,
      error: warning,
    });
    rowReplay = {
      attempted: true,
      warning,
    };
  }

  await firestoreService.updateUnrecognizedVenue(docId, {
    status: 'created_new',
    resolvedVenueId: venueId,
    resolvedAt: new Date(),
    resolvedBy: input.resolvedBy || 'unknownVenueManualFinalize',
    notes: String(input.notes || '').trim() || undefined,
    finalization: {
      action: input.action,
      candidateIndex: Number.isInteger(Number(input.candidateIndex)) ? Number(input.candidateIndex) : undefined,
      selectedFacebookUrl: facebookUrl,
      selectedAddress: address,
      facebookLookup: facebookLookup
        ? {
            attempted: facebookLookup.attempted,
            source: facebookLookup.source,
            facebookUrl: facebookLookup.facebookUrl,
            candidateName: facebookLookup.candidateName,
            confidence: facebookLookup.confidence,
            warning: facebookLookup.warning,
          }
        : undefined,
      driveAppend,
      ...(rowReplay ? { rowReplay } : {}),
    },
  });

  return {
    success: true,
    docId,
    action: 'create_new',
    status: 'created_new',
    venueId,
    venueName,
    facebookUrl,
    driveAppend,
    ...(rowReplay ? { rowReplay } : {}),
  };
}

async function finalizeIgnore(
  record: UnrecognizedVenueRecord,
  input: FinalizeUnknownVenueInput
): Promise<FinalizeUnknownVenueResult> {
  const docId = String(record.id || input.docId || '').trim();
  await firestoreService.updateUnrecognizedVenue(docId, {
    status: 'ignored',
    resolvedAt: new Date(),
    resolvedBy: input.resolvedBy || 'unknownVenueManualFinalize',
    notes: String(input.notes || '').trim() || undefined,
    finalization: {
      action: 'ignore',
      candidateIndex: Number.isInteger(Number(input.candidateIndex)) ? Number(input.candidateIndex) : undefined,
    },
  });
  return {
    success: true,
    docId,
    action: 'ignore',
    status: 'ignored',
  };
}

function isLikelyFacebookPostPermalink(value: string): boolean {
  const raw = String(value || '').trim();
  if (!raw) return false;
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(withProtocol);
    if (!/(\.|^)facebook\.com$/i.test(parsed.hostname)) return false;
    const path = String(parsed.pathname || '').toLowerCase();
    if (!path || path === '/' || /^\/[a-z0-9._-]+\/?$/i.test(path)) {
      return false;
    }
    return (
      path.includes('/posts/') ||
      path.includes('/events/') ||
      path.includes('/videos/') ||
      path.includes('/photos/') ||
      path.includes('/reel/') ||
      path.includes('/permalink.php') ||
      path.includes('/story.php')
    );
  } catch {
    return false;
  }
}

const UNKNOWN_SAMPLE_ADDRESS_KEYS = [
  'address',
  'venueAddress',
  'normalizedVenueAddress',
  'normalizedAddress',
  'fullAddress',
  'formattedAddress',
  'location',
  'venueLocation',
  'aggregatorAddress',
  'rowAddress',
] as const;

function normalizeAggregatorAddressForHydration(value: unknown): string | undefined {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw) return undefined;
  if (raw.length < 8 || raw.length > 220) return undefined;
  if (/^https?:\/\//i.test(raw)) return undefined;

  const looksPostal = /\b[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d\b/.test(raw);
  const looksProvince = /\b(PE|PEI|NS|NB|NL|ON|QC|AB|BC|SK|MB)\b/i.test(raw);
  const looksStreet = /\b(street|st|road|rd|avenue|ave|drive|dr|lane|ln|boulevard|blvd|court|ct|way|highway|hwy|route|rte|place|pl|terrace|ter)\b/i.test(raw);
  const hasStreetNumber = /\b\d{1,6}\b/.test(raw);

  if (!((hasStreetNumber && looksStreet) || (looksPostal && looksStreet) || (looksStreet && looksProvince))) {
    return undefined;
  }

  return raw.replace(/[;:.]+$/g, '').trim() || undefined;
}

function deriveAggregatorAddressFromRowForHydration(
  row?: Record<string, unknown>
): string | undefined {
  if (!row || typeof row !== 'object') return undefined;
  for (const key of UNKNOWN_SAMPLE_ADDRESS_KEYS) {
    const normalized = normalizeAggregatorAddressForHydration(row[key]);
    if (normalized) return normalized;
  }
  return undefined;
}

async function hydrateSampleTopLevelUrls(
  record: UnrecognizedVenueRecord
): Promise<UnrecognizedVenueRecord> {
  const docId = String(record.id || '').trim();
  const samples = Array.isArray(record.sampleEvents)
    ? (record.sampleEvents as UnrecognizedVenueSampleEvent[])
    : [];
  if (!docId || !samples.length) return record;

  const needsBackfill = samples.some((sample) => {
    const topLevelUrl = String(sample.topLevelUrl || '').trim();
    const aggregatorAddress = String(sample.aggregatorAddress || '').trim();
    const fileId = String(sample.fileId || '').trim();
    const rowIndex = Math.trunc(Number(sample.rowIndex));
    return (!topLevelUrl || !aggregatorAddress) && Boolean(fileId) && Number.isFinite(rowIndex) && rowIndex >= 0;
  });
  if (!needsBackfill) return record;

  const rowCache = new Map<string, Awaited<ReturnType<typeof driveService.downloadAndParseDataset>> | null>();
  let changed = false;

  const hydratedSamples: UnrecognizedVenueSampleEvent[] = [];
  for (const sample of samples) {
    const topLevelUrl = String(sample.topLevelUrl || '').trim();
    const aggregatorAddress = String(sample.aggregatorAddress || '').trim();
    if (topLevelUrl && aggregatorAddress) {
      hydratedSamples.push(sample);
      continue;
    }

    const fileId = String(sample.fileId || '').trim();
    const rowIndex = Math.trunc(Number(sample.rowIndex));
    if (!fileId || !Number.isFinite(rowIndex) || rowIndex < 0) {
      hydratedSamples.push(sample);
      continue;
    }

    if (!rowCache.has(fileId)) {
      try {
        const parsed = await driveService.downloadAndParseDataset(fileId);
        rowCache.set(fileId, parsed);
      } catch (error) {
        logger.warn('Unable to hydrate unknown venue sample topLevelUrl from Drive dataset', {
          docId,
          fileId,
          rowIndex,
          error: error instanceof Error ? error.message : String(error),
        });
        rowCache.set(fileId, null);
      }
    }

    const parsed = rowCache.get(fileId);
    const row = parsed?.rows?.[rowIndex] as Record<string, unknown> | undefined;
    const candidateTopLevelUrl = String(row?.topLevelUrl || row?.facebookUrl || '').trim();
    const candidateAggregatorAddress = deriveAggregatorAddressFromRowForHydration(row);
    const shouldHydrateTopLevelUrl = !topLevelUrl && isLikelyFacebookPostPermalink(candidateTopLevelUrl);
    const shouldHydrateAggregatorAddress = !aggregatorAddress && Boolean(candidateAggregatorAddress);
    if (!shouldHydrateTopLevelUrl && !shouldHydrateAggregatorAddress) {
      hydratedSamples.push(sample);
      continue;
    }

    changed = true;
    hydratedSamples.push({
      ...sample,
      ...(shouldHydrateTopLevelUrl ? { topLevelUrl: candidateTopLevelUrl } : {}),
      ...(shouldHydrateAggregatorAddress ? { aggregatorAddress: candidateAggregatorAddress } : {}),
    });
  }

  if (!changed) return record;

  await firestoreService.updateUnrecognizedVenue(docId, {
    sampleEvents: hydratedSamples,
  });

  logger.info('Hydrated missing sample metadata for unknown venue samples', {
    docId,
    hydratedCount: hydratedSamples.filter((sample) => String(sample.topLevelUrl || '').trim()).length,
    hydratedAddressCount: hydratedSamples.filter((sample) => String(sample.aggregatorAddress || '').trim()).length,
  });

  return {
    ...record,
    sampleEvents: hydratedSamples,
  };
}

async function sendManualReviewNotification(record: UnrecognizedVenueRecord): Promise<boolean> {
  const cfg = getResolverConfig();
  if (!cfg.emailWebhookUrl) {
    logger.info('Unknown venue manual review email webhook not configured; skipping email', {
      docId: record.id,
      venueName: record.establishment,
    });
    return false;
  }

  const hydratedRecord = await hydrateSampleTopLevelUrls(record);
  const body = {
    type: 'unknown_venue_manual_review',
    docId: hydratedRecord.id,
    venueName: hydratedRecord.establishment,
    cityHint: hydratedRecord.cityHint || '',
    provinceHint: hydratedRecord.provinceHint || '',
    occurrences: Number(hydratedRecord.occurrences || 0),
    suggestedMatches: (hydratedRecord.suggestedMatches || []).slice(0, 5),
    sampleEvents: (hydratedRecord.sampleEvents || []).slice(0, 3),
  };

  try {
    const res = await fetch(cfg.emailWebhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(cfg.emailWebhookKey ? { authorization: `Bearer ${cfg.emailWebhookKey}` } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      logger.warn('Unknown venue email webhook returned non-OK', {
        status: res.status,
        body: txt.slice(0, 500),
        docId: record.id,
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.warn('Unknown venue email webhook failed', {
      docId: record.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function resolveUnrecognizedVenueById(docId: string): Promise<ResolverResult> {
  const cfg = getResolverConfig();
  const normalizedId = String(docId || '').trim();
  if (!normalizedId) {
    throw new Error('docId is required');
  }

  const claim = await firestoreService.claimUnrecognizedVenueForLookup(normalizedId);
  if (!claim.claimed) {
    return {
      docId: normalizedId,
      status: 'failed',
      message: `Skipped: ${claim.reason || 'not_claimed'}`,
      suggestionsCount: 0,
    };
  }

  const latestRaw = await firestoreService.getUnrecognizedVenue(normalizedId);
  if (!latestRaw) {
    return {
      docId: normalizedId,
      status: 'failed',
      message: 'Queue record not found after claim',
      suggestionsCount: 0,
    };
  }
  const latest = await hydrateSampleTopLevelUrls(latestRaw);

  const existingSuggestions = await collectExistingVenueSuggestions(latest, cfg);
  const placesSuggestions = await collectPlacesSuggestion(latest);
  const forceApifyForPageSubmission = isPageSubmissionVenueDiscoveryRecord(latest);
  const shouldRunAutoApifySuggestions = cfg.apifyEnabled && (cfg.apifyAutoSuggestionsEnabled || forceApifyForPageSubmission);
  if (cfg.apifyEnabled && !cfg.apifyAutoSuggestionsEnabled && !forceApifyForPageSubmission) {
    logger.info('Automatic Apify suggestions disabled for queued unknown-venue resolver pass', {
      docId: normalizedId,
      venueName: latest.establishment,
    });
  }
  if (cfg.apifyEnabled && forceApifyForPageSubmission) {
    logger.info('Forcing Apify suggestions for page-submission venue discovery resolver pass', {
      docId: normalizedId,
      venueName: latest.establishment,
    });
  }
  const apifySuggestions = shouldRunAutoApifySuggestions
    ? await collectApifySuggestions(latest, cfg)
    : [];
  const pageSubmissionSourceSuggestion = await buildPageSubmissionApprovedUrlSuggestion(latest);
  const suggestions = dedupeSuggestions([
    ...(pageSubmissionSourceSuggestion ? [pageSubmissionSourceSuggestion] : []),
    ...existingSuggestions,
    ...placesSuggestions,
    ...apifySuggestions,
  ]);

  const decision = chooseNextStatusAndResolution(latest, suggestions, cfg);

  await firestoreService.updateUnrecognizedVenue(normalizedId, {
    status: decision.status,
    suggestedMatches: suggestions,
    resolvedVenueId: decision.resolvedVenueId,
    lastLookupAt: new Date(),
    lookupSummary: {
      existingSuggestions: existingSuggestions.length,
      placesSuggestions: placesSuggestions.length,
      apifySuggestions: apifySuggestions.length,
      apifyUsed: shouldRunAutoApifySuggestions,
      note: decision.note,
    },
    ...(decision.status === 'manual_review' ? { manualReviewRequiredAt: new Date() } : {}),
    ...(decision.status === 'resolved_existing' ? { resolvedAt: new Date() } : {}),
  });

  let notificationSent = false;
  if (decision.status === 'manual_review') {
    const refreshed = await firestoreService.getUnrecognizedVenue(normalizedId);
    if (refreshed) {
      notificationSent = await sendManualReviewNotification(refreshed);
      if (notificationSent) {
        await firestoreService.updateUnrecognizedVenue(normalizedId, {
          lastManualReviewEmailAt: new Date(),
        });
      }
    }
  }

  return {
    docId: normalizedId,
    status: decision.status,
    message: decision.note,
    suggestionsCount: suggestions.length,
    resolvedVenueId: decision.resolvedVenueId,
    notificationSent,
  };
}

export async function finalizeUnrecognizedVenue(
  input: FinalizeUnknownVenueInput
): Promise<FinalizeUnknownVenueResult> {
  const docId = String(input.docId || '').trim();
  if (!docId) {
    throw new Error('docId is required');
  }

  const record = await firestoreService.getUnrecognizedVenue(docId);
  if (!record) {
    throw new Error(`Unrecognized venue not found: ${docId}`);
  }

  const action = String(input.action || '').trim() as FinalizeUnknownVenueAction;
  if (!['resolve_existing', 'create_new', 'ignore'].includes(action)) {
    throw new Error('action must be resolve_existing, create_new, or ignore');
  }

  const alreadyApplied = assertNotContradictingFinalizedRecord(record, {
    ...input,
    action,
  });
  if (alreadyApplied) {
    return alreadyApplied;
  }

  if (action === 'resolve_existing') {
    return finalizeResolveExisting(record, input);
  }

  if (action === 'create_new') {
    return finalizeCreateNew(record, input);
  }

  return finalizeIgnore(record, input);
}

export async function processPendingUnrecognizedVenues(
  limit?: number
): Promise<{
  enabled: boolean;
  processed: number;
  results: ResolverResult[];
}> {
  const cfg = getResolverConfig();
  if (!cfg.enabled) {
    return { enabled: false, processed: 0, results: [] };
  }

  const batchLimit = Math.max(1, Math.min(Number(limit || cfg.batchLimit), 25));
  // Do not auto-retry `failed` docs in the scheduler loop.
  // Repeated retries can repeatedly trigger external lookups (Places/Apify) and create cost.
  // Failed docs should be retried manually or re-queued after operator review.
  const actionableStatuses = ['pending', 'candidate_found'] as const;
  const candidates: UnrecognizedVenueRecord[] = [];
  const seen = new Set<string>();

  // Query actionable statuses directly so terminal docs do not starve the scheduler window.
  // Use createdAt here because we already have a deployed composite index on status + createdAt.
  for (const status of actionableStatuses) {
    const remaining = batchLimit - candidates.length;
    if (remaining <= 0) break;
    const rows = await firestoreService.listUnrecognizedVenues({
      limit: remaining,
      statuses: [status],
      orderBy: 'createdAt',
      orderDirection: 'asc',
    });
    for (const record of rows) {
      const id = String(record.id || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      candidates.push(record);
      if (candidates.length >= batchLimit) break;
    }
  }

  const results: ResolverResult[] = [];
  for (const record of candidates) {
    if (!record.id) continue;
    try {
      const result = await resolveUnrecognizedVenueById(record.id);
      results.push(result);
    } catch (error) {
      logger.error('Unknown venue resolver failed', error, {
        docId: record.id,
        venueName: record.establishment,
      });
      await firestoreService.updateUnrecognizedVenue(record.id, {
        status: 'failed',
        lastLookupAt: new Date(),
        lookupError: error instanceof Error ? error.message : String(error),
      });
      results.push({
        docId: record.id,
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
        suggestionsCount: 0,
      });
    }
  }

  return {
    enabled: true,
    processed: results.length,
    results,
  };
}
