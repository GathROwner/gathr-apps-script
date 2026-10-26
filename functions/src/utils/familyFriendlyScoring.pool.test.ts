import assert from 'node:assert/strict';
import test from 'node:test';
import {scoreFamilyFriendly, withFamilyFriendlyScore} from './familyFriendlyScoring.js';
import {rehydrateFamilyAudienceMetadata} from '../parsing/finalFormatter.js';
import {ExtractedItem, FormattedEvent} from '../parsing/types.js';

const score = (eventName: string, description = '', category = 'Sports') =>
  scoreFamilyFriendly({eventName, description, category, startTime: '09:00'});

for (const [name, description] of [
  ['All pools open', 'All pools open - 9:00 am - 11:45 am'],
  ["Charlottetown Y's Club Free Swim", "Free swim hosted by Charlottetown Y's Club."],
  ['Waterslide open', 'Waterslide open - 9:00 am - 11:45 am'],
  ['Public Swim', ''], ['Open Swim', ''], ['Recreational swim', ''],
  ['Splash pad open', ''],
]) test('recognizes public family aquatic activity: ' + name, () => {
  const result = score(name, description);
  assert.equal(result.familyFriendlyScore, 60);
  assert.equal(result.familyFriendlyLevel, 'likely');
  assert(result.familyFriendlyReasons.includes('family_activity'));
});

for (const [name, description] of [
  ['All pools open', 'Adults only.'],
  ['Free Swim', 'Ages 19+.'],
  ['Waterslide open', 'Children are not permitted.'],
  ['Public Swim', 'Not suitable for children.'],
]) test('preserves adult or child exclusions: ' + description, () => {
  assert.equal(score(name, description).familyFriendlyScore, 0);
});

for (const [name, description, category] of [
  ['Lane swim', 'Lane swim open - 9:00 am - 11:45 am', 'Sports'],
  ['Adult swim', 'Fitness session', 'Sports'],
  ['Senior swim', '', 'Sports'],
  ['Free Swim', 'Seniors-only session.', 'Sports'],
  ['Public Swim', 'Restricted to adults.', 'Sports'],
  ['All pools CLOSED for swimming lessons', '9 am–2 pm', 'Sports'],
  ['All pools open', 'Private booking only.', 'Sports'],
  ['Free Swim Lessons', 'Learn to swim.', 'Workshops & Classes'],
  ['Pool party', 'Cocktail night.', 'Gatherings & Parties'],
  ['Public Swim', 'Film screening.', 'Cinema'],
  ['All pool tables open', 'Billiards.', 'Sports'],
  ['Pool maintenance', 'All pools open tomorrow.', 'Sports'],
]) test('does not infer family participation from: ' + name + '/' + category, () => {
  assert(score(name, description, category).familyFriendlyScore < 60);
});

test('guardian admission age is distinct from a child restriction', () => {
  assert(score('Public Swim', 'Children must be accompanied by a guardian 18+.').familyFriendlyScore >= 60);
});

test('preserves existing explicit family and child class decisions', () => {
  assert.equal(score('Family Swim').familyFriendlyScore, 85);
  assert(score('Swimming lessons for children', 'Ages 4–6.', 'Workshops & Classes').familyFriendlyScore >= 60);
});

test('whole-post context cannot turn adult fitness into a family swim', () => {
  const result = scoreFamilyFriendly({name: 'Lane swim', description: 'Fitness lanes.', contextText: 'Public swim and waterslide open. Children welcome.'});
  assert.equal(result.familyFriendlyScore, 15);
});

test('refresh recomputes an old missed pool score', () => {
  const event = {eventName: 'All pools open', description: 'All pools open - 9:00 am - 11:45 am', category: 'Sports', startTime: '09:00', familyFriendlyScore: 15, familyFriendlyLevel: 'unlikely'};
  assert.equal(withFamilyFriendlyScore(event).familyFriendlyScore, 60);
});

test('formatter keeps bound aquatic evidence without gallery audience leakage', () => {
  const item: ExtractedItem = {name: 'All pools open', description: 'All pools open - 9:00 am - 11:45 am', date: '2026-10-18', startTime: '09:00', endTime: '11:45', venue: 'Bell Aliant Centre', price: '', recurringPattern: 'none', extractionReason: 'source'};
  const output: FormattedEvent = {name: item.name, description: 'Scheduled swim.', startDate: item.date, endDate: item.date, startTime: '09:00', endTime: '11:45', venue: item.venue, establishment: item.venue, address: '', category: 'Sports', isEvent: 'Yes', isFoodSpecial: 'No', ticketPrice: '', ticketLink: '', relevantImageIndex: 0, additionalLocation: '', isRecurring: false, recurringPattern: 'none'};
  const result = rehydrateFamilyAudienceMetadata(output, item, [item], 'Separate adult-only class.');
  assert.equal(scoreFamilyFriendly(result).familyFriendlyScore, 60);
  assert.equal(result.startTime, '09:00');
  assert.equal(result.endTime, '11:45');
});
