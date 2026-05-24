/**
 * File Processor
 * Main orchestration for processing Apify dataset files
 */

import {
  ProcessingConfig,
  DEFAULT_CONFIG,
  ProcessDatasetResponse,
  RawRowData,
} from '../types/index.js';
import * as driveService from '../services/driveService.js';
import * as firestoreService from '../services/firestoreService.js';
import { logger } from '../utils/logger.js';
import {
  BatchManager,
  loadOrCreateBatchManager,
  getNextBatchDelay,
  createBatchState,
} from './batchManager.js';
import { processRow, validateRowData } from './rowProcessor.js';

/**
 * Main file processing function
 */
export async function processDatasetFile(
  fileId: string,
  options?: {
    fileName?: string;
    resumeFromCheckpoint?: boolean;
    dryRun?: boolean;
    config?: Partial<ProcessingConfig>;
    rowIndexes?: number[];
    mediaOverrideUrl?: string;
    runId?: string;
  }
): Promise<ProcessDatasetResponse> {
  const config: ProcessingConfig = {
    ...DEFAULT_CONFIG,
    ...options?.config,
    dryRun: options?.dryRun ?? false,
  };

  // Set up logger context
  logger.setContext({ functionName: 'processDatasetFile', fileId });

  try {
    // Check if already processed
    const isProcessed = await firestoreService.isDatasetProcessed(fileId);
    const hasRowSelection = Boolean(options?.rowIndexes && options.rowIndexes.length > 0);
    if (isProcessed && !hasRowSelection) {
      logger.info('File already processed', { fileId });
      return {
        success: true,
        message: 'File already processed',
      };
    }

    // Download and parse the file
    logger.info('Starting file processing', { fileId, dryRun: config.dryRun });

    const { rows, totalRows, fileName } = await driveService.downloadAndParseDataset(fileId);

    if (rows.length === 0) {
      logger.warn('No valid rows found in file', { fileId, totalRows });
      return {
        success: true,
        message: 'No valid rows to process',
        stats: {
          processedCount: 0,
          skippedCount: 0,
          invalidCount: totalRows,
          duplicateCount: 0,
          errorCount: 0,
          newEventsCreated: 0,
          existingEventsUpdated: 0,
          newStandardEventsCreated: 0,
          existingStandardEventsUpdated: 0,
          newFoodSpecialsCreated: 0,
          existingFoodSpecialsUpdated: 0,
        },
      };
    }

    if (options?.rowIndexes && options.rowIndexes.length > 0) {
      logger.info('Processing selected rows override', {
        rowIndexes: options.rowIndexes,
        dryRun: config.dryRun,
      });
      return processSelectedRows(
        rows,
        fileId,
        options?.fileName || fileName,
        options.rowIndexes,
        config,
        options.mediaOverrideUrl,
        options.runId
      );
    }

    // Load or create batch manager
    const batchManager = await loadOrCreateBatchManager(
      fileId,
      options?.fileName || fileName,
      rows.length,
      options?.resumeFromCheckpoint ?? true,
      config,
      options?.runId
    );

    // Start processing
    await batchManager.start();

    // Process rows
    const result = await processRows(rows, batchManager, config);

    return result;
  } catch (error) {
    logger.error('File processing failed', error);
    return {
      success: false,
      message: 'Processing failed',
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    logger.clearContext('functionName', 'fileId');
  }
}

/**
 * Process rows with batch management
 */
async function processRows(
  rows: RawRowData[],
  batchManager: BatchManager,
  config: ProcessingConfig
): Promise<ProcessDatasetResponse> {
  const state = batchManager.getState();
  let startIndex = state.currentRowIndex;

  logger.info('Processing rows', {
    startIndex,
    totalRows: rows.length,
    batchSize: config.batchSize,
  });

  let validRowsInBatch = 0;

  for (let i = startIndex; i < rows.length; i++) {
    // Check if we should continue
    if (!batchManager.shouldContinue()) {
      logger.info('Approaching execution limit, pausing', {
        timeRemaining: batchManager.getTimeRemaining(),
        rowIndex: i,
      });

      await batchManager.pause();

      return {
        success: true,
        message: 'Processing paused, will resume',
        batchId: `${state.fileId}_${state.batchNumber}`,
        stats: batchManager.getStats(),
        nextBatchScheduled: true,
      };
    }

    logger.info(`Starting processing row ${i}`, {
      rowIndex: i,
      batchNumber: state.batchNumber,
      totalRows: rows.length,
    });

    const row = rows[i];

    // Validate row
    const validation = validateRowData(row);
    if (!validation.isValid) {
      batchManager.markRowInvalid(i, validation.errors.join(', '));
      continue;
    }

    // Process the row
    const shouldParseInDryRun = config.dryRun && config.parserMode === 'full5stage';
    if (!config.dryRun || shouldParseInDryRun) {
      await processRow(row, i, batchManager, config);
    } else {
      // Dry run - just log what would happen
      logger.debug('Dry run: would process row', { rowIndex: i });
      batchManager.markRowProcessed(i);
    }

    validRowsInBatch++;

    // Check batch completion
    if (validRowsInBatch >= config.batchSize) {
      batchManager.logBatchComplete();

      // Check if there are more rows
      if (i < rows.length - 1) {
        // Pause for next batch
        logger.info('Batch complete, pausing before next batch', {
          processedInBatch: validRowsInBatch,
          nextRowIndex: i + 1,
        });

        await batchManager.pause();

        return {
          success: true,
          message: 'Batch complete, will resume',
          batchId: `${state.fileId}_${state.batchNumber}`,
          stats: batchManager.getStats(),
          nextBatchScheduled: true,
        };
      }
    }
  }

  // Processing complete
  await batchManager.complete();

  return {
    success: true,
    message: 'Processing complete',
    stats: batchManager.getStats(),
    nextBatchScheduled: false,
  };
}

async function processSelectedRows(
  rows: RawRowData[],
  fileId: string,
  fileName: string,
  rowIndexes: number[],
  config: ProcessingConfig,
  mediaOverrideUrl?: string,
  runId?: string
): Promise<ProcessDatasetResponse> {
  const uniqueIndexes = Array.from(
    new Set(rowIndexes.map((value) => Math.floor(value)))
  )
    .filter((value) => Number.isFinite(value) && value >= 0 && value < rows.length)
    .sort((a, b) => a - b);

  if (uniqueIndexes.length === 0) {
    return {
      success: true,
      message: 'No valid row indexes provided',
      stats: {
        processedCount: 0,
        skippedCount: 0,
        invalidCount: 0,
        duplicateCount: 0,
        errorCount: 0,
        newEventsCreated: 0,
        existingEventsUpdated: 0,
        newStandardEventsCreated: 0,
        existingStandardEventsUpdated: 0,
        newFoodSpecialsCreated: 0,
        existingFoodSpecialsUpdated: 0,
      },
      nextBatchScheduled: false,
    };
  }

  const state = createBatchState(fileId, fileName, rows.length, 1, runId);
  const batchManager = new BatchManager(state, config);

  logger.info('Processing selected rows', {
    fileId,
    totalRows: rows.length,
    selectedCount: uniqueIndexes.length,
    selectedRows: uniqueIndexes,
  });

  for (const rowIndex of uniqueIndexes) {
    logger.info(`Starting processing row ${rowIndex}`, {
      rowIndex,
      batchNumber: state.batchNumber,
      totalRows: rows.length,
      selectedRowsMode: true,
    });

    const row = rows[rowIndex];
    if (!row) {
      batchManager.markRowInvalid(rowIndex, 'Row not found');
      continue;
    }
    if (mediaOverrideUrl) {
      row.mediaUrls = [mediaOverrideUrl];
      row.sharedPostThumbnails = [];
    }

    const validation = validateRowData(row);
    if (!validation.isValid) {
      batchManager.markRowInvalid(rowIndex, validation.errors.join(', '));
      continue;
    }

    const shouldParseInDryRun = config.dryRun && config.parserMode === 'full5stage';
    if (!config.dryRun || shouldParseInDryRun) {
      await processRow(row, rowIndex, batchManager, config);
    } else {
      logger.debug('Dry run: would process row', { rowIndex });
      batchManager.markRowProcessed(rowIndex);
    }
  }

  return {
    success: true,
    message: 'Selected rows processed',
    stats: batchManager.getStats(),
    nextBatchScheduled: false,
  };
}

/**
 * Find and process new Apify dataset files
 */
export async function findAndProcessNewFiles(
  config?: Partial<ProcessingConfig>
): Promise<{
  filesFound: number;
  filesProcessed: number;
  fileIds: string[];
}> {
  // Get list of processed file IDs
  const processedIds = await firestoreService.getProcessedDatasetIds();

  // Find new files
  const newFiles = await driveService.findNewApifyDatasetFiles(processedIds);

  logger.info('Found new dataset files', { count: newFiles.length });

  if (newFiles.length === 0) {
    return {
      filesFound: 0,
      filesProcessed: 0,
      fileIds: [],
    };
  }

  // Process the first file (one at a time to manage execution time)
  const firstFile = newFiles[0];
  if (firstFile.id) {
    const result = await processDatasetFile(firstFile.id, {
      fileName: firstFile.name || undefined,
      config,
    });

    return {
      filesFound: newFiles.length,
      filesProcessed: result.success ? 1 : 0,
      fileIds: [firstFile.id],
    };
  }

  return {
    filesFound: newFiles.length,
    filesProcessed: 0,
    fileIds: [],
  };
}

/**
 * Resume processing for a paused file
 */
export async function resumeProcessing(
  fileId: string,
  options?: {
    dryRun?: boolean;
    config?: Partial<ProcessingConfig>;
  }
): Promise<ProcessDatasetResponse> {
  logger.info('Resuming processing', { fileId });

  return processDatasetFile(fileId, {
    resumeFromCheckpoint: true,
    dryRun: options?.dryRun ?? false,
    config: options?.config,
  });
}

/**
 * Get the delay before the next batch should be processed
 */
export function getNextBatchDelayMs(config?: Partial<ProcessingConfig>): number {
  return getNextBatchDelay(config);
}

/**
 * Check processing status for a file
 */
export async function getProcessingStatus(
  fileId: string
): Promise<{
  status: 'not_started' | 'pending' | 'processing' | 'paused' | 'completed' | 'failed';
  stats?: ReturnType<BatchManager['getStats']>;
  rowIndex?: number;
  totalRows?: number;
}> {
  // Check if completed
  const isProcessed = await firestoreService.isDatasetProcessed(fileId);
  if (isProcessed) {
    return { status: 'completed' };
  }

  // Check for checkpoint
  const checkpoint = await firestoreService.getCheckpoint(fileId);
  if (checkpoint) {
    return {
      status: 'paused',
      stats: checkpoint.stats,
      rowIndex: checkpoint.rowIndex,
    };
  }

  // Check batch state
  const batchState = await firestoreService.getBatchState(fileId);
  if (batchState) {
    return {
      status: batchState.status,
      stats: batchState.stats,
      rowIndex: batchState.currentRowIndex,
      totalRows: batchState.totalRows,
    };
  }

  return { status: 'not_started' };
}
