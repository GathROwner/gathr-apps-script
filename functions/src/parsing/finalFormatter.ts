// @ts-nocheck
// TODO: Fix type errors introduced during Phase 6/7 updates
/**
 * Stage 5: Final Formatting
 * Ported from postParser.js - performFinalFormatting function
 *
 * Formats validated items into standardized event records ready for Firestore.
 * Handles category mapping, venue assignment, and field normalization.
 */

import OpenAI from 'openai';
import {
  ExtractedItem,
  FormattedEvent,
  FormattingDecision,
  FormattingResult,
  Category,
  CategoryNormalizationSource,
  ALLOWED_CATEGORIES,
  RecurringPattern,
  RecurringWeekday,
  TimeFlags,
  GPTFunctionSchema,
  ParsingConfig,
  DEFAULT_PARSING_CONFIG,
} from './types.js';
import {
  emitGptUsage,
  extractTokenUsage,
  resolveStageModel,
} from './runtimeConfig.js';
import { logger } from '../utils/logger.js';

// Initialize OpenAI client lazily
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable not set');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// Valid recurring patterns
const VALID_RECURRING_PATTERNS: RecurringPattern[] = [
  'none',
  'daily',
  'weekly_custom',
  'weekly_monday',
  'weekly_tuesday',
  'weekly_wednesday',
  'weekly_thursday',
  'weekly_friday',
  'weekly_saturday',
  'weekly_sunday',
];

const TOTAL_OCCURRENCE_FIELD_CANDIDATES = [
  'totalOccurrences',
  'occurrenceCount',
  'occurrences',
  'numberOfOccurrences',
  'numberOfRecurrences',
  'numRecurrences',
  'recurrenceCount',
  'totalRecurrences',
] as const;

const RECURRENCE_UNTIL_FIELD_CANDIDATES = [
  'recurrenceUntilDate',
  'recurrenceEndDate',
  'recurrenceUntil',
  'untilDate',
  'repeatUntil',
  'recursUntil',
] as const;

const WEEKDAY_TOKEN_TO_PATTERN: Record<string, RecurringPattern> = {
  monday: 'weekly_monday',
  mon: 'weekly_monday',
  tuesday: 'weekly_tuesday',
  tue: 'weekly_tuesday',
  tues: 'weekly_tuesday',
  wednesday: 'weekly_wednesday',
  wed: 'weekly_wednesday',
  thursday: 'weekly_thursday',
  thu: 'weekly_thursday',
  thur: 'weekly_thursday',
  thurs: 'weekly_thursday',
  friday: 'weekly_friday',
  fri: 'weekly_friday',
  saturday: 'weekly_saturday',
  sat: 'weekly_saturday',
  sunday: 'weekly_sunday',
  sun: 'weekly_sunday',
};

const WEEKDAY_INDEX_TO_PATTERN: RecurringPattern[] = [
  'weekly_sunday',
  'weekly_monday',
  'weekly_tuesday',
  'weekly_wednesday',
  'weekly_thursday',
  'weekly_friday',
  'weekly_saturday',
];

const WEEKDAY_TOKEN_TO_INDEX: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const CANONICAL_RECURRING_WEEKDAYS: RecurringWeekday[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

const WEEKDAY_TOKEN_TO_CANONICAL: Record<string, RecurringWeekday> = {
  sunday: 'sunday',
  sun: 'sunday',
  monday: 'monday',
  mon: 'monday',
  tuesday: 'tuesday',
  tue: 'tuesday',
  tues: 'tuesday',
  wednesday: 'wednesday',
  wed: 'wednesday',
  thursday: 'thursday',
  thu: 'thursday',
  thur: 'thursday',
  thurs: 'thursday',
  friday: 'friday',
  fri: 'friday',
  saturday: 'saturday',
  sat: 'saturday',
};

const MONTH_TOKEN_TO_NUMBER: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const COUNT_TOKEN_TO_NUMBER: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

// Category mappings
const FOOD_CATEGORIES: Category[] = ['Happy Hour', 'Wing Night', 'Food Special', 'Drink Special'];
const EVENT_CATEGORIES: Category[] = ALLOWED_CATEGORIES.filter(
  (category) => !FOOD_CATEGORIES.includes(category as Category)
) as Category[];
const ALLOWED_CATEGORY_SET = new Set(ALLOWED_CATEGORIES);
const DEFAULT_FALLBACK_CATEGORY_PREFERRED = 'Gatherings & Parties';
const CATEGORY_ALIAS_MAP: Record<string, Category> = {
  'dj/nightlife': 'Live Music',
  'open mic': 'Live Music',
};
const CATEGORY_ALIAS_RULES: Array<{ regex: RegExp; target: Category; note: string }> = [
  { regex: /\b(dj|nightlife|club|dance)\b/i, target: 'Live Music', note: 'dj/nightlife/club/dance' },
  { regex: /\b(open\s*mic|karaoke|jam)\b/i, target: 'Live Music', note: 'open mic/karaoke/jam' },
  { regex: /\b(concert|band|acoustic|live)\b/i, target: 'Live Music', note: 'concert/band/acoustic/live' },
  { regex: /\b(trivia|triva|quiz)\b/i, target: 'Trivia Night', note: 'trivia/quiz' },
  { regex: /\b(movie|film|cinema|screening)\b/i, target: 'Cinema', note: 'movie/film/cinema/screening' },
  { regex: /\b(comedy|stand\s*-?\s*up|improv)\b/i, target: 'Comedy', note: 'comedy/stand up/improv' },
  { regex: /\b(workshop|class|lesson|training|seminar)\b/i, target: 'Workshops & Classes', note: 'workshop/class/lesson/training/seminar' },
  { regex: /\b(kids|children|family|youth)\b/i, target: 'Family Friendly', note: 'kids/children/family/youth' },
  { regex: /\b(sport|game|tournament|match|skate|skating|rink|hockey)\b/i, target: 'Sports', note: 'sport/game/tournament/match/skate/rink/hockey' },
  { regex: /\b(social|mixer|networking|party|celebration|festival)\b/i, target: 'Gatherings & Parties', note: 'social/mixer/networking/party/celebration/festival' },
];
const WEAK_MODEL_FINAL_CATEGORIES = new Set<Category>(['Gatherings & Parties']);
const TARGETED_CATEGORY_HARDENING_RULES: Array<{ regex: RegExp; target: Category; note: string }> = [
  { regex: /\bsunday\s+sessions?\b/i, target: 'Live Music', note: 'targeted sunday sessions' },
  { regex: /\b(wine|wines)\b.*\btasting\b|\btasting\b.*\b(wine|wines)\b/i, target: 'Food Special', note: 'targeted wine tasting' },
  { regex: /\b(conversation|conversation\s+circle|language\s+exchange)\b/i, target: 'Workshops & Classes', note: 'targeted conversation/language exchange' },
  { regex: /\bbook\s*fair\b/i, target: 'Family Friendly', note: 'targeted book fair' },
  { regex: /\bpoetry\s+reading\b/i, target: 'Family Friendly', note: 'targeted poetry reading' },
  { regex: /\btableside\s+magic\b/i, target: 'Family Friendly', note: 'targeted tableside magic' },
  { regex: /\bopening\s+reception\b/i, target: 'Family Friendly', note: 'targeted opening reception' },
  { regex: /\bglow\s*&\s*flow\b|\bpilates\b/i, target: 'Workshops & Classes', note: 'targeted wellness/pilates session' },
];

interface CategoryNormalizationStats {
  modelFinalKept: number;
  aliasFromModelFinal: number;
  stage3Hint: number;
  aliasFromStage3Hint: number;
  keywordInference: number;
  defaultFallback: number;
  unknownRawCategoryLabels: Map<string, number>;
}

const ENABLE_RECURRENCE_LIFECYCLE_NORMALIZATION =
  process.env.ENABLE_RECURRENCE_LIFECYCLE_NORMALIZATION !== 'false';

/**
 * Stage 5: Format validated items into standardized event records
 */
export async function performFinalFormatting(
  validatedData: ExtractedItem[],
  userName: string,
  partialAddress: string,
  timestamp: string,
  config: Partial<ParsingConfig> = {},
  combinedText = ''
): Promise<FormattedEvent[]> {
  const cfg = { ...DEFAULT_PARSING_CONFIG, ...config };

  const expectedCount = validatedData.length;
  logger.info('Stage 5: Starting final formatting', {
    itemCount: expectedCount,
    userName,
  });

  const batchHeader = `BATCH COUNT ENFORCEMENT: You are formatting exactly ${expectedCount} validated items.
Return exactly ${expectedCount} objects in formattedEvents (one-to-one with the input order).
Do not drop, merge, or reorder items. Never return arrays of values for an item; each must be a JSON object.`;

  const prompt = batchHeader + '\n\n' + createFormattingPrompt(validatedData, userName, partialAddress, timestamp);
  const schema = createFormattingSchema();

  try {
    let response = await callGPTWithSchema(prompt, 'formatEvents', schema, cfg);

    // Validate and normalize response
    response = normalizeFormattingResponse(response, validatedData, expectedCount);

    if (!response.formattedEvents || !Array.isArray(response.formattedEvents)) {
      logger.error('Response missing formattedEvents array');
      return [];
    }

    // Filter out malformed entries
    const validFormattedEvents: FormattedEvent[] = [];
    const malformedIndices: number[] = [];

    response.formattedEvents.forEach((event, idx) => {
      const keys = Object.keys(event || {});
      const hasNumericKeys = keys.some((k) => /^\d+$/.test(k));
      const hasProperKeys = keys.includes('name') && keys.includes('category');

      if (hasNumericKeys || !hasProperKeys) {
        logger.error(`Item ${idx} is malformed`, { keys: keys.join(', ') });
        malformedIndices.push(idx);
      } else {
        validFormattedEvents.push(event);
      }
    });

    if (malformedIndices.length > 0) {
      logger.warn(`Found ${malformedIndices.length} malformed entries`, {
        indices: malformedIndices,
      });

      // If we lost more than half the data, this is a critical failure
      if (validFormattedEvents.length < validatedData.length / 2) {
        logger.error('Too many items lost to malformed response');
        return [];
      }
    }

    const categoryNormalizationStats = createCategoryNormalizationStats();

    // Process each formatted event
    const processedEvents = validFormattedEvents.map((event, index) => {
      const originalItem = validatedData[index];

      // Restore venue information from validated data if GPT changed it
      if (originalItem && 'venue' in originalItem && originalItem.venue && originalItem.venue.trim() !== '') {
        const originalVenue = originalItem.venue.trim();
        const currentVenue = (event.venue || '').trim();

        if (currentVenue !== originalVenue) {
          logger.debug(`Restoring venue for "${event.name}"`, {
            from: currentVenue,
            to: originalVenue,
          });
          event.venue = originalVenue;
          event.additionalLocation = originalVenue;
        }
      }

      // Apply category corrections
      event = applyCategoryCorrections(event, originalItem);

      // Correct weekday range windows for food specials (e.g., Tue-Sat) when GPT collapses to one day.
      event = applyWeekdayRangeCorrections(event, originalItem);

      // Correct explicit month/day ranges (e.g., "March 16-20") into start/end windows.
      event = applyExplicitDateRangeCorrections(event, originalItem);

      // Handle establishment override
      event = handleEstablishmentMapping(event, userName);

      // Final category guardrail (post-Stage-5 model output, pre-save).
      event = applyFinalCategoryNormalizationGuardrail(
        event,
        originalItem,
        categoryNormalizationStats
      );

      // Validate and correct isEvent/isFoodSpecial based on category
      event = validateEventTypeFlags(event);

      // Normalize recurrence pattern/flags/lifecycle fields after category/date corrections.
      if (ENABLE_RECURRENCE_LIFECYCLE_NORMALIZATION) {
        event = normalizeRecurringForFormattedEvent(event, originalItem);
      } else {
        event = applyLegacyRecurringNormalization(event);
      }

      event = rehydrateFormattedEventMetadata(event, originalItem);

      // Ensure isRecurring is properly set in canonical output format.
      const processedEvent: FormattedEvent = {
        ...event,
        isRecurring: isRecurringFlagEnabled(event.isRecurring) ? 'Yes' : 'No',
      };

      logger.debug(`Formatted "${event.name}"`, {
        isEvent: processedEvent.isEvent,
        category: processedEvent.category,
        establishment: processedEvent.establishment,
      });

      return processedEvent;
    });

    const workshopGroundedEvents = filterUnsupportedWorkshopBleed(processedEvents, combinedText);
    const sourceGroundedEvents = filterUnsupportedClosureFoodBleed(
      workshopGroundedEvents,
      combinedText
    );
    const cruiseFilteredEvents = filterCruiseShipLogisticsEvents(sourceGroundedEvents, combinedText);
    const promotedFiniteWeeklyEvents = promoteFiniteWeeklyOneOffSequences(cruiseFilteredEvents);
    const collapsedProcessedEvents = collapseRecurringSeriesEvents(promotedFiniteWeeklyEvents);

    // Final validation pass
    const validationErrors = runFinalValidation(collapsedProcessedEvents);
    if (validationErrors > 0) {
      logger.warn(`Found ${validationErrors} validation errors in formatted events`);
    }

    logger.info(`Stage 5 Result: Formatted ${collapsedProcessedEvents.length} items`);
    const unknownCategoryLabels = Array.from(
      categoryNormalizationStats.unknownRawCategoryLabels.entries()
    )
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
    logger.info('Stage 5 category normalization summary', {
      modelFinalKept: categoryNormalizationStats.modelFinalKept,
      normalizedByAlias:
        categoryNormalizationStats.aliasFromModelFinal +
        categoryNormalizationStats.aliasFromStage3Hint,
      aliasFromModelFinal: categoryNormalizationStats.aliasFromModelFinal,
      filledFromHint:
        categoryNormalizationStats.stage3Hint +
        categoryNormalizationStats.aliasFromStage3Hint,
      stage3HintDirect: categoryNormalizationStats.stage3Hint,
      aliasFromStage3Hint: categoryNormalizationStats.aliasFromStage3Hint,
      inferredByKeywords: categoryNormalizationStats.keywordInference,
      defaultFallbacks: categoryNormalizationStats.defaultFallback,
      unknownCategoryLabelCount: unknownCategoryLabels.length,
      unknownCategoryLabels,
      allowedCategoryCount: ALLOWED_CATEGORIES.length,
    });
    return collapsedProcessedEvents;
  } catch (error) {
    logger.error('Stage 5 formatting error', error);
    return [];
  }
}

function tryParseJson(text: string): FormattingResult | null {
  try {
    return JSON.parse(text) as FormattingResult;
  } catch {
    return null;
  }
}

function normalizeFormattingResult(parsed: FormattingResult): FormattingResult {
  const result = parsed && typeof parsed === 'object' ? parsed : ({} as FormattingResult);
  if (!Array.isArray(result.formattedEvents)) {
    result.formattedEvents = [];
  }
  if (!Array.isArray(result.formattingDecisions)) {
    result.formattingDecisions = [];
  }
  return result;
}

function normalizeJsonText(text: string): string {
  let normalized = String(text || '').trim();
  if (!normalized) return normalized;
  normalized = normalized.replace(/^\s*```(?:json)?/i, '');
  normalized = normalized.replace(/```\s*$/i, '');
  normalized = stripJsonComments(normalized);

  const firstBrace = normalized.indexOf('{');
  const lastBrace = normalized.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    normalized = normalized.slice(firstBrace, lastBrace + 1);
  }

  return normalized.trim();
}

function stripJsonComments(text: string): string {
  return text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function repairMalformedJson(jsonStr: string): string {
  let repaired = jsonStr;
  let previousRepaired: string;
  let iterations = 0;
  const maxIterations = 12;

  do {
    previousRepaired = repaired;
    iterations++;

    repaired = repaired.replace(/\bTrue\b/g, 'true');
    repaired = repaired.replace(/\bFalse\b/g, 'false');
    repaired = repaired.replace(/\bNone\b/g, 'null');
    repaired = quoteUnquotedKeys(repaired);
    repaired = quoteBarewordValuesForStage5(repaired);

    repaired = repaired.replace(/\}(\s*)\}(\s*),/g, '}$1,');
    repaired = repaired.replace(/\}(\s*)\}(\s*)\]/g, '}$1]');
    repaired = repaired.replace(/\}(\s*)\}(\s*)\](\s*),/g, '}$1]$3,');
    repaired = repaired.replace(/\}(\s*)\}(\s*)\}(\s*),/g, '}$1,');
    repaired = repaired.replace(/,(\s*)\]/g, '$1]');
    repaired = repaired.replace(/,(\s*)\}/g, '$1}');
    repaired = escapeUnescapedQuotesInStrings(repaired);
  } while (repaired !== previousRepaired && iterations < maxIterations);

  if (repaired !== jsonStr) {
    logger.debug(`Stage 5 JSON repairs applied in ${iterations} iteration(s)`);
  }

  return repaired;
}

function quoteUnquotedKeys(jsonStr: string): string {
  return jsonStr.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3');
}

function quoteBarewordValuesForStage5(jsonStr: string): string {
  let repaired = jsonStr;
  repaired = repaired.replace(/("isEvent"\s*:\s*)([A-Za-z_]+)(\s*[,\}])/g, '$1"$2"$3');
  repaired = repaired.replace(
    /("isFoodSpecial"\s*:\s*)([A-Za-z_]+)(\s*[,\}])/g,
    '$1"$2"$3'
  );
  repaired = repaired.replace(/("category"\s*:\s*)([A-Za-z_]+)(\s*[,\}])/g, '$1"$2"$3');
  repaired = repaired.replace(
    /("recurringPattern"\s*:\s*)([A-Za-z_]+)(\s*[,\}])/g,
    '$1"$2"$3'
  );
  return repaired;
}

function escapeUnescapedQuotesInStrings(jsonStr: string): string {
  let result = '';
  let inString = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    if (char === '"') {
      const escaped = isQuoteEscaped(jsonStr, i);
      if (!escaped) {
        if (!inString) {
          inString = true;
          result += char;
          continue;
        }
        const nextNonWhitespace = findNextNonWhitespaceChar(jsonStr, i + 1);
        if (!nextNonWhitespace || [',', '}', ']', ':'].includes(nextNonWhitespace)) {
          inString = false;
          result += char;
          continue;
        }
        result += '\\"';
        continue;
      }
    }
    result += char;
  }

  return result;
}

function findNextNonWhitespaceChar(str: string, startIndex: number): string | null {
  for (let i = startIndex; i < str.length; i++) {
    const char = str[i];
    if (!/\s/.test(char)) {
      return char;
    }
  }
  return null;
}

function isQuoteEscaped(str: string, index: number): boolean {
  let backslashCount = 0;
  for (let i = index - 1; i >= 0 && str[i] === '\\'; i--) {
    backslashCount++;
  }
  return backslashCount % 2 === 1;
}

function trimToLastCompleteJson(text: string): string | null {
  const firstBrace = text.indexOf('{');
  if (firstBrace === -1) return null;

  let depth = 0;
  let lastCompleteIndex = -1;
  let inString = false;

  for (let i = firstBrace; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && !isQuoteEscaped(text, i)) {
      inString = !inString;
    }
    if (inString) continue;
    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) {
        lastCompleteIndex = i;
      }
    }
  }

  if (lastCompleteIndex !== -1) {
    return text.slice(firstBrace, lastCompleteIndex + 1);
  }
  return null;
}

/**
 * Create the formatting prompt - exact port from postParser.js
 */
function createFormattingPrompt(
  items: ExtractedItem[],
  userName: string,
  partialAddress: string,
  timestamp: string
): string {
  return `Format these validated items into standardized event records.

CONTEXT:
- Posted by: ${userName}
- Default address: ${partialAddress}
- Posted at: ${timestamp}

CRITICAL VENUE PRESERVATION:
BEFORE formatting each item, check if it has a "venue" field with a value.
If venue exists and is not empty, you MUST set additionalLocation = venue value.

CRITICAL VENUE PRESERVATION & TIME PROVENANCE:
BEFORE formatting each item, check if it has a "venue" field with a value.
If venue exists and is not empty, you MUST set additionalLocation = venue value.
Do NOT leave additionalLocation blank if the original item had venue information.

TIME FLAGS (provenance) — REQUIRED FIELDS IN OUTPUT (do not invent content, only label what is present in the text):
- timeFlags.start.source: "explicit" | "implied" | "semantic"
- timeFlags.start.evidence: short phrase from the post that led to this (or "")
- timeFlags.end.source: "explicit" | "implied" | "semantic" | "none"
- timeFlags.end.toClose: boolean (true only if text clearly says "to close"/"till close"/"until close")
- timeFlags.end.evidence: short phrase (or "")
Do NOT convert "to close" or "all day" into clock times here. Just set the flags and keep times empty when applicable; Stage 5.5 will resolve using venue hours.

Do NOT leave additionalLocation blank if the original item had venue information.

CRITICAL IMAGE INDEX PRESERVATION:
If an input item already has relevantImageIndex, copy that exact integer into the formatted output.
Do NOT reselect, guess, or change relevantImageIndex during final formatting; the image-aware extraction stage chose it.

ITEMS TO FORMAT:
${JSON.stringify(items, null, 2)}

CRITICAL CATEGORIZATION INSTRUCTION:
Before formatting each event, assess the full event name/description and choose the category that best matches the observable context.

Special guidance:
- Only select **Trivia Night** when the name or description explicitly mentions core trivia cues (e.g., "trivia", "quiz", "game show", "name that tune", "pub quiz", "kahoot-style").
- If the venue text includes "Cinema" or the poster mentions "movie", "film", or "screening," select **Cinema**.
- If you see music-specific keywords (band, music, concert, singer, festival, DJ, performance, session, matinee, trio/duo) or performer names, **Live Music** is the best fit.
- Comedy should be reserved for shows/mentions of stand-up, improv, comedian, or laughter-driven promotions.
- Workshops & Classes are for educational, hands-on, or creation-focused activities.
- Religious sessions require faith-related wording.
- Sports events include game/match/tournament/league/marathon/championship/finals.
- "Gatherings & Parties" is the catch-all for social meet-ups.
- Reserve **Family Friendly** for general all-ages community events when no other category applies.
- For food/drink specials, select the appropriate special category.

FORMAT REQUIREMENTS:
1. Map venue field to additionalLocation
2. Convert dates to YYYY-MM-DD format
3. Times — OUTPUT FORMAT: Always return 24-hour "HH:mm"
4. Set isEvent="Yes" for events, "No" for specials
5. Set isFoodSpecial="Yes" for specials, "No" for events
6. Choose appropriate category based on type
7. Handle recurring items with isRecurring and recurringPattern.
   recurringPattern MUST be one of:
   "none", "daily", "weekly_monday", "weekly_tuesday", "weekly_wednesday", "weekly_thursday", "weekly_friday", "weekly_saturday", "weekly_sunday"
   Never return plain "weekly"; use the specific weekday form when recurrence is weekly.
   Do not mark an item as recurring just because it names a weekday or explicit date such as "Saturday, May 30".
   Only mark recurring when the text explicitly says every/weekly/daily/repeats, lists multiple occurrence dates, or gives a date range for a series.
8. If recurrence lifecycle is explicit in text, include:
   - totalOccurrences: positive integer when text says "for X weeks/days/months"
   - recurrenceUntilDate: YYYY-MM-DD when text says "until/through/thru/till <date>"
   - If unknown, set totalOccurrences to 0 and recurrenceUntilDate to empty string.

CATEGORY MAPPING RULES:

FOR EVENTS (when isFoodSpecial="No"):
* Trivia Night: "trivia", "quiz", "game show", "name that tune", "pub quiz", "kahoot"
* Live Music: "band", "music", "singer", "concert", "performance", "sessions", performer names
* Comedy: "comedy", "stand-up", "improv", "comedian", "comic", "laugh", "funny"
* Workshops & Classes: "workshop", "class", "courses", "educational", "lesson", "seminar"
* Religious: "church", "service", "mass", "prayer", "faith", "bible"
* Sports: "game", "match", "tournament", "league", "athletic", "marathon"
* Gatherings & Parties: "party", "mixer", "networking", "social", "club gatherings", "book clubs"
* Family Friendly: General all-ages events for families/children

FOR SPECIALS (when isFoodSpecial="Yes"):
* Happy Hour: Time-specific drink discounts
* Wing Night: Wing specials specifically
* Food Special: All non-wing food deals
* Drink Special: Drink deals outside of happy hour

VENUE MAPPING RULES:
- Always check if the venue field exists in the item
- additionalLocation should be the venue name if it differs from ${userName}
- Leave additionalLocation empty if venue matches ${userName} or is not specified

RESPONSE STRUCTURE:
Return a JSON object with:
1. "formattedEvents": array of formatted event records
2. "formattingDecisions": array of objects explaining key formatting choices for each item

HARD SHAPE & COUNT INVARIANTS:
- The length of formattedEvents MUST equal items.length (one output object per input), and the order MUST be identical.
- Every formattedEvents[i] MUST be a JSON OBJECT (not an array/tuple).
- Required keys for each formattedEvents[i]:
  isEvent, isFoodSpecial, category, name, description, establishment, address, startDate, endDate, startTime, endTime, ticketPrice, ticketLink, relevantImageIndex, venue, additionalLocation, isRecurring, recurringPattern, totalOccurrences, recurrenceUntilDate`;
}

/**
 * Create the formatting schema for GPT function calling
 */
function createFormattingSchema(): GPTFunctionSchema[] {
  return [
    {
      name: 'formatEvents',
      description:
        'Format items into standardized event records. CRITICAL: Each item in formattedEvents MUST be a complete JSON object with ALL required fields.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          formattedEvents: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                isEvent: { type: 'string', enum: ['Yes', 'No'] },
                isFoodSpecial: { type: 'string', enum: ['Yes', 'No'] },
                category: {
                  type: 'string',
                  enum: [
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
                  ],
                },
                name: { type: 'string' },
                description: { type: 'string' },
                establishment: { type: 'string' },
                address: { type: 'string' },
                startDate: { type: 'string' },
                endDate: { type: 'string' },
                startTime: { type: 'string' },
                endTime: { type: 'string' },
                ticketPrice: { type: 'string' },
                ticketLink: { type: 'string' },
                relevantImageIndex: { type: 'integer' },
                venue: { type: 'string' },
                additionalLocation: { type: 'string' },
                isRecurring: { type: 'boolean' },
                recurringPattern: {
                  type: 'string',
                  enum: [
                    'none',
                    'daily',
                    'weekly_monday',
                    'weekly_tuesday',
                    'weekly_wednesday',
                    'weekly_thursday',
                    'weekly_friday',
                    'weekly_saturday',
                    'weekly_sunday',
                  ],
                },
                totalOccurrences: { type: 'integer' },
                recurrenceUntilDate: { type: 'string' },
              },
              required: [
                'isEvent',
                'isFoodSpecial',
                'category',
                'name',
                'description',
                'establishment',
                'address',
                'startDate',
                'endDate',
                'startTime',
                'endTime',
                'ticketPrice',
                'ticketLink',
                'relevantImageIndex',
                'venue',
                'additionalLocation',
                'isRecurring',
                'recurringPattern',
                'totalOccurrences',
                'recurrenceUntilDate',
              ],
            },
          },
          formattingDecisions: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                itemName: { type: 'string' },
                typeDecision: { type: 'string' },
                categoryDecision: { type: 'string' },
                assumptions: { type: 'string' },
                venueDecision: { type: 'string' },
                establishmentDecision: { type: 'string' },
                additionalLocationDecision: { type: 'string' },
              },
              required: [
                'itemName',
                'typeDecision',
                'categoryDecision',
                'assumptions',
                'venueDecision',
                'establishmentDecision',
                'additionalLocationDecision',
              ],
            },
          },
        },
        required: ['formattedEvents', 'formattingDecisions'],
      },
    },
  ];
}

/**
 * Normalize and enforce count on formatting response
 */
function normalizeFormattingResponse(
  response: FormattingResult,
  validatedData: ExtractedItem[],
  expectedCount: number
): FormattingResult {
  let formattedEvents = response.formattedEvents || [];

  // Deduplicate if GPT returned more than expected
  if (formattedEvents.length > expectedCount) {
    logger.debug(`GPT returned ${formattedEvents.length} items but expected ${expectedCount}`);

    const seen = new Map<string, boolean>();
    const deduplicated: FormattedEvent[] = [];

    for (const item of formattedEvents) {
      if (!item || !item.name) {
        deduplicated.push(item);
        continue;
      }

      const normName = String(item.name || '').toLowerCase().trim();
      const date = String(item.startDate || '').trim();
      const time = String(item.startTime || '').trim();
      const key = `${normName}|${date}|${time}`;

      if (!seen.has(key)) {
        seen.set(key, true);
        deduplicated.push(item);
      } else {
        logger.debug(`Removing GPT duplicate: "${item.name}" (${date} ${time})`);
      }
    }

    formattedEvents = deduplicated;
  }

  // Truncate extras if still more than expected
  if (formattedEvents.length > expectedCount) {
    logger.debug(`Truncating extras: ${formattedEvents.length} → ${expectedCount}`);
    formattedEvents = formattedEvents.slice(0, expectedCount);
  }

  // Soft-coerce: add any missing keys with safe defaults
  for (let i = 0; i < formattedEvents.length; i++) {
    let e = formattedEvents[i] || ({} as FormattedEvent);
    if (!('isEvent' in e)) e.isEvent = 'Yes';
    if (!('isFoodSpecial' in e)) e.isFoodSpecial = 'No';
    if (!('category' in e)) e.category = 'Gatherings & Parties';
    if (!('name' in e)) e.name = '';
    if (!('description' in e)) e.description = '';
    if (!('establishment' in e)) e.establishment = e.venue || '';
    if (!('address' in e)) e.address = '';
    if (!('startDate' in e)) e.startDate = '';
    if (!('endDate' in e)) e.endDate = e.startDate || '';
    if (!('startTime' in e)) e.startTime = '';
    if (!('endTime' in e)) e.endTime = '';
    if (!('ticketPrice' in e)) e.ticketPrice = '';
    if (!('ticketLink' in e)) e.ticketLink = '';
    if (!('relevantImageIndex' in e)) e.relevantImageIndex = 0;
    if (!('venue' in e)) e.venue = e.establishment || '';
    if (!('additionalLocation' in e)) e.additionalLocation = e.venue || '';
    if (!('isRecurring' in e)) e.isRecurring = false;
    if (!('recurringPattern' in e)) e.recurringPattern = 'none';
    if (!('totalOccurrences' in e)) e.totalOccurrences = 0;
    if (!('recurrenceUntilDate' in e)) e.recurrenceUntilDate = '';

    if (ENABLE_RECURRENCE_LIFECYCLE_NORMALIZATION) {
      e = normalizeRecurringForFormattedEvent(
        e,
        validatedData[i]
      );
    } else {
      e = applyLegacyRecurringNormalization(e);
    }

    formattedEvents[i] = e;
  }

  // Top-off: if fewer than expected, append placeholders
  if (formattedEvents.length < expectedCount) {
    const missing = expectedCount - formattedEvents.length;
    logger.debug(`Adding ${missing} placeholder items`);

    for (let i = formattedEvents.length; i < expectedCount; i++) {
      const src = validatedData[i] || ({} as ExtractedItem);
      formattedEvents.push({
        isEvent: 'Yes',
        isFoodSpecial: 'No',
        category: 'Gatherings & Parties',
        name: src.name || '',
        description: src.description || '',
        establishment: 'venue' in src ? src.venue || '' : '',
        address: '',
        startDate: src.date || '',
        endDate: src.date || '',
        startTime: src.startTime || '',
        endTime: src.endTime || '',
        ticketPrice: '',
        ticketLink: '',
        relevantImageIndex: 0,
        venue: 'venue' in src ? src.venue || '' : '',
        additionalLocation: 'venue' in src ? src.venue || '' : '',
        isRecurring: false,
        recurringPattern: 'none',
        totalOccurrences: 0,
        recurrenceUntilDate: '',
      });
    }
  }

  return {
    formattedEvents,
    formattingDecisions: response.formattingDecisions || [],
  };
}

export function rehydrateFormattedEventMetadata(
  event: FormattedEvent,
  originalItem?: ExtractedItem
): FormattedEvent {
  const nextEvent = { ...event } as FormattedEvent;
  let changed = false;

  const existingSourceType = String((event as Record<string, unknown>)._sourceType || '').trim();
  const originalSourceType = String((originalItem as Record<string, unknown> | undefined)?._sourceType || '').trim();
  if (!existingSourceType && originalSourceType) {
    nextEvent._sourceType = originalSourceType;
    changed = true;
  }

  const originalRelevantImageIndex = (originalItem as Record<string, unknown> | undefined)
    ?.relevantImageIndex;
  if (
    typeof originalRelevantImageIndex === 'number' &&
    Number.isInteger(originalRelevantImageIndex) &&
    originalRelevantImageIndex >= 0 &&
    nextEvent.relevantImageIndex !== originalRelevantImageIndex
  ) {
    nextEvent.relevantImageIndex = originalRelevantImageIndex;
    changed = true;
  }

  const existingTicketLink = String((event as Record<string, unknown>).ticketLink || '').trim();
  const originalTicketLink = String(
    (originalItem as Record<string, unknown> | undefined)?.ticketLink || ''
  ).trim();
  if (!existingTicketLink && originalTicketLink) {
    nextEvent.ticketLink = originalTicketLink;
    changed = true;
  }

  if (
    !hasMeaningfulFormattedTimeFlags((event as Record<string, unknown>).timeFlags) &&
    hasMeaningfulFormattedTimeFlags((originalItem as Record<string, unknown> | undefined)?.timeFlags)
  ) {
    nextEvent.timeFlags = cloneFormattedTimeFlags(
      (originalItem as Record<string, unknown> | undefined)?.timeFlags
    );
    changed = true;
  }

  return changed ? nextEvent : event;
}

function cloneFormattedTimeFlags(value: unknown): TimeFlags | undefined {
  const raw = value as Record<string, unknown> | null | undefined;
  if (!raw || typeof raw !== 'object') return undefined;

  const startRaw = ((raw.start as Record<string, unknown> | undefined) || {}) as Record<string, unknown>;
  const endRaw = ((raw.end as Record<string, unknown> | undefined) || {}) as Record<string, unknown>;
  const hasStart = Object.keys(startRaw).length > 0;
  const hasEnd = Object.keys(endRaw).length > 0;
  if (!hasStart && !hasEnd) return undefined;

  return {
    start: {
      source: normalizeFormattedTimeFlagSource(startRaw.source),
      evidence: String(startRaw.evidence || ''),
    },
    end: {
      source: normalizeFormattedTimeFlagSource(endRaw.source),
      toClose: Boolean(endRaw.toClose),
      evidence: String(endRaw.evidence || ''),
    },
  };
}

function normalizeFormattedTimeFlagSource(
  value: unknown
): 'explicit' | 'implied' | 'semantic' | 'none' {
  const normalized = String(value || '').trim().toLowerCase();
  if (
    normalized === 'explicit' ||
    normalized === 'implied' ||
    normalized === 'semantic' ||
    normalized === 'none'
  ) {
    return normalized;
  }
  return 'none';
}

function hasMeaningfulFormattedTimeFlags(value: unknown): boolean {
  const flags = cloneFormattedTimeFlags(value);
  if (!flags) return false;

  return Boolean(
    String(flags.start.source || '').trim() !== 'none' ||
      String(flags.start.evidence || '').trim() ||
      String(flags.end.source || '').trim() !== 'none' ||
      String(flags.end.evidence || '').trim() ||
      flags.end.toClose === true
  );
}

function detectExplicitFoodSpecialCategory(
  event: FormattedEvent,
  originalItem?: ExtractedItem
): Category | null {
  const text = `${event.name || ''} ${event.description || ''} ${String((originalItem as any)?.extractionReason || '')}`
    .toLowerCase()
    .trim();
  if (!text) return null;

  if (/\bhappy\s*hour\b/.test(text)) return 'Happy Hour';
  if (/\bwing\s*night\b/.test(text)) return 'Wing Night';

  const hasTwoCanDine = /\btwo\s+can\s+dine\b/.test(text) || /\b\d+\s*can\s+dine\b/.test(text);
  const hasPrice = /\$\s*\d+/.test(text);
  const hasNamedFoodCue =
    /\b(brunch|breakfast|lunch|dinner|menu|appetizer|mains?|dessert|prix fixe|set menu|deal|cocktail|cocktails|beer|wine|wines|mimosa|mimosas|burger|burgers|pizza|pizzas|taco|tacos|wing|wings)\b/.test(
      text
    );
  const hasPriceNearFoodCue = hasPrice && hasNamedFoodCue;
  const hasFoodOfferSignals =
    /\b(food|drink)\s+special\b/.test(text) ||
    hasNamedFoodCue ||
    hasTwoCanDine ||
    hasPriceNearFoodCue;

  const hasEventSignals =
    /\b(live music|concert|show|comedy|trivia|karaoke|open mic|workshop|class|festival|dj|performance|match|game|tournament|showdown|competition|contest)\b/.test(
      text
    );

  if (!hasFoodOfferSignals) return null;

  if (
    /\bcocktail\b/.test(text) &&
    !/\bcocktail\s+showdown\b/.test(text) &&
    !/\bcocktail\s+competition\b/.test(text) &&
    !hasEventSignals
  ) {
    return 'Drink Special';
  }

  if (hasTwoCanDine) return 'Food Special';

  if (!hasEventSignals || /\bbrunch\b/.test(text) || hasPriceNearFoodCue) {
    return 'Food Special';
  }

  return null;
}

function detectExplicitWorkshopCategory(
  event: FormattedEvent,
  originalItem?: ExtractedItem
): Category | null {
  const text = `${event.name || ''} ${event.description || ''} ${String((originalItem as any)?.extractionReason || '')}`
    .toLowerCase()
    .trim();
  if (!text) return null;

  const workshopIndicators = [
    /\bworkshop(s)?\b/,
    /\bclass(es)?\b/,
    /\blesson(s)?\b/,
    /\bseminar(s)?\b/,
    /\bcourse(s)?\b/,
    /\btraining\b/,
    /\bmasterclass\b/,
    /\bbootcamp\b/,
    /\blearn\s+to\b/,
    /\bintro(?:duction)?\s+to\b/,
    /\bbeginner\b/,
    /\bintermediate\b/,
    /\badvanced\b/,
    /\brebound\s*fit\b/,
    /\bbox\s*fit\b/,
    /\bline\s*dancing\b/,
    /\breiki\b/,
    /\bdrop\s*in\s*class(?:es)?\b/,
  ];

  const hasWorkshopSignal = workshopIndicators.some((re) => re.test(text));
  if (!hasWorkshopSignal) return null;

  const socialGatheringOnlySignals =
    /\b(party|mixer|networking|meet[- ]?up|book\s*club|club\s+night)\b/.test(text) &&
    !/\b(class|workshop|lesson|seminar|course|training|masterclass)\b/.test(text);
  if (socialGatheringOnlySignals) return null;

  return 'Workshops & Classes';
}

const ENABLE_SPARSE_VENUE_PRIORS = process.env.ENABLE_SPARSE_VENUE_PRIORS !== 'false';
const CINEMA_VENUE_PRIOR_PATTERNS: RegExp[] = [
  /\btivoli\b/,
  /\bcity\s+cinema\b/,
  /\bcinema\b/,
  /\bmovie\s+(theatre|theater|house)\b/,
  /\btheatre\b/,
  /\btheater\b/,
];
const LIVE_MUSIC_VENUE_PRIOR_PATTERNS: RegExp[] = [
  /\btrailside\b/,
  /\bbaba'?s\s+lounge\b/,
  /\bolde\s+dublin\b/,
  /\bold\s+triangle\b/,
  /\bslaymaker\s*(?:&|and)\s*nichols\b/,
];

function normalizeLooseText(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function buildCategoryInferenceText(
  event: FormattedEvent,
  originalItem?: ExtractedItem
): string {
  return normalizeLooseText(
    `${event.name || ''} ${event.description || ''} ${String((originalItem as any)?.extractionReason || '')}`
  );
}

function buildVenueHintText(event: FormattedEvent, originalItem?: ExtractedItem): string {
  return normalizeLooseText(
    `${event.venue || ''} ${event.establishment || ''} ${event.additionalLocation || ''} ${String((originalItem as any)?.venue || '')}`
  );
}

function hasCinemaSignals(text: string): boolean {
  return /\b(movie|film|cinema|screening|documentary|showtime|feature|premiere)\b/.test(text);
}

function hasStrongNonCinemaSignals(text: string): boolean {
  return /\b(trivia|quiz|comedy|comedian|stand-?up|improv|karaoke|open\s*mic|workshop|class|lesson|seminar|dj|nightlife|live\s+music|concert|band)\b/.test(
    text
  );
}

function hasCinemaStage3Hint(originalItem?: ExtractedItem): boolean {
  const hint = normalizeLooseText((originalItem as any)?.categoryHint);
  if (!hint) return false;
  return /\b(movie|film|cinema|screening)\b/.test(hint);
}

function hasStrongNonCinemaStage3Hint(originalItem?: ExtractedItem): boolean {
  const hint = normalizeLooseText((originalItem as any)?.categoryHint);
  if (!hint) return false;
  return /\b(live\s+music|music|band|concert|acoustic|dj|trivia|quiz|comedy|stand-?up|improv|workshop|class|lesson|social|mixer|networking|party|celebration|festival|skate|sports?)\b/.test(
    hint
  );
}

function applyCinemaVenueHardening(
  event: FormattedEvent,
  originalItem?: ExtractedItem
): FormattedEvent {
  const inferenceText = buildCategoryInferenceText(event, originalItem);
  const venueHintText = buildVenueHintText(event, originalItem);
  const isCinemaVenue = CINEMA_VENUE_PRIOR_PATTERNS.some((pattern) => pattern.test(venueHintText));
  const hasCinemaCue = hasCinemaSignals(inferenceText);
  const hasNonCinemaCue = hasStrongNonCinemaSignals(inferenceText);
  const hasCinemaHint = hasCinemaStage3Hint(originalItem);
  const hasNonCinemaHint = hasStrongNonCinemaStage3Hint(originalItem);
  const performerLikeTitle = looksPerformerLikeTitle(event.name || '');

  if (
    isCinemaVenue &&
    (hasCinemaCue ||
      hasCinemaHint ||
      (!hasNonCinemaCue && !hasNonCinemaHint && !performerLikeTitle)) &&
    event.category !== 'Cinema'
  ) {
    logger.debug(`Cinema venue hardening: "${event.name}" -> Cinema`, {
      from: event.category,
      venueHint: venueHintText,
      reason: hasCinemaCue
        ? 'cinema_content_cue'
        : hasCinemaHint
          ? 'cinema_stage3_hint'
          : 'cinema_venue_prior',
    });
    event.category = 'Cinema';
    return event;
  }

  if (
    event.category === 'Cinema' &&
    !isCinemaVenue &&
    !hasCinemaCue
  ) {
    const hintCategory = findAllowedCategory((originalItem as any)?.categoryHint);
    const replacement = hintCategory && hintCategory !== 'Cinema' ? hintCategory : 'Gatherings & Parties';
    logger.debug(`Cinema hardening fallback: "${event.name}" -> ${replacement}`, {
      from: event.category,
      venueHint: venueHintText,
      reason: hintCategory && hintCategory !== 'Cinema' ? 'stage3_hint' : 'no_cinema_signal',
    });
    event.category = replacement;
  }

  return event;
}

function isSparseAggregatorLikeItem(
  event: FormattedEvent,
  originalItem?: ExtractedItem
): boolean {
  const description = normalizeLooseText(event.description);
  const extractionReason = normalizeLooseText((originalItem as any)?.extractionReason);

  const detailChars = description.replace(/\s+/g, '').length + extractionReason.replace(/\s+/g, '').length;
  if (detailChars >= 90) return false;

  const richDetailSignals =
    /\b(ticket|tickets|doors|register|rsvp|presented|hosted|join us|starts? at|until|weekly|monthly)\b/.test(
      `${description} ${extractionReason}`
    );
  if (richDetailSignals) return false;

  return detailChars <= 45 || (!description && extractionReason.length <= 55);
}

function looksPerformerLikeTitle(name: string): boolean {
  const rawName = String(name || '').trim();
  if (!rawName) return false;

  const normalized = normalizeLooseText(rawName);
  if (
    /\b(trivia|triva|quiz|bingo|karaoke|open\s*mic|comedy|workshop|class|lesson|film|movie|screening|party|night|dj|dance|meetup|networking|book\s*club|fundraiser)\b/.test(
      normalized
    )
  ) {
    return false;
  }

  const tokens = rawName.split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 6) return false;

  const alphaTokens = tokens
    .map((token) => token.replace(/^[^A-Za-z]+|[^A-Za-z'`-]+$/g, ''))
    .filter((token) => /[A-Za-z]/.test(token));
  if (alphaTokens.length === 0) return false;
  const connectorTokens = new Set(['and', '&', 'with']);
  const meaningfulAlphaTokens = alphaTokens.filter(
    (token) => !connectorTokens.has(token.toLowerCase())
  );
  if (meaningfulAlphaTokens.length === 0) return false;

  const hasMusicRoleSignal = /\b(feat(?:uring)?|ft\.?|with|band|duo|trio|quartet|ensemble|singer|songwriter)\b/i.test(
    rawName
  );
  if (hasMusicRoleSignal) return true;

  const looksLikeProperNames =
    meaningfulAlphaTokens.length >= 2 &&
    meaningfulAlphaTokens.every(
      (token) => /^[A-Z][A-Za-z'`-]*$/.test(token) || /^[A-Z]{2,}$/.test(token)
    );
  if (looksLikeProperNames) return true;

  const singleStylizedName =
    meaningfulAlphaTokens.length === 1 &&
    /^[A-Z][A-Za-z]{4,}$/.test(meaningfulAlphaTokens[0]);
  return singleStylizedName;
}

function inferCategoryFromSparseVenuePriors(
  event: FormattedEvent,
  originalItem: ExtractedItem | undefined,
  normalizedText: string
): Category | null {
  if (!ENABLE_SPARSE_VENUE_PRIORS) return null;
  if (!isSparseAggregatorLikeItem(event, originalItem)) return null;

  // Trivia takes precedence, even for live-music-prior venues.
  if (/\b(trivia|triva)\b/.test(normalizedText) || /\bname\s+that\s+tune\b/.test(normalizedText) || /\bquiz\s+night\b/.test(normalizedText)) {
    return 'Trivia Night';
  }

  const venueHint = normalizeLooseText(
    `${event.venue || ''} ${event.establishment || ''} ${event.additionalLocation || ''} ${String((originalItem as any)?.venue || '')}`
  );
  if (!venueHint) return null;

  if (
    CINEMA_VENUE_PRIOR_PATTERNS.some((pattern) => pattern.test(venueHint)) &&
    !/\b(trivia|triva|quiz|workshop|class|seminar|lecture)\b/.test(normalizedText)
  ) {
    return 'Cinema';
  }

  if (LIVE_MUSIC_VENUE_PRIOR_PATTERNS.some((pattern) => pattern.test(venueHint))) {
    if (looksPerformerLikeTitle(event.name || '')) {
      return 'Live Music';
    }
  }

  return null;
}

function inferCategoryFromContent(
  event: FormattedEvent,
  originalItem?: ExtractedItem
): Category | null {
  const currentCategory = String(event.category || '').trim().toLowerCase();
  if (currentCategory !== 'gatherings & parties') {
    return null;
  }

  const text = buildCategoryInferenceText(event, originalItem);
  if (!text) return null;

  // Trivia
  if (/\b(trivia|triva)\b/.test(text) || /\bname\s+that\s+tune\b/.test(text) || /\bquiz\s+night\b/.test(text)) {
    return 'Trivia Night';
  }

  // Cinema
  if (
    /\bfilm\b/.test(text) ||
    /\bmovie\b/.test(text) ||
    /\bcinema\b/.test(text) ||
    /\bscreening\b/.test(text) ||
    /\bdocumentary\b/.test(text)
  ) {
    return 'Cinema';
  }

  // Live Music (including karaoke, open mic, DJ, dance party, club night)
  if (
    /\blive\s+(music|band|performance|show)\b/.test(text) ||
    /\blive\s+at\b/.test(text) ||
    /\bconcert\b/.test(text) ||
    /\bperform(?:ing)?\s+live\b/.test(text) ||
    /\bopen\s*mic\b/.test(text) ||
    /\bkaraoke\b/.test(text) ||
    /\bdj\b/.test(text) ||
    /\bdance\s+party\b/.test(text) ||
    /\bclub\s+night\b/.test(text) ||
    /\bnightlife\b/.test(text)
  ) {
    return 'Live Music';
  }

  // Comedy
  if (
    /\bcomedy\b/.test(text) ||
    /\bcomedian\b/.test(text) ||
    /\bcomic\b/.test(text) ||
    /\bstand-?up\b/.test(text) ||
    /\bimprov\b/.test(text)
  ) {
    return 'Comedy';
  }

  // Workshops and classes
  if (
    /\bworkshop(s)?\b/.test(text) ||
    /\bclass(es)?\b/.test(text) ||
    /\blesson(s)?\b/.test(text) ||
    /\bseminar(s)?\b/.test(text) ||
    /\bcourse(s)?\b/.test(text) ||
    /\bmasterclass\b/.test(text) ||
    /\btraining\b/.test(text)
  ) {
    return 'Workshops & Classes';
  }

  // Sports (including skating/rink cues)
  if (
    /\bsport(s)?\b/.test(text) ||
    /\b(game|match|tournament|league|playoff|championship)\b/.test(text) ||
    /\b(skate|skating|rink|hockey|soccer|basketball|baseball|football|volleyball|pickleball)\b/.test(
      text
    )
  ) {
    return 'Sports';
  }

  const sparsePriorCategory = inferCategoryFromSparseVenuePriors(event, originalItem, text);
  if (sparsePriorCategory) {
    return sparsePriorCategory;
  }

  return null;
}

function createCategoryNormalizationStats(): CategoryNormalizationStats {
  return {
    modelFinalKept: 0,
    aliasFromModelFinal: 0,
    stage3Hint: 0,
    aliasFromStage3Hint: 0,
    keywordInference: 0,
    defaultFallback: 0,
    unknownRawCategoryLabels: new Map<string, number>(),
  };
}

function normalizeCategoryLabel(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function findAllowedCategory(value: unknown): Category | null {
  const raw = normalizeCategoryLabel(value);
  if (!raw) return null;
  if (ALLOWED_CATEGORY_SET.has(raw as Category)) {
    return raw as Category;
  }
  const matched = ALLOWED_CATEGORIES.find(
    (category) => category.toLowerCase() === raw.toLowerCase()
  );
  return (matched as Category) || null;
}

function getDefaultFallbackCategory(): Category {
  const preferred = findAllowedCategory(DEFAULT_FALLBACK_CATEGORY_PREFERRED);
  if (preferred) return preferred;
  return (ALLOWED_CATEGORIES[0] as Category) || ('Gatherings & Parties' as Category);
}

function noteUnknownCategoryLabel(stats: CategoryNormalizationStats, label: unknown): void {
  const raw = normalizeCategoryLabel(label);
  if (!raw) return;
  const key = raw.toLowerCase();
  stats.unknownRawCategoryLabels.set(key, (stats.unknownRawCategoryLabels.get(key) || 0) + 1);
}

function tryAliasToAllowedCategory(rawLabel: unknown): { category: Category | null; note: string } {
  const raw = normalizeCategoryLabel(rawLabel);
  if (!raw) return { category: null, note: '' };
  for (const rule of CATEGORY_ALIAS_RULES) {
    if (rule.regex.test(raw)) {
      return { category: rule.target, note: rule.note };
    }
  }
  return { category: null, note: '' };
}

function inferCategoryFromKeywordsForGuardrail(
  event: FormattedEvent,
  originalItem: ExtractedItem | undefined
): { category: Category | null; note: string } {
  const haystack = normalizeLooseText(
    `${event.name || ''} ${event.description || ''} ${String((originalItem as any)?.extractionReason || '')}`
  );
  if (!haystack) return { category: null, note: '' };

  for (const rule of TARGETED_CATEGORY_HARDENING_RULES) {
    if (rule.regex.test(haystack)) {
      return { category: rule.target, note: `matched targeted keywords: ${rule.note}` };
    }
  }

  for (const rule of CATEGORY_ALIAS_RULES) {
    if (rule.regex.test(haystack)) {
      return { category: rule.target, note: `matched keywords: ${rule.note}` };
    }
  }
  return { category: null, note: '' };
}

function applyFinalCategoryNormalizationGuardrail(
  event: FormattedEvent,
  originalItem: ExtractedItem | undefined,
  stats: CategoryNormalizationStats
): FormattedEvent {
  const finalCategoryRaw = normalizeCategoryLabel(event.category);
  const categoryHintRaw = normalizeCategoryLabel((originalItem as any)?.categoryHint);

  event._categoryOriginal = finalCategoryRaw;
  event._categoryHintOriginal = categoryHintRaw;

  const setCategory = (
    category: Category,
    source: CategoryNormalizationSource,
    reason: string
  ): FormattedEvent => {
    event.category = category;
    event._categorySource = source;
    event._categoryNormalizationReason = reason;
    return event;
  };

  const isStrongUpgradeOverWeakFinal = (candidate: Category | null): boolean =>
    Boolean(
      candidate &&
        (!WEAK_MODEL_FINAL_CATEGORIES.has(candidate as Category) ||
          !WEAK_MODEL_FINAL_CATEGORIES.has((findAllowedCategory(finalCategoryRaw) || '') as Category))
    );

  // Priority 1: Keep model final category if it is already in the canonical basket.
  // Exception: Gatherings & Parties is treated as a weak/default label and gets a chance
  // to be upgraded by Stage 3 hint/keywords before being kept.
  const allowedFinal = findAllowedCategory(finalCategoryRaw);
  const weakModelFinal = Boolean(allowedFinal && WEAK_MODEL_FINAL_CATEGORIES.has(allowedFinal));
  if (allowedFinal && !weakModelFinal) {
    stats.modelFinalKept += 1;
    return setCategory(allowedFinal, 'model_final', `kept allowed model category "${allowedFinal}"`);
  }

  // Priority 2: Alias-map model final category into canonical basket.
  if (finalCategoryRaw) {
    noteUnknownCategoryLabel(stats, finalCategoryRaw);
    const aliasedFinal = tryAliasToAllowedCategory(finalCategoryRaw);
    if (aliasedFinal.category) {
      stats.aliasFromModelFinal += 1;
      return setCategory(
        aliasedFinal.category,
        'alias_from_model_final',
        `aliased model category "${finalCategoryRaw}" via ${aliasedFinal.note}`
      );
    }
  }

  // Priority 3: Use Stage 3 categoryHint if it is already allowed.
  const allowedHint = findAllowedCategory(categoryHintRaw);
  if (allowedHint && (!weakModelFinal || isStrongUpgradeOverWeakFinal(allowedHint))) {
    stats.stage3Hint += 1;
    return setCategory(
      allowedHint,
      'stage3_hint',
      `used Stage 3 categoryHint "${categoryHintRaw}" (allowed)`
    );
  }

  // Priority 4: Alias-map Stage 3 categoryHint if needed.
  if (categoryHintRaw) {
    noteUnknownCategoryLabel(stats, categoryHintRaw);
    const aliasedHint = tryAliasToAllowedCategory(categoryHintRaw);
    if (aliasedHint.category && (!weakModelFinal || isStrongUpgradeOverWeakFinal(aliasedHint.category))) {
      stats.aliasFromStage3Hint += 1;
      return setCategory(
        aliasedHint.category,
        'alias_from_stage3_hint',
        `aliased Stage 3 categoryHint "${categoryHintRaw}" via ${aliasedHint.note}`
      );
    }
  }

  // Priority 5: Infer from semantic text (name + description + extractionReason).
  const inferred = inferCategoryFromKeywordsForGuardrail(event, originalItem);
  if (inferred.category && (!weakModelFinal || isStrongUpgradeOverWeakFinal(inferred.category))) {
    stats.keywordInference += 1;
    return setCategory(inferred.category, 'keyword_inference', inferred.note);
  }

  if (allowedFinal && weakModelFinal) {
    stats.modelFinalKept += 1;
    return setCategory(
      allowedFinal,
      'model_final',
      `kept weak model category "${allowedFinal}" after no stronger hint/keyword evidence`
    );
  }

  // Priority 6: Deterministic fallback.
  const fallback = getDefaultFallbackCategory();
  stats.defaultFallback += 1;
  return setCategory(
    fallback,
    'default_fallback',
    `no model/hint/keyword match; defaulted to "${fallback}"`
  );
}

/**
 * Apply category corrections based on content analysis
 */
function applyCategoryCorrections(
  event: FormattedEvent,
  originalItem: ExtractedItem | undefined
): FormattedEvent {
  const rawCategory = String(event.category || '').trim();
  const normalizedAlias = CATEGORY_ALIAS_MAP[rawCategory.toLowerCase()];
  if (normalizedAlias && rawCategory !== normalizedAlias) {
    logger.debug(`Category alias normalization: "${event.name}" -> ${normalizedAlias}`, {
      from: rawCategory,
      to: normalizedAlias,
    });
    event.category = normalizedAlias;
  }

  const forcedFoodCategory = detectExplicitFoodSpecialCategory(event, originalItem);
  if (forcedFoodCategory && event.category !== forcedFoodCategory) {
    logger.debug(`Category safeguard: "${event.name}" → ${forcedFoodCategory}`);
    event.category = forcedFoodCategory;
  }

  const forcedWorkshopCategory = detectExplicitWorkshopCategory(event, originalItem);
  if (
    forcedWorkshopCategory &&
    event.category !== forcedWorkshopCategory &&
    event.category !== 'Live Music' &&
    event.category !== 'Comedy' &&
    event.category !== 'Trivia Night' &&
    event.category !== 'Cinema' &&
    event.category !== 'Open Mic' &&
    event.category !== 'Karaoke' &&
    event.category !== 'DJ/Nightlife'
  ) {
    logger.debug(`Category safeguard: "${event.name}" → ${forcedWorkshopCategory}`);
    event.category = forcedWorkshopCategory;
  }

  const inferredCategory = inferCategoryFromContent(event, originalItem);
  if (inferredCategory && event.category !== inferredCategory) {
    logger.debug(`Category inference: "${event.name}" → ${inferredCategory} (content/default)`);
    event.category = inferredCategory;
  }

  event = applyCinemaVenueHardening(event, originalItem);

  const textToCheck = `${event.name || ''} ${event.description || ''} ${'extractionReason' in (originalItem || {}) ? (originalItem as any).extractionReason || '' : ''}`.toLowerCase();

  const hasTriviaCue =
    /\b(trivia|triva)\b/.test(textToCheck) ||
    /\bquiz\b/.test(textToCheck) ||
    /\bname\s+that\s+tune\b/.test(textToCheck);
  if (hasTriviaCue && event.category !== 'Trivia Night') {
    logger.debug(`Category safeguard: "${event.name}" -> Trivia Night (trivia cue)`);
    event.category = 'Trivia Night';
  }

  const hasForKidsPhrase = /\bfor\s+kids\b/.test(textToCheck);
  if (hasForKidsPhrase && event.category !== 'Family Friendly') {
    logger.debug(`Category safeguard: "${event.name}" -> Family Friendly (for kids cue)`);
    event.category = 'Family Friendly';
  }

  // Art Party events → Gatherings & Parties
  if (event.category === 'Family Friendly' || event.category === 'Live Music') {
    const artPartyIndicators = [
      'art party',
      'paint party',
      'paint night',
      'paint your partner',
      'paint and sip',
      'sip and paint',
      'canvas and cocktails',
      'wine and canvas',
      'paint nite',
      'painting party',
    ];
    const hasArtPartyIndicator = artPartyIndicators.some((indicator) =>
      textToCheck.includes(indicator)
    );

    if (hasArtPartyIndicator) {
      logger.debug(`Category correction: "${event.name}" → Gatherings & Parties (art party)`);
      event.category = 'Gatherings & Parties';
    }
  }

  // Comedy vs Live Music correction
  if (event.category === 'Live Music') {
    const artPartyExclusions = [
      'art party',
      'paint party',
      'paint night',
      'paint your partner',
      'sip and paint',
      'paint and sip',
    ];
    const isArtParty = artPartyExclusions.some((indicator) => textToCheck.includes(indicator));

    if (!isArtParty) {
      const comedyIndicators = [
        'comedy',
        'comedian',
        'comic',
        'stand-up',
        'standup',
        'improv',
        'comedy award',
        'just for laughs',
        'the debaters',
        'last comic standing',
        'yuk yuk',
        'yukyuk',
        'comedy club',
        'comedy night',
        'laugh factory',
        'funny',
        'jokes',
        'hilarious',
      ];
      const hasComedyIndicator = comedyIndicators.some((indicator) =>
        textToCheck.includes(indicator)
      );

      if (hasComedyIndicator) {
        logger.debug(`Category correction: "${event.name}" → Comedy`);
        event.category = 'Comedy';
      }
    }
  }

  // Book Clubs → Gatherings & Parties
  if (event.category === 'Family Friendly') {
    const gatheringsIndicators = [
      'book club',
      'bookclub',
      'discussion group',
      'discussion club',
      'meetup',
      'meet-up',
      'meet up',
      'networking',
      'mixer',
      'social club',
      'club meeting',
      'club gathering',
    ];
    const hasGatheringsIndicator = gatheringsIndicators.some((indicator) =>
      textToCheck.includes(indicator)
    );

    if (hasGatheringsIndicator) {
      logger.debug(`Category correction: "${event.name}" → Gatherings & Parties (book club/meetup)`);
      event.category = 'Gatherings & Parties';
    }
  }

  return event;
}

/**
 * Handle establishment mapping with venue override logic
 */
function handleEstablishmentMapping(event: FormattedEvent, userName: string): FormattedEvent {
  // If establishment matches page name and we have an additionalLocation, use that instead
  if (
    event.establishment &&
    userName &&
    event.establishment.trim().toLowerCase() === userName.trim().toLowerCase() &&
    event.additionalLocation &&
    event.additionalLocation.trim() !== ''
  ) {
    logger.debug(`Overriding establishment with additionalLocation`, {
      from: event.establishment,
      to: event.additionalLocation,
    });
    event.establishment = event.additionalLocation;
  }

  // If establishment is empty, try to use venue
  if (!event.establishment || event.establishment.trim() === '') {
    event.establishment = event.venue || '';
  }

  return event;
}

/**
 * Validate and correct isEvent/isFoodSpecial based on category
 */
function validateEventTypeFlags(event: FormattedEvent): FormattedEvent {
  const forcedFoodCategory = detectExplicitFoodSpecialCategory(event);
  const forcedWorkshopCategory = detectExplicitWorkshopCategory(event);
  if (
    forcedFoodCategory &&
    !forcedWorkshopCategory &&
    (!event.category || EVENT_CATEGORIES.includes(event.category))
  ) {
    logger.debug(`Type safeguard: forcing food category for "${event.name}"`, {
      from: event.category,
      to: forcedFoodCategory,
    });
    event.category = forcedFoodCategory;
  }

  if (event.category && FOOD_CATEGORIES.includes(event.category)) {
    // This is a food special
    if (event.isEvent !== 'No' || event.isFoodSpecial !== 'Yes') {
      logger.debug(`Correcting type flags for food special "${event.name}"`, {
        category: event.category,
      });
      event.isEvent = 'No';
      event.isFoodSpecial = 'Yes';
    }
  } else if (event.category && EVENT_CATEGORIES.includes(event.category)) {
    // This is an event
    if (event.isEvent !== 'Yes' || event.isFoodSpecial !== 'No') {
      logger.debug(`Correcting type flags for event "${event.name}"`, {
        category: event.category,
      });
      event.isEvent = 'Yes';
      event.isFoodSpecial = 'No';
    }
  }

  return event;
}

/**
 * Run final validation checks on processed events
 */
function runFinalValidation(events: FormattedEvent[]): number {
  let validationErrors = 0;

  events.forEach((evt, idx) => {
    const normalizedCategory = findAllowedCategory(evt.category);
    if (!evt.category || evt.category === ('undefined' as Category) || !normalizedCategory) {
      logger.error(`Event ${idx + 1} "${evt.name}" has invalid category: "${evt.category}"`);
      validationErrors++;
    }
    if (evt.isEvent === 'Yes' && evt.isFoodSpecial === 'Yes') {
      logger.error(`Event ${idx + 1} "${evt.name}" has both isEvent and isFoodSpecial set to Yes`);
      validationErrors++;
    }
    if (evt.isEvent !== 'Yes' && evt.isEvent !== 'No') {
      logger.error(`Event ${idx + 1} "${evt.name}" has invalid isEvent value: "${evt.isEvent}"`);
      validationErrors++;
    }
    if (evt.isFoodSpecial !== 'Yes' && evt.isFoodSpecial !== 'No') {
      logger.error(
        `Event ${idx + 1} "${evt.name}" has invalid isFoodSpecial value: "${evt.isFoodSpecial}"`
      );
      validationErrors++;
    }
  });

  return validationErrors;
}

const WORKSHOP_BLEED_SUPPORT_STOPWORDS = new Set([
  'ages',
  'and',
  'art',
  'beginner',
  'beginners',
  'canvas',
  'class',
  'classes',
  'confederation',
  'court',
  'course',
  'fit',
  'for',
  'introduction',
  'kids',
  'mall',
  'of',
  'supplies',
  'the',
  'to',
  'with',
  'workshop',
]);

function normalizeWorkshopSupportText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractWorkshopSupportTokens(name: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const token of normalizeWorkshopSupportText(name).split(' ')) {
    if (!token || token.length < 4) continue;
    if (WORKSHOP_BLEED_SUPPORT_STOPWORDS.has(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
  return tokens;
}

function countWorkshopNameSupport(name: string, combinedText: string): number {
  const supportText = normalizeWorkshopSupportText(combinedText);
  if (!supportText) return 0;
  const tokens = extractWorkshopSupportTokens(name);
  if (tokens.length === 0) return 0;
  return tokens.filter((token) => supportText.includes(token)).length;
}

function filterUnsupportedWorkshopBleed(
  events: FormattedEvent[],
  combinedText: string
): FormattedEvent[] {
  const supportText = normalizeWorkshopSupportText(combinedText);
  if (!supportText) return events;

  const workshopIndices = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.category === 'Workshops & Classes');
  if (workshopIndices.length < 2) return events;

  const supportByIndex = new Map<number, number>();
  let stronglySupportedWorkshopCount = 0;
  for (const { event, index } of workshopIndices) {
    const supportCount = countWorkshopNameSupport(String(event.name || ''), supportText);
    supportByIndex.set(index, supportCount);
    if (supportCount >= 2) stronglySupportedWorkshopCount += 1;
  }

  if (stronglySupportedWorkshopCount === 0) return events;

  const filtered = events.filter((event, index) => {
    if (event.category !== 'Workshops & Classes') return true;
    const supportCount = supportByIndex.get(index) || 0;
    if (supportCount > 0) return true;

    const meaningfulTokens = extractWorkshopSupportTokens(String(event.name || ''));
    if (meaningfulTokens.length < 2) return true;

    logger.debug(`Dropped unsupported workshop/course bleed item "${event.name}"`, {
      supportCount,
      stronglySupportedWorkshopCount,
      startDate: event.startDate,
      startTime: event.startTime,
    });
    return false;
  });

  return filtered.length > 0 ? filtered : events;
}

function hasClosureOnlyPostCue(text: string): boolean {
  const normalized = normalizeWorkshopSupportText(text);
  if (!normalized) return false;
  return /\b(will be closed|closed|closure|closed on|good friday|easter sunday)\b/.test(
    normalized
  );
}

function hasFoodSpecialSourceCue(text: string): boolean {
  const normalized = normalizeWorkshopSupportText(text);
  if (!normalized) return false;
  return /\b(daily specials?|special menu|menu item|chef s choice|burger|fries|quesadilla|rice bowl|philly|meatloaf|shepards pie|cheeseburger|mac cheese|mac n cheese|avocado)\b/.test(
    normalized
  );
}

function filterUnsupportedClosureFoodBleed(
  events: FormattedEvent[],
  combinedText: string
): FormattedEvent[] {
  if (!hasClosureOnlyPostCue(combinedText) || hasFoodSpecialSourceCue(combinedText)) {
    return events;
  }

  const filtered = events.filter((event) => {
    if (!FOOD_CATEGORIES.includes(event.category)) return true;

    logger.debug(`Dropped unsupported food-special bleed item from closure-only post "${event.name}"`, {
      category: event.category,
      startDate: event.startDate,
      startTime: event.startTime,
    });
    return false;
  });

  return filtered;
}

function normalizeCruiseLogisticsText(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^a-z0-9\s'":()/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasPassengerCountCue(text: string): boolean {
  return /\b\d{2,5}\s*pax\b/.test(text) || /\b\d{2,5}\s+passengers?\b/.test(text);
}

function hasCruiseScheduleCue(text: string): boolean {
  return (
    /\bcruise arrivals?\b/.test(text) ||
    /\bcruise departures?\b/.test(text) ||
    /\bcruise schedule\b/.test(text) ||
    /\bupcoming cruise schedule\b/.test(text)
  );
}

function hasCruiseArrivalDepartureCue(text: string): boolean {
  return (
    /\bcruise\s+(arrival|departure)s?\b/.test(text) ||
    /\b(arrival|departure)\s*;\s*\d{2,5}\s*pax\b/.test(text) ||
    /\((?:cruise\s+)?(arrival|departure)\)/.test(text)
  );
}

function hasPortCharlottetownCue(text: string): boolean {
  return /\bport charlottetown\b/.test(text);
}

function hasPublicEventCue(text: string): boolean {
  return /\b(concert|live music|festival|market|vendors?|fundraiser|workshops?|classes|show|performance|trivia|karaoke|comedy|movie|tickets?|register|registration|run|walk|race|parade|food trucks?)\b/.test(text);
}

function eventNameLooksLikeShipScheduleEntry(eventName: string, sourceText: string): boolean {
  const normalizedName = normalizeCruiseLogisticsText(eventName);
  if (!normalizedName || hasPublicEventCue(normalizedName)) return false;

  const sourceHasSchedule = hasCruiseScheduleCue(sourceText) || hasPassengerCountCue(sourceText);
  if (!sourceHasSchedule) return false;

  const tokens = normalizedName
    .replace(/\b(cruise|arrival|departure)\b/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0 || tokens.length > 3) return false;

  return sourceText.includes(normalizedName);
}

function isCruiseShipLogisticsEvent(event: FormattedEvent, combinedText: string): boolean {
  const sourceText = normalizeCruiseLogisticsText(combinedText);
  const eventText = normalizeCruiseLogisticsText([
    event.name,
    event.description,
    event.venue,
    event.establishment,
    event.address,
  ].join(' '));

  const sourceHasLogistics =
    hasCruiseScheduleCue(sourceText) ||
    hasPassengerCountCue(sourceText) ||
    (
      /\bcruise season\b/.test(sourceText) &&
      /\barrival of\b/.test(sourceText) &&
      /\b(passengers? and crew|port charlottetown)\b/.test(sourceText)
    );
  const eventHasLogistics =
    hasCruiseArrivalDepartureCue(eventText) ||
    hasPassengerCountCue(eventText);

  if (!sourceHasLogistics && !eventHasLogistics) return false;

  const eventHasPublicSignal = hasPublicEventCue(eventText);
  if (eventHasPublicSignal && !hasPassengerCountCue(eventText) && !hasCruiseScheduleCue(eventText)) {
    return false;
  }

  if (eventHasLogistics) return true;

  return (
    hasPortCharlottetownCue(sourceText + ' ' + eventText) &&
    eventNameLooksLikeShipScheduleEntry(event.name, sourceText)
  );
}

export function filterCruiseShipLogisticsEvents(
  events: FormattedEvent[],
  combinedText: string
): FormattedEvent[] {
  if (events.length === 0) return events;

  const filtered = events.filter((event) => {
    const shouldDrop = isCruiseShipLogisticsEvent(event, combinedText);
    if (shouldDrop) {
      logger.debug(`Dropped cruise ship logistics listing "${event.name}"`, {
        venue: event.venue || event.establishment,
        startDate: event.startDate,
        startTime: event.startTime,
      });
    }
    return !shouldDrop;
  });

  return filtered;
}

function normalizeRecurringFlagValue(value: unknown): 'yes' | 'no' | 'unknown' {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'unknown';
  if (['yes', 'true', '1'].includes(normalized)) return 'yes';
  if (['no', 'false', '0'].includes(normalized)) return 'no';
  return 'unknown';
}

function isRecurringFlagEnabled(value: unknown): boolean {
  return normalizeRecurringFlagValue(value) === 'yes';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parsePositiveIntegerValue(value: unknown): number | undefined {
  if (value == null) return undefined;
  const parsed =
    typeof value === 'number' ? value : Number(String(value).trim().replace(/,/g, ''));
  if (!Number.isFinite(parsed)) return undefined;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : undefined;
}

function parseDateOnlyValue(value: unknown): string | undefined {
  if (value == null) return undefined;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) return isoMatch[1];
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
    return undefined;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined;
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return parsed.toISOString().slice(0, 10);
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in (value as Record<string, unknown>) &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    try {
      const parsed = (value as { toDate: () => Date }).toDate();
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
      }
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function getLifecycleFieldValue(
  source: Record<string, unknown>,
  fieldCandidates: readonly string[]
): unknown {
  const metadata = asRecord(source.metadata) || {};
  for (const field of fieldCandidates) {
    const direct = source[field];
    if (direct != null && String(direct).trim() !== '') {
      return direct;
    }
    const meta = metadata[field];
    if (meta != null && String(meta).trim() !== '') {
      return meta;
    }
  }
  return undefined;
}

function addDaysToIsoDate(isoDate: string, days: number): string | undefined {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) return undefined;
  parsed.setUTCDate(parsed.getUTCDate() + Math.trunc(days));
  return toIsoDateUtc(parsed);
}

function getDifferenceInDays(
  fromIsoDate: string | undefined,
  toIsoDate: string | undefined
): number | null {
  const from = parseIsoDate(fromIsoDate);
  const to = parseIsoDate(toIsoDate);
  if (!from || !to) return null;
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function projectRecurrenceUntilDate(
  startDate: string | undefined,
  pattern: RecurringPattern,
  totalOccurrences: number | undefined,
  customRecurringConfiguration?:
    | {
        recurringDaysOfWeek?: RecurringWeekday[];
        recurringWeekdaySequence?: RecurringWeekday[];
        recurringWeekInterval?: number;
      }
    | undefined
): string | undefined {
  const dates = buildRecurrenceOccurrenceDates(
    startDate,
    pattern,
    totalOccurrences,
    customRecurringConfiguration
  );
  return dates.length > 0 ? dates[dates.length - 1] : undefined;
}

function occurrenceMatchesCustomRecurringConfiguration(
  occurrenceDate: string,
  baseStartDate: string,
  customRecurringConfiguration?:
    | {
        recurringDaysOfWeek?: RecurringWeekday[];
        recurringWeekdaySequence?: RecurringWeekday[];
        recurringWeekInterval?: number;
      }
    | undefined
): boolean {
  const weekday = normalizeRecurringWeekdayToken(
    patternFromIsoDate(occurrenceDate)?.replace('weekly_', '')
  );
  if (!weekday) return false;

  const diffDays = getDifferenceInDays(baseStartDate, occurrenceDate);
  const weekIndex = diffDays !== null && diffDays >= 0 ? Math.floor(diffDays / 7) : -1;
  if (weekIndex < 0) return false;

  const weekInterval = customRecurringConfiguration?.recurringWeekInterval || 1;
  const recurringDays = customRecurringConfiguration?.recurringDaysOfWeek || [];
  const recurringSequence = customRecurringConfiguration?.recurringWeekdaySequence || [];

  if (recurringSequence.length > 0) {
    const sequenceIndex = Math.floor(weekIndex / weekInterval) % recurringSequence.length;
    return weekIndex % weekInterval === 0 && recurringSequence[sequenceIndex] === weekday;
  }

  if (recurringDays.length > 0) {
    return weekIndex % weekInterval === 0 && recurringDays.includes(weekday);
  }

  return false;
}

function buildRecurrenceOccurrenceDates(
  startDate: string | undefined,
  pattern: RecurringPattern,
  totalOccurrences: number | undefined,
  customRecurringConfiguration?:
    | {
        recurringDaysOfWeek?: RecurringWeekday[];
        recurringWeekdaySequence?: RecurringWeekday[];
        recurringWeekInterval?: number;
      }
    | undefined
): string[] {
  const start = String(startDate || '').trim();
  const count = totalOccurrences || 0;
  if (!start || count <= 0) return [];

  if (pattern === 'daily') {
    const dates: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const occurrenceDate = addDaysToIsoDate(start, index);
      if (!occurrenceDate) break;
      dates.push(occurrenceDate);
    }
    return dates;
  }
  if (pattern.startsWith('weekly_')) {
    const dates: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const occurrenceDate = addDaysToIsoDate(start, index * 7);
      if (!occurrenceDate) break;
      dates.push(occurrenceDate);
    }
    return dates;
  }
  if (pattern === 'weekly_custom') {
    const startDateValue = parseIsoDate(start);
    if (!startDateValue) return [];

    let cursor = start;
    const dates: string[] = [];
    let guard = 0;
    while (guard < 3660 && dates.length < count) {
      if (
        occurrenceMatchesCustomRecurringConfiguration(
          cursor,
          start,
          customRecurringConfiguration
        )
      ) {
        dates.push(cursor);
      }

      const nextCursor = addDaysToIsoDate(cursor, 1);
      if (!nextCursor) break;
      cursor = nextCursor;
      guard += 1;
    }
    return dates;
  }

  return [];
}

function hasRecurringCue(text: string): boolean {
  const normalized = normalizeWeekdayExtractionText(text);
  if (!normalized) return false;
  return /\b(every|each|weekly|daily|biweekly|every other|recurring|repeats?|weekdays|weekends?|monthly|mondays|tuesdays|wednesdays|thursdays|fridays|saturdays|sundays)\b/.test(
    normalized
  );
}

function hasStrongRecurringCue(text: string): boolean {
  const normalized = normalizeWeekdayExtractionText(text);
  if (!normalized) return false;
  return /\b(every|each|weekly|daily|biweekly|every other|recurring|repeats?|weekdays|monthly)\b/.test(
    normalized
  );
}

function hasSingleDayMultiSessionOneOffCue(
  event: Pick<FormattedEvent, 'startDate' | 'endDate'>,
  sourceText: string
): boolean {
  const startDate = String(event.startDate || '').trim();
  const endDate = String(event.endDate || '').trim();
  if (!startDate || startDate !== endDate) return false;

  const normalized = normalizeWeekdayExtractionText(sourceText);
  if (!normalized) return false;
  if (hasRecurringCue(normalized)) return false;
  if (!/\bsessions?\b|\btime\s*slots?\b/.test(normalized)) return false;

  const explicitTimes = normalized.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/g) || [];
  const distinctTimes = [
    ...new Set(explicitTimes.map((value) => value.toLowerCase().replace(/\s+/g, '')))
  ];
  return distinctTimes.length >= 2;
}

function hasConcreteDateReference(text: string): boolean {
  const normalized = String(text || '').toLowerCase();
  if (!normalized) return false;

  return (
    /\b20\d{2}-\d{2}-\d{2}\b/.test(normalized) ||
    /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/.test(normalized) ||
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*20\d{2})?\b/i.test(
      normalized
    ) ||
    /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i.test(
      normalized
    )
  );
}

function hasOneOffEventCue(text: string): boolean {
  const normalized = String(text || '').toLowerCase();
  if (!normalized) return false;
  return /\b(tonight|tomorrow|this\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|this\s+coming\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|coming\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|one night only|doors open|tickets on sale)\b/.test(
    normalized
  );
}

function hasSeriesOrProgramCue(text: string): boolean {
  const normalized = String(text || '').toLowerCase();
  if (!normalized) return false;
  return /\b(class|classes|session|sessions|series|program|programs|camp|course|courses|workshop|workshops|monthly feature)\b/.test(
    normalized
  );
}

function hasHolidayWeekendOneOffCue(text: string): boolean {
  const normalized = String(text || '').toLowerCase();
  if (!normalized) return false;
  return /\b(this weekend|weekend special|holiday special|easter|long weekend|holiday weekend|good friday|thanksgiving|labou?r day|victoria day|family day|canada day)\b/.test(
    normalized
  );
}

function normalizeProgramIdentityText(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[\u2019\u2018\u02bc\u2032\uff07']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isBabasIslandJazzContext(
  event: Pick<FormattedEvent, 'name' | 'description' | 'establishment' | 'venue' | 'additionalLocation'>,
  sourceText: string
): boolean {
  const venueHint = normalizeProgramIdentityText(
    `${event.establishment || ''} ${event.venue || ''} ${event.additionalLocation || ''}`
  );
  if (!/\bbabas?\s+lounge\b/.test(venueHint)) {
    return false;
  }

  const contentText = normalizeProgramIdentityText(
    `${event.name || ''} ${event.description || ''} ${sourceText || ''}`
  );
  return /\bisland\s+jazz\b/.test(contentText);
}

function isGenericBabasIslandJazzFallbackName(name: string): boolean {
  const normalized = normalizeProgramIdentityText(name);
  if (!normalized) return false;
  return (
    normalized === 'island jazz' ||
    normalized === 'island jazz at babas lounge' ||
    normalized === 'island jazz weekly thursday night' ||
    normalized === 'island jazz at babas lounge weekly thursday night'
  );
}

function analyzeBabasIslandJazzProgramInstance(
  event: Pick<
    FormattedEvent,
    'name' | 'description' | 'establishment' | 'venue' | 'additionalLocation' | 'startDate' | 'endDate'
  >,
  sourceText: string
): {
  matchesProgram: boolean;
  isGenericFallback: boolean;
  hasSpecificShowSignal: boolean;
  hasOneOffAnchor: boolean;
  shouldForceOneOff: boolean;
} {
  const matchesProgram = isBabasIslandJazzContext(event, sourceText);
  if (!matchesProgram) {
    return {
      matchesProgram: false,
      isGenericFallback: false,
      hasSpecificShowSignal: false,
      hasOneOffAnchor: false,
      shouldForceOneOff: false,
    };
  }

  const rawName = String(event.name || '').trim();
  const normalizedText = normalizeProgramIdentityText(
    `${rawName} ${event.description || ''} ${sourceText || ''}`
  );
  const hasSpecificShowSignal =
    looksPerformerLikeTitle(rawName) ||
    /\b(feat(?:uring)?|ft|features?|presents?|welcomes?(?:\s+back)?|joins?|performing)\b/.test(
      normalizedText
    ) ||
    /\bisland\s+jazz\s*[:\-]\s*[a-z0-9]/.test(normalizeProgramIdentityText(rawName));
  const hasOneOffAnchor =
    hasConcreteDateReference(sourceText) ||
    hasOneOffEventCue(sourceText) ||
    /\bthis\s+week\b/i.test(sourceText) ||
    /\btwo\s+sets?\s+starting\b/i.test(sourceText);
  const hasSeriesFallbackCue =
    /\bevery\s+thursday\s+night\b/.test(normalizedText) ||
    /\bweekly\s+thursday\b/.test(normalizedText) ||
    /\ball\s+year\s+round\b/.test(normalizedText);
  const isGenericFallback =
    isGenericBabasIslandJazzFallbackName(rawName) ||
    (hasSeriesFallbackCue && !hasSpecificShowSignal && normalizeProgramIdentityText(rawName).startsWith('island jazz'));

  return {
    matchesProgram,
    isGenericFallback,
    hasSpecificShowSignal,
    hasOneOffAnchor,
    shouldForceOneOff:
      matchesProgram &&
      !isGenericFallback &&
      hasSpecificShowSignal &&
      hasOneOffAnchor,
  };
}

function parseDateFromText(
  text: string,
  startDate: string | undefined
): string | undefined {
  const normalized = String(text || '').trim();
  if (!normalized) return undefined;

  const start = parseIsoDate(startDate);
  const fallbackYear = start?.getUTCFullYear() || new Date().getUTCFullYear();

  const isoMatch = normalized.match(/\b(20\d{2}-\d{2}-\d{2})\b/i);
  if (isoMatch) {
    return isoMatch[1];
  }

  const monthDayMatch = normalized.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?\b/i
  );
  if (monthDayMatch) {
    const month = MONTH_TOKEN_TO_NUMBER[normalizeMonthToken(monthDayMatch[1])];
    const day = Number(monthDayMatch[2]);
    let year = monthDayMatch[3] ? Number(monthDayMatch[3]) : fallbackYear;
    let candidate = toIsoDateFromParts(year, month, day);
    const candidateDate = candidate ? parseIsoDate(candidate) : null;
    if (candidate && !monthDayMatch[3] && start && candidateDate && candidateDate < start) {
      candidate = toIsoDateFromParts(year + 1, month, day);
    }
    return candidate || undefined;
  }

  const monthYearMatch = normalized.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(20\d{2})\b/i
  );
  if (monthYearMatch) {
    const month = MONTH_TOKEN_TO_NUMBER[normalizeMonthToken(monthYearMatch[1])];
    const year = Number(monthYearMatch[2]);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return toIsoDateFromParts(year, month, lastDay) || undefined;
  }

  const numericMatch = normalized.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (numericMatch) {
    const month = Number(numericMatch[1]);
    const day = Number(numericMatch[2]);
    const rawYear = numericMatch[3];
    let year = fallbackYear;
    if (rawYear) {
      year = rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear);
    }
    let candidate = toIsoDateFromParts(year, month, day);
    const candidateDate = candidate ? parseIsoDate(candidate) : null;
    if (candidate && !rawYear && start && candidateDate && candidateDate < start) {
      candidate = toIsoDateFromParts(year + 1, month, day);
    }
    return candidate || undefined;
  }

  return undefined;
}

function consumeMonthDayList(text: string, startIndex: number): { days: number[]; nextIndex: number } {
  const days: number[] = [];
  let cursor = startIndex;

  while (cursor < text.length) {
    const rest = text.slice(cursor);
    const leadingWhitespace = rest.match(/^\s+/);
    if (leadingWhitespace) {
      cursor += leadingWhitespace[0].length;
      continue;
    }

    const dayMatch = rest.match(/^(\d{1,2})(?:st|nd|rd|th)?/i);
    if (dayMatch) {
      const day = Number(dayMatch[1]);
      if (!Number.isFinite(day) || day <= 0 || day > 31) break;
      days.push(day);
      cursor += dayMatch[0].length;
      continue;
    }

    const separatorMatch = rest.match(/^(?:,|;|&|\/|\band\b|\s+-\s+)/i);
    if (separatorMatch) {
      cursor += separatorMatch[0].length;
      continue;
    }

    break;
  }

  return { days, nextIndex: cursor };
}

function extractExplicitOccurrenceDateListFromText(
  text: string,
  startDate: string | undefined
): string[] {
  const normalized = String(text || '')
    .replace(/\u2012|\u2013|\u2014|\u2015/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return [];

  const hasExplicitDateListCue =
    /\b(poster dates?|dates?\s+(?:shown|listed|include(?:s|d)?|available|only))\b/i.test(normalized);
  const monthRegex =
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/gi;
  const monthMatches = Array.from(normalized.matchAll(monthRegex));
  if (monthMatches.length === 0) return [];

  let resolvedYear = parseIsoDate(startDate)?.getUTCFullYear() || new Date().getUTCFullYear();
  let previousMonth: number | null = null;
  let monthBlocksWithMultipleDays = 0;
  const occurrenceDates: string[] = [];

  for (const match of monthMatches) {
    const month = MONTH_TOKEN_TO_NUMBER[normalizeMonthToken(match[1])];
    if (!month) continue;

    if (previousMonth !== null && month < previousMonth) {
      resolvedYear += 1;
    }
    previousMonth = month;

    const { days, nextIndex } = consumeMonthDayList(normalized, (match.index || 0) + match[0].length);
    if (days.length === 0) continue;
    if (days.length > 1) monthBlocksWithMultipleDays += 1;

    const yearWindow = normalized.slice(match.index || 0, Math.min(normalized.length, nextIndex + 12));
    const explicitYearMatch = yearWindow.match(/\b(20\d{2})\b/);
    const blockYear = explicitYearMatch ? Number(explicitYearMatch[1]) : resolvedYear;
    resolvedYear = blockYear;

    for (const day of days) {
      const occurrenceDate = toIsoDateFromParts(blockYear, month, day);
      if (occurrenceDate) occurrenceDates.push(occurrenceDate);
    }
  }

  if (!hasExplicitDateListCue && monthBlocksWithMultipleDays === 0) {
    return [];
  }

  return [...new Set(occurrenceDates)].sort();
}

function filterExplicitOccurrenceDatesForPattern(
  occurrenceDates: string[],
  pattern: RecurringPattern,
  customRecurringConfiguration?:
    | {
        recurringDaysOfWeek?: RecurringWeekday[];
        recurringWeekdaySequence?: RecurringWeekday[];
        recurringWeekInterval?: number;
      }
    | undefined
): string[] {
  if (pattern === 'none') return [];
  if (pattern === 'daily') return occurrenceDates;

  if (pattern === 'weekly_custom') {
    const recurringDays = customRecurringConfiguration?.recurringDaysOfWeek || [];
    const recurringSequence = customRecurringConfiguration?.recurringWeekdaySequence || [];
    const allowedWeekdays = recurringDays.length > 0 ? recurringDays : recurringSequence;
    if (allowedWeekdays.length === 0) return [];
    return occurrenceDates.filter((date) => {
      const weekday = normalizeRecurringWeekdayToken(
        patternFromIsoDate(date)?.replace('weekly_', '')
      );
      return Boolean(weekday && allowedWeekdays.includes(weekday));
    });
  }

  return occurrenceDates.filter((date) => patternFromIsoDate(date) === pattern);
}

function inferWeeklyPatternFromExplicitOccurrenceDates(
  occurrenceDates: string[]
): RecurringPattern {
  const normalizedDates = [...new Set(
    occurrenceDates.filter((value) => Boolean(parseIsoDate(value)))
  )].sort();
  if (normalizedDates.length < 2) return 'none';

  const inferredPattern = patternFromIsoDate(normalizedDates[0]);
  if (!inferredPattern || !inferredPattern.startsWith('weekly_')) {
    return 'none';
  }

  for (let index = 1; index < normalizedDates.length; index += 1) {
    if (patternFromIsoDate(normalizedDates[index]) !== inferredPattern) {
      return 'none';
    }
    if (getDifferenceInDays(normalizedDates[index - 1], normalizedDates[index]) !== 7) {
      return 'none';
    }
  }

  return inferredPattern;
}

function alignFiniteExplicitOccurrenceDates(
  event: Pick<FormattedEvent, 'name' | 'startDate'>,
  sourceText: string,
  pattern: RecurringPattern,
  customRecurringConfiguration?:
    | {
        recurringDaysOfWeek?: RecurringWeekday[];
        recurringWeekdaySequence?: RecurringWeekday[];
        recurringWeekInterval?: number;
      }
    | undefined
):
  | {
      startDate: string;
      endDate: string;
      recurringPattern: RecurringPattern;
      isRecurring: boolean;
      totalOccurrences?: number;
      recurrenceUntilDate?: string;
    }
  | undefined {
  if (pattern === 'none') return undefined;

  const explicitOccurrenceDates = extractExplicitOccurrenceDateListFromText(
    sourceText,
    event.startDate
  );
  if (explicitOccurrenceDates.length < 2) return undefined;

  const matchingDates = filterExplicitOccurrenceDatesForPattern(
    explicitOccurrenceDates,
    pattern,
    customRecurringConfiguration
  );
  if (matchingDates.length === 0) return undefined;

  const alignedStartDate = matchingDates[0];
  if (matchingDates.length === 1) {
    logger.debug(`Demoted finite date-list recurrence to one-off for "${event.name}"`, {
      pattern,
      alignedStartDate,
    });
    return {
      startDate: alignedStartDate,
      endDate: alignedStartDate,
      recurringPattern: 'none',
      isRecurring: false,
    };
  }

  const projectedDates = buildRecurrenceOccurrenceDates(
    alignedStartDate,
    pattern,
    matchingDates.length,
    customRecurringConfiguration
  );
  const representsExactSeries =
    projectedDates.length === matchingDates.length &&
    projectedDates.every((value, index) => value === matchingDates[index]);
  if (!representsExactSeries) return undefined;

  logger.debug(`Aligned recurrence to finite explicit date list for "${event.name}"`, {
    pattern,
    startDateFrom: event.startDate,
    startDateTo: alignedStartDate,
    recurrenceUntilDate: matchingDates[matchingDates.length - 1],
    totalOccurrences: matchingDates.length,
  });
  return {
    startDate: alignedStartDate,
    endDate: alignedStartDate,
    recurringPattern: pattern,
    isRecurring: true,
    totalOccurrences: matchingDates.length,
    recurrenceUntilDate: matchingDates[matchingDates.length - 1],
  };
}

function parseTimeToMinutes(value: string | undefined): number | null {
  const match = String(value || '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function resolveOccurrenceLocalEndDate(
  startDate: string | undefined,
  startTime: string | undefined,
  endTime: string | undefined
): string | undefined {
  const normalizedStartDate = String(startDate || '').trim();
  if (!normalizedStartDate) return undefined;

  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  if (
    startMinutes !== null &&
    endMinutes !== null &&
    endMinutes < startMinutes
  ) {
    return addDaysToIsoDate(normalizedStartDate, 1) || normalizedStartDate;
  }

  return normalizedStartDate;
}

function alignSingleWeekdayRecurringStartDate(
  startDate: string | undefined,
  pattern: RecurringPattern
): string | undefined {
  const normalizedStartDate = String(startDate || '').trim();
  if (
    !normalizedStartDate ||
    !pattern.startsWith('weekly_') ||
    pattern === 'weekly_custom'
  ) {
    return undefined;
  }

  if (patternFromIsoDate(normalizedStartDate) === pattern) {
    return normalizedStartDate;
  }

  for (let offset = 1; offset <= 7; offset += 1) {
    const candidate = addDaysToIsoDate(normalizedStartDate, offset);
    if (candidate && patternFromIsoDate(candidate) === pattern) {
      return candidate;
    }
  }

  return normalizedStartDate;
}

function shouldDemoteRecurringFiniteRunToOneOff(
  event: Pick<FormattedEvent, 'startDate'>,
  sourceText: string,
  recurringPattern: RecurringPattern,
  recurrenceUntilDate: string | undefined,
  hasRecurringSignal: boolean,
  hasSeriesCue: boolean,
  customRecurringConfiguration?:
    | {
        recurringDaysOfWeek?: RecurringWeekday[];
        recurringWeekdaySequence?: RecurringWeekday[];
        recurringWeekInterval?: number;
      }
    | undefined
): boolean {
  if (
    recurringPattern === 'none' ||
    recurringPattern === 'daily' ||
    recurringPattern === 'weekly_custom' ||
    customRecurringConfiguration
  ) {
    return false;
  }

  const startDate = String(event.startDate || '').trim();
  const normalizedUntilDate = String(recurrenceUntilDate || '').trim();
  if (!startDate || !normalizedUntilDate) return false;

  const spanDays = getDifferenceInDays(startDate, normalizedUntilDate);
  if (spanDays === null || spanDays < 1 || spanDays > 6) {
    return false;
  }

  if (hasRecurringSignal || hasSeriesCue) {
    return false;
  }

  if (extractExplicitOccurrenceDateListFromText(sourceText, startDate).length >= 2) {
    return false;
  }

  return (
    hasOneOffEventCue(sourceText) ||
    /\b(opens?|opening|runs?|running|plays?|screening run|this weekend|through|thru|until|till)\b/i.test(
      sourceText
    )
  );
}

function shouldForceExplicitDatedWeeklyOneOff(
  event: Pick<FormattedEvent, 'startDate' | 'endDate' | 'startTime' | 'endTime'>,
  sourceText: string,
  recurringPattern: RecurringPattern,
  explicitOccurrenceDates: string[],
  hasRecurringCueSignal: boolean,
  hasSeriesCue: boolean,
  recurrenceUntilDate: string | undefined,
  totalOccurrences: number | undefined,
  customRecurringConfiguration?:
    | {
        recurringDaysOfWeek?: RecurringWeekday[];
        recurringWeekdaySequence?: RecurringWeekday[];
        recurringWeekInterval?: number;
      }
    | undefined
): boolean {
  if (
    recurringPattern === 'none' ||
    recurringPattern === 'daily' ||
    recurringPattern === 'weekly_custom' ||
    customRecurringConfiguration
  ) {
    return false;
  }

  if (hasRecurringCueSignal || recurrenceUntilDate || totalOccurrences !== undefined) {
    return false;
  }

  const hasOneOffCue = hasOneOffEventCue(sourceText);
  if (hasSeriesCue && !hasOneOffCue) {
    return false;
  }

  if (!hasConcreteDateReference(sourceText) || explicitOccurrenceDates.length > 1) {
    return false;
  }

  const startDate = String(event.startDate || '').trim();
  const endDate = String(event.endDate || '').trim() || startDate;
  if (!startDate) return false;

  const expectedOccurrenceEndDate =
    resolveOccurrenceLocalEndDate(startDate, event.startTime, event.endTime) ||
    startDate;
  if (endDate !== startDate && endDate !== expectedOccurrenceEndDate) {
    return false;
  }

  return true;
}

function shouldForceSingleExplicitDateOneOff(
  event: Pick<FormattedEvent, 'startDate' | 'endDate' | 'startTime' | 'endTime'>,
  sourceText: string,
  recurringPattern: RecurringPattern,
  _explicitOccurrenceDates: string[],
  recurrenceUntilDate: string | undefined,
  totalOccurrences: number | undefined,
  customRecurringConfiguration?:
    | {
        recurringDaysOfWeek?: RecurringWeekday[];
        recurringWeekdaySequence?: RecurringWeekday[];
        recurringWeekInterval?: number;
      }
    | undefined
): boolean {
  if (
    recurringPattern === 'none' ||
    recurringPattern === 'daily' ||
    recurringPattern === 'weekly_custom' ||
    customRecurringConfiguration
  ) {
    return false;
  }

  if (recurrenceUntilDate || totalOccurrences !== undefined) {
    return false;
  }

  const normalizedSource = normalizeWeekdayExtractionText(sourceText);
  if (!normalizedSource || !hasConcreteDateReference(normalizedSource)) {
    return false;
  }

  if (hasStrongRecurringCue(normalizedSource)) {
    return false;
  }

  const startDate = String(event.startDate || '').trim();
  const endDate = String(event.endDate || '').trim() || startDate;
  if (!startDate) return false;

  const startDatePattern = patternFromIsoDate(startDate);
  if (!startDatePattern || startDatePattern !== recurringPattern) {
    return false;
  }

  const expectedOccurrenceEndDate =
    resolveOccurrenceLocalEndDate(startDate, event.startTime, event.endTime) ||
    startDate;
  if (endDate !== startDate && endDate !== expectedOccurrenceEndDate) {
    return false;
  }

  return true;
}

function isSimpleWeeklyRecurringPattern(pattern: RecurringPattern): boolean {
  return pattern.startsWith('weekly_') && pattern !== 'weekly_custom';
}

function hasGenericSingularWeekdaySpecialCue(text: string): boolean {
  const normalized = normalizeWeekdayExtractionText(text);
  if (!normalized) return false;

  const singularWeekday =
    '(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)';
  const specialNoun =
    '(?:special|specials|deal|deals|feature|features|lunch\\s+special|dinner\\s+special|soup\\s+special)';

  return (
    new RegExp(`\\b${singularWeekday}\\b\\s*(?:[-:|]|\\s+)\\s*${specialNoun}\\b`, 'i').test(
      normalized
    ) ||
    new RegExp(`\\b${specialNoun}\\b\\s*(?:for|on)?\\s*\\b${singularWeekday}\\b`, 'i').test(
      normalized
    )
  );
}

function shouldForceWeakWeekdaySpecialOneOff(
  event: Pick<FormattedEvent, 'category' | 'startDate' | 'endDate' | 'startTime' | 'endTime'>,
  sourceText: string,
  recurringPattern: RecurringPattern,
  recurrenceUntilDate: string | undefined,
  totalOccurrences: number | undefined,
  customRecurringConfiguration?:
    | {
        recurringDaysOfWeek?: RecurringWeekday[];
        recurringWeekdaySequence?: RecurringWeekday[];
        recurringWeekInterval?: number;
      }
    | undefined
): boolean {
  if (
    !isSimpleWeeklyRecurringPattern(recurringPattern) ||
    customRecurringConfiguration ||
    recurrenceUntilDate ||
    totalOccurrences !== undefined
  ) {
    return false;
  }

  if (!FOOD_CATEGORIES.includes(event.category)) return false;
  if (hasRecurringCue(sourceText)) return false;
  if (extractFoodSpecialNamedPattern(sourceText) !== 'none') return false;
  if (!hasGenericSingularWeekdaySpecialCue(sourceText)) return false;

  const startDate = String(event.startDate || '').trim();
  const endDate = String(event.endDate || '').trim() || startDate;
  if (!startDate) return false;

  const startDatePattern = patternFromIsoDate(startDate);
  if (!startDatePattern || startDatePattern !== recurringPattern) return false;

  const expectedOccurrenceEndDate =
    resolveOccurrenceLocalEndDate(startDate, event.startTime, event.endTime) ||
    startDate;
  return endDate === startDate || endDate === expectedOccurrenceEndDate;
}

function extractRecurrenceUntilDateFromText(
  text: string,
  startDate: string | undefined
): string | undefined {
  const normalized = String(text || '').toLowerCase();
  if (!normalized) return undefined;

  const start = parseIsoDate(startDate);
  const fallbackYear = start?.getUTCFullYear() || new Date().getUTCFullYear();
  const explicitRange = extractExplicitMonthDayRange(normalized, fallbackYear);
  if (
    explicitRange &&
    (hasRecurringCue(normalized) ||
      hasSeriesOrProgramCue(normalized) ||
      detectStandaloneWeeklyPattern(normalized) !== 'none')
  ) {
    return explicitRange.endDate;
  }

  const untilPatterns = [
    /\b(?:until|through|thru|till)\s+([^\n,.;]+(?:,\s*20\d{2})?)/i,
    /\b(?:ending|ends)\s+([^\n,.;]+(?:,\s*20\d{2})?)/i,
  ];

  for (const pattern of untilPatterns) {
    const match = normalized.match(pattern);
    if (!match || !match[1]) continue;
    const parsed = parseDateFromText(match[1], startDate);
    if (parsed) return parsed;
  }

  return undefined;
}

function extractTotalOccurrencesFromText(
  text: string,
  pattern: RecurringPattern,
  customRecurringConfiguration?:
    | {
        recurringDaysOfWeek?: RecurringWeekday[];
        recurringWeekdaySequence?: RecurringWeekday[];
        recurringWeekInterval?: number;
      }
    | undefined
): number | undefined {
  const normalized = String(text || '').toLowerCase();
  if (!normalized) return undefined;

  const countTokenPattern =
    '(\\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)';
  const directCountMatch =
    normalized.match(
      new RegExp(
        `\\b(?:for|next)\\s+${countTokenPattern}\\s+(days?|weeks?|months?|classes?|sessions?|shows?)\\b`,
        'i'
      )
    ) ||
    normalized.match(
      new RegExp(
        `\\b${countTokenPattern}\\s+(days?|weeks?|months?|classes?|sessions?|shows?)\\b`,
        'i'
      )
    );
  const dashRunMatch = normalized.match(
    /\b(\d{1,3})\s*[- ]\s*(day|week|month)\s+(?:run|series)\b/i
  );
  const match = directCountMatch || dashRunMatch;
  if (!match) return undefined;

  const rawCountToken = String(match[1] || '').trim().toLowerCase();
  const rawCount =
    COUNT_TOKEN_TO_NUMBER[rawCountToken] ||
    (rawCountToken && /^\d{1,3}$/.test(rawCountToken) ? Number(rawCountToken) : NaN);
  if (!Number.isFinite(rawCount) || rawCount <= 0) return undefined;
  const count = Math.trunc(rawCount);
  const unit = String(match[2] || '').toLowerCase();

  if (pattern === 'daily') {
    if (unit.startsWith('week')) return count * 7;
    return count;
  }
  if (pattern.startsWith('weekly_')) {
    if (unit.startsWith('day')) return Math.max(1, Math.floor(count / 7));
    return count;
  }
  if (pattern === 'weekly_custom') {
    if (unit.startsWith('week')) {
      if (customRecurringConfiguration?.recurringWeekdaySequence?.length) {
        return count;
      }
      const recurringDaysCount = customRecurringConfiguration?.recurringDaysOfWeek?.length || 1;
      return count * recurringDaysCount;
    }
    return count;
  }

  if (unit.startsWith('day')) return count;
  return count;
}

function extractFoodSpecialNamedPattern(text: string): RecurringPattern {
  const normalized = String(text || '').toLowerCase();
  if (!normalized) return 'none';

  const namedPatterns: Array<[RegExp, RecurringPattern]> = [
    [/\btaco\s+tuesday\b/i, 'weekly_tuesday'],
    [/\bthirsty\s+thursday\b/i, 'weekly_thursday'],
    [/\bfish\s+friday\b/i, 'weekly_friday'],
    [/\bwing(?:s)?\s+wednesday\b/i, 'weekly_wednesday'],
    [/\bmargarita\s+monday\b/i, 'weekly_monday'],
    [/\bsunday\s+brunch\b/i, 'weekly_sunday'],
    [/\bsaturday\s+brunch\b/i, 'weekly_saturday'],
  ];

  for (const [matcher, recurringPattern] of namedPatterns) {
    if (matcher.test(normalized)) return recurringPattern;
  }
  return 'none';
}

function buildRecurrenceSourceText(
  event: FormattedEvent,
  originalItem?: ExtractedItem
): string {
  const rawSegments = [
    String(event.name || ''),
    String(event.description || ''),
    String((originalItem as Record<string, unknown> | undefined)?.description || ''),
    String((originalItem as Record<string, unknown> | undefined)?.extractionReason || ''),
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  const explicitSegments = rawSegments.filter((value) => hasConcreteDateReference(value));
  const preferredExplicitSegment =
    explicitSegments.length > 0
      ? [...explicitSegments].sort((left, right) => right.length - left.length)[0]
      : '';

  const seen = new Set<string>();
  return rawSegments
    .filter((value) => {
      if (!hasConcreteDateReference(value)) return true;
      return !preferredExplicitSegment || value === preferredExplicitSegment;
    })
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(' ')
    .trim();
}

function buildItemLocalRecurrenceText(event: Pick<FormattedEvent, 'name' | 'description'>): string {
  return [String(event.name || ''), String(event.description || '')]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function collectDistinctWeekdayPatternsFromText(text: string): Set<RecurringPattern> {
  const normalized = normalizeWeekdayExtractionText(text);
  if (!normalized) return new Set<RecurringPattern>();

  const matches = new Set<RecurringPattern>();
  const weekdayPattern =
    /\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/g;

  for (const match of normalized.matchAll(weekdayPattern)) {
    const mapped = mapWeekdayTokenToPattern(match[1]);
    if (mapped) {
      matches.add(mapped);
    }
  }

  return matches;
}

function inferItemLocalRecurringPatternFromText(
  event: Pick<FormattedEvent, 'name' | 'description' | 'startDate'>,
  sourceText: string,
  sourceWeekdayPatterns: Set<RecurringPattern>
): RecurringPattern {
  const itemLocalText = buildItemLocalRecurrenceText(event);
  if (!itemLocalText) return 'none';

  const startDatePattern = patternFromIsoDate(event.startDate);
  const directPattern = detectRecurringPatternFromText(itemLocalText);
  if (directPattern !== 'none') {
    if (!startDatePattern || directPattern === startDatePattern) {
      return directPattern;
    }
    return 'none';
  }

  const hasRecurringBoardContext =
    hasRecurringCue(sourceText) || hasSeriesOrProgramCue(sourceText) || sourceWeekdayPatterns.size > 1;
  if (!hasRecurringBoardContext) return 'none';
  if (hasConcreteDateReference(itemLocalText)) return 'none';

  const standalonePattern = detectStandaloneWeeklyPattern(itemLocalText);
  if (standalonePattern === 'none') return 'none';
  if (!startDatePattern || standalonePattern === startDatePattern) {
    return standalonePattern;
  }
  return 'none';
}

function shouldAcceptRowScopedRecurringTextFallback(
  event: Pick<FormattedEvent, 'startDate'>,
  textPattern: RecurringPattern,
  sourceWeekdayPatterns: Set<RecurringPattern>,
  itemLocalPattern: RecurringPattern
): boolean {
  if (textPattern === 'none') return false;
  if (textPattern === 'daily') return true;

  const startDatePattern = patternFromIsoDate(event.startDate);
  if (startDatePattern && textPattern.startsWith('weekly_') && textPattern !== startDatePattern) {
    return false;
  }

  if (
    sourceWeekdayPatterns.size > 1 &&
    (itemLocalPattern === 'none' || itemLocalPattern !== textPattern)
  ) {
    return false;
  }

  return true;
}

function shouldAcceptSourceDerivedSpecificWeeklyPattern(
  event: Pick<FormattedEvent, 'startDate'>,
  candidatePattern: RecurringPattern,
  candidateSource: 'standalone_weekday' | 'explicit_date_sequence' | 'none',
  sourceWeekdayPatterns: Set<RecurringPattern>,
  itemLocalPattern: RecurringPattern
): boolean {
  if (candidatePattern === 'none' || candidateSource === 'none') return false;
  if (candidateSource === 'explicit_date_sequence') return true;

  const startDatePattern = patternFromIsoDate(event.startDate);
  if (startDatePattern && candidatePattern !== startDatePattern) {
    return false;
  }

  if (
    sourceWeekdayPatterns.size > 1 &&
    (itemLocalPattern === 'none' || itemLocalPattern !== candidatePattern)
  ) {
    return false;
  }

  return true;
}

function normalizeRecurringForFormattedEvent(
  event: FormattedEvent,
  originalItem?: ExtractedItem
): FormattedEvent {
  const sourceText = buildRecurrenceSourceText(event, originalItem);
  const sourceWeekdayPatterns = collectDistinctWeekdayPatternsFromText(sourceText);
  const hasCue = hasRecurringCue(sourceText);
  const hasConcreteDate = hasConcreteDateReference(sourceText);
  const hasOneOffCue = hasOneOffEventCue(sourceText);
  const hasSeriesCue = hasSeriesOrProgramCue(sourceText);
  const babasIslandJazzAnalysis = analyzeBabasIslandJazzProgramInstance(event, sourceText);
  const eventRecord = event as unknown as Record<string, unknown>;
  const itemRecord = asRecord(originalItem) || {};
  const extractionReasonText = [
    String(eventRecord.extractionReason || ''),
    String(itemRecord.extractionReason || ''),
  ]
    .filter(Boolean)
    .join(' ');
  const isForcedHolidayWeekendOneOff = /\bmixed_holiday_weekend_split:/i.test(extractionReasonText);

  if (isForcedHolidayWeekendOneOff) {
    logger.debug(`Forced holiday/weekend split item to one-off for "${event.name}"`, {
      extractionReason: extractionReasonText,
      startDate: event.startDate,
      endDate: event.endDate,
    });
    event.totalOccurrences = undefined;
    event.recurrenceUntilDate = undefined;
    event.recurringDaysOfWeek = undefined;
    event.recurringWeekdaySequence = undefined;
    event.recurringWeekInterval = undefined;
    event.isRecurring = false;
    event.recurringPattern = 'none';
    return event;
  }

  let recurringPattern = sanitizeRecurringPattern(event.recurringPattern, event);
  const incomingRecurringPattern = recurringPattern;
  let customRecurringConfiguration = resolveCustomRecurringConfiguration(
    sourceText,
    event.startDate,
    eventRecord,
    itemRecord
  );
  const startDatePattern = patternFromIsoDate(event.startDate);
  const itemLocalRecurringPattern = inferItemLocalRecurringPatternFromText(
    event,
    sourceText,
    sourceWeekdayPatterns
  );
  if (
    customRecurringConfiguration &&
    recurringPattern.startsWith('weekly_') &&
    recurringPattern !== 'weekly_custom' &&
    startDatePattern === recurringPattern
  ) {
    logger.debug(`Ignored broader custom recurrence for specific weekly record "${event.name}"`, {
      recurringPattern,
      startDate: event.startDate,
    });
    customRecurringConfiguration = undefined;
  }
  if (customRecurringConfiguration) {
    recurringPattern = 'weekly_custom';
  }
  if (recurringPattern === 'none' && itemLocalRecurringPattern !== 'none') {
    recurringPattern = itemLocalRecurringPattern;
  }
  if (recurringPattern === 'none') {
    const textPattern = detectRecurringPatternFromText(sourceText);
    if (
      shouldAcceptRowScopedRecurringTextFallback(
        event,
        textPattern,
        sourceWeekdayPatterns,
        itemLocalRecurringPattern
      )
    ) {
      recurringPattern = textPattern;
    }
  }

  if (recurringPattern === 'none' && FOOD_CATEGORIES.includes(event.category)) {
    const namedPattern = extractFoodSpecialNamedPattern(sourceText);
    if (namedPattern !== 'none') recurringPattern = namedPattern;
  }

  if (recurringPattern === 'none') {
    const impliedPattern = inferImplicitWeeklyPatternForSpecial(event, sourceText);
    if (impliedPattern !== 'none') recurringPattern = impliedPattern;
  }

  const explicitOccurrenceDates = extractExplicitOccurrenceDateListFromText(
    sourceText,
    event.startDate
  );
  const explicitDateSequenceWeeklyPattern = inferWeeklyPatternFromExplicitOccurrenceDates(
    explicitOccurrenceDates
  );
  const detectedStandaloneWeeklyPattern = detectStandaloneWeeklyPattern(sourceText);
  const trustedStandaloneWeeklyPattern =
    detectedStandaloneWeeklyPattern !== 'none' &&
    shouldTrustStandaloneWeeklyPattern(event, sourceText)
      ? detectedStandaloneWeeklyPattern
      : 'none';
  let specificWeeklyPatternCandidate =
    trustedStandaloneWeeklyPattern !== 'none'
      ? trustedStandaloneWeeklyPattern
      : explicitDateSequenceWeeklyPattern;
  let specificWeeklyPatternSource =
    trustedStandaloneWeeklyPattern !== 'none'
      ? 'standalone_weekday'
      : explicitDateSequenceWeeklyPattern !== 'none'
        ? 'explicit_date_sequence'
        : 'none';
  if (
    specificWeeklyPatternCandidate !== 'none' &&
    !shouldAcceptSourceDerivedSpecificWeeklyPattern(
      event,
      specificWeeklyPatternCandidate,
      specificWeeklyPatternSource,
      sourceWeekdayPatterns,
      itemLocalRecurringPattern
    )
  ) {
    specificWeeklyPatternCandidate = 'none';
    specificWeeklyPatternSource = 'none';
  }
  const canPromoteSpecificWeeklyPattern =
    specificWeeklyPatternSource === 'explicit_date_sequence' ||
    (
      specificWeeklyPatternCandidate !== 'none' &&
      canPromoteToStandaloneWeeklyPattern(event, sourceText)
    );

  if (
    recurringPattern === 'none' &&
    specificWeeklyPatternCandidate !== 'none' &&
    canPromoteSpecificWeeklyPattern
  ) {
    if (specificWeeklyPatternSource === 'explicit_date_sequence') {
      logger.debug(`Recovered weekly pattern from explicit date sequence for "${event.name}"`, {
        to: specificWeeklyPatternCandidate,
        occurrenceDates: explicitOccurrenceDates,
      });
    } else {
      logger.debug(`Recovered standalone weekly pattern for "${event.name}"`, {
        to: specificWeeklyPatternCandidate,
      });
    }
    recurringPattern = specificWeeklyPatternCandidate;
  }

  if (!customRecurringConfiguration && recurringPattern === 'weekly_custom') {
    if (specificWeeklyPatternCandidate !== 'none') {
      logger.debug(`Recovered specific weekly pattern for "${event.name}"`, {
        from: recurringPattern,
        to: specificWeeklyPatternCandidate,
        source: specificWeeklyPatternSource,
      });
      recurringPattern = specificWeeklyPatternCandidate;
    } else {
      logger.debug(`Discarded unsupported custom recurrence for "${event.name}"`, {
        recurringPattern,
        sourceText: sourceText.slice(0, 200),
      });
      recurringPattern = 'none';
    }
  }

  if (recurringPattern === 'daily' && !customRecurringConfiguration) {
    if (
      specificWeeklyPatternCandidate !== 'none' &&
      canPromoteSpecificWeeklyPattern
    ) {
      logger.debug(`Refined recurring pattern for "${event.name}"`, {
        from: recurringPattern,
        to: specificWeeklyPatternCandidate,
        source: specificWeeklyPatternSource,
      });
      recurringPattern = specificWeeklyPatternCandidate;
    }
  }

  let totalOccurrences =
    parsePositiveIntegerValue(
      getLifecycleFieldValue(eventRecord, TOTAL_OCCURRENCE_FIELD_CANDIDATES)
    ) ??
    parsePositiveIntegerValue(
      getLifecycleFieldValue(itemRecord, TOTAL_OCCURRENCE_FIELD_CANDIDATES)
    ) ??
    extractTotalOccurrencesFromText(
      sourceText,
      recurringPattern,
      customRecurringConfiguration
    );

  let recurrenceUntilDate =
    parseDateOnlyValue(
      getLifecycleFieldValue(eventRecord, RECURRENCE_UNTIL_FIELD_CANDIDATES)
    ) ??
    parseDateOnlyValue(
      getLifecycleFieldValue(itemRecord, RECURRENCE_UNTIL_FIELD_CANDIDATES)
    ) ??
    extractRecurrenceUntilDateFromText(sourceText, event.startDate);

  let forcedFiniteRunOneOff = false;
  let explicitDateAlignmentDemotedToOneOff = false;
  const explicitOccurrenceAlignment = alignFiniteExplicitOccurrenceDates(
    event,
    sourceText,
    recurringPattern,
    customRecurringConfiguration
  );
  if (explicitOccurrenceAlignment) {
    event.startDate = explicitOccurrenceAlignment.startDate;
    event.endDate = explicitOccurrenceAlignment.endDate;
    recurringPattern = explicitOccurrenceAlignment.recurringPattern;
    totalOccurrences = explicitOccurrenceAlignment.totalOccurrences;
    recurrenceUntilDate = explicitOccurrenceAlignment.recurrenceUntilDate;
    if (!explicitOccurrenceAlignment.isRecurring) {
      customRecurringConfiguration = undefined;
      specificWeeklyPatternCandidate = 'none';
      specificWeeklyPatternSource = 'none';
      explicitDateAlignmentDemotedToOneOff = true;
    }
  }

  if (
    shouldDemoteRecurringFiniteRunToOneOff(
      event,
      sourceText,
      recurringPattern,
      recurrenceUntilDate,
      hasCue,
      hasSeriesCue,
      customRecurringConfiguration
    )
  ) {
    logger.debug(`Demoted finite one-off run from recurring for "${event.name}"`, {
      recurringPatternFrom: recurringPattern,
      startDate: event.startDate,
      endDateTo: recurrenceUntilDate,
    });
    recurringPattern = 'none';
    customRecurringConfiguration = undefined;
    totalOccurrences = undefined;
    event.endDate =
      String(recurrenceUntilDate || '').trim() ||
      String(event.endDate || '').trim() ||
      String(event.startDate || '').trim();
    recurrenceUntilDate = undefined;
    forcedFiniteRunOneOff = true;
  }

  if (
    !forcedFiniteRunOneOff &&
    shouldForceExplicitDatedWeeklyOneOff(
      event,
      sourceText,
      recurringPattern,
      explicitOccurrenceDates,
      hasCue,
      hasSeriesCue,
      recurrenceUntilDate,
      totalOccurrences,
      customRecurringConfiguration
    )
  ) {
    logger.debug(`Forced explicit dated weekly item to one-off for "${event.name}"`, {
      recurringPatternFrom: recurringPattern,
      startDate: event.startDate,
      sourceText: sourceText.slice(0, 220),
    });
    recurringPattern = 'none';
    customRecurringConfiguration = undefined;
    totalOccurrences = undefined;
    recurrenceUntilDate = undefined;
    forcedFiniteRunOneOff = true;
  }

  if (
    !forcedFiniteRunOneOff &&
    shouldForceSingleExplicitDateOneOff(
      event,
      sourceText,
      recurringPattern,
      explicitOccurrenceDates,
      recurrenceUntilDate,
      totalOccurrences,
      customRecurringConfiguration
    )
  ) {
    logger.debug(`Forced single explicit-date weekly item to one-off for "${event.name}"`, {
      recurringPatternFrom: recurringPattern,
      startDate: event.startDate,
      sourceText: sourceText.slice(0, 220),
    });
    recurringPattern = 'none';
    customRecurringConfiguration = undefined;
    totalOccurrences = undefined;
    recurrenceUntilDate = undefined;
    forcedFiniteRunOneOff = true;
  }

  if (
    !forcedFiniteRunOneOff &&
    shouldForceWeakWeekdaySpecialOneOff(
      event,
      sourceText,
      recurringPattern,
      recurrenceUntilDate,
      totalOccurrences,
      customRecurringConfiguration
    )
  ) {
    logger.debug(`Forced weak weekday special to one-off for "${event.name}"`, {
      recurringPatternFrom: recurringPattern,
      startDate: event.startDate,
      sourceText: sourceText.slice(0, 220),
    });
    recurringPattern = 'none';
    customRecurringConfiguration = undefined;
    totalOccurrences = undefined;
    recurrenceUntilDate = undefined;
    forcedFiniteRunOneOff = true;
  }

  if (
    incomingRecurringPattern === 'none' &&
    recurringPattern.startsWith('weekly_') &&
    recurringPattern !== 'weekly_custom' &&
    !customRecurringConfiguration &&
    sourceWeekdayPatterns.size > 1 &&
    itemLocalRecurringPattern === 'none'
  ) {
    logger.debug(`Rejected mixed-board row-scoped weekday fallback for "${event.name}"`, {
      recurringPatternFrom: recurringPattern,
      startDate: event.startDate,
      sourceText: sourceText.slice(0, 220),
    });
    recurringPattern = 'none';
    specificWeeklyPatternCandidate = 'none';
    specificWeeklyPatternSource = 'none';
  }

  if (
    recurringPattern !== 'none' &&
    !customRecurringConfiguration &&
    !explicitDateAlignmentDemotedToOneOff &&
    !forcedFiniteRunOneOff
  ) {
    const alignedRecurringStartDate = alignSingleWeekdayRecurringStartDate(
      event.startDate,
      recurringPattern
    );
    if (
      alignedRecurringStartDate &&
      alignedRecurringStartDate !== String(event.startDate || '').trim()
    ) {
      const alignedEndDate = resolveOccurrenceLocalEndDate(
        alignedRecurringStartDate,
        event.startTime,
        event.endTime
      );
      logger.debug(`Realigned recurring anchor date for "${event.name}"`, {
        recurringPattern,
        startDateFrom: event.startDate,
        startDateTo: alignedRecurringStartDate,
        endDateFrom: event.endDate,
        endDateTo: alignedEndDate || alignedRecurringStartDate,
      });
      event.startDate = alignedRecurringStartDate;
      event.endDate = alignedEndDate || alignedRecurringStartDate;
    }
  }

  if (!recurrenceUntilDate && totalOccurrences) {
    recurrenceUntilDate = projectRecurrenceUntilDate(
      event.startDate,
      recurringPattern,
      totalOccurrences,
      customRecurringConfiguration
    );
  }

  if (
    recurringPattern !== 'none' &&
    !recurrenceUntilDate &&
    totalOccurrences === undefined &&
    hasFiniteEventDateWindow(event) &&
    (
      recurringPattern === 'daily' ||
      hasSeriesCue ||
      specificWeeklyPatternCandidate !== 'none' ||
      Boolean(customRecurringConfiguration)
    )
  ) {
    recurrenceUntilDate = String(event.endDate || '').trim() || undefined;
  }

  const recurringFlag = normalizeRecurringFlagValue(event.isRecurring);
  const hasRecurringSignal =
    hasCue ||
    specificWeeklyPatternCandidate !== 'none' ||
    Boolean(customRecurringConfiguration);
  let isRecurring = recurringPattern !== 'none';

  if (!isRecurring && recurringFlag === 'yes' && hasRecurringSignal) {
    isRecurring = true;
  }
  if (!isRecurring && (totalOccurrences !== undefined || recurrenceUntilDate !== undefined)) {
    isRecurring = true;
  }
  if (recurringFlag === 'no' && !hasRecurringSignal && recurringPattern === 'none') {
    isRecurring = false;
  }
  if (explicitDateAlignmentDemotedToOneOff) {
    recurringPattern = 'none';
    totalOccurrences = undefined;
    recurrenceUntilDate = undefined;
    isRecurring = false;
  }
  if (forcedFiniteRunOneOff) {
    recurringPattern = 'none';
    totalOccurrences = undefined;
    recurrenceUntilDate = undefined;
    isRecurring = false;
  }

  if (babasIslandJazzAnalysis.shouldForceOneOff) {
    logger.debug(`Forced Baba's Island Jazz specific show to one-off for "${event.name}"`, {
      recurringPatternFrom: recurringPattern,
      hasSpecificShowSignal: babasIslandJazzAnalysis.hasSpecificShowSignal,
      hasOneOffAnchor: babasIslandJazzAnalysis.hasOneOffAnchor,
      isGenericFallback: babasIslandJazzAnalysis.isGenericFallback,
    });
    recurringPattern = 'none';
    customRecurringConfiguration = undefined;
    totalOccurrences = undefined;
    recurrenceUntilDate = undefined;
    isRecurring = false;
  }

  if (
    recurringPattern !== 'none' &&
    !hasRecurringSignal &&
    !recurrenceUntilDate &&
    totalOccurrences === undefined &&
    !hasFiniteEventDateWindow(event) &&
    (hasConcreteDate ||
      specificWeeklyPatternCandidate !== 'none' ||
      (hasOneOffCue && !hasSeriesCue))
  ) {
    logger.debug(`Removed suspicious recurrence for "${event.name}"`, {
      recurringPattern,
      sourceText: sourceText.slice(0, 200),
    });
    recurringPattern = 'none';
    isRecurring = false;
  }

  const shouldForceHolidayWeekendOneOff =
    recurringPattern !== 'none' &&
    recurringPattern !== 'daily' &&
    !customRecurringConfiguration &&
    FOOD_CATEGORIES.includes(event.category) &&
    !hasSeriesCue &&
    !recurrenceUntilDate &&
    totalOccurrences === undefined &&
    String(event.startDate || '').trim() === String(event.endDate || '').trim() &&
    hasHolidayWeekendOneOffCue(sourceText);

  if (shouldForceHolidayWeekendOneOff) {
    logger.debug(`Forced holiday/weekend weekly special to one-off for "${event.name}"`, {
      recurringPatternFrom: recurringPattern,
      startDate: event.startDate,
      endDate: event.endDate,
      sourceText: sourceText.slice(0, 220),
    });
    recurringPattern = 'none';
    isRecurring = false;
  }

  if (
    recurringPattern !== 'none' &&
    !customRecurringConfiguration &&
    hasSingleDayMultiSessionOneOffCue(event, sourceText)
  ) {
    logger.debug(`Forced same-day multi-session event to one-off for "${event.name}"`, {
      recurringPatternFrom: recurringPattern,
      startDate: event.startDate,
      endDate: event.endDate,
      sourceText: sourceText.slice(0, 220),
    });
    recurringPattern = 'none';
    totalOccurrences = undefined;
    recurrenceUntilDate = undefined;
    isRecurring = false;
  }

  if (!isRecurring) {
    recurringPattern = 'none';
    event.totalOccurrences = undefined;
    event.recurrenceUntilDate = undefined;
    event.recurringDaysOfWeek = undefined;
    event.recurringWeekdaySequence = undefined;
    event.recurringWeekInterval = undefined;
    event.isRecurring = false;
    event.recurringPattern = recurringPattern;
    return event;
  }

  event.isRecurring = true;
  event.recurringPattern = recurringPattern;
  event.recurringDaysOfWeek = customRecurringConfiguration?.recurringDaysOfWeek;
  event.recurringWeekdaySequence = customRecurringConfiguration?.recurringWeekdaySequence;
  event.recurringWeekInterval = customRecurringConfiguration?.recurringWeekInterval;
  event.totalOccurrences = totalOccurrences;
  event.recurrenceUntilDate = recurrenceUntilDate;
  return event;
}

export function applyRecurrenceNormalizationForRegression(
  event: FormattedEvent,
  originalItem?: ExtractedItem
): FormattedEvent {
  const normalizedEvent = {
    ...event,
    recurringDaysOfWeek: Array.isArray(event.recurringDaysOfWeek)
      ? [...event.recurringDaysOfWeek]
      : event.recurringDaysOfWeek,
    recurringWeekdaySequence: Array.isArray(event.recurringWeekdaySequence)
      ? [...event.recurringWeekdaySequence]
      : event.recurringWeekdaySequence,
  } as FormattedEvent;

  const normalizedOriginalItem = originalItem
    ? ({
        ...originalItem,
        recurringDaysOfWeek: Array.isArray((originalItem as Record<string, unknown>).recurringDaysOfWeek)
          ? [...((originalItem as Record<string, unknown>).recurringDaysOfWeek as RecurringWeekday[])]
          : (originalItem as Record<string, unknown>).recurringDaysOfWeek,
        recurringWeekdaySequence: Array.isArray((originalItem as Record<string, unknown>).recurringWeekdaySequence)
          ? [...((originalItem as Record<string, unknown>).recurringWeekdaySequence as RecurringWeekday[])]
          : (originalItem as Record<string, unknown>).recurringWeekdaySequence,
      } as ExtractedItem)
    : undefined;

  return normalizeRecurringForFormattedEvent(normalizedEvent, normalizedOriginalItem);
}

function applyLegacyRecurringNormalization(event: FormattedEvent): FormattedEvent {
  event.recurringPattern = sanitizeRecurringPattern(event.recurringPattern, event);
  const sourceText = buildRecurrenceSourceText(event);
  let customRecurringConfiguration = resolveCustomRecurringConfiguration(
    sourceText,
    event.startDate,
    event,
    undefined
  );
  const startDatePattern = patternFromIsoDate(event.startDate);
  if (
    customRecurringConfiguration &&
    event.recurringPattern.startsWith('weekly_') &&
    event.recurringPattern !== 'weekly_custom' &&
    startDatePattern === event.recurringPattern
  ) {
    customRecurringConfiguration = undefined;
  }
  if (customRecurringConfiguration) {
    event.recurringPattern = 'weekly_custom';
    event.recurringDaysOfWeek = customRecurringConfiguration.recurringDaysOfWeek;
    event.recurringWeekdaySequence = customRecurringConfiguration.recurringWeekdaySequence;
    event.recurringWeekInterval = customRecurringConfiguration.recurringWeekInterval;
  } else {
    const detectedStandaloneWeeklyPattern = detectStandaloneWeeklyPattern(sourceText);
    const trustedStandaloneWeeklyPattern =
      detectedStandaloneWeeklyPattern !== 'none' &&
      shouldTrustStandaloneWeeklyPattern(event, sourceText)
        ? detectedStandaloneWeeklyPattern
        : 'none';

    if (
      event.recurringPattern === 'none' &&
      trustedStandaloneWeeklyPattern !== 'none' &&
      canPromoteToStandaloneWeeklyPattern(event, sourceText)
    ) {
      event.recurringPattern = trustedStandaloneWeeklyPattern;
    }

    if (event.recurringPattern === 'weekly_custom') {
      event.recurringPattern = trustedStandaloneWeeklyPattern;
    } else if (
      event.recurringPattern === 'daily' &&
      trustedStandaloneWeeklyPattern !== 'none' &&
      canPromoteToStandaloneWeeklyPattern(event, sourceText)
    ) {
      event.recurringPattern = trustedStandaloneWeeklyPattern;
    }

    event.recurringDaysOfWeek = undefined;
    event.recurringWeekdaySequence = undefined;
    event.recurringWeekInterval = undefined;
  }
  if (event.recurringPattern === 'none') {
    const impliedPattern = inferImplicitWeeklyPatternForSpecial(event);
    if (impliedPattern !== 'none') {
      event.recurringPattern = impliedPattern;
      logger.debug(`Implied recurring pattern for "${event.name}": ${impliedPattern}`);
    }
  }
  event.isRecurring =
    event.recurringPattern !== 'none' &&
    Boolean(event.isRecurring === true || event.recurringPattern);
  event.totalOccurrences = undefined;
  event.recurrenceUntilDate = undefined;
  return event;
}

function normalizeWeekdayToken(token: string | undefined): string {
  return String(token || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/s$/, '');
}

function normalizeWeekdayExtractionText(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/\u2012|\u2013|\u2014|\u2015|â€“|â€”/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeRecurringWeekdayToken(token: unknown): RecurringWeekday | null {
  const normalized = normalizeWeekdayToken(String(token || ''));
  return WEEKDAY_TOKEN_TO_CANONICAL[normalized] || null;
}

function dedupeRecurringWeekdays(days: RecurringWeekday[]): RecurringWeekday[] {
  const seen = new Set<RecurringWeekday>();
  const deduped: RecurringWeekday[] = [];
  for (const day of days) {
    if (!day || seen.has(day)) continue;
    seen.add(day);
    deduped.push(day);
  }
  return deduped;
}

function normalizeRecurringWeekdayListValue(value: unknown): RecurringWeekday[] | undefined {
  if (value == null) return undefined;

  let rawValues: unknown[] = [];
  if (Array.isArray(value)) {
    rawValues = value;
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        rawValues = parsed;
      } else {
        rawValues = trimmed.split(/[\s,|/]+/);
      }
    } catch {
      rawValues = trimmed.split(/[\s,|/]+/);
    }
  } else {
    rawValues = [value];
  }

  const normalized = dedupeRecurringWeekdays(
    rawValues
      .map((entry) => normalizeRecurringWeekdayToken(entry))
      .filter(Boolean) as RecurringWeekday[]
  );
  return normalized.length ? normalized : undefined;
}

function expandRecurringWeekdayRange(
  startDay: RecurringWeekday,
  endDay: RecurringWeekday
): RecurringWeekday[] {
  const startIndex = CANONICAL_RECURRING_WEEKDAYS.indexOf(startDay);
  const endIndex = CANONICAL_RECURRING_WEEKDAYS.indexOf(endDay);
  if (startIndex === -1 || endIndex === -1) return [];

  const days: RecurringWeekday[] = [];
  let index = startIndex;
  let guard = 0;
  while (guard < CANONICAL_RECURRING_WEEKDAYS.length) {
    days.push(CANONICAL_RECURRING_WEEKDAYS[index]);
    if (index === endIndex) {
      break;
    }
    index = (index + 1) % CANONICAL_RECURRING_WEEKDAYS.length;
    guard += 1;
  }

  return dedupeRecurringWeekdays(days);
}

function extractRecurringWeekIntervalFromText(text: string): number | undefined {
  const normalized = String(text || '').toLowerCase();
  if (!normalized) return undefined;

  if (/\b(biweekly|fortnightly|every other week|every 2 weeks|every second week)\b/.test(normalized)) {
    return 2;
  }

  return undefined;
}

function alignRecurringWeekdaySequenceToStartDate(
  sequence: RecurringWeekday[],
  startDate: string | undefined
): RecurringWeekday[] {
  const normalized = dedupeRecurringWeekdays(sequence);
  if (!normalized.length) return normalized;
  const startPattern = patternFromIsoDate(startDate);
  const startDay = startPattern
    ? normalizeRecurringWeekdayToken(startPattern.replace('weekly_', ''))
    : null;
  if (!startDay) return normalized;

  const startIndex = normalized.indexOf(startDay);
  if (startIndex <= 0) return normalized;
  return normalized.slice(startIndex).concat(normalized.slice(0, startIndex));
}

function extractAlternatingRecurringWeekdaySequence(
  text: string,
  startDate: string | undefined
): RecurringWeekday[] | undefined {
  const normalized = String(text || '').toLowerCase();
  if (!normalized || !/\balternating\b/.test(normalized)) return undefined;

  const match = normalized.match(
    /\balternating(?:\s+between)?\s+(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:\s*,\s*|\s+(?:and|&)\s+)(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/
  );
  if (!match) return undefined;

  const firstDay = normalizeRecurringWeekdayToken(match[1]);
  const secondDay = normalizeRecurringWeekdayToken(match[2]);
  if (!firstDay || !secondDay) return undefined;

  return alignRecurringWeekdaySequenceToStartDate([firstDay, secondDay], startDate);
}

function extractCompactRecurringWeekdaySet(text: string): RecurringWeekday[] | undefined {
  const normalized = normalizeWeekdayExtractionText(text);
  if (!normalized) return undefined;

  const mwfMatch = normalized.match(/\bm\s*\/?\s*w\s*\/?\s*f\b/);
  if (mwfMatch) {
    return ['monday', 'wednesday', 'friday'];
  }

  return undefined;
}

function extractRecurringWeekdayRange(text: string): RecurringWeekday[] | undefined {
  const normalized = normalizeWeekdayExtractionText(text);
  if (!normalized) return undefined;

  if (/\bweekdays\b/.test(normalized)) {
    return ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  }

  const supplementalRangeMatch =
    normalized.match(
      /\bbetween\s+(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b\s+and\s+\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/
    ) ||
    normalized.match(
      /\bfrom\s+(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b\s+to\s+\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/
    );

  const rangeMatch = normalized.match(
    /\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b\s*(?:-|–|—|to|through|thru)\s*\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/
  );
  const resolvedRangeMatch = supplementalRangeMatch || rangeMatch;
  if (!resolvedRangeMatch) return undefined;

  const startDay = normalizeRecurringWeekdayToken(resolvedRangeMatch[1]);
  const endDay = normalizeRecurringWeekdayToken(resolvedRangeMatch[2]);
  if (!startDay || !endDay) return undefined;

  const expanded = expandRecurringWeekdayRange(startDay, endDay);
  return expanded.length > 1 ? expanded : undefined;
}

function extractRecurringDaysOfWeekList(text: string): RecurringWeekday[] | undefined {
  const normalized = normalizeWeekdayExtractionText(text);
  if (!normalized || /\balternating\b/.test(normalized)) return undefined;
  if (hasConcreteDateReference(normalized)) return undefined;

  const dayListMatch = normalized.match(
    /\b(?:(?:every|each|weekly|on)\s+)?((?:mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:\s*,\s*(?:mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun))*(?:\s*(?:and|&)\s*(?:mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun))+)\b/
  );
  if (!dayListMatch || !dayListMatch[1]) return undefined;

  const tokens = Array.from(
    dayListMatch[1].matchAll(
      /\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/g
    )
  );
  const weekdays = dedupeRecurringWeekdays(
    tokens
      .map((match) => normalizeRecurringWeekdayToken(match[1]))
      .filter(Boolean) as RecurringWeekday[]
  );
  return weekdays.length > 1 ? weekdays : undefined;
}

function resolveCustomRecurringConfiguration(
  sourceText: string,
  startDate: string | undefined,
  eventRecord?: Record<string, unknown>,
  itemRecord?: Record<string, unknown>
):
  | {
      recurringDaysOfWeek?: RecurringWeekday[];
      recurringWeekdaySequence?: RecurringWeekday[];
      recurringWeekInterval?: number;
    }
  | undefined {
  const existingDays =
    normalizeRecurringWeekdayListValue(eventRecord?.recurringDaysOfWeek) ||
    normalizeRecurringWeekdayListValue(eventRecord?.recurrenceDaysOfWeek) ||
    normalizeRecurringWeekdayListValue(itemRecord?.recurringDaysOfWeek) ||
    normalizeRecurringWeekdayListValue(itemRecord?.recurrenceDaysOfWeek);
  const existingSequence =
    normalizeRecurringWeekdayListValue(eventRecord?.recurringWeekdaySequence) ||
    normalizeRecurringWeekdayListValue(eventRecord?.recurrenceWeekdaySequence) ||
    normalizeRecurringWeekdayListValue(itemRecord?.recurringWeekdaySequence) ||
    normalizeRecurringWeekdayListValue(itemRecord?.recurrenceWeekdaySequence);
  const existingWeekInterval =
    parsePositiveIntegerValue(eventRecord?.recurringWeekInterval) ||
    parsePositiveIntegerValue(eventRecord?.recurrenceWeekInterval) ||
    parsePositiveIntegerValue(itemRecord?.recurringWeekInterval) ||
    parsePositiveIntegerValue(itemRecord?.recurrenceWeekInterval) ||
    1;

  if (existingSequence?.length) {
    return {
      recurringWeekdaySequence: alignRecurringWeekdaySequenceToStartDate(existingSequence, startDate),
      recurringWeekInterval: existingWeekInterval,
    };
  }

  if (existingDays?.length && existingDays.length > 1) {
    return {
      recurringDaysOfWeek: existingDays,
      recurringWeekInterval: existingWeekInterval,
    };
  }

  const recurringWeekInterval = extractRecurringWeekIntervalFromText(sourceText) || 1;
  const recurringWeekdaySequence = extractAlternatingRecurringWeekdaySequence(
    sourceText,
    startDate
  );
  if (recurringWeekdaySequence?.length) {
    return {
      recurringWeekdaySequence,
      recurringWeekInterval,
    };
  }

  const recurringDaysOfWeek =
    extractCompactRecurringWeekdaySet(sourceText) ||
    extractRecurringWeekdayRange(sourceText) ||
    extractRecurringDaysOfWeekList(sourceText);
  if (recurringDaysOfWeek?.length && recurringDaysOfWeek.length > 1) {
    return {
      recurringDaysOfWeek,
      recurringWeekInterval,
    };
  }

  return undefined;
}

function parseIsoDate(value: string | undefined): Date | null {
  const v = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIsoDateUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toIsoDateFromParts(year: number, month: number, day: number): string | null {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return toIsoDateUtc(dt);
}

function normalizeMonthToken(token: string | undefined): string {
  return String(token || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

function buildDateRangeFromParts(
  startMonthToken: string,
  startDayToken: string,
  endMonthToken: string | undefined,
  endDayToken: string,
  yearToken: string | undefined,
  fallbackYear: number
): { startDate: string; endDate: string } | null {
  const startMonth = MONTH_TOKEN_TO_NUMBER[normalizeMonthToken(startMonthToken)];
  const endMonth =
    MONTH_TOKEN_TO_NUMBER[normalizeMonthToken(endMonthToken || startMonthToken)] || startMonth;
  const startDay = Number(startDayToken);
  const endDay = Number(endDayToken);
  const baseYear =
    yearToken && /^\d{4}$/.test(yearToken.trim()) ? Number(yearToken.trim()) : fallbackYear;

  if (!startMonth || !endMonth || !Number.isFinite(startDay) || !Number.isFinite(endDay)) {
    return null;
  }

  const startDate = toIsoDateFromParts(baseYear, startMonth, startDay);
  if (!startDate) return null;

  let endYear = baseYear;
  if (endMonth < startMonth || (endMonth === startMonth && endDay < startDay)) {
    endYear = baseYear + 1;
  }
  const endDate = toIsoDateFromParts(endYear, endMonth, endDay);
  if (!endDate) return null;

  return { startDate, endDate };
}

function extractExplicitMonthDayRange(
  text: string,
  fallbackYear: number
): { startDate: string; endDate: string } | null {
  const monthsPattern =
    '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

  const sameMonthRe = new RegExp(
    `\\b${monthsPattern}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|\\u2013|\\u2014|to|through|thru)\\s*(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2}))?\\b`,
    'i'
  );
  const sameMonthMatch = text.match(sameMonthRe);
  if (sameMonthMatch) {
    return buildDateRangeFromParts(
      sameMonthMatch[1],
      sameMonthMatch[2],
      sameMonthMatch[1],
      sameMonthMatch[3],
      sameMonthMatch[4],
      fallbackYear
    );
  }

  const crossMonthRe = new RegExp(
    `\\b${monthsPattern}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|\\u2013|\\u2014|to|through|thru)\\s*${monthsPattern}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2}))?\\b`,
    'i'
  );
  const crossMonthMatch = text.match(crossMonthRe);
  if (crossMonthMatch) {
    return buildDateRangeFromParts(
      crossMonthMatch[1],
      crossMonthMatch[2],
      crossMonthMatch[3],
      crossMonthMatch[4],
      crossMonthMatch[5],
      fallbackYear
    );
  }

  const fromToRe = new RegExp(
    `\\bfrom\\s+${monthsPattern}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:to|through|thru)\\s+(?:${monthsPattern}\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2}))?\\b`,
    'i'
  );
  const fromToMatch = text.match(fromToRe);
  if (fromToMatch) {
    return buildDateRangeFromParts(
      fromToMatch[1],
      fromToMatch[2],
      fromToMatch[3] || fromToMatch[1],
      fromToMatch[4],
      fromToMatch[5],
      fallbackYear
    );
  }

  return null;
}

export function applyExplicitDateRangeCorrections(
  event: FormattedEvent,
  originalItem?: ExtractedItem
): FormattedEvent {
  const text = [
    String(event.name || ''),
    String(event.description || ''),
    String((originalItem as any)?.description || ''),
    String((originalItem as any)?.extractionReason || ''),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!text) return event;

  const currentStartDate = String(event.startDate || '').trim();
  const currentEndDate = String(event.endDate || '').trim() || currentStartDate;
  if (!currentStartDate) return event;

  const parsedStart = parseIsoDate(currentStartDate);
  const parsedEnd = parseIsoDate(currentEndDate);
  const itemDate = parseIsoDate(String((originalItem as any)?.date || '').trim());
  const fallbackYear =
    parsedStart?.getUTCFullYear() || parsedEnd?.getUTCFullYear() || itemDate?.getUTCFullYear() || new Date().getUTCFullYear();

  const explicitRange = extractExplicitMonthDayRange(text, fallbackYear);
  if (!explicitRange) return event;

  const originalItemDate = String((originalItem as any)?.date || '').trim();
  const pipelineTotalStage3 = Number((originalItem as any)?._pipelineTotalStage3 || 0);
  const shouldPreserveSplitSingleDate =
    pipelineTotalStage3 > 1 &&
    !!originalItemDate &&
    originalItemDate === currentStartDate &&
    currentEndDate === currentStartDate;
  if (shouldPreserveSplitSingleDate) {
    return event;
  }

  const rawRecurringPattern = sanitizeRecurringPattern(event.recurringPattern, event);
  const hasWeekdayCue =
    /\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|weekdays|weekends?)\b/.test(
      text
    );
  const looksLikeRecurringSeries =
    rawRecurringPattern !== 'none' ||
    detectStandaloneWeeklyPattern(text) !== 'none' ||
    hasRecurringCue(text) ||
    (hasSeriesOrProgramCue(text) && hasWeekdayCue);
  if (looksLikeRecurringSeries) {
    return event;
  }

  const hasRangeCue = /\b(each day|daily|from|through|thru|runs?|running|week)\b/.test(text);
  if (!hasRangeCue && currentEndDate && currentEndDate !== currentStartDate) {
    return event;
  }

  if (
    explicitRange.startDate === currentStartDate &&
    explicitRange.endDate === currentEndDate
  ) {
    return event;
  }

  logger.debug(`Applied explicit date range correction for "${event.name}"`, {
    startDateFrom: currentStartDate,
    startDateTo: explicitRange.startDate,
    endDateFrom: currentEndDate,
    endDateTo: explicitRange.endDate,
  });

  event.startDate = explicitRange.startDate;
  event.endDate = explicitRange.endDate;
  return event;
}

function normalizeRecurringSeriesSpan(event: FormattedEvent): FormattedEvent {
  const recurringPattern = sanitizeRecurringPattern(event.recurringPattern, event);
  if (recurringPattern === 'none' || !isRecurringFlagEnabled(event.isRecurring)) {
    return event;
  }

  const startDate = String(event.startDate || '').trim();
  const endDate = String(event.endDate || '').trim();
  const recurrenceUntilDate = parseDateOnlyValue(event.recurrenceUntilDate);
  const totalOccurrences = parsePositiveIntegerValue(event.totalOccurrences);
  if (!startDate || !endDate || endDate <= startDate) {
    return event;
  }

  const startTime = String(event.startTime || '').trim();
  const endTime = String(event.endTime || '').trim();
  const looksLikeOvernightOccurrence =
    Boolean(startTime && endTime) && endTime < startTime;
  const shouldCollapseSpan =
    !looksLikeOvernightOccurrence &&
    (
      (recurrenceUntilDate && recurrenceUntilDate === endDate) ||
      Boolean(totalOccurrences && totalOccurrences > 1)
    );

  if (!shouldCollapseSpan) {
    return event;
  }

  const resolvedRecurrenceUntilDate = recurrenceUntilDate || endDate;
  logger.debug(`Collapsed recurring series span for "${event.name}"`, {
    startDate,
    endDateFrom: endDate,
    endDateTo: startDate,
    recurrenceUntilDateFrom: recurrenceUntilDate || '',
    recurrenceUntilDateTo: resolvedRecurrenceUntilDate,
  });

  event.endDate = startDate;
  event.recurrenceUntilDate = resolvedRecurrenceUntilDate;
  return event;
}

function normalizeRecurringSeriesTextForKey(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function buildRecurringSeriesCollapseKey(event: FormattedEvent): string | null {
  const recurringPattern = sanitizeRecurringPattern(event.recurringPattern, event);
  if (recurringPattern === 'none' || !isRecurringFlagEnabled(event.isRecurring)) {
    return null;
  }

  return [
    normalizeRecurringSeriesTextForKey(event.establishment),
    normalizeRecurringSeriesTextForKey(event.additionalLocation),
    normalizeRecurringSeriesTextForKey(event.category),
    normalizeRecurringSeriesTextForKey(event.name),
    String(event.startTime || '').trim(),
    String(event.endTime || '').trim(),
    recurringPattern,
    (Array.isArray(event.recurringDaysOfWeek) ? event.recurringDaysOfWeek : []).join(','),
    (Array.isArray(event.recurringWeekdaySequence) ? event.recurringWeekdaySequence : []).join(','),
    String(event.recurringWeekInterval || ''),
    String(event.ticketPrice || '').trim(),
  ].join('|');
}

function buildFiniteWeeklyOneOffSequenceKey(event: FormattedEvent): string | null {
  const recurringPattern = sanitizeRecurringPattern(event.recurringPattern, event);
  if (recurringPattern !== 'none' || isRecurringFlagEnabled(event.isRecurring)) {
    return null;
  }

  const startDate = String(event.startDate || '').trim();
  const endDate = String(event.endDate || '').trim() || startDate;
  if (!parseIsoDate(startDate) || startDate !== endDate) {
    return null;
  }

  return [
    normalizeRecurringSeriesTextForKey(event.establishment),
    normalizeRecurringSeriesTextForKey(event.additionalLocation),
    normalizeRecurringSeriesTextForKey(event.category),
    normalizeRecurringSeriesTextForKey(event.name),
    String(event.startTime || '').trim(),
    String(event.endTime || '').trim(),
    String(event.ticketPrice || '').trim(),
  ].join('|');
}

function promoteFiniteWeeklyOneOffSequences(events: FormattedEvent[]): FormattedEvent[] {
  const groups = new Map<string, Array<{ index: number; startDate: string }>>();

  events.forEach((event, index) => {
    const key = buildFiniteWeeklyOneOffSequenceKey(event);
    if (!key) return;
    const startDate = String(event.startDate || '').trim();
    const group = groups.get(key) || [];
    group.push({ index, startDate });
    groups.set(key, group);
  });

  const promoted = events.map((event) => ({ ...event }));

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const sorted = group
      .filter((entry) => Boolean(parseIsoDate(entry.startDate)))
      .sort((left, right) => left.startDate.localeCompare(right.startDate));
    if (sorted.length < 2) continue;

    const firstDate = sorted[0].startDate;
    const pattern = patternFromIsoDate(firstDate);
    if (pattern === 'none') continue;

    const distinctDates = Array.from(new Set(sorted.map((entry) => entry.startDate)));
    if (distinctDates.length !== sorted.length) continue;

    const sameWeekday = distinctDates.every((date) => patternFromIsoDate(date) === pattern);
    if (!sameWeekday) continue;

    let consecutiveWeekly = true;
    for (let index = 1; index < distinctDates.length; index += 1) {
      if (getDifferenceInDays(distinctDates[index - 1], distinctDates[index]) !== 7) {
        consecutiveWeekly = false;
        break;
      }
    }
    if (!consecutiveWeekly) continue;

    const recurrenceUntilDate = distinctDates[distinctDates.length - 1];
    for (const entry of sorted) {
      const event = promoted[entry.index];
      event.isRecurring = true;
      event.recurringPattern = pattern;
      event.totalOccurrences = distinctDates.length;
      event.recurrenceUntilDate = recurrenceUntilDate;
    }

    logger.debug(`Promoted finite weekly one-off sequence for "${promoted[sorted[0].index].name}"`, {
      recurringPattern: pattern,
      startDate: firstDate,
      recurrenceUntilDate,
      totalOccurrences: distinctDates.length,
    });
  }

  return promoted;
}

function collapseRecurringSeriesEvents(events: FormattedEvent[]): FormattedEvent[] {
  const collapsed: FormattedEvent[] = [];
  const collapseIndexByKey = new Map<string, number>();
  const collapseDatesByKey = new Map<string, Set<string>>();

  for (const originalEvent of events) {
    const event = normalizeRecurringSeriesSpan({ ...originalEvent });
    const collapseKey = buildRecurringSeriesCollapseKey(event);
    if (!collapseKey) {
      collapsed.push(event);
      continue;
    }

    const existingIndex = collapseIndexByKey.get(collapseKey);
    if (existingIndex === undefined) {
      collapseIndexByKey.set(collapseKey, collapsed.length);
      const initialDates = new Set<string>();
      if (parseIsoDate(String(event.startDate || '').trim())) {
        initialDates.add(String(event.startDate || '').trim());
      }
      collapseDatesByKey.set(collapseKey, initialDates);
      collapsed.push(event);
      continue;
    }

    const keeper = collapsed[existingIndex];
    const mergedDates = collapseDatesByKey.get(collapseKey) || new Set<string>();
    const keeperStartDate = String(keeper.startDate || '').trim();
    const candidateStartDate = String(event.startDate || '').trim();
    if (parseIsoDate(keeperStartDate)) mergedDates.add(keeperStartDate);
    if (parseIsoDate(candidateStartDate)) mergedDates.add(candidateStartDate);
    collapseDatesByKey.set(collapseKey, mergedDates);

    const mergedStartDate = [keeperStartDate, candidateStartDate]
      .filter((value) => Boolean(parseIsoDate(value)))
      .sort()[0];
    if (mergedStartDate && mergedStartDate !== keeperStartDate) {
      keeper.startDate = mergedStartDate;
      keeper.endDate = mergedStartDate;
    }

    const mergedRecurrenceUntilDate = [
      parseDateOnlyValue(keeper.recurrenceUntilDate),
      parseDateOnlyValue(event.recurrenceUntilDate),
    ]
      .filter((value): value is string => Boolean(value && parseIsoDate(value)))
      .sort()
      .slice(-1)[0];
    if (mergedRecurrenceUntilDate) {
      keeper.recurrenceUntilDate = mergedRecurrenceUntilDate;
    }

    const mergedTotalOccurrences = Math.max(
      parsePositiveIntegerValue(keeper.totalOccurrences) || 0,
      parsePositiveIntegerValue(event.totalOccurrences) || 0,
      mergedDates.size
    );
    if (mergedTotalOccurrences > 0) {
      keeper.totalOccurrences = mergedTotalOccurrences;
    }

    logger.debug(`Collapsed recurring series duplicate for "${event.name}"`, {
      keptStartDate: keeper.startDate,
      droppedStartDate: event.startDate,
      recurringPattern: keeper.recurringPattern,
      recurrenceUntilDate: keeper.recurrenceUntilDate || '',
      totalOccurrences: keeper.totalOccurrences || 0,
    });
  }

  return collapsed;
}

function computeEndDateForWeekdayRange(startDate: string, endWeekday: number): string {
  const start = parseIsoDate(startDate);
  if (!start) return startDate;
  const end = new Date(start.getTime());
  let guard = 0;
  while (end.getUTCDay() !== endWeekday && guard < 7) {
    end.setUTCDate(end.getUTCDate() + 1);
    guard++;
  }
  return toIsoDateUtc(end);
}

function applyWeekdayRangeCorrections(
  event: FormattedEvent,
  originalItem?: ExtractedItem
): FormattedEvent {
  if (!FOOD_CATEGORIES.includes(event.category)) return event;

  const text = [
    String(event.name || ''),
    String(event.description || ''),
    String((originalItem as any)?.description || ''),
    String((originalItem as any)?.extractionReason || ''),
  ]
    .filter(Boolean)
    .join(' ');
  const normalizedText = normalizeWeekdayExtractionText(text);

  const supplementalRangeMatch =
    normalizedText.match(
      /\bbetween\s+(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b\s+and\s+\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/
    ) ||
    normalizedText.match(
      /\bfrom\s+(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b\s+to\s+\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/
    );
  const rangeMatch = normalizedText.match(
    /\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b\s*(?:-|to|through|thru)\s*\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/
  );
  const resolvedRangeMatch = supplementalRangeMatch || rangeMatch;
  if (!resolvedRangeMatch) return event;

  const startToken = normalizeWeekdayToken(resolvedRangeMatch[1]);
  const endToken = normalizeWeekdayToken(resolvedRangeMatch[2]);
  const startWeekday = WEEKDAY_TOKEN_TO_INDEX[startToken];
  const endWeekday = WEEKDAY_TOKEN_TO_INDEX[endToken];
  if (startWeekday === undefined || endWeekday === undefined) return event;

  const startDate = String(event.startDate || '').trim();
  if (!startDate) return event;

  const parsedStart = parseIsoDate(startDate);
  if (!parsedStart) return event;

  let correctedStartDate = startDate;
  if (parsedStart.getUTCDay() !== startWeekday) {
    const shifted = new Date(parsedStart.getTime());
    let guard = 0;
    while (shifted.getUTCDay() !== startWeekday && guard < 7) {
      shifted.setUTCDate(shifted.getUTCDate() + 1);
      guard++;
    }
    correctedStartDate = toIsoDateUtc(shifted);
  }

  const correctedEndDate = computeEndDateForWeekdayRange(correctedStartDate, endWeekday);
  const currentEndDate = String(event.endDate || '').trim() || correctedStartDate;

  if (correctedStartDate !== event.startDate || correctedEndDate !== currentEndDate) {
    logger.debug(`Applied weekday range correction for "${event.name}"`, {
      startDateFrom: event.startDate,
      startDateTo: correctedStartDate,
      endDateFrom: currentEndDate,
      endDateTo: correctedEndDate,
      weekdayRange: `${resolvedRangeMatch[1]}-${resolvedRangeMatch[2]}`,
    });
    event.startDate = correctedStartDate;
    event.endDate = correctedEndDate;
  }

  return event;
}

function mapWeekdayTokenToPattern(token: string | undefined): RecurringPattern | null {
  if (!token) return null;
  const normalized = String(token)
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/s$/, '');
  return WEEKDAY_TOKEN_TO_PATTERN[normalized] || null;
}

function patternFromIsoDate(dateValue: string | undefined): RecurringPattern | null {
  const value = String(dateValue || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return WEEKDAY_INDEX_TO_PATTERN[date.getUTCDay()] || null;
}

function detectRecurringPatternFromText(text: string): RecurringPattern {
  const t = String(text || '').toLowerCase();

  if (/\b(every\s+single\s+day|every\s+day|everyday|daily)\b/.test(t)) {
    return 'daily';
  }

  if (/\b(weekdays|monday\s*-\s*friday|mon\s*-\s*fri)\b/.test(t)) {
    return 'daily';
  }

  const directWeeklyMatch = t.match(
    /\b(every|weekly|each)\s+(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/
  );
  const directPattern = mapWeekdayTokenToPattern(directWeeklyMatch?.[2]);
  if (directPattern) return directPattern;

  if (/\b(weekly|every|each)\b/.test(t)) {
    const onDayMatch = t.match(
      /\bon\s+(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/
    );
    const onDayPattern = mapWeekdayTokenToPattern(onDayMatch?.[1]);
    if (onDayPattern) return onDayPattern;
  }

  const namedPattern = extractFoodSpecialNamedPattern(t);
  if (namedPattern !== 'none') return namedPattern;

  return 'none';
}

function detectStandaloneWeeklyPattern(text: string): RecurringPattern {
  const normalized = normalizeWeekdayExtractionText(text);
  if (!normalized) return 'none';

  const matches = new Set<RecurringPattern>();
  const monthsPattern =
    'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
  const candidatePatterns = [
    /\bon\s+(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/g,
    /\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b\s*(?:from|at|@|\||:|,|-|\u2013|\u2014)\s*/g,
    /\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/g,
    /\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b\s+(?:mornings?|afternoons?|evenings?|nights?)\b/g,
    new RegExp(
      `\\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\\b\\s+(?:${monthsPattern})\\b`,
      'g'
    ),
  ];

  for (const pattern of candidatePatterns) {
    for (const match of normalized.matchAll(pattern)) {
      const mapped = mapWeekdayTokenToPattern(match[1]);
      if (mapped) {
        matches.add(mapped);
      }
    }
  }

  if (matches.size === 1) {
    return Array.from(matches)[0];
  }

  return 'none';
}

function shouldTrustStandaloneWeeklyPattern(
  event: Pick<FormattedEvent, 'startDate' | 'endDate'>,
  sourceText: string
): boolean {
  return hasRecurringCue(sourceText) || hasSeriesOrProgramCue(sourceText) || hasFiniteEventDateWindow(event);
}

function canPromoteToStandaloneWeeklyPattern(
  event: Pick<FormattedEvent, 'startDate' | 'endDate'>,
  sourceText: string
): boolean {
  return (
    hasSeriesOrProgramCue(sourceText) ||
    hasRecurringCue(sourceText) ||
    (!hasConcreteDateReference(sourceText) && hasFiniteEventDateWindow(event))
  );
}

function inferImplicitWeeklyPatternForSpecial(
  event: Pick<FormattedEvent, 'category' | 'name' | 'description'>,
  sourceText?: string
): RecurringPattern {
  const text = [String(sourceText || ''), String(event.name || ''), String(event.description || '')]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!text) return 'none';

  const weekdayMatch = text.match(
    /\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/
  );
  const weekdayPattern = mapWeekdayTokenToPattern(weekdayMatch?.[1]);
  if (!weekdayPattern) return 'none';

  if (hasRecurringCue(text)) return weekdayPattern;

  const namedPattern = extractFoodSpecialNamedPattern(text);
  if (namedPattern !== 'none') return namedPattern;

  const isFoodCategory = FOOD_CATEGORIES.includes(event.category);
  const hasBrunchCue = /\bbrunch\b/.test(text);

  if (isFoodCategory && hasBrunchCue) {
    return weekdayPattern;
  }

  return 'none';
}

function hasFiniteEventDateWindow(
  event: Pick<FormattedEvent, 'startDate' | 'endDate'> &
    Partial<Pick<FormattedEvent, 'startTime' | 'endTime'>>
): boolean {
  const startDate = String(event.startDate || '').trim();
  const endDate = String(event.endDate || '').trim();
  if (!(startDate && endDate && endDate > startDate)) return false;

  const daySpan = getDifferenceInDays(startDate, endDate);
  const startTime = String(event.startTime || '').trim();
  const endTime = String(event.endTime || '').trim();
  const isSingleOvernightOccurrence =
    daySpan === 1 && Boolean(startTime && endTime) && endTime < startTime;
  return !isSingleOvernightOccurrence;
}

function inferRecurringPatternFromEventContext(
  context?: Pick<FormattedEvent, 'name' | 'description' | 'startDate' | 'endDate'>
): RecurringPattern {
  if (!context) return 'none';

  const startDatePattern = patternFromIsoDate(context.startDate);
  if (startDatePattern) return startDatePattern;

  const endDatePattern = patternFromIsoDate(context.endDate);
  if (endDatePattern) return endDatePattern;

  const text = [String(context.name || ''), String(context.description || '')]
    .filter(Boolean)
    .join(' ');
  return detectRecurringPatternFromText(text);
}

/**
 * Sanitize recurring pattern value
 */
function sanitizeRecurringPattern(
  pattern: string | RecurringPattern | undefined,
  context?: Pick<FormattedEvent, 'name' | 'description' | 'startDate' | 'endDate'>
): RecurringPattern {
  if (!pattern) return 'none';
  const cleaned = pattern.toString().trim().replace(/[,;]+$/, '').toLowerCase();
  if (VALID_RECURRING_PATTERNS.includes(cleaned as RecurringPattern)) {
    return cleaned as RecurringPattern;
  }

  if (cleaned === 'weekly') {
    const inferred = inferRecurringPatternFromEventContext(context);
    if (inferred !== 'none') {
      logger.debug(`Normalized recurring pattern alias: "${pattern}" -> "${inferred}"`);
      return inferred;
    }
  }

  if (cleaned.startsWith('weekly_')) {
    const weekdayOnly = cleaned.slice('weekly_'.length);
    const mapped = mapWeekdayTokenToPattern(weekdayOnly);
    if (mapped) return mapped;
  }

  const directDayMapped = mapWeekdayTokenToPattern(cleaned);
  if (directDayMapped) return directDayMapped;

  logger.debug(`Sanitized invalid recurring pattern: "${pattern}" -> "none"`);
  return 'none';
}

/**
 * Call GPT with function calling schema
 */
async function callGPTWithSchema(
  prompt: string,
  functionName: string,
  schema: GPTFunctionSchema[],
  config: ParsingConfig
): Promise<FormattingResult> {
  const client = getOpenAIClient();
  const explicitModelOverride = String(config.stage5ModelOverride || '').trim();
  const model = explicitModelOverride || resolveStageModel(config.gptModelFast, 'STAGE5_MODEL_OVERRIDE');
  const isGpt5Model = (value: string): boolean => value.startsWith('gpt-5');
  const rawStage5ResponsesMaxTokens = Number.parseInt(
    String(process.env.STAGE5_RESPONSES_MAX_OUTPUT_TOKENS || '32000'),
    10
  );
  const stage5ResponsesMaxTokens = Number.isFinite(rawStage5ResponsesMaxTokens)
    ? Math.max(1024, rawStage5ResponsesMaxTokens)
    : 32000;
  const rawStage5ChatMaxTokens = Number.parseInt(
    String(process.env.STAGE5_CHAT_MAX_TOKENS || '8000'),
    10
  );
  const stage5ChatMaxTokens = Number.isFinite(rawStage5ChatMaxTokens)
    ? Math.max(1024, rawStage5ChatMaxTokens)
    : 8000;
  const parseReasoningEffort = (
    value: string
  ): 'low' | 'medium' | 'high' | null => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'low' || normalized === 'medium' || normalized === 'high') {
      return normalized;
    }
    return null;
  };
  const stage5ReasoningEffort = parseReasoningEffort(
    String(process.env.STAGE5_RESPONSES_REASONING_EFFORT || '')
  );

  const extractResponsesText = (response: any): string => {
    if (!response) return '';
    if (typeof response.output_text === 'string') return response.output_text;
    const output = Array.isArray(response.output) ? response.output : [];
    const chunks: string[] = [];
    for (const item of output) {
      if (!item || item.type !== 'message' || !Array.isArray(item.content)) continue;
      for (const part of item.content) {
        if (part?.type === 'output_text' && typeof part.text === 'string') {
          chunks.push(part.text);
        }
      }
    }
    return chunks.join('');
  };

  const parseJsonResponse = (text: string): FormattingResult => {
    const normalized = normalizeJsonText(text);
    const parsed = tryParseJson(normalized);
    if (parsed) {
      return normalizeFormattingResult(parsed);
    }

    const repaired = repairMalformedJson(normalized);
    const repairedParsed = tryParseJson(repaired);
    if (repairedParsed) {
      return normalizeFormattingResult(repairedParsed);
    }

    const trimmed = trimToLastCompleteJson(repaired);
    if (trimmed) {
      const trimmedParsed = tryParseJson(trimmed);
      if (trimmedParsed) {
        return normalizeFormattingResult(trimmedParsed);
      }
    }

    return {
      formattedEvents: [],
      formattingDecisions: [],
      _parseError: true,
    } as FormattingResult;
  };

  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = schema.map((fn) => ({
    type: 'function' as const,
    function: {
      name: fn.name,
      description: fn.description,
      parameters: fn.parameters,
      strict: true,
    },
  }));

  try {
    if (isGpt5Model(model)) {
      const schemaHint = JSON.stringify(schema[0]?.parameters || {}, null, 2);
      const promptWithSchema = `${prompt}\n\nReturn ONLY valid JSON that matches this schema:\n${schemaHint}`;
      const callStart = Date.now();
      const response = await client.responses.create({
        model,
        input: [{ role: 'user', content: [{ type: 'input_text', text: promptWithSchema }] }],
        max_output_tokens: stage5ResponsesMaxTokens,
        ...(stage5ReasoningEffort ? { reasoning: { effort: stage5ReasoningEffort } } : {}),
      });
      const durationMs = Date.now() - callStart;
      logger.info('Timing', {
        step: 'gpt_call',
        component: 'finalFormatter',
        endpoint: 'responses',
        model,
        durationMs,
      });
      const usage = extractTokenUsage(response.usage);
      await emitGptUsage(config, {
        stage: 'stage5',
        component: 'finalFormatter',
        endpoint: 'responses',
        model,
        durationMs,
        ...usage,
      });

      const messageContent = extractResponsesText(response);
      logger.debug('GPT formatting response received (responses)', {
        model,
        tokens: usage.totalTokens,
      });

      return parseJsonResponse(messageContent || '');
    }

    const callStart = Date.now();
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      tools,
      tool_choice: { type: 'function', function: { name: functionName } },
      max_tokens: stage5ChatMaxTokens,
      temperature: 0.2,
    });
    const durationMs = Date.now() - callStart;
    logger.info('Timing', {
      step: 'gpt_call',
      component: 'finalFormatter',
      endpoint: 'chat',
      model,
      durationMs,
    });
    const usage = extractTokenUsage(response.usage);
    await emitGptUsage(config, {
      stage: 'stage5',
      component: 'finalFormatter',
      endpoint: 'chat',
      model,
      durationMs,
      ...usage,
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    if (toolCall && toolCall.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      logger.debug('GPT formatting response received', {
        model,
        tokens: usage.totalTokens,
      });
      return parsed as FormattingResult;
    }

    // Fallback: try to parse content as JSON
    const messageContent = response.choices[0]?.message?.content;
    if (messageContent) {
      try {
        return JSON.parse(messageContent) as FormattingResult;
      } catch {
        return { formattedEvents: [], formattingDecisions: [] };
      }
    }

    throw new Error('No valid response from GPT');
  } catch (error) {
    logger.error('GPT call failed', error);
    throw error;
  }
}
