import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const projectId = 'gathr-social-staging';
const region = 'northamerica-northeast1';
const apiKey = 'AIzaSyB8zainbIH0k6G2NHGRBDIJl_nupmJ59jc';
const authBase = `https://identitytoolkit.googleapis.com/v1/accounts`;
const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const functionBase = `https://${region}-${projectId}.cloudfunctions.net`;
const runId = Date.now().toString(36);
const qaVenueId = 'staging_social_qa_venue';
const password = `Qa!${randomBytes(18).toString('base64url')}`;

let alice;
let bob;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    throw new Error(`${options.method || 'GET'} ${url} failed (${response.status}): ${JSON.stringify(body.error || body)}`);
  }
  return body;
}

async function createAccount(label) {
  const email = `gathr.staging.${runId}.${label}@example.com`;
  const result = await jsonRequest(`${authBase}:signUp?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  return { uid: result.localId, idToken: result.idToken, email };
}

async function deleteAccount(account) {
  if (!account?.idToken) return;
  await jsonRequest(`${authBase}:delete?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: account.idToken }),
  });
}

function stringValue(value) {
  return { stringValue: value };
}

async function writeOwnProfile(account, displayName) {
  const updateMask = new URLSearchParams();
  updateMask.append('updateMask.fieldPaths', 'displayName');
  updateMask.append('updateMask.fieldPaths', 'email');
  updateMask.append('updateMask.fieldPaths', 'photoURL');
  return jsonRequest(
    `${firestoreBase}/users/${encodeURIComponent(account.uid)}?${updateMask.toString()}`,
    {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${account.idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        displayName: stringValue(displayName),
        email: stringValue(account.email),
        photoURL: stringValue(''),
      },
    }),
    }
  );
}

async function firebaseCliAccessToken() {
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  assert.ok(config.tokens?.access_token, 'Firebase CLI access token is unavailable.');
  return config.tokens.access_token;
}

async function ensureQaVenue() {
  const accessToken = await firebaseCliAccessToken();
  await jsonRequest(`${firestoreBase}/venues/${qaVenueId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        pagename: stringValue('GathR Social QA Venue'),
        address: stringValue('Staging only'),
        environment: stringValue('staging'),
      },
    }),
  });
}

async function call(account, name, data = {}) {
  const response = await jsonRequest(`${functionBase}/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${account.idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data }),
  });
  return response.result;
}

async function getDocument(account, documentPath) {
  const response = await fetch(`${firestoreBase}/${documentPath}`, {
    headers: { Authorization: `Bearer ${account.idToken}` },
  });
  if (response.status === 404) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`GET ${documentPath} failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

function field(document, name) {
  const value = document?.fields?.[name];
  if (!value) return undefined;
  return value.stringValue
    ?? value.integerValue
    ?? value.booleanValue
    ?? value.timestampValue
    ?? value.arrayValue;
}

async function waitFor(description, assertion, timeoutMilliseconds = 45_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  let lastError;
  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await delay(2_000);
    }
  }
  throw new Error(`${description} did not settle: ${lastError?.message || 'unknown assertion'}`);
}

async function makeFriends(sender, receiver) {
  await call(sender, 'sendFriendRequestCallable', { targetUid: receiver.uid });
  await call(receiver, 'acceptFriendRequestCallable', { otherUid: sender.uid });
}

try {
  await ensureQaVenue();
  alice = await createAccount('alice');
  bob = await createAccount('bob');
  await Promise.all([
    writeOwnProfile(alice, 'Staging Alice'),
    writeOwnProfile(bob, 'Staging Bob'),
  ]);

  const aliceHandle = `qa_${runId}_a`.slice(0, 24);
  const bobHandle = `qa_${runId}_b`.slice(0, 24);
  await call(alice, 'claimSocialHandleCallable', { handle: aliceHandle });
  await call(bob, 'claimSocialHandleCallable', { handle: bobHandle });
  const search = await call(alice, 'searchUserByHandleCallable', { handle: bobHandle });
  assert.equal(search.user.uid, bob.uid);

  await call(alice, 'sendFriendRequestCallable', { targetUid: bob.uid });
  await call(alice, 'cancelFriendRequestCallable', { otherUid: bob.uid });
  await call(alice, 'sendFriendRequestCallable', { targetUid: bob.uid });
  await call(bob, 'declineFriendRequestCallable', { otherUid: alice.uid });
  await makeFriends(alice, bob);

  await writeOwnProfile(alice, 'Staging Alice Updated');
  await waitFor('profile projection synchronization', async () => {
    const friend = await getDocument(bob, `users/${bob.uid}/friends/${alice.uid}`);
    assert.equal(field(friend, 'displayName'), 'Staging Alice Updated');
  });

  const checkIn = await call(alice, 'createCheckInCallable', {
    operationId: `live-${runId}-all`,
    venueId: qaVenueId,
    durationMinutes: 30,
    audienceMode: 'all_friends',
    message: 'Live staging smoke test',
  });
  assert.equal(checkIn.viewerCount, 1);
  const activity = await getDocument(bob, `users/${bob.uid}/friendActivity/${alice.uid}`);
  assert.equal(field(activity, 'venueName'), 'GathR Social QA Venue');

  await call(bob, 'blockUserCallable', { blockedUid: alice.uid });
  const block = await getDocument(bob, `users/${bob.uid}/blocks/${alice.uid}`);
  assert.equal(field(block, 'displayName'), 'Staging Alice Updated');
  assert.equal(await getDocument(bob, `users/${bob.uid}/friendActivity/${alice.uid}`), null);
  await call(bob, 'unblockUserCallable', { blockedUid: alice.uid });

  await makeFriends(alice, bob);
  const selectedCheckIn = await call(alice, 'createCheckInCallable', {
    operationId: `live-${runId}-selected`,
    venueId: qaVenueId,
    durationMinutes: 60,
    audienceMode: 'selected_friends',
    selectedUids: [bob.uid],
  });
  assert.equal(selectedCheckIn.viewerCount, 1);
  await call(alice, 'checkOutCallable');
  assert.equal(await getDocument(bob, `users/${bob.uid}/friendActivity/${alice.uid}`), null);

  await call(bob, 'reportUserCallable', { reportedUid: alice.uid, reason: 'other' });
  await call(alice, 'removeFriendCallable', { otherUid: bob.uid });
  await makeFriends(alice, bob);

  await deleteAccount(bob);
  bob = null;
  await waitFor('Auth-deletion social cleanup', async () => {
    assert.equal(await getDocument(alice, `users/${alice.uid}/friends/${search.user.uid}`), null);
  });

  const cleanup = await call(alice, 'deleteSocialAccountDataCallable');
  assert.equal(cleanup.handleReleased, true);
  await deleteAccount(alice);
  alice = null;

  console.log(JSON.stringify({
    projectId,
    callableCountExercised: 13,
    profileSyncVerified: true,
    authDeleteCleanupVerified: true,
    blockDisplaySnapshotVerified: true,
    checkInVisibilityVerified: true,
    status: 'passed',
  }, null, 2));
} finally {
  await Promise.allSettled([deleteAccount(alice), deleteAccount(bob)]);
}
