import assert from 'node:assert/strict';
import test from 'node:test';
import { createCompactV10ValidationPrompt } from './contentValidator.js';
import { alignFormattedEventsToValidatedDataForRegression, applyCategoryCorrectionsForRegression,
  filterRetailMerchandisePromotions, formatStage5BatchesWithRecovery } from './finalFormatter.js';
import { hasUnsupportedPostDateFallback } from './sourceOccurrenceGuards.js';
import { selectStage5LunaPilot } from './stage5Pilot.js';
import { ExtractedItem, FormattedEvent } from './types.js';

const item = (name: string) => ({ name, description: '', date: '2026-10-10', startTime: '09:00',
  venue: 'Milton Hall', recurringPattern: 'none' } as ExtractedItem);
const event = (name: string) => ({ name, description: '', startDate: '2026-10-10',
  startTime: '09:00', category: 'Gatherings & Parties', isEvent: 'Yes' } as FormattedEvent);
test('clinic and public-market policy covers images and captions while retaining service/retail exclusions', () => {
  for (const imageCount of [0, 1, 4]) {
    const prompt = createCompactV10ValidationPrompt('today', imageCount, 'Venue', '2026-10-10');
    assert.match(prompt, /dated public care clinic/);
    assert.match(prompt, /Routine individual appointment availability/);
    assert.match(prompt, /public market session from an ordinary shop/);
  }
});
test('a scheduled craft/yard sale survives merchandise filtering; a clothing stock sale does not', () => {
  const sale = { ...event('Fall Craft & Yard Sale'), description: '27 tables of crafts, clothing and Christmas decor. $2 admission.' };
  const stock = { ...event('Clothing sale'), description: 'Clothing and Christmas decor on sale for $5.' };
  assert.deepEqual(filterRetailMerchandisePromotions([sale, stock]), [sale]);
});
test('small batches recover missing output and never synthesize completion from duplicate identities', async () => {
  const items = [item('First'), item('Second')]; const calls: number[] = [];
  const result = await formatStage5BatchesWithRecovery(items, 9, async batch => {
    calls.push(batch.length);
    return { formattedEvents: batch.map((x, sourceItemIndex) => ({ ...event(x.name), sourceItemIndex: batch.length === 2 ? 0 : sourceItemIndex })), formattingDecisions: [] };
  });
  assert.deepEqual(calls, [2, 1, 1]);
  assert.deepEqual(result?.map(x => x.name), ['First', 'Second']);
  const held = await formatStage5BatchesWithRecovery(items.slice(0, 1), 9,
    async () => ({ formattedEvents: [], formattingDecisions: [] }));
  assert.equal(held, null);
});
test('legacy reconstruction retains supplied price and ticket URL', () => {
  const input = { ...item('Wings'), price: '$10/lb', ticketLink: 'https://venue.example/book' };
  const result = alignFormattedEventsToValidatedDataForRegression([], [input]);
  assert.equal(result[0].event.ticketPrice, '$10/lb');
  assert.equal(result[0].event.ticketLink, input.ticketLink);
});
test('an undated upcoming special is held; a concrete current daily special is retained', () => {
  assert.equal(hasUnsupportedPostDateFallback({ ...item('Special rolls'), _sourceType: 'special',
    description: 'We will bring back special rolls later this month. Exact availability date was not specified.' } as ExtractedItem, '2026-10-10'), true);
  assert.equal(hasUnsupportedPostDateFallback({ ...item('Friday Special'), _sourceType: 'special',
    description: "Today's scallop dinner special." } as ExtractedItem, '2026-10-10'), false);
});
test('discounted cinema admission stays cinema while a cinema popcorn deal stays food', () => {
  for (const name of ['Minions & Monsters', 'Suspiria']) {
    const source = { ...item(name), venue: 'The Tivoli Cinema', extractionReason: 'The calendar prints a ticket price and discounted tickets.' };
    const formatted = applyCategoryCorrectionsForRegression({ ...event(name), establishment: 'The Tivoli Cinema', category: 'Food Special' }, source);
    assert.equal(formatted.category, 'Cinema');
    assert.equal(formatted.isFoodSpecial, 'No');
  }
  const popcorn = applyCategoryCorrectionsForRegression({ ...event('Popcorn deal'), establishment: 'The Tivoli Cinema', category: 'Food Special', description: '$5 popcorn special' });
  assert.equal(popcorn.category, 'Food Special');
});
test('Stage 5 allocation is off by default and stable across retries, with its own cohort', () => {
  assert.equal(selectStage5LunaPilot('dataset', 'post', true, false, 50).selected, false);
  assert.equal(selectStage5LunaPilot('dataset', 'post', false, true, 100).selected, false);
  assert.equal(selectStage5LunaPilot('', 'post', true, true, 100).selected, false);
  for (let index = 0; index < 100; index++) {
    assert.deepEqual(
      selectStage5LunaPilot('dataset', String(index), true, true, 50),
      selectStage5LunaPilot('dataset', String(index), true, true, 50));
    assert.equal(selectStage5LunaPilot('dataset', String(index), true, true, 100).selected, true);
  }
});

test('public swimming access stays Sports without recategorizing parties, lessons or billiards', () => {
  for (const name of ['All pools open', 'Lane swim', 'Waterslide open', 'Family Swim']) {
    const source = { ...item(name), venue: 'Bell Aliant Centre' };
    const formatted = applyCategoryCorrectionsForRegression({ ...event(name), category: 'Gatherings & Parties' }, source);
    assert.equal(formatted.category, 'Sports');
    assert.equal(formatted.isFoodSpecial, 'No');
  }
  for (const [name, category] of [['Pool party', 'Gatherings & Parties'], ['Swimming lessons', 'Workshops & Classes'], ['Billiards social', 'Gatherings & Parties']] as const) {
    const formatted = applyCategoryCorrectionsForRegression({ ...event(name), category }, item(name));
    assert.equal(formatted.category, category);
  }
});
