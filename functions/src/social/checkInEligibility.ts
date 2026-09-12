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
export const CHECK_IN_HERE_TARGET_MS = 30_000;
export const CHECK_IN_PLACE_TARGET_MS = 90_000;
export const CHECK_IN_BASE_RADIUS_METRES = 50;
export const CHECK_IN_MAX_ACCURACY_METRES = 75;
export const CHECK_IN_MAX_SPEED_METRES_PER_SECOND = 10 / 3.6;
export const CHECK_IN_STATIONARY_MAX_SPEED_METRES_PER_SECOND = 1.1;
export const CHECK_IN_DRIVING_SPEED_METRES_PER_SECOND = 5;
export const CHECK_IN_DRIVING_COOLDOWN_MS = 30_000;
export const CHECK_IN_HERE_MAX_ACCURACY_METRES = 50;
export const CHECK_IN_PLACE_MAX_ACCURACY_METRES = 25;
export const CHECK_IN_STATIONARY_RADIUS_METRES = 20;
export const CHECK_IN_OUTSIDE_RESET_MS = 30_000;
export const CHECK_IN_SAMPLE_MAX_GAP_MS = 20_000;
export const CHECK_IN_SAMPLE_MAX_AGE_MS = 60_000;
export const CHECK_IN_SAMPLE_MAX_FUTURE_MS = 10_000;
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

export interface CheckInReadinessSampleInput {
  protocolVersion: unknown;
  reset: unknown;
  sessionId: unknown;
  sequence: unknown;
  latitude: unknown;
  longitude: unknown;
  accuracyMeters: unknown;
  speedMetersPerSecond?: unknown;
  capturedAtMs: unknown;
}

export type CheckInReadinessReason =
  | 'qualifying'
  | 'here_ready'
  | 'place_ready'
  | 'low_accuracy'
  | 'moving'
  | 'driving'
  | 'outside';

export interface CheckInReadinessResult {
  protocolVersion: 1;
  sessionId: string;
  sequence: number;
  hereQualifyingMs: number;
  placeQualifyingMs: number;
  hereRequiredMs: number;
  placeRequiredMs: number;
  hereReady: boolean;
  placeReady: boolean;
  reason: CheckInReadinessReason;
  expiresAt: Timestamp;
  expiresAtMs: number;
}

export interface BindCheckInReadinessInput {
  protocolVersion: unknown;
  readinessSessionId: unknown;
  operationId: unknown;
  venueId?: unknown;
  placeCandidateId?: unknown;
  latitude: unknown;
  longitude: unknown;
  accuracyMeters: unknown;
  speedMetersPerSecond?: unknown;
  capturedAtMs: unknown;
}

export interface BoundCheckInReadinessResult {
  protocolVersion: 1;
  eligibilitySessionId: string;
  readinessSessionId: string;
  venueId?: string;
  placeCandidateId?: string;
  locationType: 'gathr_venue' | 'external_place' | 'private_place';
  exactPrivateAllowed: boolean;
  expiresAt: Timestamp;
  expiresAtMs: number;
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

function integer(value: unknown, fieldName: string): number {
  const parsed = finiteNumber(value, fieldName);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new SocialDomainError('invalid-argument', `${fieldName} is invalid.`);
  }
  return parsed;
}

function requireProtocolV1(value: unknown): void {
  if (value !== 1) {
    throw new SocialDomainError('invalid-argument', 'Unsupported check-in readiness protocol.');
  }
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

function parseFreshSample(
  input: {
    latitude: unknown;
    longitude: unknown;
    accuracyMeters: unknown;
    speedMetersPerSecond?: unknown;
    capturedAtMs: unknown;
  },
  now: Timestamp
): {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  speedMetersPerSecond: number | null;
  capturedAtMs: number;
} {
  const latitude = parseLatitude(input.latitude);
  const longitude = parseLongitude(input.longitude);
  if (input.accuracyMeters === null || input.accuracyMeters === undefined) {
    throw new SocialDomainError('invalid-argument', 'accuracyMeters is invalid.');
  }
  const accuracyMeters = finiteNumber(input.accuracyMeters, 'accuracyMeters');
  const speedMetersPerSecond = input.speedMetersPerSecond === null
    || input.speedMetersPerSecond === undefined
    ? null
    : Math.max(0, finiteNumber(input.speedMetersPerSecond, 'speedMetersPerSecond'));
  const capturedAtMs = integer(input.capturedAtMs, 'capturedAtMs');
  if (accuracyMeters < 0) {
    throw new SocialDomainError('invalid-argument', 'accuracyMeters is invalid.');
  }
  const ageMs = now.toMillis() - capturedAtMs;
  if (ageMs > CHECK_IN_SAMPLE_MAX_AGE_MS || ageMs < -CHECK_IN_SAMPLE_MAX_FUTURE_MS) {
    throw new SocialDomainError('failed-precondition', 'Refresh your location and try again.');
  }
  return { latitude, longitude, accuracyMeters, speedMetersPerSecond, capturedAtMs };
}

function boolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new SocialDomainError('invalid-argument', `${fieldName} is invalid.`);
  }
  return value;
}

export function checkInEligibilitySessionId(uidValue: unknown, sessionIdValue: unknown): string {
  const uid = validateUid(uidValue, 'uid');
  const sessionId = validateSocialOperationId(sessionIdValue);
  return `${uid}_${sessionId}`;
}

function readinessResult(
  sessionId: string,
  sequence: number,
  hereQualifyingMsValue: number,
  placeQualifyingMsValue: number,
  reasonValue: CheckInReadinessReason,
  sessionExpiresAt: Timestamp,
  receiptExpiresAtMs: number
): CheckInReadinessResult {
  const hereQualifyingMs = Math.max(0, Math.min(hereQualifyingMsValue, CHECK_IN_HERE_TARGET_MS));
  const placeQualifyingMs = Math.max(0, Math.min(placeQualifyingMsValue, CHECK_IN_PLACE_TARGET_MS));
  const placeReady = placeQualifyingMs >= CHECK_IN_PLACE_TARGET_MS;
  const hereReady = hereQualifyingMs >= CHECK_IN_HERE_TARGET_MS;
  const reason = reasonValue === 'qualifying'
    ? placeReady
      ? 'place_ready'
      : hereReady
        ? 'here_ready'
        : 'qualifying'
    : reasonValue;
  return {
    protocolVersion: 1,
    sessionId,
    sequence,
    hereQualifyingMs,
    placeQualifyingMs,
    hereRequiredMs: CHECK_IN_HERE_TARGET_MS,
    placeRequiredMs: CHECK_IN_PLACE_TARGET_MS,
    hereReady,
    placeReady,
    reason,
    expiresAt: sessionExpiresAt,
    expiresAtMs: receiptExpiresAtMs,
  };
}

/**
 * Accrues short-lived, target-free readiness evidence. Exact coordinates are retained only in the
 * private server session so a later target can be spatially bound; they are never projected to
 * friends and the session is deleted by the existing TTL cleanup path.
 */
export async function recordCheckInReadinessSample(
  uidValue: unknown,
  input: CheckInReadinessSampleInput,
  db: Firestore = getFirestore(),
  now: Timestamp = Timestamp.now()
): Promise<CheckInReadinessResult> {
  requireProtocolV1(input.protocolVersion);
  const uid = validateUid(uidValue, 'uid');
  const resetRequested = boolean(input.reset, 'reset');
  const sessionId = validateSocialOperationId(input.sessionId);
  const sequence = integer(input.sequence, 'sequence');
  const sample = parseFreshSample(input, now);
  const sessionRef = db.collection('checkInEligibilitySessions')
    .doc(checkInEligibilitySessionId(uid, sessionId));
  const ownerRef = db.collection('checkInEligibilitySessions')
    .doc(`${uid}__readiness_owner`);

  return db.runTransaction(async (transaction) => {
    const [snapshot, ownerSnapshot] = await transaction.getAll(sessionRef, ownerRef);
    const previous = snapshot.data() || {};
    const owner = ownerSnapshot.data() || {};
    if (snapshot.exists && previous.uid !== uid) {
      throw new SocialDomainError('permission-denied', 'This check-in session is unavailable.');
    }
    if (snapshot.exists && previous.mode !== 'prequalification_v1') {
      throw new SocialDomainError('failed-precondition', 'Start a new check-in readiness session.');
    }
    if (previous.consumedAt || previous.boundAt) {
      throw new SocialDomainError('failed-precondition', 'This check-in readiness was already used.');
    }

    const nowMs = now.toMillis();
    const previousExpiryMs = timestampMillis(previous.expiresAt);
    const expired = previousExpiryMs === null || previousExpiryMs <= nowMs;
    const ownerExpiryMs = timestampMillis(owner.expiresAt);
    const ownerExpired = ownerExpiryMs === null || ownerExpiryMs <= nowMs;
    const activeSessionId = ownerExpired ? '' : String(owner.activeSessionId || '');
    if (activeSessionId && activeSessionId !== sessionId && snapshot.exists && !expired) {
      throw new SocialDomainError('failed-precondition', 'Start a new check-in readiness session.');
    }
    const continuing = snapshot.exists && !expired && (!activeSessionId || activeSessionId === sessionId);
    const previousSequence = continuing ? Number(previous.sequence ?? -1) : -1;
    if (continuing && sequence <= previousSequence) {
      throw new SocialDomainError('failed-precondition', 'This location sample was already recorded.');
    }

    let anchorLatitude = continuing && !resetRequested
      ? parseLatitude(previous.anchorLatitude)
      : sample.latitude;
    let anchorLongitude = continuing && !resetRequested
      ? parseLongitude(previous.anchorLongitude)
      : sample.longitude;
    let hereQualifyingMs = continuing && !resetRequested
      ? Math.max(0, Number(previous.hereQualifyingMs) || 0)
      : 0;
    let placeQualifyingMs = continuing && !resetRequested
      ? Math.max(0, Number(previous.placeQualifyingMs) || 0)
      : 0;
    const lastSeenMs = continuing && !resetRequested ? timestampMillis(previous.lastSeenAt) : null;
    const lastCapturedAtMs = continuing && !resetRequested
      ? Number(previous.lastCapturedAtMs)
      : Number.NaN;
    const previousLatitude = continuing && !resetRequested
      ? Number(previous.lastLatitude)
      : Number.NaN;
    const previousLongitude = continuing && !resetRequested
      ? Number(previous.lastLongitude)
      : Number.NaN;
    const previousAccuracy = continuing && !resetRequested
      ? Number(previous.lastAccuracyMeters)
      : Number.NaN;
    let drivingSuppressedUntilMs = ownerExpired
      ? null
      : timestampMillis(owner.drivingSuppressedUntilAt);
    const distanceFromAnchor = distanceMetres(
      sample.latitude,
      sample.longitude,
      anchorLatitude,
      anchorLongitude
    );
    const accurateHere = sample.accuracyMeters <= CHECK_IN_HERE_MAX_ACCURACY_METRES;
    const accuratePlace = sample.accuracyMeters <= CHECK_IN_PLACE_MAX_ACCURACY_METRES;
    const driving = sample.speedMetersPerSecond !== null
      && sample.speedMetersPerSecond >= CHECK_IN_DRIVING_SPEED_METRES_PER_SECOND;
    if (driving) drivingSuppressedUntilMs = nowMs + CHECK_IN_DRIVING_COOLDOWN_MS;
    const drivingSuppressed = drivingSuppressedUntilMs !== null
      && drivingSuppressedUntilMs > nowMs;
    const previousPositionIsValid = Number.isFinite(previousLatitude)
      && Number.isFinite(previousLongitude);
    const stableUnknownSpeed = sample.speedMetersPerSecond === null
      && previousPositionIsValid
      && distanceMetres(sample.latitude, sample.longitude, previousLatitude, previousLongitude)
        <= CHECK_IN_STATIONARY_RADIUS_METRES;
    const stationary = sample.speedMetersPerSecond === null
      ? stableUnknownSpeed
      : sample.speedMetersPerSecond <= CHECK_IN_STATIONARY_MAX_SPEED_METRES_PER_SECOND;
    const inside = accurateHere && distanceFromAnchor <= CHECK_IN_STATIONARY_RADIUS_METRES;
    let reason: CheckInReadinessReason;
    if (!accurateHere) reason = 'low_accuracy';
    else if (driving || drivingSuppressed) reason = 'driving';
    else if (!stationary) reason = 'moving';
    else if (!inside) reason = 'outside';
    else reason = 'qualifying';

    if (reason === 'driving') {
      hereQualifyingMs = 0;
      placeQualifyingMs = 0;
      anchorLatitude = sample.latitude;
      anchorLongitude = sample.longitude;
    } else if (reason === 'qualifying') {
      const captureGapMs = Number.isFinite(lastCapturedAtMs)
        ? sample.capturedAtMs - lastCapturedAtMs
        : 0;
      const serverGapMs = lastSeenMs === null ? 0 : nowMs - lastSeenMs;
      const validGap = captureGapMs > 0
        && captureGapMs <= CHECK_IN_SAMPLE_MAX_GAP_MS
        && serverGapMs >= 0
        && serverGapMs <= CHECK_IN_SAMPLE_MAX_GAP_MS;
      if (!validGap && lastSeenMs !== null) {
        hereQualifyingMs = 0;
        placeQualifyingMs = 0;
        anchorLatitude = sample.latitude;
        anchorLongitude = sample.longitude;
      }
      if (validGap) {
        const creditMs = Math.min(captureGapMs, serverGapMs);
        hereQualifyingMs += creditMs;
        if (accuratePlace && previousAccuracy <= CHECK_IN_PLACE_MAX_ACCURACY_METRES) {
          placeQualifyingMs += creditMs;
        } else {
          placeQualifyingMs = 0;
        }
      }
    } else {
      hereQualifyingMs = 0;
      placeQualifyingMs = 0;
      anchorLatitude = sample.latitude;
      anchorLongitude = sample.longitude;
    }

    hereQualifyingMs = Math.min(hereQualifyingMs, CHECK_IN_HERE_TARGET_MS);
    placeQualifyingMs = Math.min(placeQualifyingMs, CHECK_IN_PLACE_TARGET_MS);
    const expiresAt = Timestamp.fromMillis(nowMs + CHECK_IN_SESSION_TTL_MS);
    const receiptExpiresAtMs = nowMs + CHECK_IN_SAMPLE_MAX_GAP_MS;
    transaction.set(sessionRef, {
      uid,
      sessionId,
      protocolVersion: 1,
      mode: 'prequalification_v1',
      sequence,
      qualifyingMs: placeQualifyingMs,
      hereQualifyingMs,
      placeQualifyingMs,
      anchorLatitude,
      anchorLongitude,
      lastLatitude: sample.latitude,
      lastLongitude: sample.longitude,
      lastAccuracyMeters: sample.accuracyMeters,
      lastSpeedMetersPerSecond: sample.speedMetersPerSecond,
      lastCapturedAtMs: sample.capturedAtMs,
      lastSeenAt: now,
      interruptedSinceAt: reason === 'qualifying' ? null : now,
      drivingSuppressedUntilAt: drivingSuppressedUntilMs === null
        ? null
        : Timestamp.fromMillis(drivingSuppressedUntilMs),
      accuracyBucket: sample.accuracyMeters <= CHECK_IN_MAX_ACCURACY_METRES
        ? accuracyBucket(sample.accuracyMeters)
        : 'over-75m',
      hereReady: hereQualifyingMs >= CHECK_IN_HERE_TARGET_MS,
      placeReady: placeQualifyingMs >= CHECK_IN_PLACE_TARGET_MS,
      expiresAt,
      updatedAt: now,
      createdAt: expired || !previous.createdAt ? now : previous.createdAt,
    });
    transaction.set(ownerRef, {
      uid,
      mode: 'prequalification_owner_v1',
      activeSessionId: sessionId,
      drivingSuppressedUntilAt: drivingSuppressedUntilMs === null
        ? null
        : Timestamp.fromMillis(drivingSuppressedUntilMs),
      expiresAt,
      updatedAt: now,
      createdAt: owner.createdAt || now,
    });
    return readinessResult(
      sessionId,
      sequence,
      hereQualifyingMs,
      placeQualifyingMs,
      reason,
      expiresAt,
      receiptExpiresAtMs
    );
  });
}

export async function bindCheckInReadiness(
  uidValue: unknown,
  input: BindCheckInReadinessInput,
  db: Firestore = getFirestore(),
  now: Timestamp = Timestamp.now()
): Promise<BoundCheckInReadinessResult> {
  requireProtocolV1(input.protocolVersion);
  const uid = validateUid(uidValue, 'uid');
  const readinessSessionId = validateSocialOperationId(input.readinessSessionId);
  const operationId = validateSocialOperationId(input.operationId);
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
  const sample = parseFreshSample(input, now);
  const sessionRef = db.collection('checkInEligibilitySessions')
    .doc(checkInEligibilitySessionId(uid, readinessSessionId));
  const ownerRef = db.collection('checkInEligibilitySessions')
    .doc(`${uid}__readiness_owner`);
  const locationRef = venueId
    ? db.collection('venues').doc(venueId)
    : db.collection('checkInPlaceCandidates').doc(placeCandidateId);

  return db.runTransaction(async (transaction) => {
    const [locationSnapshot, sessionSnapshot, ownerSnapshot] = await transaction.getAll(
      locationRef,
      sessionRef,
      ownerRef
    );
    if (!sessionSnapshot.exists) {
      throw new SocialDomainError('failed-precondition', 'Stay nearby before choosing a check-in place.');
    }
    const session = sessionSnapshot.data() || {};
    const owner = ownerSnapshot.data() || {};
    if (session.uid !== uid || session.mode !== 'prequalification_v1') {
      throw new SocialDomainError('permission-denied', 'This check-in readiness is unavailable.');
    }
    if (owner.uid !== uid || owner.mode !== 'prequalification_owner_v1'
      || owner.activeSessionId !== readinessSessionId
      || !(owner.expiresAt instanceof Timestamp)
      || owner.expiresAt.toMillis() <= now.toMillis()) {
      throw new SocialDomainError('failed-precondition', 'This check-in readiness is no longer current.');
    }
    const nowMs = now.toMillis();
    const expiresAtMs = timestampMillis(session.expiresAt);
    if (expiresAtMs === null || expiresAtMs <= nowMs || session.consumedAt) {
      throw new SocialDomainError('failed-precondition', 'This check-in readiness expired. Stay nearby again.');
    }
    const candidatePlace = placeCandidateId
      ? validateCheckInPlaceCandidate(locationSnapshot.data() || {}, uid, placeCandidateId, now)
      : null;
    if (venueId && !locationSnapshot.exists) {
      throw new SocialDomainError('not-found', 'This venue is not currently available for check-in.');
    }
    const venue = locationSnapshot.data() || {};
    const targetLatitude = candidatePlace?.latitude ?? parseLatitude(venue.latitude);
    const targetLongitude = candidatePlace?.longitude ?? parseLongitude(venue.longitude);
    const locationKey = candidatePlace?.locationKey || `venue:${venueId}`;
    const locationType = candidatePlace?.type || 'gathr_venue';
    const bindingKey = `${locationType}:${locationKey}`;
    if (session.boundAt) {
      if (session.bindOperationId !== operationId || session.bindingKey !== bindingKey) {
        throw new SocialDomainError('failed-precondition', 'This readiness was already used for another place.');
      }
      const completedExpiresAt = session.completedExpiresAt;
      if (!(completedExpiresAt instanceof Timestamp) || completedExpiresAt.toMillis() <= nowMs) {
        throw new SocialDomainError('failed-precondition', 'This check-in readiness expired. Stay nearby again.');
      }
      return {
        protocolVersion: 1,
        eligibilitySessionId: readinessSessionId,
        readinessSessionId,
        ...(venueId ? { venueId } : {}),
        ...(placeCandidateId ? { placeCandidateId } : {}),
        locationType,
        exactPrivateAllowed: session.exactPrivateAllowed === true,
        expiresAt: completedExpiresAt,
        expiresAtMs: completedExpiresAt.toMillis(),
      };
    }
    const lastSeenAtMs = timestampMillis(session.lastSeenAt);
    const drivingSuppressedUntilMs = timestampMillis(owner.drivingSuppressedUntilAt);
    if (
      lastSeenAtMs === null
      || nowMs - lastSeenAtMs > CHECK_IN_SAMPLE_MAX_AGE_MS
      || (drivingSuppressedUntilMs !== null && drivingSuppressedUntilMs > nowMs)
    ) {
      throw new SocialDomainError('failed-precondition', 'This check-in readiness expired. Stay nearby again.');
    }
    const privatePlace = locationType === 'private_place';
    const hereQualifyingMs = Math.max(0, Number(session.hereQualifyingMs) || 0);
    const placeQualifyingMs = Math.max(0, Number(session.placeQualifyingMs) || 0);
    const requiredMs = privatePlace ? CHECK_IN_HERE_TARGET_MS : CHECK_IN_PLACE_TARGET_MS;
    const qualifyingMs = privatePlace ? hereQualifyingMs : placeQualifyingMs;
    if (qualifyingMs < requiredMs) {
      throw new SocialDomainError('failed-precondition', 'Stay nearby a little longer before checking in here.');
    }
    const requiredAccuracy = privatePlace
      ? CHECK_IN_HERE_MAX_ACCURACY_METRES
      : CHECK_IN_PLACE_MAX_ACCURACY_METRES;
    const accurate = sample.accuracyMeters <= requiredAccuracy
      && Number(session.lastAccuracyMeters) <= requiredAccuracy;
    const evidenceDistance = distanceMetres(
      sample.latitude,
      sample.longitude,
      parseLatitude(session.lastLatitude),
      parseLongitude(session.lastLongitude)
    );
    const stationary = sample.speedMetersPerSecond === null
      ? evidenceDistance <= CHECK_IN_STATIONARY_RADIUS_METRES
      : sample.speedMetersPerSecond <= CHECK_IN_STATIONARY_MAX_SPEED_METRES_PER_SECOND;
    const notDriving = sample.speedMetersPerSecond === null
      || sample.speedMetersPerSecond < CHECK_IN_DRIVING_SPEED_METRES_PER_SECOND;
    const anchorDistance = distanceMetres(
      parseLatitude(session.anchorLatitude),
      parseLongitude(session.anchorLongitude),
      targetLatitude,
      targetLongitude
    );
    const sampleDistance = distanceMetres(
      sample.latitude,
      sample.longitude,
      targetLatitude,
      targetLongitude
    );
    const allowedDistance = CHECK_IN_BASE_RADIUS_METRES
      + Math.max(sample.accuracyMeters, Number(session.lastAccuracyMeters) || 0);
    if (!accurate || !stationary || !notDriving
      || evidenceDistance > CHECK_IN_STATIONARY_RADIUS_METRES
      || anchorDistance > allowedDistance || sampleDistance > allowedDistance) {
      throw new SocialDomainError('failed-precondition', 'Your location no longer matches this check-in place.');
    }
    const completedExpiresAt = Timestamp.fromMillis(nowMs + CHECK_IN_COMPLETION_TTL_MS);
    const exactPrivateAllowed = privatePlace
      && placeQualifyingMs >= CHECK_IN_PLACE_TARGET_MS
      && sample.accuracyMeters <= CHECK_IN_PLACE_MAX_ACCURACY_METRES
      && Number(session.lastAccuracyMeters) <= CHECK_IN_PLACE_MAX_ACCURACY_METRES;
    transaction.update(sessionRef, {
      boundAt: now,
      bindOperationId: operationId,
      bindingKey,
      ...(venueId ? { venueId } : {}),
      ...(placeCandidateId ? { placeCandidateId } : {}),
      locationKey,
      locationType,
      eligible: true,
      eligibilityLevel: placeQualifyingMs >= CHECK_IN_PLACE_TARGET_MS ? 'place' : 'here',
      exactPrivateAllowed,
      completedAt: now,
      completedExpiresAt,
      expiresAt: completedExpiresAt,
      updatedAt: now,
    });
    return {
      protocolVersion: 1,
      eligibilitySessionId: readinessSessionId,
      readinessSessionId,
      ...(venueId ? { venueId } : {}),
      ...(placeCandidateId ? { placeCandidateId } : {}),
      locationType,
      exactPrivateAllowed,
      expiresAt: completedExpiresAt,
      expiresAtMs: completedExpiresAt.toMillis(),
    };
  });
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
  target: {
    venueId?: string;
    placeCandidateId?: string;
    locationKey: string;
    locationType?: 'gathr_venue' | 'external_place' | 'private_place';
    shareExactLocation?: boolean;
  },
  now: Timestamp
): void {
  const completedExpiresAt = session.completedExpiresAt;
  const prequalified = session.mode === 'prequalification_v1';
  const prequalifiedLevelAllowed = !prequalified
    || (
      target.locationType === 'private_place'
      && target.shareExactLocation !== true
      && (session.eligibilityLevel === 'here' || session.eligibilityLevel === 'place')
    )
    || (
      session.eligibilityLevel === 'place'
      && (
        target.locationType !== 'private_place'
        || target.shareExactLocation !== true
        || session.exactPrivateAllowed === true
      )
    );
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
    || !prequalifiedLevelAllowed
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
