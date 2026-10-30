/**
 * Parsing Module Type Definitions
 * Types for the 5-stage parsing pipeline ported from postParser.js
 */

import type { ModelSpatialEvidence, SpatialEventClassification } from './spatialEventClassifier.js';
import type { CalendarInventoryAdditionDecision, CalendarInventoryListing,
  CalendarInventoryReconciliation } from './calendarInventoryReconciliation.js';
import type { Stage2ScoreRoutingDecision } from './stage2Routing.js';
import type { SourceTimeConstraint, SourceMeridiemResolution, SourceDurationResolution } from './sourceTimeConstraints.js';

// ===================
// Venue/Hours Types (also in main types, duplicated here for module independence)
// ===================

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
// OCR Debug Types
// ===================

export interface OcrDebugSnapshot {
  inputUrls: string[];
  uploadedUrls: string[];
  tileUrls: string[];
  tileBaseMap?: Record<string, string>;
  calendarTiles?: boolean;
  ocrText?: string;
  ocrModel?: string;
  error?: string;
}

export interface Stage3FallbackSnapshot {
  contentType: ContentType;
  responseText: string;
  parsedItemCount: number;
  normalizedItemCount: number;
  selectedItemCount: number;
  usedParser: 'gpt_json' | 'schedule_text' | 'calendar_ocr' | 'none';
  notes?: string;
}

export interface ParseSkipReason {
  stage: 'precheck' | 'stage1' | 'stage2' | 'stage3' | 'stage4' | 'stage5' | 'pipeline';
  reason: string;
  detail?: string;
  /** A request/formatting failure is an error, not an ordinary content rejection. */
  failure?: boolean;
}

export type GptUsageStage =
  | 'ocr_debug'
  | 'stage1'
  | 'stage2'
  | 'stage3'
  | 'stage4'
  | 'stage5';

export interface GptUsageRecord {
  stage: GptUsageStage;
  component: string;
  endpoint: 'responses' | 'chat';
  model: string;
  imageCount?: number;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  responseId?: string;
  responseStatus?: string;
  incompleteReason?: string;
  requestedMaxOutputTokens?: number;
  reasoningTokens?: number;
  visibleOutputChars?: number;
  parsedItemCount?: number;
  batchOffset?: number;
  batchItemCount?: number;
}

export interface ParseStageArtifactsSnapshot {
  source: 'live' | 'replay';
  sourceCoverageHolds?: Array<{reason:string;imageIndices:number[]}>;
  artifactTruncation?: { originalBytes: number; maxBytes: number };
  contentType?: ContentType;
  stage1Validation?: ValidationResult;
  stage2Classification?: ClassificationResult;
  stage2Routing?: Stage2ScoreRoutingDecision;
  stage2RoutingEnvironment?: Record<string, string>;
  lunaDenseFrameIndices?: number[];
  lunaFullImageReady?: boolean;
  imageFrameManifest?: Array<{
    frameIndex: number;
    sourceGalleryIndex: number;
    kind: 'whole' | 'calendar_band';
    region?: { left: number; top: number; width: number; height: number };
  }>;
  stage3Items?: ExtractedItem[];
  stage3HeldItems?: ExtractedItem[];
  stage1Pilot?: { eligible: boolean; selected: boolean; percent: number; model: string; inputKind?: 'text_only' | 'image' };
  stage2Pilot?: { eligible: boolean; selected: boolean; percent: number; model: string; inputKind: 'text_only' | 'image' };
  stage5Pilot?: { eligible: boolean; selected: boolean; percent: number; model: string; reasoningEffort: string };
  stage3InputKind?: 'text_only' | 'image';
  stage4Items?: ExtractedItem[];
  stage4ValidationHold?: { format: 'compact_v1'; reason: string; attempts: number };
  stage56HeldItems?: TimeResolvedEvent[];
  stage37TicketUrl?: string;
}

export interface Stage45ReplayArtifacts {
  stage3Items?: ExtractedItem[];
  stage4Items?: ExtractedItem[];
  stage37TicketUrl?: string;
  contentType?: ContentType;
}

// ===================
// Configuration
// ===================

export interface CalendarInventoryAuditSnapshot {
  estimatedItemCount: number;
  primaryItemCount: number;
  readFrameIndices: number[];
  frameReadOutcomes: Array<{ frameIndex: number;
    status: 'completed' | 'empty_inventory' | 'empty_response' |
      'invalid_schema' | 'incomplete_response' | 'request_error';
    detail?: string }>;
  malformedListings: Array<{ frameIndex: number; sourceGalleryIndex: number;
    entryIndex: number; reason: string }>;
  rawListingCount: number;
  unresolvedListings: Array<{
    frameIndex: number;
    sourceGalleryIndex: number;
    title: string;
    dateHeading: string;
    startTime: string;
    endTime: string | null;
    venue: string | null;
    performers: string[];
    excerpt: string;
    reason: string;
  }>;
  reconciliation: CalendarInventoryReconciliation;
  listings: CalendarInventoryListing[];
  additionDecision: CalendarInventoryAdditionDecision;
  appliedAdditionCount: number;
}

export interface ParsingConfig {
  batchSize: number;
  maxRetries: number;
  confidenceThreshold: number;
  timezone: string;
  gptModelFast: string;
  gptModelReasoning: string;
  ticketLinkEnrichment?: {
    enabled?: boolean;
    allowedDomains?: string[];
    timeoutMs?: number;
    maxHtmlBytes?: number;
  };
  calendarLinkEnrichment?: {
    enabled?: boolean;
    timeoutMs?: number;
    maxHtmlBytes?: number;
    maxFeedDays?: number;
    maxDetailPages?: number;
  };
  venueWebsiteEnrichment?: {
    enabled?: boolean;
    timeoutMs?: number;
    maxHtmlBytes?: number;
    maxListingPages?: number;
    maxDetailPages?: number;
    maxScriptFetches?: number;
  };
  ocrDebugHandler?: (snapshot: OcrDebugSnapshot) => void | Promise<void>;
  stage3FallbackHandler?: (snapshot: Stage3FallbackSnapshot) => void | Promise<void>;
  skipReasonHandler?: (skipReason: ParseSkipReason) => void | Promise<void>;
  gptUsageHandler?: (usage: GptUsageRecord) => void | Promise<void>;
  stageArtifactsHandler?: (snapshot: ParseStageArtifactsSnapshot) => void | Promise<void>;
  replayArtifacts?: Stage45ReplayArtifacts;
  /** Local evaluator input. parsePostData rejects this unless both dry-run guards are enabled. */
  stage1EvaluationValidationOverride?: ValidationResult;
  stage1ModelOverride?: string;
  /** Production pilot: frozen compact-v10 prompt, high effort and menu gates. */
  stage1LunaPilot?: boolean;
  stage1PilotAllocationHandler?: (selected: boolean) => void;
  stage2ModelOverride?: string;
  /** GPT-6 Stage 2 only; omitted preserves the existing no-reasoning default. */
  stage2ReasoningEffort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  /** Opt-in bounded same-model high-effort review before accepting a fast Stage 2 hold. */
  stage2LunaNegativeRecheck?: boolean;
  stage3ModelOverride?: string;
  stage3ReasoningEffort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  stage3ImageDetail?: 'low' | 'high' | 'original' | 'auto';
  lunaCalendarLiteralSourcePrompt?: boolean;
  /** Opt-in Luna calendar transcription comparison; records disputes without changing extracted items. */
  calendarNameAdjudicationDiagnostics?: boolean;
  calendarNameDisputeHandler?: (disputes: Array<{
    itemIndex: number;
    date: string;
    sourceImageIndex: number;
    modelName: string;
    ocrCandidate: string;
    differingModelWord: string;
    differingOcrWord: string;
  }>) => void | Promise<void>;
  /** Off by default. A bounded second read can report or explicitly pilot guarded additions. */
  calendarInventoryAudit?: {
    enabled: boolean;
    estimatedItemCount: number;
    frameSourceGalleryIndices: number[];
    denseFrameIndices: number[];
    maxFrames?: number;
    /** Explicit pilot gate; false by default. Candidates still pass normal Stage 4/5. */
    applyAdditions?: boolean;
    handler?: (snapshot: CalendarInventoryAuditSnapshot) => void | Promise<void>;
  };
  stage4ModelOverride?: string;
  /** Disabled by default: strict identity-bound validation without copying source records. */
  stage4CompactValidation?: boolean;
  stage5ModelOverride?: string;
  stage5ReasoningEffortOverride?: 'none' | 'minimal' | 'low' | 'medium' | 'high';
  /** Validate large inventories in bounded batches without changing the model. */
  stage4BatchSize?: number;
  stage4BatchConcurrency?: number;
  /** Format large inventories in bounded nano batches. */
  stage5BatchSize?: number;
  stage5BatchConcurrency?: number;
  /** Local diagnostic only: omit unused formatting decision prose from Stage 5 output. */
  stage5MinimalOutputProbe?: boolean;
  /** Identifiers only, for correlating per-call timing without logging post content. */
  diagnosticContext?: { fileId: string; runId: string; rowIndex: number; postId: string };
  lunaCanaryBypass?: boolean;
  /** Used only by regular full-dataset runs after Stage 2 has passed. */
  lunaStage3EligibleSelector?: (postId: string, percent: number) => boolean;
}

export const DEFAULT_PARSING_CONFIG: ParsingConfig = {
  batchSize: 50,
  maxRetries: 3,
  confidenceThreshold: 0.6,
  timezone: 'America/Halifax',
  gptModelFast: 'gpt-5.2',
  gptModelReasoning: 'gpt-5.2',
  ticketLinkEnrichment: {
    enabled: true,
    allowedDomains: ['ticketpro.ca', 'ticketpro.com'],
    timeoutMs: 12000,
    maxHtmlBytes: 1000000,
  },
  calendarLinkEnrichment: {
    enabled: true,
    timeoutMs: 12000,
    maxHtmlBytes: 1000000,
    maxFeedDays: 8,
    maxDetailPages: 80,
  },
  venueWebsiteEnrichment: {
    enabled: true,
    timeoutMs: 12000,
    maxHtmlBytes: 1000000,
    maxListingPages: 2,
    maxDetailPages: 6,
    maxScriptFetches: 3,
  },
};

// ===================
// Stage 1: Validation Types
// ===================

export interface ImageAnalysis {
  imageIndex: number;
  description: string;
  relevanceToPost: string;
  imageComplexity?: ImageComplexity;
}

export interface ImageComplexity {
  hasCalendarGrid: boolean;
  hasDenseText: boolean;
  hasMultipleEventListings: boolean;
  isPromotionalPhoto: boolean;
  textDensityScore: number; // 0-1, higher means more OCR-relevant text
  recommendsTiling: boolean;
  recommendationReason: string;
}

export interface ValidationResult {
  imageAnalysis: ImageAnalysis[];
  hasValidContent: boolean;
  confidence: number;
  validationDecision: 'VALIDATION_PASSED' | 'VALIDATION_FAILED';
  reason: string;
}

export interface CalendarSignals {
  hasCalendar: boolean;
  timeLines: number;
  distinctVenues: number;
  weekdayCount: number;
  atCount: number;
}

// ===================
// Stage 2: Classification Types
// ===================

export interface ContentAnalysis {
  hasEvents: boolean;
  hasFoodSpecials: boolean;
  hasMultipleItems: boolean;
  organizationStyle: string;
}

export type ContentType =
  | 'EVENT'
  | 'FOOD_SPECIAL'
  | 'MIXED_EVENTS_AND_SPECIALS'
  | 'CALENDAR'
  | 'SCHEDULE'
  | 'unknown';

export interface ClassificationResult {
  contentAnalysis: ContentAnalysis;
  contentType: ContentType;
  confidence: number;
  classificationReason: string;
  estimatedItemCount: number;
}

// ===================
// Stage 3: Extraction Types
// ===================

export interface TimeFlags {
  start: {
    source: 'explicit' | 'implied' | 'semantic' | 'none';
    evidence: string;
  };
  end: {
    source?: 'explicit' | 'implied' | 'semantic' | 'none';
    toClose: boolean;
    evidence: string;
  };
}

export type RecurringWeekday =
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday';

export type RecurringPattern =
  | 'none'
  | 'daily'
  | 'weekly_custom'
  | 'weekly_monday'
  | 'weekly_tuesday'
  | 'weekly_wednesday'
  | 'weekly_thursday'
  | 'weekly_friday'
  | 'weekly_saturday'
  | 'weekly_sunday';
// NOTE: Monthly recurrence is used in legacy Apps Script and should be added in a dedicated recurrence pass.

export interface RecurrenceScheduleFields {
  _reviewedSourceImageLocation?: {sourceId:string;imageObject:string;venue:string;address:string};
  _itemEligibility?: 'ineligible';
  _sourceReviewMissing?: string[];
  _sourceId?: string;
  _sourcePublicationHold?: string;
  _sourceProgrammeMonthEnd?: string;
  sourceLocationRole?: 'shared_original_business' | 'collection_partner_only';
  _sourceWeeklyProgramPattern?: RecurringPattern;
  familyAudienceEvidence?: import('../services/familyAudienceEvidence.js').FamilyAudienceEvidence;
  _locationMentionResolution?: import('./locationMentionRoles.js').LocationMentionResolution;
  ticketLink?: string;
  _sourceTimeConstraint?: SourceTimeConstraint;
  _sourceMeridiemResolution?: SourceMeridiemResolution;
  _sourceDurationResolution?: SourceDurationResolution;
  _sourceTitleResolution?: string;
  _sourceOccurrenceDateHold?: boolean;
  _sourceOccurrenceCount?: number;
  recurringDaysOfWeek?: RecurringWeekday[];
  recurringWeekdaySequence?: RecurringWeekday[];
  recurringWeekInterval?: number;
}

export interface ExtractedEvent extends RecurrenceScheduleFields {
  name: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  venue: string;
  price: string;
  recurringPattern: RecurringPattern;
  relevantImageIndex?: number;
  totalOccurrences?: number;
  recurrenceUntilDate?: string;
  extractionReason: string;
  timeFlags?: TimeFlags;
  spatial?: ModelSpatialEvidence;
  _sourceType?: 'event' | 'special' | 'calendar' | 'schedule';
  _pipelineIndex?: number;
  _pipelineTotalStage3?: number;
  _dateSourcedFromUtcStartDate?: boolean;
  _timeSourcedFromUtcStartDate?: boolean;
  _ticketImageUrl?: string;
}

export interface ExtractedSpecial extends RecurrenceScheduleFields {
  name: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  venue: string;
  pricing: string;
  price?: string;
  discount?: string;
  additionalLocation?: string;
  recurringPattern: RecurringPattern;
  relevantImageIndex?: number;
  totalOccurrences?: number;
  recurrenceUntilDate?: string;
  extractionReason: string;
  timeFlags?: TimeFlags;
  spatial?: ModelSpatialEvidence;
  _sourceType?: 'event' | 'special' | 'calendar' | 'schedule';
  _pipelineIndex?: number;
  _pipelineTotalStage3?: number;
  _ticketImageUrl?: string;
}

export interface CalendarItem extends RecurrenceScheduleFields {
  name: string;
  type: 'event' | 'special';
  date: string;
  startTime: string;
  endTime?: string;
  venue: string;
  price?: string;
  description?: string;
  extractionReason?: string;
  day?: string;
  relevantImageIndex?: number;
  totalOccurrences?: number;
  recurrenceUntilDate?: string;
  timeFlags?: TimeFlags;
  spatial?: ModelSpatialEvidence;
  _sourceType?: 'calendar' | 'schedule';
  _ticketImageUrl?: string;
}

export interface ExtractionSummary {
  totalFound: number;
  extractionNotes: string;
  eventsFound?: number;
  specialsFound?: number;
  venuesFound?: number;
}

export type ExtractedItem = ExtractedEvent | ExtractedSpecial | CalendarItem;

// ===================
// Stage 4: Validation Types
// ===================

export interface ValidatedItem {
  sourceHoldReason?: 'unsupported_recurrence_correction';
  item: ExtractedItem;
  decision: 'KEPT' | 'REJECTED';
  reason: string;
  corrections?: {
    recurringPattern?: RecurringPattern;
    correctionReason?: string;
  };
}

export interface ValidationSummary {
  totalItems: number;
  itemsKept: number;
  itemsRejected: number;
  recurringCorrections: number;
  overallNotes: string;
}

export interface SecondaryValidationResult {
  validatedItems: ValidatedItem[];
  validationSummary: ValidationSummary;
}

// ===================
// Stage 5: Formatting Types
// ===================

export type EventCategory =
  | 'Live Music'
  | 'Trivia Night'
  | 'Comedy'
  | 'Cinema'
  | 'Workshops & Classes'
  | 'Religious'
  | 'Sports'
  // Read compatibility only. New parser output uses a primary category;
  // family suitability is stored separately as a score.
  | 'Family Friendly'
  | 'Gatherings & Parties'
  | 'DJ/Nightlife'
  | 'Karaoke'
  | 'Open Mic';

export type SpecialCategory =
  | 'Happy Hour'
  | 'Wing Night'
  | 'Food Special'
  | 'Drink Special';

export type Category = EventCategory | SpecialCategory;

export type CategoryNormalizationSource =
  | 'model_final'
  | 'alias_from_model_final'
  | 'stage3_hint'
  | 'alias_from_stage3_hint'
  | 'keyword_inference'
  | 'default_fallback';

export const ALLOWED_CATEGORIES: readonly Category[] = [
  'Live Music',
  'Trivia Night',
  'Comedy',
  'Cinema',
  'Workshops & Classes',
  'Religious',
  'Sports',
  'Gatherings & Parties',
  'DJ/Nightlife',
  'Karaoke',
  'Open Mic',
  'Happy Hour',
  'Wing Night',
  'Food Special',
  'Drink Special',
];

export interface FormattedEvent extends RecurrenceScheduleFields {
  ageRestriction?: string;
  timing?: unknown;
  isEvent: 'Yes' | 'No';
  isFoodSpecial: 'Yes' | 'No';
  category: Category;
  name: string;
  description: string;
  establishment: string;
  address: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  ticketPrice: string;
  ticketLink: string;
  relevantImageIndex: number;
  venue: string;
  additionalLocation: string;
  isRecurring: boolean | 'Yes' | 'No';
  recurringPattern: RecurringPattern;
  totalOccurrences?: number;
  recurrenceUntilDate?: string;
  timeFlags?: TimeFlags;
  spatial?: ModelSpatialEvidence;
  spatialEvidence?: SpatialEventClassification;
  // Metadata fields
  _pipelineIndex?: number;
  _pipelineTotalStage3?: number;
  _sourceType?: string;
  _ticketImageUrl?: string;
  _categoryOriginal?: string;
  _categoryHintOriginal?: string;
  _categorySource?: CategoryNormalizationSource;
  _categoryNormalizationReason?: string;
}

export interface FormattingDecision {
  itemName: string;
  typeDecision: string;
  categoryDecision: string;
  assumptions: string;
  venueDecision: string;
  establishmentDecision: string;
  additionalLocationDecision: string;
}

export interface FormattingResult {
  formattedEvents: FormattedEvent[];
  formattingDecisions: FormattingDecision[];
}

// ===================
// Stage 5.5: Time Resolution Types
// ===================

export interface TimeResolution {
  hoursUsed: boolean;
  offerAvailability?: import('./offerServiceHours.js').VerifiedOfferHours & {version: 1; startDate: string; endDate: string};
  startFromHours?: boolean;
  startFromPostTime?: boolean;
  endFromHours?: 'to_close' | 'category_default' | 'duration_default';
  startFromFacebookEvent?: boolean;
  endFromFacebookEvent?: 'dateTimeSentence' | 'duration' | 'descriptionRange';
  reason?: 'no_place_match' | 'no_hours' | 'no_date' | 'calendar_time_not_advertised' | 'category_default_bounded_by_venue_close' | 'venue_close_conflicts_with_start' | 'dated_offer_service_hours' | SourceTimeConstraint['reason'];
}

export interface TimeResolvedEvent extends FormattedEvent {
  timeResolution?: TimeResolution;
}

// ===================
// Final Output Types
// ===================

export type ImageProvenanceSource =
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

export type ImageProvenanceField =
  | 'image'
  | 'imageUrl'
  | 'relevantImageUrl'
  | 'mediaUrls'
  | 'icon'
  | 'sharedPostThumbnail'
  | 'cachedImageUrl';

export interface ImageProvenanceMediaRef {
  url: string;
  source: ImageProvenanceSource;
  field?: ImageProvenanceField;
  isPrimary?: boolean;
  isFallback?: boolean;
}

export interface ImageProvenance {
  version: 1;
  primarySource: ImageProvenanceSource;
  primaryField?: ImageProvenanceField;
  primaryUrl?: string;
  isFallback: boolean;
  sourceFields?: ImageProvenanceField[];
  media?: ImageProvenanceMediaRef[];
  selectionReason?: string;
  updatedBy?: string;
  setAt?: unknown;
}

export interface ProcessedEvent extends TimeResolvedEvent {
  structuredLocationValidation?: import('../services/structuredLocationContract.js').StructuredLocationValidation;
  // Core identification
  id?: string;
  uniqueId?: string;

  // Venue/location info
  cleanedFacebookUrl?: string;
  latitude?: number | string;
  longitude?: number | string;
  city?: string;
  streetAddress?: string;
  locationScope?: 'venue' | 'city' | 'area' | 'route' | 'unknown';
  locationLabel?: string;
  locationCity?: string;
  locationProvince?: string;
  locationPrecision?: 'exact' | 'approximate' | 'city_centroid' | 'none';
  locationReviewStatus?: 'not_needed' | 'needs_review' | 'approved' | 'rejected';

  // Media
  icon?: string;
  image?: string;
  relevantImageUrl?: string;
  sharedPostThumbnail?: string;
  mediaUrls?: string[];
  imageProvenance?: ImageProvenance;

  // Facebook metadata
  organizedBy?: string;
  usersResponded?: string;
  usersGoing?: string;
  usersInterested?: string;
  facebookUsersResponded?: string;
  utcStartDate?: string;
  ticketsBuyUrl?: string;
  ticketProvider?: string;
  likes?: number;
  shares?: number;
  comments?: number;
  topReactionsCount?: number;

  // Processing flags
  isAggregatorPost?: boolean;
  _skippedUnrecognizedVenue?: number;
}

// ===================
// Input Types
// ===================

export interface ParsePostInput {
  combinedText: string;
  mediaUrls: string[];
  sharedPostThumbnails: string[];
  userName: string;
  pageName: string;
  timestamp: string;
  facebookUrl: string;
  profilePicUrl?: string;
  extractedData?: ExtractedDataInput;
}

export interface ExtractedDataInput {
  id?: string;
  postId?: string;
  utcStartDate?: string;
  latitude?: number | string;
  longitude?: number | string;
  city?: string;
  streetAddress?: string;
  organizedBy?: string;
  usersResponded?: string;
  usersGoing?: string;
  usersInterested?: string;
  facebookUsersResponded?: string;
  ticketsBuyUrl?: string;
  ticketProvider?: string;
  likes?: number;
  shares?: number;
  comments?: number;
  topReactionsCount?: number;
  imageMediaSource?: ImageProvenanceSource;
  imageMediaSourceReason?: string;
}

export interface EstablishmentInfo {
  address?: string;
  category?: string;
  facebookUrl?: string;
  name?: string;
  website?: string;
}

export type EstablishmentMap = Record<string, EstablishmentInfo>;

// ===================
// GPT Schema Types
// ===================

export interface GPTFunctionSchema {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    additionalProperties: boolean;
    properties: Record<string, unknown>;
    required: string[];
  };
}
