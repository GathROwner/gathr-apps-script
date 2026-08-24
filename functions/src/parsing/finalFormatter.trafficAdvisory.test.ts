import test from 'node:test';
import assert from 'node:assert/strict';

import { filterTrafficAdvisoryLogisticsEvents } from './finalFormatter.js';
import { FormattedEvent } from './types.js';

function buildEvent(overrides: Partial<FormattedEvent> = {}): FormattedEvent {
  return {
    isEvent: 'Yes',
    isFoodSpecial: 'No',
    category: 'Gatherings & Parties',
    name: 'Temporary Traffic Disruption - Route 2 Winsloe (Traffic Advisory)',
    description:
      'Crews completing repairs to a leaking water service. Westbound traffic on Route 2 may experience temporary delays; traffic control personnel on site.',
    establishment: 'Route 2, Winsloe (near Campbell Road), Charlottetown',
    address: 'Route 2, Winsloe, near Campbell Road',
    startDate: '2026-07-30',
    endDate: '2026-07-30',
    startTime: '09:00',
    endTime: '15:00',
    ticketPrice: '',
    ticketLink: '',
    relevantImageIndex: 0,
    venue: 'Route 2, Winsloe (near Campbell Road), Charlottetown',
    additionalLocation: 'Route 2, Winsloe (near Campbell Road), Charlottetown',
    isRecurring: 'No',
    recurringPattern: 'none',
    ...overrides,
  };
}

const route2TrafficAdvisoryText = [
  'Temporary Traffic Disruption - Route 2 Winsloe',
  'Location: Route 2, Winsloe, near Campbell Road',
  'Date: Thursday, July 30, 2026',
  'Time: 9 a.m. to 3 p.m.',
  'Details: Crews will be completing repairs to a leaking water service.',
  'Traffic Impacts: Westbound traffic on Route 2 may experience temporary delays.',
  'Traffic control personnel will be on site.',
  'The City of Charlottetown Water & Sewer Utility apologizes for any inconvenience.',
].join('\n');

test('drops municipal traffic advisory rows parsed as events', () => {
  const filtered = filterTrafficAdvisoryLogisticsEvents(
    [buildEvent()],
    route2TrafficAdvisoryText
  );

  assert.deepEqual(filtered.map((event) => event.name), []);
});

test('keeps public events that mention street closures as logistics', () => {
  const filtered = filterTrafficAdvisoryLogisticsEvents(
    [
      buildEvent({
        name: 'Downtown Street Dance',
        description:
          'Live music, vendors, and dancing downtown. Street closures will be in place for the event.',
        category: 'Live Music',
        establishment: 'Main Street, Alberton, PEI',
        venue: 'Main Street, Alberton, PEI',
        additionalLocation: 'Main Street, Alberton, PEI',
        startDate: '2026-08-15',
        startTime: '19:00',
        endTime: '23:00',
      }),
    ],
    'Downtown Street Dance with live music and vendors. Street closures will be in place during the event.'
  );

  assert.deepEqual(filtered.map((event) => event.name), ['Downtown Street Dance']);
});
