import { DateTime } from 'luxon';
import { EventData, VenueData } from '../types/index.js';
import {
  PublicSharedEventCandidateRecord,
  PublicSharedEventCandidateStatus,
} from '../types/sharedEvent.js';
import { logger } from '../utils/logger.js';
import { normalizeVenueName } from '../utils/similarity.js';
import * as sharedEventCandidateStore from './sharedEventCandidateStore.js';
import * as firestoreService from './firestoreService.js';
import { getUntrustedPublicPromotionReason } from './sharedEventPublicTrust.js';

export type SharedEventPromotionOutcome =
  | {
      status: 'promoted';
      candidateId: string;
      venueId: string;
      eventId: string;
      eventPath: string;
    }
  | {
      status: 'duplicate_existing';
      candidateId: string;
      venueId: string;
      eventId?: string;
      eventPath?: string;
    }
  | {
      status: 'queued_city_level_review' | 'queued_unknown_venue' | 'venue_unresolved';
      candidateId: string;
      unknownVenueDocId?: string;
      cityLevelReviewDocId?: string;
      reason?: string;
    }
  | {
      status: 'needs_user_review' | 'rejected_expired' | 'failed' | 'skipped';
      candidateId: string;
      reason?: string;
    };

type CandidateVenueResolution = {
  venue: VenueData | null;
  matchType?: string;
  subVenue?: string;
};

const PROCESSABLE_STATUSES: PublicSharedEventCandidateStatus[] = ['pending_validation'];

const firstText = (...values: unknown[]): string => {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
};

const firstFiniteNumber = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return undefined;
};

const toTitleCase = (value: string): string =>
  value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

function normalizeTitleForReview(value: unknown): string {
  return firstText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[â€™â€˜`]/g, "'")
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isPlaceholderCandidateTitle(value: unknown): boolean {
  const title = normalizeTitleForReview(value);
  return title === 'event' ||
    title === 'facebook event' ||
    title === 'facebook post' ||
    title === 'possible event found' ||
    title === 'shared event';
}

function getVenueDisplayName(venue: VenueData): string {
  const record = venue as unknown as Record<string, unknown>;
  return firstText(
    record.pagename,
    venue.name,
    record.title,
    record.normalizedName,
    venue.id
  );
}

export function extractSharedEventSubVenue(
  rawLocation: string | undefined,
  canonicalVenueName: string | undefined
): string {
  const normalizedLocation = normalizeVenueName(String(rawLocation || ''));
  const normalizedVenue = normalizeVenueName(String(canonicalVenueName || ''));
  if (!normalizedLocation || !normalizedVenue || normalizedLocation === normalizedVenue) {
    return '';
  }

  const locationTokens = normalizedLocation.split(' ').filter(Boolean);
  const venueTokens = normalizedVenue.split(' ').filter(Boolean);
  const startsWithVenue =
    venueTokens.length > 0 &&
    venueTokens.every((token, index) => locationTokens[index] === token);
  if (!startsWithVenue) return '';

  const detail = locationTokens.slice(venueTokens.length).join(' ').trim();
  return detail ? toTitleCase(detail) : '';
}

function inferCategory(candidate: PublicSharedEventCandidateRecord): string {
  const text = normalizeVenueName(`${candidate.title || ''} ${candidate.description || ''}`);
  if (/\b(happy hour|drink special|cocktail|beer|wine)\b/.test(text)) return 'Happy Hour';
  if (/\b(food special|bbq|burger|brunch|patio|menu|tasting|dinner|lunch)\b/.test(text)) {
    return 'Food Special';
  }
  if (/\b(trivia)\b/.test(text)) return 'Trivia Night';
  if (/\b(karaoke)\b/.test(text)) return 'Karaoke';
  if (/\b(comedy|comedian)\b/.test(text)) return 'Comedy';
  if (/\b(music|band|dj|concert|jazz|acoustic|singer|songwriter|live portrait booth)\b/.test(text)) {
    return 'Live Music';
  }
  if (/\b(run|soccer|football|sport|game|match|wellness|yoga|fitness)\b/.test(text)) return 'Sports';
  if (/\b(workshop|class|craft|flower crown|paint|portrait booth)\b/.test(text)) {
    return 'Workshops & Classes';
  }
  if (/\b(kids|family|children|play zone)\b/.test(text)) return 'Family Friendly';
  return 'Gatherings & Parties';
}

function isFoodSpecialCategory(category: string): boolean {
  return ['happy hour', 'food special', 'drink special', 'wing night'].includes(
    String(category || '').trim().toLowerCase()
  );
}

function categoryToEventType(category: string): string {
  if (isFoodSpecialCategory(category)) return 'food_special';
  return (
    String(category || 'event')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'event'
  );
}

function inferSourceScraperType(candidate: PublicSharedEventCandidateRecord): EventData['sourceScraperType'] {
  const source = String(candidate.sourceUrl || '').toLowerCase();
  if (source.includes('/events/') || source.includes('fb.me/e/')) return 'events';
  return 'posts';
}

function cleanVenueContextText(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/[.。]+$/g, '')
    .trim();
}

function addContextCandidate(candidates: Set<string>, value: unknown): void {
  const text = cleanVenueContextText(String(value || ''));
  if (text.length >= 3) {
    candidates.add(text);
  }
}

function getContextVenueCandidates(candidate: PublicSharedEventCandidateRecord): string[] {
  const values = [
    candidate.visibilityEvidence?.title,
    candidate.visibilityEvidence?.description,
  ].map((value) => String(value || '').trim()).filter(Boolean);
  const candidates = new Set<string>();

  for (const value of values) {
    const photoAtMatch = value.match(/added a new photo\s+[—-]\s+at\s+(.+)$/i);
    if (photoAtMatch?.[1]) {
      addContextCandidate(candidates, photoAtMatch[1]);
    }

    const genericAtMatch = value.match(/\bat\s+(.+)$/i);
    if (genericAtMatch?.[1]) {
      addContextCandidate(candidates, genericAtMatch[1]);
    }

    for (const segment of value.split(/\s+[—-]\s+|\s+\|\s+/g)) {
      if (!segment || segment.includes('...')) continue;
      addContextCandidate(candidates, segment);
    }
  }

  return Array.from(candidates);
}

function shouldPreserveRawLocationAsSubVenue(rawLocation: string): boolean {
  const normalized = normalizeVenueName(rawLocation);
  if (!normalized) return false;
  if (/\b(stage|room|patio|tent|hall|lounge|garden|deck|terrace|bar)\b/.test(normalized)) {
    return true;
  }
  const tokens = normalized.split(' ').filter(Boolean);
  return tokens.length > 0 && tokens.length <= 3;
}

function normalizeSharedCityLocation(value: string): string {
  return value
    .replace(/\bcanada\b/gi, '')
    .replace(/\bprince edward island\b/gi, 'PEI')
    .replace(/\bp\.?\s*e\.?\s*i\.?\b/gi, 'PEI')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/,+$/g, '')
    .trim();
}

function getCityLevelLocationDetails(locationName: string): {
  locationScope: 'city' | 'area';
  locationLabel: string;
  locationCity?: string;
  locationProvince?: string;
  locationPrecision: 'city_centroid' | 'approximate';
} | null {
  const raw = String(locationName || '').trim();
  if (!raw || /\d/.test(raw)) return null;
  if (/\b(park|centre|center|hall|arena|stadium|theatre|theater|cafe|restaurant|bar|pub|club|church|school|hotel|inn|brewery|market|stage|room|patio)\b/i.test(raw)) {
    return null;
  }

  const cleaned = normalizeSharedCityLocation(raw);
  const normalized = normalizeVenueName(cleaned);
  if (!normalized) return null;

  if (['downtown charlottetown'].includes(normalized)) {
    return {
      locationScope: 'area',
      locationLabel: 'Downtown Charlottetown',
      locationCity: 'Charlottetown',
      locationProvince: 'PEI',
      locationPrecision: 'approximate',
    };
  }

  const cityProvinceMatch = cleaned.match(/^(.+?)(?:,\s*|\s+)(PEI?|PE)$/i);
  if (cityProvinceMatch) {
    const city = cityProvinceMatch[1].trim();
    return {
      locationScope: 'city',
      locationLabel: `${city}, PEI`,
      locationCity: city,
      locationProvince: 'PEI',
      locationPrecision: 'city_centroid',
    };
  }

  const knownPeiCities = new Set([
    'charlottetown',
    'cornwall',
    'stratford',
    'summerside',
    'montague',
    'kensington',
    'souris',
    'alberton',
    'georgetown',
    'north rustico',
    'cavendish',
  ]);
  if (knownPeiCities.has(normalized)) {
    return {
      locationScope: 'city',
      locationLabel: `${toTitleCase(normalized)}, PEI`,
      locationCity: toTitleCase(normalized),
      locationProvince: 'PEI',
      locationPrecision: 'city_centroid',
    };
  }

  if (/^(pei|pe)$/.test(normalized)) {
    return {
      locationScope: 'area',
      locationLabel: 'PEI',
      locationProvince: 'PEI',
      locationPrecision: 'approximate',
    };
  }

  return null;
}

function isExpiredCandidate(candidate: PublicSharedEventCandidateRecord): boolean {
  const endDate = firstText(candidate.endDate, candidate.startDate);
  if (!endDate) return false;
  const today = DateTime.now().setZone('America/Halifax').toISODate();
  return Boolean(today && endDate < today);
}

function buildPromotionUniqueId(candidate: PublicSharedEventCandidateRecord): string {
  const id = firstText(candidate.id, candidate.sourceContentSignature, candidate.sourceUrl);
  return `shared_public_${id}`.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 120);
}

async function resolveVenue(candidate: PublicSharedEventCandidateRecord): Promise<CandidateVenueResolution> {
  const resolvedVenueId = firstText(candidate.resolvedVenueId);
  if (resolvedVenueId) {
    const resolvedVenue = await firestoreService.getVenue(resolvedVenueId);
    if (resolvedVenue?.id) {
      const canonicalName = getVenueDisplayName(resolvedVenue);
      const locationName = firstText(candidate.locationName, candidate.visibilityEvidence?.locationName);
      return {
        venue: resolvedVenue,
        matchType: 'resolved_unknown_venue',
        subVenue: extractSharedEventSubVenue(locationName, canonicalName),
      };
    }
  }

  const locationName = firstText(candidate.locationName, candidate.visibilityEvidence?.locationName);
  const address = firstText(candidate.address, candidate.visibilityEvidence?.address);

  if (locationName) {
    const match = await firestoreService.findMatchingVenue(locationName);
    if (match.isMatch && match.matchedVenue) {
      const canonicalName = getVenueDisplayName(match.matchedVenue);
      return {
        venue: match.matchedVenue,
        matchType: match.matchType,
        subVenue: extractSharedEventSubVenue(locationName, canonicalName),
      };
    }
  }

  for (const contextName of getContextVenueCandidates(candidate)) {
    const match = await firestoreService.findMatchingVenue(contextName);
    if (match.isMatch && match.matchedVenue) {
      const canonicalName = getVenueDisplayName(match.matchedVenue);
      const contextualSubVenue = extractSharedEventSubVenue(contextName, canonicalName);
      const rawLocationSubVenue = shouldPreserveRawLocationAsSubVenue(locationName)
        ? toTitleCase(normalizeVenueName(locationName))
        : '';
      return {
        venue: match.matchedVenue,
        matchType: `context_${match.matchType || 'match'}`,
        subVenue: contextualSubVenue || rawLocationSubVenue,
      };
    }
  }

  if (address) {
    const match = await firestoreService.findVenueByAddress(address);
    if (match.isMatch && match.matchedVenue) {
      return {
        venue: match.matchedVenue,
        matchType: match.matchType,
      };
    }
  }

  return { venue: null };
}

export function buildPublicSharedEventData(
  candidate: PublicSharedEventCandidateRecord,
  venue: VenueData,
  subVenue?: string
): EventData {
  const category = inferCategory(candidate);
  const isFoodSpecial = isFoodSpecialCategory(category);
  const title = firstText(candidate.title, 'Shared event');
  const venueName = getVenueDisplayName(venue);
  const venueRecord = venue as unknown as Record<string, unknown>;
  const placeDetails = venueRecord.placeDetailsParsed as Record<string, unknown> | undefined;
  const address = firstText(
    candidate.address,
    candidate.visibilityEvidence?.address,
    venue.address,
    placeDetails?.formatted_address
  );
  const latitude = firstFiniteNumber(
    venueRecord.latitude,
    venueRecord.lat,
    (venueRecord.coordinates as Record<string, unknown> | undefined)?.latitude,
    (venueRecord.coordinates as Record<string, unknown> | undefined)?.lat
  );
  const longitude = firstFiniteNumber(
    venueRecord.longitude,
    venueRecord.lng,
    (venueRecord.coordinates as Record<string, unknown> | undefined)?.longitude,
    (venueRecord.coordinates as Record<string, unknown> | undefined)?.lng
  );
  const mediaUrls = Array.isArray(candidate.mediaUrls)
    ? candidate.mediaUrls.map((url) => String(url || '').trim()).filter(Boolean)
    : [];
  const imageUrl = firstText(mediaUrls[0], candidate.visibilityEvidence?.imageUrl);
  const description = firstText(candidate.description);

  return {
    uniqueId: buildPromotionUniqueId(candidate),
    establishment: venueName,
    eventType: categoryToEventType(category),
    eventName: title,
    name: title,
    description,
    category,
    isEvent: !isFoodSpecial,
    isFoodSpecial,
    startDate: firstText(candidate.startDate),
    endDate: firstText(candidate.endDate, candidate.startDate),
    startTime: firstText(candidate.startTime),
    endTime: firstText(candidate.endTime),
    address,
    latitude,
    longitude,
    city: firstText(venueRecord.city),
    streetAddress: firstText(venueRecord.streetAddress),
    venueId: venue.id || null,
    sourceScraperType: inferSourceScraperType(candidate),
    sourceContentSignature: candidate.sourceContentSignature,
    facebookUrl: firstText(candidate.sourceUrl, candidate.visibilityEvidence?.url),
    cleanedFacebookUrl: firstText(candidate.sourceUrl, candidate.visibilityEvidence?.url),
    icon: firstText(venueRecord.profileImage, venueRecord.icon),
    imageUrl,
    image: imageUrl,
    relevantImageUrl: imageUrl,
    mediaUrls,
    additionalLocation: subVenue || undefined,
    subVenue: subVenue || undefined,
    locationLabel: subVenue || undefined,
    sourceTimestamp: candidate.visibilityEvidence?.sourcePublishedAt
      ? new Date(candidate.visibilityEvidence.sourcePublishedAt)
      : undefined,
    sharedEventCandidateId: candidate.id,
    sharedEventPrivateEventId: candidate.privateEventId,
    sharedEventIngestId: candidate.ingestId,
    sharedEventOwnerUid: candidate.ownerUid,
    sharedEventSource: 'public_shared_event_candidate',
  } as EventData;
}

export function getRequiredCandidateReviewReason(candidate: PublicSharedEventCandidateRecord): string {
  if (!firstText(candidate.title)) return 'missing_title';
  if (isPlaceholderCandidateTitle(candidate.title)) return 'generic_placeholder_title';
  if (!firstText(candidate.startDate)) return 'missing_date';
  if (!firstText(candidate.locationName, candidate.address, candidate.visibilityEvidence?.locationName)) {
    return 'missing_location';
  }
  const untrustedPublicFields = getUntrustedPublicPromotionReason(candidate);
  if (untrustedPublicFields) return untrustedPublicFields;
  return '';
}

async function markCandidateAndPrivateEvent(params: {
  candidate: PublicSharedEventCandidateRecord;
  status: PublicSharedEventCandidateStatus;
  updates?: Partial<PublicSharedEventCandidateRecord> & Record<string, unknown>;
  publicVenueId?: string;
  publicEventId?: string;
  publicEventPath?: string;
  publicUnknownVenueDocId?: string;
  publicCityLevelReviewDocId?: string;
}): Promise<void> {
  const candidateId = firstText(params.candidate.id);
  await sharedEventCandidateStore.updatePublicSharedEventCandidate(candidateId, {
    status: params.status,
    ...(params.updates || {}),
  });
  await sharedEventCandidateStore.updatePrivateSharedEventPublicPromotion({
    ownerUid: params.candidate.ownerUid,
    privateEventId: params.candidate.privateEventId,
    publicCandidateId: candidateId,
    publicPromotionStatus: params.status,
    publicVenueId: params.publicVenueId,
    publicEventId: params.publicEventId,
    publicEventPath: params.publicEventPath,
    publicUnknownVenueDocId: params.publicUnknownVenueDocId,
    publicCityLevelReviewDocId: params.publicCityLevelReviewDocId,
  });
}

async function queueCityLevelPublicCandidate(
  candidate: PublicSharedEventCandidateRecord,
  location: NonNullable<ReturnType<typeof getCityLevelLocationDetails>>
): Promise<SharedEventPromotionOutcome> {
  const candidateId = firstText(candidate.id);
  const mediaUrls = Array.isArray(candidate.mediaUrls)
    ? candidate.mediaUrls.map((url) => String(url || '').trim()).filter(Boolean)
    : [];
  const category = inferCategory(candidate);
  const imageUrl = firstText(mediaUrls[0], candidate.visibilityEvidence?.imageUrl);
  const facebookUrl = firstText(candidate.sourceUrl, candidate.visibilityEvidence?.url);
  const result = await firestoreService.queueCityLevelEventReview({
    uniqueId: buildPromotionUniqueId(candidate),
    fileId: `shared-event:${candidate.ingestId}`,
    fileName: 'public_shared_event_candidate',
    rowIndex: 0,
    parserMode: 'full5stage',
    eventName: candidate.title,
    eventDate: candidate.startDate,
    eventTime: candidate.startTime,
    endDate: candidate.endDate,
    endTime: candidate.endTime,
    eventType: categoryToEventType(category),
    category,
    description: firstText(candidate.description, candidate.visibilityEvidence?.description),
    imageUrl,
    mediaUrls,
    locationLabel: location.locationLabel,
    locationCity: location.locationCity,
    locationProvince: location.locationProvince,
    locationScope: location.locationScope,
    locationPrecision: location.locationPrecision,
    organizerName: firstText(candidate.visibilityEvidence?.title),
    facebookUrl,
    topLevelUrl: facebookUrl,
    sourceScraperType: inferSourceScraperType(candidate),
    sourceContentSignature: candidate.sourceContentSignature,
  });

  const status: PublicSharedEventCandidateStatus = result.queued
    ? 'queued_city_level_review'
    : 'venue_unresolved';
  await markCandidateAndPrivateEvent({
    candidate,
    status,
    publicCityLevelReviewDocId: result.docId,
    updates: {
      cityLevelReviewDocId: result.docId,
      promotionResult: {
        status,
        reason: result.reason || 'city_level_location',
        cityLevelReviewDocId: result.docId,
      },
    },
  });

  return {
    status,
    candidateId,
    cityLevelReviewDocId: result.docId,
    reason: result.reason || 'city_level_location',
  };
}

async function queueUnresolvedPublicCandidate(
  candidate: PublicSharedEventCandidateRecord,
  reason: string
): Promise<SharedEventPromotionOutcome> {
  const candidateId = firstText(candidate.id);
  const venueName = firstText(candidate.locationName, candidate.visibilityEvidence?.locationName, candidate.title);
  const queueResult = venueName
    ? await firestoreService.queueUnrecognizedVenue({
        venueName,
        source: 'full5stage_event',
        parserMode: 'full5stage',
        rowIndex: 0,
        fileId: `shared-event:${candidate.ingestId}`,
        fileName: 'public_shared_event_candidate',
        aggregatorName: venueName,
        aggregatorFacebookUrl: firstText(candidate.sourceUrl, candidate.visibilityEvidence?.url),
        topLevelUrl: firstText(candidate.sourceUrl, candidate.visibilityEvidence?.url),
        sourceUniqueId: firstText(
          candidate.visibilityEvidence?.sourcePostId,
          candidate.sourceContentSignature,
          candidate.sourceUrl
        ),
        sourceContentSignature: candidate.sourceContentSignature,
        sharedEventCandidateId: candidateId,
        sharedEventPrivateEventId: candidate.privateEventId,
        sharedEventIngestId: candidate.ingestId,
        sharedEventOwnerUid: candidate.ownerUid,
        eventName: candidate.title,
        eventDate: candidate.startDate,
        eventTime: candidate.startTime,
        description: firstText(candidate.description, candidate.visibilityEvidence?.description),
      }, {
        force: true,
        forceReason: 'public_shared_event_promotion',
      })
    : { queued: false, reason: 'missing_venue_name' };

  const status: PublicSharedEventCandidateStatus = queueResult.queued
    ? 'queued_unknown_venue'
    : 'venue_unresolved';
  const unknownVenueDocId = queueResult.docId;
  await markCandidateAndPrivateEvent({
    candidate,
    status,
    publicUnknownVenueDocId: unknownVenueDocId,
    updates: {
      unknownVenueDocId,
      promotionResult: {
        status,
        reason: queueResult.reason || reason,
        unknownVenueDocId,
      },
    },
  });

  return {
    status,
    candidateId,
    unknownVenueDocId,
    reason: queueResult.reason || reason,
  };
}

async function promoteClaimedCandidate(
  candidate: PublicSharedEventCandidateRecord
): Promise<SharedEventPromotionOutcome> {
  const candidateId = firstText(candidate.id);

  const reviewReason = getRequiredCandidateReviewReason(candidate);
  if (reviewReason) {
    await markCandidateAndPrivateEvent({
      candidate,
      status: 'needs_user_review',
      updates: {
        promotionResult: {
          status: 'needs_user_review',
          reason: reviewReason,
        },
      },
    });
    return { status: 'needs_user_review', candidateId, reason: reviewReason };
  }

  if (isExpiredCandidate(candidate)) {
    await markCandidateAndPrivateEvent({
      candidate,
      status: 'rejected_expired',
      updates: {
        promotionResult: {
          status: 'rejected_expired',
          reason: 'candidate_event_date_has_passed',
        },
      },
    });
    return {
      status: 'rejected_expired',
      candidateId,
      reason: 'candidate_event_date_has_passed',
    };
  }

  const resolvedVenue = await resolveVenue(candidate);
  if (!resolvedVenue.venue?.id) {
    const cityLevelLocation = getCityLevelLocationDetails(
      firstText(candidate.locationName, candidate.visibilityEvidence?.locationName)
    );
    if (cityLevelLocation) {
      return queueCityLevelPublicCandidate(candidate, cityLevelLocation);
    }
    return queueUnresolvedPublicCandidate(candidate, 'venue_not_matched');
  }

  const venue = resolvedVenue.venue;
  const venueId = String(venue.id || '').trim();
  const eventData = buildPublicSharedEventData(candidate, venue, resolvedVenue.subVenue);
  const duplicate = await firestoreService.checkDuplicate(eventData, venueId);

  if (duplicate.isDuplicate) {
    const existingEventId = firstText(duplicate.existingEvent?.id);
    const eventPath = existingEventId ? `venues/${venueId}/events/${existingEventId}` : undefined;
    await markCandidateAndPrivateEvent({
      candidate,
      status: 'duplicate_existing',
      publicVenueId: venueId,
      publicEventId: existingEventId,
      publicEventPath: eventPath,
      updates: {
        duplicateVenueId: venueId,
        duplicateEventId: existingEventId,
        duplicateEventPath: eventPath,
        promotionResult: {
          status: 'duplicate_existing',
          venueId,
          venueName: getVenueDisplayName(venue),
          duplicateEventId: existingEventId,
          eventPath,
        },
      },
    });
    return {
      status: 'duplicate_existing',
      candidateId,
      venueId,
      eventId: existingEventId,
      eventPath,
    };
  }

  const eventId = await firestoreService.createEvent(venueId, eventData);
  const eventPath = `venues/${venueId}/events/${eventId}`;
  await markCandidateAndPrivateEvent({
    candidate,
    status: 'promoted',
    publicVenueId: venueId,
    publicEventId: eventId,
    publicEventPath: eventPath,
    updates: {
      promotedVenueId: venueId,
      promotedEventId: eventId,
      promotedEventPath: eventPath,
      promotionResult: {
        status: 'promoted',
        venueId,
        venueName: getVenueDisplayName(venue),
        eventId,
        eventPath,
      },
    },
  });

  logger.info('Promoted public shared event candidate', {
    candidateId,
    venueId,
    eventId,
    title: candidate.title,
    sourceUrl: candidate.sourceUrl,
    matchType: resolvedVenue.matchType,
    subVenue: resolvedVenue.subVenue,
  });

  return {
    status: 'promoted',
    candidateId,
    venueId,
    eventId,
    eventPath,
  };
}

export async function processPublicSharedEventCandidateById(
  candidateId: string
): Promise<SharedEventPromotionOutcome> {
  const normalizedCandidateId = String(candidateId || '').trim();
  if (!normalizedCandidateId) {
    return { status: 'skipped', candidateId: '', reason: 'missing_candidate_id' };
  }

  const candidate = await sharedEventCandidateStore.claimPublicSharedEventCandidate(normalizedCandidateId);
  if (!candidate) {
    return {
      status: 'skipped',
      candidateId: normalizedCandidateId,
      reason: 'candidate_not_pending_validation',
    };
  }

  try {
    return await promoteClaimedCandidate(candidate);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Public shared event candidate promotion failed', error, {
      candidateId: normalizedCandidateId,
    });
    await markCandidateAndPrivateEvent({
      candidate,
      status: 'failed',
      updates: {
        promotionError: message,
        promotionResult: {
          status: 'failed',
          reason: message,
        },
      },
    });
    return {
      status: 'failed',
      candidateId: normalizedCandidateId,
      reason: message,
    };
  }
}

export async function processPendingPublicSharedEventCandidates(
  limit = 10
): Promise<{
  processed: number;
  results: SharedEventPromotionOutcome[];
}> {
  const batchLimit = Math.max(1, Math.min(Number(limit || 10), 50));
  const candidates = await sharedEventCandidateStore.listPublicSharedEventCandidates({
    statuses: PROCESSABLE_STATUSES,
    limit: batchLimit,
  });

  const results: SharedEventPromotionOutcome[] = [];
  for (const candidate of candidates) {
    if (!candidate.id) continue;
    results.push(await processPublicSharedEventCandidateById(candidate.id));
  }

  return {
    processed: results.length,
    results,
  };
}
