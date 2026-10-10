import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import * as accounting from './cacheAccounting.js';
import { extractTokenUsage, emitGptUsage } from './runtimeConfig.js';
import { GptUsageRecord, GptUsageStage, ParsingConfig } from './types.js';

const pricing = { inputPerM: .1, cachedInputPerM: .01, cacheWritePerM: .125, outputPerM: .5 };
const raw = { input_tokens: 10000, output_tokens: 1000,
  input_tokens_details: { cached_tokens: 3000, cache_write_tokens: 5000 } };
const usage = extractTokenUsage(raw);

test('extracts separate read/write counts, including explicit zero and chat usage', () => {
  assert.equal(usage.cacheWriteTokens, 5000);
  assert.equal(usage.cachedInputTokens, 3000);
  assert.equal(usage.inputTokens, 10000);
  assert.equal(extractTokenUsage({ input_tokens_details: { cache_write_tokens: 0 } }).cacheWriteTokens, 0);
  assert.equal(extractTokenUsage({ prompt_tokens: 100, prompt_tokens_details: { cache_write_tokens: 80 } }).cacheWriteTokens, 80);
});

test('absent or invalid cache writes are omitted rather than manufactured as zero', () => {
  for (const value of [undefined, null, '', -1, 'invalid']) {
    const extracted = extractTokenUsage({ input_tokens_details: { cache_write_tokens: value } });
    assert.equal(Object.hasOwn(extracted, 'cacheWriteTokens'), false);
  }
  assert.equal(Object.hasOwn(extractTokenUsage(undefined), 'cacheWriteTokens'), false);
});

test('all stage emitters preserve usage without changing parsed values or raw usage', async () => {
  const original = JSON.stringify(raw), records: GptUsageRecord[] = [];
  const config = { gptUsageHandler: async (r: GptUsageRecord) => { records.push(r); } } as ParsingConfig;
  for (const stage of ['stage1','stage2','stage3','stage4','stage5','ocr_debug'] as GptUsageStage[]) {
    await emitGptUsage(config, { stage, component: stage, endpoint: 'responses', model: 'gpt-6-luna', ...usage });
  }
  assert.equal(records.length, 6);
  assert(records.every(r => r.cacheWriteTokens === 5000 && r.cachedInputTokens === 3000));
  assert.equal(JSON.stringify(raw), original);
});

test('known writes, zero writes and unavailable historical writes aggregate separately', () => {
  const b = accounting.createCacheWriteMetrics();
  accounting.addCacheWriteUsage(b, usage);
  accounting.addCacheWriteUsage(b, { inputTokens: 100, cacheWriteTokens: 0 });
  accounting.addCacheWriteUsage(b, { inputTokens: 1000, cachedInputTokens: 200 });
  assert.deepEqual(b, { cacheWriteTokens: 5000, cacheWriteKnownCalls: 2, cacheWriteUnknownCalls: 1, cacheWriteUnknownInputTokens: 800 });
  const totals = accounting.createCacheWriteMetrics();
  accounting.addCacheWriteSummary(totals, { ...b, calls: 3 });
  accounting.addCacheWriteSummary(totals, { calls: 2, inputTokens: 2000, cachedInputTokens: 500 });
  assert.deepEqual(totals, { cacheWriteTokens: 5000, cacheWriteKnownCalls: 2, cacheWriteUnknownCalls: 3, cacheWriteUnknownInputTokens: 2300 });
});

test('prices ordinary/read/write/output as disjoint categories without double charging', () => {
  const b = accounting.createCacheWriteMetrics(); accounting.addCacheWriteUsage(b, usage);
  const cost = accounting.estimateTokenCost({ ...usage, ...b }, pricing);
  assert(Math.abs(cost.estimatedCostUsd - .001355) < 1e-12);
  assert.equal(cost.estimatedCostUsdUpperBound, cost.estimatedCostUsd);
  assert.equal(cost.cacheWriteCoverage, 'complete');
});

test('historical unknown writes retain a bounded range instead of false precision', () => {
  const b = accounting.createCacheWriteMetrics();
  accounting.addCacheWriteSummary(b, { calls: 1, inputTokens: 10000, cachedInputTokens: 3000 });
  const cost = accounting.estimateTokenCost({ inputTokens: 10000, cachedInputTokens: 3000, outputTokens: 1000, ...b }, pricing);
  assert.equal(cost.cacheWriteCoverage, 'unknown');
  assert(Math.abs(cost.estimatedCostUsd - .00123) < 1e-12);
  assert(Math.abs(cost.estimatedCostUsdUpperBound - .001405) < 1e-12);
  assert.equal(accounting.defaultCacheWriteMultiplier('gpt-6-luna'), 1.25);
  assert.equal(accounting.defaultCacheWriteMultiplier('gpt-5.6-sol'), 1.25);
  assert.equal(accounting.defaultCacheWriteMultiplier('gpt-5-nano'), 1);
  assert.equal(accounting.defaultCacheWriteMultiplier('gpt-5.4-nano'), 1);
});

test('known model rates work without missing environment configuration and overrides remain explicit', () => {
  assert.deepEqual(accounting.readTokenPricing('gpt-6-luna', {}), pricing);
  assert.equal(accounting.readTokenPricing('gpt-5-nano', {})?.outputPerM, .4);
  assert.equal(accounting.readTokenPricing('unknown-model', {}), null);
  assert.equal(accounting.readTokenPricing('gpt-6-luna', { PRICE_GPT_6_LUNA_INPUT_PER_M: 'invalid' }), null);
  assert.equal(accounting.readTokenPricing('gpt-6-luna', { PRICE_GPT_6_LUNA_CACHE_WRITE_PER_M: '0' })?.cacheWritePerM, 0);
  assert.equal(accounting.readTokenPricing('gpt-6-luna', { PRICE_GPT_6_LUNA_INPUT_PER_M: '.2' })?.cacheWritePerM, .25);
});

// Exercise the actual compiled private aggregators without importing Cloud Functions
// and initializing SDKs. Each function is self-contained apart from these helpers.
function compiledFunction(relative: string, name: string): (...args: any[]) => any {
  const source = fs.readFileSync(path.join(__dirname, relative), 'utf8');
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0);
  const end = source.indexOf('\n}', start) + 2;
  assert(end > start);
  return vm.runInNewContext(`(${source.slice(start, end)})`, {
    cacheAccounting_js_1: accounting, asString: (s: unknown) => String(s || '').trim(),
  });
}

test('production and replay snapshots retain write coverage in every aggregation dimension', () => {
  const records = [
    { stage: 'stage3', component: 'eventExtractor', model: 'gpt-6-luna', ...usage },
    { stage: 'stage5', component: 'finalFormatter', model: 'gpt-6-luna', inputTokens: 1000, cachedInputTokens: 200 },
  ];
  for (const file of ['../processing/rowProcessor.js','../triggers/replayParser.js']) {
    const result = compiledFunction(file, 'summarizeGptUsageRecords')(records);
    assert.equal(result.cacheWriteTokens, 5000);
    assert.equal(result.cacheWriteKnownCalls, 1);
    assert.equal(result.cacheWriteUnknownCalls, 1);
    assert.equal(result.byStage.stage3.cacheWriteTokens, 5000);
    assert.equal(result.byStage.stage5.cacheWriteUnknownInputTokens, 800);
    assert.equal(result.byComponent.eventExtractor.cacheWriteTokens, 5000);
    assert.equal(result.byModel['gpt-6-luna'].cacheWriteTokens, 5000);
    assert.equal(result.byModel['gpt-6-luna'].cacheWriteUnknownCalls, 1);
  }
});
