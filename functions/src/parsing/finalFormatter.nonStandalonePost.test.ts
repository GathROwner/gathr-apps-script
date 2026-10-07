import test from 'node:test';
import assert from 'node:assert/strict';

import { filterNonStandalonePostListings, filterUnsupportedClosureFoodBleed } from './finalFormatter.js';
import { FormattedEvent } from './types.js';

function listing(name: string, description: string, category = 'Food Special'): FormattedEvent {
  return { name, description, category, isFoodSpecial: category === 'Food Special' ? 'Yes' : 'No',
    isEvent: category === 'Food Special' ? 'No' : 'Yes' } as FormattedEvent;
}

test('Oct 7 non-event announcements cannot become activities or food deals', () => {
  const cases = [
    [listing('Thanksgiving Giveaway', 'Chance to win chicken and potatoes.'),
      'Like this post, comment and share. Winner announced at the draw.'],
    [listing('Mitchell’s Soups', 'Soups are back in stock; $11 each.'),
      'Mitchell’s Soups are BACK IN STOCK!'],
    [listing('50% Off Sale', '50% off cozy finds, gifts, and baby items.'),
      'Our 50% OFF sale is still on! Gifts and baby items.'],
    [listing('Pumpkins, gourds & squash', 'Hand-picked from our fields, starting at 99 cents.'),
      'Just picked! Pumpkins and gourds from our fields, starting at 99 cents.'],
    [listing('Small pumpkin', 'Small pumpkin $2.25.'),
      'Just picked! Pumpkins and gourds from our fields, starting at 99 cents.'],
    [listing('Municipal Council nomination deadline', 'Nominations accepted at the Elections Office during office hours.',
      'Gatherings & Parties'), 'Nominations open tomorrow.'],
    [listing('Thanksgiving Pumpkin Floral Arrangement', 'Pre-order a floral arrangement for pickup Friday.',
      'Gatherings & Parties'), 'Pre-order your pumpkin floral arrangement.'],
  ] as const;
  for (const [event, source] of cases) {
    assert.deepEqual(filterNonStandalonePostListings([event], source), [], event.name);
  }
});

test('keeps genuine food deals, public activities, and political gatherings', () => {
  const cases = [
    [listing('Tuesday soup special', 'Soup and a sandwich for $9.'),
      'Tuesday soup special: soup and a sandwich for $9.'],
    [listing('Pumpkin U-Pick', 'Families can book a pumpkin-picking session.', 'Family Friendly'),
      'Join our pumpkin U-Pick activity on Saturday.'],
    [listing('Meet the Mayoral Candidates', 'A public meeting with questions and answers.', 'Gatherings & Parties'),
      'Meet the mayoral candidates at 7 pm.'],
    [listing('Floral Arrangement Workshop', 'A guided flower-arranging class.', 'Workshops & Classes'),
      'Register for our floral arrangement workshop.'],
  ] as const;
  for (const [event, source] of cases) {
    assert.deepEqual(filterNonStandalonePostListings([event], source), [event], event.name);
  }
});

test('a Monday closure does not erase an explicit weekend dinner special', () => {
  const dinner = listing('Thanksgiving Turkey Dinner Special', 'Available Saturday and Sunday for $35.');
  assert.deepEqual(filterUnsupportedClosureFoodBleed([dinner],
    'Thanksgiving Dinner Special all weekend. Closed Monday for Thanksgiving.'), [dinner]);
  assert.deepEqual(filterUnsupportedClosureFoodBleed([dinner],
    'Closed Monday for Thanksgiving. Regular hours resume Tuesday.'), []);
});
