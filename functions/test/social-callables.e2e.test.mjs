import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';

import { deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { cleanupSocialDataOnAuthDelete } from '../lib/social/accountCleanup.js';

const projectId = 'demo-gathr-social';
const region = 'northamerica-northeast1';
const app = getApps()[0] || initializeApp({ projectId });
const auth = getAuth(app);
const db = getFirestore(app);

async function clearEmulators() {
  for (const [url, label] of [
    [`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`, 'Firestore'],
    [`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${projectId}/accounts`, 'Auth'],
  ]) {
    const response = await fetch(url, { method: 'DELETE' });
    assert.equal(response.ok, true, `${label} reset failed: ${await response.text()}`);
  }
}

async function signIn(email, password) {
  const response = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const json = await response.json();
  assert.equal(response.ok, true, JSON.stringify(json));
  return json.idToken;
}

async function call(name, data, idToken) {
  const response = await fetch(`http://127.0.0.1:5001/${projectId}/${region}/${name}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(idToken ? { authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify({ data }),
  });
  const json = await response.json();
  return { response, json };
}

function resultOf(callResult) {
  return callResult.json.result ?? callResult.json.data;
}

before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST);
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST);
  await clearEmulators();
  for (const user of [
    { uid: 'alice', email: 'alice@gathr.local', displayName: 'Alice' },
    { uid: 'bob', email: 'bob@gathr.local', displayName: 'Bob' },
  ]) {
    await auth.createUser({ ...user, password: 'GathrTest!2026' });
    await db.doc(`users/${user.uid}`).set({ displayName: user.displayName, photoURL: '' });
  }
  await db.doc('venues/venue-1').set({ pagename: 'Callable Test Venue' });
});

after(async () => deleteApp(app));

test('deployed callable surface enforces Auth and completes the friend/check-in lifecycle', async () => {
  const unauthenticated = await call('searchUserByHandleCallable', { handle: 'bob_friend' });
  assert.equal(unauthenticated.response.ok, false);
  assert.equal(unauthenticated.json.error.status, 'UNAUTHENTICATED');

  const [aliceToken, bobToken] = await Promise.all([
    signIn('alice@gathr.local', 'GathrTest!2026'),
    signIn('bob@gathr.local', 'GathrTest!2026'),
  ]);
  assert.equal((await call('claimSocialHandleCallable', { handle: 'alice_friend' }, aliceToken)).response.ok, true);
  assert.equal((await call('claimSocialHandleCallable', { handle: 'bob_friend' }, bobToken)).response.ok, true);

  const search = await call('searchUserByHandleCallable', { handle: 'bob_friend' }, aliceToken);
  assert.deepEqual(resultOf(search).user, {
    uid: 'bob',
    displayName: 'Bob',
    photoURL: '',
    socialHandle: 'bob_friend',
  });

  const request = await call('sendFriendRequestCallable', { targetUid: 'bob', requesterUid: 'forged' }, aliceToken);
  assert.equal(resultOf(request).state, 'pending');
  const accepted = await call('acceptFriendRequestCallable', { otherUid: 'alice' }, bobToken);
  assert.equal(resultOf(accepted).state, 'accepted');

  const checkInRequest = {
    operationId: 'callable-check-in-001',
    venueId: 'venue-1',
    durationMinutes: 30,
    audienceMode: 'all_friends',
    message: 'Callable test',
  };
  const checkedIn = await call('createCheckInCallable', checkInRequest, bobToken);
  assert.equal(resultOf(checkedIn).viewerCount, 1);
  const retried = await call('createCheckInCallable', checkInRequest, bobToken);
  assert.equal(resultOf(retried).revision, resultOf(checkedIn).revision);
  assert.equal((await db.doc('users/alice/friendActivity/bob').get()).data()?.venueId, 'venue-1');

  await call('checkOutCallable', {}, bobToken);
  assert.equal((await db.doc('users/alice/friendActivity/bob').get()).exists, false);
});

test('Auth deletion fallback removes an orphaned social profile and handle', async () => {
  await auth.createUser({
    uid: 'orphan',
    email: 'orphan@gathr.local',
    password: 'GathrTest!2026',
    displayName: 'Orphan Test',
  });
  await db.doc('users/orphan').set({ displayName: 'Orphan Test', photoURL: '' });
  const token = await signIn('orphan@gathr.local', 'GathrTest!2026');
  assert.equal(
    (await call('claimSocialHandleCallable', { handle: 'orphan_test' }, token)).response.ok,
    true
  );

  await auth.deleteUser('orphan');
  await cleanupSocialDataOnAuthDelete.run({ uid: 'orphan' });

  assert.equal((await db.doc('users/orphan').get()).exists, false);
  assert.equal((await db.doc('socialHandles/orphan_test').get()).exists, false);
});
