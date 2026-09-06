import test from 'node:test';
import assert from 'node:assert/strict';

import { filterUnsupportedProductionSeasonPromotions } from './finalFormatter.js';
import { FormattedEvent } from './types.js';

function event(overrides: Partial<FormattedEvent> = {}): FormattedEvent {
  return {
    isEvent: 'Yes',
    isFoodSpecial: 'No',
    category: 'Cinema',
    name: 'Stage production',
    description: '',
    establishment: 'Sobey Family Theatre',
    address: '',
    startDate: '2026-09-03',
    endDate: '2026-09-03',
    startTime: '19:30',
    endTime: '21:10',
    ticketPrice: '',
    ticketLink: '',
    relevantImageIndex: 0,
    venue: 'Sobey Family Theatre',
    additionalLocation: '',
    isRecurring: 'No',
    recurringPattern: 'none',
    ...overrides,
  };
}

test('drops the exact legacy Come From Away select-dates season container', () => {
  const result = filterUnsupportedProductionSeasonPromotions([
    event({
      name: 'Come From Away (Charlottetown Festival)',
      description:
        "Don't miss this heartwarming Broadway smash hit, coming this summer. June 30 - September 26 (select dates).",
      startDate: '2026-06-30',
      endDate: '2026-09-26',
      startTime: '08:00',
      endTime: '17:00',
    }),
  ]);

  assert.equal(result.length, 0);
});

test('drops a fabricated daily parent made from a select-dates range', () => {
  const result = filterUnsupportedProductionSeasonPromotions([
    event({
      name: 'Come From Away (musical) — Select Dates',
      description:
        'Musical show dates: June 30, 2026 until Sept 26, 2026. Select dates at Sobey Family Theatre.',
      startDate: '2026-06-30',
      isRecurring: 'No',
    }),
  ]);

  assert.equal(result.length, 0);
});

test('drops a closing-date card derived only from a production horizon', () => {
  const result = filterUnsupportedProductionSeasonPromotions([
    event({
      name: 'Come From Away (The Charlottetown Festival) - Closing date',
      description: 'Final day listed for the Come From Away production run (select dates).',
      startDate: '2026-09-26',
      endDate: '2026-09-26',
      startTime: '10:00',
      endTime: '17:00',
    }),
  ]);

  assert.equal(result.length, 0);
});

test('drops an on-stage-now post that only supplies a run-until boundary', () => {
  const result = filterUnsupportedProductionSeasonPromotions([
    event({
      name: 'COME FROM AWAY (The Charlottetown Festival)',
      description:
        "Broadway musical COME FROM AWAY is on stage now and running until September 26.",
      startDate: '2026-09-26',
      endDate: '2026-09-26',
      startTime: '08:00',
      endTime: '18:00',
    }),
  ]);

  assert.equal(result.length, 0);
});

test('keeps a source-backed closing performance with its own time', () => {
  const exactPerformance = event({
    name: 'Come From Away — Closing Performance',
    description: 'Final performance Saturday, September 26 at 7:30 PM.',
    startDate: '2026-09-26',
    endDate: '2026-09-26',
    startTime: '19:30',
    endTime: '21:10',
  });

  assert.deepEqual(filterUnsupportedProductionSeasonPromotions([exactPerformance]), [
    exactPerformance,
  ]);
});

test('keeps exact irregular select-date occurrences emitted from a date list', () => {
  const exactPerformance = event({
    name: 'Limited Theatre — Select Dates',
    description: 'Select dates shown: September 3, 10 and 24.',
    startDate: '2026-09-10',
    endDate: '2026-09-10',
  });

  assert.deepEqual(filterUnsupportedProductionSeasonPromotions([exactPerformance]), [
    exactPerformance,
  ]);
});

test('keeps a continuous multi-day festival', () => {
  const festival = event({
    category: 'Gatherings & Parties',
    name: 'Three-Day Arts Festival',
    description: 'One continuous festival running September 4 through September 6.',
    startDate: '2026-09-04',
    endDate: '2026-09-06',
    startTime: '10:00',
    endTime: '17:00',
  });

  assert.deepEqual(filterUnsupportedProductionSeasonPromotions([festival]), [festival]);
});
