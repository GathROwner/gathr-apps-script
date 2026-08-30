import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';

import {
  acceptFriendRequest,
  blockUser,
  cancelFriendRequest,
  checkOut,
  claimSocialHandle,
  createCheckIn,
  declineFriendRequest,
  deleteSocialAccountData,
  enforceSocialRateLimit,
  removeFriend,
  reportUser,
  searchUserByHandle,
  sendFriendRequest,
  unblockUser,
} from './socialService.js';
import { recordCheckInEligibilitySample } from './checkInEligibility.js';
import {
  cancelFriendEvent,
  createFriendEvent,
  deleteFriendEvent,
  inviteToFriendEvent,
  removeFromFriendEvent,
  respondToFriendEvent,
  updateFriendEvent,
} from './friendEvents.js';
import { resolveFriendEventAddress } from './friendEventGeocoding.js';
import { SOCIAL_REGION, SocialDomainError } from './validation.js';

const options = {
  region: SOCIAL_REGION,
  timeoutSeconds: 30,
  memory: '256MiB' as const,
};

// Keep the deployment switch explicit: App Check enforcement must be enabled
// only after the matching iOS App Attest / Android Play Integrity client build
// is installed. Production Release 2 preflight requires this value to be true.
const releaseTwoOptions = {
  ...options,
  enforceAppCheck: process.env.SOCIAL_RELEASE_TWO_ENFORCE_APP_CHECK === 'true',
};
const friendEventGeocodingToken = defineSecret('FRIEND_EVENT_GEOCODING_TOKEN');
const friendEventOptions = {
  ...releaseTwoOptions,
  secrets: [friendEventGeocodingToken],
};

function requireUid(auth: { uid: string } | undefined): string {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to use social features.');
  return auth.uid;
}

function asData(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function rethrowSafe(error: unknown): never {
  if (error instanceof HttpsError) throw error;
  if (error instanceof SocialDomainError) {
    throw new HttpsError(error.code, error.message);
  }
  logger.error('Unhandled social callable error', {
    error_type: error instanceof Error ? error.name : 'unknown',
  });
  throw new HttpsError('internal', 'The social request could not be completed.');
}

async function run<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    return rethrowSafe(error);
  }
}

export const claimSocialHandleCallable = onCall(options, async (request) => {
  const uid = requireUid(request.auth);
  const data = asData(request.data);
  return run(async () => {
    await enforceSocialRateLimit(uid, 'claim_handle', 10, 60 * 60_000);
    return claimSocialHandle(uid, data.handle);
  });
});

export const searchUserByHandleCallable = onCall(options, async (request) => {
  const uid = requireUid(request.auth);
  const data = asData(request.data);
  return run(async () => {
    await enforceSocialRateLimit(uid, 'search_handle', 30, 60_000);
    return { user: await searchUserByHandle(uid, data.handle) };
  });
});

export const sendFriendRequestCallable = onCall(options, async (request) => {
  const uid = requireUid(request.auth);
  const data = asData(request.data);
  return run(async () => {
    await enforceSocialRateLimit(uid, 'friend_request', 20, 60 * 60_000);
    return sendFriendRequest(uid, data.targetUid);
  });
});

export const cancelFriendRequestCallable = onCall(options, async (request) => {
  const uid = requireUid(request.auth);
  const data = asData(request.data);
  return run(() => cancelFriendRequest(uid, data.otherUid));
});

export const acceptFriendRequestCallable = onCall(options, async (request) => {
  const uid = requireUid(request.auth);
  const data = asData(request.data);
  return run(() => acceptFriendRequest(uid, data.otherUid));
});

export const declineFriendRequestCallable = onCall(options, async (request) => {
  const uid = requireUid(request.auth);
  const data = asData(request.data);
  return run(() => declineFriendRequest(uid, data.otherUid));
});

export const removeFriendCallable = onCall(options, async (request) => {
  const uid = requireUid(request.auth);
  const data = asData(request.data);
  return run(() => removeFriend(uid, data.otherUid));
});

export const blockUserCallable = onCall(options, async (request) => {
  const uid = requireUid(request.auth);
  const data = asData(request.data);
  return run(() => blockUser(uid, data.blockedUid));
});

export const unblockUserCallable = onCall(options, async (request) => {
  const uid = requireUid(request.auth);
  const data = asData(request.data);
  return run(() => unblockUser(uid, data.blockedUid));
});

export const createCheckInCallable = onCall(options, async (request) => {
  const uid = requireUid(request.auth);
  const data = asData(request.data);
  return run(async () => {
    await enforceSocialRateLimit(uid, 'check_in', 20, 60 * 60_000);
    return createCheckIn(uid, {
      operationId: data.operationId,
      eligibilitySessionId: data.eligibilitySessionId,
      venueId: data.venueId,
      durationMinutes: data.durationMinutes,
      audienceMode: data.audienceMode,
      selectedUids: data.selectedUids,
      message: data.message,
    });
  });
});

export const recordCheckInEligibilitySampleCallable = onCall(releaseTwoOptions, async (request) => {
  const uid = requireUid(request.auth);
  const data = asData(request.data);
  return run(async () => {
    await enforceSocialRateLimit(uid, 'check_in_eligibility', 360, 60 * 60_000);
    return recordCheckInEligibilitySample(uid, {
      sessionId: data.sessionId,
      venueId: data.venueId,
      candidateVenueIds: data.candidateVenueIds,
      latitude: data.latitude,
      longitude: data.longitude,
      accuracyMeters: data.accuracyMeters,
      speedMetersPerSecond: data.speedMetersPerSecond,
    });
  });
});

export const createFriendEventCallable = onCall(friendEventOptions, async (request) => {
  const uid = requireUid(request.auth);
  const data = asData(request.data);
  return run(async () => {
    await enforceSocialRateLimit(uid, 'create_friend_event', 20, 24 * 60 * 60_000);
    const resolved = await resolveFriendEventAddress(
      data,
      friendEventGeocodingToken.value(),
      { allowTrustedCoordinates: process.env.FUNCTIONS_EMULATOR === 'true' }
    );
    return createFriendEvent(uid, resolved as unknown as Parameters<typeof createFriendEvent>[1]);
  });
});

export const geocodeFriendEventAddressCallable = onCall(friendEventOptions, async (request) => {
  const uid = requireUid(request.auth);
  const data = asData(request.data);
  return run(async () => {
    await enforceSocialRateLimit(uid, 'friend_event_geocode', 30, 60 * 60_000);
    const resolved = await resolveFriendEventAddress(
      { location: { type: 'custom_address', address: data.address } },
      friendEventGeocodingToken.value()
    );
    const location = asData(resolved.location);
    return { latitude: location.latitude, longitude: location.longitude };
  });
});

export const updateFriendEventCallable = onCall(friendEventOptions, async (request) => {
  const uid = requireUid(request.auth);
  const data = asData(request.data);
  return run(async () => {
    const resolved = await resolveFriendEventAddress(
      data,
      friendEventGeocodingToken.value(),
      { allowTrustedCoordinates: process.env.FUNCTIONS_EMULATOR === 'true' }
    );
    return updateFriendEvent(
      uid,
      resolved.eventId,
      resolved as unknown as Parameters<typeof updateFriendEvent>[2]
    );
  });
});

export const inviteToFriendEventCallable = onCall(releaseTwoOptions, async (request) => {
  const uid = requireUid(request.auth);
  const data = asData(request.data);
  return run(async () => {
    await enforceSocialRateLimit(uid, 'friend_event_invite', 60, 60 * 60_000);
    return inviteToFriendEvent(uid, data.eventId, data.targetUid);
  });
});

export const respondToFriendEventCallable = onCall(releaseTwoOptions, async (request) => {
  const uid = requireUid(request.auth);
  const data = asData(request.data);
  return run(() => respondToFriendEvent(uid, data.eventId, data.response));
});

export const removeFromFriendEventCallable = onCall(releaseTwoOptions, async (request) => {
  const uid = requireUid(request.auth);
  const data = asData(request.data);
  return run(() => removeFromFriendEvent(uid, data.eventId, data.memberUid));
});

export const cancelFriendEventCallable = onCall(releaseTwoOptions, async (request) => {
  const uid = requireUid(request.auth);
  const data = asData(request.data);
  return run(() => cancelFriendEvent(uid, data.eventId, undefined, undefined, data.reason));
});

export const deleteFriendEventCallable = onCall(releaseTwoOptions, async (request) => {
  const uid = requireUid(request.auth);
  const data = asData(request.data);
  return run(() => deleteFriendEvent(uid, data.eventId));
});

export const checkOutCallable = onCall(options, async (request) => {
  const uid = requireUid(request.auth);
  return run(() => checkOut(uid));
});

export const deleteSocialAccountDataCallable = onCall(options, async (request) => {
  const uid = requireUid(request.auth);
  return run(() => deleteSocialAccountData(uid));
});

export const reportUserCallable = onCall(options, async (request) => {
  const uid = requireUid(request.auth);
  const data = asData(request.data);
  return run(async () => {
    await enforceSocialRateLimit(uid, 'report_user', 10, 24 * 60 * 60_000);
    return reportUser(uid, data.reportedUid, data.reason);
  });
});
