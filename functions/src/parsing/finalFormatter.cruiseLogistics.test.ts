import test from 'node:test';
import assert from 'node:assert/strict';

import { filterCruiseShipLogisticsEvents } from './finalFormatter.js';
import { FormattedEvent } from './types.js';

function buildEvent(overrides: Partial<FormattedEvent> = {}): FormattedEvent {
  return {
    isEvent: 'Yes',
    isFoodSpecial: 'No',
    category: 'Gatherings & Parties',
    name: 'Victory I',
    description: 'Cruise arrival; 190 PAX (total passengers).',
    establishment: 'Port Charlottetown',
    address: '1 Weymouth Street, Charlottetown, PE',
    startDate: '2026-04-20',
    endDate: '2026-04-20',
    startTime: '07:00',
    endTime: '',
    ticketPrice: '',
    ticketLink: '',
    relevantImageIndex: 0,
    venue: 'Port Charlottetown',
    additionalLocation: '',
    isRecurring: 'No',
    recurringPattern: 'none',
    ...overrides,
  };
}

const cruiseScheduleText = [
  'Activate Cruise Mode',
  'The 2026 cruise season kicks off at Port Charlottetown on April 20 with the arrival of Victory I.',
  'Explore the upcoming cruise schedule and be part of the celebration.',
  'OCR TEXT: PORT CHARLOTTETOWN CRUISE ARRIVALS April 20-May 27 APRIL 20 7:00AM 190 PAX VICTORY I ZUIDERDAM 1964 PAX',
].join('\n');

test('drops cruise ship arrival rows parsed from a Port Charlottetown cruise schedule', () => {
  const filtered = filterCruiseShipLogisticsEvents(
    [
      buildEvent({
        name: 'Victory I (Cruise Arrival)',
        description:
          'Cruise arrival; 190 PAX (total passengers). 2026 cruise season kickoff mentioned in post text.',
      }),
      buildEvent({
        name: 'Pearl Mist - Departure',
        description: 'Cruise departure (passenger count not shown on this line in the schedule).',
        startDate: '2026-05-12',
        startTime: '20:00',
      }),
    ],
    cruiseScheduleText
  );

  assert.deepEqual(filtered.map((event) => event.name), []);
});

test('drops bare ship names when the event description carries the passenger-count logistics cue', () => {
  const filtered = filterCruiseShipLogisticsEvents(
    [
      buildEvent({
        name: 'Volendam',
        description: 'Cruise arrival; 1432 PAX (total passengers).',
        startDate: '2026-05-26',
        startTime: '08:00',
      }),
    ],
    cruiseScheduleText
  );

  assert.equal(filtered.length, 0);
});

test('keeps public cruise-themed events that are not ship-call logistics', () => {
  const filtered = filterCruiseShipLogisticsEvents(
    [
      buildEvent({
        name: 'Cruise Night Fundraiser',
        description: 'Live music fundraiser with tickets available at the door.',
        establishment: 'PEI Brewing Company',
        venue: 'PEI Brewing Company',
      }),
    ],
    'Join us for a Cruise Night Fundraiser with live music and tickets at the door.'
  );

  assert.deepEqual(filtered.map((event) => event.name), ['Cruise Night Fundraiser']);
});
