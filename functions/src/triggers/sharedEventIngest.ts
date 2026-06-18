import * as admin from 'firebase-admin';
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
    payload.description
  );
}

function resolveSourceUrl(payload: SharedEventSubmitPayload): string | undefined {
  return normalizeSharedEventUrl(payload.sourceUrl ?? payload.url) ||
    normalizeSharedEventUrl(extractFirstUrl(String(payload.sharedText || payload.text || '')));
}

function canReuseSharedSource(payload: SharedEventSubmitPayload): boolean {
  return !(
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
    confidence: parsedEvent.confidence,
    needsUserReview: parsedEvent.needsUserReview,
    reviewReasons: parsedEvent.reviewReasons,
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
  const parsedEvent = parsedEvents[0];
  const privateEventId = eventLinks[0]?.privateEventId;
  const publicCandidateId = eventLinks[0]?.publicCandidateId;
  const needsUserReview = parsedEvents.some((event) => event.needsUserReview);
  const reviewReasons = Array.from(new Set(parsedEvents.flatMap((event) => event.reviewReasons)));
  const confidence = Math.min(...parsedEvents.map((event) => event.confidence));

  return {
    success: true,
    ingestId,
    privateEventId,
    privateEventIds: eventLinks.map((link) => link.privateEventId),
    publicCandidateId,
    publicCandidateIds: eventLinks
      .map((link) => link.publicCandidateId)
      .filter((id): id is string => Boolean(id)),
    routing: parsedEvent.routing,
    sourceVisibility: parsedEvent.sourceVisibility,
    status: parsedEvent.status,
    extractedEventCount: parsedEvents.length,
    needsUserReview,
    reviewReasons,
    confidence,
    event: eventResponse(parsedEvent, eventLinks[0]),
    events: parsedEvents.map((event, index) => eventResponse(event, eventLinks[index])),
    visibilityEvidence: parsedEvent.visibilityEvidence,
  };
}

export const submitSharedEvent = onRequest(
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
      const payload = normalizePayload(asBodyObject(request.body));
      if (!hasUsablePayload(payload)) {
        response.status(400).json({
          success: false,
          error: 'Provide a shared event URL, text, title, or description.',
        });
        return;
      }

      const sourceUrl = resolveSourceUrl(payload);
      if (sourceUrl && canReuseSharedSource(payload)) {
        const reusable = await firestoreService.findReusableSharedEventIngest({
          ownerUid,
          normalizedSourceUrl: sourceUrl,
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

      await firestoreService.updateSharedEventIngestExtractedEvents({
        ownerUid,
        ingestId,
        privateEventIds: eventLinks.map((link) => link.privateEventId),
        publicCandidateIds: eventLinks
          .map((link) => link.publicCandidateId)
          .filter((id): id is string => Boolean(id)),
        extractedEventCount: parsedEvents.length,
      });

      const needsUserReview = parsedEvents.some((event) => event.needsUserReview);

      logger.info('submitSharedEvent complete', {
        ownerUid,
        ingestId,
        privateEventId: eventLinks[0]?.privateEventId,
        publicCandidateId: eventLinks[0]?.publicCandidateId,
        extractedEventCount: parsedEvents.length,
        sourceVisibility: parsedEvent.sourceVisibility,
        routing: parsedEvent.routing,
        needsUserReview,
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
