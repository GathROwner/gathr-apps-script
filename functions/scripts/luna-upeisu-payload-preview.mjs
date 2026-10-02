import fs from 'node:fs/promises';
import path from 'node:path';
import admin from 'firebase-admin';
import { findMatchingVenue } from '../lib/services/firestoreService.js';
import { previewFullParserEventWritePayload } from '../lib/processing/rowProcessor.js';

const root = path.resolve(import.meta.dirname, '../..');
const dir = path.join(root, 'artifacts/luna-fresh-upeisu-2026-10-02');
const label = process.argv[2] || 'r1';
if (!/^(?:r[1-9]\d?|legacy)$/.test(label)) throw new Error('Use an rN or legacy run label');
const outputLabel = process.argv[3] || label;
if (!/^[a-z0-9][a-z0-9-]{0,32}$/.test(outputLabel)) throw new Error('Invalid output label');
const run = label === 'legacy'
  ? { snapshotId: '1OmFzDG0kWiY-k8C-8G6-oGlTBxE3B0cq_209_1790950676816',
      postId: '1739771728156396', events: [] }
  : JSON.parse(await fs.readFile(path.join(dir, `luna-high-dryrun-${label}.json`), 'utf8'));
const key = JSON.parse(await fs.readFile('C:/Users/craig/Dev/gathr-apps-script/firebase/service-account.json', 'utf8'));
const readApp = admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id }, 'upeisuPayloadRead');
const snapshot = await admin.firestore(readApp).collection('parse_snapshots').doc(run.snapshotId).get();
if (!snapshot.exists || snapshot.data().uniqueId !== run.postId) throw new Error('Source snapshot identity mismatch');
const source = snapshot.data();
if (label === 'legacy') run.events = source.stages.find(stage => stage.stage === 'format')?.output?.events || [];
const establishment = String(source.rowMeta?.userName || source.establishment || '');
const row = {
  ...source.rowMeta, uniqueId: run.postId, userName: establishment,
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
for (let index = 0; index < run.events.length; index++) {
  const event = run.events[index];
  try {
    const payload = await previewFullParserEventWritePayload(
      event, row, Number(source.rowIndex || 209), index, rowVenue, establishment);
    payloads.push({ name: event.name, date: payload.startDate, time: payload.startTime,
      venueId: payload.venueId || '', image: payload.relevantImageUrl || payload.image || '',
      recurringPattern: payload.recurringPattern || 'none', error: '' });
  } catch (cause) {
    payloads.push({ name: event.name, error: cause instanceof Error ? cause.message : String(cause) });
  }
}
const outputPath = path.join(dir, `payload-preview-${outputLabel}.json`);
await fs.writeFile(outputPath, JSON.stringify({ snapshotId: run.snapshotId,
  rowVenue: rowVenue ? { id: rowVenue.id, name: rowVenue.name } : null,
  payloads }, null, 2));
console.log(JSON.stringify({ outputPath, count: payloads.length, good: payloads.filter(x => !x.error).length,
  errors: payloads.filter(x => x.error), venueIds: [...new Set(payloads.map(x => x.venueId))] }));
