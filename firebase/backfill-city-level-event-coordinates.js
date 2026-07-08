/**
 * Backfill centroid coordinates onto already-published city-level events.
 *
 * Published city/area-scoped events historically carried no latitude/longitude,
 * which keeps them off the app map. This stamps canonical PEI centroids
 * (functions/lib/services/peiLocations.js — run `npm run build` in functions/
 * first) onto any published event with locationScope city/area and missing or
 * 0,0 coordinates.
 *
 * Usage:
 *   node backfill-city-level-event-coordinates.js            # dry run (default)
 *   node backfill-city-level-event-coordinates.js --apply    # write updates
 *
 * Writes a pre-write backup JSON and an apply report next to this script.
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
const BACKUP_PATH = path.join(__dirname, `city-level-coordinate-backfill-backup-${RUN_STAMP}.json`);
const REPORT_PATH = path.join(__dirname, `city-level-coordinate-backfill-report-${RUN_STAMP}.json`);

function hasValidCoordinates(data) {
  const lat = Number(data.latitude);
  const lng = Number(data.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

async function main() {
  const { resolvePeiCentroid } = await import('../functions/lib/services/peiLocations.js');
  const db = admin.firestore();

  const snapshot = await db
    .collection('events')
    .where('locationScope', 'in', ['city', 'area'])
    .get();

  console.log(`Found ${snapshot.size} city/area-scoped published events.`);

  const planned = [];
  const skipped = [];

  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    if (hasValidCoordinates(data)) {
      skipped.push({ id: doc.id, reason: 'already_has_coordinates' });
      continue;
    }
    const centroid = resolvePeiCentroid({
      locationCity: data.locationCity,
      locationLabel: data.locationLabel,
    });
    if (!centroid) {
      skipped.push({
        id: doc.id,
        reason: 'unresolved_centroid',
        locationLabel: data.locationLabel || '',
        locationCity: data.locationCity || '',
      });
      continue;
    }
    planned.push({
      id: doc.id,
      eventName: data.eventName || data.name || '',
      locationLabel: data.locationLabel || '',
      locationCity: data.locationCity || '',
      centroidLabel: centroid.label,
      latitude: centroid.latitude,
      longitude: centroid.longitude,
      before: { latitude: data.latitude ?? null, longitude: data.longitude ?? null },
    });
  }

  console.log(`Planned updates: ${planned.length}, skipped: ${skipped.length}`);
  for (const item of planned) {
    console.log(`  ${item.id}: "${item.eventName}" @ ${item.locationLabel} -> ${item.latitude}, ${item.longitude}`);
  }
  for (const item of skipped.filter((s) => s.reason === 'unresolved_centroid')) {
    console.log(`  (unresolved) ${item.id}: label="${item.locationLabel}" city="${item.locationCity}"`);
  }

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to write these updates.');
    return;
  }

  const backup = {};
  for (const doc of snapshot.docs) {
    if (planned.some((p) => p.id === doc.id)) {
      backup[doc.id] = doc.data();
    }
  }
  fs.writeFileSync(BACKUP_PATH, JSON.stringify(backup, null, 2));
  console.log(`Backup written: ${BACKUP_PATH}`);

  const results = [];
  for (const item of planned) {
    await db.collection('events').doc(item.id).set(
      {
        latitude: item.latitude,
        longitude: item.longitude,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    results.push({ ...item, applied: true });
    console.log(`Updated ${item.id}`);
  }

  fs.writeFileSync(
    REPORT_PATH,
    JSON.stringify({ appliedAt: new Date().toISOString(), results, skipped }, null, 2)
  );
  console.log(`Report written: ${REPORT_PATH}`);
}

main().catch((error) => {
  console.error('Backfill failed:', error);
  process.exitCode = 1;
});
