import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import admin from 'firebase-admin';

const fileId = '1OmFzDG0kWiY-k8C-8G6-oGlTBxE3B0cq';
const completion = Date.parse('2026-10-02T15:20:38Z');
const root = path.resolve(import.meta.dirname, '../..');
const outputDir = path.join(root, 'artifacts/luna-oct2-cohort',
  process.env.LUNA_COHORT_RUN_LABEL || '');
const keyPath = 'C:/Users/craig/Dev/gathr-apps-script/firebase/service-account.json';
if (!process.env.OPENAI_API_KEY || process.env.IMAGE_UPLOAD_URL || process.env.IMAGE_DELETE_URL) {
  throw new Error('Requires the existing API key and no configured image endpoints');
}
await fs.mkdir(outputDir, { recursive: true });
const key = JSON.parse(await fs.readFile(keyPath, 'utf8'));
// The parser imports firestoreService, which captures the *default* Admin app
// at module load. Initialize that credential before importing parser modules.
const app = admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id });
const db = admin.firestore(app);
const { parsePostData } = await import('../lib/parsing/postParser.js');
const { findRecoverableManagedSourceGallery } = await import('../lib/services/firestoreService.js');
const sharp = createRequire('C:/Users/craig/Dev/gathr-apps-script/gathr-backend/package.json')('sharp');

const all = await db.collection('parse_snapshots').where('fileId', '==', fileId).get();
const latestByRow = new Map();
for (const doc of all.docs) {
  const item = doc.data();
  const timestamp = item.createdAt?.toMillis?.() || 0;
  if (!timestamp || timestamp > completion) continue;
  const old = latestByRow.get(item.rowIndex);
  if (!old || old.data().createdAt.toMillis() < timestamp) latestByRow.set(item.rowIndex, doc);
}
const candidates = [...latestByRow.values()].map(doc => {
  const item = doc.data();
  const legacyEvents = (item.stages || []).find(stage => stage.stage === 'format')?.output?.events || [];
  return { doc, rowIndex: item.rowIndex, postId: String(item.uniqueId || ''),
    imageCount: item.rowMeta?.mediaUrls?.length || 0, legacyEvents };
}).filter(item => item.postId && item.imageCount >= 1 && item.imageCount <= 4);
const stress = [...candidates].sort((a, b) => b.legacyEvents.length - a.legacyEvents.length ||
  a.rowIndex - b.rowIndex).slice(0, 8);
const stressRows = new Set(stress.map(item => item.rowIndex));
const rank = item => createHash('sha256').update(`oct2-luna-cohort:${item.postId}`)
  .digest('hex');
const representative = candidates.filter(item => !stressRows.has(item.rowIndex))
  .sort((a, b) => rank(a).localeCompare(rank(b))).slice(0, 40);
const selected = [...representative.map(item => ({ ...item, cohort: 'representative' })),
  ...stress.map(item => ({ ...item, cohort: 'stress' }))];
await fs.writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify({
  fileId, completionUtc: new Date(completion).toISOString(),
  originalRows: latestByRow.size, eligibleRows: candidates.length,
  selection: '40 SHA256-ranked eligible rows outside the eight highest legacy-output rows; eight stress rows',
  rows: selected.map(item => ({ snapshotId: item.doc.id, rowIndex: item.rowIndex,
    postId: item.postId, cohort: item.cohort, imageCount: item.imageCount,
    legacyEventCount: item.legacyEvents.length })),
}, null, 2));

const start = Number(process.argv[2] || 0);
const count = Number(process.argv[3] || selected.length);
if (!Number.isInteger(start) || start < 0 || !Number.isInteger(count) || count < 1 ||
    start + count > selected.length) throw new Error('Pass a valid start and count');
process.env.LUNA_CANARY_ENABLED = 'true';
// This flag also suppresses the parser's venue-hours Firestore cache writes.
// Source HTTP URLs and the mocked upload endpoint still exercise the normal
// preprocessed full-image path because the URLs are not data:image URLs.
process.env.PARSER_DRY_RUN_LOCAL_IMAGES = 'true';
process.env.LUNA_FOUR_BANDS_ENABLED = 'false';
process.env.STAGE1_MODEL_OVERRIDE = 'gpt-5-mini';
process.env.STAGE2_MODEL_OVERRIDE = 'gpt-5-mini';
process.env.STAGE3_MODEL_OVERRIDE = 'gpt-5.2';
process.env.STAGE4_MODEL_OVERRIDE = 'gpt-5-nano';
process.env.STAGE5_MODEL_OVERRIDE = 'gpt-5-nano';

async function download(url) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`source image HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 8 * 1024 * 1024) throw new Error('source image exceeds 8 MiB');
      return bytes;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}
async function preprocess(bytes) {
  const base = sharp(bytes, { failOn: 'none' }).rotate();
  const metadata = await base.metadata();
  const min = Math.min(metadata.width, metadata.height);
  const max = Math.max(metadata.width, metadata.height);
  let scale = min < 1600 ? 1600 / min : 1;
  if (max * scale > 3200) scale = 3200 / max;
  const image = scale > 1.01 ? base.clone().resize(Math.round(metadata.width * scale),
    Math.round(metadata.height * scale), { kernel: sharp.kernel.lanczos3 }) : base.clone();
  return image.grayscale().normalize().sharpen().webp({ quality: 90 }).toBuffer();
}
const concise = event => ({ name: event.name, startDate: event.startDate,
  startTime: event.startTime, endDate: event.endDate, endTime: event.endTime,
  recurringPattern: event.recurringPattern, totalOccurrences: event.totalOccurrences,
  venue: event.venue, relevantImageIndex: event.relevantImageIndex,
  hasImage: Boolean(event.image), hasRelevantImageUrl: Boolean(event.relevantImageUrl) });

async function run(item) {
  const snapshot = item.doc.data();
  const row = item.rowIndex;
  let originals;
  let imageSource = 'original snapshot URLs';
  try {
    originals = await Promise.all(snapshot.rowMeta.mediaUrls.map(download));
  } catch (sourceError) {
    const recovered = await findRecoverableManagedSourceGallery(item.postId,
      snapshot.rowMeta.mediaUrls);
    if (!recovered || recovered.urls.length !== item.imageCount) throw sourceError;
    originals = await Promise.all(recovered.urls.map(download));
    imageSource = `exact-match managed gallery from ${recovered.snapshotId}`;
  }
  const processed = await Promise.all(originals.map(preprocess));
  const dataUrl = bytes => `data:image/webp;base64,${bytes.toString('base64')}`;
  let ocrUploads = 0;
  let displayUploads = 0;
  const server = http.createServer(async (request, response) => {
    const sourceMatch = /^\/source-(\d+)\.jpg$/.exec(request.url || '');
    if (request.method === 'GET' && sourceMatch && originals[Number(sourceMatch[1])]) {
      response.writeHead(200, { 'content-type': 'image/jpeg' }).end(originals[Number(sourceMatch[1])]);
      return;
    }
    if (request.method === 'POST' && request.url === '/delete-image') {
      response.writeHead(200, { 'content-type': 'application/json' }).end('{}');
      return;
    }
    if (request.method !== 'POST' || request.url !== '/upload-image') {
      response.writeHead(404).end();
      return;
    }
    const parts = [];
    for await (const part of request) parts.push(Buffer.from(part));
    const body = Buffer.concat(parts).toString('latin1');
    const display = body.includes('name="ocr"\r\n\r\nfalse');
    const index = display ? displayUploads++ : ocrUploads++;
    // Retry and fallback passes may upload the same ordered gallery again.
    // The local mock must keep serving those passes as production storage does.
    const sourceIndex = index % originals.length;
    const imageUrl = display
      ? `https://storage.googleapis.com/gathr-uploaded-images/postimages/dry-oct2-${row}-${sourceIndex}.webp`
      : dataUrl(processed[sourceIndex]);
    response.writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify({ imageUrl, imageUrls: [imageUrl] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  process.env.IMAGE_UPLOAD_URL = `${origin}/upload-image`;
  process.env.IMAGE_DELETE_URL = `${origin}/delete-image`;
  process.env.LUNA_CANARY_POST_IDS = item.postId;
  const usage = [];
  const skips = [];
  let events = [];
  let error = '';
  try {
    events = await parsePostData({
      combinedText: snapshot.inputText,
      mediaUrls: originals.map((_, index) => `${origin}/source-${index}.jpg`),
      sharedPostThumbnails: [],
      userName: snapshot.rowMeta.userName || snapshot.establishment || '',
      pageName: snapshot.rowMeta.pageName || snapshot.establishment || '',
      timestamp: snapshot.rowMeta.timestamp || '',
      facebookUrl: snapshot.facebookUrl || '',
      profilePicUrl: '', extractedData: { id: item.postId, postId: item.postId },
    }, {}, {
      gptUsageHandler: value => usage.push({ stage: value.stage, model: value.model,
        inputTokens: value.inputTokens, outputTokens: value.outputTokens }),
      skipReasonHandler: value => skips.push({ stage: value.stage, reason: value.reason,
        detail: value.detail }),
    });
  } catch (cause) { error = String(cause?.stack || cause); }
  finally {
    await new Promise(resolve => server.close(resolve));
    process.env.IMAGE_UPLOAD_URL = '';
    process.env.IMAGE_DELETE_URL = '';
  }
  if (ocrUploads < originals.length || (events.length > 0 && displayUploads < originals.length)) {
    error += ` upload counts: ocr=${ocrUploads} display=${displayUploads} expected=${originals.length}`;
  }
  return { snapshotId: item.doc.id, rowIndex: row, postId: item.postId, cohort: item.cohort,
    imageCount: originals.length, ocrUploads, displayUploads,
    method: `original saved caption and ordered gallery (${imageSource}); local Cloud Run Sharp transform; mocked uploads; no event writes`,
    legacyEvents: item.legacyEvents.map(concise), lunaEvents: events.map(concise), usage, skips, error };
}

for (let index = start; index < start + count; index++) {
  const item = selected[index];
  const resultPath = path.join(outputDir, `row-${String(item.rowIndex).padStart(3, '0')}.json`);
  if (await fs.stat(resultPath).then(() => true, () => false)) {
    console.log(JSON.stringify({ index, row: item.rowIndex, status: 'existing' }));
    continue;
  }
  let result;
  try { result = await run(item); }
  catch (cause) { result = { snapshotId: item.doc.id, rowIndex: item.rowIndex,
    postId: item.postId, cohort: item.cohort, imageCount: item.imageCount,
    legacyEvents: item.legacyEvents.map(concise), lunaEvents: [],
    error: String(cause?.stack || cause), unavailable: true }; }
  await fs.writeFile(resultPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ index, row: item.rowIndex, cohort: item.cohort,
    legacy: result.legacyEvents.length, luna: result.lunaEvents.length,
    error: result.error?.slice(0, 160) || '', models: [...new Set((result.usage || []).map(x => x.model))] }));
}
