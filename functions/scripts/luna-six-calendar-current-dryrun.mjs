import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { parsePostData } from '../lib/parsing/postParser.js';

const id = process.argv[2];
const label = process.argv[3] || 'r1';
if (!['photo-01', 'photo-02', 'photo-03', 'photo-04', 'photo-05', 'photo-06'].includes(id) ||
    (!process.env.OPENAI_API_KEY && process.env.HELDOUT_PREVIEW_ONLY !== 'true') ||
    process.env.IMAGE_UPLOAD_URL || process.env.IMAGE_DELETE_URL) {
  throw new Error('Guarded local dry run: reviewed photo with verified year, existing key, no upload/delete endpoints');
}
const root = path.resolve(import.meta.dirname, '../..');
const fixtureRoot = 'C:/Users/craig/.codex/worktrees/luna-parser-cost-trial/gathr-apps-script/artifacts/calendar-heldout-photos-2026-09-30';
const dir = path.join(fixtureRoot, 'eval', id);
const outputDir = path.join(root, 'artifacts/luna-six-calendars-2026-10-02', id);
await fs.mkdir(outputDir, { recursive: true });
const sharp = createRequire('C:/Users/craig/Dev/gathr-apps-script/gathr-backend/package.json')('sharp');
const cases = {
  'photo-01': { venue: 'The Factory Downtown', month: 'September', timestamp: '2026-09-01T12:00:00.000Z',
    crop: { left: 650, top: 950, width: 1880, height: 2430 }, cuts: [2040, 2500, 2980],
    expectedSlots: ['2026-09-01@16:00', '2026-09-10@22:00', '2026-09-20@19:00', '2026-09-26@19:00', '2026-09-30@16:00'],
    expectedNames: [{ date: '2026-09-05', name: 'Music Bingo! with Darcy', requireFinal: true, allowDescription: true },
      { date: '2026-09-20', name: 'Ben Albert', requireFinal: true }],
    roomAliases: ['Comedy Cave'] },
  'photo-02': { venue: "Hunter's Ale House", month: 'June', timestamp: '2026-06-01T12:00:00.000Z',
    crop: { left: 300, top: 800, width: 2220, height: 2900 }, cuts: [2125, 2670, 3190],
    expectedSlots: ['2026-06-01@22:00', '2026-06-11@23:00', '2026-06-18@23:00', '2026-06-25@23:00', '2026-06-30@21:00'],
    expectedNames: [{ date: '2026-06-05', name: 'Masters of Reality' },
      { date: '2026-06-05', name: 'The Jailbirds', allowDescription: true },
      { date: '2026-06-27', name: 'Laura & Don' }] },
  'photo-03': { venue: 'The Factory Downtown', month: 'June', timestamp: '2026-06-01T12:00:00.000Z',
    crop: { left: 150, top: 180, width: 2500, height: 3660 }, cuts: [1600, 2200, 2800],
    expectedSlots: ['2026-06-02@16:00', '2026-06-05@18:45', '2026-06-05@20:45',
      '2026-06-06@14:00', '2026-06-06@19:00', '2026-06-13@20:00',
      '2026-06-21@20:00', '2026-06-30@16:00'],
    expectedNames: [{ date: '2026-06-05', name: 'Shawn Hogan', requireFinal: true },
      { date: '2026-06-06', name: 'They Improv', requireFinal: true },
      { date: '2026-06-13', name: 'Jalen MacLeod', requireFinal: true },
      { date: '2026-06-21', name: 'Bidhur Walia', requireFinal: true }],
    roomAliases: ['Comedy Cave', 'The Comedy Cave'] },
  'photo-04': { venue: "Hunter's Ale House", month: 'May', timestamp: '2026-05-01T12:00:00.000Z',
    crop: { left: 400, top: 550, width: 2140, height: 3290 }, cuts: [1660, 2190, 2720],
    expectedSlots: ['2026-05-03@21:00', '2026-05-07@23:00',
      '2026-05-14@23:00', '2026-05-28@23:00', '2026-05-31@21:00'],
    expectedNames: [{ date: '2026-05-07', name: 'Carter MacLellan', requireFinal: true },
      { date: '2026-05-14', name: 'Matt & Jeff', requireFinal: true },
      { date: '2026-05-15', name: 'Laura & Donovan' },
      { date: '2026-05-16', name: 'Crimson Clay' },
      { date: '2026-05-21', name: 'Ryan Merry', requireFinal: true },
      { date: '2026-05-28', name: 'Brad & Isaac', requireFinal: true },
      { date: '2026-05-29', name: 'Dead Seasons' },
      { date: '2026-05-29', name: 'Supernaut' },
      { date: '2026-05-30', name: 'Nice Boys' },
      { date: '2026-05-30', name: 'The HeartFakers' }] },
  'photo-05': { venue: 'The Factory Downtown', month: 'March', timestamp: '',
    crop: { left: 250, top: 580, width: 2130, height: 3000 }, cuts: [1640, 2130, 2630],
    expectedSlots: [], expectedNames: [], yearUnresolved: true },
  'photo-06': { venue: 'The Factory Downtown', month: 'February', timestamp: '2026-02-01T12:00:00.000Z',
    crop: { left: 180, top: 200, width: 2400, height: 3370 }, cuts: [1670, 2210, 2760],
    expectedSlots: ['2026-02-03@16:00', '2026-02-07@20:00',
      '2026-02-12@19:00', '2026-02-14@19:00', '2026-02-28@19:00'],
    expectedNames: [{ date: '2026-02-07', name: 'Stand-up Night', requireFinal: true },
      { date: '2026-02-08', name: 'Super Bowl LX Watch Party' },
      { date: '2026-02-12', name: 'Early Trivia with Darcy', requireFinal: true, allowDescription: true },
      { date: '2026-02-14', name: 'Music Bingo', requireFinal: true }],
    roomAliases: ['Comedy Cave', 'The Comedy Cave', 'The Cave'] },
};
const item = cases[id];
const automaticEqualBands = process.env.HELDOUT_AUTO_BANDS === 'true';
if (automaticEqualBands) {
  // Deliberately source-agnostic control: no reviewed crop boundaries or
  // source-name/slot hints. Do not use this layout for production routing.
  item.crop = { left: 0, top: 0, width: 2880, height: 3840 };
  item.cuts = [960, 1920, 2880];
  // The live exact-post protocol requires four reviewed sentinel slots. Keep
  // the four existing non-target sentinels so the diagnostic can inspect the
  // February 3 omission without a known-answer gate deciding the result.
  item.expectedSlots = item.expectedSlots.slice(-4);
  item.expectedNames = [];
}
const base = await fs.readFile(path.join(dir, 'cloudrun-calendar-base.webp'));
const color = await fs.readFile(path.join(dir, 'cloudrun-calendar-color.webp'));
const original = await fs.readFile(path.join(fixtureRoot, `${id}.jpg`));
const image = buffer => `data:image/webp;base64,${buffer.toString('base64')}`;
const baseUrl = image(base);
const originalUrl = `data:image/jpeg;base64,${original.toString('base64')}`;
const overlap = automaticEqualBands ? 280 :
  Math.min(60, Math.max(24, Math.round(item.crop.height * 0.014)));
const edges = [item.crop.top, ...item.cuts, item.crop.top + item.crop.height];
const regions = [0, 1, 2, 3].map(index => {
  const top = Math.max(item.crop.top, edges[index] - (index ? overlap : 0));
  const bottom = Math.min(item.crop.top + item.crop.height, edges[index + 1] + (index < 3 ? overlap : 0));
  return { index, left: item.crop.left, top, width: item.crop.width, height: bottom - top };
});
const bands = await Promise.all(regions.map(async region => {
  const { left, top, width, height } = region;
  const result = await sharp(color).extract({ left, top, width, height }).webp({ quality: 90 }).toBuffer();
  await fs.writeFile(path.join(outputDir, `reviewed-band-${region.index + 1}.webp`), result);
  return result;
}));
const bandUrls = bands.map(image);
if (process.env.HELDOUT_PREVIEW_ONLY === 'true') {
  console.log(JSON.stringify({ id, regions, preview: true }));
  process.exit(0);
}
let ocrUploads = 0, displayUploads = 0, bandUploads = 0;
const managed = `https://storage.googleapis.com/gathr-uploaded-images/postimages/dry-${id}.webp`;
const server = http.createServer(async (request, response) => {
  if (request.method === 'GET') {
    response.writeHead(200, { 'Content-Type': 'image/jpeg' });
    response.end(original);
    return;
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks).toString('latin1');
  const field = name => body.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]+)`))?.[1] || '';
  let payload;
  if (field('tile') === 'calendar-bands-v1') {
    bandUploads++;
    payload = { imageUrl: baseUrl, imageUrls: [baseUrl, ...bandUrls],
      bandManifest: { version: 'calendar-bands-v1', eligible: true,
        reason: automaticEqualBands ? 'diagnostic_equal_height_bands' : 'reviewed_row_boundaries',
        baseImageUrl: baseUrl, width: 2880, height: 3840,
        regions: regions.map((region, index) => ({ ...region, imageUrl: bandUrls[index] })) } };
  } else if (field('ocr') === 'false') {
    displayUploads++;
    payload = { imageUrl: managed };
  } else {
    ocrUploads++;
    payload = { imageUrl: baseUrl };
  }
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(payload));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const local = `http://127.0.0.1:${server.address().port}`;
const postId = `dry-heldout-${id}`;
process.env.IMAGE_UPLOAD_URL = `${local}/upload-image`;
process.env.LUNA_CANARY_ENABLED = 'true';
process.env.LUNA_CANARY_POST_IDS = postId;
process.env.LUNA_FOUR_BANDS_ENABLED = item.yearUnresolved ? 'false' : 'true';
const diagnosticNameGuardBypass = process.env.HELDOUT_DIAGNOSTIC_IGNORE_NAME_GUARD === 'true';
process.env.LUNA_FOUR_BAND_RULES_JSON = item.yearUnresolved ? '{}' : JSON.stringify({ [postId]: [{ sourceIndex: 0,
  crop: item.crop, cuts: item.cuts, expectedSlots: item.expectedSlots,
  expectedNames: diagnosticNameGuardBypass ? [] : item.expectedNames,
  hostVenue: item.venue, roomAliases: item.roomAliases || [] }] });
process.env.PARSER_DRY_RUN_LOCAL_IMAGES = 'false';
const usage = [], artifacts = [], skips = [];
let events = [], error = '';
const started = Date.now();
try {
  events = await parsePostData({ combinedText: item.yearUnresolved
    ? `${item.venue} March calendar photograph; original post date and calendar year are unavailable. A separate May promotion is also visible.`
    : `${item.venue} ${item.month} 2026 events calendar.`,
    mediaUrls: [`${local}/poster.jpg`], sharedPostThumbnails: [],
    userName: item.venue, pageName: item.venue, timestamp: item.timestamp,
    facebookUrl: '', profilePicUrl: '', extractedData: { id: postId, postId },
  }, {}, { gptUsageHandler: value => usage.push(value), stageArtifactsHandler: value => artifacts.push(value),
    skipReasonHandler: value => skips.push(value) });
} catch (cause) { error = String(cause?.stack || cause); }
finally { await new Promise(resolve => server.close(resolve)); }
const output = { id, label, method: automaticEqualBands
  ? 'unreviewed equal-height full-image four bands with 280-pixel overlap'
  : 'reviewed full-width four bands with exact-post Luna high route',
  stage3Effort: process.env.LUNA_CANARY_STAGE3_REASONING_EFFORT || 'high',
  literalSourcePrompt: process.env.LUNA_CALENDAR_LITERAL_SOURCE_PROMPT === 'true',
  yearUnresolved: Boolean(item.yearUnresolved),
  diagnosticNameGuardBypass,
  sourceImage: `${id}.jpg`, sourceUrl: originalUrl.slice(0, 30) + '[omitted]', crop: item.crop, cuts: item.cuts,
  regions, expectedSlots: item.expectedSlots, ocrUploads, displayUploads, bandUploads,
  latencyMs: Date.now() - started, usage, skips, error,
  frameManifest: artifacts.find(value => value.imageFrameManifest)?.imageFrameManifest || [],
  stage3Items: artifacts.find(value => value.stage3Items)?.stage3Items || [], events };
if (JSON.stringify(output.events).includes('data:image/')) throw new Error('Analysis image leaked into final event');
const outputPath = path.join(outputDir, `luna-high-reviewed-${label}.json`);
await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
console.log(JSON.stringify({ outputPath, stage3Count: output.stage3Items.length,
  finalCount: events.length, skips, error, usage, latencyMs: output.latencyMs }));
