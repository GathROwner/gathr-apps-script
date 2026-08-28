import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import {
  cleanupExpiredCheckIns,
  cleanupExpiredSocialOperations,
  cleanupExpiredSocialRateLimits,
} from './socialService.js';
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
    const [checkIns, operations, rateLimits] = await Promise.all([
      cleanupExpiredCheckIns(),
      cleanupExpiredSocialOperations(),
      cleanupExpiredSocialRateLimits(),
    ]);
    logger.info('Expired social records cleaned', { checkIns, operations, rateLimits });
  }
);
