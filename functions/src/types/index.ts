/**
 * GathR Cloud Functions Type Definitions
 */

// ===================
// Configuration Types
// ===================

export interface ProcessingConfig {
  batchSize: number;
  pauseBetweenBatchesMs: number;
  maxExecutionMs: number;
  gptModelFast: string;
  gptModelReasoning: string;
  parserMode: 'legacy' | 'full5stage';
  dryRun: boolean;
  verboseLogging: boolean;
}

export const DEFAULT_CONFIG: ProcessingConfig = {
  batchSize: 15,
  pauseBetweenBatchesMs: 10000,
  maxExecutionMs: 540000,
  gptModelFast: 'gpt-5.2',
  gptModelReasoning: 'gpt-5.2',
  parserMode: 'legacy',
  dryRun: false,
  verboseLogging: true,
};

// ===================
// Processing State Types
// ===================

export interface BatchState {
  fileId: string;
  fileName: string;
  runId?: string;
  totalRows: number;
  processedRows: number;
  currentRowIndex: number;
  batchNumber: number;
  status: 'pending' | 'processing' | 'paused' | 'completed' | 'failed';
  startedAt: Date;
  lastUpdatedAt: Date;
  error?: string;
  stats: ProcessingStats;
}

export interface ProcessingStats {
  processedCount: number;
  skippedCount: number;
  invalidCount: number;
  duplicateCount: number;
  errorCount: number;
  newEventsCreated: number;
  existingEventsUpdated: number;
  newStandardEventsCreated: number;
  existingStandardEventsUpdated: number;
  newFoodSpecialsCreated: number;
  existingFoodSpecialsUpdated: number;
}

export interface CheckpointData {
  fileId: string;
  runId?: string;
  rowIndex: number;
  batchNumber: number;
  stats: ProcessingStats;
  currentRunEntries: EventData[];
  timestamp: Date;
}

export interface ProcessingLock {
  fileId: string;
  runId: string;
  status: 'running' | 'paused' | 'completed' | 'failed';
  startedAt: Date;
  lastHeartbeat: Date;
  expiresAt: Date;
  source?: string;
}

// ===================
// Event Data Types
// ===================

export type RecurringWeekday =
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday';

export type EventImageProvenanceSource =
  | 'post_media'
  | 'profile_image'
  | 'ticket_image'
  | 'app_fallback'
  | 'venue_media_fallback'
  | 'dedupe_existing'
  | 'city_level_review'
  | 'manual'
  | 'no_image'
  | 'unknown';

export type EventImageProvenanceField =
  | 'image'
  | 'imageUrl'
  | 'relevantImageUrl'
  | 'mediaUrls'
  | 'icon'
  | 'sharedPostThumbnail'
  | 'cachedImageUrl';

export interface EventImageProvenanceMediaRef {
  url: string;
  source: EventImageProvenanceSource;
  field?: EventImageProvenanceField;
  isPrimary?: boolean;
  isFallback?: boolean;
}

export interface EventImageProvenance {
  version: 1;
  primarySource: EventImageProvenanceSource;
  primaryField?: EventImageProvenanceField;
  primaryUrl?: string;
  isFallback: boolean;
  sourceFields?: EventImageProvenanceField[];
  media?: EventImageProvenanceMediaRef[];
  selectionReason?: string;
  updatedBy?: string;
  setAt?: unknown;
}

export interface EventData {
  id?: string;
  uniqueId: string;
  establishment: string;
  locationScope?: 'venue' | 'city' | 'area' | 'route' | 'unknown';
  locationLabel?: string;
  locationCity?: string;
  locationProvince?: string;
  locationPrecision?: 'exact' | 'approximate' | 'city_centroid' | 'none';
  locationReviewStatus?: 'not_needed' | 'needs_review' | 'approved' | 'rejected';
  mapMode?: 'venue' | 'area' | 'none';
  cityLevelReviewId?: string;
  sourceScraperType?: ScraperType;
  additionalLocation?: string;
  subVenue?: string;
  eventType: string;
  eventName?: string;
  name?: string;
  description?: string;
  category?: string;
  isEvent?: boolean | 'Yes' | 'No' | null;
  isFoodSpecial?: boolean | 'Yes' | 'No' | null;
  startDate: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  price?: string;
  ticketPrice?: string;
  ticketLink?: string;
  isRecurring?: boolean | 'Yes' | 'No';
  recurringPattern?: string;
  recurringDaysOfWeek?: RecurringWeekday[];
  recurringWeekdaySequence?: RecurringWeekday[];
  recurringWeekInterval?: number;
  totalOccurrences?: number;
  recurrenceUntilDate?: string;
  ageRestriction?: string;
  imageUrl?: string;
  icon?: string;
  image?: string;
  cachedImageUrl?: string;
  relevantImageUrl?: string;
  sharedPostThumbnail?: string;
  mediaUrls?: string[];
  imageProvenance?: EventImageProvenance;
  facebookUrl?: string;
  cleanedFacebookUrl?: string;
  address?: string;
  latitude?: number | string;
  longitude?: number | string;
  city?: string;
  streetAddress?: string;
  organizedBy?: string;
  utcStartDate?: string;
  ticketsBuyUrl?: string;
  ticketProvider?: string;
  externalLinks?: string[];
  timeResolution?: unknown;
  timeFlags?: unknown;
  sourceTimestamp?: Date;
  sourceContentSignature?: string;
  lastSeenAt?: Date;
  usersResponded?: string;
  usersGoing?: string;
  usersInterested?: string;
  facebookUsersResponded?: string;
  likes?: number;
  shares?: number;
  comments?: number;
  topReactionsCount?: number;
  createdAt?: Date;
  updatedAt?: Date;
  venueId?: string | null;
}

export interface RawRowData {
  uniqueId?: string;
  text: string;
  sharedPostText?: string;
  ocrText?: string;
  mediaUrls: string[];
  userName: string;
  pageName: string;
  timestamp: string;
  facebookUrl?: string;
  topLevelUrl?: string;
  address?: string;
  profilePicUrl?: string;
  utcStartDate?: string;
  sourceScraperType?: ScraperType;
  facebookEventLocationName?: string;
  facebookEventLocationIsCityLevel?: boolean;
  facebookEventOrganizerName?: string;
  facebookEventDescription?: string;
  externalLinks?: string[];
  ticketsBuyUrl?: string;
  usersResponded?: string;
  usersGoing?: string;
  usersInterested?: string;
  facebookUsersResponded?: string;
  likes?: number;
  shares?: number;
  comments?: number;
  topReactionsCount?: number;
  sharedPostThumbnails?: string[];
}

export interface QueueCityLevelEventReviewInput {
  uniqueId?: string;
  fileId?: string;
  fileName?: string;
  rowIndex: number;
  parserMode?: 'legacy' | 'full5stage';
  eventName?: string;
  eventDate?: string;
  eventTime?: string;
  endDate?: string;
  endTime?: string;
  eventType?: string;
  category?: string;
  description?: string;
  imageUrl?: string;
  mediaUrls?: string[];
  usersResponded?: string;
  usersGoing?: string;
  usersInterested?: string;
  facebookUsersResponded?: string;
  likes?: number;
  shares?: number;
  comments?: number;
  topReactionsCount?: number;
  ticketsBuyUrl?: string;
  externalLinks?: string[];
  locationLabel: string;
  locationCity?: string;
  locationProvince?: string;
  locationScope?: 'city' | 'area';
  locationPrecision?: 'city_centroid' | 'approximate' | 'none';
  organizerName?: string;
  facebookUrl?: string;
  topLevelUrl?: string;
  sourceScraperType?: ScraperType;
  sourceContentSignature?: string;
}

export interface CityLevelEventReviewSample {
  fileId?: string;
  fileName?: string;
  rowIndex: number;
  parserMode?: 'legacy' | 'full5stage';
  eventName?: string;
  eventDate?: string;
  eventTime?: string;
  endDate?: string;
  endTime?: string;
  observedLocationName: string;
  organizerName?: string;
  facebookUrl?: string;
  topLevelUrl?: string;
  descriptionPreview?: string;
  imageUrl?: string;
  mediaUrls?: string[];
  usersResponded?: string;
  usersGoing?: string;
  usersInterested?: string;
  facebookUsersResponded?: string;
  likes?: number;
  shares?: number;
  comments?: number;
  topReactionsCount?: number;
  ticketsBuyUrl?: string;
  externalLinks?: string[];
  createdAt?: Date;
}

export interface CityLevelEventReviewRecord {
  id?: string;
  status: 'needs_review' | 'approved' | 'rejected' | 'published' | 'ignored';
  uniqueId?: string;
  fileId?: string;
  fileName?: string;
  rowIndex?: number;
  lastSeenFileId?: string;
  lastSeenRowIndex?: number;
  sourceScraperType?: ScraperType;
  sourceContentSignature?: string;
  locationScope: 'city' | 'area';
  locationLabel: string;
  locationCity?: string;
  locationProvince?: string;
  locationPrecision: 'city_centroid' | 'approximate' | 'none';
  locationReviewStatus: 'needs_review' | 'approved' | 'rejected';
  eventName?: string;
  eventDate?: string;
  eventTime?: string;
  endDate?: string;
  endTime?: string;
  eventType?: string;
  category?: string;
  descriptionPreview?: string;
  imageUrl?: string;
  mediaUrls?: string[];
  usersResponded?: string;
  usersGoing?: string;
  usersInterested?: string;
  facebookUsersResponded?: string;
  likes?: number;
  shares?: number;
  comments?: number;
  topReactionsCount?: number;
  ticketsBuyUrl?: string;
  externalLinks?: string[];
  organizerName?: string;
  facebookUrl?: string;
  topLevelUrl?: string;
  occurrences: number;
  sampleRows: CityLevelEventReviewSample[];
  publishedEventId?: string;
  publishedEventPath?: string;
  publishedAt?: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  notes?: string;
  finalization?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
  lastSeenAt?: Date;
}

export interface QueueCityLevelEventReviewResult {
  queued: boolean;
  docId?: string;
  created?: boolean;
  reason?: string;
}

export interface FinalizeCityLevelEventReviewInput {
  reviewId: string;
  action: 'approve_publish' | 'reject' | 'ignore';
  manual?: {
    eventName?: string;
    eventDate?: string;
    eventTime?: string;
    endDate?: string;
    endTime?: string;
    eventType?: string;
    category?: string;
    description?: string;
    locationLabel?: string;
    locationCity?: string;
    locationProvince?: string;
    locationScope?: 'city' | 'area';
    locationPrecision?: 'city_centroid' | 'approximate' | 'none';
    imageUrl?: string;
    mediaUrls?: string[];
    usersResponded?: string;
    usersGoing?: string;
    usersInterested?: string;
    facebookUsersResponded?: string;
    ticketsBuyUrl?: string;
    externalLinks?: string[];
  };
  notes?: string;
  resolvedBy?: string;
}

export interface FinalizeCityLevelEventReviewResult {
  success: boolean;
  reviewId: string;
  action: 'approve_publish' | 'reject' | 'ignore';
  status: CityLevelEventReviewRecord['status'];
  publishedEventId?: string;
  publishedEventPath?: string;
}

// ===================
// Venue Types
// ===================

export interface VenueData {
  id: string;
  name: string;
  normalizedName: string;
  aliases?: string[];
  aliasesNormalized?: string[];
  pagename?: string;
  pagenameSlug?: string;
  pagenameNormalized?: string;
  facebookUrl?: string;
  pageurl?: string;
  facebookSlug?: string;
  instagramUrl?: string;
  website?: string;
  address?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  latitude?: number | string;
  longitude?: number | string;
  phone?: string;
  email?: string;
  category?: string;
  profileImage?: string;
  profileImageSourceSignature?: string;
  operatingHours?: OperatingHours;
  operatingHoursUpdatedAt?: Date;
  googlePlaceId?: string;
  googlePlaceTypes?: string[];
  googleBusinessStatus?: string;
  googleRating?: number;
  googleUserRatingsTotal?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface OperatingHours {
  monday?: DayHours;
  tuesday?: DayHours;
  wednesday?: DayHours;
  thursday?: DayHours;
  friday?: DayHours;
  saturday?: DayHours;
  sunday?: DayHours;
}

export interface DayHours {
  open: string;
  close: string;
  closed?: boolean;
}

// ===================
// API Response Types
// ===================

export interface ProcessDatasetRequest {
  fileId: string;
  fileName?: string;
  resumeFromCheckpoint?: boolean;
  dryRun?: boolean;
  parserMode?: 'legacy' | 'full5stage';
  rowIndexes?: number[];
  rowIndex?: number;
  sourceUniqueIds?: string[];
  mediaOverrideUrl?: string;
}

export interface ProcessDatasetResponse {
  success: boolean;
  message: string;
  batchId?: string;
  stats?: ProcessingStats;
  nextBatchScheduled?: boolean;
  error?: string;
}

export interface ApifyWebhookPayload {
  eventType: ApifyEventType;
  eventData: ApifyEventData;
  createdAt: string;
  userId?: string;
  resource?: ApifyResourceInfo;
}

export type ApifyEventType =
  | 'ACTOR.RUN.SUCCEEDED'
  | 'ACTOR.RUN.FAILED'
  | 'ACTOR.RUN.ABORTED'
  | 'ACTOR.RUN.TIMED_OUT'
  | 'ACTOR.RUN.CREATED'
  | 'ACTOR.RUN.RESURRECTED';

export interface ApifyEventData {
  actorId: string;
  actorRunId: string;
  defaultDatasetId?: string;
  defaultKeyValueStoreId?: string;
  startedAt?: string;
  finishedAt?: string;
  status?: string;
  statusMessage?: string;
  exitCode?: number;
}

export interface ApifyResourceInfo {
  id: string;
  actId?: string;
  userId?: string;
  startedAt?: string;
  finishedAt?: string;
  status?: string;
  defaultDatasetId?: string;
  defaultKeyValueStoreId?: string;
}

export type ScraperType = 'posts' | 'events' | 'unknown';

export interface ApifyWebhookRecord {
  id?: string;
  eventType: ApifyEventType;
  actorId: string;
  actorRunId: string;
  datasetId?: string;
  scraperType: ScraperType;
  status: 'received' | 'processing' | 'completed' | 'failed' | 'skipped';
  receivedAt: Date;
  processedAt?: Date;
  fileId?: string;
  fileName?: string;
  processingResult?: {
    success: boolean;
    message?: string;
    error?: string;
    stats?: ProcessingStats;
  };
  error?: string;
}

// ===================
// Unrecognized Venues Queue
// ===================

export type UnrecognizedVenueStatus =
  | 'pending'
  | 'lookup_running'
  | 'candidate_found'
  | 'manual_review'
  | 'resolved_existing'
  | 'created_new'
  | 'ignored'
  | 'failed';

export interface UnrecognizedVenueSampleEvent {
  source: 'row_establishment' | 'item_candidate' | 'full5stage_event';
  parserMode?: 'legacy' | 'full5stage';
  rowIndex?: number;
  fileId?: string;
  fileName?: string;
  aggregatorName?: string;
  aggregatorFacebookUrl?: string;
  aggregatorAddress?: string;
  topLevelUrl?: string;
  sourceUniqueId?: string;
  sourceContentSignature?: string;
  sharedEventCandidateId?: string;
  sharedEventPrivateEventId?: string;
  sharedEventIngestId?: string;
  sharedEventOwnerUid?: string;
  eventName?: string;
  eventDate?: string;
  eventTime?: string;
  descriptionPreview?: string;
  observedVenueName?: string;
  observedVenueNormalized?: string;
  createdAt?: Date;
}

export interface UnrecognizedVenueSuggestedMatch {
  venueId?: string;
  venueName: string;
  confidence: number;
  matchType: 'alias' | 'exact' | 'fuzzy' | 'places' | 'apify' | 'manual';
  address?: string;
  facebookUrl?: string;
  note?: string;
}

export interface UnrecognizedVenueRecord {
  id?: string;
  establishment: string;
  establishmentNormalized: string;
  status: UnrecognizedVenueStatus;
  createdAt?: Date;
  updatedAt?: Date;
  lastSeenAt?: Date;
  occurrences: number;
  cityHint?: string;
  provinceHint?: string;
  aliasCandidates?: string[];
  sourceTypes?: string[];
  sourceUniqueIds?: string[];
  sourceContentSignaturesBySourceId?: Record<string, string>;
  sampleEvents?: UnrecognizedVenueSampleEvent[];
  suggestedMatches?: UnrecognizedVenueSuggestedMatch[];
  resolvedVenueId?: string;
  resolvedBy?: string;
  resolvedAt?: Date;
  notes?: string;
  testMode?: boolean;
}

export interface QueueUnrecognizedVenueInput {
  venueName: string;
  source: 'row_establishment' | 'item_candidate' | 'full5stage_event';
  parserMode?: 'legacy' | 'full5stage';
  rowIndex?: number;
  fileId?: string;
  fileName?: string;
  aggregatorName?: string;
  aggregatorFacebookUrl?: string;
  aggregatorAddress?: string;
  topLevelUrl?: string;
  sourceUniqueId?: string;
  sourceContentSignature?: string;
  sharedEventCandidateId?: string;
  sharedEventPrivateEventId?: string;
  sharedEventIngestId?: string;
  sharedEventOwnerUid?: string;
  eventName?: string;
  eventDate?: string;
  eventTime?: string;
  description?: string;
  cityHint?: string;
  provinceHint?: string;
}

export interface QueueUnrecognizedVenueResult {
  queued: boolean;
  docId?: string;
  reason?: string;
  testMode?: boolean;
}

// ===================
// GPT Service Types
// ===================

export interface GPTResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ===================
// Parsing Snapshot Types
// ===================

export interface ParseSnapshotStage {
  stage: 'validate' | 'classify' | 'extract' | 'validateItems' | 'format';
  success: boolean;
  output?: unknown;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens?: number;
  };
}

export interface ParseSnapshot {
  fileId: string;
  fileName?: string;
  rowIndex: number;
  uniqueId?: string;
  venueId?: string;
  establishment?: string;
  facebookUrl?: string;
  batchNumber?: number;
  inputText?: string;
  inputTextLength?: number;
  rowMeta?: Record<string, unknown>;
  stages: ParseSnapshotStage[];
  error?: string;
}

export interface ContentValidationResult {
  hasValidContent: boolean;
  confidence: number;
  reason?: string;
}

export interface ContentClassificationResult {
  contentType: 'event' | 'special' | 'announcement' | 'menu' | 'other';
  estimatedItemCount: number;
  confidence: number;
}

export interface ExtractedContent {
  items: ExtractedItem[];
  pipelineIndex: number;
  totalItems: number;
}

export interface ExtractedItem {
  eventType: string;
  eventName?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  price?: string;
  ageRestriction?: string;
  usersResponded?: string;
  likes?: number;
  shares?: number;
  comments?: number;
  topReactionsCount?: number;
  confidence: number;
  _pipelineIndex?: number;
  _pipelineTotalStage3?: number;
}

// ===================
// Google Places Types
// ===================

export interface PlaceSearchResult {
  placeId: string;
  name: string;
  formattedAddress: string;
  location: {
    lat: number;
    lng: number;
  };
  types: string[];
  businessStatus?: string;
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  formattedAddress: string;
  formattedPhoneNumber?: string;
  website?: string;
  location?: {
    lat: number;
    lng: number;
  };
  types?: string[];
  businessStatus?: string;
  openingHours?: {
    weekdayText: string[];
    periods: Array<{
      open: { day: number; time: string };
      close?: { day: number; time: string };
    }>;
  };
  rating?: number;
  userRatingsTotal?: number;
}

// ===================
// Match Result Types
// ===================

export interface MatchInfo {
  isMatch: boolean;
  matchType: 'exact' | 'fuzzy' | 'none';
  similarity: number;
  matchedVenue?: VenueData;
  matchedEvent?: EventData;
  rowIndex?: number;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  matchInfo?: MatchInfo;
  existingRecord?: EventData;
}

// ===================
// Field Change Types
// ===================

export type FieldImportance = 'critical' | 'important' | 'minor';

export interface FieldChangeResult {
  hasChanges: boolean;
  fields: string[];
  significantChanges: boolean;
  changes: Array<{
    field: string;
    importance: FieldImportance;
    oldValue: unknown;
    newValue: unknown;
  }>;
}

// ===================
// Logging Types
// ===================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  functionName?: string;
  fileId?: string;
  runId?: string;
  rowIndex?: number;
  batchNumber?: number;
  eventId?: string;
  venueId?: string;
  [key: string]: unknown;
}
