import { EventData } from '../types/index.js';
import {
  calculateEnhancedSimilarity,
  calculateTimeDifferenceHours,
  normalizeVenueName,
} from '../utils/similarity.js';

const WEEKDAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

const FOOD_SPECIAL_EVENT_TYPES = new Set([
  'food_special',
  'drink_special',
  'happy_hour',
  'wing_night',
  'brunch',
]);

type CompatibilityOptions = {
  venueId?: string;
  timeToleranceHours?: number;
};

export type ExactUniqueIdCompatibilityDiagnostics = {
  sameVenue: boolean;
  sameContentType: boolean;
  titleCompatible: boolean;
  dateOrWeekdayCompatible: boolean;
  timeWindowCompatible: boolean;
  titleSimilarity: number;
  timeAgreementPenalty: number;
  compatible: boolean;
};

function asTrimmedString(value: unknown): string {
  return String(value || '').trim();
}

function normalizeFlag(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;

  const normalized = asTrimmedString(value).toLowerCase();
  if (!normalized) return undefined;
  if (['yes', 'true', '1'].includes(normalized)) return true;
  if (['no', 'false', '0'].includes(normalized)) return false;
  return undefined;
}

function normalizeDate(value: unknown): string {
  const normalized = asTrimmedString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
}

function getComparableTitle(event: Pick<EventData, 'eventName' | 'name'>): string {
  return asTrimmedString(event.eventName || event.name);
}

function normalizeTitle(value: unknown): string {
  return normalizeVenueName(asTrimmedString(value));
}

function getNormalizedTitleTokens(value: unknown): string[] {
  return normalizeTitle(value)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);
}

function computeSharedTitleAnchorScore(incoming: EventData, existing: EventData): number {
  const incomingTokens = getNormalizedTitleTokens(getComparableTitle(incoming));
  const existingTokens = getNormalizedTitleTokens(getComparableTitle(existing));
  if (!incomingTokens.length || !existingTokens.length) {
    return 0;
  }

  let bestAnchorTokens: string[] = [];

  for (let incomingIndex = 0; incomingIndex < incomingTokens.length; incomingIndex += 1) {
    for (let existingIndex = 0; existingIndex < existingTokens.length; existingIndex += 1) {
      let sharedLength = 0;
      while (
        incomingTokens[incomingIndex + sharedLength] &&
        existingTokens[existingIndex + sharedLength] &&
        incomingTokens[incomingIndex + sharedLength] === existingTokens[existingIndex + sharedLength]
      ) {
        sharedLength += 1;
      }

      if (sharedLength > bestAnchorTokens.length) {
        bestAnchorTokens = incomingTokens.slice(incomingIndex, incomingIndex + sharedLength);
      }
    }
  }

  const meaningfulAnchorTokens = bestAnchorTokens.filter((token) => !/^\d+$/.test(token));
  if (meaningfulAnchorTokens.length < 2) {
    return 0;
  }

  const compactAnchorLength = meaningfulAnchorTokens.join('').length;
  const hasLongToken = meaningfulAnchorTokens.some((token) => token.length >= 7);
  if (!hasLongToken || compactAnchorLength < 15) {
    return 0;
  }

  if (meaningfulAnchorTokens.length >= 3 || compactAnchorLength >= 22) {
    return 0.94;
  }

  return 0.9;
}

function normalizeContentBucket(event: EventData): 'event' | 'food_special' | '' {
  const eventType = asTrimmedString(event.eventType).toLowerCase();
  const isFoodSpecial = normalizeFlag(event.isFoodSpecial);
  const isEvent = normalizeFlag(event.isEvent);

  if (isFoodSpecial === true || FOOD_SPECIAL_EVENT_TYPES.has(eventType)) {
    return 'food_special';
  }

  if (isEvent === true || eventType) {
    return 'event';
  }

  return '';
}

function isRecurringLike(event: EventData): boolean {
  if (normalizeFlag(event.isRecurring) === true) return true;

  const recurringPattern = asTrimmedString(event.recurringPattern).toLowerCase();
  if (recurringPattern && recurringPattern !== 'none') return true;

  return (
    (Array.isArray(event.recurringDaysOfWeek) && event.recurringDaysOfWeek.length > 0) ||
    (Array.isArray(event.recurringWeekdaySequence) && event.recurringWeekdaySequence.length > 0)
  );
}

function normalizeWeekdayToken(value: unknown): string {
  const normalized = asTrimmedString(value).toLowerCase();
  return WEEKDAY_NAMES.includes(normalized as (typeof WEEKDAY_NAMES)[number]) ? normalized : '';
}

function getWeekdayFromDate(dateValue: unknown): string {
  const normalizedDate = normalizeDate(dateValue);
  if (!normalizedDate) return '';

  const parsed = new Date(`${normalizedDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return '';

  return WEEKDAY_NAMES[parsed.getUTCDay()] || '';
}

function getWeekdayFromPattern(recurringPattern: unknown): string {
  const normalized = asTrimmedString(recurringPattern).toLowerCase();
  const match = normalized.match(/^weekly_(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
  return match?.[1] || '';
}

function collectWeekdayIntent(event: EventData): Set<string> {
  const weekdays = new Set<string>();

  const patternWeekday = getWeekdayFromPattern(event.recurringPattern);
  if (patternWeekday) weekdays.add(patternWeekday);

  for (const day of Array.isArray(event.recurringDaysOfWeek) ? event.recurringDaysOfWeek : []) {
    const normalizedDay = normalizeWeekdayToken(day);
    if (normalizedDay) weekdays.add(normalizedDay);
  }

  for (const day of Array.isArray(event.recurringWeekdaySequence) ? event.recurringWeekdaySequence : []) {
    const normalizedDay = normalizeWeekdayToken(day);
    if (normalizedDay) weekdays.add(normalizedDay);
  }

  if (isRecurringLike(event)) {
    const weekdayFromDate = getWeekdayFromDate(event.startDate);
    if (weekdayFromDate) weekdays.add(weekdayFromDate);
  }

  return weekdays;
}

function hasCompatibleVenue(
  incoming: EventData,
  existing: EventData,
  explicitVenueId?: string
): boolean {
  const targetVenueId = asTrimmedString(explicitVenueId || incoming.venueId);
  const incomingVenueId = asTrimmedString(incoming.venueId);
  const existingVenueId = asTrimmedString(existing.venueId);

  if (targetVenueId && existingVenueId && targetVenueId !== existingVenueId) {
    return false;
  }

  if (incomingVenueId && existingVenueId && incomingVenueId !== existingVenueId) {
    return false;
  }

  return true;
}

function hasCompatibleTitle(incoming: EventData, existing: EventData): boolean {
  const incomingTitle = normalizeTitle(getComparableTitle(incoming));
  const existingTitle = normalizeTitle(getComparableTitle(existing));

  if (incomingTitle && existingTitle) {
    if (incomingTitle === existingTitle) return true;

    const shorterTitle =
      incomingTitle.length <= existingTitle.length ? incomingTitle : existingTitle;
    const longerTitle =
      shorterTitle === incomingTitle ? existingTitle : incomingTitle;

    if (shorterTitle.length >= 8 && longerTitle.includes(shorterTitle)) {
      return true;
    }

    if (computeSharedTitleAnchorScore(incoming, existing) > 0) {
      return true;
    }

    return calculateEnhancedSimilarity(incomingTitle, existingTitle) >= 0.82;
  }

  if (incomingTitle || existingTitle) {
    return false;
  }

  const incomingDescription = normalizeTitle(incoming.description);
  const existingDescription = normalizeTitle(existing.description);
  if (!incomingDescription || !existingDescription) {
    return false;
  }

  return calculateEnhancedSimilarity(incomingDescription, existingDescription) >= 0.9;
}

function hasCompatibleDateOrWeekdayIntent(incoming: EventData, existing: EventData): boolean {
  const incomingStartDate = normalizeDate(incoming.startDate);
  const existingStartDate = normalizeDate(existing.startDate);

  if (incomingStartDate && incomingStartDate === existingStartDate) {
    return true;
  }

  const incomingWeekdays = collectWeekdayIntent(incoming);
  const existingWeekdays = collectWeekdayIntent(existing);

  if (!incomingWeekdays.size || !existingWeekdays.size) {
    return false;
  }

  for (const weekday of incomingWeekdays) {
    if (existingWeekdays.has(weekday)) {
      return true;
    }
  }

  return false;
}

function hasCompatibleTimeWindow(
  incoming: EventData,
  existing: EventData,
  timeToleranceHours: number
): boolean {
  const timePairs: Array<[unknown, unknown]> = [
    [incoming.startTime, existing.startTime],
    [incoming.endTime, existing.endTime],
  ];

  for (const [incomingTime, existingTime] of timePairs) {
    const normalizedIncomingTime = asTrimmedString(incomingTime);
    const normalizedExistingTime = asTrimmedString(existingTime);
    if (!normalizedIncomingTime || !normalizedExistingTime) continue;

    const timeDiff = calculateTimeDifferenceHours(normalizedIncomingTime, normalizedExistingTime);
    if (!Number.isFinite(timeDiff) || timeDiff > timeToleranceHours) {
      return false;
    }
  }

  return true;
}

function hasCompatibleContentType(incoming: EventData, existing: EventData): boolean {
  const incomingBucket = normalizeContentBucket(incoming);
  const existingBucket = normalizeContentBucket(existing);

  if (incomingBucket && existingBucket && incomingBucket !== existingBucket) {
    return false;
  }

  return true;
}

function computeNormalizedTitleSimilarity(incoming: EventData, existing: EventData): number {
  const incomingTitle = normalizeTitle(getComparableTitle(incoming));
  const existingTitle = normalizeTitle(getComparableTitle(existing));
  const sharedAnchorScore = computeSharedTitleAnchorScore(incoming, existing);

  if (incomingTitle && existingTitle) {
    if (incomingTitle === existingTitle) return 1;

    const shorterTitle =
      incomingTitle.length <= existingTitle.length ? incomingTitle : existingTitle;
    const longerTitle =
      shorterTitle === incomingTitle ? existingTitle : incomingTitle;

    let score = calculateEnhancedSimilarity(incomingTitle, existingTitle);
    if (shorterTitle.length >= 8 && longerTitle.includes(shorterTitle)) {
      score = Math.max(score, 0.9);
    }

    score = Math.max(score, sharedAnchorScore);
    return score;
  }

  const incomingDescription = normalizeTitle(incoming.description);
  const existingDescription = normalizeTitle(existing.description);
  if (!incomingDescription || !existingDescription) {
    return sharedAnchorScore;
  }

  return Math.max(
    calculateEnhancedSimilarity(incomingDescription, existingDescription),
    sharedAnchorScore
  );
}

function computeTimeAgreementPenalty(incoming: EventData, existing: EventData): number {
  const timePairs: Array<[unknown, unknown]> = [
    [incoming.startTime, existing.startTime],
    [incoming.endTime, existing.endTime],
  ];

  let comparedPairs = 0;
  let totalDifference = 0;

  for (const [incomingTime, existingTime] of timePairs) {
    const normalizedIncomingTime = asTrimmedString(incomingTime);
    const normalizedExistingTime = asTrimmedString(existingTime);
    if (!normalizedIncomingTime || !normalizedExistingTime) continue;

    const timeDiff = calculateTimeDifferenceHours(normalizedIncomingTime, normalizedExistingTime);
    if (!Number.isFinite(timeDiff)) continue;

    comparedPairs += 1;
    totalDifference += timeDiff;
  }

  if (comparedPairs === 0) {
    return Number.POSITIVE_INFINITY;
  }

  return totalDifference + (timePairs.length - comparedPairs) * 0.25;
}

export function getExactUniqueIdCompatibilityDiagnostics(
  incoming: EventData,
  existing: EventData,
  options?: CompatibilityOptions
): ExactUniqueIdCompatibilityDiagnostics {
  const sameVenue = hasCompatibleVenue(incoming, existing, options?.venueId);
  const sameContentType = hasCompatibleContentType(incoming, existing);
  const titleCompatible = hasCompatibleTitle(incoming, existing);
  const dateOrWeekdayCompatible = hasCompatibleDateOrWeekdayIntent(incoming, existing);
  const timeWindowCompatible = hasCompatibleTimeWindow(
    incoming,
    existing,
    options?.timeToleranceHours ?? 3
  );
  const titleSimilarity = computeNormalizedTitleSimilarity(incoming, existing);
  const timeAgreementPenalty = computeTimeAgreementPenalty(incoming, existing);

  return {
    sameVenue,
    sameContentType,
    titleCompatible,
    dateOrWeekdayCompatible,
    timeWindowCompatible,
    titleSimilarity,
    timeAgreementPenalty,
    compatible:
      sameVenue &&
      sameContentType &&
      titleCompatible &&
      dateOrWeekdayCompatible &&
      timeWindowCompatible,
  };
}

export function isExactUniqueIdDuplicateCompatible(
  incoming: EventData,
  existing: EventData,
  options?: CompatibilityOptions
): boolean {
  if (!hasCompatibleVenue(incoming, existing, options?.venueId)) {
    return false;
  }

  if (!hasCompatibleContentType(incoming, existing)) {
    return false;
  }

  if (!hasCompatibleTitle(incoming, existing)) {
    return false;
  }

  if (!hasCompatibleDateOrWeekdayIntent(incoming, existing)) {
    return false;
  }

  if (!hasCompatibleTimeWindow(incoming, existing, options?.timeToleranceHours ?? 3)) {
    return false;
  }

  return true;
}

export function pickCompatibleExactUniqueIdMatch(
  incoming: EventData,
  candidates: EventData[],
  options?: CompatibilityOptions
): EventData | undefined {
  const compatibleCandidates = candidates.filter((candidate) =>
    isExactUniqueIdDuplicateCompatible(incoming, candidate, options)
  );

  if (!compatibleCandidates.length) {
    return undefined;
  }

  const incomingStartDate = normalizeDate(incoming.startDate);
  let bestCandidate = compatibleCandidates[0];
  let bestHasExactStartDate = normalizeDate(bestCandidate.startDate) === incomingStartDate;
  let bestTitleSimilarity = computeNormalizedTitleSimilarity(incoming, bestCandidate);
  let bestTimePenalty = computeTimeAgreementPenalty(incoming, bestCandidate);

  for (let index = 1; index < compatibleCandidates.length; index += 1) {
    const candidate = compatibleCandidates[index];
    const candidateHasExactStartDate = normalizeDate(candidate.startDate) === incomingStartDate;
    if (candidateHasExactStartDate !== bestHasExactStartDate) {
      if (candidateHasExactStartDate) {
        bestCandidate = candidate;
        bestHasExactStartDate = true;
        bestTitleSimilarity = computeNormalizedTitleSimilarity(incoming, candidate);
        bestTimePenalty = computeTimeAgreementPenalty(incoming, candidate);
      }
      continue;
    }

    const candidateTitleSimilarity = computeNormalizedTitleSimilarity(incoming, candidate);
    if (candidateTitleSimilarity > bestTitleSimilarity) {
      bestCandidate = candidate;
      bestHasExactStartDate = candidateHasExactStartDate;
      bestTitleSimilarity = candidateTitleSimilarity;
      bestTimePenalty = computeTimeAgreementPenalty(incoming, candidate);
      continue;
    }

    if (candidateTitleSimilarity < bestTitleSimilarity) {
      continue;
    }

    const candidateTimePenalty = computeTimeAgreementPenalty(incoming, candidate);
    if (candidateTimePenalty < bestTimePenalty) {
      bestCandidate = candidate;
      bestHasExactStartDate = candidateHasExactStartDate;
      bestTitleSimilarity = candidateTitleSimilarity;
      bestTimePenalty = candidateTimePenalty;
      continue;
    }
  }

  return bestCandidate;
}
