import fs from 'node:fs/promises';
import path from 'node:path';
import admin from 'firebase-admin';
import { findMatchingVenue } from '../lib/services/firestoreService.js';
import { previewDuplicateMerge, previewFullParserEventWritePayload } from '../lib/processing/rowProcessor.js';

const root = path.resolve(import.meta.dirname, '../..');
const planPath = path.join(root, 'artifacts/luna-live-canary-2026-10-02/upeisu-gallery-repair-plan.json');
const snapshotId = '1OmFzDG0kWiY-k8C-8G6-oGlTBxE3B0cq_209_1790960626927';
const targets = [
  { name: 'Coffee & Consent', path: 'venues/slug_upeisu/events/P0tSDGFBmFp9o2x2Xuvt' },
  { name: 'Sexy Sexual Health Trivia', path: 'venues/fb_100052099464909/events/ELp2wyMTX7TmCEMKlp2E' },
  { name: 'Go- Experience The Pride', path: 'venues/slug_upeiturffield/events/Li0eZIKcYCrqHWUqQlSO' },
];
const allowedFields = new Set(['mediaUrls', 'image', 'imageUrl', 'relevantImageUrl', 'imageProvenance']);
const key = JSON.parse(await fs.readFile(
  process.env.GATHR_SERVICE_ACCOUNT_PATH ||
    'C:/Users/craig/Dev/gathr-apps-script/firebase/service-account.json', 'utf8'));
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id });
}
const db = admin.firestore();

if (process.argv.includes('--apply')) {
  const plan = JSON.parse(await fs.readFile(planPath, 'utf8'));
  if (plan.snapshotId !== snapshotId || plan.entries.length !== targets.length ||
      plan.entries.some((entry, i) => entry.path !== targets[i].path)) {
    throw new Error('Repair plan identity mismatch');
  }
  await db.runTransaction(async tx => {
    const current = await Promise.all(plan.entries.map(entry => tx.get(db.doc(entry.path))));
    for (let i = 0; i < current.length; i++) {
      const doc = current[i];
      const entry = plan.entries[i];
      if (!doc.exists || doc.updateTime.seconds !== entry.updateTime.seconds ||
          doc.updateTime.nanoseconds !== entry.updateTime.nanoseconds ||
          doc.data().uniqueId !== entry.uniqueId) {
        throw new Error(`Target changed since plan: ${entry.path}`);
      }
    }
    for (const entry of plan.entries) {
      if (Object.keys(entry.updates).some(field => !allowedFields.has(field))) {
        throw new Error(`Unexpected repair field: ${entry.path}`);
      }
      tx.update(db.doc(entry.path), {
        ...entry.updates,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });
  console.log(JSON.stringify({ applied: true, paths: plan.entries.map(entry => entry.path) }));
  process.exit(0);
}

const source = (await db.collection('parse_snapshots').doc(snapshotId).get()).data();
if (source?.uniqueId !== '1739771728156396') throw new Error('Source snapshot mismatch');
const events = source.stages.find(stage => stage.stage === 'format')?.output?.events || [];
const gallery = events[0]?.imageProvenance?.media
  ?.filter(media => media.field === 'mediaUrls').map(media => media.url) || [];
if (gallery.length !== 3 || new Set(gallery).size !== 3) throw new Error('Expected three source gallery images');
const establishment = source.rowMeta.userName;
const row = {
  ...source.rowMeta, uniqueId: source.uniqueId, userName: establishment,
  pageName: source.rowMeta.pageName,
  text: source.inputText.split(/\bOCR TEXT\s*:/i)[0],
  facebookUrl: source.facebookUrl,
  mediaUrls: gallery,
  sourceScraperType: 'posts',
};
const match = await findMatchingVenue(establishment, row.facebookUrl);
if (!match.isMatch || !match.matchedVenue) throw new Error('Source venue no longer resolves');
const entries = [];
for (const target of targets) {
  const index = events.findIndex(event => event.name === target.name);
  if (index < 0) throw new Error(`Source event missing: ${target.name}`);
  const incoming = await previewFullParserEventWritePayload(
    { ...events[index], mediaUrls: gallery }, row, 209, index,
    match.matchedVenue, establishment);
  const doc = await db.doc(target.path).get();
  if (!doc.exists || !String(doc.data().uniqueId || '').startsWith('1739771728156396_') ||
      incoming.venueId !== doc.data().venueId) {
    throw new Error(`Target event identity mismatch: ${target.path}`);
  }
  const venueDoc = await db.collection('venues').doc(incoming.venueId).get();
  const preview = previewDuplicateMerge({
    existingEvent: { id: doc.id, ...doc.data() }, incomingEvent: incoming,
    venue: { id: venueDoc.id, ...venueDoc.data() },
  });
  if (preview.changedFields.length === 0 ||
      preview.changedFields.some(field => !allowedFields.has(field)) ||
      preview.updates.mediaUrls?.length !== 3 ||
      new Set(preview.updates.imageProvenance?.media
        ?.filter(media => media.source === 'post_media').map(media => media.url)).size !== 3) {
    throw new Error(`Unexpected repair preview: ${target.path}`);
  }
  entries.push({
    name: target.name, path: target.path, uniqueId: doc.data().uniqueId,
    updateTime: { seconds: doc.updateTime.seconds, nanoseconds: doc.updateTime.nanoseconds },
    changedFields: preview.changedFields,
    updates: preview.updates,
  });
}
await fs.writeFile(planPath, JSON.stringify({ snapshotId, gallery, entries }, null, 2));
console.log(JSON.stringify({ applied: false, planPath, entries: entries.map(entry => ({
  path: entry.path, fields: entry.changedFields, mediaCount: entry.updates.mediaUrls.length,
})) }));
