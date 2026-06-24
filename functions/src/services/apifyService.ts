/**
 * Apify Service
 * Handles Apify API interactions and webhook processing utilities
 */

import * as crypto from 'crypto';
import { ScraperType, ApifyEventData } from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * Known Apify actor IDs for scraper type detection
 * These should be configured based on the actual Apify actors being used
 */
const ACTOR_TYPE_MAPPING: Record<string, ScraperType> = {
  KoJrdxJCTtpon81KY: 'posts',
  'apify/facebook-posts-scraper': 'posts',
  'apify~facebook-posts-scraper': 'posts',
  UZBnerCFBo5FgGouO: 'events',
  'apify/facebook-events-scraper': 'events',
  'apify~facebook-events-scraper': 'events',
};

/**
 * Actor name patterns for scraper type detection
 */
const SCRAPER_TYPE_PATTERNS: Array<{ pattern: RegExp; type: ScraperType }> = [
  { pattern: /post/i, type: 'posts' },
  { pattern: /event/i, type: 'events' },
  { pattern: /facebook.*post/i, type: 'posts' },
  { pattern: /facebook.*event/i, type: 'events' },
];

const DEFAULT_APIFY_UPLOADS_DRIVE_FOLDER_ID = '1CiAw97ur95UVAWWLfmcY3ERbjxMrK7Ij';
export const APIFY_DATASET_FILE_PREFIX = 'apify-dataset:';

function asString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function getNestedString(value: unknown, path: string[]): string {
  let current: unknown = value;
  for (const segment of path) {
    if (!current || typeof current !== 'object') return '';
    current = (current as Record<string, unknown>)[segment];
  }
  return asString(current);
}

function isLikelyImageUrl(value: unknown): boolean {
  const url = asString(value);
  if (!/^https?:\/\//i.test(url)) return false;
  if (/facebook\.com\/.+\/posts\//i.test(url)) return false;
  if (/\bfbcdn\.net\b/i.test(url)) return true;
  if (/\bscontent-[^/]+\.xx\.fbcdn\.net\b/i.test(url)) return true;
  return /\.(jpg|jpeg|png|webp|gif)(?:[?#].*)?$/i.test(url);
}

function getMediaImageUrl(media: Record<string, unknown>): string {
  const candidates = [
    getNestedString(media, ['image', 'uri']),
    getNestedString(media, ['large_share_image', 'uri']),
    getNestedString(media, ['photo_image', 'uri']),
    getNestedString(media, ['flexible_height_image', 'uri']),
    getNestedString(media, ['flexible_height_share_image', 'uri']),
    getNestedString(media, ['preferred_thumbnail', 'image', 'uri']),
    getNestedString(media, ['thumbnailImage', 'uri']),
    getNestedString(media, ['thumbnail']),
    getNestedString(media, ['url']),
  ];

  return candidates.find(isLikelyImageUrl) || '';
}

function getMediaOcrText(media: Record<string, unknown>): string {
  return asString(media.ocrText) || asString((media as Record<string, unknown>).ocr_text);
}

function getApifyItemMedia(item: Record<string, unknown>): Record<string, unknown>[] {
  const rawMedia = Array.isArray(item.media)
    ? item.media
    : Array.isArray(item.attachments)
      ? item.attachments
      : [];

  return rawMedia
    .filter((media): media is Record<string, unknown> => Boolean(media) && typeof media === 'object');
}

function decodeVirtualFilePart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function buildApifyDatasetVirtualFileId(datasetId: string, actorRunId?: string): string {
  const normalizedDatasetId = asString(datasetId);
  if (!normalizedDatasetId) {
    throw new Error('Apify dataset id is required');
  }

  const normalizedActorRunId = asString(actorRunId);
  return `${APIFY_DATASET_FILE_PREFIX}${encodeURIComponent(normalizedDatasetId)}` +
    (normalizedActorRunId ? `:run:${encodeURIComponent(normalizedActorRunId)}` : '');
}

export function parseApifyDatasetVirtualFileId(
  fileId: string
): { datasetId: string; actorRunId?: string } | null {
  const raw = asString(fileId);
  if (!raw.startsWith(APIFY_DATASET_FILE_PREFIX)) return null;

  const remainder = raw.slice(APIFY_DATASET_FILE_PREFIX.length);
  const runMarker = ':run:';
  const runMarkerIndex = remainder.indexOf(runMarker);
  const encodedDatasetId = runMarkerIndex >= 0
    ? remainder.slice(0, runMarkerIndex)
    : remainder;
  const encodedActorRunId = runMarkerIndex >= 0
    ? remainder.slice(runMarkerIndex + runMarker.length)
    : '';

  const datasetId = decodeVirtualFilePart(encodedDatasetId);
  const actorRunId = decodeVirtualFilePart(encodedActorRunId);
  if (!datasetId) return null;
  return actorRunId ? { datasetId, actorRunId } : { datasetId };
}

export function getApifyDatasetFallbackLimit(): number {
  const parsed = Number(process.env.APIFY_WEBHOOK_DIRECT_DATASET_LIMIT || 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 10;
  return Math.max(1, Math.min(Math.floor(parsed), 100));
}

export function mapApifyDatasetItemToDriveRow(item: Record<string, unknown>): Record<string, unknown> | null {
  const postText = asString(item.text || item.description || item.caption);
  const pageName =
    getNestedString(item, ['user', 'name']) ||
    asString(item.pageName || item.userName || item.authorName);
  const postUrl = asString(item.url || item.facebookUrl || item.inputUrl);
  const topLevelUrl = asString(item.topLevelUrl || item.topLevelPostUrl) || postUrl;
  const profilePicUrl =
    getNestedString(item, ['user', 'profilePic']) ||
    asString(item.profilePicUrl || item.profilePic);
  const postId = asString(item.postId || item.id || item.facebookId);
  const timestamp = asString(item.time || item.timestamp || item.createdAt || item.date);
  const uniqueId = postId || postUrl || topLevelUrl;

  const mediaUrls: string[] = [];
  const row: Record<string, unknown> = {
    Text: postText,
    'Sharedpost Text': postText,
    'User Name': pageName,
    Pagename: pageName,
    Time: timestamp,
    Facebookurl: postUrl,
    topLevelUrl,
    profilePicUrl,
    uniqueId,
    postId,
    likes: asString(item.likes || item.likeCount),
    shares: asString(item.shares || item.shareCount),
    comments: asString(item.comments || item.commentCount),
    topReactionsCount: asString(item.topReactionsCount || item.reactionCount),
  };

  for (const media of getApifyItemMedia(item)) {
    const imageUrl = getMediaImageUrl(media);
    if (!imageUrl || mediaUrls.includes(imageUrl)) {
      continue;
    }

    const mediaIndex = mediaUrls.length;
    mediaUrls.push(imageUrl);
    row[`media/${mediaIndex}/image/uri`] = imageUrl;
    row[`media/${mediaIndex}/thumbnail`] = getNestedString(media, ['thumbnail']) || imageUrl;

    const ocrText = getMediaOcrText(media);
    if (ocrText) {
      row[`media/${mediaIndex}/ocrText`] = ocrText;
    }
  }

  if (mediaUrls.length > 0) {
    row.mediaUrls = JSON.stringify(mediaUrls);
  }

  const hasContent =
    postText ||
    pageName ||
    postUrl ||
    mediaUrls.length > 0 ||
    Object.keys(row).some((key) => key.includes('/ocrText') && asString(row[key]));
  return hasContent ? row : null;
}

export function parseMediaUrlCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  const raw = asString(value);
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return raw ? 1 : 0;
  }
}

/**
 * Verify Apify webhook signature using HMAC-SHA256
 *
 * Apify signs webhooks with the secret configured when creating the webhook.
 * The signature is passed in the 'apify-webhook-signature' header.
 *
 * @param body - The raw request body
 * @param signature - The signature from the request header
 * @param secret - The webhook secret
 * @returns true if signature is valid
 */
export function verifyWebhookSignature(
  body: Buffer | string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) {
    logger.warn('No webhook signature provided');
    return false;
  }

  if (!secret) {
    logger.warn('No webhook secret configured');
    return false;
  }

  try {
    // Apify uses HMAC-SHA256 for webhook signatures
    const bodyBuffer = typeof body === 'string' ? Buffer.from(body) : body;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(bodyBuffer)
      .digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (signatureBuffer.length !== expectedBuffer.length) {
      logger.warn('Webhook signature length mismatch', {
        receivedLength: signatureBuffer.length,
        expectedLength: expectedBuffer.length,
      });
      return false;
    }

    const isValid = crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

    if (!isValid) {
      logger.warn('Webhook signature verification failed');
    }

    return isValid;
  } catch (error) {
    logger.error('Webhook signature verification error', error);
    return false;
  }
}

/**
 * Detect scraper type from actor information
 *
 * @param eventData - The webhook event data
 * @param actorName - Optional actor name for pattern matching
 * @returns The detected scraper type
 */
export function detectScraperType(
  eventData: ApifyEventData,
  actorName?: string
): ScraperType {
  const { actorId } = eventData;

  // First, check if we have a direct mapping for this actor ID
  if (actorId && ACTOR_TYPE_MAPPING[actorId]) {
    return ACTOR_TYPE_MAPPING[actorId];
  }

  // Try to detect from actor name patterns
  const nameToCheck = actorName || actorId || '';

  for (const { pattern, type } of SCRAPER_TYPE_PATTERNS) {
    if (pattern.test(nameToCheck)) {
      logger.debug('Detected scraper type from pattern', {
        name: nameToCheck,
        type,
        pattern: pattern.source,
      });
      return type;
    }
  }

  // Default to 'posts' since that's the most common use case
  // This can be adjusted based on the actual workflow
  logger.debug('Could not detect scraper type, defaulting to posts', {
    actorId,
    actorName,
  });
  return 'posts';
}

/**
 * Build the expected Drive file name pattern for an Apify dataset
 *
 * Apify exports datasets to Google Drive with specific naming patterns.
 * This function generates patterns to search for the exported file.
 *
 * @param eventData - The webhook event data
 * @param scraperType - The type of scraper
 * @returns Array of possible file name patterns
 */
export function buildDriveFilePatterns(
  eventData: ApifyEventData,
  _scraperType: ScraperType
): string[] {
  const patterns: string[] = [];

  // Common Apify export naming patterns
  // These patterns should match how Apify names files when exporting to Drive

  // Pattern 1: Include dataset ID if available
  if (eventData.defaultDatasetId) {
    patterns.push(`APIFY Dataset`);
    patterns.push(`apify-dataset-${eventData.defaultDatasetId}`);
  }

  // Pattern 2: Include run ID
  if (eventData.actorRunId) {
    patterns.push(`apify-run-${eventData.actorRunId}`);
  }

  // Pattern 3: Generic Apify dataset patterns
  patterns.push('APIFY Dataset');
  patterns.push('Apify Dataset');

  return patterns;
}

/**
 * Generate Drive search query to find the exported dataset file
 *
 * @param eventData - The webhook event data
 * @param scraperType - The type of scraper
 * @returns Drive API search query string
 */
export function buildDriveSearchQuery(
  eventData: ApifyEventData,
  _scraperType: ScraperType
): string {
  // Search for XLSX files with Apify-related names
  // Note: Drive's 'contains' is case-sensitive, so we search for 'Apify' (actual file naming)
  const folderId = String(
    process.env.APIFY_DRIVE_FOLDER_ID ||
    process.env.APIFY_UPLOADS_DRIVE_FOLDER_ID ||
    DEFAULT_APIFY_UPLOADS_DRIVE_FOLDER_ID
  ).trim();
  const startedAt = String(eventData.startedAt || '').trim();
  const finishedAt = String(eventData.finishedAt || '').trim();
  const referenceTime = startedAt || finishedAt;

  const queryParts = [
    // Look for XLSX files or Google Sheets
    "(mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType = 'application/vnd.google-apps.spreadsheet')",
    // Not trashed
    'trashed = false',
    // Contains 'Apify' in the name (matches "Apify Dataset.xlsx")
    "name contains 'Apify'",
  ];

  if (folderId) {
    queryParts.push(`'${folderId.replace(/'/g, "\\'")}' in parents`);
  }

  if (referenceTime) {
    const parsed = Date.parse(referenceTime);
    if (Number.isFinite(parsed)) {
      const cutoff = new Date(parsed - 10 * 60 * 1000).toISOString();
      queryParts.push(`createdTime > '${cutoff}'`);
    }
  }

  return queryParts.join(' and ');
}

/**
 * Calculate how long to wait before searching for the Drive file
 *
 * Apify exports to Drive can take some time to complete after the run finishes.
 * This provides a reasonable delay to allow the export to complete.
 *
 * @param eventData - The webhook event data
 * @returns Delay in milliseconds
 */
export function getFileSearchDelayMs(_eventData: ApifyEventData): number {
  // Default to 30 seconds to allow Drive export to complete
  // This can be adjusted based on observed export times
  return 30000;
}

/**
 * Parse the Apify webhook timestamp
 *
 * @param createdAt - The ISO timestamp from the webhook
 * @returns Date object
 */
export function parseWebhookTimestamp(createdAt: string): Date {
  return new Date(createdAt);
}

/**
 * Check if a webhook event is recent enough to process
 *
 * Prevents processing very old webhooks that might be replayed
 *
 * @param createdAt - The webhook creation timestamp
 * @param maxAgeMs - Maximum age in milliseconds (default: 1 hour)
 * @returns true if the webhook is recent enough
 */
export function isRecentWebhook(createdAt: string, maxAgeMs: number = 3600000): boolean {
  const webhookTime = parseWebhookTimestamp(createdAt);
  const age = Date.now() - webhookTime.getTime();

  if (age > maxAgeMs) {
    logger.warn('Webhook is too old', {
      createdAt,
      ageMs: age,
      maxAgeMs,
    });
    return false;
  }

  return true;
}

/**
 * Format actor run URL for logging and debugging
 *
 * @param actorId - The actor ID
 * @param actorRunId - The run ID
 * @returns Apify console URL for the run
 */
export function formatRunUrl(actorId: string, actorRunId: string): string {
  return `https://console.apify.com/actors/${actorId}/runs/${actorRunId}`;
}

export type ApifyAdHocWebhook = {
  eventTypes: string[];
  requestUrl: string;
  payloadTemplate?: string;
  idempotencyKey?: string;
};

export async function startActorRunNoWait(
  actorId: string,
  token: string,
  input: Record<string, unknown>,
  options?: {
    webhooks?: ApifyAdHocWebhook[];
  }
): Promise<{ actorRunId: string; datasetId?: string; runUrl: string }> {
  const normalizedActorId = String(actorId || '').trim();
  const normalizedToken = String(token || '').trim();
  if (!normalizedActorId || !normalizedToken) {
    throw new Error('Apify actorId and token are required');
  }

  const params = new URLSearchParams({
    token: normalizedToken,
    waitForFinish: '0',
  });
  const webhooks = (options?.webhooks || [])
    .filter((webhook) => webhook && webhook.requestUrl && Array.isArray(webhook.eventTypes) && webhook.eventTypes.length > 0);
  if (webhooks.length > 0) {
    params.set('webhooks', Buffer.from(JSON.stringify(webhooks)).toString('base64'));
  }

  const startUrl = `https://api.apify.com/v2/acts/${encodeURIComponent(normalizedActorId)}/runs?${params.toString()}`;
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
    runUrl: formatRunUrl(normalizedActorId, actorRunId),
  };
}

async function fetchApifyDatasetItems(
  datasetUrl: string,
  token?: string
): Promise<Array<Record<string, unknown>>> {
  const normalizedToken = String(token || '').trim();
  const datasetRes = await fetch(datasetUrl, {
    method: 'GET',
    ...(normalizedToken ? { headers: { authorization: `Bearer ${normalizedToken}` } } : {}),
  });

  if (!datasetRes.ok) {
    const body = await datasetRes.text().catch(() => '');
    throw new Error(`Apify dataset fetch failed (${datasetRes.status}): ${body.slice(0, 500)}`);
  }

  const datasetItems = await datasetRes.json();
  if (!Array.isArray(datasetItems)) {
    throw new Error('Apify dataset response was not an array');
  }

  return datasetItems.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>;
}

export async function fetchApifyDatasetItemsById(
  datasetId: string,
  token: string,
  options?: {
    limit?: number;
  }
): Promise<Array<Record<string, unknown>>> {
  const normalizedDatasetId = String(datasetId || '').trim();
  const normalizedToken = String(token || '').trim();
  if (!normalizedDatasetId || !normalizedToken) {
    throw new Error('Apify datasetId and token are required');
  }

  const limit = Math.max(1, Math.min(Number(options?.limit || 10), 100));
  const datasetUrl = `https://api.apify.com/v2/datasets/${encodeURIComponent(normalizedDatasetId)}/items?clean=1&format=json&limit=${limit}`;
  return fetchApifyDatasetItems(datasetUrl, normalizedToken);
}

export async function runActorAndFetchDatasetItems(
  actorId: string,
  token: string,
  input: Record<string, unknown>,
  options?: {
    waitForFinishSeconds?: number;
    datasetLimit?: number;
  }
): Promise<Array<Record<string, unknown>>> {
  const normalizedActorId = String(actorId || '').trim();
  const normalizedToken = String(token || '').trim();
  if (!normalizedActorId || !normalizedToken) {
    throw new Error('Apify actorId and token are required');
  }

  const waitForFinishSeconds = Math.max(1, Math.min(Number(options?.waitForFinishSeconds || 90), 240));
  const datasetLimit = Math.max(1, Math.min(Number(options?.datasetLimit || 10), 50));

  const startUrl = `https://api.apify.com/v2/acts/${encodeURIComponent(normalizedActorId)}/runs?token=${encodeURIComponent(normalizedToken)}&waitForFinish=${waitForFinishSeconds}`;
  logger.info('Starting Apify actor run for unknown venue lookup', {
    actorId: normalizedActorId,
    waitForFinishSeconds,
    datasetLimit,
  });

  const startRes = await fetch(startUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input || {}),
  });

  if (!startRes.ok) {
    const body = await startRes.text().catch(() => '');
    throw new Error(`Apify start failed (${startRes.status}): ${body.slice(0, 500)}`);
  }

  const startJson = await startRes.json() as { data?: Record<string, unknown> } & Record<string, unknown>;
  const runData = (startJson.data || startJson) as Record<string, unknown>;
  const datasetId = String(runData.defaultDatasetId || '').trim();
  const runStatus = String(runData.status || '').trim();

  if (!datasetId) {
    throw new Error('Apify run did not return defaultDatasetId');
  }

  const datasetUrl = `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?clean=1&format=json&limit=${datasetLimit}`;
  let datasetItems = await fetchApifyDatasetItems(datasetUrl);
  if (!datasetItems.length) {
    const maxRetries = 4;
    for (let attempt = 1; attempt <= maxRetries && !datasetItems.length; attempt++) {
      logger.warn('Apify dataset empty after actor run; retrying dataset fetch', {
        actorId: normalizedActorId,
        datasetId,
        runStatus: runStatus || '(unknown)',
        attempt,
        maxRetries,
      });
      await new Promise((resolve) => setTimeout(resolve, 3000));
      datasetItems = await fetchApifyDatasetItems(datasetUrl);
    }
  }

  return datasetItems;
}
