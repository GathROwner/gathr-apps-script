import test from 'node:test';
import assert from 'node:assert/strict';
import { hasConflictingBookableActivitySlot } from './eventSlotIdentity.js';
import { isDuplicateEntry } from './similarity.js';
import { pickCompatibleExactUniqueIdMatch } from '../services/exactUniqueIdCompatibility.js';
import type { EventData } from '../types/index.js';

const lane = (start: string, end: string, evidence: string): EventData => ({
  uniqueId:'1234567890123456_fixture',venueId:'fixture-pool',establishment:'Fixture Pool',name:'Lane swim',eventName:'Lane swim',
  startDate:'2026-10-14',endDate:'2026-10-14',startTime:start,endTime:end,isRecurring:'No',recurringPattern:'none',
  timeFlags:{start:{source:'explicit',evidence},end:{source:'explicit',evidence,toClose:false}},
} as EventData);
test('consecutive printed lane swims survive every same-source duplicate shortcut', () => {
  const a = lane('12:00','13:00','12:00pm - 1:00pm'), b = lane('13:00','16:00','1:00pm - 4:00pm');
  assert.equal(hasConflictingBookableActivitySlot(a,b), true);
  assert.equal(isDuplicateEntry(a,b), false);
  assert.equal(isDuplicateEntry(b,a), false);
  assert.equal(pickCompatibleExactUniqueIdMatch(a,[b],{venueId:'fixture-pool'}), undefined);
});
test('the same printed slot is still duplicate-compatible', () => {
  const a = lane('12:00','13:00','12:00pm - 1:00pm');
  assert.equal(hasConflictingBookableActivitySlot(a,{...a}), false);
  assert.equal(isDuplicateEntry(a,{...a}), true);
});
test('inferred or unsupported clocks do not block a legitimate clock correction', () => {
  const a = lane('12:00','13:00','12:00pm - 1:00pm');
  const b = lane('13:00','16:00','12:00pm - 1:00pm');
  assert.equal(hasConflictingBookableActivitySlot(a,b), false);
});
