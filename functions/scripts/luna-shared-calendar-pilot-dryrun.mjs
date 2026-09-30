import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { parseSharedEventPayloads } from '../lib/processing/sharedEventParser.js';

if (!process.env.OPENAI_API_KEY || process.env.IMAGE_UPLOAD_URL || process.env.IMAGE_DELETE_URL) {
  throw new Error('Requires existing API key and no configured image write endpoints');
}
const mode = process.argv[2] === 'legacy' ? 'legacy' : 'luna-high';
const root = path.resolve(import.meta.dirname, '../..');
const { Settings } = createRequire(import.meta.url)('luxon');
const dir = path.join(root, 'artifacts/calendar-heldout-photos-2026-09-30');
const source = await fs.readFile(path.join(dir, 'photo-06.jpg'));
const prepared = await fs.readFile(path.join(dir, 'eval/photo-06/cloudrun-calendar-base.webp'));
let origin = '';
let uploadCount = 0;
let deleteCount = 0;
const server = http.createServer(async (request, response) => {
  if (request.method === 'GET') {
    const isBase = request.url?.includes('base.webp');
    response.writeHead(200, { 'Content-Type': isBase ? 'image/webp' : 'image/jpeg' });
    response.end(isBase ? prepared : source);
    return;
  }
  if (request.url?.includes('delete')) {
    deleteCount++;
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end('{}');
    return;
  }
  for await (const _chunk of request) { /* drain upload */ }
  uploadCount++;
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ imageUrl: `${origin}/base.webp` }));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
origin = `http://127.0.0.1:${address.port}`;
process.env.IMAGE_UPLOAD_URL = `${origin}/upload-image`;
process.env.IMAGE_DELETE_URL = `${origin}/delete-image`;
const previousNow = Settings.now;
Settings.now = () => new Date('2026-02-01T12:00:00.000Z').getTime();
if (mode === 'legacy') process.env.PARSER_DRY_RUN_LOCAL_IMAGES = 'true';
try {
  const events = await parseSharedEventPayloads({
    title: 'The Factory Downtown February 2026 calendar',
    description: 'February 2026 calendar of events',
    mediaUrls: [mode === 'legacy'
      ? `data:image/jpeg;base64,${source.toString('base64')}`
      : `${origin}/photo-06.jpg`],
    sourcePlatform: 'unknown',
    visibilityHint: 'private',
  }, {
    sourceVisibility: 'user_private',
    visibilityEvidence: {
      method: 'share_payload_hint', checkedAt: '2026-02-01T12:00:00.000Z',
      reason: 'User supplied a private photo.',
    },
  }, { lunaHighCalendarPilot: mode === 'luna-high' });
  const summary = {
    mode, uploadCount, deleteCount, eventCount: events.length,
    privateCount: events.filter(event => event.routing === 'private_only').length,
    extractedCount: events.filter(event => event.extractedFromShare).length,
    datedCount: events.filter(event => event.startDate).length,
    names: events.map(event => ({ date: event.startDate, time: event.startTime,
      title: event.title, routing: event.routing })),
  };
  const output = path.join(dir, `eval/photo-06/shared-${mode}-pilot-dryrun.json`);
  await fs.writeFile(output, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ output, uploadCount, deleteCount, eventCount: summary.eventCount,
    privateCount: summary.privateCount, extractedCount: summary.extractedCount,
    datedCount: summary.datedCount }));
} finally {
  Settings.now = previousNow;
  delete process.env.IMAGE_UPLOAD_URL;
  delete process.env.IMAGE_DELETE_URL;
  delete process.env.PARSER_DRY_RUN_LOCAL_IMAGES;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
