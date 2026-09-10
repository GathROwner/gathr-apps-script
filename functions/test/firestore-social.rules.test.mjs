import fs from 'node:fs';
import path from 'node:path';
import test, { after, before, beforeEach } from 'node:test';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collectionGroup, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

const projectId = 'demo-gathr-social';
const rules = fs.readFileSync(
  path.resolve(process.env.FIRESTORE_RULES_FILE || 'firestore.rules'),
  'utf8'
);
let environment;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'users/alice'), { displayName: 'Alice' }),
      setDoc(doc(db, 'users/bob'), { displayName: 'Bob' }),
      setDoc(doc(db, 'users/alice/friends/bob'), {
        uid: 'bob',
        displayName: 'Bob',
      }),
      setDoc(doc(db, 'users/alice/friendRequests/bob'), {
        uid: 'bob',
        direction: 'incoming',
      }),
      setDoc(doc(db, 'users/alice/friendActivity/bob'), {
        ownerUid: 'bob',
        venueId: 'venue-1',
      }),
      setDoc(doc(db, 'users/alice/friendEvents/event-1'), {
        eventId: 'event-1',
        viewerUid: 'alice',
      }),
      setDoc(doc(db, 'users/alice/friendEventLocations/event-1'), {
        eventId: 'event-1',
        address: '12 Private Lane',
      }),
      setDoc(doc(db, 'users/alice/blocks/bad-user'), {
        ownerUid: 'alice',
        blockedUid: 'bad-user',
      }),
      setDoc(doc(db, 'activeCheckIns/alice'), {
        ownerUid: 'alice',
        venueId: 'venue-1',
      }),
      setDoc(doc(db, 'checkInEligibilitySessions/alice_session'), { uid: 'alice' }),
      setDoc(doc(db, 'checkInPlaceCandidates/candidate-1'), { uid: 'alice' }),
      setDoc(doc(db, 'friendEvents/event-1'), { hostUid: 'alice' }),
      setDoc(doc(db, 'friendEventPrivateLocations/event-1'), { hostUid: 'alice' }),
      setDoc(doc(db, 'friendEventInvitations/event-1_bob'), { hostUid: 'alice' }),
      setDoc(doc(db, 'friendEventResponses/event-1_bob'), { hostUid: 'alice' }),
      setDoc(doc(db, 'socialHandles/alice_handle'), { uid: 'alice' }),
      setDoc(doc(db, 'socialRelationships/pair'), {
        members: ['alice', 'bob'],
        status: 'accepted',
      }),
      setDoc(doc(db, 'venues/venue-1'), { pagename: 'Venue One' }),
      setDoc(doc(db, 'users/alice/privateSharedEvents/private-1'), {
        ownerUid: 'alice',
      }),
    ]);
  });
});

after(async () => {
  await environment.cleanup();
});

test('a user can read their own profile and social projections', async () => {
  const db = environment.authenticatedContext('alice').firestore();
  await assertSucceeds(getDoc(doc(db, 'users/alice')));
  await assertSucceeds(getDoc(doc(db, 'users/alice/friends/bob')));
  await assertSucceeds(getDoc(doc(db, 'users/alice/friendRequests/bob')));
  await assertSucceeds(getDoc(doc(db, 'users/alice/friendActivity/bob')));
  await assertSucceeds(getDoc(doc(db, 'users/alice/friendEvents/event-1')));
  await assertSucceeds(getDoc(doc(db, 'users/alice/friendEventLocations/event-1')));
  await assertSucceeds(getDoc(doc(db, 'users/alice/blocks/bad-user')));
  await assertSucceeds(getDoc(doc(db, 'activeCheckIns/alice')));
});

test('another authenticated user cannot read viewer-specific social data or a raw check-in', async () => {
  const db = environment.authenticatedContext('bob').firestore();
  await assertFails(getDoc(doc(db, 'users/alice/friends/bob')));
  await assertFails(getDoc(doc(db, 'users/alice/friendRequests/bob')));
  await assertFails(getDoc(doc(db, 'users/alice/friendActivity/bob')));
  await assertFails(getDoc(doc(db, 'users/alice/friendEvents/event-1')));
  await assertFails(getDoc(doc(db, 'users/alice/friendEventLocations/event-1')));
  await assertFails(getDoc(doc(db, 'users/alice/blocks/bad-user')));
  await assertFails(getDoc(doc(db, 'activeCheckIns/alice')));
});

test('clients cannot read canonical social indexes or relationships', async () => {
  const db = environment.authenticatedContext('alice').firestore();
  await assertFails(getDoc(doc(db, 'socialHandles/alice_handle')));
  await assertFails(getDoc(doc(db, 'socialRelationships/pair')));
  await assertFails(getDoc(doc(db, 'socialRateLimits/alice_search')));
  await assertFails(getDoc(doc(db, 'socialOperations/retry-token')));
  await assertFails(getDoc(doc(db, 'userReports/report-1')));
  await assertFails(getDoc(doc(db, 'checkInEligibilitySessions/alice_session')));
  await assertFails(getDoc(doc(db, 'checkInPlaceCandidates/candidate-1')));
  await assertFails(getDoc(doc(db, 'friendEvents/event-1')));
  await assertFails(getDoc(doc(db, 'friendEventPrivateLocations/event-1')));
  await assertFails(getDoc(doc(db, 'friendEventInvitations/event-1_bob')));
  await assertFails(getDoc(doc(db, 'friendEventResponses/event-1_bob')));
});

test('collection-group queries cannot leak social projections across users', async () => {
  const db = environment.authenticatedContext('alice').firestore();
  await assertFails(getDocs(collectionGroup(db, 'friends')));
  await assertFails(getDocs(collectionGroup(db, 'friendRequests')));
  await assertFails(getDocs(collectionGroup(db, 'friendActivity')));
  await assertFails(getDocs(collectionGroup(db, 'friendEvents')));
  await assertFails(getDocs(collectionGroup(db, 'friendEventLocations')));
  await assertFails(getDocs(collectionGroup(db, 'blocks')));
});

test('clients cannot write server-controlled social documents', async () => {
  const db = environment.authenticatedContext('alice').firestore();
  await assertFails(setDoc(doc(db, 'users/alice/friends/charlie'), { uid: 'charlie' }));
  await assertFails(setDoc(doc(db, 'users/alice/friendRequests/charlie'), { uid: 'charlie' }));
  await assertFails(setDoc(doc(db, 'users/alice/friendActivity/charlie'), { uid: 'charlie' }));
  await assertFails(setDoc(doc(db, 'users/alice/friendEvents/forged'), { eventId: 'forged' }));
  await assertFails(setDoc(doc(db, 'users/alice/friendEventLocations/forged'), { address: 'leak' }));
  await assertFails(setDoc(doc(db, 'users/alice/blocks/charlie'), { blockedUid: 'charlie' }));
  await assertFails(setDoc(doc(db, 'activeCheckIns/alice'), { ownerUid: 'alice' }));
  await assertFails(setDoc(doc(db, 'checkInPlaceCandidates/candidate-2'), { uid: 'alice' }));
  await assertFails(setDoc(doc(db, 'socialRelationships/forged'), { members: ['alice', 'bob'] }));
  await assertFails(setDoc(doc(db, 'socialOperations/forged'), { uid: 'alice' }));
  await assertFails(setDoc(doc(db, 'friendEvents/forged'), { hostUid: 'alice' }));
  await assertFails(setDoc(doc(db, 'friendEventPrivateLocations/forged'), { address: 'leak' }));
});

test('profile updates cannot forge or change server-controlled handle fields', async () => {
  const aliceDb = environment.authenticatedContext('alice').firestore();
  await assertSucceeds(updateDoc(doc(aliceDb, 'users/alice'), { displayName: 'Alice Updated' }));
  await assertFails(updateDoc(doc(aliceDb, 'users/alice'), { socialHandle: 'forged' }));

  const newUserDb = environment.authenticatedContext('charlie').firestore();
  await assertSucceeds(setDoc(doc(newUserDb, 'users/charlie'), { displayName: 'Charlie' }));
  await assertFails(
    setDoc(doc(newUserDb, 'users/dan'), {
      displayName: 'Dan',
      socialHandle: 'forged',
    })
  );
});

test('existing public venue and private shared-event access contracts remain intact', async () => {
  const unauthenticatedDb = environment.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(unauthenticatedDb, 'venues/venue-1')));

  const aliceDb = environment.authenticatedContext('alice').firestore();
  const bobDb = environment.authenticatedContext('bob').firestore();
  await assertSucceeds(getDoc(doc(aliceDb, 'users/alice/privateSharedEvents/private-1')));
  await assertFails(getDoc(doc(bobDb, 'users/alice/privateSharedEvents/private-1')));
});
