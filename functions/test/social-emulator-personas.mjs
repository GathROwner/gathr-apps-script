import process from 'node:process';

import { deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

import {
  acceptFriendRequest,
  blockUser,
  checkOut,
  claimSocialHandle,
  cleanupExpiredCheckIns,
  createCheckIn,
  sendFriendRequest,
} from '../lib/social/socialService.js';

const projectId = process.env.GCLOUD_PROJECT || 'demo-gathr-social';
const command = process.argv[2] || 'status';
const app = getApps()[0] || initializeApp({ projectId });
const db = getFirestore(app);
const auth = getAuth(app);

const PERSONAS = {
  alice: { uid: 'friend-a-alice', email: 'alice@gathr.local', password: 'GathrTest!2026', displayName: 'Alice Friend A', handle: 'alice_friend' },
  bob: { uid: 'friend-b-bob', email: 'bob@gathr.local', password: 'GathrTest!2026', displayName: 'Bob Friend B', handle: 'bob_friend' },
  casey: { uid: 'stranger-c-casey', email: 'casey@gathr.local', password: 'GathrTest!2026', displayName: 'Casey Stranger C', handle: 'casey_stranger' },
  dana: { uid: 'blocked-d-dana', email: 'dana@gathr.local', password: 'GathrTest!2026', displayName: 'Dana Blocked D', handle: 'dana_blocked' },
};

const MAP_QA_VENUE = {
  id: process.env.SOCIAL_QA_VENUE_ID || 'fb_100063763432825',
  pagename: process.env.SOCIAL_QA_VENUE_NAME || 'The Old Triangle Charlottetown',
  address: process.env.SOCIAL_QA_VENUE_ADDRESS || '189 Great George St, Charlottetown, PE C1A 4L1, Canada',
  latitude: Number(process.env.SOCIAL_QA_VENUE_LATITUDE || 46.23679),
  longitude: Number(process.env.SOCIAL_QA_VENUE_LONGITUDE || -63.12878),
};

function requireEmulators() {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('Start the Firebase Auth and Firestore emulators before using persona commands.');
  }
}

async function clearEmulators() {
  const firestoreResponse = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
  if (!firestoreResponse.ok) throw new Error(await firestoreResponse.text());
  const authResponse = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${projectId}/accounts`,
    { method: 'DELETE' }
  );
  if (!authResponse.ok) throw new Error(await authResponse.text());
}

async function seed() {
  await clearEmulators();
  for (const persona of Object.values(PERSONAS)) {
    await auth.createUser({
      uid: persona.uid,
      email: persona.email,
      password: persona.password,
      displayName: persona.displayName,
      emailVerified: true,
    });
    await db.doc(`users/${persona.uid}`).set({
      email: persona.email,
      displayName: persona.displayName,
      photoURL: '',
      createdAt: new Date(),
      userInterests: [],
      savedEvents: [],
      likedEvents: [],
    });
    await claimSocialHandle(persona.uid, persona.handle, db);
  }

  await db.doc('venues/demo-cafe').set({
    pagename: 'GathR Emulator Café',
    address: '1 Emulator Way, Charlottetown, PE',
    latitude: 46.2382,
    longitude: -63.1311,
  });
  await db.doc('venues/demo-cafe/events/demo-live-music').set({
    type: 'event',
    category: 'Live Music',
    title: 'Emulator Social QA Night',
    description: 'Local-only deterministic test event.',
    venueId: 'demo-cafe',
    venue: 'GathR Emulator Café',
    address: '1 Emulator Way, Charlottetown, PE',
    latitude: 46.2382,
    longitude: -63.1311,
    startDate: '2026-08-28',
    endDate: '2027-08-28',
    startTime: '00:00',
    endTime: '23:59',
    imageUrl: '',
    source: 'firestore',
  });
  console.log(JSON.stringify({ command: 'seed', projectId, personas: PERSONAS, venueId: 'demo-cafe' }, null, 2));
}

async function ensureFriends(first, second) {
  const result = await sendFriendRequest(first, second, db);
  if (result.state === 'pending') await acceptFriendRequest(second, first, db);
}

async function seedMapQaVenue() {
  await db.doc(`venues/${MAP_QA_VENUE.id}`).set({
    pagename: MAP_QA_VENUE.pagename,
    address: MAP_QA_VENUE.address,
    latitude: MAP_QA_VENUE.latitude,
    longitude: MAP_QA_VENUE.longitude,
  });
}

async function expireBobCheckInSoon() {
  const canonicalRef = db.doc(`activeCheckIns/${PERSONAS.bob.uid}`);
  const aliceProjectionRef = db.doc(`users/${PERSONAS.alice.uid}/friendActivity/${PERSONAS.bob.uid}`);
  const [canonical, aliceProjection] = await Promise.all([
    canonicalRef.get(),
    aliceProjectionRef.get(),
  ]);
  if (!canonical.exists || !aliceProjection.exists) {
    throw new Error('Create Bob\'s map check-in for Alice before shortening its expiry.');
  }
  const expiresAt = Timestamp.fromMillis(Date.now() + 5_000);
  const batch = db.batch();
  batch.update(canonicalRef, { expiresAt });
  batch.update(aliceProjectionRef, { expiresAt });
  await batch.commit();
  console.log(JSON.stringify({ command: 'expire-bob-checkin-soon', expiresAt: expiresAt.toDate().toISOString() }, null, 2));
}

async function status() {
  const relationships = await db.collection('socialRelationships').get();
  const checkIns = await db.collection('activeCheckIns').get();
  const activeCheckInDetails = checkIns.docs.map((snapshot) => {
    const data = snapshot.data();
    return {
      ownerUid: snapshot.id,
      venueId: data.venueId || null,
      viewerCount: data.viewerCount || 0,
      viewerUids: Array.isArray(data.viewerUids) ? data.viewerUids : [],
    };
  });
  const summary = {};
  for (const [name, persona] of Object.entries(PERSONAS)) {
    const [friends, requests, activity, blocks] = await Promise.all([
      db.collection(`users/${persona.uid}/friends`).get(),
      db.collection(`users/${persona.uid}/friendRequests`).get(),
      db.collection(`users/${persona.uid}/friendActivity`).get(),
      db.collection(`users/${persona.uid}/blocks`).get(),
    ]);
    summary[name] = {
      uid: persona.uid,
      friends: friends.size,
      requests: requests.size,
      visibleCheckIns: activity.size,
      blocks: blocks.size,
      blockProfiles: blocks.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() })),
    };
  }
  console.log(JSON.stringify({
    projectId,
    relationships: relationships.size,
    activeCheckIns: checkIns.size,
    activeCheckInDetails,
    summary,
  }, null, 2));
}

async function run() {
  requireEmulators();
  switch (command) {
    case 'seed':
      await seed();
      break;
    case 'bob-request-alice':
      await sendFriendRequest(PERSONAS.bob.uid, PERSONAS.alice.uid, db);
      break;
    case 'bob-accept-alice':
      await acceptFriendRequest(PERSONAS.bob.uid, PERSONAS.alice.uid, db);
      break;
    case 'friend-alice-bob':
      await ensureFriends(PERSONAS.alice.uid, PERSONAS.bob.uid);
      break;
    case 'friend-alice-casey':
      await ensureFriends(PERSONAS.alice.uid, PERSONAS.casey.uid);
      break;
    case 'bob-checkin':
      await ensureFriends(PERSONAS.alice.uid, PERSONAS.bob.uid);
      await createCheckIn(PERSONAS.bob.uid, {
        venueId: 'demo-cafe',
        durationMinutes: 60,
        audienceMode: 'all_friends',
        message: 'Emulator patio test',
      }, db);
      break;
    case 'seed-map-venue':
      await seedMapQaVenue();
      break;
    case 'bob-checkin-map-venue':
      await ensureFriends(PERSONAS.alice.uid, PERSONAS.bob.uid);
      await seedMapQaVenue();
      await createCheckIn(PERSONAS.bob.uid, {
        venueId: MAP_QA_VENUE.id,
        durationMinutes: 60,
        audienceMode: 'all_friends',
        message: 'Map reaction QA',
      }, db);
      break;
    case 'alice-checkin-map-venue':
      await ensureFriends(PERSONAS.alice.uid, PERSONAS.bob.uid);
      await seedMapQaVenue();
      await createCheckIn(PERSONAS.alice.uid, {
        venueId: MAP_QA_VENUE.id,
        durationMinutes: 60,
        audienceMode: 'all_friends',
        message: 'On the patio',
      }, db);
      break;
    case 'bob-checkout':
      await checkOut(PERSONAS.bob.uid, db);
      break;
    case 'expire-bob-checkin-soon':
      await expireBobCheckInSoon();
      break;
    case 'cleanup-expired':
      console.log(JSON.stringify({ command: 'cleanup-expired', result: await cleanupExpiredCheckIns(Timestamp.now(), db) }, null, 2));
      break;
    case 'dana-block-alice':
      await blockUser(PERSONAS.dana.uid, PERSONAS.alice.uid, db);
      break;
    case 'alice-block-dana':
      await blockUser(PERSONAS.alice.uid, PERSONAS.dana.uid, db);
      break;
    case 'status':
      await status();
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
  if (command !== 'seed' && command !== 'status') await status();
}

try {
  await run();
} finally {
  await deleteApp(app);
}
