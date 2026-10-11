// Actual Stage 4 + Stage 5 on frozen sources. No Firestore imports or writer.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const root = path.resolve(import.meta.dirname, '..');
if (!process.env.OPENAI_API_KEY) {
  const env = await fs.readFile(path.join(root, '.env'), 'utf8');
  const line = env.split(/\r?\n/).find(line => /^OPENAI_API_KEY=/.test(line));
  if (line) process.env.OPENAI_API_KEY = line.slice('OPENAI_API_KEY='.length).trim().replace(/^['"]|['"]$/g, '');
}
if (!process.env.OPENAI_API_KEY) throw Error('OpenAI credential unavailable');
Object.assign(process.env, {DRY_RUN:'true', STAGE4_RESPONSES_REASONING_EFFORT:'low', STAGE5_RESPONSES_REASONING_EFFORT:'none'});
const nativeFetch = globalThis.fetch;
const calls = [];
globalThis.fetch = async (url, options = {}) => {
  const address = typeof url === 'string' ? url : url.url;
  if (address !== 'https://api.openai.com/v1/responses') throw Error('Dry run blocks non-model network requests');
  const body = JSON.parse(options.body);
  assert.ok((body.model === 'gpt-5-nano' && body.reasoning?.effort === 'low') ||
    (body.model === 'gpt-6-luna' && body.reasoning?.effort === 'none'));
  const started = Date.now();
  const response = await nativeFetch(url, options);
  const data = await response.clone().json();
  calls.push({model:body.model, effort:body.reasoning?.effort, durationMs:Date.now()-started, status:data.status,
    httpStatus:response.status, incompleteDetails:data.incomplete_details, usage:data.usage, rawOutput:data.output});
  return response;
};
createRequire(import.meta.url)('openai/shims/web');
const {performSecondaryValidation} = await import('../lib/parsing/secondaryValidator.js');
const {performFinalFormatting} = await import('../lib/parsing/finalFormatter.js');
const fixtures = JSON.parse(await fs.readFile(path.join(root, 'src/processing/__fixtures__/oct11-integrity-repair.json'), 'utf8'));
const out = path.join(root, 'artifacts/luna-oct11-integrity-repair');
await fs.mkdir(out, {recursive:true});
const results = [];
for (const row of fixtures.rows.filter(row => row.row !== 20)) {
  const started = Date.now(), usage = [], callStart = calls.length;
  const config = {stage4ModelOverride:'gpt-5-nano', stage4BatchSize:15, stage4BatchConcurrency:2,
    stage5ModelOverride:'gpt-6-luna', stage5BatchSize:9, stage5BatchConcurrency:2,
    lunaCalendarLiteralSourcePrompt:true, gptUsageHandler:record=>usage.push(record),
    diagnosticContext:{fileId:'oct11-integrity-api-dryrun', postId:row.id, rowIndex:row.row, runId:'local-dryrun'}};
  let items, events, error;
  try {
    items = await performSecondaryValidation(structuredClone(row.stage3), row.venue, row.timestamp, config);
    assert.equal(items.length, row.stage3.length, `Stage 4 inventory row ${row.row}`);
    events = await performFinalFormatting(items, row.venue, '', row.timestamp, config, row.caption);
    if (row.row === 234) {
      assert.equal(events.length, 3);
      assert.deepEqual(events.map(e=>e.startTime).sort(), ['16:20','17:30','18:40']);
      assert.ok(events.every(e=>e.totalOccurrences===3 && e.recurrenceUntilDate==='2026-10-27'));
    } else assert.equal(events.length, row.stage3.length, `Stage 5 inventory row ${row.row}`);
    if (row.row === 66) assert.deepEqual(events.map(e=>e.startDate).sort(), ['2026-10-10','2026-10-11']);
    if ([277,313,315].includes(row.row)) assert.ok(events.every(e=>e.category==='Gatherings & Parties' && e.isEvent==='Yes' && e.isFoodSpecial==='No'));
    if (row.row===277) assert.equal(events[0].ticketLink, 'https://bookmarkreads.ca/events/5711520261022');
  } catch (e) { error = e.stack; }
  const result = {row:row.row, postId:row.id, noLiveWrites:true, inputCount:row.stage3.length,
    stage4Count:items?.length, finalCount:events?.length, wallMs:Date.now()-started, items, events, usage,
    calls:calls.slice(callStart), error};
  results.push(result);
  await fs.writeFile(path.join(out, `row-${row.row}-api.json`), JSON.stringify(result,null,2));
  console.log(JSON.stringify({row:row.row, input:result.inputCount, stage4:result.stage4Count, final:result.finalCount, wallMs:result.wallMs, error:error?.split('\n')[0]}));
}
await fs.writeFile(path.join(out, 'api-summary.json'), JSON.stringify(results.map(({row,inputCount,stage4Count,finalCount,wallMs,error})=>({row,inputCount,stage4Count,finalCount,wallMs,error})),null,2));
if (results.some(r=>r.error)) process.exitCode = 1;
