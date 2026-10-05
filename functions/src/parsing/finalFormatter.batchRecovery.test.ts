import test from 'node:test';
import assert from 'node:assert/strict';

import { formatStage5BatchesWithRecovery, parseFormattingJsonResponse } from './finalFormatter.js';
import { ExtractedItem, FormattedEvent, FormattingResult } from './types.js';

const items = Array.from({ length: 20 }, (_, index) => ({
  name: `Milton activity ${index}`,
  description: `Milton activity ${index}`,
  date: '2026-10-06',
  startTime: '10:00',
  venue: 'Milton Community Hall',
  _sourceType: 'calendar',
} as ExtractedItem));

function reply(batch: ExtractedItem[]): FormattingResult {
  return {
    formattedEvents: batch.map((item, sourceItemIndex) => ({
      sourceItemIndex,
      name: item.name,
      startDate: item.date,
      startTime: item.startTime,
      venue: item.venue,
    } as unknown as FormattedEvent)),
    formattingDecisions: [],
  };
}

test('a malformed final two-item batch retries only its two items and preserves all twenty', async () => {
  const calls: Array<[number, number]> = [];
  const result = await formatStage5BatchesWithRecovery(items, 9, async (batch, offset) => {
    calls.push([offset, batch.length]);
    return offset === 18 && batch.length === 2
      ? { formattedEvents: [], formattingDecisions: [] }
      : reply(batch);
  });
  assert.deepEqual(calls, [[0, 9], [9, 9], [18, 2], [18, 1], [19, 1]]);
  assert.equal(result?.length, 20);
  assert.deepEqual(result?.map(item => (item as FormattedEvent & { sourceItemIndex: number }).sourceItemIndex),
    items.map((_, index) => index));
});

test('an unsuccessful smaller retry holds the entire post', async () => {
  const result = await formatStage5BatchesWithRecovery(items, 9, async (batch, offset) =>
    offset === 18 ? { formattedEvents: [], formattingDecisions: [] } : reply(batch));
  assert.equal(result, null);
});

test('a count-preserving calendar identity shift holds the entire post', async () => {
  const result = await formatStage5BatchesWithRecovery(items, 9, async (batch, offset) => {
    const formatted = reply(batch);
    if (offset === 18) formatted.formattedEvents[0].name = 'Another activity';
    return formatted;
  });
  assert.equal(result, null);
});

test('valid Stage 5 JSON keeps ticket URLs containing double slashes', () => {
  const raw = JSON.stringify({ formattedEvents: [
    { sourceItemIndex: 0, name: 'Elvis', ticketLink: 'https://miltonvalepark.com/october-1-2026/' },
    { sourceItemIndex: 1, name: 'North Milton WI', ticketLink: '' },
  ], formattingDecisions: [] });
  const parsed = parseFormattingJsonResponse(raw);
  assert.equal(parsed.formattedEvents.length, 2);
  assert.equal(parsed.formattedEvents[0].ticketLink, 'https://miltonvalepark.com/october-1-2026/');
});
