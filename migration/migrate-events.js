/**
 * migrate-events.js
 *
 * Migration script to transfer event data from Google Sheets "GPT Processed" Sheet1
 * to Firestore as subcollections under matching venues.
 *
 * Usage:
 *   node migrate-events.js           # Run full migration
 *   node migrate-events.js --resume  # Resume from checkpoint
 *   node migrate-events.js --dry-run # Validate without writing to Firestore
 *
 * Requirements:
 *   - Service account JSON file at ../firebase/service-account.json
 *   - Venues must already be migrated to Firestore
 *   - Environment variables in .env file (see .env.example)
 */

require('dotenv').config();

const { google } = require('googleapis');
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const {
  transformRowToEventDocument,
  rowArrayToObject,
} = require('./event-field-mapping');

const {
  VenueMatcher,
  normalizeVenueName,
} = require('./venue-matcher');

const {
  createCheckpoint,
  saveCheckpoint,
  loadCheckpoint,
  clearCheckpoint,
  logFailedRow,
  clearFailedRows,
  sleep,
  retryWithBackoff,
  ProgressLogger,
  logger,
} = require('./migration-utils');

// Configuration
const CONFIG = {
  // Google Sheets - GPT Processed spreadsheet
  SPREADSHEET_ID: process.env.EVENTS_SPREADSHEET_ID || process.env.SPREADSHEET_ID || '1ppUWGHkpuSGfhsEK2Q9FpFSwdauEwRtHKuqLkIY8U78',
  SHEET_NAME: process.env.EVENTS_SHEET_NAME || 'Sheet1',

  // Firebase
  SERVICE_ACCOUNT_PATH: process.env.SERVICE_ACCOUNT_PATH || path.join(__dirname, '..', 'firebase', 'service-account.json'),
  VENUES_COLLECTION: process.env.FIRESTORE_COLLECTION || 'venues',
  EVENTS_SUBCOLLECTION: 'events',

  // Migration settings
  BATCH_SIZE: parseInt(process.env.BATCH_SIZE, 10) || 500, // Firestore max is 500
  RATE_LIMIT_DELAY_MS: parseInt(process.env.RATE_LIMIT_DELAY_MS, 10) || 100,
  CHECKPOINT_INTERVAL: parseInt(process.env.CHECKPOINT_INTERVAL, 10) || 50,
  CHECKPOINT_FILE: path.join(__dirname, 'events-migration-checkpoint.json'),
  FAILED_ROWS_FILE: path.join(__dirname, 'events-migration-failed-rows.json'),
  UNMATCHED_EVENTS_FILE: path.join(__dirname, 'events-migration-unmatched.json'),

  // Retry settings
  MAX_RETRIES: parseInt(process.env.MAX_RETRIES, 10) || 3,
  RETRY_BASE_DELAY_MS: parseInt(process.env.RETRY_BASE_DELAY_MS, 10) || 1000,
};

// Global state
let db = null;
let sheetsApi = null;
let venueMatcher = null;

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
 * Loads all venues from Firestore for matching
 * @returns {Promise<Object[]>} Array of venue documents
 */
async function loadVenuesFromFirestore() {
  logger.info('Loading venues from Firestore for matching...');

  const snapshot = await db.collection(CONFIG.VENUES_COLLECTION).get();
  const venues = [];

  snapshot.forEach(doc => {
    venues.push({
      id: doc.id,
      venueId: doc.id,
      ...doc.data(),
    });
  });

  logger.info(`Loaded ${venues.length} venues from Firestore`);
  return venues;
}

/**
 * Fetches all data from the GPT Processed Sheet1
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
  logger.info(`Columns: ${headers.slice(0, 10).join(', ')}...`);

  return { headers, rows };
}

/**
 * Logs an unmatched event for manual review
 * @param {Object} eventData - The event data that couldn't be matched
 * @param {number} rowIndex - The row index in the sheet
 */
function logUnmatchedEvent(eventData, rowIndex) {
  let unmatchedEvents = [];
  try {
    if (fs.existsSync(CONFIG.UNMATCHED_EVENTS_FILE)) {
      unmatchedEvents = JSON.parse(fs.readFileSync(CONFIG.UNMATCHED_EVENTS_FILE, 'utf8'));
    }
  } catch (error) {
    unmatchedEvents = [];
  }

  unmatchedEvents.push({
    rowIndex,
    establishment: eventData.establishment,
    establishmentNormalized: eventData.establishmentNormalized,
    eventName: eventData.name,
    startDate: eventData.startDate,
    facebookUrl: eventData.facebookUrl,
    timestamp: new Date().toISOString(),
  });

  fs.writeFileSync(CONFIG.UNMATCHED_EVENTS_FILE, JSON.stringify(unmatchedEvents, null, 2), 'utf8');
}

/**
 * Clears the unmatched events file
 */
function clearUnmatchedEvents() {
  try {
    if (fs.existsSync(CONFIG.UNMATCHED_EVENTS_FILE)) {
      fs.unlinkSync(CONFIG.UNMATCHED_EVENTS_FILE);
    }
  } catch (error) {
    logger.warn(`Could not clear unmatched events file: ${error.message}`);
  }
}

/**
 * Writes a batch of event documents to Firestore
 * Events are written as subcollections under their matched venue
 *
 * @param {Array<{venueId: string, eventId: string, document: Object}>} events - Events to write
 * @param {boolean} dryRun - If true, skip actual writes
 * @returns {Promise<{success: number, failed: number}>}
 */
async function writeBatchToFirestore(events, dryRun = false) {
  if (dryRun) {
    logger.debug(`[DRY RUN] Would write ${events.length} events`);
    return { success: events.length, failed: 0 };
  }

  const batch = db.batch();
  const now = admin.firestore.FieldValue.serverTimestamp();

  for (const { venueId, eventId, document } of events) {
    const docRef = db
      .collection(CONFIG.VENUES_COLLECTION)
      .doc(venueId)
      .collection(CONFIG.EVENTS_SUBCOLLECTION)
      .doc(eventId);

    // Add metadata fields
    const docWithMeta = {
      ...document,
      venueId, // Denormalized for easier querying
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

  return { success: events.length, failed: 0 };
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
  logger.info('Starting Event Migration');
  logger.info(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  logger.info(`Resume: ${resume}`);
  logger.info('========================================\n');

  // Initialize services
  await initializeFirebase();
  await initializeGoogleSheets();

  // Load venues for matching
  const venues = await loadVenuesFromFirestore();
  venueMatcher = new VenueMatcher(venues);
  logger.info(`VenueMatcher initialized with ${venueMatcher.venueCount} venues`);

  // Fetch sheet data
  const { headers, rows } = await fetchSheetData();
  const totalRows = rows.length;

  // Load or create checkpoint
  let checkpoint;
  if (resume) {
    checkpoint = loadCheckpoint(CONFIG.CHECKPOINT_FILE);
    if (checkpoint) {
      logger.info(`Resuming from row ${checkpoint.lastProcessedRow + 1}`);
      logger.info(`Previous progress: ${checkpoint.successCount} success, ${checkpoint.failCount} failed, ${checkpoint.skipCount} skipped, ${checkpoint.unmatchedCount || 0} unmatched`);
    } else {
      logger.warn('No checkpoint found, starting fresh');
      checkpoint = createCheckpoint(totalRows);
      checkpoint.unmatchedCount = 0;
      clearFailedRows(CONFIG.FAILED_ROWS_FILE);
      clearUnmatchedEvents();
    }
  } else {
    checkpoint = createCheckpoint(totalRows);
    checkpoint.unmatchedCount = 0;
    clearFailedRows(CONFIG.FAILED_ROWS_FILE);
    clearUnmatchedEvents();
  }

  // Track processed event IDs to detect duplicates
  const processedIds = new Set(checkpoint.processedEventIds || []);

  // Progress tracking
  const progress = new ProgressLogger(totalRows);
  progress.current = checkpoint.lastProcessedRow;

  // Batch collection
  let currentBatch = [];
  let rowsSinceCheckpoint = 0;

  // Match statistics
  const matchStats = {
    facebook_url_exact: 0,
    facebook_slug_exact: 0,
    name_exact: 0,
    name_exact_multiple: 0,
    name_fuzzy: 0,
    unmatched: 0,
  };

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
      const result = transformRowToEventDocument(rowData, rowIndex);

      if (!result.isValid) {
        // Log validation errors
        logger.warn(`Row ${rowIndex}: Validation failed - ${result.errors.join('; ')}`);
        logFailedRow({
          rowIndex,
          venueName: result.establishment || 'Unknown',
          errors: result.errors,
        }, CONFIG.FAILED_ROWS_FILE);
        checkpoint.failCount++;
        checkpoint.lastProcessedRow = i + 1;
        rowsSinceCheckpoint++;
        progress.update(1);
        continue;
      }

      // Find matching venue
      const match = venueMatcher.findMatch(
        result.establishment,
        result.document.facebookUrl
      );

      if (!match) {
        // No venue match found
        logger.debug(`Row ${rowIndex}: No venue match for "${result.establishment}"`);
        logUnmatchedEvent({
          ...result.document,
          establishmentNormalized: result.establishmentNormalized,
        }, rowIndex);
        checkpoint.unmatchedCount = (checkpoint.unmatchedCount || 0) + 1;
        matchStats.unmatched++;
        checkpoint.lastProcessedRow = i + 1;
        rowsSinceCheckpoint++;
        progress.update(1);
        continue;
      }

      // Track match type statistics
      matchStats[match.matchType] = (matchStats[match.matchType] || 0) + 1;

      // Add venue info to document
      result.document.venueName = match.venue.pagename || match.venue.title;
      result.document.matchType = match.matchType;
      result.document.matchScore = match.score;

      // Check for duplicate event ID
      if (processedIds.has(result.eventId)) {
        logger.debug(`Row ${rowIndex}: Duplicate eventId ${result.eventId}, skipping`);
        checkpoint.skipCount++;
        checkpoint.lastProcessedRow = i + 1;
        rowsSinceCheckpoint++;
        progress.update(1);
        continue;
      }

      // Add to batch
      currentBatch.push({
        venueId: match.venueId,
        eventId: result.eventId,
        document: result.document,
        rowIndex,
      });
      processedIds.add(result.eventId);

      // Write batch when full
      if (currentBatch.length >= CONFIG.BATCH_SIZE) {
        await writeBatchToFirestore(
          currentBatch.map(({ venueId, eventId, document }) => ({ venueId, eventId, document })),
          dryRun
        );

        checkpoint.successCount += currentBatch.length;
        checkpoint.lastProcessedRow = i + 1;
        checkpoint.processedEventIds = Array.from(processedIds);

        progress.update(currentBatch.length);
        logger.info(`Batch written: ${currentBatch.length} events (total: ${checkpoint.successCount})`);

        currentBatch = [];
        rowsSinceCheckpoint = 0;
        saveCheckpoint(checkpoint, CONFIG.CHECKPOINT_FILE);

        // Rate limiting
        await sleep(CONFIG.RATE_LIMIT_DELAY_MS);
      }

      // Periodic checkpoint save
      if (rowsSinceCheckpoint >= CONFIG.CHECKPOINT_INTERVAL) {
        checkpoint.lastProcessedRow = i + 1;
        checkpoint.processedEventIds = Array.from(processedIds);
        saveCheckpoint(checkpoint, CONFIG.CHECKPOINT_FILE);
        rowsSinceCheckpoint = 0;
      }

    } catch (error) {
      logger.error(`Row ${rowIndex}: Unexpected error`, error);
      logFailedRow({
        rowIndex,
        venueName: 'Unknown',
        errors: [error.message],
      }, CONFIG.FAILED_ROWS_FILE);
      checkpoint.failCount++;
      checkpoint.lastProcessedRow = i + 1;
      rowsSinceCheckpoint++;
      progress.update(1);

      // Save checkpoint on error
      saveCheckpoint(checkpoint, CONFIG.CHECKPOINT_FILE);
    }
  }

  // Write remaining batch
  if (currentBatch.length > 0) {
    await writeBatchToFirestore(
      currentBatch.map(({ venueId, eventId, document }) => ({ venueId, eventId, document })),
      dryRun
    );
    checkpoint.successCount += currentBatch.length;
    progress.update(currentBatch.length);
    logger.info(`Final batch written: ${currentBatch.length} events`);
  }

  // Final checkpoint
  checkpoint.status = 'completed';
  checkpoint.lastProcessedRow = totalRows;
  checkpoint.processedEventIds = Array.from(processedIds);
  saveCheckpoint(checkpoint, CONFIG.CHECKPOINT_FILE);

  // Log match statistics
  logger.info('\n========================================');
  logger.info('Venue Match Statistics');
  logger.info('========================================');
  logger.info(`  - Facebook URL exact: ${matchStats.facebook_url_exact}`);
  logger.info(`  - Facebook slug exact: ${matchStats.facebook_slug_exact}`);
  logger.info(`  - Name exact: ${matchStats.name_exact}`);
  logger.info(`  - Name exact (multiple): ${matchStats.name_exact_multiple}`);
  logger.info(`  - Name fuzzy: ${matchStats.name_fuzzy}`);
  logger.info(`  - Unmatched: ${matchStats.unmatched}`);

  // Log summary
  progress.complete(checkpoint.successCount, checkpoint.failCount, checkpoint.skipCount);

  if (checkpoint.unmatchedCount > 0) {
    logger.warn(`\n${checkpoint.unmatchedCount} events could not be matched to venues.`);
    logger.warn(`Review unmatched events in: ${CONFIG.UNMATCHED_EVENTS_FILE}`);
  }

  // Clean up checkpoint on successful completion
  if (checkpoint.failCount === 0 && checkpoint.unmatchedCount === 0 && !dryRun) {
    clearCheckpoint(CONFIG.CHECKPOINT_FILE);
    logger.info('Checkpoint cleared (migration completed successfully)');
  } else if (checkpoint.failCount > 0) {
    logger.warn(`${checkpoint.failCount} rows failed. Check ${CONFIG.FAILED_ROWS_FILE} for details.`);
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
Event Migration Script
======================

Migrates event data from Google Sheets "GPT Processed" Sheet1 to Firestore
as subcollections under matching venues.

Usage:
  node migrate-events.js [options]

Options:
  --dry-run    Validate data and match venues without writing to Firestore
  --resume     Resume from last checkpoint
  --help, -h   Show this help message

Prerequisites:
  - Venues must already be migrated to Firestore (run migrate-venues.js first)

Environment Variables (can be set in .env file):
  EVENTS_SPREADSHEET_ID    Google Sheets spreadsheet ID for events
  EVENTS_SHEET_NAME        Sheet name (default: "Sheet1")
  SERVICE_ACCOUNT_PATH     Path to service account JSON
  FIRESTORE_COLLECTION     Venues collection name (default: "venues")
  BATCH_SIZE               Batch size for writes (default: 500, max: 500)
  RATE_LIMIT_DELAY_MS      Delay between batches in ms (default: 100)
  CHECKPOINT_INTERVAL      Save checkpoint every N rows (default: 50)
  DEBUG                    Set to "true" for debug logging

Venue Matching:
  Events are matched to venues using the following priority:
  1. Facebook URL exact match
  2. Facebook URL slug match
  3. Establishment name exact match (normalized)
  4. Establishment name fuzzy match (similarity > 0.6)

Output Files:
  - events-migration-checkpoint.json     Resume checkpoint
  - events-migration-failed-rows.json    Failed row details
  - events-migration-unmatched.json      Events that couldn't match to venues

Examples:
  node migrate-events.js              # Full migration
  node migrate-events.js --dry-run    # Validate and test matching only
  node migrate-events.js --resume     # Resume interrupted migration
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
