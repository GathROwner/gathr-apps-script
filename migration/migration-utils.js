/**
 * migration-utils.js
 *
 * Utility functions for the venue migration process including:
 * - Checkpoint management (save/load progress)
 * - Logging utilities
 * - Rate limiting helpers
 * - Error handling
 */

const fs = require('fs');
const path = require('path');

// Default checkpoint file location
const DEFAULT_CHECKPOINT_FILE = path.join(__dirname, 'migration-checkpoint.json');

// Default failed rows file location
const DEFAULT_FAILED_ROWS_FILE = path.join(__dirname, 'migration-failed-rows.json');

/**
 * Checkpoint data structure
 * @typedef {Object} Checkpoint
 * @property {number} lastProcessedRow - Last successfully processed row index
 * @property {number} totalRows - Total rows in the sheet
 * @property {number} successCount - Number of successful writes
 * @property {number} failCount - Number of failed writes
 * @property {number} skipCount - Number of skipped rows
 * @property {string} startedAt - ISO timestamp when migration started
 * @property {string} lastUpdatedAt - ISO timestamp of last checkpoint update
 * @property {string} status - 'running', 'completed', 'failed', 'paused'
 * @property {string[]} processedVenueIds - Array of venue IDs already processed
 */

/**
 * Creates a new checkpoint object
 * @param {number} totalRows - Total rows to process
 * @returns {Checkpoint}
 */
function createCheckpoint(totalRows) {
  return {
    lastProcessedRow: 0,
    totalRows,
    successCount: 0,
    failCount: 0,
    skipCount: 0,
    startedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    status: 'running',
    processedVenueIds: [],
  };
}

/**
 * Saves checkpoint to file
 * @param {Checkpoint} checkpoint - Checkpoint data to save
 * @param {string} [filePath] - Optional custom file path
 */
function saveCheckpoint(checkpoint, filePath = DEFAULT_CHECKPOINT_FILE) {
  checkpoint.lastUpdatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(checkpoint, null, 2), 'utf8');
}

/**
 * Loads checkpoint from file
 * @param {string} [filePath] - Optional custom file path
 * @returns {Checkpoint|null} Checkpoint data or null if not found
 */
function loadCheckpoint(filePath = DEFAULT_CHECKPOINT_FILE) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error(`Error loading checkpoint: ${error.message}`);
  }
  return null;
}

/**
 * Deletes checkpoint file (call after successful completion)
 * @param {string} [filePath] - Optional custom file path
 */
function clearCheckpoint(filePath = DEFAULT_CHECKPOINT_FILE) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error(`Error clearing checkpoint: ${error.message}`);
  }
}

/**
 * Failed row record
 * @typedef {Object} FailedRow
 * @property {number} rowIndex - Row index in the sheet
 * @property {string} venueName - Venue name if available
 * @property {string[]} errors - List of error messages
 * @property {string} timestamp - ISO timestamp
 */

/**
 * Saves a failed row to the failed rows log
 * @param {FailedRow} failedRow - Failed row data
 * @param {string} [filePath] - Optional custom file path
 */
function logFailedRow(failedRow, filePath = DEFAULT_FAILED_ROWS_FILE) {
  let failedRows = [];
  try {
    if (fs.existsSync(filePath)) {
      failedRows = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (error) {
    // Start fresh if file is corrupted
    failedRows = [];
  }

  failedRows.push({
    ...failedRow,
    timestamp: new Date().toISOString(),
  });

  fs.writeFileSync(filePath, JSON.stringify(failedRows, null, 2), 'utf8');
}

/**
 * Loads all failed rows
 * @param {string} [filePath] - Optional custom file path
 * @returns {FailedRow[]}
 */
function loadFailedRows(filePath = DEFAULT_FAILED_ROWS_FILE) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (error) {
    console.error(`Error loading failed rows: ${error.message}`);
  }
  return [];
}

/**
 * Clears the failed rows file
 * @param {string} [filePath] - Optional custom file path
 */
function clearFailedRows(filePath = DEFAULT_FAILED_ROWS_FILE) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error(`Error clearing failed rows: ${error.message}`);
  }
}

/**
 * Sleep utility for rate limiting
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry wrapper with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in ms (will be multiplied by attempt number)
 * @returns {Promise<any>} Result of the function
 */
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(`  Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

/**
 * Splits an array into chunks of specified size
 * @param {any[]} array - Array to chunk
 * @param {number} size - Chunk size
 * @returns {any[][]} Array of chunks
 */
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Formats a duration in milliseconds to human-readable string
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Progress logger with rate calculation
 */
class ProgressLogger {
  constructor(total) {
    this.total = total;
    this.current = 0;
    this.startTime = Date.now();
    this.lastLogTime = Date.now();
    this.lastLogCount = 0;
  }

  /**
   * Updates progress and logs if appropriate
   * @param {number} processed - Number processed in this update
   * @param {string} [message] - Optional message to include
   */
  update(processed, message = '') {
    this.current += processed;
    const now = Date.now();

    // Log every 5 seconds or every 100 items, whichever comes first
    if (now - this.lastLogTime >= 5000 || this.current - this.lastLogCount >= 100) {
      this.log(message);
      this.lastLogTime = now;
      this.lastLogCount = this.current;
    }
  }

  /**
   * Forces a log output
   * @param {string} [message] - Optional message to include
   */
  log(message = '') {
    const elapsed = Date.now() - this.startTime;
    const rate = this.current / (elapsed / 1000);
    const remaining = this.total - this.current;
    const eta = remaining > 0 && rate > 0 ? remaining / rate : 0;

    const percent = ((this.current / this.total) * 100).toFixed(1);
    const rateStr = rate.toFixed(1);
    const etaStr = formatDuration(eta * 1000);

    console.log(
      `[Progress] ${this.current}/${this.total} (${percent}%) | ` +
      `Rate: ${rateStr}/s | ETA: ${etaStr}${message ? ` | ${message}` : ''}`
    );
  }

  /**
   * Logs final summary
   * @param {number} success - Successful count
   * @param {number} failed - Failed count
   * @param {number} skipped - Skipped count
   */
  complete(success, failed, skipped) {
    const elapsed = Date.now() - this.startTime;
    console.log('\n========================================');
    console.log('Migration Complete');
    console.log('========================================');
    console.log(`Total processed: ${this.current}`);
    console.log(`  - Successful: ${success}`);
    console.log(`  - Failed: ${failed}`);
    console.log(`  - Skipped: ${skipped}`);
    console.log(`Duration: ${formatDuration(elapsed)}`);
    console.log(`Average rate: ${(this.current / (elapsed / 1000)).toFixed(2)}/s`);
    console.log('========================================\n');
  }
}

/**
 * Simple logger with timestamp
 */
const logger = {
  info: (message) => {
    console.log(`[${new Date().toISOString()}] INFO: ${message}`);
  },
  warn: (message) => {
    console.warn(`[${new Date().toISOString()}] WARN: ${message}`);
  },
  error: (message, error) => {
    console.error(`[${new Date().toISOString()}] ERROR: ${message}`);
    if (error && error.stack) {
      console.error(error.stack);
    }
  },
  debug: (message) => {
    if (process.env.DEBUG === 'true') {
      console.log(`[${new Date().toISOString()}] DEBUG: ${message}`);
    }
  },
};

module.exports = {
  createCheckpoint,
  saveCheckpoint,
  loadCheckpoint,
  clearCheckpoint,
  logFailedRow,
  loadFailedRows,
  clearFailedRows,
  sleep,
  retryWithBackoff,
  chunkArray,
  formatDuration,
  ProgressLogger,
  logger,
  DEFAULT_CHECKPOINT_FILE,
  DEFAULT_FAILED_ROWS_FILE,
};
