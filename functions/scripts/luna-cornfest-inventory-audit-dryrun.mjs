import fs from 'node:fs/promises';
import path from 'node:path';
import { parsePostData } from '../lib/parsing/postParser.js';

if (!process.env.OPENAI_API_KEY || process.env.IMAGE_UPLOAD_URL || process.env.IMAGE_DELETE_URL) {
  throw new Error('Local dry run requires existing API key and no image upload/delete endpoints');
}
const root = path.resolve(import.meta.dirname, '../..');
const paths = process.argv.slice(2);
if (paths.length !== 4) {
  throw new Error('Pass four preprocessed Cornfest gallery image paths in source order');
}
const imageUrls = await Promise.all(paths.map(async imagePath =>
  `data:image/webp;base64,${(await fs.readFile(imagePath)).toString('base64')}`));
const postId = 'dry-cornfest-inventory-audit';
process.env.PARSER_DRY_RUN_LOCAL_IMAGES = 'true';
process.env.LUNA_CANARY_ENABLED = 'true';
process.env.LUNA_CANARY_POST_IDS = postId;
process.env.LUNA_FOUR_BANDS_ENABLED = 'false';
const artifacts = [], usage = [], skips = [], audits = [];
const events = await parsePostData({
  combinedText: 'Town of Cornwall PEI post, September 18, 2026. CORNWALL CORNFEST STARTS NEXT WEEK! September 24th–27th, 2026. Check out all the events happening during Cornwall Cornfest. Registration required for select events; call 902-628-6260.',
  mediaUrls: imageUrls, sharedPostThumbnails: [],
  userName: 'Town of Cornwall PEI', pageName: 'Town of Cornwall PEI',
  timestamp: '2026-09-18T12:00:00.000Z', facebookUrl: '', profilePicUrl: '',
  extractedData: { id: postId, postId },
}, {}, {
  calendarInventoryAudit: {
    enabled: true, estimatedItemCount: 0,
    frameSourceGalleryIndices: [], denseFrameIndices: [], maxFrames: 2,
    applyAdditions: process.env.LUNA_DRY_RUN_APPLY_INVENTORY === 'true',
    handler: snapshot => audits.push(snapshot),
  },
  stageArtifactsHandler: snapshot => artifacts.push(snapshot),
  gptUsageHandler: record => usage.push(record),
  skipReasonHandler: reason => skips.push(reason),
});
const stage3 = artifacts.find(item => item.stage3Items)?.stage3Items || [];
const stage4 = artifacts.find(item => item.stage4Items)?.stage4Items || [];
const manifest = artifacts.find(item => item.imageFrameManifest)?.imageFrameManifest || [];
const report = {
  postId, imagePaths: paths, noFirestoreWrites: true,
  stage3Count: stage3.length, stage4Count: stage4.length,
  finalCount: events.length, manifest, audit: audits, skips,
  usage: usage.map(({ stage, model, component, inputTokens, outputTokens, cachedInputTokens }) =>
    ({ stage, model, component, inputTokens, outputTokens, cachedInputTokens })),
  stage3Items: stage3.map(({ name, date, startTime, relevantImageIndex }) =>
    ({ name, date, startTime, relevantImageIndex })),
  events: events.map(({ name, startDate, startTime, endTime, relevantImageIndex,
    imageProvenance }) => ({ name, startDate, startTime, endTime,
    relevantImageIndex, imageProvenance })),
};
const runLabel = String(process.env.LUNA_DRY_RUN_LABEL || 'full-pipeline')
  .replace(/[^a-zA-Z0-9_-]/g, '');
const outputPath = path.join(root,
  `artifacts/cornfest-google-chat-2026-10-01/cornfest-inventory-audit-${runLabel}.json`);
await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ outputPath, stage3Count: report.stage3Count,
  stage4Count: report.stage4Count, finalCount: report.finalCount,
  audits: audits.map(audit => ({ estimated: audit.estimatedItemCount,
    primary: audit.primaryItemCount, frames: audit.readFrameIndices,
    additions: audit.reconciliation.additions.map(item => item.title),
    applied: audit.appliedAdditionCount,
    conflicts: audit.reconciliation.conflicts.map(item => item.listing.title),
    unresolved: audit.unresolvedListings.length })),
  usage: report.usage, skips: skips.map(item => item.reason) }));
