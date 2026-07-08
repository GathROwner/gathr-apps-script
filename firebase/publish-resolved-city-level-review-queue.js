/**
 * Drain the city_level_event_reviews queue: publish every 'needs_review'
 * entry whose location resolves to a canonical PEI centroid.
 *
 * Reuses the functions publish pipeline (media upload, sanitization,
 * provenance) via autoPublishCityLevelEventReview — run `npm run build` in
 * functions/ first so lib/ is current. Reviews whose place names don't
 * resolve stay queued for manual handling.
 *
 * Usage:
 *   node publish-resolved-city-level-review-queue.js           # dry run (default)
 *   node publish-resolved-city-level-review-queue.js --apply   # publish
 *
 * Optional: set IMAGE_UPLOAD_URL so publish re-hosts source images the same
 * way the ingestion pipeline does; without it, source image URLs are kept.
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const serviceAccount = require(path.join(__dirname, 'service-account.json'));

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const APPLY = process.argv.includes('--apply');
const RUN_STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const BACKUP_PATH = path.join(__dirname, `city-level-queue-drain-backup-${RUN_STAMP}.json`);
const REPORT_PATH = path.join(__dirname, `city-level-queue-drain-report-${RUN_STAMP}.json`);

async function main() {
  // Import order matters: admin is already initialized with the service
  // account above, so the functions module reuses this app.
  const firestoreService = await import('../functions/lib/services/firestoreService.js');
  const { resolvePeiCentroid } = await import('../functions/lib/services/peiLocations.js');
  const db = admin.firestore();

  const snapshot = await db
    .collection('city_level_event_reviews')
    .where('status', '==', 'needs_review')
    .get();

  console.log(`Found ${snapshot.size} reviews in needs_review.`);

  const resolvable = [];
  const unresolved = [];

  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    const centroid = resolvePeiCentroid({
      locationCity: data.locationCity,
      locationLabel: data.locationLabel,
    });
    const summary = {
      reviewId: doc.id,
      eventName: data.eventName || '',
      eventDate: data.eventDate || '',
      locationLabel: data.locationLabel || '',
      locationCity: data.locationCity || '',
    };
    if (centroid) {
      resolvable.push({ ...summary, centroidLabel: centroid.label });
    } else {
      unresolved.push(summary);
    }
  }

  console.log(`Resolvable (will publish): ${resolvable.length}`);
  for (const item of resolvable) {
    console.log(`  ${item.reviewId}: "${item.eventName}" ${item.eventDate} @ ${item.locationLabel}`);
  }
  console.log(`Unresolved (stay queued): ${unresolved.length}`);
  for (const item of unresolved) {
    console.log(`  ${item.reviewId}: "${item.eventName}" @ label="${item.locationLabel}" city="${item.locationCity}"`);
  }

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to publish the resolvable reviews.');
    return;
  }

  const backup = {};
  for (const doc of snapshot.docs) {
    if (resolvable.some((r) => r.reviewId === doc.id)) {
      backup[doc.id] = doc.data();
    }
  }
  fs.writeFileSync(BACKUP_PATH, JSON.stringify(backup, null, 2));
  console.log(`Backup written: ${BACKUP_PATH}`);

  const results = [];
  for (const item of resolvable) {
    try {
      const result = await firestoreService.autoPublishCityLevelEventReview(item.reviewId);
      results.push({ ...item, ...result });
      console.log(
        result.published
          ? `Published ${item.reviewId} -> ${result.publishedEventId}`
          : `Skipped ${item.reviewId}: ${result.reason}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ ...item, published: false, error: message });
      console.error(`Failed ${item.reviewId}: ${message}`);
    }
  }

  fs.writeFileSync(
    REPORT_PATH,
    JSON.stringify({ appliedAt: new Date().toISOString(), results, unresolved }, null, 2)
  );
  console.log(`Report written: ${REPORT_PATH}`);
}

main().catch((error) => {
  console.error('Queue drain failed:', error);
  process.exitCode = 1;
});
