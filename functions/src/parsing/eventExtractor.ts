// @ts-nocheck
// TODO: Fix type errors introduced during Phase 6/7 updates
/**
 * Stage 3: Content Extraction
 * Ported from postParser.js - extractContentByType and related functions
 *
 * Extracts events, food specials, calendars, and schedules based on content type.
 * Includes date correction, recurring pattern detection, and time association rules.
 */

import OpenAI from 'openai';
import { DateTime } from 'luxon';
import {
  ContentType,
  ExtractedEvent,
  ExtractedSpecial,
  CalendarItem,
  ExtractedItem,
  ExtractionSummary,
  RecurringPattern,
  TimeFlags,
  ParsingConfig,
  DEFAULT_PARSING_CONFIG,
} from './types.js';
import {
  emitGptUsage,
  extractTokenUsage,
  parseBooleanEnv,
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

const SPECIAL_WEEKDAY_TOKEN_PATTERN =
  '(?:mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)';
const SPECIAL_WEEKDAY_LIST_PATTERN = `(${SPECIAL_WEEKDAY_TOKEN_PATTERN}(?:\\s*(?:,|&|and)\\s*${SPECIAL_WEEKDAY_TOKEN_PATTERN})*)`;

type SpecialWeekdayTimingClause = {
  index: number;
  weekdays: string[];
  timingKind: 'all_day' | 'from_time' | 'range';
  timingText: string;
  startTime: string;
  endTime: string;
  timeFlags: TimeFlags;
};

/**
 * Stage 3: Extract content based on classified type
 */
export async function extractContentByType(
  contentType: ContentType,
  combinedText: string,
  imageUrls: string[],
  userName: string,
  timestamp: string,
  config: Partial<ParsingConfig> = {}
): Promise<ExtractedItem[]> {
  const cfg = { ...DEFAULT_PARSING_CONFIG, ...config };

  logger.info(`Stage 3: Extracting content type: ${contentType}`, {
    userName,
    textLength: combinedText.length,
    imageCount: imageUrls.length,
  });

  try {
    let rawData: ExtractedItem[] = [];

    switch (contentType) {
      case 'EVENT':
        rawData = await extractEvents(combinedText, imageUrls, userName, timestamp, cfg);
        break;

      case 'FOOD_SPECIAL':
        rawData = await extractFoodSpecials(combinedText, imageUrls, userName, timestamp, cfg);
        break;

      case 'MIXED_EVENTS_AND_SPECIALS':
        // Optional cost mode: skip dual extraction and prioritize events first.
        const enableDualExtract = parseBooleanEnv('ENABLE_STAGE3_MIXED_DUAL_EXTRACT', true);
        const events = await extractEvents(combinedText, imageUrls, userName, timestamp, cfg);
        const specials = enableDualExtract
          ? await extractFoodSpecials(combinedText, imageUrls, userName, timestamp, cfg)
          : [];

        // Tag each item with its source
        const taggedEvents = events.map((event) => ({ ...event, _sourceType: 'event' as const }));
        const taggedSpecials = specials.map((special) => ({
          ...special,
          _sourceType: 'special' as const,
        }));

        // Deduplicate: If both extractors found the same FOOD item, prefer the food special extractor's version
        rawData = enableDualExtract
          ? deduplicateMixedContent(taggedEvents, taggedSpecials)
          : taggedEvents;
        break;

      case 'CALENDAR':
        rawData = await extractCalendarContent(combinedText, imageUrls, userName, timestamp, cfg);
        break;

      case 'SCHEDULE':
        rawData = await extractScheduleContent(combinedText, imageUrls, userName, timestamp, cfg);
        break;

      default:
        logger.warn(`Unknown content type: ${contentType}`);
        return [];
    }

    if (!rawData || rawData.length === 0) {
      logger.warn('Stage 3 extracted no items, attempting fallback extraction', {
        contentType,
        imageCount: imageUrls.length,
      });
      const fallbackItems = await extractFallbackItems(
        combinedText,
        imageUrls,
        userName,
        timestamp,
        cfg,
        contentType
      );
      if (fallbackItems.length > 0) {
        rawData = fallbackItems;
      }
    }

    rawData = await expandUmbrellaSeriesItems(
      rawData,
      combinedText,
      imageUrls,
      userName,
      timestamp,
      cfg
    );

    rawData = await refineUmbrellaThemeSeriesWithPosterDates(
      rawData,
      combinedText,
      imageUrls,
      userName,
      timestamp,
      cfg
    );

    logger.info(`Stage 3 Result: Extracted ${rawData.length} items from ${contentType}`);
    return rawData;
  } catch (error) {
    logger.error(`Stage 3 extraction error for ${contentType}`, error);
    return [];
  }
}

/**
 * Extract events only (no food specials)
 */
async function extractEvents(
  combinedText: string,
  imageUrls: string[],
  userName: string,
  timestamp: string,
  config: ParsingConfig
): Promise<ExtractedEvent[]> {
  logger.debug('Extracting events');

  // Compute local posted date/time for correct weekday → date mapping
  const tz = config.timezone;
  const postedDt = DateTime.fromISO(timestamp, { zone: tz });
  const postedLocalPretty = postedDt.toFormat('yyyy-MM-dd EEE HH:mm:ss');
  const postedLocalDate = postedDt.toFormat('yyyy-MM-dd');

  const prompt = createEventExtractionPrompt(
    combinedText,
    userName,
    timestamp,
    tz,
    postedLocalPretty,
    postedLocalDate
  );

  const response = await callGPT(prompt, imageUrls, config);

  try {
    const parsed = parseJSONResponse(response);

    if (parsed && Array.isArray(parsed.extractedEvents)) {
      // Post-process each event
      const processedEvents = parsed.extractedEvents.map((event: ExtractedEvent) => {
        // Sanitize recurringPattern
        event.recurringPattern = sanitizeRecurringPattern(event.recurringPattern);

        // Date correction based on weekday prefix
        const dateInfo = extractDateFromText(event.description, postedLocalDate);
        if (dateInfo.hasExplicitDayPrefix && dateInfo.date && event.date !== dateInfo.date) {
          // Validate: check if GPT's extracted date actually matches the weekday mentioned
          const gptDate = DateTime.fromISO(event.date);
          const gptDayOfWeek = gptDate.weekday % 7; // Convert to 0=Sun format
          const descriptionDayOfWeek = getDayOfWeekFromPrefix(event.description);

          if (descriptionDayOfWeek !== null && gptDayOfWeek === descriptionDayOfWeek) {
            logger.debug(`Skipping date correction for "${event.name}" - GPT date matches weekday`);
          } else {
            logger.debug(`Correcting date for "${event.name}": ${event.date} → ${dateInfo.date}`);
            event.date = dateInfo.date;
          }
        }

        // Recurring pattern detection
        let detectedPattern = detectRecurringPattern(event.description);
        if (detectedPattern === 'none') {
          detectedPattern = detectRecurringPattern(combinedText);
        }

        if (detectedPattern !== 'none') {
          if (!event.recurringPattern || event.recurringPattern === 'none') {
            logger.debug(`Detected recurring pattern for "${event.name}": ${detectedPattern}`);
            event.recurringPattern = detectedPattern;
          }
        }

        return event;
      });

      // Log extraction summary
      if (parsed.extractionSummary) {
        logger.debug('Event extraction summary', {
          totalFound: parsed.extractionSummary.totalFound,
          notes: parsed.extractionSummary.extractionNotes,
        });
      }

      return processedEvents;
    }

    return [];
  } catch (error) {
    logger.error('Error parsing event extraction response', error);
    return parseJSONFallback(response, 'events');
  }
}

/**
 * Extract food specials only (no events)
 */
async function extractFoodSpecials(
  combinedText: string,
  imageUrls: string[],
  userName: string,
  timestamp: string,
  config: ParsingConfig
): Promise<ExtractedSpecial[]> {
  logger.debug('Extracting food specials');

  const tz = config.timezone;
  const postedDt = DateTime.fromISO(timestamp, { zone: tz });
  const postedLocalDate = postedDt.toFormat('yyyy-MM-dd');

  const prompt = createFoodSpecialExtractionPrompt(combinedText, userName, timestamp, tz);

  const response = await callGPT(prompt, imageUrls, config);

  try {
    const parsed = parseJSONResponse(response);

    if (parsed && Array.isArray(parsed.extractedSpecials)) {
      // Post-process each special
      const processedSpecials = parsed.extractedSpecials.map((special: ExtractedSpecial) => {
        // Sanitize recurringPattern
        special.recurringPattern = sanitizeRecurringPattern(special.recurringPattern);

        // Date correction based on weekday prefix
        const dateInfo = extractDateFromText(special.description, postedLocalDate);
        if (dateInfo.hasExplicitDayPrefix && dateInfo.date && special.date !== dateInfo.date) {
          logger.debug(`Correcting date for "${special.name}": ${special.date} → ${dateInfo.date}`);
          special.date = dateInfo.date;
        }

        // Recurring pattern detection
        const detectedPattern = detectRecurringPattern(special.description);
        if (detectedPattern !== 'none' && (!special.recurringPattern || special.recurringPattern === 'none')) {
          logger.debug(`Detected recurring pattern for "${special.name}": ${detectedPattern}`);
          special.recurringPattern = detectedPattern;
        }

        return { ...special, _sourceType: 'special' as const };
      });

      return splitMixedHolidayWeekendSpecials(
        combinedText,
        postedLocalDate,
        ensureWeekdayBrunchSpecials(combinedText, postedLocalDate, processedSpecials)
      );
    }

    return [];
  } catch (error) {
    logger.error('Error parsing food special extraction response', error);
    const fallback = parseJSONFallback(response, 'specials');
    if (Array.isArray(fallback)) {
      const normalized = fallback.map((item: any) =>
        item && typeof item === 'object' ? { ...item, _sourceType: 'special' as const } : item
      ) as ExtractedSpecial[];
      return splitMixedHolidayWeekendSpecials(
        combinedText,
        postedLocalDate,
        ensureWeekdayBrunchSpecials(combinedText, postedLocalDate, normalized)
      );
    }
    return [];
  }
}

function mapWeekdayTokenToRecurringPattern(token: string): RecurringPattern | null {
  const normalized = String(token || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/s$/, '');

  const map: Record<string, RecurringPattern> = {
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

  return map[normalized] || null;
}

function canonicalWeekdayLabel(token: string): string {
  const normalized = String(token || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/s$/, '');
  const labels: Record<string, string> = {
    mon: 'Monday',
    monday: 'Monday',
    tue: 'Tuesday',
    tues: 'Tuesday',
    tuesday: 'Tuesday',
    wed: 'Wednesday',
    wednesday: 'Wednesday',
    thu: 'Thursday',
    thur: 'Thursday',
    thurs: 'Thursday',
    thursday: 'Thursday',
    fri: 'Friday',
    friday: 'Friday',
    sat: 'Saturday',
    saturday: 'Saturday',
    sun: 'Sunday',
    sunday: 'Sunday',
  };
  return labels[normalized] || token;
}

function ensureWeekdayBrunchSpecials(
  combinedText: string,
  postedLocalDate: string,
  specials: ExtractedSpecial[]
): ExtractedSpecial[] {
  const existingHasBrunch = specials.some((special) =>
    /\bbrunch\b/i.test(`${special.name || ''} ${special.description || ''}`)
  );
  if (existingHasBrunch) {
    return specials;
  }

  const lines = String(combinedText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return specials;
  }

  const postedDate = DateTime.fromISO(postedLocalDate);
  if (!postedDate.isValid) {
    return specials;
  }

  const weekdayRe =
    /\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/\bbrunch\b/i.test(line)) continue;

    const weekdayMatch = line.match(weekdayRe);
    if (!weekdayMatch) continue;

    const recurringPattern = mapWeekdayTokenToRecurringPattern(weekdayMatch[1]);
    if (!recurringPattern) continue;

    const dateFromLine = parseWeekdayHeader(line, postedDate) || postedLocalDate;
    const candidateTimeLines = [line, lines[i + 1] || '', lines[i + 2] || ''];

    let startTime = '';
    let endTime = '';
    for (const timeLine of candidateTimeLines) {
      const parsed = extractLineTimes(timeLine);
      if (parsed.ranges.length > 0) {
        startTime = parsed.ranges[0].startTime;
        endTime = parsed.ranges[0].endTime;
        break;
      }
      if (!startTime && parsed.singles.length > 0) {
        startTime = parsed.singles[0] || '';
        endTime = parsed.singles[1] || '';
      }
    }

    const weekdayLabel = canonicalWeekdayLabel(weekdayMatch[1]);
    const name = `${weekdayLabel} Brunch`;
    const descriptionParts = [line];
    if (lines[i + 1] && hasTimeToken(lines[i + 1])) {
      descriptionParts.push(lines[i + 1]);
    }

    const injected: ExtractedSpecial = {
      name,
      description: descriptionParts.join(' ').trim(),
      date: dateFromLine,
      startTime,
      endTime,
      venue: '',
      price: '',
      recurringPattern,
      extractionReason: 'weekday_brunch_fallback_from_text',
      _sourceType: 'special' as const,
    };

    logger.info('Injected missing weekday brunch special', {
      name: injected.name,
      date: injected.date,
      startTime: injected.startTime,
      endTime: injected.endTime,
      recurringPattern: injected.recurringPattern,
    });

    return [...specials, injected];
  }

  return specials;
}

function splitMixedHolidayWeekendSpecials(
  combinedText: string,
  postedLocalDate: string,
  specials: ExtractedSpecial[]
): ExtractedSpecial[] {
  if (!Array.isArray(specials) || specials.length === 0) {
    return specials;
  }

  const split: ExtractedSpecial[] = [];
  let changed = false;

  for (const special of specials) {
    const expanded = splitMixedHolidayWeekendSpecial(combinedText, postedLocalDate, special);
    if (expanded.length > 1) {
      changed = true;
      logger.info('Split mixed holiday/weekend special into weekday-specific items', {
        name: special.name,
        originalDate: special.date,
        splitCount: expanded.length,
        dates: expanded.map((item) => item.date),
      });
      split.push(...expanded);
      continue;
    }
    split.push(special);
  }

  return changed ? split : specials;
}

export function splitMixedHolidayWeekendSpecialsForRegression(
  combinedText: string,
  postedLocalDate: string,
  specials: ExtractedSpecial[]
): ExtractedSpecial[] {
  return splitMixedHolidayWeekendSpecials(combinedText, postedLocalDate, specials);
}

function splitMixedHolidayWeekendSpecial(
  combinedText: string,
  postedLocalDate: string,
  special: ExtractedSpecial
): ExtractedSpecial[] {
  if (!special || typeof special !== 'object') return [special];
  if (sanitizeRecurringPattern(special.recurringPattern) !== 'none') return [special];

  const sourceText = String(special.description || '').trim();
  if (!sourceText) return [special];

  const combinedSignals = `${String(special.name || '')} ${sourceText} ${stripOcrTextFromCombined(combinedText)}`;
  if (!/\b(this weekend|weekend|easter|holiday|long weekend)\b/i.test(combinedSignals)) {
    return [special];
  }
  if (/\b(every|each|weekly|daily)\b/i.test(combinedSignals)) {
    return [special];
  }

  const clauses = extractSpecialWeekdayTimingClauses(sourceText);
  if (clauses.length < 2) return [special];

  const uniqueWeekdays = Array.from(
    new Set(
      clauses.flatMap((clause) => clause.weekdays)
    )
  );
  const uniqueTimingSignatures = Array.from(
    new Set(
      clauses.map((clause) => `${clause.timingKind}|${clause.startTime}|${clause.endTime}`)
    )
  );
  if (uniqueWeekdays.length < 2 || uniqueTimingSignatures.length < 2) {
    return [special];
  }

  const clones: Array<{ item: ExtractedSpecial; weekdayLabel: string }> = [];
  let splitOrdinal = 0;

  for (const clause of clauses) {
    for (const weekdayToken of clause.weekdays) {
      const resolvedDate = resolveWeekdayDateFromPostedLocalDate(weekdayToken, postedLocalDate);
      if (!resolvedDate) continue;

      const weekdayLabel = canonicalWeekdayLabel(weekdayToken);
      const perDaySentence = buildPerDayAvailabilitySentence(
        clause,
        weekdayLabel,
        resolvedDate
      );
      const description = replaceAvailabilitySentence(sourceText, perDaySentence);
      const normalizedPrice = String(special.price || special.pricing || '').trim();
      const nextName =
        splitOrdinal === 0 || new RegExp(`\\b${weekdayLabel}\\b`, 'i').test(String(special.name || ''))
          ? special.name
          : `${String(special.name || '').trim()} — ${weekdayLabel}`;

      clones.push({
        weekdayLabel,
        item: {
          ...special,
          name: nextName,
          description,
          date: resolvedDate,
          startTime: clause.startTime,
          endTime: clause.endTime,
          price: normalizedPrice,
          pricing: String(special.pricing || normalizedPrice || '').trim(),
          recurringPattern: 'none',
          totalOccurrences: undefined,
          recurrenceUntilDate: undefined,
          timeFlags: cloneTimeFlags(clause.timeFlags),
          extractionReason: `mixed_holiday_weekend_split:${weekdayLabel.toLowerCase()}`,
          _sourceType: 'special' as const,
        },
      });
      splitOrdinal += 1;
    }
  }

  const deduped = new Map<string, ExtractedSpecial>();
  for (const clone of clones.sort((left, right) => {
    if (left.item.date === right.item.date) return left.weekdayLabel.localeCompare(right.weekdayLabel);
    return left.item.date.localeCompare(right.item.date);
  })) {
    const key = [
      String(clone.item.date || '').trim(),
      String(clone.item.startTime || '').trim(),
      String(clone.item.endTime || '').trim(),
      clone.weekdayLabel.toLowerCase(),
    ].join('|');
    if (!deduped.has(key)) {
      deduped.set(key, clone.item);
    }
  }

  return deduped.size > 1 ? Array.from(deduped.values()) : [special];
}

function extractSpecialWeekdayTimingClauses(text: string): SpecialWeekdayTimingClause[] {
  const normalized = String(text || '')
    .replace(/[\u2012-\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return [];

  const timingPattern =
    '(?:from\\s+\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)\\s+onwards|all day|\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?\\s*[-\\u2013\\u2014]\\s*\\d{1,2}(?::\\d{2})?\\s*(?:am|pm))';
  const regexes: Array<{ regex: RegExp; weekdayGroup: number; timingGroup: number }> = [
    {
      regex: new RegExp(`\\b(${timingPattern})\\s+on\\s+${SPECIAL_WEEKDAY_LIST_PATTERN}`, 'gi'),
      weekdayGroup: 2,
      timingGroup: 1,
    },
    {
      regex: new RegExp(`\\b(${timingPattern})\\s+${SPECIAL_WEEKDAY_LIST_PATTERN}`, 'gi'),
      weekdayGroup: 2,
      timingGroup: 1,
    },
    {
      regex: new RegExp(`\\b${SPECIAL_WEEKDAY_LIST_PATTERN}\\s+(${timingPattern})`, 'gi'),
      weekdayGroup: 1,
      timingGroup: 2,
    },
  ];

  const matches: Array<SpecialWeekdayTimingClause & { matchLength: number }> = [];
  for (const pattern of regexes) {
    for (const match of normalized.matchAll(pattern.regex)) {
      const fullText = String(match[0] || '').trim();
      const weekdayText = String(match[pattern.weekdayGroup] || '').trim();
      const timingText = String(match[pattern.timingGroup] || '').trim();
      const weekdays = extractWeekdayTokensFromList(weekdayText);
      const timing = resolveSpecialClauseTiming(timingText);
      if (weekdays.length === 0 || !timing) continue;
      matches.push({
        index: match.index || 0,
        weekdays,
        timingKind: timing.timingKind,
        timingText,
        startTime: timing.startTime,
        endTime: timing.endTime,
        timeFlags: timing.timeFlags,
        matchLength: fullText.length,
      });
    }
  }

  matches.sort((left, right) => left.index - right.index || right.matchLength - left.matchLength);

  const selected: SpecialWeekdayTimingClause[] = [];
  let lastCoveredEnd = -1;
  for (const match of matches) {
    const matchEnd = match.index + match.matchLength;
    if (match.index < lastCoveredEnd) continue;
    selected.push({
      index: match.index,
      weekdays: match.weekdays,
      timingKind: match.timingKind,
      timingText: match.timingText,
      startTime: match.startTime,
      endTime: match.endTime,
      timeFlags: match.timeFlags,
    });
    lastCoveredEnd = matchEnd;
  }

  return selected;
}

function extractWeekdayTokensFromList(text: string): string[] {
  const matches = String(text || '').match(
    /\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/gi
  );
  if (!matches) return [];

  const seen = new Set<string>();
  const weekdays: string[] = [];
  for (const match of matches) {
    const normalized = String(match || '')
      .toLowerCase()
      .replace(/[^a-z]/g, '')
      .replace(/s$/, '');
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    weekdays.push(normalized);
  }
  return weekdays;
}

function resolveSpecialClauseTiming(
  timingText: string
): Pick<SpecialWeekdayTimingClause, 'timingKind' | 'startTime' | 'endTime' | 'timeFlags'> | null {
  const normalized = String(timingText || '').trim();
  if (!normalized) return null;

  if (/\ball day\b/i.test(normalized)) {
    return {
      timingKind: 'all_day',
      startTime: '',
      endTime: '',
      timeFlags: {
        start: { source: 'semantic', evidence: 'all day' },
        end: { source: 'semantic', toClose: true, evidence: 'all day' },
      },
    };
  }

  if (/\bfrom\b/i.test(normalized) && /\bonwards\b/i.test(normalized)) {
    const startTime = extractTimeTokens(normalized)[0] || '';
    if (!startTime) return null;
    return {
      timingKind: 'from_time',
      startTime,
      endTime: '',
      timeFlags: {
        start: { source: 'explicit', evidence: normalized },
        end: { source: 'semantic', toClose: true, evidence: 'onwards' },
      },
    };
  }

  const parsedTimes = extractLineTimes(normalized);
  if (parsedTimes.ranges.length > 0) {
    const firstRange = parsedTimes.ranges[0];
    return {
      timingKind: 'range',
      startTime: firstRange.startTime,
      endTime: firstRange.endTime,
      timeFlags: {
        start: { source: 'explicit', evidence: normalized },
        end: { source: 'explicit', toClose: false, evidence: normalized },
      },
    };
  }

  return null;
}

function resolveWeekdayDateFromPostedLocalDate(
  weekdayToken: string,
  postedLocalDate: string
): string {
  const normalizedLabel = canonicalWeekdayLabel(weekdayToken);
  return extractDateFromText(`${normalizedLabel} -`, postedLocalDate).date;
}

function buildPerDayAvailabilitySentence(
  clause: SpecialWeekdayTimingClause,
  weekdayLabel: string,
  resolvedDate: string
): string {
  const explicitDateLabel = formatExplicitSpecialDateLabel(resolvedDate);
  const dayWithDate = explicitDateLabel
    ? `${weekdayLabel}, ${explicitDateLabel} only`
    : `${weekdayLabel} only`;
  if (clause.timingKind === 'all_day') {
    return `Available all day ${dayWithDate}.`;
  }
  if (clause.timingKind === 'from_time') {
    return `Available ${clause.timingText} on ${dayWithDate}.`;
  }
  return `Available ${clause.timingText} on ${dayWithDate}.`;
}

function replaceAvailabilitySentence(description: string, replacementSentence: string): string {
  const original = String(description || '').trim();
  if (!original) return replacementSentence;

  const replaced = original.replace(/\bavailable\b[^.]*\.?/i, replacementSentence);
  if (replaced !== original) {
    return replaced.replace(/\s+/g, ' ').trim();
  }

  return `${replacementSentence} ${original}`.replace(/\s+/g, ' ').trim();
}

function cloneTimeFlags(timeFlags: TimeFlags): TimeFlags {
  return {
    start: { ...timeFlags.start },
    end: { ...timeFlags.end },
  };
}

function formatExplicitSpecialDateLabel(resolvedDate: string): string {
  const dt = DateTime.fromISO(String(resolvedDate || ''));
  if (!dt.isValid) return '';
  return dt.toFormat('MMMM d');
}

/**
 * Extract calendar content (date-organized multi-event content)
 */
async function extractCalendarContent(
  combinedText: string,
  imageUrls: string[],
  userName: string,
  timestamp: string,
  config: ParsingConfig
): Promise<CalendarItem[]> {
  logger.debug('Extracting calendar content', { imageCount: imageUrls.length });

  const prompt = createCalendarExtractionPrompt(combinedText, userName, timestamp);

  const response = await callGPT(prompt, imageUrls, config);
  let items: CalendarItem[] = [];

  try {
    const parsed = parseJSONResponse(response);

    if (parsed?.extractedItems && Array.isArray(parsed.extractedItems)) {
      logger.debug('Calendar extraction result', {
        itemCount: parsed.extractedItems.length,
        claimed: parsed.extractionSummary?.totalFound,
      });

      items = parsed.extractedItems.map((item: CalendarItem) => ({
        ...item,
        _sourceType: 'calendar' as const,
      }));

      if (
        items.length < 12 &&
        parseBooleanEnv('ENABLE_STAGE3_CALENDAR_SUPPLEMENTAL_OCR', true)
      ) {
        items = await supplementCalendarWithOcr(
          items,
          combinedText,
          imageUrls,
          userName,
          timestamp,
          config
        );
      }

      // Validate calendar extraction for completeness
      if (items.length < 5) {
        logger.debug('Few items extracted, attempting secondary extraction');
        items = await performCalendarValidation(
          combinedText,
          imageUrls,
          items,
          userName,
          timestamp,
          config
        );
      }
    }
  } catch (error) {
    logger.error('Error parsing calendar extraction response', error);
    const fallbackItems = parseJSONFallback(response, 'calendar') as CalendarItem[];
    items = fallbackItems.map((item) => ({ ...item, _sourceType: 'calendar' as const }));
  }

  if (
    items.length === 0 &&
    parseBooleanEnv('ENABLE_STAGE3_CALENDAR_SUPPLEMENTAL_OCR', true)
  ) {
    const supplemented = await supplementCalendarWithOcr(
      items,
      combinedText,
      imageUrls,
      userName,
      timestamp,
      config
    );
    items = supplemented;
  }

  return items;
}

/**
 * Extract schedule content (time-organized multi-event content)
 */
async function extractScheduleContent(
  combinedText: string,
  imageUrls: string[],
  userName: string,
  timestamp: string,
  config: ParsingConfig
): Promise<CalendarItem[]> {
  logger.debug('Extracting schedule content');

  const prompt = createScheduleExtractionPrompt(combinedText, userName, timestamp);

  const response = await callGPT(prompt, imageUrls, config);

  try {
    const parsed = parseJSONResponse(response);

    if (parsed?.extractedItems && Array.isArray(parsed.extractedItems)) {
      return normalizeExtractedScheduleItems(parsed.extractedItems);
    }

    return [];
  } catch (error) {
    logger.error('Error parsing schedule extraction response', error);
    return normalizeExtractedScheduleItems(parseJSONFallback(response, 'schedule') as CalendarItem[]);
  }
}

function normalizeExtractedScheduleItems(items: Array<Record<string, unknown>>): CalendarItem[] {
  return (items || [])
    .map((rawItem) => normalizeExtractedScheduleItem(rawItem as CalendarItem))
    .filter((item) => Boolean(String(item.name || '').trim()));
}

function normalizeExtractedScheduleItem(item: CalendarItem): CalendarItem {
  const normalized: CalendarItem = {
    ...item,
    type: item?.type === 'special' ? 'special' : 'event',
    startTime: String(item?.startTime || '').trim(),
    endTime: String(item?.endTime || '').trim(),
    _sourceType: 'schedule',
  };

  const existingTimeFlags = cloneNormalizedTimeFlags((item as any)?.timeFlags);
  const evidenceCandidates = [
    String((item as any)?.description || '').trim(),
    String((item as any)?.extractionReason || '').trim(),
    String((item as any)?.timeText || '').trim(),
  ].filter(Boolean);

  let derivedTiming: { startTime: string; endTime: string; timeFlags: TimeFlags } | null = null;
  for (const evidenceText of evidenceCandidates) {
    derivedTiming = deriveScheduleTimingFromText(
      evidenceText,
      normalized.startTime,
      normalized.endTime || ''
    );
    if (derivedTiming) break;
  }

  if (derivedTiming) {
    if (!normalized.startTime && derivedTiming.startTime) {
      normalized.startTime = derivedTiming.startTime;
    }
    if (!normalized.endTime && derivedTiming.endTime) {
      normalized.endTime = derivedTiming.endTime;
    }
  }

  const mergedTimeFlags = mergeScheduleTimeFlags(existingTimeFlags, derivedTiming?.timeFlags);
  if (hasMeaningfulTimeFlags(mergedTimeFlags)) {
    normalized.timeFlags = mergedTimeFlags;
  }

  return normalized;
}

function createEmptyTimeFlags(): TimeFlags {
  return {
    start: { source: 'none', evidence: '' },
    end: { source: 'none', toClose: false, evidence: '' },
  };
}

function normalizeTimeFlagSource(
  value: unknown,
  allowed: Array<'explicit' | 'implied' | 'semantic' | 'none'>
): 'explicit' | 'implied' | 'semantic' | 'none' {
  const normalized = String(value || '').trim().toLowerCase();
  if (allowed.includes(normalized as any)) {
    return normalized as 'explicit' | 'implied' | 'semantic' | 'none';
  }
  return 'none';
}

function cloneNormalizedTimeFlags(value: unknown): TimeFlags {
  const raw = value as Record<string, unknown> | null | undefined;
  const startRaw = ((raw && raw.start) || {}) as Record<string, unknown>;
  const endRaw = ((raw && raw.end) || {}) as Record<string, unknown>;

  return {
    start: {
      source: normalizeTimeFlagSource(startRaw.source, ['explicit', 'implied', 'semantic', 'none']),
      evidence: String(startRaw.evidence || '').trim(),
    },
    end: {
      source: normalizeTimeFlagSource(endRaw.source, ['explicit', 'implied', 'semantic', 'none']),
      toClose: Boolean(endRaw.toClose),
      evidence: String(endRaw.evidence || '').trim(),
    },
  };
}

function hasMeaningfulTimeFlags(value: unknown): boolean {
  const flags = cloneNormalizedTimeFlags(value);
  return Boolean(
    String(flags.start.source || '').trim() !== 'none' ||
      String(flags.start.evidence || '').trim() ||
      String(flags.end.source || '').trim() !== 'none' ||
      String(flags.end.evidence || '').trim() ||
      flags.end.toClose === true
  );
}

function mergeScheduleTimeFlags(existing: TimeFlags, derived?: TimeFlags): TimeFlags {
  if (!derived) {
    return existing;
  }

  const next = cloneNormalizedTimeFlags(existing);

  if (
    String(next.start.source || '').trim().toLowerCase() === 'none' &&
    String(next.start.evidence || '').trim() === ''
  ) {
    next.start = { ...derived.start };
  }

  if (
    String(next.end.source || '').trim().toLowerCase() === 'none' &&
    String(next.end.evidence || '').trim() === '' &&
    next.end.toClose !== true
  ) {
    next.end = { ...derived.end };
  }

  return next;
}

function deriveScheduleTimingFromText(
  text: string,
  startTime: string,
  endTime: string
): { startTime: string; endTime: string; timeFlags: TimeFlags } | null {
  const normalizedText = String(text || '').trim();
  if (!normalizedText) return null;

  const expectedStart = String(startTime || '').trim();
  const expectedEnd = String(endTime || '').trim();
  const extracted = extractLineTimesWithEvidence(normalizedText);

  for (const range of extracted.ranges) {
    const startMatches = !expectedStart || range.startTime === expectedStart;
    const endMatches = !expectedEnd || range.endTime === expectedEnd;
    if (!startMatches || !endMatches) continue;

    return {
      startTime: range.startTime,
      endTime: range.endTime,
      timeFlags: {
        start: { source: 'explicit', evidence: range.evidence },
        end: { source: 'explicit', toClose: false, evidence: range.evidence },
      },
    };
  }

  const bareRangeEvidence = findBareRangeEvidenceForKnownTimes(
    normalizedText,
    expectedStart,
    expectedEnd
  );
  if (bareRangeEvidence) {
    return {
      startTime: expectedStart,
      endTime: expectedEnd,
      timeFlags: {
        start: { source: 'explicit', evidence: bareRangeEvidence },
        end: { source: 'explicit', toClose: false, evidence: bareRangeEvidence },
      },
    };
  }

  for (const single of extracted.singles) {
    if (expectedStart && single.time !== expectedStart) continue;
    return {
      startTime: single.time,
      endTime: '',
      timeFlags: {
        start: { source: 'explicit', evidence: single.evidence },
        end: { source: 'none', toClose: false, evidence: '' },
      },
    };
  }

  return null;
}

function findBareRangeEvidenceForKnownTimes(
  text: string,
  expectedStart: string,
  expectedEnd: string
): string {
  const normalizedText = String(text || '').trim();
  if (!normalizedText || !expectedStart || !expectedEnd) return '';

  const rangeMatches = Array.from(
    normalizedText.matchAll(/\b(\d{1,2}(?::\d{2})?)\s*[-\u2013\u2014]\s*(\d{1,2}(?::\d{2})?)\b/g)
  );

  for (const match of rangeMatches) {
    const startComparable = comparableBareTimeToken(match[1], expectedStart);
    const endComparable = comparableBareTimeToken(match[2], expectedEnd);
    if (startComparable === expectedStart && endComparable === expectedEnd) {
      return String(match[0] || '').trim();
    }
  }

  return '';
}

function comparableBareTimeToken(token: string, expectedTime: string): string {
  const normalizedExpected = String(expectedTime || '').trim();
  const expectedMatch = normalizedExpected.match(/^(\d{2}):(\d{2})$/);
  if (!expectedMatch) return '';

  const raw = String(token || '').trim();
  const tokenMatch = raw.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!tokenMatch) return '';

  const expectedHour24 = Number(expectedMatch[1]);
  const expectedMinute = Number(expectedMatch[2]);
  const tokenHour = Number(tokenMatch[1]);
  const tokenMinute = Number(tokenMatch[2] || '00');

  if (!Number.isFinite(expectedHour24) || !Number.isFinite(tokenHour)) return '';
  if (tokenMinute !== expectedMinute) return '';

  const expectedHour12 = expectedHour24 % 12 === 0 ? 12 : expectedHour24 % 12;
  if (tokenHour !== expectedHour12) return '';

  return normalizedExpected;
}

/**
 * Calendar validation helper - attempts secondary extraction if few items found
 */
async function performCalendarValidation(
  combinedText: string,
  imageUrls: string[],
  initialItems: CalendarItem[],
  userName: string,
  timestamp: string,
  config: ParsingConfig
): Promise<CalendarItem[]> {
  logger.debug('Validating calendar extraction completeness', {
    initialCount: initialItems.length,
  });

  const validationPrompt = `This calendar extraction found only ${initialItems.length} items.
Please verify ALL dates and events are captured.

Initial extraction: ${JSON.stringify(initialItems)}

Re-examine the calendar and extract any missed items.

For each additional item found, include:
- name: Event/special name
- type: "event" or "special"
- date: Specific date (YYYY-MM-DD)
- startTime: Time if shown
- endTime: End time if shown
- venue: Venue name if different from ${userName} (look for location names, venue names, "at [location]")
- price: if no specific price mentioned, use empty string
- description: Any additional details

VENUE EXTRACTION:
- Look for venue names after event names
- Check for "at [Location]" patterns
- Extract venue names from event descriptions
- If no specific venue mentioned, use empty string

CRITICAL JSON FORMATTING REQUIREMENTS:
- Return ONLY valid JSON array of ADDITIONAL items found
- NO markdown code blocks, NO '''json''' wrappers
- NO explanatory text before or after JSON
- Start with [ and end with ]
- Return empty array [] if no additional items found

Return pure JSON array with any additional calendar items.`;

  try {
    const response = await callGPT(validationPrompt, imageUrls, config);
    const additionalItems = parseJSONFallback(response, 'validation');

    return [
      ...initialItems,
      ...additionalItems.map((item) => ({ ...item, _sourceType: 'calendar' as const })),
    ];
  } catch (error) {
    logger.error('Calendar validation failed', error);
    return initialItems;
  }
}

/**
 * Fallback extraction when primary extractor returns no items
 */
async function extractFallbackItems(
  combinedText: string,
  imageUrls: string[],
  userName: string,
  timestamp: string,
  config: ParsingConfig,
  contentType: ContentType
): Promise<ExtractedItem[]> {
  const tz = config.timezone;
  const postedDt = DateTime.fromISO(timestamp, { zone: tz });
  const postedLocalPretty = postedDt.toFormat('yyyy-MM-dd EEE HH:mm:ss');
  const postedLocalDate = postedDt.toFormat('yyyy-MM-dd');

  const prompt = createFallbackExtractionPrompt(
    combinedText,
    userName,
    timestamp,
    tz,
    postedLocalPretty,
    postedLocalDate,
    contentType
  );

  let response = '';
  let parsedItems: Array<Record<string, unknown>> = [];
  let normalized: ExtractedItem[] = [];
  let selected: ExtractedItem[] = [];
  let usedParser: 'gpt_json' | 'schedule_text' | 'calendar_ocr' | 'none' = 'none';
  let notes = '';

  let gptError: string | null = null;
  try {
    response = await callGPT(prompt, imageUrls, config);
    parsedItems = parseFallbackItems(response);
    normalized = normalizeFallbackItems(parsedItems, postedLocalDate);
    if (normalized.length > 0) {
      selected = normalized;
      usedParser = 'gpt_json';
    }
  } catch (error) {
    gptError = error instanceof Error ? error.message : String(error);
    notes = gptError;
    logger.warn('Fallback GPT call failed', { contentType, error: gptError });
  }

  const shouldTryScheduleParser =
    contentType === 'CALENDAR' ||
    contentType === 'SCHEDULE' ||
    (contentType === 'MIXED_EVENTS_AND_SPECIALS' && looksLikeScheduleText(combinedText));

  if (selected.length === 0 && shouldTryScheduleParser) {
    const scheduleItems = parseScheduleText(
      combinedText,
      postedLocalDate,
      userName,
      contentType === 'CALENDAR' ? 'calendar' : 'schedule'
    );
    if (scheduleItems.length > 0) {
      selected = scheduleItems;
      usedParser = 'schedule_text';
    }
  }

  if (selected.length === 0 && contentType === 'CALENDAR') {
    const ocrText = extractOcrTextFromCombined(combinedText);
    const ocrItems = parseCalendarOcrText(ocrText, postedLocalDate, userName);
    if (ocrItems.length > 0) {
      logger.info('Stage 3 fallback used OCR text parser', {
        extractedCount: ocrItems.length,
      });
      selected = ocrItems;
      usedParser = 'calendar_ocr';
    }
  }

  if (typeof config.stage3FallbackHandler === 'function') {
    config.stage3FallbackHandler({
      contentType,
      responseText: response,
      parsedItemCount: parsedItems.length,
      normalizedItemCount: normalized.length,
      selectedItemCount: selected.length,
      usedParser,
      notes,
    });
  }

  logger.info('Stage 3 fallback extraction completed', {
    contentType,
    extractedCount: selected.length,
    usedParser,
  });

  return selected;
}

function parseFallbackItems(response: string): Array<Record<string, unknown>> {
  const parsed = parseJSONResponse(response);
  if (parsed) {
    if (Array.isArray((parsed as any).items)) return (parsed as any).items;
    if (Array.isArray((parsed as any).extractedItems)) return (parsed as any).extractedItems;
    if (Array.isArray((parsed as any).extractedEvents)) return (parsed as any).extractedEvents;
    if (Array.isArray((parsed as any).extractedSpecials)) return (parsed as any).extractedSpecials;
  }

  const fallback = parseJSONFallback(response, 'fallback');
  if (Array.isArray(fallback)) return fallback as Array<Record<string, unknown>>;
  return [];
}

function normalizeFallbackItems(
  items: Array<Record<string, unknown>>,
  postedLocalDate: string
): ExtractedItem[] {
  const normalized: ExtractedItem[] = [];

  for (const raw of items || []) {
    const item: any = raw || {};
    const typeRaw = String(item.type || item.itemType || item.kind || item.category || '').toLowerCase();
    const isSpecial =
      typeRaw.includes('special') ||
      String(item.isFoodSpecial || '').toLowerCase() === 'yes' ||
      String(item.isSpecial || '').toLowerCase() === 'yes';

    const name = String(item.name || item.eventName || item.title || '').trim();
    const description = String(item.description || item.details || '').trim();
    if (!name && !description) continue;

    const date = String(item.date || item.startDate || postedLocalDate || '').trim();
    const startTime = String(item.startTime || '').trim();
    const endTime = String(item.endTime || '').trim();
    const venue = String(item.venue || item.location || '').trim();
    const recurringPattern = sanitizeRecurringPattern(
      String(item.recurringPattern || item.recurring || item.repeat || 'none')
    );

    const timeFlags =
      item.timeFlags ||
      ({
        start: { source: 'none', evidence: '' },
        end: { source: 'none', toClose: false, evidence: '' },
      } as any);

    if (isSpecial) {
      normalized.push({
        name,
        description,
        date,
        startTime,
        endTime,
        venue,
        pricing: String(item.pricing || item.price || ''),
        price: String(item.price || ''),
        discount: String(item.discount || ''),
        additionalLocation: String(item.additionalLocation || ''),
        recurringPattern,
        extractionReason: String(item.extractionReason || 'fallback_extraction'),
        timeFlags,
        _sourceType: 'special' as const,
      });
    } else {
      normalized.push({
        name,
        description,
        date,
        startTime,
        endTime,
        venue,
        price: String(item.price || ''),
        recurringPattern,
        extractionReason: String(item.extractionReason || 'fallback_extraction'),
        timeFlags,
        _sourceType: 'event' as const,
      });
    }
  }

  return normalized;
}

function normalizeSplitCandidateText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[\u2012-\u2015]/g, '-')
    .replace(/[^a-z0-9&+\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SPLIT_MONTH_TOKEN_TO_NUMBER: Record<string, number> = {
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

const SPLIT_WEEKDAY_PATTERNS: RecurringPattern[] = [
  'weekly_sunday',
  'weekly_monday',
  'weekly_tuesday',
  'weekly_wednesday',
  'weekly_thursday',
  'weekly_friday',
  'weekly_saturday',
];

function normalizeSplitMonthToken(token: string): string {
  return String(token || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

function toIsoDateFromSplitParts(year: number, month: number, day: number): string | null {
  const date = DateTime.fromObject({ year, month, day }, { zone: 'UTC' });
  return date.isValid ? date.toFormat('yyyy-MM-dd') : null;
}

function consumeSplitMonthDayList(
  text: string,
  startIndex: number
): { days: number[]; nextIndex: number } {
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

function extractExplicitOccurrenceDateListForSplit(
  text: string,
  startDate: string | undefined
): string[] {
  const normalized = String(text || '')
    .replace(/[\u2012-\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return [];

  const monthRegex =
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/gi;
  const monthMatches = Array.from(normalized.matchAll(monthRegex));
  if (monthMatches.length === 0) return [];

  let resolvedYear = DateTime.fromISO(String(startDate || '')).isValid
    ? DateTime.fromISO(String(startDate || '')).year
    : new Date().getUTCFullYear();
  let previousMonth: number | null = null;
  const occurrenceDates: string[] = [];

  for (const match of monthMatches) {
    const month = SPLIT_MONTH_TOKEN_TO_NUMBER[normalizeSplitMonthToken(match[1])];
    if (!month) continue;

    if (previousMonth !== null && month < previousMonth) {
      resolvedYear += 1;
    }
    previousMonth = month;

    const { days, nextIndex } = consumeSplitMonthDayList(
      normalized,
      (match.index || 0) + match[0].length
    );
    if (days.length === 0) continue;

    const yearWindow = normalized.slice(match.index || 0, Math.min(normalized.length, nextIndex + 12));
    const explicitYearMatch = yearWindow.match(/\b(20\d{2})\b/);
    const blockYear = explicitYearMatch ? Number(explicitYearMatch[1]) : resolvedYear;
    resolvedYear = blockYear;

    for (const day of days) {
      const occurrenceDate = toIsoDateFromSplitParts(blockYear, month, day);
      if (occurrenceDate) occurrenceDates.push(occurrenceDate);
    }
  }

  return Array.from(new Set(occurrenceDates)).sort();
}

function splitRecurringPatternForDate(dateValue: string): RecurringPattern {
  const date = new Date(`${String(dateValue || '').trim()}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return 'none';
  return SPLIT_WEEKDAY_PATTERNS[date.getUTCDay()] || 'none';
}

function splitFiniteMultiWeekdaySeriesItems(items: ExtractedItem[]): ExtractedItem[] {
  const expanded: ExtractedItem[] = [];

  for (const item of items) {
    const descriptionText = String((item as any).description || '').trim();
    const extractionReasonText = String((item as any).extractionReason || '').trim();
    const sourceText = hasExplicitMonthDaySignal(descriptionText)
      ? descriptionText
      : hasExplicitMonthDaySignal(extractionReasonText)
        ? extractionReasonText
        : `${descriptionText} ${extractionReasonText}`.trim();
    const occurrenceDates = extractExplicitOccurrenceDateListForSplit(
      sourceText,
      String((item as any).date || '')
    );
    if (occurrenceDates.length < 2) {
      expanded.push(item);
      continue;
    }

    const groups = new Map<RecurringPattern, string[]>();
    for (const occurrenceDate of occurrenceDates) {
      const pattern = splitRecurringPatternForDate(occurrenceDate);
      if (pattern === 'none') continue;
      if (!groups.has(pattern)) groups.set(pattern, []);
      groups.get(pattern)?.push(occurrenceDate);
    }

    if (groups.size < 2) {
      expanded.push(item);
      continue;
    }

    for (const [pattern, dates] of groups.entries()) {
      const sortedDates = [...dates].sort();
      const firstDate = sortedDates[0];
      const clone = {
        ...(item as any),
        date: firstDate,
        recurringPattern: sortedDates.length > 1 ? pattern : 'none',
      } as ExtractedItem;
      expanded.push(clone);
    }
  }

  return expanded;
}

function extractUmbrellaThemeCandidateLines(combinedText: string): string[] {
  const preOcrText = String(combinedText || '').split(/OCR TEXT:/i)[0] || '';
  const lines = preOcrText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const candidates: string[] = [];
  for (const line of lines) {
    const normalized = normalizeSplitCandidateText(line);
    if (!normalized) continue;
    if (normalized.length < 8 || normalized.length > 80) continue;
    if (
      /^(join us|great food|great vibes|gather your crew|make it a night to remember|reserve your table|for reservations|menus and more|19\b|fridays\b|saturdays\b|fridays & saturdays\b|every weekend\b|theme nights at\b)/.test(
        normalized
      )
    ) {
      continue;
    }
    if (
      /\b\d{1,2}:\d{2}\b|\b\d{1,2}\s*(am|pm)\b|\$\s*\d|\b902[-\s]\d{3}[-\s]\d{4}\b/.test(
        normalized
      )
    ) {
      continue;
    }
    if (!/[a-z]{3,}\s+[a-z]{3,}/.test(normalized)) continue;
    if (
      !/\b(bbq|feast|buffet|brunch|burger|pizza|taco|prime|roast|lobster|pasta|music|matinee|showcase|session|series|class|workshop|night|nights|flair)\b/.test(
        normalized
      )
    ) {
      continue;
    }
    candidates.push(line);
  }

  return Array.from(new Set(candidates)).slice(0, 6);
}

function itemAlreadyReferencesSpecificTheme(
  item: ExtractedItem,
  candidateLines: string[]
): boolean {
  const itemText = normalizeSplitCandidateText(
    `${String((item as any).name || '')} ${String((item as any).description || '')}`
  );
  if (!itemText) return false;

  return candidateLines.some((line) => {
    const normalizedLine = normalizeSplitCandidateText(line);
    if (!normalizedLine) return false;
    const strongTokens = normalizedLine
      .split(' ')
      .filter(
        (token) =>
          token.length >= 4 && !['with', 'from', 'theme', 'nights', 'night'].includes(token)
      );
    if (strongTokens.length === 0) return false;
    return strongTokens.some((token) => itemText.includes(token));
  });
}

function getSpecificThemeMatchKey(
  item: ExtractedItem,
  candidateLines: string[]
): string | null {
  const itemText = normalizeSplitCandidateText(
    `${String((item as any).name || '')} ${String((item as any).description || '')}`
  );
  if (!itemText) return null;

  for (const line of candidateLines) {
    const normalizedLine = normalizeSplitCandidateText(line);
    if (!normalizedLine) continue;
    const strongTokens = normalizedLine
      .split(' ')
      .filter(
        (token) =>
          token.length >= 4 && !['with', 'from', 'theme', 'nights', 'night'].includes(token)
      );
    if (strongTokens.length === 0) continue;
    if (strongTokens.some((token) => itemText.includes(token))) {
      return normalizedLine;
    }
  }

  return null;
}

function hasExplicitMonthDaySignal(text: string): boolean {
  const normalized = String(text || '')
    .replace(/[\u2012-\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return false;
  return (
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i.test(
      normalized
    ) && /\b\d{1,2}(?:st|nd|rd|th)?\b/.test(normalized)
  );
}

function isPostedDateFallback(
  item: ExtractedItem,
  timestamp: string,
  timezone: string
): boolean {
  const itemDate = String((item as any).date || '').trim();
  if (!itemDate) return false;
  const postedLocalDate = DateTime.fromISO(String(timestamp || ''), { zone: timezone });
  if (!postedLocalDate.isValid) return false;
  return itemDate === postedLocalDate.toFormat('yyyy-MM-dd');
}

function shouldSuppressAmbiguousThemeFallback(
  item: ExtractedItem,
  combinedText: string,
  candidateLines: string[],
  timestamp: string,
  timezone: string
): boolean {
  if (!itemAlreadyReferencesSpecificTheme(item, candidateLines)) return false;

  const itemText = `${String((item as any).name || '')} ${String((item as any).description || '')} ${String((item as any).extractionReason || '')}`;
  if (hasExplicitMonthDaySignal(itemText)) return false;
  if (!hasExplicitMonthDaySignal(combinedText)) return false;
  if (!isPostedDateFallback(item, timestamp, timezone)) return false;

  return true;
}

function looksLikeUmbrellaSeriesCandidate(item: ExtractedItem, combinedText: string): boolean {
  const itemText = normalizeSplitCandidateText(
    `${String((item as any).name || '')} ${String((item as any).description || '')}`
  );
  if (!itemText) return false;
  if (!/\b(theme nights?|series|sessions?|showcase|program)\b/.test(itemText)) return false;

  const normalizedText = normalizeSplitCandidateText(
    `${String((item as any).name || '')} ${String((item as any).description || '')} ${combinedText}`
  );
  if (
    !/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|march|april|friday|saturday)\b/.test(
      normalizedText
    )
  ) {
    return false;
  }
  return extractUmbrellaThemeCandidateLines(combinedText).length >= 2;
}

function buildUmbrellaSeriesSplitPrompt(
  currentItem: ExtractedItem,
  combinedText: string,
  userName: string,
  timestamp: string,
  candidateLines: string[]
): string {
  const itemType =
    (currentItem as any)?._sourceType === 'special' || 'pricing' in (currentItem as any)
      ? 'special'
      : 'event';

  return `You are refining one parsed ${itemType} that may have incorrectly merged multiple named sub-series from a single poster.

POST CONTEXT:
- Posted by: ${userName}
- Posted at: ${timestamp}
- Candidate named sub-series from caption text: ${candidateLines.join(' | ') || 'none'}
- Full post text and OCR: "${combinedText}"

CURRENT MERGED ITEM:
${JSON.stringify(currentItem, null, 2)}

TASK:
- Only split the current item if the post clearly contains multiple named sub-series/themes under the umbrella heading.
- Preserve shared venue, price, and time window.
- Output one item per named sub-series/theme only. Do not split by weekday family here.
- Preserve the explicit date list text for that named sub-series inside the description so downstream logic can normalize it.
- Use the first explicit occurrence date for the date field.
- Do not invent dates that are not visible in the post or image text.
- Do not return a generic umbrella item if you can confidently split it into named sub-series.
- If a confident split is not possible, return an empty items array.

Return ONLY valid JSON in this exact shape:
{
  "items": [
    {
      "name": "string",
      "description": "string",
      "date": "YYYY-MM-DD",
      "startTime": "HH:mm" or "",
      "endTime": "HH:mm" or "",
      "venue": "string",
      "price": "string",
      "pricing": "string",
      "recurringPattern": "none" | "daily" | "weekly_monday" | "weekly_tuesday" | "weekly_wednesday" | "weekly_thursday" | "weekly_friday" | "weekly_saturday" | "weekly_sunday",
      "extractionReason": "string",
      "timeFlags": {
        "start": { "source": "explicit" | "implied" | "semantic" | "none", "evidence": "string" },
        "end": { "source": "explicit" | "implied" | "semantic" | "none", "toClose": boolean, "evidence": "string" }
      }
    }
  ]
}`;
}

function normalizeUmbrellaSeriesSplitItems(
  rawItems: Array<Record<string, unknown>>,
  originalItem: ExtractedItem
): ExtractedItem[] {
  const isSpecial =
    (originalItem as any)?._sourceType === 'special' ||
    'pricing' in (originalItem as any) ||
    'additionalLocation' in (originalItem as any);

  const originalDate = String((originalItem as any).date || '').trim();
  const originalStartTime = String((originalItem as any).startTime || '').trim();
  const originalEndTime = String((originalItem as any).endTime || '').trim();
  const originalVenue = String((originalItem as any).venue || '').trim();
  const originalPrice = String((originalItem as any).price || '').trim();
  const originalPricing = String((originalItem as any).pricing || originalPrice).trim();
  const originalTimeFlags = (originalItem as any).timeFlags || {
    start: { source: 'none', evidence: '' },
    end: { source: 'none', toClose: false, evidence: '' },
  };

  const normalized = rawItems
    .map((entry) => {
      const name = String(entry?.name || '').trim();
      const description = String(entry?.description || '').trim();
      if (!name || !description) return null;

      const recurringPattern = sanitizeRecurringPattern(
        String(entry?.recurringPattern || 'none')
      );
      const base = {
        name,
        description,
        date: String(entry?.date || originalDate).trim(),
        startTime: String(entry?.startTime || originalStartTime).trim(),
        endTime: String(entry?.endTime || originalEndTime).trim(),
        venue: String(entry?.venue || originalVenue).trim(),
        recurringPattern,
        extractionReason: String(entry?.extractionReason || 'umbrella_series_refinement').trim(),
        timeFlags: entry?.timeFlags || originalTimeFlags,
        _sourceType: (originalItem as any)?._sourceType || (isSpecial ? 'special' : 'event'),
      } as any;

      if (isSpecial) {
        base.pricing = String(entry?.pricing || entry?.price || originalPricing).trim();
        base.price = String(entry?.price || entry?.pricing || originalPrice || originalPricing).trim();
        base.additionalLocation = String(
          entry?.additionalLocation || (originalItem as any)?.additionalLocation || ''
        ).trim();
      } else {
        base.price = String(entry?.price || originalPrice).trim();
      }

      return base as ExtractedItem;
    })
    .filter(Boolean) as ExtractedItem[];

  return normalized;
}

async function splitUmbrellaSeriesCandidate(
  item: ExtractedItem,
  combinedText: string,
  imageUrls: string[],
  userName: string,
  timestamp: string,
  config: ParsingConfig,
  candidateLines: string[]
): Promise<ExtractedItem[] | null> {
  const prompt = buildUmbrellaSeriesSplitPrompt(
    item,
    combinedText,
    userName,
    timestamp,
    candidateLines
  );

  try {
    const response = await callGPT(prompt, imageUrls, config, {
      stage: 'stage3',
      component: 'umbrellaSeriesSplit',
      modelEnvVar: 'STAGE3_MODEL_OVERRIDE',
      imageDetailEnvVar: 'STAGE3_IMAGE_DETAIL',
    });

    const parsed = parseJSONResponse(response);
    const rawItems = Array.isArray((parsed as any)?.items)
      ? ((parsed as any).items as Array<Record<string, unknown>>)
      : [];
    if (rawItems.length < 2) return null;

    const normalized = splitFiniteMultiWeekdaySeriesItems(
      normalizeUmbrellaSeriesSplitItems(rawItems, item)
    );
    if (normalized.length < 2) return null;

    const originalName = normalizeSplitCandidateText(String((item as any).name || ''));
    const distinctSpecificCount = normalized.filter((entry) => {
      const normalizedName = normalizeSplitCandidateText(String((entry as any).name || ''));
      return normalizedName && normalizedName !== originalName;
    }).length;
    if (distinctSpecificCount === 0) return null;

    return normalized;
  } catch (error) {
    logger.warn('Umbrella series refinement failed', {
      name: (item as any)?.name || '',
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function expandUmbrellaSeriesItems(
  rawData: ExtractedItem[],
  combinedText: string,
  imageUrls: string[],
  userName: string,
  timestamp: string,
  config: ParsingConfig
): Promise<ExtractedItem[]> {
  if (!Array.isArray(rawData) || rawData.length === 0) return rawData;
  if (rawData.length > 3) return rawData;

  const candidateLines = extractUmbrellaThemeCandidateLines(combinedText);
  if (candidateLines.length < 2) return rawData;

  const expanded: ExtractedItem[] = [];
  let changed = false;
  const suppressedUmbrellaNames = new Set<string>();
  const timezone = config.timezone || DEFAULT_PARSING_CONFIG.timezone;
  const suppressedThemeKeys = new Set<string>();

  if (hasExplicitMonthDaySignal(combinedText)) {
    const themeFamilySignals = new Map<
      string,
      { hasEvent: boolean; hasFallbackSpecial: boolean; count: number; allItemsMissingExplicitText: boolean }
    >();

    for (const item of rawData) {
      const themeKey = getSpecificThemeMatchKey(item, candidateLines);
      if (!themeKey) continue;
      const sourceType =
        (item as any)?._sourceType === 'special' || 'pricing' in (item as any) ? 'special' : 'event';
      if (!themeFamilySignals.has(themeKey)) {
        themeFamilySignals.set(themeKey, {
          hasEvent: false,
          hasFallbackSpecial: false,
          count: 0,
          allItemsMissingExplicitText: true,
        });
      }
      const signal = themeFamilySignals.get(themeKey)!;
      signal.count += 1;
      if (sourceType === 'event') {
        signal.hasEvent = true;
      } else if (
        isPostedDateFallback(item, timestamp, timezone) &&
        !hasExplicitMonthDaySignal(
          `${String((item as any).name || '')} ${String((item as any).description || '')}`
        )
      ) {
        signal.hasFallbackSpecial = true;
      }
      if (
        hasExplicitMonthDaySignal(
          `${String((item as any).name || '')} ${String((item as any).description || '')} ${String((item as any).extractionReason || '')}`
        )
      ) {
        signal.allItemsMissingExplicitText = false;
      }
    }

    for (const [themeKey, signal] of themeFamilySignals.entries()) {
      // Keep OCR-only theme families alive when they are not actually conflicting.
      // The explicit dates may live in shared OCR text rather than the extracted item's
      // own description, especially once upstream media URLs expire.
      if (signal.hasEvent && signal.hasFallbackSpecial) {
        suppressedThemeKeys.add(themeKey);
      }
    }
  }

  for (const item of rawData) {
    const normalizedName = normalizeSplitCandidateText(String((item as any).name || ''));
    const alreadySpecific = itemAlreadyReferencesSpecificTheme(item, candidateLines);
    const themeKey = alreadySpecific ? getSpecificThemeMatchKey(item, candidateLines) : null;

    if (themeKey && suppressedThemeKeys.has(themeKey)) {
      logger.info('Suppressing conflicting mixed-content theme family', {
        name: (item as any)?.name || '',
        themeKey,
      });
      changed = true;
      continue;
    }

    const shouldPreserveThemeFallbackForPosterDates =
      candidateLines.length >= 2 &&
      hasExplicitMonthDaySignal(combinedText) &&
      itemAlreadyReferencesSpecificTheme(item, candidateLines);

    if (
      !shouldPreserveThemeFallbackForPosterDates &&
      shouldSuppressAmbiguousThemeFallback(
        item,
        combinedText,
        candidateLines,
        timestamp,
        timezone
      )
    ) {
      logger.info('Suppressing ambiguous theme fallback item', {
        name: (item as any)?.name || '',
        date: (item as any)?.date || '',
      });
      changed = true;
      continue;
    }

    if (
      !looksLikeUmbrellaSeriesCandidate(item, combinedText) ||
      alreadySpecific
    ) {
      expanded.push(item);
      continue;
    }

    const splitItems = await splitUmbrellaSeriesCandidate(
      item,
      combinedText,
      imageUrls,
      userName,
      timestamp,
      config,
      candidateLines
    );

    if (Array.isArray(splitItems) && splitItems.length > 1) {
      logger.info('Expanded umbrella series item into named sub-series', {
        originalName: (item as any)?.name || '',
        splitCount: splitItems.length,
      });
      if (normalizedName) suppressedUmbrellaNames.add(normalizedName);
      expanded.push(...splitItems);
      changed = true;
      continue;
    }

    expanded.push(item);
  }

  if (!changed) return rawData;

  return expanded.filter((item) => {
    const normalizedName = normalizeSplitCandidateText(String((item as any).name || ''));
    if (!normalizedName || !suppressedUmbrellaNames.has(normalizedName)) return true;
    return itemAlreadyReferencesSpecificTheme(item, candidateLines);
  });
}

function createUmbrellaThemeDateMapPrompt(
  combinedText: string,
  candidateLines: string[],
  umbrellaName: string,
  timestamp: string,
  timezone: string
): string {
  const posted = DateTime.fromISO(String(timestamp || ''), { zone: timezone });
  const currentYear = posted.isValid ? posted.year : new Date().getUTCFullYear();
  const normalizedUmbrella = umbrellaName || 'the umbrella series shown in the post';
  return `Read this poster and extract exact visible date lists for each named sub-series/theme.

POST CONTEXT:
- Current year: ${currentYear}
- Umbrella series: ${normalizedUmbrella}
- Candidate named themes: ${candidateLines.join(' | ') || 'none'}
- Combined post text and OCR: "${combinedText}"

RULES:
- Use the image text as the source of truth when available.
- Only return dates that are explicitly visible on the poster.
- Convert the visible dates into exact ISO dates using year ${currentYear}.
- Keep each theme separate.
- Do not invent or broaden dates.
- If a theme has no explicit visible dates, omit it.

Return ONLY valid JSON in this exact shape:
{
  "themes": [
    {
      "theme": "string",
      "dates": ["YYYY-MM-DD"],
      "dateListText": "string"
    }
  ],
  "notes": ""
}`;
}

type ThemeDateMapEntry = {
  theme: string;
  dates: string[];
  dateListText: string;
};

async function extractUmbrellaThemeDateMap(
  combinedText: string,
  imageUrls: string[],
  candidateLines: string[],
  umbrellaName: string,
  timestamp: string,
  config: ParsingConfig
): Promise<ThemeDateMapEntry[]> {
  if (candidateLines.length < 2) return [];

  const prompt = createUmbrellaThemeDateMapPrompt(
    combinedText,
    candidateLines,
    umbrellaName,
    timestamp,
    config.timezone || DEFAULT_PARSING_CONFIG.timezone
  );

  try {
    const response = await callGPT(prompt, imageUrls, config, {
      stage: 'stage3',
      component: 'umbrellaThemeDateMap',
      modelEnvVar: 'STAGE3_MODEL_OVERRIDE',
      imageDetailEnvVar: 'STAGE3_IMAGE_DETAIL',
    });
    const parsed = parseJSONResponse(response);
    const themes = Array.isArray((parsed as any)?.themes) ? (parsed as any).themes : [];
    const normalized = themes
      .map((entry: any) => {
        const theme = String(entry?.theme || '').trim();
        const dates = Array.isArray(entry?.dates)
          ? entry.dates
              .map((value: unknown) => String(value || '').trim())
              .filter((value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value))
          : [];
        const dateListText = String(entry?.dateListText || '').trim();
        if (!theme || dates.length === 0 || !dateListText) return null;
        return {
          theme,
          dates: Array.from(new Set(dates)).sort(),
          dateListText,
        } as ThemeDateMapEntry;
      })
      .filter(Boolean) as ThemeDateMapEntry[];

    return normalized;
  } catch (error) {
    logger.warn('Umbrella theme date map extraction failed', {
      umbrellaName,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

function extractUmbrellaDisplayName(combinedText: string, rawData: ExtractedItem[]): string {
  const preOcrText = String(combinedText || '').split(/OCR TEXT:/i)[0] || '';
  const directMatch = preOcrText.match(/\b(theme nights? at [^\n.,]+)/i);
  if (directMatch?.[1]) {
    return directMatch[1]
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\bevery weekend.*$/i, '')
      .trim();
  }

  const candidate = rawData.find((item) =>
    /\b(theme nights?|series|showcase|program)\b/i.test(String((item as any).name || ''))
  );
  return String((candidate as any)?.name || '').trim();
}

function normalizeThemeLabelForDisplay(theme: string): string {
  return String(theme || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[–—-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function getThemeStrongTokens(value: string): string[] {
  return normalizeSplitCandidateText(value)
    .split(' ')
    .filter(
      (token) =>
        token.length >= 4 &&
        !['with', 'from', 'theme', 'themes', 'night', 'nights', 'park'].includes(token)
    );
}

function findBestThemeSourceItem(
  themeEntry: ThemeDateMapEntry,
  rawData: ExtractedItem[],
  candidateLines: string[]
): ExtractedItem | null {
  const themeTokens = getThemeStrongTokens(themeEntry.theme);
  let bestScore = -1;
  let bestItem: ExtractedItem | null = null;

  for (const item of rawData) {
    const itemText = `${String((item as any).name || '')} ${String((item as any).description || '')}`;
    const itemTokens = getThemeStrongTokens(itemText);
    const shared = themeTokens.filter((token) => itemTokens.includes(token)).length;
    const themeKey = getSpecificThemeMatchKey(item, candidateLines);
    const isSpecial =
      (item as any)?._sourceType === 'special' || 'pricing' in (item as any) || 'additionalLocation' in (item as any);
    const explicitDateBonus = hasExplicitMonthDaySignal(itemText) ? 2 : 0;
    const specialBonus = isSpecial ? 1 : 0;
    const themeKeyBonus = themeKey ? 1 : 0;
    const score = shared * 10 + explicitDateBonus + specialBonus + themeKeyBonus;
    if (score > bestScore) {
      bestScore = score;
      bestItem = item;
    }
  }

  return bestScore > 0 ? bestItem : null;
}

function isLikelyFoodThemeName(theme: string): boolean {
  return /\b(bbq|feast|buffet|burger|pizza|taco|tacos|brunch|dinner|lunch|steak|fish|seafood|pasta|prime|roast|lobster|flair)\b/i.test(
    String(theme || '')
  );
}

function buildCanonicalThemeItem(
  sourceItem: ExtractedItem,
  themeEntry: ThemeDateMapEntry,
  umbrellaName: string
): ExtractedItem {
  const displayTheme = normalizeThemeLabelForDisplay(themeEntry.theme);
  const displayUmbrella = String(umbrellaName || '').trim();
  const sourceDescription = String((sourceItem as any).description || '').trim();
  const sourceVenue = String((sourceItem as any).venue || '').trim();
  const sourceAdditionalLocation = String((sourceItem as any).additionalLocation || '').trim();
  const isSpecial =
    (sourceItem as any)?._sourceType === 'special' ||
    'pricing' in (sourceItem as any) ||
    'additionalLocation' in (sourceItem as any) ||
    isLikelyFoodThemeName(displayTheme);
  const normalizedName = displayUmbrella
    ? `${displayUmbrella} - ${displayTheme.replace(/[()]/g, '').replace(/\s+/g, ' ').trim()}`
    : displayTheme;
  const descriptionWithDates = hasExplicitMonthDaySignal(sourceDescription)
    ? sourceDescription
    : `${sourceDescription || `${displayTheme}${displayUmbrella ? ` (${displayUmbrella})` : ''}`}. Dates shown: ${themeEntry.dateListText}.`;

  return {
    ...(sourceItem as any),
    name: normalizedName,
    description: descriptionWithDates.includes(themeEntry.dateListText)
      ? descriptionWithDates
      : `${descriptionWithDates.replace(/\s+$/, '')} Dates shown: ${themeEntry.dateListText}.`,
    date: themeEntry.dates[0],
    recurringPattern: themeEntry.dates.length > 1 ? 'weekly_custom' : 'none',
    venue: sourceVenue || sourceAdditionalLocation || String((sourceItem as any).establishment || '').trim(),
    additionalLocation: sourceAdditionalLocation || sourceVenue || undefined,
    extractionReason: 'poster_theme_dates',
    _sourceType: isSpecial ? 'special' : ((sourceItem as any)?._sourceType || 'event'),
    price: String((sourceItem as any).price || (sourceItem as any).pricing?.price || '').trim(),
    pricing:
      String((sourceItem as any).pricing || (sourceItem as any).pricing?.price || (sourceItem as any).price || '').trim() ||
      undefined,
  } as ExtractedItem;
}

function buildSeriesItemsFromThemeDates(
  baseItem: ExtractedItem,
  occurrenceDates: string[]
): ExtractedItem[] {
  const groups = new Map<RecurringPattern, string[]>();
  for (const occurrenceDate of Array.from(new Set(occurrenceDates)).sort()) {
    const pattern = splitRecurringPatternForDate(occurrenceDate);
    if (pattern === 'none') continue;
    if (!groups.has(pattern)) groups.set(pattern, []);
    groups.get(pattern)?.push(occurrenceDate);
  }

  const expanded: ExtractedItem[] = [];
  for (const [pattern, dates] of groups.entries()) {
    const sortedDates = [...dates].sort();
    expanded.push({
      ...(baseItem as any),
      date: sortedDates[0],
      recurringPattern: sortedDates.length > 1 ? pattern : 'none',
    } as ExtractedItem);
  }

  return expanded.length > 0 ? expanded : [{ ...(baseItem as any), recurringPattern: 'none' }];
}

function buildThemeDateReplacementItems(
  rawData: ExtractedItem[],
  themeEntries: ThemeDateMapEntry[],
  candidateLines: string[],
  umbrellaName: string
): ExtractedItem[] | null {
  if (themeEntries.length === 0) return null;

  const replacements: ExtractedItem[] = [];
  for (const themeEntry of themeEntries) {
    const sourceItem = findBestThemeSourceItem(themeEntry, rawData, candidateLines);
    if (!sourceItem) continue;
    const canonical = buildCanonicalThemeItem(sourceItem, themeEntry, umbrellaName);
    const split = buildSeriesItemsFromThemeDates(canonical, themeEntry.dates);
    replacements.push(...split);
  }

  if (replacements.length === 0) return null;

  const normalizedUmbrella = normalizeSplitCandidateText(umbrellaName);
  const themeTokenSets = themeEntries.map((entry) => getThemeStrongTokens(entry.theme));

  const preserved = rawData.filter((item) => {
    const itemText = normalizeSplitCandidateText(
      `${String((item as any).name || '')} ${String((item as any).description || '')}`
    );
    if (!itemText) return false;
    if (itemAlreadyReferencesSpecificTheme(item, candidateLines)) return false;
    if (
      normalizedUmbrella &&
      (itemText.includes(normalizedUmbrella) ||
        normalizedUmbrella.split(' ').some((token) => token.length >= 5 && itemText.includes(token)))
    ) {
      return false;
    }
    if (
      themeTokenSets.some((tokens) => tokens.length > 0 && tokens.some((token) => itemText.includes(token)))
    ) {
      return false;
    }
    return true;
  });

  const deduped = new Map<string, ExtractedItem>();
  for (const item of [...preserved, ...replacements]) {
    const key = [
      normalizeSplitCandidateText(String((item as any).name || '')),
      String((item as any).date || '').trim(),
      String((item as any).startTime || '').trim(),
      String((item as any).endTime || '').trim(),
      String((item as any).recurringPattern || '').trim(),
    ].join('|');
    if (!deduped.has(key)) deduped.set(key, item);
  }

  return Array.from(deduped.values());
}

async function refineUmbrellaThemeSeriesWithPosterDates(
  rawData: ExtractedItem[],
  combinedText: string,
  imageUrls: string[],
  userName: string,
  timestamp: string,
  config: ParsingConfig
): Promise<ExtractedItem[]> {
  if (!Array.isArray(rawData) || rawData.length === 0) return rawData;

  const candidateLines = extractUmbrellaThemeCandidateLines(combinedText);
  if (candidateLines.length < 2 || !hasExplicitMonthDaySignal(combinedText)) {
    return rawData;
  }

  const umbrellaName = extractUmbrellaDisplayName(combinedText, rawData);
  const themeDateMap = await extractUmbrellaThemeDateMap(
    combinedText,
    imageUrls,
    candidateLines,
    umbrellaName,
    timestamp,
    config
  );
  if (themeDateMap.length === 0) return rawData;

  const replaced = buildThemeDateReplacementItems(
    rawData,
    themeDateMap,
    candidateLines,
    umbrellaName
  );
  if (!replaced || replaced.length === 0) return rawData;

  logger.info('Refined umbrella theme series from poster date map', {
    umbrellaName,
    originalCount: rawData.length,
    replacedCount: replaced.length,
    themeCount: themeDateMap.length,
  });
  return replaced;
}

function extractOcrTextFromCombined(text: string): string {
  const marker = 'OCR TEXT:';
  const idx = String(text || '').lastIndexOf(marker);
  if (idx === -1) return '';
  return String(text || '').slice(idx + marker.length).trim();
}

function extractOcrTextFromResponse(raw: string): string {
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.images)) {
      const texts = parsed.images
        .map((img: any) => (img && img.text ? String(img.text) : ''))
        .filter(Boolean);
      if (texts.length > 0) return texts.join('\n');
    }
  } catch {
    // Fall back to raw text when it is not JSON.
  }
  return String(raw || '').trim();
}

function countTimeTokens(text: string): number {
  if (!text) return 0;
  const matches = text.match(/\b\d{1,2}(:\d{2})?\s*(am|pm)\b/gi);
  return matches ? matches.length : 0;
}

function stripOcrTextFromCombined(text: string): string {
  const marker = 'OCR TEXT:';
  const idx = String(text || '').lastIndexOf(marker);
  if (idx === -1) return String(text || '').trim();
  return String(text || '').slice(0, idx).trim();
}

function parseScheduleText(
  combinedText: string,
  postedLocalDate: string,
  userName: string,
  sourceType: 'calendar' | 'schedule'
): CalendarItem[] {
  const baseText = stripOcrTextFromCombined(combinedText);
  if (!baseText) return [];

  const lines = baseText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const events: CalendarItem[] = [];
  let currentDate = '';
  const postedDate = DateTime.fromISO(postedLocalDate);

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (!line) continue;

    const headerDate = parseDateHeader(line, postedLocalDate);
    if (headerDate) {
      currentDate = headerDate;
      if (!hasTimeToken(line)) {
        continue;
      }
    }

    const weekdayHeader = parseWeekdayHeader(line, postedDate);
    if (weekdayHeader) {
      currentDate = weekdayHeader;
      if (!hasTimeToken(line)) {
        continue;
      }
    }

    if (!hasTimeToken(line)) continue;

    const { ranges, singles } = extractLineTimesWithEvidence(line);
    if (ranges.length === 0 && singles.length === 0) continue;

    const date = currentDate || parseDateHeader(line, postedLocalDate) || postedLocalDate;
    const { name, venue, description } = extractScheduleNameVenue(line, userName);
    if (!name) continue;

    const source = sourceType;
    const items: CalendarItem[] = [];
    if (ranges.length > 0) {
      for (const range of ranges) {
        items.push({
          name,
          type: 'event',
          date,
          startTime: range.startTime,
          endTime: range.endTime,
          venue,
          price: '',
          description,
          extractionReason: 'schedule_text_fallback',
          timeFlags: {
            start: { source: 'explicit', evidence: range.evidence },
            end: { source: 'explicit', toClose: false, evidence: range.evidence },
          },
          _sourceType: source,
        });
      }
    } else {
      for (const time of singles) {
        items.push({
          name,
          type: 'event',
          date,
          startTime: time.time,
          endTime: '',
          venue,
          price: '',
          description,
          extractionReason: 'schedule_text_fallback',
          timeFlags: {
            start: { source: 'explicit', evidence: time.evidence },
            end: { source: 'none', toClose: false, evidence: '' },
          },
          _sourceType: source,
        });
      }
    }

    events.push(...items);
  }

  return events;
}

function looksLikeScheduleText(combinedText: string): boolean {
  const baseText = stripOcrTextFromCombined(combinedText);
  if (!baseText) return false;
  const lines = baseText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const timeLines = lines.filter((line) => hasTimeToken(line)).length;
  return timeLines >= 3;
}

function parseDateHeader(line: string, postedLocalDate: string): string | null {
  const lower = line.toLowerCase();
  if (/\b(until|through|thru|ongoing|ends)\b/i.test(lower) && !/\bevents?\b/i.test(lower)) {
    return null;
  }

  const monthMap: Record<string, number> = {
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

  const monthDayRe =
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?/i;
  const match = line.match(monthDayRe);
  if (match) {
    const monthKey = match[1].toLowerCase();
    const month = monthMap[monthKey];
    const day = Number(match[2]);
    const year = match[3] ? Number(match[3]) : DateTime.fromISO(postedLocalDate).year;
    if (month && day) {
      const dt = DateTime.fromObject({ year, month, day });
      if (dt.isValid) return dt.toFormat('yyyy-MM-dd');
    }
  }

  const numericRe = /\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](20\d{2}))?\b/;
  const numMatch = line.match(numericRe);
  if (numMatch) {
    const month = Number(numMatch[1]);
    const day = Number(numMatch[2]);
    const year = numMatch[3] ? Number(numMatch[3]) : DateTime.fromISO(postedLocalDate).year;
    const dt = DateTime.fromObject({ year, month, day });
    if (dt.isValid) return dt.toFormat('yyyy-MM-dd');
  }

  return null;
}

function parseWeekdayHeader(line: string, postedDate: DateTime): string | null {
  const monthDayRe =
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})\b/i;
  if (monthDayRe.test(line)) return null;

  const weekdayRe =
    /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/i;
  const match = line.match(weekdayRe);
  if (!match) return null;

  const dayMap: Record<string, number> = {
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

  const dayName = match[1].toLowerCase();
  const targetDay = dayMap[dayName];
  if (targetDay === undefined) return null;

  const postedDay = postedDate.weekday % 7;
  let daysToAdd = targetDay - postedDay;
  if (daysToAdd < 0) daysToAdd += 7;
  const dt = postedDate.plus({ days: daysToAdd });
  return dt.toFormat('yyyy-MM-dd');
}

function hasTimeToken(line: string): boolean {
  return /\b\d{1,2}(?::\d{2})?\s*(am|pm)\b/i.test(line);
}

function extractLineTimes(
  line: string
): { ranges: Array<{ startTime: string; endTime: string }>; singles: string[] } {
  const extracted = extractLineTimesWithEvidence(line);
  return {
    ranges: extracted.ranges.map(({ startTime, endTime }) => ({ startTime, endTime })),
    singles: extracted.singles.map(({ time }) => time),
  };
}

function extractLineTimesWithEvidence(
  line: string
): {
  ranges: Array<{ startTime: string; endTime: string; evidence: string }>;
  singles: Array<{ time: string; evidence: string }>;
} {
  const ranges: Array<{ startTime: string; endTime: string; evidence: string }> = [];
  let scrubbed = line;

  const rangeRe =
    /\b(\d{1,2}(?::\d{2})?)\s*(am|pm)\s*[-\u2013\u2014]\s*(\d{1,2}(?::\d{2})?)\s*(am|pm)\b/gi;
  const looseRangeRe =
    /\b(\d{1,2}(?::\d{2})?)\s*[-\u2013\u2014]\s*(\d{1,2}(?::\d{2})?)\s*(am|pm)\b/gi;

  scrubbed = scrubbed.replace(rangeRe, (match, start, startMer, end, endMer) => {
    const resolved = resolveTimeRangeTokens(start, startMer, end, endMer);
    if (resolved) {
      ranges.push({
        ...resolved,
        evidence: String(match || '').trim(),
      });
    }
    return ' ';
  });

  scrubbed = scrubbed.replace(looseRangeRe, (match, start, end, endMer) => {
    const resolved = resolveTimeRangeTokens(start, '', end, endMer);
    if (resolved) {
      ranges.push({
        ...resolved,
        evidence: String(match || '').trim(),
      });
    }
    return ' ';
  });

  const singleMatches = Array.from(
    scrubbed.matchAll(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{3,4}\s*(?:am|pm))\b/gi)
  );
  const singles = singleMatches
    .map((match) => {
      const evidence = String(match[1] || '').trim();
      const time = parseTimeToken(evidence);
      if (!time) return null;
      return { time, evidence };
    })
    .filter(Boolean) as Array<{ time: string; evidence: string }>;

  return { ranges, singles };
}

function extractScheduleNameVenue(
  line: string,
  defaultVenue: string
): { name: string; venue: string; description: string } {
  const timeRangeRe =
    /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*[-\u2013\u2014]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi;
  const timeTokenRe = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi;

  let cleaned = line
    .replace(timeRangeRe, ' ')
    .replace(timeTokenRe, ' ')
    .replace(/\bevents?\b/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  cleaned = cleaned.replace(/^[\s\-\u2013\u2014:]+/, '').replace(/[\s\-\u2013\u2014:]+$/, '').trim();

  if (!cleaned) {
    return { name: '', venue: '', description: '' };
  }

  const colonIndex = cleaned.indexOf(':');
  if (colonIndex !== -1) {
    const left = cleaned.slice(0, colonIndex).trim();
    const right = cleaned.slice(colonIndex + 1).trim();
    if (right) {
      return { name: right, venue: left || defaultVenue, description: cleaned };
    }
  }

  const atMatch = cleaned.match(/(.+?)\s+(?:@|at)\s+(.+)/i);
  if (atMatch) {
    return { name: atMatch[1].trim(), venue: atMatch[2].trim(), description: cleaned };
  }

  const dashSplit = cleaned.split(/\s+-\s+/);
  if (dashSplit.length === 2) {
    const left = dashSplit[0].trim();
    const right = dashSplit[1].trim();
    const leftVenue = looksLikeVenue(left);
    const rightVenue = looksLikeVenue(right);
    if (leftVenue && !rightVenue) {
      return { name: right, venue: left, description: cleaned };
    }
    if (rightVenue && !leftVenue) {
      return { name: left, venue: right, description: cleaned };
    }
  }

  return { name: cleaned, venue: defaultVenue || '', description: cleaned };
}

function looksLikeVenue(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(cinema|theatre|theater|hall|centre|center|mall|library|club|pub|cafe|restaurant|brewery|lounge|bar|arena|rink|resort|museum|gallery|park|school|college|university|church|market|hotel)\b/.test(
    t
  );
}

function parseCalendarOcrText(
  ocrText: string,
  postedLocalDate: string,
  userName: string
): CalendarItem[] {
  if (!ocrText) return [];

  const monthMap: Record<string, number> = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    sept: 9,
    october: 10,
    november: 11,
    december: 12,
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };

  const monthMatch = ocrText.match(
    /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\b/i
  );
  const yearMatch = ocrText.match(/\b(20\d{2})\b/);
  const fallbackDate = DateTime.fromISO(postedLocalDate);
  const month = monthMatch ? monthMap[monthMatch[1].toLowerCase()] : fallbackDate.month;
  const year = yearMatch ? Number(yearMatch[1]) : fallbackDate.year;

  const lines = ocrText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const standaloneDayLineRe = /^(?:[1-9]|[12]\d|3[01])$/;
  const explicitDateLineItems = parseExplicitDateLineCalendarOcrItems(
    lines,
    monthMap,
    fallbackDate,
    userName
  );
  const hasStandaloneDayLines = lines.some((line) => standaloneDayLineRe.test(line));
  if (explicitDateLineItems.length > 0 && !hasStandaloneDayLines) {
    return explicitDateLineItems;
  }

  const events: CalendarItem[] = [];
  let currentDay: number | null = null;
  let pendingNameParts: string[] = [];
  let lastEventName = '';

  const dayHeaderRe =
    /^(sun|mon|tue|wed|thu|fri|sat)(\s+(sun|mon|tue|wed|thu|fri|sat))*$/i;
  const explicitDateRe =
    /\b(?:sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)?\s*(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\.?\s+([1-9]|[12]\d|3[01])(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/i;

  for (const rawLine of lines) {
    const line = rawLine.replace(/[\u2013\u2014]/g, '-');
    if (/^notes$/i.test(line)) {
      break;
    }
    if (dayHeaderRe.test(line)) continue;
    if (/^(&|and)$/i.test(line)) continue;
    if (/^(am|pm)$/i.test(line)) continue;
    if (/^no\b/i.test(line)) continue;

    const dayMatch = line.match(standaloneDayLineRe);
    if (dayMatch) {
      currentDay = Number(dayMatch[0]);
      pendingNameParts = [];
      lastEventName = '';
      continue;
    }

    const explicitDateMatch = line.match(explicitDateRe);
    if (explicitDateMatch) {
      const explicitMonth = monthMap[String(explicitDateMatch[1] || '').toLowerCase()];
      const explicitDay = Number(explicitDateMatch[2]);
      const explicitYear = explicitDateMatch[3]
        ? Number(explicitDateMatch[3])
        : resolveCalendarOcrYear(fallbackDate, explicitMonth, explicitDay);
      const rangeMatch = line.match(
        /(\d{1,2}(?::\d{2})?|\d{3,4})\s*(am|pm)?\s*-\s*(\d{1,2}(?::\d{2})?|\d{3,4})\s*(am|pm)\b/i
      );
      const explicitDate = explicitMonth && Number.isFinite(explicitDay) && Number.isFinite(explicitYear)
        ? formatDateFromParts(explicitYear, explicitMonth, explicitDay)
        : '';
      const resolvedRange = rangeMatch
        ? resolveTimeRangeTokens(
            rangeMatch[1],
            rangeMatch[2] || '',
            rangeMatch[3],
            rangeMatch[4] || ''
          )
        : null;
      const lineWithoutDate = stripTimeTokens(line.replace(explicitDateMatch[0], ' '));
      const previousName = pendingNameParts.length > 0
        ? pendingNameParts[pendingNameParts.length - 1]
        : '';
      const name = cleanOcrEventName(lineWithoutDate || previousName || lastEventName || 'Event');

      if (explicitDate && name && (resolvedRange?.startTime || extractTimeTokens(line).length > 0)) {
        const timeTokens = resolvedRange?.startTime ? [] : extractTimeTokens(line);
        const startTimes = resolvedRange?.startTime ? [resolvedRange.startTime] : timeTokens;
        for (const startTime of startTimes) {
          events.push({
            name,
            type: 'event',
            date: explicitDate,
            startTime,
            endTime: resolvedRange?.endTime || '',
            venue: userName,
            description: '',
            extractionReason: 'calendar_ocr_explicit_date_line',
            _sourceType: 'calendar',
          });
        }
        currentDay = explicitDay;
        pendingNameParts = [];
        lastEventName = name;
        continue;
      }
    }

    if (!currentDay || !month || !year) {
      pendingNameParts.push(line);
      continue;
    }

    const rangeMatch = line.match(
      /(\d{1,2}(?::\d{2})?|\d{3,4})\s*(am|pm)?\s*-\s*(\d{1,2}(?::\d{2})?|\d{3,4})\s*(am|pm)\b/i
    );

    if (rangeMatch) {
      const resolvedRange = resolveTimeRangeTokens(
        rangeMatch[1],
        rangeMatch[2] || '',
        rangeMatch[3],
        rangeMatch[4] || ''
      );
      const startTime = resolvedRange?.startTime || '';
      const endTime = resolvedRange?.endTime || '';
      if (!startTime || !endTime) {
        continue;
      }
      const nameFromLine = stripTimeTokens(line);
      const name =
        pendingNameParts.length > 0
          ? [pendingNameParts.join(' ').trim(), nameFromLine].filter(Boolean).join(' ').trim()
          : nameFromLine || lastEventName || 'Event';
      pendingNameParts = [];
      lastEventName = name;
      events.push({
        name,
        type: 'event',
        date: formatDateFromParts(year, month, currentDay),
        startTime,
        endTime,
        venue: userName,
        description: '',
        extractionReason: 'calendar_ocr',
        _sourceType: 'calendar',
      });
      continue;
    }

    const timeMatches = extractTimeTokens(line);
    if (timeMatches.length > 0) {
      const nameFromLine = stripTimeTokens(line);
      const name =
        pendingNameParts.length > 0
          ? [pendingNameParts.join(' ').trim(), nameFromLine].filter(Boolean).join(' ').trim()
          : nameFromLine || lastEventName || 'Event';
      pendingNameParts = [];
      lastEventName = name;

      for (const startTime of timeMatches) {
        events.push({
          name,
          type: 'event',
          date: formatDateFromParts(year, month, currentDay),
          startTime,
          endTime: '',
          venue: userName,
          description: '',
          extractionReason: 'calendar_ocr',
          _sourceType: 'calendar',
        });
      }
      continue;
    }

    pendingNameParts.push(line);
  }

  return events;
}

function parseExplicitDateLineCalendarOcrItems(
  lines: string[],
  monthMap: Record<string, number>,
  fallbackDate: DateTime,
  userName: string
): CalendarItem[] {
  const explicitDateRe =
    /\b(?:sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)?\s*(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\.?\s+([1-9]|[12]\d|3[01])(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/i;
  const rangeRe =
    /(\d{1,2}(?::\d{2})?|\d{3,4})\s*(am|pm)?\s*-\s*(\d{1,2}(?::\d{2})?|\d{3,4})\s*(am|pm)\b/i;
  const items: CalendarItem[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].replace(/[\u2013\u2014]/g, '-');
    const explicitDateMatch = line.match(explicitDateRe);
    const rangeMatch = line.match(rangeRe);
    if (!explicitDateMatch || !rangeMatch) continue;

    const explicitMonth = monthMap[String(explicitDateMatch[1] || '').toLowerCase()];
    const explicitDay = Number(explicitDateMatch[2]);
    const explicitYear = explicitDateMatch[3]
      ? Number(explicitDateMatch[3])
      : resolveCalendarOcrYear(fallbackDate, explicitMonth, explicitDay);
    const explicitDate = explicitMonth && Number.isFinite(explicitDay) && Number.isFinite(explicitYear)
      ? formatDateFromParts(explicitYear, explicitMonth, explicitDay)
      : '';
    const resolvedRange = resolveTimeRangeTokens(
      rangeMatch[1],
      rangeMatch[2] || '',
      rangeMatch[3],
      rangeMatch[4] || ''
    );
    if (!explicitDate || !resolvedRange?.startTime) continue;

    const lineName = cleanOcrEventName(stripTimeTokens(line.replace(explicitDateMatch[0], ' ')));
    const previousName = findPreviousOcrName(lines, index);
    const name = lineName || previousName || 'Event';
    items.push({
      name,
      type: 'event',
      date: explicitDate,
      startTime: resolvedRange.startTime,
      endTime: resolvedRange.endTime,
      venue: userName,
      description: '',
      extractionReason: 'calendar_ocr_explicit_date_line',
      _sourceType: 'calendar',
    });
  }

  return items;
}

function findPreviousOcrName(lines: string[], beforeIndex: number): string {
  for (let index = beforeIndex - 1; index >= 0; index -= 1) {
    const candidate = cleanOcrEventName(lines[index]);
    if (!candidate) continue;
    if (/^(?:est\.?\s*)?\d{4}$/i.test(candidate)) continue;
    if (/^(?:restaurant|bar|restaurant bar|venue|event|events)$/i.test(candidate)) continue;
    return candidate;
  }
  return '';
}

export function parseCalendarOcrTextForRegression(
  ocrText: string,
  postedLocalDate: string,
  userName: string
): CalendarItem[] {
  return parseCalendarOcrText(ocrText, postedLocalDate, userName);
}

function resolveCalendarOcrYear(postedDate: DateTime, month: number, day: number): number {
  let year = postedDate.isValid ? postedDate.year : DateTime.now().year;
  if (!month || !day) return year;

  const candidate = DateTime.fromObject({ year, month, day });
  if (candidate.isValid && postedDate.isValid && candidate < postedDate.minus({ days: 30 })) {
    year += 1;
  }
  return year;
}

function cleanOcrEventName(value: string): string {
  return String(value || '')
    .replace(/[|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCalendarKey(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildCalendarKey(item: CalendarItem): string {
  const date = item.date || '';
  const time = item.startTime || '';
  const name = normalizeCalendarKey(item.name || '');
  return `${date}|${time}|${name}`;
}

function buildCalendarKeyWithoutDate(item: CalendarItem): string {
  const time = item.startTime || '';
  const name = normalizeCalendarKey(item.name || '');
  return `${time}|${name}`;
}

function mergeCalendarItems(
  primary: CalendarItem[],
  supplemental: CalendarItem[]
): CalendarItem[] {
  const merged: CalendarItem[] = [];
  const seen = new Set<string>();

  for (const item of primary || []) {
    const key = buildCalendarKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  for (const item of supplemental || []) {
    const looseKey = buildCalendarKeyWithoutDate(item);
    const replacementIndex = merged.findIndex((existing) =>
      !String(existing.date || '').trim() &&
      String(item.date || '').trim() &&
      looseKey &&
      buildCalendarKeyWithoutDate(existing) === looseKey
    );
    if (replacementIndex >= 0) {
      const existing = merged[replacementIndex];
      const mergedItem = {
        ...existing,
        ...item,
        description: existing.description || item.description,
        extractionReason: [existing.extractionReason, item.extractionReason]
          .filter(Boolean)
          .join('; '),
      };
      merged[replacementIndex] = mergedItem;
      seen.add(buildCalendarKey(mergedItem));
      continue;
    }

    const key = buildCalendarKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  return merged;
}

async function supplementCalendarWithOcr(
  items: CalendarItem[],
  combinedText: string,
  imageUrls: string[],
  userName: string,
  timestamp: string,
  config: ParsingConfig
): Promise<CalendarItem[]> {
  if (!imageUrls || imageUrls.length === 0) return items;

  const tz = config.timezone;
  const postedDt = DateTime.fromISO(timestamp, { zone: tz });
  const postedLocalDate = postedDt.toFormat('yyyy-MM-dd');

  const embeddedOcr = extractOcrTextFromCombined(combinedText);
  const embeddedTimeTokens = countTimeTokens(embeddedOcr);
  const embeddedLooksComplete =
    embeddedOcr && (embeddedOcr.length >= 900 || embeddedTimeTokens >= 12);

  let ocrText = embeddedLooksComplete ? embeddedOcr : '';
  if (!ocrText) {
    const baseImage = imageUrls[0] ? [imageUrls[0]] : [];
    if (baseImage.length === 0) return items;
    try {
      const ocrResult = await extractOcrDebugText(baseImage, config);
      if (ocrResult.error) {
        logger.warn('Calendar OCR supplement error', { error: ocrResult.error });
      }
      ocrText = extractOcrTextFromResponse(ocrResult.text || '');
    } catch (error) {
      logger.warn('Calendar OCR supplement failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return items;
    }
  }

  const ocrItems = parseCalendarOcrText(ocrText, postedLocalDate, userName);
  if (ocrItems.length === 0) return items;

  logger.info('Calendar OCR supplement added items', {
    baseCount: items.length,
    ocrCount: ocrItems.length,
  });

  return mergeCalendarItems(items, ocrItems);
}

function stripTimeTokens(line: string): string {
  const withoutRanges = line.replace(
    /(\d{1,2}(?::\d{2})?|\d{3,4})\s*(am|pm)?\s*-\s*(\d{1,2}(?::\d{2})?|\d{3,4})\s*(am|pm)\b/gi,
    ''
  );
  const withoutTimes = withoutRanges.replace(
    /\b(\d{1,2}(?::\d{2})?|\d{3,4})\s*(am|pm)\b/gi,
    ''
  );
  return withoutTimes.replace(/[&#\\-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractTimeTokens(line: string): string[] {
  const matches = Array.from(
    line.matchAll(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{3,4}\s*(?:am|pm))\b/gi)
  );
  const times: string[] = [];
  for (const match of matches) {
    const parsed = parseTimeToken(match[1]);
    if (parsed) {
      times.push(parsed);
    }
  }
  return times;
}

function oppositeMeridiem(period: string): string {
  return String(period || '').toLowerCase() === 'am' ? 'pm' : 'am';
}

function timeRangeDurationMinutes(startTime: string, endTime: string): number | null {
  const startParts = String(startTime || '').split(':').map((value) => parseInt(value, 10));
  const endParts = String(endTime || '').split(':').map((value) => parseInt(value, 10));
  if (startParts.length !== 2 || endParts.length !== 2) return null;
  const [startHour, startMinute] = startParts;
  const [endHour, endMinute] = endParts;
  if (
    !Number.isFinite(startHour) ||
    !Number.isFinite(startMinute) ||
    !Number.isFinite(endHour) ||
    !Number.isFinite(endMinute)
  ) {
    return null;
  }

  let duration = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (duration <= 0) duration += 24 * 60;
  return duration;
}

function resolveTimeRangeTokens(
  startRaw: string,
  startPeriodRaw: string,
  endRaw: string,
  endPeriodRaw: string
): { startTime: string; endTime: string } | null {
  const normalizedStartRaw = String(startRaw || '').trim();
  const normalizedEndRaw = String(endRaw || '').trim();
  const startPeriod = String(startPeriodRaw || '').trim().toLowerCase();
  const endPeriod = String(endPeriodRaw || '').trim().toLowerCase();

  if (!normalizedStartRaw || !normalizedEndRaw) return null;

  const startCandidates = startPeriod
    ? [{ period: startPeriod, inferred: false }]
    : endPeriod
      ? [
          { period: endPeriod, inferred: false },
          { period: oppositeMeridiem(endPeriod), inferred: true },
        ]
      : [];
  const endCandidates = endPeriod
    ? [{ period: endPeriod, inferred: false }]
    : startPeriod
      ? [
          { period: startPeriod, inferred: false },
          { period: oppositeMeridiem(startPeriod), inferred: true },
        ]
      : [];

  let best:
    | {
        startTime: string;
        endTime: string;
        durationMinutes: number;
        longPenalty: number;
        inferencePenalty: number;
      }
    | null = null;

  for (const startCandidate of startCandidates) {
    const startTime = parseTimeToken(`${normalizedStartRaw}${startCandidate.period}`);
    if (!startTime) continue;

    for (const endCandidate of endCandidates) {
      const endTime = parseTimeToken(`${normalizedEndRaw}${endCandidate.period}`);
      if (!endTime) continue;

      const durationMinutes = timeRangeDurationMinutes(startTime, endTime);
      if (durationMinutes === null) continue;

      const candidate = {
        startTime,
        endTime,
        durationMinutes,
        longPenalty: durationMinutes > 12 * 60 ? 1 : 0,
        inferencePenalty:
          (startCandidate.inferred ? 1 : 0) + (endCandidate.inferred ? 1 : 0),
      };

      if (
        !best ||
        candidate.longPenalty < best.longPenalty ||
        (candidate.longPenalty === best.longPenalty &&
          candidate.durationMinutes < best.durationMinutes) ||
        (candidate.longPenalty === best.longPenalty &&
          candidate.durationMinutes === best.durationMinutes &&
          candidate.inferencePenalty < best.inferencePenalty)
      ) {
        best = candidate;
      }
    }
  }

  return best ? { startTime: best.startTime, endTime: best.endTime } : null;
}

function parseTimeToken(token: string): string | null {
  const normalized = String(token || '').toLowerCase().replace(/\s+/g, '');
  let meridiem = '';
  if (normalized.endsWith('am')) meridiem = 'am';
  if (normalized.endsWith('pm')) meridiem = 'pm';
  if (!meridiem) return null;
  const digits = normalized.slice(0, -2);
  if (!digits) return null;

  let hourStr = '';
  let minuteStr = '';

  if (digits.includes(':')) {
    const [h, m] = digits.split(':');
    hourStr = h;
    minuteStr = m || '0';
  } else if (digits.length <= 2) {
    hourStr = digits;
    minuteStr = '0';
  } else if (digits.length === 3) {
    hourStr = digits.slice(0, 1);
    minuteStr = digits.slice(1);
  } else if (digits.length === 4) {
    hourStr = digits.slice(0, 2);
    minuteStr = digits.slice(2);
  } else {
    return null;
  }

  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  return to24Hour(String(hour), String(minute).padStart(2, '0'), meridiem);
}

function to24Hour(
  hour: string,
  minute: string | undefined,
  meridiem: string
): string {
  let h = Number(hour);
  const min = minute ? Number(minute) : 0;
  const m = meridiem.toLowerCase();
  if (m === 'pm' && h !== 12) h += 12;
  if (m === 'am' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function formatDateFromParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ===================
// Prompt Generators
// ===================

function createEventExtractionPrompt(
  combinedText: string,
  userName: string,
  timestamp: string,
  tz: string,
  postedLocalPretty: string,
  postedLocalDate: string
): string {
  return `Extract ONLY EVENTS (entertainment/activities) from this content. IGNORE all food/drink specials.

- When a single session or workshop block lists multiple explicit dates/times (e.g., "Session 1: Jan 14 & 28, 6-8 pm"), emit a separate event object for each listed date/time pair instead of collapsing them into one. Only treat it as a recurring event if the language explicitly says "every" or "weekly" with a weekday.

CONTENT:
- Posted by: ${userName}
- Posted at (UTC ISO): ${timestamp}
- Reference timezone: ${tz}
- Posted at (local): ${postedLocalPretty}
- Text: "${combinedText}"

Image Preprocessing
- Preprocess this image for OCR: crop to content, de-skew/dewarp, denoise, convert to high-contrast grayscale, sharpen text edges, and export a clean, straight 300+ DPI version.
- If the poster shows separate weekday tiles/lines (e.g., Thursday / Friday / Saturday), treat EACH tile/line as its own region. Read the time from WITHIN the same region as the act for that day.

DATE RESOLUTION RULES (MANDATORY — EXACT ALGORITHM):
- Timezone: use ${tz}. Convert ${timestamp} to the posted LOCAL date = ${postedLocalDate} and weekday = ${postedLocalPretty.split(' ')[1]}.
- For each weekday term printed on the poster (e.g., "Thursday", "Friday", "Saturday"):
  1) Compute the calendar date for the **next occurrence ON OR AFTER** the posted local date in ${tz}.
     - If the weekday equals the posted weekday, use the posted date (same day) unless the text clearly says "next".
     - Otherwise, move forward to the coming occurrence within the next 6 days.
  2) Do **not** roll into the following week unless the post explicitly says so ("next Friday", a future explicit month/day, etc.).
- If the poster lists consecutive weekdays (e.g., "Thu / Fri / Sat"), the resulting dates **must be consecutive days** in ascending order.
- If an explicit month/day is printed anywhere, that explicit date overrides weekday math.
- Output "date" in YYYY-MM-DD computed in ${tz}.

TIME ASSOCIATION RULES (MANDATORY — PER-DAY REGION):
- Use ONLY times that are visibly present in the post TEXT or IMAGE. Do not infer or estimate.
- **Per-day rule:** Assign the start time that appears in the SAME tile/line/region as that weekday's act. **Do NOT** copy a time from another day's region.
- If the poster includes a single GLOBAL time **and** none of the per-day regions show a different time, you may apply the global time to all acts. **If ANY per-day region shows its own time (e.g., "From 9 pm"), that per-day time MUST override the global time for that day.**
- Normalize colloquial phrases: "From 9 pm", "Starting at 9pm" → startTime "21:00".
- Never output "22:00" unless you actually read a "10 pm/10:00 PM/22:00" token in the SAME region for that day.
- Accepted formats include: "9pm", "9 pm", "9 p.m.", "9PM", "9:00 PM", or phrases like "From 9 pm". Normalize to 24h "HH:mm" in ${tz} (e.g., "From 9 pm" → "21:00").
- Evidence requirement: set timeFlags.start.source="explicit" and timeFlags.start.evidence to the exact substring you read.
- **If your evidence does not contain a time token from the SAME region, set startTime="unknown" and timeFlags.start.source="none". Do not guess or copy a global time in this case.**
- Never fabricate an end time. If none is visible, set endTime="unknown" and timeFlags.end.toClose=false.

EXTRACT ONLY:
✓ Live music, bands, DJs
✓ Trivia nights, comedy shows
✓ Workshops, classes
✓ Sports events, parties
✓ Any entertainment activity

IGNORE COMPLETELY:
✗ Food specials, happy hours, food menus
✗ Drink deals, wing nights
✗ Any cost savings on food/drinks

For each EVENT found, extract:
- name: Event name
- description: Full details - IMPORTANT: If the original text has a weekday prefix (e.g., "Friday-", "Thursday-", "Saturday-"), you MUST preserve it at the start of the description field for date validation.
- date: Specific date (YYYY-MM-DD) - NEVER use "recurring" here. For recurring events, use the first occurrence date or posted date.
- startTime: Start time.
- endTime: End time (only if shown), If no end time is shown, set endTime="" (empty string).
- venue: Venue name if different from ${userName}
- price: if no specific price mentioned, use empty string
- relevantImageIndex: 0-based index of the provided image that visibly contains this exact event, performer, date, or time. The first attached image is 0, the second is 1, etc. If no attached image clearly matches this specific event, use 0.
- recurringPattern: Set to "daily" ONLY if text says "Everyday" or "Daily". Set to "weekly_monday" through "weekly_sunday" ONLY if text says "Every Monday", "Every Tuesday", etc. Otherwise set to "none".
- extractionReason: Why this was identified as an event
- timeFlags: {
      start: { source: "explicit" | "implied" | "semantic", evidence: "string" },
      end:   { source: "explicit" | "implied" | "semantic" | "none", toClose: boolean, evidence: "string" }
    }

SERIES SPLITTING RULE:
- If one post lists multiple named themed/program blocks under an umbrella heading, output one item per named block instead of one generic umbrella item.
- If a named block has explicit Friday dates and explicit Saturday dates, output separate Friday and Saturday items for that named block.
- Do not collapse multiple named sub-series into the umbrella title.

VENUE EXTRACTION:
- Look for hints that the event is at a different venue ("at [Location]")
- If no specific venue mentioned, use empty string

CRITICAL JSON FORMATTING REQUIREMENTS:
- Return ONLY valid JSON object with two arrays
- NO markdown code blocks, NO '''json''' wrappers
- NO explanatory text before or after JSON
- Use this exact structure:
{
  "extractedEvents": [...array of events...],
  "extractionSummary": {
    "totalFound": number,
    "extractionNotes": "Overall notes about what was found and why"
  }
}

Return pure JSON with events and extraction reasoning.`;
}

function createFoodSpecialExtractionPrompt(
  combinedText: string,
  userName: string,
  timestamp: string,
  tz: string
): string {
  return `Your job is to Extract ALL FOOD/DRINK SPECIALS that have cost savings from this content. IGNORE all events/entertainment.

CONTENT:
- Posted by: ${userName}
- Posted at: ${timestamp}
- Text: "${combinedText}"

EXTRACT ALL SPECIALS (each MUST have pricing/savings):

TIME & EVIDENCE RULES (FOR SPECIALS — SAME AS EVENTS):
- Read times ONLY from the text or image regions relevant to the special. Do not infer.
- Explicit examples: "from 4 pm", "4–6", "4:00–6:00", "till close", "until close", "open to close", "all day".
- Normalize to 24h "HH:mm" in ${tz} (e.g., "from 9 pm" → "21:00").
- If a poster/list shows a single GLOBAL time and a per-item time, the per-item time MUST override.
- Evidence requirement: set timeFlags.start.source to "explicit" when you read a concrete start time token; set timeFlags.start.evidence to the exact substring.
- If evidence does NOT include a time token from the same region, set timeFlags.start.source="none" and startTime="".
- "to close / till close / until close" ⇒ set timeFlags.end.toClose=true and leave endTime="" (the resolver will use venue hours).
- "all day / open to close / open 'til close" ⇒ set timeFlags.start.source="semantic" and startTime=""; set timeFlags.end.toClose=true and endTime="".

✓ Happy hour deals (including "Everyday" happy hours)
✓ Wing nights with prices
✓ Drink specials
✓ Food discounts
✓ Breakfast/brunch specials (BREKKIE, pancakes, breakfast items, brunch items)
✓ Daily/recurring food specials (e.g., "Everyday- [special]", "Daily- [special]")
✓ Any cost savings on food/drinks

CRITICAL: Extract ALL food/drink specials even if they say "Everyday", "Daily", or appear at the end of the post text.

IGNORE COMPLETELY:
✗ Live music, trivia, entertainment
✗ Menu items without deals
✗ "All You Can Eat" without price

For each SPECIAL found, extract:
- name: Special name
- description: Full details WITH pricing - IMPORTANT: If the original text has a weekday prefix (e.g., "Friday-", "Thursday-", "Saturday-"), you MUST preserve it at the start of the description field for date validation.
- date: Specific date (YYYY-MM-DD) - NEVER use "recurring" here. For recurring specials, use the first occurrence date or posted date.
- startTime: Start time
- endTime: End time
- venue: Venue name if different from ${userName} (look for location names, venue names, "at [location]")
- pricing: Specific prices/discounts. - price: if no specific price mentioned, use empty string.
- relevantImageIndex: 0-based index of the provided image that visibly contains this exact special, date, or time. The first attached image is 0, the second is 1, etc. If no attached image clearly matches this specific special, use 0.
- recurringPattern: Set to "daily" ONLY if text says "Everyday" or "Daily". Set to "weekly_monday" through "weekly_sunday" ONLY if text says "Every Monday", "Every Tuesday", etc. Otherwise set to "none".
- extractionReason: Why this was identified as a valid special with cost savings

SERIES SPLITTING RULE:
- If one poster lists multiple named themed specials under an umbrella heading, output one item per named theme instead of one generic umbrella special.
- If a named theme has explicit Friday dates and explicit Saturday dates, output separate Friday and Saturday items for that theme.
- Do not collapse multiple named theme blocks into a single generic "theme nights" item.
- If a single finite holiday/weekend special has different weekday-specific availability clauses, output separate one-off specials for each weekday/date.
- Example: "Available from 4pm onwards on Saturday, and all day Sunday & Monday" should become separate Saturday, Sunday, and Monday items.

VENUE EXTRACTION - Use this priority order:
1. CHECK IMAGES FIRST: Look at the provided images for venue signs, logos, or venue names
2. CHECK POST TEXT: Look for venue indicators at the start of the post text
3. MAINTAIN CONSISTENCY: If extracting multiple items from this post, they should typically share the same venue
4. ITEM-SPECIFIC OVERRIDES: Only use a different venue if the individual item's description explicitly mentions a different location
5. FALLBACK: If no venue found in images, post text, or item description, use empty string

CRITICAL JSON FORMATTING REQUIREMENTS:
- Return ONLY valid JSON object with two arrays
- NO markdown code blocks, NO '''json''' wrappers
- NO explanatory text before or after JSON
Use this exact structure:
{
  "extractedSpecials": [...array of specials...],
  "extractionSummary": {
    "totalFound": number,
    "extractionNotes": "Overall notes about what was found and why"
  }
}

Return pure JSON with specials and extraction reasoning.`;
}

function createCalendarExtractionPrompt(
  combinedText: string,
  userName: string,
  timestamp: string
): string {
  return `Extract ALL events and specials from this CALENDAR content, ensure you process all attached images.

CONTENT:
- Posted by: ${userName}
- Posted at: ${timestamp}
- Text: "${combinedText}"

This appears to be a calendar with multiple dates and activities.
Extract EVERY event/special listed for EVERY date shown.

IMPORTANT (Calendar grids with lineups):
- Images may include day-cell crops from the SAME calendar. Treat all images as parts of one calendar.
- Some images may repeat or overlap; de-duplicate items and merge details across images.
- You are given 1+ images; use the images as the PRIMARY source. Read (OCR) the text in the image(s).
- If the Text block includes OCR text from the images, treat it as authoritative and use it to enumerate every date cell.
- Some entries may be faint or colored (e.g., purple/pink). Read colored text carefully.
- Do NOT collapse repeated items into weekly recurrences. If the same class appears on multiple dates, output one item per date.
- If a cell lists multiple sessions (e.g., "5pm & 6:30pm"), output separate items for each time.
- Create ONE item per performance in the grid. Set name to the performer/act, not the series title.
- Include the date (or day-of-week if that's all that's shown), start_time and end_time when present, and the stage/venue exactly as shown in the grid.
- For lineup grids, set type="event" (do NOT use "special" unless there is an explicit price/discount).
- Do NOT infer items from the caption if they do not appear in the image; only use caption to disambiguate dates when the grid shows day-of-week only.
- If performer names in the image are unreadable, return no items and note "image_unreadable" in notes rather than guessing.

For each item found, extract:
- name: Event/special name
- type: "event" or "special"
- date: Specific date (YYYY-MM-DD)
- startTime: Time if shown
- endTime: End time if shown
- venue: Venue name if different from ${userName} (look for location names, venue names, "at [location]")
- price: if no specific price mentioned, use empty string
- description: Any additional details
- extractionReason: Why this was identified as a calendar item
- relevantImageIndex: 0-based index of the provided image that visibly contains this exact calendar item, date, or time. The first attached image is 0, the second is 1, etc. If no attached image clearly matches this item, use 0.

Pay special attention to:
- Calendar grids in images
- Date headers
- Multiple events per date
- Venue/location information for each event

CRITICAL JSON FORMATTING REQUIREMENTS:
- Return ONLY valid JSON object with extraction summary
- NO markdown code blocks, NO '''json''' wrappers
- NO explanatory text before or after JSON
- Use this exact structure:
{
  "extractedItems": [...array of calendar items...],
  "extractionSummary": {
    "totalFound": number,
    "eventsFound": number,
    "specialsFound": number,
    "extractionNotes": "Overall notes about the calendar extraction"
  }
}

Return pure JSON with ALL calendar items.`;
}

function createScheduleExtractionPrompt(
  combinedText: string,
  userName: string,
  timestamp: string
): string {
  return `Extract ALL events from this SCHEDULE content.

CONTENT:
- Posted by: ${userName}
- Posted at: ${timestamp}
- Text: "${combinedText}"

This appears to be a schedule/lineup with multiple performances.
Extract EVERY performance/event listed.

For each item found, extract:
- name: Performer/event name
- day: Day of week if shown
- date: Date if available (YYYY-MM-DD)
- startTime: Performance start time
- endTime: Performance end time ONLY when the same schedule line shows an explicit range (otherwise use "")
- venue: Venue name if different from ${userName} (look for location names, venue names, "at [location]")
- price: if no specific price mentioned, use empty string
- description: Any additional details
- extractionReason: Why this was identified as a scheduled item
- relevantImageIndex: 0-based index of the provided image that visibly contains this exact scheduled item, performer, date, or time. The first attached image is 0, the second is 1, etc. If no attached image clearly matches this item, use 0.
- timeFlags: {
    start: { source: "explicit" | "implied" | "semantic" | "none", evidence: "exact timing substring or empty string" },
    end: { source: "explicit" | "implied" | "semantic" | "none", toClose: boolean, evidence: "exact timing substring or empty string" }
  }

Look for patterns like:
- "Monday: Band A at 8pm"
- "8pm - Venue: Performer"
- Time-based lineups

TIME RULES:
- Preserve explicit ranges like "12-1PM", "2:30-5:30", or "6-7:30 PM" as both startTime and endTime.
- If only a start time is visible on that schedule line, extract startTime and leave endTime as "".
- Never invent an end time when the source line only shows a start time.
- When a visible time token exists, set timeFlags.start.source="explicit" and use the exact timing substring as evidence.
- When a visible range exists, set timeFlags.end.source="explicit", timeFlags.end.toClose=false, and use the exact range substring as evidence.
- When no end token is visible, set timeFlags.end.source="none", timeFlags.end.toClose=false, and timeFlags.end.evidence="".

CRITICAL JSON FORMATTING REQUIREMENTS:
- Return ONLY valid JSON object with extraction summary
- NO markdown code blocks, NO '''json''' wrappers
- NO explanatory text before or after JSON
- Use this exact structure:
{
  "extractedItems": [
    {
      "name": "string",
      "day": "string",
      "date": "YYYY-MM-DD",
      "startTime": "HH:mm or \"\"",
      "endTime": "HH:mm or \"\"",
      "venue": "string",
      "price": "string",
      "description": "string",
      "extractionReason": "string",
      "timeFlags": {
        "start": { "source": "explicit" | "implied" | "semantic" | "none", "evidence": "string" },
        "end": { "source": "explicit" | "implied" | "semantic" | "none", "toClose": boolean, "evidence": "string" }
      }
    }
  ],
  "extractionSummary": {
    "totalFound": number,
    "venuesFound": number,
    "extractionNotes": "Overall notes about the schedule extraction"
  }
}

Return pure JSON with ALL scheduled items.`;
}

export function normalizeScheduleItemsForRegression(
  items: Array<Record<string, unknown>>
): CalendarItem[] {
  return normalizeExtractedScheduleItems(items);
}

export function parseScheduleTextForRegression(
  combinedText: string,
  postedLocalDate: string,
  userName: string,
  sourceType: 'calendar' | 'schedule'
): CalendarItem[] {
  return parseScheduleText(combinedText, postedLocalDate, userName, sourceType);
}

function createOcrDebugPrompt(imageUrls: string[]): string {
  const list = imageUrls.map((url, idx) => `${idx + 1}. ${url}`).join('\n');
  return `You are an OCR engine. Extract all visible text from each image.
Do not infer or paraphrase. Preserve line breaks.

IMAGE URLS:
${list}

Return ONLY valid JSON in this exact shape:
{
  "images": [
    { "index": 1, "url": "<url>", "text": "<all text from image>" }
  ],
  "notes": ""
}

If an image is unreadable, set "text" to "" and add "unreadable" to notes.`;
}

export async function extractOcrDebugText(
  imageUrls: string[],
  config: Partial<ParsingConfig> = {}
): Promise<{ text: string; model: string; error?: string }> {
  const cfg = { ...DEFAULT_PARSING_CONFIG, ...config };
  const model = resolveStageModel(cfg.gptModelReasoning, 'OCR_DEBUG_MODEL_OVERRIDE');

  if (!imageUrls || imageUrls.length === 0) {
    return { text: '', model, error: 'no_images' };
  }

  const prompt = createOcrDebugPrompt(imageUrls);
  try {
    const response = await callGPT(prompt, imageUrls, cfg, {
      stage: 'ocr_debug',
      component: 'ocrDebugText',
      modelEnvVar: 'OCR_DEBUG_MODEL_OVERRIDE',
      imageDetailEnvVar: 'OCR_DEBUG_IMAGE_DETAIL',
    });
    return { text: response || '', model };
  } catch (error) {
    return {
      text: '',
      model,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function createFallbackExtractionPrompt(
  combinedText: string,
  userName: string,
  timestamp: string,
  tz: string,
  postedLocalPretty: string,
  postedLocalDate: string,
  contentType: ContentType
): string {
  const calendarRules =
    contentType === 'CALENDAR'
      ? `
CALENDAR-SPECIFIC RULES:
- The Text block may include OCR output from a calendar image; use it to enumerate ALL dates.
- Do NOT collapse into recurring patterns. If the same class appears on multiple dates, output one item per date.
- If a date cell lists multiple times, output separate items for each time.
`
      : '';

  return `FALLBACK EXTRACTION (previous pass returned no items). Extract ANY events or food/drink specials you can find.

CONTENT:
- Posted by: ${userName}
- Posted at (UTC ISO): ${timestamp}
- Reference timezone: ${tz}
- Posted at (local): ${postedLocalPretty}
- Default date if none is explicit: ${postedLocalDate}
- Original classification: ${contentType}
- Text: "${combinedText}"
${calendarRules}

RULES:
- Use image text (OCR) when available; otherwise rely on the text.
- If a date is not explicit, use ${postedLocalDate}.
- If a time is not explicit, leave startTime/endTime as empty strings.
- Do NOT return an empty list if you see any hint of events, schedules, classes, lineups, or specials.

Return JSON in this exact structure:
{
  "items": [
    {
      "type": "event" or "special",
      "name": "string",
      "description": "string",
      "date": "YYYY-MM-DD",
      "startTime": "HH:mm" or "",
      "endTime": "HH:mm" or "",
      "venue": "string",
      "price": "string",
      "recurringPattern": "none" | "daily" | "weekly_monday" | "weekly_tuesday" | "weekly_wednesday" | "weekly_thursday" | "weekly_friday" | "weekly_saturday" | "weekly_sunday",
      "extractionReason": "string",
      "timeFlags": {
        "start": { "source": "explicit" | "implied" | "semantic" | "none", "evidence": "string" },
        "end": { "source": "explicit" | "implied" | "semantic" | "none", "toClose": boolean, "evidence": "string" }
      }
    }
  ]
}

Return ONLY valid JSON.`;
}

// ===================
// Helper Functions
// ===================

/**
 * Deduplicate mixed content - prefer food special extractor for food items
 */
function deduplicateMixedContent(
  events: ExtractedItem[],
  specials: ExtractedItem[]
): ExtractedItem[] {
  const foodKeywordsRe =
    /\b(wrap|soup|burger|pizza|wings|sandwich|salad|taco|tacos|fries|special|appetizer|entree|dinner|lunch|breakfast|brunch|steak|chicken|fish|seafood|pasta|nachos|quesadilla|burrito|poutine|platter|ribs|bbq|grill|happy hour|wing night)\b/i;
  const genericTokens = new Set([
    'theme',
    'themes',
    'night',
    'nights',
    'top',
    'park',
    'friday',
    'fridays',
    'saturday',
    'saturdays',
    'just',
    'with',
    'from',
    'your',
    'crew',
    'great',
    'vibes',
    'event',
    'events',
    'parties',
    'partie',
  ]);

  function buildTokenSet(item: ExtractedItem): Set<string> {
    return new Set(
      normalizeSplitCandidateText(
        `${String(item?.name || '')} ${String(item?.description || '')}`
      )
        .split(' ')
        .filter((token) => token.length >= 4 && !genericTokens.has(token))
    );
  }

  function buildMatchKey(item: ExtractedItem): string {
    return [
      String((item as any)?.date || '').trim(),
      String((item as any)?.startTime || '').trim(),
      String((item as any)?.endTime || '').trim(),
      normalizeSplitCandidateText(
        `${String((item as any)?.venue || '')} ${String((item as any)?.additionalLocation || '')}`
      ),
    ].join('|');
  }

  const specialNames = new Map<string, boolean>();
  const specialsByMatchKey = new Map<
    string,
    Array<{ name: string; isFoodRelated: boolean; tokens: Set<string> }>
  >();
  for (const special of specials) {
    if (special && special.name) {
      const key = String(special.name).toLowerCase().trim();
      const desc = String(special.description || '').toLowerCase();
      const isFoodRelated = foodKeywordsRe.test(key) || foodKeywordsRe.test(desc);
      specialNames.set(key, isFoodRelated);
      const matchKey = buildMatchKey(special);
      if (!specialsByMatchKey.has(matchKey)) specialsByMatchKey.set(matchKey, []);
      specialsByMatchKey.get(matchKey)?.push({
        name: key,
        isFoodRelated,
        tokens: buildTokenSet(special),
      });
    }
  }

  const deduplicatedEvents = events.filter((event) => {
    if (!event || !event.name) return true;
    const key = String(event.name).toLowerCase().trim();
    const desc = String(event.description || '').toLowerCase();
    const eventIsFoodRelated = foodKeywordsRe.test(key) || foodKeywordsRe.test(desc);

    if (specialNames.has(key) && specialNames.get(key) && eventIsFoodRelated) {
      logger.debug(`Removing food-related duplicate from events: "${event.name}"`);
      return false;
    }

    if (eventIsFoodRelated) {
      const eventTokens = buildTokenSet(event);
      const candidates = specialsByMatchKey.get(buildMatchKey(event)) || [];
      const overlapsSpecial = candidates.some((candidate) => {
        if (!candidate.isFoodRelated || eventTokens.size === 0 || candidate.tokens.size === 0) {
          return false;
        }
        for (const token of eventTokens) {
          if (candidate.tokens.has(token)) return true;
        }
        return false;
      });

      if (overlapsSpecial) {
        logger.debug(`Removing mixed-content event shadowed by food special: "${event.name}"`);
        return false;
      }
    }

    return true;
  });

  return [...deduplicatedEvents, ...specials];
}

/**
 * Sanitize recurring pattern value
 */
function sanitizeRecurringPattern(pattern: string | undefined): RecurringPattern {
  if (!pattern) return 'none';
  const cleaned = pattern.toString().trim().replace(/[,;]+$/, '').toLowerCase();
  if (VALID_RECURRING_PATTERNS.includes(cleaned as RecurringPattern)) {
    return cleaned as RecurringPattern;
  }
  logger.debug(`Sanitized invalid recurring pattern: "${pattern}" → "none"`);
  return 'none';
}

/**
 * Detect recurring pattern from text
 */
export function detectRecurringPattern(text: string): RecurringPattern {
  const t = String(text || '').toLowerCase();

  // Check for daily/everyday patterns FIRST
  if (/\b(everyday|daily)\b/i.test(t)) {
    return 'daily';
  }

  const dayMap: Record<string, RecurringPattern> = {
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

  // ONLY match when preceded by explicit recurring keywords
  const weeklyMatch = t.match(
    /\b(every|weekly|each)\s+(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/i
  );
  if (weeklyMatch) {
    const day = weeklyMatch[2].toLowerCase().replace(/s$/, '');
    if (dayMap[day]) {
      return dayMap[day];
    }
  }

  // Secondary pattern: "weekly" appears somewhere AND "on [day] nights/evenings" appears
  if (/\bweekly\b/i.test(t)) {
    const onDayMatch = t.match(
      /\bon\s+(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?)\s*(nights?|evenings?|mornings?|afternoons?)?\b/i
    );
    if (onDayMatch) {
      const day = onDayMatch[1].toLowerCase().replace(/s$/, '');
      if (dayMap[day]) {
        return dayMap[day];
      }
    }
  }

  return 'none';
}

/**
 * Extract date from text with day-of-week patterns
 */
export function extractDateFromText(
  text: string,
  postedDate: string
): { date: string; isRecurring: boolean; hasExplicitDayPrefix: boolean } {
  const t = String(text || '').toLowerCase();

  if (/\b(everyday|daily)\b/i.test(t)) {
    return { date: postedDate, isRecurring: true, hasExplicitDayPrefix: false };
  }

  const dayMap: Record<string, number> = {
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

  const dayMatch = t.match(
    /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)[\s\-–—:;,]/i
  );
  if (!dayMatch) return { date: postedDate, isRecurring: false, hasExplicitDayPrefix: false };

  const dayName = dayMatch[1].toLowerCase();
  const targetDay = dayMap[dayName];
  if (targetDay === undefined)
    return { date: postedDate, isRecurring: false, hasExplicitDayPrefix: false };

  try {
    const posted = DateTime.fromISO(postedDate);
    const postedDay = posted.weekday % 7; // Convert to 0=Sun format

    let daysToAdd = targetDay - postedDay;
    if (daysToAdd < 0) daysToAdd += 7;

    const targetDate = posted.plus({ days: daysToAdd });
    return {
      date: targetDate.toFormat('yyyy-MM-dd'),
      isRecurring: false,
      hasExplicitDayPrefix: true,
    };
  } catch (e) {
    return { date: postedDate, isRecurring: false, hasExplicitDayPrefix: false };
  }
}

/**
 * Get day of week number from a weekday prefix in text
 */
export function getDayOfWeekFromPrefix(text: string): number | null {
  const t = String(text || '').toLowerCase();
  const dayMap: Record<string, number> = {
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

  const dayMatch = t.match(
    /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)[\s\-–—:;,]/i
  );
  if (!dayMatch) return null;

  const dayName = dayMatch[1].toLowerCase();
  return dayMap[dayName] !== undefined ? dayMap[dayName] : null;
}

/**
 * Call GPT for extraction
 */
async function callGPT(
  prompt: string,
  imageUrls: string[],
  config: ParsingConfig,
  usageMeta: {
    stage: 'stage3' | 'ocr_debug';
    component: string;
    modelEnvVar: string;
    imageDetailEnvVar: string;
  } = {
    stage: 'stage3',
    component: 'eventExtractor',
    modelEnvVar: 'STAGE3_MODEL_OVERRIDE',
    imageDetailEnvVar: 'STAGE3_IMAGE_DETAIL',
  }
): Promise<string> {
  const client = getOpenAIClient();
  const model = resolveStageModel(config.gptModelReasoning, usageMeta.modelEnvVar);
  const imageDetail = resolveImageDetail(usageMeta.imageDetailEnvVar, 'high');

  const isGpt5Model = (value: string): boolean => value.startsWith('gpt-5');
  const maxOutputTokens = 32000;
  const MIN_OUTPUT_TOKENS = 512;

  const parseModelMaxTokensFromError = (error: unknown): number | null => {
    const message =
      error instanceof Error ? error.message : typeof error === 'string' ? error : '';
    if (!message) return null;

    const match = message.match(/supports at most\s+(\d+)\s+completion tokens/i);
    if (!match) return null;

    const parsed = Number(match[1]);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.max(MIN_OUTPUT_TOKENS, Math.trunc(parsed));
  };

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

  const runChat = async (urls: string[], outputTokens: number): Promise<string> => {
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

    const request: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model,
      messages: [{ role: 'user', content }],
      max_tokens: outputTokens,
      temperature: 0.3,
    };

    const callStart = Date.now();
    const response = await client.chat.completions.create(request);
    const durationMs = Date.now() - callStart;
    logger.info('Timing', {
      step: 'gpt_call',
      component: usageMeta.component,
      endpoint: 'chat',
      model,
      imageCount: urls.length,
      maxOutputTokens: outputTokens,
      durationMs,
    });
    const usage = extractTokenUsage(response.usage);
    await emitGptUsage(config, {
      stage: usageMeta.stage,
      component: usageMeta.component,
      endpoint: 'chat',
      model,
      imageCount: urls.length,
      durationMs,
      ...usage,
    });

    const messageContent = response.choices[0]?.message?.content;
    const finishReason = response.choices[0]?.finish_reason;
    logger.info('GPT extraction response received', {
      model,
      tokens: usage.totalTokens,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      cachedInputTokens: usage.cachedInputTokens,
      finishReason,
      responsePreview: messageContent?.slice(0, 500),
      responseTail: messageContent?.slice(-200),
      responseLength: messageContent?.length,
    });

    if (finishReason === 'length') {
      logger.warn('GPT response truncated due to max_tokens limit', {
        model,
        tokens: usage.totalTokens,
      });
    }

    return messageContent || '';
  };

  const runResponses = async (urls: string[], outputTokens: number): Promise<string> => {
    const content = [
      { type: 'input_text', text: prompt },
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
      max_output_tokens: outputTokens,
    });
    const durationMs = Date.now() - callStart;

    logger.info('Timing', {
      step: 'gpt_call',
      component: usageMeta.component,
      endpoint: 'responses',
      model,
      imageCount: urls.length,
      maxOutputTokens: outputTokens,
      durationMs,
    });
    const usage = extractTokenUsage(response.usage);
    await emitGptUsage(config, {
      stage: usageMeta.stage,
      component: usageMeta.component,
      endpoint: 'responses',
      model,
      imageCount: urls.length,
      durationMs,
      ...usage,
    });

    const messageContent = extractResponsesText(response);
    const stopReason = response.stop_reason;
    logger.info('GPT extraction response received (responses)', {
      model,
      tokens: usage.totalTokens,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      cachedInputTokens: usage.cachedInputTokens,
      stopReason,
      responsePreview: messageContent?.slice(0, 500),
      responseTail: messageContent?.slice(-200),
      responseLength: messageContent?.length,
    });

    if (stopReason === 'max_output_tokens') {
      logger.warn('GPT response truncated due to max_output_tokens limit', {
        model,
        tokens: usage.totalTokens,
      });
    }

    return messageContent || '';
  };

  const runOnce = async (urls: string[], outputTokens: number): Promise<string> => {
    if (isGpt5Model(model)) {
      return runResponses(urls, outputTokens);
    }
    return runChat(urls, outputTokens);
  };

  const runWithAdaptiveTokens = async (urls: string[]): Promise<string> => {
    try {
      return await runOnce(urls, maxOutputTokens);
    } catch (error) {
      const modelMaxTokens = parseModelMaxTokensFromError(error);
      if (!modelMaxTokens || modelMaxTokens >= maxOutputTokens) {
        throw error;
      }

      logger.warn('Stage 3 token cap rejected by model, retrying at model maximum', {
        model,
        component: usageMeta.component,
        requestedTokens: maxOutputTokens,
        retryTokens: modelMaxTokens,
        imageCount: urls.length,
      });
      return await runOnce(urls, modelMaxTokens);
    }
  };

  try {
    return await runWithAdaptiveTokens(imageUrls);
  } catch (error) {
    if (imageUrls && imageUrls.length > 0) {
      logger.warn('GPT call failed with images; retrying without images', {
        error: error instanceof Error ? error.message : String(error),
      });
      return await runWithAdaptiveTokens([]);
    }
    logger.error('GPT call failed', error);
    throw error;
  }
}

/**
 * Parse JSON response from GPT
 */
function parseJSONResponse(response: string): Record<string, unknown> | null {
  try {
    const normalized = normalizeJsonText(response);
    const parsed = tryParseJson(normalized);
    if (parsed && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }

    const repaired = repairMalformedJson(normalized);
    const repairedParsed = tryParseJson(repaired);
    if (repairedParsed && !Array.isArray(repairedParsed)) {
      return repairedParsed as Record<string, unknown>;
    }

    const trimmed = trimToLastCompleteJson(repaired);
    const trimmedParsed = trimmed ? tryParseJson(trimmed) : null;
    if (trimmedParsed && !Array.isArray(trimmedParsed)) {
      return trimmedParsed as Record<string, unknown>;
    }
  } catch (error) {
    logger.debug('JSON parse failed, will use fallback');
  }

  return null;
}

/**
 * Fallback JSON parsing for arrays
 */
function parseJSONFallback(response: string, type: string): ExtractedItem[] {
  logger.debug(`Parsing ${type} response with fallback`);

  try {
    const normalized = normalizeJsonText(response);
    const parsed = tryParseJson(normalized);
    const extracted = extractArrayFromParsed(parsed);
    if (extracted) {
      logger.debug(`Fallback parsed ${extracted.length} items`);
      return extracted;
    }

    const repaired = repairMalformedJson(normalized);
    const repairedParsed = tryParseJson(repaired);
    const repairedExtracted = extractArrayFromParsed(repairedParsed);
    if (repairedExtracted) {
      logger.debug(`Fallback parsed ${repairedExtracted.length} items after repair`);
      return repairedExtracted;
    }

    const trimmedArray = trimToLastCompleteArray(repaired);
    const trimmedArrayParsed = trimmedArray ? tryParseJson(trimmedArray) : null;
    if (Array.isArray(trimmedArrayParsed)) {
      logger.debug(`Fallback parsed ${trimmedArrayParsed.length} items from trimmed array`);
      return trimmedArrayParsed as ExtractedItem[];
    }

    const trimmedObject = trimToLastCompleteJson(repaired);
    const trimmedParsed = trimmedObject ? tryParseJson(trimmedObject) : null;
    const trimmedExtracted = extractArrayFromParsed(trimmedParsed);
    if (trimmedExtracted) {
      logger.debug(`Fallback parsed ${trimmedExtracted.length} items from trimmed object`);
      return trimmedExtracted;
    }

    const extractedObjects = extractObjectsFromText(repaired);
    if (extractedObjects.length > 0) {
      logger.debug(`Fallback parsed ${extractedObjects.length} items from object scan`);
      return extractedObjects as ExtractedItem[];
    }

    logger.debug(`Could not parse response for ${type}`);
    return [];
  } catch (error) {
    logger.error(`Error parsing ${type} response`, error);
    return [];
  }
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractArrayFromParsed(parsed: unknown): ExtractedItem[] | null {
  if (!parsed) return null;
  if (Array.isArray(parsed)) return parsed as ExtractedItem[];
  if (typeof parsed !== 'object') return null;

  const obj = parsed as Record<string, unknown>;
  const candidates = [
    obj.events,
    obj.specials,
    obj.items,
    obj.extractedEvents,
    obj.extractedSpecials,
    obj.extractedItems,
    obj.formattedEvents,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as ExtractedItem[];
  }

  return null;
}

function normalizeJsonText(text: string): string {
  let normalized = String(text || '').trim();
  if (!normalized) return normalized;
  normalized = normalized.replace(/^\s*```(?:json)?/i, '');
  normalized = normalized.replace(/```\s*$/i, '');
  normalized = stripJsonComments(normalized);

  const firstObj = normalized.indexOf('{');
  const firstArr = normalized.indexOf('[');
  const first = [firstObj, firstArr].filter(idx => idx >= 0).sort((a, b) => a - b)[0];
  if (first === undefined) {
    return normalized.trim();
  }
  const lastObj = normalized.lastIndexOf('}');
  const lastArr = normalized.lastIndexOf(']');
  const last = Math.max(lastObj, lastArr);
  if (last > first) {
    normalized = normalized.slice(first, last + 1);
  }

  return normalized.trim();
}

function stripJsonComments(text: string): string {
  return text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function extractObjectsFromText(text: string): Array<Record<string, unknown>> {
  const objects: Array<Record<string, unknown>> = [];
  const raw = String(text || '');
  if (!raw) return objects;

  const useStringTracking = raw.split('"').length % 2 === 1 ? false : true;
  const arrayMatch = raw.match(/"(items|extractedItems|extractedEvents|extractedSpecials)"\s*:\s*\[/);
  if (arrayMatch && arrayMatch.index !== undefined) {
    const arrayStart = raw.indexOf('[', arrayMatch.index);
    const extracted = scanArrayObjects(raw, arrayStart, useStringTracking);
    if (extracted.length > 0) return extracted;
  }

  let inString = false;
  let depth = 0;
  let start = -1;

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (useStringTracking && char === '"' && !isQuoteEscaped(raw, i)) {
      inString = !inString;
    }
    if (useStringTracking && inString) continue;

    if (char === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (char === '}') {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && start !== -1) {
        const candidate = raw.slice(start, i + 1);
        try {
          const repaired = repairMalformedJson(candidate);
          const parsed = JSON.parse(repaired);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const candidate = parsed as Record<string, unknown>;
            const hasName = typeof candidate.name === 'string' && candidate.name.trim().length > 0;
            const hasDate =
              typeof candidate.date === 'string' ||
              typeof candidate.startDate === 'string';
            const hasTime =
              typeof candidate.startTime === 'string' ||
              typeof candidate.start_time === 'string';
            const hasType = typeof candidate.type === 'string';
            if (hasName && (hasDate || hasTime || hasType)) {
              objects.push(candidate);
            }
          }
        } catch {
          // Skip invalid objects.
        }
        start = -1;
      }
    }
  }

  return objects;
}

function scanArrayObjects(
  raw: string,
  arrayStart: number,
  useStringTracking: boolean
): Array<Record<string, unknown>> {
  const objects: Array<Record<string, unknown>> = [];
  if (arrayStart < 0) return objects;

  let inString = false;
  let depth = 0;
  let start = -1;

  for (let i = arrayStart + 1; i < raw.length; i++) {
    const char = raw[i];
    if (useStringTracking && char === '"' && !isQuoteEscaped(raw, i)) {
      inString = !inString;
    }
    if (useStringTracking && inString) continue;

    if (char === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (char === '}') {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && start !== -1) {
          const candidate = raw.slice(start, i + 1);
          try {
            const repaired = repairMalformedJson(candidate);
            const parsed = JSON.parse(repaired);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              const item = parsed as Record<string, unknown>;
              const hasName = typeof item.name === 'string' && item.name.trim().length > 0;
              const hasDate =
                typeof item.date === 'string' ||
                typeof item.startDate === 'string';
              const hasTime =
                typeof item.startTime === 'string' ||
                typeof item.start_time === 'string';
              const hasType = typeof item.type === 'string';
              if (hasName && (hasDate || hasTime || hasType)) {
                objects.push(item);
              }
            }
          } catch {
            // Skip invalid objects.
          }
          start = -1;
        }
      }
    } else if (char === ']' && depth === 0) {
      break;
    }
  }

  return objects;
}

function repairMalformedJson(jsonStr: string): string {
  let repaired = jsonStr;
  let previousRepaired: string;
  let iterations = 0;
  const maxIterations = 12;

  // Normalize smart quotes and apostrophes to ASCII equivalents BEFORE iterating
  // This prevents Unicode quote corruption (e.g., ' → ?)
  repaired = repaired
    .replace(/[\u2018\u2019\u02bc\u2032\uff07]/g, "'")  // Smart single quotes → '
    .replace(/[\u201c\u201d\uff02]/g, '"');             // Smart double quotes → "

  do {
    previousRepaired = repaired;
    iterations++;

    repaired = repaired.replace(/\bTrue\b/g, 'true');
    repaired = repaired.replace(/\bFalse\b/g, 'false');
    repaired = repaired.replace(/\bNone\b/g, 'null');
    repaired = quoteUnquotedKeys(repaired);
    repaired = repaired.replace(/,(\s*)\]/g, '$1]');
    repaired = repaired.replace(/,(\s*)\}/g, '$1}');
    repaired = escapeUnescapedQuotesInStrings(repaired);
  } while (repaired !== previousRepaired && iterations < maxIterations);

  return repaired;
}

function quoteUnquotedKeys(jsonStr: string): string {
  return jsonStr.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3');
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

function trimToLastCompleteArray(text: string): string | null {
  const firstBracket = text.indexOf('[');
  if (firstBracket === -1) return null;

  let depth = 0;
  let lastCompleteIndex = -1;
  let inString = false;

  for (let i = firstBracket; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && !isQuoteEscaped(text, i)) {
      inString = !inString;
    }
    if (inString) continue;
    if (char === '[') depth++;
    if (char === ']') {
      depth--;
      if (depth === 0) {
        lastCompleteIndex = i;
      }
    }
  }

  if (lastCompleteIndex !== -1) {
    return text.slice(firstBracket, lastCompleteIndex + 1);
  }
  return null;
}
