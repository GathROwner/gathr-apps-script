import fs from 'node:fs/promises';
import path from 'node:path';
import admin from 'firebase-admin';
import { extractContentByType } from '../lib/parsing/eventExtractor.js';

// Read-only Stage 3 trial using the original, complete post images. The
// production parser's temporary OCR tiles are deliberately not recreated.
// OPENAI_API_KEY must be supplied in this process's environment.
const [snapshotId, serviceAccountPath, reportPath] = process.argv.slice(2);
if (!snapshotId || !serviceAccountPath || !reportPath || !process.env.OPENAI_API_KEY) {
  throw new Error('Pass snapshot ID, service-account path, report path, and OPENAI_API_KEY');
}
const model = process.env.STAGE3_MODEL_OVERRIDE;
if (!['gpt-6-luna', 'gpt-6-sol', 'gpt-6.1-sol'].includes(model)) {
  throw new Error('STAGE3_MODEL_OVERRIDE must be gpt-6-luna, gpt-6-sol, or gpt-6.1-sol for this isolated trial');
}
if (process.env.STAGE3_IMAGE_DETAIL !== 'original') {
  throw new Error('STAGE3_IMAGE_DETAIL must be original for this full-image trial');
}
const reasoningEffort = process.env.STAGE3_COMPARISON_REASONING_EFFORT || (model === 'gpt-6-luna' ? 'none' : 'medium');
if (!['none', 'low', 'medium', 'high', 'xhigh', 'max'].includes(reasoningEffort)) {
  throw new Error('Unsupported reasoning effort for this isolated trial');
}

const serviceAccount = JSON.parse(await fs.readFile(serviceAccountPath, 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});
const snapshot = await admin.firestore().collection('parse_snapshots').doc(snapshotId).get();
if (!snapshot.exists) throw new Error(`Snapshot ${snapshotId} not found`);
const source = snapshot.data();
const contentType = process.env.TRIAL_CONTENT_TYPE || ({
  156: 'CALENDAR',
  158: 'EVENT',
  231: 'CALENDAR',
  255: 'CALENDAR',
  261: 'CALENDAR',
}[source.rowIndex]);
if (!['CALENDAR', 'SCHEDULE', 'EVENT', 'MIXED_EVENTS_AND_SPECIALS', 'FOOD_SPECIAL'].includes(contentType)) {
  throw new Error(`No reviewed content type for row ${source.rowIndex}`);
}
const mediaUrls = source.rowMeta?.mediaUrls || [];
if (!mediaUrls.length) throw new Error('Source snapshot has no media URLs');
const imageUrls = [];
const savedImagePaths = process.env.TRIAL_SOURCE_IMAGE_PATHS?.split(';').filter(Boolean) || [];
if (savedImagePaths.length && savedImagePaths.length !== mediaUrls.length) {
  throw new Error('Saved source image count must equal the snapshot media URL count');
}
for (let index = 0; index < mediaUrls.length; index++) {
  let bytes;
  let imageType;
  if (savedImagePaths.length) {
    const imagePath = savedImagePaths[index];
    bytes = await fs.readFile(imagePath);
    imageType = /\.png$/i.test(imagePath) ? 'image/png' :
      /\.webp$/i.test(imagePath) ? 'image/webp' :
      /\.gif$/i.test(imagePath) ? 'image/gif' : 'image/jpeg';
  } else {
    const response = await fetch(mediaUrls[index], { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Source image fetch failed: HTTP ${response.status}`);
    imageType = (response.headers.get('content-type') || '').split(';')[0];
    if (!/^image\/(jpeg|png|webp|gif)$/i.test(imageType)) {
      throw new Error(`Source media is not a supported image: ${imageType}`);
    }
    bytes = Buffer.from(await response.arrayBuffer());
  }
  imageUrls.push(`data:${imageType};base64,${bytes.toString('base64')}`);
}
const usage = [];
const start = Date.now();
const items = await extractContentByType(
  contentType,
  source.inputText,
  imageUrls,
  source.rowMeta.userName,
  source.rowMeta.timestamp,
  {
    gptModelReasoning: model,
    gptUsageHandler: (record) => usage.push(record),
  }
);
const rates = model === 'gpt-6-luna'
  ? { input: 0.10, cached: 0.01, write: 0.125, output: 0.50 }
  : model === 'gpt-6.1-sol'
    ? { input: 2.00, cached: 0.10, write: 2.50, output: 10.00 }
    : { input: 2.00, cached: 0.20, write: 2.50, output: 10.00 };
const costUsd = usage.reduce((sum, record) => {
  const input = record.inputTokens || 0;
  const cached = record.cachedInputTokens || 0;
  const writes = record.cacheWriteInputTokens || 0;
  const ordinary = Math.max(0, input - cached - writes);
  return sum + (ordinary * rates.input + cached * rates.cached + writes * rates.write + (record.outputTokens || 0) * rates.output) / 1_000_000;
}, 0);
const report = {
  snapshotId,
  rowIndex: source.rowIndex,
  uniqueId: source.uniqueId,
  establishment: source.establishment,
  contentType,
  imageCount: imageUrls.length,
  model,
  endpoint: 'responses',
  reasoningEffort,
  imageDetail: 'original',
  imageStrategy: 'original full source images, no OCR tiling',
  imageSource: savedImagePaths.length ? 'saved copy of original source image' : 'source media URL',
  elapsedMs: Date.now() - start,
  usage,
  estimatedCostUsd: costUsd,
  extractedItemCount: items.length,
  items: items.map((item) => ({
    name: item.name,
    date: item.date,
    startTime: item.startTime,
    endTime: item.endTime,
    venue: item.venue,
    recurringPattern: item.recurringPattern,
    description: item.description,
    extractionReason: item.extractionReason,
  })),
};
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  snapshotId,
  calls: usage.length,
  estimatedCostUsd: costUsd,
  extractedItemCount: items.length,
  elapsedMs: report.elapsedMs,
  reportPath,
}));
