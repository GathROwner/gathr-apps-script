/**
 * Parsing Module Type Definitions
 * Types for the 5-stage parsing pipeline ported from postParser.js
 */

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
}

export interface ParseStageArtifactsSnapshot {
  source: 'live' | 'replay';
  contentType?: ContentType;
  stage3Items?: ExtractedItem[];
  stage4Items?: ExtractedItem[];
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
  stage4ModelOverride?: string;
  stage5ModelOverride?: string;
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
  'Family Friendly',
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
  startFromHours?: boolean;
  startFromPostTime?: boolean;
  endFromHours?: 'to_close' | 'category_default' | 'duration_default';
  startFromFacebookEvent?: boolean;
  endFromFacebookEvent?: 'dateTimeSentence' | 'duration';
  reason?: 'no_place_match' | 'no_hours' | 'no_date';
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
