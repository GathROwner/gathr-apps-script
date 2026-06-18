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
  mediaUrls: string[];
  timezone: string;
  confidence: number;
  needsUserReview: boolean;
  reviewReasons: string[];
  isExpired?: boolean;
  sourceContentSignature: string;
  sequenceIndex?: number;
  extractedFromShare?: boolean;
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
  privateEventId?: string;
  publicCandidateId?: string;
  privateEventIds?: string[];
  publicCandidateIds?: string[];
  eventLinks?: Array<{
    privateEventId: string;
    publicCandidateId?: string;
  }>;
  extractedEventCount?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PrivateSharedEventRecord extends ParsedSharedEvent {
  ownerUid: string;
  ingestId: string;
  publicCandidateId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PublicSharedEventCandidateRecord {
  ownerUid: string;
  privateEventId: string;
  ingestId: string;
  sourceUrl?: string;
  sourcePlatform: SharedEventSourcePlatform;
  sourceVisibility: 'public_verified';
  visibilityEvidence: SharedEventVisibilityEvidence;
  title: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  locationName?: string;
  address?: string;
  mediaUrls: string[];
  timezone: string;
  sourceContentSignature: string;
  status: 'pending_validation' | 'needs_user_review';
  createdAt?: unknown;
  updatedAt?: unknown;
}
