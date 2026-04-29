// @ts-nocheck
// TODO: Fix type errors introduced during Phase 6/7 updates
/**
 * Post Parser - Main Orchestrator
 * Ported from postParser.js - parsePostData function
 *
 * Orchestrates the 5-stage parsing pipeline:
 * Stage 1: Content Validation
 * Stage 2: Content Classification
 * Stage 3: Content Extraction
 * Stage 3.5: Facebook Events Time Resolution
 * Stage 4: Secondary Validation
 * Stage 5: Final Formatting
 * Stage 5.5: Hours-Based Time Resolution
 * Stage 5.6: Datetime Completeness Resolution
 */

import { DateTime } from 'luxon';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  ParsePostInput,
  ProcessedEvent,
  ExtractedItem,
  FormattedEvent,
  TimeResolvedEvent,
  ParsingConfig,
  DEFAULT_PARSING_CONFIG,
  EstablishmentMap,
  OcrDebugSnapshot,
  ParseSkipReason,
  ContentType,
  ParseStageArtifactsSnapshot,
  Stage45ReplayArtifacts,
} from './types.js';
import { detectCalendarSignals, validateContent } from './contentValidator.js';
import { classifyContent } from './contentClassifier.js';
import { extractContentByType, extractOcrDebugText } from './eventExtractor.js';
import { enrichEventsFromTicketLinks } from './ticketLinkEnricher.js';
import { enrichEventsFromCalendarLinks } from './calendarLinkEnricher.js';
import { enrichEventsFromVenueWebsite } from './websiteDetailEnricher.js';
import { performSecondaryValidation } from './secondaryValidator.js';
import { performFinalFormatting } from './finalFormatter.js';
import { resolveTimesWithOperatingHours } from './venueResolver.js';
import { parseBooleanEnv, parseNumberEnv } from './runtimeConfig.js';
import { logger } from '../utils/logger.js';

const CATEGORY_END_DEFAULTS: Record<string, string> = {
  'Happy Hour': '19:00',
  'Wing Night': '21:00',
  'Food Special': '21:00',
  'Drink Special': '23:00',
  'Live Music': '01:00',
  'DJ/Nightlife': '02:00',
  'Comedy': '23:00',
  'Trivia Night': '22:00',
  'Karaoke': '01:00',
  'Open Mic': '23:00',
  'Workshops & Classes': '21:00',
  'Sports': '23:00',
  'Family Friendly': '21:00',
  'Gatherings & Parties': '23:00',
  'Religious': '21:00',
  'Cinema': '23:00',
};
const SPECIAL_LIKE_CATEGORY_PATTERN = /\b(food special|drink special|happy hour|wing night)\b/i;
const SHORT_FORM_PROGRAM_PATTERN =
  /\b(class|classes|workshop|workshops|lesson|lessons|training|fitness|tai chi|yoga|dance|body bar|rueda|salsa|bachata|heels|belly dance|masterclass|session|sessions|drop-?in|beginner|group)\b/i;
const NIGHTLIFE_LIKE_CATEGORIES = new Set([
  'Live Music',
  'Comedy',
  'DJ/Nightlife',
  'Karaoke',
  'Open Mic',
  'Gatherings & Parties',
]);
const NIGHTLIFE_LIKE_HINT_PATTERN =
  /\b(karaoke|dj|late\s*night|party|after\s*party|open mic|live music|concert|band|club night)\b/i;
const CLOSING_HINT_PATTERN =
  /\bopen\s*(?:['’]?\s*til|till|until)\s*(\d{1,2}(?::\d{2})?)\s*\.?\s*(a\.?\s*m\.?|p\.?\s*m\.?)\b/gi;

const MAX_OCR_IMAGES = 4;
const MAX_OCR_OUTPUT_IMAGES_DEFAULT = 16;
const MAX_OCR_OUTPUT_IMAGES_CALENDAR = 50;
const OCR_TILE_MODE_CALENDAR = 'calendar';
const OCR_IMAGE_UPLOAD_FOLDER = 'postimages';
const PROFILE_IMAGE_UPLOAD_FOLDER = 'profilepictures';
const OCR_IMAGE_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
const OCR_IMAGE_DOWNLOAD_TIMEOUT_MS = 12000;
const OCR_IMAGE_UPLOAD_TIMEOUT_MS = 30000;
const OCR_IMAGE_UPLOAD_RETRIES = 2;
const CURL_DOWNLOAD_MAX_BUFFER_BYTES = OCR_IMAGE_UPLOAD_MAX_BYTES + 512 * 1024;
const execFileAsync = promisify(execFile);

const ocrTileBaseMap = new Map<string, string>();
const ocrUploadedSourceMap = new Map<string, string>();
const sourceManagedImageMap = new Map<string, string>();

function logTiming(
  step: string,
  startMs: number,
  details: Record<string, unknown> = {}
): void {
  logger.info('Timing', { step, durationMs: Date.now() - startMs, ...details });
}

function deepCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function emitStageArtifacts(
  cfg: ParsingConfig,
  snapshot: ParseStageArtifactsSnapshot
): Promise<void> {
  if (typeof cfg.stageArtifactsHandler !== 'function') return;
  try {
    await cfg.stageArtifactsHandler(snapshot);
  } catch (error) {
    logger.warn('stageArtifactsHandler failed', {
      source: snapshot.source,
      contentType: snapshot.contentType,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

interface Stage2ScoreThresholds {
  calendarScoreMin: number;
  calendarMarginMin: number;
  scheduleScoreMin: number;
  scheduleMarginMin: number;
  smallPostMaxItems: number;
  tiledCalendarScoreMin: number;
  tiledMinItems: number;
  scheduleBlockIfGrid: boolean;
  ambiguousRoute: 'CALENDAR_BASIC' | 'KEEP_MODEL';
}

interface Stage2ScoreRoutingDecision {
  enabled: boolean;
  shadowEnabled: boolean;
  forceContentTypeOverride: boolean;
  shouldUseRoutedContentType: boolean;
  originalContentType: ContentType;
  routedContentType: ContentType;
  routingReason: string;
  calendarScore: number;
  scheduleScore: number;
  scoreDelta: number;
  isAmbiguous: boolean;
  ocrMode: 'basic' | 'tiled';
  shouldUseCalendarTiles: boolean;
  legacyShouldUseCalendarTiles: boolean;
  signals: {
    hasCalendarGrid: boolean;
    recommendsTiling: boolean;
    hasDenseText: boolean;
    maxTextDensityScore: number;
    allPromotionalPhoto: boolean;
    organizationStyle: string;
    weekdayCount: number;
    timeLines: number;
    hasTextCalendarSignal: boolean;
    hasLinkedCalendarSignal: boolean;
    estimatedItemCount: number;
    hasEvents: boolean;
    hasFoodSpecials: boolean;
    hasMultipleItems: boolean;
    hasMultipleEventListings: boolean;
    hasComplexitySignals: boolean;
    recommendsTilingCount: number;
  };
  thresholds: Stage2ScoreThresholds;
}

interface ModelRouterConfig {
  enabled: boolean;
  shadowEnabled: boolean;
  fallbackRetryEnabled: boolean;
  fallbackModel: string;
  enableStage1: boolean;
  enableStage2: boolean;
  enableStage3Event: boolean;
  enableStage3Specials: boolean;
  enableStage3Mixed: boolean;
  stage1Model: string;
  stage2Model: string;
  stage3CalendarModel: string;
  stage3ScheduleModel: string;
  stage3EventModelLow: string;
  stage3EventModelHigh: string;
  stage3SpecialsModelLow: string;
  stage3SpecialsModelHigh: string;
  stage3MixedModelLow: string;
  stage3MixedModelHigh: string;
  eventMiniMaxItems: number;
  specialsMiniMaxItems: number;
  mixedMiniMaxItems: number;
  highIfHasCalendarGrid: boolean;
  highIfRecommendsTiling: boolean;
  highIfHasMultipleEventListings: boolean;
  mixedHighRequireMinItemsForMultipleListings: boolean;
  mixedHighMinItemsForMultipleListings: number;
  unknownItemCountForceHigh: boolean;
}

interface Stage3ModelRoutingDecision {
  appliedModel: string;
  fallbackModel: string;
  appliedByRouter: boolean;
  routeEnabled: boolean;
  recommendedModel: string;
  complexityTier: 'low' | 'high';
  complexityReasons: string[];
  contentType: ContentType;
  thresholds: {
    eventMiniMaxItems: number;
    specialsMiniMaxItems: number;
    mixedMiniMaxItems: number;
  };
}

function resolveModelEnv(varName: string, fallback: string): string {
  const raw = String(process.env[varName] || '').trim();
  return raw || fallback;
}

function resolveModelRouterConfig(cfg: ParsingConfig): ModelRouterConfig {
  return {
    enabled: parseBooleanEnv('ENABLE_MODEL_ROUTER', false),
    shadowEnabled: parseBooleanEnv('ENABLE_MODEL_ROUTER_SHADOW_LOG', true),
    fallbackRetryEnabled: parseBooleanEnv('ENABLE_MODEL_ROUTER_FALLBACK_RETRY', true),
    fallbackModel: resolveModelEnv('MODEL_ROUTER_FALLBACK_MODEL', 'gpt-5.2'),
    enableStage1: parseBooleanEnv('ENABLE_MODEL_ROUTER_STAGE1', false),
    enableStage2: parseBooleanEnv('ENABLE_MODEL_ROUTER_STAGE2', false),
    enableStage3Event: parseBooleanEnv('ENABLE_MODEL_ROUTER_STAGE3_EVENT', false),
    enableStage3Specials: parseBooleanEnv('ENABLE_MODEL_ROUTER_STAGE3_SPECIALS', false),
    enableStage3Mixed: parseBooleanEnv('ENABLE_MODEL_ROUTER_STAGE3_MIXED', false),
    stage1Model: resolveModelEnv('MODEL_ROUTER_STAGE1_MODEL', 'gpt-5-mini'),
    stage2Model: resolveModelEnv('MODEL_ROUTER_STAGE2_MODEL', 'gpt-5-mini'),
    stage3CalendarModel: resolveModelEnv('MODEL_ROUTER_STAGE3_CALENDAR_MODEL', 'gpt-5.2'),
    stage3ScheduleModel: resolveModelEnv('MODEL_ROUTER_STAGE3_SCHEDULE_MODEL', 'gpt-5.2'),
    stage3EventModelLow: resolveModelEnv('MODEL_ROUTER_STAGE3_EVENT_MODEL_LOW', 'gpt-5-mini'),
    stage3EventModelHigh: resolveModelEnv('MODEL_ROUTER_STAGE3_EVENT_MODEL_HIGH', 'gpt-5.2'),
    stage3SpecialsModelLow: resolveModelEnv(
      'MODEL_ROUTER_STAGE3_SPECIALS_MODEL_LOW',
      'gpt-5-mini'
    ),
    stage3SpecialsModelHigh: resolveModelEnv(
      'MODEL_ROUTER_STAGE3_SPECIALS_MODEL_HIGH',
      'gpt-5.2'
    ),
    stage3MixedModelLow: resolveModelEnv('MODEL_ROUTER_STAGE3_MIXED_MODEL_LOW', 'gpt-5-mini'),
    stage3MixedModelHigh: resolveModelEnv('MODEL_ROUTER_STAGE3_MIXED_MODEL_HIGH', 'gpt-5.2'),
    eventMiniMaxItems: parseNumberEnv('MODEL_ROUTER_EVENT_MINI_MAX_ITEMS', 6),
    specialsMiniMaxItems: parseNumberEnv('MODEL_ROUTER_SPECIALS_MINI_MAX_ITEMS', 10),
    mixedMiniMaxItems: parseNumberEnv('MODEL_ROUTER_MIXED_MINI_MAX_ITEMS', 12),
    highIfHasCalendarGrid: parseBooleanEnv('MODEL_ROUTER_HIGH_IF_HAS_CALENDAR_GRID', true),
    highIfRecommendsTiling: parseBooleanEnv('MODEL_ROUTER_HIGH_IF_RECOMMENDS_TILING', true),
    highIfHasMultipleEventListings: parseBooleanEnv(
      'MODEL_ROUTER_HIGH_IF_HAS_MULTIPLE_EVENT_LISTINGS',
      true
    ),
    mixedHighRequireMinItemsForMultipleListings: parseBooleanEnv(
      'MODEL_ROUTER_MIXED_HIGH_REQUIRE_MIN_ITEMS_FOR_MULTIPLE_LISTINGS',
      false
    ),
    mixedHighMinItemsForMultipleListings: parseNumberEnv(
      'MODEL_ROUTER_MIXED_HIGH_MIN_ITEMS_FOR_MULTIPLE_LISTINGS',
      8
    ),
    unknownItemCountForceHigh: parseBooleanEnv('MODEL_ROUTER_UNKNOWN_ITEMCOUNT_FORCE_HIGH', true),
  };
}

function resolveStage3ModelRouting(
  contentType: ContentType,
  classification: any,
  stage2Routing: Stage2ScoreRoutingDecision,
  cfg: ParsingConfig,
  router: ModelRouterConfig
): Stage3ModelRoutingDecision {
  if (contentType === 'CALENDAR') {
    const recommendedModel = router.stage3CalendarModel;
    const routeEnabled = router.enabled;
    return {
      appliedModel: routeEnabled ? recommendedModel : cfg.gptModelReasoning,
      fallbackModel: router.fallbackModel,
      appliedByRouter: routeEnabled,
      routeEnabled,
      recommendedModel,
      complexityTier: 'high',
      complexityReasons: ['content_type_calendar'],
      contentType,
      thresholds: {
        eventMiniMaxItems: router.eventMiniMaxItems,
        specialsMiniMaxItems: router.specialsMiniMaxItems,
        mixedMiniMaxItems: router.mixedMiniMaxItems,
      },
    };
  }

  if (contentType === 'SCHEDULE') {
    const recommendedModel = router.stage3ScheduleModel;
    const routeEnabled = router.enabled;
    return {
      appliedModel: routeEnabled ? recommendedModel : cfg.gptModelReasoning,
      fallbackModel: router.fallbackModel,
      appliedByRouter: routeEnabled,
      routeEnabled,
      recommendedModel,
      complexityTier: 'high',
      complexityReasons: ['content_type_schedule'],
      contentType,
      thresholds: {
        eventMiniMaxItems: router.eventMiniMaxItems,
        specialsMiniMaxItems: router.specialsMiniMaxItems,
        mixedMiniMaxItems: router.mixedMiniMaxItems,
      },
    };
  }

  const estimatedItemCount = Number(classification?.estimatedItemCount || 0);
  const signals = stage2Routing?.signals || ({} as any);
  const reasons: string[] = [];
  let highComplexity = false;

  if (router.highIfHasCalendarGrid && Boolean(signals.hasCalendarGrid)) {
    highComplexity = true;
    reasons.push('has_calendar_grid');
  }
  if (router.highIfRecommendsTiling && Boolean(signals.recommendsTiling)) {
    highComplexity = true;
    reasons.push('recommends_tiling');
  }
  if (router.highIfHasMultipleEventListings && Boolean(signals.hasMultipleEventListings)) {
    if (
      contentType === 'MIXED_EVENTS_AND_SPECIALS' &&
      router.mixedHighRequireMinItemsForMultipleListings
    ) {
      if (Number.isFinite(estimatedItemCount) && estimatedItemCount >= router.mixedHighMinItemsForMultipleListings) {
        highComplexity = true;
        reasons.push('has_multiple_event_listings');
      } else {
        reasons.push(
          `mixed_multiple_listings_below_${router.mixedHighMinItemsForMultipleListings}`
        );
      }
    } else {
      highComplexity = true;
      reasons.push('has_multiple_event_listings');
    }
  }
  if (router.unknownItemCountForceHigh && (!Number.isFinite(estimatedItemCount) || estimatedItemCount <= 0)) {
    highComplexity = true;
    reasons.push('unknown_item_count');
  }

  let routeEnabled = false;
  let lowModel = cfg.gptModelReasoning;
  let highModel = cfg.gptModelReasoning;
  let maxItems = router.mixedMiniMaxItems;

  if (contentType === 'EVENT') {
    routeEnabled = router.enabled && router.enableStage3Event;
    lowModel = router.stage3EventModelLow;
    highModel = router.stage3EventModelHigh;
    maxItems = router.eventMiniMaxItems;
  } else if (contentType === 'FOOD_SPECIAL') {
    routeEnabled = router.enabled && router.enableStage3Specials;
    lowModel = router.stage3SpecialsModelLow;
    highModel = router.stage3SpecialsModelHigh;
    maxItems = router.specialsMiniMaxItems;
  } else if (contentType === 'MIXED_EVENTS_AND_SPECIALS') {
    routeEnabled = router.enabled && router.enableStage3Mixed;
    lowModel = router.stage3MixedModelLow;
    highModel = router.stage3MixedModelHigh;
    maxItems = router.mixedMiniMaxItems;
  }

  if (Number.isFinite(estimatedItemCount) && estimatedItemCount > maxItems) {
    highComplexity = true;
    reasons.push(`estimated_items_gt_${maxItems}`);
  }

  if (!highComplexity) {
    reasons.push('low_complexity');
  }

  const recommendedModel = highComplexity ? highModel : lowModel;
  return {
    appliedModel: routeEnabled ? recommendedModel : cfg.gptModelReasoning,
    fallbackModel: router.fallbackModel,
    appliedByRouter: routeEnabled,
    routeEnabled,
    recommendedModel,
    complexityTier: highComplexity ? 'high' : 'low',
    complexityReasons: reasons,
    contentType,
      thresholds: {
        eventMiniMaxItems: router.eventMiniMaxItems,
        specialsMiniMaxItems: router.specialsMiniMaxItems,
        mixedMiniMaxItems: router.mixedMiniMaxItems,
        mixedHighRequireMinItemsForMultipleListings:
          router.mixedHighRequireMinItemsForMultipleListings,
        mixedHighMinItemsForMultipleListings: router.mixedHighMinItemsForMultipleListings,
      },
    };
}

function detectLinkedCalendarSignal(text: string, hasImages: boolean): boolean {
  const t = String(text || '');
  const hasEventsLink =
    /\b(?:https?:\/\/|www\.)[^\s"'<>]*\/(?:events?|calendar|programs?)(?:[\/?#][^\s"'<>]*)?/i.test(
      t
    );
  const hasProgramLanguage =
    /\b(this week|weekly|month calendar|upcoming|programs?|schedule|what'?s on|full list|at the library)\b/i.test(
      t
    );
  return hasEventsLink && (hasProgramLanguage || hasImages);
}

function resolveSmallPostFallbackType(
  classification: any,
  scheduleScore: number,
  thresholds: Stage2ScoreThresholds
): ContentType {
  const hasFoodSpecials = Boolean(classification?.contentAnalysis?.hasFoodSpecials);
  const hasEvents = Boolean(classification?.contentAnalysis?.hasEvents);
  if (hasFoodSpecials && hasEvents) return 'MIXED_EVENTS_AND_SPECIALS';
  if (hasFoodSpecials) return 'FOOD_SPECIAL';
  if (scheduleScore >= thresholds.scheduleScoreMin) return 'SCHEDULE';
  return 'EVENT';
}

function shouldForceEventRowToCalendar(
  originalContentType: ContentType,
  hasFoodSpecials: boolean,
  estimatedItemCount: number,
  calendarScore: number,
  hasCalendarGrid: boolean,
  recommendsTiling: boolean,
  hasMultipleEventListings: boolean,
  allPromotionalPhoto: boolean,
  hasTextCalendarSignal: boolean,
  hasLinkedCalendarSignal: boolean,
  organizationStyle: string,
  thresholds: Stage2ScoreThresholds
): boolean {
  const isEventLike =
    originalContentType === 'EVENT' || originalContentType === 'MIXED_EVENTS_AND_SPECIALS';
  if (!isEventLike) return false;
  if (hasFoodSpecials) return false;
  if (allPromotionalPhoto) return false;
  if (!hasMultipleEventListings) return false;

  const strongImageCalendarSignal =
    hasCalendarGrid ||
    (recommendsTiling && hasMultipleEventListings);
  if (!strongImageCalendarSignal) return false;

  const hasScheduleLikeSupport =
    hasTextCalendarSignal ||
    hasLinkedCalendarSignal ||
    organizationStyle.includes('date') ||
    organizationStyle.includes('time') ||
    hasCalendarGrid;
  if (!hasScheduleLikeSupport) return false;

  const requiredItemCount = Math.max(thresholds.tiledMinItems, 8);
  if (estimatedItemCount < requiredItemCount) return false;

  const requiredCalendarScore = Math.max(
    thresholds.calendarScoreMin,
    thresholds.tiledCalendarScoreMin
  );
  if (calendarScore < requiredCalendarScore) return false;

  return true;
}

export function resolveStage2ScoreRouting(
  combinedText: string,
  classification: any,
  validation: any
): Stage2ScoreRoutingDecision {
  const thresholds: Stage2ScoreThresholds = {
    calendarScoreMin: parseNumberEnv('STAGE2_CALENDAR_SCORE_MIN', 8),
    calendarMarginMin: parseNumberEnv('STAGE2_CALENDAR_MARGIN_MIN', 2),
    scheduleScoreMin: parseNumberEnv('STAGE2_SCHEDULE_SCORE_MIN', 7),
    scheduleMarginMin: parseNumberEnv('STAGE2_SCHEDULE_MARGIN_MIN', 2),
    smallPostMaxItems: parseNumberEnv('STAGE2_SMALL_POST_MAX_ITEMS', 5),
    tiledCalendarScoreMin: parseNumberEnv('STAGE2_TILED_CALENDAR_SCORE_MIN', 10),
    tiledMinItems: parseNumberEnv('STAGE2_TILED_MIN_ITEMS', 8),
    scheduleBlockIfGrid: parseBooleanEnv('STAGE2_SCHEDULE_BLOCK_IF_GRID', true),
    ambiguousRoute:
      String(process.env.STAGE2_AMBIGUOUS_ROUTE || 'CALENDAR_BASIC')
        .trim()
        .toUpperCase() === 'KEEP_MODEL'
        ? 'KEEP_MODEL'
        : 'CALENDAR_BASIC',
  };

  const enabled = parseBooleanEnv('ENABLE_STAGE2_SCORE_ROUTING', false);
  const shadowEnabled = parseBooleanEnv('ENABLE_STAGE2_SCORE_SHADOW_LOG', true);

  const originalContentType = (classification?.contentType || 'EVENT') as ContentType;
  const complexitySignals = (validation?.imageAnalysis || [])
    .map((img: any) => img?.imageComplexity)
    .filter(Boolean);
  const hasComplexitySignals = complexitySignals.length > 0;
  const recommendsTilingCount = complexitySignals.filter((c: any) => c?.recommendsTiling).length;
  const legacyIsCalendarOrSchedule =
    originalContentType === 'CALENDAR' || originalContentType === 'SCHEDULE';
  const legacyShouldUseCalendarTiles =
    legacyIsCalendarOrSchedule && (!hasComplexitySignals || recommendsTilingCount > 0);

  const hasCalendarGrid = complexitySignals.some((c: any) => Boolean(c?.hasCalendarGrid));
  const recommendsTiling = complexitySignals.some((c: any) => Boolean(c?.recommendsTiling));
  const hasDenseText = complexitySignals.some((c: any) => Boolean(c?.hasDenseText));
  const hasMultipleEventListings = complexitySignals.some((c: any) =>
    Boolean(c?.hasMultipleEventListings)
  );
  const maxTextDensityScore = complexitySignals.reduce(
    (max: number, c: any) => Math.max(max, Number(c?.textDensityScore || 0)),
    0
  );
  const allPromotionalPhoto =
    complexitySignals.length > 0 &&
    complexitySignals.every((c: any) => Boolean(c?.isPromotionalPhoto));

  const textSignals = detectCalendarSignals(combinedText);
  const hasTextCalendarSignal = Boolean(textSignals?.hasCalendar);
  const hasLinkedCalendarSignal = detectLinkedCalendarSignal(combinedText, hasComplexitySignals);
  const organizationStyle = String(classification?.contentAnalysis?.organizationStyle || '').toLowerCase();
  const hasEvents = Boolean(classification?.contentAnalysis?.hasEvents);
  const hasFoodSpecials = Boolean(classification?.contentAnalysis?.hasFoodSpecials);
  const hasMultipleItems = Boolean(classification?.contentAnalysis?.hasMultipleItems);
  const estimatedItemCount = Number(classification?.estimatedItemCount || 0);

  let calendarScore = 0;
  let scheduleScore = 0;

  if (hasCalendarGrid) {
    calendarScore += 5;
    scheduleScore -= 5;
  }
  if (recommendsTiling) {
    calendarScore += 3;
    scheduleScore -= 2;
  }
  if (hasDenseText) {
    calendarScore += 1;
  }
  if (maxTextDensityScore >= 0.85) {
    calendarScore += 2;
  } else if (maxTextDensityScore >= 0.65) {
    calendarScore += 1;
  }
  if (allPromotionalPhoto) {
    calendarScore -= 4;
    scheduleScore += 2;
  }
  if (organizationStyle.includes('by date') || organizationStyle.includes('calendar')) {
    calendarScore += 3;
    scheduleScore -= 1;
  }
  if (organizationStyle.includes('time')) {
    scheduleScore += 4;
  }
  if (Number(textSignals?.weekdayCount || 0) >= 3) {
    calendarScore += 1;
    scheduleScore += 2;
  }
  if (Number(textSignals?.timeLines || 0) >= 3) {
    scheduleScore += 2;
  }
  if (estimatedItemCount >= 20) {
    calendarScore += 3;
    scheduleScore += 1;
  } else if (estimatedItemCount >= 8) {
    calendarScore += 2;
  } else if (estimatedItemCount >= 6) {
    calendarScore += 1;
  } else if (estimatedItemCount > 0 && estimatedItemCount <= thresholds.smallPostMaxItems) {
    calendarScore -= 4;
    scheduleScore -= 1;
  }
  if (hasLinkedCalendarSignal) {
    calendarScore += 2;
  }
  if (hasTextCalendarSignal) {
    calendarScore += 2;
  }

  const smallPostGuard = estimatedItemCount > 0 && estimatedItemCount <= thresholds.smallPostMaxItems;
  const calendarEligible =
    calendarScore >= thresholds.calendarScoreMin &&
    calendarScore - scheduleScore >= thresholds.calendarMarginMin;
  const scheduleBlockedByGrid = thresholds.scheduleBlockIfGrid && hasCalendarGrid;
  const scheduleEligible =
    scheduleScore >= thresholds.scheduleScoreMin &&
    scheduleScore - calendarScore >= thresholds.scheduleMarginMin &&
    !scheduleBlockedByGrid;
  const isAmbiguous =
    calendarScore >= thresholds.calendarScoreMin &&
    scheduleScore >= thresholds.scheduleScoreMin &&
    Math.abs(calendarScore - scheduleScore) <
      Math.max(thresholds.calendarMarginMin, thresholds.scheduleMarginMin);

  let routedContentType: ContentType = originalContentType;
  let routingReason = 'keep_model';
  let forceContentTypeOverride = false;

  if (
    shouldForceEventRowToCalendar(
      originalContentType,
      hasFoodSpecials,
      estimatedItemCount,
      calendarScore,
      hasCalendarGrid,
      recommendsTiling,
      hasMultipleEventListings,
      allPromotionalPhoto,
      hasTextCalendarSignal,
      hasLinkedCalendarSignal,
      organizationStyle,
      thresholds
    )
  ) {
    routedContentType = 'CALENDAR';
    routingReason = 'image_calendar_guard';
    forceContentTypeOverride = true;
  }

  if (
    !forceContentTypeOverride &&
    (originalContentType === 'CALENDAR' || originalContentType === 'SCHEDULE')
  ) {
    if (smallPostGuard && originalContentType === 'CALENDAR') {
      routedContentType = resolveSmallPostFallbackType(classification, scheduleScore, thresholds);
      routingReason = 'small_post_guard';
    } else if (calendarEligible) {
      routedContentType = 'CALENDAR';
      routingReason = 'calendar_score';
    } else if (scheduleEligible) {
      routedContentType = 'SCHEDULE';
      routingReason = 'schedule_score';
    } else if (isAmbiguous && thresholds.ambiguousRoute === 'CALENDAR_BASIC') {
      routedContentType = 'CALENDAR';
      routingReason = 'ambiguous_calendar_basic';
    }
  }

  const hasTiledSignal =
    hasCalendarGrid || recommendsTiling || maxTextDensityScore >= 0.75;
  const shouldUseTiledCalendarOcr =
    routedContentType === 'CALENDAR' &&
    !smallPostGuard &&
    calendarScore >= thresholds.tiledCalendarScoreMin &&
    estimatedItemCount >= thresholds.tiledMinItems &&
    hasTiledSignal;

  const shouldUseRoutedContentType = enabled || forceContentTypeOverride;
  const shouldUseCalendarTiles = shouldUseRoutedContentType
    ? shouldUseTiledCalendarOcr
    : legacyShouldUseCalendarTiles;

  return {
    enabled,
    shadowEnabled,
    forceContentTypeOverride,
    shouldUseRoutedContentType,
    originalContentType,
    routedContentType,
    routingReason,
    calendarScore,
    scheduleScore,
    scoreDelta: calendarScore - scheduleScore,
    isAmbiguous,
    ocrMode: shouldUseTiledCalendarOcr ? 'tiled' : 'basic',
    shouldUseCalendarTiles,
    legacyShouldUseCalendarTiles,
    signals: {
      hasCalendarGrid,
      recommendsTiling,
      hasDenseText,
      maxTextDensityScore,
      allPromotionalPhoto,
      organizationStyle,
      weekdayCount: Number(textSignals?.weekdayCount || 0),
      timeLines: Number(textSignals?.timeLines || 0),
      hasTextCalendarSignal,
      hasLinkedCalendarSignal,
      estimatedItemCount,
      hasEvents,
      hasFoodSpecials,
      hasMultipleItems,
      hasMultipleEventListings,
      hasComplexitySignals,
      recommendsTilingCount,
    },
    thresholds,
  };
}

function normalizeReplayArtifacts(
  artifacts?: Stage45ReplayArtifacts
): Stage45ReplayArtifacts | null {
  if (!artifacts || typeof artifacts !== 'object') return null;
  const stage3Items = Array.isArray(artifacts.stage3Items)
    ? artifacts.stage3Items.filter((item) => item && typeof item === 'object')
    : [];
  const stage4Items = Array.isArray(artifacts.stage4Items)
    ? artifacts.stage4Items.filter((item) => item && typeof item === 'object')
    : [];

  if (stage3Items.length === 0 && stage4Items.length === 0) return null;

  return {
    stage3Items: stage3Items.length > 0 ? deepCloneJson(stage3Items) : undefined,
    stage4Items: stage4Items.length > 0 ? deepCloneJson(stage4Items) : undefined,
    stage37TicketUrl: String(artifacts.stage37TicketUrl || '').trim() || undefined,
    contentType: artifacts.contentType,
  };
}

/**
 * Replay Stage 4+ using previously captured Stage 3/Stage 4 artifacts.
 * This avoids running Stage 1-3 GPT calls.
 */
export async function replayPostDataFromArtifacts(
  input: ParsePostInput,
  establishmentMap: EstablishmentMap = {},
  artifacts: Stage45ReplayArtifacts,
  config: Partial<ParsingConfig> = {}
): Promise<ProcessedEvent[]> {
  const cfg = { ...DEFAULT_PARSING_CONFIG, ...config };
  const reportSkipReason = async (skipReason: ParseSkipReason): Promise<void> => {
    if (typeof cfg.skipReasonHandler !== 'function') return;
    try {
      await cfg.skipReasonHandler(skipReason);
    } catch (error) {
      logger.warn('skipReasonHandler failed', {
        stage: skipReason.stage,
        reason: skipReason.reason,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const normalizedArtifacts = normalizeReplayArtifacts(artifacts);
  if (!normalizedArtifacts) {
    await reportSkipReason({
      stage: 'precheck',
      reason: 'Replay artifacts missing stage3Items/stage4Items',
    });
    return [];
  }

  const {
    combinedText,
    mediaUrls,
    sharedPostThumbnails,
    userName,
    pageName,
    timestamp,
    facebookUrl,
    profilePicUrl,
    extractedData,
  } = input;
  const postId = extractedData?.id || extractedData?.postId || '';
  const parseStart = Date.now();
  ocrTileBaseMap.clear();
  ocrUploadedSourceMap.clear();
  sourceManagedImageMap.clear();

  logger.info('replayPostDataFromArtifacts: Starting Stage 4+ replay', {
    userName,
    postId,
    hasStage3Items: Array.isArray(normalizedArtifacts.stage3Items),
    hasStage4Items: Array.isArray(normalizedArtifacts.stage4Items),
    contentType: normalizedArtifacts.contentType || 'unknown',
  });

  const establishmentInfo = establishmentMap[facebookUrl] || {};
  let partialAddress = establishmentInfo.address || '';
  const sourcePostMediaUrls = normalizeImageUrls(mediaUrls || [], MAX_OCR_IMAGES);
  const imageSources = [
    ...sourcePostMediaUrls,
    ...(sharedPostThumbnails || []),
  ];
  const allImageUrls = normalizeImageUrls(imageSources, MAX_OCR_IMAGES);
  const cleanupImageUrls = new Set<string>();

  const displayImageUploadStart = Date.now();
  const displayImageUrls = await prepareManagedDisplayImageUrls(sourcePostMediaUrls, {
    postId,
  });
  for (const url of displayImageUrls) {
    if (url) cleanupImageUrls.add(url);
  }
  logTiming('display_image_upload_replay', displayImageUploadStart, {
    postId,
    inputCount: sourcePostMediaUrls.length,
    outputCount: displayImageUrls.length,
  });

  const managedProfilePicUrl = await prepareManagedProfileIconUrl(profilePicUrl || '', {
    postId,
  });
  if (managedProfilePicUrl) cleanupImageUrls.add(managedProfilePicUrl);

  const extractionImageUrls =
    displayImageUrls.length > 0 ? displayImageUrls : sourcePostMediaUrls;
  let stage37TicketUrl = String(normalizedArtifacts.stage37TicketUrl || '').trim();

  let rawExtractedData: ExtractedItem[] = Array.isArray(normalizedArtifacts.stage3Items)
    ? deepCloneJson(normalizedArtifacts.stage3Items)
    : Array.isArray(normalizedArtifacts.stage4Items)
      ? deepCloneJson(normalizedArtifacts.stage4Items)
      : [];

  if (rawExtractedData.length === 0) {
    await reportSkipReason({
      stage: 'stage3',
      reason: 'Replay artifacts contained no usable items',
    });
    return [];
  }

  rawExtractedData.forEach((item, idx) => {
    item._pipelineIndex = item._pipelineIndex || idx + 1;
    item._pipelineTotalStage3 = item._pipelineTotalStage3 || rawExtractedData.length;
  });

  if (extractedData?.utcStartDate && !Array.isArray(normalizedArtifacts.stage4Items)) {
    applyFacebookEventTimes(rawExtractedData, extractedData.utcStartDate, cfg.timezone);
  }

  await emitStageArtifacts(cfg, {
    source: 'replay',
    contentType: normalizedArtifacts.contentType || 'unknown',
    stage3Items: deepCloneJson(rawExtractedData),
    stage37TicketUrl: stage37TicketUrl || undefined,
  });

  // ========================================
  // STAGE 4: Secondary Validation
  // ========================================
  logger.info('=== STAGE 4: SECONDARY VALIDATION (REPLAY) ===');
  let validatedData: ExtractedItem[] = [];
  if (Array.isArray(normalizedArtifacts.stage4Items) && normalizedArtifacts.stage4Items.length > 0) {
    validatedData = deepCloneJson(normalizedArtifacts.stage4Items);
    logger.info('Replay using provided Stage 4 artifacts', {
      postId,
      validatedCount: validatedData.length,
    });
  } else {
    const stage4Start = Date.now();
    validatedData = await performSecondaryValidation(
      rawExtractedData,
      userName,
      timestamp,
      cfg
    );
    logTiming('stage4_validate_replay', stage4Start, {
      postId,
      validatedCount: validatedData?.length || 0,
    });
  }

  if (!validatedData || validatedData.length === 0) {
    await reportSkipReason({
      stage: 'stage4',
      reason: 'Replay produced no Stage 4 validated items',
    });
    return [];
  }

  await emitStageArtifacts(cfg, {
    source: 'replay',
    contentType: normalizedArtifacts.contentType || 'unknown',
    stage4Items: deepCloneJson(validatedData),
    stage37TicketUrl: stage37TicketUrl || undefined,
  });

  // ========================================
  // STAGE 5: Final Formatting
  // ========================================
  logger.info('=== STAGE 5: FINAL FORMATTING (REPLAY) ===');
  const stage5Start = Date.now();
  const formattedEvents = await performFinalFormatting(
    validatedData,
    userName,
    partialAddress,
    timestamp,
    cfg,
    input.combinedText
  );
  logTiming('stage5_format_replay', stage5Start, {
    postId,
    formattedCount: formattedEvents?.length || 0,
  });

  if (!formattedEvents || formattedEvents.length === 0) {
    await reportSkipReason({
      stage: 'stage5',
      reason: 'Replay produced no Stage 5 formatted items',
    });
    return [];
  }

  const formattedEventsWithFlags = mergeTimeFlags(formattedEvents, validatedData);
  const formattedEventsWithMediaHints = mergeTicketImageHints(
    formattedEventsWithFlags,
    validatedData,
    rawExtractedData
  );

  // ========================================
  // STAGE 5.5: Hours-Based Time Resolution
  // ========================================
  const stage55Start = Date.now();
  const timeResolvedEvents = await resolveTimesWithOperatingHours(
    formattedEventsWithMediaHints,
    userName,
    partialAddress,
    timestamp,
    cfg
  );
  logTiming('stage5_5_hours_replay', stage55Start, {
    postId,
    resolvedCount: timeResolvedEvents?.length || 0,
  });

  const normalizedEvents = applySpecialTimeFallbacks(timeResolvedEvents, timestamp, cfg.timezone);

  // ========================================
  // STAGE 5.6: Datetime Completeness
  // ========================================
  const stage56Start = Date.now();
  const finalizedEvents = enforceDateTimeCompleteness(
    normalizedEvents,
    timestamp,
    cfg.timezone,
    combinedText
  );
  logTiming('stage5_6_datetime_replay', stage56Start, {
    postId,
    finalizedCount: finalizedEvents?.length || 0,
  });

  const heroImageAnalysis = analyzeHeroImageSources(allImageUrls);
  const rawTicketImageHints = finalizedEvents.map((event) =>
    String((event as any)._ticketImageUrl || '').trim()
  );
  const ticketImageHintCount = rawTicketImageHints.filter((value) => Boolean(value)).length;
  const managedTicketImageHints =
    ticketImageHintCount > 0
      ? await uploadManagedHeroFallbacks(rawTicketImageHints, { postId })
      : [];
  for (const managedUrl of managedTicketImageHints) {
    if (managedUrl) cleanupImageUrls.add(managedUrl);
  }
  const heroImageOverrides = heroImageAnalysis.preferTicketImage
    ? managedTicketImageHints
    : [];

  const processedEvents = processEvents(
    finalizedEvents,
    userName,
    facebookUrl,
    managedProfilePicUrl,
    extractionImageUrls,
    displayImageUrls,
    sharedPostThumbnails,
    {
      ...(extractedData || {}),
      ticketsBuyUrl: extractedData?.ticketsBuyUrl || stage37TicketUrl || '',
    },
    heroImageOverrides,
    managedTicketImageHints
  );

  await cleanupUnusedOcrImages(Array.from(cleanupImageUrls), processedEvents);

  logTiming('parse_total_replay', parseStart, {
    postId,
    finalCount: processedEvents.length,
  });
  logger.info('replayPostDataFromArtifacts: Completed', {
    postId,
    finalCount: processedEvents.length,
  });

  return processedEvents;
}

/**
 * Main entry point for parsing post data
 * Orchestrates the complete 5-stage parsing pipeline
 */
export async function parsePostData(
  input: ParsePostInput,
  establishmentMap: EstablishmentMap = {},
  config: Partial<ParsingConfig> = {}
): Promise<ProcessedEvent[]> {
  const cfg = { ...DEFAULT_PARSING_CONFIG, ...config };
  const modelRouter = resolveModelRouterConfig(cfg);
  const reportSkipReason = async (skipReason: ParseSkipReason): Promise<void> => {
    if (typeof cfg.skipReasonHandler !== 'function') return;
    try {
      await cfg.skipReasonHandler(skipReason);
    } catch (error) {
      logger.warn('skipReasonHandler failed', {
        stage: skipReason.stage,
        reason: skipReason.reason,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const {
    combinedText,
    mediaUrls,
    sharedPostThumbnails,
    userName,
    pageName,
    timestamp,
    facebookUrl,
    profilePicUrl,
    extractedData,
  } = input;

  const postId = extractedData?.id || extractedData?.postId || '';
  const parseStart = Date.now();
  // Keep mappings isolated to the current row parse.
  ocrTileBaseMap.clear();
  ocrUploadedSourceMap.clear();
  sourceManagedImageMap.clear();

  logger.info('parsePostData: Starting 5-stage parsing system', {
    userName,
    textLength: combinedText.length,
    mediaCount: mediaUrls.length,
    timestamp,
  });

  // Setup address information
  const establishmentInfo = establishmentMap[facebookUrl] || {};
  let partialAddress = establishmentInfo.address || '';
  const category = establishmentInfo.category || '';

  // Prepare image data (include shared thumbnails for OCR where available)
  const sourcePostMediaUrls = normalizeImageUrls(mediaUrls || [], MAX_OCR_IMAGES);
  const imageSources = [
    ...sourcePostMediaUrls,
    ...(sharedPostThumbnails || []),
  ];
  const allImageUrls = normalizeImageUrls(imageSources, MAX_OCR_IMAGES);
  logger.debug('Total unique images to process', {
    total: imageSources.length,
    usable: allImageUrls.length,
    cappedAt: MAX_OCR_IMAGES,
  });
  const ocrPrepStart = Date.now();
  const ocrImageUrls = await prepareOcrImageUrls(allImageUrls, {
    postId: extractedData?.id || extractedData?.postId || '',
    userName,
    pageName,
    combinedText,
  }, {
    calendarTiles: false,
  });
  logTiming('ocr_upload', ocrPrepStart, {
    postId,
    inputCount: allImageUrls.length,
    outputCount: ocrImageUrls.length,
  });
  let ocrDebugSnapshot: OcrDebugSnapshot | undefined;
  if (typeof cfg.ocrDebugHandler === 'function') {
    const ocrDebugStart = Date.now();
    ocrDebugSnapshot = await buildOcrDebugSnapshot(
      allImageUrls,
      ocrImageUrls,
      combinedText,
      cfg
    );
    logTiming('ocr_debug', ocrDebugStart, {
      postId,
      hasOcrText: Boolean(ocrDebugSnapshot?.ocrText),
      error: ocrDebugSnapshot?.error || '',
    });
    cfg.ocrDebugHandler(ocrDebugSnapshot);
  }
  const extractionText = appendOcrText(combinedText, ocrDebugSnapshot?.ocrText);

  // Early exit for empty content
  if (ocrImageUrls.length === 0 && !combinedText.trim()) {
    logger.info('No content to process');
    await reportSkipReason({
      stage: 'precheck',
      reason: 'Due to empty post content',
    });
    return [];
  }

  try {
    // ========================================
    // STAGE 1: Content Validation
    // ========================================
    logger.info('=== STAGE 1: CONTENT VALIDATION ===');
    const stage1Start = Date.now();
    const stage1RecommendedModel = modelRouter.stage1Model;
    const stage1AppliedModel =
      modelRouter.enabled && modelRouter.enableStage1
        ? stage1RecommendedModel
        : cfg.gptModelFast;
    if (modelRouter.shadowEnabled || (modelRouter.enabled && modelRouter.enableStage1)) {
      logger.info('Stage 1 model routing decision', {
        enabled: modelRouter.enabled,
        routeEnabled: modelRouter.enableStage1,
        recommendedModel: stage1RecommendedModel,
        appliedModel: stage1AppliedModel,
      });
    }
    const stage1Config =
      stage1AppliedModel === cfg.gptModelFast
        ? cfg
        : ({ ...cfg, gptModelFast: stage1AppliedModel } as ParsingConfig);
    const validation = await validateContent(
      combinedText,
      ocrImageUrls,
      userName,
      timestamp,
      stage1Config
    );
    logTiming('stage1_validate', stage1Start, { postId });

    if (!validation.hasValidContent || validation.validationDecision === 'VALIDATION_FAILED') {
      logger.info(`Content validation failed: ${validation.reason}`);
      await reportSkipReason({
        stage: 'stage1',
        reason: 'Due to failing Stage 1 validation',
        detail: validation.reason,
      });
      return [];
    }

    // ========================================
    // STAGE 2: Content Classification
    // ========================================
    logger.info('=== STAGE 2: CONTENT CLASSIFICATION ===');
    const stage2Start = Date.now();
    const stage2RecommendedModel = modelRouter.stage2Model;
    const stage2AppliedModel =
      modelRouter.enabled && modelRouter.enableStage2
        ? stage2RecommendedModel
        : cfg.gptModelFast;
    if (modelRouter.shadowEnabled || (modelRouter.enabled && modelRouter.enableStage2)) {
      logger.info('Stage 2 model routing decision', {
        enabled: modelRouter.enabled,
        routeEnabled: modelRouter.enableStage2,
        recommendedModel: stage2RecommendedModel,
        appliedModel: stage2AppliedModel,
      });
    }
    const stage2Config =
      stage2AppliedModel === cfg.gptModelFast
        ? cfg
        : ({ ...cfg, gptModelFast: stage2AppliedModel } as ParsingConfig);
    const classification = await classifyContent(
      combinedText,
      ocrImageUrls,
      userName,
      extractedData,
      stage2Config
    );
    logTiming('stage2_classify', stage2Start, { postId });

    if (!classification || classification.confidence < cfg.confidenceThreshold) {
      logger.info(`Classification confidence too low: ${classification?.confidence || 0}`);
      await reportSkipReason({
        stage: 'stage2',
        reason: 'Due to low Stage 2 classification confidence',
        detail: classification
          ? `confidence=${classification.confidence}, threshold=${cfg.confidenceThreshold}`
          : 'classification missing',
      });
      return [];
    }

    const stage2Routing = resolveStage2ScoreRouting(combinedText, classification, validation);
    const resolvedContentType = stage2Routing.shouldUseRoutedContentType
      ? stage2Routing.routedContentType
      : classification.contentType;

    if (stage2Routing.shadowEnabled) {
      logger.info('Stage 2 score routing shadow', {
        modelContentType: classification.contentType,
        routedContentType: stage2Routing.routedContentType,
        enabled: stage2Routing.enabled,
        forceContentTypeOverride: stage2Routing.forceContentTypeOverride,
        shouldUseRoutedContentType: stage2Routing.shouldUseRoutedContentType,
        routingReason: stage2Routing.routingReason,
        calendarScore: stage2Routing.calendarScore,
        scheduleScore: stage2Routing.scheduleScore,
        scoreDelta: stage2Routing.scoreDelta,
        isAmbiguous: stage2Routing.isAmbiguous,
        ocrMode: stage2Routing.ocrMode,
        legacyShouldUseCalendarTiles: stage2Routing.legacyShouldUseCalendarTiles,
        routedShouldUseCalendarTiles: stage2Routing.shouldUseCalendarTiles,
        signals: stage2Routing.signals,
        thresholds: stage2Routing.thresholds,
      });
    }

    if (
      stage2Routing.shouldUseRoutedContentType &&
      resolvedContentType !== classification.contentType
    ) {
      logger.info('Stage 2 score routing override applied', {
        modelContentType: classification.contentType,
        routedContentType: resolvedContentType,
        routingReason: stage2Routing.routingReason,
        calendarScore: stage2Routing.calendarScore,
        scheduleScore: stage2Routing.scheduleScore,
        scoreDelta: stage2Routing.scoreDelta,
        forceContentTypeOverride: stage2Routing.forceContentTypeOverride,
      });
    }

    logger.info(`Content classified as: ${resolvedContentType}`, {
      modelContentType: classification.contentType,
      estimatedItems: classification.estimatedItemCount,
      confidence: classification.confidence,
      routingEnabled: stage2Routing.enabled,
      forceContentTypeOverride: stage2Routing.forceContentTypeOverride,
      routingReason: stage2Routing.routingReason,
      ocrMode: stage2Routing.ocrMode,
    });

    let stage37TicketUrl = '';
    let extractionImageUrls = ocrImageUrls;
    const cleanupImageUrls = new Set<string>(ocrImageUrls);
    const displayImageUploadStart = Date.now();
    const displayImageUrls = await prepareManagedDisplayImageUrls(sourcePostMediaUrls, {
      postId: extractedData?.id || extractedData?.postId || '',
    });
    for (const url of displayImageUrls) {
      if (url) cleanupImageUrls.add(url);
    }
    logTiming('display_image_upload', displayImageUploadStart, {
      postId,
      inputCount: allImageUrls.length,
      outputCount: displayImageUrls.length,
    });
    const managedProfilePicUrl = await prepareManagedProfileIconUrl(profilePicUrl || '', {
      postId: extractedData?.id || extractedData?.postId || '',
    });
    if (managedProfilePicUrl) cleanupImageUrls.add(managedProfilePicUrl);
    const isCalendarOrSchedule =
      resolvedContentType === 'CALENDAR' ||
      resolvedContentType === 'SCHEDULE';
    const hasComplexitySignals = stage2Routing.signals.hasComplexitySignals;
    const recommendsTilingCount = stage2Routing.signals.recommendsTilingCount;
    const shouldUseCalendarTiles = stage2Routing.enabled
      ? resolvedContentType === 'CALENDAR' && stage2Routing.shouldUseCalendarTiles
      : stage2Routing.legacyShouldUseCalendarTiles;

    if (isCalendarOrSchedule) {
      if (shouldUseCalendarTiles) {
        const calendarPrepStart = Date.now();
        const calendarImageUrls = await prepareOcrImageUrls(
          allImageUrls,
          {
            postId: extractedData?.id || extractedData?.postId || '',
            userName,
            pageName,
            combinedText,
          },
          { calendarTiles: true }
        );
        logTiming('ocr_upload_calendar', calendarPrepStart, {
          postId,
          inputCount: allImageUrls.length,
          outputCount: calendarImageUrls.length,
        });
        if (calendarImageUrls.length > 0) {
          extractionImageUrls = calendarImageUrls;
          for (const url of calendarImageUrls) {
            cleanupImageUrls.add(url);
          }
        }
        logger.info('Calendar tile mode decision', {
          contentType: resolvedContentType,
          modelContentType: classification.contentType,
          enabled: calendarImageUrls.length > 0,
          baseCount: ocrImageUrls.length,
          tiledCount: calendarImageUrls.length,
          ocrMode: stage2Routing.ocrMode,
          routingEnabled: stage2Routing.enabled,
          routingReason: stage2Routing.routingReason,
          tilingSignals: {
            hasComplexitySignals,
            recommendsTilingCount,
          },
        });
      } else {
        logger.info('Calendar tile mode decision', {
          contentType: resolvedContentType,
          modelContentType: classification.contentType,
          enabled: false,
          baseCount: ocrImageUrls.length,
          tiledCount: 0,
          ocrMode: stage2Routing.ocrMode,
          routingEnabled: stage2Routing.enabled,
          routingReason: stage2Routing.routingReason,
          tilingSignals: {
            hasComplexitySignals,
            recommendsTilingCount,
          },
          reason: stage2Routing.enabled
            ? 'Stage 2 score routing selected basic OCR mode'
            : 'Stage 1 image complexity does not recommend tiling',
        });
      }
    }

    const stage3ModelRouting = resolveStage3ModelRouting(
      resolvedContentType,
      classification,
      stage2Routing,
      cfg,
      modelRouter
    );
    if (modelRouter.shadowEnabled || stage3ModelRouting.routeEnabled) {
      logger.info('Stage 3 model routing decision', {
        contentType: stage3ModelRouting.contentType,
        routeEnabled: stage3ModelRouting.routeEnabled,
        appliedByRouter: stage3ModelRouting.appliedByRouter,
        recommendedModel: stage3ModelRouting.recommendedModel,
        appliedModel: stage3ModelRouting.appliedModel,
        fallbackModel: stage3ModelRouting.fallbackModel,
        complexityTier: stage3ModelRouting.complexityTier,
        complexityReasons: stage3ModelRouting.complexityReasons,
        thresholds: stage3ModelRouting.thresholds,
        signals: {
          estimatedItemCount: stage2Routing.signals.estimatedItemCount,
          hasCalendarGrid: stage2Routing.signals.hasCalendarGrid,
          recommendsTiling: stage2Routing.signals.recommendsTiling,
          hasMultipleEventListings: stage2Routing.signals.hasMultipleEventListings,
        },
      });
    }

    const runStage3Pipeline = async (
      stage3Model: string,
      attempt: 'primary' | 'fallback'
    ): Promise<{ items: ExtractedItem[]; ticketUrl: string }> => {
      const stage3Cfg =
        stage3Model === cfg.gptModelReasoning
          ? cfg
          : ({ ...cfg, gptModelReasoning: stage3Model } as ParsingConfig);

      logger.info('=== STAGE 3: CONTENT EXTRACTION ===', {
        stage3Model,
        attempt,
      });
      const stage3Start = Date.now();
      let stage3Items = await extractContentByType(
        resolvedContentType,
        extractionText,
        extractionImageUrls,
        userName,
        timestamp,
        stage3Cfg
      );
      logTiming('stage3_extract', stage3Start, {
        postId,
        extractedCount: stage3Items?.length || 0,
        model: stage3Model,
        attempt,
      });

      logger.info('=== STAGE 3.7: TICKET LINK ENRICHMENT ===');
      const stage37Start = Date.now();
      const ticketUrls = extractedData?.ticketsBuyUrl ? [extractedData.ticketsBuyUrl] : [];
      const enrichmentResult = await enrichEventsFromTicketLinks(
        stage3Items,
        combinedText,
        ocrDebugSnapshot?.ocrText,
        ticketUrls,
        timestamp,
        stage3Cfg
      );
      const ticketUrl = String(
        enrichmentResult.summary.usedUrl || enrichmentResult.summary.candidateUrl || ''
      ).trim();
      stage3Items = Array.isArray(enrichmentResult.items) ? enrichmentResult.items : [];
      logTiming('stage3_7_ticket', stage37Start, {
        postId,
        appliedCount: enrichmentResult.summary.appliedCount,
        attemptedUrls: enrichmentResult.summary.attemptedUrls,
        bootstrapCreated: Boolean(enrichmentResult.summary.bootstrapCreated),
        usedUrl: ticketUrl,
        reason: enrichmentResult.summary.reason || '',
        model: stage3Model,
        attempt,
      });

      logger.info('=== STAGE 3.8: CALENDAR LINK ENRICHMENT ===');
      const stage38Start = Date.now();
      const calendarLinkResult = await enrichEventsFromCalendarLinks(
        stage3Items,
        combinedText,
        ocrDebugSnapshot?.ocrText,
        timestamp,
        userName,
        stage3Cfg
      );
      stage3Items = Array.isArray(calendarLinkResult.items) ? calendarLinkResult.items : [];
      logTiming('stage3_8_calendar_link', stage38Start, {
        postId,
        attemptedUrls: calendarLinkResult.summary.attemptedUrls,
        attemptedDates: calendarLinkResult.summary.attemptedDates,
        fetchedFeeds: calendarLinkResult.summary.fetchedFeeds,
        extractedCount: calendarLinkResult.summary.extractedCount,
        mergedCount: calendarLinkResult.summary.mergedCount,
        usedUrl: calendarLinkResult.summary.usedUrl || '',
        reason: calendarLinkResult.summary.reason || '',
        model: stage3Model,
        attempt,
      });

      logger.info('=== STAGE 3.9: VENUE WEBSITE ENRICHMENT ===');
      const stage39Start = Date.now();
      const venueWebsiteResult = await enrichEventsFromVenueWebsite(
        stage3Items,
        combinedText,
        ocrDebugSnapshot?.ocrText,
        timestamp,
        establishmentInfo,
        stage3Cfg
      );
      stage3Items = Array.isArray(venueWebsiteResult.items) ? venueWebsiteResult.items : [];
      logTiming('stage3_9_venue_website', stage39Start, {
        postId,
        attemptedUrls: venueWebsiteResult.summary.attemptedUrls,
        listingPagesAttempted: venueWebsiteResult.summary.listingPagesAttempted,
        detailPagesAttempted: venueWebsiteResult.summary.detailPagesAttempted,
        scriptFetchesAttempted: venueWebsiteResult.summary.scriptFetchesAttempted,
        apiRequestsAttempted: venueWebsiteResult.summary.apiRequestsAttempted,
        candidateItemsFound: venueWebsiteResult.summary.candidateItemsFound,
        appliedCount: venueWebsiteResult.summary.appliedCount,
        usedUrl: venueWebsiteResult.summary.usedUrl || '',
        reason: venueWebsiteResult.summary.reason || '',
        model: stage3Model,
        attempt,
      });

      return {
        items: stage3Items,
        ticketUrl,
      };
    };

    const stage3CanFallback =
      modelRouter.enabled &&
      modelRouter.fallbackRetryEnabled &&
      stage3ModelRouting.appliedByRouter &&
      stage3ModelRouting.appliedModel !== stage3ModelRouting.fallbackModel;

    let fallbackAttempted = false;
    let rawExtractedData: ExtractedItem[] = [];
    let stage3Result = await runStage3Pipeline(stage3ModelRouting.appliedModel, 'primary');
    rawExtractedData = stage3Result.items;
    stage37TicketUrl = stage3Result.ticketUrl || stage37TicketUrl;

    if ((!rawExtractedData || rawExtractedData.length === 0) && stage3CanFallback) {
      fallbackAttempted = true;
      logger.warn('Stage 3 fallback retry triggered (no extracted items)', {
        contentType: resolvedContentType,
        primaryModel: stage3ModelRouting.appliedModel,
        fallbackModel: stage3ModelRouting.fallbackModel,
      });
      stage3Result = await runStage3Pipeline(stage3ModelRouting.fallbackModel, 'fallback');
      rawExtractedData = stage3Result.items;
      stage37TicketUrl = stage3Result.ticketUrl || stage37TicketUrl;
    }

    if (!rawExtractedData || rawExtractedData.length === 0) {
      logger.info('No content extracted');
      await reportSkipReason({
        stage: 'stage3',
        reason: 'Due to no extractable content in Stage 3',
      });
      return [];
    }

    logger.info(`Extracted ${rawExtractedData.length} raw items`);

    // Add pipeline indices to each item for tracking
    rawExtractedData.forEach((item, idx) => {
      item._pipelineIndex = idx + 1;
      item._pipelineTotalStage3 = rawExtractedData.length;
    });

    // ========================================
    // STAGE 3.5: Facebook Events Time Resolution
    // ========================================
    if (extractedData?.utcStartDate) {
      logger.info('=== STAGE 3.5: FACEBOOK EVENTS TIME RESOLUTION ===');
      logger.debug(`Found utcStartDate: ${extractedData.utcStartDate}`);

      applyFacebookEventTimes(rawExtractedData, extractedData.utcStartDate, cfg.timezone);
    }

    // Log Stage 3 result
    logger.info('=== STAGE 3 RESULT ===');
    rawExtractedData.forEach((item) => {
      logger.debug(
        `Item [${item._pipelineIndex}/${item._pipelineTotalStage3}]: "${item.name}"`,
        {
          type: item._sourceType || 'unknown',
          date: item.date,
          time: item.startTime || 'none',
        }
      );
    });
    await emitStageArtifacts(cfg, {
      source: 'live',
      contentType: resolvedContentType,
      stage3Items: deepCloneJson(rawExtractedData),
      stage37TicketUrl: stage37TicketUrl || undefined,
    });

    // ========================================
    // STAGE 4: Secondary Validation
    // ========================================
    logger.info('=== STAGE 4: SECONDARY VALIDATION ===');
    const stage4Start = Date.now();
    let validatedData = await performSecondaryValidation(
      rawExtractedData,
      userName,
      timestamp,
      cfg
    );
    logTiming('stage4_validate', stage4Start, {
      postId,
      validatedCount: validatedData?.length || 0,
    });

    if ((!validatedData || validatedData.length === 0) && stage3CanFallback && !fallbackAttempted) {
      fallbackAttempted = true;
      logger.warn('Stage 3 fallback retry triggered (Stage 4 validation failed)', {
        contentType: resolvedContentType,
        primaryModel: stage3ModelRouting.appliedModel,
        fallbackModel: stage3ModelRouting.fallbackModel,
      });
      const retryStage3Result = await runStage3Pipeline(stage3ModelRouting.fallbackModel, 'fallback');
      rawExtractedData = retryStage3Result.items;
      stage37TicketUrl = retryStage3Result.ticketUrl || stage37TicketUrl;

      if (rawExtractedData && rawExtractedData.length > 0) {
        rawExtractedData.forEach((item, idx) => {
          item._pipelineIndex = idx + 1;
          item._pipelineTotalStage3 = rawExtractedData.length;
        });
        if (extractedData?.utcStartDate) {
          applyFacebookEventTimes(rawExtractedData, extractedData.utcStartDate, cfg.timezone);
        }
        const stage4RetryStart = Date.now();
        validatedData = await performSecondaryValidation(
          rawExtractedData,
          userName,
          timestamp,
          cfg
        );
        logTiming('stage4_validate_retry', stage4RetryStart, {
          postId,
          validatedCount: validatedData?.length || 0,
          fallbackModel: stage3ModelRouting.fallbackModel,
        });
      }
    }

    if (!validatedData || validatedData.length === 0) {
      logger.info('No items passed secondary validation');
      await reportSkipReason({
        stage: 'stage4',
        reason: 'Due to failing Stage 4 secondary validation',
      });
      return [];
    }

    logger.info(`${validatedData.length} items passed secondary validation`, {
      before: rawExtractedData.length,
      after: validatedData.length,
      rejected: rawExtractedData.length - validatedData.length,
    });
    logger.info(
      `Stage 4 Happy Hour no-price overrides: ${(validatedData as any)._happyHourNoPriceOverrideCount || 0}`
    );
    logger.info(
      `Stage 4 Calendar deal all-day overrides: ${(validatedData as any)._calendarDealAllDayOverrideCount || 0}`
    );
    logger.info(
      `Stage 4 Calendar deal all-day normalizations: ${(validatedData as any)._calendarDealAllDayNormalizationCount || 0}`
    );
    await emitStageArtifacts(cfg, {
      source: 'live',
      contentType: resolvedContentType,
      stage4Items: deepCloneJson(validatedData),
      stage37TicketUrl: stage37TicketUrl || undefined,
    });

    // ========================================
    // STAGE 5: Final Formatting
    // ========================================
    logger.info('=== STAGE 5: FINAL FORMATTING ===');
    const stage5Start = Date.now();
    const formattedEvents = await performFinalFormatting(
      validatedData,
      userName,
      partialAddress,
      timestamp,
      cfg,
      input.combinedText
    );
    logTiming('stage5_format', stage5Start, {
      postId,
      formattedCount: formattedEvents?.length || 0,
    });

    if (!formattedEvents || formattedEvents.length === 0) {
      logger.info('No events formatted successfully');
      await reportSkipReason({
        stage: 'stage5',
        reason: 'Due to no events formatted in Stage 5',
      });
      return [];
    }

    logger.info('=== STAGE 5 RESULT ===');
    formattedEvents.forEach((item, i) => {
      logger.debug(`Final ${i + 1}: "${item.name}"`, {
        type: item.isEvent === 'Yes' ? 'EVENT' : 'SPECIAL',
        category: item.category,
        establishment: item.establishment,
      });
    });

    // Merge Stage-4 timeFlags back if Stage-5 omitted them
    const formattedEventsWithFlags = mergeTimeFlags(formattedEvents, validatedData);
    const formattedEventsWithMediaHints = mergeTicketImageHints(
      formattedEventsWithFlags,
      validatedData,
      rawExtractedData
    );

    // ========================================
    // STAGE 5.5: Hours-Based Time Resolution
    // ========================================
    logger.info('=== STAGE 5.5: HOURS-BASED TIME RESOLUTION ===');
    const stage55Start = Date.now();
    const timeResolvedEvents = await resolveTimesWithOperatingHours(
      formattedEventsWithMediaHints,
      userName,
      partialAddress,
      timestamp,
      cfg
    );
    logTiming('stage5_5_hours', stage55Start, {
      postId,
      resolvedCount: timeResolvedEvents?.length || 0,
    });

    // Apply startTime fallback cues first
    const normalizedEvents = applySpecialTimeFallbacks(timeResolvedEvents, timestamp, cfg.timezone);

    // ========================================
    // STAGE 5.6: DATETIME COMPLETENESS RESOLUTION
    // ========================================
    logger.info('=== STAGE 5.6: DATETIME COMPLETENESS RESOLUTION ===');
    const stage56Start = Date.now();
    const finalizedEvents = enforceDateTimeCompleteness(
      normalizedEvents,
      timestamp,
      cfg.timezone,
      input.combinedText
    );
    logTiming('stage5_6_datetime', stage56Start, {
      postId,
      finalizedCount: finalizedEvents?.length || 0,
    });

    const heroImageAnalysis = analyzeHeroImageSources(allImageUrls);
    const rawTicketImageHints = finalizedEvents.map((event) =>
      String((event as any)._ticketImageUrl || '').trim()
    );
    const ticketImageHintCount = rawTicketImageHints.filter((value) => Boolean(value)).length;
    const managedTicketImageHints =
      ticketImageHintCount > 0
        ? await uploadManagedHeroFallbacks(rawTicketImageHints, { postId })
        : [];
    for (const managedUrl of managedTicketImageHints) {
      if (managedUrl) cleanupImageUrls.add(managedUrl);
    }
    const heroImageOverrides = heroImageAnalysis.preferTicketImage
      ? managedTicketImageHints
      : [];
    const managedHeroImageCount = heroImageOverrides.filter((value) => isManagedImageUrl(value)).length;
    const managedTicketImageCount = managedTicketImageHints.filter((value) =>
      isManagedImageUrl(value)
    ).length;
    logger.info('Hero image fallback decision', {
      postId,
      preferTicketImage: heroImageAnalysis.preferTicketImage,
      reason: heroImageAnalysis.reason,
      sourceMediaCount: heroImageAnalysis.mediaCount,
      sourceVideoThumbCount: heroImageAnalysis.videoSnapshotCount,
      sourceUniqueAssetCount: heroImageAnalysis.uniqueAssetCount,
      ticketImageHintCount,
      managedHeroImageCount,
      managedTicketImageCount,
    });

    // ========================================
    // Process formatted events with metadata
    // ========================================
    const processedEvents = processEvents(
      finalizedEvents,
      userName,
      facebookUrl,
      managedProfilePicUrl,
      extractionImageUrls,
      displayImageUrls,
      sharedPostThumbnails,
      {
        ...(extractedData || {}),
        ticketsBuyUrl: extractedData?.ticketsBuyUrl || stage37TicketUrl || '',
      },
      heroImageOverrides,
      managedTicketImageHints
    );

    await cleanupUnusedOcrImages(Array.from(cleanupImageUrls), processedEvents);

    logger.info(`parsePostData: Completed. Final events: ${processedEvents.length}`);
    logTiming('parse_total', parseStart, {
      postId,
      finalCount: processedEvents.length,
    });
    return processedEvents;
  } catch (error) {
    logger.error('parsePostData: Error in parsing system', error);
    await reportSkipReason({
      stage: 'pipeline',
      reason: 'Due to parsing pipeline error',
      detail: error instanceof Error ? error.message : String(error),
    });
    logTiming('parse_total', parseStart, { postId, error: true });
    return [];
  }
}

/**
 * Apply Facebook Event utcStartDate as authoritative source for date/time
 */
function applyFacebookEventTimes(
  items: ExtractedItem[],
  utcStartDate: string,
  timezone: string
): void {
  try {
    const utcDate = DateTime.fromISO(utcStartDate, { zone: 'UTC' });
    if (!utcDate.isValid) {
      logger.warn(`Invalid utcStartDate: ${utcStartDate}`);
      return;
    }

    const localDt = utcDate.setZone(timezone);
    const localTime = localDt.toFormat('HH:mm');
    const localDate = localDt.toFormat('yyyy-MM-dd');

    items.forEach((item) => {
      const needsTime = !item.startTime || item.startTime === 'unknown' || item.startTime === '';

      const hasMultipleExplicitDates =
        items.length > 1 &&
        item.timeFlags?.start?.source === 'explicit';

      // Override date if not multiple explicit dates
      if (!hasMultipleExplicitDates) {
        if (item.date !== localDate) {
          logger.debug(
            `Stage 3.5: "${item.name}" - OVERRIDING date from utcStartDate: "${item.date}" → "${localDate}"`
          );
          item.date = localDate;
          (item as any)._dateSourcedFromUtcStartDate = true;
        }
      }

      // Set time if needed
      if (needsTime) {
        logger.debug(
          `Stage 3.5: "${item.name}" - Setting startTime from utcStartDate: "${item.startTime || 'unknown'}" → "${localTime}"`
        );
        item.startTime = localTime;
        (item as any)._timeSourcedFromUtcStartDate = true;
      }
    });
  } catch (e) {
    logger.error('Error applying Facebook event times', e);
  }
}

/**
 * Merge timeFlags from validated data back to formatted events
 */
function mergeTimeFlags(
  formattedEvents: FormattedEvent[],
  validatedData: ExtractedItem[]
): FormattedEvent[] {
  return formattedEvents.map((item, i) => {
    try {
      if (!item.timeFlags && validatedData[i]?.timeFlags) {
        return { ...item, timeFlags: validatedData[i].timeFlags };
      }
    } catch {
      // Ignore merge errors
    }
    return item;
  });
}

function mergeTicketImageHints(
  formattedEvents: FormattedEvent[],
  validatedData: ExtractedItem[],
  rawExtractedData: ExtractedItem[]
): FormattedEvent[] {
  const nameToTicketImage = new Map<string, string>();
  const remember = (name: string, imageUrl: string): void => {
    const key = normalizeComparableName(name);
    if (!key || !imageUrl || nameToTicketImage.has(key)) return;
    nameToTicketImage.set(key, imageUrl);
  };

  for (const item of rawExtractedData || []) {
    const imageUrl = getTicketImageHint(item);
    if (imageUrl) remember(item?.name || '', imageUrl);
  }
  for (const item of validatedData || []) {
    const imageUrl = getTicketImageHint(item);
    if (imageUrl) remember(item?.name || '', imageUrl);
  }

  return formattedEvents.map((item, index) => {
    const fromValidated = getTicketImageHint(validatedData[index]);
    const fromName = nameToTicketImage.get(normalizeComparableName(item?.name || '')) || '';
    const hint = fromValidated || fromName;
    if (!hint) return item;
    return { ...item, _ticketImageUrl: hint } as FormattedEvent;
  });
}

function getTicketImageHint(item: unknown): string {
  const value = (item as any)?._ticketImageUrl;
  const hint = String(value || '').trim();
  if (!hint) return '';
  if (!/^https?:\/\//i.test(hint)) return '';
  return hint;
}

function normalizeComparableName(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function analyzeHeroImageSources(mediaUrls: string[]): {
  preferTicketImage: boolean;
  reason: string;
  mediaCount: number;
  videoSnapshotCount: number;
  uniqueAssetCount: number;
} {
  const urls = Array.isArray(mediaUrls) ? mediaUrls.filter(Boolean) : [];
  if (urls.length === 0) {
    return {
      preferTicketImage: true,
      reason: 'no_source_media',
      mediaCount: 0,
      videoSnapshotCount: 0,
      uniqueAssetCount: 0,
    };
  }

  let videoSnapshotCount = 0;
  const assetKeys = new Set<string>();
  for (const rawUrl of urls) {
    if (isLikelyVideoSnapshotUrl(rawUrl)) videoSnapshotCount += 1;
    const assetKey = extractMediaAssetKey(rawUrl);
    if (assetKey) assetKeys.add(assetKey);
  }

  const uniqueAssetCount = assetKeys.size;
  if (videoSnapshotCount === urls.length) {
    return {
      preferTicketImage: true,
      reason: 'all_media_video_snapshots',
      mediaCount: urls.length,
      videoSnapshotCount,
      uniqueAssetCount,
    };
  }

  if (videoSnapshotCount > 0 && uniqueAssetCount === 1 && urls.length > 1) {
    return {
      preferTicketImage: true,
      reason: 'repeated_video_snapshot_asset',
      mediaCount: urls.length,
      videoSnapshotCount,
      uniqueAssetCount,
    };
  }

  return {
    preferTicketImage: false,
    reason: 'source_media_usable',
    mediaCount: urls.length,
    videoSnapshotCount,
    uniqueAssetCount,
  };
}

function isLikelyVideoSnapshotUrl(url: string): boolean {
  try {
    const parsed = new URL(String(url || ''));
    const path = parsed.pathname.toLowerCase();
    const query = parsed.search.toLowerCase();
    if (/\/t15\.\d+-\d+\//.test(path)) return true;
    if (query.includes('tt6') || query.includes('tt7')) return true;
    if (/[?&]tt\d+/.test(query)) return true;
  } catch {
    return false;
  }
  return false;
}

function extractMediaAssetKey(url: string): string {
  try {
    const parsed = new URL(String(url || ''));
    const path = parsed.pathname || '';
    const idMatch = path.match(/\/(\d+_[^/]+\.(?:jpg|jpeg|png|webp|gif))/i);
    if (idMatch && idMatch[1]) return idMatch[1].toLowerCase();
    return path.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Apply startTime fallbacks for specials before final completeness checks
 */
export function applySpecialTimeFallbacks(
  events: TimeResolvedEvent[],
  timestamp: string,
  timezone: string
): TimeResolvedEvent[] {
  // Extract posted time
  let postedHHMM = '';
  try {
    const dt = DateTime.fromISO(timestamp, { zone: timezone });
    if (dt.isValid) {
      postedHHMM = dt.toFormat('HH:mm');
    }
  } catch {
    // Ignore parse errors
  }

  return events.map((ev) => {
    try {
      if (!ev) return ev;

      // Synthesize startTime from post time when missing & not explicit
      const isSpecial =
        ev.isFoodSpecial === 'Yes' ||
        String(ev.isFoodSpecial || '').toLowerCase() === 'yes' ||
        /special/i.test(String(ev.category || ''));

      const eventCategoriesForFallback = [
        'Live Music',
        'Comedy',
        'Trivia Night',
        'Open Mic',
        'Karaoke',
        'DJ/Nightlife',
        'Gatherings & Parties',
      ];

      const isEventLikely =
        String(ev.isEvent || '').toLowerCase() === 'yes' ||
        eventCategoriesForFallback.includes(String(ev.category || ''));

      const hasTodayCue = /today|tonight|this\s*(evening|afternoon|morning|weekend)/i.test(
        `${ev.description || ''}`
      );

      const hasExplicitStart = ev.timeFlags?.start?.source === 'explicit';
      const hasStartClock = ev.startTime && String(ev.startTime).trim() !== '';

      if (
        (isSpecial || (isEventLikely && hasTodayCue)) &&
        !hasStartClock &&
        !hasExplicitStart &&
        postedHHMM
      ) {
        ev.startTime = postedHHMM;

        // Update timeFlags
        ev.timeFlags = ev.timeFlags || { start: { source: 'none', evidence: '' }, end: { toClose: false, evidence: '' } };
        ev.timeFlags.start = {
          source: 'semantic',
          evidence: `posted time ${postedHHMM}`,
        };

        logger.debug(`Applied post time fallback for "${ev.name}": ${postedHHMM}`);
      }
    } catch (e) {
      logger.warn('Special time fallback error', e);
    }
    return ev;
  });
}

export function enforceDateTimeCompleteness(
  events: TimeResolvedEvent[],
  timestamp: string,
  timezone: string,
  combinedText = ''
): TimeResolvedEvent[] {
  const posted = DateTime.fromISO(timestamp, { zone: timezone });
  const postedDate = posted.isValid ? posted.toFormat('yyyy-MM-dd') : '';
  const postedHHMM = posted.isValid ? posted.toFormat('HH:mm') : '';
  const sharedCombinedTextRange =
    events.length === 1 ? extractExplicitTimeRangeFromEvidence(combinedText, '') : null;
  const siblingEndTimeHints = buildSiblingEndTimeHints(events);
  const denseScheduleBatchUsesDurationDefault = shouldUseBatchDurationDefault(events);

  const kept: TimeResolvedEvent[] = [];
  const rejectedByReason: Record<string, number> = {};

  for (const [index, raw] of events.entries()) {
    const ev: TimeResolvedEvent = { ...raw };
    ev.timeResolution = ev.timeResolution || { hoursUsed: false };

    // Ensure date window has a usable anchor.
    if (!ev.startDate || String(ev.startDate).trim() === '') {
      ev.startDate = postedDate || '';
    }
    if (!ev.endDate || String(ev.endDate).trim() === '') {
      ev.endDate = ev.startDate || '';
    }

    ev.startTime = normalizeTimeHHMM(ev.startTime);
    ev.endTime = normalizeTimeHHMM(ev.endTime);

    const explicitEvidenceRange =
      ev.timeFlags?.start?.source === 'explicit' || ev.timeFlags?.end?.source === 'explicit'
        ? extractExplicitTimeRangeFromEvidence(
            ev.timeFlags?.start?.evidence,
            ev.timeFlags?.end?.evidence
          )
        : null;
    if (explicitEvidenceRange) {
      if (explicitEvidenceRange.startTime && explicitEvidenceRange.startTime !== ev.startTime) {
        ev.startTime = explicitEvidenceRange.startTime;
        ev.timeResolution = ev.timeResolution || { hoursUsed: false };
        delete ev.timeResolution.startFromHours;
        delete ev.timeResolution.startFromPostTime;

        logger.debug(`Recovered explicit start time for "${ev.name}"`, {
          evidence: ev.timeFlags?.start?.evidence || ev.timeFlags?.end?.evidence || '',
          startTime: explicitEvidenceRange.startTime,
        });
      }

      if (explicitEvidenceRange.endTime && explicitEvidenceRange.endTime !== ev.endTime) {
        ev.endTime = explicitEvidenceRange.endTime;
        ev.timeResolution = ev.timeResolution || { hoursUsed: false };
        delete ev.timeResolution.endFromHours;

        logger.debug(`Recovered explicit end time from range evidence for "${ev.name}"`, {
          evidence: ev.timeFlags?.end?.evidence || ev.timeFlags?.start?.evidence || '',
          endTime: explicitEvidenceRange.endTime,
        });
      }
    }

    const combinedTextRange =
      !explicitEvidenceRange && sharedCombinedTextRange ? sharedCombinedTextRange : null;
    if (combinedTextRange) {
      const startMatchesCombined =
        !ev.startTime || combinedTextRange.startTime === ev.startTime;

      if (startMatchesCombined && combinedTextRange.startTime && combinedTextRange.startTime !== ev.startTime) {
        ev.startTime = combinedTextRange.startTime;
        ev.timeResolution = ev.timeResolution || { hoursUsed: false };
        delete ev.timeResolution.startFromHours;
        delete ev.timeResolution.startFromPostTime;
      }

      if (
        startMatchesCombined &&
        combinedTextRange.endTime &&
        (!ev.endTime || ev.timeResolution?.endFromHours === 'category_default')
      ) {
        ev.endTime = combinedTextRange.endTime;
        ev.timeResolution = ev.timeResolution || { hoursUsed: false };
        delete ev.timeResolution.endFromHours;

        logger.debug(`Recovered explicit end time from combined text for "${ev.name}"`, {
          endTime: combinedTextRange.endTime,
        });
      }
    }

    if (
      ev.timeFlags?.end?.source === 'explicit' &&
      (!ev.endTime || ev.timeResolution?.endFromHours === 'category_default')
    ) {
      const recoveredEndTime = extractExplicitEndTimeFromEvidence(ev.timeFlags?.end?.evidence);
      if (recoveredEndTime && recoveredEndTime !== ev.endTime) {
        ev.endTime = recoveredEndTime;
        ev.timeResolution = ev.timeResolution || { hoursUsed: false };
        delete ev.timeResolution.endFromHours;

        logger.debug(`Recovered explicit end time for "${ev.name}"`, {
          evidence: ev.timeFlags?.end?.evidence || '',
          endTime: recoveredEndTime,
        });
      }
    }

    const closingHint = getClosingHoursEndHint(ev, combinedText, events.length);
    if (
      closingHint &&
      (!ev.endTime || ev.timeResolution?.endFromHours === 'category_default')
    ) {
      ev.endTime = closingHint.endTime;
      ev.timeResolution = ev.timeResolution || { hoursUsed: false };
      ev.timeResolution.endFromHours = 'to_close';
      ev.timeFlags = ev.timeFlags || {
        start: { source: 'none', evidence: '' },
        end: { source: 'none', toClose: false, evidence: '' },
      };
      ev.timeFlags.end = {
        source: 'semantic',
        toClose: true,
        evidence: closingHint.evidence,
      };

      logger.debug(`Recovered closing-hours hint end time for "${ev.name}"`, {
        evidence: closingHint.evidence,
        endTime: closingHint.endTime,
      });
    }

    // Guard against unverified midnight defaults.
    if (ev.startTime === '00:00' && !hasExplicitMidnight(ev, 'start')) {
      ev.startTime = '';
      if (ev.timeFlags?.start) {
        ev.timeFlags.start = { ...ev.timeFlags.start, source: 'none' };
      }
    }
    if (ev.endTime === '00:00' && !hasExplicitMidnight(ev, 'end')) {
      ev.endTime = '';
      if (ev.timeFlags?.end) {
        ev.timeFlags.end = { ...ev.timeFlags.end, source: 'none' };
      }
    }

    // Final start-time fallback for semantic posts.
    const isSpecial =
      ev.isFoodSpecial === 'Yes' ||
      String(ev.isFoodSpecial || '').toLowerCase() === 'yes' ||
      /special/i.test(String(ev.category || ''));
    const hasTodayCue = /today|tonight|this\s*(evening|afternoon|morning|weekend)/i.test(
      `${ev.description || ''}`
    );
    const isSemanticStart = ev.timeFlags?.start?.source === 'semantic';

    if (!ev.startTime && postedHHMM && (isSpecial || hasTodayCue || isSemanticStart)) {
      ev.startTime = postedHHMM;
      ev.timeFlags = ev.timeFlags || {
        start: { source: 'none', evidence: '' },
        end: { toClose: false, evidence: '' },
      };
      ev.timeFlags.start = {
        source: 'semantic',
        evidence: `Stage 5.6 fallback from post time ${postedHHMM}`,
      };
      ev.timeResolution.startFromPostTime = true;
    }

    // If end time is missing but we have start time, infer a deterministic end time.
    if (!ev.endTime && ev.startTime) {
      const inferred = inferEndTimeFromStart(ev.startTime, String(ev.category || ''), ev);
      ev.endTime = inferred.endTime;
      ev.timeResolution.endFromHours = inferred.source;
    }

    const siblingEndHint = siblingEndTimeHints.get(index);
    if (
      siblingEndHint &&
      ev.endTime &&
      ev.timeResolution?.endFromHours === 'category_default'
    ) {
      ev.endTime = siblingEndHint.endTime;
      ev.timeResolution.endFromHours = 'duration_default';
      ev.timeFlags = ev.timeFlags || {
        start: { source: 'none', evidence: '' },
        end: { source: 'none', toClose: false, evidence: '' },
      };
      ev.timeFlags.end = {
        source: 'semantic',
        toClose: false,
        evidence: siblingEndHint.evidence,
      };

      logger.debug(`Recovered grouped end time for "${ev.name}"`, {
        endTime: siblingEndHint.endTime,
        evidence: siblingEndHint.evidence,
      });
    }

    if (
      ev.endTime &&
      ev.startTime &&
      ev.timeResolution?.endFromHours === 'category_default' &&
      (
        shouldPreferDurationDefaultForMissingEnd(ev) ||
        denseScheduleBatchUsesDurationDefault
      )
    ) {
      const previousEndTime = ev.endTime;
      const shortFormOverride = shouldPreferDurationDefaultForMissingEnd(ev);
      const inferred =
        denseScheduleBatchUsesDurationDefault && !shortFormOverride
          ? {
              endTime: addMinutesToHHMM(ev.startTime, 120),
              source: 'duration_default' as const,
            }
          : inferEndTimeFromStart(ev.startTime, String(ev.category || ''), ev);
      if (
        inferred.endTime &&
        inferred.source === 'duration_default' &&
        inferred.endTime !== ev.endTime
      ) {
        ev.endTime = inferred.endTime;
        ev.timeResolution.endFromHours = 'duration_default';
        ev.timeFlags = ev.timeFlags || {
          start: { source: 'none', evidence: '' },
          end: { source: 'none', toClose: false, evidence: '' },
        };
        ev.timeFlags.end = {
          source: 'semantic',
          toClose: false,
          evidence: denseScheduleBatchUsesDurationDefault && !shortFormOverride
            ? 'dense schedule duration default override'
            : 'short-form duration default override',
        };

        logger.debug(`Replaced category-default end time for "${ev.name}"`, {
          previousEndTime,
          endTime: inferred.endTime,
        });
      }
    }

    // Normalize overnight endDate in one place (Stage 5.6 only).
    applyOvernightEndDate(ev, timezone);

    const missingFields = [
      !ev.startDate ? 'startDate' : '',
      !ev.startTime ? 'startTime' : '',
      !ev.endDate ? 'endDate' : '',
      !ev.endTime ? 'endTime' : '',
    ].filter(Boolean);

    if (missingFields.length > 0) {
      const reason = `missing_${missingFields.join('_')}`;
      rejectedByReason[reason] = (rejectedByReason[reason] || 0) + 1;
      logger.debug(
        `Stage 5.6: Rejecting incomplete event "${ev.name}" - reason: "${reason}"`,
        {
        reason,
        startDate: ev.startDate,
        startTime: ev.startTime,
        endDate: ev.endDate,
        endTime: ev.endTime,
        }
      );
      continue;
    }

    kept.push(ev);
  }

  logger.info('Stage 5.6 summary', {
    inputCount: events.length,
    keptCount: kept.length,
    rejectedCount: events.length - kept.length,
    rejectedByReason,
  });

  return kept;
}

function buildSiblingEndTimeHints(
  events: TimeResolvedEvent[]
): Map<number, { endTime: string; evidence: string }> {
  const hints = new Map<number, { endTime: string; evidence: string }>();
  const groups = new Map<
    string,
    Array<{ index: number; startTime: string; startMinutes: number }>
  >();

  for (const [index, event] of events.entries()) {
    if (String(event.category || '').trim() !== 'Workshops & Classes') continue;
    if (String(event.timeFlags?.end?.source || '').trim().toLowerCase() === 'explicit') continue;
    if (event.timeFlags?.end?.toClose === true) continue;

    const startTime = normalizeTimeHHMM(event.startTime);
    const startMinutes = hhmmToMinutes(startTime);
    const startDate = String(event.startDate || '').trim();
    if (!startTime || startMinutes === null || !startDate) continue;

    const startSource = String(event.timeFlags?.start?.source || '').trim().toLowerCase();
    const categoryDefaultEnd =
      String(event.timeResolution?.endFromHours || '').trim().toLowerCase() === 'category_default';
    if (startSource !== 'explicit' && !categoryDefaultEnd) continue;
    const key = startDate;
    const list = groups.get(key) || [];
    list.push({ index, startTime, startMinutes });
    groups.set(key, list);
  }

  for (const entries of groups.values()) {
    if (entries.length < 2) continue;
    entries.sort((left, right) => left.startMinutes - right.startMinutes);

    const finalizeCluster = (
      cluster: Array<{ index: number; startTime: string; startMinutes: number }>
    ) => {
      if (cluster.length < 2) return;

      const gaps = cluster
        .slice(1)
        .map((entry, idx) => entry.startMinutes - cluster[idx].startMinutes)
        .filter((gap) => gap >= 15 && gap <= 180);
      const fallbackDuration = gaps[0] || 60;

      for (let index = 0; index < cluster.length; index += 1) {
        const current = cluster[index];
        const next = cluster[index + 1];
        if (next) {
          const gap = next.startMinutes - current.startMinutes;
          if (gap >= 15 && gap <= 180) {
            hints.set(current.index, {
              endTime: next.startTime,
              evidence: `next grouped start ${next.startTime}`,
            });
            continue;
          }
        }

        hints.set(current.index, {
          endTime: addMinutesToHHMM(current.startTime, fallbackDuration),
          evidence: `grouped duration default ${fallbackDuration}m`,
        });
      }
    };

    let cluster: Array<{ index: number; startTime: string; startMinutes: number }> = [entries[0]];
    for (let index = 1; index < entries.length; index += 1) {
      const current = entries[index];
      const previous = entries[index - 1];
      const gap = current.startMinutes - previous.startMinutes;
      if (gap > 180) {
        finalizeCluster(cluster);
        cluster = [current];
        continue;
      }
      cluster.push(current);
    }
    finalizeCluster(cluster);
  }

  return hints;
}

function shouldUseBatchDurationDefault(events: TimeResolvedEvent[]): boolean {
  if (!Array.isArray(events) || events.length < 8) return false;

  const distinctDates = new Set(
    events
      .map((event) => String(event.startDate || '').trim())
      .filter(Boolean)
  );
  if (distinctDates.size < 4) return false;

  const eligibleCount = events.filter((event) => {
    if (!event.startTime || !event.endTime) return false;
    if (SPECIAL_LIKE_CATEGORY_PATTERN.test(String(event.category || ''))) return false;
    if (String(event.timeFlags?.end?.source || '').trim().toLowerCase() === 'explicit') return false;
    if (event.timeFlags?.end?.toClose === true) return false;
    return String(event.timeResolution?.endFromHours || '').trim().toLowerCase() === 'category_default';
  }).length;

  return eligibleCount >= Math.max(4, Math.ceil(events.length * 0.25));
}
function inferEndTimeFromStart(
  startTime: string,
  category: string,
  event?: Pick<TimeResolvedEvent, 'name' | 'description' | 'timeFlags' | 'category'>
): { endTime: string; source: 'category_default' | 'duration_default' } {
  const startHHMM = normalizeTimeHHMM(startTime);
  if (!startHHMM) {
    return { endTime: '', source: 'duration_default' };
  }

  if (shouldPreferDurationDefaultForMissingEnd(event)) {
    return {
      endTime: addMinutesToHHMM(startHHMM, 120),
      source: 'duration_default',
    };
  }

  const defaultEnd = CATEGORY_END_DEFAULTS[category] || '23:00';
  const startMinutes = hhmmToMinutes(startHHMM);
  const defaultMinutes = hhmmToMinutes(defaultEnd);

  if (startMinutes !== null && defaultMinutes !== null) {
    const defaultLooksOvernight = defaultMinutes <= 6 * 60;
    if (defaultMinutes > startMinutes || defaultLooksOvernight) {
      return { endTime: defaultEnd, source: 'category_default' };
    }
  }

  return {
    endTime: addMinutesToHHMM(startHHMM, 120),
    source: 'duration_default',
  };
}

function getClosingHoursEndHint(
  event: Pick<
    TimeResolvedEvent,
    'name' | 'description' | 'category' | 'startTime' | 'timeFlags' | 'isFoodSpecial' | '_sourceType'
  >,
  combinedText: string,
  totalEvents: number
): { endTime: string; evidence: string } | null {
  if (!event || totalEvents !== 1) return null;
  if (String(event.isFoodSpecial || '').toLowerCase() === 'yes') return null;

  const sourceType = String((event as any)?._sourceType || '')
    .trim()
    .toLowerCase();
  if (sourceType === 'schedule' || sourceType === 'calendar') return null;

  const startSource = String(event.timeFlags?.start?.source || '')
    .trim()
    .toLowerCase();
  const endSource = String(event.timeFlags?.end?.source || '')
    .trim()
    .toLowerCase();
  if (startSource !== 'explicit') return null;
  if (endSource === 'explicit' || event.timeFlags?.end?.toClose === true) return null;

  const explicitRange = extractExplicitTimeRangeFromEvidence(
    event.timeFlags?.start?.evidence,
    event.timeFlags?.end?.evidence
  );
  if (explicitRange?.endTime) return null;

  const startHHMM = normalizeTimeHHMM(event.startTime);
  const startMinutes = hhmmToMinutes(startHHMM);
  if (!startHHMM || startMinutes === null || startMinutes < 20 * 60) return null;

  const haystack = `${String(event.name || '')} ${String(event.description || '')} ${String(
    combinedText || ''
  )}`;
  const category = String(event.category || '').trim();
  const nightlifeLike =
    NIGHTLIFE_LIKE_CATEGORIES.has(category) || NIGHTLIFE_LIKE_HINT_PATTERN.test(haystack);
  if (!nightlifeLike) return null;

  const matches = Array.from(String(combinedText || '').matchAll(CLOSING_HINT_PATTERN));
  if (matches.length === 0) return null;

  const resolvedHints = matches
    .map((match) => ({
      endTime: normalizeTimeHHMM(`${match[1]} ${match[2]}`),
      evidence: String(match[0] || '').trim(),
    }))
    .filter((match) => Boolean(match.endTime));
  if (resolvedHints.length === 0) return null;

  const uniqueHintTimes = Array.from(new Set(resolvedHints.map((match) => match.endTime)));
  if (uniqueHintTimes.length !== 1) return null;

  const hintTime = uniqueHintTimes[0];
  const hintMinutes = hhmmToMinutes(hintTime);
  if (!hintTime || hintMinutes === null) return null;

  let durationMinutes = hintMinutes - startMinutes;
  if (durationMinutes <= 0) durationMinutes += 24 * 60;
  if (durationMinutes < 60 || durationMinutes > 6 * 60) return null;

  return {
    endTime: hintTime,
    evidence: `closing hours hint ${resolvedHints[0].evidence}`,
  };
}

function shouldPreferDurationDefaultForMissingEnd(
  event?: Pick<TimeResolvedEvent, 'name' | 'description' | 'timeFlags' | 'category' | '_sourceType'>
): boolean {
  if (!event) return false;
  if (SPECIAL_LIKE_CATEGORY_PATTERN.test(String(event.category || ''))) {
    return false;
  }

  const endSource = String(event.timeFlags?.end?.source || '').trim().toLowerCase();
  if (endSource === 'explicit' || event.timeFlags?.end?.toClose === true) {
    return false;
  }

  const sourceType = String((event as any)?._sourceType || '').trim().toLowerCase();
  if (sourceType === 'schedule' || sourceType === 'calendar') {
    return true;
  }

  const haystack = `${String(event.name || '')} ${String(event.description || '')}`.toLowerCase();
  if (SHORT_FORM_PROGRAM_PATTERN.test(haystack)) {
    return true;
  }

  const startSource = String(event.timeFlags?.start?.source || '').trim().toLowerCase();
  return startSource === 'explicit' && !String(event.description || '').trim();
}

function applyOvernightEndDate(event: TimeResolvedEvent, timezone: string): void {
  const startDate = String(event.startDate || '').trim();
  const endDate = String(event.endDate || '').trim();
  const startHHMM = normalizeTimeHHMM(event.startTime);
  const endHHMM = normalizeTimeHHMM(event.endTime);
  if (!startDate || !endDate || !startHHMM || !endHHMM) return;

  const startMinutes = hhmmToMinutes(startHHMM);
  const endMinutes = hhmmToMinutes(endHHMM);
  if (startMinutes === null || endMinutes === null) return;

  if (endMinutes < startMinutes) {
    const startDt = DateTime.fromFormat(startDate, 'yyyy-MM-dd', { zone: timezone });
    if (!startDt.isValid) return;
    event.endDate = startDt.plus({ days: 1 }).toFormat('yyyy-MM-dd');
  }
}

function normalizeTimeHHMM(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const m24 = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::\d{2})?$/);
  if (m24) {
    return `${String(parseInt(m24[1], 10)).padStart(2, '0')}:${m24[2]}`;
  }

  const m12 = raw.match(/^(\d{1,2})(?::([0-5]\d))?(?::\d{2})?\s*(AM|PM)$/i);
  if (m12) {
    let hour = parseInt(m12[1], 10);
    const minute = m12[2] || '00';
    const period = m12[3].toUpperCase();
    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:${minute}`;
  }

  return '';
}

function extractStandaloneExplicitTime(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const match = raw.match(/\b(\d{1,2}(?::\d{2})?)\s*(AM|PM)\b/i);
  if (!match) return '';
  return normalizeTimeHHMM(`${match[1]} ${match[2]}`);
}

function oppositeMeridiem(period: string): string {
  return String(period || '').toUpperCase() === 'AM' ? 'PM' : 'AM';
}

function resolveExplicitRangeTimes(
  startRaw: string,
  startPeriodRaw: string,
  endRaw: string,
  endPeriodRaw: string
): { startTime: string; endTime: string } | null {
  const normalizedStartRaw = String(startRaw || '').trim();
  const normalizedEndRaw = String(endRaw || '').trim();
  const startPeriod = String(startPeriodRaw || '').trim().toUpperCase();
  const endPeriod = String(endPeriodRaw || '').trim().toUpperCase();

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
    const explicitStart = normalizeTimeHHMM(
      `${normalizedStartRaw} ${startCandidate.period}`.trim()
    );
    if (!explicitStart) continue;

    for (const endCandidate of endCandidates) {
      const explicitEnd = normalizeTimeHHMM(
        `${normalizedEndRaw} ${endCandidate.period}`.trim()
      );
      if (!explicitEnd) continue;

      const startMinutes = hhmmToMinutes(explicitStart);
      const endMinutes = hhmmToMinutes(explicitEnd);
      if (startMinutes === null || endMinutes === null) continue;

      let durationMinutes = endMinutes - startMinutes;
      if (durationMinutes <= 0) {
        durationMinutes += 24 * 60;
      }

      const candidate = {
        startTime: explicitStart,
        endTime: explicitEnd,
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

  return best
    ? {
        startTime: best.startTime,
        endTime: best.endTime,
      }
    : null;
}

function extractExplicitTimeRangeFromEvidence(
  startEvidence: unknown,
  endEvidence: unknown
): { startTime: string; endTime: string } | null {
  const startRawEvidence = String(startEvidence || '').trim();
  const endRawEvidence = String(endEvidence || '').trim();
  const candidates = [startRawEvidence, endRawEvidence].filter(Boolean);
  if (candidates.length === 0) return null;

  const rangePattern =
    /(\d{1,2}(?::\d{2})?)\s*(AM|PM)?\s*(?:[-\u2013\u2014]|to|until|til|till)\s*(\d{1,2}(?::\d{2})?)\s*(AM|PM)?/i;

  for (const raw of candidates) {
    const rangeMatch = raw.match(rangePattern);
    if (!rangeMatch) continue;

    const resolvedRange = resolveExplicitRangeTimes(
      String(rangeMatch[1] || '').trim(),
      String(rangeMatch[2] || '').trim(),
      String(rangeMatch[3] || '').trim(),
      String(rangeMatch[4] || '').trim()
    );
    if (resolvedRange) return resolvedRange;
  }

  const standaloneStart = extractStandaloneExplicitTime(startRawEvidence);
  const standaloneEnd = extractStandaloneExplicitTime(endRawEvidence);
  if (standaloneStart && standaloneEnd) {
    return {
      startTime: standaloneStart,
      endTime: standaloneEnd,
    };
  }

  return null;
}

function extractExplicitEndTimeFromEvidence(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const rangeMatch = raw.match(
    /(\d{1,2}(?::\d{2})?)\s*(AM|PM)?\s*[-\u2013\u2014]\s*(\d{1,2}(?::\d{2})?)\s*(AM|PM)?/i
  );
  if (rangeMatch) {
    const resolvedRange = resolveExplicitRangeTimes(
      String(rangeMatch[1] || '').trim(),
      String(rangeMatch[2] || '').trim(),
      String(rangeMatch[3] || '').trim(),
      String(rangeMatch[4] || '').trim()
    );
    return resolvedRange?.endTime || '';
  }

  const untilMatch = raw.match(
    /\b(?:to|until|til|till)\s*(\d{1,2}(?::\d{2})?)\s*(AM|PM)\b/i
  );
  if (untilMatch) {
    return normalizeTimeHHMM(`${untilMatch[1]} ${untilMatch[2]}`);
  }

  return extractStandaloneExplicitTime(raw);
}

function hhmmToMinutes(hhmm: string): number | null {
  const normalized = normalizeTimeHHMM(hhmm);
  if (!normalized) return null;
  const [hh, mm] = normalized.split(':').map((v) => parseInt(v, 10));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function addMinutesToHHMM(hhmm: string, deltaMinutes: number): string {
  const minutes = hhmmToMinutes(hhmm);
  if (minutes === null) return '';
  const day = 24 * 60;
  const next = ((minutes + deltaMinutes) % day + day) % day;
  const hh = Math.floor(next / 60);
  const mm = next % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Process formatted events with metadata
 */
function processEvents(
  parsedData: TimeResolvedEvent[],
  userName: string,
  facebookUrl: string,
  profilePicUrl: string,
  analysisMediaUrls: string[],
  displayMediaUrls: string[],
  sharedPostThumbnails: string[],
  extractedData?: ParsePostInput['extractedData'],
  heroImageOverrides: string[] = [],
  ticketImageOverrides: string[] = []
): ProcessedEvent[] {
  logger.debug(`Processing ${parsedData.length} events`);

  let skippedUnrecognizedVenue = 0;
  const normalizedDisplayMediaUrls = (displayMediaUrls || [])
    .map((url) => String(url || '').trim())
    .filter((url) => Boolean(url) && isManagedImageUrl(url));

  const result = parsedData.flatMap((event, index) => {
    try {
      // Set establishment if not already set
      if (!event.establishment || event.establishment === '') {
        event.establishment = userName;
      }

      const ticketImageOverride = String(ticketImageOverrides[index] || '').trim();
      const heroImageOverride = String(heroImageOverrides[index] || '').trim();
      const canUseTicketImageOverride = Boolean(
        ticketImageOverride && String(event.ticketLink || '').trim()
      );
      const imageOverride = canUseTicketImageOverride ? ticketImageOverride : heroImageOverride;
      const primaryMediaUrl = displayMediaUrls[0] || mapOcrImageUrlToManaged(analysisMediaUrls[0] || '');

      // Add metadata
      const processedEvent = addMetadata(
        event as ProcessedEvent,
        profilePicUrl,
        primaryMediaUrl,
        facebookUrl,
        sharedPostThumbnails[0] || '',
        extractedData,
        imageOverride
      );

      // Add relevant image URL
      if (imageOverride) {
        processedEvent.relevantImageUrl =
          mapOcrImageUrlToManaged(imageOverride) || processedEvent.image || '';
      } else if (
        event.relevantImageIndex >= 0 &&
        event.relevantImageIndex < analysisMediaUrls.length
      ) {
        const fromDisplay = displayMediaUrls[event.relevantImageIndex] || '';
        const fromAnalysis = mapOcrImageUrlToManaged(
          analysisMediaUrls[event.relevantImageIndex]
        );
        processedEvent.relevantImageUrl = fromDisplay || fromAnalysis || processedEvent.image || '';
      } else {
        processedEvent.relevantImageUrl = processedEvent.image || '';
      }
      processedEvent.mediaUrls = normalizedDisplayMediaUrls;
      if (!processedEvent.image && normalizedDisplayMediaUrls.length > 0) {
        processedEvent.image = normalizedDisplayMediaUrls[0];
      }
      if (!processedEvent.relevantImageUrl && processedEvent.image) {
        processedEvent.relevantImageUrl = processedEvent.image;
      }

      return [processedEvent];
    } catch (error) {
      logger.error('Error processing event', error);
      return [];
    }
  });

  // Attach skip count to first event for pipeline tracking
  if (result.length > 0 && skippedUnrecognizedVenue > 0) {
    result[0]._skippedUnrecognizedVenue = skippedUnrecognizedVenue;
    logger.info(`${skippedUnrecognizedVenue} event(s) skipped due to unrecognized venue`);
  }

  return result;
}

/**
 * Add metadata to processed event
 */
function addMetadata(
  event: ProcessedEvent,
  profilePicUrl: string,
  mediaUrl: string,
  facebookUrl: string,
  sharedPostThumbnail: string,
  extractedData?: ParsePostInput['extractedData'],
  heroImageOverride: string = ''
): ProcessedEvent {
  event.icon = isManagedImageUrl(profilePicUrl) ? profilePicUrl : '';
  event.image =
    mapOcrImageUrlToManaged(heroImageOverride || mediaUrl) ||
    (isManagedImageUrl(mediaUrl) ? mediaUrl : '');
  event.cleanedFacebookUrl = facebookUrl
    ? facebookUrl.replace(/^https:\/\/m\./, 'https://www.')
    : '';
  event.sharedPostThumbnail = sharedPostThumbnail;

  // Add fields from extractedData
  const data = extractedData || {};
  try {
    event.id = String(data.id || data.postId || event.id || '');
    event.latitude = data.latitude || event.latitude || '';
    event.longitude = data.longitude || event.longitude || '';
    event.city = data.city || event.city || '';
    event.streetAddress = data.streetAddress || event.streetAddress || '';
    event.organizedBy = data.organizedBy || event.organizedBy || '';
    event.usersResponded = data.usersResponded || event.usersResponded || '';
    event.utcStartDate = data.utcStartDate || event.utcStartDate || '';
    event.ticketsBuyUrl = data.ticketsBuyUrl || event.ticketsBuyUrl || '';

    // Bridge Stage 5 "ticketLink" → ticketsBuyUrl if not provided upstream
    if (
      (!event.ticketsBuyUrl || String(event.ticketsBuyUrl).trim() === '') &&
      event.ticketLink
    ) {
      event.ticketsBuyUrl = event.ticketLink;
    }
    // TODO(ticket-enrichment): Fetch ticket pages (e.g., Eventbrite) to enrich date/time/venue via safe HTTP parsing.
  } catch (e) {
    logger.error('addMetadata: extractedData missing or malformed', e);
  }

  event.ticketProvider = data.ticketProvider;
  event.likes = data.likes;
  event.shares = data.shares;
  event.comments = data.comments;
  event.topReactionsCount = data.topReactionsCount;

  return event;
}

async function prepareOcrImageUrls(
  urls: string[],
  context: { postId?: string; userName?: string; pageName?: string; combinedText?: string },
  options?: { calendarTiles?: boolean }
): Promise<string[]> {
  if (!urls || urls.length === 0) return [];

  const uploadUrl = process.env.IMAGE_UPLOAD_URL;
  if (!uploadUrl) {
    logger.debug('OCR image upload disabled (IMAGE_UPLOAD_URL not set)', {
      postId: context.postId || '',
    });
    return urls;
  }

  const uploaded: string[] = [];
  let failedCount = 0;
  const wantsCalendarTiles = Boolean(options?.calendarTiles);
  const maxOutputImages = wantsCalendarTiles
    ? MAX_OCR_OUTPUT_IMAGES_CALENDAR
    : MAX_OCR_OUTPUT_IMAGES_DEFAULT;

  for (let index = 0; index < urls.length; index++) {
    if (uploaded.length >= maxOutputImages) break;
    const url = urls[index];

    const tileMode = wantsCalendarTiles && index === 0 ? OCR_TILE_MODE_CALENDAR : '';
    const uploadedUrls = await uploadImageForOcr(url, uploadUrl, context, { tileMode });
    if (uploadedUrls && uploadedUrls.length > 0) {
      registerSourceMapping(url, uploadedUrls);
      registerTileMapping(uploadedUrls);
      for (const uploadedUrl of uploadedUrls) {
        if (uploaded.length >= maxOutputImages) break;
        uploaded.push(uploadedUrl);
      }
    } else {
      failedCount++;
    }
  }

  logger.info('OCR image upload summary', {
    postId: context.postId || '',
    inputCount: urls.length,
    uploadedCount: uploaded.length,
    failedCount,
    calendarTiles: wantsCalendarTiles,
  });

  return uploaded;
}

async function prepareManagedDisplayImageUrls(
  urls: string[],
  context: { postId?: string }
): Promise<string[]> {
  if (!urls || urls.length === 0) return [];

  const uploadUrl = process.env.IMAGE_UPLOAD_URL;
  if (!uploadUrl) {
    logger.warn('Display image upload disabled (IMAGE_UPLOAD_URL not set)', {
      postId: context.postId || '',
    });
    return [];
  }

  const uploaded: string[] = [];
  let attemptedCount = 0;
  let uploadedCount = 0;
  let failedCount = 0;

  for (const raw of urls) {
    if (uploaded.length >= MAX_OCR_OUTPUT_IMAGES_DEFAULT) break;
    const sourceUrl = String(raw || '').trim();
    if (!sourceUrl) continue;

    if (isManagedImageUrl(sourceUrl)) {
      registerDisplayMapping(sourceUrl, sourceUrl);
      uploaded.push(sourceUrl);
      uploadedCount += 1;
      continue;
    }

    const cached = sourceManagedImageMap.get(sourceUrl);
    if (cached) {
      uploaded.push(cached);
      continue;
    }

    attemptedCount += 1;
    const uploadResult = await uploadImageForOcr(sourceUrl, uploadUrl, context, { ocr: false });
    const managedUrl = uploadResult && uploadResult.length > 0
      ? String(uploadResult[0] || '').trim()
      : '';

    if (managedUrl && isManagedImageUrl(managedUrl)) {
      registerDisplayMapping(sourceUrl, managedUrl);
      uploaded.push(managedUrl);
      uploadedCount += 1;
    } else {
      failedCount += 1;
    }
  }

  logger.info('Display image upload summary', {
    postId: context.postId || '',
    inputCount: urls.length,
    attemptedCount,
    uploadedCount,
    failedCount,
  });

  return uploaded;
}

async function prepareManagedProfileIconUrl(
  profilePicUrl: string,
  context: { postId?: string }
): Promise<string> {
  const sourceUrl = String(profilePicUrl || '').trim();
  if (!sourceUrl) return '';
  if (isManagedImageUrl(sourceUrl)) return sourceUrl;

  const cached = sourceManagedImageMap.get(sourceUrl);
  if (cached && isManagedImageUrl(cached)) return cached;

  const uploadUrl = process.env.IMAGE_UPLOAD_URL;
  if (!uploadUrl) {
    logger.warn('Profile icon upload disabled (IMAGE_UPLOAD_URL not set)', {
      postId: context.postId || '',
    });
    return '';
  }

  const uploadedUrls = await uploadImageForOcr(sourceUrl, uploadUrl, context, {
    ocr: false,
    folder: PROFILE_IMAGE_UPLOAD_FOLDER,
  });
  const managedUrl = uploadedUrls && uploadedUrls.length > 0
    ? String(uploadedUrls[0] || '').trim()
    : '';
  if (!managedUrl || !isManagedImageUrl(managedUrl)) return '';

  registerDisplayMapping(sourceUrl, managedUrl);
  logger.info('Profile icon upload summary', {
    postId: context.postId || '',
    uploaded: true,
  });
  return managedUrl;
}

async function uploadImageForOcr(
  imageUrl: string,
  uploadUrl: string,
  context: { postId?: string },
  options?: { tileMode?: string; ocr?: boolean; folder?: string }
): Promise<string[] | null> {
  const download = await downloadImageBufferWithRetry(imageUrl, context);
  if (!download) return null;

  const uploadResult = await uploadImageBufferWithRetry(
    download.buffer,
    download.contentType,
    uploadUrl,
    context,
    options
  );

  return uploadResult;
}

async function uploadManagedHeroFallbacks(
  urls: string[],
  context: { postId?: string }
): Promise<string[]> {
  const uploadUrl = process.env.IMAGE_UPLOAD_URL;
  if (!uploadUrl) {
    return (urls || []).map((raw) => {
      const sourceUrl = String(raw || '').trim();
      return isManagedImageUrl(sourceUrl) ? sourceUrl : '';
    });
  }

  const cache = new Map<string, string>();
  const output: string[] = [];
  let attemptedCount = 0;
  let uploadedCount = 0;
  let failedCount = 0;

  for (const raw of urls || []) {
    const sourceUrl = String(raw || '').trim();
    if (!sourceUrl) {
      output.push('');
      continue;
    }
    if (isManagedImageUrl(sourceUrl)) {
      output.push(sourceUrl);
      continue;
    }
    if (cache.has(sourceUrl)) {
      output.push(cache.get(sourceUrl) || '');
      continue;
    }

    attemptedCount += 1;
    // Hero fallback images should stay visually faithful, so upload without OCR transforms.
    const uploadedUrls = await uploadImageForOcr(sourceUrl, uploadUrl, context, { ocr: false });
    const managedUrl = uploadedUrls && uploadedUrls.length > 0
      ? String(uploadedUrls[0] || '').trim()
      : '';

    if (managedUrl && isManagedImageUrl(managedUrl)) {
      uploadedCount += 1;
      cache.set(sourceUrl, managedUrl);
      output.push(managedUrl);
    } else {
      failedCount += 1;
      cache.set(sourceUrl, '');
      output.push('');
    }
  }

  logger.info('Hero image upload summary', {
    postId: context.postId || '',
    inputCount: urls?.length || 0,
    attemptedCount,
    uploadedCount,
    failedCount,
  });

  return output;
}

async function downloadImageBufferWithRetry(
  imageUrl: string,
  context: { postId?: string }
): Promise<{ buffer: Buffer; contentType: string } | null> {
  for (let attempt = 1; attempt <= OCR_IMAGE_UPLOAD_RETRIES; attempt++) {
    const result = await downloadImageBuffer(imageUrl, context, attempt);
    if (result) return result;
  }
  return null;
}

async function downloadImageBuffer(
  imageUrl: string,
  context: { postId?: string },
  attempt: number
): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const response = await fetchWithTimeout(
      imageUrl,
      { method: 'GET', redirect: 'follow' },
      OCR_IMAGE_DOWNLOAD_TIMEOUT_MS
    );

    if (!response.ok) {
      logger.warn('OCR image download failed', {
        postId: context.postId || '',
        status: response.status,
        attempt,
      });
      return null;
    }

    const contentTypeHeader = response.headers.get('content-type') || '';
    const contentType = contentTypeHeader || guessContentType(imageUrl);
    if (!contentType || !contentType.startsWith('image/')) {
      logger.warn('OCR image download not an image', {
        postId: context.postId || '',
        contentType: contentTypeHeader,
        attempt,
      });
      return null;
    }

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength && contentLength > OCR_IMAGE_UPLOAD_MAX_BYTES) {
      logger.warn('OCR image download too large (header)', {
        postId: context.postId || '',
        contentLength,
        attempt,
      });
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > OCR_IMAGE_UPLOAD_MAX_BYTES) {
      logger.warn('OCR image download too large (buffer)', {
        postId: context.postId || '',
        contentLength: buffer.length,
        attempt,
      });
      return null;
    }

    return { buffer, contentType };
  } catch (error) {
    if (shouldUseCurlDownloadFallback(imageUrl, error)) {
      const fallback = await downloadImageBufferWithCurl(imageUrl, context, attempt, error);
      if (fallback) return fallback;
    }
    logger.warn('OCR image download error', {
      postId: context.postId || '',
      attempt,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function downloadImageBufferWithCurl(
  imageUrl: string,
  context: { postId?: string },
  attempt: number,
  fetchError: unknown
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const timeoutSeconds = Math.max(5, Math.ceil(OCR_IMAGE_DOWNLOAD_TIMEOUT_MS / 1000));

  try {
    const { stdout } = await execFileAsync(
      'curl',
      ['-L', '--silent', '--show-error', '--max-time', String(timeoutSeconds), imageUrl],
      {
        encoding: 'buffer',
        maxBuffer: CURL_DOWNLOAD_MAX_BUFFER_BYTES,
        windowsHide: true,
      }
    );

    const buffer = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout || '');
    if (!buffer || buffer.length === 0) {
      logger.warn('OCR image curl fallback empty response', {
        postId: context.postId || '',
        attempt,
      });
      return null;
    }
    if (buffer.length > OCR_IMAGE_UPLOAD_MAX_BYTES) {
      logger.warn('OCR image curl fallback too large', {
        postId: context.postId || '',
        attempt,
        contentLength: buffer.length,
      });
      return null;
    }

    logger.info('OCR image curl fallback succeeded', {
      postId: context.postId || '',
      attempt,
    });
    return { buffer, contentType: guessContentType(imageUrl) };
  } catch (curlError) {
    logger.warn('OCR image curl fallback failed', {
      postId: context.postId || '',
      attempt,
      fetchError: fetchError instanceof Error ? fetchError.message : String(fetchError),
      curlError: curlError instanceof Error ? curlError.message : String(curlError),
    });
    return null;
  }
}

function shouldUseCurlDownloadFallback(imageUrl: string, error: unknown): boolean {
  try {
    const host = new URL(String(imageUrl || '')).hostname.toLowerCase();
    if (!host.includes('fbcdn.net') && !host.includes('scontent')) return false;
  } catch {
    return false;
  }

  const transientCodes = new Set([
    'ETIMEDOUT',
    'ENETUNREACH',
    'EAI_AGAIN',
    'ECONNRESET',
    'ECONNREFUSED',
  ]);
  const codes = extractNetworkErrorCodes(error);
  if (codes.size === 0) return true;
  for (const code of codes) {
    if (transientCodes.has(code)) return true;
  }
  return false;
}

function extractNetworkErrorCodes(error: unknown): Set<string> {
  const codes = new Set<string>();
  const anyError = error as any;
  if (typeof anyError?.code === 'string') codes.add(anyError.code);
  if (typeof anyError?.cause?.code === 'string') codes.add(anyError.cause.code);
  if (Array.isArray(anyError?.cause?.errors)) {
    for (const nested of anyError.cause.errors) {
      if (typeof nested?.code === 'string') codes.add(nested.code);
    }
  }
  return codes;
}

async function uploadImageBufferWithRetry(
  buffer: Buffer,
  contentType: string,
  uploadUrl: string,
  context: { postId?: string },
  options?: { tileMode?: string; ocr?: boolean; folder?: string }
): Promise<string[] | null> {
  for (let attempt = 1; attempt <= OCR_IMAGE_UPLOAD_RETRIES; attempt++) {
    const result = await uploadImageBuffer(
      buffer,
      contentType,
      uploadUrl,
      context,
      attempt,
      options
    );
    if (result) return result;
  }
  return null;
}

async function uploadImageBuffer(
  buffer: Buffer,
  contentType: string,
  uploadUrl: string,
  context: { postId?: string },
  attempt: number,
  options?: { tileMode?: string; ocr?: boolean; folder?: string }
): Promise<string[] | null> {
  try {
    const form = new FormData();
    const blob = new Blob([buffer], { type: contentType || 'image/jpeg' });
    const fileName = `ocr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const ocrEnabled = options?.ocr !== false;

    form.append('folder', options?.folder || OCR_IMAGE_UPLOAD_FOLDER);
    form.append('image', blob, fileName);
    form.append('filename', fileName);
    form.append('ocr', ocrEnabled ? 'true' : 'false');
    if (ocrEnabled && options?.tileMode) {
      form.append('tile', options.tileMode);
    }

    const response = await fetchWithTimeout(
      uploadUrl,
      { method: 'POST', body: form },
      OCR_IMAGE_UPLOAD_TIMEOUT_MS
    );

    const text = await response.text();
    if (!response.ok) {
      logger.warn('OCR image upload failed', {
        postId: context.postId || '',
        status: response.status,
        attempt,
      });
      return null;
    }

    const payload = safeJsonParse(text);
    const uploadedUrls = normalizeUploadResponseUrls(payload);
    if (!uploadedUrls || uploadedUrls.length === 0) {
      logger.warn('OCR image upload missing imageUrl', {
        postId: context.postId || '',
        attempt,
      });
      return null;
    }

    return uploadedUrls;
  } catch (error) {
    logger.warn('OCR image upload error', {
      postId: context.postId || '',
      attempt,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function cleanupUnusedOcrImages(
  ocrImageUrls: string[],
  processedEvents: ProcessedEvent[]
): Promise<void> {
  if (!ocrImageUrls || ocrImageUrls.length === 0) return;

  const deleteUrl = getImageDeleteUrl();
  if (!deleteUrl) return;

  const keep = new Set<string>();
  for (const event of processedEvents || []) {
    if ((event as any).icon) keep.add((event as any).icon);
    if (event.relevantImageUrl) keep.add(event.relevantImageUrl);
    if (event.image) keep.add(event.image);
    const eventMediaUrls = Array.isArray((event as any).mediaUrls)
      ? (event as any).mediaUrls
      : [];
    for (const mediaUrl of eventMediaUrls) {
      if (mediaUrl) keep.add(mediaUrl);
    }
  }

  const deletions = ocrImageUrls.filter(url => url && !keep.has(url) && isManagedImageUrl(url));
  if (deletions.length === 0) return;

  let deleted = 0;
  for (const url of deletions) {
    const success = await deleteImageWithRetry(url, deleteUrl);
    if (success) deleted++;
  }

  logger.info('OCR image cleanup summary', {
    total: ocrImageUrls.length,
    kept: keep.size,
    deleted,
    skipped: deletions.length - deleted,
  });
}

async function deleteImageWithRetry(imageUrl: string, deleteUrl: string): Promise<boolean> {
  for (let attempt = 1; attempt <= OCR_IMAGE_UPLOAD_RETRIES; attempt++) {
    const ok = await deleteImage(imageUrl, deleteUrl, attempt);
    if (ok) return true;
  }
  return false;
}

async function deleteImage(
  imageUrl: string,
  deleteUrl: string,
  attempt: number
): Promise<boolean> {
  try {
    const payload = JSON.stringify({ imageUrl });
    const response = await fetchWithTimeout(
      deleteUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      },
      OCR_IMAGE_UPLOAD_TIMEOUT_MS
    );

    const responseText = await response.text();

    if (!response.ok) {
      const parsed = safeJsonParse(responseText);
      const detailsRaw = String(parsed?.details || parsed?.error || responseText || '').trim();
      const details = detailsRaw.slice(0, 220);
      const missingObject = /no such object/i.test(detailsRaw);
      if (missingObject) {
        logger.debug('OCR image already deleted', { attempt });
        return true;
      }
      logger.warn('OCR image delete failed', {
        status: response.status,
        attempt,
        details,
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.warn('OCR image delete error', {
      attempt,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

function getImageDeleteUrl(): string | null {
  const explicit = process.env.IMAGE_DELETE_URL;
  if (explicit) return explicit;

  const uploadUrl = process.env.IMAGE_UPLOAD_URL || '';
  if (!uploadUrl) return null;

  if (uploadUrl.includes('/upload-image')) {
    return uploadUrl.replace(/\/upload-image\/?$/, '/delete-image/');
  }

  return null;
}

function isManagedImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === 'storage.googleapis.com' &&
      parsed.pathname.includes('/gathr-uploaded-images/')
    );
  } catch {
    return false;
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeUploadResponseUrls(payload: any): string[] {
  if (!payload) return [];

  const urls: string[] = [];
  const primary = payload.imageUrl || payload.publicUrl;
  if (primary) urls.push(String(primary));

  if (Array.isArray(payload.imageUrls)) {
    for (const url of payload.imageUrls) {
      if (url && !urls.includes(String(url))) urls.push(String(url));
    }
  }

  if (Array.isArray(payload.tileUrls)) {
    for (const url of payload.tileUrls) {
      if (url && !urls.includes(String(url))) urls.push(String(url));
    }
  }

  return urls;
}

function guessContentType(url: string): string {
  const lower = String(url || '').toLowerCase();
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.webp')) return 'image/webp';
  if (lower.includes('.gif')) return 'image/gif';
  if (lower.includes('.bmp')) return 'image/bmp';
  return 'image/jpeg';
}

function normalizeImageUrls(urls: string[], maxCount: number): string[] {
  const unique = new Set<string>();
  for (const raw of urls || []) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) continue;
    if (!/^https?:\/\//i.test(trimmed)) continue;
    if (!looksLikeImageUrl(trimmed)) continue;
    unique.add(trimmed);
    if (unique.size >= maxCount) break;
  }
  return Array.from(unique);
}

function looksLikeImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    if (/\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(path)) return true;
    if (host.includes('fbcdn.net') || host.includes('scontent')) return true;
    if (host.includes('cdninstagram.com') || host.includes('instagram.com')) return true;
    if (host.includes('googleusercontent.com')) return true;
    return false;
  } catch {
    return false;
  }
}

function looksLikeCalendarPost(text: string): boolean {
  const t = String(text || '').toLowerCase();
  if (!t) return false;

  const monthRe = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\b/;
  const weekdayRe = /\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/;
  const calendarWordRe = /\b(calendar|schedule|timetable|lineup|classes|class|week|month)\b/;
  const timeRe = /\b\d{1,2}(:\d{2})?\s*(am|pm)\b/;

  const score =
    (monthRe.test(t) ? 1 : 0) +
    (weekdayRe.test(t) ? 1 : 0) +
    (calendarWordRe.test(t) ? 1 : 0) +
    ((t.match(timeRe) || []).length >= 3 ? 1 : 0);

  return score >= 2;
}

function registerTileMapping(urls: string[]): void {
  if (!urls || urls.length < 2) return;
  const baseUrl = urls[0];
  for (const tileUrl of urls.slice(1)) {
    if (tileUrl) ocrTileBaseMap.set(tileUrl, baseUrl);
  }
}

function registerSourceMapping(sourceUrl: string, uploadedUrls: string[]): void {
  const source = String(sourceUrl || '').trim();
  if (!source || !uploadedUrls || uploadedUrls.length === 0) return;
  for (const uploadedUrl of uploadedUrls) {
    const managedUrl = String(uploadedUrl || '').trim();
    if (!managedUrl) continue;
    ocrUploadedSourceMap.set(managedUrl, source);
  }
}

function registerDisplayMapping(sourceUrl: string, managedUrl: string): void {
  const source = String(sourceUrl || '').trim();
  const managed = String(managedUrl || '').trim();
  if (!source || !managed || !isManagedImageUrl(managed)) return;
  sourceManagedImageMap.set(source, managed);
}

function mapOcrImageUrlToBase(url: string): string {
  if (!url) return url;
  return ocrTileBaseMap.get(url) || url;
}

function mapOcrImageUrlToManaged(url: string): string {
  const input = String(url || '').trim();
  if (!input) return '';

  // Already managed: prefer mapped display image when this is an OCR upload.
  if (isManagedImageUrl(input)) {
    const sourceFromManaged = ocrUploadedSourceMap.get(input);
    if (sourceFromManaged) {
      const mapped = sourceManagedImageMap.get(sourceFromManaged);
      if (mapped && isManagedImageUrl(mapped)) return mapped;
    }
    return input;
  }

  // Source URL directly from extraction.
  const mappedDirect = sourceManagedImageMap.get(input);
  if (mappedDirect && isManagedImageUrl(mappedDirect)) return mappedDirect;

  // OCR uploaded URL -> source URL -> managed display URL.
  const sourceUrl = ocrUploadedSourceMap.get(input);
  if (sourceUrl) {
    const mappedFromSource = sourceManagedImageMap.get(sourceUrl);
    if (mappedFromSource && isManagedImageUrl(mappedFromSource)) return mappedFromSource;
  }

  // OCR tile URL -> base OCR URL -> source URL -> managed display URL.
  const baseUrl = ocrTileBaseMap.get(input);
  if (baseUrl && baseUrl !== input) {
    const mappedFromBase = mapOcrImageUrlToManaged(baseUrl);
    if (mappedFromBase) return mappedFromBase;
  }

  return '';
}

function extractOcrTextForPrompt(raw: string | undefined): string {
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

function appendOcrText(text: string, ocrText: string | undefined): string {
  const extracted = extractOcrTextForPrompt(ocrText);
  if (!extracted) return text;
  return `${text}\n\nOCR TEXT:\n${extracted}`;
}

async function buildOcrDebugSnapshot(
  inputUrls: string[],
  uploadedUrls: string[],
  combinedText: string,
  config: ParsingConfig
): Promise<OcrDebugSnapshot> {
  const tileUrls = (uploadedUrls || []).filter(url => ocrTileBaseMap.has(url));
  const tileBaseMap: Record<string, string> = {};
  for (const tileUrl of tileUrls) {
    const base = mapOcrImageUrlToBase(tileUrl);
    if (base) tileBaseMap[tileUrl] = base;
  }

  let ocrText = '';
  let ocrModel = '';
  let error = '';

  if (!uploadedUrls || uploadedUrls.length === 0) {
    error = 'no_images';
  } else {
    const ocrSourceUrls = [uploadedUrls[0]].filter(Boolean);
    const ocrStart = Date.now();
    const result = await extractOcrDebugText(ocrSourceUrls, config);
    logTiming('ocr_text_extract', ocrStart, {
      imageCount: ocrSourceUrls.length,
      hasText: Boolean(result.text),
      error: result.error || '',
    });
    ocrText = result.text || '';
    ocrModel = result.model || '';
    error = result.error || '';
  }

  return {
    inputUrls: inputUrls || [],
    uploadedUrls: uploadedUrls || [],
    tileUrls,
    tileBaseMap: Object.keys(tileBaseMap).length ? tileBaseMap : undefined,
    calendarTiles: looksLikeCalendarPost(combinedText || ''),
    ocrText,
    ocrModel,
    error,
  };
}

function hasExplicitMidnight(event: TimeResolvedEvent, which: 'start' | 'end'): boolean {
  const evidence =
    which === 'start'
      ? event.timeFlags?.start?.evidence
      : event.timeFlags?.end?.evidence;
  const haystack = [event.name, event.description, evidence]
    .filter(Boolean)
    .join(' ');
  return (
    /\bmidnight\b/i.test(haystack) ||
    /\b12(?::00)?\s*a\.?m\.?\b/i.test(haystack) ||
    /\ball[\s-]?day\b|\bopen\s*to\s*close\b/i.test(haystack)
  );
}

// Re-export types and config for convenience
export {
  ParsePostInput,
  ProcessedEvent,
  ParsingConfig,
  DEFAULT_PARSING_CONFIG,
  EstablishmentMap,
  extractExplicitTimeRangeFromEvidence as extractExplicitTimeRangeForRegression,
  extractExplicitEndTimeFromEvidence as extractExplicitEndTimeForRegression,
};
