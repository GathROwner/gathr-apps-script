import test from 'node:test';
import assert from 'node:assert/strict';
import type {EventData, VenueData} from '../types/index.js';
import {buildValidatedVenueRecoveryEvent} from './validatedVenuePublication.js';
const venue: VenueData = {id: 'hall', name: 'Community Hall', normalizedName: 'community hall', address: '1 Main St, Charlottetown, PE', latitude: 46.2, longitude: -63.1};
const source: EventData = {uniqueId: 'source_1', establishment: 'Charlottetown', venueId: 'hall', eventType: 'event', eventName: 'Concert',
  startDate: '2026-10-16', startTime: '19:30', endDate: '2026-10-16', endTime: '22:00', description: 'Doors open at 6:30 p.m.',
  timeFlags: {start: {source: 'explicit', evidence: '7:30 PM'}, end: {source: 'explicit', evidence: '10 PM', toClose: false}},
  timeResolution: {hoursUsed: false}, locationScope: 'city', locationPrecision: 'city_centroid', sourceUniqueIds: ['source'], sourceUrls: ['https://example.test/event'],
  mediaUrls: ['https://example.test/original.webp']};
test('reviewed venue recovery preserves canonical point scope, clocks, doors, provenance and media', () => {
  const result = buildValidatedVenueRecoveryEvent(source, venue);
  assert.equal(result.locationScope, 'venue'); assert.equal(result.locationPrecision, 'exact'); assert.equal(result.mapMode, 'venue');
  assert.equal(result.venueId, venue.id); assert.equal(result.address, venue.address); assert.equal(result.establishment, venue.name);
  for (const key of ['startDate','startTime','endDate','endTime','description','timeFlags','timeResolution','sourceUniqueIds','sourceUrls','mediaUrls'] as const) assert.deepEqual(result[key], source[key]);
});
test('recovery fails closed on missing source clock flags or incomplete canonical identity', () => {
  assert.throws(() => buildValidatedVenueRecoveryEvent({...source, timeFlags: undefined}, venue), /explicit source evidence/);
  assert.throws(() => buildValidatedVenueRecoveryEvent(source, {...venue, address: ''}), /canonical venue/);
});
