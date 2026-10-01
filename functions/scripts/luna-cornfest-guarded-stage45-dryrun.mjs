import fs from 'node:fs/promises';
import path from 'node:path';
import { buildGuardedCalendarInventoryAdditions } from '../lib/parsing/calendarInventoryReconciliation.js';
import { performSecondaryValidation } from '../lib/parsing/secondaryValidator.js';
import { performFinalFormatting } from '../lib/parsing/finalFormatter.js';
import { DEFAULT_PARSING_CONFIG } from '../lib/parsing/types.js';

if (!process.env.OPENAI_API_KEY || process.env.IMAGE_UPLOAD_URL || process.env.IMAGE_DELETE_URL) {
  throw new Error('Guarded dry run needs existing API key and no image endpoints');
}
const root = path.resolve(import.meta.dirname, '../..');
const [summaryPath, replayPath] = process.argv.slice(2);
if (!summaryPath || !replayPath) throw new Error('Pass saved primary summary and inventory replay JSON');
const summary = JSON.parse(await fs.readFile(summaryPath, 'utf8'));
const replay = JSON.parse(await fs.readFile(replayPath, 'utf8'));
const primary = summary.events.map((event, index) => ({
  name: event.name, type: 'event', date: event.date, startTime: event.startTime,
  venue: '', description: event.description || '', extractionReason: 'Saved Cornfest primary dry run',
  relevantImageIndex: index < 9 ? 1 : 2, _sourceType: 'calendar',
}));
if (primary.length !== 13) throw new Error('Expected saved 13-item primary');
const snapshot = replay.snapshot;
const decision = buildGuardedCalendarInventoryAdditions(primary,
  snapshot.reconciliation, snapshot.unresolvedListings.length);
if (!decision.eligible || decision.items.length !== 2) {
  throw new Error(`Guarded additions unavailable: ${decision.reason}`);
}
const stage3 = [...primary, ...decision.items];
const usage = [];
const config = {
  ...DEFAULT_PARSING_CONFIG, gptModelReasoning: 'gpt-6-luna',
  stage4ModelOverride: 'gpt-6-luna', stage5ModelOverride: 'gpt-6-luna',
  lunaCalendarLiteralSourcePrompt: true,
  gptUsageHandler: record => usage.push(record),
};
const userName = 'Town of Cornwall PEI';
const timestamp = '2026-09-18T12:00:00.000Z';
const stage4 = await performSecondaryValidation(stage3, userName, timestamp, config);
const stage5 = await performFinalFormatting(stage4, userName, '', timestamp, config,
  'Cornwall Cornfest September 24–27, 2026. Registration for select events: 902-628-6260.');
const outputPath = path.join(root,
  'artifacts/cornfest-google-chat-2026-10-01/cornfest-guarded-stage45-dryrun.json');
const output = { noFirestoreWrites: true, decision,
  stage3Count: stage3.length, stage4Count: stage4.length,
  stage5Count: stage5.length,
  stage4: stage4.map(({ name, date, startTime, endTime, relevantImageIndex }) =>
    ({ name, date, startTime, endTime, relevantImageIndex })),
  stage5: stage5.map(({ name, startDate, startTime, endTime,
    relevantImageIndex }) => ({ name, startDate, startTime, endTime,
      relevantImageIndex })),
  usage: usage.map(({ stage, model, inputTokens, outputTokens }) =>
    ({ stage, model, inputTokens, outputTokens })),
};
await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
console.log(JSON.stringify({ outputPath, stage3Count: output.stage3Count,
  stage4Count: output.stage4Count, stage5Count: output.stage5Count,
  added: decision.items.map(item => ({ name: item.name, date: item.date,
    startTime: item.startTime, endTime: item.endTime || null,
    relevantImageIndex: item.relevantImageIndex })),
  keptStage4: output.stage4.filter(item => decision.items.some(extra => extra.name === item.name)),
  keptStage5: output.stage5.filter(item => decision.items.some(extra => extra.name === item.name)),
  usage: output.usage }));
