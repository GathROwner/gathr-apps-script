/**
 * migrate-venues.js
 *
 * Main migration script to transfer venue data from Google Sheets "Contact Info"
 * to Firestore "venues" collection.
 *
 * Usage:
 *   node migrate-venues.js           # Run full migration
 *   node migrate-venues.js --resume  # Resume from checkpoint
 *   node migrate-venues.js --dry-run # Validate without writing to Firestore
 *
 * Requirements:
 *   - Service account JSON file at ../firebase/service-account.json
 *   - Environment variables in .env file (see .env.example)
 */

require('dotenv').config();

const { google } = require('googleapis');
const admin = require('firebase-admin');
const path = require('path');

const {
  transformRowToDocument,
  rowArrayToObject,
} = require('./venue-field-mapping');

const {
  createCheckpoint,
  saveCheckpoint,
  loadCheckpoint,
  clearCheckpoint,
  logFailedRow,
  clearFailedRows,
  sleep,
  retryWithBackoff,
  chunkArray,
  ProgressLogger,
  logger,
} = require('./migration-utils');

// Configuration
const CONFIG = {
  // Google Sheets
  SPREADSHEET_ID: process.env.SPREADSHEET_ID || '1w0h7TjgP551ZJ5qkb1yU6eRQVlqc6SjTDVGHDZ1qFCQ',
  SHEET_NAME: process.env.SHEET_NAME || 'Contact Info',

  // Firebase
  SERVICE_ACCOUNT_PATH: process.env.SERVICE_ACCOUNT_PATH || path.join(__dirname, '..', 'firebase', 'service-account.json'),
  FIRESTORE_COLLECTION: process.env.FIRESTORE_COLLECTION || 'venues',

  // Migration settings
  BATCH_SIZE: parseInt(process.env.BATCH_SIZE, 10) || 500, // Firestore max is 500
  RATE_LIMIT_DELAY_MS: parseInt(process.env.RATE_LIMIT_DELAY_MS, 10) || 100, // Delay between batches
  CHECKPOINT_INTERVAL: parseInt(process.env.CHECKPOINT_INTERVAL, 10) || 50, // Save checkpoint every N rows

  // Retry settings
  MAX_RETRIES: parseInt(process.env.MAX_RETRIES, 10) || 3,
  RETRY_BASE_DELAY_MS: parseInt(process.env.RETRY_BASE_DELAY_MS, 10) || 1000,
};

// Global state
let db = null;
let sheetsApi = null;

/**
 * Initializes Firebase Admin SDK
 */
async function initializeFirebase() {
  logger.info('Initializing Firebase Admin SDK...');

  const serviceAccount = require(CONFIG.SERVICE_ACCOUNT_PATH);

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  db = admin.firestore();
  logger.info(`Firebase initialized for project: ${serviceAccount.project_id}`);
}

/**
 * Initializes Google Sheets API using service account
 */
async function initializeGoogleSheets() {
  logger.info('Initializing Google Sheets API...');

  const serviceAccount = require(CONFIG.SERVICE_ACCOUNT_PATH);

  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const authClient = await auth.getClient();
  sheetsApi = google.sheets({ version: 'v4', auth: authClient });

  logger.info('Google Sheets API initialized');
}

/**
 * Fetches all data from the Contact Info sheet
 * @returns {Promise<{headers: string[], rows: any[][]}>}
 */
async function fetchSheetData() {
  logger.info(`Fetching data from spreadsheet: ${CONFIG.SPREADSHEET_ID}`);
  logger.info(`Sheet name: ${CONFIG.SHEET_NAME}`);

  const response = await retryWithBackoff(
    async () => {
      return sheetsApi.spreadsheets.values.get({
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        range: CONFIG.SHEET_NAME,
      });
    },
    CONFIG.MAX_RETRIES,
    CONFIG.RETRY_BASE_DELAY_MS
  );

  const values = response.data.values;
  if (!values || values.length === 0) {
    throw new Error('No data found in sheet');
  }

  const headers = values[0];
  const rows = values.slice(1);

  logger.info(`Fetched ${rows.length} data rows with ${headers.length} columns`);
  logger.info(`Columns: ${headers.join(', ')}`);

  return { headers, rows };
}

/**
 * Writes a batch of venue documents to Firestore
 * @param {Array<{venueId: string, document: Object}>} venues - Venues to write
 * @param {boolean} dryRun - If true, skip actual writes
 * @returns {Promise<{success: number, failed: number}>}
 */
async function writeBatchToFirestore(venues, dryRun = false) {
  if (dryRun) {
    logger.debug(`[DRY RUN] Would write ${venues.length} venues`);
    return { success: venues.length, failed: 0 };
  }

  const batch = db.batch();
  const now = admin.firestore.FieldValue.serverTimestamp();

  for (const { venueId, document } of venues) {
    const docRef = db.collection(CONFIG.FIRESTORE_COLLECTION).doc(venueId);

    // Add metadata fields
    const docWithMeta = {
      ...document,
      createdAt: now,
      updatedAt: now,
      sourceSheet: CONFIG.SHEET_NAME,
      importedAt: now,
    };

    batch.set(docRef, docWithMeta, { merge: true });
  }

  await retryWithBackoff(
    async () => batch.commit(),
    CONFIG.MAX_RETRIES,
    CONFIG.RETRY_BASE_DELAY_MS
  );

  return { success: venues.length, failed: 0 };
}

/**
 * Main migration function
 * @param {Object} options - Migration options
 * @param {boolean} options.resume - Resume from checkpoint
 * @param {boolean} options.dryRun - Validate without writing
 */
async function runMigration(options = {}) {
  const { resume = false, dryRun = false } = options;

  logger.info('========================================');
  logger.info('Starting Venue Migration');
  logger.info(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  logger.info(`Resume: ${resume}`);
  logger.info('========================================\n');

  // Initialize services
  await initializeFirebase();
  await initializeGoogleSheets();

  // Fetch sheet data
  const { headers, rows } = await fetchSheetData();
  const totalRows = rows.length;

  // Load or create checkpoint
  let checkpoint;
  if (resume) {
    checkpoint = loadCheckpoint();
    if (checkpoint) {
      logger.info(`Resuming from row ${checkpoint.lastProcessedRow + 1}`);
      logger.info(`Previous progress: ${checkpoint.successCount} success, ${checkpoint.failCount} failed, ${checkpoint.skipCount} skipped`);
    } else {
      logger.warn('No checkpoint found, starting fresh');
      checkpoint = createCheckpoint(totalRows);
      clearFailedRows();
    }
  } else {
    checkpoint = createCheckpoint(totalRows);
    clearFailedRows();
  }

  // Track processed venue IDs to detect duplicates
  const processedIds = new Set(checkpoint.processedVenueIds || []);

  // Progress tracking
  const progress = new ProgressLogger(totalRows);
  progress.current = checkpoint.lastProcessedRow;

  // Batch collection
  let currentBatch = [];
  let rowsSinceCheckpoint = 0;

  // Process rows
  const startRow = checkpoint.lastProcessedRow;
  for (let i = startRow; i < totalRows; i++) {
    const row = rows[i];
    const rowIndex = i + 2; // Sheet row number (1-indexed + header)

    try {
      // Convert row array to object
      const rowData = rowArrayToObject(row, headers);

      // Skip empty rows
      const hasData = Object.values(rowData).some(v => v !== null && v !== undefined && v !== '');
      if (!hasData) {
        checkpoint.skipCount++;
        checkpoint.lastProcessedRow = i + 1;
        rowsSinceCheckpoint++;
        progress.update(1, `Row ${rowIndex}: Empty, skipped`);
        continue;
      }

      // Transform to Firestore document
      const result = transformRowToDocument(rowData, rowIndex);

      if (!result.isValid) {
        // Log validation errors
        logger.warn(`Row ${rowIndex}: Validation failed - ${result.errors.join('; ')}`);
        logFailedRow({
          rowIndex,
          venueName: rowData.Pagename || rowData.Title || 'Unknown',
          errors: result.errors,
        });
        checkpoint.failCount++;
        checkpoint.lastProcessedRow = i + 1;
        rowsSinceCheckpoint++;
        progress.update(1);
        continue;
      }

      // Check for duplicate venue ID
      if (processedIds.has(result.venueId)) {
        logger.debug(`Row ${rowIndex}: Duplicate venueId ${result.venueId}, skipping`);
        checkpoint.skipCount++;
        checkpoint.lastProcessedRow = i + 1;
        rowsSinceCheckpoint++;
        progress.update(1);
        continue;
      }

      // Add to batch
      currentBatch.push({
        venueId: result.venueId,
        document: result.document,
        rowIndex,
      });
      processedIds.add(result.venueId);

      // Write batch when full
      if (currentBatch.length >= CONFIG.BATCH_SIZE) {
        await writeBatchToFirestore(
          currentBatch.map(({ venueId, document }) => ({ venueId, document })),
          dryRun
        );

        checkpoint.successCount += currentBatch.length;
        checkpoint.lastProcessedRow = i + 1;
        checkpoint.processedVenueIds = Array.from(processedIds);

        progress.update(currentBatch.length);
        logger.info(`Batch written: ${currentBatch.length} venues (total: ${checkpoint.successCount})`);

        currentBatch = [];
        rowsSinceCheckpoint = 0;
        saveCheckpoint(checkpoint);

        // Rate limiting
        await sleep(CONFIG.RATE_LIMIT_DELAY_MS);
      }

      // Periodic checkpoint save
      if (rowsSinceCheckpoint >= CONFIG.CHECKPOINT_INTERVAL) {
        checkpoint.lastProcessedRow = i + 1;
        checkpoint.processedVenueIds = Array.from(processedIds);
        saveCheckpoint(checkpoint);
        rowsSinceCheckpoint = 0;
      }

    } catch (error) {
      logger.error(`Row ${rowIndex}: Unexpected error`, error);
      logFailedRow({
        rowIndex,
        venueName: 'Unknown',
        errors: [error.message],
      });
      checkpoint.failCount++;
      checkpoint.lastProcessedRow = i + 1;
      rowsSinceCheckpoint++;
      progress.update(1);

      // Save checkpoint on error
      saveCheckpoint(checkpoint);
    }
  }

  // Write remaining batch
  if (currentBatch.length > 0) {
    await writeBatchToFirestore(
      currentBatch.map(({ venueId, document }) => ({ venueId, document })),
      dryRun
    );
    checkpoint.successCount += currentBatch.length;
    progress.update(currentBatch.length);
    logger.info(`Final batch written: ${currentBatch.length} venues`);
  }

  // Final checkpoint
  checkpoint.status = 'completed';
  checkpoint.lastProcessedRow = totalRows;
  checkpoint.processedVenueIds = Array.from(processedIds);
  saveCheckpoint(checkpoint);

  // Log summary
  progress.complete(checkpoint.successCount, checkpoint.failCount, checkpoint.skipCount);

  // Clean up checkpoint on successful completion
  if (checkpoint.failCount === 0 && !dryRun) {
    clearCheckpoint();
    logger.info('Checkpoint cleared (migration completed successfully)');
  } else if (checkpoint.failCount > 0) {
    logger.warn(`${checkpoint.failCount} rows failed. Check migration-failed-rows.json for details.`);
    logger.info('Checkpoint preserved for potential retry.');
  }

  return checkpoint;
}

/**
 * CLI argument parsing
 */
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    resume: args.includes('--resume'),
    dryRun: args.includes('--dry-run'),
    help: args.includes('--help') || args.includes('-h'),
  };
}

/**
 * Print usage information
 */
function printHelp() {
  console.log(`
Venue Migration Script
======================

Migrates venue data from Google Sheets "Contact Info" to Firestore "venues" collection.

Usage:
  node migrate-venues.js [options]

Options:
  --dry-run    Validate data without writing to Firestore
  --resume     Resume from last checkpoint
  --help, -h   Show this help message

Environment Variables (can be set in .env file):
  SPREADSHEET_ID         Google Sheets spreadsheet ID
  SHEET_NAME             Sheet name (default: "Contact Info")
  SERVICE_ACCOUNT_PATH   Path to service account JSON
  FIRESTORE_COLLECTION   Firestore collection name (default: "venues")
  BATCH_SIZE             Batch size for writes (default: 500, max: 500)
  RATE_LIMIT_DELAY_MS    Delay between batches in ms (default: 100)
  CHECKPOINT_INTERVAL    Save checkpoint every N rows (default: 50)
  DEBUG                  Set to "true" for debug logging

Examples:
  node migrate-venues.js              # Full migration
  node migrate-venues.js --dry-run    # Validate only
  node migrate-venues.js --resume     # Resume interrupted migration
`);
}

// Main execution
async function main() {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  try {
    await runMigration({
      resume: args.resume,
      dryRun: args.dryRun,
    });
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed', error);
    process.exit(1);
  }
}

main();
