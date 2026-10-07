import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const envText = await fs.readFile(path.resolve(dir, '../.env'), 'utf8');
const keyLine = envText.split(/\r?\n/).find(line => /^OPENAI_API_KEY=/.test(line));
if (keyLine && !process.env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = keyLine.slice('OPENAI_API_KEY='.length).trim().replace(/^['"]|['"]$/g, '');
}
const effort = process.argv[2];
if (!['minimal', 'low', 'medium'].includes(effort)) throw new Error('Pass minimal, low, or medium reasoning effort');
const minimalOutput = process.argv[3] === 'minimal';
const fixtureName = process.argv[4] || 'ice';
const fixtures = {
  ice: { file: 'row244-ocr-fixed-dryrun.json', count: 6, label: 'six',
    user: 'Eastern Kings Sportsplex', address: '203 Main Street, Souris, PE',
    timestamp: '2026-10-06T12:51:40Z', text: 'October ice times at Eastern Kings Sportsplex. Call the rink to book.' },
  dense: { file: 'row172-dense-instrumented-dryrun.json', count: 15, label: 'fifteen',
    user: 'Bell Aliant Centre', address: '560 University Avenue, Charlottetown, PE',
    timestamp: '2026-10-07T08:00:00Z', text: 'Bell Aliant Centre schedule: dated public pool sessions and fitness classes.' },
  sport: { file: 'sport-pei-fixed-dryrun.json', count: 5, label: 'five',
    user: 'Sport PEI', address: '', timestamp: '2026-10-06T12:00:00Z',
    text: 'Virtual coaching courses with registration links and dated sessions.' },
  single: { file: 'sport-pei-fixed-dryrun.json', count: 1, label: 'one',
    user: 'Sport PEI', address: '', timestamp: '2026-10-06T12:00:00Z',
    text: 'Virtual coaching course with registration link and a dated session.' },
  food: { file: 'row75-postguard-dryrun.json', count: 1, label: 'one',
    user: 'Clam Diggers', address: '', timestamp: '2026-10-06T12:00:00Z',
    text: 'Thanksgiving dinner special on Saturday and Sunday. Closed Monday.' },
};
const fixture = fixtures[fixtureName];
if (!fixture) throw new Error('Pass ice, dense, sport, single, or food fixture');
if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing');
process.env.STAGE5_RESPONSES_REASONING_EFFORT = effort;
const { performFinalFormatting } = await import('../lib/parsing/finalFormatter.js');
const { DEFAULT_PARSING_CONFIG } = await import('../lib/parsing/types.js');

const source = JSON.parse(await fs.readFile(path.resolve(dir,
  `../artifacts/luna-oct7-full-audit/${fixture.file}`), 'utf8'));
const items = fixtureName === 'single'
  ? source.stages?.stage4Items?.slice(0, 1)
  : source.stages?.stage4Items;
if (!Array.isArray(items) || items.length !== fixture.count) {
  throw new Error(`Expected ${fixture.count} saved Stage 4 items`);
}
const usage = [];
const startedAt = Date.now();
const events = await performFinalFormatting(items, fixture.user,
  fixture.address, fixture.timestamp, {
    ...DEFAULT_PARSING_CONFIG,
    stage5ModelOverride: 'gpt-5-nano',
    stage5BatchSize: 9,
    stage5BatchConcurrency: 1,
    stage5MinimalOutputProbe: minimalOutput,
    gptUsageHandler: record => usage.push(record),
  }, fixture.text);
const report = {
  source: `saved ${fixtureName} Stage 4 items`,
  noFirestoreWrites: true,
  effort, minimalOutput, inputCount: items.length, outputCount: events.length,
  wallMs: Date.now() - startedAt,
  events: events.map(({ name, startDate, startTime, endTime, totalOccurrences,
    recurrenceUntilDate, sourceItemIndex, category, venue, relevantImageIndex,
    ticketLink }) => ({ name, startDate, startTime, endTime,
    totalOccurrences, recurrenceUntilDate, sourceItemIndex, category,
    venue, relevantImageIndex, ticketLink })),
  usage,
};
const destination = path.resolve(dir,
  `../artifacts/luna-oct7-full-audit/stage5-${fixture.label}-item-${effort}${minimalOutput ? '-minimal' : ''}-replay.json`);
await fs.writeFile(destination, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ destination, effort, minimalOutput, inputCount: report.inputCount,
  outputCount: report.outputCount, wallMs: report.wallMs,
  usage: usage.map(({ durationMs, responseStatus, incompleteReason,
    inputTokens, outputTokens, reasoningTokens, visibleOutputChars,
    parsedItemCount, batchItemCount }) => ({ durationMs, responseStatus,
    incompleteReason, inputTokens, outputTokens, reasoningTokens,
    visibleOutputChars, parsedItemCount, batchItemCount })) }));
