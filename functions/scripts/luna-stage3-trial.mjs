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
if (process.env.STAGE3_MODEL_OVERRIDE !== 'gpt-6-luna') {
  throw new Error('STAGE3_MODEL_OVERRIDE must be gpt-6-luna for this isolated trial');
}
if (process.env.STAGE3_IMAGE_DETAIL !== 'original') {
  throw new Error('STAGE3_IMAGE_DETAIL must be original for this full-image trial');
}

const serviceAccount = JSON.parse(await fs.readFile(serviceAccountPath, 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});
const snapshot = await admin.firestore().collection('parse_snapshots').doc(snapshotId).get();
if (!snapshot.exists) throw new Error(`Snapshot ${snapshotId} not found`);
const source = snapshot.data();
const contentType = {
  156: 'CALENDAR',
  158: 'EVENT',
  231: 'CALENDAR',
  255: 'CALENDAR',
  261: 'CALENDAR',
}[source.rowIndex];
if (!contentType) throw new Error(`No reviewed content type for row ${source.rowIndex}`);
const mediaUrls = source.rowMeta?.mediaUrls || [];
if (!mediaUrls.length) throw new Error('Source snapshot has no media URLs');
const imageUrls = [];
for (const url of mediaUrls) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Source image fetch failed: HTTP ${response.status}`);
  const contentTypeHeader = response.headers.get('content-type') || '';
  if (!/^image\/(jpeg|png|webp|gif)/i.test(contentTypeHeader)) {
    throw new Error(`Source media is not a supported image: ${contentTypeHeader}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  imageUrls.push(`data:${contentTypeHeader.split(';')[0]};base64,${bytes.toString('base64')}`);
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
    gptModelReasoning: 'gpt-6-luna',
    gptUsageHandler: (record) => usage.push(record),
  }
);
const costUsd = usage.reduce((sum, record) => {
  const input = record.inputTokens || 0;
  const cached = record.cachedInputTokens || 0;
  const writes = record.cacheWriteInputTokens || 0;
  const ordinary = Math.max(0, input - cached - writes);
  return sum + (ordinary * 0.10 + cached * 0.01 + writes * 0.125 + (record.outputTokens || 0) * 0.50) / 1_000_000;
}, 0);
const report = {
  snapshotId,
  rowIndex: source.rowIndex,
  uniqueId: source.uniqueId,
  establishment: source.establishment,
  contentType,
  imageCount: imageUrls.length,
  model: 'gpt-6-luna',
  endpoint: 'responses',
  reasoningEffort: 'none',
  imageDetail: 'original',
  imageStrategy: 'original full source images, no OCR tiling',
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
