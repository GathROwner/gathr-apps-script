import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import {
  cleanupExpiredCheckIns,
  cleanupExpiredSocialOperations,
  cleanupExpiredSocialRateLimits,
} from './socialService.js';
import { cleanupExpiredCheckInEligibilitySessions } from './checkInEligibility.js';
import { cleanupExpiredCheckInPlaceCandidates } from './nearbyCheckInPlaces.js';
import { markEndedFriendEvents, revealDueFriendEventLocations } from './friendEvents.js';
import { SOCIAL_REGION } from './validation.js';

export const scheduledSocialCheckInCleanup = onSchedule(
  {
    region: SOCIAL_REGION,
    schedule: 'every 5 minutes',
    timeZone: 'America/Halifax',
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async () => {
    const [checkIns, eligibilitySessions, placeCandidates, addressReveals, endedEvents, operations, rateLimits] = await Promise.all([
      cleanupExpiredCheckIns(),
      cleanupExpiredCheckInEligibilitySessions(),
      cleanupExpiredCheckInPlaceCandidates(),
      revealDueFriendEventLocations(),
      markEndedFriendEvents(),
      cleanupExpiredSocialOperations(),
      cleanupExpiredSocialRateLimits(),
    ]);
    logger.info('Expired social records cleaned', {
      checkIns,
      eligibilitySessions,
      placeCandidates,
      addressReveals,
      endedEvents,
      operations,
      rateLimits,
    });
  }
);
