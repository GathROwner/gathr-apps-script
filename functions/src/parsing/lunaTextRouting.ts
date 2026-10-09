/** Source attachments only: profile/venue fallback pictures are not post evidence. */
export function isCaptionOnlySource(mediaUrls: string[] = [], sharedThumbnails: string[] = []): boolean {
  return ![...mediaUrls, ...sharedThumbnails].some(url => typeof url === 'string' && url.trim());
}

/** An expired or partially prepared gallery is never silently treated as text-only. */
export function isLunaStage3InputReady(input: {
  captionOnly: boolean;
  allowTextOnly: boolean;
  sourceCount: number;
  preparedCount: number;
  galleryCount: number;
  maxGalleryCount: number;
}): boolean {
  if (input.captionOnly) return input.allowTextOnly;
  return input.galleryCount <= input.maxGalleryCount && input.sourceCount > 0 &&
    input.preparedCount === input.sourceCount;
}
