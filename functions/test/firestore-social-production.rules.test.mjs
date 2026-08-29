import fs from 'node:fs';
import path from 'node:path';
import test, { after, before, beforeEach } from 'node:test';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const projectId = 'demo-gathr-social-production';
const rules = fs.readFileSync(
  path.resolve('firestore.social-production.rules'),
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
      setDoc(doc(db, 'interests/music'), { label: 'Music' }),
      setDoc(doc(db, 'pageSubmissions/submission-1'), { userId: 'alice' }),
      setDoc(doc(db, 'eventLikes/event-1'), { count: 1 }),
      setDoc(doc(db, 'eventShares/event-1'), { count: 1 }),
      setDoc(doc(db, 'eventUsersResponded/event-1'), { count: 1 }),
      setDoc(doc(db, 'venues/venue-1'), { pagename: 'Venue One' }),
      setDoc(doc(db, 'venues/venue-1/events/event-1'), { title: 'Event One' }),
      setDoc(doc(db, 'crowdsourced_shared_event_candidates/private-1'), { userId: 'alice' }),
      setDoc(doc(db, 'users/alice/crowdContributionDays/2026-08-29'), { count: 1 }),
    ]);
  });
});

after(async () => {
  await environment.cleanup();
});

test('preserves authenticated interest and page-submission access', async () => {
  const anonymousDb = environment.unauthenticatedContext().firestore();
  const aliceDb = environment.authenticatedContext('alice').firestore();

  await assertFails(getDoc(doc(anonymousDb, 'interests/music')));
  await assertSucceeds(getDoc(doc(aliceDb, 'interests/music')));
  await assertSucceeds(getDoc(doc(aliceDb, 'pageSubmissions/submission-1')));
  await assertSucceeds(setDoc(doc(aliceDb, 'pageSubmissions/submission-2'), { userId: 'alice' }));
  await assertFails(updateDoc(doc(aliceDb, 'pageSubmissions/submission-1'), { userId: 'bob' }));
});

test('preserves engagement access and event-share count validation', async () => {
  const aliceDb = environment.authenticatedContext('alice').firestore();

  await assertSucceeds(getDoc(doc(aliceDb, 'eventLikes/event-1')));
  await assertSucceeds(setDoc(doc(aliceDb, 'eventLikes/event-2'), { count: 1 }));
  await assertSucceeds(updateDoc(doc(aliceDb, 'eventShares/event-1'), { count: 2 }));
  await assertFails(updateDoc(doc(aliceDb, 'eventShares/event-1'), { count: 0 }));
  await assertSucceeds(setDoc(doc(aliceDb, 'eventUsersResponded/event-2'), { count: 1 }));
});

test('preserves public event reads and custom-claim admin writes', async () => {
  const anonymousDb = environment.unauthenticatedContext().firestore();
  const aliceDb = environment.authenticatedContext('alice').firestore();
  const adminDb = environment.authenticatedContext('admin', { admin: true }).firestore();

  await assertSucceeds(getDoc(doc(anonymousDb, 'venues/venue-1')));
  await assertSucceeds(getDocs(collectionGroup(anonymousDb, 'events')));
  await assertFails(setDoc(doc(aliceDb, 'venues/venue-2'), { pagename: 'Nope' }));
  await assertSucceeds(setDoc(doc(adminDb, 'venues/venue-2'), { pagename: 'Admin Venue' }));
  await assertSucceeds(setDoc(doc(adminDb, 'unrecognized_venues/venue-3'), { name: 'Review' }));
});

test('preserves private crowdsourcing state and the default deny', async () => {
  const aliceDb = environment.authenticatedContext('alice').firestore();

  await assertFails(getDoc(doc(aliceDb, 'crowdsourced_shared_event_candidates/private-1')));
  await assertFails(getDoc(doc(aliceDb, 'users/alice/crowdContributionDays/2026-08-29')));
  await assertFails(getDoc(doc(aliceDb, 'unknown_collection/private-1')));
});
