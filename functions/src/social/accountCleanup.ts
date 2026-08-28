import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { user } from 'firebase-functions/v1/auth';

import { deleteSocialAccountData } from './socialService.js';

// Fallback for account deletions initiated by an old client, Firebase Console,
// or a partially completed new-client flow. The main app still invokes the
// callable first so visibility is revoked before Auth deletion.
export const cleanupSocialDataOnAuthDelete = user().onDelete(async (deletedUser) => {
  const result = await deleteSocialAccountData(deletedUser.uid);
  const profileRef = admin.firestore().collection('users').doc(deletedUser.uid);
  await admin.firestore().recursiveDelete(profileRef);
  logger.info('Deleted orphaned social account data', {
    ...result,
  });
});
