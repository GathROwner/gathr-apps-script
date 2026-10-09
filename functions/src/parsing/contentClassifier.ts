/**
 * Stage 2: Content Classification
 * Ported from postParser.js - classifyContent function
 *
 * Classifies validated content into one of five categories:
 * EVENT, FOOD_SPECIAL, MIXED_EVENTS_AND_SPECIALS, CALENDAR, SCHEDULE
 */

import OpenAI from 'openai';
import {
  ClassificationResult,
  ContentType,
  GPTFunctionSchema,
  ParsingConfig,
  DEFAULT_PARSING_CONFIG,
  ExtractedDataInput,
} from './types.js';
import {
  emitGptUsage,
  extractTokenUsage,
  resolveImageDetail,
  resolveStageModel,
} from './runtimeConfig.js';
import { logger } from '../utils/logger.js';
import { detectStage2FoodSpecialSignals } from './stage2FoodSignals.js';

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

/**
 * Stage 2: Classify content type and estimate item count
 */
export async function classifyContent(
  combinedText: string,
  imageUrls: string[],
  userName: string,
  extractedData?: ExtractedDataInput,
  config: Partial<ParsingConfig> = {}
): Promise<ClassificationResult> {
  const cfg = { ...DEFAULT_PARSING_CONFIG, ...config };

  logger.info('Stage 2: Starting content classification', {
    userName,
    textLength: combinedText.length,
    imageCount: imageUrls.length,
    hasUtcStartDate: !!extractedData?.utcStartDate,
  });

  const prompt = createClassificationPrompt(
    combinedText,
    imageUrls.length > 0,
    userName,
    extractedData
  );
  const schema = createClassificationSchema();

  try {
    const response = await callGPTWithSchema(prompt, imageUrls, 'classifyContent', schema, cfg);
    let normalized = normalizeClassificationResponse(response, combinedText);
    const model = cfg.stage2ModelOverride || resolveStageModel(cfg.gptModelFast, 'STAGE2_MODEL_OVERRIDE');
    // Opt-in local/pilot safeguard: reassess a negative fast result once with
    // the same Luna model at high effort. Positive fast results stay one call.
    if (cfg.stage2LunaNegativeRecheck && model === 'gpt-6-luna' &&
        (cfg.stage2ReasoningEffort || 'none') === 'none' &&
        normalized.confidence < cfg.confidenceThreshold) {
      logger.info('Stage 2: Rechecking negative Luna classification at high effort');
      try {
        const reviewed = await callGPTWithSchema(prompt, imageUrls, 'classifyContent', schema,
          { ...cfg, stage2ReasoningEffort: 'high' });
        normalized = normalizeClassificationResponse(reviewed, combinedText);
      } catch (error) {
        // Preserve the first hold if adjudication fails; never substitute a
        // permissive heuristic for an unsuccessful negative-result recheck.
        logger.warn('Stage 2: Negative Luna recheck failed; retaining initial hold', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Log content analysis
    if (normalized.contentAnalysis) {
      logger.debug('Content analysis', {
        hasEvents: normalized.contentAnalysis.hasEvents,
        hasFoodSpecials: normalized.contentAnalysis.hasFoodSpecials,
        hasMultipleItems: normalized.contentAnalysis.hasMultipleItems,
        organizationStyle: normalized.contentAnalysis.organizationStyle,
      });
    }

    // POST-PROCESSING: Fix contradictory classifications
    // If GPT says MIXED_EVENTS_AND_SPECIALS but hasFoodSpecials is false, correct to EVENT
    if (
      normalized.contentType === 'MIXED_EVENTS_AND_SPECIALS' &&
      normalized.contentAnalysis &&
      normalized.contentAnalysis.hasFoodSpecials === false
    ) {
      logger.info('Correcting contradictory classification - MIXED but no food specials', {
        original: 'MIXED_EVENTS_AND_SPECIALS',
        corrected: 'EVENT',
      });
      normalized.contentType = 'EVENT';
      normalized.classificationReason =
        (normalized.classificationReason || '') +
        ' | Corrected: No food specials detected, reclassified as EVENT.';
      if (normalized.contentAnalysis.hasEvents) {
        normalized.confidence = Math.max(normalized.confidence, 0.75);
      }
    }

    // POST-PROCESSING: Boost confidence for confirmed Facebook Events
    // When utcStartDate exists, this is a structured Facebook Event with reliable metadata
    if (
      extractedData?.utcStartDate &&
      normalized.contentAnalysis?.hasEvents
    ) {
      const minConfidenceForFBEvent = 0.8;
      if (normalized.confidence < minConfidenceForFBEvent) {
        logger.info('Boosting confidence for Facebook Event (utcStartDate present)', {
          original: normalized.confidence,
          boosted: minConfidenceForFBEvent,
        });
        normalized.confidence = minConfidenceForFBEvent;
        normalized.classificationReason =
          (normalized.classificationReason || '') +
          ' | Confidence boosted: Facebook Event with structured date/time data.';
      }
    }

    logger.info(`Stage 2 Result: ${normalized.contentType}`, {
      confidence: normalized.confidence,
      estimatedItems: normalized.estimatedItemCount,
      reason: normalized.classificationReason,
    });

    return normalized;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `Stage 2 classification error: ${errorMessage || 'Unknown error'}`,
      error
    );
    const fallback = inferClassificationFromText(combinedText);
    // The opt-in Luna candidate must not turn malformed/incomplete responses
    // or transport failures into an accepted heuristic result. Preserve the
    // legacy Mini fallback unless this candidate is explicitly enabled.
    if (cfg.stage2LunaNegativeRecheck &&
        (cfg.stage2ModelOverride || resolveStageModel(cfg.gptModelFast, 'STAGE2_MODEL_OVERRIDE')) === 'gpt-6-luna') {
      fallback.confidence = 0;
      fallback.classificationReason += ' | Luna Stage 2 response unavailable; source requires retry/review.';
    }
    logger.warn('Stage 2 fallback classification applied', {
      error: errorMessage,
      contentType: fallback.contentType,
    });
    fallback.classificationReason =
      `${fallback.classificationReason} | GPT error: ${errorMessage || 'Unknown error'}`;
    return fallback;
  }
}

/**
 * Create the classification prompt - exact port from postParser.js
 */
function createClassificationPrompt(
  combinedText: string,
  hasImages: boolean,
  userName: string,
  extractedData?: ExtractedDataInput
): string {
  // Build Facebook Events context if available
  let facebookEventContext = '';
  if (extractedData?.utcStartDate) {
    const eventDate = extractedData.utcStartDate.split('T')[0]; // YYYY-MM-DD
    const eventTime = extractedData.utcStartDate.split('T')[1]?.substring(0, 5) || ''; // HH:mm
    facebookEventContext = `
- FACEBOOK EVENT DATA (from Facebook's event system):
  - Event Date: ${eventDate}
  - Event Time (UTC): ${eventTime}
  - This is a confirmed Facebook Event with structured date/time data.`;
  }

  return `Classify this validated content into ONE of these categories:

CONTENT:
- Posted by: ${userName}
- Text: "${combinedText}"
- Has images: ${hasImages}${facebookEventContext}

CLASSIFICATION CATEGORIES:

1. EVENT - Single or few public or bookable activities
   Includes entertainment, recreation, open swim/skate or bookable ice time, classes, clinics, workshops, studio tours, and public visits with advertised dates or hours.
   Examples: "Live music tonight 8pm", "Walk-in clinic today 9-4", "Studio tours Saturday and Sunday 10-5"
   A useful activity does not have to be entertainment, ticketed, or free. Do not mark hasEvents=false merely because it is a clinic, tour, or bookable activity.
   Invitations to register for a sport/class or book an activity also qualify when their dates are only on a linked page. Missing dates are for extraction/validation to resolve, not a reason to deny the activity here. A generic downloadable guide or shopping advertisement is not itself an activity invitation.
   Organized, date-limited food trails, tastings, and festivals are public activities even without discounts. Do not confuse them with an ordinary featured menu. Mark hasEvents=true for the organized activity; mark hasFoodSpecials=true only when food/drink specials are also advertised.
   NOTE: If FACEBOOK EVENT DATA is present above, this is likely an EVENT even if the text is promotional/biographical.

2. FOOD_SPECIAL - Advertised food/drink specials or deals only
   Examples: "Happy hour 5-7pm half price apps", "$0.50 wings tonight", "Today's lunch special"
   A named daily special or explicit deal qualifies without a printed price. An ordinary month-long featured menu item does not.
   Food/drink context is required: Main Street, a special gift/guest, retail discounts, admission fees, service prices, and lodging offers are not food specials. Ordinary stock arrivals are not deals.

3. MIXED_EVENTS_AND_SPECIALS - Both events AND specials together
   Examples: "Live music 8pm plus happy hour 5-7pm"

4. CALENDAR - Date-organized content with many events
   Examples: Monthly calendars, weekly schedules by date

5. SCHEDULE - Time-organized content with many events
   Examples: "Monday: Band A, Tuesday: Band B", performance lineups

ANALYSIS REQUIREMENTS:
1. Analyze what content elements are present
2. Determine which category best fits
3. Give a brief reason grounded in the source. Count activities/slots, not participants in a draw or entries in a menu.
4. If FACEBOOK EVENT DATA is present, factor that into your confidence level
5. Stage 1 already validated usefulness. Classify an advertised activity confidently even if it is not traditional entertainment. A closure, generic advertisement, or product restock without an activity or food/drink special should have low confidence and both presence flags false.
6. CALENDAR and SCHEDULE cover recreation/classes/bookable slots as well as performances. Keep date/time-organized multi-activity inventories on these routes; never infer extra recurring dates here.

Analyze and classify into exactly ONE category.`;
}

/**
 * Create the classification schema for GPT function calling
 */
function createClassificationSchema(): GPTFunctionSchema[] {
  return [
    {
      name: 'classifyContent',
      description: 'Classify content into one of five routing categories with reasoning',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          contentAnalysis: {
            type: 'object',
            additionalProperties: false,
            properties: {
              hasEvents: {
                type: 'boolean',
                description: 'Whether public or bookable activities, including clinics, tours, classes and recreation, are present',
              },
              hasFoodSpecials: {
                type: 'boolean',
                description: 'Whether food/drink deals are present',
              },
              hasMultipleItems: {
                type: 'boolean',
                description: 'Whether multiple events/specials are listed',
              },
              organizationStyle: {
                type: 'string',
                description: 'How content is organized (by date, time, or unstructured)',
              },
            },
            required: ['hasEvents', 'hasFoodSpecials', 'hasMultipleItems', 'organizationStyle'],
          },
          contentType: {
            type: 'string',
            enum: ['EVENT', 'FOOD_SPECIAL', 'MIXED_EVENTS_AND_SPECIALS', 'CALENDAR', 'SCHEDULE'],
            description: 'Content classification',
          },
          confidence: {
            type: 'number',
            description: 'Classification confidence 0.0 to 1.0',
          },
          classificationReason: {
            type: 'string',
            description: 'Detailed reasoning for why this classification was chosen',
          },
          estimatedItemCount: {
            type: 'integer',
            description: 'Estimated number of events/specials to extract',
          },
        },
        required: [
          'contentAnalysis',
          'contentType',
          'confidence',
          'classificationReason',
          'estimatedItemCount',
        ],
      },
    },
  ];
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
  let result = '', inString = false, escaped = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index], next = text[index + 1];
    if (inString) {
      result += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; result += char; continue; }
    if (char === '/' && next === '/') {
      index += 2;
      while (index < text.length && text[index] !== '\n') index++;
      if (index < text.length) result += '\n';
      continue;
    }
    if (char === '/' && next === '*') {
      index += 2;
      while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) {
        if (text[index] === '\n') result += '\n';
        index++;
      }
      index++;
      continue;
    }
    result += char;
  }
  return result;
}

function quoteUnquotedKeys(jsonStr: string): string {
  return jsonStr.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3');
}

function quoteBarewordValues(jsonStr: string): string {
  let repaired = jsonStr;
  repaired = repaired.replace(/("contentType"\s*:\s*)([A-Z_]+)(\s*[,\}])/g, '$1"$2"$3');
  repaired = repaired.replace(/("organizationStyle"\s*:\s*)([A-Za-z_]+)(\s*[,\}])/g, '$1"$2"$3');
  return repaired;
}

function inferClassificationFromText(text: string): ClassificationResult {
  const t = String(text || '');
  const lines = t
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const timeRe = /\b\d{1,2}(:\d{2})?\s*(am|pm)\b/i;
  const timeRangeRe = /\b\d{1,2}(:\d{2})?\s*(am|pm)?\s*[-\\u2013\\u2014]\s*\d{1,2}(:\d{2})?\s*(am|pm)\b/i;
  const monthRe = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i;
  const weekdayRe =
    /\b(mon|tue|tues|wed|thu|thur|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
  const eventKeywords =
    /\b(live music|music|trivia|karaoke|open mic|comedy|show|concert|party|festival|class|workshop|lesson|league|tournament|dance|swim|skate|public skate|lane swim)\b/i;
  const linkedCalendarUrl =
    /\b(?:https?:\/\/|www\.)[^\s"'<>]*\/(?:events?|calendar|programs?)(?:[\/?#][^\s"'<>]*)?/i;
  const weekProgramSignals =
    /\b(this week|weekly|month calendar|upcoming|programs?|schedule|what'?s on|full list|at the library)\b/i;

  const timeLines = lines.filter((line) => timeRe.test(line) || timeRangeRe.test(line)).length;
  const monthCount = (t.match(monthRe) || []).length;
  const weekdayCount = (t.match(weekdayRe) || []).length;
  const hasFoodSpecials = detectStage2FoodSpecialSignals(t).hasAny;
  const hasLinkedCalendarSignals = linkedCalendarUrl.test(t) && weekProgramSignals.test(t);
  const hasEvents = timeLines > 0 || eventKeywords.test(t) || hasLinkedCalendarSignals;
  const hasMultipleItems = timeLines >= 2 || lines.length >= 6 || hasLinkedCalendarSignals;
  const hasCalendarStyle =
    (monthCount + weekdayCount >= 2 && timeLines >= 3) || hasLinkedCalendarSignals;
  const isSchedule = timeLines >= 3;

  let contentType: ContentType = 'EVENT';
  if (hasFoodSpecials && hasEvents) {
    contentType = 'MIXED_EVENTS_AND_SPECIALS';
  } else if (hasFoodSpecials) {
    contentType = 'FOOD_SPECIAL';
  } else if (hasCalendarStyle) {
    contentType = 'CALENDAR';
  } else if (isSchedule) {
    contentType = 'SCHEDULE';
  }

  const organizationStyle = hasCalendarStyle
    ? 'by_date'
    : isSchedule
      ? 'by_time'
      : 'unstructured';

  return {
    contentAnalysis: {
      hasEvents,
      hasFoodSpecials,
      hasMultipleItems,
      organizationStyle,
    },
    contentType,
    confidence:
      contentType === 'EVENT'
        ? 0.55
        : contentType === 'CALENDAR' && hasLinkedCalendarSignals
          ? 0.82
          : 0.6,
    classificationReason: hasLinkedCalendarSignals
      ? 'Heuristic classification from linked calendar URL + weekly/program signals'
      : 'Heuristic classification from text signals',
    estimatedItemCount: hasLinkedCalendarSignals ? Math.max(6, timeLines || 1) : Math.max(1, timeLines || 1),
  };
}

function normalizeClassificationResponse(
  response: Partial<ClassificationResult> | null | undefined,
  text: string
): ClassificationResult {
  const fallback = inferClassificationFromText(text);
  if (!response || typeof response !== 'object') {
    return fallback;
  }

  const contentAnalysis = response.contentAnalysis && typeof response.contentAnalysis === 'object'
    ? {
        hasEvents: typeof response.contentAnalysis.hasEvents === 'boolean'
          ? response.contentAnalysis.hasEvents
          : fallback.contentAnalysis.hasEvents,
        hasFoodSpecials: typeof response.contentAnalysis.hasFoodSpecials === 'boolean'
          ? response.contentAnalysis.hasFoodSpecials
          : fallback.contentAnalysis.hasFoodSpecials,
        hasMultipleItems: typeof response.contentAnalysis.hasMultipleItems === 'boolean'
          ? response.contentAnalysis.hasMultipleItems
          : fallback.contentAnalysis.hasMultipleItems,
        organizationStyle: response.contentAnalysis.organizationStyle || fallback.contentAnalysis.organizationStyle,
      }
    : fallback.contentAnalysis;

  const validContentTypes: ContentType[] = [
    'EVENT',
    'FOOD_SPECIAL',
    'MIXED_EVENTS_AND_SPECIALS',
    'CALENDAR',
    'SCHEDULE',
  ];
  let contentType = validContentTypes.includes(response.contentType as ContentType)
    ? (response.contentType as ContentType)
    : fallback.contentType;

  let confidence =
    typeof response.confidence === 'number' ? response.confidence : fallback.confidence;
  let classificationReason = response.classificationReason || fallback.classificationReason;

  // Safeguard: force food-special-aware routing when strong special cues are present.
  const foodSignals = detectStage2FoodSpecialSignals(text);
  if (foodSignals.hasAny && !contentAnalysis.hasFoodSpecials) {
    contentAnalysis.hasFoodSpecials = true;
  }

  if (contentType === 'EVENT' && contentAnalysis.hasFoodSpecials) {
    contentType = contentAnalysis.hasEvents ? 'MIXED_EVENTS_AND_SPECIALS' : 'FOOD_SPECIAL';
    // Model flags alone must not promote a low-confidence unrelated offer.
    if (foodSignals.hasAny) confidence = Math.max(confidence, 0.78);
    classificationReason = `${classificationReason} | Safeguard: food-special-aware routing from source cues or model analysis.`;
  }

  // The schema requires a category even when none fits. Confidence in that
  // closest label must not override an explicit finding of no extractable items.
  if (!contentAnalysis.hasEvents && !contentAnalysis.hasFoodSpecials) {
    confidence = 0;
    classificationReason += ' | Safeguard: no activities or food/drink specials identified.';
  }

  return {
    contentAnalysis,
    contentType,
    confidence,
    classificationReason,
    estimatedItemCount:
      typeof response.estimatedItemCount === 'number'
        ? response.estimatedItemCount
        : fallback.estimatedItemCount,
  };
}

/**
 * Call GPT with function calling schema
 */
async function callGPTWithSchema(
  prompt: string,
  imageUrls: string[],
  functionName: string,
  schema: GPTFunctionSchema[],
  config: ParsingConfig
): Promise<ClassificationResult> {
  const client = getOpenAIClient();
  const model = config.stage2ModelOverride || resolveStageModel(config.gptModelFast, 'STAGE2_MODEL_OVERRIDE');
  const imageDetail = resolveImageDetail('STAGE2_IMAGE_DETAIL', 'high');
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

  const parseJsonResponse = (text: string): ClassificationResult => {
    // Parse valid JSON before any recovery; URLs and comment-like text inside
    // JSON strings are data, not comments.
    try { return JSON.parse(text) as ClassificationResult; } catch {}
    const jsonStr = normalizeJsonText(text);
    try {
      return JSON.parse(jsonStr) as ClassificationResult;
    } catch {
      const repaired = repairMalformedJson(jsonStr);
      return JSON.parse(repaired) as ClassificationResult;
    }
  };

  const repairMalformedJson = (jsonStr: string): string => {
    let repaired = jsonStr;
    let previousRepaired: string;
    let iterations = 0;
    const maxIterations = 10;

    do {
      previousRepaired = repaired;
      iterations++;

      repaired = repaired.replace(/\bTrue\b/g, 'true');
      repaired = repaired.replace(/\bFalse\b/g, 'false');
      repaired = repaired.replace(/\bNone\b/g, 'null');
      repaired = quoteUnquotedKeys(repaired);
      repaired = quoteBarewordValues(repaired);
      repaired = repaired.replace(/\}(\s*)\}(\s*),/g, '}$1,');
      repaired = repaired.replace(/\}(\s*)\}(\s*)\]/g, '}$1]');
      repaired = repaired.replace(/\}(\s*)\}(\s*)\](\s*),/g, '}$1]$3,');
      repaired = repaired.replace(/\}(\s*)\}(\s*)\}(\s*),/g, '}$1,');
      repaired = repaired.replace(/,(\s*)\]/g, '$1]');
      repaired = repaired.replace(/,(\s*)\}/g, '$1}');
      repaired = escapeUnescapedQuotesInStrings(repaired);
    } while (repaired !== previousRepaired && iterations < maxIterations);

    return repaired;
  };

  const escapeUnescapedQuotesInStrings = (jsonStr: string): string => {
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
  };

  const isQuoteEscaped = (str: string, index: number): boolean => {
    let backslashes = 0;
    let i = index - 1;
    while (i >= 0 && str[i] === '\\') {
      backslashes++;
      i--;
    }
    return backslashes % 2 === 1;
  };

  const findNextNonWhitespaceChar = (str: string, startIndex: number): string | null => {
    for (let i = startIndex; i < str.length; i++) {
      const char = str[i];
      if (!char || /\s/.test(char)) continue;
      return char;
    }
    return null;
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

  const runOnce = async (urls: string[]): Promise<ClassificationResult> => {
    if (usesResponses(model)) {
      const schemaHint = JSON.stringify(schema[0]?.parameters || {}, null, 2);
      const promptWithSchema = `${prompt}\n\nReturn ONLY valid JSON that matches this schema:\n${schemaHint}`;
      const content: any[] = [
        { type: 'input_text', text: promptWithSchema },
      ];

      if (urls && urls.length > 0) {
        for (const url of urls) {
          content.push({
            type: 'input_image',
            image_url: url,
            detail: imageDetail,
          });
        }
      }

      const callStart = Date.now();
      const response = await client.responses.create({
        model,
        input: [{ role: 'user', content }],
        max_output_tokens: model.startsWith('gpt-6') ? 6000 : 1500,
        ...(model.startsWith('gpt-6') ? { reasoning: { effort: (config.stage2ReasoningEffort || 'none') as any } } : {}),
      }, model === 'gpt-6-luna' && config.stage2LunaNegativeRecheck
        ? { timeout: 45_000, maxRetries: 1 } : undefined);
      const durationMs = Date.now() - callStart;
      logger.info('Timing', {
        step: 'gpt_call',
        component: 'contentClassifier',
        endpoint: 'responses',
        model,
        imageCount: urls.length,
        durationMs,
      });
      const usage = extractTokenUsage(response.usage);
      await emitGptUsage(config, {
        stage: 'stage2',
        component: 'contentClassifier',
        endpoint: 'responses',
        model,
        imageCount: urls.length,
        durationMs,
        ...usage,
      });

      const messageContent = extractResponsesText(response);
      logger.debug('GPT classification response received (responses)', {
        model,
        tokens: usage.totalTokens,
      });

      const parsed = parseJsonResponse(messageContent || '');
      if (model === 'gpt-6-luna' && config.stage2LunaNegativeRecheck) {
        const analysis = parsed?.contentAnalysis;
        if (response.status !== 'completed' ||
            !['EVENT', 'FOOD_SPECIAL', 'MIXED_EVENTS_AND_SPECIALS', 'CALENDAR', 'SCHEDULE'].includes(parsed?.contentType) ||
            !Number.isFinite(parsed?.confidence) || parsed.confidence < 0 || parsed.confidence > 1 ||
            !Number.isInteger(parsed?.estimatedItemCount) || parsed.estimatedItemCount < 0 ||
            typeof parsed?.classificationReason !== 'string' ||
            !analysis || typeof analysis.hasEvents !== 'boolean' ||
            typeof analysis.hasFoodSpecials !== 'boolean' || typeof analysis.hasMultipleItems !== 'boolean' ||
            typeof analysis.organizationStyle !== 'string') {
          throw new Error('Incomplete or invalid Luna Stage 2 classification');
        }
      }
      return parsed;
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

    const callStart = Date.now();
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content }],
      tools,
      tool_choice: { type: 'function', function: { name: functionName } },
      max_tokens: 1500,
      temperature: 0.3,
    });
    const durationMs = Date.now() - callStart;
    logger.info('Timing', {
      step: 'gpt_call',
      component: 'contentClassifier',
      endpoint: 'chat',
      model,
      imageCount: urls.length,
      durationMs,
    });
    const usage = extractTokenUsage(response.usage);
    await emitGptUsage(config, {
      stage: 'stage2',
      component: 'contentClassifier',
      endpoint: 'chat',
      model,
      imageCount: urls.length,
      durationMs,
      ...usage,
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    if (toolCall && toolCall.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      logger.debug('GPT classification response received', {
        model,
        tokens: usage.totalTokens,
      });
      return parsed as ClassificationResult;
    }

    // Fallback: try to parse content as JSON
    const messageContent = response.choices[0]?.message?.content;
    if (messageContent) {
      try {
        return JSON.parse(messageContent) as ClassificationResult;
      } catch {
        return {
          contentAnalysis: {
            hasEvents: false,
            hasFoodSpecials: false,
            hasMultipleItems: false,
            organizationStyle: 'unknown',
          },
          contentType: 'unknown',
          confidence: 0,
          classificationReason: messageContent,
          estimatedItemCount: 0,
        };
      }
    }

    throw new Error('No valid response from GPT');
  };

  try {
    return await runOnce(imageUrls);
  } catch (error) {
    if (imageUrls && imageUrls.length > 0 &&
        !(model === 'gpt-6-luna' && config.stage2LunaNegativeRecheck)) {
      logger.warn('GPT call failed with images; retrying without images', {
        error: error instanceof Error ? error.message : String(error),
      });
      return await runOnce([]);
    }
    logger.error('GPT call failed', error);
    throw error;
  }
}
