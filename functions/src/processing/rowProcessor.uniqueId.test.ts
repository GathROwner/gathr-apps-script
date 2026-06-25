import test from 'node:test';
import assert from 'node:assert/strict';

import { buildExpandedEventStoredUniqueId } from './rowProcessor.js';

test('expanded post event unique IDs are stable when parser order changes', () => {
  const row = {
    uniqueId: '1607294141406100',
    facebookUrl: 'https://www.facebook.com/100063765871700/posts/1607294141406100',
    sourceScraperType: 'posts',
  } as const;

  const first = buildExpandedEventStoredUniqueId({
    row,
    item: { _pipelineIndex: 1 },
    itemIndex: 0,
    eventName: 'Wellness on the Waterfront',
    startDate: '2026-06-24',
    startTime: '17:15',
    endTime: '18:00',
    venueName: "Founders' Food Hall & Market",
  });
  const reordered = buildExpandedEventStoredUniqueId({
    row,
    item: { _pipelineIndex: 6 },
    itemIndex: 5,
    eventName: 'Wellness on the Waterfront',
    startDate: '2026-06-24',
    startTime: '17:15',
    endTime: '18:00',
    venueName: "Founders' Food Hall & Market",
  });
  const differentEvent = buildExpandedEventStoredUniqueId({
    row,
    item: { _pipelineIndex: 6 },
    itemIndex: 5,
    eventName: 'Curaçao vs Ivory Coast',
    startDate: '2026-06-25',
    startTime: '17:00',
    endTime: '19:00',
    venueName: "Founders' Food Hall & Market",
  });

  assert.equal(first, reordered);
  assert.notEqual(first, differentEvent);
  assert.match(first, /^1607294141406100_[a-f0-9]{16}$/);
});

test('structured Facebook Event rows keep the legacy stored unique ID', () => {
  const id = buildExpandedEventStoredUniqueId({
    row: {
      uniqueId: '1417477513069821',
      facebookUrl: 'https://www.facebook.com/events/1417477513069821',
      sourceScraperType: 'events',
    },
    eventName: 'Charlottetown Food Truck Festival',
    startDate: '2026-05-22',
    startTime: '12:00',
  });

  assert.equal(id, '1417477513069821_1');
});
