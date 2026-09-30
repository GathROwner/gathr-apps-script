import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { parsePostData } from '../lib/parsing/postParser.js';

if (!process.env.OPENAI_API_KEY || process.env.IMAGE_UPLOAD_URL || process.env.IMAGE_DELETE_URL) {
  throw new Error('Guarded dry run only: existing key required, upload/delete URLs must be unset');
}
const root = path.resolve(import.meta.dirname, '../..');
const dir = path.join(root, 'artifacts/beer-garden-trial');
const requireBackend = createRequire('C:/Users/craig/Dev/gathr-apps-script/gathr-backend/package.json');
const sharp = requireBackend('sharp');
const poster = await fs.readFile(path.join(dir, 'preprocessed-cloudrun-calendar-color.webp'));
const bands = await Promise.all([1, 2, 3, 4].map(index =>
  fs.readFile(path.join(dir, `band-v1-${index}.webp`))));
const cover = await sharp(Buffer.from('<svg width="800" height="1000" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#17435a"/><text x="80" y="470" fill="white" font-size="65">Beer Garden</text><text x="80" y="560" fill="white" font-size="40">July Events</text></svg>')).webp().toBuffer();
const dataUrl = buffer => `data:image/webp;base64,${buffer.toString('base64')}`;
const posterUrl = dataUrl(poster);
const coverUrl = dataUrl(cover);
const bandUrls = bands.map(dataUrl);
const verified = JSON.parse(await fs.readFile(path.join(dir, 'headtohead-luna-four-band-r1.json')));
const verifiedItems = verified.artifacts.find(item => item.stage3Items)?.stage3Items || [];
const to24h = value => {
  const match = String(value || '').trim().match(/^(\d{1,2})(?::(\d\d))?\s*(am|pm)$/i);
  if (!match) throw new Error(`Unsupported expected time ${value}`);
  return `${String((Number(match[1]) % 12) + (match[3].toLowerCase() === 'pm' ? 12 : 0)).padStart(2, '0')}:${match[2] || '00'}`;
};
const expectedSlots = verifiedItems.filter(item => item.startTime)
  .map(item => `${item.date}@${to24h(item.startTime)}`);
if (expectedSlots.length !== 36) throw new Error('Expected 36 reviewed timed slots');
if (process.env.LUNA_DRY_RUN_FORCE_MISSING_SLOT === 'true') {
  expectedSlots.push('2026-07-31@23:59');
}

let ocrUploads = 0;
let displayUploads = 0;
let bandUploads = 0;
const managed = [
  'https://storage.googleapis.com/gathr-uploaded-images/postimages/dry-cover.webp',
  'https://storage.googleapis.com/gathr-uploaded-images/postimages/dry-calendar.webp',
];
const server = http.createServer(async (request, response) => {
  if (request.method === 'GET') {
    const body = request.url?.includes('cover.webp') ? cover : poster;
    response.writeHead(200, { 'Content-Type': 'image/webp' });
    response.end(body);
    return;
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks).toString('latin1');
  const field = name => body.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]+)`))?.[1] || '';
  let payload;
  if (field('tile') === 'calendar-bands-v1') {
    bandUploads++;
    payload = {
      imageUrl: posterUrl,
      imageUrls: [posterUrl, ...bandUrls],
      bandManifest: {
        version: 'calendar-bands-v1', eligible: true,
        reason: 'reviewed_row_boundaries', baseImageUrl: posterUrl,
        width: 2880, height: 3840,
        regions: bandUrls.map((imageUrl, index) => ({
          index, left: 355, top: [1080, 1700, 2245, 2795][index],
          width: 2180, height: [690, 615, 620, 855][index], imageUrl,
        })),
      },
    };
  } else if (field('ocr') === 'false') {
    payload = { imageUrl: managed[displayUploads++] };
  } else {
    payload = { imageUrl: [coverUrl, posterUrl][ocrUploads++] };
  }
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(payload));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const localOrigin = `http://127.0.0.1:${address.port}`;
const postId = 'dry-carousel-beer-calendar-band-v1';
process.env.IMAGE_UPLOAD_URL = `${localOrigin}/upload-image`;
process.env.LUNA_CANARY_ENABLED = 'true';
process.env.LUNA_CANARY_POST_IDS = postId;
process.env.LUNA_FOUR_BANDS_ENABLED = 'true';
process.env.LUNA_FOUR_BAND_RULES_JSON = JSON.stringify({
  [postId]: [{ sourceIndex: 1,
    crop: { left: 355, top: 1080, width: 2180, height: 2570 },
    cuts: [1735, 2280, 2830], expectedSlots }],
});
process.env.PARSER_DRY_RUN_LOCAL_IMAGES = 'false';
const artifacts = [], usage = [], skips = [];
let events = [];
try {
  events = await parsePostData({
    combinedText: 'Charlottetown Beer Garden and Seafood Patio JULY EVENTS calendar, July 2026. The first image is a cover; the second is the detailed July poster.',
    mediaUrls: [`${localOrigin}/cover.webp`, `${localOrigin}/poster.webp`], sharedPostThumbnails: [],
    userName: 'Charlottetown Beer Garden and Seafood Patio',
    pageName: 'Charlottetown Beer Garden and Seafood Patio',
    timestamp: '2026-07-01T12:00:00.000Z', facebookUrl: '', profilePicUrl: '',
    extractedData: { id: postId, postId },
  }, {}, {
    gptUsageHandler: item => usage.push(item),
    stageArtifactsHandler: item => artifacts.push(item),
    skipReasonHandler: item => skips.push(item),
  });
} finally {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
const frameManifest = artifacts.find(item => item.imageFrameManifest)?.imageFrameManifest || [];
if (JSON.stringify(events).includes('data:image/')) {
  throw new Error('Temporary analysis image leaked into a processed event');
}
const output = {
  postId, ocrUploads, displayUploads, bandUploads, expectedSlotCount: expectedSlots.length,
  stage3Count: artifacts.find(item => item.stage3Items)?.stage3Items?.length || 0,
  frameManifest, skips, usage, finalCount: events.length,
  events,
};
const runLabel = String(process.env.LUNA_DRY_RUN_LABEL || 'latest').replace(/[^a-zA-Z0-9_-]/g, '');
const outputPath = path.join(dir, `luna-band-v1-carousel-dryrun-${runLabel}.json`);
await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
console.log(JSON.stringify({ outputPath, ocrUploads, displayUploads, bandUploads,
  expectedSlotCount: expectedSlots.length, stage3Count: output.stage3Count,
  finalCount: output.finalCount, frameManifest,
  correctCalendarHeroCount: output.events.filter(event => event.relevantImageUrl === managed[1]).length,
  preservedGalleryCount: output.events.filter(event =>
    JSON.stringify(event.mediaUrls) === JSON.stringify(managed)).length,
  skips }));
