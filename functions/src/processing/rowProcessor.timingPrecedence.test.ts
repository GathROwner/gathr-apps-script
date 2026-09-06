import test from 'node:test';
import assert from 'node:assert/strict';

import { previewDuplicateMerge } from './rowProcessor.js';
import type { EventData, VenueData } from '../types/index.js';

const venue: VenueData = {
  id: 'venue_time',
  name: 'Time Venue',
  normalizedName: 'time venue',
  address: '1 Test Street',
  latitude: 46.2,
  longitude: -63.1,
};

const event = (overrides: Partial<EventData>): EventData => ({
  uniqueId: 'time_1',
  establishment: 'Time Venue',
  venueId: venue.id,
  eventType: 'event',
  eventName: 'Time event',
  name: 'Time event',
  startDate: '2026-09-05',
  endDate: '2026-09-05',
  startTime: '19:00',
  endTime: '21:00',
  ...overrides,
});

test('until-close evidence supersedes a low policy cutoff', () => {
  const existing = event({
    timeResolution: { endFromHours: 'duration_default' },
    timeFlags: { start: { source: 'explicit', evidence: '' }, end: { source: 'none', toClose: false, evidence: '' } },
  });
  const incoming = event({
    endTime: '23:00',
    timeResolution: { endFromHours: 'to_close' },
    timeFlags: { start: { source: 'explicit', evidence: '' }, end: { source: 'semantic', toClose: true, evidence: 'until close' } },
  });
  const preview = previewDuplicateMerge({ existingEvent: existing, incomingEvent: incoming, venue });
  assert.equal(preview.updates.endTime, '23:00');
  assert.equal(preview.updates.timing?.schedule.end.status, 'until_close');
});

test('an observed ending supersedes until-close semantics', () => {
  const existing = event({
    endTime: '23:00',
    timeResolution: { endFromHours: 'to_close' },
    timeFlags: { start: { source: 'explicit', evidence: '' }, end: { source: 'semantic', toClose: true, evidence: 'until close' } },
  });
  const incoming = event({
    endTime: '20:30',
    timeResolution: {},
    timeFlags: { start: { source: 'explicit', evidence: '' }, end: { source: 'explicit', toClose: false, evidence: '7-8:30 PM' } },
  });
  const preview = previewDuplicateMerge({ existingEvent: existing, incomingEvent: incoming, venue });
  assert.equal(preview.updates.endTime, '20:30');
  assert.equal(preview.updates.timing?.schedule.end.status, 'observed');
});
