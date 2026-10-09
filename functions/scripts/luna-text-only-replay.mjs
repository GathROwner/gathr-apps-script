// Run after npm run build. Supply the existing task credential through
// OPENAI_API_KEY and the production STAGE*/LUNA_* settings through the environment.
// node scripts/luna-text-only-replay.mjs --input cases.json --output local-results
// --without-quota also exercises the selected-row routing path.
import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
if (!args.includes('--input') || !args.includes('--output') || !process.env.OPENAI_API_KEY) {
  throw new Error('Require --input, --output, and OPENAI_API_KEY. No credentials are saved.');
}
const input = JSON.parse(await fs.readFile(path.resolve(option('--input')), 'utf8'));
if (!Array.isArray(input)) throw new Error('Input must be an array of captured caption-only cases.');
for (const item of input) {
  if (!item.postId || !item.caption || !item.timestamp ||
      [...(item.mediaUrls || []), ...(item.sharedPostThumbnails || [])].some(url => String(url).trim())) {
    throw new Error('Require source identity, caption, timestamp, and no source attachments.');
  }
}
const cases = [...new Map(input.map(item =>
  [JSON.stringify([item.postId, item.caption, item.timestamp]), item])).values()];
const output = path.resolve(option('--output'));
await fs.mkdir(output, { recursive: true });
Object.assign(process.env, {
  DRY_RUN: 'true', PARSER_DRY_RUN_LOCAL_IMAGES: 'true', LUNA_TEXT_ONLY_ENABLED: 'true',
  LUNA_STAGE1_PILOT_ENABLED: 'true', LUNA_STAGE1_PILOT_SAMPLE_PERCENT: '100',
  LUNA_CANARY_ENABLED: 'true', LUNA_CANARY_STAGE3_ONLY: 'true',
  LUNA_CANARY_SAMPLE_PERCENT: '100', LUNA_CANARY_LEGACY_FALLBACK_ENABLED: 'false',
  LUNA_CANARY_POST_IDS: '', LUNA_CANARY_EXCLUDED_POST_IDS: '',
});
delete process.env.IMAGE_UPLOAD_URL;
delete process.env.IMAGE_DELETE_URL;
const { parsePostData } = await import('../lib/parsing/postParser.js');
let cursor = 0;
const results = [];
await Promise.all(Array.from({ length: 3 }, async () => {
  while (cursor < cases.length) {
    const source = cases[cursor++];
    const usage = [], skips = [], stages = {};
    const started = Date.now();
    const events = await parsePostData({
      combinedText: source.caption, mediaUrls: [], sharedPostThumbnails: [],
      userName: source.venue, pageName: source.pageName || source.venue,
      timestamp: source.timestamp, facebookUrl: '', profilePicUrl: '',
      extractedData: { id: source.postId, postId: source.postId },
    }, {}, {
      diagnosticContext: { fileId: source.fileId || 'text-only-evaluation',
        runId: 'text-only-local-replay', rowIndex: source.row, postId: source.postId },
      ...(args.includes('--without-quota') ? {} : { lunaStage3EligibleSelector: () => true }),
      stage4BatchSize: 15, stage4BatchConcurrency: 2,
      stage5BatchSize: 9, stage5BatchConcurrency: 2,
      // Keep comparisons grounded in the captured caption; current websites
      // and venue hours are separate production enrichments.
      ticketLinkEnrichment: { enabled: false }, calendarLinkEnrichment: { enabled: false },
      venueWebsiteEnrichment: { enabled: false },
      gptUsageHandler: item => usage.push(item), skipReasonHandler: item => skips.push(item),
      stageArtifactsHandler: item => Object.assign(stages, item),
    });
    const result = { ...source, events, usage, skips, stages, elapsedMs: Date.now() - started };
    results.push(result);
    await fs.writeFile(path.join(output, `${source.fileId || 'local'}-${source.row ?? source.postId}.json`),
      JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ postId: source.postId, row: source.row,
      elapsedMs: result.elapsedMs, finalItems: events.length, skips }));
  }
}));
await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
