import test from 'node:test';
import assert from 'node:assert/strict';

import { applyCategoryCorrectionsForRegression } from './finalFormatter.js';
import { CalendarItem, FormattedEvent } from './types.js';

function formatted(overrides: Partial<FormattedEvent> = {}): FormattedEvent {
  return {
    isEvent: 'Yes',
    isFoodSpecial: 'No',
    category: 'Workshops & Classes',
    name: '3 Course Menu Special',
    description:
      'Friday - 3 Course Menu Special. $34.99. Select an appetizer, entree, and dessert from our custom evening menu. 5:00pm - Close.',
    establishment: "O'Brien's Social Bar & Kitchen",
    address: '',
    startDate: '2026-04-10',
    endDate: '2026-04-10',
    startTime: '17:00',
    endTime: '21:00',
    ticketPrice: '',
    ticketLink: '',
    relevantImageIndex: 0,
    venue: "O'Brien's Social Bar & Kitchen",
    additionalLocation: "O'Brien's Social Bar & Kitchen",
    isRecurring: 'Yes',
    recurringPattern: 'weekly_friday',
    ...overrides,
  };
}

function extracted(overrides: Partial<CalendarItem> = {}): CalendarItem {
  return {
    name: '3 Course Menu Special',
    type: 'event',
    description:
      'Friday - 3 Course Menu Special. $34.99. Select an appetizer, entree, and dessert from our custom evening menu. 5:00pm - Close.',
    venue: "O'Brien's Social Bar & Kitchen",
    date: '2026-04-10',
    startTime: '17:00',
    endTime: '21:00',
    _sourceType: 'schedule',
    ...overrides,
  };
}

test('meal courses do not make menu specials workshops', () => {
  const result = applyCategoryCorrectionsForRegression(formatted(), extracted());

  assert.equal(result.category, 'Food Special');
  assert.equal(result.isEvent, 'No');
  assert.equal(result.isFoodSpecial, 'Yes');
});

test('real educational courses still remain workshops', () => {
  const result = applyCategoryCorrectionsForRegression(
    formatted({
      isEvent: 'Yes',
      isFoodSpecial: 'No',
      category: 'Workshops & Classes',
      name: 'Beginner Watercolour Course',
      description: 'A six-week course for beginners. Materials provided.',
      establishment: 'Arts Studio',
      venue: 'Arts Studio',
      additionalLocation: 'Arts Studio',
      isRecurring: 'No',
      recurringPattern: 'none',
    }),
    extracted({
      name: 'Beginner Watercolour Course',
      description: 'A six-week course for beginners. Materials provided.',
      venue: 'Arts Studio',
      _sourceType: 'schedule',
    })
  );

  assert.equal(result.category, 'Workshops & Classes');
  assert.equal(result.isEvent, 'Yes');
  assert.equal(result.isFoodSpecial, 'No');
});
