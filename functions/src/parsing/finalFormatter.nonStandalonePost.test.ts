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

test('mixed bakery closure keeps the named first-time bread offer, not the ordinary pie prices', () => {
  const bread = listing('Day-old bread', 'First-time special, $1.49/loaf.');
  const pie = listing('Pumpkin Pie', 'Pumpkin pie $12.');
  assert.deepEqual(filterUnsupportedClosureFoodBleed([pie, bread],
    'THANKSGIVING!\nFIRST-TIME SPECIAL! Day-old bread for just $1.49/loaf\nFriday 9 AM–5 PM\nClosed Sunday & Monday!'), [bread]);
  assert.deepEqual(filterUnsupportedClosureFoodBleed([pie, bread],
    'Closed Sunday and Monday. Regular bakery prices: day-old bread $1.49, pumpkin pie $12.'), []);
  const namedOffer = listing('Day-old Bread First-Time Offer — Saturday', bread.description);
  assert.deepEqual(filterUnsupportedClosureFoodBleed([pie, namedOffer],
    'FIRST-TIME SPECIAL! Day-old bread for just $1.49/loaf\nPumpkin pie $12\nClosed Sunday and Monday.'), [namedOffer]);
});

test('registration price-change deadline is excluded but race and attendee pickup remain', () => {
  const deadline = listing('Registration Price Change Alert', 'Registration prices are changing at this deadline. Register before then.', 'Sports');
  const pickup = listing('Race Kit Pickup', 'Register in person and pick up your kit from 6–8 pm.', 'Sports');
  const race = listing('10K Run', 'Race starts at 9 am; registration prices change Friday.', 'Sports');
  assert.deepEqual(filterNonStandalonePostListings([deadline, pickup, race], 'Register today and save!'), [pickup, race]);
});

test('October 8 source notices and ordinary food inventory do not become listings', () => {
  const source = `Wednesday\nGrab ‘n Go Fresh Fridge;\n> Carrot + Ginger Soup $11\nSoup of the Day\nHam + Split Pea\nAll Day Special\nBeef Dip Melt $20`;
  const records = [
    listing('Carrot + Ginger Soup', 'Wednesday — Carrot + Ginger Soup, available from the Grab ‘n Go Fresh Fridge.'),
    listing('Soup of the Day: Ham + Split Pea', 'Wednesday — Soup of the Day: Ham + Split Pea.'),
    listing('Beef Dip Melt', 'Wednesday — All Day Special: Beef Dip Melt on a Hoagie w Fries, $20.'),
  ];
  assert.deepEqual(filterNonStandalonePostListings(records, source), records.slice(1));
  assert.deepEqual(filterNonStandalonePostListings([
    listing('Lattice Crust Apple Pies', 'New lattice crust apple pies, only $9.99 each.'),
  ], 'We have NEW lattice crust apple pies, only $9.99 each.'), []);
  assert.deepEqual(filterNonStandalonePostListings([
    listing('All Pools Closed for Swimming Lessons', 'All pools are closed during this period.', 'Workshops & Classes'),
    listing('Lane Swim', 'Lane swim is open 8–9 pm.', 'Sports'),
  ], 'All pools CLOSED for Swimming Lessons 4–8 pm. Lane swim open 8–9 pm.'), [
    listing('Lane Swim', 'Lane swim is open 8–9 pm.', 'Sports'),
  ]);
  assert.deepEqual(filterNonStandalonePostListings([
    listing('Final-day council nomination submissions',
      'Nominations can be submitted at the Election Office on Nomination Day.', 'Gatherings & Parties'),
  ], 'Town of Souris nomination day notice.'), []);
});
