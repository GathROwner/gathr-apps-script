import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './fixtures/venue-resolution.json';
import { resolveSourceVenueSubLocation, namedVenueCandidateIsCompatible } from './venueIdentity.js';
import type { RawRowData, VenueData } from '../types/index.js';

const venue = fixture.parent as VenueData;
const row = { facebookUrl: venue.facebookUrl } as RawRowData;

for (const candidate of fixture.rooms) {
  test(`source identity and parent anchor resolve ${candidate} without a new alias`, () => {
    assert.equal(resolveSourceVenueSubLocation({ candidate, row, venue }).supported, true);
  });
}
test('exact event address can corroborate a printed parent and room', () => {
  assert.equal(resolveSourceVenueSubLocation({ candidate: 'Board Room, APM Centre',
    row: {} as RawRowData, venue, eventAddress: venue.address }).supported, true);
});
test('a contradictory event address defeats the source-page shortcut', () => {
  assert.equal(resolveSourceVenueSubLocation({ candidate: 'APM Rink', row, venue,
    eventAddress: '98 Other Street, Hamilton, ON' }).reason, 'conflicting_event_address');
});
test('an unrelated publisher cannot infer an unverified room', () => {
  assert.equal(resolveSourceVenueSubLocation({ candidate: 'APM Rink',
    row: { facebookUrl: 'https://www.facebook.com/fixture-other-page' } as RawRowData, venue }).supported, false);
});
test('generic room names cannot adopt a source venue without a verified alias', () => {
  for (const candidate of ['Ballroom', 'Room 1013', 'Room 902', 'Community Room', 'Centre Room']) {
    assert.equal(resolveSourceVenueSubLocation({ candidate, row, venue }).supported, false, candidate);
  }
});
test('a shared partial identity is insufficient', () => {
  const parent = { ...venue, name: 'North River Centre' };
  assert.equal(resolveSourceVenueSubLocation({ candidate: 'North Rink', row, venue: parent }).supported, false);
});
test('another named location cannot be swallowed by a parent token match', () => {
  assert.equal(resolveSourceVenueSubLocation({ candidate: 'APM Rink at Other Sportsplex', row, venue }).supported, false);
});
test('relocation wording requires a verified venue match', () => {
  assert.equal(resolveSourceVenueSubLocation({ candidate: 'APM Rink', row: { ...row, text: 'Moved to a new venue.' }, venue }).supported, false);
});
test('a previously verified generic room alias is scoped to its identified source venue', () => {
  assert.equal(resolveSourceVenueSubLocation({ candidate: 'Room 1013', row,
    venue: { ...venue, aliases: ['Room 1013'] } }).supported, true);
});
test('Connolly Park cannot use a road-only Google result', () => {
  assert.equal(namedVenueCandidateIsCompatible(fixture.park), false);
  assert.equal(namedVenueCandidateIsCompatible({ observedName: 'Connolly Park', candidateTypes: ['route', 'point_of_interest'] }), false);
});
test('real parks and venues remain candidates; route lookup remains independent', () => {
  assert.equal(namedVenueCandidateIsCompatible({ observedName: 'Connolly Park', candidateTypes: ['park', 'point_of_interest'] }), true);
  assert.equal(namedVenueCandidateIsCompatible({ observedName: 'Connolly Street', candidateTypes: ['route'] }), true);
  assert.equal(namedVenueCandidateIsCompatible({ observedName: 'Community Hall', candidateTypes: ['establishment'] }), true);
});
