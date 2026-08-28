import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';

import { deleteApp, initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';

import {
  acceptFriendRequest,
  blockUser,
  cancelFriendRequest,
  checkOut,
  claimSocialHandle,
  cleanupExpiredCheckIns,
  cleanupExpiredSocialOperations,
  cleanupExpiredSocialRateLimits,
  createCheckIn,
  declineFriendRequest,
  deleteSocialAccountData,
  enforceSocialRateLimit,
  searchUserByHandle,
  sendFriendRequest,
  syncSocialProfileProjections,
  unblockUser,
  removeFriend,
  reportUser,
} from '../lib/social/socialService.js';

const projectId = 'demo-gathr-social';
let app;
let db;

async function clearFirestore() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(host, 'FIRESTORE_EMULATOR_HOST must be set by firebase emulators:exec');
  const response = await fetch(
    `http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
  assert.equal(response.ok, true, await response.text());
}

async function seedProfiles() {
  await Promise.all([
    db.doc('users/alice').set({ displayName: 'Alice', photoURL: 'alice.jpg' }),
    db.doc('users/bob').set({ displayName: 'Bob', photoURL: 'bob.jpg' }),
    db.doc('users/charlie').set({ displayName: 'Charlie', photoURL: '' }),
    db.doc('users/dana').set({ displayName: 'Dana', photoURL: '' }),
    db.doc('venues/venue-1').set({ pagename: 'Venue One' }),
    db.doc('venues/venue-2').set({ pagename: 'Venue Two' }),
  ]);
}

async function makeFriends(firstUid, secondUid) {
  await sendFriendRequest(firstUid, secondUid, db);
  await acceptFriendRequest(secondUid, firstUid, db);
}

before(async () => {
  app = initializeApp({ projectId }, 'social-integration');
  db = getFirestore(app);
});

beforeEach(async () => {
  await clearFirestore();
  await seedProfiles();
});

after(async () => {
  await deleteApp(app);
});

test('handle claiming is unique and exact search returns only a safe profile', async () => {
  const profile = await claimSocialHandle('alice', '@Alice_1', db);
  assert.deepEqual(profile, {
    uid: 'alice',
    displayName: 'Alice',
    photoURL: 'alice.jpg',
    socialHandle: 'alice_1',
  });
  const found = await searchUserByHandle('bob', 'ALICE_1', db);
  assert.deepEqual(found, profile);
  await assert.rejects(() => claimSocialHandle('bob', 'alice_1', db), /already taken/i);
});

test('friend request acceptance creates mutual projections', async () => {
  const pending = await sendFriendRequest('alice', 'bob', db);
  assert.equal(pending.state, 'pending');
  assert.equal((await db.doc('users/bob/friendRequests/alice').get()).data()?.direction, 'incoming');

  const accepted = await acceptFriendRequest('bob', 'alice', db);
  assert.equal(accepted.state, 'accepted');
  assert.equal((await db.doc('users/alice/friends/bob').get()).data()?.displayName, 'Bob');
  assert.equal((await db.doc('users/bob/friends/alice').get()).data()?.displayName, 'Alice');
  assert.equal((await db.doc('users/alice/friendRequests/bob').get()).exists, false);
});

test('crossed pending requests resolve to an accepted friendship', async () => {
  await sendFriendRequest('alice', 'bob', db);
  const result = await sendFriendRequest('bob', 'alice', db);
  assert.equal(result.state, 'accepted');
  assert.equal((await db.doc('users/alice/friends/bob').get()).exists, true);
  assert.equal((await db.doc('users/bob/friends/alice').get()).exists, true);
});

test('profile changes refresh accepted-friend and pending-request projections', async () => {
  await makeFriends('alice', 'bob');
  await sendFriendRequest('charlie', 'alice', db);
  await db.doc('users/alice').update({ displayName: 'Alice Updated', photoURL: 'new.jpg' });
  const result = await syncSocialProfileProjections('alice', db);
  assert.equal(result.projectionsUpdated, 2);
  assert.equal((await db.doc('users/bob/friends/alice').get()).data()?.displayName, 'Alice Updated');
  assert.equal((await db.doc('users/charlie/friendRequests/alice').get()).data()?.photoURL, 'new.jpg');
});

test('relationship and report mutations are safe to retry after an unknown response', async () => {
  await sendFriendRequest('alice', 'bob', db);
  await acceptFriendRequest('bob', 'alice', db);
  await acceptFriendRequest('bob', 'alice', db);
  await removeFriend('alice', 'bob', db);
  await removeFriend('alice', 'bob', db);

  await sendFriendRequest('alice', 'charlie', db);
  await declineFriendRequest('charlie', 'alice', db);
  await declineFriendRequest('charlie', 'alice', db);

  const firstReport = await reportUser('alice', 'bob', 'spam', db);
  const secondReport = await reportUser('alice', 'bob', 'spam', db);
  assert.equal(firstReport.reportId, secondReport.reportId);
  assert.equal((await db.collection('userReports').get()).size, 1);
});

test('cancel, block, and unblock mutations are deterministic and safe to retry', async () => {
  await sendFriendRequest('alice', 'bob', db);
  await cancelFriendRequest('alice', 'bob', db);
  await cancelFriendRequest('alice', 'bob', db);
  assert.equal((await db.doc('socialRelationships/alice_bob').get()).exists, false);
  assert.equal((await db.doc('users/bob/friendRequests/alice').get()).exists, false);

  await blockUser('alice', 'bob', db);
  await blockUser('alice', 'bob', db);
  assert.equal((await db.doc('users/alice/blocks/bob').get()).exists, true);
  await unblockUser('alice', 'bob', db);
  await unblockUser('alice', 'bob', db);
  assert.equal((await db.doc('users/alice/blocks/bob').get()).exists, false);
  assert.equal((await sendFriendRequest('alice', 'bob', db)).state, 'pending');
});

test('rate limiting rejects the first request beyond the configured window allowance', async () => {
  await enforceSocialRateLimit('alice', 'search', 2, 60_000, db);
  await enforceSocialRateLimit('alice', 'search', 2, 60_000, db);
  await assert.rejects(
    () => enforceSocialRateLimit('alice', 'search', 2, 60_000, db),
    (error) => error?.code === 'resource-exhausted'
  );
});

test('all-friends check-in fans out and checkout revokes every viewer', async () => {
  await Promise.all([makeFriends('alice', 'bob'), makeFriends('alice', 'charlie')]);
  const checkIn = await createCheckIn(
    'alice',
    {
      venueId: 'venue-1',
      durationMinutes: 60,
      audienceMode: 'all_friends',
      message: 'On the patio',
    },
    db
  );
  assert.equal(checkIn.viewerCount, 2);
  assert.equal((await db.doc('users/bob/friendActivity/alice').get()).data()?.venueLocationKey, 'venue:venue-1');
  assert.equal((await db.doc('users/charlie/friendActivity/alice').get()).exists, true);

  const result = await checkOut('alice', db);
  assert.equal(result.removedViewerCount, 2);
  assert.equal((await db.doc('users/bob/friendActivity/alice').get()).exists, false);
  assert.equal((await db.doc('activeCheckIns/alice').get()).exists, false);
});

test('selected-friends audience does not disclose to excluded friends', async () => {
  await Promise.all([makeFriends('alice', 'bob'), makeFriends('alice', 'charlie')]);
  await createCheckIn(
    'alice',
    {
      venueId: 'venue-2',
      durationMinutes: 30,
      audienceMode: 'selected_friends',
      selectedUids: ['bob'],
    },
    db
  );
  assert.equal((await db.doc('users/bob/friendActivity/alice').get()).exists, true);
  assert.equal((await db.doc('users/charlie/friendActivity/alice').get()).exists, false);
});

test('replacing a check-in revokes removed viewers before returning success', async () => {
  await Promise.all([makeFriends('alice', 'bob'), makeFriends('alice', 'charlie')]);
  const first = await createCheckIn(
    'alice',
    {
      operationId: 'first-check-in-001',
      venueId: 'venue-1',
      durationMinutes: 60,
      audienceMode: 'all_friends',
    },
    db
  );
  const replacementInput = {
    operationId: 'replace-check-in-001',
    venueId: 'venue-2',
    durationMinutes: 30,
    audienceMode: 'selected_friends',
    selectedUids: ['bob'],
  };
  const replacement = await createCheckIn(
    'alice',
    replacementInput,
    db
  );
  const retry = await createCheckIn('alice', replacementInput, db);
  assert.notEqual(replacement.revision, first.revision);
  assert.equal(retry.revision, replacement.revision);
  assert.equal(retry.expiresAt.toMillis(), replacement.expiresAt.toMillis());
  assert.equal(replacement.viewerCount, 1);
  assert.equal((await db.doc('users/bob/friendActivity/alice').get()).data()?.venueId, 'venue-2');
  assert.equal((await db.doc('users/charlie/friendActivity/alice').get()).exists, false);
  await assert.rejects(
    () => createCheckIn('alice', { ...replacementInput, venueId: 'venue-1' }, db),
    (error) => error?.code === 'failed-precondition'
  );
});

test('blocking revokes friendship and both activity directions', async () => {
  await makeFriends('alice', 'bob');
  await claimSocialHandle('alice', 'alice_1', db);
  await createCheckIn(
    'alice',
    {
      venueId: 'venue-1',
      durationMinutes: 30,
      audienceMode: 'all_friends',
    },
    db
  );
  await createCheckIn(
    'bob',
    {
      venueId: 'venue-1',
      durationMinutes: 30,
      audienceMode: 'all_friends',
    },
    db
  );
  await blockUser('bob', 'alice', db);
  assert.equal((await db.doc('users/bob/friendActivity/alice').get()).exists, false);
  assert.equal((await db.doc('users/alice/friends/bob').get()).exists, false);
  assert.deepEqual((await db.doc('activeCheckIns/alice').get()).data()?.viewerUids, []);
  assert.deepEqual((await db.doc('activeCheckIns/bob').get()).data()?.viewerUids, []);
  assert.equal(await searchUserByHandle('bob', 'alice_1', db), null);
  await assert.rejects(() => sendFriendRequest('alice', 'bob', db), /unavailable/i);
});

test('expired check-in cleanup removes canonical and viewer documents', async () => {
  await makeFriends('alice', 'bob');
  await createCheckIn(
    'alice',
    {
      venueId: 'venue-1',
      durationMinutes: 30,
      audienceMode: 'all_friends',
    },
    db
  );
  await db.doc('activeCheckIns/alice').update({ expiresAt: Timestamp.fromMillis(1) });
  const result = await cleanupExpiredCheckIns(Timestamp.now(), db);
  assert.equal(result.cleaned, 1);
  assert.equal((await db.doc('users/bob/friendActivity/alice').get()).exists, false);
});

test('scheduled cleanup removes expired rate-limit and idempotency records', async () => {
  await enforceSocialRateLimit('alice', 'search', 5, 60_000, db);
  await createCheckIn(
    'alice',
    {
      operationId: 'cleanup-check-in-001',
      venueId: 'venue-1',
      durationMinutes: 30,
      audienceMode: 'all_friends',
    },
    db
  );
  const operation = await db.collection('socialOperations').limit(1).get();
  assert.equal(operation.size, 1);
  await Promise.all([
    db.doc('socialRateLimits/alice_search').update({ expiresAt: Timestamp.fromMillis(1) }),
    operation.docs[0].ref.update({ expiresAt: Timestamp.fromMillis(1) }),
  ]);
  assert.deepEqual(await cleanupExpiredSocialRateLimits(Timestamp.now(), db), { cleaned: 1 });
  assert.deepEqual(await cleanupExpiredSocialOperations(Timestamp.now(), db), { cleaned: 1 });
});

test('account social cleanup removes relationships and visibility without deleting the profile', async () => {
  await makeFriends('alice', 'bob');
  await claimSocialHandle('alice', 'alice_1', db);
  await blockUser('charlie', 'alice', db);
  await enforceSocialRateLimit('alice', 'search', 5, 60_000, db);
  await createCheckIn(
    'bob',
    {
      venueId: 'venue-1',
      durationMinutes: 30,
      audienceMode: 'all_friends',
    },
    db
  );
  const result = await deleteSocialAccountData('alice', db);
  assert.equal(result.relationshipsDeleted, 1);
  assert.equal((await db.doc('users/alice').get()).exists, true);
  assert.equal((await db.doc('users/alice/friendActivity/bob').get()).exists, false);
  assert.equal((await db.doc('users/bob/friends/alice').get()).exists, false);
  assert.deepEqual((await db.doc('activeCheckIns/bob').get()).data()?.viewerUids, []);
  assert.equal((await db.doc('socialHandles/alice_1').get()).exists, false);
  assert.equal((await db.doc('users/charlie/blocks/alice').get()).exists, false);
  assert.equal((await db.doc('socialRateLimits/alice_search').get()).exists, false);
  assert.equal(result.incomingBlocksDeleted, 1);
  assert.equal(result.handleReleased, true);
});

test('orphan cleanup can release a handle after the main profile is already gone', async () => {
  await claimSocialHandle('alice', 'alice_orphan', db);
  await db.doc('users/alice').delete();
  const result = await deleteSocialAccountData('alice', db);
  assert.equal(result.handleReleased, true);
  assert.equal((await db.doc('socialHandles/alice_orphan').get()).exists, false);
});
