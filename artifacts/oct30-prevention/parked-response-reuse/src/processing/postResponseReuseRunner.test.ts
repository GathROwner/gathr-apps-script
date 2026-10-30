import test from 'node:test';
import assert from 'node:assert/strict';
import { processWithPostResponseReuse } from './postResponseReuseRunner.js';
import { BatchManager, createBatchState } from './batchManager.js';
import { summarizeGptUsageRecords } from './rowProcessor.js';
import { DEFAULT_CONFIG, RawRowData } from '../types/index.js';

const row: RawRowData = { uniqueId: '1234567890123', text: 'Original caption', userName: 'Venue',
  pageName: 'venue', facebookUrl: 'https://www.facebook.com/venue', timestamp: '2026-10-25T12:00:00Z', mediaUrls: [] };
const config = { ...DEFAULT_CONFIG, parserMode: 'full5stage' as const };
const result = { success: true, rowIndex: 0, eventsCreated: 1, eventsUpdated: 0, duplicateEvents: 0,
  duplicateEventIds: [], skipped: false, isDuplicate: false, isInvalid: false };
const manager = new BatchManager(createBatchState('dataset', 'dataset', 1, 1, 'run'), config, 'worker');

for (const kind of ['off', 'dry-run', 'legacy', 'structured-events', 'missing-id', 'unfenced'] as const) {
  test(`${kind} retains normal parsing without reading/writing reuse storage`, async () => {
    const previous = process.env.PARSER_RESPONSE_REUSE_ENABLED;
    process.env.PARSER_RESPONSE_REUSE_ENABLED = kind === 'off' ? 'false' : 'true';
    try {
      let normal = 0;
      const output = await processWithPostResponseReuse({ ...row,
        ...(kind === 'structured-events' ? { sourceScraperType: 'events' as const } : {}),
        ...(kind === 'missing-id' ? { uniqueId: '' } : {}) },
        { ...config, ...(kind === 'dry-run' ? { dryRun: true } : {}), ...(kind === 'legacy' ? { parserMode: 'legacy' as const } : {}) },
        kind === 'unfenced' ? new BatchManager(createBatchState('dataset', 'dataset', 1)) : manager,
        async () => { normal++; return result; });
      assert.equal(normal, 1); assert.equal(output, result);
    } finally { if (previous === undefined) delete process.env.PARSER_RESPONSE_REUSE_ENABLED; else process.env.PARSER_RESPONSE_REUSE_ENABLED = previous; }
  });
}

test('unverified source image destination falls back to normal parser, never a caption-only reuse', async () => {
  const previous = process.env.PARSER_RESPONSE_REUSE_ENABLED; process.env.PARSER_RESPONSE_REUSE_ENABLED = 'true';
  try { let normal = 0;
    const output = await processWithPostResponseReuse({ ...row, mediaUrls: ['http://127.0.0.1/not-a-source'] }, config,
      manager, async () => { normal++; return result; });
    assert.equal(normal, 1); assert.equal(output, result);
  } finally { if (previous === undefined) delete process.env.PARSER_RESPONSE_REUSE_ENABLED; else process.env.PARSER_RESPONSE_REUSE_ENABLED = previous; }
});

test('actual calls and reused answers have separate accounting, even when mixed across stages', () => {
  const summary = summarizeGptUsageRecords([
    { stage: 'stage1', component: 'contentValidator', endpoint: 'responses', model: 'gpt-6-luna', reusedResponse: true,
      inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0 },
    { stage: 'stage3', component: 'eventExtractor', endpoint: 'responses', model: 'gpt-6-luna',
      inputTokens: 100, outputTokens: 20, totalTokens: 120, cachedInputTokens: 25, cacheWriteTokens: 10 },
    { stage: 'stage4', component: 'secondaryValidator', endpoint: 'responses', model: 'gpt-5-nano', reusedResponse: true },
  ]) as any;
  assert.equal(summary.totalCalls, 1); assert.equal(summary.totalTokens, 120);
  assert.equal(summary.cacheWriteKnownCalls, 1); assert.equal(summary.cacheWriteTokens, 10);
  assert.equal(summary.reusedResponses, 2); assert.deepEqual(summary.reusedResponsesByStage, { stage1: 1, stage4: 1 });
  assert.equal(summary.byStage.stage1, undefined); assert.equal(summary.byModel['gpt-5-nano'], undefined);
});

test('worker fence carries exact run and worker identities across a resume', () => {
  assert.deepEqual(manager.getWorkerFence(), { fileId: 'dataset', runId: 'run', workerId: 'worker' });
  const resumed = new BatchManager(createBatchState('dataset', 'dataset', 1, 2, 'run'), config, 'new-worker');
  assert.equal(resumed.getWorkerFence()!.workerId, 'new-worker');
});
