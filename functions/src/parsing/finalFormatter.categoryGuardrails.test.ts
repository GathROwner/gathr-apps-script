import test from 'node:test';
import assert from 'node:assert/strict';

import { applyCategoryCorrectionsForRegression } from './finalFormatter.js';
import { CalendarItem, FormattedEvent } from './types.js';

function formatted(overrides: Partial<FormattedEvent> = {}): FormattedEvent {
  return {
    isEvent: 'Yes',
    isFoodSpecial: 'No',
    category: 'Live Music',
    name: 'Adam & The Foes',
    description: 'Beer Garden: Adam & The Foes',
    establishment: 'Beer Garden',
    address: '',
    startDate: '2026-08-01',
    endDate: '2026-08-01',
    startTime: '18:00',
    endTime: '20:00',
    ticketPrice: '',
    ticketLink: '',
    relevantImageIndex: 0,
    venue: 'Beer Garden',
    additionalLocation: 'Beer Garden',
    isRecurring: 'No',
    recurringPattern: 'none',
    ...overrides,
  };
}

function extracted(overrides: Partial<CalendarItem> = {}): CalendarItem {
  return {
    name: 'Adam & The Foes',
    type: 'event',
    description: 'Beer Garden: Adam & The Foes',
    venue: 'Beer Garden',
    date: '2026-08-01',
    startTime: '18:00',
    endTime: '20:00',
    _sourceType: 'schedule',
    ...overrides,
  };
}

test('Beer Garden venue wording does not turn a named performer into a food special', () => {
  for (const name of ['Adam & The Foes', 'Jon & Liam', 'Kim Albert Trio']) {
    const result = applyCategoryCorrectionsForRegression(
      formatted({ name, description: `Beer Garden: ${name}` }),
      extracted({ name, description: `Beer Garden: ${name}` })
    );

    assert.equal(result.category, 'Live Music');
    assert.equal(result.isEvent, 'Yes');
    assert.equal(result.isFoodSpecial, 'No');
  }
});

test('an actual beer special is still categorized as a food or drink special', () => {
  const result = applyCategoryCorrectionsForRegression(
    formatted({
      category: 'Gatherings & Parties',
      name: '$6 Beer Special',
      description: '$6 beer special from 4-6 PM.',
      establishment: 'Taproom',
      venue: 'Taproom',
      additionalLocation: 'Taproom',
    }),
    extracted({
      name: '$6 Beer Special',
      description: '$6 beer special from 4-6 PM.',
      venue: 'Taproom',
    })
  );

  assert.equal(result.category, 'Food Special');
  assert.equal(result.isEvent, 'No');
  assert.equal(result.isFoodSpecial, 'Yes');
});
