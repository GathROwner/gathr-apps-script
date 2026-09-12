import {
  Timestamp,
  getFirestore,
  type DocumentData,
  type Firestore,
} from 'firebase-admin/firestore';

import {
  SocialDomainError,
  validateSocialOperationId,
  validateUid,
  validateVenueId,
} from './validation.js';
import { validateCheckInPlaceCandidate } from './nearbyCheckInPlaces.js';

export const CHECK_IN_DWELL_TARGET_MS = 90_000;
export const CHECK_IN_BASE_RADIUS_METRES = 50;
export const CHECK_IN_MAX_ACCURACY_METRES = 75;
export const CHECK_IN_MAX_SPEED_METRES_PER_SECOND = 10 / 3.6;
export const CHECK_IN_OUTSIDE_RESET_MS = 30_000;
export const CHECK_IN_SAMPLE_MAX_GAP_MS = 20_000;
export const CHECK_IN_COMPLETION_TTL_MS = 5 * 60_000;
export const CHECK_IN_SESSION_TTL_MS = 10 * 60_000;

export interface CheckInEligibilitySampleInput {
  sessionId: unknown;
  venueId?: unknown;
  placeCandidateId?: unknown;
  candidateVenueIds?: unknown;
  latitude: unknown;
  longitude: unknown;
  accuracyMeters: unknown;
  speedMetersPerSecond?: unknown;
}

export interface CheckInEligibilityResult {
  sessionId: string;
  venueId?: string;
  placeCandidateId?: string;
  locationKey: string;
  eligibleVenueIds: string[];
  eligible: boolean;
  qualifyingMs: number;
  requiredMs: number;
  remainingMs: number;
  distanceMetres: number;
  reason: 'qualifying' | 'eligible' | 'outside' | 'low_accuracy' | 'moving_too_fast';
  expiresAt: Timestamp;
}

function parseCandidateVenueIds(value: unknown, primaryVenueId: string): string[] {
  const values = Array.isArray(value) ? value : [];
  if (values.length > 3) {
    throw new SocialDomainError('invalid-argument', 'Too many nearby venue candidates.');
  }
  const venueIds = [...new Set([
    primaryVenueId,
    ...values.map((candidate) => validateVenueId(candidate)),
  ])];
  if (venueIds.length > 4) {
    throw new SocialDomainError('invalid-argument', 'Too many nearby venue candidates.');
  }
  return venueIds;
}

function finiteNumber(value: unknown, fieldName: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new SocialDomainError('invalid-argument', `${fieldName} is invalid.`);
  }
  return parsed;
}

function parseLatitude(value: unknown): number {
  const parsed = finiteNumber(value, 'latitude');
  if (parsed < -90 || parsed > 90) {
    throw new SocialDomainError('invalid-argument', 'latitude is invalid.');
  }
  return parsed;
}

function parseLongitude(value: unknown): number {
  const parsed = finiteNumber(value, 'longitude');
  if (parsed < -180 || parsed > 180) {
    throw new SocialDomainError('invalid-argument', 'longitude is invalid.');
  }
  return parsed;
}

function distanceMetres(
  firstLatitude: number,
  firstLongitude: number,
  secondLatitude: number,
  secondLongitude: number
): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const earthRadiusMetres = 6_371_000;
  const latitudeDelta = radians(secondLatitude - firstLatitude);
  const longitudeDelta = radians(secondLongitude - firstLongitude);
  const firstLatitudeRadians = radians(firstLatitude);
  const secondLatitudeRadians = radians(secondLatitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitudeRadians)
    * Math.cos(secondLatitudeRadians)
    * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMetres * Math.asin(Math.sqrt(haversine));
}

function accuracyBucket(accuracyMeters: number): string {
  if (accuracyMeters <= 10) return '0-10m';
  if (accuracyMeters <= 25) return '11-25m';
  if (accuracyMeters <= 50) return '26-50m';
  return '51-75m';
}

function timestampMillis(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null;
}

export function checkInEligibilitySessionId(uidValue: unknown, sessionIdValue: unknown): string {
  const uid = validateUid(uidValue, 'uid');
  const sessionId = validateSocialOperationId(sessionIdValue);
  return `${uid}_${sessionId}`;
}

export async function recordCheckInEligibilitySample(
  uidValue: unknown,
  input: CheckInEligibilitySampleInput,
  db: Firestore = getFirestore(),
  now: Timestamp = Timestamp.now()
): Promise<CheckInEligibilityResult> {
  const uid = validateUid(uidValue, 'uid');
  const sessionId = validateSocialOperationId(input.sessionId);
  const hasVenueId = input.venueId !== undefined && input.venueId !== null && input.venueId !== '';
  const hasPlaceCandidateId = input.placeCandidateId !== undefined
    && input.placeCandidateId !== null
    && input.placeCandidateId !== '';
  if (hasVenueId === hasPlaceCandidateId) {
    throw new SocialDomainError('invalid-argument', 'Choose one check-in place.');
  }
  const venueId = hasVenueId ? validateVenueId(input.venueId) : '';
  const placeCandidateId = hasPlaceCandidateId
    ? validateSocialOperationId(input.placeCandidateId)
    : '';
  const candidateVenueIds = venueId
    ? parseCandidateVenueIds(input.candidateVenueIds, venueId)
    : [];
  const sampleLatitude = parseLatitude(input.latitude);
  const sampleLongitude = parseLongitude(input.longitude);
  const sampleAccuracy = finiteNumber(input.accuracyMeters, 'accuracyMeters');
  const sampleSpeed = input.speedMetersPerSecond === null
    || input.speedMetersPerSecond === undefined
    ? 0
    : Math.max(0, finiteNumber(input.speedMetersPerSecond, 'speedMetersPerSecond'));
  if (sampleAccuracy < 0) {
    throw new SocialDomainError('invalid-argument', 'accuracyMeters is invalid.');
  }

  const venueRefs = candidateVenueIds.map((candidateVenueId) =>
    db.collection('venues').doc(candidateVenueId)
  );
  const placeCandidateRef = placeCandidateId
    ? db.collection('checkInPlaceCandidates').doc(placeCandidateId)
    : null;
  const sessionRef = db
    .collection('checkInEligibilitySessions')
    .doc(checkInEligibilitySessionId(uid, sessionId));

  return db.runTransaction(async (transaction) => {
    const snapshots = await transaction.getAll(
      ...venueRefs,
      ...(placeCandidateRef ? [placeCandidateRef] : []),
      sessionRef
    );
    const venueSnapshots = snapshots.slice(0, venueRefs.length);
    const venueSnapshot = venueSnapshots[0];
    const placeCandidateSnapshot = placeCandidateRef ? snapshots[venueRefs.length] : null;
    const sessionSnapshot = snapshots[snapshots.length - 1];
    if (venueId && !venueSnapshot?.exists) {
      throw new SocialDomainError('not-found', 'This venue is not currently available for check-in.');
    }
    const venue = venueSnapshot?.data() || {};
    const candidatePlace = placeCandidateId
      ? validateCheckInPlaceCandidate(
        placeCandidateSnapshot?.data() || {},
        uid,
        placeCandidateId,
        now
      )
      : null;
    const targetLatitude = candidatePlace?.latitude ?? parseLatitude(venue.latitude);
    const targetLongitude = candidatePlace?.longitude ?? parseLongitude(venue.longitude);
    const locationKey = candidatePlace?.locationKey || `venue:${venueId}`;
    const candidateDistances = venueSnapshots.map((snapshot, index) => {
      if (!snapshot.exists) return null;
      const candidate = snapshot.data() || {};
      return {
        venueId: candidateVenueIds[index],
        distance: distanceMetres(
          sampleLatitude,
          sampleLongitude,
          parseLatitude(candidate.latitude),
          parseLongitude(candidate.longitude)
        ),
      };
    }).filter((candidate): candidate is { venueId: string; distance: number } => candidate !== null);
    const previous = sessionSnapshot.data() || {};
    if (sessionSnapshot.exists && previous.uid !== uid) {
      throw new SocialDomainError('permission-denied', 'This check-in session is unavailable.');
    }
    const previousLocationKey = typeof previous.locationKey === 'string'
      ? previous.locationKey
      : previous.venueId ? `venue:${previous.venueId}` : '';
    if (sessionSnapshot.exists && previousLocationKey !== locationKey) {
      throw new SocialDomainError('failed-precondition', 'Start a new check-in session for this venue.');
    }
    if (previous.consumedAt) {
      throw new SocialDomainError('failed-precondition', 'This check-in session was already used.');
    }

    const nowMs = now.toMillis();
    const previousExpiryMs = timestampMillis(previous.expiresAt);
    const expired = previousExpiryMs !== null && previousExpiryMs <= nowMs;
    const previousCompletedExpiryMs = timestampMillis(previous.completedExpiresAt);
    if (
      previous.eligible === true
      && previousCompletedExpiryMs !== null
      && previousCompletedExpiryMs > nowMs
    ) {
      return {
        sessionId,
        ...(venueId ? { venueId } : {}),
        ...(placeCandidateId ? { placeCandidateId } : {}),
        locationKey,
        eligibleVenueIds: Array.isArray(previous.eligibleVenueIds)
          ? previous.eligibleVenueIds.map((candidate: unknown) => validateVenueId(candidate))
          : venueId ? [venueId] : [],
        eligible: true,
        qualifyingMs: CHECK_IN_DWELL_TARGET_MS,
        requiredMs: CHECK_IN_DWELL_TARGET_MS,
        remainingMs: 0,
        distanceMetres: 0,
        reason: 'eligible',
        expiresAt: Timestamp.fromMillis(previousCompletedExpiryMs),
      };
    }

    const distance = distanceMetres(
      sampleLatitude,
      sampleLongitude,
      targetLatitude,
      targetLongitude
    );
    const accurate = sampleAccuracy <= CHECK_IN_MAX_ACCURACY_METRES;
    const stationaryEnough = sampleSpeed <= CHECK_IN_MAX_SPEED_METRES_PER_SECOND;
    const inside = accurate && distance <= CHECK_IN_BASE_RADIUS_METRES + sampleAccuracy;
    const eligibleVenueIds = accurate && stationaryEnough
      ? candidateDistances
        .filter((candidate) => candidate.distance <= CHECK_IN_BASE_RADIUS_METRES + sampleAccuracy)
        .map((candidate) => candidate.venueId)
      : [];
    const lastSeenMs = expired ? null : timestampMillis(previous.lastSeenAt);
    const priorOutsideSinceMs = expired ? null : timestampMillis(previous.outsideSinceAt);
    let qualifyingMs = expired ? 0 : Math.max(0, Number(previous.qualifyingMs) || 0);
    let qualifyingStartedAt = expired ? null : previous.qualifyingStartedAt;
    let outsideSinceAt: Timestamp | null = priorOutsideSinceMs === null
      ? null
      : Timestamp.fromMillis(priorOutsideSinceMs);

    let reason: CheckInEligibilityResult['reason'];
    if (!accurate) reason = 'low_accuracy';
    else if (!stationaryEnough) reason = 'moving_too_fast';
    else if (!inside) reason = 'outside';
    else reason = 'qualifying';

    if (reason === 'qualifying') {
      const gapMs = lastSeenMs === null ? 0 : Math.max(0, nowMs - lastSeenMs);
      if (
        priorOutsideSinceMs !== null
        && nowMs - priorOutsideSinceMs >= CHECK_IN_OUTSIDE_RESET_MS
      ) {
        qualifyingMs = 0;
        qualifyingStartedAt = now;
      } else if (!qualifyingStartedAt) {
        qualifyingStartedAt = now;
      }
      qualifyingMs += Math.min(gapMs, CHECK_IN_SAMPLE_MAX_GAP_MS);
      outsideSinceAt = null;
    } else {
      outsideSinceAt = outsideSinceAt || now;
      if (nowMs - outsideSinceAt.toMillis() >= CHECK_IN_OUTSIDE_RESET_MS) {
        qualifyingMs = 0;
        qualifyingStartedAt = null;
      }
    }

    const eligible = qualifyingMs >= CHECK_IN_DWELL_TARGET_MS;
    const completedExpiresAt = eligible
      ? Timestamp.fromMillis(nowMs + CHECK_IN_COMPLETION_TTL_MS)
      : null;
    const expiresAt = completedExpiresAt
      || Timestamp.fromMillis(nowMs + CHECK_IN_SESSION_TTL_MS);
    transaction.set(sessionRef, {
      uid,
      sessionId,
      ...(venueId ? { venueId } : {}),
      ...(placeCandidateId ? { placeCandidateId } : {}),
      locationKey,
      eligibleVenueIds: eligible ? eligibleVenueIds : [],
      eligible,
      qualifyingMs: Math.min(qualifyingMs, CHECK_IN_DWELL_TARGET_MS),
      qualifyingStartedAt: qualifyingStartedAt || null,
      lastSeenAt: now,
      outsideSinceAt,
      completedAt: eligible ? now : null,
      completedExpiresAt,
      accuracyBucket: accurate ? accuracyBucket(sampleAccuracy) : 'over-75m',
      expiresAt,
      updatedAt: now,
      createdAt: previous.createdAt || now,
    });

    return {
      sessionId,
      ...(venueId ? { venueId } : {}),
      ...(placeCandidateId ? { placeCandidateId } : {}),
      locationKey,
      eligibleVenueIds: eligible ? eligibleVenueIds : [],
      eligible,
      qualifyingMs: Math.min(qualifyingMs, CHECK_IN_DWELL_TARGET_MS),
      requiredMs: CHECK_IN_DWELL_TARGET_MS,
      remainingMs: Math.max(0, CHECK_IN_DWELL_TARGET_MS - qualifyingMs),
      distanceMetres: Math.round(distance),
      reason: eligible ? 'eligible' : reason,
      expiresAt,
    };
  });
}

export async function cleanupExpiredCheckInEligibilitySessions(
  now: Timestamp = Timestamp.now(),
  db: Firestore = getFirestore(),
  limit = 200
): Promise<{ cleaned: number }> {
  const snapshot = await db
    .collection('checkInEligibilitySessions')
    .where('expiresAt', '<=', now)
    .limit(Math.max(1, Math.min(limit, 400)))
    .get();
  if (snapshot.empty) return { cleaned: 0 };
  const batch = db.batch();
  snapshot.docs.forEach((document) => batch.delete(document.ref));
  await batch.commit();
  return { cleaned: snapshot.size };
}

export function assertCompletedCheckInEligibility(
  session: DocumentData,
  uid: string,
  target: { venueId?: string; placeCandidateId?: string; locationKey: string },
  now: Timestamp
): void {
  const completedExpiresAt = session.completedExpiresAt;
  if (
    session.uid !== uid
    || !(
      session.locationKey === target.locationKey
      || (
        target.venueId
        && session.venueId === target.venueId
      )
      || (
        target.venueId
        && Array.isArray(session.eligibleVenueIds)
        && session.eligibleVenueIds.includes(target.venueId)
      )
      || (
        target.placeCandidateId
        && session.placeCandidateId === target.placeCandidateId
      )
    )
    || session.eligible !== true
    || !(completedExpiresAt instanceof Timestamp)
    || completedExpiresAt.toMillis() <= now.toMillis()
    || session.consumedAt
  ) {
    throw new SocialDomainError(
      'failed-precondition',
      'Remain near this venue until check-in becomes available.'
    );
  }
}
