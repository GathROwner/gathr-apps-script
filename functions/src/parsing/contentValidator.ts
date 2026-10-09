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
  requestedReasoningEffort: 'none' | 'low' | 'high' | null;
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
  preGateResult: ValidationResult | null;
  result: ValidationResult | null;
  attempts: Stage1RequestAttempt[];
  noImageFallbackUsed: boolean;
  incompleteReason?: string;
}

export type Stage1LocalGatePolicy = 'production' | 'evidence-backed-links' | 'source-offer-guards' | 'source-offer-guards-v2' | 'source-menu-guards';

export interface Stage1ValidationEvaluationOptions {
  promptVariant: 'production' | 'compact' | 'compact-v2' | 'compact-v3' | 'compact-v4' | 'compact-v5' | 'compact-v6' | 'compact-v7' | 'compact-v8' | 'compact-v9' | 'compact-v10';
  structuredOutput: boolean;
  reasoningEffort?: 'none' | 'low' | 'high';
  localGatePolicy?: Stage1LocalGatePolicy;
  client?: any;
  onBeforeRequest?: (plan: Stage1RequestPlan) => string | undefined;
  onAttempt?: (attempt: Stage1RequestAttempt) => void;
}

interface Stage1CallOptions {
  structuredOutput?: boolean;
  reasoningEffort?: 'none' | 'low' | 'high';
  client?: any;
  onBeforeRequest?: (plan: Stage1RequestPlan) => string | undefined;
  onAttempt?: (attempt: Stage1RequestAttempt) => void;
}

/** One evaluation prompt resolver shared by transport and offline request fingerprints. */
export function createStage1EvaluationPrompt(
  combinedText: string, imageCount: number, userName: string, timestamp: string,
  promptVariant: Stage1ValidationEvaluationOptions['promptVariant']
): string {
  if (promptVariant === 'compact-v10') return createCompactV10ValidationPrompt(combinedText, imageCount, userName, timestamp);
  if (promptVariant === 'compact-v9') return createCompactV9ValidationPrompt(combinedText, imageCount, userName, timestamp);
  if (promptVariant === 'compact-v8') return createCompactV8ValidationPrompt(combinedText, imageCount, userName, timestamp);
  if (promptVariant === 'compact-v7') return createCompactV7ValidationPrompt(combinedText, imageCount, userName, timestamp);
  if (promptVariant === 'compact-v6') return createCompactV6ValidationPrompt(combinedText, imageCount, userName, timestamp);
  if (promptVariant === 'compact-v5') return createCompactV5ValidationPrompt(combinedText, imageCount > 0, userName, timestamp);
  if (promptVariant === 'compact-v4') return createCompactV4ValidationPrompt(combinedText, imageCount > 0, userName, timestamp);
  if (promptVariant === 'compact-v3') return createCompactV3ValidationPrompt(combinedText, imageCount > 0, userName, timestamp);
  if (promptVariant === 'compact-v2') return createCompactV2ValidationPrompt(combinedText, imageCount > 0, userName, timestamp);
  if (promptVariant === 'compact') return createCompactValidationPrompt(combinedText, imageCount > 0, userName, timestamp);
  return createValidationPrompt(combinedText, imageCount > 0, userName, timestamp);
}

function isStage1EvaluationBudgetStop(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      (error as { code?: unknown }).code === 'STAGE1_EVAL_BUDGET_STOP'
  );
}

export class Stage1EvaluationArtifactError extends Error {
  code = 'STAGE1_EVAL_ARTIFACT_WRITE';

  constructor(phase: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Stage 1 evaluation ${phase} logging failed: ${detail}`, { cause });
    this.name = 'Stage1EvaluationArtifactError';
  }
}

function isStage1EvaluationArtifactError(error: unknown): boolean {
  return Boolean(
    error && typeof error === 'object' &&
    (error as { code?: unknown }).code === 'STAGE1_EVAL_ARTIFACT_WRITE'
  );
}

function wrapStage1EvaluationArtifactError(phase: string, error: unknown): Error {
  if (isStage1EvaluationBudgetStop(error) || isStage1EvaluationArtifactError(error)) {
    return error as Error;
  }
  return new Stage1EvaluationArtifactError(phase, error);
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
  const prompt = createStage1EvaluationPrompt(combinedText, imageUrls.length, userName, timestamp, options.promptVariant);
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
    const preGateResult = JSON.parse(JSON.stringify(normalized)) as ValidationResult;
    applyStage1LocalDecisionGates(normalized, combinedText, imageUrls.length > 0, options.localGatePolicy);

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
      preGateResult,
      result: normalized,
      attempts,
      noImageFallbackUsed,
      incompleteReason,
    };
  } catch (error) {
    if (isStage1EvaluationArtifactError(error)) throw error;
    const noImageFallbackUsed = attempts.some(
      (attempt) => attempt.requestKind === 'no_image_fallback'
    );
    if (isStage1EvaluationBudgetStop(error)) {
      return {
        status: 'budget_stopped',
        preGateResult: null,
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
      preGateResult: null,
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

export function createCompactV2ValidationPrompt(
  combinedText: string,
  hasImages: boolean,
  userName: string,
  timestamp: string
): string {
  return `You are the first stage of a 5 stage Social Media post processer. Determine whether this post contains a specific, extractable event, activity, food/drink special, or time-limited community food trail.

INCLUDE:
- Clearly advertised bookable activities such as classes, lessons, workshops, and sessions. A current invitation, registration, booking, or open-availability notice is enough even when a date or time is missing; later stages can resolve or hold incomplete dates.
- Clearly advertised public open-swim or bookable rink availability, even when a date or time is missing. Generic facility/business hours alone do not qualify.
- Explicitly advertised daily food/drink specials or deals, even when no numeric price is printed.
- Community food or dessert trails presented as a current organized trail or invitation. A stated date window supports the match but is not required at Stage 1.

EXCLUDE:
- Election administration, nomination, ballot, or candidate-filing notices.
- Ordinary retail merchandise discounts, sales, stock availability, or restock announcements.
- General menu or featured-item announcements without an explicitly advertised daily special/deal.
- General business/facility hours, greetings, and marketing without a specific qualifying activity or offer.
- Retrospective activity photos or recaps with no current invitation, booking, or public-availability information.

Decide from concrete source content, never from the venue name or business category alone. A shop can host a bookable activity and a restaurant can post an ordinary menu; the source details determine the decision. If a post mixes qualifying activity/special content with unrelated retail, recap, or administrative material, accept the post for its qualifying portion and ignore the unrelated material. Nonqualifying material does not cancel a clearly advertised performance, bookable activity, open public session, or special.

Analyze every image in attachment order. Return exactly one populated imageAnalysis entry per image with its 0-based index. Keep each description, relevance, and complexity signals specific to what is visible in that image. Do not copy caption or neighboring-image details into an image description. Recommend tiling only for a calendar grid or dense small text. Briefly explain the decision from the source evidence.

POST DETAILS:
- Posted by: ${userName}
- Posted at: ${timestamp}
- Text: "${combinedText}"
- Has images: ${hasImages}`;
}

export function createCompactV3ValidationPrompt(
  combinedText: string,
  hasImages: boolean,
  userName: string,
  timestamp: string
): string {
  return `You are the first stage of a 5 stage social media post processor. Decide whether the post contains a specific, extractable public event, activity, or food/drink offer.

INCLUDE:
- Public meetings, hearings, forums, and information sessions when the source invites or announces public attendance.
- Named or date-range public festivals, fairs, performances, and community activities. A detailed timetable is not required at Stage 1.
- Public farm or attraction visits, admission offers, interactive tours, and bookable classes or activities. A current invitation or advertised access is enough; later stages can resolve or hold missing details.
- Public food drives and food collection/drop-off events with announced participation details, organized food trails or self-guided circuits, and free food or drink offers to visitors. An exact date window is not required for an active public invitation.
- Public open-swim, rink, or similar recreational access when it is actively offered to the public. Generic business or facility hours alone do not qualify.
- Explicit food or drink specials, deals, and discounts, including grocery food offers, even if no numeric price is shown.

EXCLUDE:
- Election administration notices such as filing forms, ballot information, candidate deadlines, or procedural reminders. A separately announced public meeting or forum can still qualify.
- Discounts on non-food retail merchandise.
- Month-long or rotating menus and featured flavors/items without a specific food/drink deal; new products, restocks, and limited-stock or season-ending notices without a qualifying offer or activity.
- Past-only activity photos or recaps without a clear current or upcoming invitation, booking, public session, or offer.
- Broadcast-only radio or show airtime without an announced public gathering, live participation, or in-person activity. When broadcast details confirm an underlying public event at a venue, accept the physical event and do not treat its coverage as a second event.
- Generic business/facility hours, greetings, and general marketing without a qualifying event, activity, or offer.

Decide from concrete source content, never from the venue name or business category alone. When qualifying content appears alongside unrelated merchandise, marketing, or administrative information, accept for the qualifying content and ignore the unrelated material.

Analyze every image in attachment order. Return exactly one populated imageAnalysis entry per image with its 0-based index. Keep each description, relevance, and complexity signals specific to what is visible in that image. Do not copy caption or neighboring-image details into an image description. Recommend tiling only for a calendar grid or dense small text. Briefly explain the decision from the source evidence.

POST DETAILS:
- Posted by: ${userName}
- Posted at: ${timestamp}
- Text: "${combinedText}"
- Has images: ${hasImages}`;
}

export function createCompactV4ValidationPrompt(
  combinedText: string,
  hasImages: boolean,
  userName: string,
  timestamp: string
): string {
  return `You are the first stage of a 5 stage social media post processor. Decide whether this post or its images identify a specific public event, activity, or explicit food/drink offer. Stage 1 may accept a named activity before its schedule or route is complete; later stages can resolve or hold missing details.

INCLUDE:
- Event posters or program listings with a concrete public activity title, including trivia, live music, comedy, workshops, classes, performances, fairs, and festivals. The poster itself counts as the current announcement even if the caption is empty and no date, time, schedule, or extra invitation text is shown. Later stages can resolve or hold missing details.
- Public meetings, hearings, forums, and information sessions when announced for public attendance.
- Public access windows for recreational facilities such as fitness rooms, tracks, pools, and rinks when tied to a specific date or period. These qualify even when described as facility hours; ordinary shop, office, or business hours do not.
- Public farm or attraction visits, admission offers, interactive tours, and bookable activities.
- A named organized public food trail, circuit, or self-guided tour. Missing dates, routes, participating locations, or schedules do not make the named activity invalid at Stage 1.
- Organized public food drives or collection/drop-off events with an announced participation window.
- Explicit food/drink specials, deals, discounts, or promotional offers, including grocery offers. A clearly stated free giveaway, sample, or no-cost promotion to the public also qualifies. An explicitly advertised limited-time special qualifies; ordinary short-term availability does not.

EXCLUDE:
- Ordinary product, produce, flavor, menu, and stock availability; new or restocked items; ordinary produce boxes for purchase or pickup; or seasonal closing dates, by themselves. General invitations to visit, shop, buy, stock up, try an item, or get it before it is gone do not turn ordinary inventory into a special or deal. Require an explicit food/drink special, discount, deal, or free promotional offer.
- Discounts on non-food retail merchandise.
- Ordinary retail, office, or business hours without a dated public recreational access window or another qualifying activity.
- Election administration notices such as filing forms, ballot information, candidate deadlines, or procedural reminders. A separately announced public meeting or forum can still qualify.
- Past-only activity photos or recaps without a clear current or upcoming event, invitation, public session, or offer.
- Broadcast-only radio or show airtime without a public gathering, live participation, or in-person activity. If broadcast details confirm an underlying physical event, accept the physical event and do not count its coverage as a second event.

Decide from concrete source content, never from the venue name or business category alone. If a post mixes qualifying and unrelated material, accept for its qualifying portion and ignore the unrelated material.

CONSISTENCY REQUIREMENT (MUST FOLLOW):
- Set hasValidContent to true exactly when validationDecision is VALIDATION_PASSED.
- Set hasValidContent to false exactly when validationDecision is VALIDATION_FAILED.
- The reason must plainly support that same decision. Never return a passed decision while the reason says the post does not qualify, or a failed decision while the reason says it qualifies.
- Before returning, check all three fields and correct any conflict.

Analyze every image in attachment order. Return exactly one populated imageAnalysis entry per image with its 0-based index. Keep each description, relevance, and complexity signals specific to what is visible in that image. Do not copy caption or neighboring-image details into an image description. Recommend tiling only for a calendar grid or dense small text. Briefly explain the decision from the source evidence.

POST DETAILS:
- Posted by: ${userName}
- Posted at: ${timestamp}
- Text: "${combinedText}"
- Has images: ${hasImages}`;
}

export function createCompactV5ValidationPrompt(
  combinedText: string,
  hasImages: boolean,
  userName: string,
  timestamp: string
): string {
  return `You are the first stage of a 5 stage social media post processor. Identify a current or upcoming public event, activity, visitor access offer, or explicit food/drink special. Stage 1 needs to identify the activity or offer; later stages can resolve or hold missing details. Do not require every date, time, route, location, or price needed for a final event record.

INCLUDE:
- A concrete public event/activity title in a poster or program listing, including trivia, live music, comedy, workshops, classes, performances, fairs, and festivals. The poster itself is a current announcement even if the caption is empty or it gives no date, time, schedule, or extra invitation text.
- Public meetings, hearings, forums, and information sessions announced for public attendance.
- Public access to recreational facilities such as fitness rooms, tracks, pools, and rinks when tied to a date or period. Public visitor access at museums, heritage sites, cultural attractions, farms, and similar attractions also qualifies when the source announces a visiting/open period, even if it is described as opening hours; no separate event title is needed.
- Public tours, demonstrations, classes, bookable activities, and future visitor activities announced for a later date. Missing schedule details do not invalidate the Stage 1 announcement.
- An advertised public admission offer or admission sale, even when no numeric price or discount amount is printed.
- A named organized public food trail, circuit, or self-guided tour even when dates, route, locations, or schedule are missing; and organized public food drives or collection/drop-off events with announced participation details.
- Explicit food/drink specials, deals, discounts, and grocery food offers, even without a numeric price. A food/drink item explicitly promoted as today's or a specific day's feature/special also qualifies without a price.
- A clearly stated free food/drink sample or giveaway offered in person to visitors or through public pickup.

EXCLUDE:
- Ordinary product, produce, flavor, menu, or stock availability; new or restocked items; ordinary produce boxes for purchase/pickup; or seasonal closing dates by themselves. General invitations to visit, buy, stock up, try an item, or get it before it is gone do not make ordinary inventory a special or deal.
- Month-long or rotating menu announcements and featured dishes/flavors without an explicit special, deal, discount, or promotional offer. This does not exclude a daily or date-specific food/drink special or an explicitly advertised limited-time promotion.
- Discounts on non-food retail merchandise, regardless of the percentage or wording of the sale.
- Online prize draws, like/comment/share contests, or asynchronous social-media quizzes. They are not public events or in-person food offers; a separately announced scheduled live or in-person activity can qualify.
- Personal past outings, visits, or activity recaps without a clear current/upcoming public invitation or visitor-access notice. Do not infer an event from what a venue normally offers.
- Ordinary retail, office, and business hours. A dated public recreation access window or announced museum/heritage/attraction visitor period is different and can qualify.
- Election administration notices such as candidate filing forms, ballot information, procedural reminders, or deadlines. A separately announced public meeting or forum can still qualify.
- Broadcast-only airtime without a public gathering, live participation, or in-person event. If coverage confirms an underlying physical event, accept that event and do not count the broadcast as another event.

Decide from concrete source content, never from the venue name or business category alone. If a post mixes qualifying and unrelated content, accept for its qualifying portion and ignore the unrelated material.

CONSISTENCY REQUIREMENT (MUST FOLLOW):
- Set hasValidContent to true exactly when validationDecision is VALIDATION_PASSED.
- Set hasValidContent to false exactly when validationDecision is VALIDATION_FAILED.
- The reason must plainly support the same decision. Never return a passed decision while the reason says the post does not qualify, or a failed decision while the reason says it qualifies.
- Before returning, check all three fields and correct any conflict.

Analyze every image in attachment order. Return exactly one populated imageAnalysis entry per image with its 0-based index. Keep each description, relevance, and complexity signals specific to what is visible in that image. Do not copy caption or neighboring-image details into an image description. Recommend tiling only for a calendar grid or dense small text. Briefly explain the decision from the source evidence.

POST DETAILS:
- Posted by: ${userName}
- Posted at: ${timestamp}
- Text: "${combinedText}"
- Has images: ${hasImages}`;
}

/** Evaluation-only clarifications; keep the frozen v5 and live prompt unchanged. */
export function createCompactV6ValidationPrompt(
  combinedText: string,
  imageCount: number,
  userName: string,
  timestamp: string
): string {
  if (!Number.isInteger(imageCount) || imageCount < 0) {
    throw new Error('Stage 1 attachment count must be a nonnegative integer');
  }
  const clarifications = `SOURCE SCOPE AND LAYOUT CLARIFICATIONS (apply before deciding):
- A price alone, including a starting price or price sign on ordinary produce, does not establish a food special or deal. A shop being open for shopping is not public farm/attraction admission. Distinguish a farm market selling stock from an advertised farm visit, tour, admission, or hands-on activity. Preserve explicit grocery food deals and daily/date-specific food features even if unpriced.
- Do not accept ordinary non-food merchandise discounts as food/drink deals. Only the food/drink portion qualifies unless an independent public activity is advertised.
- Awards nominations, application/filing windows, and administrative participation are not an advertised public awards ceremony or gathering. A competition finalist/result recap does not announce an activity people can attend or join. A separately advertised upcoming competition, ceremony, or gathering can qualify.
- Temporary closures, maintenance, and a return to ordinary opening hours alone do not announce a public session. Preserve actual scheduled public recreation sessions, bookable ice/pool/fitness access, and attraction visitor/admission periods; do not infer these from a closure/reopening notice.
- Ordinary transport/taxi service hours and fares are not a recreational activity, tour, public event, or food/drink special. Do not transform transport availability into daily event listings.
- If all advertised dates are clearly already past relative to Posted at, with no current/upcoming activity or qualifying special, reject the expired announcement. Do not move recently past yearless dates into next year merely to make the post current. Leave genuinely unresolved schedule details to later stages.
- hasCalendarGrid includes a schedule DATE TABLE with dates or sessions arranged in rows/columns, even if it is not a seven-column month calendar and its text is legible. A price/product table alone is not a calendar.
- hasMultipleEventListings is true when the image lists two or more dated sessions/occurrences, including different dates or age groups of the SAME named program. Do not collapse many printed dates into a single listing simply because they share one program title. Describe the actual date table; do not invent recurrence.
- ATTACHED IMAGE COUNT: ${imageCount}. Return exactly ${imageCount} imageAnalysis entries, with indices ${imageCount ? `0 through ${imageCount - 1}` : 'none (empty array)'}. Caption/OCR photo-description lines are not attachments. Never create an entry for an unattached image or omit an attached image.

`;
  return createCompactV5ValidationPrompt(combinedText, imageCount > 0, userName, timestamp)
    .replace('POST DETAILS:\n', clarifications + 'POST DETAILS:\n');
}

/** Evaluation-only refinement. Frozen earlier prompts and live validation stay unchanged. */
export function createCompactV7ValidationPrompt(
  combinedText: string,
  imageCount: number,
  userName: string,
  timestamp: string
): string {
  const refinements = `ADDITIONAL SOURCE BOUNDARIES:
- Food/drink offers mean food and drink for PEOPLE. Pet food, animal feed, pet supplies, and general pet-store discounts are retail merchandise, not qualifying food specials, whether online or in-store.
- Evaluate attached images independently of a retrospective caption. An image explicitly advertising human-food STUDENT DEALS, a special, or a discount is qualifying evidence even when surrounding images are ordinary meal photos. Do not dismiss an explicit advertised deal as an ordinary price list. A restriction or terms notice for an advertised deal does not cancel the deal.
- Ordinary car-dealership invitations to test-drive a product are sales demonstrations, not public recreation activities or visitor attractions. A separately announced organized public gathering or event can qualify.

`;
  return createCompactV6ValidationPrompt(combinedText, imageCount, userName, timestamp)
    .replace(
      '- If all advertised dates are clearly already past relative to Posted at, with no current/upcoming activity or qualifying special, reject the expired announcement. Do not move recently past yearless dates into next year merely to make the post current. Leave genuinely unresolved schedule details to later stages.',
      '- Reject clearly expired announcements using explicitly dated source evidence and Posted at. Do not move recently past yearless dates into next year merely to make them current. A FUTURE month/day with no year remains eligible even if its printed weekday conflicts with the current-year calendar: do not infer a prior year solely from a weekday/date mismatch. Missing or conflicting year/weekday details belong to later date validation; they do not invalidate an otherwise concrete public activity at Stage 1.'
    )
    .replace('POST DETAILS:\n', refinements + 'POST DETAILS:\n');
}

/** Evaluation-only source-scope refinements from independently reviewed misses. */
export function createCompactV8ValidationPrompt(
  combinedText: string, imageCount: number, userName: string, timestamp: string
): string {
  const refinements = `ACTIVITY AND FOOD BOUNDARIES (apply these to mixed captions and each image):
- A qualifying public activity does NOT need a formal event title, fixed session date, or class timetable at Stage 1. Retain an explicit invitation to participate on site in crafting, gallery/workshop activities, knitting, or a public game/play space, even when ongoing. Retain explicitly bookable leisure/wellness experiences such as sauna, head-spa, relaxation/massage or group sessions. Later stages resolve availability or hold missing dates; do not reject an explicitly offered activity merely because it is ongoing. Ordinary stores offering only browsing/shopping, and mere photos of people doing things, remain excluded.
- An in-person FOOD PURCHASE promotion with an advertised bonus, prize-entry opportunity, free item, or discount is a food promotional offer. For example, trying/buying a named burger for a chance to win concert tickets qualifies for the FOOD PROMOTION. This does not turn an online like/share/comment prize draw into an event or authorize inventing a separate ticket-draw gathering.
- Month-long MENU FEATURES are not deals merely because available for a limited month: pizza/burger of the month or Pizza of the Moment without a discount, bonus, or other concrete offer is ordinary rotating menu availability. A board or list of TODAY'S AVAILABLE FLAVOURS is also availability, not a daily special by itself. Preserve genuinely advertised daily/date-specific food specials/features, including unpriced ones, and explicit food deals; do not treat every item currently available as a feature.

`;
  return createCompactV7ValidationPrompt(combinedText, imageCount, userName, timestamp)
    .replace('POST DETAILS:\n', refinements + 'POST DETAILS:\n');
}

/** Evaluation-only clarification of concrete daily meals and non-participatory awareness posts. */
export function createCompactV9ValidationPrompt(
  combinedText: string, imageCount: number, userName: string, timestamp: string
): string {
  const refinements = `CONCRETE OFFER CHECKS:
- A specifically advertised prepared MEAL OF THE DAY, offered today for people to come and purchase/eat/take away, is a date-specific food feature. It need not literally use the words "special", "feature", or "discount" and may be unpriced. Read equivalent bilingual invitations. Distinguish that concrete daily meal offer from a general rotating-menu description, a retail restock, or a board listing ordinary available flavours.
- Awareness months/days, commemorative labels, and requests to comment about a cause do not themselves advertise an activity people can attend, book, or participate in on site. Require an independently advertised public activity or qualifying food offer; a named observance and month alone are insufficient.
- A generic booking link, "group booking available", and unrelated wellness/service hashtags do not transform a routine customer manicure photo, finished-service recap, or product promotion into a public leisure activity. Retain an actually advertised bookable leisure experience or group activity, such as sauna access, a workshop or relaxation session, when grounded in the caption or image; do not infer an activity solely from tags.

`;
  return createCompactV8ValidationPrompt(combinedText, imageCount, userName, timestamp)
    .replace('POST DETAILS:\n', refinements + 'POST DETAILS:\n');
}

/** Evaluation-only clarification of implicit public access and non-event participation. */
export function createCompactV10ValidationPrompt(
  combinedText: string, imageCount: number, userName: string, timestamp: string
): string {
  const refinements = `PUBLIC ACCESS VERSUS INCIDENTAL REFERENCES:
- A current-tense offer of family/group visitor experiences at an orchard, U-pick, attraction or recreation facility qualifies even when most of the caption recounts its history. Read the entire caption for the current offer. Public access need not use the literal words "come", "book" or "open today". Preserve separately offered ongoing activities within a retrospective story.
- When a public arcade/game venue promotes use of its real games or play space, a playful first-person narrative about the value of playing can be its promotional invitation. Retain that ongoing leisure offering even without a schedule or literal booking instruction. Distinguish a venue promoting its own public leisure facilities from a private person's past outing or a mere product/customer-service photo. Do not require every public-access promotion to be a formal event announcement.
- A named performance in a photo credit, commemorative quotation or social engagement question alone is not a current performance announcement. Require current access/participation/attendance evidence, an actual upcoming poster, or another independently qualifying offer; the name and year alone do not establish one.
- Paying remotely by e-transfer for a prize draw does not establish a public gathering or leisure activity. A draw deadline/time alone is insufficient. Preserve a separately advertised in-person social gathering or a qualifying food-purchase promotion, but do not invent one from a remote-entry raffle.
- Requests to contact politicians, submit/support paperwork, or sign advocacy letters remain administrative campaigns even if a booth is available for signatures. A separately advertised public meeting, rally, community gathering or recreational activity can qualify; a signature collection alone does not.

`;
  return createCompactV9ValidationPrompt(combinedText, imageCount, userName, timestamp)
    .replace('POST DETAILS:\n', refinements + 'POST DETAILS:\n');
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
  hasImages: boolean,
  requireProgramLanguage = false
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
  const hasLinkedCalendar = hasEventsLink && (hasProgramLanguage || (!requireProgramLanguage && hasImages));
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
  hasImages: boolean,
  evaluationPolicy: Stage1LocalGatePolicy = 'production'
): void {
  const offerGuards = evaluationPolicy === 'source-offer-guards' || evaluationPolicy === 'source-offer-guards-v2';
  if (offerGuards && normalized.hasValidContent && isPhotoOnlyPastRecap(combinedText, normalized, evaluationPolicy === 'source-offer-guards-v2')) {
    normalized.hasValidContent = false;
    normalized.validationDecision = 'VALIDATION_FAILED';
    normalized.reason += ' | Past-only photo recap without current invitation or independent schedule (evaluation guard)';
    return;
  }
  if ((offerGuards || evaluationPolicy === 'source-menu-guards') && normalized.hasValidContent && isBareMenuHeadingWithoutOffer(combinedText, normalized)) {
    normalized.hasValidContent = false;
    normalized.validationDecision = 'VALIDATION_FAILED';
    normalized.reason += ' | Bare dated menu heading without independent activity or special evidence (evaluation guard)';
    return;
  }
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

  const linkedCalendarSignals = detectLinkedCalendarSignals(combinedText, hasImages, evaluationPolicy !== 'production');
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

/** Narrow source-based evaluation guard; never applied on the default production path. */
function isBareMenuHeadingWithoutOffer(text: string, result: ValidationResult): boolean {
  const caption = String(text || '').split(/\bOCR TEXT\s*:/i)[0]
    .replace(/#[\p{L}\p{N}_]+/gu, '').trim();
  const date = '(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\\s*)?(?:(?:January|February|March|April|May|June|July|August|September|October|November|December)\\.?\\s*\\d{1,2}(?:st|nd|rd|th)?(?:[, .]+\\d{4})?|\\d{1,2}[/.\\-]\\d{1,2}(?:[/.\\-]\\d{2,4})?)';
  if (!new RegExp(`^(?:today['’]s\\s+menu|menu\\s+du\\s+jour)[!:.\\s-]*(?:${date})?[!:.\\s-]*$`, 'i').test(caption)) return false;
  const images = result.imageAnalysis || [];
  if (!images.length || images.some(i => i.imageComplexity?.hasCalendarGrid || i.imageComplexity?.hasMultipleEventListings)) return false;
  const evidence = images.map(i => `${i.description} ${i.relevanceToPost}`).join(' ');
  const independentOffer = /\b(specials?|discounts?|deals?|sav(?:e|ings?)|free|bonus|gift|concert|live music|trivia|fundraiser|workshop|public session|admission|tickets?|buffet|meal of the day|plat du jour)\b/i;
  return /\bmenu\b/i.test(evidence) && !independentOffer.test(`${text} ${evidence}`);
}

/** Preserve dated/ongoing offers in mixed recaps; reject only explicit past-only photo reports. */
function isPhotoOnlyPastRecap(text: string, result: ValidationResult, preserveCurrentOffers = false): boolean {
  const caption = String(text || '').split(/\bOCR TEXT\s*:/i)[0];
  if (!/\b(came out|joined us|attended|we loved|last night|yesterday)\b/i.test(caption)) return false;
  if (/\b(join us|come (?:see|join|visit|out|by|to)|book|register|registration|upcoming|tomorrow|next (?:week|month|session)|tickets? (?:available|on sale))\b/i.test(caption)) return false;
  // V2 retains the model's eligibility decision for present-tense or current-time offers in a mixed recap.
  // This does not turn the phrase into an acceptance override for a model-rejected retail post.
  if (preserveCurrentOffers && /\b(?:we (?:offer|provide|welcome)|our (?:[a-z]+ ){0,5}(?:offers|provides|welcomes)|(?:activities|sessions|classes|tours|visits|u[- ]?pick|games|sauna|pool|ice time) (?:are|is) (?:available|offered))\b/i.test(caption)) return false;
  if (preserveCurrentOffers && /\b(today|tonight|currently|ongoing|every day|this (?:week|weekend|season))\b/i.test(caption)) return false;
  const images = result.imageAnalysis || [];
  if (!images.length || images.some(i => !i.imageComplexity?.isPromotionalPhoto || i.imageComplexity?.hasDenseText ||
      i.imageComplexity?.hasCalendarGrid || i.imageComplexity?.hasMultipleEventListings || i.imageComplexity.textDensityScore > 0.2)) return false;
  const evidence = images.map(i => `${i.description} ${i.relevanceToPost}`).join(' ');
  const schedule = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}\b|\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\b(?:specials?|discount|deal|free|upcoming|admission|book|register)\b/i;
  return !schedule.test(`${caption} ${evidence}`);
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
  if (options.reasoningEffort && !model.startsWith('gpt-6')) {
    throw new Error('Stage 1 reasoningEffort is supported only for GPT-6 evaluation requests.');
  }
  const requestedReasoningEffort = model.startsWith('gpt-6')
    ? options.reasoningEffort || 'none'
    : null;
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
        throw wrapStage1EvaluationArtifactError('attempt', error);
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
    requestedReasoningEffort,
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

  const reserveRequest = (attempt: Stage1RequestAttempt): string | undefined => {
    if (!options.onBeforeRequest) return undefined;
    try {
      return options.onBeforeRequest(attempt);
    } catch (error) {
      throw wrapStage1EvaluationArtifactError('request reservation', error);
    }
  };

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
        attempt.reservationId = reserveRequest(attempt);
        response = await client.responses.create({
          model,
          input: [{ role: 'user', content }],
          max_output_tokens: maxOutputTokens,
          ...(model.startsWith('gpt-6')
            ? { reasoning: { effort: requestedReasoningEffort as 'none' | 'low' | 'high' } }
            : {}),
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
        if (isStage1EvaluationArtifactError(error)) throw error;
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
      attempt.reservationId = reserveRequest(attempt);
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
      if (isStage1EvaluationArtifactError(error)) throw error;
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
    if (isStage1EvaluationArtifactError(error)) throw error;
    if (imageUrls && imageUrls.length > 0) {
      if (error instanceof TruncatedValidationJsonError) {
        logger.warn('Image validation JSON was truncated; retrying with images and a larger output cap', {
          error: error.message,
        });
        try {
          return await runOnce(imageUrls, 4000, 'output_limit_retry');
        } catch (retryError) {
          if (isStage1EvaluationBudgetStop(retryError)) throw retryError;
          if (isStage1EvaluationArtifactError(retryError)) throw retryError;
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

