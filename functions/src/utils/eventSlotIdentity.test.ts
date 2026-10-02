import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  explicitSlotOrdinal,
  hasConflictingExplicitSlotOrdinals,
  hasMatchingExplicitSlotIdentity,
} from './eventSlotIdentity.js';
import { isDuplicateEntry } from './similarity.js';

const classEvent = (name: string, startTime: string, endTime: string) => ({
  eventName: name,
  name,
  establishment: 'Eptek Art & Culture Centre',
  startDate: '2026-10-18',
  startTime,
  endTime,
});

test('matches the correct art-class group despite an older corrupted time', () => {
  const incoming = classEvent("Let's Get Creative Kid's Art Club (Fall session) - Time Slot 1", '12:30', '13:45');
  const oldGroup1 = classEvent("Let's Get Creative Art Club @ Eptek – Fall 2026 (Group 1)", '01:00', '12:30');
  const oldGroup2 = classEvent("Let's Get Creative Art Club @ Eptek – Fall 2026 (Group 2)", '14:00', '14:15');

  assert.equal(hasMatchingExplicitSlotIdentity(incoming, oldGroup1), true);
  assert.equal(hasMatchingExplicitSlotIdentity(incoming, oldGroup2), false);
  assert.equal(hasConflictingExplicitSlotOrdinals(incoming, oldGroup2), true);
  assert.equal(isDuplicateEntry(incoming, oldGroup2, { requireEstablishmentMatch: false }), false);
});

test('matches Group 2 only to Time Slot 2, even within normal time tolerance of Group 1', () => {
  const incoming = classEvent("Let's Get Creative Kid's Art Club (Fall session) - Time Slot 2", '14:15', '15:30');
  const oldGroup1 = classEvent("Let's Get Creative Art Club @ Eptek – Fall 2026 (Group 1)", '12:30', '13:45');
  const oldGroup2 = classEvent("Let's Get Creative Art Club @ Eptek – Fall 2026 (Group 2)", '14:00', '14:15');

  assert.equal(hasMatchingExplicitSlotIdentity(incoming, oldGroup1), false);
  assert.equal(hasMatchingExplicitSlotIdentity(incoming, oldGroup2), true);
  assert.equal(isDuplicateEntry(incoming, oldGroup1, { requireEstablishmentMatch: false }), false);
});

test('a bare matching group number cannot merge unrelated events', () => {
  assert.equal(
    hasMatchingExplicitSlotIdentity(
      { name: 'Watercolour Basics (Group 1)' },
      { name: 'Junior Hockey Camp (Group 1)' }
    ),
    false
  );
  assert.equal(explicitSlotOrdinal({ name: 'Time Slot 12:30–1:45pm' }), null);
  assert.equal(explicitSlotOrdinal({ name: 'Friday dinner at 6 PM' }), null);
});
