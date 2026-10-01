import fs from 'node:fs/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import admin from 'firebase-admin';

const [snapshotId, serviceAccountPath, sourceImagePath, backendUploadUrl, reportPath,
  localStorageKeyPath] = process.argv.slice(2);
if (!snapshotId || !serviceAccountPath || !sourceImagePath || !backendUploadUrl || !reportPath ||
    !process.env.OPENAI_API_KEY || process.env.IMAGE_UPLOAD_URL || process.env.IMAGE_DELETE_URL) {
  throw new Error('Requires snapshot, service account, saved image, backend upload URL, report path, API key, and no configured image endpoints');
}
const localBackend = backendUploadUrl === 'local';
if (!localBackend) {
  const endpoint = new URL(backendUploadUrl);
  if (endpoint.protocol !== 'https:' || !endpoint.pathname.endsWith('/upload-image')) {
    throw new Error('Expected HTTPS backend /upload-image endpoint');
  }
}
if (localBackend && !localStorageKeyPath) throw new Error('Local backend mode requires a storage key path');
const backendDeleteUrl = localBackend ? '' : backendUploadUrl.replace(/\/upload-image\/?$/, '/delete-image');
const imageBytes = await fs.readFile(sourceImagePath);
let localBucket = null;
let localUrls = null;
if (localBackend) {
  const requireBackend = createRequire('C:/Users/craig/Dev/gathr-apps-script/gathr-backend/package.json');
  const sharp = requireBackend('sharp');
  const { Storage } = requireBackend('@google-cloud/storage');
  const storage = new Storage({ projectId: 'fb-post-processor', keyFilename: localStorageKeyPath });
  localBucket = storage.bucket('gathr-uploaded-images');
  const base = sharp(imageBytes, { failOn: 'none' }).rotate();
  const metadata = await base.metadata();
  let ocr = base.clone();
  const minSide = Math.min(metadata.width, metadata.height);
  const maxSide = Math.max(metadata.width, metadata.height);
  let scale = minSide < 1600 ? 1600 / minSide : 1;
  if (maxSide * scale > 3200) scale = 3200 / maxSide;
  if (scale > 1.01) ocr = ocr.resize(Math.round(metadata.width * scale),
    Math.round(metadata.height * scale), { kernel: sharp.kernel.lanczos3 });
  const ocrBytes = await ocr.grayscale().normalize().sharpen().webp({ quality: 90 }).toBuffer();
  const displayBytes = await base.clone().webp({ quality: 80 }).toBuffer();
  const baseName = `postimages/luna-seawalk-dryrun-${Date.now()}`;
  const objectNames = { ocr: `${baseName}-ocr.webp`, display: `${baseName}-display.webp` };
  for (const [kind, bytes] of [['ocr', ocrBytes], ['display', displayBytes]]) {
    await localBucket.file(objectNames[kind]).save(bytes, {
      metadata: { contentType: 'image/webp' },
    });
  }
  const prefix = 'https://storage.googleapis.com/gathr-uploaded-images/';
  localUrls = Object.fromEntries(Object.entries(objectNames).map(([kind, name]) =>
    [kind, `${prefix}${name}`]));
  await fs.writeFile(reportPath.replace(/\.json$/, '-preprocessed.webp'), ocrBytes);
}
const serviceAccount = JSON.parse(await fs.readFile(serviceAccountPath, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id });
const { parsePostData } = await import('../lib/parsing/postParser.js');
const { previewFullParserEventWritePayload } = await import('../lib/processing/rowProcessor.js');
const { findMatchingVenue } = await import('../lib/services/firestoreService.js');
const firestore = admin.firestore();
const snapshot = await firestore.collection('parse_snapshots').doc(snapshotId).get();
if (!snapshot.exists) throw new Error(`Snapshot ${snapshotId} not found`);
const source = snapshot.data();
const postId = String(source.uniqueId || '');
if (!postId || (source.rowMeta?.mediaUrls || []).length !== 1) {
  throw new Error('Exact-post dry run requires a post ID and one source image');
}

const uploaded = new Set();
const backendCalls = [];
let localOrigin = '';
const server = http.createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/source.jpg') {
      response.writeHead(200, { 'content-type': 'image/jpeg' });
      response.end(imageBytes);
      return;
    }
    if (request.method !== 'POST' || !['/upload-image', '/delete-image'].includes(request.url)) {
      response.writeHead(404).end();
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    const isUpload = request.url === '/upload-image';
    const kind = isUpload && bytes.toString('latin1').includes('name="ocr"\r\n\r\nfalse')
      ? 'display' : isUpload ? 'ocr' : 'delete';
    if (localBackend) {
      if (isUpload) {
        const imageUrl = localUrls[kind];
        uploaded.add(imageUrl);
        backendCalls.push({ kind, status: 200, imageCount: 1 });
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ imageUrl, imageUrls: [imageUrl] }));
      } else {
        const imageUrl = JSON.parse(bytes.toString('utf8')).imageUrl;
        const objectName = String(imageUrl).replace('https://storage.googleapis.com/gathr-uploaded-images/', '');
        try { await localBucket.file(objectName).delete(); } catch { /* idempotent test cleanup */ }
        backendCalls.push({ kind, status: 200, imageCount: 0 });
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('{}');
      }
      return;
    }
    const target = isUpload ? backendUploadUrl : backendDeleteUrl;
    const result = await fetch(target, {
      method: 'POST',
      headers: { 'content-type': String(request.headers['content-type'] || 'application/json') },
      body: bytes,
    });
    const body = await result.text();
    let parsed = {};
    try { parsed = JSON.parse(body); } catch { /* status is still reported */ }
    if (isUpload && result.ok) {
      for (const url of parsed.imageUrls || [parsed.imageUrl]) if (url) uploaded.add(String(url));
      if (kind === 'ocr' && parsed.imageUrl) {
        const prepared = await fetch(parsed.imageUrl);
        if (prepared.ok) {
          await fs.writeFile(reportPath.replace(/\.json$/, '-preprocessed.webp'),
            Buffer.from(await prepared.arrayBuffer()));
        }
      }
    }
    backendCalls.push({ kind, status: result.status, imageCount: isUpload
      ? (parsed.imageUrls || [parsed.imageUrl]).filter(Boolean).length : 0 });
    response.writeHead(result.status, { 'content-type': result.headers.get('content-type') || 'application/json' });
    response.end(body);
  } catch (error) {
    backendCalls.push({ kind: 'proxy_error', message: error instanceof Error ? error.message : String(error) });
    response.writeHead(502, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'backend proxy failed' }));
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
localOrigin = `http://127.0.0.1:${server.address().port}`;

process.env.IMAGE_UPLOAD_URL = `${localOrigin}/upload-image`;
process.env.IMAGE_DELETE_URL = `${localOrigin}/delete-image`;
process.env.LUNA_CANARY_ENABLED = 'true';
process.env.LUNA_CANARY_POST_IDS = postId;
process.env.STAGE1_MODEL_OVERRIDE = 'gpt-5-mini';
process.env.STAGE2_MODEL_OVERRIDE = 'gpt-5-mini';
process.env.STAGE3_MODEL_OVERRIDE = 'gpt-5.2';
process.env.STAGE4_MODEL_OVERRIDE = 'gpt-5-nano';
process.env.STAGE5_MODEL_OVERRIDE = 'gpt-5-nano';
process.env.PARSER_DRY_RUN_LOCAL_IMAGES = 'false';

const usage = [];
const skips = [];
const report = { snapshotId, postId, backendCalls, events: [], payloads: [], skips, usage,
  rowVenue: null, cleanup: [] };
try {
  const establishment = String(source.rowMeta?.userName || source.establishment || '');
  const sourceUrl = `${localOrigin}/source.jpg`;
  const row = {
    ...source.rowMeta,
    uniqueId: postId,
    userName: establishment,
    pageName: String(source.rowMeta?.pageName || establishment),
    text: String(source.rowMeta?.text || source.inputText || '').split(/\bOCR TEXT\s*:/i)[0],
    timestamp: String(source.rowMeta?.timestamp || ''),
    facebookUrl: String(source.facebookUrl || source.rowMeta?.facebookUrl || ''),
    mediaUrls: [sourceUrl],
    sourceScraperType: String(source.rowMeta?.sourceScraperType || 'posts'),
  };
  const rowMatch = await findMatchingVenue(establishment, row.facebookUrl || undefined);
  const rowVenue = rowMatch.isMatch ? rowMatch.matchedVenue : null;
  report.rowVenue = rowVenue ? { id: rowVenue.id, name: rowVenue.name } : null;
  const events = await parsePostData({
    combinedText: source.inputText,
    mediaUrls: [sourceUrl], sharedPostThumbnails: [],
    userName: establishment, pageName: row.pageName,
    timestamp: row.timestamp, facebookUrl: row.facebookUrl,
    profilePicUrl: '', extractedData: { id: postId, postId },
  }, {}, {
    gptUsageHandler: item => usage.push({ stage: item.stage, model: item.model,
      inputTokens: item.inputTokens, outputTokens: item.outputTokens }),
    skipReasonHandler: item => skips.push({ stage: item.stage, reason: item.reason }),
  });
  report.events = events.map(({ name, description, category, startDate, startTime, endTime, recurringPattern,
    relevantImageIndex, image, relevantImageUrl, mediaUrls, imageProvenance, venue }) => ({
    name, description, category, startDate, startTime, endTime, recurringPattern, relevantImageIndex,
    image, relevantImageUrl, mediaUrls, imageProvenance, venue,
  }));
  for (let index = 0; index < events.length; index++) {
    try {
      const payload = await previewFullParserEventWritePayload(
        events[index], row, Number(source.rowIndex || 149), index, rowVenue, establishment);
      report.payloads.push({ name: events[index].name, description: payload.description,
        category: payload.category, venueId: payload.venueId,
        establishment: payload.establishment, startDate: payload.startDate,
        startTime: payload.startTime, endTime: payload.endTime,
        recurringPattern: payload.recurringPattern, isRecurring: payload.isRecurring,
        image: payload.image, relevantImageUrl: payload.relevantImageUrl,
        mediaUrls: payload.mediaUrls, imageProvenance: payload.imageProvenance,
        uniqueId: payload.uniqueId });
    } catch (error) {
      report.payloads.push({ name: events[index].name,
        error: error instanceof Error ? error.message : String(error) });
    }
  }
} finally {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  for (const imageUrl of uploaded) {
    try {
      if (localBackend) {
        const objectName = imageUrl.replace('https://storage.googleapis.com/gathr-uploaded-images/', '');
        try {
          await localBucket.file(objectName).delete();
          report.cleanup.push({ imageUrl, status: 200 });
        } catch (error) {
          report.cleanup.push({ imageUrl, alreadyDeleted: /not found|no such object/i.test(String(error)),
            error: error instanceof Error ? error.message : String(error) });
        }
      } else {
        const deleted = await fetch(backendDeleteUrl, { method: 'POST',
          headers: { 'content-type': 'application/json' }, body: JSON.stringify({ imageUrl }) });
        const body = await deleted.text();
        report.cleanup.push({ imageUrl, status: deleted.status,
          alreadyDeleted: /no such object/i.test(body) });
      }
    } catch (error) {
      report.cleanup.push({ imageUrl, error: error instanceof Error ? error.message : String(error) });
    }
  }
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ reportPath, eventCount: report.events.length,
    payloadCount: report.payloads.filter(item => !item.error).length,
    backendCalls, cleanup: report.cleanup.map(({ status, alreadyDeleted, error }) =>
      ({ status, alreadyDeleted, error })),
    failures: report.payloads.filter(item => item.error) }));
}
