import assert from 'node:assert/strict';
import test from 'node:test';
import {applyCategoryCorrectionsForRegression} from './finalFormatter.js';
import {ExtractedItem, FormattedEvent} from './types.js';

function correct(name: string, description: string, overrides: Partial<ExtractedItem> = {}, category: FormattedEvent['category'] = 'Food Special') {
  const item = {name, description, date:'2026-10-17', startTime:'09:00', endTime:'12:00',
    venue:'Community Hall', recurringPattern:'none', ...overrides} as ExtractedItem;
  const event = {name, description, category, isEvent:'No', isFoodSpecial:'Yes',
    startDate:item.date, endDate:item.date, startTime:item.startTime, endTime:item.endTime,
    venue:item.venue, establishment:item.venue, address:'', additionalLocation:'',
    ticketPrice:'', ticketLink:'', relevantImageIndex:0, isRecurring:false, recurringPattern:'none'} as FormattedEvent;
  return applyCategoryCorrectionsForRegression(event, item);
}

test('October 17 artisan and farmers market identities survive final food inference and flags', () => {
  const cases = [
    ['HALLOWEEN ARTISAN MARKET', 'Bring your friends and family. Local vendors, handmade goods, and unique finds.'],
    ['Sterling Farmers Market', 'This week’s market supports over 18 local farms and helps fund food and nutrition programs and community events at the hall.'],
    ['Sterling Farmers’ Market', 'Local produce and food vendors.'],
    ["Sterling Farmer's Market", 'Local produce and food vendors.'],
  ];
  for (const [name, description] of cases) {
    const result = correct(name, description);
    assert.equal(result.category, 'Gatherings & Parties', name);
    assert.equal(result.isEvent, 'Yes', name);
    assert.equal(result.isFoodSpecial, 'No', name);
  }
});

test('market venue or sibling context does not consume the distinct soup special', () => {
  for (const name of ['Apple Sweet Potato Soup', 'Farmers Market Soup Special']) {
    const result = correct(name, 'Apple Sweet Potato Soup served with a bun for just $5!',
      {_sourceType:'special', venue:'Sterling Farmers Market'});
    assert.equal(result.category, 'Food Special');
    assert.equal(result.isEvent, 'No');
    assert.equal(result.isFoodSpecial, 'Yes');
  }
});

test('sponsor-prefixed free swim is Sports through the final flags', () => {
  const result = correct("Charlottetown Y's Club Free Swim", "Free swim hosted by Charlottetown Y's Club.",
    {_sourceType:'schedule', date:'2026-10-18', startTime:'12:00', endTime:'13:30'}, 'Live Music');
  assert.equal(result.category, 'Sports');
  assert.equal(result.isEvent, 'Yes');
  assert.equal(result.isFoodSpecial, 'No');
});

test('a market music act and unrelated aquatic party, lesson or music keep their own activity', () => {
  const cases = [
    ['Live Music at the Artisan Market', 'A live concert with a singer.', 'Live Music'],
    ['Pool Party', 'A pool party and social gathering.', 'Gatherings & Parties'],
    ['Free Swim Party', 'A party with a DJ and live music.', 'Live Music'],
    ['Free Swimming Lessons', 'An instructor-led swimming lesson.', 'Workshops & Classes'],
    ['Free Swim Band Concert', 'A live music concert by Free Swim Band.', 'Live Music'],
  ] as const;
  for (const [name, description, category] of cases) {
    assert.equal(correct(name, description, {_sourceType:'event'}, category).category, category, name);
  }
});
