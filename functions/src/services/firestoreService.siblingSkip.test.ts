import test from 'node:test';
import assert from 'node:assert/strict';
import { EventData } from '../types/index.js';
import { pickCompatibleExactUniqueIdMatch } from './exactUniqueIdCompatibility.js';
import {
  hasExistingSameSourceSessionsCoveredByProgram,
  pickUnrecognizedVenueDocIdForSource,
  shouldSkipSiblingUniqueIdDuplicateCheck,
} from './firestoreService.js';

test('same-source timed sessions block a later umbrella program without replacing a child', () => {
  const root = '1401951132140319';
  const program = buildEvent({
    uniqueId: `${root}_67f000c83eb9152e`,
    eventName: 'Criminal Law Half-Day PD Event',
    description: 'Sessions: body worn cameras; DUI; deportation.',
    startDate: '2026-10-20', endDate: '2026-10-20',
    startTime: '08:30', endTime: '12:30',
  });
  const session1 = buildEvent({
    uniqueId: `${root}_2533dd31b83ba332`,
    eventName: 'Session 1: Body worn cameras',
    startDate: '2026-10-20', endDate: '2026-10-20',
    startTime: '09:00', endTime: '10:00',
  });
  const session2 = buildEvent({
    uniqueId: `${root}_619f694e72d7a37b`,
    eventName: 'Session 2: I have a DUI',
    startDate: '2026-10-20', endDate: '2026-10-20',
    startTime: '10:15', endTime: '11:15',
  });
  assert.equal(hasExistingSameSourceSessionsCoveredByProgram(program, [session1, session2]), true);
  assert.equal(hasExistingSameSourceSessionsCoveredByProgram(program, [session1]), false);
  assert.equal(hasExistingSameSourceSessionsCoveredByProgram(program,
    [session1, { ...session2, uniqueId: 'other_post_619f694e72d7a37b' }]), false);
  assert.equal(hasExistingSameSourceSessionsCoveredByProgram(program,
    [session1, { ...session2, startDate: '2026-10-21' }]), false);
  assert.equal(hasExistingSameSourceSessionsCoveredByProgram(program,
    [session1, { ...session2, startTime: '13:15', endTime: '14:15' }]), false);
  assert.equal(hasExistingSameSourceSessionsCoveredByProgram(
    { ...program, description: '', eventName: 'Independent workshop' }, [session1, session2]), false);
});
import { isDuplicateEntry } from '../utils/similarity.js';

function buildEvent(overrides: Partial<EventData>): EventData {
  return {
    uniqueId: '122131955871035455_4',
    venueId: '0F6W6IBgJqlKQ8AmaTGC',
    establishment: 'Buenos Island Studio',
    eventType: 'workshops_classes',
    eventName: 'Runway & Posing Workshop with Soli Coaching',
    name: 'Runway & Posing Workshop with Soli Coaching',
    description: '',
    startDate: '2026-04-18',
    endDate: '2026-04-18',
    startTime: '14:30',
    endTime: '17:30',
    isEvent: 'Yes',
    isFoodSpecial: 'No',
    isRecurring: 'No',
    recurringPattern: 'none',
    ...overrides,
  };
}

test('allows a guarded sibling candidate through when it is a strong same-date duplicate after an exact-uniqueId mismatch is rejected', () => {
  const incoming = buildEvent({});

  const wrongExactUniqueIdKeeper = buildEvent({
    id: 'wrong_exact_uniqueid_keeper',
    uniqueId: '122131955871035455_4',
    eventName: 'Salsa Bachata w/BIPOC',
    name: 'Salsa Bachata w/BIPOC',
    description: 'Saturday April 18 - 6-7:30 SALSA BACHATA w/BIPOC USHR - SOLD OUT',
    startTime: '18:00',
    endTime: '19:30',
  });

  const realKeeper = buildEvent({
    id: 'real_runway_keeper',
    uniqueId: '122131955871035455_3',
    eventName: 'Runway & Posing Workshop',
    name: 'Runway & Posing Workshop',
    description: 'Saturday April 18 - 2:30-5:30 RUNWAY&POSING Workshop with Soli Coaching',
    startTime: '14:00',
    endTime: '17:00',
  });

  assert.equal(
    pickCompatibleExactUniqueIdMatch(incoming, [wrongExactUniqueIdKeeper], {
      venueId: '0F6W6IBgJqlKQ8AmaTGC',
    }),
    undefined
  );
  assert.equal(shouldSkipSiblingUniqueIdDuplicateCheck(incoming, realKeeper), false);
  assert.equal(
    isDuplicateEntry(incoming, realKeeper, { requireEstablishmentMatch: false }),
    true
  );
});

test('treats same-source parenthetical title variants as compatible exact unique id matches', () => {
  const incoming = buildEvent({
    uniqueId: '1392327566265948_1',
    venueId: 'slug_confedcentre',
    establishment: 'Confederation Centre of the Arts',
    eventName: 'Come From Away (Charlottetown Festival)',
    name: 'Come From Away (Charlottetown Festival)',
    startDate: '2026-06-30',
    endDate: '2026-09-26',
    startTime: '08:00',
    endTime: '18:00',
    isRecurring: 'No',
    recurringPattern: 'none',
  });

  const existing = buildEvent({
    id: 'come_from_away_select_dates_keeper',
    uniqueId: '1392327566265948_1',
    venueId: 'slug_confedcentre',
    establishment: 'Confederation Centre of the Arts',
    eventName: 'Come From Away (Select Dates)',
    name: 'Come From Away (Select Dates)',
    startDate: '2026-06-30',
    endDate: '2026-09-26',
    startTime: '08:00',
    endTime: '18:00',
    isRecurring: 'No',
    recurringPattern: 'none',
  });

  assert.equal(
    pickCompatibleExactUniqueIdMatch(incoming, [existing], {
      venueId: 'slug_confedcentre',
    })?.id,
    'come_from_away_select_dates_keeper'
  );
});

test('does not treat short generic parenthetical title cores as compatible exact unique id matches', () => {
  const incoming = buildEvent({
    uniqueId: 'generic_short_core_1',
    venueId: 'venue_books',
    establishment: 'Book Store',
    eventName: 'Book Club (Fantasy)',
    name: 'Book Club (Fantasy)',
    startDate: '2026-07-21',
    startTime: '18:00',
    endTime: '19:00',
  });

  const existing = buildEvent({
    id: 'thriller_book_club',
    uniqueId: 'generic_short_core_1',
    venueId: 'venue_books',
    establishment: 'Book Store',
    eventName: 'Book Club (Thriller)',
    name: 'Book Club (Thriller)',
    startDate: '2026-07-21',
    startTime: '18:00',
    endTime: '19:00',
  });

  assert.equal(
    pickCompatibleExactUniqueIdMatch(incoming, [existing], {
      venueId: 'venue_books',
    }),
    undefined
  );
});

test('keeps the sibling-skip guard for same-root same-date items that are not strong duplicates', () => {
  const incoming = buildEvent({
    eventName: 'Runway & Posing Workshop with Soli Coaching',
    name: 'Runway & Posing Workshop with Soli Coaching',
    description: '',
    startTime: '14:30',
    endTime: '17:30',
  });

  const differentSibling = buildEvent({
    id: 'different_sibling',
    uniqueId: '122131955871035455_3',
    eventName: 'SASS Class w/Karina',
    name: 'SASS Class w/Karina',
    description: 'Saturday April 18 - 1PM SASS CLASS w/Karina $15',
    startTime: '13:00',
    endTime: '15:00',
  });

  assert.equal(
    isDuplicateEntry(incoming, differentSibling, { requireEstablishmentMatch: false }),
    false
  );
  assert.equal(shouldSkipSiblingUniqueIdDuplicateCheck(incoming, differentSibling), true);
});

test('reuses an existing unknown venue doc for the same Facebook event source and venue name', () => {
  const picked = pickUnrecognizedVenueDocIdForSource(
    [
      {
        id: 'uv_other',
        establishment: 'Other Venue',
        establishmentNormalized: 'other venue',
        status: 'pending',
        occurrences: 1,
      },
      {
        id: 'uv_island_hill_existing',
        establishment: 'Island Hill Farm Inc',
        establishmentNormalized: 'island hill farm inc',
        status: 'manual_review',
        occurrences: 1,
      },
    ],
    'island hill farm inc'
  );

  assert.equal(picked, 'uv_island_hill_existing');
});

test('does not collapse same-source age-group sibling events', () => {
  const incoming = buildEvent({
    uniqueId: '1507911641334813_2',
    venueId: '5fxwonYWZbp95kOOjdfF',
    establishment: "Veteran's Memorial Park",
    eventName: 'Downtown Summerside Easter Egg Hunt (Age 7+)',
    name: 'Downtown Summerside Easter Egg Hunt (Age 7+)',
    description:
      'Downtown Summerside Easter Egg Hunt. Age 7+ Easter Egg Hunt 12:30 - 1:00 P.M.',
    startDate: '2026-03-28',
    endDate: '2026-03-28',
    startTime: '12:30',
    endTime: '13:00',
  });

  const youngerSibling = buildEvent({
    id: 'age_0_6_keeper',
    uniqueId: '1507911641334813_1',
    venueId: '5fxwonYWZbp95kOOjdfF',
    establishment: "Veteran's Memorial Park",
    eventName: 'Downtown Summerside Easter Egg Hunt (Age 0-6 Hunt)',
    name: 'Downtown Summerside Easter Egg Hunt (Age 0-6 Hunt)',
    description:
      'Downtown Summerside Easter Egg Hunt. Age 0 - 6 Hunt 11 - 11:30.',
    startDate: '2026-03-28',
    endDate: '2026-03-28',
    startTime: '11:00',
    endTime: '11:30',
  });

  assert.equal(
    isDuplicateEntry(incoming, youngerSibling, { requireEstablishmentMatch: false }),
    false
  );
  assert.equal(shouldSkipSiblingUniqueIdDuplicateCheck(incoming, youngerSibling), true);
});

test('keeps a same-post gallery talk separate from an exhibition opening at a different time', () => {
  const opening = buildEvent({
    uniqueId: '1713005494164338_18811d195622afe4',
    eventName: 'SOFT INTERNET THEORY — Exhibition Opening',
    name: 'SOFT INTERNET THEORY — Exhibition Opening',
    startDate: '2026-10-03',
    startTime: '19:00',
  });
  const talk = buildEvent({
    uniqueId: '1713005494164338_b081946e4a9087fe',
    eventName: 'SOFT INTERNET THEORY Talk and Tour',
    name: 'SOFT INTERNET THEORY Talk and Tour',
    startDate: '2026-10-03',
    startTime: '18:00',
  });

  assert.equal(isDuplicateEntry(talk, opening, { requireEstablishmentMatch: false }), true);
  assert.equal(shouldSkipSiblingUniqueIdDuplicateCheck(talk, opening), true);
});

test('still deduplicates a same-post event whose time was corrected', () => {
  const opening = buildEvent({
    uniqueId: '1713005494164338_18811d195622afe4',
    eventName: 'SOFT INTERNET THEORY — Exhibition Opening',
    name: 'SOFT INTERNET THEORY — Exhibition Opening',
    startDate: '2026-10-03',
    startTime: '19:00',
  });
  const correctedOpening = buildEvent({
    uniqueId: '1713005494164338_b8079fb6a7686270',
    eventName: 'SOFT INTERNET THEORY Exhibition Opening',
    name: 'SOFT INTERNET THEORY Exhibition Opening',
    startDate: '2026-10-03',
    startTime: '18:00',
  });

  assert.equal(shouldSkipSiblingUniqueIdDuplicateCheck(correctedOpening, opening), false);
});
