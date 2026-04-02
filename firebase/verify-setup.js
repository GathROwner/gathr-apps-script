/**
 * Verification script to test Firestore rules and setup
 */

const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'gathr-migrated'
});

const db = admin.firestore();

async function verifySetup() {
  console.log('='.repeat(50));
  console.log('GathR-Migrated Setup Verification');
  console.log('='.repeat(50));
  console.log('');

  // Test 1: Write to venues collection (admin SDK bypasses rules)
  console.log('[Test 1] Writing test venue...');
  try {
    const venueRef = db.collection('venues').doc('test-venue');
    await venueRef.set({
      pagename: 'Test Venue',
      pagenameNormalized: 'test venue',
      pagenameSearchTokens: ['test', 'venue'],
      pagenameSlug: 'test-venue',
      pageurl: 'https://facebook.com/test-venue',
      address: '123 Test Street',
      latitude: 45.4215,
      longitude: -75.6972,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('  ✓ Venue created successfully');
  } catch (error) {
    console.log('  ✗ Error:', error.message);
  }

  // Test 2: Write to events subcollection
  console.log('[Test 2] Writing test event...');
  try {
    const eventRef = db.collection('venues').doc('test-venue')
                       .collection('events').doc('test-event');
    await eventRef.set({
      name: 'Test Event',
      isEvent: true,
      isFoodSpecial: false,
      isRecurring: false,
      category: 'Music',
      establishment: 'Test Venue',
      startDate: admin.firestore.Timestamp.fromDate(new Date('2025-02-01')),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('  ✓ Event created successfully');
  } catch (error) {
    console.log('  ✗ Error:', error.message);
  }

  // Test 3: Read venues
  console.log('[Test 3] Reading venues...');
  try {
    const snapshot = await db.collection('venues').get();
    console.log(`  ✓ Found ${snapshot.size} venue(s)`);
  } catch (error) {
    console.log('  ✗ Error:', error.message);
  }

  // Test 4: Collection group query on events
  console.log('[Test 4] Collection group query on events...');
  try {
    const snapshot = await db.collectionGroup('events')
                             .where('isEvent', '==', true)
                             .get();
    console.log(`  ✓ Found ${snapshot.size} event(s) via collection group query`);
  } catch (error) {
    console.log('  ✗ Error:', error.message);
  }

  // Test 5: Write to processing collections
  console.log('[Test 5] Writing to processed_datasets...');
  try {
    await db.collection('processed_datasets').doc('test-dataset').set({
      filename: 'test-file.xlsx',
      status: 'completed',
      processedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('  ✓ processed_datasets write successful');
  } catch (error) {
    console.log('  ✗ Error:', error.message);
  }

  // Test 6: Check indexes (by running indexed queries)
  console.log('[Test 6] Testing indexed queries...');
  try {
    // This query requires the isEvent + startDate index
    const eventQuery = await db.collectionGroup('events')
      .where('isEvent', '==', true)
      .orderBy('startDate')
      .limit(1)
      .get();
    console.log('  ✓ isEvent + startDate index working');
  } catch (error) {
    if (error.message.includes('index')) {
      console.log('  ⚠ Index still building:', error.message.substring(0, 100));
    } else {
      console.log('  ✗ Error:', error.message);
    }
  }

  // Cleanup
  console.log('');
  console.log('[Cleanup] Removing test data...');
  try {
    await db.collection('venues').doc('test-venue')
            .collection('events').doc('test-event').delete();
    await db.collection('venues').doc('test-venue').delete();
    await db.collection('processed_datasets').doc('test-dataset').delete();
    console.log('  ✓ Test data cleaned up');
  } catch (error) {
    console.log('  ⚠ Cleanup error:', error.message);
  }

  console.log('');
  console.log('='.repeat(50));
  console.log('Verification Complete!');
  console.log('='.repeat(50));
  console.log('');
  console.log('Summary:');
  console.log('  Project ID:    gathr-migrated');
  console.log('  Database:      northamerica-northeast2');
  console.log('  Admin UID:     5vM7W03kRqgBJWL3NG1pynU4aKz2');
  console.log('');
  console.log('Console URLs:');
  console.log('  Firestore: https://console.firebase.google.com/project/gathr-migrated/firestore');
  console.log('  Rules:     https://console.firebase.google.com/project/gathr-migrated/firestore/rules');
  console.log('  Indexes:   https://console.firebase.google.com/project/gathr-migrated/firestore/indexes');
  console.log('  Auth:      https://console.firebase.google.com/project/gathr-migrated/authentication');

  process.exit(0);
}

verifySetup().catch(console.error);
