// @ts-nocheck
// TODO: Fix type errors introduced during Phase 6/7 updates
/**
 * Stage 1: Content Validation
 * Ported from postParser.js - validateContent function
 *
 * Determines if a social media post contains valid events or food/drink specials worth extracting.
 */

import OpenAI from 'openai';
import {
  ImageComplexity,
  ValidationResult,
  CalendarSignals,
  GPTFunctionSchema,
  ParsingConfig,
  DEFAULT_PARSING_CONFIG,
} from './types.js';
import {
  emitGptUsage,
  extractTokenUsage,
  resolveImageDetail,
  resolveStageModel,
} from './runtimeConfig.js';
import { logger } from '../utils/logger.js';

// Initialize OpenAI client lazily
let openaiClient: OpenAI | null = null;

export type Stage1RequestKind = 'initial' | 'output_limit_retry' | 'no_image_fallback';

export interface Stage1RequestPlan {
  requestIndex: number;
  requestKind: Stage1RequestKind;
  model: string;
  endpoint: 'responses' | 'chat';
  imageCount: number;
  maxOutputTokens: number;
  inputTextChars: number;
}

export interface Stage1RequestAttempt extends Stage1RequestPlan {
  status: 'completed' | 'incomplete' | 'error';
  durationMs: number;
  responseId?: string;
  responseStatus?: string;
  incompleteReason?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  visibleOutput: string;
  parsed: boolean;
  errorMessage?: string;
  reservationId?: string;
}

export interface Stage1ValidationEvaluationRun {
  status: 'completed' | 'inconclusive' | 'request_error' | 'budget_stopped';
  result: ValidationResult | null;
  attempts: Stage1RequestAttempt[];
  noImageFallbackUsed: boolean;
  incompleteReason?: string;
}

export interface Stage1ValidationEvaluationOptions {
  promptVariant: 'production' | 'compact';
  structuredOutput: boolean;
  client?: any;
  onBeforeRequest?: (plan: Stage1RequestPlan) => string | undefined;
  onAttempt?: (attempt: Stage1RequestAttempt) => void;
}

interface Stage1CallOptions {
  structuredOutput?: boolean;
  client?: any;
  onBeforeRequest?: (plan: Stage1RequestPlan) => string | undefined;
  onAttempt?: (attempt: Stage1RequestAttempt) => void;
}

function isStage1EvaluationBudgetStop(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      (error as { code?: unknown }).code === 'STAGE1_EVAL_BUDGET_STOP'
  );
}

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

/**
 * Stage 1: Validate content - check if post contains valid event-worthy content
 */
export async function validateContent(
  combinedText: string,
  imageUrls: string[],
  userName: string,
  timestamp: string,
  config: Partial<ParsingConfig> = {}
): Promise<ValidationResult> {
  const cfg = { ...DEFAULT_PARSING_CONFIG, ...config };

  logger.info('Stage 1: Starting content validation', {
    userName,
    textLength: combinedText.length,
    imageCount: imageUrls.length,
  });

  const prompt = createValidationPrompt(combinedText, imageUrls.length > 0, userName, timestamp);
  const schema = createValidationSchema();

  try {
    const response = await callGPTWithSchema(prompt, imageUrls, 'validateContent', schema, cfg);
    const normalized = normalizeValidationResponse(response, combinedText, imageUrls.length > 0);

    // Log image analysis
    if (normalized.imageAnalysis && normalized.imageAnalysis.length > 0) {
      logger.debug('Image analysis results', {
        images: normalized.imageAnalysis.map((img) => ({
          index: img.imageIndex,
          description: img.description.substring(0, 100),
          complexity: {
            recommendsTiling: Boolean(img.imageComplexity?.recommendsTiling),
            textDensityScore: Number(img.imageComplexity?.textDensityScore ?? 0),
            hasCalendarGrid: Boolean(img.imageComplexity?.hasCalendarGrid),
            hasDenseText: Boolean(img.imageComplexity?.hasDenseText),
            isPromotionalPhoto: Boolean(img.imageComplexity?.isPromotionalPhoto),
          },
        })),
      });
    }

    // Local text signals (calendar/roundup heuristics)
    applyStage1LocalDecisionGates(normalized, combinedText, imageUrls.length > 0);

    logger.info(`Stage 1 Result: ${normalized.validationDecision}`, {
      confidence: normalized.confidence,
      reason: normalized.reason,
    });

    return normalized;
  } catch (error) {
    logger.error('Stage 1 validation error', error);
    const heuristic = inferValidContentFromText(combinedText, imageUrls.length > 0);
    const hasValidContent = heuristic.hasValidContent;
    return {
      imageAnalysis: [],
      hasValidContent,
      confidence: heuristic.confidence,
      validationDecision: hasValidContent ? 'VALIDATION_PASSED' : 'VALIDATION_FAILED',
      reason: `Validation fallback after error: ${error instanceof Error ? error.message : 'Unknown error'} | ${heuristic.reason}`,
    };
  }
}

/**
 * Local evaluation entry point. It uses the same response normalization and local
 * decision gates as production while allowing a fake transport and request hooks.
 */
export async function validateContentForStage1Evaluation(
  combinedText: string,
  imageUrls: string[],
  userName: string,
  timestamp: string,
  model: string,
  options: Stage1ValidationEvaluationOptions,
  config: Partial<ParsingConfig> = {}
): Promise<Stage1ValidationEvaluationRun> {
  const cfg = { ...DEFAULT_PARSING_CONFIG, ...config, stage1ModelOverride: model };
  const attempts: Stage1RequestAttempt[] = [];
  const prompt =
    options.promptVariant === 'compact'
      ? createCompactValidationPrompt(combinedText, imageUrls.length > 0, userName, timestamp)
      : createValidationPrompt(combinedText, imageUrls.length > 0, userName, timestamp);
  const schema = createValidationSchema();

  try {
    const response = await callGPTWithSchema(
      prompt,
      imageUrls,
      'validateContent',
      schema,
      cfg,
      {
        ...options,
        onAttempt: (attempt) => {
          attempts.push(attempt);
          options.onAttempt?.(attempt);
        },
      }
    );
    const normalized = normalizeValidationResponse(response, combinedText, imageUrls.length > 0);
    applyStage1LocalDecisionGates(normalized, combinedText, imageUrls.length > 0);

    const noImageFallbackUsed = attempts.some(
      (attempt) => attempt.requestKind === 'no_image_fallback'
    );
    const lastAttempt = attempts.at(-1);
    const responseIncomplete =
      lastAttempt?.responseStatus === 'incomplete' || lastAttempt?.status === 'incomplete';
    const incompleteReason = responseIncomplete
      ? lastAttempt.incompleteReason || 'The final API response was marked incomplete.'
      : noImageFallbackUsed
        ? 'Image request failed and production fallback retried without images.'
        : undefined;

    return {
      status: noImageFallbackUsed || responseIncomplete ? 'inconclusive' : 'completed',
      result: normalized,
      attempts,
      noImageFallbackUsed,
      incompleteReason,
    };
  } catch (error) {
    const noImageFallbackUsed = attempts.some(
      (attempt) => attempt.requestKind === 'no_image_fallback'
    );
    if (isStage1EvaluationBudgetStop(error)) {
      return {
        status: 'budget_stopped',
        result: null,
        attempts,
        noImageFallbackUsed,
        incompleteReason: error instanceof Error ? error.message : String(error),
      };
    }

    const heuristic = inferValidContentFromText(combinedText, imageUrls.length > 0);
    const hasValidContent = heuristic.hasValidContent;
    return {
      status: 'request_error',
      result: {
        imageAnalysis: [],
        hasValidContent,
        confidence: heuristic.confidence,
        validationDecision: hasValidContent ? 'VALIDATION_PASSED' : 'VALIDATION_FAILED',
        reason: `Validation fallback after error: ${error instanceof Error ? error.message : 'Unknown error'} | ${heuristic.reason}`,
      },
      attempts,
      noImageFallbackUsed,
      incompleteReason: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Create the validation prompt - exact port from postParser.js
 */
export function createValidationPrompt(
  combinedText: string,
  hasImages: boolean,
  userName: string,
  timestamp: string
): string {
  return `You are the first stage of a 5 stage Social Media post processer. Your job is to determine if this social media post contains valid events or food/drink specials worth extracting.

POST DETAILS:
- Posted by: ${userName}
- Posted at: ${timestamp}
- Text: "${combinedText}"
- Has images: ${hasImages}

SPECIAL POLICY: An explicitly advertised daily special or deal qualifies even if no numeric price is printed. Extract only the advertised special or deal. An ordinary month-long featured menu item without a stated deal does not qualify.

OCR TILING GUIDANCE (IMPORTANT):
- "Calendar tiling" means splitting the image into many smaller tiles for OCR.
- Recommend tiling ONLY when the image contains a calendar grid/schedule layout or dense small text that likely needs tiling to read.
- Do NOT recommend tiling for mostly-photographic/promotional images with minimal overlay text (e.g., a photo with "What's Happening?" only).

Image Preprocessing
- Preprocess this image for OCR: crop to content, de-skew/dewarp, denoise, convert to high-contrast grayscale, sharpen text edges, and export a clean, straight 300+ DPI version.
- If the poster shows separate weekday tiles/lines (e.g., Thursday / Friday / Saturday), treat EACH tile/line as its own region. Read the time from WITHIN the same region as the act for that day.

VALID CONTENT:
âœ“ Events: Live music, trivia, comedy, workshops, parties WITH specific timing
âœ“ Food Specials: Happy hour, priced food/drink offers, and explicitly advertised daily specials or deals even without a printed price
âœ“ Calendars or schedules showing multiple events/specials

INVALID CONTENT:
âœ— Business hours only
âœ— Holiday greetings without events
âœ— General marketing without specifics
âœ— Ordinary menu announcements and month-long featured menu items without an advertised deal
âœ— "Visit us" without events/specials

ANALYSIS REQUIREMENTS:
1. First, analyze every image present and return exactly one imageAnalysis entry per attached image, using its 0-based attachment order.
   - Each description must cover ONLY text and visuals visible in that specific image. Do not summarize or copy details from the other images into it.
   - For calendars and schedule pages, transcribe the exact visible event names, dates/day numbers, times, and venues into that image's description.
2. Then analyze the text content
3. Determine if valid content exists
4. Provide clear reasoning for your decision

DECISION POLICY (MUST FOLLOW):
- Never reject a post solely because the image appears decorative or generic if the TEXT clearly lists events (e.g., multiple lines with times and venues).
- Calendars/roundups that enumerate multiple events/venues in text are VALID even if the image has no event info.
- Reject only when BOTH image and text lack extractable events/specials.

Analyze the content and determine if it contains valid extractable information.`;
}

export function createCompactValidationPrompt(
  combinedText: string,
  hasImages: boolean,
  userName: string,
  timestamp: string
): string {
  return `You are the first stage of a 5 stage Social Media post processer. Determine whether this social media post contains valid events or food/drink specials worth extracting.

Valid content includes live music, trivia, comedy, workshops, parties with specific timing, food specials and advertised deals, and calendars or schedules with multiple events/specials. An explicitly advertised daily special or deal qualifies even without a printed price; an ordinary month-long featured menu item without a deal does not. Business hours only, holiday greetings without events, general marketing without specifics, ordinary menu announcements without an advertised deal, and "Visit us" without events/specials are invalid.

Analyze every attached image in attachment order. Return exactly one populated imageAnalysis entry per image, with its 0-based index. Keep each short description and relevance specific to that image; do not copy details from the caption or another image into it. Keep visible event names, dates, times, and venues tied to the image where they appear. Set image complexity from the image itself. Recommend tiling only for a calendar grid or dense small text.

Never reject solely because an image is decorative or generic when the text lists events. Reject only when both image and text lack extractable events or specials. Briefly explain the decision from the source evidence.

POST DETAILS:
- Posted by: ${userName}
- Posted at: ${timestamp}
- Text: "${combinedText}"
- Has images: ${hasImages}`;
}

/**
 * Create the validation schema for GPT function calling
 */
export function createValidationSchema(): GPTFunctionSchema[] {
  return [
    {
      name: 'validateContent',
      description:
        'Validate if content contains extractable events or specials with image analysis',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          imageAnalysis: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                imageIndex: {
                  type: 'integer',
                  description: '0-based index of the image',
                },
                description: {
                  type: 'string',
                  description: 'What is shown in this image',
                },
                relevanceToPost: {
                  type: 'string',
                  description: 'How this image relates to events/specials',
                },
                imageComplexity: {
                  type: 'object',
                  additionalProperties: false,
                  description:
                    'Signals about how much OCR-relevant text/layout exists in the image and whether calendar tiling is warranted.',
                  properties: {
                    hasCalendarGrid: {
                      type: 'boolean',
                      description: 'Whether the image shows a calendar-like grid or schedule table.',
                    },
                    hasDenseText: {
                      type: 'boolean',
                      description: 'Whether the image contains lots of small text blocks.',
                    },
                    hasMultipleEventListings: {
                      type: 'boolean',
                      description: 'Whether the image itself lists multiple events/specials.',
                    },
                    isPromotionalPhoto: {
                      type: 'boolean',
                      description:
                        'Whether the image is mostly a photo with minimal overlay text (decorative/promo).',
                    },
                    textDensityScore: {
                      type: 'number',
                      minimum: 0,
                      maximum: 1,
                      description:
                        '0-1 estimate of how text-heavy the image is (0=no meaningful text, 1=text-heavy poster).',
                    },
                    recommendsTiling: {
                      type: 'boolean',
                      description:
                        'True only when calendar tiling is likely needed to extract information from THIS image.',
                    },
                    recommendationReason: {
                      type: 'string',
                      description: 'Brief reason for the tiling recommendation.',
                    },
                  },
                  required: [
                    'hasCalendarGrid',
                    'hasDenseText',
                    'hasMultipleEventListings',
                    'isPromotionalPhoto',
                    'textDensityScore',
                    'recommendsTiling',
                    'recommendationReason',
                  ],
                },
              },
              required: ['imageIndex', 'description', 'relevanceToPost', 'imageComplexity'],
            },
            description: 'Analysis of each image in the post',
          },
          hasValidContent: {
            type: 'boolean',
            description: 'Whether content contains valid events or specials',
          },
          confidence: {
            type: 'number',
            description: 'Confidence level 0.0 to 1.0',
          },
          validationDecision: {
            type: 'string',
            enum: ['VALIDATION_PASSED', 'VALIDATION_FAILED'],
            description: 'Clear pass/fail decision',
          },
          reason: {
            type: 'string',
            description: 'Detailed reason for the validation decision',
          },
        },
        required: [
          'imageAnalysis',
          'hasValidContent',
          'confidence',
          'validationDecision',
          'reason',
        ],
      },
    },
  ];
}

function repairMalformedJson(jsonStr: string): string {
  let repaired = jsonStr;
  let previousRepaired: string;
  let iterations = 0;
  const maxIterations = 10;

  do {
    previousRepaired = repaired;
    iterations++;

    repaired = repaired.replace(/\}(\s*)\}(\s*),/g, '}$1,');
    repaired = repaired.replace(/\}(\s*)\}(\s*)\]/g, '}$1]');
    repaired = repaired.replace(/\}(\s*)\}(\s*)\](\s*),/g, '}$1]$3,');
    repaired = repaired.replace(/\}(\s*)\}(\s*)\}(\s*),/g, '}$1,');
    repaired = repaired.replace(/,(\s*)\]/g, '$1]');
    repaired = repaired.replace(/,(\s*)\}/g, '$1}');
    repaired = escapeUnescapedQuotesInStrings(repaired);
  } while (repaired !== previousRepaired && iterations < maxIterations);

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

function isQuoteEscaped(str: string, index: number): boolean {
  let backslashes = 0;
  let i = index - 1;
  while (i >= 0 && str[i] === '\\') {
    backslashes++;
    i--;
  }
  return backslashes % 2 === 1;
}

function findNextNonWhitespaceChar(str: string, startIndex: number): string | null {
  for (let i = startIndex; i < str.length; i++) {
    const char = str[i];
    if (!char || /\s/.test(char)) continue;
    return char;
  }
  return null;
}

function inferValidContentFromText(text: string, hasImages = false): {
  hasValidContent: boolean;
  confidence: number;
  reason: string;
} {
  const t = String(text || '');
  const time12 = /\b\d{1,2}(:\d{2})?\s*(am|pm)\b/i;
  const timeRange = /\b\d{1,2}(:\d{2})?\s*[-\u2013\u2014]\s*\d{1,2}(:\d{2})?\s*(am|pm)\b/i;
  const price = /\$\s*\d+/;
  const monthDay = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}\b/i;
  const ticketWord = /\btickets?\b/i;
  const ticketUrl = /\bhttps?:\/\/[^\s"'']*ticket[^\s"'']*\b/i;
  const keywords = /\b(live music|music|dinner|trivia|karaoke|open mic|comedy|show|concert|party|festival|valentine|special)\b/i;
  const hasTime = time12.test(t) || timeRange.test(t);
  const hasPrice = price.test(t);
  const hasKeyword = keywords.test(t);
  const hasTicketSignal = ticketWord.test(t) || ticketUrl.test(t);
  const hasDateSignal = monthDay.test(t);
  const eventCalendarUrl =
    /\b(?:https?:\/\/|www\.)[^\s"'<>]*\/(?:events?|calendar|programs?)(?:[\/?#][^\s"'<>]*)?/i;
  const weeklySignals =
    /\b(this week|weekly|month calendar|upcoming|programs?|schedule|what'?s on|full list)\b/i;
  const hasLinkedCalendarSignal =
    eventCalendarUrl.test(t) && (weeklySignals.test(t) || hasImages);

  const hasValidContent =
    hasTime ||
    (hasKeyword && hasPrice) ||
    (hasTicketSignal && (hasDateSignal || hasPrice)) ||
    hasLinkedCalendarSignal;

  const reasonParts: string[] = [];
  if (hasTime) reasonParts.push('time');
  if (hasKeyword && hasPrice) reasonParts.push('keyword+price');
  if (hasTicketSignal && (hasDateSignal || hasPrice)) reasonParts.push('ticket+date_or_price');
  if (hasLinkedCalendarSignal) reasonParts.push('linked_calendar_url');

  return {
    hasValidContent,
    confidence: hasValidContent ? 0.55 : 0.2,
    reason: hasValidContent
      ? `Heuristic: event signals detected (${reasonParts.join(', ')})`
      : 'Heuristic: no strong event signals detected in text',
  };
}

function detectLinkedCalendarSignals(
  text: string,
  hasImages: boolean
): { hasLinkedCalendar: boolean; reason: string } {
  const t = String(text || '');
  const hasEventsLink =
    /\b(?:https?:\/\/|www\.)[^\s"'<>]*\/(?:events?|calendar|programs?)(?:[\/?#][^\s"'<>]*)?/i.test(
      t
    );
  const hasProgramLanguage =
    /\b(this week|weekly|month calendar|upcoming|programs?|schedule|what'?s on|full list|at the library)\b/i.test(
      t
    );
  const hasLinkedCalendar = hasEventsLink && (hasProgramLanguage || hasImages);
  return {
    hasLinkedCalendar,
    reason: hasLinkedCalendar
      ? 'Linked calendar/events URL with weekly/program signals (override PASS)'
      : '',
  };
}

export function normalizeValidationResponse(
  response: ValidationResult,
  text: string,
  hasImages: boolean
): ValidationResult {
  const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

  const normalizeImageComplexity = (value: any): ImageComplexity => {
    const v = value && typeof value === 'object' ? value : {};
    const hasCalendarGrid = typeof v.hasCalendarGrid === 'boolean' ? v.hasCalendarGrid : false;
    const hasDenseText = typeof v.hasDenseText === 'boolean' ? v.hasDenseText : false;
    const hasMultipleEventListings =
      typeof v.hasMultipleEventListings === 'boolean' ? v.hasMultipleEventListings : false;
    const isPromotionalPhoto =
      typeof v.isPromotionalPhoto === 'boolean' ? v.isPromotionalPhoto : false;
    const textDensityScore = clamp01(typeof v.textDensityScore === 'number' ? v.textDensityScore : 0);

    const recommendsTilingRaw =
      typeof v.recommendsTiling === 'boolean'
        ? v.recommendsTiling
        : (hasCalendarGrid ||
            hasDenseText ||
            hasMultipleEventListings ||
            textDensityScore >= 0.55) &&
          !isPromotionalPhoto;

    const recommendationReason =
      typeof v.recommendationReason === 'string' ? v.recommendationReason : '';

    return {
      hasCalendarGrid,
      hasDenseText,
      hasMultipleEventListings,
      isPromotionalPhoto,
      textDensityScore,
      recommendsTiling: Boolean(recommendsTilingRaw),
      recommendationReason,
    };
  };

  const imageAnalysis = (Array.isArray(response?.imageAnalysis) ? response.imageAnalysis : [])
    .map((img: any, idx: number) => {
      const imageIndex = typeof img?.imageIndex === 'number' ? img.imageIndex : idx;
      const description = typeof img?.description === 'string' ? img.description : '';
      const relevanceToPost = typeof img?.relevanceToPost === 'string' ? img.relevanceToPost : '';
      const imageComplexity = normalizeImageComplexity(img?.imageComplexity);
      return { imageIndex, description, relevanceToPost, imageComplexity };
    });
  const hasValidContent =
    typeof response?.hasValidContent === 'boolean' ? response.hasValidContent : undefined;
  const confidence =
    typeof response?.confidence === 'number' ? response.confidence : undefined;
  const validationDecision = response?.validationDecision;
  const reason = response?.reason || '';

  if (hasValidContent === undefined || !validationDecision) {
    const heuristic = inferValidContentFromText(text, hasImages);
    const finalHasValid =
      typeof hasValidContent === 'boolean' ? hasValidContent : heuristic.hasValidContent;
    return {
      imageAnalysis,
      hasValidContent: finalHasValid,
      confidence: confidence ?? heuristic.confidence,
      validationDecision:
        validationDecision || (finalHasValid ? 'VALIDATION_PASSED' : 'VALIDATION_FAILED'),
      reason: reason || heuristic.reason,
    };
  }

  return {
    imageAnalysis,
    hasValidContent,
    confidence: confidence ?? 0,
    validationDecision,
    reason: reason || '',
  };
}

export function applyStage1LocalDecisionGates(
  normalized: ValidationResult,
  combinedText: string,
  hasImages: boolean
): void {
  const textSignals = detectCalendarSignals(combinedText);
  logger.debug('Calendar signals detected', textSignals);

  if (
    (!normalized.hasValidContent || normalized.validationDecision === 'VALIDATION_FAILED') &&
    textSignals.hasCalendar
  ) {
    const previousReason = String(normalized.reason || '').trim();
    normalized.hasValidContent = true;
    normalized.validationDecision = 'VALIDATION_PASSED';
    normalized.confidence = Math.max(Number(normalized.confidence || 0), 0.8);
    normalized.reason =
      (previousReason ? previousReason + ' | ' : '') +
      'Text calendar/roundup detected (override PASS)';
    logger.info('Validation overridden to PASS due to strong text calendar signals');
  }

  const linkedCalendarSignals = detectLinkedCalendarSignals(combinedText, hasImages);
  if (
    (!normalized.hasValidContent || normalized.validationDecision === 'VALIDATION_FAILED') &&
    linkedCalendarSignals.hasLinkedCalendar
  ) {
    const previousReason = String(normalized.reason || '').trim();
    normalized.hasValidContent = true;
    normalized.validationDecision = 'VALIDATION_PASSED';
    normalized.confidence = Math.max(Number(normalized.confidence || 0), 0.75);
    normalized.reason =
      (previousReason ? previousReason + ' | ' : '') + linkedCalendarSignals.reason;
    logger.info('Validation overridden to PASS due to linked calendar/program signals');
  }
}

/**
 * Detect calendar/roundup structure in text (multiple times + multiple venues/lines)
 * Exact port from postParser.js detectCalendarSignals function
 */
export function detectCalendarSignals(text: string): CalendarSignals {
  try {
    const t = String(text || '');
    const lines = t
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const time12 = /\b\d{1,2}(:\d{2})?\s*(am|pm)\b/i;
    const time24 = /\b[01]?\d:[0-5]\d\b/;
    const weekdayRe =
      /\b(mon|tue|wed|thu|thur|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
    const headerRe = /\bevents?\s*:/i;

    let timeLines = 0;
    let weekdayCount = 0;
    let atCount = 0;
    const venues = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (time12.test(l) || time24.test(l)) timeLines++;
      if (weekdayRe.test(l)) weekdayCount++;

      // Pattern A: "11:00 am - Venue Name: Title"
      let m = l.match(
        /^\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)|[01]?\d:[0-5]\d)\s*[â€“-]\s*([^:]+?):/i
      );
      if (m && m[2]) {
        const v = m[2].replace(/\s+/g, ' ').trim();
        if (v && v.length >= 3) venues.add(v);
        continue;
      }

      // Pattern B: "... at Venue Name"
      m = l.match(/\b(?:at|@)\s+([A-Z][\w'&\- ]{2,})/i);
      if (m && m[1]) {
        const v = m[1].replace(/\s+/g, ' ').trim();
        venues.add(v);
        atCount++;
      }
    }

    const hasHeader = headerRe.test(t) || /what['']?s happening/i.test(t);

    // Calendar if: many time lines AND >=2 venues, or header + many time lines, or weekday cues + venues
    const hasCalendar =
      (timeLines >= 3 && venues.size >= 2) ||
      (hasHeader && timeLines >= 5) ||
      (weekdayCount >= 2 && (venues.size >= 2 || atCount >= 2));

    return {
      hasCalendar,
      timeLines,
      distinctVenues: venues.size,
      weekdayCount,
      atCount,
    };
  } catch (e) {
    return {
      hasCalendar: false,
      timeLines: 0,
      distinctVenues: 0,
      weekdayCount: 0,
      atCount: 0,
    };
  }
}

/**
 * Call GPT with function calling schema
 */
async function callGPTWithSchema(
  prompt: string,
  imageUrls: string[],
  functionName: string,
  schema: GPTFunctionSchema[],
  config: ParsingConfig,
  options: Stage1CallOptions = {}
): Promise<ValidationResult> {
  const client = options.client || getOpenAIClient();
  const model = config.stage1ModelOverride || resolveStageModel(config.gptModelFast, 'STAGE1_MODEL_OVERRIDE');
  const imageDetail = resolveImageDetail('STAGE1_IMAGE_DETAIL', 'high');
  const usesResponses = (value: string): boolean => /^gpt-(?:5|6)(?:\.|-)/.test(value);

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

  const parseJsonResponse = (text: string): ValidationResult => {
    const match = text.match(/\{[\s\S]*\}/);
    const jsonStr = match ? match[0] : text;
    try {
      return JSON.parse(jsonStr) as ValidationResult;
    } catch (error) {
      const repaired = repairMalformedJson(jsonStr);
      return JSON.parse(repaired) as ValidationResult;
    }
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

  class TruncatedValidationJsonError extends Error {}

  let requestIndex = 0;

  const reportAttempt = (attempt: Stage1RequestAttempt): void => {
    try {
      options.onAttempt?.(attempt);
    } catch (error) {
      if (!options.onBeforeRequest) {
        logger.warn('Stage 1 attempt observer failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      } else {
        throw error;
      }
    }
  };

  const createRequestAttempt = (
    urls: string[],
    kind: Stage1RequestKind,
    endpoint: 'responses' | 'chat',
    maxOutputTokens: number,
    inputText: string
  ): Stage1RequestAttempt => ({
    requestIndex: ++requestIndex,
    requestKind: kind,
    model,
    endpoint,
    imageCount: urls.length,
    maxOutputTokens,
    inputTextChars: inputText.length,
    status: 'error',
    durationMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    visibleOutput: '',
    parsed: false,
  });

  const runOnce = async (
    urls: string[],
    outputTokenLimit?: number,
    requestKind: Stage1RequestKind = 'initial'
  ): Promise<ValidationResult> => {
    if (usesResponses(model)) {
      const schemaHint = JSON.stringify(schema[0]?.parameters || {}, null, 2);
      const promptWithSchema = options.structuredOutput
        ? prompt
        : `${prompt}\n\nReturn ONLY valid JSON that matches this schema:\n${schemaHint}`;
      const content = [
        { type: 'input_text', text: promptWithSchema },
      ] as Array<{ type: string; text?: string; image_url?: string; detail?: string }>;

      if (urls && urls.length > 0) {
        for (const url of urls) {
          content.push({
            type: 'input_image',
            image_url: url,
            detail: imageDetail,
          });
        }
      }

      const maxOutputTokens = outputTokenLimit ?? (model.startsWith('gpt-6') ? 6000 : 2000);
      const attempt = createRequestAttempt(urls, requestKind, 'responses', maxOutputTokens, promptWithSchema);
      const callStart = Date.now();
      let response: any;
      try {
        attempt.reservationId = options.onBeforeRequest?.(attempt);
        response = await client.responses.create({
          model,
          input: [{ role: 'user', content }],
          max_output_tokens: maxOutputTokens,
          ...(model.startsWith('gpt-6') ? { reasoning: { effort: 'none' as any } } : {}),
          ...(options.structuredOutput
            ? {
                text: {
                  format: {
                    type: 'json_schema',
                    name: schema[0]?.name || functionName,
                    strict: true,
                    schema: schema[0]?.parameters || {},
                  },
                },
              }
            : {}),
        });
        attempt.durationMs = Date.now() - callStart;
        attempt.responseId = typeof response?.id === 'string' ? response.id : undefined;
        attempt.responseStatus = typeof response?.status === 'string' ? response.status : undefined;
        attempt.incompleteReason =
          typeof response?.incomplete_details?.reason === 'string'
            ? response.incomplete_details.reason
            : undefined;
        const usage = extractTokenUsage(response.usage);
        attempt.inputTokens = usage.inputTokens;
        attempt.outputTokens = usage.outputTokens;
        attempt.totalTokens = usage.totalTokens;
        attempt.cachedInputTokens = usage.cachedInputTokens;
        attempt.cacheWriteTokens = Number(response?.usage?.input_tokens_details?.cache_write_tokens || 0);
        attempt.reasoningTokens = Number(response?.usage?.output_tokens_details?.reasoning_tokens || 0);
        attempt.visibleOutput = extractResponsesText(response);

        logger.info('Timing', {
          step: 'gpt_call',
          component: 'contentValidator',
          endpoint: 'responses',
          model,
          imageCount: urls.length,
          durationMs: attempt.durationMs,
        });
        await emitGptUsage(config, {
          stage: 'stage1',
          component: 'contentValidator',
          endpoint: 'responses',
          model,
          imageCount: urls.length,
          durationMs: attempt.durationMs,
          ...usage,
          responseId: attempt.responseId,
          responseStatus: attempt.responseStatus,
          incompleteReason: attempt.incompleteReason,
          requestedMaxOutputTokens: maxOutputTokens,
          reasoningTokens: attempt.reasoningTokens,
          visibleOutputChars: attempt.visibleOutput.length,
        });
        logger.debug('GPT validation response received (responses)', {
          model,
          tokens: usage.totalTokens,
        });

        try {
          const parsed = parseJsonResponse(attempt.visibleOutput || '');
          attempt.parsed = true;
          attempt.status = 'completed';
          reportAttempt(attempt);
          return parsed;
        } catch (error) {
          if (urls.length > 0 &&
            (response.status === 'incomplete' || usage.outputTokens >= maxOutputTokens)) {
            attempt.status = 'incomplete';
            attempt.errorMessage = `Image validation JSON reached the ${maxOutputTokens}-token response limit`;
            throw new TruncatedValidationJsonError(attempt.errorMessage);
          }
          attempt.errorMessage = error instanceof Error ? error.message : String(error);
          throw error;
        }
      } catch (error) {
        if (!attempt.parsed) {
          attempt.durationMs = Date.now() - callStart;
          if (attempt.status !== 'incomplete') {
            attempt.status = 'error';
          }
          attempt.errorMessage ||= error instanceof Error ? error.message : String(error);
          reportAttempt(attempt);
        }
        throw error;
      }
    }

    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      { type: 'text', text: prompt },
    ];

    if (urls && urls.length > 0) {
      for (const url of urls) {
        content.push({
          type: 'image_url',
          image_url: { url, detail: imageDetail },
        });
      }
    }

    const maxOutputTokens = 2000;
    const attempt = createRequestAttempt(urls, requestKind, 'chat', maxOutputTokens, prompt);
    const callStart = Date.now();
    try {
      attempt.reservationId = options.onBeforeRequest?.(attempt);
      const response = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content }],
        tools,
        tool_choice: { type: 'function', function: { name: functionName } },
        max_tokens: maxOutputTokens,
        temperature: 0.3,
      });
      attempt.durationMs = Date.now() - callStart;
      attempt.responseId = typeof response?.id === 'string' ? response.id : undefined;
      const usage = extractTokenUsage(response.usage);
      attempt.inputTokens = usage.inputTokens;
      attempt.outputTokens = usage.outputTokens;
      attempt.totalTokens = usage.totalTokens;
      attempt.cachedInputTokens = usage.cachedInputTokens;
      attempt.cacheWriteTokens = Number(response?.usage?.prompt_tokens_details?.cache_write_tokens || 0);
      attempt.reasoningTokens = Number(response?.usage?.completion_tokens_details?.reasoning_tokens || 0);

      logger.info('Timing', {
        step: 'gpt_call',
        component: 'contentValidator',
        endpoint: 'chat',
        model,
        imageCount: urls.length,
        durationMs: attempt.durationMs,
      });
      await emitGptUsage(config, {
        stage: 'stage1',
        component: 'contentValidator',
        endpoint: 'chat',
        model,
        imageCount: urls.length,
        durationMs: attempt.durationMs,
        ...usage,
        responseId: attempt.responseId,
        requestedMaxOutputTokens: maxOutputTokens,
        reasoningTokens: attempt.reasoningTokens,
      });

      const toolCall = response.choices[0]?.message?.tool_calls?.[0];
      if (toolCall && toolCall.function?.arguments) {
        attempt.visibleOutput = toolCall.function.arguments;
        const parsed = JSON.parse(toolCall.function.arguments);
        attempt.parsed = true;
        attempt.status = 'completed';
        reportAttempt(attempt);
        logger.debug('GPT validation response received', {
          model,
          tokens: usage.totalTokens,
        });
        return parsed as ValidationResult;
      }

      const messageContent = response.choices[0]?.message?.content;
      if (messageContent) {
        attempt.visibleOutput = messageContent;
        try {
          const parsed = JSON.parse(messageContent) as ValidationResult;
          attempt.parsed = true;
          attempt.status = 'completed';
          reportAttempt(attempt);
          return parsed;
        } catch {
          const parsed = {
            imageAnalysis: [],
            hasValidContent: false,
            confidence: 0,
            validationDecision: 'VALIDATION_FAILED' as const,
            reason: messageContent,
          };
          attempt.parsed = true;
          attempt.status = 'completed';
          reportAttempt(attempt);
          return parsed;
        }
      }

      throw new Error('No valid response from GPT');
    } catch (error) {
      if (!attempt.parsed) {
        attempt.durationMs = Date.now() - callStart;
        attempt.errorMessage = error instanceof Error ? error.message : String(error);
        reportAttempt(attempt);
      }
      throw error;
    }
  };

  try {
    return await runOnce(imageUrls, undefined, 'initial');
  } catch (error) {
    if (isStage1EvaluationBudgetStop(error)) throw error;
    if (imageUrls && imageUrls.length > 0) {
      if (error instanceof TruncatedValidationJsonError) {
        logger.warn('Image validation JSON was truncated; retrying with images and a larger output cap', {
          error: error.message,
        });
        try {
          return await runOnce(imageUrls, 4000, 'output_limit_retry');
        } catch (retryError) {
          if (isStage1EvaluationBudgetStop(retryError)) throw retryError;
          logger.warn('Expanded image validation retry failed', {
            error: retryError instanceof Error ? retryError.message : String(retryError),
          });
        }
      }
      logger.warn('GPT call failed with images; retrying without images', {
        error: error instanceof Error ? error.message : String(error),
      });
      return await runOnce([], undefined, 'no_image_fallback');
    }
    logger.error('GPT call failed', error);
    throw error;
  }
}

