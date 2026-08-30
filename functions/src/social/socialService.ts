import { createHash, randomUUID } from 'node:crypto';

import {
  FieldValue,
  Timestamp,
  getFirestore,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';

import {
  CHECK_IN_MAX_VIEWERS,
  ParsedAudience,
  SocialDomainError,
  normalizeCheckInMessage,
  normalizeSocialHandle,
  otherMember,
  parseAudience,
  parseCheckInDuration,
  relationshipIdFor,
  validateSocialHandle,
  validateSocialOperationId,
  validateUid,
  validateVenueId,
} from './validation.js';
import {
  assertCompletedCheckInEligibility,
  checkInEligibilitySessionId,
} from './checkInEligibility.js';

const COLLECTIONS = {
  ACTIVE_CHECK_INS: 'activeCheckIns',
  HANDLES: 'socialHandles',
  RATE_LIMITS: 'socialRateLimits',
  RELATIONSHIPS: 'socialRelationships',
  REPORTS: 'userReports',
  OPERATIONS: 'socialOperations',
  USERS: 'users',
  VENUES: 'venues',
} as const;

const USER_SUBCOLLECTIONS = {
  BLOCKS: 'blocks',
  FRIENDS: 'friends',
  FRIEND_ACTIVITY: 'friendActivity',
  FRIEND_REQUESTS: 'friendRequests',
} as const;

export interface SafeProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  socialHandle: string;
}

export interface CheckInInput {
  operationId?: unknown;
  eligibilitySessionId?: unknown;
  venueId: unknown;
  durationMinutes: unknown;
  audienceMode: unknown;
  selectedUids?: unknown;
  message?: unknown;
}

export interface RelationshipResult {
  state: 'accepted' | 'pending';
  otherUid: string;
}

function firestore(): Firestore {
  return getFirestore();
}

function text(value: unknown, maxLength = 200): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function safeProfile(uid: string, data: DocumentData | undefined): SafeProfile {
  return {
    uid,
    displayName: text(data?.displayName, 80) || 'GathR user',
    photoURL: text(data?.photoURL, 2_000),
    socialHandle: normalizeSocialHandle(data?.socialHandle),
  };
}

function assertExisting(snapshot: DocumentSnapshot, label: string): DocumentData {
  if (!snapshot.exists) {
    throw new SocialDomainError('not-found', `${label} was not found.`);
  }
  return snapshot.data() || {};
}

function userRef(db: Firestore, uid: string) {
  return db.collection(COLLECTIONS.USERS).doc(uid);
}

function relationshipRef(db: Firestore, firstUid: string, secondUid: string) {
  return db.collection(COLLECTIONS.RELATIONSHIPS).doc(relationshipIdFor(firstUid, secondUid));
}

function friendRef(db: Firestore, ownerUid: string, friendUid: string) {
  return userRef(db, ownerUid).collection(USER_SUBCOLLECTIONS.FRIENDS).doc(friendUid);
}

function requestRef(db: Firestore, ownerUid: string, otherUid: string) {
  return userRef(db, ownerUid).collection(USER_SUBCOLLECTIONS.FRIEND_REQUESTS).doc(otherUid);
}

function blockRef(db: Firestore, ownerUid: string, blockedUid: string) {
  return userRef(db, ownerUid).collection(USER_SUBCOLLECTIONS.BLOCKS).doc(blockedUid);
}

function activityRef(db: Firestore, viewerUid: string, ownerUid: string) {
  return userRef(db, viewerUid).collection(USER_SUBCOLLECTIONS.FRIEND_ACTIVITY).doc(ownerUid);
}

function activeCheckInRef(db: Firestore, ownerUid: string) {
  return db.collection(COLLECTIONS.ACTIVE_CHECK_INS).doc(ownerUid);
}

function socialOperationRef(db: Firestore, uid: string, operationId: string) {
  const documentId = createHash('sha256')
    .update(`${uid}\0${operationId}`)
    .digest('hex');
  return db.collection(COLLECTIONS.OPERATIONS).doc(documentId);
}

function revokeViewerFromCheckIn(
  transaction: Transaction,
  checkInSnapshot: DocumentSnapshot,
  viewerUid: string
) {
  if (!checkInSnapshot.exists) return;
  const data = checkInSnapshot.data() || {};
  const viewerUids = Array.isArray(data.viewerUids)
    ? data.viewerUids.map((value: unknown) => validateUid(value, 'viewerUid'))
    : [];
  if (!viewerUids.includes(viewerUid)) return;
  const remaining = viewerUids.filter((uid: string) => uid !== viewerUid);
  transaction.update(checkInSnapshot.ref, {
    viewerUids: remaining,
    viewerCount: remaining.length,
  });
}

function relationshipMembers(data: DocumentData, firstUid: string, secondUid: string): boolean {
  if (!Array.isArray(data.members) || data.members.length !== 2) return false;
  const members = new Set(data.members.map((value: unknown) => text(value, 128)));
  return members.has(firstUid) && members.has(secondUid);
}

function acceptedFriendProjection(profile: SafeProfile, acceptedAt: unknown): DocumentData {
  return {
    ...profile,
    acceptedAt,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function requestProjection(
  profile: SafeProfile,
  direction: 'incoming' | 'outgoing',
  requestedAt: unknown
): DocumentData {
  return {
    ...profile,
    direction,
    requestedAt,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

export async function enforceSocialRateLimit(
  uidValue: unknown,
  action: string,
  maxRequests: number,
  windowMs: number,
  db = firestore()
): Promise<void> {
  const uid = validateUid(uidValue);
  const safeAction = action.replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
  if (!safeAction || maxRequests < 1 || windowMs < 1_000) {
    throw new Error('Invalid social rate-limit configuration.');
  }
  const ref = db.collection(COLLECTIONS.RATE_LIMITS).doc(`${uid}_${safeAction}`);
  const now = Timestamp.now();
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() || {};
    const windowStartedAt = data.windowStartedAt as Timestamp | undefined;
    const inCurrentWindow =
      windowStartedAt instanceof Timestamp &&
      now.toMillis() - windowStartedAt.toMillis() < windowMs;
    const nextCount = inCurrentWindow ? Number(data.count || 0) + 1 : 1;
    if (nextCount > maxRequests) {
      throw new SocialDomainError('resource-exhausted', 'Please wait before trying again.');
    }
    transaction.set(ref, {
      uid,
      action: safeAction,
      count: nextCount,
      windowStartedAt: inCurrentWindow ? windowStartedAt : now,
      expiresAt: Timestamp.fromMillis(now.toMillis() + windowMs * 2),
    });
  });
}

export async function claimSocialHandle(
  uidValue: unknown,
  handleValue: unknown,
  db = firestore()
): Promise<SafeProfile> {
  const uid = validateUid(uidValue);
  const socialHandle = validateSocialHandle(handleValue);
  const handleRef = db.collection(COLLECTIONS.HANDLES).doc(socialHandle);
  const ownerRef = userRef(db, uid);

  return db.runTransaction(async (transaction) => {
    const [ownerSnapshot, handleSnapshot] = await transaction.getAll(ownerRef, handleRef);
    const ownerData = assertExisting(ownerSnapshot, 'User profile');
    const existingOwnerUid = text(handleSnapshot.data()?.uid, 128);
    if (existingOwnerUid && existingOwnerUid !== uid) {
      throw new SocialDomainError('already-exists', 'That handle is already taken.');
    }

    const previousHandle = normalizeSocialHandle(ownerData.socialHandle);
    if (previousHandle && previousHandle !== socialHandle) {
      const previousRef = db.collection(COLLECTIONS.HANDLES).doc(previousHandle);
      const previousSnapshot = await transaction.get(previousRef);
      if (text(previousSnapshot.data()?.uid, 128) === uid) {
        transaction.delete(previousRef);
      }
    }

    transaction.set(handleRef, {
      uid,
      socialHandle,
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(ownerRef, {
      socialHandle,
      socialHandleNormalized: socialHandle,
      socialHandleUpdatedAt: FieldValue.serverTimestamp(),
    });

    return safeProfile(uid, { ...ownerData, socialHandle });
  });
}

export async function searchUserByHandle(
  requesterUidValue: unknown,
  handleValue: unknown,
  db = firestore()
): Promise<SafeProfile | null> {
  const requesterUid = validateUid(requesterUidValue, 'requesterUid');
  const socialHandle = validateSocialHandle(handleValue);
  const handleSnapshot = await db.collection(COLLECTIONS.HANDLES).doc(socialHandle).get();
  const foundUid = text(handleSnapshot.data()?.uid, 128);
  if (!foundUid || foundUid === requesterUid) return null;

  const [profileSnapshot, requesterBlock, foundBlock] = await db.getAll(
    userRef(db, foundUid),
    blockRef(db, requesterUid, foundUid),
    blockRef(db, foundUid, requesterUid)
  );
  if (!profileSnapshot.exists || requesterBlock.exists || foundBlock.exists) return null;
  return safeProfile(foundUid, profileSnapshot.data());
}

export async function sendFriendRequest(
  requesterUidValue: unknown,
  targetUidValue: unknown,
  db = firestore()
): Promise<RelationshipResult> {
  const requesterUid = validateUid(requesterUidValue, 'requesterUid');
  const targetUid = validateUid(targetUidValue, 'targetUid');
  if (requesterUid === targetUid) {
    throw new SocialDomainError('invalid-argument', 'You cannot add yourself as a friend.');
  }
  const relRef = relationshipRef(db, requesterUid, targetUid);
  const requesterRef = userRef(db, requesterUid);
  const targetRef = userRef(db, targetUid);

  return db.runTransaction(async (transaction) => {
    const [requesterSnapshot, targetSnapshot, relSnapshot, requesterBlock, targetBlock] =
      await transaction.getAll(
        requesterRef,
        targetRef,
        relRef,
        blockRef(db, requesterUid, targetUid),
        blockRef(db, targetUid, requesterUid)
      );
    const requesterData = assertExisting(requesterSnapshot, 'Your user profile');
    const targetData = assertExisting(targetSnapshot, 'User profile');
    if (requesterBlock.exists || targetBlock.exists) {
      throw new SocialDomainError('permission-denied', 'This friend request is unavailable.');
    }

    const now = Timestamp.now();
    const relationship = relSnapshot.data() || {};
    if (relSnapshot.exists && relationship.status === 'accepted') {
      if (!relationshipMembers(relationship, requesterUid, targetUid)) {
        throw new SocialDomainError('failed-precondition', 'Friendship record is invalid.');
      }
      return { state: 'accepted', otherUid: targetUid };
    }

    const requesterProfile = safeProfile(requesterUid, requesterData);
    const targetProfile = safeProfile(targetUid, targetData);
    if (relSnapshot.exists && relationship.status === 'pending') {
      if (!relationshipMembers(relationship, requesterUid, targetUid)) {
        throw new SocialDomainError('failed-precondition', 'Friend request record is invalid.');
      }
      if (text(relationship.requestedBy, 128) === targetUid) {
        transaction.set(relRef, {
          members: [requesterUid, targetUid].sort(),
          status: 'accepted',
          requestedBy: targetUid,
          createdAt: relationship.createdAt || now,
          updatedAt: now,
          acceptedAt: now,
        });
        transaction.delete(requestRef(db, requesterUid, targetUid));
        transaction.delete(requestRef(db, targetUid, requesterUid));
        transaction.set(friendRef(db, requesterUid, targetUid), acceptedFriendProjection(targetProfile, now));
        transaction.set(friendRef(db, targetUid, requesterUid), acceptedFriendProjection(requesterProfile, now));
        return { state: 'accepted', otherUid: targetUid };
      }
      return { state: 'pending', otherUid: targetUid };
    }

    transaction.set(relRef, {
      members: [requesterUid, targetUid].sort(),
      status: 'pending',
      requestedBy: requesterUid,
      createdAt: now,
      updatedAt: now,
    });
    transaction.set(
      requestRef(db, requesterUid, targetUid),
      requestProjection(targetProfile, 'outgoing', now)
    );
    transaction.set(
      requestRef(db, targetUid, requesterUid),
      requestProjection(requesterProfile, 'incoming', now)
    );
    return { state: 'pending', otherUid: targetUid };
  });
}

async function resolvePendingRequest(
  actorUidValue: unknown,
  otherUidValue: unknown,
  action: 'accept' | 'decline' | 'cancel',
  db = firestore()
): Promise<{ state: 'accepted' | 'removed'; otherUid: string }> {
  const actorUid = validateUid(actorUidValue, 'actorUid');
  const otherUid = validateUid(otherUidValue, 'otherUid');
  const relRef = relationshipRef(db, actorUid, otherUid);

  return db.runTransaction(async (transaction) => {
    const [actorSnapshot, otherSnapshot, relSnapshot, actorBlock, otherBlock] =
      await transaction.getAll(
        userRef(db, actorUid),
        userRef(db, otherUid),
        relRef,
        blockRef(db, actorUid, otherUid),
        blockRef(db, otherUid, actorUid)
      );
    const actorData = assertExisting(actorSnapshot, 'Your user profile');
    const otherData = assertExisting(otherSnapshot, 'User profile');
    if (actorBlock.exists || otherBlock.exists) {
      throw new SocialDomainError('permission-denied', 'This friend request is unavailable.');
    }
    if (!relSnapshot.exists) {
      transaction.delete(requestRef(db, actorUid, otherUid));
      transaction.delete(requestRef(db, otherUid, actorUid));
      return { state: 'removed', otherUid };
    }
    const relationship = relSnapshot.data() || {};
    if (
      action === 'accept' &&
      relationship.status === 'accepted' &&
      relationshipMembers(relationship, actorUid, otherUid)
    ) {
      return { state: 'accepted', otherUid };
    }
    if (relationship.status !== 'pending' || !relationshipMembers(relationship, actorUid, otherUid)) {
      throw new SocialDomainError('failed-precondition', 'Friend request is no longer pending.');
    }
    const requestedBy = text(relationship.requestedBy, 128);
    if (action === 'cancel' && requestedBy !== actorUid) {
      throw new SocialDomainError('permission-denied', 'Only the sender can cancel this request.');
    }
    if ((action === 'accept' || action === 'decline') && requestedBy === actorUid) {
      throw new SocialDomainError('permission-denied', 'Only the recipient can respond to this request.');
    }

    transaction.delete(requestRef(db, actorUid, otherUid));
    transaction.delete(requestRef(db, otherUid, actorUid));
    if (action !== 'accept') {
      transaction.delete(relRef);
      return { state: 'removed', otherUid };
    }

    const now = Timestamp.now();
    transaction.set(relRef, {
      ...relationship,
      members: [actorUid, otherUid].sort(),
      status: 'accepted',
      updatedAt: now,
      acceptedAt: now,
    });
    transaction.set(
      friendRef(db, actorUid, otherUid),
      acceptedFriendProjection(safeProfile(otherUid, otherData), now)
    );
    transaction.set(
      friendRef(db, otherUid, actorUid),
      acceptedFriendProjection(safeProfile(actorUid, actorData), now)
    );
    return { state: 'accepted', otherUid };
  });
}

export function acceptFriendRequest(actorUid: unknown, otherUid: unknown, db = firestore()) {
  return resolvePendingRequest(actorUid, otherUid, 'accept', db);
}

export function declineFriendRequest(actorUid: unknown, otherUid: unknown, db = firestore()) {
  return resolvePendingRequest(actorUid, otherUid, 'decline', db);
}

export function cancelFriendRequest(actorUid: unknown, otherUid: unknown, db = firestore()) {
  return resolvePendingRequest(actorUid, otherUid, 'cancel', db);
}

export async function removeFriend(
  actorUidValue: unknown,
  otherUidValue: unknown,
  db = firestore()
): Promise<{ removed: true; otherUid: string }> {
  const actorUid = validateUid(actorUidValue, 'actorUid');
  const otherUid = validateUid(otherUidValue, 'otherUid');
  const relRef = relationshipRef(db, actorUid, otherUid);
  await db.runTransaction(async (transaction) => {
    const [relSnapshot, actorCheckIn, otherCheckIn] = await transaction.getAll(
      relRef,
      activeCheckInRef(db, actorUid),
      activeCheckInRef(db, otherUid)
    );
    const relationship = relSnapshot.data() || {};
    if (relSnapshot.exists && (
      relationship.status !== 'accepted' ||
      !relationshipMembers(relationship, actorUid, otherUid)
    )) {
      throw new SocialDomainError('failed-precondition', 'You are not friends.');
    }
    transaction.delete(relRef);
    transaction.delete(friendRef(db, actorUid, otherUid));
    transaction.delete(friendRef(db, otherUid, actorUid));
    transaction.delete(requestRef(db, actorUid, otherUid));
    transaction.delete(requestRef(db, otherUid, actorUid));
    transaction.delete(activityRef(db, actorUid, otherUid));
    transaction.delete(activityRef(db, otherUid, actorUid));
    revokeViewerFromCheckIn(transaction, actorCheckIn, otherUid);
    revokeViewerFromCheckIn(transaction, otherCheckIn, actorUid);
  });
  return { removed: true, otherUid };
}

export async function blockUser(
  actorUidValue: unknown,
  blockedUidValue: unknown,
  db = firestore()
): Promise<{ blocked: true; blockedUid: string }> {
  const actorUid = validateUid(actorUidValue, 'actorUid');
  const blockedUid = validateUid(blockedUidValue, 'blockedUid');
  if (actorUid === blockedUid) {
    throw new SocialDomainError('invalid-argument', 'You cannot block yourself.');
  }
  await db.runTransaction(async (transaction) => {
    const [blockedSnapshot, actorCheckIn, blockedCheckIn] = await transaction.getAll(
      userRef(db, blockedUid),
      activeCheckInRef(db, actorUid),
      activeCheckInRef(db, blockedUid)
    );
    const blockedProfile = safeProfile(
      blockedUid,
      assertExisting(blockedSnapshot, 'User profile')
    );
    transaction.set(blockRef(db, actorUid, blockedUid), {
      ownerUid: actorUid,
      blockedUid,
      displayName: blockedProfile.displayName,
      photoURL: blockedProfile.photoURL,
      socialHandle: blockedProfile.socialHandle,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.delete(relationshipRef(db, actorUid, blockedUid));
    transaction.delete(friendRef(db, actorUid, blockedUid));
    transaction.delete(friendRef(db, blockedUid, actorUid));
    transaction.delete(requestRef(db, actorUid, blockedUid));
    transaction.delete(requestRef(db, blockedUid, actorUid));
    transaction.delete(activityRef(db, actorUid, blockedUid));
    transaction.delete(activityRef(db, blockedUid, actorUid));
    revokeViewerFromCheckIn(transaction, actorCheckIn, blockedUid);
    revokeViewerFromCheckIn(transaction, blockedCheckIn, actorUid);
  });
  return { blocked: true, blockedUid };
}

export async function unblockUser(
  actorUidValue: unknown,
  blockedUidValue: unknown,
  db = firestore()
): Promise<{ blocked: false; blockedUid: string }> {
  const actorUid = validateUid(actorUidValue, 'actorUid');
  const blockedUid = validateUid(blockedUidValue, 'blockedUid');
  await blockRef(db, actorUid, blockedUid).delete();
  return { blocked: false, blockedUid };
}

async function candidateAudienceUids(
  db: Firestore,
  ownerUid: string,
  audience: ParsedAudience
): Promise<string[]> {
  if (audience.mode === 'selected_friends') {
    if (audience.selectedUids.includes(ownerUid)) {
      throw new SocialDomainError('invalid-argument', 'You cannot share a check-in with yourself.');
    }
    return audience.selectedUids;
  }
  const snapshot = await userRef(db, ownerUid).collection(USER_SUBCOLLECTIONS.FRIENDS).get();
  if (snapshot.size > CHECK_IN_MAX_VIEWERS) {
    throw new SocialDomainError(
      'resource-exhausted',
      `Check-ins currently support up to ${CHECK_IN_MAX_VIEWERS} friends.`
    );
  }
  return snapshot.docs.map((document) => document.id).sort();
}

export async function createCheckIn(
  ownerUidValue: unknown,
  input: CheckInInput,
  db = firestore()
): Promise<DocumentData> {
  const ownerUid = validateUid(ownerUidValue, 'ownerUid');
  const venueId = validateVenueId(input.venueId);
  const durationMinutes = parseCheckInDuration(input.durationMinutes);
  const audience = parseAudience(input.audienceMode, input.selectedUids);
  const message = normalizeCheckInMessage(input.message);
  const operationId = validateSocialOperationId(input.operationId ?? randomUUID());
  const eligibilitySessionId = validateSocialOperationId(input.eligibilitySessionId);
  const inputHash = createHash('sha256').update(JSON.stringify({
    venueId,
    durationMinutes,
    audience,
    message,
    eligibilitySessionId,
  })).digest('hex');
  const candidates = await candidateAudienceUids(db, ownerUid, audience);
  const relRefs = candidates.map((uid) => relationshipRef(db, ownerUid, uid));
  const ownerBlockRefs = candidates.map((uid) => blockRef(db, ownerUid, uid));
  const viewerBlockRefs = candidates.map((uid) => blockRef(db, uid, ownerUid));
  const ownerProfileRef = userRef(db, ownerUid);
  const venueRef = db.collection(COLLECTIONS.VENUES).doc(venueId);
  const checkInRef = activeCheckInRef(db, ownerUid);
  const operationRef = socialOperationRef(db, ownerUid, operationId);
  const eligibilityRef = db.collection('checkInEligibilitySessions').doc(
    checkInEligibilitySessionId(ownerUid, eligibilitySessionId)
  );
  const createdAt = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(
    createdAt.toMillis() + durationMinutes * 60_000
  );
  const revision = randomUUID();

  return db.runTransaction(async (transaction) => {
    const baseSnapshots = await transaction.getAll(
      ownerProfileRef,
      venueRef,
      checkInRef,
      operationRef,
      eligibilityRef
    );
    const previousOperation = baseSnapshots[3].data() || {};
    if (baseSnapshots[3].exists) {
      if (
        previousOperation.action !== 'create_check_in'
        || previousOperation.inputHash !== inputHash
        || !previousOperation.result
      ) {
        throw new SocialDomainError(
          'failed-precondition',
          'This social operation ID was already used for another request.'
        );
      }
      return previousOperation.result as DocumentData;
    }
    const ownerData = assertExisting(baseSnapshots[0], 'Your user profile');
    const venueData = assertExisting(baseSnapshots[1], 'Venue');
    const eligibilityData = assertExisting(baseSnapshots[4], 'Check-in eligibility');
    assertCompletedCheckInEligibility(eligibilityData, ownerUid, venueId, createdAt);
    if (venueData.socialVenueMirrorSource === 'gathr-event-api') {
      const mirrorExpiresAt = venueData.socialVenueMirrorExpiresAt;
      if (!(mirrorExpiresAt instanceof Timestamp) || mirrorExpiresAt.toMillis() <= createdAt.toMillis()) {
        throw new SocialDomainError(
          'failed-precondition',
          'This venue is not currently available for check-in.'
        );
      }
    }
    const previousCheckIn = baseSnapshots[2].data() || {};
    const relationshipSnapshots = relRefs.length
      ? await transaction.getAll(...relRefs)
      : [];
    const ownerBlocks = ownerBlockRefs.length
      ? await transaction.getAll(...ownerBlockRefs)
      : [];
    const viewerBlocks = viewerBlockRefs.length
      ? await transaction.getAll(...viewerBlockRefs)
      : [];

    const viewerUids = candidates.filter((candidateUid, index) => {
      const relationship = relationshipSnapshots[index]?.data() || {};
      return (
        relationshipSnapshots[index]?.exists === true &&
        relationship.status === 'accepted' &&
        relationshipMembers(relationship, ownerUid, candidateUid) &&
        !ownerBlocks[index]?.exists &&
        !viewerBlocks[index]?.exists
      );
    });
    if (audience.mode === 'selected_friends' && viewerUids.length !== candidates.length) {
      throw new SocialDomainError(
        'failed-precondition',
        'One or more selected people are no longer eligible to see this check-in.'
      );
    }

    const ownerProfile = safeProfile(ownerUid, ownerData);
    const venueName =
      text(venueData.pagename, 120) ||
      text(venueData.title, 120) ||
      text(venueData.name, 120) ||
      'GathR venue';
    const previousViewerUids = Array.isArray(previousCheckIn.viewerUids)
      ? previousCheckIn.viewerUids.map((uid: unknown) => validateUid(uid, 'viewerUid'))
      : [];

    for (const previousViewerUid of previousViewerUids) {
      transaction.delete(activityRef(db, previousViewerUid, ownerUid));
    }

    const checkIn = {
      ownerUid,
      venueId,
      venueLocationKey: `venue:${venueId}`,
      venueNameSnapshot: venueName,
      audienceMode: audience.mode,
      selectedUids: audience.mode === 'selected_friends' ? audience.selectedUids : [],
      viewerUids,
      viewerCount: viewerUids.length,
      message,
      createdAt,
      expiresAt,
      durationMinutes,
      revision,
    };
    transaction.set(checkInRef, checkIn);
    transaction.update(eligibilityRef, {
      consumedAt: createdAt,
      consumedCheckInRevision: revision,
    });
    for (const viewerUid of viewerUids) {
      transaction.set(activityRef(db, viewerUid, ownerUid), {
        ownerUid,
        displayName: ownerProfile.displayName,
        photoURL: ownerProfile.photoURL,
        socialHandle: ownerProfile.socialHandle,
        venueId,
        venueLocationKey: `venue:${venueId}`,
        venueName,
        message,
        createdAt,
        expiresAt,
        revision,
      });
    }
    transaction.set(operationRef, {
      uid: ownerUid,
      action: 'create_check_in',
      inputHash,
      result: checkIn,
      createdAt,
      expiresAt: Timestamp.fromMillis(createdAt.toMillis() + 24 * 60 * 60_000),
    });
    return checkIn;
  });
}

export async function checkOut(
  ownerUidValue: unknown,
  db = firestore()
): Promise<{ checkedOut: true; removedViewerCount: number }> {
  const ownerUid = validateUid(ownerUidValue, 'ownerUid');
  const ref = activeCheckInRef(db, ownerUid);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return { checkedOut: true, removedViewerCount: 0 };
    const data = snapshot.data() || {};
    const viewerUids = Array.isArray(data.viewerUids)
      ? data.viewerUids.map((uid: unknown) => validateUid(uid, 'viewerUid'))
      : [];
    for (const viewerUid of viewerUids) {
      transaction.delete(activityRef(db, viewerUid, ownerUid));
    }
    transaction.delete(ref);
    return { checkedOut: true, removedViewerCount: viewerUids.length };
  });
}

export async function cleanupExpiredCheckIns(
  now = Timestamp.now(),
  db = firestore(),
  limit = 100
): Promise<{ cleaned: number; projectionsDeleted: number }> {
  const snapshot = await db
    .collection(COLLECTIONS.ACTIVE_CHECK_INS)
    .where('expiresAt', '<=', now)
    .limit(Math.max(1, Math.min(limit, 200)))
    .get();
  let cleaned = 0;
  let projectionsDeleted = 0;
  for (const candidate of snapshot.docs) {
    const result = await db.runTransaction(async (transaction) => {
      const current = await transaction.get(candidate.ref);
      const data = current.data() || {};
      const expiresAt = data.expiresAt as Timestamp | undefined;
      if (!(expiresAt instanceof Timestamp) || expiresAt.toMillis() > now.toMillis()) {
        return 0;
      }
      const ownerUid = validateUid(data.ownerUid || current.id, 'ownerUid');
      const viewerUids = Array.isArray(data.viewerUids)
        ? data.viewerUids.map((uid: unknown) => validateUid(uid, 'viewerUid'))
        : [];
      for (const viewerUid of viewerUids) {
        transaction.delete(activityRef(db, viewerUid, ownerUid));
      }
      transaction.delete(candidate.ref);
      return viewerUids.length;
    });
    cleaned += 1;
    projectionsDeleted += result;
  }
  return { cleaned, projectionsDeleted };
}

export async function cleanupExpiredSocialOperations(
  now = Timestamp.now(),
  db = firestore(),
  limit = 200
): Promise<{ cleaned: number }> {
  const snapshot = await db
    .collection(COLLECTIONS.OPERATIONS)
    .where('expiresAt', '<=', now)
    .limit(Math.max(1, Math.min(limit, 400)))
    .get();
  if (snapshot.empty) return { cleaned: 0 };
  const batch = db.batch();
  for (const operation of snapshot.docs) batch.delete(operation.ref);
  await batch.commit();
  return { cleaned: snapshot.size };
}

export async function cleanupExpiredSocialRateLimits(
  now = Timestamp.now(),
  db = firestore(),
  limit = 200
): Promise<{ cleaned: number }> {
  const snapshot = await db
    .collection(COLLECTIONS.RATE_LIMITS)
    .where('expiresAt', '<=', now)
    .limit(Math.max(1, Math.min(limit, 400)))
    .get();
  if (snapshot.empty) return { cleaned: 0 };
  const batch = db.batch();
  for (const rateLimit of snapshot.docs) batch.delete(rateLimit.ref);
  await batch.commit();
  return { cleaned: snapshot.size };
}

async function deleteKnownUserSocialCollections(db: Firestore, uid: string): Promise<number> {
  let deleted = 0;
  for (const collectionName of Object.values(USER_SUBCOLLECTIONS)) {
    while (true) {
      const snapshot = await userRef(db, uid).collection(collectionName).limit(400).get();
      if (snapshot.empty) break;
      const batch = db.batch();
      for (const document of snapshot.docs) batch.delete(document.ref);
      await batch.commit();
      deleted += snapshot.size;
    }
  }
  return deleted;
}

export async function deleteSocialAccountData(
  uidValue: unknown,
  db = firestore()
): Promise<{
  relationshipsDeleted: number;
  projectionsDeleted: number;
  incomingBlocksDeleted: number;
  handleReleased: boolean;
}> {
  const uid = validateUid(uidValue);
  await checkOut(uid, db);
  const [
    relationshipsSnapshot,
    visibleCheckInsSnapshot,
    incomingBlocksSnapshot,
    rateLimitsSnapshot,
    ownedHandlesSnapshot,
    operationsSnapshot,
  ] = await Promise.all([
    db.collection(COLLECTIONS.RELATIONSHIPS).where('members', 'array-contains', uid).get(),
    db.collection(COLLECTIONS.ACTIVE_CHECK_INS).where('viewerUids', 'array-contains', uid).get(),
    db.collectionGroup(USER_SUBCOLLECTIONS.BLOCKS).where('blockedUid', '==', uid).get(),
    db.collection(COLLECTIONS.RATE_LIMITS).where('uid', '==', uid).get(),
    db.collection(COLLECTIONS.HANDLES).where('uid', '==', uid).get(),
    db.collection(COLLECTIONS.OPERATIONS).where('uid', '==', uid).get(),
  ]);
  for (const relationshipSnapshot of relationshipsSnapshot.docs) {
    const data = relationshipSnapshot.data();
    const otherUid = otherMember(data.members, uid);
    const batch = db.batch();
    batch.delete(relationshipSnapshot.ref);
    batch.delete(friendRef(db, uid, otherUid));
    batch.delete(friendRef(db, otherUid, uid));
    batch.delete(requestRef(db, uid, otherUid));
    batch.delete(requestRef(db, otherUid, uid));
    batch.delete(activityRef(db, uid, otherUid));
    batch.delete(activityRef(db, otherUid, uid));
    await batch.commit();
  }
  for (const checkInSnapshot of visibleCheckInsSnapshot.docs) {
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(checkInSnapshot.ref);
      if (!current.exists) return;
      const data = current.data() || {};
      const viewerUids = Array.isArray(data.viewerUids)
        ? data.viewerUids.map((value: unknown) => validateUid(value, 'viewerUid'))
        : [];
      if (!viewerUids.includes(uid)) return;
      transaction.update(checkInSnapshot.ref, {
        viewerUids: viewerUids.filter((viewerUid: string) => viewerUid !== uid),
        viewerCount: Math.max(0, viewerUids.length - 1),
      });
      transaction.delete(activityRef(db, uid, checkInSnapshot.id));
    });
  }
  for (let index = 0; index < incomingBlocksSnapshot.docs.length; index += 400) {
    const batch = db.batch();
    for (const document of incomingBlocksSnapshot.docs.slice(index, index + 400)) {
      batch.delete(document.ref);
    }
    await batch.commit();
  }
  for (let index = 0; index < rateLimitsSnapshot.docs.length; index += 400) {
    const batch = db.batch();
    for (const document of rateLimitsSnapshot.docs.slice(index, index + 400)) {
      batch.delete(document.ref);
    }
    await batch.commit();
  }
  for (let index = 0; index < operationsSnapshot.docs.length; index += 400) {
    const batch = db.batch();
    for (const document of operationsSnapshot.docs.slice(index, index + 400)) {
      batch.delete(document.ref);
    }
    await batch.commit();
  }
  let handleReleased = ownedHandlesSnapshot.size > 0;
  for (let index = 0; index < ownedHandlesSnapshot.docs.length; index += 400) {
    const batch = db.batch();
    for (const document of ownedHandlesSnapshot.docs.slice(index, index + 400)) {
      batch.delete(document.ref);
    }
    await batch.commit();
  }
  const projectionsDeleted = await deleteKnownUserSocialCollections(db, uid);
  return {
    relationshipsDeleted: relationshipsSnapshot.size,
    projectionsDeleted,
    incomingBlocksDeleted: incomingBlocksSnapshot.size,
    handleReleased,
  };
}

export async function syncSocialProfileProjections(
  uidValue: unknown,
  db = firestore()
): Promise<{ projectionsUpdated: number }> {
  const uid = validateUid(uidValue);
  const [profileSnapshot, relationshipsSnapshot] = await Promise.all([
    userRef(db, uid).get(),
    db.collection(COLLECTIONS.RELATIONSHIPS).where('members', 'array-contains', uid).get(),
  ]);
  if (!profileSnapshot.exists) return { projectionsUpdated: 0 };
  const profile = safeProfile(uid, profileSnapshot.data());
  const writes: Array<{ ref: DocumentReference; data: DocumentData }> = [];

  for (const relationshipSnapshot of relationshipsSnapshot.docs) {
    const relationship = relationshipSnapshot.data();
    const otherUid = otherMember(relationship.members, uid);
    if (relationship.status === 'accepted') {
      writes.push({
        ref: friendRef(db, otherUid, uid),
        data: acceptedFriendProjection(profile, relationship.acceptedAt),
      });
    } else if (relationship.status === 'pending') {
      writes.push({
        ref: requestRef(db, otherUid, uid),
        data: requestProjection(
          profile,
          text(relationship.requestedBy, 128) === uid ? 'incoming' : 'outgoing',
          relationship.createdAt
        ),
      });
    }
  }

  for (let index = 0; index < writes.length; index += 400) {
    const batch = db.batch();
    for (const write of writes.slice(index, index + 400)) batch.set(write.ref, write.data);
    await batch.commit();
  }
  return { projectionsUpdated: writes.length };
}

export async function reportUser(
  reporterUidValue: unknown,
  reportedUidValue: unknown,
  reasonValue: unknown,
  db = firestore()
): Promise<{ reportId: string }> {
  const reporterUid = validateUid(reporterUidValue, 'reporterUid');
  const reportedUid = validateUid(reportedUidValue, 'reportedUid');
  if (reporterUid === reportedUid) {
    throw new SocialDomainError('invalid-argument', 'You cannot report yourself.');
  }
  const allowedReasons = new Set(['harassment', 'impersonation', 'privacy', 'spam', 'other']);
  const reason = text(reasonValue, 30).toLowerCase();
  if (!allowedReasons.has(reason)) {
    throw new SocialDomainError('invalid-argument', 'Report reason is invalid.');
  }
  const reportedSnapshot = await userRef(db, reportedUid).get();
  assertExisting(reportedSnapshot, 'User profile');
  const day = new Date().toISOString().slice(0, 10);
  const reportId = createHash('sha256')
    .update(`${reporterUid}\0${reportedUid}\0${reason}\0${day}`)
    .digest('hex');
  const ref = db.collection(COLLECTIONS.REPORTS).doc(reportId);
  await ref.set({
    reporterUid,
    reportedUid,
    reason,
    status: 'open',
    createdAt: FieldValue.serverTimestamp(),
    lastSubmittedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { reportId };
}
