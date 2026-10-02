import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { parseSharedEventPayloads } from '../lib/processing/sharedEventParser.js';

if (!process.env.OPENAI_API_KEY || process.env.IMAGE_UPLOAD_URL || process.env.IMAGE_DELETE_URL) {
  throw new Error('Requires the existing API key and no configured image write endpoints');
}

const root = path.resolve(import.meta.dirname, '../..');
const sourceDir = path.join(root, 'artifacts/luna-source-recovery-2026-10-01');
const output = path.join(root, 'artifacts/luna-source-recovery-2026-10-01/pints-shared-parity-dryrun.json');
const source = await Promise.all([0, 1, 2].map(index =>
  fs.readFile(path.join(sourceDir, `pints-managed-${index}.webp`))));
const requireBackend = createRequire('C:/Users/craig/Dev/gathr-apps-script/gathr-backend/package.json');
const sharp = requireBackend('sharp');
const { Settings } = createRequire(import.meta.url)('luxon');
const prepared = await Promise.all(source.map(async bytes => {
  const base = sharp(bytes, { failOn: 'none' }).rotate();
  const metadata = await base.metadata();
  const minSide = Math.min(metadata.width, metadata.height);
  const maxSide = Math.max(metadata.width, metadata.height);
  let scale = minSide < 1600 ? 1600 / minSide : 1;
  if (maxSide * scale > 3200) scale = 3200 / maxSide;
  const image = scale > 1.01
    ? base.resize(Math.round(metadata.width * scale), Math.round(metadata.height * scale),
      { kernel: sharp.kernel.lanczos3 })
    : base;
  return image.grayscale().normalize().sharpen().webp({ quality: 90 }).toBuffer();
}));

let origin = '';
let uploads = 0;
let deletes = 0;
const server = http.createServer(async (request, response) => {
  const match = /^\/(source|base)-(\d+)\.webp$/.exec(request.url || '');
  if (request.method === 'GET' && match) {
    const index = Number(match[2]);
    const bytes = match[1] === 'source' ? source[index] : prepared[index];
    if (!bytes) { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': 'image/webp' });
    response.end(bytes);
    return;
  }
  if (request.url?.includes('delete-image')) {
    deletes++;
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end('{}');
    return;
  }
  if (request.url?.includes('upload-image')) {
    for await (const _chunk of request) { /* drain uploaded image */ }
    const index = uploads++;
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ imageUrl: `${origin}/base-${index}.webp` }));
    return;
  }
  response.writeHead(404).end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
origin = `http://127.0.0.1:${server.address().port}`;
process.env.IMAGE_UPLOAD_URL = `${origin}/upload-image`;
process.env.IMAGE_DELETE_URL = `${origin}/delete-image`;
const previousNow = Settings.now;
Settings.now = () => new Date('2026-10-01T12:00:00.000Z').getTime();
try {
  const events = await parseSharedEventPayloads({
    title: 'Pints East Bay Boogie festival schedule',
    description: 'One week away from our Bay Boogie festival at Pints East on October 3, 2026. See the schedule and vendor list in these images.',
    mediaUrls: source.map((_, index) => `${origin}/source-${index}.webp`),
    sourcePlatform: 'unknown',
    visibilityHint: 'private',
  }, {
    sourceVisibility: 'user_private',
    visibilityEvidence: {
      method: 'share_payload_hint', checkedAt: '2026-10-01T12:00:00.000Z',
      sourcePublishedAt: '2026-09-27T12:00:00.000Z',
      reason: 'Local dry-run fixture of the recovered source gallery.',
    },
  }, { lunaHighCalendarPilot: true });
  const summary = {
    sourceImageCount: source.length, uploads, deletes,
    eventCount: events.length,
    privateCount: events.filter(event => event.routing === 'private_only').length,
    events: events.map(event => ({ date: event.startDate, time: event.startTime,
      title: event.title, venue: event.locationName, routing: event.routing,
      needsUserReview: event.needsUserReview, sourceImageCount: event.mediaUrls.length })),
  };
  await fs.writeFile(output, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ output, sourceImageCount: source.length, uploads, deletes,
    eventCount: summary.eventCount, privateCount: summary.privateCount }));
} finally {
  Settings.now = previousNow;
  delete process.env.IMAGE_UPLOAD_URL;
  delete process.env.IMAGE_DELETE_URL;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
