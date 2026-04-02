/**
 * Parsing Module - Public API
 *
 * This module provides the 5-stage parsing pipeline for extracting events
 * and specials from social media posts.
 *
 * Pipeline Overview:
 * - Stage 1: Content Validation (contentValidator.ts)
 * - Stage 2: Content Classification (contentClassifier.ts)
 * - Stage 3: Content Extraction (eventExtractor.ts)
 * - Stage 3.5: Facebook Events Time Resolution (postParser.ts)
 * - Stage 4: Secondary Validation (secondaryValidator.ts)
 * - Stage 5: Final Formatting (finalFormatter.ts)
 * - Stage 5.5: Hours-Based Time Resolution (venueResolver.ts)
 */

// Main entry point
export {
  parsePostData,
  ParsePostInput,
  ProcessedEvent,
  ParsingConfig,
  DEFAULT_PARSING_CONFIG,
  EstablishmentMap,
} from './postParser.js';

// Stage 1: Content Validation
export {
  validateContent,
  detectCalendarSignals,
} from './contentValidator.js';

// Stage 2: Content Classification
export { classifyContent } from './contentClassifier.js';

// Stage 3: Content Extraction
export {
  extractContentByType,
  detectRecurringPattern,
  extractDateFromText,
  getDayOfWeekFromPrefix,
} from './eventExtractor.js';

// Stage 4: Secondary Validation
export { performSecondaryValidation } from './secondaryValidator.js';

// Stage 5: Final Formatting
export { performFinalFormatting } from './finalFormatter.js';

// Stage 5.5: Hours-Based Time Resolution
export {
  resolveTimesWithOperatingHours,
  OperatingHours,
  DayHours,
} from './venueResolver.js';

// Types
export type {
  // Configuration
  ParsingConfig as ParsingConfigType,

  // Stage 1 Types
  ValidationResult,
  CalendarSignals,
  ImageAnalysis,

  // Stage 2 Types
  ClassificationResult,
  ContentType,
  ContentAnalysis,

  // Stage 3 Types
  ExtractedEvent,
  ExtractedSpecial,
  CalendarItem,
  ExtractedItem,
  ExtractionSummary,
  TimeFlags,
  RecurringPattern,

  // Stage 4 Types
  ValidatedItem,
  ValidationSummary,
  SecondaryValidationResult,

  // Stage 5 Types
  FormattedEvent,
  FormattingDecision,
  FormattingResult,
  Category,
  EventCategory,
  SpecialCategory,

  // Stage 5.5 Types
  TimeResolvedEvent,
  TimeResolution,

  // Final Output Types
  ProcessedEvent as ProcessedEventType,
  ExtractedDataInput,
  EstablishmentInfo,

  // GPT Types
  GPTFunctionSchema,
} from './types.js';
