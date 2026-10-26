import test from 'node:test';
import assert from 'node:assert/strict';
import {readStructuredPosterWithDependencies, parseStructuredPosterEvidence, StructuredPosterDependencies} from './structuredPosterValidator.js';
import type {RawRowData} from '../types/index.js';
const source = (mediaUrls = ['https://example.test/original.webp']): RawRowData => ({uniqueId: 'synthetic', sharedPostText: 'Community Concert', text: '',
  mediaUrls, userName: 'Charlottetown', pageName: 'Organizer', timestamp: '2026-10-16T22:30:00Z', utcStartDate: '2026-10-16T22:30:00Z'});
const proof = {status: 'no_poster', occurrence: 'not_printed', venueText: '', addressText: '', venueEvidence: '', broadEvidence: '', startText: '', endText: '', doorsText: '', clockEvidence: ''};
test('bounded reader sends full prepared images once with deployed Luna high and reports actual usage', async () => {
  const requests: Record<string, unknown>[] = [], cleanup: string[][] = [], usage: any[] = [];
  const dependencies: StructuredPosterDependencies = {prepare: async urls => ({imageUrls: urls.map(() => 'data:image/webp;base64,fixture'), uploadedUrls: ['temporary-analysis']}),
    cleanup: async urls => {cleanup.push(urls);}, request: async payload => {requests.push(payload); return {id: 'response', status: 'completed',
      output_text: JSON.stringify(proof), usage: {input_tokens: 100, output_tokens: 30, total_tokens: 130}};}};
  assert.deepEqual(await readStructuredPosterWithDependencies(source(), {gptUsageHandler: record => {usage.push(record);}}, dependencies), proof);
  assert.equal(requests.length, 1); assert.equal(requests[0].model, 'gpt-6-luna'); assert.deepEqual(requests[0].reasoning, {effort: 'high'});
  assert.equal(requests[0].max_output_tokens, 6000); assert.deepEqual(cleanup, [['temporary-analysis']]);
  assert.equal(usage[0].endpoint, 'responses'); assert.equal(usage[0].totalTokens, 130);
});
test('no usable original media and over-limit sources never request a model', async () => {
  let calls = 0;
  const dependencies: StructuredPosterDependencies = {prepare: async () => null, cleanup: async () => {}, request: async () => {calls++;}};
  assert.equal(await readStructuredPosterWithDependencies(source([]), {}, dependencies), 'no_media');
  assert.equal(await readStructuredPosterWithDependencies(source(Array.from({length: 5}, (_, index) => `https://example.test/${index}.webp`)), {}, dependencies), 'over_limit');
  assert.equal(await readStructuredPosterWithDependencies(source(), {}, dependencies), 'unavailable'); assert.equal(calls, 0);
});
test('incomplete, invalid and failed requests hold without retries and always clean temporary uploads', async () => {
  for (const response of [{status: 'incomplete', output_text: JSON.stringify(proof)}, {status: 'completed', output_text: '{}'}, new Error('offline')]) {
    let requests = 0, cleanup = 0;
    const dependencies: StructuredPosterDependencies = {prepare: async () => ({imageUrls: ['data:image/webp;base64,fixture'], uploadedUrls: ['temporary']}),
      cleanup: async () => {cleanup++;}, request: async () => {requests++; if (response instanceof Error) throw response; return response;}};
    assert.equal(await readStructuredPosterWithDependencies(source(), {}, dependencies), 'unavailable'); assert.equal(requests, 1); assert.equal(cleanup, 1);
  }
  assert.equal(parseStructuredPosterEvidence({...proof, status: 'imagined'}), null);
});
