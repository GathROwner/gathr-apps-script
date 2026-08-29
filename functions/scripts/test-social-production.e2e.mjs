import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const projectId = 'gathr-m1';
const region = 'northamerica-northeast1';
const apiKey = process.env.SOCIAL_E2E_API_KEY;
const productionApproval = process.env.ALLOW_PRODUCTION_SOCIAL_E2E;
const authBase = 'https://identitytoolkit.googleapis.com/v1/accounts';
const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const functionBase = `https://${region}-${projectId}.cloudfunctions.net`;
const runId = Date.now().toString(36);
const password = `Qa!${randomBytes(18).toString('base64url')}`;

assert.equal(
  productionApproval,
  'YES_I_UNDERSTAND',
  'Set ALLOW_PRODUCTION_SOCIAL_E2E=YES_I_UNDERSTAND to run against production.'
);
assert.ok(apiKey, 'SOCIAL_E2E_API_KEY is required.');

let alice;
let bob;
let aliceUid;
let bobUid;
let aliceHandle;
let bobHandle;
let reportId;
let adminAccessToken;

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
  const email = `gathr.production.socialqa.${runId}.${label}@example.com`;
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

function stringField(document, name) {
  return document?.fields?.[name]?.stringValue;
}

async function discoverExistingVenue() {
  const response = await jsonRequest(`${firestoreBase}/venues?pageSize=50`);
  const venue = (response.documents || []).find((document) => (
    stringField(document, 'pagename') || stringField(document, 'name')
  ));
  assert.ok(venue, 'Production does not contain a readable recognized venue.');
  return {
    id: venue.name.split('/').at(-1),
    name: stringField(venue, 'pagename') || stringField(venue, 'name'),
  };
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
  if (adminAccessToken) return adminAccessToken;
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  assert.ok(config.tokens?.access_token, 'Firebase CLI access token is unavailable.');
  adminAccessToken = config.tokens.access_token;
  return adminAccessToken;
}

async function adminDeleteDocument(documentPath) {
  if (!documentPath) return;
  const accessToken = await firebaseCliAccessToken();
  const response = await fetch(`${firestoreBase}/${documentPath}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status !== 404 && !response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`DELETE ${documentPath} failed (${response.status}): ${JSON.stringify(body)}`);
  }
}

async function adminDocumentExists(documentPath) {
  const accessToken = await firebaseCliAccessToken();
  const response = await fetch(`${firestoreBase}/${documentPath}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 404) return false;
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`GET ${documentPath} failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return true;
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

async function waitFor(description, assertion, timeoutMilliseconds = 60_000) {
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

async function cleanupTemporaryData() {
  await Promise.allSettled([
    alice && call(alice, 'deleteSocialAccountDataCallable'),
    bob && call(bob, 'deleteSocialAccountDataCallable'),
  ]);
  await Promise.allSettled([deleteAccount(alice), deleteAccount(bob)]);
  await Promise.allSettled([
    aliceUid && adminDeleteDocument(`users/${aliceUid}`),
    bobUid && adminDeleteDocument(`users/${bobUid}`),
    aliceHandle && adminDeleteDocument(`socialHandles/${aliceHandle}`),
    bobHandle && adminDeleteDocument(`socialHandles/${bobHandle}`),
    aliceUid && adminDeleteDocument(`activeCheckIns/${aliceUid}`),
    bobUid && adminDeleteDocument(`activeCheckIns/${bobUid}`),
    reportId && adminDeleteDocument(`userReports/${reportId}`),
  ]);
}

let passed = false;
try {
  const venue = await discoverExistingVenue();
  alice = await createAccount('alice');
  bob = await createAccount('bob');
  aliceUid = alice.uid;
  bobUid = bob.uid;

  assert.equal(await adminDocumentExists(`users/${aliceUid}`), false);
  assert.equal(await adminDocumentExists(`users/${bobUid}`), false);

  await Promise.all([
    writeOwnProfile(alice, 'GathR Production QA Alice'),
    writeOwnProfile(bob, 'GathR Production QA Bob'),
  ]);

  aliceHandle = `qa_${runId}_a`.slice(0, 24);
  bobHandle = `qa_${runId}_b`.slice(0, 24);
  await call(alice, 'claimSocialHandleCallable', { handle: aliceHandle });
  await call(bob, 'claimSocialHandleCallable', { handle: bobHandle });
  const search = await call(alice, 'searchUserByHandleCallable', { handle: bobHandle });
  assert.equal(search.user.uid, bob.uid);

  await call(alice, 'sendFriendRequestCallable', { targetUid: bob.uid });
  await call(alice, 'cancelFriendRequestCallable', { otherUid: bob.uid });
  await call(alice, 'sendFriendRequestCallable', { targetUid: bob.uid });
  await call(bob, 'declineFriendRequestCallable', { otherUid: alice.uid });
  await makeFriends(alice, bob);

  await writeOwnProfile(alice, 'GathR Production QA Alice Updated');
  await waitFor('profile projection synchronization', async () => {
    const friend = await getDocument(bob, `users/${bob.uid}/friends/${alice.uid}`);
    assert.equal(field(friend, 'displayName'), 'GathR Production QA Alice Updated');
  });

  const checkIn = await call(alice, 'createCheckInCallable', {
    operationId: `production-${runId}-all`,
    venueId: venue.id,
    durationMinutes: 30,
    audienceMode: 'all_friends',
    message: 'Automated production verification',
  });
  assert.equal(checkIn.viewerCount, 1);
  const activity = await getDocument(bob, `users/${bob.uid}/friendActivity/${alice.uid}`);
  assert.equal(field(activity, 'venueName'), venue.name);

  await call(bob, 'blockUserCallable', { blockedUid: alice.uid });
  const block = await getDocument(bob, `users/${bob.uid}/blocks/${alice.uid}`);
  assert.equal(field(block, 'displayName'), 'GathR Production QA Alice Updated');
  assert.equal(await getDocument(bob, `users/${bob.uid}/friendActivity/${alice.uid}`), null);
  await call(bob, 'unblockUserCallable', { blockedUid: alice.uid });

  await makeFriends(alice, bob);
  const selectedCheckIn = await call(alice, 'createCheckInCallable', {
    operationId: `production-${runId}-selected`,
    venueId: venue.id,
    durationMinutes: 60,
    audienceMode: 'selected_friends',
    selectedUids: [bob.uid],
  });
  assert.equal(selectedCheckIn.viewerCount, 1);
  await call(alice, 'checkOutCallable');
  assert.equal(await getDocument(bob, `users/${bob.uid}/friendActivity/${alice.uid}`), null);

  const report = await call(bob, 'reportUserCallable', { reportedUid: alice.uid, reason: 'other' });
  reportId = report.reportId;
  await call(alice, 'removeFriendCallable', { otherUid: bob.uid });
  await makeFriends(alice, bob);

  await deleteAccount(bob);
  bob = null;
  await waitFor('Auth-deletion social cleanup', async () => {
    assert.equal(await getDocument(alice, `users/${alice.uid}/friends/${bobUid}`), null);
  });

  const cleanup = await call(alice, 'deleteSocialAccountDataCallable');
  assert.equal(cleanup.handleReleased, true);
  await deleteAccount(alice);
  alice = null;

  await cleanupTemporaryData();
  await waitFor('temporary production records cleanup', async () => {
    const residualPaths = [
      `users/${aliceUid}`,
      `users/${bobUid}`,
      `socialHandles/${aliceHandle}`,
      `socialHandles/${bobHandle}`,
      `activeCheckIns/${aliceUid}`,
      `activeCheckIns/${bobUid}`,
      `userReports/${reportId}`,
    ];
    const existence = await Promise.all(residualPaths.map(adminDocumentExists));
    assert.equal(existence.some(Boolean), false);
  });

  passed = true;
  console.log(JSON.stringify({
    projectId,
    callableCountExercised: 13,
    profileSyncVerified: true,
    authDeleteCleanupVerified: true,
    blockDisplaySnapshotVerified: true,
    checkInVisibilityVerified: true,
    temporaryRecordsRemoved: true,
    status: 'passed',
  }, null, 2));
} finally {
  if (!passed) await cleanupTemporaryData();
}
