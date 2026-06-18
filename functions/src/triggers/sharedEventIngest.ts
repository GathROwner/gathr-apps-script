import * as admin from 'firebase-admin';
import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import {
  extractFirstUrl,
  normalizeSharedEventUrl,
  parseSharedEventPayloads,
  SHARED_EVENT_PARSER_VERSION,
  verifySharedEventSourceVisibility,
} from '../processing/sharedEventParser.js';
import * as firestoreService from '../services/firestoreService.js';
import { ParsedSharedEvent, SharedEventSubmitPayload } from '../types/sharedEvent.js';
import { logger } from '../utils/logger.js';

if (!admin.apps.length) {
  admin.initializeApp();
}

const openAiApiKey = defineSecret('OPENAI_API_KEY');

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

function hostForLog(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).hostname;
  } catch {
    return undefined;
  }
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

export const submitSharedEvent = onRequest(
  {
    timeoutSeconds: 60,
    memory: '512MiB',
    region: 'northamerica-northeast2',
    cors: true,
    secrets: [openAiApiKey],
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
          allowIncomplete: true,
        });
        if (reusable) {
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

      const parsedEvents = await parseSharedEventPayloads(payload, {
        sourceVisibility: visibility.visibility,
        visibilityEvidence: visibility.evidence,
      });
      const parsedEvent = parsedEvents[0];

      const ingestId = await firestoreService.createSharedEventIngest({
        ownerUid,
        payload,
        parsedEvent,
        parserVersion: SHARED_EVENT_PARSER_VERSION,
      });

      const eventLinks: Array<{ privateEventId: string; publicCandidateId?: string }> = [];
      for (const currentParsedEvent of parsedEvents) {
        const privateEventId = await firestoreService.createPrivateSharedEvent({
          ownerUid,
          ingestId,
          parsedEvent: currentParsedEvent,
          updateIngestLink: eventLinks.length === 0,
        });
        const publicCandidateId = currentParsedEvent.routing === 'public_candidate'
          ? await firestoreService.createPublicSharedEventCandidate({
            ownerUid,
            ingestId,
            privateEventId,
            parsedEvent: currentParsedEvent,
            updateIngestLink: eventLinks.length === 0,
          })
          : undefined;
        eventLinks.push({ privateEventId, publicCandidateId });
      }

      const summary = summarizeSharedEventResult(parsedEvents, eventLinks);

      await firestoreService.updateSharedEventIngestExtractedEvents({
        ownerUid,
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
      });

      logger.info('submitSharedEvent complete', {
        ownerUid,
        ingestId,
        privateEventId: summary.privateEventId,
        publicCandidateId: summary.publicCandidateId,
        extractedEventCount: parsedEvents.length,
        sourceVisibility: parsedEvent.sourceVisibility,
        routing: summary.routing,
        needsUserReview: summary.needsUserReview,
      });

      response.json(successResponse({
        ingestId,
        parsedEvents,
        eventLinks,
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
