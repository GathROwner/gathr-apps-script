/**
 * GPT Service
 * OpenAI API integration with function calling for content extraction
 */

import OpenAI from 'openai';
import {
  GPTResponse,
  ContentValidationResult,
  ContentClassificationResult,
  ExtractedItem,
  ProcessingConfig,
  DEFAULT_CONFIG,
  ParseSnapshotStage,
} from '../types/index.js';
import { logger } from '../utils/logger.js';

// Initialize OpenAI client
let openaiClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable not set');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// Get model from environment or config
function getModel(type: 'fast' | 'reasoning'): string {
  if (type === 'fast') {
    return process.env.GPT_MODEL_FAST || DEFAULT_CONFIG.gptModelFast;
  }
  return process.env.GPT_MODEL_REASONING || DEFAULT_CONFIG.gptModelReasoning;
}

type NonStreamingParams = OpenAI.Chat.ChatCompletionCreateParamsNonStreaming;
export type ParseSnapshotHandler = (stage: ParseSnapshotStage) => void | Promise<void>;

function buildChatRequest(
  model: string,
  base: NonStreamingParams,
  options?: { temperature?: number; reasoningEffort?: OpenAI.ReasoningEffort }
): NonStreamingParams {
  const request: NonStreamingParams = { ...base };
  if (options?.temperature !== undefined && !model.startsWith('gpt-5')) {
    request.temperature = options.temperature;
  }
  if (options?.reasoningEffort !== undefined && model.startsWith('gpt-5')) {
    request.reasoning_effort = options.reasoningEffort;
  }
  return request;
}

function logGptTiming(
  stage: string,
  model: string,
  startMs: number,
  details: Record<string, unknown> = {}
): void {
  logger.info('Timing', {
    step: `gpt_${stage}`,
    model,
    durationMs: Date.now() - startMs,
    ...details,
  });
}

function logStageTiming(
  stage: string,
  startMs: number,
  details: Record<string, unknown> = {}
): void {
  logger.info('Timing', { step: `legacy_${stage}`, durationMs: Date.now() - startMs, ...details });
}

/**
 * Stage 1: Validate content - check if post contains event-worthy content
 */
export async function validateContent(
  text: string,
  _config?: Partial<ProcessingConfig>
): Promise<GPTResponse<ContentValidationResult>> {
  const client = getClient();
  const model = getModel('fast');

  const systemPrompt = `You are a content validator for a local events aggregator in Prince Edward Island, Canada.
Your job is to determine if a social media post contains information about:
- Events (concerts, shows, performances, trivia nights, etc.)
- Specials (food specials, drink specials, happy hour, etc.)
- Announcements about upcoming activities at venues

Respond with a JSON object containing:
- hasValidContent: boolean - true if the post contains event/special/activity information
- confidence: number (0-1) - how confident you are
- reason: string - brief explanation if not valid content

Do NOT consider valid:
- General promotional content without specific events
- Job postings
- Reviews or testimonials
- News articles
- Personal posts not about events`;

  try {
    const callStart = Date.now();
    let response = await client.chat.completions.create(
      buildChatRequest(
        model,
        {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text },
          ],
          response_format: { type: 'json_object' },
          max_completion_tokens: 1000,
        },
        { temperature: 0.3, reasoningEffort: 'low' }
      )
    );
    logGptTiming('validateContent', model, callStart);

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response content from GPT');
    }

    const result = JSON.parse(content) as ContentValidationResult;

    logger.logGPTCall('validateContent', model, {
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
    });

    return {
      success: true,
      data: result,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
    };
  } catch (error) {
    logger.error('GPT validateContent failed', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Stage 2: Classify content type and estimate item count
 */
export async function classifyContent(
  text: string,
  _config?: Partial<ProcessingConfig>
): Promise<GPTResponse<ContentClassificationResult>> {
  const client = getClient();
  const model = getModel('fast');

  const systemPrompt = `You are a content classifier for a local events aggregator.
Classify the content type and estimate how many distinct items are mentioned.

Content types:
- "event": A specific event (concert, show, performance, sports, etc.)
- "special": Food/drink specials, happy hour, promotions
- "announcement": General venue announcements about upcoming activities
- "menu": Menu updates or new items
- "other": Doesn't fit above categories

Respond with JSON:
- contentType: one of the types above
- estimatedItemCount: number of distinct events/specials mentioned (1+)
- confidence: number (0-1)`;

  try {
    const callStart = Date.now();
    let response = await client.chat.completions.create(
      buildChatRequest(
        model,
        {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text },
          ],
          response_format: { type: 'json_object' },
          max_completion_tokens: 800,
        },
        { temperature: 0.3, reasoningEffort: 'low' }
      )
    );
    logGptTiming('classifyContent', model, callStart);

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response content from GPT');
    }

    const result = JSON.parse(content) as ContentClassificationResult;

    logger.logGPTCall('classifyContent', model, {
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
    });

    return {
      success: true,
      data: result,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
    };
  } catch (error) {
    logger.error('GPT classifyContent failed', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Stage 3: Extract content items based on type
 */
export async function extractContent(
  text: string,
  contentType: string,
  estimatedCount: number,
  _config?: Partial<ProcessingConfig>
): Promise<GPTResponse<ExtractedItem[]>> {
  const client = getClient();
  const model = getModel('reasoning');

  const systemPrompt = `You are an event data extractor for Prince Edward Island venues.
Extract structured event/special information from the post.

For each item, extract:
- eventType: "concert", "trivia", "open_mic", "karaoke", "comedy", "sports", "food_special", "drink_special", "happy_hour", "brunch", "other"
- eventName: name/title of the event (if mentioned)
- description: brief description
- startDate: in YYYY-MM-DD format (use context clues if relative dates like "tonight", "this Friday")
- endDate: in YYYY-MM-DD format (if different from start)
- startTime: in HH:MM 24-hour format
- endTime: in HH:MM 24-hour format (if mentioned)
- price: price information as stated
- ageRestriction: any age restrictions mentioned
- confidence: 0-1 how confident you are in this extraction

Important:
- Extract ${estimatedCount} items if possible
- If dates are relative (today, tonight, this weekend), use the current date context
- If time is not specified, leave startTime/endTime empty
- For recurring events (every Wednesday), create entries for upcoming occurrences

Return a JSON object with:
- items: array of extracted items`;

  try {
    const callStart = Date.now();
    let response = await client.chat.completions.create(
      buildChatRequest(
        model,
        {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `Content type: ${contentType}\nEstimated items: ${estimatedCount}\n\nPost content:\n${text}`,
            },
          ],
          response_format: { type: 'json_object' },
          max_completion_tokens: 2000,
        },
        { temperature: 0.3 }
      )
    );
    logGptTiming('extractContent', model, callStart);

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response content from GPT');
    }

    const result = JSON.parse(content) as { items: ExtractedItem[] };

    // Add pipeline tracking
    const items = result.items.map((item, index) => ({
      ...item,
      _pipelineIndex: index + 1,
      _pipelineTotalStage3: result.items.length,
    }));

    logger.logGPTCall('extractContent', model, {
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
    });

    return {
      success: true,
      data: items,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
    };
  } catch (error) {
    logger.error('GPT extractContent failed', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Stage 4: Secondary validation of extracted items
 */
export async function validateExtractedItems(
  items: ExtractedItem[],
  originalText: string,
  _config?: Partial<ProcessingConfig>
): Promise<GPTResponse<ExtractedItem[]>> {
  const client = getClient();
  const model = getModel('fast');

  const systemPrompt = `You are a data quality validator for extracted event information.
Review the extracted items and validate them against the original post.

For each item, verify:
1. The information actually appears in the original text
2. Dates and times are reasonable
3. The event type classification is correct

Return a JSON object with:
- items: array of validated items (same structure, can modify confidence or reject items)
- rejected: array of item indices that should be discarded (0-indexed)
- rejectionReasons: object mapping indices to reasons`;

  try {
    const callStart = Date.now();
    const response = await client.chat.completions.create(
      buildChatRequest(
        model,
        {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `Original post:\n${originalText}\n\nExtracted items:\n${JSON.stringify(items, null, 2)}`,
            },
          ],
          response_format: { type: 'json_object' },
          max_completion_tokens: 2000,
        },
        { temperature: 0.2, reasoningEffort: 'low' }
      )
    );
    logGptTiming('validateExtractedItems', model, callStart);

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response content from GPT');
    }

    const result = JSON.parse(content) as {
      items: ExtractedItem[];
      rejected: number[];
      rejectionReasons: Record<number, string>;
    };

    // Filter out rejected items
    const validItems = result.items.filter((_, index) =>
      !result.rejected?.includes(index)
    );

    logger.logGPTCall('validateExtractedItems', model, {
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
    });

    if (result.rejected?.length > 0) {
      logger.debug('Items rejected during validation', {
        rejectedCount: result.rejected.length,
        reasons: result.rejectionReasons,
      });
    }

    return {
      success: true,
      data: validItems,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
    };
  } catch (error) {
    logger.error('GPT validateExtractedItems failed', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Stage 5: Final formatting and normalization
 */
export async function formatFinalOutput(
  items: ExtractedItem[],
  establishment: string,
  _config?: Partial<ProcessingConfig>
): Promise<GPTResponse<ExtractedItem[]>> {
  const client = getClient();
  const model = getModel('fast');

  const systemPrompt = `You are a data formatter for event information.
Format the extracted items into the final output structure.

Ensure:
1. All dates are in YYYY-MM-DD format
2. All times are in HH:MM 24-hour format
3. Event names are properly capitalized
4. Descriptions are clean and concise
5. Price information is standardized (e.g., "$10", "Free", "$5-$10")

The establishment name is: ${establishment}

Return a JSON object with:
- items: array of formatted items`;

  try {
    const callStart = Date.now();
    let response = await client.chat.completions.create(
      buildChatRequest(
        model,
        {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `Items to format:\n${JSON.stringify(items, null, 2)}`,
            },
          ],
          response_format: { type: 'json_object' },
          max_completion_tokens: 2000,
        },
        { temperature: 0.1, reasoningEffort: 'low' }
      )
    );
    logGptTiming('formatFinalOutput', model, callStart, { attempt: 1 });

    let content = response.choices[0]?.message?.content;
    if (!content) {
      logger.warn('GPT formatFinalOutput empty response, retrying with higher token limit', {
        model,
      });
      const retryStart = Date.now();
      response = await client.chat.completions.create(
        buildChatRequest(
          model,
          {
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              {
                role: 'user',
                content: `Items to format:\n${JSON.stringify(items, null, 2)}`,
              },
            ],
            response_format: { type: 'json_object' },
            max_completion_tokens: 4000,
          },
          { temperature: 0.1, reasoningEffort: 'low' }
        )
      );
      logGptTiming('formatFinalOutput', model, retryStart, { attempt: 2 });
      content = response.choices[0]?.message?.content;
    }
    if (!content) {
      throw new Error('No response content from GPT');
    }

    const result = JSON.parse(content) as { items: ExtractedItem[] };

    logger.logGPTCall('formatFinalOutput', model, {
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
    });

    return {
      success: true,
      data: result.items,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
    };
  } catch (error) {
    logger.error('GPT formatFinalOutput failed', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Complete 5-stage parsing pipeline
 */
export async function parseContent(
  text: string,
  establishment: string,
  config?: Partial<ProcessingConfig>,
  snapshotHandler?: ParseSnapshotHandler
): Promise<GPTResponse<ExtractedItem[]>> {
  // Stage 1: Validate
  const stage1Start = Date.now();
  const validationResult = await validateContent(text, config);
  logStageTiming('stage1_validate', stage1Start);
  snapshotHandler?.({
    stage: 'validate',
    success: validationResult.success,
    output: validationResult.data,
    error: validationResult.error,
    usage: validationResult.usage,
  });
  if (!validationResult.success || !validationResult.data?.hasValidContent) {
    return {
      success: true,
      data: [],
      error: validationResult.data?.reason || 'Content not valid for processing',
    };
  }

  // Confidence threshold check
  const confidenceThreshold = 0.6;
  if (validationResult.data.confidence < confidenceThreshold) {
    return {
      success: true,
      data: [],
      error: `Validation confidence too low: ${validationResult.data.confidence}`,
    };
  }

  // Stage 2: Classify
  const stage2Start = Date.now();
  const classificationResult = await classifyContent(text, config);
  logStageTiming('stage2_classify', stage2Start);
  snapshotHandler?.({
    stage: 'classify',
    success: classificationResult.success,
    output: classificationResult.data,
    error: classificationResult.error,
    usage: classificationResult.usage,
  });
  if (!classificationResult.success || !classificationResult.data) {
    return {
      success: false,
      error: classificationResult.error || 'Classification failed',
    };
  }

  // Stage 3: Extract
  const stage3Start = Date.now();
  const extractionResult = await extractContent(
    text,
    classificationResult.data.contentType,
    classificationResult.data.estimatedItemCount,
    config
  );
  logStageTiming('stage3_extract', stage3Start, {
    extractedCount: extractionResult.data?.length || 0,
  });
  snapshotHandler?.({
    stage: 'extract',
    success: extractionResult.success,
    output: extractionResult.data,
    error: extractionResult.error,
    usage: extractionResult.usage,
  });
  if (!extractionResult.success || !extractionResult.data) {
    return {
      success: false,
      error: extractionResult.error || 'Extraction failed',
    };
  }

  if (extractionResult.data.length === 0) {
    return {
      success: true,
      data: [],
      error: 'No items extracted',
    };
  }

  // Stage 4: Validate extracted items
  const stage4Start = Date.now();
  const validatedResult = await validateExtractedItems(
    extractionResult.data,
    text,
    config
  );
  logStageTiming('stage4_validate', stage4Start, {
    validatedCount: validatedResult.data?.length || 0,
  });
  snapshotHandler?.({
    stage: 'validateItems',
    success: validatedResult.success,
    output: validatedResult.data,
    error: validatedResult.error,
    usage: validatedResult.usage,
  });
  if (!validatedResult.success || !validatedResult.data) {
    return {
      success: false,
      error: validatedResult.error || 'Secondary validation failed',
    };
  }

  if (validatedResult.data.length === 0) {
    return {
      success: true,
      data: [],
      error: 'All items rejected during validation',
    };
  }

  // Stage 5: Format final output
  const stage5Start = Date.now();
  const formattedResult = await formatFinalOutput(
    validatedResult.data,
    establishment,
    config
  );
  logStageTiming('stage5_format', stage5Start, {
    formattedCount: formattedResult.data?.length || 0,
  });
  snapshotHandler?.({
    stage: 'format',
    success: formattedResult.success,
    output: formattedResult.data,
    error: formattedResult.error,
    usage: formattedResult.usage,
  });
  if (!formattedResult.success) {
    return {
      success: false,
      error: formattedResult.error || 'Final formatting failed',
    };
  }

  return {
    success: true,
    data: formattedResult.data || [],
  };
}
