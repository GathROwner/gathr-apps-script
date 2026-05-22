import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from '../utils/logger.js';
import * as firestoreService from '../services/firestoreService.js';
import { formatRunUrl } from '../services/apifyService.js';
import {
  processPendingUnrecognizedVenues,
  resolveUnrecognizedVenueById,
  finalizeUnrecognizedVenue,
} from '../services/unknownVenueResolver.js';
import {
  seedVenueFacebookBackfillReviews,
  finalizeVenueFacebookBackfillReview,
} from '../services/venueFacebookBackfill.js';

const adminApiKey = defineSecret('ADMIN_API_KEY');
const DEFAULT_FB_POSTS_SCRAPER_ACTOR_ID = 'KoJrdxJCTtpon81KY';

function isResolverEnabled(): boolean {
  const raw = String(process.env.UNKNOWN_VENUE_RESOLVER_ENABLED || '').trim().toLowerCase();
  if (!raw) return false;
  return ['1', 'true', 'yes', 'y', 'on'].includes(raw);
}

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

function normalizeFacebookPageUrl(value: unknown): string {
  let raw = String(value || '').trim();
  if (!raw) return '';
  if (!/^https?:\/\//i.test(raw) && /%3A%2F%2F/i.test(raw)) {
    try {
      raw = decodeURIComponent(raw);
    } catch {
      // Fall through and let URL parsing reject invalid values.
    }
  }

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    const host = url.hostname.toLowerCase();
    if (!host.includes('facebook.com')) return '';
    url.hash = '';
    url.search = '';
    if (!url.pathname) url.pathname = '/';
    const normalized = url.toString();
    return normalized.endsWith('/') ? normalized : `${normalized}/`;
  } catch {
    return '';
  }
}

function deriveVenueNameFromFacebookPageUrl(value: unknown): string {
  const normalized = normalizeFacebookPageUrl(value);
  if (!normalized) return '';

  try {
    const url = new URL(normalized);
    const segments = url.pathname.split('/').filter(Boolean).map((v) => decodeURIComponent(v));
    if (segments.length === 0) return '';

    const first = String(segments[0] || '').trim();
    const lower = first.toLowerCase();

    if (lower === 'people' && segments.length >= 2) {
      return String(segments[1] || '')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    if (lower === 'pages' && segments.length >= 2) {
      return String(segments[1] || '')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    if (lower === 'profile.php') {
      return '';
    }

    const reserved = new Set([
      'share',
      'events',
      'groups',
      'watch',
      'marketplace',
      'photo.php',
      'permalink.php',
      'story.php',
      'reel',
      'reels',
      'posts',
    ]);
    if (reserved.has(lower)) return '';

    return first.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

async function startApifyActorRunNoWait(
  actorId: string,
  token: string,
  input: Record<string, unknown>
): Promise<{ actorRunId: string; datasetId?: string; runUrl: string }> {
  const startUrl = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/runs?token=${encodeURIComponent(token)}&waitForFinish=0`;
  const res = await fetch(startUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input || {}),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Apify start failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const json = await res.json() as { data?: Record<string, unknown> } & Record<string, unknown>;
  const data = (json.data || json) as Record<string, unknown>;
  const actorRunId = String(data.id || '').trim();
  if (!actorRunId) {
    throw new Error('Apify run did not return actor run id');
  }
  const datasetId = String(data.defaultDatasetId || '').trim() || undefined;
  return {
    actorRunId,
    datasetId,
    runUrl: formatRunUrl(actorId, actorRunId),
  };
}

export const listUnrecognizedVenues = onRequest(
  {
    timeoutSeconds: 60,
    memory: '256MiB',
    region: 'northamerica-northeast2',
    cors: true,
    secrets: [adminApiKey],
  },
  async (request, response) => {
    if (request.method !== 'GET') {
      response.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const expectedKey = adminApiKey.value();
    if (!isAdminAuthorized(request, expectedKey)) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const limit = Math.min(Math.max(Number(request.query.limit || 20), 1), 100);
    const statusParam = String(request.query.status || '').trim();
    const statuses = statusParam
      ? statusParam.split(',').map((v) => v.trim()).filter(Boolean)
      : undefined;

    try {
      const items = await firestoreService.listUnrecognizedVenues({
        limit,
        statuses,
        orderBy: 'updatedAt',
        orderDirection: 'desc',
      });

      response.json({
        count: items.length,
        items,
      });
    } catch (error) {
      logger.error('List unrecognized venues failed', error);
      response.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export const processUnrecognizedVenues = onRequest(
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
      docId?: string;
      limit?: number;
      pageSubmission?: {
        submissionId?: string;
        facebookUrl?: string;
        venueName?: string;
        userEmail?: string;
      };
    };

    try {
      if (body.pageSubmission && typeof body.pageSubmission === 'object') {
        const submissionId = String(body.pageSubmission.submissionId || '').trim();
        const facebookUrl = normalizeFacebookPageUrl(body.pageSubmission.facebookUrl);
        const derivedVenueName = deriveVenueNameFromFacebookPageUrl(facebookUrl);
        const venueName = String(body.pageSubmission.venueName || derivedVenueName).trim();
        const userEmail = String(body.pageSubmission.userEmail || '').trim() || undefined;

        if (!facebookUrl) {
          response.status(400).json({ error: 'A valid pageSubmission.facebookUrl is required.' });
          return;
        }
        if (!venueName) {
          response.status(400).json({ error: 'Unable to derive venue name from page submission URL. Provide pageSubmission.venueName.' });
          return;
        }

        const queueResult = await firestoreService.queueUnrecognizedVenue({
          venueName,
          source: 'row_establishment',
          parserMode: 'full5stage',
          rowIndex: 0,
          fileId: '',
          fileName: '',
          aggregatorName: venueName,
          aggregatorFacebookUrl: facebookUrl,
          description: `Approved page submission venue discovery for ${facebookUrl}${submissionId ? ` (submission ${submissionId})` : ''}`,
        });

        if (!queueResult.queued || !queueResult.docId) {
          response.json({
            success: false,
            mode: 'page_submission',
            queue: queueResult,
            facebookUrl,
            venueName,
          });
          return;
        }

        const result = await resolveUnrecognizedVenueById(queueResult.docId);
        response.json({
          success: true,
          mode: 'page_submission',
          queue: queueResult,
          result,
          pageSubmission: {
            submissionId: submissionId || undefined,
            userEmail,
            facebookUrl,
            venueName,
          },
        });
        return;
      }

      if (body.docId) {
        const result = await resolveUnrecognizedVenueById(body.docId);
        response.json({
          success: true,
          mode: 'single',
          result,
        });
        return;
      }

      const batch = await processPendingUnrecognizedVenues(body.limit);
      response.json({
        success: true,
        mode: 'batch',
        ...batch,
      });
    } catch (error) {
      logger.error('Process unrecognized venues failed', error);
      response.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export const finalizeUnrecognizedVenueTrigger = onRequest(
  {
    timeoutSeconds: 180,
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

    try {
      const body = (request.body || {}) as {
        docId?: string;
        action?: 'resolve_existing' | 'create_new' | 'ignore';
        venueId?: string;
        candidateIndex?: number;
        manual?: Record<string, unknown>;
        notes?: string;
        resolvedBy?: string;
      };

      const result = await finalizeUnrecognizedVenue({
        docId: String(body.docId || '').trim(),
        action: body.action || 'ignore',
        venueId: typeof body.venueId === 'string' ? body.venueId.trim() : undefined,
        candidateIndex: Number.isFinite(Number(body.candidateIndex))
          ? Number(body.candidateIndex)
          : undefined,
        manual: body.manual as any,
        notes: typeof body.notes === 'string' ? body.notes : undefined,
        resolvedBy: typeof body.resolvedBy === 'string' ? body.resolvedBy : undefined,
      });

      response.json({
        success: true,
        result,
      });
    } catch (error) {
      logger.error('Finalize unrecognized venue failed', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      const normalized = String(message || '').trim().toLowerCase();
      const isCreateNewBlocked = normalized.startsWith('create_new blocked:');
      response.status(isCreateNewBlocked ? 409 : 500).json({
        error: message,
        ...(isCreateNewBlocked
          ? {
              code: 'CREATE_NEW_BLOCKED_EXISTING',
              suggestedAction: 'resolve_existing',
            }
          : {}),
      });
    }
  }
);

export const finalizeCityLevelEventReviewTrigger = onRequest(
  {
    timeoutSeconds: 180,
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

    try {
      const body = (request.body || {}) as {
        reviewId?: string;
        action?: 'approve_publish' | 'reject' | 'ignore';
        manual?: Record<string, unknown>;
        notes?: string;
        resolvedBy?: string;
      };

      const result = await firestoreService.finalizeCityLevelEventReview({
        reviewId: String(body.reviewId || '').trim(),
        action: body.action || 'reject',
        manual: body.manual as any,
        notes: typeof body.notes === 'string' ? body.notes : undefined,
        resolvedBy: typeof body.resolvedBy === 'string' ? body.resolvedBy : undefined,
      });

      response.json({
        success: true,
        result,
      });
    } catch (error) {
      logger.error('Finalize city-level event review failed', error);
      response.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export const startVenueFacebookPostsScrape = onRequest(
  {
    timeoutSeconds: 60,
    memory: '256MiB',
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

    try {
      const body = (request.body || {}) as {
        venueId?: string;
        facebookUrl?: string;
        daysBack?: number;
        resultsLimit?: number;
        includeVideoTranscript?: boolean;
        sourceDocId?: string;
        triggeredBy?: string;
      };

      const venueId = String(body.venueId || '').trim();
      let facebookUrl = normalizeFacebookPageUrl(body.facebookUrl);

      if (venueId) {
        const venue = await firestoreService.getVenue(venueId);
        if (!venue) {
          response.status(404).json({ error: `Venue not found: ${venueId}` });
          return;
        }
        const venueFacebookUrl = normalizeFacebookPageUrl((venue as any).facebookUrl || (venue as any).pageurl);
        if (venueFacebookUrl) {
          if (facebookUrl && facebookUrl !== venueFacebookUrl) {
            response.status(400).json({
              error: 'facebookUrl does not match the venue record',
              venueId,
              venueFacebookUrl,
              requestedFacebookUrl: facebookUrl,
            });
            return;
          }
          facebookUrl = venueFacebookUrl;
        }
      }

      if (!facebookUrl) {
        response.status(400).json({ error: 'A valid facebookUrl is required (or venueId with a facebookUrl).' });
        return;
      }

      const apifyToken = String(process.env.APIFY_TOKEN || '').trim();
      const actorId = String(process.env.UNKNOWN_VENUE_POSTS_SCRAPE_ACTOR_ID || DEFAULT_FB_POSTS_SCRAPER_ACTOR_ID).trim();
      if (!apifyToken) {
        response.status(500).json({ error: 'APIFY_TOKEN is not configured on Functions.' });
        return;
      }
      if (!actorId) {
        response.status(500).json({ error: 'UNKNOWN_VENUE_POSTS_SCRAPE_ACTOR_ID is not configured.' });
        return;
      }

      const daysBack = parsePositiveInt(body.daysBack, 1, 1, 30);
      const resultsLimit = parsePositiveInt(
        body.resultsLimit,
        parsePositiveInt(process.env.UNKNOWN_VENUE_POSTS_SCRAPE_RESULTS_LIMIT, 6, 1, 50),
        1,
        50
      );
      const includeVideoTranscript = Boolean(body.includeVideoTranscript);
      const relativeWindow = `${daysBack} ${daysBack === 1 ? 'day' : 'days'}`;

      const input: Record<string, unknown> = {
        startUrls: [{ url: facebookUrl }],
        resultsLimit,
        captionText: includeVideoTranscript,
        onlyPostsNewerThan: relativeWindow,
      };

      logger.info('Starting manual Facebook posts scrape for venue', {
        functionName: 'startVenueFacebookPostsScrape',
        venueId: venueId || undefined,
        facebookUrl,
        actorId,
        daysBack,
        resultsLimit,
        sourceDocId: String(body.sourceDocId || '').trim() || undefined,
        triggeredBy: String(body.triggeredBy || '').trim() || undefined,
      });

      const run = await startApifyActorRunNoWait(actorId, apifyToken, input);

      response.json({
        success: true,
        actorId,
        actorRunId: run.actorRunId,
        datasetId: run.datasetId,
        runUrl: run.runUrl,
        venueId: venueId || undefined,
        facebookUrl,
        input,
        note: 'Apify actor run started. Existing Apify actor integrations/webhooks will handle export + parsing if configured.',
      });
    } catch (error) {
      logger.error('startVenueFacebookPostsScrape failed', error);
      response.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export const seedVenueFacebookBackfillReviewsTrigger = onRequest(
  {
    timeoutSeconds: 180,
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

    try {
      const body = (request.body || {}) as {
        venueIds?: unknown[];
        sendEmails?: boolean;
        forceReset?: boolean;
        seedDefaults?: boolean;
      };

      const result = await seedVenueFacebookBackfillReviews({
        venueIds: Array.isArray(body.venueIds)
          ? body.venueIds.map((value) => String(value || '').trim()).filter(Boolean)
          : undefined,
        sendEmails: body.sendEmails !== false,
        forceReset: body.forceReset === true,
        seedDefaults: body.seedDefaults !== false,
      });

      response.json({
        success: true,
        result,
      });
    } catch (error) {
      logger.error('Seed venue Facebook backfill reviews failed', error);
      response.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export const finalizeVenueFacebookBackfillReviewTrigger = onRequest(
  {
    timeoutSeconds: 180,
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

    try {
      const body = (request.body || {}) as {
        reviewId?: string;
        action?: 'approve' | 'approve_and_append' | 'reject' | 'suppress' | 'snooze';
        resolvedBy?: string;
      };

      const result = await finalizeVenueFacebookBackfillReview({
        reviewId: String(body.reviewId || '').trim(),
        action: (body.action || 'reject') as 'approve' | 'approve_and_append' | 'reject' | 'suppress' | 'snooze',
        resolvedBy: typeof body.resolvedBy === 'string' ? body.resolvedBy : undefined,
      });

      response.json({
        success: true,
        result,
      });
    } catch (error) {
      logger.error('Finalize venue Facebook backfill review failed', error);
      response.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export const scheduledUnknownVenueResolver = onSchedule(
  {
    schedule: 'every 5 minutes',
    region: 'northamerica-northeast1',
    memory: '256MiB',
    timeoutSeconds: 300,
  },
  async () => {
    if (!isResolverEnabled()) {
      logger.debug('scheduledUnknownVenueResolver disabled by env flag');
      return;
    }

    try {
      const result = await processPendingUnrecognizedVenues();
      logger.info('scheduledUnknownVenueResolver run complete', result);
    } catch (error) {
      logger.error('scheduledUnknownVenueResolver failed', error);
    }
  }
);
