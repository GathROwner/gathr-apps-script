/**
 * Batch Manager
 * Handles batch processing state, checkpointing, and resumption
 */

import {
  BatchState,
  CheckpointData,
  ProcessingStats,
  ProcessingConfig,
  DEFAULT_CONFIG,
  EventData,
} from '../types/index.js';
import * as firestoreService from '../services/firestoreService.js';
import { logger } from '../utils/logger.js';
import { isSampledEligibleLunaStage3Post } from '../parsing/lunaSafetyGate.js';

/**
 * Initialize processing stats
 */
export function initializeStats(): ProcessingStats {
  return {
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
    parseSnapshotWrites: 0,
    unknownVenueCount: 0,
    lunaStage3EligibleCount: 0,
    lunaStage1EligibleCount: 0,
    lunaStage1SelectedCount: 0,
    lunaStage3SelectedCount: 0,
  };
}

/**
 * Create a new batch state
 */
export function createBatchState(
  fileId: string,
  fileName: string,
  totalRows: number,
  batchNumber: number = 1,
  runId?: string
): BatchState {
  return {
    fileId,
    fileName,
    runId,
    totalRows,
    processedRows: 0,
    currentRowIndex: 0,
    batchNumber,
    status: 'pending',
    startedAt: new Date(),
    lastUpdatedAt: new Date(),
    stats: initializeStats(),
  };
}

/**
 * Batch Manager class for managing processing state
 */
export class BatchManager {
  private config: ProcessingConfig;
  private state: BatchState;
  private startTime: number;
  private workerId?: string;
  private currentRunEntries: EventData[] = [];

  constructor(
    state: BatchState,
    config?: Partial<ProcessingConfig>,
    workerId?: string
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = state;
    this.startTime = Date.now();
    this.workerId = workerId;
  }

  /**
   * Get current state
   */
  getState(): BatchState {
    return { ...this.state };
  }

  async assertWorkerActive(): Promise<void> {
    if (!this.workerId || !this.state.runId) return;
    await firestoreService.assertProcessingWorkerActive(
      this.state.fileId, this.state.runId, this.workerId
    );
  }

  /**
   * Get current stats
   */
  getStats(): ProcessingStats {
    return { ...this.state.stats };
  }

  /**
   * Get current run entries (for duplicate checking)
   */
  getCurrentRunEntries(): EventData[] {
    return [...this.currentRunEntries];
  }

  /**
   * Add an entry to current run
   */
  addCurrentRunEntry(entry: EventData): void {
    this.currentRunEntries.push(entry);
  }

  /** Called once, only after a regular full-dataset post passes Stage 2. */
  selectEligibleLunaStage3Post(postId: string, percent: number): boolean {
    const eligible = Number(this.state.stats.lunaStage3EligibleCount || 0) + 1;
    const selected = isSampledEligibleLunaStage3Post(this.state.fileId, postId, percent);
    this.state.stats.lunaStage3EligibleCount = eligible;
    if (selected) {
      this.state.stats.lunaStage3SelectedCount =
        Number(this.state.stats.lunaStage3SelectedCount || 0) + 1;
    }
    logger.info('Luna Stage 3 eligible-cohort allocation', {
      fileId: this.state.fileId, postId, eligibleOrdinal: eligible,
      selected, selectedCount: this.state.stats.lunaStage3SelectedCount || 0,
      percent,
    });
    return selected;
  }

  recordStage1PilotAllocation(selected: boolean): void {
    this.state.stats.lunaStage1EligibleCount = Number(this.state.stats.lunaStage1EligibleCount || 0) + 1;
    if (selected) this.state.stats.lunaStage1SelectedCount = Number(this.state.stats.lunaStage1SelectedCount || 0) + 1;
  }

  /**
   * Update state with new values
   */
  updateState(updates: Partial<BatchState>): void {
    this.state = {
      ...this.state,
      ...updates,
      lastUpdatedAt: new Date(),
    };
  }

  /**
   * Update stats
   */
  updateStats(updates: Partial<ProcessingStats>): void {
    this.state.stats = {
      ...this.state.stats,
      ...updates,
    };
  }

  /**
   * Increment a stat counter
   */
  incrementStat(stat: keyof ProcessingStats): void {
    (this.state.stats[stat] as number)++;
  }

  /**
   * Mark current row as processed
   */
  markRowProcessed(rowIndex: number): void {
    this.state.currentRowIndex = rowIndex + 1;
    this.state.processedRows++;
    this.incrementStat('processedCount');
  }

  /**
   * Mark current row as skipped
   */
  markRowSkipped(rowIndex: number, reason?: string): void {
    this.state.currentRowIndex = rowIndex + 1;
    this.incrementStat('skippedCount');
    logger.logRowResult(rowIndex, 'skipped', { reason });
  }

  /**
   * Mark current row as invalid
   */
  markRowInvalid(rowIndex: number, reason?: string): void {
    this.state.currentRowIndex = rowIndex + 1;
    this.incrementStat('invalidCount');
    logger.logRowResult(rowIndex, 'invalid', { reason });
  }

  /**
   * Mark current row as duplicate
   */
  markRowDuplicate(rowIndex: number, matchedEventId?: string): void {
    this.state.currentRowIndex = rowIndex + 1;
    this.incrementStat('duplicateCount');
    logger.logRowResult(rowIndex, 'duplicate', { matchedEventId });
  }

  /**
   * Mark current row as error
   */
  markRowError(rowIndex: number, error: Error | string): void {
    this.state.currentRowIndex = rowIndex + 1;
    this.incrementStat('errorCount');
    logger.logRowResult(rowIndex, 'error', {
      error: error instanceof Error ? error.message : error,
    });
  }

  /**
   * Increment new events counter
   */
  incrementNewEvents(count: number = 1): void {
    this.state.stats.newEventsCreated += count;
  }

  /**
   * Increment updated events counter
   */
  incrementUpdatedEvents(count: number = 1): void {
    this.state.stats.existingEventsUpdated += count;
  }

  /**
   * Record a successfully persisted per-row parse snapshot. This is an exact
   * parser-side write count, not a Cloud Billing total (which also includes
   * reads, indexes, and writes performed by other services).
   */
  incrementParseSnapshotWrites(count: number = 1): void {
    this.state.stats.parseSnapshotWrites += count;
  }

  /**
   * Increment new standard events counter
   */
  incrementNewStandardEvents(count: number = 1): void {
    this.state.stats.newStandardEventsCreated += count;
  }

  /**
   * Increment updated standard events counter
   */
  incrementUpdatedStandardEvents(count: number = 1): void {
    this.state.stats.existingStandardEventsUpdated += count;
  }

  /**
   * Increment new food specials counter
   */
  incrementNewFoodSpecials(count: number = 1): void {
    this.state.stats.newFoodSpecialsCreated += count;
  }

  /**
   * Increment updated food specials counter
   */
  incrementUpdatedFoodSpecials(count: number = 1): void {
    this.state.stats.existingFoodSpecialsUpdated += count;
  }

  /**
   * Increment unknown venue review counter
   */
  incrementUnknownVenues(count: number = 1): void {
    this.state.stats.unknownVenueCount = (this.state.stats.unknownVenueCount || 0) + count;
  }

  /**
   * Check if we should continue processing or pause
   */
  shouldContinue(): boolean {
    const elapsed = Date.now() - this.startTime;
    return elapsed < this.config.maxExecutionMs;
  }

  /**
   * Check if current batch is complete
   */
  isBatchComplete(): boolean {
    const processedInBatch = this.state.processedRows % this.config.batchSize;
    return processedInBatch >= this.config.batchSize;
  }

  /**
   * Get time remaining before pause
   */
  getTimeRemaining(): number {
    return Math.max(0, this.config.maxExecutionMs - (Date.now() - this.startTime));
  }

  /**
   * Get elapsed time
   */
  getElapsedTime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Calculate rows to process in this execution
   */
  getRowsForThisExecution(totalRows: number, startIndex: number): number {
    const remainingRows = totalRows - startIndex;
    const maxByTime = Math.floor(this.getTimeRemaining() / 1000); // rough estimate
    return Math.min(remainingRows, this.config.batchSize, maxByTime);
  }

  /**
   * Save checkpoint to Firestore
   */
  async saveCheckpoint(): Promise<void> {
    const checkpoint: CheckpointData = {
      fileId: this.state.fileId,
      runId: this.state.runId,
      rowIndex: this.state.currentRowIndex,
      batchNumber: this.state.batchNumber,
      stats: this.state.stats,
      currentRunEntries: this.currentRunEntries,
      timestamp: new Date(),
    };

    await firestoreService.saveCheckpoint(checkpoint, this.workerId);
  }

  /**
   * Save batch state to Firestore
   */
  async saveBatchState(): Promise<void> {
    await firestoreService.saveBatchState(this.state);
  }

  /**
   * Advance the lightweight public-feed marker once for this execution when
   * rows actually created or updated events. A marker write is much smaller
   * than making every active device download the full feed on its next poll.
   */
  private async publishEventFeedChangeIfNeeded(): Promise<void> {
    if (this.config.dryRun) return;

    const created = Math.max(
      this.state.stats.newEventsCreated,
      this.state.stats.newStandardEventsCreated + this.state.stats.newFoodSpecialsCreated
    );
    const updated = Math.max(
      this.state.stats.existingEventsUpdated,
      this.state.stats.existingStandardEventsUpdated + this.state.stats.existingFoodSpecialsUpdated
    );

    if (created + updated === 0) return;

    try {
      await firestoreService.publishEventFeedChange({
        fileId: this.state.fileId,
        runId: this.state.runId,
        batchNumber: this.state.batchNumber,
        created,
        updated,
      });
    } catch (error) {
      // The parser's durable event writes are already complete. Keep a
      // temporary feed-marker failure observable without failing the batch.
      logger.warn('Unable to publish public event feed change marker', {
        fileId: this.state.fileId,
        batchNumber: this.state.batchNumber,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Mark processing as paused
   */
  async pause(): Promise<void> {
    this.state.status = 'paused';
    await this.saveCheckpoint();
    await this.saveBatchState();
    await this.publishEventFeedChangeIfNeeded();

    logger.info('Processing paused', {
      fileId: this.state.fileId,
      rowIndex: this.state.currentRowIndex,
      batchNumber: this.state.batchNumber,
      elapsedMs: this.getElapsedTime(),
    });
  }

  /**
   * Mark processing as completed
   */
  async complete(): Promise<void> {
    this.state.status = 'completed';
    await this.saveBatchState();

    // Mark dataset as processed
    await firestoreService.markDatasetProcessed(
      this.state.fileId,
      this.state.fileName,
      this.state.stats
    );
    await firestoreService.deleteCheckpoint(this.state.fileId, this.state.runId,
      this.workerId);
    await this.publishEventFeedChangeIfNeeded();

    logger.logSummary({
      totalRows: this.state.totalRows,
      processed: this.state.stats.processedCount,
      skipped: this.state.stats.skippedCount,
      duplicates: this.state.stats.duplicateCount,
      errors: this.state.stats.errorCount,
      newEvents: this.state.stats.newEventsCreated,
      updatedEvents: this.state.stats.existingEventsUpdated,
      parseSnapshotWrites: this.state.stats.parseSnapshotWrites,
      newStandardEvents: this.state.stats.newStandardEventsCreated,
      updatedStandardEvents: this.state.stats.existingStandardEventsUpdated,
      newFoodSpecials: this.state.stats.newFoodSpecialsCreated,
      updatedFoodSpecials: this.state.stats.existingFoodSpecialsUpdated,
      durationMs: this.getElapsedTime(),
    });
  }

  /**
   * Mark processing as failed
   */
  async fail(error: Error | string): Promise<void> {
    this.state.status = 'failed';
    this.state.error = error instanceof Error ? error.message : error;
    await this.saveBatchState();

    logger.error('Processing failed', error instanceof Error ? error : undefined, {
      fileId: this.state.fileId,
      rowIndex: this.state.currentRowIndex,
    });
  }

  /**
   * Start processing (update status)
   */
  async start(): Promise<void> {
    this.state.status = 'processing';
    this.startTime = Date.now();
    await this.saveBatchState();

    logger.logBatchStart(this.state.fileId, this.state.batchNumber, {
      start: this.state.currentRowIndex,
      end: Math.min(
        this.state.currentRowIndex + this.config.batchSize,
        this.state.totalRows
      ),
    });
  }

  /**
   * Log batch completion
   */
  logBatchComplete(): void {
    logger.logBatchComplete(this.state.batchNumber, {
      processed: this.state.stats.processedCount,
      skipped: this.state.stats.skippedCount,
      errors: this.state.stats.errorCount,
      durationMs: this.getElapsedTime(),
    });
  }
}

/**
 * Load or create batch manager for a file
 */
export async function loadOrCreateBatchManager(
  fileId: string,
  fileName: string,
  totalRows: number,
  resumeFromCheckpoint: boolean = true,
  config?: Partial<ProcessingConfig>,
  runId?: string,
  workerId?: string
): Promise<BatchManager> {
  if (resumeFromCheckpoint) {
    // Try to load existing checkpoint
    const checkpoint = await firestoreService.getCheckpoint(fileId);

    if (checkpoint) {
      logger.info('Resuming from checkpoint', {
        fileId,
        rowIndex: checkpoint.rowIndex,
        batchNumber: checkpoint.batchNumber,
      });

      const state = createBatchState(
        fileId,
        fileName,
        totalRows,
        checkpoint.batchNumber,
        runId || checkpoint.runId
      );
      state.currentRowIndex = checkpoint.rowIndex;
      state.processedRows = checkpoint.rowIndex;
      state.stats = checkpoint.stats;

      const manager = new BatchManager(state, config, workerId);

      // Restore current run entries
      for (const entry of checkpoint.currentRunEntries) {
        manager.addCurrentRunEntry(entry);
      }

      return manager;
    }
  }

  // Create new batch manager
  const state = createBatchState(fileId, fileName, totalRows, 1, runId);
  return new BatchManager(state, config, workerId);
}

/**
 * Calculate delay for next batch
 */
export function getNextBatchDelay(config?: Partial<ProcessingConfig>): number {
  return config?.pauseBetweenBatchesMs || DEFAULT_CONFIG.pauseBetweenBatchesMs;
}
