/* Removes cropped flyer derivatives from the two guarded Saturday Night $5 Tango records. */
const admin = require('firebase-admin');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const serviceAccountPath = process.env.GATHR_SERVICE_ACCOUNT_PATH;
if (!serviceAccountPath) throw new Error('GATHR_SERVICE_ACCOUNT_PATH is required');
admin.initializeApp({ credential: admin.credential.cert(require(serviceAccountPath)) });
const hero = 'https://storage.googleapis.com/gathr-uploaded-images/postimages/1790257923228-kliney.webp';
const crops = [
  'https://storage.googleapis.com/gathr-uploaded-images/postimages/1790000312860-imvoit.webp',
  'https://storage.googleapis.com/gathr-uploaded-images/postimages/1790000313114-gaa739.webp',
  hero,
];
const targets = [
  ['venues/0F6W6IBgJqlKQ8AmaTGC/events/CYXXEhbfahgyorkBiHuh', '122146813899035455_db0ecfda4893326a'],
  ['venues/0F6W6IBgJqlKQ8AmaTGC/events/vCh9VytctvxFJMLJt4sw', '122146813899035455_3566fe60a3117feb'],
];
const fingerprint = (urls) => crypto.createHash('sha256').update(JSON.stringify(urls)).digest('hex');
(async () => {
  const db = admin.firestore();
  const snapshots = await Promise.all(targets.map(([docPath]) => db.doc(docPath).get()));
  for (let index = 0; index < snapshots.length; index += 1) {
    const data = snapshots[index].data();
    if (!snapshots[index].exists || data.eventName !== 'Saturday Night $5 Tango' || data.uniqueId !== targets[index][1] || fingerprint(data.mediaUrls || []) !== fingerprint(crops) || data.relevantImageUrl !== hero) {
      throw new Error(`Guard mismatch: ${targets[index][0]}`);
    }
  }
  const backupPath = path.join(__dirname, 'artifacts', `repair-tango-cropped-media-${new Date().toISOString().replace(/[:.]/g, '-')}-backup.json`);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.writeFileSync(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), targets: snapshots.map((snapshot) => ({ path: snapshot.ref.path, before: snapshot.data() })) }, null, 2));
  const batch = db.batch();
  for (const snapshot of snapshots) batch.update(snapshot.ref, { mediaUrls: [hero], updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  await batch.commit();
  for (const snapshot of snapshots) {
    const after = (await snapshot.ref.get()).get('mediaUrls');
    if (JSON.stringify(after) !== JSON.stringify([hero])) throw new Error(`Post-write verification failed: ${snapshot.ref.path}`);
  }
  console.log(JSON.stringify({ repairedEventCount: snapshots.length, removedReferenceCount: 4, retainedUrl: hero, backupPath }, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
