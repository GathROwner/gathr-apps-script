import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectId = 'gathr-social-staging';
const region = 'northamerica-northeast1';
const apiKey = 'AIzaSyB8zainbIH0k6G2NHGRBDIJl_nupmJ59jc';
const authBase = 'https://identitytoolkit.googleapis.com/v1/accounts';
const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const functionBase = `https://${region}-${projectId}.cloudfunctions.net`;
const credentialPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.social-staging-personas.local.json');
const venueId = 'fb_100063763432825';
const command = process.argv[2] || 'seed';

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    const error = new Error(`${options.method || 'GET'} request failed (${response.status})`);
    error.details = body.error || body;
    throw error;
  }
  return body;
}

async function loadCredentials() {
  try {
    return JSON.parse(await readFile(credentialPath, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    const suffix = randomBytes(5).toString('hex');
    const credentials = {
      password: `Qa!${randomBytes(18).toString('base64url')}`,
      aliceEmail: `preview.alice.${suffix}@example.com`,
      bobEmail: `preview.bob.${suffix}@example.com`,
    };
    await writeFile(credentialPath, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
    return credentials;
  }
}

async function authenticate(email, password) {
  try {
    const result = await jsonRequest(`${authBase}:signInWithPassword?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    return { uid: result.localId, idToken: result.idToken, email };
  } catch (error) {
    if (!['EMAIL_NOT_FOUND', 'INVALID_LOGIN_CREDENTIALS'].includes(error?.details?.message)) throw error;
    const result = await jsonRequest(`${authBase}:signUp?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    return { uid: result.localId, idToken: result.idToken, email };
  }
}

async function deleteAccount(account) {
  await jsonRequest(`${authBase}:delete?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: account.idToken }),
  });
}

function stringValue(value) {
  return { stringValue: value };
}

async function writeProfile(account, displayName) {
  const updateMask = new URLSearchParams();
  for (const field of ['displayName', 'email', 'photoURL']) updateMask.append('updateMask.fieldPaths', field);
  await jsonRequest(`${firestoreBase}/users/${account.uid}?${updateMask}`, {
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

async function ensureFriends(alice, bob) {
  const result = await call(alice, 'sendFriendRequestCallable', { targetUid: bob.uid });
  if (result.state === 'pending') await call(bob, 'acceptFriendRequestCallable', { otherUid: alice.uid });
}

const credentials = await loadCredentials();
const [alice, bob] = await Promise.all([
  authenticate(credentials.aliceEmail, credentials.password),
  authenticate(credentials.bobEmail, credentials.password),
]);

if (command === 'cleanup') {
  await Promise.all([deleteAccount(alice), deleteAccount(bob)]);
  console.log(JSON.stringify({ projectId, command, status: 'deleted' }, null, 2));
} else if (command === 'seed') {
  await Promise.all([
    writeProfile(alice, 'Preview Alice'),
    writeProfile(bob, 'Preview Bob'),
  ]);
  await Promise.all([
    call(alice, 'claimSocialHandleCallable', { handle: 'preview_alice' }),
    call(bob, 'claimSocialHandleCallable', { handle: 'preview_bob' }),
  ]);
  await ensureFriends(alice, bob);
  await call(alice, 'checkOutCallable');
  const checkIn = await call(bob, 'createCheckInCallable', {
    operationId: `preview-${Date.now().toString(36)}`,
    venueId,
    durationMinutes: 120,
    audienceMode: 'all_friends',
    message: 'Preview map reaction QA',
  });
  console.log(JSON.stringify({
    projectId,
    command,
    credentialPath,
    aliceEmail: alice.email,
    bobEmail: bob.email,
    venueId,
    viewerCount: checkIn.viewerCount,
    status: 'ready',
  }, null, 2));
} else {
  throw new Error(`Unknown command: ${command}`);
}
