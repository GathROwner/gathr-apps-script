import test from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import {
  getSharedEventEffectiveEnd,
  isSharedEventStale,
  isUndatedSharedEventStale,
} from './sharedEventCleanup.js';

const NOW = DateTime.fromISO('2026-08-23T18:00:00Z');

test('does not remove an event before its local end time', () => {
  assert.equal(isSharedEventStale({
    fields: {
      endDate: '2026-08-23',
      endTime: '16:00',
      timezone: 'America/Halifax',
    },
    now: NOW,
    graceDays: 0,
  }), false);
});

test('removes a one-off event after its end and configured grace', () => {
  assert.equal(isSharedEventStale({
    fields: {
      endDate: '2026-08-21',
      endTime: '22:00',
      timezone: 'America/Halifax',
    },
    now: NOW,
    graceDays: 1,
  }), true);
});

test('retains recurring events until the recurrence end date passes', () => {
  const fields = {
    endDate: '2026-08-01',
    endTime: '20:00',
    timezone: 'America/Halifax',
    recurringPattern: 'weekly',
    recurrenceUntilDate: '2026-09-01',
  };
  assert.equal(getSharedEventEffectiveEnd(fields)?.toISODate(), '2026-09-01');
  assert.equal(isSharedEventStale({ fields, now: NOW, graceDays: 0 }), false);
});

test('retains undated records for manual review', () => {
  assert.equal(isSharedEventStale({ fields: {}, now: NOW, graceDays: 0 }), false);
});

test('eventually removes undated records that remain stale for 30 days', () => {
  assert.equal(isUndatedSharedEventStale({
    fields: { createdAt: '2026-07-01T12:00:00Z' },
    now: NOW,
    graceDays: 30,
  }), true);
  assert.equal(isUndatedSharedEventStale({
    fields: { createdAt: '2026-08-20T12:00:00Z' },
    now: NOW,
    graceDays: 30,
  }), false);
});
