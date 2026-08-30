import assert from 'node:assert/strict';
import test from 'node:test';

import { Timestamp } from 'firebase-admin/firestore';

import {
  FRIEND_EVENT_DESCRIPTION_MAX_LENGTH,
  FRIEND_EVENT_TITLE_MAX_LENGTH,
  parseFriendEventInput,
} from './friendEvents.js';

const now = Timestamp.fromMillis(Date.UTC(2026, 7, 30, 12));
const startAtMs = now.toMillis() + 60 * 60_000;
const endAtMs = startAtMs + 2 * 60 * 60_000;

function baseInput() {
  return {
    title: 'Backyard barbecue',
    category: 'Gatherings & Parties',
    startAtMs,
    endAtMs,
    visibility: 'selected_friends',
    selectedUids: ['bob'],
    location: {
      type: 'custom_address',
      address: '12 Example Lane, Charlottetown, PE',
      placeName: 'Craig’s place',
      latitude: 46.2382,
      longitude: -63.1311,
    },
  };
}

test('custom addresses are accepted as first-class private event locations', () => {
  const parsed = parseFriendEventInput(baseInput(), now);
  assert.equal(parsed.location.type, 'custom_address');
  assert.equal(parsed.location.address, '12 Example Lane, Charlottetown, PE');
  assert.equal(parsed.location.revealAt?.toMillis(), now.toMillis());
  assert.equal(parsed.category, 'Gatherings & Parties');
});

test('address reveal cannot be later than the event start', () => {
  assert.throws(() => parseFriendEventInput({
    ...baseInput(),
    location: {
      ...(baseInput().location as Record<string, unknown>),
      revealAtMs: startAtMs + 1,
    },
  }, now), /revealed by the event start/i);
});

test('friend event validation rejects unsafe content and invalid timing', () => {
  assert.throws(() => parseFriendEventInput({ ...baseInput(), title: 'x'.repeat(FRIEND_EVENT_TITLE_MAX_LENGTH + 1) }, now));
  assert.throws(() => parseFriendEventInput({ ...baseInput(), description: 'x'.repeat(FRIEND_EVENT_DESCRIPTION_MAX_LENGTH + 1) }, now));
  assert.throws(() => parseFriendEventInput({ ...baseInput(), endAtMs: startAtMs }, now));
  assert.throws(() => parseFriendEventInput({ ...baseInput(), selectedUids: [] }, now));
  assert.throws(() => parseFriendEventInput({ ...baseInput(), category: 'Made Up Category' }, now), /valid GathR event category/i);
  assert.throws(() => parseFriendEventInput({ ...baseInput(), coverImageUrl: 'https://tracker.example/image.jpg' }, now), /private media storage/i);
});

test('online and recognized venue modes validate their identifiers', () => {
  assert.equal(parseFriendEventInput({
    ...baseInput(),
    location: { type: 'online', onlineUrl: 'https://meet.example.com/party' },
  }, now).location.type, 'online');
  assert.equal(parseFriendEventInput({
    ...baseInput(),
    location: { type: 'recognized_venue', venueId: 'venue-1' },
  }, now).location.venueId, 'venue-1');
  assert.throws(() => parseFriendEventInput({
    ...baseInput(),
    location: { type: 'online', onlineUrl: 'http://insecure.example.com' },
  }, now));
});
