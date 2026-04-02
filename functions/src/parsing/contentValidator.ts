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
    const textSignals = detectCalendarSignals(combinedText);
    logger.debug('Calendar signals detected', textSignals);

    // Merge policy: if model rejected but text clearly looks like a calendar/roundup, override to PASS
    if (
      (!normalized.hasValidContent || normalized.validationDecision === 'VALIDATION_FAILED') &&
      textSignals.hasCalendar
    ) {
      const prevReason = String(normalized.reason || '').trim();
      normalized.hasValidContent = true;
      normalized.validationDecision = 'VALIDATION_PASSED';
      normalized.confidence = Math.max(Number(normalized.confidence || 0), 0.8);
      normalized.reason =
        (prevReason ? prevReason + ' | ' : '') +
        'Text calendar/roundup detected (override PASS)';
      logger.info('Validation overridden to PASS due to strong text calendar signals');
    }

    const linkedCalendarSignals = detectLinkedCalendarSignals(combinedText, imageUrls.length > 0);
    if (
      (!normalized.hasValidContent || normalized.validationDecision === 'VALIDATION_FAILED') &&
      linkedCalendarSignals.hasLinkedCalendar
    ) {
      const prevReason = String(normalized.reason || '').trim();
      normalized.hasValidContent = true;
      normalized.validationDecision = 'VALIDATION_PASSED';
      normalized.confidence = Math.max(Number(normalized.confidence || 0), 0.75);
      normalized.reason =
        (prevReason ? prevReason + ' | ' : '') +
        linkedCalendarSignals.reason;
      logger.info('Validation overridden to PASS due to linked calendar/program signals');
    }

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
 * Create the validation prompt - exact port from postParser.js
 */
function createValidationPrompt(
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

OCR TILING GUIDANCE (IMPORTANT):
- "Calendar tiling" means splitting the image into many smaller tiles for OCR.
- Recommend tiling ONLY when the image contains a calendar grid/schedule layout or dense small text that likely needs tiling to read.
- Do NOT recommend tiling for mostly-photographic/promotional images with minimal overlay text (e.g., a photo with "What's Happening?" only).

Image Preprocessing
- Preprocess this image for OCR: crop to content, de-skew/dewarp, denoise, convert to high-contrast grayscale, sharpen text edges, and export a clean, straight 300+ DPI version.
- If the poster shows separate weekday tiles/lines (e.g., Thursday / Friday / Saturday), treat EACH tile/line as its own region. Read the time from WITHIN the same region as the act for that day.

VALID CONTENT:
âœ“ Events: Live music, trivia, comedy, workshops, parties WITH specific timing
âœ“ Food Specials: Happy hour, wing nights, drink deals WITH cost savings, food deal WITH cost savings
âœ“ Calendars or schedules showing multiple events/specials

INVALID CONTENT:
âœ— Business hours only
âœ— Holiday greetings without events
âœ— General marketing without specifics
âœ— Menu announcements without deals
âœ— "Visit us" without events/specials

ANALYSIS REQUIREMENTS:
1. First, analyze any images present and describe what you see
2. Then analyze the text content
3. Determine if valid content exists
4. Provide clear reasoning for your decision

DECISION POLICY (MUST FOLLOW):
- Never reject a post solely because the image appears decorative or generic if the TEXT clearly lists events (e.g., multiple lines with times and venues).
- Calendars/roundups that enumerate multiple events/venues in text are VALID even if the image has no event info.
- Reject only when BOTH image and text lack extractable events/specials.

Analyze the content and determine if it contains valid extractable information.`;
}

/**
 * Create the validation schema for GPT function calling
 */
function createValidationSchema(): GPTFunctionSchema[] {
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

function normalizeValidationResponse(
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
  config: ParsingConfig
): Promise<ValidationResult> {
  const client = getOpenAIClient();
  const model = resolveStageModel(config.gptModelFast, 'STAGE1_MODEL_OVERRIDE');
  const imageDetail = resolveImageDetail('STAGE1_IMAGE_DETAIL', 'high');
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

  const runOnce = async (urls: string[]): Promise<ValidationResult> => {
    if (isGpt5Model(model)) {
      const schemaHint = JSON.stringify(schema[0]?.parameters || {}, null, 2);
      const promptWithSchema = `${prompt}\n\nReturn ONLY valid JSON that matches this schema:\n${schemaHint}`;
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

      const callStart = Date.now();
      const response = await client.responses.create({
        model,
        input: [{ role: 'user', content }],
        max_output_tokens: 2000,
      });
      const durationMs = Date.now() - callStart;
      logger.info('Timing', {
        step: 'gpt_call',
        component: 'contentValidator',
        endpoint: 'responses',
        model,
        imageCount: urls.length,
        durationMs,
      });
      const usage = extractTokenUsage(response.usage);
      await emitGptUsage(config, {
        stage: 'stage1',
        component: 'contentValidator',
        endpoint: 'responses',
        model,
        imageCount: urls.length,
        durationMs,
        ...usage,
      });

      const messageContent = extractResponsesText(response);
      logger.debug('GPT validation response received (responses)', {
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
      max_tokens: 2000,
      temperature: 0.3,
    });
    const durationMs = Date.now() - callStart;
    logger.info('Timing', {
      step: 'gpt_call',
      component: 'contentValidator',
      endpoint: 'chat',
      model,
      imageCount: urls.length,
      durationMs,
    });
    const usage = extractTokenUsage(response.usage);
    await emitGptUsage(config, {
      stage: 'stage1',
      component: 'contentValidator',
      endpoint: 'chat',
      model,
      imageCount: urls.length,
      durationMs,
      ...usage,
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    if (toolCall && toolCall.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      logger.debug('GPT validation response received', {
        model,
        tokens: usage.totalTokens,
      });
      return parsed as ValidationResult;
    }

    // Fallback: try to parse content as JSON
    const messageContent = response.choices[0]?.message?.content;
    if (messageContent) {
      try {
        return JSON.parse(messageContent) as ValidationResult;
      } catch {
        return {
          imageAnalysis: [],
          hasValidContent: false,
          confidence: 0,
          validationDecision: 'VALIDATION_FAILED',
          reason: messageContent,
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

