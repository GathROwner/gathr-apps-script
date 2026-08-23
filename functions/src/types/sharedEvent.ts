export type SharedEventSourcePlatform = 'facebook' | 'instagram' | 'web' | 'unknown';

export type SharedEventSourceVisibility =
  | 'public_verified'
  | 'restricted_unverified'
  | 'user_private'
  | 'unknown';

export type SharedEventRouting = 'private_only' | 'public_candidate' | 'not_public_candidate';

export type SharedEventStatus =
  | 'needs_user_review'
  | 'saved'
  | 'submitted_public_candidate'
  | 'expired';

export type SharedEventProcessingStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed';

export type SharedEventFieldSource =
  | 'public_source'
  | 'share_payload'
  | 'shared_text'
  | 'uploaded_media'
  | 'user_confirmation'
  | 'crowd_consensus'
  | 'derived'
  | 'unknown';

export type SharedEventCrowdPromotionStatus =
  | 'ineligible'
  | 'collecting'
  | 'candidate_pending'
  | 'promoted'
  | 'duplicate_existing'
  | 'needs_review'
  | 'failed';

export interface SharedEventCrowdEventStatus {
  privateEventId: string;
  aggregateId?: string;
  publicCandidateId?: string;
  contributorCount: number;
  threshold: number;
  status: SharedEventCrowdPromotionStatus;
  reason?: string;
}

export interface SharedEventCrowdPromotionSummary {
  eligibleEventCount: number;
  collectingEventCount: number;
  candidateEventCount: number;
  reviewEventCount: number;
  promotedEventCount: number;
  threshold: number;
  maxContributorCount: number;
  events: SharedEventCrowdEventStatus[];
}

export type SharedEventFieldSources = Partial<Record<
  | 'title'
  | 'description'
  | 'startDate'
  | 'endDate'
  | 'startTime'
  | 'endTime'
  | 'locationName'
  | 'address'
  | 'mediaUrls',
  SharedEventFieldSource
>>;

export interface SharedEventSubmitPayload {
  sourceUrl?: string;
  url?: string;
  sharedText?: string;
  text?: string;
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  locationName?: string;
  venueName?: string;
  address?: string;
  mediaUrls?: string[];
  sourcePlatform?: string;
  sourceApp?: string;
  visibilityHint?: string;
  timezone?: string;
}

export interface SharedEventVisibilityEvidence {
  method: 'share_payload_hint' | 'public_url_probe' | 'no_url' | 'invalid_url' | 'not_checked';
  checkedAt: string;
  url?: string;
  httpStatus?: number;
  finalUrl?: string;
  reason: string;
  titleFound?: boolean;
  descriptionFound?: boolean;
  title?: string;
  description?: string;
  imageUrl?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  locationName?: string;
  address?: string;
  ogType?: string;
  sourcePostId?: string;
  sourceOwnerId?: string;
  sourcePublishedAt?: string;
  visibilityHint?: string;
}

export interface ParsedSharedEvent {
  sourceUrl?: string;
  sourcePlatform: SharedEventSourcePlatform;
  sourceVisibility: SharedEventSourceVisibility;
  visibilityEvidence: SharedEventVisibilityEvidence;
  routing: SharedEventRouting;
  status: SharedEventStatus;
  title: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  locationName?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  resolvedVenueId?: string;
  googlePlaceId?: string;
  venueResolutionStatus?: 'not_needed' | 'selection_required' | 'confirmed' | 'no_match';
  locationPrecision?: 'exact' | 'approximate' | 'none';
  locationScope?: 'venue' | 'route' | 'unknown';
  mapMode?: 'venue' | 'route' | 'none';
  contentKind?: 'event' | 'special';
  price?: string;
  relationshipType?: 'component_of' | 'supporting_special_for';
  parentEventTitle?: string;
  recurringPattern?: string;
  recurringDaysOfWeek?: string[];
  recurrenceUntilDate?: string;
  mediaUrls: string[];
  timezone: string;
  confidence: number;
  needsUserReview: boolean;
  reviewReasons: string[];
  fieldSources?: SharedEventFieldSources;
  isExpired?: boolean;
  sourceContentSignature: string;
  sequenceIndex?: number;
  extractedFromShare?: boolean;
}

export interface SharedEventVenueSuggestion {
  placeId: string;
  name: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  confidence: number;
}

export interface SharedEventIngestRecord {
  ownerUid: string;
  payload: SharedEventSubmitPayload;
  normalizedSourceUrl?: string;
  sourcePlatform: SharedEventSourcePlatform;
  sourceVisibility: SharedEventSourceVisibility;
  visibilityEvidence: SharedEventVisibilityEvidence;
  parserVersion: string;
  status: SharedEventStatus;
  routing: SharedEventRouting;
  processingStatus?: SharedEventProcessingStatus;
  processingError?: string;
  queuedAt?: unknown;
  startedAt?: unknown;
  completedAt?: unknown;
  failedAt?: unknown;
  privateEventId?: string;
  publicCandidateId?: string;
  privateEventIds?: string[];
  publicCandidateIds?: string[];
  eventLinks?: Array<{
    privateEventId: string;
    publicCandidateId?: string;
  }>;
  crowdPromotion?: SharedEventCrowdPromotionSummary;
  eventsPreview?: ParsedSharedEvent[];
  extractedEventCount?: number;
  scrapeEnrichment?: {
    status: 'reserved' | 'queued' | 'duplicate' | 'failed';
    enrichmentId?: string;
    reason?: string;
    actorId?: string;
    actorRunId?: string;
    datasetId?: string;
    runUrl?: string;
    existingStatus?: string;
    error?: string;
    checkedAt?: unknown;
    reservedAt?: unknown;
    queuedAt?: unknown;
    failedAt?: unknown;
  };
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PrivateSharedEventRecord extends ParsedSharedEvent {
  ownerUid: string;
  ingestId: string;
  publicCandidateId?: string;
  publicPromotionStatus?: PublicSharedEventCandidateStatus;
  publicVenueId?: string;
  publicEventId?: string;
  publicEventPath?: string;
  publicUnknownVenueDocId?: string;
  publicCityLevelReviewDocId?: string;
  crowdPromotion?: SharedEventCrowdEventStatus;
  venueResolutionSuggestions?: SharedEventVenueSuggestion[];
  venueResolutionSuggestionsAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type PublicSharedEventCandidateStatus =
  | 'pending_validation'
  | 'needs_user_review'
  | 'processing'
  | 'promoted'
  | 'duplicate_existing'
  | 'venue_unresolved'
  | 'queued_city_level_review'
  | 'queued_unknown_venue'
  | 'rejected_expired'
  | 'failed';

export interface PublicSharedEventCandidateRecord {
  id?: string;
  ownerUid: string;
  privateEventId: string;
  ingestId: string;
  sourceUrl?: string;
  sourcePlatform: SharedEventSourcePlatform;
  sourceVisibility: 'public_verified' | 'user_private';
  promotionBasis?: 'public_source' | 'crowd_consensus';
  visibilityEvidence: SharedEventVisibilityEvidence;
  title: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  locationName?: string;
  address?: string;
  contentKind?: 'event' | 'special';
  price?: string;
  relationshipType?: 'component_of' | 'supporting_special_for';
  parentEventTitle?: string;
  recurringPattern?: string;
  recurringDaysOfWeek?: string[];
  recurrenceUntilDate?: string;
  mediaUrls: string[];
  timezone: string;
  sourceContentSignature: string;
  fieldSources?: SharedEventFieldSources;
  crowdConsensus?: {
    aggregateId: string;
    contributorCount: number;
    threshold: number;
    contributorRefs: Array<{
      ownerUid: string;
      ingestId: string;
      privateEventId: string;
    }>;
  };
  reviewReasons?: string[];
  status: PublicSharedEventCandidateStatus;
  resolvedVenueId?: string;
  resolvedVenueName?: string;
  resolvedViaUnknownVenueDocId?: string;
  promotedVenueId?: string;
  promotedEventId?: string;
  promotedEventPath?: string;
  duplicateVenueId?: string;
  duplicateEventId?: string;
  duplicateEventPath?: string;
  unknownVenueDocId?: string;
  cityLevelReviewDocId?: string;
  promotionAttemptCount?: number;
  promotionLastAttemptAt?: unknown;
  promotionError?: string;
  promotionResult?: {
    status: PublicSharedEventCandidateStatus;
    reason?: string;
    venueId?: string;
    venueName?: string;
    eventId?: string;
    eventPath?: string;
    unknownVenueDocId?: string;
    cityLevelReviewDocId?: string;
    duplicateEventId?: string;
  };
  createdAt?: unknown;
  updatedAt?: unknown;
}
