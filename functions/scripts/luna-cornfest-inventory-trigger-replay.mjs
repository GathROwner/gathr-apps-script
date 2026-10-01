import fs from 'node:fs/promises';
import path from 'node:path';
import { auditCalendarInventory } from '../lib/parsing/eventExtractor.js';
import { DEFAULT_PARSING_CONFIG } from '../lib/parsing/types.js';

if (!process.env.OPENAI_API_KEY || process.env.IMAGE_UPLOAD_URL || process.env.IMAGE_DELETE_URL) {
  throw new Error('Read-only replay requires existing API key and no image endpoints');
}
const root = path.resolve(import.meta.dirname, '../..');
const [priorPath, ...paths] = process.argv.slice(2);
if (!priorPath || paths.length !== 4) {
  throw new Error('Pass saved 13-item summary and four preprocessed gallery images in source order');
}
const prior = JSON.parse(await fs.readFile(priorPath, 'utf8'));
if (prior.events.length !== 13) throw new Error('Expected saved 13-item canary baseline');
const images = await Promise.all(paths.map(async value =>
  `data:image/webp;base64,${(await fs.readFile(value)).toString('base64')}`));
const primary = prior.events.map(event => ({
  name: event.name, date: event.date, startTime: event.startTime,
  type: 'event', venue: event.venue || '',
}));
const usage = [], snapshots = [];
await auditCalendarInventory(primary, images, {
  ...DEFAULT_PARSING_CONFIG,
  stage3ModelOverride: 'gpt-6-luna', stage3ReasoningEffort: 'high',
  stage3ImageDetail: 'original',
  gptUsageHandler: item => usage.push(item),
  calendarInventoryAudit: {
    enabled: true, estimatedItemCount: 15,
    frameSourceGalleryIndices: [0, 1, 2, 3],
    denseFrameIndices: [1, 2], maxFrames: 2,
    handler: snapshot => snapshots.push(snapshot),
  },
});
const snapshot = snapshots[0];
if (!snapshot) throw new Error('Inventory audit did not run for the saved count shortfall');
const report = { noFirestoreWrites: true, imagePaths: paths,
  primaryCountBefore: primary.length, primaryCountAfter: primary.length,
  snapshot, usage: usage.map(({ model, component, inputTokens, outputTokens,
    cachedInputTokens }) => ({ model, component, inputTokens,
      outputTokens, cachedInputTokens })) };
const outputPath = path.join(root,
  'artifacts/cornfest-google-chat-2026-10-01/cornfest-inventory-trigger-replay.json');
await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ outputPath, primaryCount: primary.length,
  readFrames: snapshot.readFrameIndices,
  matched: snapshot.reconciliation.matched.length,
  additions: snapshot.reconciliation.additions.map(item => ({ title: item.title,
    date: item.date, time: item.startTime, sourceGalleryIndex: item.sourceGalleryIndex })),
  conflicts: snapshot.reconciliation.conflicts.map(item => ({
    title: item.listing.title, reason: item.reason })),
  unresolved: snapshot.unresolvedListings,
  usage: report.usage }));
