import { createHash } from 'crypto';

/** A recent, yearless past date must not be written as either stale or next year's event. */
export function isRecentPastYearlessSourceDate(
  sourceText: string,
  postedLocalDate: string,
  extractedDate: string
): boolean {
  const posted = new Date(`${postedLocalDate}T12:00:00Z`);
  const extracted = new Date(`${extractedDate}T12:00:00Z`);
  if (Number.isNaN(posted.getTime()) || Number.isNaN(extracted.getTime()) ||
      ![posted.getUTCFullYear(), posted.getUTCFullYear() + 1]
        .includes(extracted.getUTCFullYear())) return false;

  const month = extracted.getUTCMonth() + 1;
  const day = extracted.getUTCDate();
  const currentYearDate = new Date(Date.UTC(posted.getUTCFullYear(), month - 1, day, 12));
  const daysAgo = (posted.getTime() - currentYearDate.getTime()) / 86_400_000;
  if (daysAgo < 0 || daysAgo > 30) return false;

  const monthTokens = [
    '', 'jan(?:uary)?', 'feb(?:ruary)?', 'mar(?:ch)?', 'apr(?:il)?', 'may',
    'jun(?:e)?', 'jul(?:y)?', 'aug(?:ust)?', 'sep(?:t(?:ember)?)?',
    'oct(?:ober)?', 'nov(?:ember)?', 'dec(?:ember)?',
  ];
  const datePattern = new RegExp(
    `\\b${monthTokens[month]}\\s+${day}(?:st|nd|rd|th)?\\b(?:,?\\s+(20\\d{2}))?`, 'gi'
  );
  return [...String(sourceText || '').matchAll(datePattern)]
    .some(match => !match[1]);
}

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

/** Stable, bounded sampling for a future dataset whose post IDs are not known yet. */
export function isSampledLunaCanaryPost(
  postId: string,
  enabled: boolean,
  percentValue: string,
  excludedIds = ''
): boolean {
  if (!enabled || !postId) return false;
  const percent = Number(percentValue);
  if (!Number.isFinite(percent) || percent <= 0 || percent > 50) return false;
  const excluded = excludedIds.split(',').map(id => id.trim()).filter(Boolean);
  if (excluded.includes(postId)) return false;
  const bucket = createHash('sha256').update(postId).digest().readUInt32BE(0) / 0x100000000;
  return bucket < percent / 100;
}

/** Select only eligible Stage 3 posts, using identity that survives a checkpoint replay. */
export function isSampledEligibleLunaStage3Post(
  fileId: string,
  postId: string,
  percent: number
): boolean {
  if (!fileId || !postId || !Number.isFinite(percent) || percent <= 0 || percent > 50) {
    return false;
  }
  const bucket = createHash('sha256')
    .update(`${fileId}\0${postId}`)
    .digest().readUInt32BE(0) / 0x100000000;
  return bucket < percent / 100;
}

/** Online quota with a stable, run-seeded pick inside each 5-6 post window.
 * This avoids tying every selection to the same position in a source-ordered file. */
export function isLunaStage3QuotaOrdinal(
  eligibleOrdinal: number,
  percent: number,
  runSeed = ''
): boolean {
  if (!Number.isInteger(eligibleOrdinal) || eligibleOrdinal < 1 ||
      !Number.isFinite(percent) || percent <= 0 || percent > 50) return false;
  const windowIndex = Math.floor((eligibleOrdinal - 1) * percent / 100);
  const first = Math.ceil(windowIndex * 100 / percent) + 1;
  const last = Math.ceil((windowIndex + 1) * 100 / percent);
  const windowSize = last - first + 1;
  const offset = createHash('sha256')
    .update(`${runSeed}:${windowIndex}`)
    .digest().readUInt32BE(0) % windowSize;
  return eligibleOrdinal === first + offset;
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

/** Season-long weekday league boards need a reviewed recurrence window before Luna writes them. */
export function shouldRetrySeasonalLeagueWithLegacy(sourceText: string): boolean {
  const text = String(sourceText || '');
  return /\bregular\s+season\b/i.test(text) &&
    /\b(?:begins?|starts?)\b.{0,60}\bweek\s+of\b/i.test(text) &&
    /\b(?:league|curling)\b/i.test(text) &&
    /\bschedule\s+(?:is\s+)?below\b/i.test(text);
}

/** A prose paragraph in a title is a malformed extraction, not a publishable event name. */
export function hasMalformedLunaEventTitle(
  events: Array<{ name?: string; eventName?: string }>
): boolean {
  return events.some(event => {
    const title = String(event.eventName || event.name || '').trim();
    return title.length > 140 && title.split(/\s+/).length > 20;
  });
}

/** Keep online administrative deadlines out of the event feed when no gathering place is printed. */
export function isOnlineAdministrativeMilestone(event: {
  name?: string;
  description?: string;
  venue?: string;
  additionalLocation?: string;
  spatial?: { kind?: string; locations?: unknown[]; evidenceNotes?: string };
}): boolean {
  const name = String(event.name || '').trim();
  const detail = `${event.description || ''} ${event.spatial?.evidenceNotes || ''}`;
  const administrativeAction = /\b(?:voting|registration|applications?|nominations?)\s+(?:opens?|closes?|starts?|ends?|deadline)\b/i.test(name) ||
    /\belections?\b/i.test(name);
  const isPhysicalPlace = (place: unknown): boolean => {
    const label = String(place || '').trim();
    return Boolean(label) &&
      !/^(?:https?:\/\/)?[\w.-]+\.[a-z]{2,}(?:\/|$)/i.test(label) &&
      !/^(?:online|virtual|website|social media|our social media)$/i.test(label);
  };
  const spatialPlaces = event.spatial?.kind === 'online' ? [] :
    (event.spatial?.locations || []).filter(isPhysicalPlace);
  const physicalPlace = isPhysicalPlace(event.venue) ||
    isPhysicalPlace(event.additionalLocation) || spatialPlaces.length > 0;
  const remoteEvidence = /\b(?:online|virtual|website|social media|via\s+\S+\.\w{2,})\b/i.test(detail);
  return administrativeAction && !physicalPlace && remoteEvidence;
}

/** An election filing deadline printed beside a calendar is a notice, not a gathering. */
export function isElectionNoticeWithoutVenue(event: {
  name?: string;
  venue?: string;
}): boolean {
  const name = String(event.name || '').trim();
  return !String(event.venue || '').trim() &&
    /\belections?\b/i.test(name) &&
    /\b(?:nominations?|voting|registration)\s+(?:opens?|closes?|starts?|ends?|deadline)\b/i.test(name);
}
