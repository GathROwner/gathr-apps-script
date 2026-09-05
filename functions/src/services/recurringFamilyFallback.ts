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
  incomingDatedScheduleOccurrence: boolean;
  existingDatedScheduleOccurrence: boolean;
  existingDurableRecurringLifecycle: boolean;
  crossDateScheduleOccurrenceMergeBlocked: boolean;
  differentStartDate: boolean;
  differentUniqueId: boolean;
  safeCrossSourceNonRecurringMatch: boolean;
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

function getSourceRoot(value: unknown): string {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const root = getSourceRoot(entry);
      if (root) return root;
    }
    return '';
  }

  const normalized = asTrimmedString(value);
  if (!normalized) return '';
  return normalized.split('_')[0] || normalized;
}

function getEventSourceRoot(event: EventData): string {
  const metadata = event as unknown as Record<string, unknown>;
  return (
    getSourceRoot(metadata.sourceUniqueId) ||
    getSourceRoot(event.uniqueId) ||
    getSourceRoot(event.id)
  );
}

function hasDifferentSourceRoot(incoming: EventData, existing: EventData): boolean {
  const incomingRoot = getEventSourceRoot(incoming);
  const existingRoot = getEventSourceRoot(existing);
  return Boolean(incomingRoot && existingRoot && incomingRoot !== existingRoot);
}

function hasSameKnownSourceRoot(incoming: EventData, existing: EventData): boolean {
  const incomingRoot = getEventSourceRoot(incoming);
  const existingRoot = getEventSourceRoot(existing);
  return Boolean(incomingRoot && existingRoot && incomingRoot === existingRoot);
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

function parsePositiveInteger(value: unknown): number | undefined {
  if (value == null) return undefined;
  const parsed =
    typeof value === 'number' ? value : Number(String(value).trim().replace(/,/g, ''));
  if (!Number.isFinite(parsed)) return undefined;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : undefined;
}

function hasRecurringLifecycleSignal(event: EventData): boolean {
  if (parsePositiveInteger(event.totalOccurrences) !== undefined) return true;
  if (normalizeDate(event.recurrenceUntilDate)) return true;
  if (Array.isArray(event.recurringDaysOfWeek) && event.recurringDaysOfWeek.length > 0) {
    return true;
  }
  if (
    Array.isArray(event.recurringWeekdaySequence) &&
    event.recurringWeekdaySequence.length > 0
  ) {
    return true;
  }
  const interval = parsePositiveInteger(event.recurringWeekInterval);
  return interval !== undefined && interval > 1;
}

function getRecurringSignalText(event: EventData): string {
  return [
    event.eventName,
    event.name,
    event.description,
  ]
    .map((value) => asTrimmedString(value))
    .filter(Boolean)
    .join(' ');
}

function getEventMetadataString(event: EventData, fieldName: string): string {
  const metadata = event as unknown as Record<string, unknown>;
  return asTrimmedString(metadata[fieldName]).toLowerCase();
}

function hasScheduleLikeSourceSignal(event: EventData): boolean {
  const sourceType = getEventMetadataString(event, '_sourceType') ||
    getEventMetadataString(event, 'sourceType') ||
    getEventMetadataString(event, 'sourceScraperType');

  return /\b(calendar|schedule)\b/.test(sourceType);
}

function hasExplicitScheduleWindowText(event: EventData): boolean {
  const text = getRecurringSignalText(event);
  if (!text) return false;

  const hasScheduleWord = /\b(schedule|calendar|lineup|this week|weekly schedule)\b/i.test(text);
  if (!hasScheduleWord) return false;

  const hasIsoDateRange = /\b\d{4}-\d{2}-\d{2}\s*(?:-|to|through|thru|\u2013|\u2014)\s*\d{4}-\d{2}-\d{2}\b/i.test(text);
  const hasMonthDateRange = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}\s*(?:-|to|through|thru|\u2013|\u2014)\s*(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+)?\d{1,2}\b/i.test(text);

  return hasIsoDateRange || hasMonthDateRange || /\bthis week\b/i.test(text);
}

function isDatedScheduleOccurrence(event: EventData): boolean {
  return hasScheduleLikeSourceSignal(event) || hasExplicitScheduleWindowText(event);
}

function hasStrongRecurringTextSignal(event: EventData): boolean {
  const text = getRecurringSignalText(event);
  if (!text) return false;

  if (/\b(weekly|recurring|ongoing|every|each|most)\b/i.test(text)) return true;
  const standingScheduleText = text.replace(
    /\b(?:this|coming|next)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/gi,
    ' '
  );
  return /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\s+(at|from|between|starting|starts|after|until|through|thru|to|\d{1,2}(?::\d{2})?\s*(am|pm)?|\d{1,2}\s*[-\u2013\u2014])/i.test(standingScheduleText);
}

function hasStrongRecurringFamilySignal(event: EventData): boolean {
  return hasRecurringLifecycleSignal(event) || hasStrongRecurringTextSignal(event);
}

function isExplicitNonRecurringWithoutLifecycle(event: EventData): boolean {
  if (hasRecurringLifecycleSignal(event)) return false;

  const recurringPattern = asTrimmedString(event.recurringPattern).toLowerCase();
  const hasPattern = Boolean(recurringPattern && recurringPattern !== 'none');
  if (hasPattern) return false;

  return normalizeFlag(event.isRecurring) === false || recurringPattern === 'none';
}

function hasSafeCrossSourceNonRecurringMatch(incoming: EventData, existing: EventData): boolean {
  if (!hasDifferentSourceRoot(incoming, existing)) return true;
  if (!isExplicitNonRecurringWithoutLifecycle(incoming)) return true;

  return hasStrongRecurringFamilySignal(incoming) || hasStrongRecurringFamilySignal(existing);
}

function blocksCrossDateScheduleOccurrenceMerge(incoming: EventData, existing: EventData): boolean {
  const incomingStartDate = normalizeDate(incoming.startDate);
  const existingStartDate = normalizeDate(existing.startDate);
  if (!incomingStartDate || !existingStartDate || incomingStartDate === existingStartDate) {
    return false;
  }

  if (!isDatedScheduleOccurrence(incoming) || !isDatedScheduleOccurrence(existing)) {
    return false;
  }

  // A weekly poster occurrence may refresh a real standing series, but not a
  // different dated occurrence from last week's poster.
  return !hasRecurringLifecycleSignal(existing);
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

function getSignedDateDifferenceDays(fromDate: string, toDate: string): number {
  const from = new Date(`${fromDate}T00:00:00.000Z`);
  const to = new Date(`${toDate}T00:00:00.000Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function countWeeklyIntentOccurrencesThrough(
  startDate: string,
  occurrenceDate: string,
  weekdays: Set<string>,
  weekInterval: number
): number {
  const diffDays = getSignedDateDifferenceDays(startDate, occurrenceDate);
  if (!Number.isFinite(diffDays) || diffDays < 0) return 0;

  let count = 0;
  const current = new Date(`${startDate}T00:00:00.000Z`);
  if (Number.isNaN(current.getTime())) return 0;

  for (let dayOffset = 0; dayOffset <= diffDays; dayOffset += 1) {
    const currentDate = new Date(current);
    currentDate.setUTCDate(current.getUTCDate() + dayOffset);
    const weekday = WEEKDAY_NAMES[currentDate.getUTCDay()] || '';
    const weekOffset = Math.floor(dayOffset / 7);
    if (weekdays.has(weekday) && weekOffset % weekInterval === 0) {
      count += 1;
    }
  }

  return count;
}

function recurringFamilyIncludesOccurrenceDate(
  recurringEvent: EventData,
  occurrenceDate: string
): boolean {
  const recurringStartDate = normalizeDate(recurringEvent.startDate);
  const normalizedOccurrenceDate = normalizeDate(occurrenceDate);
  if (!recurringStartDate || !normalizedOccurrenceDate) return false;

  const diffDays = getSignedDateDifferenceDays(recurringStartDate, normalizedOccurrenceDate);
  if (!Number.isFinite(diffDays) || diffDays <= 0) return false;

  const recurrenceUntilDate = normalizeDate(recurringEvent.recurrenceUntilDate);
  if (recurrenceUntilDate && normalizedOccurrenceDate > recurrenceUntilDate) {
    return false;
  }

  const totalOccurrences = parsePositiveInteger(recurringEvent.totalOccurrences);
  const recurringPattern = asTrimmedString(recurringEvent.recurringPattern).toLowerCase();
  const recurringWeekInterval = parsePositiveInteger(recurringEvent.recurringWeekInterval) || 1;

  if (recurringPattern === 'daily') {
    return totalOccurrences === undefined || diffDays < totalOccurrences;
  }

  const patternWeekday = getWeekdayFromPattern(recurringPattern);
  if (patternWeekday) {
    if (diffDays % (7 * recurringWeekInterval) !== 0) return false;
    if (getWeekdayFromDate(normalizedOccurrenceDate) !== patternWeekday) return false;
    const occurrenceIndex = Math.floor(diffDays / (7 * recurringWeekInterval)) + 1;
    return totalOccurrences === undefined || occurrenceIndex <= totalOccurrences;
  }

  const weekdayIntent = collectWeekdayIntent(recurringEvent);
  if (!weekdayIntent.size) return false;
  if (!weekdayIntent.has(getWeekdayFromDate(normalizedOccurrenceDate))) return false;

  if (totalOccurrences === undefined) {
    return true;
  }

  const occurrenceCount = countWeeklyIntentOccurrencesThrough(
    recurringStartDate,
    normalizedOccurrenceDate,
    weekdayIntent,
    recurringWeekInterval
  );
  return occurrenceCount > 0 && occurrenceCount <= totalOccurrences;
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
  const incomingDatedScheduleOccurrence = isDatedScheduleOccurrence(incoming);
  const existingDatedScheduleOccurrence = isDatedScheduleOccurrence(existing);
  const existingDurableRecurringLifecycle = hasRecurringLifecycleSignal(existing);
  const crossDateScheduleOccurrenceMergeBlocked = blocksCrossDateScheduleOccurrenceMerge(
    incoming,
    existing
  );
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
  const safeCrossSourceNonRecurringMatch = hasSafeCrossSourceNonRecurringMatch(
    incoming,
    existing
  );
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
    !crossDateScheduleOccurrenceMergeBlocked &&
    differentStartDate &&
    differentUniqueId &&
    safeCrossSourceNonRecurringMatch &&
    sameContentType &&
    sameWeekdayIntent &&
    closeStartTime &&
    hostTokensCompatible &&
    familyAnchor.score >= 0.9;

  return {
    sameVenue,
    existingRecurringLike,
    incomingDatedScheduleOccurrence,
    existingDatedScheduleOccurrence,
    existingDurableRecurringLifecycle,
    crossDateScheduleOccurrenceMergeBlocked,
    differentStartDate,
    differentUniqueId,
    safeCrossSourceNonRecurringMatch,
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

  if (blocksCrossDateScheduleOccurrenceMerge(incoming, existing)) {
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

  if (!hasSafeCrossSourceNonRecurringMatch(incoming, existing)) {
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

export function isIncomingRecurringFamilyCompatibleWithExistingOccurrence(
  incoming: EventData,
  existing: EventData,
  options?: RecurringFamilyFallbackOptions
): boolean {
  if (!hasCompatibleVenue(incoming, existing, options?.venueId)) {
    return false;
  }

  if (!isRecurringLike(incoming) || !hasRecurringLifecycleSignal(incoming)) {
    return false;
  }

  if (!isExplicitNonRecurringWithoutLifecycle(existing)) {
    return false;
  }

  if (!hasSameKnownSourceRoot(incoming, existing)) {
    return false;
  }

  const incomingStartDate = normalizeDate(incoming.startDate);
  const existingStartDate = normalizeDate(existing.startDate);
  if (!incomingStartDate || !existingStartDate || incomingStartDate === existingStartDate) {
    return false;
  }

  if (!recurringFamilyIncludesOccurrenceDate(incoming, existingStartDate)) {
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

export function pickIncomingRecurringFamilyExistingOccurrenceMatch(
  incoming: EventData,
  candidates: EventData[],
  options?: RecurringFamilyFallbackOptions
): EventData | undefined {
  const compatibleCandidates = candidates.filter((candidate) =>
    isIncomingRecurringFamilyCompatibleWithExistingOccurrence(incoming, candidate, options)
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
