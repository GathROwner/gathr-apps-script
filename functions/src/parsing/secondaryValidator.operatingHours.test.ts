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
