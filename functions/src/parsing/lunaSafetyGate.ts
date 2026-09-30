/** A standing weekday board must not be anchored to the post's arbitrary week. */
export function shouldHoldUndatedStandingSchedule(sourceText: string): boolean {
  const text = String(sourceText || '');
  const standingBoard = /\b(?:standing\s+weekly\s+schedule|week\s+at\s+a\s+glance|weekly\s+(?:events?|lineup|program(?:me)?))\b/i.test(text);
  if (!standingBoard) return false;
  const relativeWeek = /\b(?:this\s+week|next\s+week|week\s+of|for\s+the\s+week\s+of)\b/i.test(text);
  const datedRange = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}\b/i.test(text);
  return !relativeWeek && !datedRange;
}

/** Exact post IDs only; a wildcard or oversized list never enables a broad canary. */
export function isSelectedLunaCanaryPost(
  postId: string,
  enabled: boolean,
  allowedIds: string
): boolean {
  if (!enabled || !postId) return false;
  const ids = String(allowedIds || '').split(',').map(id=>id.trim()).filter(Boolean);
  if (ids.length===0 || ids.length>8 || ids.some(id=>id==='*')) return false;
  return ids.includes(postId);
}

/** Legacy tiles only the first of at most four analyzed source images. */
export function canRetryLunaCanaryWithLegacy(
  sourceImageCount: number,
  bandSourceIndexes: number[] | null
): boolean {
  if (!Number.isInteger(sourceImageCount) || sourceImageCount < 1 || sourceImageCount > 4 ||
      bandSourceIndexes === null) return false;
  return bandSourceIndexes.length === 0 ||
    (bandSourceIndexes.length === 1 && bandSourceIndexes[0] === 0);
}

/** A cleanup retry may delete temporary analysis uploads, never input media. */
export function canaryGeneratedCleanupUrls(candidates: string[], originals: string[]): string[] {
  const input = new Set(originals.filter(Boolean));
  return candidates.filter(url => Boolean(url) && !input.has(url));
}
