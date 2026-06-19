import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from '../utils/logger.js';
import {
  processPendingPublicSharedEventCandidates,
  processPublicSharedEventCandidateById,
} from '../services/sharedEventPublicPromotion.js';

const adminApiKey = defineSecret('ADMIN_API_KEY');

function isAdminAuthorized(request: { headers?: Record<string, unknown> }, expectedKey: string): boolean {
  if (!expectedKey) return true;
  const authHeader = request.headers?.authorization;
  return authHeader === `Bearer ${expectedKey}`;
}

function parsePositiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(Math.trunc(parsed), max));
}

function isScheduledPromotionEnabled(): boolean {
  const raw = String(process.env.SHARED_EVENT_PUBLIC_PROMOTION_ENABLED || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(raw);
}

export const processSharedEventPublicCandidates = onRequest(
  {
    timeoutSeconds: 300,
    memory: '512MiB',
    region: 'northamerica-northeast2',
    cors: true,
    secrets: [adminApiKey],
  },
  async (request, response) => {
    if (request.method !== 'POST') {
      response.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const expectedKey = adminApiKey.value();
    if (!isAdminAuthorized(request, expectedKey)) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const body = (request.body || {}) as {
      candidateId?: string;
      limit?: number;
    };

    try {
      const candidateId = String(body.candidateId || request.query.candidateId || '').trim();
      if (candidateId) {
        const result = await processPublicSharedEventCandidateById(candidateId);
        response.json({
          success: true,
          mode: 'candidate',
          result,
        });
        return;
      }

      const limit = parsePositiveInt(body.limit || request.query.limit, 10, 1, 50);
      const result = await processPendingPublicSharedEventCandidates(limit);
      response.json({
        success: true,
        mode: 'batch',
        ...result,
      });
    } catch (error) {
      logger.error('processSharedEventPublicCandidates failed', error);
      response.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export const scheduledSharedEventPublicCandidateProcessor = onSchedule(
  {
    schedule: 'every 10 minutes',
    region: 'northamerica-northeast1',
    memory: '512MiB',
    timeoutSeconds: 300,
  },
  async () => {
    if (!isScheduledPromotionEnabled()) {
      logger.debug('scheduledSharedEventPublicCandidateProcessor disabled by env flag');
      return;
    }

    const limit = parsePositiveInt(process.env.SHARED_EVENT_PUBLIC_PROMOTION_BATCH_LIMIT, 10, 1, 50);
    try {
      const result = await processPendingPublicSharedEventCandidates(limit);
      logger.info('scheduledSharedEventPublicCandidateProcessor complete', result);
    } catch (error) {
      logger.error('scheduledSharedEventPublicCandidateProcessor failed', error);
    }
  }
);
