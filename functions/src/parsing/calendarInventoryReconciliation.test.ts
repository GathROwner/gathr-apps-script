import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGuardedCalendarInventoryAdditions, hasCompleteCalendarInventoryReads,
  isCalendarInventoryEventObject,
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

test('possessive apostrophe variation is the same title when date and time agree', () => {
  const result = reconcileCalendarInventory(
    [item("1ST SENIOR'S RECREATIONAL PICKLEBALL TOURNAMENT", '2026-09-25', '10:00')],
    [listing('1ST SENIORS RECREATIONAL PICKLEBALL TOURNAMENT',
      '2026-09-25', '10:00AM')]
  );
  assert.equal(result.matched.length, 1);
  assert.equal(result.conflicts.length, 0);
});

test('printed tournament title matches named morning and afternoon sessions by slot', () => {
  const name = '3RD ANNUAL LUCK OF THE DRAW ADULT PICKLEBALL TOURNAMENT';
  const date = '2026-09-26';
  const result = reconcileCalendarInventory([
    item(`${name} — Recreational Tournament`, date, '10:00'),
    item(`${name} — Competitive Tournament`, date, '13:00'),
  ], [listing(name, date, '10:00am'), listing(name, date, '1:00pm')]);
  assert.equal(result.matched.length, 2);
  assert.equal(result.conflicts.length, 0);
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

test('a source listing with no printed start time stays visible but cannot be added', () => {
  const source = { ...listing('The HeartFakers', '2026-05-30', ''),
    excerpt: 'The HeartFakers (Tom Petty Tribute)' };
  const result = reconcileCalendarInventory([], [source]);
  assert.equal(result.conflicts[0]?.reason, 'source_start_time_unprinted');
  assert.deepEqual(result.additions, []);
  assert.equal(result.conflicts[0]?.listing.excerpt, source.excerpt);
  const decision = buildGuardedCalendarInventoryAdditions([], result, 0);
  assert.equal(decision.reason, 'disputed_reading');
});

test('a nonempty malformed source time is distinct from an unprinted time', () => {
  const result = reconcileCalendarInventory([], [
    listing('Shawn Hogan', '2026-06-05', '6:45'),
    listing('Open Mic', '2026-06-08', ''),
  ]);
  assert.deepEqual(result.conflicts.map(entry => entry.reason),
    ['invalid_fields', 'source_start_time_unprinted']);
});

test('one empty or malformed inventory frame blocks additions from a different frame', () => {
  const requested = [0, 1];
  for (const status of ['empty_inventory', 'invalid_schema',
    'incomplete_response', 'request_error']) {
    assert.equal(hasCompleteCalendarInventoryReads(requested, [
      { frameIndex: 0, status: 'completed' }, { frameIndex: 1, status },
    ]), false, status);
  }
  assert.equal(hasCompleteCalendarInventoryReads(requested, [
    { frameIndex: 0, status: 'completed' },
  ]), false);
  assert.equal(hasCompleteCalendarInventoryReads(requested, [
    { frameIndex: 0, status: 'completed' },
    { frameIndex: 1, status: 'completed' },
  ]), true);
});

test('malformed inventory array members cannot be counted as valid listings', () => {
  for (const value of [null, [], {}, { title: '' }, { title: 17 },
    { title: false }, { title: {} }, { title: ['Wing Night'] },
    { title: 'Wing Night', excerpt: {} },
    { title: 'Wing Night', performers: [17] }]) {
    assert.equal(isCalendarInventoryEventObject(value), false);
  }
  assert.equal(isCalendarInventoryEventObject({ title: 'Wing Night', start_time: '' }), true);
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
