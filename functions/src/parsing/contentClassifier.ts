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
    const normalized = normalizeClassificationResponse(response, combinedText);

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
      normalized.confidence = Math.max(normalized.confidence, 0.75);
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

1. EVENT - Single or few entertainment activities
   Examples: "Live music tonight 8pm", "Trivia Tuesday at 7"
   NOTE: If FACEBOOK EVENT DATA is present above, this is likely an EVENT even if the text is promotional/biographical.

2. FOOD_SPECIAL - Food/drink deals only
   Examples: "Happy hour 5-7pm half price apps", "$0.50 wings tonight"

3. MIXED_EVENTS_AND_SPECIALS - Both events AND specials together
   Examples: "Live music 8pm plus happy hour 5-7pm"

4. CALENDAR - Date-organized content with many events
   Examples: Monthly calendars, weekly schedules by date

5. SCHEDULE - Time-organized content with many events
   Examples: "Monday: Band A, Tuesday: Band B", performance lineups

ANALYSIS REQUIREMENTS:
1. Analyze what content elements are present
2. Determine which category best fits
3. Provide detailed reasoning for your classification choice
4. If FACEBOOK EVENT DATA is present, factor that into your confidence level

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
                description: 'Whether entertainment/activities are present',
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
  return text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
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
  const foodKeywords =
    /\b(happy hour|wings|apps|appetizers|dinner|lunch|brunch|special|half[-\s]?price|deal|two[-\s]?for[-\s]?one)\b/i;
  const linkedCalendarUrl =
    /\b(?:https?:\/\/|www\.)[^\s"'<>]*\/(?:events?|calendar|programs?)(?:[\/?#][^\s"'<>]*)?/i;
  const weekProgramSignals =
    /\b(this week|weekly|month calendar|upcoming|programs?|schedule|what'?s on|full list|at the library)\b/i;

  const timeLines = lines.filter((line) => timeRe.test(line) || timeRangeRe.test(line)).length;
  const monthCount = (t.match(monthRe) || []).length;
  const weekdayCount = (t.match(weekdayRe) || []).length;
  const hasPrice = /\$\s*\d+/.test(t);
  const hasFoodSpecials = hasPrice || foodKeywords.test(t);
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

function detectFoodSpecialSignals(text: string): {
  hasAny: boolean;
  hasStrong: boolean;
} {
  const t = String(text || '').toLowerCase();

  const strongPatterns = [
    /\bhappy\s*hour\b/,
    /\bwing\s*night\b/,
    /\btwo\s+can\s+dine\b/,
    /\b\d+\s*can\s+dine\b/,
    /\bfood\s+special\b/,
    /\bdrink\s+special\b/,
    /\bbrunch\s+special\b/,
  ];

  const anyPatterns = [
    ...strongPatterns,
    /\bbrunch\b/,
    /\bbreakfast\b/,
    /\blunch\b/,
    /\bdinner\b/,
    /\bmenu\b/,
    /\bappetizer\b/,
    /\bmains?\b/,
    /\bdessert\b/,
    /\bcocktail\b/,
    /\bdeal\b/,
    /\bspecial\b/,
    /\$\s*\d+/,
  ];

  return {
    hasAny: anyPatterns.some((pattern) => pattern.test(t)),
    hasStrong: strongPatterns.some((pattern) => pattern.test(t)),
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
  const foodSignals = detectFoodSpecialSignals(text);
  if ((foodSignals.hasStrong || foodSignals.hasAny) && !contentAnalysis.hasFoodSpecials) {
    contentAnalysis.hasFoodSpecials = true;
  }

  if (contentType === 'EVENT' && contentAnalysis.hasFoodSpecials) {
    contentType = contentAnalysis.hasEvents ? 'MIXED_EVENTS_AND_SPECIALS' : 'FOOD_SPECIAL';
    confidence = Math.max(confidence, 0.78);
    classificationReason = `${classificationReason} | Safeguard: detected clear food-special signals (e.g., happy hour/deal/brunch), reclassified from EVENT.`;
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
  const model = resolveStageModel(config.gptModelFast, 'STAGE2_MODEL_OVERRIDE');
  const imageDetail = resolveImageDetail('STAGE2_IMAGE_DETAIL', 'high');
  const isGpt5Model = (value: string): boolean => value.startsWith('gpt-5');

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
    if (isGpt5Model(model)) {
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
        max_output_tokens: 1500,
      });
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

      return parseJsonResponse(messageContent || '');
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
    if (imageUrls && imageUrls.length > 0) {
      logger.warn('GPT call failed with images; retrying without images', {
        error: error instanceof Error ? error.message : String(error),
      });
      return await runOnce([]);
    }
    logger.error('GPT call failed', error);
    throw error;
  }
}
