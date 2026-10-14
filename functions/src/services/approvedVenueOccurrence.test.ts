import test from 'node:test';
import assert from 'node:assert/strict';
import type { EventData } from '../types/index.js';
import { classifyApprovedVenueOccurrence, isApprovedVenueOccurrenceMatch, approvedVenueOccurrenceSourcePatch } from './approvedVenueOccurrence.js';

const occurrence = (patch: Partial<EventData> & {source?: string;mapMode?:string} = {}): EventData => ({
  venueId: 'fixture-venue', establishment: 'Fixture Venue', name: 'Fixture event', eventName: 'Fixture event',
  startDate: '2026-10-25', endDate: '2026-10-25', startTime: '12:00', endTime: '14:00',
  address: '15 Fixture Way, Souris, PE', isRecurring: 'No', recurringPattern: 'none',
  source: 'approved_location_review', locationReviewStatus: 'approved', locationScope: 'city', mapMode: 'point',
  ...patch,
} as EventData);

for (const [name, incomingName, end, incomingEnd, ticket, expected] of [
  ['Barktoberfest','Barktoberfest','14:00','14:00','','match'],
  ['SoulCave Box Fit','SoulCave Box Fit','','11:30','','match'],
  ['Two Pianos, No Rodeo: Bob Wiseman and Mike Boguski','Two Pianos, No Rodeo','21:30','23:00','https://example.com/shows/two-pianos','match'],
  ['Mix & Mingle with Charlottetown’s Mayoral Candidates','Mix & Mingle with Mayoral Candidates','21:00','21:00','','match'],
  ['arts mixers','Arts Mixer','19:00','18:00','','conflict'],
] as const) {
  test(`approved root occurrence: ${name} -> ${expected}`, () => {
    const old = occurrence({ name, eventName: name, endTime: end, ticketLink: ticket });
    const incoming = occurrence({ name: incomingName, eventName: incomingName, endTime: incomingEnd, ticketLink: ticket });
    assert.equal(classifyApprovedVenueOccurrence(incoming, old), expected);
  });
}
test('distinct dates, starts, venues, rooms and addresses remain separate', () => {
  const base = occurrence();
  for (const patch of [{startDate:'2026-10-26'},{startTime:'13:00'}, {venueId:'fixture-other'},
    {address:'99 Other Street, Souris, PE'}, {name:'Completely different activity',eventName:'Completely different activity'}]) {
    assert.equal(classifyApprovedVenueOccurrence(occurrence(patch), base), 'none');
  }
  assert.equal(classifyApprovedVenueOccurrence(occurrence({additionalLocation:'Room B'}), occurrence({additionalLocation:'Room A'})), 'none');
});
test('unapproved, recurring and actual spatial events do not enter approved one-off matching', () => {
  for (const patch of [{locationReviewStatus:'needs_review'}, {source:'unreviewed'},
    {isRecurring:'Yes',recurringPattern:'weekly_sunday'}, {locationScope:'area'}, {locationScope:'route'}, {mapMode:'area'}]) {
    assert.equal(classifyApprovedVenueOccurrence(occurrence(), occurrence(patch as any)), 'none');
  }
});
test('generic homepages cannot reconcile conflicting end times', () => {
  assert.equal(classifyApprovedVenueOccurrence(occurrence({endTime:'18:00',ticketLink:'https://example.com/'}),
    occurrence({endTime:'19:00',ticketLink:'https://example.com/'})), 'conflict');
});
test('source linking changes only provenance and never stores synthetic source prefixes', () => {
  const old = occurrence({uniqueId:'cityrecovered_fixture_venue'});
  const incoming = occurrence({uniqueId:'1234567890123456_fixture',sourceUrls:['https://example.com/source']});
  const patch = approvedVenueOccurrenceSourcePatch(old, incoming);
  assert.deepEqual(Object.keys(patch).sort(), ['sourceUniqueIds','sourceUrls']);
  assert.deepEqual(patch.sourceUniqueIds, ['1234567890123456']);
  assert.equal(isApprovedVenueOccurrenceMatch(incoming, old), true);
});
