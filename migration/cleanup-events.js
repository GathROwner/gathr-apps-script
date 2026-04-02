/**
 * cleanup-events.js
 *
 * Deletes all events from all venue subcollections in Firestore.
 * Use this to clean up before re-running the event migration.
 *
 * Usage:
 *   node cleanup-events.js --dry-run   # Show what would be deleted
 *   node cleanup-events.js             # Actually delete all events
 */

require('dotenv').config();

const admin = require('firebase-admin');
const path = require('path');

const CONFIG = {
  SERVICE_ACCOUNT_PATH: process.env.SERVICE_ACCOUNT_PATH || path.join(__dirname, '..', 'firebase', 'service-account.json'),
  VENUES_COLLECTION: process.env.FIRESTORE_COLLECTION || 'venues',
  EVENTS_SUBCOLLECTION: 'events',
  BATCH_SIZE: 500, // Firestore max batch size
};

let db = null;

/**
 * Initializes Firebase Admin SDK
 */
async function initializeFirebase() {
  console.log('Initializing Firebase Admin SDK...');

  const serviceAccount = require(CONFIG.SERVICE_ACCOUNT_PATH);

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  db = admin.firestore();
  console.log(`Firebase initialized for project: ${serviceAccount.project_id}`);
}

/**
 * Deletes all documents in a collection/subcollection
 * @param {FirebaseFirestore.CollectionReference} collectionRef
 * @param {boolean} dryRun
 * @returns {Promise<number>} Number of documents deleted
 */
async function deleteCollection(collectionRef, dryRun = false) {
  let deletedCount = 0;
  let snapshot = await collectionRef.limit(CONFIG.BATCH_SIZE).get();

  while (!snapshot.empty) {
    if (dryRun) {
      deletedCount += snapshot.size;
      console.log(`  [DRY RUN] Would delete ${snapshot.size} events`);
    } else {
      const batch = db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      deletedCount += snapshot.size;
      console.log(`  Deleted ${snapshot.size} events`);
    }

    // Get next batch
    snapshot = await collectionRef.limit(CONFIG.BATCH_SIZE).get();

    // In dry-run mode, we only check once (don't loop forever)
    if (dryRun) break;
  }

  return deletedCount;
}

/**
 * Main cleanup function
 */
async function runCleanup(dryRun = false) {
  console.log('========================================');
  console.log('Event Cleanup Script');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE DELETE'}`);
  console.log('========================================\n');

  await initializeFirebase();

  // Get all venues
  console.log('Fetching all venues...');
  const venuesSnapshot = await db.collection(CONFIG.VENUES_COLLECTION).get();
  console.log(`Found ${venuesSnapshot.size} venues\n`);

  let totalDeleted = 0;
  let venuesWithEvents = 0;

  for (const venueDoc of venuesSnapshot.docs) {
    const venueName = venueDoc.data().pagename || venueDoc.data().title || venueDoc.id;
    const eventsRef = venueDoc.ref.collection(CONFIG.EVENTS_SUBCOLLECTION);

    // Check if venue has any events
    const eventsSnapshot = await eventsRef.limit(1).get();
    if (eventsSnapshot.empty) {
      continue; // Skip venues with no events
    }

    venuesWithEvents++;
    console.log(`Processing: ${venueName}`);

    // Count events first
    const countSnapshot = await eventsRef.get();
    const eventCount = countSnapshot.size;

    if (dryRun) {
      console.log(`  [DRY RUN] Would delete ${eventCount} events`);
      totalDeleted += eventCount;
    } else {
      const deleted = await deleteCollection(eventsRef, false);
      totalDeleted += deleted;
    }
  }

  console.log('\n========================================');
  console.log('Cleanup Summary');
  console.log('========================================');
  console.log(`Venues with events: ${venuesWithEvents}`);
  console.log(`Total events ${dryRun ? 'to delete' : 'deleted'}: ${totalDeleted}`);
  console.log('========================================\n');

  if (dryRun) {
    console.log('This was a dry run. No data was deleted.');
    console.log('Run without --dry-run to actually delete events.');
  } else {
    console.log('Cleanup complete. You can now re-run migrate-events.js');
  }
}

// Parse arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

runCleanup(dryRun).catch(error => {
  console.error('Cleanup failed:', error);
  process.exit(1);
});
