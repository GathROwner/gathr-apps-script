import test from 'node:test';
import assert from 'node:assert/strict';
import { EventData } from '../types/index.js';
import {
  isRecurringFamilyFallbackCompatible,
  pickRecurringFamilyFallbackMatch,
} from './recurringFamilyFallback.js';

function buildEvent(overrides: Partial<EventData>): EventData {
  return {
    uniqueId: 'row_unique_1',
    venueId: 'aaUr1AtLKEjPEtmhKD8u',
    establishment: 'The Club | Sydney NS',
    eventType: 'live_music',
    eventName: 'Open Mic Sunday',
    name: 'Open Mic Sunday',
    description: 'Weekly Sunday open mic.',
    startDate: '2026-04-05',
    endDate: '2026-04-05',
    startTime: '16:00',
    endTime: '19:00',
    isEvent: 'Yes',
    isFoodSpecial: 'No',
    isRecurring: 'No',
    recurringPattern: 'none',
    ...overrides,
  };
}

test('matches a shifted-base recurring open-mic family after same-date duplicate checks miss', () => {
  const incoming = buildEvent({
    uniqueId: 'row300_open_mic',
    eventName: 'Open mic Sunday with Mike Fagen',
    name: 'Open mic Sunday with Mike Fagen',
    description: 'Sunday open mic with Mike Fagen on the weekly board.',
    startDate: '2026-04-05',
    endDate: '2026-04-05',
    startTime: '16:00',
    endTime: '01:00',
  });

  const olderKeeper = buildEvent({
    id: 'host_specific_keeper',
    uniqueId: '1435388334948728_4',
    eventName: 'Open mic Sunday with Mike Fagen',
    name: 'Open mic Sunday with Mike Fagen',
    description: 'Weekly Sunday open mic with Mike Fagen.',
    startDate: '2026-02-24',
    endDate: '2026-02-24',
    startTime: '16:00',
    endTime: '23:00',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_sunday',
    recurringDaysOfWeek: ['sunday'],
  });

  assert.equal(isRecurringFamilyFallbackCompatible(incoming, olderKeeper), true);
  assert.equal(pickRecurringFamilyFallbackMatch(incoming, [olderKeeper])?.id, 'host_specific_keeper');
});

test('does not match another sunday recurring program at the same venue without a strong family anchor', () => {
  const incoming = buildEvent({
    uniqueId: 'row300_open_mic',
    eventName: 'Open mic Sunday with Mike Fagen',
    name: 'Open mic Sunday with Mike Fagen',
    description: 'Sunday open mic with Mike Fagen on the weekly board.',
    startDate: '2026-04-05',
    endDate: '2026-04-05',
    startTime: '16:00',
    endTime: '01:00',
  });

  const otherSundayProgram = buildEvent({
    id: 'different_family_keeper',
    uniqueId: 'sunday_sessions_1',
    eventName: 'Sunday Sessions with Mike Fagen',
    name: 'Sunday Sessions with Mike Fagen',
    description: 'Weekly Sunday live music session with Mike Fagen.',
    startDate: '2026-03-01',
    endDate: '2026-03-01',
    startTime: '16:00',
    endTime: '19:00',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_sunday',
    recurringDaysOfWeek: ['sunday'],
  });

  assert.equal(isRecurringFamilyFallbackCompatible(incoming, otherSundayProgram), false);
  assert.equal(pickRecurringFamilyFallbackMatch(incoming, [otherSundayProgram]), undefined);
});

test('prefers the host-specific keeper over a generic open-mic variant when host tokens align', () => {
  const incoming = buildEvent({
    uniqueId: 'row300_open_mic',
    eventName: 'Open mic Sunday with Mike Fagen',
    name: 'Open mic Sunday with Mike Fagen',
    description: 'Sunday open mic with Mike Fagen on the weekly board.',
    startDate: '2026-04-05',
    endDate: '2026-04-05',
    startTime: '16:00',
    endTime: '01:00',
  });

  const genericKeeper = buildEvent({
    id: 'generic_keeper',
    uniqueId: 'open_mic_generic_1',
    eventName: 'Open Mic Sunday',
    name: 'Open Mic Sunday',
    description: 'Weekly Sunday open mic.',
    startDate: '2026-04-12',
    endDate: '2026-04-12',
    startTime: '16:00',
    endTime: '19:00',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_sunday',
    recurringDaysOfWeek: ['sunday'],
  });

  const hostSpecificKeeper = buildEvent({
    id: 'host_specific_keeper',
    uniqueId: '1435388334948728_4',
    eventName: 'Open mic Sunday with Mike Fagen',
    name: 'Open mic Sunday with Mike Fagen',
    description: 'Weekly Sunday open mic with Mike Fagen.',
    startDate: '2026-02-24',
    endDate: '2026-02-24',
    startTime: '16:00',
    endTime: '23:00',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_sunday',
    recurringDaysOfWeek: ['sunday'],
  });

  assert.equal(isRecurringFamilyFallbackCompatible(incoming, genericKeeper), true);
  assert.equal(isRecurringFamilyFallbackCompatible(incoming, hostSpecificKeeper), true);
  assert.equal(
    pickRecurringFamilyFallbackMatch(incoming, [genericKeeper, hostSpecificKeeper])?.id,
    'host_specific_keeper'
  );
});
