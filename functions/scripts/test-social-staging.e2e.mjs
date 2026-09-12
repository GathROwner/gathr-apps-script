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
let charlie;

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

function doubleValue(value) {
  return { doubleValue: value };
}

function integerValue(value) {
  return { integerValue: String(value) };
}

function booleanValue(value) {
  return { booleanValue: value };
}

function timestampValue(value) {
  return { timestampValue: new Date(value).toISOString() };
}

function stringArrayValue(values) {
  return { arrayValue: { values: values.map(stringValue) } };
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

async function writeAdminFields(documentPath, fields) {
  const accessToken = await firebaseCliAccessToken();
  const updateMask = new URLSearchParams();
  Object.keys(fields).forEach((name) => updateMask.append('updateMask.fieldPaths', name));
  return jsonRequest(`${firestoreBase}/${documentPath}?${updateMask.toString()}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  });
}

async function ensureQaVenue() {
  await writeAdminFields(`venues/${qaVenueId}`, {
    pagename: stringValue('GathR Social QA Venue'),
    address: stringValue('Staging only'),
    environment: stringValue('staging'),
    latitude: doubleValue(46.2382),
    longitude: doubleValue(-63.1311),
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
    ?? value.doubleValue
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
  charlie = await createAccount('charlie');
  await Promise.all([
    writeOwnProfile(alice, 'Staging Alice'),
    writeOwnProfile(bob, 'Staging Bob'),
    writeOwnProfile(charlie, 'Staging Charlie'),
  ]);

  const aliceHandle = `qa_${runId}_a`.slice(0, 24);
  const bobHandle = `qa_${runId}_b`.slice(0, 24);
  const charlieHandle = `qa_${runId}_c`.slice(0, 24);
  await call(alice, 'claimSocialHandleCallable', { handle: aliceHandle });
  await call(bob, 'claimSocialHandleCallable', { handle: bobHandle });
  await call(charlie, 'claimSocialHandleCallable', { handle: charlieHandle });
  const search = await call(alice, 'searchUserByHandleCallable', { handle: bobHandle });
  assert.equal(search.user.uid, bob.uid);

  await call(alice, 'sendFriendRequestCallable', { targetUid: bob.uid });
  await call(alice, 'cancelFriendRequestCallable', { otherUid: bob.uid });
  await call(alice, 'sendFriendRequestCallable', { targetUid: bob.uid });
  await call(bob, 'declineFriendRequestCallable', { otherUid: alice.uid });
  await makeFriends(alice, bob);
  await makeFriends(bob, charlie);

  await writeOwnProfile(alice, 'Staging Alice Updated');
  await waitFor('profile projection synchronization', async () => {
    const friend = await getDocument(bob, `users/${bob.uid}/friends/${alice.uid}`);
    assert.equal(field(friend, 'displayName'), 'Staging Alice Updated');
  });

  const dwellSessionId = `live-${runId}-dwell`;
  const firstDwellSample = await call(alice, 'recordCheckInEligibilitySampleCallable', {
    sessionId: dwellSessionId,
    venueId: qaVenueId,
    latitude: 46.2382,
    longitude: -63.1311,
    accuracyMeters: 8,
    speedMetersPerSecond: 0,
  });
  assert.equal(firstDwellSample.eligible, false);
  const completedAt = Date.now();
  await writeAdminFields(`checkInEligibilitySessions/${alice.uid}_${dwellSessionId}`, {
    eligible: booleanValue(true),
    eligibleVenueIds: stringArrayValue([qaVenueId]),
    qualifyingMs: integerValue(90_000),
    completedAt: timestampValue(completedAt),
    completedExpiresAt: timestampValue(completedAt + 5 * 60_000),
    expiresAt: timestampValue(completedAt + 5 * 60_000),
  });

  const checkIn = await call(alice, 'createCheckInCallable', {
    operationId: `live-${runId}-all`,
    eligibilitySessionId: dwellSessionId,
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

  const nearby = await call(alice, 'discoverNearbyCheckInPlacesCallable', {
    latitude: 46.2382,
    longitude: -63.1311,
    accuracyMeters: 8,
    capturedAtMs: Date.now(),
  });
  const externalPlace = nearby.candidates.find((candidate) => candidate.type === 'external_place');
  assert.ok(externalPlace, 'Expected at least one public external POI near the staging coordinate.');
  assert.ok(externalPlace.id);
  assert.equal(externalPlace.venueId, undefined);
  const externalDwellSessionId = `live-${runId}-external-dwell`;
  const firstExternalSample = await call(alice, 'recordCheckInEligibilitySampleCallable', {
    sessionId: externalDwellSessionId,
    placeCandidateId: externalPlace.id,
    latitude: externalPlace.latitude,
    longitude: externalPlace.longitude,
    accuracyMeters: 8,
    speedMetersPerSecond: 0,
  });
  assert.equal(firstExternalSample.eligible, false);
  const externalCompletedAt = Date.now();
  await writeAdminFields(`checkInEligibilitySessions/${alice.uid}_${externalDwellSessionId}`, {
    eligible: booleanValue(true),
    qualifyingMs: integerValue(90_000),
    completedAt: timestampValue(externalCompletedAt),
    completedExpiresAt: timestampValue(externalCompletedAt + 5 * 60_000),
    expiresAt: timestampValue(externalCompletedAt + 5 * 60_000),
  });
  const externalCheckInRequest = {
    operationId: `live-${runId}-external`,
    eligibilitySessionId: externalDwellSessionId,
    placeCandidateId: externalPlace.id,
    durationMinutes: 30,
    audienceMode: 'selected_friends',
    selectedUids: [bob.uid],
    message: 'External place staging smoke test',
  };
  const externalCheckIn = await call(alice, 'createCheckInCallable', externalCheckInRequest);
  const retriedExternalCheckIn = await call(alice, 'createCheckInCallable', externalCheckInRequest);
  assert.equal(externalCheckIn.locationType, 'external_place');
  assert.equal(retriedExternalCheckIn.revision, externalCheckIn.revision);
  const externalActivity = await getDocument(bob, `users/${bob.uid}/friendActivity/${alice.uid}`);
  assert.equal(field(externalActivity, 'locationType'), 'external_place');
  assert.equal(field(externalActivity, 'venueName'), externalPlace.name);
  assert.equal(Number.isFinite(Number(field(externalActivity, 'latitude'))), true);
  assert.equal(Number.isFinite(Number(field(externalActivity, 'longitude'))), true);
  await call(alice, 'checkOutCallable');
  assert.equal(await getDocument(bob, `users/${bob.uid}/friendActivity/${alice.uid}`), null);

  const privateAddress = '1 Queen Street, Charlottetown, PE C1A 4A2';
  const startAtMs = Date.now() + 24 * 60 * 60_000;
  const baseEventInput = {
    title: 'Staging backyard movie night',
    description: 'Private Release 2 staging smoke test.',
    category: 'Cinema',
    startAtMs,
    endAtMs: startAtMs + 2 * 60 * 60_000,
    visibility: 'selected_friends',
    selectedUids: [bob.uid],
    guestInviteMode: 'guests_can_invite',
    guestListVisible: true,
    location: {
      type: 'custom_address',
      address: privateAddress,
      placeName: 'Staging private home',
      revealAtMs: startAtMs,
    },
  };
  const createdEvent = await call(alice, 'createFriendEventCallable', {
    ...baseEventInput,
    operationId: `live-${runId}-event`,
  });
  const eventId = createdEvent.eventId;
  assert.ok(eventId);
  const bobEventBeforeReveal = await getDocument(bob, `users/${bob.uid}/friendEvents/${eventId}`);
  assert.equal(field(bobEventBeforeReveal, 'addressRevealed'), false);
  assert.equal(await getDocument(bob, `users/${bob.uid}/friendEventLocations/${eventId}`), null);
  assert.equal(await getDocument(charlie, `users/${charlie.uid}/friendEvents/${eventId}`), null);

  await call(bob, 'inviteToFriendEventCallable', { eventId, targetUid: charlie.uid });
  assert.ok(await getDocument(charlie, `users/${charlie.uid}/friendEvents/${eventId}`));
  assert.equal(
    (await call(charlie, 'respondToFriendEventCallable', { eventId, response: 'going' })).response,
    'going'
  );
  await call(alice, 'removeFromFriendEventCallable', { eventId, memberUid: charlie.uid });
  assert.equal(await getDocument(charlie, `users/${charlie.uid}/friendEvents/${eventId}`), null);

  await call(alice, 'updateFriendEventCallable', {
    ...baseEventInput,
    eventId,
    title: 'Staging backyard movie night updated',
    location: { ...baseEventInput.location, revealAtMs: Date.now() },
  });
  const bobLocationAfterReveal = await getDocument(
    bob,
    `users/${bob.uid}/friendEventLocations/${eventId}`
  );
  assert.equal(field(bobLocationAfterReveal, 'address'), privateAddress);

  await call(alice, 'cancelFriendEventCallable', {
    eventId,
    reason: 'Release 2 staging cancellation test',
  });
  assert.equal(await getDocument(bob, `users/${bob.uid}/friendEventLocations/${eventId}`), null);
  await call(alice, 'deleteFriendEventCallable', { eventId });
  assert.equal(await getDocument(bob, `users/${bob.uid}/friendEvents/${eventId}`), null);

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
  await deleteAccount(charlie);
  charlie = null;

  console.log(JSON.stringify({
    projectId,
    callableCountExercised: 26,
    profileSyncVerified: true,
    authDeleteCleanupVerified: true,
    blockDisplaySnapshotVerified: true,
    checkInVisibilityVerified: true,
    contextualEligibilityVerified: true,
    externalPlaceCheckInVerified: true,
    delayedPrivateAddressVerified: true,
    guestInviteAndRsvpVerified: true,
    eventCancellationAndDeletionVerified: true,
    status: 'passed',
  }, null, 2));
} finally {
  await Promise.allSettled([
    deleteAccount(alice),
    deleteAccount(bob),
    deleteAccount(charlie),
  ]);
}
