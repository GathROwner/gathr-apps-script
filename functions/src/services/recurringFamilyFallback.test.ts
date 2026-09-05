import test from 'node:test';
import assert from 'node:assert/strict';
import { EventData } from '../types/index.js';
import {
  isIncomingRecurringFamilyCompatibleWithExistingOccurrence,
  isRecurringFamilyFallbackCompatible,
  pickIncomingRecurringFamilyExistingOccurrenceMatch,
  pickRecurringFamilyFallbackMatch,
} from './recurringFamilyFallback.js';

function buildEvent(overrides: Partial<EventData> & Record<string, unknown>): EventData {
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

test('does not match a one-off calendar item from a different post just because an older keeper says weekly', () => {
  const incoming = buildEvent({
    uniqueId: '1571494188119442_4a8de12fff7e8397',
    venueId: 'fb_100057766283684',
    establishment: "Baba's Lounge",
    eventType: 'happy_hour',
    eventName: 'Happy Hour: $6 Pint w/ Appetizer',
    name: 'Happy Hour: $6 Pint w/ Appetizer',
    description: 'Pint with appetizer.',
    startDate: '2026-07-07',
    endDate: '2026-07-07',
    startTime: '16:00',
    endTime: '19:00',
    isFoodSpecial: 'Yes',
    isEvent: 'No',
    isRecurring: 'No',
    recurringPattern: 'none',
  });

  const olderKeeper = buildEvent({
    id: 'june_30_keeper',
    uniqueId: '1544517017483826_35',
    venueId: 'fb_100057766283684',
    establishment: "Baba's Lounge",
    eventType: 'happy_hour',
    eventName: 'Happy Hour: $6 Pint w/ Appetizer',
    name: 'Happy Hour: $6 Pint w/ Appetizer',
    description: 'Pint with appetizer.',
    startDate: '2026-06-30',
    endDate: '2026-06-30',
    startTime: '16:00',
    endTime: '19:00',
    isFoodSpecial: 'Yes',
    isEvent: 'No',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_tuesday',
  });

  assert.equal(isRecurringFamilyFallbackCompatible(incoming, olderKeeper), false);
  assert.equal(pickRecurringFamilyFallbackMatch(incoming, [olderKeeper]), undefined);
});

test('does not merge a weekly poster occurrence into a different dated schedule occurrence', () => {
  const incoming = buildEvent({
    uniqueId: '1621154443353403_38ef877f3df49646',
    venueId: 'fb_100063789511997',
    establishment: 'Peake’s Quay | Charlottetown PE',
    eventName: 'Michael Roves',
    name: 'Michael Roves',
    description: 'Sounds of the Waterfront schedule (July 6 - July 12).',
    startDate: '2026-07-09',
    endDate: '2026-07-09',
    startTime: '14:00',
    endTime: '16:00',
    isRecurring: 'No',
    recurringPattern: 'none',
    _sourceType: 'calendar',
  });

  const previousWeekOccurrence = buildEvent({
    id: 'july_2_michael_roves_keeper',
    uniqueId: '1614342770701237_1f535c3a860cced7',
    venueId: 'fb_100063789511997',
    establishment: 'Peake’s Quay | Charlottetown PE',
    eventName: 'Michael Roves',
    name: 'Michael Roves',
    description: 'Sounds of the Waterfront weekly schedule (July 1–July 5).',
    startDate: '2026-07-02',
    endDate: '2026-07-02',
    startTime: '14:00',
    endTime: '16:00',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_thursday',
    _sourceType: 'calendar',
  });

  assert.equal(isRecurringFamilyFallbackCompatible(incoming, previousWeekOccurrence), false);
  assert.equal(pickRecurringFamilyFallbackMatch(incoming, [previousWeekOccurrence]), undefined);
});

test('still matches a cross-post recurring family when the text gives recurring evidence', () => {
  const incoming = buildEvent({
    uniqueId: 'new_farmers_market_post_1',
    venueId: 'slug_charlottetownfarmersmarket',
    establishment: 'Charlottetown Farmers Market',
    eventType: 'market',
    eventName: 'Charlottetown Farmers Market',
    name: 'Charlottetown Farmers Market',
    description: 'Open every Saturday with local vendors, food, crafts, and music.',
    startDate: '2026-07-04',
    endDate: '2026-07-04',
    startTime: '09:00',
    endTime: '14:00',
    isEvent: 'Yes',
    isFoodSpecial: 'No',
    isRecurring: 'No',
    recurringPattern: 'none',
  });

  const olderKeeper = buildEvent({
    id: 'farmers_market_keeper',
    uniqueId: 'old_farmers_market_post_2',
    venueId: 'slug_charlottetownfarmersmarket',
    establishment: 'Charlottetown Farmers Market',
    eventType: 'market',
    eventName: 'Charlottetown Farmers Market',
    name: 'Charlottetown Farmers Market',
    description: 'Weekly Saturday farmers market.',
    startDate: '2026-06-27',
    endDate: '2026-06-27',
    startTime: '09:00',
    endTime: '14:00',
    isEvent: 'Yes',
    isFoodSpecial: 'No',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_saturday',
  });

  assert.equal(isRecurringFamilyFallbackCompatible(incoming, olderKeeper), true);
  assert.equal(pickRecurringFamilyFallbackMatch(incoming, [olderKeeper])?.id, 'farmers_market_keeper');
});

test('does not fold a dated Salty Saturdays lineup into a stale recurring keeper', () => {
  const incoming = buildEvent({
    uniqueId: '1843494740373047_abbe51656d78c73b',
    venueId: 'slug_saltandsolpei',
    establishment: 'Salt & Sol Restaurant and Lounge',
    eventType: 'live_music',
    eventName: 'Salty Saturdays (ft. DJ Dekz & Jeremie)',
    name: 'Salty Saturdays (ft. DJ Dekz & Jeremie)',
    description: 'Saturday: Salty Saturdays ft Sundrift Festival with DJ Dekz and Jeremie',
    startDate: '2026-07-04',
    endDate: '2026-07-05',
    startTime: '22:00',
    endTime: '02:00',
    isEvent: 'Yes',
    isFoodSpecial: 'No',
    isRecurring: 'No',
    recurringPattern: 'none',
  });

  const staleKeeper = buildEvent({
    id: 'hk56ENbgJxXh4wbxjyGT',
    uniqueId: '1796647248391130_1',
    venueId: 'slug_saltandsolpei',
    establishment: 'Salt & Sol Restaurant and Lounge',
    eventType: 'live_music',
    eventName: 'Salty Saturdays: MÖJO',
    name: 'Salty Saturdays: MÖJO',
    description: 'Salty Saturday nights are back!! @mojo.mojo.mo.jo kicking off our summer this Saturday at 10pm. Rain or shine!',
    startDate: '2026-05-16',
    endDate: '2026-05-17',
    startTime: '22:00',
    endTime: '02:00',
    isEvent: 'Yes',
    isFoodSpecial: 'No',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_saturday',
  });

  assert.equal(isRecurringFamilyFallbackCompatible(incoming, staleKeeper), false);
  assert.equal(pickRecurringFamilyFallbackMatch(incoming, [staleKeeper]), undefined);
});

test('allows a dated schedule item to refresh a durable recurring series keeper', () => {
  const incoming = buildEvent({
    uniqueId: 'new_farmers_market_weekly_flyer',
    venueId: 'slug_charlottetownfarmersmarket',
    establishment: 'Charlottetown Farmers Market',
    eventType: 'market',
    eventName: 'Charlottetown Farmers Market',
    name: 'Charlottetown Farmers Market',
    description: 'This week at the Charlottetown Farmers Market.',
    startDate: '2026-07-04',
    endDate: '2026-07-04',
    startTime: '09:00',
    endTime: '14:00',
    isEvent: 'Yes',
    isFoodSpecial: 'No',
    isRecurring: 'No',
    recurringPattern: 'none',
    _sourceType: 'calendar',
  });

  const durableSeriesKeeper = buildEvent({
    id: 'farmers_market_series_keeper',
    uniqueId: 'old_farmers_market_series',
    venueId: 'slug_charlottetownfarmersmarket',
    establishment: 'Charlottetown Farmers Market',
    eventType: 'market',
    eventName: 'Charlottetown Farmers Market',
    name: 'Charlottetown Farmers Market',
    description: 'Weekly Saturday farmers market with local vendors, food, crafts, and music.',
    startDate: '2026-06-27',
    endDate: '2026-06-27',
    startTime: '09:00',
    endTime: '14:00',
    isEvent: 'Yes',
    isFoodSpecial: 'No',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_saturday',
    recurringDaysOfWeek: ['saturday'],
    recurrenceUntilDate: '2026-10-31',
  });

  assert.equal(isRecurringFamilyFallbackCompatible(incoming, durableSeriesKeeper), true);
  assert.equal(
    pickRecurringFamilyFallbackMatch(incoming, [durableSeriesKeeper])?.id,
    'farmers_market_series_keeper'
  );
});

test('matches an incoming recurring parent to a same-source one-off occurrence child', () => {
  const incomingParent = buildEvent({
    id: 'td_summer_reading_parent',
    uniqueId: '1365076749141329_7',
    venueId: 'slug_kinkorapubliclibrary',
    establishment: 'Kinkora Public Library',
    eventType: 'community',
    eventName: 'TD Summer Reading Club Activities',
    name: 'TD Summer Reading Club Activities',
    description: 'Thursdays at 5:00 p.m. Join us each week for summer reading club activities.',
    startDate: '2026-08-13',
    endDate: '2026-08-13',
    startTime: '17:00',
    endTime: '19:00',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_thursday',
    totalOccurrences: 3,
  });

  const existingChild = buildEvent({
    id: 'aug_20_child',
    uniqueId: '1365076749141329_8',
    venueId: 'slug_kinkorapubliclibrary',
    establishment: 'Kinkora Public Library',
    eventType: 'community',
    eventName: 'TD Summer Reading Club Activities',
    name: 'TD Summer Reading Club Activities',
    description: 'Thursdays at 5:00 p.m. Join us each week for summer reading club activities.',
    startDate: '2026-08-20',
    endDate: '2026-08-20',
    startTime: '17:00',
    endTime: '19:00',
    isRecurring: 'No',
    recurringPattern: 'none',
  });

  assert.equal(
    isIncomingRecurringFamilyCompatibleWithExistingOccurrence(incomingParent, existingChild),
    true
  );
  assert.equal(
    pickIncomingRecurringFamilyExistingOccurrenceMatch(incomingParent, [existingChild])?.id,
    'aug_20_child'
  );
});

test('does not match an incoming false recurring schedule to a different-source one-off event', () => {
  const incomingFalseRecurring = buildEvent({
    id: 'calendar_board_false_series',
    uniqueId: '122223_calendar_9',
    venueId: 'slug_thetivolicinema',
    establishment: 'The Tivoli Cinema',
    eventType: 'film',
    eventName: 'Early Test Screening (Invite Only) - Courtesy of MUBI and Camp Miasma Pictures LLC',
    name: 'Early Test Screening (Invite Only) - Courtesy of MUBI and Camp Miasma Pictures LLC',
    description: 'Early test screening invite only alongside Aug 14th at 7:00PM.',
    startDate: '2026-08-07',
    endDate: '2026-08-07',
    startTime: '19:00',
    endTime: '23:00',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_friday',
    totalOccurrences: 2,
    _sourceType: 'calendar',
  });

  const existingOneOff = buildEvent({
    id: 'camp_miasma_one_night',
    uniqueId: '122222_event_1',
    venueId: 'slug_thetivolicinema',
    establishment: 'The Tivoli Cinema',
    eventType: 'film',
    eventName: 'Welcome to Camp Tivoli (Camp Miasma) — Special Test Screening of the Franchise Reboot',
    name: 'Welcome to Camp Tivoli (Camp Miasma) — Special Test Screening of the Franchise Reboot',
    description: 'One night only. Friday, Aug 14 at 7:00PM.',
    startDate: '2026-08-14',
    endDate: '2026-08-14',
    startTime: '19:00',
    endTime: '23:00',
    isRecurring: 'No',
    recurringPattern: 'none',
  });

  assert.equal(
    isIncomingRecurringFamilyCompatibleWithExistingOccurrence(incomingFalseRecurring, existingOneOff),
    false
  );
  assert.equal(
    pickIncomingRecurringFamilyExistingOccurrenceMatch(incomingFalseRecurring, [existingOneOff]),
    undefined
  );
});
