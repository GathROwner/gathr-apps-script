import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import admin from 'firebase-admin';
import { parsePostData } from '../lib/parsing/postParser.js';

if (!process.env.OPENAI_API_KEY || process.env.IMAGE_UPLOAD_URL || process.env.IMAGE_DELETE_URL) {
  throw new Error('Requires existing API key and no configured image endpoints');
}
const root = path.resolve(import.meta.dirname, '../..');
const dir = path.join(root, 'artifacts/luna-fresh-upeisu-2026-10-02');
const label = process.argv[2] || 'r1';
if (!/^r[1-9]\d?$/.test(label)) throw new Error('Use an rN run label');
const outputPath = path.join(dir, `luna-high-dryrun-${label}.json`);
if (await fs.stat(outputPath).then(() => true, () => false)) throw new Error('Run label already recorded');
const snapshotId = '1OmFzDG0kWiY-k8C-8G6-oGlTBxE3B0cq_209_1790950676816';
const key = JSON.parse(await fs.readFile('C:/Users/craig/Dev/gathr-apps-script/firebase/service-account.json', 'utf8'));
const readApp = admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id }, 'upeisuFreshRead');
const snapshot = await admin.firestore(readApp).collection('parse_snapshots').doc(snapshotId).get();
if (!snapshot.exists) throw new Error('Saved source snapshot missing');
const source = snapshot.data();
const postId = String(source.uniqueId || '');
if (postId !== '1739771728156396' || source.rowMeta?.mediaUrls?.length !== 3) {
  throw new Error('Source identity or ordered gallery changed');
}
const sharp = createRequire('C:/Users/craig/Dev/gathr-apps-script/gathr-backend/package.json')('sharp');
const originals = await Promise.all([0, 1, 2].map(i => fs.readFile(path.join(dir, `original-${i}.jpg`))));
const processed = await Promise.all(originals.map(async bytes => {
  const base = sharp(bytes, { failOn: 'none' }).rotate();
  const m = await base.metadata();
  let scale = Math.min(m.width, m.height) < 1600 ? 1600 / Math.min(m.width, m.height) : 1;
  if (Math.max(m.width, m.height) * scale > 3200) scale = 3200 / Math.max(m.width, m.height);
  const ocr = scale > 1.01
    ? base.clone().resize(Math.round(m.width * scale), Math.round(m.height * scale), { kernel: sharp.kernel.lanczos3 })
    : base.clone();
  return ocr.grayscale().normalize().sharpen().webp({ quality: 90 }).toBuffer();
}));
await Promise.all(processed.map((bytes, i) => fs.writeFile(path.join(dir, `preprocessed-${i}.webp`), bytes)));
const dataUrl = bytes => `data:image/webp;base64,${bytes.toString('base64')}`;
const managed = [0, 1, 2].map(i => `https://storage.googleapis.com/gathr-uploaded-images/postimages/dry-upeisu-${i}.webp`);
let ocrUploads = 0, displayUploads = 0;
const server = http.createServer(async (request, response) => {
  const match = /^\/source-(\d)\.jpg$/.exec(request.url || '');
  if (request.method === 'GET' && match && originals[Number(match[1])]) {
    response.writeHead(200, { 'content-type': 'image/jpeg' }).end(originals[Number(match[1])]);
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
  if (index > 2) {
    response.writeHead(400).end('Unexpected extra image upload');
    return;
  }
  const imageUrl = display ? managed[index] : dataUrl(processed[index]);
  response.writeHead(200, { 'content-type': 'application/json' })
    .end(JSON.stringify({ imageUrl, imageUrls: [imageUrl] }));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
process.env.IMAGE_UPLOAD_URL = `${origin}/upload-image`;
process.env.LUNA_CANARY_ENABLED = 'true';
process.env.LUNA_CANARY_POST_IDS = postId;
process.env.LUNA_FOUR_BANDS_ENABLED = 'false';
process.env.PARSER_DRY_RUN_LOCAL_IMAGES = 'false';
const usage = [], artifacts = [], skips = [];
let events = [], error = '';
try {
  events = await parsePostData({
    combinedText: source.inputText,
    mediaUrls: [0, 1, 2].map(i => `${origin}/source-${i}.jpg`),
    sharedPostThumbnails: [],
    userName: source.rowMeta.userName,
    pageName: source.rowMeta.pageName,
    timestamp: source.rowMeta.timestamp,
    facebookUrl: source.facebookUrl || '',
    profilePicUrl: '',
    extractedData: { id: postId, postId },
  }, {}, {
    gptUsageHandler: value => usage.push(value),
    stageArtifactsHandler: value => artifacts.push(value),
    skipReasonHandler: value => skips.push(value),
  });
} catch (cause) { error = String(cause?.stack || cause); }
finally { await new Promise(resolve => server.close(resolve)); }
const output = { snapshotId, postId, sourceImageCount: originals.length, ocrUploads, displayUploads,
  method: 'exact saved caption and ordered original gallery, local Cloud Run Sharp transform and upload mock, Firestore read only',
  usage, skips, error, frameManifest: artifacts.find(x => x.imageFrameManifest)?.imageFrameManifest || [],
  stage3Items: artifacts.find(x => x.stage3Items)?.stage3Items || [], events };
if (JSON.stringify(output.events).includes('data:image/')) throw new Error('Analysis image leaked into final events');
await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
console.log(JSON.stringify({ outputPath, ocrUploads, displayUploads, stage3Count: output.stage3Items.length,
  finalCount: events.length, models: usage.map(x => x.model), skips, error }));
