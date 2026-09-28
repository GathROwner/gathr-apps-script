/*
 * Narrow repair for four visually verified duplicate-media records.
 *
 * Defaults to a dry run. --apply writes only after each document matches its
 * exact title, source identity, and media list. No Cloud Storage objects are
 * deleted; the backup holds the complete pre-write documents.
 *
 * Usage:
 *   $env:GATHR_SERVICE_ACCOUNT_PATH='C:\\...\\service-account.json'
 *   node firebase/repair-duplicate-event-media-2026-09-28.js
 *   node firebase/repair-duplicate-event-media-2026-09-28.js --apply
 */

const admin = require('firebase-admin');
const fs = require('node:fs');
const path = require('node:path');

const serviceAccountPath = process.env.GATHR_SERVICE_ACCOUNT_PATH;
if (!serviceAccountPath) {
  throw new Error('GATHR_SERVICE_ACCOUNT_PATH is required');
}

const serviceAccount = require(serviceAccountPath);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const apply = process.argv.includes('--apply');
const bucketBase = 'https://storage.googleapis.com/gathr-uploaded-images/postimages/';
const targets = [
  {
    path: 'venues/0F6W6IBgJqlKQ8AmaTGC/events/Bat3a4lsxL60olP7jI5M',
    eventName: 'Belly Dance Fridays (Ongoing Classes) with Alika',
    uniqueId: '122143220499035455_d9be7411ef5dc5cb',
    expectedMediaUrls: [
      `${bucketBase}1786888199193-bwwu8o.webp`,
      `${bucketBase}1786888199450-uy2c9e.webp`,
      `${bucketBase}1786888199694-u85qo0.webp`,
    ],
    keepUrl: `${bucketBase}1786888199450-uy2c9e.webp`,
  },
  {
    path: 'venues/TpTHxHfn9wopdRr70KeS/events/XO7repKckrks88iYCh3d',
    eventName: 'Yoga & Meditation',
    uniqueId: '1710446091090849_4138851c71fe3f16',
    expectedMediaUrls: [
      `${bucketBase}1789138280355-8ddij2.webp`,
      `${bucketBase}1789224082401-wae9qm.webp`,
    ],
    keepUrl: `${bucketBase}1789224082401-wae9qm.webp`,
  },
  {
    path: 'venues/slug_confedcentre/events/Ohmvrd6Goa1T4ftmfMOQ',
    eventName: 'Beginner Step and Tap (Ages 6-8)',
    uniqueId: '1479649647533739_2ab7faede4c71f80',
    expectedMediaUrls: [
      `${bucketBase}1789046913656-1a5qwq.webp`,
      `${bucketBase}1789046913904-qi50dk.webp`,
      `${bucketBase}1789046914157-1f5vc3.webp`,
    ],
    keepUrl: `${bucketBase}1789046913904-qi50dk.webp`,
  },
  {
    path: 'venues/fb_100057766283684/events/QE6w7hI2A5AT2Yyo3fLh',
    eventName: 'Among Legends',
    uniqueId: '1627787719156755_c6e28473bc8a84b7',
    expectedMediaUrls: [
      `${bucketBase}1787750033117-4vk80z.webp`,
      `${bucketBase}1787752596535-72tfbr.webp`,
    ],
    keepUrl: `${bucketBase}1787752596535-72tfbr.webp`,
  },
];

function sameStrings(left, right) {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function buildProvenance(existing, keepUrl) {
  const sourceFields = ['relevantImageUrl', 'image', 'imageUrl', 'mediaUrls'];
  if (existing.icon) sourceFields.push('icon');
  const media = [
    { url: keepUrl, source: 'post_media', field: 'relevantImageUrl', isPrimary: true, isFallback: false },
    { url: keepUrl, source: 'post_media', field: 'image', isPrimary: false, isFallback: false },
    { url: keepUrl, source: 'post_media', field: 'imageUrl', isPrimary: false, isFallback: false },
    { url: keepUrl, source: 'post_media', field: 'mediaUrls', isPrimary: false, isFallback: false },
  ];
  if (existing.icon) media.push({ url: existing.icon, source: 'profile_image', field: 'icon', isPrimary: false, isFallback: true });
  return {
    version: 1,
    primarySource: 'post_media',
    primaryField: 'relevantImageUrl',
    primaryUrl: keepUrl,
    isFallback: false,
    sourceFields,
    media,
    selectionReason: 'verified_duplicate_media_cleanup',
    updatedBy: 'repair-duplicate-event-media-2026-09-28',
    setAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

async function main() {
  const db = admin.firestore();
  const inspected = [];
  for (const target of targets) {
    const snapshot = await db.doc(target.path).get();
    if (!snapshot.exists) throw new Error(`Missing target: ${target.path}`);
    const data = snapshot.data();
    if (data.eventName !== target.eventName || data.uniqueId !== target.uniqueId || !sameStrings(data.mediaUrls, target.expectedMediaUrls)) {
      throw new Error(`Fingerprint mismatch: ${target.path}`);
    }
    inspected.push({ target, before: data });
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    targetCount: inspected.length,
    targets: inspected.map(({ target }) => ({
      path: target.path,
      eventName: target.eventName,
      fromCount: target.expectedMediaUrls.length,
      keepUrl: target.keepUrl,
    })),
  }, null, 2));

  if (!apply) return;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(__dirname, 'artifacts', `repair-duplicate-event-media-${timestamp}-backup.json`);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.writeFileSync(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), targets: inspected }, null, 2));

  const batch = db.batch();
  for (const { target, before } of inspected) {
    batch.update(db.doc(target.path), {
      image: target.keepUrl,
      imageUrl: target.keepUrl,
      relevantImageUrl: target.keepUrl,
      mediaUrls: [target.keepUrl],
      imageProvenance: buildProvenance(before, target.keepUrl),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();

  for (const { target } of inspected) {
    const after = (await db.doc(target.path).get()).data();
    if (!sameStrings(after.mediaUrls, [target.keepUrl]) || after.imageUrl !== target.keepUrl || after.relevantImageUrl !== target.keepUrl) {
      throw new Error(`Post-write verification failed: ${target.path}`);
    }
  }
  console.log(JSON.stringify({ applied: true, backupPath, verifiedCount: inspected.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
