import fs from 'node:fs/promises';
import admin from 'firebase-admin';
import { parsePostData } from '../lib/parsing/postParser.js';

const [snapshotId, serviceAccountPath, sourceImagePath] = process.argv.slice(2);
if (!snapshotId || !serviceAccountPath || !sourceImagePath || !process.env.OPENAI_API_KEY) {
  throw new Error('Pass snapshot ID, service account path, source image path, and API key');
}

// This route reads one saved snapshot and runs the five parser stages locally.
// It never calls the Firestore write path or the managed image upload endpoints.
process.env.PARSER_DRY_RUN_LOCAL_IMAGES = 'true';
process.env.IMAGE_UPLOAD_URL = '';
process.env.IMAGE_DELETE_URL = '';
process.env.LUNA_CANARY_ENABLED = 'true';
process.env.STAGE1_MODEL_OVERRIDE = 'gpt-5-mini';
process.env.STAGE2_MODEL_OVERRIDE = 'gpt-5-mini';
process.env.STAGE3_MODEL_OVERRIDE = 'gpt-5.2';
process.env.STAGE4_MODEL_OVERRIDE = 'gpt-5-nano';
process.env.STAGE5_MODEL_OVERRIDE = 'gpt-5-nano';

const serviceAccount = JSON.parse(await fs.readFile(serviceAccountPath, 'utf8'));
const snapshotApp = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
}, 'pilotSnapshotRead');
const snapshot = await admin.firestore(snapshotApp).collection('parse_snapshots').doc(snapshotId).get();
if (!snapshot.exists) throw new Error(`Snapshot ${snapshotId} not found`);
const source = snapshot.data();
const postId = String(source.uniqueId || '');
if (!postId || (source.rowMeta?.mediaUrls || []).length !== 1) {
  throw new Error('Pilot requires an exact post ID and one source image');
}
process.env.LUNA_CANARY_POST_IDS = postId;
const image = `data:image/jpeg;base64,${(await fs.readFile(sourceImagePath)).toString('base64')}`;
const usage = [];
const skips = [];
const priorOutput = (source.stages || []).find((entry) => entry?.stage === 'format')?.output;
const events = await parsePostData({
  combinedText: source.inputText,
  mediaUrls: [image],
  sharedPostThumbnails: [],
  userName: source.rowMeta?.userName || source.establishment || '',
  pageName: source.rowMeta?.pageName || source.establishment || '',
  timestamp: source.rowMeta?.timestamp || '',
  facebookUrl: source.facebookUrl || '',
  profilePicUrl: '',
  extractedData: { id: postId, postId },
}, {}, {
  gptUsageHandler: (item) => usage.push(item),
  skipReasonHandler: (item) => skips.push(item),
});
console.log(JSON.stringify({
  snapshotId,
  postId,
  priorParse: {
    eventCount: priorOutput?.eventCount ?? null,
    events: (priorOutput?.events || []).map(({ name, startDate, startTime, recurringPattern }) =>
      ({ name, startDate, startTime, recurringPattern })),
  },
  eventCount: events.length,
  stages: usage.map(({ stage, model, inputTokens, outputTokens }) => ({ stage, model, inputTokens, outputTokens })),
  skips: skips.map(({ stage, reason }) => ({ stage, reason })),
  events: events.map(({ name, startDate, startTime, endTime, isRecurring, recurringPattern,
    venue, relevantImageIndex, relevantImageUrl, image }) =>
    ({ name, startDate, startTime, endTime, isRecurring, recurringPattern,
      venue, relevantImageIndex, hasRelevantImageUrl: Boolean(relevantImageUrl),
      hasDisplayImage: Boolean(image) })),
}, null, 2));
