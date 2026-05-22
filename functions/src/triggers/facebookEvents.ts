import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from '../utils/logger.js';
import { formatRunUrl } from '../services/apifyService.js';

const adminApiKey = defineSecret('ADMIN_API_KEY');
const DEFAULT_FACEBOOK_EVENTS_ACTOR_ID = 'UZBnerCFBo5FgGouO';
const DEFAULT_FACEBOOK_EVENTS_SEARCH_QUERY = 'Charlottetown PEI';
const TEST_MAX_EVENTS_CAP = 10;

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

function normalizeSearchQueries(value: unknown): string[] {
  const rawValues = Array.isArray(value) ? value : [value];
  const queries = rawValues
    .flatMap((entry) => String(entry || '').split(/\r?\n/))
    .map((entry) => entry.trim())
    .filter(Boolean);
  return Array.from(new Set(queries));
}

function normalizeFacebookUrl(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    if (!url.hostname.toLowerCase().includes('facebook.com')) return '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

function normalizeStartUrls(value: unknown): string[] {
  const rawValues = Array.isArray(value) ? value : [value];
  const urls: string[] = [];

  for (const entry of rawValues) {
    const rawUrl =
      entry && typeof entry === 'object'
        ? String((entry as Record<string, unknown>).url || '').trim()
        : String(entry || '').trim();
    const normalized = normalizeFacebookUrl(rawUrl);
    if (normalized) urls.push(normalized);
  }

  return Array.from(new Set(urls));
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

  return {
    actorRunId,
    datasetId: String(data.defaultDatasetId || '').trim() || undefined,
    runUrl: formatRunUrl(actorId, actorRunId),
  };
}

export const startFacebookEventsScrape = onRequest(
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
        searchQueries?: unknown;
        query?: unknown;
        startUrls?: unknown;
        startUrl?: unknown;
        maxEvents?: unknown;
        triggeredBy?: unknown;
      };

      const apifyToken = String(process.env.APIFY_TOKEN || '').trim();
      const actorId = String(
        process.env.FACEBOOK_EVENTS_SCRAPE_ACTOR_ID || DEFAULT_FACEBOOK_EVENTS_ACTOR_ID
      ).trim();

      if (!apifyToken) {
        response.status(500).json({ error: 'APIFY_TOKEN is not configured on Functions.' });
        return;
      }
      if (!actorId) {
        response.status(500).json({ error: 'FACEBOOK_EVENTS_SCRAPE_ACTOR_ID is not configured.' });
        return;
      }

      const configuredDefaultQuery = String(
        process.env.FACEBOOK_EVENTS_DEFAULT_SEARCH_QUERY || DEFAULT_FACEBOOK_EVENTS_SEARCH_QUERY
      ).trim();
      const searchQueries = normalizeSearchQueries(body.searchQueries ?? body.query);
      const startUrls = normalizeStartUrls(body.startUrls ?? body.startUrl);
      const effectiveSearchQueries =
        searchQueries.length > 0 || startUrls.length > 0
          ? searchQueries
          : [configuredDefaultQuery].filter(Boolean);

      if (effectiveSearchQueries.length === 0 && startUrls.length === 0) {
        response.status(400).json({ error: 'Provide searchQueries/query or startUrls/startUrl.' });
        return;
      }

      const requestedMaxEvents = Number(body.maxEvents);
      const maxEvents = parsePositiveInt(
        body.maxEvents,
        TEST_MAX_EVENTS_CAP,
        1,
        TEST_MAX_EVENTS_CAP
      );

      const input: Record<string, unknown> = {
        maxEvents,
      };
      if (effectiveSearchQueries.length > 0) {
        input.searchQueries = effectiveSearchQueries;
      }
      if (startUrls.length > 0) {
        input.startUrls = startUrls;
      }

      logger.info('Starting Facebook events scrape', {
        functionName: 'startFacebookEventsScrape',
        actorId,
        searchQueries: effectiveSearchQueries,
        startUrlsCount: startUrls.length,
        maxEvents,
        requestedMaxEvents: Number.isFinite(requestedMaxEvents) ? requestedMaxEvents : undefined,
        triggeredBy: String(body.triggeredBy || '').trim() || undefined,
      });

      const run = await startApifyActorRunNoWait(actorId, apifyToken, input);

      response.json({
        success: true,
        actorId,
        actorRunId: run.actorRunId,
        datasetId: run.datasetId,
        runUrl: run.runUrl,
        input,
        maxEventsCap: TEST_MAX_EVENTS_CAP,
        note: 'Facebook Events Scraper run started. The Apify Drive export and apifyWebhook flow should pick up the resulting dataset when the actor finishes.',
      });
    } catch (error) {
      logger.error('startFacebookEventsScrape failed', error);
      response.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);
