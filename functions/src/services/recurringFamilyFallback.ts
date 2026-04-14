import { EventData } from '../types/index.js';
import {
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

const GENERIC_FAMILY_TOKENS = new Set([
  ...WEEKDAY_NAMES,
  'the',
  'a',
  'an',
  'and',
  'at',
  'by',
  'for',
  'in',
  'of',
  'on',
  'to',
  'club',
]);

const HOST_CONNECTOR_TOKENS = new Set([
  'with',
  'feat',
  'featuring',
  'ft',
  'host',
  'hosted',
  'w',
  'w/',
]);

type RecurringFamilyFallbackOptions = {
  venueId?: string;
  startTimeToleranceHours?: number;
};

export type RecurringFamilyFallbackDiagnostics = {
  sameVenue: boolean;
  existingRecurringLike: boolean;
  differentStartDate: boolean;
  differentUniqueId: boolean;
  sameContentType: boolean;
  sameWeekdayIntent: boolean;
  closeStartTime: boolean;
  hostTokensCompatible: boolean;
  familyAnchorScore: number;
  familyAnchorSharedTokens: string[];
  hostOverlapSharedCount: number;
  hostOverlapRatio: number;
  baseAlignmentDays: number;
  startTimePenalty: number;
  compatible: boolean;
};

type TitleSegments = {
  familyTokens: string[];
  hostTokens: string[];
};

type FamilyAnchorScore = {
  score: number;
  sharedTokens: string[];
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

function isHostConnectorToken(tokens: string[], index: number): number {
  const token = tokens[index] || '';
  const nextToken = tokens[index + 1] || '';

  if (token === 'hosted' && nextToken === 'by') {
    return 2;
  }

  return HOST_CONNECTOR_TOKENS.has(token) ? 1 : 0;
}

function splitTitleSegments(value: unknown): TitleSegments {
  const tokens = getNormalizedTitleTokens(value);
  if (!tokens.length) {
    return { familyTokens: [], hostTokens: [] };
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const connectorLength = isHostConnectorToken(tokens, index);
    if (!connectorLength) continue;

    const familyTokens = tokens.slice(0, index).filter(Boolean);
    const hostTokens = tokens
      .slice(index + connectorLength)
      .filter((token) => token.length >= 3 && !/^\d+$/.test(token));

    return { familyTokens, hostTokens };
  }

  return { familyTokens: tokens, hostTokens: [] };
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

  const weekdayFromDate = getWeekdayFromDate(event.startDate);
  if (weekdayFromDate) weekdays.add(weekdayFromDate);

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

function hasCompatibleContentType(incoming: EventData, existing: EventData): boolean {
  const incomingBucket = normalizeContentBucket(incoming);
  const existingBucket = normalizeContentBucket(existing);

  if (incomingBucket && existingBucket && incomingBucket !== existingBucket) {
    return false;
  }

  return true;
}

function hasCompatibleWeekdayIntent(incoming: EventData, existing: EventData): boolean {
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

function hasCompatibleStartTime(
  incoming: EventData,
  existing: EventData,
  startTimeToleranceHours: number
): boolean {
  const incomingStartTime = asTrimmedString(incoming.startTime);
  const existingStartTime = asTrimmedString(existing.startTime);
  if (!incomingStartTime || !existingStartTime) {
    return false;
  }

  const diffHours = calculateTimeDifferenceHours(incomingStartTime, existingStartTime);
  return Number.isFinite(diffHours) && diffHours <= startTimeToleranceHours;
}

function getMeaningfulFamilyTokens(tokens: string[]): string[] {
  return tokens.filter(
    (token) => token.length >= 3 && !/^\d+$/.test(token) && !GENERIC_FAMILY_TOKENS.has(token)
  );
}

function getTokenRunString(tokens: string[]): string {
  return tokens.join(' ').trim();
}

function getCompactMeaningfulLength(tokens: string[]): number {
  return getMeaningfulFamilyTokens(tokens).join('').length;
}

function findLongestSharedTokenRun(leftTokens: string[], rightTokens: string[]): string[] {
  let bestTokens: string[] = [];

  for (let leftIndex = 0; leftIndex < leftTokens.length; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < rightTokens.length; rightIndex += 1) {
      let sharedLength = 0;
      while (
        leftTokens[leftIndex + sharedLength] &&
        rightTokens[rightIndex + sharedLength] &&
        leftTokens[leftIndex + sharedLength] === rightTokens[rightIndex + sharedLength]
      ) {
        sharedLength += 1;
      }

      if (sharedLength > bestTokens.length) {
        bestTokens = leftTokens.slice(leftIndex, leftIndex + sharedLength);
      }
    }
  }

  return bestTokens;
}

function computeFamilyAnchorScore(incoming: EventData, existing: EventData): FamilyAnchorScore {
  const incomingSegments = splitTitleSegments(getComparableTitle(incoming));
  const existingSegments = splitTitleSegments(getComparableTitle(existing));

  const incomingFamilyString = getTokenRunString(incomingSegments.familyTokens);
  const existingFamilyString = getTokenRunString(existingSegments.familyTokens);

  if (!incomingFamilyString || !existingFamilyString) {
    return { score: 0, sharedTokens: [] };
  }

  const shorterFamily =
    incomingFamilyString.length <= existingFamilyString.length
      ? incomingSegments.familyTokens
      : existingSegments.familyTokens;
  const longerFamily =
    shorterFamily === incomingSegments.familyTokens
      ? existingSegments.familyTokens
      : incomingSegments.familyTokens;
  const shorterFamilyString = getTokenRunString(shorterFamily);
  const longerFamilyString = getTokenRunString(longerFamily);

  const exactMatch = incomingFamilyString === existingFamilyString;
  if (exactMatch) {
    return { score: 1, sharedTokens: incomingSegments.familyTokens };
  }

  const meaningfulShorterTokens = getMeaningfulFamilyTokens(shorterFamily);
  if (
    meaningfulShorterTokens.length >= 2 &&
    getCompactMeaningfulLength(shorterFamily) >= 7 &&
    longerFamilyString.includes(shorterFamilyString)
  ) {
    return { score: 0.97, sharedTokens: shorterFamily };
  }

  const sharedTokens = findLongestSharedTokenRun(incomingSegments.familyTokens, existingSegments.familyTokens);
  const meaningfulSharedTokens = getMeaningfulFamilyTokens(sharedTokens);
  if (meaningfulSharedTokens.length < 2) {
    return { score: 0, sharedTokens: [] };
  }

  const compactSharedLength = meaningfulSharedTokens.join('').length;
  if (compactSharedLength < 7) {
    return { score: 0, sharedTokens: [] };
  }

  if (meaningfulSharedTokens.length >= 3 || compactSharedLength >= 12) {
    return { score: 0.95, sharedTokens };
  }

  return { score: 0.9, sharedTokens };
}

function getUniqueHostTokens(event: EventData): string[] {
  const hostTokens = splitTitleSegments(getComparableTitle(event)).hostTokens;
  return Array.from(new Set(hostTokens));
}

function computeHostOverlap(incoming: EventData, existing: EventData): { sharedCount: number; ratio: number } {
  const incomingHostTokens = getUniqueHostTokens(incoming);
  const existingHostTokens = new Set(getUniqueHostTokens(existing));

  if (!incomingHostTokens.length || !existingHostTokens.size) {
    return { sharedCount: 0, ratio: 0 };
  }

  let sharedCount = 0;
  for (const token of incomingHostTokens) {
    if (existingHostTokens.has(token)) {
      sharedCount += 1;
    }
  }

  if (!sharedCount) {
    return { sharedCount: 0, ratio: 0 };
  }

  return {
    sharedCount,
    ratio: sharedCount / incomingHostTokens.length,
  };
}

function hasCompatibleHostTokens(incoming: EventData, existing: EventData): boolean {
  const incomingHostTokens = getUniqueHostTokens(incoming);
  const existingHostTokens = getUniqueHostTokens(existing);

  if (!incomingHostTokens.length || !existingHostTokens.length) {
    return true;
  }

  return computeHostOverlap(incoming, existing).sharedCount > 0;
}

function getDateDifferenceDays(leftDate: string, rightDate: string): number {
  const left = new Date(`${leftDate}T00:00:00.000Z`);
  const right = new Date(`${rightDate}T00:00:00.000Z`);
  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.abs(Math.floor((left.getTime() - right.getTime()) / (24 * 60 * 60 * 1000)));
}

function computeStartTimePenalty(incoming: EventData, existing: EventData): number {
  const incomingStartTime = asTrimmedString(incoming.startTime);
  const existingStartTime = asTrimmedString(existing.startTime);
  if (!incomingStartTime || !existingStartTime) {
    return Number.POSITIVE_INFINITY;
  }

  const diffHours = calculateTimeDifferenceHours(incomingStartTime, existingStartTime);
  return Number.isFinite(diffHours) ? diffHours : Number.POSITIVE_INFINITY;
}

export function getRecurringFamilyFallbackDiagnostics(
  incoming: EventData,
  existing: EventData,
  options?: RecurringFamilyFallbackOptions
): RecurringFamilyFallbackDiagnostics {
  const sameVenue = hasCompatibleVenue(incoming, existing, options?.venueId);
  const existingRecurringLike = isRecurringLike(existing);
  const incomingStartDate = normalizeDate(incoming.startDate);
  const existingStartDate = normalizeDate(existing.startDate);
  const differentStartDate =
    Boolean(incomingStartDate) &&
    Boolean(existingStartDate) &&
    incomingStartDate !== existingStartDate;
  const incomingUniqueId = asTrimmedString(incoming.uniqueId);
  const existingUniqueId = asTrimmedString(existing.uniqueId);
  const differentUniqueId =
    !incomingUniqueId || !existingUniqueId ? true : incomingUniqueId !== existingUniqueId;
  const sameContentType = hasCompatibleContentType(incoming, existing);
  const sameWeekdayIntent = hasCompatibleWeekdayIntent(incoming, existing);
  const closeStartTime = hasCompatibleStartTime(
    incoming,
    existing,
    options?.startTimeToleranceHours ?? 2
  );
  const hostTokensCompatible = hasCompatibleHostTokens(incoming, existing);
  const familyAnchor = computeFamilyAnchorScore(incoming, existing);
  const hostOverlap = computeHostOverlap(incoming, existing);
  const baseAlignmentDays =
    incomingStartDate && existingStartDate
      ? getDateDifferenceDays(incomingStartDate, existingStartDate)
      : Number.POSITIVE_INFINITY;
  const startTimePenalty = computeStartTimePenalty(incoming, existing);
  const compatible =
    sameVenue &&
    existingRecurringLike &&
    differentStartDate &&
    differentUniqueId &&
    sameContentType &&
    sameWeekdayIntent &&
    closeStartTime &&
    hostTokensCompatible &&
    familyAnchor.score >= 0.9;

  return {
    sameVenue,
    existingRecurringLike,
    differentStartDate,
    differentUniqueId,
    sameContentType,
    sameWeekdayIntent,
    closeStartTime,
    hostTokensCompatible,
    familyAnchorScore: familyAnchor.score,
    familyAnchorSharedTokens: familyAnchor.sharedTokens,
    hostOverlapSharedCount: hostOverlap.sharedCount,
    hostOverlapRatio: hostOverlap.ratio,
    baseAlignmentDays,
    startTimePenalty,
    compatible,
  };
}

export function isRecurringFamilyFallbackCompatible(
  incoming: EventData,
  existing: EventData,
  options?: RecurringFamilyFallbackOptions
): boolean {
  if (!hasCompatibleVenue(incoming, existing, options?.venueId)) {
    return false;
  }

  if (!isRecurringLike(existing)) {
    return false;
  }

  const incomingStartDate = normalizeDate(incoming.startDate);
  const existingStartDate = normalizeDate(existing.startDate);
  if (!incomingStartDate || !existingStartDate || incomingStartDate === existingStartDate) {
    return false;
  }

  const incomingUniqueId = asTrimmedString(incoming.uniqueId);
  const existingUniqueId = asTrimmedString(existing.uniqueId);
  if (incomingUniqueId && existingUniqueId && incomingUniqueId === existingUniqueId) {
    return false;
  }

  if (!hasCompatibleContentType(incoming, existing)) {
    return false;
  }

  if (!hasCompatibleWeekdayIntent(incoming, existing)) {
    return false;
  }

  if (!hasCompatibleStartTime(incoming, existing, options?.startTimeToleranceHours ?? 2)) {
    return false;
  }

  if (!hasCompatibleHostTokens(incoming, existing)) {
    return false;
  }

  return computeFamilyAnchorScore(incoming, existing).score >= 0.9;
}

export function pickRecurringFamilyFallbackMatch(
  incoming: EventData,
  candidates: EventData[],
  options?: RecurringFamilyFallbackOptions
): EventData | undefined {
  const compatibleCandidates = candidates.filter((candidate) =>
    isRecurringFamilyFallbackCompatible(incoming, candidate, options)
  );

  if (!compatibleCandidates.length) {
    return undefined;
  }

  const incomingStartDate = normalizeDate(incoming.startDate);
  let bestCandidate = compatibleCandidates[0];
  let bestFamilyAnchorScore = computeFamilyAnchorScore(incoming, bestCandidate).score;
  let bestHostOverlap = computeHostOverlap(incoming, bestCandidate);
  let bestBaseAlignment = getDateDifferenceDays(incomingStartDate, normalizeDate(bestCandidate.startDate));
  let bestTimePenalty = computeStartTimePenalty(incoming, bestCandidate);

  for (let index = 1; index < compatibleCandidates.length; index += 1) {
    const candidate = compatibleCandidates[index];
    const candidateFamilyAnchorScore = computeFamilyAnchorScore(incoming, candidate).score;
    if (candidateFamilyAnchorScore > bestFamilyAnchorScore) {
      bestCandidate = candidate;
      bestFamilyAnchorScore = candidateFamilyAnchorScore;
      bestHostOverlap = computeHostOverlap(incoming, candidate);
      bestBaseAlignment = getDateDifferenceDays(incomingStartDate, normalizeDate(candidate.startDate));
      bestTimePenalty = computeStartTimePenalty(incoming, candidate);
      continue;
    }
    if (candidateFamilyAnchorScore < bestFamilyAnchorScore) {
      continue;
    }

    const candidateHostOverlap = computeHostOverlap(incoming, candidate);
    if (candidateHostOverlap.sharedCount > bestHostOverlap.sharedCount) {
      bestCandidate = candidate;
      bestFamilyAnchorScore = candidateFamilyAnchorScore;
      bestHostOverlap = candidateHostOverlap;
      bestBaseAlignment = getDateDifferenceDays(incomingStartDate, normalizeDate(candidate.startDate));
      bestTimePenalty = computeStartTimePenalty(incoming, candidate);
      continue;
    }
    if (candidateHostOverlap.sharedCount < bestHostOverlap.sharedCount) {
      continue;
    }
    if (candidateHostOverlap.ratio > bestHostOverlap.ratio) {
      bestCandidate = candidate;
      bestFamilyAnchorScore = candidateFamilyAnchorScore;
      bestHostOverlap = candidateHostOverlap;
      bestBaseAlignment = getDateDifferenceDays(incomingStartDate, normalizeDate(candidate.startDate));
      bestTimePenalty = computeStartTimePenalty(incoming, candidate);
      continue;
    }
    if (candidateHostOverlap.ratio < bestHostOverlap.ratio) {
      continue;
    }

    const candidateBaseAlignment = getDateDifferenceDays(
      incomingStartDate,
      normalizeDate(candidate.startDate)
    );
    if (candidateBaseAlignment < bestBaseAlignment) {
      bestCandidate = candidate;
      bestFamilyAnchorScore = candidateFamilyAnchorScore;
      bestHostOverlap = candidateHostOverlap;
      bestBaseAlignment = candidateBaseAlignment;
      bestTimePenalty = computeStartTimePenalty(incoming, candidate);
      continue;
    }
    if (candidateBaseAlignment > bestBaseAlignment) {
      continue;
    }

    const candidateTimePenalty = computeStartTimePenalty(incoming, candidate);
    if (candidateTimePenalty < bestTimePenalty) {
      bestCandidate = candidate;
      bestFamilyAnchorScore = candidateFamilyAnchorScore;
      bestHostOverlap = candidateHostOverlap;
      bestBaseAlignment = candidateBaseAlignment;
      bestTimePenalty = candidateTimePenalty;
    }
  }

  return bestCandidate;
}
