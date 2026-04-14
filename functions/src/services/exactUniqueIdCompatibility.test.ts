import test from 'node:test';
import assert from 'node:assert/strict';
import { EventData } from '../types/index.js';
import {
  isExactUniqueIdDuplicateCompatible,
  pickCompatibleExactUniqueIdMatch,
} from './exactUniqueIdCompatibility.js';

function buildEvent(overrides: Partial<EventData>): EventData {
  return {
    uniqueId: 'shared_unique_id',
    venueId: 'venue_alpha',
    establishment: 'Sample Venue',
    eventType: 'other',
    eventName: 'Sample Event',
    name: 'Sample Event',
    description: 'Sample description',
    startDate: '2026-04-18',
    startTime: '17:00',
    endTime: '19:00',
    isEvent: 'Yes',
    isFoodSpecial: 'No',
    isRecurring: 'No',
    recurringPattern: 'none',
    ...overrides,
  };
}

test('rejects a Danse Carree style exact uniqueId collision', () => {
  const incoming = buildEvent({
    eventName: 'Danse Carree Acadienne',
    name: 'Danse Carree Acadienne',
    description: 'Traditional dance night',
    startDate: '2026-04-18',
    startTime: '17:00',
    endTime: '19:00',
    isRecurring: 'No',
    recurringPattern: 'none',
  });

  const existing = buildEvent({
    id: 'keeper_language_exchange',
    eventName: "Let's Talk & Learn! Programme d'echange de langue",
    name: "Let's Talk & Learn! Programme d'echange de langue",
    description: 'Interactive language exchange program',
    startDate: '2026-04-24',
    startTime: '17:00',
    endTime: '19:00',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_friday',
    recurringDaysOfWeek: ['friday'],
  });

  assert.equal(isExactUniqueIdDuplicateCompatible(incoming, existing), false);
  assert.equal(pickCompatibleExactUniqueIdMatch(incoming, [existing]), undefined);
});

test('allows a harmless older-keeper merge when the recurring item is semantically aligned', () => {
  const incoming = buildEvent({
    eventName: 'Sunday Sessions with Mike',
    name: 'Sunday Sessions with Mike',
    description: 'Weekly live music session',
    startDate: '2026-04-19',
    startTime: '16:00',
    endTime: '19:00',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_sunday',
    recurringDaysOfWeek: ['sunday'],
  });

  const olderKeeper = buildEvent({
    id: 'older_keeper',
    eventName: 'Sunday Sessions with Mike',
    name: 'Sunday Sessions with Mike',
    description: 'Weekly live music session',
    startDate: '2026-04-12',
    startTime: '16:00',
    endTime: '19:00',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_sunday',
    recurringDaysOfWeek: ['sunday'],
  });

  assert.equal(isExactUniqueIdDuplicateCompatible(incoming, olderKeeper), true);
  assert.equal(pickCompatibleExactUniqueIdMatch(incoming, [olderKeeper])?.id, 'older_keeper');
});

test('accepts a bilingual renamed recurring series when the exact uniqueId keeper shares the same anchor phrase, weekday, and time family', () => {
  const incoming = buildEvent({
    uniqueId: '1374461054721870_1',
    venueId: 'slug_carrefourdelislesaintjean',
    establishment: 'Carrefour ISJ',
    eventType: 'workshops_classes',
    eventName: 'Language Exchange Program: Practice English and French together',
    name: 'Language Exchange Program: Practice English and French together',
    description:
      "Programme d'echange de langue / Language Exchange Program. 3 sessions on Fridays (17 h a 19 h / 5 pm-7 pm) for $24.99. Limited spots; register now.",
    startDate: '2026-04-17',
    endDate: '2026-04-17',
    startTime: '17:00',
    endTime: '19:00',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_friday',
    recurringDaysOfWeek: ['friday'],
  });

  const existing = buildEvent({
    id: 'language_exchange_keeper',
    uniqueId: '1374461054721870_1',
    venueId: 'slug_carrefourdelislesaintjean',
    establishment: 'Carrefour ISJ',
    eventType: 'workshops_classes',
    eventName: "Programme d'echange de langue / Language Exchange Program (3 sessions)",
    name: "Programme d'echange de langue / Language Exchange Program (3 sessions)",
    description:
      "Programme d'echange de langue / Language Exchange Program. 3 sessions on Fridays 5 pm-7 pm for $24.99. Includes interactive games, cooking workshop, and outdoor outing.",
    startDate: '2026-04-24',
    endDate: '2026-04-24',
    startTime: '17:00',
    endTime: '19:00',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_friday',
    recurringDaysOfWeek: ['friday'],
  });

  assert.equal(isExactUniqueIdDuplicateCompatible(incoming, existing), true);
  assert.equal(
    pickCompatibleExactUniqueIdMatch(incoming, [existing])?.id,
    'language_exchange_keeper'
  );
});

test('ranks multiple compatible stale keepers deterministically and picks the strongest match', () => {
  const incoming = buildEvent({
    eventName: 'Sunday Sessions with Mike',
    name: 'Sunday Sessions with Mike',
    description: 'Weekly live music session with Mike',
    startDate: '2026-04-19',
    startTime: '16:00',
    endTime: '19:00',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_sunday',
    recurringDaysOfWeek: ['sunday'],
  });

  const weakerKeeper = buildEvent({
    id: 'weaker_keeper',
    eventName: 'Sunday Sessions',
    name: 'Sunday Sessions',
    description: 'Weekly live music session',
    startDate: '2026-04-05',
    startTime: '17:00',
    endTime: '20:00',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_sunday',
    recurringDaysOfWeek: ['sunday'],
  });

  const strongerKeeper = buildEvent({
    id: 'stronger_keeper',
    eventName: 'Sunday Sessions with Mike',
    name: 'Sunday Sessions with Mike',
    description: 'Weekly live music session with Mike',
    startDate: '2026-04-12',
    startTime: '16:00',
    endTime: '19:00',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_sunday',
    recurringDaysOfWeek: ['sunday'],
  });

  assert.equal(isExactUniqueIdDuplicateCompatible(incoming, weakerKeeper), true);
  assert.equal(isExactUniqueIdDuplicateCompatible(incoming, strongerKeeper), true);
  assert.equal(
    pickCompatibleExactUniqueIdMatch(incoming, [weakerKeeper, strongerKeeper])?.id,
    'stronger_keeper'
  );
});

test('keeps an aggregator-style venue mismatch audit-only', () => {
  const incoming = buildEvent({
    venueId: 'slug_downtowncharlottetowninc',
    establishment: 'The Old Triangle',
    eventName: 'Sunday Sessions',
    name: 'Sunday Sessions',
    description: 'Live music at The Old Triangle',
    startDate: '2026-04-19',
    startTime: '14:00',
    endTime: '17:00',
  });

  const existing = buildEvent({
    id: 'downtown_board_keeper',
    venueId: 'fb_951',
    establishment: 'Downtown Charlottetown Inc.',
    eventName: 'Sunday Sessions',
    name: 'Sunday Sessions',
    description: 'Downtown board listing',
    startDate: '2026-04-19',
    startTime: '14:00',
    endTime: '17:00',
  });

  assert.equal(
    isExactUniqueIdDuplicateCompatible(incoming, existing, {
      venueId: 'slug_downtowncharlottetowninc',
    }),
    false
  );
  assert.equal(
    pickCompatibleExactUniqueIdMatch(incoming, [existing], {
      venueId: 'slug_downtowncharlottetowninc',
    }),
    undefined
  );
});
