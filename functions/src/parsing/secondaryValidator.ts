// @ts-nocheck
// TODO: Fix type errors introduced during Phase 6/7 updates
/**
 * Stage 4: Secondary Validation
 * Ported from postParser.js - performSecondaryValidation function
 *
 * Validates extracted items, filters by confidence threshold,
 * detects contradictions, handles holiday-specific recurring patterns.
 */

import OpenAI from 'openai';
import {
  ExtractedItem,
  ValidatedItem,
  SecondaryValidationResult,
  RecurringPattern,
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

// Valid recurring patterns for sanitization
const VALID_RECURRING_PATTERNS: RecurringPattern[] = [
  'none',
  'daily',
  'weekly_monday',
  'weekly_tuesday',
  'weekly_wednesday',
  'weekly_thursday',
  'weekly_friday',
  'weekly_saturday',
  'weekly_sunday',
];

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

function hasNonEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized !== '' && normalized !== 'unknown';
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

  if (/\b(everyday|daily)\b/.test(t)) {
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

  return 'none';
}

function inferRecurringPatternFromItem(item: ExtractedItem | undefined): RecurringPattern {
  if (!item) return 'none';

  const dayPattern = mapWeekdayTokenToPattern(String((item as any).day || ''));
  if (dayPattern) return dayPattern;

  const datePattern = patternFromIsoDate(String((item as any).date || ''));
  if (datePattern) return datePattern;

  const text = [
    String((item as any).name || ''),
    String((item as any).description || ''),
    String((item as any).extractionReason || ''),
  ]
    .filter(Boolean)
    .join(' ');

  return detectRecurringPatternFromText(text);
}

function hasPricingOrDiscount(item: ExtractedItem | undefined): boolean {
  if (!item) return false;
  const fields = [(item as any).price, (item as any).pricing, (item as any).discount];
  return fields.some(hasNonEmptyValue);
}

function isTimeBoundHappyHourSpecial(item: ExtractedItem | undefined): boolean {
  if (!item) return false;
  if (String((item as any)._sourceType || '').toLowerCase() !== 'special') return false;

  const name = String((item as any).name || '');
  const description = String((item as any).description || '');
  const combinedText = `${name} ${description}`;
  if (!/\bhappy\s*hour\b/i.test(combinedText)) return false;

  const hasStartTime = hasNonEmptyValue((item as any).startTime);
  const hasEndTime = hasNonEmptyValue((item as any).endTime);
  const hasToCloseFlag = Boolean(
    (item as any).timeFlags &&
      (item as any).timeFlags.end &&
      (item as any).timeFlags.end.toClose === true
  );
  const hasExplicitStartEvidence = Boolean(
    (item as any).timeFlags &&
      (item as any).timeFlags.start &&
      (item as any).timeFlags.start.source === 'explicit' &&
      hasNonEmptyValue((item as any).timeFlags.start.evidence)
  );

  // Catch plain-language time windows in case structured fields are missing.
  const hasTimeRangeInText =
    /\b\d{1,2}(:\d{2})?\s*(am|pm)\s*(to|-)\s*\d{1,2}(:\d{2})?\s*(am|pm)\b/i.test(combinedText) ||
    /\bfrom\s+\d{1,2}(:\d{2})?\s*(am|pm)\b/i.test(combinedText) ||
    /\b\d{1,2}\s*-\s*\d{1,2}\b/.test(combinedText);

  return hasStartTime || hasEndTime || hasToCloseFlag || hasExplicitStartEvidence || hasTimeRangeInText;
}

function hasDealBenefitSignal(text: string): boolean {
  const normalized = String(text || '');
  return /\b(\$\s*\d+|\d+\s*%+\s*off|\d+x\s*points?|bonus\s*points?|bogo|buy\s*one|get\s+\d+|free\b|combo(?:s)?\b|with\s+purchase|\boff\b)\b/i.test(
    normalized
  );
}

function isLikelyCalendarDealCardSpecial(item: ExtractedItem | undefined): boolean {
  if (!item) return false;
  if (String((item as any)._sourceType || '').toLowerCase() !== 'calendar') return false;

  const date = String((item as any).date || '').trim();
  if (!date || /^unknown$/i.test(date)) return false;

  const name = String((item as any).name || '');
  const description = String((item as any).description || '');
  const pricing = String((item as any).pricing || '');
  const discount = String((item as any).discount || '');
  const combined = `${name} ${description} ${pricing} ${discount}`.trim();
  if (!combined) return false;

  const hasDealSignal = hasDealBenefitSignal(combined);
  if (!hasDealSignal) return false;

  const hasEventSignal = /\b(live|music|show|concert|performance|workshop|class|lesson|seminar|meeting|networking|open\s*mic|karaoke|trivia|comedy|dj|night|tournament|match|vs\.?)\b/i.test(
    combined
  );
  return !hasEventSignal;
}

function normalizeCalendarDealCardAsAllDaySpecial(
  item: ExtractedItem | undefined,
  userName: string
): boolean {
  if (!item) return false;
  if (!isLikelyCalendarDealCardSpecial(item)) return false;

  let changed = false;

  if (String((item as any)._sourceType || '').toLowerCase() !== 'special') {
    (item as any)._sourceType = 'special';
    changed = true;
  }

  if (!hasNonEmptyValue((item as any).venue) && hasNonEmptyValue(userName)) {
    (item as any).venue = userName;
    changed = true;
  }

  if (!hasNonEmptyValue((item as any).startTime)) {
    (item as any).startTime = '00:00';
    changed = true;
  }

  if (!hasNonEmptyValue((item as any).endTime)) {
    (item as any).endTime = '23:59';
    changed = true;
  }

  (item as any).timeFlags = (item as any).timeFlags || {
    start: { source: 'none', evidence: '' },
    end: { toClose: false, evidence: '' },
  };

  const startEvidence = String((item as any).timeFlags?.start?.evidence || '');
  const endEvidence = String((item as any).timeFlags?.end?.evidence || '');
  if (!/\ball[\s-]?day\b/i.test(startEvidence)) {
    (item as any).timeFlags.start = {
      source: 'semantic',
      evidence: 'all-day inferred from calendar deal card',
    };
    changed = true;
  }
  if (!/\ball[\s-]?day\b/i.test(endEvidence)) {
    (item as any).timeFlags.end = {
      ...(item as any).timeFlags.end,
      source: 'semantic',
      toClose: false,
      evidence: 'all-day inferred from calendar deal card',
    };
    changed = true;
  }

  return changed;
}

/**
 * Stage 4: Secondary validation of extracted items
 */
export async function performSecondaryValidation(
  rawData: ExtractedItem[],
  userName: string,
  timestamp: string,
  config: Partial<ParsingConfig> = {}
): Promise<ExtractedItem[]> {
  const cfg = { ...DEFAULT_PARSING_CONFIG, ...config };

  // Capture the original Stage 3 count before any GPT processing
  const originalStage3Count = rawData.length;

  logger.info('Stage 4: Starting secondary validation', {
    itemCount: originalStage3Count,
    userName,
  });

  const currentYear = new Date().getFullYear();
  const prompt = createValidationPrompt(rawData, userName, timestamp, currentYear);

  try {
    const response = await callGPT(prompt, cfg);
    const validationResult = parseSecondaryValidationResponse(response);
    if (validationResult._parseError) {
      logger.warn('Stage 4: Falling back to raw data due to parse error');
      const fallbackItems = rawData.map(item => ({ ...item }));
      let fallbackNormalizationCount = 0;
      fallbackItems.forEach(item => {
        if (normalizeCalendarDealCardAsAllDaySpecial(item, userName)) {
          fallbackNormalizationCount++;
        }
      });
      logger.info(
        `Stage 4 Calendar deal all-day normalizations (parse fallback): ${fallbackNormalizationCount}`
      );
      (fallbackItems as any)._calendarDealAllDayNormalizationCount = fallbackNormalizationCount;
      (fallbackItems as any)._calendarDealAllDayOverrideCount = 0;
      (fallbackItems as any)._happyHourNoPriceOverrideCount = 0;
      return fallbackItems;
    }

    // Log validation summary
    if (validationResult.validationSummary) {
      logger.info('Stage 4 validation summary', {
        totalItems: validationResult.validationSummary.totalItems,
        itemsKept: validationResult.validationSummary.itemsKept,
        itemsRejected: validationResult.validationSummary.itemsRejected,
        recurringCorrections: validationResult.validationSummary.recurringCorrections,
      });
    }

    // Process validated items
    const keptItems: ExtractedItem[] = [];
    const rejectedItems: Array<{ item: ExtractedItem; reason: string }> = [];
    let recurringCorrectionsCount = 0;
    let happyHourNoPriceOverrideCount = 0;
    let calendarDealAllDayOverrideCount = 0;
    let calendarDealAllDayNormalizationCount = 0;

    if (validationResult.validatedItems) {
      validationResult.validatedItems.forEach((validatedItem, index) => {
        let decision = validatedItem.decision;
        const item = validatedItem.item;
        const reason = validatedItem.reason;

        // Preserve pipeline metadata
        item._pipelineTotalStage3 = originalStage3Count;
        if (!item._pipelineIndex && rawData[index] && rawData[index]._pipelineIndex) {
          item._pipelineIndex = rawData[index]._pipelineIndex;
        }

        // Contradiction detection: GPT sometimes sets decision="REJECTED" but the reasoning
        // clearly states the item should be kept
        if (decision === 'REJECTED' && reason) {
          const reasonLower = String(reason).toLowerCase();
          const keptIndicators = [
            'should be kept',
            'correct decision is kept',
            'this should be kept',
            'keep as',
            'kept as',
            'therefore, kept',
            'therefore kept',
            'decision is kept',
            'should be kept as',
            'valid event',
            'valid as a regular event',
            'keeping this item',
            'recommend keeping',
          ];
          const hasKeptIntent = keptIndicators.some((phrase) => reasonLower.includes(phrase));

          if (hasKeptIntent) {
            logger.warn(`Contradiction detected for "${item.name}" - overriding to KEPT`, {
              originalDecision: decision,
              reason: reason.substring(0, 100),
            });
            decision = 'KEPT';
          }
        }

        // Targeted exception:
        // Keep Happy Hour specials when a concrete time window exists, even if pricing is omitted.
        if (decision === 'REJECTED' && isTimeBoundHappyHourSpecial(item) && !hasPricingOrDiscount(item)) {
          logger.info(`Stage 4 targeted Happy Hour override for "${item.name}"`);
          decision = 'KEPT';
          happyHourNoPriceOverrideCount++;
        }

        // Targeted exception:
        // Calendar day-by-day deal cards are valid specials even without explicit clock times.
        if (
          decision === 'REJECTED' &&
          isLikelyCalendarDealCardSpecial(item) &&
          !hasNonEmptyValue((item as any).startTime)
        ) {
          logger.info(`Stage 4 targeted calendar all-day special override for "${item.name}"`);
          decision = 'KEPT';
          calendarDealAllDayOverrideCount++;
        }

        if (decision === 'KEPT' && normalizeCalendarDealCardAsAllDaySpecial(item, userName)) {
          calendarDealAllDayNormalizationCount++;
        }

        logger.debug(`Item ${index + 1}: "${item.name}"`, {
          decision,
          reason: reason?.substring(0, 100),
        });

        // Check for recurring pattern corrections
        if (validatedItem.corrections?.recurringPattern) {
          const correctedPattern = sanitizeRecurringPatternWithContext(
            validatedItem.corrections.recurringPattern,
            item
          );
          if (correctedPattern !== 'none' || item.recurringPattern !== 'none') {
            logger.debug(`Recurring pattern corrected for "${item.name}"`, {
              from: item.recurringPattern,
              to: correctedPattern,
              proposed: validatedItem.corrections.recurringPattern,
              reason: validatedItem.corrections.correctionReason,
            });
            item.recurringPattern = correctedPattern;
            recurringCorrectionsCount++;
          }
        }

        const normalizedRecurringPattern = sanitizeRecurringPatternWithContext(
          String(item.recurringPattern || ''),
          item
        );
        if (String(item.recurringPattern || '').trim().toLowerCase() !== normalizedRecurringPattern) {
          logger.debug(`Stage 4 normalized recurring pattern for "${item.name}"`, {
            from: item.recurringPattern,
            to: normalizedRecurringPattern,
          });
          item.recurringPattern = normalizedRecurringPattern;
        }

        if (decision === 'KEPT') {
          keptItems.push(item);
        } else {
          rejectedItems.push({ item, reason });
        }
      });
    }

    logger.info(`Stage 4 Result: ${keptItems.length} kept, ${rejectedItems.length} rejected`, {
      recurringCorrections: recurringCorrectionsCount,
      happyHourNoPriceOverrides: happyHourNoPriceOverrideCount,
      calendarDealAllDayOverrides: calendarDealAllDayOverrideCount,
      calendarDealAllDayNormalizations: calendarDealAllDayNormalizationCount,
    });
    logger.info(`Stage 4 Happy Hour no-price overrides: ${happyHourNoPriceOverrideCount}`);
    logger.info(`Stage 4 Calendar deal all-day overrides: ${calendarDealAllDayOverrideCount}`);
    logger.info(`Stage 4 Calendar deal all-day normalizations: ${calendarDealAllDayNormalizationCount}`);

    // Attach count so Stage 4 summary in postParser can include it in one-line logs.
    (keptItems as any)._happyHourNoPriceOverrideCount = happyHourNoPriceOverrideCount;
    (keptItems as any)._calendarDealAllDayOverrideCount = calendarDealAllDayOverrideCount;
    (keptItems as any)._calendarDealAllDayNormalizationCount = calendarDealAllDayNormalizationCount;

    return keptItems;
  } catch (error) {
    logger.error('Stage 4 validation error', error);
    logger.warn('Returning original data due to validation error');
    return rawData;
  }
}

/**
 * Create the validation prompt - exact port from postParser.js
 */
function createValidationPrompt(
  rawData: ExtractedItem[],
  userName: string,
  timestamp: string,
  currentYear: number
): string {
  return `Validate these extracted items. Analyze each item and determine if it should be kept or removed.

CURRENT CONTEXT:
- Current year: ${currentYear}
- Posting timestamp: ${timestamp}

ITEMS TO VALIDATE:
${JSON.stringify(rawData, null, 2)}

IMPORTANT CONTEXT:
Items may have a "_sourceType" field indicating which extractor produced them:
- "_sourceType": "event" = came from event-only extractor
- "_sourceType": "special" = came from food special-only extractor
- "_sourceType": "calendar" = came from calendar extractor
- Items without _sourceType should be validated based on content

VALIDATION RULES:

REMOVE items that are:
✗ Business hours or operating schedules only
✗ General announcements without specific timing
✗ Holiday greetings WITHOUT events (e.g., "Happy Father's Day!")
✗ Menu items without discounts or deals
✗ Food specials without specific pricing or cost savings
✗ Items from event extractor that aren't real events (e.g., forced interpretation of food as "celebration")
✗ Items from special extractor that have no actual pricing/discount

EXCEPTION RULE (APPLY BEFORE REJECTING SPECIALS):
- For _sourceType="special", if the item is a Happy Hour and has a clear time window
  (start/end time, explicit range like "3-6", "from 3 PM to 6 PM", or "to close"),
  KEEP the item even when price/discount is missing.

KEEP items that are:
✓ Actual events with specific dates/times
✓ Events that happen to occur on holidays (e.g., "Father's Day Movie at 5pm")
✓ Food specials with specified cost savings and pricing
✓ Any activity with specific timing and details
✓ Recurring specials (date="recurring") ARE VALID - these are daily/weekly specials like happy hours that happen regularly
✓ Items with date="recurring" should be KEPT if they have valid pricing, timing, and description

IMPORTANT - MINIMUM REQUIRED FIELDS FOR REGULAR EVENTS (no _sourceType or _sourceType="event"):
Regular events only need these fields to be valid:
- name (required)
- date (required) - must be a specific YYYY-MM-DD date
- startTime (required) - can come from any source including _timeSourcedFromUtcStartDate

These fields are OPTIONAL and should NEVER cause rejection if missing:
- venue (optional - empty venue means the event is AT the posting venue/page)
- endTime (optional - many events don't list end times)
- price (optional - free events won't have pricing)
- description (optional - though usually present for regular events)

DO NOT reject events just because venue is empty. An empty venue means the event takes place at the posting page's own venue.
DO NOT reject events just because endTime or price are missing.
A regular event with a name, date, and startTime is VALID even if all other fields are empty.

IMPORTANT - MINIMUM REQUIRED FIELDS FOR CALENDAR EVENTS:
Calendar events (_sourceType="calendar") only need these fields to be valid:
- name (required)
- date (required)
- startTime (required)
- venue (required)

EXCEPTION FOR CALENDAR-FORMATTED SPECIALS:
- If a _sourceType="calendar" item is clearly a day-specific food/drink/points deal
  (for example: BOGO, free with purchase, combo pricing, bonus points, multipliers),
  KEEP it even when startTime is missing.
- Treat those as all-day specials at the posting venue; missing venue should not cause rejection.

These fields are OPTIONAL and should NOT cause rejection if missing:
- endTime (optional - many events don't list end times)
- price (optional - free events won't have pricing)
- description (optional - brief listings often omit descriptions)

DO NOT reject calendar events just because endTime, price, or description are empty/missing.

DUPLICATE DETECTION RULES:
- Same venue + SAME time = likely duplicate (reject one)
- Same venue + DIFFERENT times = separate events (keep both)
- Multiple sessions/workshops at same venue are common and valid
- Multiple movie showings at same cinema are normal
- Don't reject events just because they're at the same location
- Only reject TRUE duplicates where the name, venue, AND time are identical

SPECIAL VALIDATION FOR MIXED CONTENT:
When _sourceType indicates the item came from a specific extractor:
- Be extra critical of "events" that seem to be about food
- Be extra critical of "specials" without clear pricing
- Exception: time-bounded Happy Hour specials can still be valid without explicit pricing
- Exception: calendar day-by-day deal cards can be valid all-day specials without explicit clock times
- The extractors may have forced interpretations that don't make sense

HOLIDAY-SPECIFIC RECURRING PATTERN CORRECTION:
Many venues modify their regular recurring specials for holidays. Check for these patterns:
- If an item is marked as "recurring" or "daily" BUT:
  * The date matches a known holiday (Father's Day, Mother's Day, Christmas, etc.) AND
  * The description contains explicit holiday keywords (Father's Day, Mother's Day, Christmas, Valentine's, Easter, Halloween, Thanksgiving, New Year, St. Patrick's, etc.) OR
  * The description contains holiday-specific phrases ("treat dad", "mom deserves", "valentine special", "christmas menu", "holiday menu", "festive menu")
  * DO NOT trigger on generic promotional language like "new menu", "try our menu", "special offer", "come visit"
- THEN: Change recurringPattern to "none" because this is a one-day holiday variation
- Note this correction in your reasoning

IMPORTANT: Generic promotional language ("Come try our new greek menu", "Check out our specials") is NOT holiday-specific. Only trigger this correction when you see actual holiday names or explicit holiday context.

RECURRING ENUM REQUIREMENT:
- recurringPattern MUST be one of:
  "none", "daily", "weekly_monday", "weekly_tuesday", "weekly_wednesday", "weekly_thursday", "weekly_friday", "weekly_saturday", "weekly_sunday"
- Never return plain "weekly". If text says "every Sunday", use "weekly_sunday" (and similarly for other days).

Common holidays to check:
- Father's Day (third Sunday in June)
- Mother's Day (second Sunday in May)
- Valentine's Day (February 14)
- St. Patrick's Day (March 17)
- Christmas Day (December 25)
- New Year's Eve/Day (December 31/January 1)

For each item:
1. Consider the _sourceType to understand extraction context
2. Determine if it truly passes validation
3. Check if recurring pattern needs holiday correction
4. Provide clear reasoning for the decision
5. Categorize as either "kept" or "rejected"

CRITICAL JSON FORMATTING REQUIREMENTS:
- Return ONLY valid JSON object
- NO markdown code blocks, NO '''json''' wrappers
- NO explanatory text before or after JSON
- Use this exact structure:
{
  "validatedItems": [
    {
      "item": {...original item with any corrections...},
      "decision": "KEPT" or "REJECTED",
      "reason": "Clear explanation of why this item was kept or rejected",
      "corrections": {
        "recurringPattern": "If corrected from recurring to none, show the new value here",
        "correctionReason": "Explanation of why the correction was made"
      }
    }
  ],
  "validationSummary": {
    "totalItems": number,
    "itemsKept": number,
    "itemsRejected": number,
    "recurringCorrections": number,
    "overallNotes": "Summary of validation decisions"
  }
}

Return pure JSON with validation results.`;
}

/**
 * Sanitize recurring pattern value
 */
function sanitizeRecurringPattern(pattern: string | undefined): RecurringPattern {
  return sanitizeRecurringPatternWithContext(pattern);
}

function sanitizeRecurringPatternWithContext(
  pattern: string | undefined,
  item?: ExtractedItem
): RecurringPattern {
  if (!pattern) return 'none';
  const cleaned = pattern.toString().trim().replace(/[,;]+$/, '').toLowerCase();

  if (VALID_RECURRING_PATTERNS.includes(cleaned as RecurringPattern)) {
    return cleaned as RecurringPattern;
  }

  if (cleaned === 'weekly') {
    const inferred = inferRecurringPatternFromItem(item);
    if (inferred !== 'none') {
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

  return 'none';
}

/**
 * Parse secondary validation response with JSON repair
 */
function parseSecondaryValidationResponse(response: string): SecondaryValidationResult {
  logger.debug('Parsing validation response');

  try {
    const normalized = normalizeJsonText(response);
    const parsed = tryParseJson(normalized);
    if (parsed) {
      const normalizedResult = normalizeSecondaryValidationResult(parsed);
      if (normalizedResult) {
        logger.debug('Parsed validation result (no repair needed)');
        return normalizedResult;
      }
      logger.error('Parsed validation result missing validatedItems array');
    }

    logger.debug('Original parse failed, attempting repair');
    const repairedStr = repairMalformedJson(normalized);
    const repaired = tryParseJson(repairedStr);
    if (repaired) {
      const normalizedResult = normalizeSecondaryValidationResult(repaired);
      if (normalizedResult) {
        logger.debug('Parsed validation result after repair');
        return normalizedResult;
      }
      logger.error('Repair produced result without validatedItems array');
    } else {
      logger.error('Repair did not fix the JSON');
    }
  } catch (error) {
    logger.error('Error parsing validation response', error);
  }

  // Return safe default
  return {
    validatedItems: [],
    validationSummary: {
      totalItems: 0,
      itemsKept: 0,
      itemsRejected: 0,
      recurringCorrections: 0,
      overallNotes: 'Failed to parse validation response',
    },
    _parseError: true,
  };
}

function tryParseJson(text: string): SecondaryValidationResult | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeSecondaryValidationResult(
  parsed: SecondaryValidationResult
): SecondaryValidationResult | null {
  if (!parsed || !Array.isArray(parsed.validatedItems)) {
    return null;
  }

  if (!parsed.validationSummary) {
    parsed.validationSummary = {
      totalItems: parsed.validatedItems.length,
      itemsKept: parsed.validatedItems.filter((item) => item.decision === 'KEPT').length,
      itemsRejected: parsed.validatedItems.filter((item) => item.decision === 'REJECTED').length,
      recurringCorrections: parsed.validatedItems.filter(
        (item) => item.corrections?.recurringPattern
      ).length,
      overallNotes: 'Validation summary inferred from parsed items',
    };
  }

  return parsed;
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

/**
 * Attempts to repair common JSON syntax errors produced by GPT models.
 */
function repairMalformedJson(jsonStr: string): string {
  let repaired = jsonStr;
  let previousRepaired: string;
  let iterations = 0;
  const maxIterations = 15;

  do {
    previousRepaired = repaired;
    iterations++;

    repaired = repaired.replace(/\bTrue\b/g, 'true');
    repaired = repaired.replace(/\bFalse\b/g, 'false');
    repaired = repaired.replace(/\bNone\b/g, 'null');
    repaired = quoteUnquotedKeys(repaired);
    repaired = quoteBarewordValuesForStage4(repaired);

    // Pattern 1: Extra } before , in arrays
    repaired = repaired.replace(/\}(\s*)\}(\s*),/g, '}$1,');

    // Pattern 2: Extra } before ]
    repaired = repaired.replace(/\}(\s*)\}(\s*)\]/g, '}$1]');

    // Pattern 3: Extra } before ],
    repaired = repaired.replace(/\}(\s*)\}(\s*)\](\s*),/g, '}$1]$3,');

    // Pattern 4: Triple braces
    repaired = repaired.replace(/\}(\s*)\}(\s*)\}(\s*),/g, '}$1,');

    // Pattern 5: Trailing commas before ]
    repaired = repaired.replace(/,(\s*)\]/g, '$1]');

    // Pattern 6: Trailing commas before }
    repaired = repaired.replace(/,(\s*)\}/g, '$1}');

    // Pattern 7: Escape unescaped quotes in strings
    repaired = escapeUnescapedQuotesInStrings(repaired);
  } while (repaired !== previousRepaired && iterations < maxIterations);

  if (repaired !== jsonStr) {
    logger.debug(`Applied JSON repairs in ${iterations} iteration(s)`);
  }

  return repaired;
}

function quoteUnquotedKeys(jsonStr: string): string {
  return jsonStr.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3');
}

function quoteBarewordValuesForStage4(jsonStr: string): string {
  let repaired = jsonStr;
  repaired = repaired.replace(/("decision"\s*:\s*)([A-Z_]+)(\s*[,\}])/g, '$1"$2"$3');
  repaired = repaired.replace(
    /("recurringPattern"\s*:\s*)([A-Za-z_]+)(\s*[,\}])/g,
    '$1"$2"$3'
  );
  return repaired;
}

/**
 * Escape unescaped double quotes within JSON strings
 */
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

/**
 * Call GPT for validation
 */
async function callGPT(prompt: string, config: ParsingConfig): Promise<string> {
  const client = getOpenAIClient();
  const explicitModelOverride = String(config.stage4ModelOverride || '').trim();
  const model = explicitModelOverride || resolveStageModel(config.gptModelFast, 'STAGE4_MODEL_OVERRIDE');
  const isGpt5Model = (value: string): boolean => value.startsWith('gpt-5');
  const rawStage4ResponsesMaxTokens = Number.parseInt(
    String(process.env.STAGE4_RESPONSES_MAX_OUTPUT_TOKENS || '32000'),
    10
  );
  const stage4ResponsesMaxTokens = Number.isFinite(rawStage4ResponsesMaxTokens)
    ? Math.max(1024, rawStage4ResponsesMaxTokens)
    : 32000;
  const parseReasoningEffort = (
    value: string
  ): 'low' | 'medium' | 'high' | null => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'low' || normalized === 'medium' || normalized === 'high') {
      return normalized;
    }
    return null;
  };
  const stage4ReasoningEffort = parseReasoningEffort(
    String(process.env.STAGE4_RESPONSES_REASONING_EFFORT || '')
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

  try {
    if (isGpt5Model(model)) {
      const callStart = Date.now();
      const response = await client.responses.create({
        model,
        input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
        max_output_tokens: stage4ResponsesMaxTokens,
        ...(stage4ReasoningEffort ? { reasoning: { effort: stage4ReasoningEffort } } : {}),
      });
      const durationMs = Date.now() - callStart;
      logger.info('Timing', {
        step: 'gpt_call',
        component: 'secondaryValidator',
        endpoint: 'responses',
        model,
        durationMs,
      });
      const usage = extractTokenUsage(response.usage);
      await emitGptUsage(config, {
        stage: 'stage4',
        component: 'secondaryValidator',
        endpoint: 'responses',
        model,
        durationMs,
        ...usage,
      });

      const messageContent = extractResponsesText(response);
      logger.debug('GPT validation response received (responses)', {
        model,
        tokens: usage.totalTokens,
      });

      return messageContent || '';
    }

    const callStart = Date.now();
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4000,
      temperature: 0.2,
    });
    const durationMs = Date.now() - callStart;
    logger.info('Timing', {
      step: 'gpt_call',
      component: 'secondaryValidator',
      endpoint: 'chat',
      model,
      durationMs,
    });
    const usage = extractTokenUsage(response.usage);
    await emitGptUsage(config, {
      stage: 'stage4',
      component: 'secondaryValidator',
      endpoint: 'chat',
      model,
      durationMs,
      ...usage,
    });

    const messageContent = response.choices[0]?.message?.content;
    logger.debug('GPT validation response received', {
      model,
      tokens: usage.totalTokens,
    });

    return messageContent || '';
  } catch (error) {
    logger.error('GPT call failed', error);
    throw error;
  }
}
