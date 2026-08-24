import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyCategoryCorrectionsForRegression,
  filterRetailMerchandisePromotions,
} from './finalFormatter.js';
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

test('meal courses do not make menu specials workshops', () => {
  const result = applyCategoryCorrectionsForRegression(
    formatted({
      category: 'Workshops & Classes',
      name: '3 Course Menu Special',
      description:
        'Friday - 3 Course Menu Special. $34.99. Select an appetizer, entree, and dessert from our custom evening menu. 5:00pm - Close.',
      establishment: "O'Brien's Social Bar & Kitchen",
      venue: "O'Brien's Social Bar & Kitchen",
      additionalLocation: "O'Brien's Social Bar & Kitchen",
    }),
    extracted({
      name: '3 Course Menu Special',
      description:
        'Friday - 3 Course Menu Special. $34.99. Select an appetizer, entree, and dessert from our custom evening menu. 5:00pm - Close.',
      venue: "O'Brien's Social Bar & Kitchen",
    })
  );

  assert.equal(result.category, 'Food Special');
  assert.equal(result.isEvent, 'No');
  assert.equal(result.isFoodSpecial, 'Yes');
});

test('real educational courses still remain workshops', () => {
  const result = applyCategoryCorrectionsForRegression(
    formatted({
      category: 'Workshops & Classes',
      name: 'Beginner Watercolour Course',
      description: 'A six-week course for beginners. Materials provided.',
    }),
    extracted({
      name: 'Beginner Watercolour Course',
      description: 'A six-week course for beginners. Materials provided.',
    })
  );

  assert.equal(result.category, 'Workshops & Classes');
  assert.equal(result.isEvent, 'Yes');
  assert.equal(result.isFoodSpecial, 'No');
});

test('legacy Family Friendly output is converted to a real primary category', () => {
  const result = applyCategoryCorrectionsForRegression(
    formatted({
      category: 'Family Friendly',
      name: 'Toddler Tunesdays',
      description: 'A music and movement session for toddlers and their grown-ups.',
    }),
    extracted({
      name: 'Toddler Tunesdays',
      description: 'A live music and movement session for toddlers and their grown-ups.',
    })
  );

  assert.equal(result.category, 'Live Music');
});

test('family wording does not replace a specific primary category', () => {
  const result = applyCategoryCorrectionsForRegression(
    formatted({
      category: 'Sports',
      name: 'Family Fishing Derby',
      description: 'A family-friendly fishing competition for all ages.',
    }),
    extracted({
      name: 'Family Fishing Derby',
      description: 'A family-friendly fishing competition for all ages.',
    })
  );

  assert.equal(result.category, 'Sports');
});

test('drops the audited Porch Goose merchandise ads even if the model calls them food specials', () => {
  const records = [
    formatted({
      category: 'Food Special',
      isEvent: 'No',
      isFoodSpecial: 'Yes',
      name: 'Porch Goose Price',
      description: 'Porch goose now only $29.99 while supplies last.',
      establishment: 'Kool Breeze Farms',
      venue: 'Kool Breeze Farms',
      additionalLocation: 'Kool Breeze Farms',
    }),
    formatted({
      category: 'Food Special',
      isEvent: 'No',
      isFoodSpecial: 'Yes',
      name: 'Porch Goose Outfits Sale (Now $19.99)',
      description: 'Porch goose outfits are on sale and in stock.',
      establishment: 'Kool Breeze Farms',
      venue: 'Kool Breeze Farms',
      additionalLocation: 'Kool Breeze Farms',
    }),
  ];

  assert.deepEqual(filterRetailMerchandisePromotions(records), []);
});

test('keeps a real market event that happens to sell merchandise', () => {
  const market = formatted({
    category: 'Gatherings & Parties',
    name: 'Holiday Makers Market',
    description: 'Public market with local vendors selling clothing, food, and home decor.',
  });

  assert.deepEqual(filterRetailMerchandisePromotions([market]), [market]);
});
