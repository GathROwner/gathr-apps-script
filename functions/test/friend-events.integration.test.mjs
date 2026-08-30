import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';

import { deleteApp, initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';

import {
  cancelFriendEvent,
  createFriendEvent,
  deleteFriendEvent,
  inviteToFriendEvent,
  markEndedFriendEvents,
  removeFromFriendEvent,
  respondToFriendEvent,
  revealDueFriendEventLocations,
  updateFriendEvent,
} from '../lib/social/friendEvents.js';
import { acceptFriendRequest, removeFriend, sendFriendRequest } from '../lib/social/socialService.js';

const projectId = 'demo-gathr-social';
let app;
let db;
let sequence = 0;

async function clearFirestore() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(host, 'FIRESTORE_EMULATOR_HOST must be set');
  const response = await fetch(
    `http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
  assert.equal(response.ok, true, await response.text());
}

async function makeFriends(firstUid, secondUid) {
  await sendFriendRequest(firstUid, secondUid, db);
  await acceptFriendRequest(secondUid, firstUid, db);
}

function customInput(overrides = {}) {
  sequence += 1;
  const startAtMs = Date.now() + 24 * 60 * 60_000;
  return {
    operationId: `friend-event-${sequence.toString().padStart(8, '0')}`,
    title: 'Backyard barbecue',
    description: 'Bring a lawn chair.',
    category: 'Gatherings & Parties',
    startAtMs,
    endAtMs: startAtMs + 3 * 60 * 60_000,
    visibility: 'selected_friends',
    selectedUids: ['bob'],
    guestInviteMode: 'guests_can_invite',
    guestListVisible: true,
    location: {
      type: 'custom_address',
      address: '12 Example Lane, Charlottetown, PE',
      placeName: 'Craig’s place',
      latitude: 46.2382,
      longitude: -63.1311,
    },
    ...overrides,
  };
}

before(async () => {
  app = initializeApp({ projectId }, 'friend-events-integration');
  db = getFirestore(app);
});

beforeEach(async () => {
  await clearFirestore();
  await Promise.all([
    db.doc('users/alice').set({ displayName: 'Alice', socialHandle: 'alice' }),
    db.doc('users/bob').set({ displayName: 'Bob', socialHandle: 'bob' }),
    db.doc('users/charlie').set({ displayName: 'Charlie', socialHandle: 'charlie' }),
    db.doc('users/dana').set({ displayName: 'Dana', socialHandle: 'dana' }),
    db.doc('venues/venue-1').set({
      pagename: 'Venue One',
      address: '1 Venue Street',
      latitude: 46.24,
      longitude: -63.13,
    }),
  ]);
  await Promise.all([
    makeFriends('alice', 'bob'),
    makeFriends('alice', 'charlie'),
    makeFriends('bob', 'charlie'),
  ]);
});

after(async () => {
  await deleteApp(app);
});

test('custom address is absent from canonical event metadata and unauthorized projections', async () => {
  const event = await createFriendEvent('alice', customInput(), db);
  const canonical = (await db.doc(`friendEvents/${event.eventId}`).get()).data();
  assert.equal(Object.hasOwn(canonical || {}, 'address'), false);
  assert.equal(Object.hasOwn(canonical || {}, 'location'), false);
  assert.equal((await db.doc(`users/bob/friendEvents/${event.eventId}`).get()).exists, true);
  assert.equal(Object.hasOwn((await db.doc(`users/bob/friendEvents/${event.eventId}`).get()).data() || {}, 'address'), false);
  assert.equal((await db.doc(`users/bob/friendEventLocations/${event.eventId}`).get()).data()?.address, '12 Example Lane, Charlottetown, PE');
  assert.equal((await db.doc(`users/charlie/friendEvents/${event.eventId}`).get()).exists, false);
  assert.equal((await db.doc(`users/charlie/friendEventLocations/${event.eventId}`).get()).exists, false);
});

test('a host with no friends retains a private zero-guest event projection', async () => {
  const event = await createFriendEvent('dana', customInput({
    visibility: 'all_friends',
    selectedUids: undefined,
  }), db);
  const hostProjection = (await db.doc(`users/dana/friendEvents/${event.eventId}`).get()).data();
  assert.equal(hostProjection?.viewerRole, 'host');
  assert.equal(hostProjection?.viewerCount, 0);
  assert.deepEqual(hostProjection?.guests, []);
  assert.equal((await db.doc(`users/dana/friendEventLocations/${event.eventId}`).get()).exists, true);
  assert.equal((await db.doc(`users/alice/friendEvents/${event.eventId}`).get()).exists, false);
  assert.equal((await db.doc(`users/bob/friendEvents/${event.eventId}`).get()).exists, false);
});

test('delayed address remains absent until the reveal job writes authorized projections', async () => {
  const revealAtMs = Date.now() + 60 * 60_000;
  const event = await createFriendEvent('alice', customInput({
    location: {
      type: 'custom_address',
      address: '99 Private Road, Stratford, PE',
      latitude: 46.22,
      longitude: -63.09,
      revealAtMs,
    },
  }), db);
  assert.equal((await db.doc(`users/bob/friendEventLocations/${event.eventId}`).get()).exists, false);
  const result = await revealDueFriendEventLocations(Timestamp.fromMillis(revealAtMs + 1), db);
  assert.equal(result.eventsRevealed, 1);
  assert.equal((await db.doc(`users/bob/friendEventLocations/${event.eventId}`).get()).data()?.address, '99 Private Road, Stratford, PE');
});

test('guest invite mode expands only to the inviters friend and records provenance', async () => {
  const event = await createFriendEvent('alice', customInput(), db);
  await inviteToFriendEvent('bob', event.eventId, 'charlie', db);
  assert.equal((await db.doc(`users/charlie/friendEvents/${event.eventId}`).get()).exists, true);
  assert.equal((await db.doc(`friendEventInvitations/${event.eventId}_charlie`).get()).data()?.invitedByUid, 'bob');
  const hostGuests = (await db.doc(`users/alice/friendEvents/${event.eventId}`).get()).data()?.guests;
  assert.equal(hostGuests.length, 2);
  assert.equal(hostGuests.find((guest) => guest.uid === 'charlie')?.invitedByUid, 'bob');
  await assert.rejects(() => inviteToFriendEvent('bob', event.eventId, 'dana', db), /not eligible/i);
});

test('unfriending revokes an invitation that depended on guest invite provenance', async () => {
  const event = await createFriendEvent('alice', customInput(), db);
  await inviteToFriendEvent('bob', event.eventId, 'charlie', db);
  assert.equal((await db.doc(`users/charlie/friendEvents/${event.eventId}`).get()).exists, true);
  await removeFriend('bob', 'charlie', db);
  assert.equal((await db.doc(`users/charlie/friendEvents/${event.eventId}`).get()).exists, false);
  assert.equal((await db.doc(`users/charlie/friendEventLocations/${event.eventId}`).get()).exists, false);
});

test('guest list visibility hides identities from guests but never from the host', async () => {
  const event = await createFriendEvent('alice', customInput({ guestListVisible: false }), db);
  assert.equal((await db.doc(`users/bob/friendEvents/${event.eventId}`).get()).data()?.guests.length, 0);
  assert.equal((await db.doc(`users/alice/friendEvents/${event.eventId}`).get()).data()?.guests[0].displayName, 'Bob');
});

test('canceling a home event revokes every exact and approximate location projection', async () => {
  const event = await createFriendEvent('alice', customInput(), db);
  await cancelFriendEvent('alice', event.eventId, db, Timestamp.now(), 'Weather made the yard unsafe.');
  assert.equal((await db.doc(`friendEventPrivateLocations/${event.eventId}`).get()).exists, false);
  assert.equal((await db.doc(`users/alice/friendEventLocations/${event.eventId}`).get()).exists, false);
  assert.equal((await db.doc(`users/bob/friendEventLocations/${event.eventId}`).get()).exists, false);
  const guestProjection = (await db.doc(`users/bob/friendEvents/${event.eventId}`).get()).data();
  assert.equal(guestProjection?.status, 'canceled');
  assert.equal(guestProjection?.approximateLatitude, null);
  assert.equal(guestProjection?.approximateLongitude, null);
  assert.equal(guestProjection?.cancellationReason, 'Weather made the yard unsafe.');
  assert.match(guestProjection?.updateHistory.at(-1)?.summary || '', /Weather made the yard unsafe/);
  const revision = guestProjection?.revision;
  await cancelFriendEvent('alice', event.eventId, db, Timestamp.now(), 'A conflicting retry reason');
  assert.equal((await db.doc(`users/bob/friendEvents/${event.eventId}`).get()).data()?.revision, revision);
});

test('ended home events keep history but revoke exact and approximate addresses', async () => {
  const input = customInput();
  const event = await createFriendEvent('alice', input, db);
  const result = await markEndedFriendEvents(Timestamp.fromMillis(input.endAtMs + 1), db);
  assert.equal(result.eventsEnded, 1);
  assert.equal((await db.doc(`friendEventPrivateLocations/${event.eventId}`).get()).exists, false);
  assert.equal((await db.doc(`users/bob/friendEventLocations/${event.eventId}`).get()).exists, false);
  const projection = (await db.doc(`users/bob/friendEvents/${event.eventId}`).get()).data();
  assert.equal(projection?.status, 'ended');
  assert.equal(projection?.approximateLatitude, null);
  assert.equal(projection?.updateHistory.at(-1)?.kind, 'ended');
});

test('RSVP, host removal, cancellation, update, and deletion stay server-authoritative', async () => {
  const input = customInput();
  const event = await createFriendEvent('alice', input, db);
  await respondToFriendEvent('bob', event.eventId, 'maybe', db);
  assert.equal((await db.doc(`users/bob/friendEvents/${event.eventId}`).get()).data()?.ownRsvp, 'maybe');
  assert.equal((await db.doc(`users/alice/friendEvents/${event.eventId}`).get()).data()?.responseCounts.maybe, 1);
  assert.equal((await db.doc(`users/alice/friendEvents/${event.eventId}`).get()).data()?.guests[0].response, 'maybe');

  await updateFriendEvent('alice', event.eventId, {
    ...input,
    title: 'Updated backyard barbecue',
    location: { type: 'recognized_venue', venueId: 'venue-1' },
  }, db);
  assert.equal((await db.doc(`users/bob/friendEvents/${event.eventId}`).get()).data()?.title, 'Updated backyard barbecue');
  assert.equal((await db.doc(`users/bob/friendEventLocations/${event.eventId}`).get()).exists, false);

  await removeFromFriendEvent('alice', event.eventId, 'bob', db);
  assert.equal((await db.doc(`users/bob/friendEvents/${event.eventId}`).get()).exists, false);
  await cancelFriendEvent('alice', event.eventId, db);
  assert.equal((await db.doc(`users/alice/friendEvents/${event.eventId}`).get()).data()?.status, 'canceled');
  await deleteFriendEvent('alice', event.eventId, db);
  assert.equal((await db.doc(`friendEvents/${event.eventId}`).get()).exists, false);
  assert.equal((await db.doc(`users/alice/friendEvents/${event.eventId}`).get()).exists, false);
});
