import test from 'node:test';
import assert from 'node:assert/strict';

import {
  filterFacilityClosureOnlyEvents,
  filterOperationalHoursOnlyEvents,
} from './finalFormatter.js';
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
    event(
      'Confederation Court Mall Saturday Hours',
      'Mall open hours stated as part of a weekend reminder about free downtown parking on weekends.'
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

test('keeps public swim and bookable ice availability', () => {
  const publicSwim = event('Public Swim', 'Public swim Sunday from 1pm to 3pm.');
  const poolsOpen = event('All Pools Open', 'All pools open Sunday from 1pm to 4pm.');
  const availableIce = event(
    'Available Ice Time',
    'Available ice time from 8:45pm to 10:45pm. Call the rink to book.'
  );
  availableIce.category = 'Sports';

  assert.deepEqual(
    filterFacilityClosureOnlyEvents(
      filterOperationalHoursOnlyEvents([publicSwim, poolsOpen, availableIce])
    ),
    [publicSwim, poolsOpen, availableIce]
  );
});

test('drops pool and ice closure notices', () => {
  const poolClosure = event(
    'Public Swim Cancelled',
    'The pool is closed Saturday for maintenance.'
  );
  const iceClosure = event(
    'Ice Time Unavailable',
    'The rink is closed September 8.'
  );
  iceClosure.category = 'Sports';

  assert.deepEqual(
    filterFacilityClosureOnlyEvents([poolClosure, iceClosure]),
    []
  );
});
