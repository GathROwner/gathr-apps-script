import * as admin from 'firebase-admin';
import { createHash, randomUUID } from 'node:crypto';
import { getFunctions } from 'firebase-admin/functions';
import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import {
  extractFirstUrl,
  normalizeSharedEventUrl,
  parseSharedEventPayloads,
  SHARED_EVENT_PARSER_VERSION,
  verifySharedEventSourceVisibility,
} from '../processing/sharedEventParser.js';
import { ApifyAdHocWebhook, startActorRunNoWait } from '../services/apifyService.js';
import * as firestoreService from '../services/firestoreService.js';
import { ParsedSharedEvent, SharedEventSubmitPayload } from '../types/sharedEvent.js';
import { logger } from '../utils/logger.js';

if (!admin.apps.length) {
  admin.initializeApp();
}

const openAiApiKey = defineSecret('OPENAI_API_KEY');
const apifyApiToken = defineSecret('APIFY_TOKEN');
const TASK_QUEUE_LOCATION = 'northamerica-northeast1';
const DEFAULT_FB_POSTS_SCRAPER_ACTOR_ID = 'KoJrdxJCTtpon81KY';
const MAX_SHARED_EVENT_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_SHARED_EVENT_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

function readBearerToken(authHeader: unknown): string {
  const raw = Array.isArray(authHeader) ? authHeader[0] : String(authHeader || '');
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

async function requireUserId(authHeader: unknown): Promise<string> {
  const token = readBearerToken(authHeader);
  if (!token) {
    throw new Error('Missing Firebase ID token.');
  }
  const decoded = await admin.auth().verifyIdToken(token);
  if (!decoded.uid) {
    throw new Error('Firebase ID token did not include a user id.');
  }
  return decoded.uid;
}

function asBodyObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized : undefined;
}

function stringArrayValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : undefined;
}

function sanitizeStorageFileName(value: unknown, fallback: string): string {
  const normalized = String(value || '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
  return normalized || fallback;
}

function extensionForContentType(value: string): string {
  const contentType = value.toLowerCase();
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('heic')) return 'heic';
  if (contentType.includes('heif')) return 'heif';
  return 'jpg';
}

function storageDownloadUrl(bucketName: string, filePath: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(filePath)}?alt=media&token=${encodeURIComponent(token)}`;
}

function sharedEventUploadsBucketName(): string {
  const firebaseConfig = (() => {
    try {
      return JSON.parse(process.env.FIREBASE_CONFIG || '{}') as { storageBucket?: string };
    } catch {
      return {};
    }
  })();

  return String(
    process.env.SHARED_EVENT_UPLOADS_BUCKET ||
    process.env.FIREBASE_STORAGE_BUCKET ||
    firebaseConfig.storageBucket ||
    'gathr-m1.firebasestorage.app'
  ).trim();
}

function normalizePayload(body: Record<string, unknown>): SharedEventSubmitPayload {
  const rawPayload = body.payload && typeof body.payload === 'object'
    ? body.payload as Record<string, unknown>
    : body;

  return {
    sourceUrl: stringValue(rawPayload.sourceUrl ?? rawPayload.url),
    url: stringValue(rawPayload.url),
    sharedText: stringValue(rawPayload.sharedText ?? rawPayload.text),
    text: stringValue(rawPayload.text),
    title: stringValue(rawPayload.title),
    description: stringValue(rawPayload.description),
    startDate: stringValue(rawPayload.startDate),
    endDate: stringValue(rawPayload.endDate),
    startTime: stringValue(rawPayload.startTime),
    endTime: stringValue(rawPayload.endTime),
    locationName: stringValue(rawPayload.locationName),
    venueName: stringValue(rawPayload.venueName),
    address: stringValue(rawPayload.address),
    mediaUrls: stringArrayValue(rawPayload.mediaUrls),
    sourcePlatform: stringValue(rawPayload.sourcePlatform),
    sourceApp: stringValue(rawPayload.sourceApp),
    visibilityHint: stringValue(rawPayload.visibilityHint),
    timezone: stringValue(rawPayload.timezone),
  };
}

function hasUsablePayload(payload: SharedEventSubmitPayload): boolean {
  return Boolean(
    payload.sourceUrl ||
    payload.url ||
    payload.sharedText ||
    payload.text ||
    payload.title ||
    payload.description ||
    (Array.isArray(payload.mediaUrls) && payload.mediaUrls.length > 0)
  );
}

function resolveSourceUrl(payload: SharedEventSubmitPayload): string | undefined {
  return normalizeSharedEventUrl(payload.sourceUrl ?? payload.url) ||
    normalizeSharedEventUrl(extractFirstUrl(String(payload.sharedText || payload.text || '')));
}

function canReuseSharedSource(payload: SharedEventSubmitPayload): boolean {
  return !(
    (Array.isArray(payload.mediaUrls) && payload.mediaUrls.length > 0) ||
    payload.title ||
    payload.description ||
    payload.startDate ||
    payload.endDate ||
    payload.startTime ||
    payload.endTime ||
    payload.locationName ||
    payload.venueName ||
    payload.address
  );
}

function shouldQueueSharedEventProcessing(payload: SharedEventSubmitPayload): boolean {
  if (!envFlagEnabled(process.env.SHARED_EVENT_ASYNC_MEDIA_PROCESSING_ENABLED, true)) {
    return false;
  }
  return Array.isArray(payload.mediaUrls) && payload.mediaUrls.filter(Boolean).length > 0;
}

function sourcePlatformForQueuedIngest(payload: SharedEventSubmitPayload, sourceUrl: string | undefined) {
  const explicit = String(payload.sourcePlatform || '').trim().toLowerCase();
  if (explicit === 'facebook' || explicit === 'instagram' || explicit === 'web' || explicit === 'unknown') {
    return explicit;
  }
  if (isFacebookUrl(sourceUrl)) return 'facebook';
  if (sourceUrl) return 'web';
  return 'unknown';
}

function hostForLog(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).hostname;
  } catch {
    return undefined;
  }
}

function envFlagEnabled(value: string | undefined, fallback: boolean): boolean {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'y', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(raw)) return false;
  return fallback;
}

function parsePositiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(Math.trunc(parsed), max));
}

function isFacebookUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return new URL(value).hostname.toLowerCase().includes('facebook.com');
  } catch {
    return false;
  }
}

function looksLikeFacebookEventUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.hostname.toLowerCase().includes('facebook.com') &&
      url.pathname.toLowerCase().split('/').filter(Boolean).includes('events');
  } catch {
    return false;
  }
}

function getSharedEventPostScrapeActorId(): string {
  return String(
    process.env.SHARED_EVENT_FACEBOOK_POSTS_SCRAPE_ACTOR_ID ||
    process.env.UNKNOWN_VENUE_POSTS_SCRAPE_ACTOR_ID ||
    DEFAULT_FB_POSTS_SCRAPER_ACTOR_ID
  ).trim();
}

function getFirebaseProjectId(): string {
  const explicit = String(
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    process.env.PROJECT_ID ||
    ''
  ).trim();
  if (explicit) {
    return explicit;
  }

  try {
    const firebaseConfig = JSON.parse(String(process.env.FIREBASE_CONFIG || '{}')) as { projectId?: unknown };
    return String(firebaseConfig.projectId || '').trim();
  } catch {
    return '';
  }
}

function getSharedEventApifyWebhookUrl(): string {
  const explicit = String(
    process.env.SHARED_EVENT_APIFY_WEBHOOK_URL ||
    process.env.APIFY_WEBHOOK_URL ||
    ''
  ).trim();
  if (explicit) {
    return explicit;
  }

  const projectId = getFirebaseProjectId();
  if (!projectId) {
    return '';
  }
  const targetProjectId = String(
    process.env.SHARED_EVENT_PUBLIC_PARSER_PROJECT_ID ||
    (projectId === 'gathr-m1' ? 'gathr-migrated' : projectId)
  ).trim();
  const region = String(
    process.env.SHARED_EVENT_APIFY_WEBHOOK_REGION ||
    process.env.FUNCTION_REGION ||
    'northamerica-northeast2'
  ).trim();
  return `https://${region}-${targetProjectId}.cloudfunctions.net/apifyWebhook`;
}

function buildSharedEventApifyWebhooks(enrichmentId: string): ApifyAdHocWebhook[] {
  const requestUrl = getSharedEventApifyWebhookUrl();
  if (!requestUrl) {
    return [];
  }

  return [{
    eventTypes: [
      'ACTOR.RUN.SUCCEEDED',
      'ACTOR.RUN.FAILED',
      'ACTOR.RUN.ABORTED',
      'ACTOR.RUN.TIMED_OUT',
    ],
    requestUrl,
    idempotencyKey: `shared-event-scrape-${enrichmentId}`,
  }];
}

function eventResponse(parsedEvent: ParsedSharedEvent, ids?: {
  privateEventId?: string;
  publicCandidateId?: string;
}) {
  return {
    privateEventId: ids?.privateEventId,
    publicCandidateId: ids?.publicCandidateId,
    title: parsedEvent.title,
    description: parsedEvent.description,
    startDate: parsedEvent.startDate,
    endDate: parsedEvent.endDate,
    startTime: parsedEvent.startTime,
    endTime: parsedEvent.endTime,
    locationName: parsedEvent.locationName,
    address: parsedEvent.address,
    mediaUrls: parsedEvent.mediaUrls,
    imageUrl: parsedEvent.mediaUrls[0],
    sourceUrl: parsedEvent.sourceUrl,
    sourcePlatform: parsedEvent.sourcePlatform,
    routing: parsedEvent.routing,
    status: parsedEvent.status,
    confidence: parsedEvent.confidence,
    needsUserReview: parsedEvent.needsUserReview,
    reviewReasons: parsedEvent.reviewReasons,
    isExpired: parsedEvent.isExpired,
    sequenceIndex: parsedEvent.sequenceIndex,
    extractedFromShare: parsedEvent.extractedFromShare,
  };
}

function successResponse(params: {
  ingestId: string;
  parsedEvents: ParsedSharedEvent[];
  eventLinks: Array<{ privateEventId: string; publicCandidateId?: string }>;
}) {
  const { ingestId, parsedEvents, eventLinks } = params;
  const summary = summarizeSharedEventResult(parsedEvents, eventLinks);
  const parsedEvent = summary.parsedEvent;

  return {
    success: true,
    ingestId,
    privateEventId: summary.privateEventId,
    privateEventIds: eventLinks.map((link) => link.privateEventId),
    publicCandidateId: summary.publicCandidateId,
    publicCandidateIds: eventLinks
      .map((link) => link.publicCandidateId)
      .filter((id): id is string => Boolean(id)),
    routing: summary.routing,
    sourceVisibility: parsedEvent.sourceVisibility,
    status: summary.status,
    extractedEventCount: parsedEvents.length,
    needsUserReview: summary.needsUserReview,
    reviewReasons: summary.reviewReasons,
    confidence: summary.confidence,
    event: eventResponse(parsedEvent, eventLinks[summary.summaryIndex]),
    events: parsedEvents.map((event, index) => eventResponse(event, eventLinks[index])),
    visibilityEvidence: parsedEvent.visibilityEvidence,
  };
}

function queuedResponse(params: { ingestId: string }) {
  return {
    success: true,
    ingestId: params.ingestId,
    processingStatus: 'queued',
    routing: 'private_only',
    sourceVisibility: 'unknown',
    status: 'needs_user_review',
    extractedEventCount: 0,
    needsUserReview: false,
    reviewReasons: [],
    events: [],
  };
}

function isTaskAlreadyExistsError(error: unknown): boolean {
  const code = Number((error as { code?: unknown })?.code);
  const message = error instanceof Error ? error.message : String(error || '');
  return code === 6 || /already exists/i.test(message);
}

async function enqueueSharedEventIngestProcessing(params: {
  ownerUid: string;
  ingestId: string;
}): Promise<void> {
  const queue = getFunctions().taskQueue(
    `locations/${TASK_QUEUE_LOCATION}/functions/processSharedEventIngest`
  );
  const taskId = `shared-event-${createHash('sha1')
    .update(`${params.ownerUid}|${params.ingestId}`)
    .digest('hex')
    .slice(0, 40)}`;

  try {
    await queue.enqueue(
      {
        ownerUid: params.ownerUid,
        ingestId: params.ingestId,
      },
      {
        scheduleDelaySeconds: 0,
        id: taskId,
      }
    );
    logger.info('Queued shared event ingest task', {
      ownerUid: params.ownerUid,
      ingestId: params.ingestId,
      queueLocation: TASK_QUEUE_LOCATION,
      taskId,
    });
  } catch (error) {
    if (isTaskAlreadyExistsError(error)) {
      logger.info('Shared event ingest task already queued', {
        ownerUid: params.ownerUid,
        ingestId: params.ingestId,
        taskId,
      });
      return;
    }
    throw error;
  }
}

function countByString(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const key = String(value || 'unknown').trim() || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function summarizeParsedEventsForLog(parsedEvents: ParsedSharedEvent[]): Record<string, unknown> {
  const reviewReasons = parsedEvents.flatMap((event) => (
    Array.isArray(event.reviewReasons) && event.reviewReasons.length > 0
      ? event.reviewReasons
      : ['none']
  ));
  const currentCount = parsedEvents.filter((event) => !event.isExpired).length;
  const expiredCount = parsedEvents.length - currentCount;

  return {
    parsedEventCount: parsedEvents.length,
    currentCount,
    expiredCount,
    routingCounts: countByString(parsedEvents.map((event) => event.routing)),
    statusCounts: countByString(parsedEvents.map((event) => event.status)),
    reviewReasonCounts: countByString(reviewReasons),
    sampleEvents: parsedEvents.slice(0, 8).map((event, index) => ({
      index,
      title: event.title,
      startDate: event.startDate,
      startTime: event.startTime,
      locationName: event.locationName,
      routing: event.routing,
      status: event.status,
      isExpired: event.isExpired,
      reviewReasons: event.reviewReasons,
    })),
  };
}

function summarizeSharedEventResult(
  parsedEvents: ParsedSharedEvent[],
  eventLinks: Array<{ privateEventId: string; publicCandidateId?: string }>
) {
  const summaryIndex = Math.max(
    parsedEvents.findIndex((event) => event.routing === 'public_candidate' && !event.isExpired),
    parsedEvents.findIndex((event) => !event.isExpired),
    0
  );
  const parsedEvent = parsedEvents[summaryIndex] || parsedEvents[0];
  const privateEventId = eventLinks[summaryIndex]?.privateEventId;
  const publicCandidateId = eventLinks[summaryIndex]?.publicCandidateId;
  const currentEvents = parsedEvents.filter((event) => !event.isExpired);
  const hasCurrentPublicCandidate = currentEvents.some((event) => event.routing === 'public_candidate');
  const allEventsExpired = parsedEvents.length > 0 && parsedEvents.every((event) => event.isExpired);
  const needsUserReview = parsedEvents.some((event) => event.needsUserReview);
  const reviewReasons = Array.from(new Set(parsedEvents.flatMap((event) => event.reviewReasons)));
  const confidence = Math.min(...parsedEvents.map((event) => event.confidence));
  const summaryRouting = hasCurrentPublicCandidate
    ? 'public_candidate'
    : allEventsExpired
      ? 'not_public_candidate'
      : parsedEvent.routing;
  const summaryStatus = hasCurrentPublicCandidate
    ? 'submitted_public_candidate'
    : allEventsExpired
      ? 'expired'
      : parsedEvent.status;

  return {
    summaryIndex,
    parsedEvent,
    privateEventId,
    publicCandidateId,
    routing: summaryRouting,
    status: summaryStatus,
    needsUserReview,
    reviewReasons,
    confidence,
  };
}

function resolveScrapeEnrichmentUrl(sourceUrl: string | undefined, parsedEvent: ParsedSharedEvent): string | undefined {
  return normalizeSharedEventUrl(parsedEvent.visibilityEvidence.finalUrl) ||
    normalizeSharedEventUrl(parsedEvent.visibilityEvidence.url) ||
    normalizeSharedEventUrl(parsedEvent.sourceUrl) ||
    normalizeSharedEventUrl(sourceUrl);
}

function shouldQueueSharedEventScrapeEnrichment(params: {
  payload: SharedEventSubmitPayload;
  sourceUrl?: string;
  parsedEvents: ParsedSharedEvent[];
  summary: ReturnType<typeof summarizeSharedEventResult>;
}): { shouldQueue: true; reason: string; scrapeUrl: string; sourcePostId: string } | { shouldQueue: false; reason: string } {
  if (!envFlagEnabled(process.env.SHARED_EVENT_APIFY_ENRICHMENT_ENABLED, true)) {
    return { shouldQueue: false, reason: 'disabled' };
  }

  const { payload, sourceUrl, parsedEvents, summary } = params;
  const parsedEvent = summary.parsedEvent;
  if (parsedEvent.sourceVisibility !== 'public_verified') {
    return { shouldQueue: false, reason: 'source_not_public_verified' };
  }

  const mediaUrls = Array.isArray(payload.mediaUrls) ? payload.mediaUrls.filter(Boolean) : [];
  if (mediaUrls.length > 0) {
    return { shouldQueue: false, reason: 'share_payload_already_has_media' };
  }

  const scrapeUrl = resolveScrapeEnrichmentUrl(sourceUrl, parsedEvent);
  if (!scrapeUrl || !isFacebookUrl(scrapeUrl)) {
    return { shouldQueue: false, reason: 'not_facebook_url' };
  }
  if (looksLikeFacebookEventUrl(scrapeUrl)) {
    return { shouldQueue: false, reason: 'facebook_event_url_uses_event_flow' };
  }

  const sourcePostId = String(parsedEvent.visibilityEvidence.sourcePostId || '').trim();
  if (!sourcePostId) {
    return { shouldQueue: false, reason: 'missing_source_post_id' };
  }

  const hasOnlyShareUrl = canReuseSharedSource(payload);
  const hasWeakResult = summary.needsUserReview ||
    summary.confidence < 85 ||
    parsedEvents.length <= 1 ||
    parsedEvents.some((event) =>
      event.reviewReasons.includes('missing_title') ||
      event.reviewReasons.includes('missing_start_date') ||
      event.reviewReasons.includes('missing_location')
    );

  if (!hasOnlyShareUrl && !hasWeakResult) {
    return { shouldQueue: false, reason: 'share_payload_specific_enough' };
  }

  return {
    shouldQueue: true,
    reason: hasWeakResult ? 'public_facebook_post_weak_share_parse' : 'public_facebook_post_link_only',
    scrapeUrl,
    sourcePostId,
  };
}

async function maybeQueueSharedEventScrapeEnrichment(params: {
  ownerUid: string;
  ingestId: string;
  payload: SharedEventSubmitPayload;
  sourceUrl?: string;
  parsedEvents: ParsedSharedEvent[];
  summary: ReturnType<typeof summarizeSharedEventResult>;
}): Promise<void> {
  const decision = shouldQueueSharedEventScrapeEnrichment(params);
  if (!decision.shouldQueue) {
    logger.info('Shared event scrape enrichment skipped', {
      ownerUid: params.ownerUid,
      ingestId: params.ingestId,
      reason: decision.reason,
    });
    return;
  }

  const apifyToken = String(apifyApiToken.value() || process.env.APIFY_TOKEN || '').trim();
  const actorId = getSharedEventPostScrapeActorId();
  if (!apifyToken || !actorId) {
    logger.warn('Shared event scrape enrichment not configured', {
      ownerUid: params.ownerUid,
      ingestId: params.ingestId,
      hasApifyToken: Boolean(apifyToken),
      actorId: actorId || undefined,
    });
    return;
  }

  const dedupeHours = parsePositiveInt(process.env.SHARED_EVENT_APIFY_ENRICHMENT_DEDUPE_HOURS, 24, 1, 168);
  const activeDedupeMinutes = parsePositiveInt(
    process.env.SHARED_EVENT_APIFY_ACTIVE_DEDUPE_MINUTES,
    30,
    5,
    1440
  );
  const reservation = await firestoreService.reserveSharedEventScrapeEnrichment({
    ownerUid: params.ownerUid,
    ingestId: params.ingestId,
    normalizedSourceUrl: decision.scrapeUrl,
    sourcePostId: decision.sourcePostId,
    parserVersion: SHARED_EVENT_PARSER_VERSION,
    reason: decision.reason,
    dedupeHours,
    activeDedupeMinutes,
  });

  if (!reservation.reserved) {
    logger.info('Shared event scrape enrichment duplicate suppressed', {
      ownerUid: params.ownerUid,
      ingestId: params.ingestId,
      enrichmentId: reservation.enrichmentId,
      existingStatus: reservation.existingStatus,
      existingActorRunId: reservation.existingActorRunId,
      sourcePostId: decision.sourcePostId,
    });
    return;
  }

  const resultsLimit = parsePositiveInt(process.env.SHARED_EVENT_APIFY_ENRICHMENT_RESULTS_LIMIT, 1, 1, 5);
  const input: Record<string, unknown> = {
    startUrls: [{ url: decision.scrapeUrl }],
    resultsLimit,
    captionText: false,
  };
  const webhooks = buildSharedEventApifyWebhooks(reservation.enrichmentId);
  if (webhooks.length === 0) {
    logger.warn('Shared event scrape enrichment has no Apify completion webhook configured', {
      ownerUid: params.ownerUid,
      ingestId: params.ingestId,
      enrichmentId: reservation.enrichmentId,
      sourcePostId: decision.sourcePostId,
    });
  }

  try {
    const run = await startActorRunNoWait(actorId, apifyToken, input, { webhooks });
    await firestoreService.markSharedEventScrapeEnrichmentQueued({
      ownerUid: params.ownerUid,
      ingestId: params.ingestId,
      enrichmentId: reservation.enrichmentId,
      actorId,
      actorRunId: run.actorRunId,
      datasetId: run.datasetId,
      runUrl: run.runUrl,
      input,
    });
    logger.info('Shared event scrape enrichment queued', {
      ownerUid: params.ownerUid,
      ingestId: params.ingestId,
      enrichmentId: reservation.enrichmentId,
      actorId,
      actorRunId: run.actorRunId,
      datasetId: run.datasetId,
      sourcePostId: decision.sourcePostId,
      scrapeHost: hostForLog(decision.scrapeUrl),
      webhookCount: webhooks.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown Apify start failure';
    await firestoreService.markSharedEventScrapeEnrichmentFailed({
      ownerUid: params.ownerUid,
      ingestId: params.ingestId,
      enrichmentId: reservation.enrichmentId,
      error: errorMessage,
    });
    logger.warn('Shared event scrape enrichment failed to queue', {
      ownerUid: params.ownerUid,
      ingestId: params.ingestId,
      enrichmentId: reservation.enrichmentId,
      sourcePostId: decision.sourcePostId,
      error: errorMessage,
    });
  }
}

async function processSharedEventPayloadToFirestore(params: {
  ownerUid: string;
  payload: SharedEventSubmitPayload;
  sourceUrl?: string;
  ingestId?: string;
  visibility?: Awaited<ReturnType<typeof verifySharedEventSourceVisibility>>;
}): Promise<{
  ingestId: string;
  parsedEvents: ParsedSharedEvent[];
  eventLinks: Array<{ privateEventId: string; publicCandidateId?: string }>;
}> {
  const sourceUrl = params.sourceUrl || resolveSourceUrl(params.payload);
  const visibility = params.visibility || await verifySharedEventSourceVisibility(params.payload, sourceUrl);
  if (!params.visibility) {
    logger.info('submitSharedEvent visibility evidence', {
      ownerUid: params.ownerUid,
      ingestId: params.ingestId,
      sourceHost: hostForLog(sourceUrl),
      visibility: visibility.visibility,
      method: visibility.evidence.method,
      httpStatus: visibility.evidence.httpStatus,
      hasImageUrl: Boolean(visibility.evidence.imageUrl),
      ogType: visibility.evidence.ogType,
      titleFound: visibility.evidence.titleFound,
      descriptionFound: visibility.evidence.descriptionFound,
      sourcePostId: visibility.evidence.sourcePostId,
    });
  }

  const parsedEvents = await parseSharedEventPayloads(params.payload, {
    sourceVisibility: visibility.visibility,
    visibilityEvidence: visibility.evidence,
  });
  const parsedEvent = parsedEvents[0];
  const normalizedSourceUrl = visibility.evidence.finalUrl
    ? normalizeSharedEventUrl(visibility.evidence.finalUrl)
    : sourceUrl;

  const ingestId = params.ingestId || await firestoreService.createSharedEventIngest({
    ownerUid: params.ownerUid,
    payload: params.payload,
    parsedEvent,
    parserVersion: SHARED_EVENT_PARSER_VERSION,
  });

  if (params.ingestId) {
    await firestoreService.updateSharedEventIngestParsedSource({
      ownerUid: params.ownerUid,
      ingestId,
      parsedEvent,
      parserVersion: SHARED_EVENT_PARSER_VERSION,
      normalizedSourceUrl,
    });
  }

  logger.info('submitSharedEvent parsed event summary', {
    ownerUid: params.ownerUid,
    ingestId,
    sourceHost: hostForLog(sourceUrl),
    sourceApp: params.payload.sourceApp,
    mediaUrlCount: Array.isArray(params.payload.mediaUrls) ? params.payload.mediaUrls.length : 0,
    sourceVisibility: visibility.visibility,
    ...summarizeParsedEventsForLog(parsedEvents),
  });

  const eventLinks = await Promise.all(parsedEvents.map(async (currentParsedEvent, index) => {
    const updateIngestLink = index === 0;
    const privateEventId = await firestoreService.createPrivateSharedEvent({
      ownerUid: params.ownerUid,
      ingestId,
      parsedEvent: currentParsedEvent,
      updateIngestLink,
    });
    const publicCandidateId = currentParsedEvent.routing === 'public_candidate'
      ? await firestoreService.createPublicSharedEventCandidate({
        ownerUid: params.ownerUid,
        ingestId,
        privateEventId,
        parsedEvent: currentParsedEvent,
        updateIngestLink,
      })
      : undefined;
    return { privateEventId, publicCandidateId };
  }));

  const summary = summarizeSharedEventResult(parsedEvents, eventLinks);

  await firestoreService.updateSharedEventIngestExtractedEvents({
    ownerUid: params.ownerUid,
    ingestId,
    privateEventIds: eventLinks.map((link) => link.privateEventId),
    publicCandidateIds: eventLinks
      .map((link) => link.publicCandidateId)
      .filter((id): id is string => Boolean(id)),
    eventLinks,
    extractedEventCount: parsedEvents.length,
    status: summary.status,
    routing: summary.routing,
    privateEventId: summary.privateEventId,
    publicCandidateId: summary.publicCandidateId,
    parsedEvents,
    processingStatus: 'completed',
  });

  await maybeQueueSharedEventScrapeEnrichment({
    ownerUid: params.ownerUid,
    ingestId,
    payload: params.payload,
    sourceUrl,
    parsedEvents,
    summary,
  });

  logger.info('submitSharedEvent complete', {
    ownerUid: params.ownerUid,
    ingestId,
    privateEventId: summary.privateEventId,
    publicCandidateId: summary.publicCandidateId,
    extractedEventCount: parsedEvents.length,
    sourceVisibility: parsedEvent.sourceVisibility,
    routing: summary.routing,
    needsUserReview: summary.needsUserReview,
  });

  return { ingestId, parsedEvents, eventLinks };
}

export const processSharedEventIngest = onTaskDispatched(
  {
    retryConfig: {
      maxAttempts: 1,
    },
    rateLimits: {
      maxConcurrentDispatches: 2,
    },
    timeoutSeconds: 540,
    memory: '1GiB',
    region: TASK_QUEUE_LOCATION,
    secrets: [openAiApiKey, apifyApiToken],
  },
  async (request) => {
    const ownerUid = String(request.data?.ownerUid || '').trim();
    const ingestId = String(request.data?.ingestId || '').trim();
    logger.setContext({ functionName: 'processSharedEventIngest', ownerUid, ingestId });

    if (!ownerUid || !ingestId) {
      logger.warn('processSharedEventIngest missing ownerUid or ingestId', { ownerUid, ingestId });
      return;
    }

    const existing = await firestoreService.getSharedEventIngest({ ownerUid, ingestId });
    if (!existing) {
      logger.warn('processSharedEventIngest ingest not found', { ownerUid, ingestId });
      return;
    }
    if (existing.processingStatus === 'completed' && Number(existing.extractedEventCount || 0) > 0) {
      logger.info('processSharedEventIngest already completed', {
        ownerUid,
        ingestId,
        extractedEventCount: existing.extractedEventCount,
      });
      return;
    }

    try {
      await firestoreService.markSharedEventIngestProcessing({ ownerUid, ingestId });
      await processSharedEventPayloadToFirestore({
        ownerUid,
        ingestId,
        payload: existing.payload,
        sourceUrl: existing.normalizedSourceUrl || resolveSourceUrl(existing.payload),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown shared event processing error';
      await firestoreService.markSharedEventIngestFailed({ ownerUid, ingestId, error: errorMessage });
      logger.error('processSharedEventIngest failed', error, { ownerUid, ingestId });
    }
  }
);

export const uploadSharedEventImage = onRequest(
  {
    timeoutSeconds: 60,
    memory: '512MiB',
    region: 'northamerica-northeast2',
    cors: true,
  },
  async (request, response) => {
    if (request.method === 'OPTIONS') {
      response.status(204).send('');
      return;
    }

    if (request.method !== 'POST') {
      response.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    let ownerUid = '';
    try {
      ownerUid = await requireUserId(request.headers.authorization);
    } catch (error) {
      response.status(401).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unauthorized',
      });
      return;
    }

    try {
      const body = asBodyObject(request.body);
      const rawContentType = stringValue(body.contentType)?.toLowerCase() || 'image/jpeg';
      const contentType = rawContentType === 'image/jpg' ? 'image/jpeg' : rawContentType;
      if (!ALLOWED_SHARED_EVENT_IMAGE_TYPES.has(contentType)) {
        response.status(400).json({
          success: false,
          error: 'Only image uploads are supported.',
        });
        return;
      }

      const rawBase64 = stringValue(body.base64Data);
      const base64Data = rawBase64?.replace(/^data:[^;]+;base64,/i, '') || '';
      if (!base64Data) {
        response.status(400).json({
          success: false,
          error: 'Missing image data.',
        });
        return;
      }

      const buffer = Buffer.from(base64Data, 'base64');
      if (buffer.length === 0 || buffer.length > MAX_SHARED_EVENT_UPLOAD_BYTES) {
        response.status(413).json({
          success: false,
          error: `Image must be smaller than ${Math.round(MAX_SHARED_EVENT_UPLOAD_BYTES / 1024 / 1024)} MB.`,
        });
        return;
      }

      const extension = extensionForContentType(contentType);
      const fileName = sanitizeStorageFileName(body.fileName, `image.${extension}`);
      const uploadId = randomUUID();
      const filePath = `sharedEventUploads/${ownerUid}/${Date.now()}-${uploadId}-${fileName}`;
      const bucketName = sharedEventUploadsBucketName();
      const bucket = admin.storage().bucket(bucketName);
      const downloadToken = randomUUID();

      await bucket.file(filePath).save(buffer, {
        resumable: false,
        contentType,
        metadata: {
          cacheControl: 'private, max-age=31536000',
          metadata: {
            firebaseStorageDownloadTokens: downloadToken,
            ownerUid,
            source: 'shared_event_upload_function',
          },
        },
      });

      const mediaUrl = storageDownloadUrl(bucket.name, filePath, downloadToken);
      logger.info('Uploaded shared event image', {
        ownerUid,
        filePath,
        contentType,
        byteLength: buffer.length,
      });

      response.json({
        success: true,
        mediaUrl,
        path: filePath,
        contentType,
        byteLength: buffer.length,
      });
    } catch (error) {
      logger.error('uploadSharedEventImage failed', error, { ownerUid });
      response.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Image upload failed.',
      });
    }
  }
);

export const submitSharedEvent = onRequest(
  {
    timeoutSeconds: 180,
    memory: '512MiB',
    region: 'northamerica-northeast2',
    cors: true,
    secrets: [openAiApiKey, apifyApiToken],
  },
  async (request, response) => {
    if (request.method === 'OPTIONS') {
      response.status(204).send('');
      return;
    }

    if (request.method !== 'POST') {
      response.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    let ownerUid = '';
    try {
      ownerUid = await requireUserId(request.headers.authorization);
    } catch (error) {
      response.status(401).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unauthorized',
      });
      return;
    }

    try {
      const payload = normalizePayload(asBodyObject(request.body));
      if (!hasUsablePayload(payload)) {
        response.status(400).json({
          success: false,
          error: 'Provide a shared event URL, text, title, or description.',
        });
        return;
      }

      const sourceUrl = resolveSourceUrl(payload);
      logger.info('submitSharedEvent normalized payload', {
        ownerUid,
        sourceHost: hostForLog(sourceUrl),
        sourceApp: payload.sourceApp,
        hasTitle: Boolean(payload.title),
        hasDescription: Boolean(payload.description),
        sharedTextLength: String(payload.sharedText || payload.text || '').length,
        mediaUrlCount: Array.isArray(payload.mediaUrls) ? payload.mediaUrls.length : 0,
      });

      if (sourceUrl && canReuseSharedSource(payload)) {
        const reusable = await firestoreService.findReusableSharedEventIngest({
          ownerUid,
          normalizedSourceUrl: sourceUrl,
          parserVersion: SHARED_EVENT_PARSER_VERSION,
          allowIncomplete: false,
        });
        if (reusable) {
          const reusableSummary = summarizeSharedEventResult(reusable.privateEvents, reusable.eventLinks);
          await maybeQueueSharedEventScrapeEnrichment({
            ownerUid,
            ingestId: reusable.ingestId,
            payload,
            sourceUrl,
            parsedEvents: reusable.privateEvents,
            summary: reusableSummary,
          });
          logger.info('submitSharedEvent reused existing ingest', {
            ownerUid,
            ingestId: reusable.ingestId,
            extractedEventCount: reusable.privateEvents.length,
            sourceVisibility: reusable.record.sourceVisibility,
            routing: reusable.record.routing,
          });
          response.json(successResponse({
            ingestId: reusable.ingestId,
            parsedEvents: reusable.privateEvents,
            eventLinks: reusable.eventLinks,
          }));
          return;
        }
      }

      if (shouldQueueSharedEventProcessing(payload)) {
        const ingestId = await firestoreService.createQueuedSharedEventIngest({
          ownerUid,
          payload,
          normalizedSourceUrl: sourceUrl,
          sourcePlatform: sourcePlatformForQueuedIngest(payload, sourceUrl),
          parserVersion: SHARED_EVENT_PARSER_VERSION,
        });
        await enqueueSharedEventIngestProcessing({ ownerUid, ingestId });
        logger.info('submitSharedEvent queued async media processing', {
          ownerUid,
          ingestId,
          sourceHost: hostForLog(sourceUrl),
          mediaUrlCount: Array.isArray(payload.mediaUrls) ? payload.mediaUrls.length : 0,
        });
        response.json(queuedResponse({ ingestId }));
        return;
      }

      const visibility = await verifySharedEventSourceVisibility(payload, sourceUrl);
      logger.info('submitSharedEvent visibility evidence', {
        ownerUid,
        sourceHost: hostForLog(sourceUrl),
        visibility: visibility.visibility,
        method: visibility.evidence.method,
        httpStatus: visibility.evidence.httpStatus,
        hasImageUrl: Boolean(visibility.evidence.imageUrl),
        ogType: visibility.evidence.ogType,
        titleFound: visibility.evidence.titleFound,
        descriptionFound: visibility.evidence.descriptionFound,
        sourcePostId: visibility.evidence.sourcePostId,
      });

      if (sourceUrl && canReuseSharedSource(payload)) {
        const canonicalSourceUrl = visibility.evidence.finalUrl
          ? normalizeSharedEventUrl(visibility.evidence.finalUrl)
          : undefined;
        const reusable = await firestoreService.findReusableSharedEventIngest({
          ownerUid,
          normalizedSourceUrl: canonicalSourceUrl || sourceUrl,
          parserVersion: SHARED_EVENT_PARSER_VERSION,
          allowIncomplete: true,
          sourcePostId: visibility.evidence.sourcePostId,
        });
        if (reusable) {
          const reusableSummary = summarizeSharedEventResult(reusable.privateEvents, reusable.eventLinks);
          await maybeQueueSharedEventScrapeEnrichment({
            ownerUid,
            ingestId: reusable.ingestId,
            payload,
            sourceUrl,
            parsedEvents: reusable.privateEvents,
            summary: reusableSummary,
          });
          logger.info('submitSharedEvent reused existing ingest after visibility probe', {
            ownerUid,
            ingestId: reusable.ingestId,
            extractedEventCount: reusable.privateEvents.length,
            sourceVisibility: reusable.record.sourceVisibility,
            routing: reusable.record.routing,
            sourcePostId: visibility.evidence.sourcePostId,
          });
          response.json(successResponse({
            ingestId: reusable.ingestId,
            parsedEvents: reusable.privateEvents,
            eventLinks: reusable.eventLinks,
          }));
          return;
        }
      }

      const processed = await processSharedEventPayloadToFirestore({
        ownerUid,
        payload,
        sourceUrl,
        visibility,
      });

      response.json(successResponse({
        ingestId: processed.ingestId,
        parsedEvents: processed.parsedEvents,
        eventLinks: processed.eventLinks,
      }));
    } catch (error) {
      logger.error('submitSharedEvent failed', error, { ownerUid });
      response.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);
