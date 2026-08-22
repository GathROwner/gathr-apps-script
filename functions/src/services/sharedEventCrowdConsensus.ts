import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';
import {
  ParsedSharedEvent,
  SharedEventCrowdEventStatus,
} from '../types/sharedEvent.js';

export const SHARED_EVENT_CROWD_THRESHOLD = 3;
export const SHARED_EVENT_CROWD_DAILY_LIMIT = 20;
export const SHARED_EVENT_CROWD_MIN_CONFIDENCE = 80;

const GENERIC_TITLES = new Set([
  'event',
  'facebook event',
  'facebook post',
  'instagram post',
  'possible event',
  'possible event found',
  'save the date',
  'shared event',
  'special event',
  'untitled event',
]);

const TITLE_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'event',
  'for',
  'in',
  'of',
  'on',
  'presents',
  'the',
  'to',
]);

const BLOCKING_REVIEW_REASONS = new Set([
  'expired_event',
  'generic_placeholder_title',
  'missing_location',
  'missing_start_date',
  'missing_title',
  'route_event_requires_review',
  'venue_selection_required',
]);

export interface SharedEventCrowdContribution {
  ownerUid: string;
  ingestId: string;
  privateEventId: string;
  title: string;
  startDate: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  locationName?: string;
  address?: string;
  contentKind?: 'event' | 'special';
  price?: string;
  recurringPattern?: string;
  recurringDaysOfWeek?: string[];
  recurrenceUntilDate?: string;
  timezone: string;
  confidence: number;
  titleKey: string;
  locationKey: string;
  dateLocationKey: string;
  contributedAt?: unknown;
}

export interface SharedEventCrowdConsensusFields {
  title: string;
  startDate: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  locationName?: string;
  address?: string;
  contentKind?: 'event' | 'special';
  price?: string;
  recurringPattern?: string;
  recurringDaysOfWeek?: string[];
  recurrenceUntilDate?: string;
  timezone: string;
}

export interface SharedEventCrowdAggregateRecord extends SharedEventCrowdConsensusFields {
  id?: string;
  titleKey: string;
  locationKey: string;
  dateLocationKey: string;
  contributorCount: number;
  threshold: number;
  contributions: SharedEventCrowdContribution[];
  status: 'collecting' | 'candidate_pending' | 'promoted' | 'duplicate_existing' | 'needs_review' | 'failed';
  publicCandidateId?: string;
  publicEventId?: string;
  publicEventPath?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CrowdEligibilityResult {
  eligible: boolean;
  reason?: string;
}

export function normalizeCrowdText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019`]/g, "'")
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function titleTokens(value: string): Set<string> {
  return new Set(
    normalizeCrowdText(value)
      .split(' ')
      .filter((token) => token.length > 1 && !TITLE_STOP_WORDS.has(token))
      .map((token) => token.length >= 5 ? token.replace(/our$/, 'or') : token)
  );
}

export function crowdTitleSimilarity(left: string, right: string): number {
  const normalizedLeft = normalizeCrowdText(left);
  const normalizedRight = normalizeCrowdText(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;
  if (
    Math.min(normalizedLeft.length, normalizedRight.length) >= 8 &&
    (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft))
  ) {
    return 0.9;
  }

  const leftTokens = titleTokens(normalizedLeft);
  const rightTokens = titleTokens(normalizedRight);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union > 0 ? intersection / union : 0;
}

function minutesFromTime(value: string | undefined): number | undefined {
  const match = String(value || '').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
}

function timesAreCompatible(left: string | undefined, right: string | undefined): boolean {
  const leftMinutes = minutesFromTime(left);
  const rightMinutes = minutesFromTime(right);
  if (leftMinutes === undefined || rightMinutes === undefined) return true;
  return Math.abs(leftMinutes - rightMinutes) <= 30;
}

function eventDateIsEligible(startDate: string | undefined, now: DateTime): boolean {
  if (!startDate) return false;
  const parsed = DateTime.fromISO(startDate, { zone: 'America/Halifax' }).startOf('day');
  if (!parsed.isValid) return false;
  return parsed >= now.startOf('day') && parsed <= now.plus({ days: 400 }).endOf('day');
}

export function getCrowdEligibility(
  event: ParsedSharedEvent,
  options?: { hasUserPhoto?: boolean; nowIso?: string }
): CrowdEligibilityResult {
  if (!options?.hasUserPhoto && event.mediaUrls.length === 0) {
    return { eligible: false, reason: 'photo_required' };
  }
  if (event.sourceVisibility === 'public_verified') {
    return { eligible: false, reason: 'public_source_uses_public_validation' };
  }
  const titleKey = normalizeCrowdText(event.title);
  if (!titleKey || titleKey.length < 4 || GENERIC_TITLES.has(titleKey)) {
    return { eligible: false, reason: 'title_not_specific' };
  }
  if (!normalizeCrowdText(event.locationName || event.address)) {
    return { eligible: false, reason: 'location_required' };
  }
  const now = options?.nowIso
    ? DateTime.fromISO(options.nowIso, { zone: 'America/Halifax' })
    : DateTime.now().setZone('America/Halifax');
  if (!eventDateIsEligible(event.startDate, now.isValid ? now : DateTime.now().setZone('America/Halifax'))) {
    return { eligible: false, reason: 'date_out_of_range' };
  }
  if (event.isExpired) return { eligible: false, reason: 'event_expired' };
  if (Number(event.confidence || 0) < SHARED_EVENT_CROWD_MIN_CONFIDENCE) {
    return { eligible: false, reason: 'parser_confidence_too_low' };
  }
  const fieldSources = event.fieldSources || {};
  const hasPhotoDerivedLocation = fieldSources.locationName === 'uploaded_media' ||
    fieldSources.address === 'uploaded_media';
  if (
    fieldSources.title !== 'uploaded_media' ||
    fieldSources.startDate !== 'uploaded_media' ||
    !hasPhotoDerivedLocation
  ) {
    return { eligible: false, reason: 'critical_facts_not_photo_derived' };
  }
  const blockingReason = (event.reviewReasons || []).find((reason) => BLOCKING_REVIEW_REASONS.has(reason));
  if (blockingReason) return { eligible: false, reason: blockingReason };
  return { eligible: true };
}

export function buildCrowdContribution(params: {
  ownerUid: string;
  ingestId: string;
  privateEventId: string;
  event: ParsedSharedEvent;
}): SharedEventCrowdContribution {
  const locationKey = normalizeCrowdText(params.event.locationName || params.event.address);
  const titleKey = normalizeCrowdText(params.event.title);
  const startDate = String(params.event.startDate || '').trim();
  return {
    ownerUid: params.ownerUid,
    ingestId: params.ingestId,
    privateEventId: params.privateEventId,
    title: params.event.title.trim(),
    startDate,
    endDate: params.event.endDate,
    startTime: params.event.startTime,
    endTime: params.event.endTime,
    locationName: params.event.locationName,
    address: params.event.address,
    contentKind: params.event.contentKind,
    price: params.event.price,
    recurringPattern: params.event.recurringPattern,
    recurringDaysOfWeek: params.event.recurringDaysOfWeek,
    recurrenceUntilDate: params.event.recurrenceUntilDate,
    timezone: params.event.timezone || 'America/Halifax',
    confidence: Number(params.event.confidence || 0),
    titleKey,
    locationKey,
    dateLocationKey: `${startDate}|${locationKey}`,
  };
}

export function crowdAggregateId(contribution: SharedEventCrowdContribution): string {
  return createHash('sha256')
    .update(`${contribution.dateLocationKey}|${contribution.titleKey}`)
    .digest('hex')
    .slice(0, 40);
}

export function crowdContributionMatchesAggregate(
  contribution: SharedEventCrowdContribution,
  aggregate: Pick<SharedEventCrowdAggregateRecord, 'dateLocationKey' | 'title' | 'startTime'>
): boolean {
  return contribution.dateLocationKey === aggregate.dateLocationKey &&
    crowdTitleSimilarity(contribution.title, aggregate.title) >= 0.74 &&
    timesAreCompatible(contribution.startTime, aggregate.startTime);
}

function mostTrustedText(
  contributions: SharedEventCrowdContribution[],
  select: (contribution: SharedEventCrowdContribution) => string | undefined
): string | undefined {
  const values = contributions
    .map((contribution) => ({
      raw: String(select(contribution) || '').trim(),
      confidence: contribution.confidence,
    }))
    .filter((entry) => Boolean(entry.raw));
  if (values.length === 0) return undefined;

  const counts = new Map<string, { count: number; best: { raw: string; confidence: number } }>();
  for (const value of values) {
    const key = normalizeCrowdText(value.raw);
    const existing = counts.get(key);
    if (!existing) {
      counts.set(key, { count: 1, best: value });
    } else {
      existing.count += 1;
      if (value.confidence > existing.best.confidence || value.raw.length > existing.best.raw.length) {
        existing.best = value;
      }
    }
  }

  return [...counts.values()]
    .sort((left, right) => right.count - left.count || right.best.confidence - left.best.confidence)[0]
    ?.best.raw;
}

function consensusTime(
  contributions: SharedEventCrowdContribution[],
  select: (contribution: SharedEventCrowdContribution) => string | undefined
): string | undefined {
  const values = contributions
    .map((contribution) => ({ value: select(contribution), confidence: contribution.confidence }))
    .map((entry) => ({ ...entry, minutes: minutesFromTime(entry.value) }))
    .filter((entry): entry is { value: string; confidence: number; minutes: number } => (
      typeof entry.value === 'string' && entry.minutes !== undefined
    ));
  if (values.length < 2) return undefined;
  const sorted = [...values].sort((left, right) => left.minutes - right.minutes);
  const medianMinutes = sorted[Math.floor((sorted.length - 1) / 2)].minutes;
  return [...values]
    .sort((left, right) => (
      Math.abs(left.minutes - medianMinutes) - Math.abs(right.minutes - medianMinutes) ||
      right.confidence - left.confidence
    ))[0]?.value;
}

export function buildCrowdConsensus(
  contributions: SharedEventCrowdContribution[],
  threshold = SHARED_EVENT_CROWD_THRESHOLD
): { ready: boolean; reason?: string; fields?: SharedEventCrowdConsensusFields } {
  const unique = new Map<string, SharedEventCrowdContribution>();
  for (const contribution of contributions) {
    const existing = unique.get(contribution.ownerUid);
    if (!existing || contribution.confidence >= existing.confidence) {
      unique.set(contribution.ownerUid, contribution);
    }
  }
  const rows = [...unique.values()];
  if (rows.length < threshold) return { ready: false, reason: 'awaiting_independent_contributors' };
  const anchor = rows[0];
  if (rows.some((row) => row.dateLocationKey !== anchor.dateLocationKey)) {
    return { ready: false, reason: 'location_or_date_conflict' };
  }
  if (rows.some((row) => crowdTitleSimilarity(row.title, anchor.title) < 0.74)) {
    return { ready: false, reason: 'title_conflict' };
  }
  if (rows.some((row) => !timesAreCompatible(row.startTime, anchor.startTime))) {
    return { ready: false, reason: 'start_time_conflict' };
  }
  if (rows.some((row) => (row.contentKind || 'event') !== (anchor.contentKind || 'event'))) {
    return { ready: false, reason: 'content_kind_conflict' };
  }

  const title = mostTrustedText(rows, (row) => row.title);
  const locationName = mostTrustedText(rows, (row) => row.locationName);
  const address = mostTrustedText(rows, (row) => row.address);
  if (!title || (!locationName && !address)) {
    return { ready: false, reason: 'critical_consensus_field_missing' };
  }

  return {
    ready: true,
    fields: {
      title,
      startDate: anchor.startDate,
      endDate: mostTrustedText(rows, (row) => row.endDate) || anchor.startDate,
      startTime: consensusTime(rows, (row) => row.startTime),
      endTime: consensusTime(rows, (row) => row.endTime),
      locationName,
      address,
      contentKind: anchor.contentKind || 'event',
      price: mostTrustedText(rows, (row) => row.price),
      recurringPattern: mostTrustedText(rows, (row) => row.recurringPattern),
      recurringDaysOfWeek: mostTrustedText(rows, (row) => row.recurringDaysOfWeek?.join(','))
        ?.split(',')
        .filter(Boolean),
      recurrenceUntilDate: mostTrustedText(rows, (row) => row.recurrenceUntilDate),
      timezone: mostTrustedText(rows, (row) => row.timezone) || 'America/Halifax',
    },
  };
}

export function crowdStatusSummary(
  events: SharedEventCrowdEventStatus[],
  threshold = SHARED_EVENT_CROWD_THRESHOLD
) {
  return {
    eligibleEventCount: events.filter((event) => event.status !== 'ineligible').length,
    collectingEventCount: events.filter((event) => event.status === 'collecting').length,
    candidateEventCount: events.filter((event) => event.status === 'candidate_pending').length,
    reviewEventCount: events.filter((event) => (
      event.status === 'needs_review' || event.status === 'failed'
    )).length,
    promotedEventCount: events.filter((event) => (
      event.status === 'promoted' || event.status === 'duplicate_existing'
    )).length,
    threshold,
    maxContributorCount: Math.max(0, ...events.map((event) => event.contributorCount)),
    events,
  };
}
