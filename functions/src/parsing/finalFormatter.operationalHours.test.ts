import test from 'node:test';
import assert from 'node:assert/strict';

import { filterOperationalHoursOnlyEvents } from './finalFormatter.js';
import { FormattedEvent } from './types.js';

function event(name: string, description: string): FormattedEvent {
  return {
    isEvent: 'Yes',
    isFoodSpecial: 'No',
    category: 'Family Friendly',
    name,
    description,
    establishment: 'Venue',
    address: '',
    startDate: '2026-08-01',
    endDate: '2026-08-01',
    startTime: '10:00',
    endTime: '18:00',
    ticketPrice: '',
    ticketLink: '',
    relevantImageIndex: 0,
    venue: 'Venue',
    additionalLocation: 'Venue',
    isRecurring: 'Yes',
    recurringPattern: 'daily',
  } as FormattedEvent;
}

test('drops operating-hours-only records from the event output', () => {
  const records = [
    event('Splash Pad Open Daily (weather permitting)', 'Open daily from 10am to 8pm.'),
    event('Regular Farm Hours (Hands-on Experiences)', 'Regular farm hours are 10am to 6pm.'),
    event('Casino Gaming', 'Casino gaming is open daily from 12pm to 2am.'),
    event('Open daily 12-6 (closed Wednesdays)', 'Open daily 12pm to 6pm.'),
    event(
      'Robert McMillan Pottery Gallery & Studio Open (Friday)',
      'Come walk our studio floors. Open 10-5pm Wed-Sun.'
    ),
  ];

  assert.deepEqual(filterOperationalHoursOnlyEvents(records), []);
});

test('keeps a discrete public event even when its venue is open daily', () => {
  const tournament = event(
    'Casino Gaming Tournament',
    'Casino is open daily. Register for the one-night tournament on August 1.'
  );

  assert.deepEqual(filterOperationalHoursOnlyEvents([tournament]), [tournament]);
});
