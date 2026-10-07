import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const effort = process.argv[2];
if (!['minimal', 'low', 'medium'].includes(effort)) throw new Error('Pass minimal, low, or medium reasoning effort');
const dense = process.argv[3] === 'dense';
if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing');
process.env.STAGE4_RESPONSES_REASONING_EFFORT = effort;
const { performSecondaryValidation } = await import('../lib/parsing/secondaryValidator.js');
const { DEFAULT_PARSING_CONFIG } = await import('../lib/parsing/types.js');
const source = JSON.parse(await fs.readFile(path.resolve(dir,
  dense ? '../artifacts/luna-oct7-full-audit/row172-dense-instrumented-dryrun.json'
    : '../artifacts/luna-oct7-full-audit/row244-ocr-fixed-dryrun.json'), 'utf8'));
const items = source.stages?.stage3Items;
if (!Array.isArray(items) || items.length !== (dense ? 15 : 6)) {
  throw new Error(`Expected ${dense ? 15 : 6} saved Stage 3 items`);
}
const usage = [];
const startedAt = Date.now();
const validated = await performSecondaryValidation(items,
  dense ? 'Bell Aliant Centre' : 'Eastern Kings Sportsplex',
  dense ? '2026-10-07T08:00:00Z' : '2026-10-06T12:51:40Z', {
    ...DEFAULT_PARSING_CONFIG,
    stage4ModelOverride: 'gpt-5-nano',
    gptUsageHandler: record => usage.push(record),
  });
const report = { source: dense ? 'saved row 172 Stage 3 items' : 'saved row 244 Stage 3 items',
  noFirestoreWrites: true,
  effort, inputCount: items.length, outputCount: validated.length,
  wallMs: Date.now() - startedAt,
  validated: validated.map(({ name, date, startTime, endTime,
    relevantImageIndex }) => ({ name, date, startTime, endTime,
    relevantImageIndex })), usage };
const destination = path.resolve(dir,
  `../artifacts/luna-oct7-full-audit/stage4-${dense ? 'fifteen' : 'six'}-item-${effort}-replay.json`);
await fs.writeFile(destination, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ destination, effort, inputCount: report.inputCount,
  outputCount: report.outputCount, wallMs: report.wallMs,
  usage: usage.map(({ durationMs, responseStatus, incompleteReason,
    inputTokens, outputTokens, reasoningTokens, visibleOutputChars }) => ({
      durationMs, responseStatus, incompleteReason, inputTokens,
      outputTokens, reasoningTokens, visibleOutputChars })) }));
