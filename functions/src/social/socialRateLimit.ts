import { Timestamp, type DocumentData } from 'firebase-admin/firestore';
import { SocialDomainError } from './validation.js';

/** Preserve the exact guard record contract captured from the serving private-candidate function. */
export function buildSocialRateLimitRecord(
  uid: string,
  action: string,
  maxRequests: number,
  windowMs: number,
  data: DocumentData,
  now: Timestamp,
  errorMessage: string
): DocumentData {
  const windowStartedAt = data.windowStartedAt;
  const inCurrentWindow = windowStartedAt instanceof Timestamp
    && now.toMillis() - windowStartedAt.toMillis() < windowMs;
  const nextCount = inCurrentWindow ? Number(data.count || 0) + 1 : 1;
  if (nextCount > maxRequests) {
    throw new SocialDomainError('resource-exhausted', errorMessage);
  }
  return {
    uid,
    action,
    count: nextCount,
    windowStartedAt: inCurrentWindow ? windowStartedAt : now,
    expiresAt: Timestamp.fromMillis(now.toMillis() + windowMs * 2),
  };
}
