import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { detectStage2FoodSpecialSignals } from '../lib/parsing/stage2FoodSignals.js';

for (const caption of [
  'Walk-in clinic today 9-4 at 51 Main Street.',
  'Studio tour Saturday and Sunday 10-5. Find a special gift.',
  'Main course painting class $20 admission.',
  'Special guest at our pottery studio; $25 workshop.',
  'Room rates $250 per night include breakfast.',
  'Halloween lodging special includes breakfast and a hot tub.',
  'October featured menu: fishcakes all month.',
  'Pumpkins back in stock today.',
  '$8 soup restocked today.',
  'Burgers $15, our usual menu price.',
  'October featured menu: $15 burgers all month.',
  'Dinner with a special guest.',
  'Coffee and a special gift for visitors.',
  'Clothing clearance 50% off.',
]) {
  test('does not manufacture a food special: ' + caption, () => {
    assert.equal(detectStage2FoodSpecialSignals(caption).hasAny, false);
  });
}
for (const caption of [
  "Today's lunch special, no price printed.",
  'Tonight: fishcakes special.',
  'Happy hour 5-7.',
  'Wing night tonight.',
  'Two can dine tonight.',
  '$5 burgers tonight.',
  '$0.50 wings tonight.',
  'Burgers only $5 tonight.',
  'Live music at 8; cocktails half price.',
  'Special guest performing at 8. Dinner special tonight.',
  'Coffee in the morning, burgers half price tonight.',
]) {
  test('retains advertised food/drink offers: ' + caption, () => {
    assert.equal(detectStage2FoodSpecialSignals(caption).hasAny, true);
  });
}

// Exercise the real classifier normalization and request construction with a
// deterministic API response. A dummy key and blocked transport prevent spend.
let nextClassification;
const requests = [];
globalThis.fetch = async (_url, options) => {
  const request = JSON.parse(options.body);
  requests.push(request);
  return new Response(JSON.stringify({
    id: 'resp_stage2_test', object: 'response', status: 'completed',
    output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(Array.isArray(nextClassification) ? nextClassification.shift() : nextClassification) }] }],
    usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
};
process.env.OPENAI_API_KEY = 'local-unit-test-not-a-key';
createRequire(import.meta.url)('openai/shims/web');
const { classifyContent } = await import('../lib/parsing/contentClassifier.js');
const base = (changes = {}) => ({
  contentType: 'EVENT', confidence: .9, estimatedItemCount: 1,
  contentAnalysis: { hasEvents: true, hasFoodSpecials: false, hasMultipleItems: false, organizationStyle: 'unstructured' },
  classificationReason: 'Source activity', ...changes,
});
const run = async (caption, result = base(), metadata = {}, config = {}) => {
  nextClassification = result;
  return classifyContent(caption, [], 'Test source', metadata, { stage2ModelOverride: 'gpt-6-luna', ...config });
};

test('clinic address and gift do not change the normalized route', async () => {
  for (const caption of ['Clinic today at 51 Main Street', 'Studio tours this weekend: choose a special gift']) {
    const result = await run(caption);
    assert.equal(result.contentType, 'EVENT');
    assert.equal(result.contentAnalysis.hasFoodSpecials, false);
  }
});
test('unpriced special is preserved and mixed event remains extractable', async () => {
  const result = await run('Music at 8, dinner special tonight.');
  assert.equal(result.contentType, 'MIXED_EVENTS_AND_SPECIALS');
  assert.equal(result.contentAnalysis.hasEvents, true);
  assert.equal(result.contentAnalysis.hasFoodSpecials, true);
});
test('image-derived food flag survives without caption food cues', async () => {
  const result = await run('See the poster', base({ contentAnalysis: { ...base().contentAnalysis, hasFoodSpecials: true } }));
  assert.equal(result.contentType, 'MIXED_EVENTS_AND_SPECIALS');
});
test('unrelated low-confidence model food flag is not boosted above gate', async () => {
  const result = await run('Room rate $250', base({ confidence: .3, contentAnalysis: { ...base().contentAnalysis, hasEvents: false, hasFoodSpecials: true } }));
  assert.equal(result.confidence, .3);
});
test('explicit absence flags override high confidence in a closest-fit label', async () => {
  for (const contentType of ['EVENT', 'FOOD_SPECIAL', 'CALENDAR', 'MIXED_EVENTS_AND_SPECIALS']) {
    const result = await run('Ordinary retail stock', base({ contentType, confidence: .99, contentAnalysis: { ...base().contentAnalysis, hasEvents: false, hasFoodSpecials: false } }));
    assert.equal(result.confidence, 0);
  }
});
test('opt-in negative recheck uses at most one high review; positives remain one call', async () => {
  const negative = base({ confidence: .99, contentAnalysis: { ...base().contentAnalysis, hasEvents: false } });
  let before = requests.length;
  const result = await run('Orchard public photo opportunity', [negative, base()], {}, { stage2LunaNegativeRecheck: true });
  assert.equal(requests.length - before, 2);
  assert.deepEqual(requests.slice(-2).map(r=>r.reasoning.effort), ['none','high']);
  assert.equal(result.contentAnalysis.hasEvents, true);
  before = requests.length;
  await run('Public skate tonight', base(), {}, { stage2LunaNegativeRecheck: true });
  assert.equal(requests.length - before, 1);
  before = requests.length;
  const held = await run('Ordinary retail stock', [negative, negative], {}, { stage2LunaNegativeRecheck: true });
  assert.equal(requests.length - before, 2);
  assert.equal(held.confidence, 0);
});
test('failed negative recheck retains the original hold', async () => {
  const negative = base({ confidence: .4, contentAnalysis: { ...base().contentAnalysis, hasEvents: false } });
  const before = requests.length;
  const held = await run('Generic promotion', [negative, undefined], {}, { stage2LunaNegativeRecheck: true });
  assert.equal(requests.length - before, 2);
  assert.equal(held.confidence, 0);
  assert.match(held.classificationReason, /no activities/);
});
test('calendar and schedule structure is not collapsed by special detection', async () => {
  for (const contentType of ['CALENDAR', 'SCHEDULE']) {
    const result = await run('October calendar: live music and happy hour', base({ contentType, estimatedItemCount: 20 }));
    assert.equal(result.contentType, contentType);
    assert.equal(result.estimatedItemCount, 20);
  }
});
test('formal Facebook event retains metadata and confidence floor', async () => {
  const result = await run('Artist biography and ticket information', base({ confidence: .4 }), { utcStartDate: '2026-10-17T22:00:00Z' });
  assert.equal(result.contentType, 'EVENT');
  assert.equal(result.confidence, .8);
  assert.match(requests.at(-1).input[0].content[0].text, /2026-10-17/);
});
test('Stage 2 effort config reaches GPT-6; Mini retains existing default', async () => {
  await run('Public skate tonight');
  assert.equal(requests.at(-1).reasoning.effort, 'none');
  await run('Public skate tonight', base(), {}, { stage2ReasoningEffort: 'high' });
  assert.equal(requests.at(-1).reasoning.effort, 'high');
  await run('Public skate tonight', base(), {}, { stage2ModelOverride: 'gpt-5-mini', stage2ReasoningEffort: 'high' });
  assert.equal(requests.at(-1).model, 'gpt-5-mini');
  assert.equal(requests.at(-1).reasoning, undefined);
  assert.equal(requests.at(-1).max_output_tokens, 1500);
});
