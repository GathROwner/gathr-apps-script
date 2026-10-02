import fs from 'node:fs/promises';
import path from 'node:path';
import admin from 'firebase-admin';
import { checkDuplicate, findMatchingVenue } from '../lib/services/firestoreService.js';
import { previewFullParserEventWritePayload } from '../lib/processing/rowProcessor.js';

const root = path.resolve(import.meta.dirname, '../..');
const dir = path.join(root, 'artifacts/luna-live-canary-2026-10-02');
const datasetId = '1OmFzDG0kWiY-k8C-8G6-oGlTBxE3B0cq';
const postId = '1615048507081168';
const snapshotId = process.argv[2] || `${datasetId}_144_1790948212452`;
const label = process.argv[3] || 'legacy';
if (!new RegExp(`^${datasetId}_144_\\d+$`).test(snapshotId) || !/^[a-z0-9-]{1,32}$/.test(label)) {
  throw new Error('Unexpected source snapshot or output label');
}
const key = JSON.parse(await fs.readFile('C:/Users/craig/Dev/gathr-apps-script/firebase/service-account.json', 'utf8'));
const app = admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id }, 'museumPayloadPreview');
const db = admin.firestore(app);
const snapshot = await db.collection('parse_snapshots').doc(snapshotId).get();
if (!snapshot.exists || snapshot.data()?.uniqueId !== postId || snapshot.data()?.rowMeta?.mediaUrls?.length !== 4) {
  throw new Error('Snapshot identity or four-image source gallery changed');
}
const source = snapshot.data();
const events = source.stages.find(stage => stage.stage === 'format')?.output?.events || [];
const establishment = String(source.rowMeta?.userName || source.establishment || '');
const row = {
  ...source.rowMeta, uniqueId: postId, userName: establishment,
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
for (let index = 0; index < events.length; index++) {
  const event = events[index];
  try {
    const payload = await previewFullParserEventWritePayload(event, row, 144, index, rowVenue, establishment);
    const duplicate = await checkDuplicate(payload, payload.venueId, []);
    payloads.push({ name: event.name, date: payload.startDate, time: payload.startTime,
      endTime: payload.endTime, uniqueId: payload.uniqueId, venueId: payload.venueId,
      recurringPattern: payload.recurringPattern || '', totalOccurrences: payload.totalOccurrences || null,
      recurrenceUntilDate: payload.recurrenceUntilDate || '', category: payload.category,
      image: payload.relevantImageUrl || payload.image || '',
      gallery: payload.imageProvenance?.media?.filter(x => x.source === 'post_media').map(x => x.url) || [],
      duplicate: { isDuplicate: duplicate.isDuplicate, eventId: duplicate.existingEvent?.id || '',
        existingName: duplicate.existingEvent?.name || '',
        existingUniqueId: duplicate.existingEvent?.uniqueId || '' }, error: '' });
  } catch (cause) {
    payloads.push({ name: event.name, error: cause instanceof Error ? cause.message : String(cause) });
  }
}
const outputPath = path.join(dir, `museum-preview-${label}.json`);
await fs.writeFile(outputPath, JSON.stringify({ snapshotId, postId, rowVenue: rowVenue?.id || null, payloads }, null, 2));
console.log(JSON.stringify({ outputPath, count: payloads.length, good: payloads.filter(x => !x.error).length,
  payloads: payloads.map(({ gallery, ...x }) => ({ ...x, galleryCount: new Set(gallery).size })) }));
