import type { ProcessingConfig, RawRowData } from '../types/index.js';
import type { RowProcessingResult } from './rowProcessor.js';
import type { BatchManager } from './batchManager.js';
import { createPostResponseReuseSession, createReuseImageHasher, postReusePolicyHash, runWithPostResponseReuse } from '../parsing/postResponseReuse.js';
import { postResponseReuseStore } from '../services/postResponseReuseStore.js';
import { logger } from '../utils/logger.js';

/** Called only by the regular full-dataset loop; selected rows and dry runs
 * never enter this context. Any inability to prove equality uses the full parser. */
export async function processWithPostResponseReuse(row: RawRowData, config: ProcessingConfig,
  manager: BatchManager, processRowFn: () => Promise<RowProcessingResult>): Promise<RowProcessingResult> {
  const fence = manager.getWorkerFence();
  if (process.env.PARSER_RESPONSE_REUSE_ENABLED !== 'true' || config.dryRun ||
      config.parserMode !== 'full5stage' || row.sourceScraperType === 'events' ||
      !/^\d{8,25}$/.test(row.uniqueId || '') || !row.facebookUrl || !fence ||
      !row.timestamp || !Number.isFinite(Date.parse(row.timestamp))) return processRowFn();
  let session;
  try {
    // Signed CDN URL changes and social counts are not new source evidence.
    // Images themselves are compared byte-for-byte in their original order.
    const { captionProvenance: _provenance, likes: _likes, shares: _shares, comments: _comments,
      topReactionsCount: _reactions, usersResponded: _responded, usersGoing: _going,
      usersInterested: _interested, facebookUsersResponded: _facebookResponded,
      mediaUrls, sharedPostThumbnails, profilePicUrl, ...source } = row;
    const urls = [...(mediaUrls || []), ...(sharedPostThumbnails || [])];
    const profileIdentity = profilePicUrl ? (() => { try { const u = new URL(profilePicUrl);
      return u.hostname.endsWith('fbcdn.net') ? u.pathname.split('/').at(-1) : profilePicUrl;
    } catch { return profilePicUrl; } })() : '';
    session = await createPostResponseReuseSession({ source: { ...source, profileIdentity,
      galleryPartition: [mediaUrls?.length || 0, sharedPostThumbnails?.length || 0] },
      identity: { sourceId: row.uniqueId, publisherUrl: row.facebookUrl, pageName: row.pageName },
      imageUrls: urls, policyHash: postReusePolicyHash(config), fence,
      hasher: createReuseImageHasher(), store: postResponseReuseStore });
  } catch {
    logger.info('Post response reuse bypassed: source identity could not be fully verified', { postId: row.uniqueId });
    return processRowFn();
  }
  const result = await runWithPostResponseReuse(session, processRowFn);
  if (result.success || result.skipped) {
    try { await session.commit(); } catch (error) {
      if (error instanceof Error && error.message === 'resume_worker_fenced') throw error;
      logger.warn('Post response reuse receipt could not be saved; normal row result retained', { postId: row.uniqueId });
    }
  }
  logger.info('Post response reuse summary', { postId: row.uniqueId, ...session.metrics });
  return result;
}
