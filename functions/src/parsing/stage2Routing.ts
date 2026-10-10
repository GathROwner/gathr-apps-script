import { detectCalendarSignals } from './contentValidator.js';
import type { ContentType } from './types.js';

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

export interface Stage2ScoreRoutingDecision {
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

function routeBoolean(environment: Record<string, string | undefined>, key: string, fallback: boolean): boolean {
  const raw = environment[key];
  if (raw == null || raw === '') return fallback;
  return String(raw).trim().toLowerCase() !== 'false';
}

function routeNumber(environment: Record<string, string | undefined>, key: string, fallback: number): number {
  const raw = environment[key];
  if (raw == null || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
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

  // Stage 2 can focus on the caption's local show and estimate one item even
  // when Stage 1 independently saw a grid with multiple dated listings.
  // Preserve the calendar extraction prompt for that strongly supported case.
  if (hasCalendarGrid && recommendsTiling && hasMultipleEventListings) return true;

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
  validation: any,
  environment: Record<string, string | undefined> = process.env
): Stage2ScoreRoutingDecision {
  const thresholds: Stage2ScoreThresholds = {
    calendarScoreMin: routeNumber(environment, 'STAGE2_CALENDAR_SCORE_MIN', 8),
    calendarMarginMin: routeNumber(environment, 'STAGE2_CALENDAR_MARGIN_MIN', 2),
    scheduleScoreMin: routeNumber(environment, 'STAGE2_SCHEDULE_SCORE_MIN', 7),
    scheduleMarginMin: routeNumber(environment, 'STAGE2_SCHEDULE_MARGIN_MIN', 2),
    smallPostMaxItems: routeNumber(environment, 'STAGE2_SMALL_POST_MAX_ITEMS', 5),
    tiledCalendarScoreMin: routeNumber(environment, 'STAGE2_TILED_CALENDAR_SCORE_MIN', 10),
    tiledMinItems: routeNumber(environment, 'STAGE2_TILED_MIN_ITEMS', 8),
    scheduleBlockIfGrid: routeBoolean(environment, 'STAGE2_SCHEDULE_BLOCK_IF_GRID', true),
    ambiguousRoute:
      String(environment.STAGE2_AMBIGUOUS_ROUTE || 'CALENDAR_BASIC')
        .trim()
        .toUpperCase() === 'KEEP_MODEL'
        ? 'KEEP_MODEL'
        : 'CALENDAR_BASIC',
  };

  const enabled = routeBoolean(environment, 'ENABLE_STAGE2_SCORE_ROUTING', false);
  const shadowEnabled = routeBoolean(environment, 'ENABLE_STAGE2_SCORE_SHADOW_LOG', true);

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

/**
 * Return the indexes, in the prepared frame list, that production marks dense
 * enough for the Luna calendar inventory audit. Kept in this pure module so
 * the offline evaluator and the production parser use the same predicate.
 */
export function selectLunaDenseFrameIndices(
  validation: any,
  lunaAnalysisFrames: Array<{ kind?: string; sourceGalleryIndex?: number }>
): number[] {
  const denseSourceIndexes = new Set((validation?.imageAnalysis || [])
    .filter((image: any) => !image.imageComplexity?.isPromotionalPhoto &&
      Number(image.imageComplexity?.textDensityScore || 0) >= 0.65 &&
      (image.imageComplexity?.hasDenseText || image.imageComplexity?.recommendsTiling))
    .map((image: any) => image.imageIndex));
  return lunaAnalysisFrames.flatMap((frame, index) =>
    frame.kind === 'whole' && denseSourceIndexes.has(frame.sourceGalleryIndex)
      ? [index] : []);
}

export interface Stage2RouteEvaluationArm {
  classification: any;
  validation: any;
  lunaAnalysisFrames?: Array<{ kind?: string; sourceGalleryIndex?: number }>;
  productionDenseFrameIndices?: number[];
  lunaFullImageReady?: boolean;
}

function evaluateStage2RouteArm(
  combinedText: string,
  arm: Stage2RouteEvaluationArm,
  environment: Record<string, string | undefined>
) {
  const frames = arm.lunaAnalysisFrames || [];
  const routing = resolveStage2ScoreRouting(
    combinedText,
    arm.classification,
    arm.validation,
    environment
  );
  const resolvedContentType = routing.shouldUseRoutedContentType
    ? routing.routedContentType
    : (arm.classification?.contentType || 'EVENT');
  const denseFrameIndices = selectLunaDenseFrameIndices(arm.validation, frames);
  const denseSourceGalleryIndexes = denseFrameIndices.map(
    (frameIndex) => frames[frameIndex]?.sourceGalleryIndex
  );
  const calendarTilesSelected = !arm.lunaFullImageReady && (routing.enabled
    ? resolvedContentType === 'CALENDAR' && routing.shouldUseCalendarTiles
    : routing.legacyShouldUseCalendarTiles);

  return {
    modelContentType: arm.classification?.contentType || 'EVENT',
    resolvedContentType,
    routing,
    calendarTilesSelected,
    lunaFullImageReady: Boolean(arm.lunaFullImageReady),
    imageFrameManifest: frames.map((frame, frameIndex) => ({
      frameIndex,
      sourceGalleryIndex: frame.sourceGalleryIndex,
      kind: frame.kind || 'whole',
    })),
    denseFrameIndices,
    denseSourceGalleryIndexes,
    productionDenseFrameIndices: arm.productionDenseFrameIndices || null,
    denseFrameSelectionMatchesProductionSnapshot: arm.productionDenseFrameIndices
      ? JSON.stringify(denseFrameIndices) === JSON.stringify(arm.productionDenseFrameIndices)
      : null,
  };
}

/**
 * Compare baseline and candidate Stage 2 routing with the exact production
 * resolver and Luna dense-frame predicate, using a caller-supplied config snapshot.
 */
export function compareStage2RouteArms(
  combinedText: string,
  baseline: Stage2RouteEvaluationArm,
  candidate: Stage2RouteEvaluationArm,
  environment: Record<string, string | undefined> = process.env
) {
  const baselineResult = evaluateStage2RouteArm(combinedText, baseline, environment);
  const candidateResult = evaluateStage2RouteArm(combinedText, candidate, environment);
  return {
    baseline: baselineResult,
    candidate: candidateResult,
    changed: {
      resolvedContentType: baselineResult.resolvedContentType !== candidateResult.resolvedContentType,
      routingReason: baselineResult.routing.routingReason !== candidateResult.routing.routingReason,
      ocrMode: baselineResult.routing.ocrMode !== candidateResult.routing.ocrMode,
      calendarTilesSelected: baselineResult.calendarTilesSelected !== candidateResult.calendarTilesSelected,
      denseFrameSelection: JSON.stringify(baselineResult.denseFrameIndices) !==
        JSON.stringify(candidateResult.denseFrameIndices),
    },
  };
}


