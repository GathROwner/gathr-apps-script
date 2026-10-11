import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stage1CachedTextBlocks } from './stage1PromptCache.js';
import { createStage1EvaluationPrompt, createValidationSchema, validateContentForStage1Evaluation } from './contentValidator.js';

const schema = '\n\nReturn ONLY valid JSON that matches this schema:\n' + JSON.stringify(createValidationSchema()[0].parameters, null, 2);
const prompt = (count: number) => createStage1EvaluationPrompt('A dated public activity\nPOST DETAILS:\nsource text', count, 'Venue', '2026-10-11', 'compact-v10') + schema;
test('cache boundary preserves every source/rule/schema line, with stable prefixes across gallery sizes', () => {
  const lines = (text: string) => text.split('\n').filter(s => s.trim()).sort();
  for (const n of [0, 1, 3, 4, 5, 16]) {
    const original = prompt(n), blocks = stage1CachedTextBlocks(original)!;
    assert(blocks);
    assert.deepEqual(lines(blocks.map(b => b.text).join('\n')), lines(original));
    assert.deepEqual(blocks[0].prompt_cache_breakpoint, {mode: 'explicit'});
    assert.equal(blocks[1].prompt_cache_breakpoint, undefined);
    assert(!blocks[0].text.includes('A dated public activity'));
  }
  assert.equal(stage1CachedTextBlocks(prompt(1))![0].text, stage1CachedTextBlocks(prompt(5))![0].text);
  assert.notEqual(stage1CachedTextBlocks(prompt(0))![0].text, stage1CachedTextBlocks(prompt(1))![0].text);
});
test('unexpected or structured-only prompt shapes retain original request handling', () => {
  for (const text of ['', 'POST DETAILS:\n', prompt(1).replace('- ATTACHED IMAGE COUNT:', '- COUNT:'), prompt(1).replaceAll('POST DETAILS:', 'DRIFT:'), prompt(1).replace(schema, '')]) {
    assert.equal(stage1CachedTextBlocks(text), null);
  }
});
test('real Stage 1 request uses tested blocks without changing images or high reasoning', async () => {
  const captured: any[] = [];
  const client: any = {responses: {create: async (request: any) => {
    captured.push(request);
    return {status: 'completed', output_text: JSON.stringify({hasValidContent: true, confidence: .95, validationDecision: 'VALIDATION_PASSED', reason: 'Public activity', imageAnalysis: []}), usage: {input_tokens: 1, output_tokens: 1, total_tokens: 2}};
  }}};
  const urls = ['https://example.test/image-a.jpg', 'https://example.test/image-b.jpg'];
  const run = await validateContentForStage1Evaluation('A dated public activity\nPOST DETAILS:\nsource text', urls, 'Venue', '2026-10-11', 'gpt-6-luna', {promptVariant: 'compact-v10', structuredOutput: false, reasoningEffort: 'high', localGatePolicy: 'source-menu-guards', client});
  assert.equal(run.status, 'completed');
  const request = captured[0];
  assert.deepEqual(request.input[0].content.slice(0, 2), stage1CachedTextBlocks(prompt(2)));
  assert.deepEqual(request.input[0].content.slice(2), urls.map(image_url => ({type: 'input_image', image_url, detail: 'high'})));
  assert.deepEqual(request.reasoning, {effort: 'high'});
  assert.equal(request.max_output_tokens, 6000);
  assert.deepEqual(request.prompt_cache_options, {mode: 'explicit', ttl: '30m'});
});
