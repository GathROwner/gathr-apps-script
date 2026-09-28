/*
 * Removes only the known visual re-encodes from Summer Swing Out.
 * The guard ensures no newer parse result can be overwritten accidentally.
 * It never deletes Cloud Storage objects.
 *
 * Usage:
 *   $env:GATHR_SERVICE_ACCOUNT_PATH='C:\\path\\to\\service-account.json'
 *   node firebase/repair-summer-swing-visual-media-2026-09-28.js
 */

const admin = require('firebase-admin');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const serviceAccountPath = process.env.GATHR_SERVICE_ACCOUNT_PATH;
if (!serviceAccountPath) throw new Error('GATHR_SERVICE_ACCOUNT_PATH is required');

admin.initializeApp({ credential: admin.credential.cert(require(serviceAccountPath)) });

const target = {
  path: 'venues/fb_100063680584674/events/TGZVaeW7JWSQuOmOVZMZ',
  eventName: 'Summer Swing Out (Outdoor Social Dance)',
  uniqueId: '122138450949035455_2',
  originalMediaUrls: [
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/1782223697307-l3nqig.webp',
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/1782223794716-auagzk.webp',
    'https://storage.googleapis.com/gathr-uploaded-images/postimages/1782309336769-y51y2f.webp',
  ],
  retainedUrl: 'https://storage.googleapis.com/gathr-uploaded-images/postimages/1782309336769-y51y2f.webp',
};

function fingerprint(urls) {
  return crypto.createHash('sha256').update(JSON.stringify(urls)).digest('hex');
}

async function main() {
  const db = admin.firestore();
  const snapshot = await db.doc(target.path).get();
  if (!snapshot.exists) throw new Error(`Missing target: ${target.path}`);
  const data = snapshot.data();
  const mediaUrls = Array.isArray(data.mediaUrls) ? data.mediaUrls.map(String) : [];
  if (data.eventName !== target.eventName || data.uniqueId !== target.uniqueId) {
    throw new Error(`Identity mismatch: ${target.path}`);
  }
  if (fingerprint(mediaUrls) !== fingerprint(target.originalMediaUrls)) {
    throw new Error(`Media fingerprint mismatch: ${target.path}`);
  }
  if (data.relevantImageUrl !== target.retainedUrl || !mediaUrls.includes(target.retainedUrl)) {
    throw new Error(`Primary image guard failed: ${target.path}`);
  }

  const backupPath = path.join(
    __dirname,
    'artifacts',
    `repair-summer-swing-visual-media-${new Date().toISOString().replace(/[:.]/g, '-')}-backup.json`
  );
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.writeFileSync(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), target, before: data }, null, 2));

  await snapshot.ref.update({
    mediaUrls: [target.retainedUrl],
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const after = (await snapshot.ref.get()).data();
  if (JSON.stringify(after.mediaUrls) !== JSON.stringify([target.retainedUrl])) {
    throw new Error(`Post-write verification failed: ${target.path}`);
  }
  console.log(JSON.stringify({ repaired: target.path, retainedUrl: target.retainedUrl, backupPath }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
