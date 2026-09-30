import fs from 'node:fs/promises';
import path from 'node:path';
import { parsePostData } from '../lib/parsing/postParser.js';

if (!process.env.OPENAI_API_KEY || process.env.IMAGE_UPLOAD_URL || process.env.IMAGE_DELETE_URL ||
    process.env.PARSER_DRY_RUN_LOCAL_IMAGES !== 'true') {
  throw new Error('Requires existing API key, local images, and no image write endpoints');
}
const root = path.resolve(import.meta.dirname, '../..');
const imagePath = path.join(root, 'artifacts/cornfest-attachment-trial/photo-4-cloudrun-base.webp');
const image = `data:image/webp;base64,${(await fs.readFile(imagePath)).toString('base64')}`;
const selectedId = 'luna-canary-routing-smoke';
process.env.LUNA_CANARY_ENABLED = 'true';
process.env.LUNA_CANARY_POST_IDS = selectedId;
process.env.STAGE1_MODEL_OVERRIDE = 'gpt-5-mini';
process.env.STAGE2_MODEL_OVERRIDE = 'gpt-5-mini';
process.env.STAGE3_MODEL_OVERRIDE = 'gpt-5.2';
process.env.STAGE4_MODEL_OVERRIDE = 'gpt-5-nano';
process.env.STAGE5_MODEL_OVERRIDE = 'gpt-5-nano';

async function run(id, text, mediaUrls) {
  const usage = [];
  const skips = [];
  const events = await parsePostData({
    combinedText: text, mediaUrls, sharedPostThumbnails: [],
    userName: 'Town of Cornwall PEI', pageName: 'Town of Cornwall PEI',
    timestamp: '2026-09-18T12:00:00.000Z', facebookUrl: '', profilePicUrl: '',
    extractedData: { id, postId: id },
  }, {}, { gptUsageHandler: (item) => usage.push(item), skipReasonHandler: (item) => skips.push(item) });
  return {
    id, eventCount: events.length, stages: usage.map(({ stage, model }) => ({ stage, model })),
    skipReasons: skips.map(({ stage, reason }) => ({ stage, reason })),
  };
}

const selected = await run(selectedId,
  'Town of Cornwall PEI Cornfest vendor market and yard sale Saturday September 26, 2026, 8:30 AM–11:30 AM, Terry Fox Sports Complex.',
  [image]);
const unselected = await run('luna-canary-other-post',
  'Town of Cornwall PEI Cornfest vendor market and yard sale Saturday September 26, 2026, 8:30 AM–11:30 AM, Terry Fox Sports Complex.',
  []);
const selectedModels = selected.stages.map((entry) => entry.model);
const unselectedModels = unselected.stages.map((entry) => entry.model);
if (!selectedModels.includes('gpt-6-luna') || selectedModels.some((model) => model !== 'gpt-6-luna')) {
  throw new Error(`Selected route was not all Luna: ${JSON.stringify(selected)}`);
}
if (unselectedModels.includes('gpt-6-luna')) {
  throw new Error(`Unselected route used Luna: ${JSON.stringify(unselected)}`);
}
console.log(JSON.stringify({ selected, unselected }));
