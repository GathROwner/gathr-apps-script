import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import {
  extractFirstUrl,
  normalizeSharedEventUrl,
  parseSharedEventPayload,
  SHARED_EVENT_PARSER_VERSION,
  verifySharedEventSourceVisibility,
} from '../processing/sharedEventParser.js';
import * as firestoreService from '../services/firestoreService.js';
import { SharedEventSubmitPayload } from '../types/sharedEvent.js';
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

export const submitSharedEvent = onRequest(
  {
    timeoutSeconds: 60,
    memory: '256MiB',
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
      const visibility = await verifySharedEventSourceVisibility(payload, sourceUrl);
      const parsedEvent = await parseSharedEventPayload(payload, {
        sourceVisibility: visibility.visibility,
        visibilityEvidence: visibility.evidence,
      });

      const ingestId = await firestoreService.createSharedEventIngest({
        ownerUid,
        payload,
        parsedEvent,
        parserVersion: SHARED_EVENT_PARSER_VERSION,
      });
      const privateEventId = await firestoreService.createPrivateSharedEvent({
        ownerUid,
        ingestId,
        parsedEvent,
      });
      const publicCandidateId = parsedEvent.routing === 'public_candidate'
        ? await firestoreService.createPublicSharedEventCandidate({
          ownerUid,
          ingestId,
          privateEventId,
          parsedEvent,
        })
        : undefined;

      logger.info('submitSharedEvent complete', {
        ownerUid,
        ingestId,
        privateEventId,
        publicCandidateId,
        sourceVisibility: parsedEvent.sourceVisibility,
        routing: parsedEvent.routing,
        needsUserReview: parsedEvent.needsUserReview,
      });

      response.json({
        success: true,
        ingestId,
        privateEventId,
        publicCandidateId,
        routing: parsedEvent.routing,
        sourceVisibility: parsedEvent.sourceVisibility,
        status: parsedEvent.status,
        needsUserReview: parsedEvent.needsUserReview,
        reviewReasons: parsedEvent.reviewReasons,
        confidence: parsedEvent.confidence,
        event: {
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
        },
        visibilityEvidence: parsedEvent.visibilityEvidence,
      });
    } catch (error) {
      logger.error('submitSharedEvent failed', error, { ownerUid });
      response.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);
