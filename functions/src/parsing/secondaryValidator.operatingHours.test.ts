import test from 'node:test';
import assert from 'node:assert/strict';

import { isOperatingHoursOnlyItemForRegression } from './secondaryValidator.js';

function item(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Test Item',
    description: '',
    category: 'Family Friendly',
    _sourceType: 'event',
    date: 'recurring',
    startTime: '11:00',
    endTime: '20:30',
    recurringPattern: 'weekly_custom',
    ...overrides,
  } as any;
}

test('rejects operating-hours-only extracted event items', () => {
  assert.equal(
    isOperatingHoursOnlyItemForRegression(
      item({
        name: 'Operating Hours (Sunday-Thursday)',
        description: 'Regular hours Sunday-Thursday: 11:00 AM - 8:30 PM.',
      })
    ),
    true
  );
});

test('rejects store hours split into weekday schedule rows', () => {
  assert.equal(
    isOperatingHoursOnlyItemForRegression(
      item({
        name: 'Regular store hours (Tuesday)',
        description: 'Store hours: Monday-Saturday 8am-5pm.',
      })
    ),
    true
  );
});

test('rejects venue-prefixed weekday hours when the time exists only in structured fields', () => {
  assert.equal(
    isOperatingHoursOnlyItemForRegression(
      item({
        name: 'Confederation Court Mall Saturday Hours',
        description:
          'Mall open hours stated as part of a weekend reminder about free downtown parking on weekends.',
        startTime: '09:00',
        endTime: '18:00',
      })
    ),
    true
  );
});

test('keeps actual happy hour specials even when they include a weekday range', () => {
  assert.equal(
    isOperatingHoursOnlyItemForRegression(
      item({
        name: 'Happy Hour (Monday to Friday)',
        description: 'Happy Hour runs Monday to Friday from 2:00 PM to 4:00 PM.',
        category: 'Happy Hour',
        _sourceType: 'special',
      })
    ),
    false
  );
});

test('keeps pool and swim activities that include public session times', () => {
  assert.equal(
    isOperatingHoursOnlyItemForRegression(
      item({
        name: 'Public Swim',
        description: 'Public swim Sunday 1:00 PM - 3:00 PM.',
        category: 'Family Friendly',
      })
    ),
    false
  );
});

test('keeps available ice time as a bookable sporting activity', () => {
  assert.equal(
    isOperatingHoursOnlyItemForRegression(
      item({
        name: 'Available Ice Time',
        description: 'Available ice time from 8:45 PM to 10:45 PM. Call the rink to book.',
        category: 'Sports',
      })
    ),
    false
  );
  assert.equal(
    isOperatingHoursOnlyItemForRegression(
      item({
        name: 'All Pools Open',
        description: 'All pools open Sunday from 1:00 PM to 4:00 PM.',
        category: 'Family Friendly',
      })
    ),
    false
  );
});

test('rejects pool and ice closure notices while preserving activity availability', () => {
  assert.equal(
    isOperatingHoursOnlyItemForRegression(
      item({
        name: 'Public Swim Cancelled',
        description: 'The pool is closed Saturday for maintenance.',
      })
    ),
    true
  );
  assert.equal(
    isOperatingHoursOnlyItemForRegression(
      item({
        name: 'Ice Time Unavailable',
        description: 'The rink is closed September 8.',
        category: 'Sports',
      })
    ),
    true
  );
});

test('keeps season opening announcements that merely mention hours', () => {
  assert.equal(
    isOperatingHoursOnlyItemForRegression(
      item({
        name: 'Season Opening',
        description:
          'The museum opens to the public starting Tuesday, June 9. Opening hours are Tue to Sat 10am to 5pm.',
      })
    ),
    false
  );
});
