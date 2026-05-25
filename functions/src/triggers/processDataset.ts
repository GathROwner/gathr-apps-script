/**
 * Process Dataset Trigger
 * HTTP trigger to start processing an Apify dataset file
 */

import { onRequest } from 'firebase-functions/v2/https';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { getFunctions } from 'firebase-admin/functions';
import { createHash } from 'crypto';
import * as admin from 'firebase-admin';
import {
  DEFAULT_CONFIG,
  ProcessingConfig,
  ProcessDatasetRequest,
  ProcessDatasetResponse,
} from '../types/index.js';
import { logger } from '../utils/logger.js';
import * as firestoreService from '../services/firestoreService.js';
import {
  buildResumeTaskCheckpoint,
  matchesResumeTaskCheckpoint,
  ResumeTaskCheckpoint,
} from '../processing/resumeTaskGuard.js';

const TASK_QUEUE_LOCATION = 'northamerica-northeast1';
let fileProcessorPromise: Promise<typeof import('../processing/fileProcessor.js')> | null = null;

function resolveParserModelEnv(name: 'GPT_MODEL_FAST' | 'GPT_MODEL_REASONING', fallback: string): string {
  const raw = String(process.env[name] || '').trim();
  return raw || fallback;
}

function buildParserConfig(
  parserMode: 'legacy' | 'full5stage',
  extra: Partial<ProcessingConfig> = {}
): Partial<ProcessingConfig> {
  return {
    parserMode,
    gptModelFast: resolveParserModelEnv('GPT_MODEL_FAST', DEFAULT_CONFIG.gptModelFast),
    gptModelReasoning: resolveParserModelEnv(
      'GPT_MODEL_REASONING',
      DEFAULT_CONFIG.gptModelReasoning
    ),
    ...extra,
  };
}

async function loadFileProcessor() {
  if (!fileProcessorPromise) {
    fileProcessorPromise = import('../processing/fileProcessor.js');
  }
  return fileProcessorPromise;
}

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * HTTP Trigger: Start processing a dataset file
 *
 * POST /processDataset
 * Body: {
 *   fileId: string,           // Google Drive file ID
 *   fileName?: string,        // Optional file name
 *   resumeFromCheckpoint?: boolean,  // Whether to resume from checkpoint
 *   dryRun?: boolean,         // Whether to run in dry-run mode
 *   rowIndexes?: number[]     // Optional list of row indexes to process
 *   mediaOverrideUrl?: string // Optional media URL override for selected rows
 * }
 */
export const processDataset = onRequest(
  {
    timeoutSeconds: 540, // 9 minutes
    memory: '1GiB',
    region: 'northamerica-northeast2',
    cors: true,
  },
  async (request, response) => {
    // Only accept POST requests
    if (request.method !== 'POST') {
      response.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const body = request.body as ProcessDatasetRequest;
    const parserMode = body.parserMode || 'legacy';
    const rowIndexes = Array.isArray(body.rowIndexes)
      ? body.rowIndexes.map((value) => Number(value)).filter((value) => Number.isFinite(value))
      : (Number.isFinite(body.rowIndex) ? [Number(body.rowIndex)] : undefined);
    const mediaOverrideUrl = typeof body.mediaOverrideUrl === 'string'
      ? body.mediaOverrideUrl.trim()
      : '';

    if (parserMode !== 'legacy' && parserMode !== 'full5stage') {
      response.status(400).json({ error: 'parserMode must be "legacy" or "full5stage"' });
      return;
    }

    // Validate request
    if (!body.fileId) {
      response.status(400).json({ error: 'fileId is required' });
      return;
    }

    let runId: string | undefined;
    let lockAcquired = false;

    try {
      const lock = await firestoreService.acquireProcessingLock(body.fileId, {
        source: 'processDataset',
      });

      if (!lock.acquired || !lock.runId) {
        logger.warn('Processing already locked', {
          fileId: body.fileId,
          lockRunId: lock.runId,
          reason: lock.reason,
        });
        response.status(409).json({
          success: false,
          error: 'Processing already in progress',
          message: lock.reason,
          runId: lock.runId,
        } as ProcessDatasetResponse);
        return;
      }

      const activeRunId = lock.runId;
      runId = activeRunId;
      lockAcquired = true;

      logger.setContext({ functionName: 'processDataset', fileId: body.fileId, runId: activeRunId });
      logger.info('Processing request received', { body });

      const { processDatasetFile } = await loadFileProcessor();
      const result = await processDatasetFile(body.fileId, {
        fileName: body.fileName,
        resumeFromCheckpoint: body.resumeFromCheckpoint ?? true,
        dryRun: body.dryRun ?? false,
        config: buildParserConfig(parserMode),
        rowIndexes,
        mediaOverrideUrl: mediaOverrideUrl || undefined,
        runId: activeRunId,
      });

      // If processing was paused, schedule the next batch
      if (result.nextBatchScheduled) {
        await firestoreService.refreshProcessingLock(body.fileId, activeRunId, {
          status: 'paused',
          source: 'processDataset',
        });
        await scheduleNextBatch(body.fileId, body.fileName, activeRunId, {
          dryRun: body.dryRun ?? false,
          parserMode,
        });
      } else if (lockAcquired && runId) {
        await firestoreService.releaseProcessingLock(
          body.fileId,
          activeRunId,
          result.success ? 'completed' : 'failed',
          'processDataset'
        );
        if (result.success) {
          const stats = result.stats;
          const summary = `Finished Processing Dataset (${body.fileId}) - ` +
            `Created ${stats?.newStandardEventsCreated ?? 0} new events, ` +
            `updated ${stats?.existingStandardEventsUpdated ?? 0} through dedup, ` +
            `Created ${stats?.newFoodSpecialsCreated ?? 0} Food Specials, ` +
            `Updated ${stats?.existingFoodSpecialsUpdated ?? 0} through dedup.`;
          logger.info(summary, { stats });
        }
      }

      response.json(result);
    } catch (error) {
      logger.error('Process dataset failed', error);
      if (lockAcquired && runId) {
        await firestoreService.releaseProcessingLock(body.fileId, runId, 'failed', 'processDataset');
      }
      response.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      } as ProcessDatasetResponse);
    } finally {
      logger.clearContext('functionName', 'fileId', 'runId');
    }
  }
);

/**
 * HTTP Trigger: Get processing status for a file
 *
 * GET /processDatasetStatus?fileId=xxx
 */
export const processDatasetStatus = onRequest(
  {
    timeoutSeconds: 30,
    memory: '256MiB',
    region: 'northamerica-northeast2',
    cors: true,
  },
  async (request, response) => {
    const fileId = request.query.fileId as string;

    if (!fileId) {
      response.status(400).json({ error: 'fileId query parameter is required' });
      return;
    }

    try {
      const { getProcessingStatus } = await loadFileProcessor();
      const status = await getProcessingStatus(fileId);
      response.json(status);
    } catch (error) {
      logger.error('Get status failed', error);
      response.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * Task Queue: Resume processing for a paused file
 * This is called automatically when a batch completes and more work remains
 */
export const processDatasetResume = onTaskDispatched(
  {
    retryConfig: {
      maxAttempts: 3,
      minBackoffSeconds: 60,
    },
    rateLimits: {
      maxConcurrentDispatches: 1,
    },
    timeoutSeconds: 540,
    memory: '1GiB',
    region: TASK_QUEUE_LOCATION, // Cloud Tasks not available in northeast2
  },
  async (request) => {
    const {
      fileId,
      fileName,
      dryRun = false,
      parserMode = 'legacy',
      runId,
      expectedCheckpoint,
    } = request.data as {
      fileId: string;
      fileName?: string;
      dryRun?: boolean;
      parserMode?: 'legacy' | 'full5stage';
      runId?: string;
      expectedCheckpoint?: ResumeTaskCheckpoint;
    };
    const resumeMaxExecutionMsRaw = Number(process.env.RESUME_MAX_EXECUTION_MS);
    const resumeMaxExecutionMs = Number.isFinite(resumeMaxExecutionMsRaw)
      ? resumeMaxExecutionMsRaw
      : 420000;

    logger.setContext({ functionName: 'processDatasetResume', fileId, runId });
    logger.info('Resuming processing from task queue');

    try {
      if (!runId) {
        logger.warn('Missing runId on resume task, skipping');
        return;
      }

      if (expectedCheckpoint) {
        const currentCheckpoint = await firestoreService.getCheckpoint(fileId);
        if (!matchesResumeTaskCheckpoint(expectedCheckpoint, currentCheckpoint)) {
          logger.info('Resume skipped by stale checkpoint guard', {
            expectedCheckpoint,
            currentCheckpoint: currentCheckpoint
              ? buildResumeTaskCheckpoint(currentCheckpoint)
              : null,
          });
          return;
        }
      }

      const lock = await firestoreService.refreshProcessingLock(fileId, runId, {
        status: 'running',
        source: 'processDatasetResume',
      });

      if (!lock.refreshed) {
        logger.warn('Resume skipped by lock guard', {
          reason: lock.reason,
          lockRunId: lock.lock?.runId,
          lockStatus: lock.lock?.status,
        });
        return;
      }

      const { resumeProcessing } = await loadFileProcessor();
      const result = await resumeProcessing(fileId, {
        dryRun,
        runId,
        config: buildParserConfig(parserMode, {
          maxExecutionMs: resumeMaxExecutionMs,
        }),
      });

      // If still more work, schedule next batch
      if (result.nextBatchScheduled) {
        await firestoreService.refreshProcessingLock(fileId, runId, {
          status: 'paused',
          source: 'processDatasetResume',
        });
        await scheduleNextBatch(fileId, fileName, runId, { dryRun, parserMode });
      } else {
        await firestoreService.releaseProcessingLock(
          fileId,
          runId,
          result.success ? 'completed' : 'failed',
          'processDatasetResume'
        );

        if (result.success) {
          const stats = result.stats;
          const summary = `Finished Processing Dataset (${fileId}) - ` +
            `Created ${stats?.newStandardEventsCreated ?? 0} new events, ` +
            `updated ${stats?.existingStandardEventsUpdated ?? 0} through dedup, ` +
            `Created ${stats?.newFoodSpecialsCreated ?? 0} Food Specials, ` +
            `Updated ${stats?.existingFoodSpecialsUpdated ?? 0} through dedup.`;
          logger.info(summary, { stats });
        }
      }

      logger.info('Resume processing complete', { result });
    } catch (error) {
      logger.error('Resume processing failed', error);
      if (runId) {
        await firestoreService.refreshProcessingLock(fileId, runId, {
          status: 'running',
          source: 'processDatasetResume',
        });
      }
      throw error; // Re-throw to trigger retry
    } finally {
      logger.clearContext('functionName', 'fileId', 'runId');
    }
  }
);

/**
 * Task Queue: Process a targeted list of row indexes for a dataset file.
 * Used by unknown-venue manual finalization follow-up replays.
 */
export const processDatasetSelectedRows = onTaskDispatched(
  {
    retryConfig: {
      maxAttempts: 5,
      minBackoffSeconds: 60,
    },
    rateLimits: {
      maxConcurrentDispatches: 2,
    },
    timeoutSeconds: 540,
    memory: '1GiB',
    region: TASK_QUEUE_LOCATION,
  },
  async (request) => {
    const {
      fileId,
      fileName,
      rowIndexes,
      sourceUniqueIds,
      dryRun = false,
      parserMode = 'full5stage',
      sourceDocId,
      triggeredBy,
    } = (request.data || {}) as {
      fileId?: string;
      fileName?: string;
      rowIndexes?: number[];
      sourceUniqueIds?: string[];
      dryRun?: boolean;
      parserMode?: 'legacy' | 'full5stage';
      sourceDocId?: string;
      triggeredBy?: string;
    };

    const normalizedFileId = String(fileId || '').trim();
    const normalizedRowIndexes = Array.isArray(rowIndexes)
      ? Array.from(new Set(rowIndexes.map((value) => Math.trunc(Number(value))).filter((value) => Number.isFinite(value) && value >= 0)))
          .sort((a, b) => a - b)
      : [];
    const normalizedSourceUniqueIds = Array.isArray(sourceUniqueIds)
      ? Array.from(new Set(sourceUniqueIds.map((value) => String(value || '').trim()).filter(Boolean)))
      : [];
    const normalizedParserMode = parserMode === 'legacy' ? 'legacy' : 'full5stage';

    logger.setContext({
      functionName: 'processDatasetSelectedRows',
      fileId: normalizedFileId || 'missing',
      sourceDocId: String(sourceDocId || '').trim() || undefined,
    });
    logger.info('Processing selected rows from task queue', {
      fileName,
      rowIndexes: normalizedRowIndexes,
      sourceUniqueIds: normalizedSourceUniqueIds,
      parserMode: normalizedParserMode,
      dryRun,
      triggeredBy,
      sourceDocId,
    });

    if (!normalizedFileId) {
      logger.warn('Selected rows task missing fileId, skipping');
      logger.clearContext('functionName', 'fileId', 'sourceDocId');
      return;
    }

    if (!normalizedRowIndexes.length && !normalizedSourceUniqueIds.length) {
      logger.warn('Selected rows task missing rowIndexes/sourceUniqueIds, skipping', { fileId: normalizedFileId });
      logger.clearContext('functionName', 'fileId', 'sourceDocId');
      return;
    }

    let runId: string | undefined;
    let lockAcquired = false;
    try {
      const lock = await firestoreService.acquireProcessingLock(normalizedFileId, {
        source: 'processDatasetSelectedRows',
      });

      if (!lock.acquired || !lock.runId) {
        logger.warn('Selected rows replay blocked by processing lock', {
          reason: lock.reason,
          lockRunId: lock.runId,
          lockStatus: lock.lock?.status,
          fileId: normalizedFileId,
          rowIndexes: normalizedRowIndexes,
          sourceUniqueIds: normalizedSourceUniqueIds,
        });

        // Allow Cloud Tasks retries to replay later once the active parse finishes.
        if (lock.reason === 'active_lock') {
          throw new Error(`selected_rows_replay_lock_active:${normalizedFileId}`);
        }
        return;
      }

      runId = lock.runId;
      lockAcquired = true;
      logger.setContext({ runId });

      const { processDatasetFile } = await loadFileProcessor();
      const result = await processDatasetFile(normalizedFileId, {
        fileName: typeof fileName === 'string' ? fileName : undefined,
        resumeFromCheckpoint: false,
        dryRun: Boolean(dryRun),
        config: buildParserConfig(normalizedParserMode),
        rowIndexes: normalizedRowIndexes,
        sourceUniqueIds: normalizedSourceUniqueIds,
        runId,
      });

      await firestoreService.releaseProcessingLock(
        normalizedFileId,
        runId,
        result.success ? 'completed' : 'failed',
        'processDatasetSelectedRows'
      );

      if (result.success) {
        const stats = result.stats;
        const summary = `Finished Processing Dataset (${normalizedFileId}) - ` +
          `Created ${stats?.newStandardEventsCreated ?? 0} new events, ` +
          `updated ${stats?.existingStandardEventsUpdated ?? 0} through dedup, ` +
          `Created ${stats?.newFoodSpecialsCreated ?? 0} Food Specials, ` +
          `Updated ${stats?.existingFoodSpecialsUpdated ?? 0} through dedup.`;
        logger.info(summary, { stats });
      }

      logger.info('Selected rows replay complete', {
        fileId: normalizedFileId,
        rowIndexes: normalizedRowIndexes,
        sourceUniqueIds: normalizedSourceUniqueIds,
        parserMode: normalizedParserMode,
        result,
      });
    } catch (error) {
      logger.error('Selected rows replay task failed', error, {
        fileId: normalizedFileId,
        rowIndexes: normalizedRowIndexes,
        sourceUniqueIds: normalizedSourceUniqueIds,
        parserMode: normalizedParserMode,
      });

      if (lockAcquired && runId) {
        await firestoreService.releaseProcessingLock(
          normalizedFileId,
          runId,
          'failed',
          'processDatasetSelectedRows'
        );
      }

      // Retry lock-contention failures; other failures are best-effort and should not thrash.
      const msg = error instanceof Error ? error.message : String(error);
      if (/^selected_rows_replay_lock_active:/i.test(msg)) {
        throw error;
      }
    } finally {
      logger.clearContext('functionName', 'fileId', 'sourceDocId', 'runId');
    }
  }
);

/**
 * Schedule the next batch using Cloud Tasks
 */
async function scheduleNextBatch(
  fileId: string,
  fileName?: string,
  runId?: string,
  options?: {
    dryRun?: boolean;
    parserMode?: 'legacy' | 'full5stage';
  }
): Promise<void> {
  const { getNextBatchDelayMs } = await loadFileProcessor();
  const delay = getNextBatchDelayMs();
  const scheduledTime = Date.now() + delay;

  logger.info('Scheduling next batch', {
    fileId,
    runId,
    delayMs: delay,
    scheduledTime: new Date(scheduledTime).toISOString(),
    queueLocation: TASK_QUEUE_LOCATION,
  });

  try {
    const queue = getFunctions().taskQueue(
      `locations/${TASK_QUEUE_LOCATION}/functions/processDatasetResume`
    );

    const taskMeta = await buildResumeTaskMeta(fileId, runId);
    await queue.enqueue(
      {
        fileId,
        fileName,
        runId,
        dryRun: options?.dryRun ?? false,
        parserMode: options?.parserMode || 'legacy',
        expectedCheckpoint: taskMeta?.expectedCheckpoint,
      },
      {
        scheduleDelaySeconds: Math.floor(delay / 1000),
        id: taskMeta?.taskId,
      }
    );

    logger.info('Next batch scheduled successfully');
  } catch (error) {
    if (isTaskAlreadyExistsError(error)) {
      logger.info('Next batch already queued (deduped)', {
        fileId,
        runId,
      });
      return;
    }
    logger.error('Failed to schedule next batch', error);
    // Don't throw - processing can be manually resumed
  }
}

async function buildResumeTaskMeta(
  fileId: string,
  runId?: string
): Promise<{
  taskId?: string;
  expectedCheckpoint?: ResumeTaskCheckpoint;
} | undefined> {
  if (!runId) return undefined;
  const checkpoint = await firestoreService.getCheckpoint(fileId);
  if (!checkpoint) return undefined;

  const raw = `${fileId}|${runId}|${checkpoint.batchNumber}|${checkpoint.rowIndex}`;
  const hash = createHash('sha1').update(raw).digest('hex');
  return {
    taskId: `resume-${hash}`,
    expectedCheckpoint: buildResumeTaskCheckpoint(checkpoint),
  };
}

function isTaskAlreadyExistsError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /task-already-exists|already exists|ALREADY_EXISTS/i.test(msg);
}
