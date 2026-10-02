import fs from 'node:fs/promises';
import path from 'node:path';
import admin from 'firebase-admin';
import { processEvents } from '../lib/parsing/postParser.js';
import { checkDuplicate, findMatchingVenue } from '../lib/services/firestoreService.js';
import { previewFullParserEventWritePayload } from '../lib/processing/rowProcessor.js';

const root = path.resolve(import.meta.dirname, '../..');
const snapshotId = '1um-iVMpR_c0xhUimqoOqEMx3tXY0l2Qj_94_1790971315612';
const postId = '1941319207262021';
// Five consecutive objects uploaded immediately before the production run's
// Display image upload summary (input=5, distinct=5, uploaded=5, failed=0).
const displayUrls = [
  '1790971254926-itke0n.webp',
  '1790971255645-550dtj.webp',
  '1790971256004-lc3q01.webp',
  '1790971256410-pn3p4o.webp',
  '1790971256808-ni2sua.webp',
].map(name => `https://storage.googleapis.com/gathr-uploaded-images/postimages/${name}`);

const key = JSON.parse(await fs.readFile('C:/Users/craig/Dev/gathr-apps-script/firebase/service-account.json', 'utf8'));
const app = admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id }, 'clamdiggersFinalGalleryPreview');
const db = admin.firestore(app);
const snapshot = await db.collection('parse_snapshots').doc(snapshotId).get();
if (!snapshot.exists || snapshot.data()?.uniqueId !== postId || snapshot.data()?.rowMeta?.mediaUrls?.length !== 5) {
  throw new Error('Final snapshot or five-image source gallery changed');
}
const source = snapshot.data();
const formatted = source.stages.find(stage => stage.stage === 'format')?.output?.events || [];
if (formatted.length !== 2 || new Set(displayUrls).size !== 5) {
  throw new Error('Expected two seatings and five distinct display images');
}
const establishment = String(source.rowMeta?.userName || source.establishment || '');
const processed = processEvents(
  formatted, establishment, String(source.facebookUrl || ''), '',
  displayUrls, displayUrls, [],
  { id: postId, postId, imageMediaSource: 'post_media', imageMediaSourceReason: 'source_post_media' },
);
const row = {
  ...source.rowMeta,
  uniqueId: postId,
  userName: establishment,
  pageName: String(source.rowMeta?.pageName || establishment),
  text: String(source.rowMeta?.text || source.inputText || '').split(/\bOCR TEXT\s*:/i)[0],
  timestamp: String(source.rowMeta?.timestamp || ''),
  facebookUrl: String(source.facebookUrl || source.rowMeta?.facebookUrl || ''),
  mediaUrls: source.rowMeta.mediaUrls,
  sourceScraperType: String(source.rowMeta?.sourceScraperType || 'posts'),
};
const match = await findMatchingVenue(establishment, row.facebookUrl || undefined);
const rowVenue = match.isMatch ? match.matchedVenue : null;
const payloads = [];
for (let index = 0; index < processed.length; index++) {
  const event = processed[index];
  const payload = await previewFullParserEventWritePayload(event, row, 94, index, rowVenue, establishment);
  const duplicate = await checkDuplicate(payload, payload.venueId, []);
  payloads.push({
    name: payload.name,
    date: payload.startDate,
    startTime: payload.startTime,
    endTime: payload.endTime || '',
    venueId: payload.venueId,
    mediaUrls: payload.mediaUrls || [],
    relevantImageUrl: payload.relevantImageUrl || '',
    imageProvenanceCount: payload.imageProvenance?.media?.length || 0,
    duplicateEventId: duplicate.existingEvent?.id || '',
  });
}
if (payloads.length !== 2 || payloads.some(p => p.mediaUrls.length !== 5 ||
    p.mediaUrls.some((url, index) => url !== displayUrls[index]) ||
    !p.mediaUrls.includes(p.relevantImageUrl)) ||
    new Set(payloads.map(p => p.duplicateEventId)).size !== 2) {
  throw new Error('Gallery, hero, or duplicate target gate failed');
}
const output = {
  snapshotId,
  postId,
  method: 'production processEvents plus read-only write-payload and duplicate preview',
  displayUploadLog: { runId: 'e8c67b6b-e27e-4582-9e05-3da10ec0b366', inputCount: 5, sourceDeduplicatedCount: 5, uploadedCount: 5, failedCount: 0 },
  sourceGalleryCount: source.rowMeta.mediaUrls.length,
  payloads,
};
const outputPath = path.join(root, 'artifacts/luna-live-canary-2026-10-02/clamdiggers-final-gallery-preview.json');
await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
console.log(JSON.stringify({ outputPath, count: payloads.length, mediaCounts: payloads.map(p => p.mediaUrls.length),
  duplicateTargets: payloads.map(p => p.duplicateEventId) }));
