/**
 * Structured Logging Utility for Cloud Functions
 * Outputs JSON-formatted logs for Cloud Console visibility
 */

import { LogLevel, LogContext } from '../types/index.js';

interface LogEntry {
  severity: string;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

// Map our log levels to Cloud Logging severity
const SEVERITY_MAP: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
};

class Logger {
  private context: LogContext = {};
  private verboseEnabled: boolean = true;

  /**
   * Set global context that will be included in all log entries
   */
  setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * Clear specific context keys
   */
  clearContext(...keys: string[]): void {
    for (const key of keys) {
      delete this.context[key];
    }
  }

  /**
   * Reset all context
   */
  resetContext(): void {
    this.context = {};
  }

  /**
   * Enable or disable verbose (debug) logging
   */
  setVerbose(enabled: boolean): void {
    this.verboseEnabled = enabled;
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): Logger {
    const childLogger = new Logger();
    childLogger.context = { ...this.context, ...context };
    childLogger.verboseEnabled = this.verboseEnabled;
    return childLogger;
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    // Skip debug logs if verbose is disabled
    if (level === 'debug' && !this.verboseEnabled) {
      return;
    }

    const entry: LogEntry = {
      severity: SEVERITY_MAP[level],
      message,
      timestamp: new Date().toISOString(),
    };

    // Merge contexts
    const mergedContext = { ...this.context, ...context };
    if (Object.keys(mergedContext).length > 0) {
      entry.context = mergedContext;
    }

    // Add error details if present
    if (error) {
      entry.error = {
        message: error.message,
        stack: error.stack,
        code: (error as NodeJS.ErrnoException).code,
      };
    }

    // Output as JSON for Cloud Console structured logging
    console.log(JSON.stringify(entry));
  }

  /**
   * Debug level - detailed information for troubleshooting
   */
  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  /**
   * Info level - general operational information
   */
  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  /**
   * Warning level - potentially harmful situations
   */
  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  /**
   * Error level - error events that might still allow the function to continue
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const err = error instanceof Error ? error : undefined;
    if (error && !(error instanceof Error)) {
      context = { ...context, errorDetails: String(error) };
    }
    this.log('error', message, context, err);
  }

  /**
   * Log the start of a batch processing operation
   */
  logBatchStart(fileId: string, batchNumber: number, rowRange: { start: number; end: number }): void {
    this.info('Starting batch processing', {
      fileId,
      batchNumber,
      rowStart: rowRange.start,
      rowEnd: rowRange.end,
    });
  }

  /**
   * Log the completion of a batch
   */
  logBatchComplete(
    batchNumber: number,
    stats: {
      processed: number;
      skipped: number;
      errors: number;
      durationMs: number;
    }
  ): void {
    this.info('Batch processing complete', {
      batchNumber,
      processedCount: stats.processed,
      skippedCount: stats.skipped,
      errorCount: stats.errors,
      durationMs: stats.durationMs,
    });
  }

  /**
   * Log row processing result
   */
  logRowResult(
    rowIndex: number,
    result: 'processed' | 'skipped' | 'duplicate' | 'invalid' | 'error',
    details?: Record<string, unknown>
  ): void {
    const level = result === 'error' ? 'warn' : 'debug';
    const reason =
      typeof details?.reason === 'string' ? details.reason.trim() : '';
    const message =
      result === 'skipped' && reason
        ? `Row ${rowIndex}: skipped - ${reason}`
        : reason
          ? `Row ${rowIndex}: ${result} [${reason}]`
          : `Row ${rowIndex}: ${result}`;

    this.log(level, message, {
      rowIndex,
      result,
      ...details,
    });
  }

  /**
   * Log GPT API call
   */
  logGPTCall(
    stage: string,
    model: string,
    usage?: { promptTokens: number; completionTokens: number }
  ): void {
    this.debug('GPT API call', {
      stage,
      model,
      promptTokens: usage?.promptTokens,
      completionTokens: usage?.completionTokens,
    });
  }

  /**
   * Log checkpoint save
   */
  logCheckpoint(checkpointData: { rowIndex: number; batchNumber: number; stats: unknown }): void {
    this.info('Checkpoint saved', {
      rowIndex: checkpointData.rowIndex,
      batchNumber: checkpointData.batchNumber,
      stats: checkpointData.stats,
    });
  }

  /**
   * Log processing summary
   */
  logSummary(stats: {
    totalRows: number;
    processed: number;
    skipped: number;
    duplicates: number;
    errors: number;
    newEvents: number;
    updatedEvents: number;
    durationMs: number;
  }): void {
    this.info('Processing summary', {
      ...stats,
      successRate: stats.totalRows > 0
        ? ((stats.processed / stats.totalRows) * 100).toFixed(1) + '%'
        : 'N/A',
    });
  }
}

// Export singleton instance
export const logger = new Logger();

// Export class for creating child loggers
export { Logger };
