import { logger } from 'firebase-functions';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';

import { SOCIAL_REGION } from './validation.js';
import { syncSocialProfileProjections } from './socialService.js';

function safeProfileFields(data: Record<string, unknown> | undefined) {
  return {
    displayName: typeof data?.displayName === 'string' ? data.displayName : '',
    photoURL: typeof data?.photoURL === 'string' ? data.photoURL : '',
    socialHandle: typeof data?.socialHandle === 'string' ? data.socialHandle : '',
  };
}

export const syncSocialProfileOnUpdate = onDocumentUpdated(
  {
    document: 'users/{uid}',
    region: SOCIAL_REGION,
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (event) => {
    const before = safeProfileFields(event.data?.before.data());
    const after = safeProfileFields(event.data?.after.data());
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const result = await syncSocialProfileProjections(event.params.uid);
    logger.info('Social profile projections synchronized', {
      projectionsUpdated: result.projectionsUpdated,
    });
  }
);
