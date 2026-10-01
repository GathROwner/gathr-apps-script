import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGuardedCalendarInventoryAdditions,
  reconcileCalendarInventory } from './calendarInventoryReconciliation.js';
import type { CalendarItem } from './types.js';

const item = (name: string, date: string, startTime: string): CalendarItem => ({
  name, date, startTime, type: 'event', venue: '',
});
const listing = (title: string, date: string, startTime: string, sourceGalleryIndex = 2) => ({
  title, date, startTime, frameIndex: sourceGalleryIndex, sourceGalleryIndex,
});

test('Cornfest second read identifies two missing concurrent listings without duplicating captured bullets', () => {
  const primary = [
    item("SAM'S FAMILY FUN DAY", '2026-09-27', '13:00'),
    item('CORN SHUCKING COMPETITION', '2026-09-27', '13:30'),
  ];
  const inventory = [
    listing('SAM’S FAMILY FUN DAY', '2026-09-27', '1:00pm'),
    listing('CORN SHUCKING COMPETITION', '2026-09-27', '1:30pm'),
    { ...listing('ENTERTAINMENT', '2026-09-27', '2:00pm'), performers: ['HACHE'] },
    listing('CORNBOIL & COMMUNITY BBQ', '2026-09-27', '2:00pm'),
  ];
  const result = reconcileCalendarInventory(primary, inventory);
  assert.equal(result.matched.length, 2);
  assert.deepEqual(result.additions.map(entry => entry.title),
    ['ENTERTAINMENT', 'CORNBOIL & COMMUNITY BBQ']);
  assert.deepEqual(result.additions.map(entry => entry.sourceGalleryIndex), [2, 2]);
  assert.equal(result.conflicts.length, 0);
});

test('a second reading cannot overwrite a different spelling at an already occupied performance slot', () => {
  const result = reconcileCalendarInventory(
    [item('Fretz and Keys', '2026-07-08', '17:00')],
    [listing('Frites and Keys', '2026-07-08', '5 PM', 0)]
  );
  assert.equal(result.additions.length, 0);
  assert.equal(result.conflicts[0]?.reason, 'same_slot_different_title');
});

test('a differently titled duplicate market promotion is held instead of added', () => {
  const result = reconcileCalendarInventory(
    [item('COMMUNITY FARMERS MARKET / YARD SALE', '2026-09-26', '08:30')],
    [listing('CORNFEST Vendor Market & Yard Sale', '2026-09-26', '8:30 AM', 3)]
  );
  assert.equal(result.additions.length, 0);
  assert.equal(result.conflicts[0]?.reason, 'same_slot_different_title');
});

test('invalid date and image provenance do not become additions', () => {
  const result = reconcileCalendarInventory([], [
    listing('New event', '2026-09-31', '2pm'),
    { ...listing('Other event', '2026-09-27', '2pm'), sourceGalleryIndex: -1 },
  ]);
  assert.equal(result.additions.length, 0);
  assert.deepEqual(result.conflicts.map(entry => entry.reason), ['invalid_fields', 'invalid_fields']);
});

test('fully matched Cornfest inventory converts two source-backed omissions without inferred end time', () => {
  const primary = [item("SAM'S FAMILY FUN DAY", '2026-09-27', '1:00pm')];
  const result = reconcileCalendarInventory(primary, [
    { ...listing("SAM'S FAMILY FUN DAY", '2026-09-27', '1:00pm'),
      excerpt: 'Children can enjoy exciting inflatables' },
    { ...listing('ENTERTAINMENT', '2026-09-27', '2:00pm'),
      endTime: '4:00pm', performers: ['HACHE'],
      excerpt: 'you will be entertained by HACHE.' },
    { ...listing('CORNBOIL & COMMUNITY BBQ', '2026-09-27', '2:00pm'),
      excerpt: 'fresh hot corn on the cob and hot dogs' },
  ]);
  const decision = buildGuardedCalendarInventoryAdditions(primary, result, 0);
  assert.equal(decision.eligible, true);
  assert.deepEqual(decision.items.map(value => value.name),
    ['ENTERTAINMENT — HACHE', 'CORNBOIL & COMMUNITY BBQ']);
  assert.deepEqual(decision.items.map(value => value.relevantImageIndex), [2, 2]);
  assert.equal(decision.items[1].endTime, undefined);
  assert.equal(primary.length, 1);
});

test('a name dispute or incomplete primary coverage blocks all additions', () => {
  const primary = [item('Fretz and Keys', '2026-07-08', '5pm')];
  const inventory = [
    { ...listing('Frites and Keys', '2026-07-08', '5pm', 0),
      excerpt: 'Frites and Keys will play music tonight' },
    { ...listing('Extra show', '2026-07-09', '6pm', 0),
      excerpt: 'Extra show at the same venue tonight' },
  ];
  const disputed = buildGuardedCalendarInventoryAdditions(primary,
    reconcileCalendarInventory(primary, inventory), 0);
  assert.equal(disputed.reason, 'disputed_reading');
  assert.deepEqual(disputed.items, []);
  const incomplete = buildGuardedCalendarInventoryAdditions(primary,
    reconcileCalendarInventory(primary, [inventory[1]]), 0);
  assert.equal(incomplete.reason, 'incomplete_primary_coverage');
  assert.deepEqual(incomplete.items, []);
});
