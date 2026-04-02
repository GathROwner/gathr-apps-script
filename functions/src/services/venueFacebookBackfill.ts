import { createHash } from 'crypto';
import * as admin from 'firebase-admin';
import * as firestoreService from './firestoreService.js';
import * as driveService from './driveService.js';
import { logger } from '../utils/logger.js';
import {
  calculateEnhancedSimilarity,
  extractFacebookSlug,
  normalizeUrl,
  normalizeVenueName,
} from '../utils/similarity.js';
import {
  extractFacebookUrlFromWebsite,
  scoreWebsiteFacebookCandidate,
} from './unknownVenueResolver.js';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const REVIEWS_COLLECTION = 'venue_facebook_backfill_reviews';
const SNOOZE_DAYS = 14;

const DISTINCTIVE_TOKEN_STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'into',
  'house',
  'venue',
  'charlottetown',
  'summerside',
  'pei',
  'prince',
  'edward',
  'island',
  'restaurant',
  'bar',
  'pub',
  'hotel',
  'resort',
  'inn',
  'club',
  'centre',
  'center',
  'hall',
  'market',
  'theatre',
  'theater',
  'church',
  'library',
  'raceway',
]);

const PARENT_OR_OPERATOR_HINT_TOKENS = new Set([
  'vacations',
  'hotels',
  'resorts',
  'group',
  'tourism',
  'downtown',
  'operators',
  'official',
  'pei',
  'redshores',
  'confedcentre',
  'creditunionplace',
]);

export type VenueFacebookBackfillClassification =
  | 'direct_match'
  | 'parent_or_operator'
  | 'weak_or_unclear';

export type VenueFacebookBackfillStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'suppressed'
  | 'snoozed';

export type FinalizeVenueFacebookBackfillAction =
  | 'approve'
  | 'approve_and_append'
  | 'reject'
  | 'suppress'
  | 'snooze';

export type VenueFacebookBackfillSampleRow = {
  fileId?: string;
  rowIndex?: number;
  topLevelUrl?: string;
  aggregatorName?: string;
  aggregatorFacebookUrl?: string;
  rowTimestamp?: string;
  triggerReason?: string;
  label?: string;
};

export type VenueFacebookBackfillReviewRecord = {
  id?: string;
  type: 'venue_facebook_backfill_review';
  venueId: string;
  venueName: string;
  venueWebsite?: string;
  existingFacebookUrl?: string;
  existingPageUrl?: string;
  candidateFacebookUrl: string;
  candidateFacebookUrlNormalized: string;
  candidateSource: string;
  candidateSources?: string[];
  classification: VenueFacebookBackfillClassification;
  confidence: number;
  status: VenueFacebookBackfillStatus;
  firstSeenAt?: Date;
  lastSeenAt?: Date;
  lastPromptedAt?: Date;
  occurrenceCount: number;
  suppressedUntil?: Date;
  seeded?: boolean;
  seedLabel?: string;
  evidence?: {
    candidateAlreadyInPageUrl?: boolean;
    candidateFoundOnWebsite?: boolean;
    websiteMatchesCandidate?: boolean;
    websiteExtractorScore?: number;
    pageUrlSimilarity?: number;
    slugSimilarity?: number;
    distinctiveTokenCount?: number;
    distinctiveTokenMatches?: string[];
    umbrellaHintTokens?: string[];
    notes?: string[];
  };
  sampleRows?: VenueFacebookBackfillSampleRow[];
  reviewHistory?: Array<{
    action: string;
    at?: Date;
    by?: string;
    notes?: string;
  }>;
  resolution?: {
    appendToVenueDoc?: boolean;
    appendToScrapeSeedList?: boolean;
    resolvedAt?: Date;
    resolvedBy?: string;
    action?: FinalizeVenueFacebookBackfillAction;
    warning?: string;
  };
};

export type SeedVenueFacebookBackfillInput = {
  venueIds?: string[];
  sendEmails?: boolean;
  forceReset?: boolean;
  seedDefaults?: boolean;
};

export type SeedVenueFacebookBackfillResult = {
  success: boolean;
  requestedCount: number;
  processedCount: number;
  emailedCount: number;
  results: Array<{
    venueId: string;
    venueName?: string;
    reviewId?: string;
    status: 'seeded' | 'updated' | 'skipped' | 'no_candidate' | 'error';
    classification?: VenueFacebookBackfillClassification;
    candidateFacebookUrl?: string;
    message?: string;
    emailed?: boolean;
  }>;
};

export type FinalizeVenueFacebookBackfillInput = {
  reviewId: string;
  action: FinalizeVenueFacebookBackfillAction;
  resolvedBy?: string;
};

export type FinalizeVenueFacebookBackfillResult = {
  success: boolean;
  reviewId: string;
  action: FinalizeVenueFacebookBackfillAction;
  status: VenueFacebookBackfillStatus;
  alreadyApplied?: boolean;
  venueId?: string;
  venueName?: string;
  candidateFacebookUrl?: string;
  driveAppend?: {
    attempted: boolean;
    appendedCount?: number;
    skippedExistingCount?: number;
    warning?: string;
  };
  message?: string;
};

export type VenueFacebookBackfillPreview = {
  venueId: string;
  venueName?: string;
  website?: string;
  existingFacebookUrl?: string;
  pageUrlCandidate?: string;
  websiteCandidate?: string;
  selection?: CandidateSelection | null;
};

type CandidateSourceType = 'venue_pageurl' | 'website_extract' | 'manual_seed';

type CandidateSourceEvidence = {
  source: CandidateSourceType;
  url: string;
  score?: number;
  note?: string;
};

type CandidateSelection = {
  candidateFacebookUrl: string;
  candidateFacebookUrlNormalized: string;
  candidateSource: CandidateSourceType;
  candidateSources: CandidateSourceType[];
  classification: VenueFacebookBackfillClassification;
  confidence: number;
  evidence: VenueFacebookBackfillReviewRecord['evidence'];
};

type DefaultSeedCase = {
  venueId: string;
  seedLabel: string;
  sampleRows?: VenueFacebookBackfillSampleRow[];
  manualCandidateFacebookUrl?: string;
  manualClassification?: VenueFacebookBackfillClassification;
  manualConfidence?: number;
  manualEvidenceNotes?: string[];
};

const DEFAULT_SEED_CASES: DefaultSeedCase[] = [
  {
    venueId: 'fb_100042953904343',
    seedLabel: 'point_prim_direct_match',
    sampleRows: [
      {
        fileId: '1QEd7N2PUhhpuVCP6hZQsHQ9gvIVOa2nS',
        rowIndex: 99,
        aggregatorName: 'Point prim chowder house',
        aggregatorFacebookUrl: 'https://www.facebook.com/chowderhousepei',
        rowTimestamp: '2026-02-06T11:54:38.000Z',
        triggerReason: 'seeded_demo_existing_venue_missing_facebook',
        label: 'Seeded review example',
      },
    ],
  },
  {
    venueId: 'slug_@westprincealibi',
    seedLabel: 'alibi_direct_match',
  },
  {
    venueId: '3f8DZiSSgoL1mQ5kMxSN',
    seedLabel: 'red_shores_parent_or_operator',
    manualCandidateFacebookUrl: 'https://www.facebook.com/redshorespei/',
    manualClassification: 'parent_or_operator',
    manualConfidence: 0.58,
    manualEvidenceNotes: [
      'Seeded demo candidate for parent/operator review behavior.',
      'Website extraction did not produce a deterministic candidate in live runtime, so this uses the audited operator page.',
    ],
  },
  {
    venueId: 'cxOFyQDg6UT5MrWiJFYr',
    seedLabel: 'summerside_presbyterian_weak',
    manualCandidateFacebookUrl: 'https://www.facebook.com/ssaccsummerside/',
    manualClassification: 'weak_or_unclear',
    manualConfidence: 0.41,
    manualEvidenceNotes: [
      'Seeded demo candidate for weak/unclear review behavior.',
      'Candidate appears related to the venue website but not confidently venue-specific.',
    ],
  },
  {
    venueId: 'YZElotqve6QdFA8DlW3c',
    seedLabel: 'the_mack_parent_or_operator',
    manualCandidateFacebookUrl: 'https://www.facebook.com/confedcentre/',
    manualClassification: 'parent_or_operator',
    manualConfidence: 0.52,
    manualEvidenceNotes: [
      'Seeded demo candidate for parent/operator review behavior.',
      'Candidate represents the parent organization rather than the specific venue.',
    ],
  },
];

function getWebhookConfig(): { url: string; key: string } {
  return {
    url: String(process.env.UNKNOWN_VENUE_EMAIL_WEBHOOK_URL || '').trim(),
    key: String(process.env.UNKNOWN_VENUE_EMAIL_WEBHOOK_KEY || '').trim(),
  };
}

function getRestaurantsListFileId(): string {
  return String(process.env.PEI_RESTAURANTS_GDRIVE_FILE_ID || '').trim();
}

function normalizeFacebookCandidateUrl(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.toLowerCase();
    if (!host.includes('facebook.com')) return '';
    parsed.hash = '';
    const normalized = parsed.toString();
    if (parsed.search) return normalized;
    return normalized.endsWith('/') ? normalized : `${normalized}/`;
  } catch {
    return '';
  }
}

function buildReviewDocId(venueId: string, candidateFacebookUrl: string): string {
  const hash = createHash('sha1')
    .update(`${venueId}|${normalizeUrl(candidateFacebookUrl) || candidateFacebookUrl}`)
    .digest('hex')
    .slice(0, 16);
  return `vfb_${venueId}_${hash}`;
}

function getVenueName(venue: Record<string, unknown>): string {
  return String(venue.name || venue.pagename || venue.pageName || '').trim();
}

function getDistinctiveVenueTokens(venueName: string): string[] {
  const normalized = normalizeVenueName(venueName);
  if (!normalized) return [];
  return Array.from(
    new Set(
      normalized
        .split(' ')
        .map((token) => token.trim())
        .filter((token) => token.length >= 4)
        .filter((token) => !DISTINCTIVE_TOKEN_STOPWORDS.has(token))
    )
  );
}

function getClassificationPriority(value: VenueFacebookBackfillClassification): number {
  if (value === 'direct_match') return 0;
  if (value === 'parent_or_operator') return 1;
  return 2;
}

function classifyCandidate(params: {
  venueName: string;
  candidateFacebookUrl: string;
  sources: CandidateSourceEvidence[];
  pageUrlCandidate?: string;
  websiteCandidate?: string;
}): CandidateSelection {
  const { venueName, candidateFacebookUrl, sources, pageUrlCandidate, websiteCandidate } = params;
  const slug = String(extractFacebookSlug(candidateFacebookUrl) || '').trim().toLowerCase();
  const slugLabel = slug.replace(/[._-]+/g, ' ').trim();
  const slugSimilarity = slugLabel ? calculateEnhancedSimilarity(venueName, slugLabel) : 0;
  const pageUrlSimilarity = pageUrlCandidate
    ? calculateEnhancedSimilarity(venueName, String(extractFacebookSlug(pageUrlCandidate) || pageUrlCandidate).replace(/[._-]+/g, ' '))
    : 0;
  const websiteSource = sources.find((source) => source.source === 'website_extract');
  const websiteExtractorScore = Number(websiteSource?.score || 0);
  const distinctiveTokens = getDistinctiveVenueTokens(venueName);
  const normalizedSlug = normalizeVenueName(slugLabel);
  const distinctiveTokenMatches = distinctiveTokens.filter((token) => normalizedSlug.includes(token));
  const umbrellaHintTokens = Array.from(PARENT_OR_OPERATOR_HINT_TOKENS).filter((token) => slug.includes(token));
  const candidateSources = Array.from(new Set(sources.map((source) => source.source)));
  const sourceNotes = sources.map((source) => source.note).filter(Boolean) as string[];

  let classification: VenueFacebookBackfillClassification = 'weak_or_unclear';
  let confidence = Math.max(slugSimilarity, pageUrlSimilarity, websiteExtractorScore, 0.35);

  const pageUrlConfirmed = Boolean(pageUrlCandidate)
    && normalizeUrl(String(pageUrlCandidate || '')) === normalizeUrl(candidateFacebookUrl);
  const websiteConfirmed = Boolean(websiteCandidate)
    && normalizeUrl(String(websiteCandidate || '')) === normalizeUrl(candidateFacebookUrl);

  if (
    (pageUrlConfirmed && websiteConfirmed) ||
    (pageUrlConfirmed && (pageUrlSimilarity >= 0.42 || distinctiveTokenMatches.length >= 1)) ||
    (websiteConfirmed && (websiteExtractorScore >= 0.52 || distinctiveTokenMatches.length >= 2)) ||
    distinctiveTokenMatches.length >= 2 ||
    slugSimilarity >= 0.62
  ) {
    classification = 'direct_match';
    confidence = Math.max(confidence, pageUrlConfirmed && websiteConfirmed ? 0.97 : 0.82);
  } else if (umbrellaHintTokens.length || (websiteConfirmed && websiteExtractorScore < 0.45 && slugSimilarity < 0.4)) {
    classification = 'parent_or_operator';
    confidence = Math.max(confidence, 0.46);
  }

  return {
    candidateFacebookUrl,
    candidateFacebookUrlNormalized: normalizeUrl(candidateFacebookUrl) || candidateFacebookUrl,
    candidateSource: candidateSources[0] || 'website_extract',
    candidateSources,
    classification,
    confidence: Math.max(0, Math.min(0.99, confidence)),
    evidence: {
      candidateAlreadyInPageUrl: pageUrlConfirmed,
      candidateFoundOnWebsite: websiteConfirmed,
      websiteMatchesCandidate: websiteConfirmed,
      websiteExtractorScore: websiteExtractorScore || undefined,
      pageUrlSimilarity: pageUrlSimilarity || undefined,
      slugSimilarity: slugSimilarity || undefined,
      distinctiveTokenCount: distinctiveTokens.length || undefined,
      distinctiveTokenMatches,
      umbrellaHintTokens,
      notes: Array.from(new Set(sourceNotes)),
    },
  };
}

async function discoverCandidateForVenue(venue: Record<string, unknown>): Promise<CandidateSelection | null> {
  const venueName = getVenueName(venue);
  if (!venueName) return null;
  const existingFacebookUrl = normalizeFacebookCandidateUrl(venue.facebookUrl);
  if (existingFacebookUrl) {
    return null;
  }

  const candidateMap = new Map<string, CandidateSourceEvidence[]>();
  const pageUrlCandidate = normalizeFacebookCandidateUrl(venue.pageurl);
  const websiteUrl = String(venue.website || '').trim();
  let websiteCandidate = '';

  const addCandidate = (source: CandidateSourceEvidence): void => {
    const normalized = normalizeFacebookCandidateUrl(source.url);
    if (!normalized) return;
    const key = normalizeUrl(normalized) || normalized;
    const next = candidateMap.get(key) || [];
    next.push({ ...source, url: normalized });
    candidateMap.set(key, next);
  };

  if (pageUrlCandidate) {
    addCandidate({
      source: 'venue_pageurl',
      url: pageUrlCandidate,
      score: calculateEnhancedSimilarity(venueName, String(extractFacebookSlug(pageUrlCandidate) || pageUrlCandidate).replace(/[._-]+/g, ' ')),
      note: 'Venue doc has pageurl but facebookUrl is blank.',
    });
  }

  if (websiteUrl) {
    websiteCandidate = String(await extractFacebookUrlFromWebsite(websiteUrl, venueName) || '').trim();
    if (websiteCandidate) {
      addCandidate({
        source: 'website_extract',
        url: websiteCandidate,
        score: scoreWebsiteFacebookCandidate(venueName, websiteCandidate),
        note: 'Website extraction found this Facebook page from the venue website.',
      });
    }
  }

  const selections = Array.from(candidateMap.entries())
    .map(([key, sources]) => classifyCandidate({
      venueName,
      candidateFacebookUrl: sources[0]?.url || key,
      sources,
      pageUrlCandidate,
      websiteCandidate,
    }))
    .sort((a, b) => {
      const classDelta = getClassificationPriority(a.classification) - getClassificationPriority(b.classification);
      if (classDelta !== 0) return classDelta;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return a.candidateFacebookUrl.localeCompare(b.candidateFacebookUrl);
    });

  return selections[0] || null;
}

function buildDefaultSampleRowsForSeed(venueId: string): VenueFacebookBackfillSampleRow[] | undefined {
  return DEFAULT_SEED_CASES.find((entry) => entry.venueId === venueId)?.sampleRows;
}

function buildManualSeedSelection(params: {
  venueName: string;
  candidateFacebookUrl?: string;
  classification?: VenueFacebookBackfillClassification;
  confidence?: number;
  notes?: string[];
}): CandidateSelection | null {
  const normalizedCandidate = normalizeFacebookCandidateUrl(params.candidateFacebookUrl);
  if (!normalizedCandidate) return null;

  const baseSelection = classifyCandidate({
    venueName: params.venueName,
    candidateFacebookUrl: normalizedCandidate,
    sources: [{
      source: 'manual_seed',
      url: normalizedCandidate,
      score: Number(params.confidence || 0),
      note: 'Seeded manual review candidate.',
    }],
  });

  return {
    ...baseSelection,
    candidateSource: 'manual_seed',
    candidateSources: ['manual_seed'],
    classification: params.classification || baseSelection.classification,
    confidence: Number.isFinite(Number(params.confidence))
      ? Math.max(0, Math.min(0.99, Number(params.confidence)))
      : baseSelection.confidence,
    evidence: {
      ...baseSelection.evidence,
      notes: Array.from(new Set([
        ...(Array.isArray(baseSelection.evidence?.notes) ? baseSelection.evidence?.notes : []),
        ...(Array.isArray(params.notes) ? params.notes : []),
      ].filter(Boolean) as string[])),
    },
  };
}

async function getReviewDoc(reviewId: string): Promise<VenueFacebookBackfillReviewRecord | null> {
  const normalizedId = String(reviewId || '').trim();
  if (!normalizedId) return null;
  const snap = await db.collection(REVIEWS_COLLECTION).doc(normalizedId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as VenueFacebookBackfillReviewRecord) };
}

async function updateReviewDoc(reviewId: string, updates: Record<string, unknown>): Promise<void> {
  await db.collection(REVIEWS_COLLECTION).doc(reviewId).set(
    {
      ...updates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function appendVenueUrlToDriveList(facebookUrl?: string): Promise<FinalizeVenueFacebookBackfillResult['driveAppend']> {
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

async function sendVenueFacebookBackfillReviewEmail(record: VenueFacebookBackfillReviewRecord): Promise<boolean> {
  const webhook = getWebhookConfig();
  if (!webhook.url) {
    logger.info('Venue Facebook backfill email webhook not configured; skipping email', {
      reviewId: record.id,
      venueId: record.venueId,
      venueName: record.venueName,
    });
    return false;
  }

  const body = {
    type: 'venue_facebook_backfill_review',
    reviewId: record.id,
    venueId: record.venueId,
    venueName: record.venueName,
    venueWebsite: record.venueWebsite || '',
    existingFacebookUrl: record.existingFacebookUrl || '',
    existingPageUrl: record.existingPageUrl || '',
    candidateFacebookUrl: record.candidateFacebookUrl,
    candidateSource: record.candidateSource,
    candidateSources: record.candidateSources || [record.candidateSource],
    classification: record.classification,
    confidence: record.confidence,
    evidence: record.evidence || {},
    sampleRows: Array.isArray(record.sampleRows) ? record.sampleRows.slice(0, 3) : [],
    occurrenceCount: Number(record.occurrenceCount || 0),
    seedLabel: record.seedLabel || '',
  };

  try {
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(webhook.key ? { authorization: `Bearer ${webhook.key}` } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      logger.warn('Venue Facebook backfill email webhook returned non-OK', {
        reviewId: record.id,
        status: res.status,
        body: txt.slice(0, 500),
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.warn('Venue Facebook backfill email webhook failed', {
      reviewId: record.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function upsertReviewForVenue(params: {
  venueId: string;
  sampleRows?: VenueFacebookBackfillSampleRow[];
  forceReset?: boolean;
  seeded?: boolean;
  seedLabel?: string;
  sendEmail?: boolean;
  manualCandidateFacebookUrl?: string;
  manualClassification?: VenueFacebookBackfillClassification;
  manualConfidence?: number;
  manualEvidenceNotes?: string[];
}): Promise<{
  venueId: string;
  venueName?: string;
  reviewId?: string;
  status: 'seeded' | 'updated' | 'skipped' | 'no_candidate' | 'error';
  classification?: VenueFacebookBackfillClassification;
  candidateFacebookUrl?: string;
  message?: string;
  emailed?: boolean;
}> {
  try {
    const venueId = String(params.venueId || '').trim();
    if (!venueId) {
      return { venueId, status: 'error', message: 'venueId is required' };
    }

    const venue = await firestoreService.getVenue(venueId);
    if (!venue) {
      return { venueId, status: 'error', message: 'Venue not found' };
    }

    const venueAny = venue as unknown as Record<string, unknown>;
    const venueName = getVenueName(venueAny);
    const selection = await discoverCandidateForVenue(venueAny)
      || buildManualSeedSelection({
        venueName,
        candidateFacebookUrl: params.manualCandidateFacebookUrl,
        classification: params.manualClassification,
        confidence: params.manualConfidence,
        notes: params.manualEvidenceNotes,
      });
    if (!selection) {
      return {
        venueId,
        venueName,
        status: 'no_candidate',
        message: 'No candidate Facebook page was discoverable for this venue.',
      };
    }

    const reviewId = buildReviewDocId(venueId, selection.candidateFacebookUrl);
    const existing = await getReviewDoc(reviewId);
    if (
      existing &&
      !params.forceReset &&
      (existing.status === 'approved' || existing.status === 'rejected' || existing.status === 'suppressed')
    ) {
      return {
        venueId,
        venueName,
        reviewId,
        status: 'skipped',
        classification: selection.classification,
        candidateFacebookUrl: selection.candidateFacebookUrl,
        message: `Existing review is already terminal (${existing.status}).`,
      };
    }

    const sampleRows = params.sampleRows && params.sampleRows.length
      ? params.sampleRows
      : (buildDefaultSampleRowsForSeed(venueId) || existing?.sampleRows || []);

    const reviewHistory = Array.isArray(existing?.reviewHistory)
      ? existing?.reviewHistory.filter(Boolean)
      : [];
    reviewHistory.push({
      action: existing ? 'reseeded' : 'created',
      at: new Date(),
      by: params.seeded ? 'seedVenueFacebookBackfillReviews' : 'venueFacebookBackfillWorkflow',
      notes: params.seedLabel || selection.classification,
    });

    const now = new Date();
    const payload: VenueFacebookBackfillReviewRecord = {
      id: reviewId,
      type: 'venue_facebook_backfill_review',
      venueId,
      venueName,
      venueWebsite: String(venueAny.website || '').trim() || undefined,
      existingFacebookUrl: String(venueAny.facebookUrl || '').trim() || undefined,
      existingPageUrl: String(venueAny.pageurl || '').trim() || undefined,
      candidateFacebookUrl: selection.candidateFacebookUrl,
      candidateFacebookUrlNormalized: selection.candidateFacebookUrlNormalized,
      candidateSource: selection.candidateSource,
      candidateSources: selection.candidateSources,
      classification: selection.classification,
      confidence: selection.confidence,
      status: 'pending',
      firstSeenAt: existing?.firstSeenAt || now,
      lastSeenAt: now,
      occurrenceCount: Number(existing?.occurrenceCount || 0) + 1,
      seeded: params.seeded === true || existing?.seeded === true,
      seedLabel: params.seedLabel || existing?.seedLabel,
      evidence: selection.evidence,
      sampleRows,
      reviewHistory,
      resolution: existing?.resolution,
    };

    await updateReviewDoc(reviewId, payload as unknown as Record<string, unknown>);

    let emailed = false;
    if (params.sendEmail) {
      emailed = await sendVenueFacebookBackfillReviewEmail(payload);
      if (emailed) {
        await updateReviewDoc(reviewId, {
          lastPromptedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    return {
      venueId,
      venueName,
      reviewId,
      status: existing ? 'updated' : 'seeded',
      classification: selection.classification,
      candidateFacebookUrl: selection.candidateFacebookUrl,
      message: existing ? 'Review updated.' : 'Review created.',
      emailed,
    };
  } catch (error) {
    return {
      venueId: String(params.venueId || '').trim(),
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function seedVenueFacebookBackfillReviews(
  input: SeedVenueFacebookBackfillInput = {}
): Promise<SeedVenueFacebookBackfillResult> {
  const requestedVenueIds = Array.isArray(input.venueIds) && input.venueIds.length
    ? input.venueIds.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  const selectedCases: DefaultSeedCase[] = requestedVenueIds.length
    ? requestedVenueIds.map((venueId) => ({ venueId, seedLabel: 'manual_seed', sampleRows: undefined }))
    : (input.seedDefaults === false ? [] : DEFAULT_SEED_CASES);

  const results: SeedVenueFacebookBackfillResult['results'] = [];
  let emailedCount = 0;
  for (const seedCase of selectedCases) {
    const result = await upsertReviewForVenue({
      venueId: seedCase.venueId,
      sampleRows: seedCase.sampleRows,
      forceReset: input.forceReset === true,
      seeded: true,
      seedLabel: seedCase.seedLabel,
      sendEmail: input.sendEmails !== false,
      manualCandidateFacebookUrl: seedCase.manualCandidateFacebookUrl,
      manualClassification: seedCase.manualClassification,
      manualConfidence: seedCase.manualConfidence,
      manualEvidenceNotes: seedCase.manualEvidenceNotes,
    });
    if (result.emailed) emailedCount += 1;
    results.push(result);
  }

  return {
    success: true,
    requestedCount: selectedCases.length,
    processedCount: results.length,
    emailedCount,
    results,
  };
}

export async function previewVenueFacebookBackfillCandidate(
  venueId: string
): Promise<VenueFacebookBackfillPreview> {
  const normalizedVenueId = String(venueId || '').trim();
  const venue = normalizedVenueId ? await firestoreService.getVenue(normalizedVenueId) : null;
  if (!venue) {
    return { venueId: normalizedVenueId };
  }

  const venueAny = venue as unknown as Record<string, unknown>;
  const venueName = getVenueName(venueAny);
  const website = String(venueAny.website || '').trim() || undefined;
  const existingFacebookUrl = normalizeFacebookCandidateUrl(venueAny.facebookUrl) || undefined;
  const pageUrlCandidate = normalizeFacebookCandidateUrl(venueAny.pageurl) || undefined;
  const websiteCandidate = website
    ? String(await extractFacebookUrlFromWebsite(website, venueName) || '').trim() || undefined
    : undefined;
  const selection = await discoverCandidateForVenue(venueAny);

  return {
    venueId: normalizedVenueId,
    venueName,
    website,
    existingFacebookUrl,
    pageUrlCandidate,
    websiteCandidate,
    selection,
  };
}

export async function finalizeVenueFacebookBackfillReview(
  input: FinalizeVenueFacebookBackfillInput
): Promise<FinalizeVenueFacebookBackfillResult> {
  const reviewId = String(input.reviewId || '').trim();
  const action = String(input.action || '').trim() as FinalizeVenueFacebookBackfillAction;
  if (!reviewId) {
    throw new Error('reviewId is required');
  }
  if (!['approve', 'approve_and_append', 'reject', 'suppress', 'snooze'].includes(action)) {
    throw new Error('action must be approve, approve_and_append, reject, suppress, or snooze');
  }

  const review = await getReviewDoc(reviewId);
  if (!review) {
    throw new Error(`Venue Facebook backfill review not found: ${reviewId}`);
  }

  if (review.status === 'approved' && (action === 'approve' || action === 'approve_and_append')) {
    return {
      success: true,
      alreadyApplied: true,
      reviewId,
      action,
      status: review.status,
      venueId: review.venueId,
      venueName: review.venueName,
      candidateFacebookUrl: review.candidateFacebookUrl,
      message: 'This review was already approved earlier.',
    };
  }

  if (['rejected', 'suppressed'].includes(review.status) && ['reject', 'suppress'].includes(action)) {
    return {
      success: true,
      alreadyApplied: true,
      reviewId,
      action,
      status: review.status,
      venueId: review.venueId,
      venueName: review.venueName,
      candidateFacebookUrl: review.candidateFacebookUrl,
      message: `This review was already marked ${review.status} earlier.`,
    };
  }

  const resolvedBy = String(input.resolvedBy || '').trim() || 'venueFacebookBackfillManualFinalize';
  let nextStatus: VenueFacebookBackfillStatus = review.status;
  let driveAppend: FinalizeVenueFacebookBackfillResult['driveAppend'];

  if (action === 'approve' || action === 'approve_and_append') {
    const venue = await firestoreService.getVenue(review.venueId);
    if (!venue) {
      throw new Error(`Venue not found for review: ${review.venueId}`);
    }

    const candidateFacebookUrl = review.candidateFacebookUrl;
    const patch: Record<string, unknown> = {
      facebookUrl: candidateFacebookUrl,
      pageurl: candidateFacebookUrl,
      facebookSlug: extractFacebookSlug(candidateFacebookUrl) || admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      facebookBackfillApprovedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await db.collection('venues').doc(review.venueId).set(patch, { merge: true });

    if (action === 'approve_and_append') {
      driveAppend = await appendVenueUrlToDriveList(candidateFacebookUrl);
    }
    nextStatus = 'approved';
  } else if (action === 'reject') {
    nextStatus = 'rejected';
  } else if (action === 'suppress') {
    nextStatus = 'suppressed';
  } else if (action === 'snooze') {
    nextStatus = 'snoozed';
  }

  const history = Array.isArray(review.reviewHistory) ? review.reviewHistory : [];
  history.push({
    action,
    at: new Date(),
    by: resolvedBy,
    notes: driveAppend?.warning || undefined,
  });

  const suppressedUntil = action === 'snooze'
    ? admin.firestore.Timestamp.fromMillis(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000)
    : null;

  await updateReviewDoc(reviewId, {
    status: nextStatus,
    reviewHistory: history,
    suppressedUntil,
    resolution: {
      appendToVenueDoc: action === 'approve' || action === 'approve_and_append',
      appendToScrapeSeedList: action === 'approve_and_append',
      resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
      resolvedBy,
      action,
      warning: driveAppend?.warning,
    },
  });

  return {
    success: true,
    reviewId,
    action,
    status: nextStatus,
    venueId: review.venueId,
    venueName: review.venueName,
    candidateFacebookUrl: review.candidateFacebookUrl,
    driveAppend,
    message: action === 'snooze'
      ? `Review snoozed for ${SNOOZE_DAYS} days.`
      : undefined,
  };
}
