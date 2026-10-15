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

test('single karaoke output exhaustion gets one fresh bounded retry with intact source identity', async () => {
  const source = [{...items[0],name:'Karaoke Night',startTime:'20:00'}];
  const calls: boolean[]=[];
  const result=await formatStage5BatchesWithRecovery(source,9,async (batch,offset,recovery)=>{
    calls.push(recovery === true);
    if(calls.length===1) throw Object.assign(new Error('incomplete'),{code:'stage5_incomplete_response',incompleteReason:'max_output_tokens'});
    assert.equal(offset,0);assert.deepEqual(batch,source);return reply(batch);
  });
  assert.deepEqual(calls,[false,true]);assert.equal(result?.length,1);
  assert.equal(result?.[0].name,'Karaoke Night');
});

test('repeated output exhaustion holds the entire post after two calls', async () => {
  let calls=0;
  const out=await formatStage5BatchesWithRecovery(items.slice(0,1),9,async()=>{
    calls++;throw Object.assign(new Error('incomplete'),{code:'stage5_incomplete_response',incompleteReason:'max_output_tokens'});
  });
  assert.equal(calls,2);assert.equal(out,null);
});

test('content-filter incomplete response remains terminal without retry', async () => {
  let calls=0;
  await assert.rejects(formatStage5BatchesWithRecovery(items.slice(0,1),9,async()=>{
    calls++;throw Object.assign(new Error('incomplete filtered'),{code:'stage5_incomplete_response',incompleteReason:'content_filter'});
  }),/filtered/);
  assert.equal(calls,1);
});

test('concurrent batches preserve source order when the later batch finishes first', async () => {
  let releaseFirst: (() => void) | undefined;
  const firstPending = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let active = 0;
  let maxActive = 0;
  const result = await formatStage5BatchesWithRecovery(items, 9, async (batch, offset) => {
    active++;
    maxActive = Math.max(maxActive, active);
    if (offset === 0) await firstPending;
    if (offset === 9) releaseFirst?.();
    active--;
    return reply(batch);
  }, 2);
  assert.equal(maxActive, 2);
  assert.deepEqual(result?.map(item => item.name), items.map(item => item.name));
  assert.deepEqual(result?.map(item => (item as FormattedEvent & { sourceItemIndex: number }).sourceItemIndex),
    items.map((_, index) => index));
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
