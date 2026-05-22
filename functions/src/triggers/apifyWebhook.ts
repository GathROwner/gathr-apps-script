/**
 * Apify Webhook Trigger
 * Receives notifications when Apify actor runs complete and triggers automatic processing
 */

import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { getFunctions } from 'firebase-admin/functions';
import { createHash } from 'crypto';
import {
  ApifyWebhookPayload,
  ApifyEventType,
  ApifyWebhookRecord,
  ScraperType,
} from '../types/index.js';

// Define secrets for Firebase Functions v2
const apifyWebhookSecret = defineSecret('APIFY_WEBHOOK_SECRET');
const adminApiKey = defineSecret('ADMIN_API_KEY');
import { logger } from '../utils/logger.js';
import {
  verifyWebhookSignature,
  detectScraperType,
  buildDriveSearchQuery,
  isRecentWebhook,
  formatRunUrl,
} from '../services/apifyService.js';
import { listFiles } from '../services/driveService.js';
import * as firestoreService from '../services/firestoreService.js';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const WEBHOOKS_COLLECTION = 'apify_webhooks';
const TASK_QUEUE_LOCATION = 'northamerica-northeast1';
const ACTIVE_WEBHOOK_STATUSES = new Set<ApifyWebhookRecord['status']>([
  'received',
  'processing',
  'completed',
  'skipped',
]);

/**
 * Apify webhook event types we handle
 */
const HANDLED_EVENT_TYPES: ApifyEventType[] = [
  'ACTOR.RUN.SUCCEEDED',
  'ACTOR.RUN.FAILED',
  'ACTOR.RUN.ABORTED',
  'ACTOR.RUN.TIMED_OUT',
];

/**
 * HTTP Trigger: Receive Apify webhook notifications
 *
 * POST /apifyWebhook
 * Headers:
 *   - apify-webhook-signature: HMAC-SHA256 signature
 * Body: Apify webhook payload
 *
 * This function:
 * 1. Verifies the webhook signature
 * 2. Logs the webhook event to Firestore
 * 3. On successful runs, finds the exported Drive file and triggers processing
 */
export const apifyWebhook = onRequest(
  {
    timeoutSeconds: 120, // Allow time for file search and processing trigger
    memory: '256MiB',
    region: 'northamerica-northeast2',
    cors: false, // Webhooks don't need CORS
    secrets: [apifyWebhookSecret],
  },
  async (request, response) => {
    // Only accept POST requests
    if (request.method !== 'POST') {
      response.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const webhookSecret = apifyWebhookSecret.value();
    const signature = request.headers['apify-webhook-signature'] as string | undefined;

    // Verify webhook signature only if BOTH secret is configured AND signature is provided
    // Apify's basic HTTP webhook integration doesn't support signatures
    if (webhookSecret && signature) {
      if (!verifyWebhookSignature(request.rawBody, signature, webhookSecret)) {
        logger.warn('Invalid webhook signature', {
          hasSignature: !!signature,
          hasSecret: !!webhookSecret,
        });
        response.status(401).json({ error: 'Invalid signature' });
        return;
      }
      logger.debug('Webhook signature verified');
    } else {
      // Log but allow - Apify basic webhooks don't support signatures
      logger.info('Webhook received without signature verification', {
        hasSecret: !!webhookSecret,
        hasSignature: !!signature,
      });
    }

    const payload = request.body as ApifyWebhookPayload;

    logger.setContext({ functionName: 'apifyWebhook' });
    logger.info('Apify webhook received', {
      eventType: payload.eventType,
      actorId: payload.eventData?.actorId,
      actorRunId: payload.eventData?.actorRunId,
      datasetId: payload.eventData?.defaultDatasetId,
      createdAt: payload.createdAt,
    });

    let webhookDocRef: admin.firestore.DocumentReference | null = null;

    try {
      // Build base webhook record data
      // Note: Only include datasetId if it has a value (Firestore rejects undefined)
      const webhookRecord: Omit<ApifyWebhookRecord, 'id'> = {
        eventType: payload.eventType,
        actorId: payload.eventData?.actorId || 'unknown',
        actorRunId: payload.eventData?.actorRunId || 'unknown',
        scraperType: 'unknown',
        status: 'received',
        receivedAt: new Date(),
        ...(payload.eventData?.defaultDatasetId && { datasetId: payload.eventData.defaultDatasetId }),
      };

      // Check if this is an event type we handle
      if (!HANDLED_EVENT_TYPES.includes(payload.eventType)) {
        logger.debug('Ignoring unhandled event type', { eventType: payload.eventType });
        webhookDocRef = await createWebhookRecord({
          ...webhookRecord,
          status: 'skipped',
          error: `Unhandled event type: ${payload.eventType}`,
        });
        response.status(200).json({ received: true, handled: false });
        return;
      }

      // Check if webhook is recent enough to process
      if (payload.createdAt && !isRecentWebhook(payload.createdAt)) {
        logger.warn('Ignoring stale webhook');
        webhookDocRef = await createWebhookRecord({
          ...webhookRecord,
          status: 'skipped',
          error: 'Webhook is too old',
        });
        response.status(200).json({ received: true, handled: false, reason: 'stale' });
        return;
      }

      const actorRunId = payload.eventData?.actorRunId || '';
      if (actorRunId && await hasActiveWebhookForRun(actorRunId)) {
        logger.warn('Duplicate webhook ignored (run already processing)', { actorRunId });
        await createWebhookRecord({
          ...webhookRecord,
          status: 'skipped',
          error: 'Duplicate webhook already in progress',
        });
        response.status(200).json({ received: true, handled: false, reason: 'duplicate_in_progress' });
        return;
      }

      // Store initial webhook record (filter out any remaining undefined values)
      webhookDocRef = await createWebhookRecord(webhookRecord);

      // Detect scraper type
      const scraperType = detectScraperType(payload.eventData);
      await webhookDocRef.update({ scraperType });

      // Handle based on event type
      switch (payload.eventType) {
        case 'ACTOR.RUN.SUCCEEDED':
          await handleRunSucceeded(payload, webhookDocRef, scraperType);
          break;

        case 'ACTOR.RUN.FAILED':
        case 'ACTOR.RUN.ABORTED':
        case 'ACTOR.RUN.TIMED_OUT':
          await handleRunFailed(payload, webhookDocRef);
          break;
      }

      response.status(200).json({ received: true, handled: true });
    } catch (error) {
      logger.error('Webhook processing failed', error);

      // Update webhook record with error
      if (webhookDocRef) {
        await updateWebhookStatus(webhookDocRef, 'failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      // Return 200 to prevent Apify from retrying
      // The error is logged and can be investigated
      response.status(200).json({
        received: true,
        handled: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      logger.clearContext('functionName');
    }
  }
);

/**
 * Handle successful actor run
 * Finds the exported Drive file and triggers processing
 */
async function handleRunSucceeded(
  payload: ApifyWebhookPayload,
  webhookDocRef: admin.firestore.DocumentReference,
  scraperType: ScraperType
): Promise<void> {
  const { actorId, actorRunId, defaultDatasetId } = payload.eventData;

  logger.info('Actor run succeeded', {
    actorId,
    actorRunId,
    datasetId: defaultDatasetId,
    scraperType,
    runUrl: formatRunUrl(actorId, actorRunId),
  });

  await updateWebhookStatus(webhookDocRef, 'processing');

  // Wait a short time for the Drive export to complete
  // Apify exports to Drive can take a few seconds after run completion
  await delay(5000);

  // Find the exported file in Drive
  const file = await findExportedFile(payload, scraperType);

  if (!file || !file.id) {
    const error = 'Could not find exported file in Google Drive';
    logger.warn(error, { actorRunId, datasetId: defaultDatasetId });
    await updateWebhookStatus(webhookDocRef, 'failed', { error });
    return;
  }

  logger.info('Found exported file', {
    fileId: file.id,
    fileName: file.name,
  });

  // Update webhook record with file info
  await webhookDocRef.update({
    fileId: file.id,
    fileName: file.name,
  });

  if (await hasActiveWebhookForFile(file.id, webhookDocRef.id)) {
    await updateWebhookStatus(webhookDocRef, 'skipped', {
      error: 'Duplicate file already processing',
    });
    return;
  }

  // Trigger processing
  let runId: string | undefined;

  try {
    const lock = await firestoreService.acquireProcessingLock(file.id, {
      source: 'apifyWebhook',
    });

    if (!lock.acquired || !lock.runId) {
      await updateWebhookStatus(webhookDocRef, 'skipped', {
        error: 'Processing already in progress',
      });
      logger.warn('Processing already locked', {
        fileId: file.id,
        lockRunId: lock.runId,
        reason: lock.reason,
      });
      return;
    }

    const activeRunId = lock.runId;
    runId = activeRunId;
    logger.setContext({ fileId: file.id, runId: activeRunId });

    // Do not process the dataset inside the webhook handler. Enqueue a task so
    // parsing runs in the task worker (higher memory/timeout) and webhook stays fast.
    await enqueueInitialProcessingTask(file.id, file.name || undefined, activeRunId, {
      dryRun: false,
      parserMode: 'full5stage',
      source: 'apifyWebhook',
    });

    await firestoreService.refreshProcessingLock(file.id, activeRunId, {
      status: 'paused',
      source: 'apifyWebhook',
    });

    await updateWebhookStatus(webhookDocRef, 'completed', {
      processingResult: {
        success: true,
        message: 'Processing enqueued to task queue',
      },
    });

    logger.info('Processing enqueued successfully', {
      fileId: file.id,
      runId: activeRunId,
    });
  } catch (error) {
    logger.error('Failed to trigger processing', error, { fileId: file.id });
    if (runId) {
      await firestoreService.releaseProcessingLock(file.id, runId, 'failed', 'apifyWebhook');
    }
    await updateWebhookStatus(webhookDocRef, 'failed', {
      error: error instanceof Error ? error.message : 'Processing trigger failed',
    });
  } finally {
    logger.clearContext('fileId', 'runId');
  }
}

/**
 * Find the exported file in Google Drive
 * Searches for recently created XLSX files matching Apify naming patterns
 */
async function findExportedFile(
  payload: ApifyWebhookPayload,
  scraperType: ScraperType
): Promise<{ id: string; name: string } | null> {
  const { defaultDatasetId } = payload.eventData;

  // Build search query for Apify dataset files
  const query = buildDriveSearchQuery(payload.eventData, scraperType);

  logger.debug('Searching for exported file', { query, scraperType });

  try {
    // Search with a broader query first
    const files = await listFiles(query, {
      pageSize: 20,
      orderBy: 'createdTime desc',
    });

    if (files.length === 0) {
      logger.warn('No matching files found in Drive');
      return null;
    }

    logger.debug('Found potential files', {
      count: files.length,
      files: files.map(f => ({ id: f.id, name: f.name, createdTime: f.createdTime })),
    });

    // Try to find the most recently created file
    // Since Apify just finished, the export should be very recent
    const recentFile = files[0];

    if (recentFile.id && recentFile.name) {
      return {
        id: recentFile.id,
        name: recentFile.name,
      };
    }

    // If that doesn't work, try to find by dataset ID in the name
    if (defaultDatasetId) {
      const matchingFile = files.find(f =>
        f.name?.includes(defaultDatasetId) ||
        f.name?.toLowerCase().includes('apify')
      );

      if (matchingFile?.id && matchingFile?.name) {
        return {
          id: matchingFile.id,
          name: matchingFile.name,
        };
      }
    }

    // As a fallback, use any unprocessed Apify dataset file
    const processedIds = await getProcessedFileIds();
    const unprocessedFiles = files.filter(f => f.id && !processedIds.has(f.id));

    if (unprocessedFiles.length > 0 && unprocessedFiles[0].id && unprocessedFiles[0].name) {
      return {
        id: unprocessedFiles[0].id,
        name: unprocessedFiles[0].name,
      };
    }

    return null;
  } catch (error) {
    logger.error('Drive search failed', error);
    return null;
  }
}

/**
 * Get the set of already-processed file IDs
 */
async function getProcessedFileIds(): Promise<Set<string>> {
  try {
    const snapshot = await db
      .collection('processed_datasets')
      .select('fileId')
      .get();

    return new Set(snapshot.docs.map(doc => doc.data().fileId as string).filter(Boolean));
  } catch (error) {
    logger.error('Failed to get processed file IDs', error);
    return new Set();
  }
}

/**
 * Handle failed actor run
 * Logs the failure for monitoring and alerting
 */
async function handleRunFailed(
  payload: ApifyWebhookPayload,
  webhookDocRef: admin.firestore.DocumentReference
): Promise<void> {
  const { actorId, actorRunId, status, statusMessage } = payload.eventData;

  logger.warn('Actor run failed', {
    actorId,
    actorRunId,
    status,
    statusMessage,
    eventType: payload.eventType,
    runUrl: formatRunUrl(actorId, actorRunId),
  });

  await updateWebhookStatus(webhookDocRef, 'completed', {
    error: `Run failed with status: ${status || payload.eventType}`,
    processingResult: {
      success: false,
      message: statusMessage || `Actor run ${payload.eventType.replace('ACTOR.RUN.', '').toLowerCase()}`,
    },
  });
}

/**
 * Update webhook record status
 */
async function updateWebhookStatus(
  docRef: admin.firestore.DocumentReference,
  status: ApifyWebhookRecord['status'],
  additionalData?: Partial<ApifyWebhookRecord>
): Promise<void> {
  try {
    // Filter out undefined values to avoid Firestore errors
    const updateData: Record<string, unknown> = { status };

    if (status === 'completed' || status === 'failed') {
      updateData.processedAt = admin.firestore.FieldValue.serverTimestamp();
    }

    if (additionalData) {
      for (const [key, value] of Object.entries(additionalData)) {
        if (value !== undefined) {
          updateData[key] = value;
        }
      }
    }

    await docRef.update(updateData);
  } catch (error) {
    logger.error('Failed to update webhook status', error);
  }
}

async function enqueueInitialProcessingTask(
  fileId: string,
  fileName: string | undefined,
  runId: string,
  options?: {
    dryRun?: boolean;
    parserMode?: 'legacy' | 'full5stage';
    source?: string;
  }
): Promise<void> {
  logger.info('Enqueueing initial processing task', {
    fileId,
    runId,
    queueLocation: TASK_QUEUE_LOCATION,
    source: options?.source,
  });

  try {
    const queue = getFunctions().taskQueue(
      `locations/${TASK_QUEUE_LOCATION}/functions/processDatasetResume`
    );

    const raw = `${fileId}|${runId}|start`;
    const hash = createHash('sha1').update(raw).digest('hex');
    const taskId = `start-${hash}`;

    await queue.enqueue(
      {
        fileId,
        fileName,
        runId,
        dryRun: options?.dryRun ?? false,
        parserMode: options?.parserMode || 'legacy',
      },
      {
        scheduleDelaySeconds: 0,
        id: taskId,
      }
    );

    logger.info('Initial processing task enqueued', { taskId });
  } catch (error) {
    if (isTaskAlreadyExistsError(error)) {
      logger.info('Initial processing task already queued (deduped)', {
        fileId,
        runId,
      });
      return;
    }
    throw error;
  }
}

function isTaskAlreadyExistsError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /task-already-exists|already exists|ALREADY_EXISTS/i.test(msg);
}

async function createWebhookRecord(
  record: Omit<ApifyWebhookRecord, 'id'>
): Promise<admin.firestore.DocumentReference> {
  const recordToSave = Object.fromEntries(
    Object.entries(record).filter(([_, v]) => v !== undefined)
  );
  return db.collection(WEBHOOKS_COLLECTION).add({
    ...recordToSave,
    receivedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

function isActiveWebhookStatus(value: unknown): value is ApifyWebhookRecord['status'] {
  return typeof value === 'string' && ACTIVE_WEBHOOK_STATUSES.has(value as ApifyWebhookRecord['status']);
}

async function hasActiveWebhookForRun(actorRunId: string): Promise<boolean> {
  const snapshot = await db
    .collection(WEBHOOKS_COLLECTION)
    .where('actorRunId', '==', actorRunId)
    .get();

  if (snapshot.empty) return false;

  return snapshot.docs.some((doc) => isActiveWebhookStatus(doc.get('status')));
}

async function hasActiveWebhookForFile(
  fileId: string,
  currentDocId?: string
): Promise<boolean> {
  const snapshot = await db
    .collection(WEBHOOKS_COLLECTION)
    .where('fileId', '==', fileId)
    .get();

  if (snapshot.empty) return false;

  return snapshot.docs.some((doc) => {
    if (currentDocId && doc.id === currentDocId) return false;
    return isActiveWebhookStatus(doc.get('status'));
  });
}

/**
 * Simple delay utility
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * HTTP Trigger: List recent webhook events (for debugging/monitoring)
 *
 * GET /listApifyWebhooks?limit=20
 * Headers:
 *   - Authorization: Bearer {ADMIN_API_KEY}
 */
export const listApifyWebhooks = onRequest(
  {
    timeoutSeconds: 30,
    memory: '256MiB',
    region: 'northamerica-northeast2',
    cors: true,
    secrets: [adminApiKey],
  },
  async (request, response) => {
    // Check for admin authorization
    const authHeader = request.headers.authorization;
    const expectedKey = adminApiKey.value();

    if (expectedKey && authHeader !== `Bearer ${expectedKey}`) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const limit = parseInt(request.query.limit as string) || 20;
    const status = request.query.status as string;

    try {
      let query = db
        .collection(WEBHOOKS_COLLECTION)
        .orderBy('receivedAt', 'desc')
        .limit(limit);

      if (status) {
        query = query.where('status', '==', status);
      }

      const snapshot = await query.get();

      const webhooks = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      response.json({
        webhooks,
        count: webhooks.length,
      });
    } catch (error) {
      logger.error('List webhooks failed', error);
      response.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * HTTP Trigger: Manually retry a failed webhook
 *
 * POST /retryApifyWebhook
 * Headers:
 *   - Authorization: Bearer {ADMIN_API_KEY}
 * Body: { webhookId: string }
 */
export const retryApifyWebhook = onRequest(
  {
    timeoutSeconds: 120,
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

    // Check for admin authorization
    const authHeader = request.headers.authorization;
    const expectedKey = adminApiKey.value();

    if (expectedKey && authHeader !== `Bearer ${expectedKey}`) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { webhookId } = request.body as { webhookId?: string };

    if (!webhookId) {
      response.status(400).json({ error: 'webhookId is required' });
      return;
    }

    logger.setContext({ functionName: 'retryApifyWebhook', webhookId });

    let runId: string | undefined;
    let fileId: string | undefined;

    try {
      const docRef = db.collection(WEBHOOKS_COLLECTION).doc(webhookId);
      const doc = await docRef.get();

      if (!doc.exists) {
        response.status(404).json({ error: 'Webhook not found' });
        return;
      }

      const webhookData = doc.data() as ApifyWebhookRecord;

      if (!webhookData.fileId) {
        response.status(400).json({
          error: 'Webhook has no associated file ID - cannot retry processing',
        });
        return;
      }

      fileId = webhookData.fileId;

      const lock = await firestoreService.acquireProcessingLock(fileId, {
        source: 'retryApifyWebhook',
      });

      if (!lock.acquired || !lock.runId) {
        await updateWebhookStatus(docRef, 'skipped', {
          error: 'Processing already in progress',
        });
        response.status(409).json({
          error: 'Processing already in progress',
          runId: lock.runId,
        });
        return;
      }

      const activeRunId = lock.runId;
      runId = activeRunId;
      logger.setContext({ fileId, runId: activeRunId });

      // Reset status and retry processing
      await updateWebhookStatus(docRef, 'processing');

      await enqueueInitialProcessingTask(fileId, webhookData.fileName, activeRunId, {
        dryRun: false,
        parserMode: 'full5stage',
        source: 'retryApifyWebhook',
      });

      await firestoreService.refreshProcessingLock(fileId, activeRunId, {
        status: 'paused',
        source: 'retryApifyWebhook',
      });

      await updateWebhookStatus(docRef, 'completed', {
        processingResult: {
          success: true,
          message: 'Processing enqueued to task queue',
        },
      });

      response.json({
        success: true,
        fileId,
        runId: activeRunId,
        queued: true,
      });
    } catch (error) {
      logger.error('Retry webhook failed', error);
      if (fileId && runId) {
        await firestoreService.releaseProcessingLock(fileId, runId, 'failed', 'retryApifyWebhook');
      }
      response.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      logger.clearContext('functionName', 'webhookId', 'fileId', 'runId');
    }
  }
);
