import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareStage2RouteArms,
  resolveStage2ScoreRouting,
  selectLunaDenseFrameIndices,
} from './stage2Routing.js';

function buildClassification(overrides: Record<string, unknown> = {}) {
  return {
    contentType: 'EVENT',
    estimatedItemCount: 24,
    contentAnalysis: {
      hasEvents: true,
      hasFoodSpecials: false,
      hasMultipleItems: true,
      organizationStyle: 'unstructured',
    },
    ...overrides,
  };
}

function buildValidation(imageComplexityOverrides: Record<string, unknown> = {}) {
  return {
    imageAnalysis: [
      {
        imageComplexity: {
          hasCalendarGrid: true,
          recommendsTiling: true,
          hasDenseText: true,
          hasMultipleEventListings: true,
          textDensityScore: 0.82,
          isPromotionalPhoto: false,
          ...imageComplexityOverrides,
        },
      },
    ],
  };
}

test('upgrades a Milton-like EVENT row to CALENDAR when strong grid-style image evidence is present', () => {
  const routing = resolveStage2ScoreRouting(
    'Check the municipal website for details on these and other events. OCR TEXT: May be an image of text',
    buildClassification(),
    buildValidation()
  );

  assert.equal(routing.enabled, false);
  assert.equal(routing.forceContentTypeOverride, true);
  assert.equal(routing.shouldUseRoutedContentType, true);
  assert.equal(routing.routedContentType, 'CALENDAR');
  assert.equal(routing.routingReason, 'image_calendar_guard');
  assert.equal(routing.shouldUseCalendarTiles, true);
});

test('keeps an image-rich single-event poster as EVENT when calendar-grid evidence is missing', () => {
  const routing = resolveStage2ScoreRouting(
    'Saturday at 8 PM. Live music with John Curtis Sampson.',
    buildClassification({
      estimatedItemCount: 1,
      contentAnalysis: {
        hasEvents: true,
        hasFoodSpecials: false,
        hasMultipleItems: false,
        organizationStyle: 'unstructured',
      },
    }),
    buildValidation({
      hasCalendarGrid: false,
      recommendsTiling: true,
      hasMultipleEventListings: false,
    })
  );

  assert.equal(routing.forceContentTypeOverride, false);
  assert.equal(routing.shouldUseRoutedContentType, false);
  assert.equal(routing.routedContentType, 'EVENT');
  assert.equal(routing.routingReason, 'keep_model');
});

test('a one-item caption estimate cannot suppress independently observed multi-listing calendar evidence', () => {
  const routing = resolveStage2ScoreRouting('Souris Show Hall on October 24.',
    buildClassification({ estimatedItemCount: 1, contentAnalysis: {
      hasEvents: true, hasFoodSpecials: false, hasMultipleItems: false, organizationStyle: 'unstructured',
    } }), buildValidation({ textDensityScore: 0.4 }));
  assert.equal(routing.routedContentType, 'CALENDAR');
  assert.equal(routing.forceContentTypeOverride, true);
  assert.equal(routing.signals.estimatedItemCount, 1);
});

test('route comparison reuses the production resolver and exact whole-frame dense predicate', () => {
  const combinedText = 'The weekly schedule is posted here.';
  const environment = {
    ENABLE_STAGE2_SCORE_ROUTING: 'true',
    ENABLE_STAGE2_SCORE_SHADOW_LOG: 'false',
    STAGE2_CALENDAR_SCORE_MIN: '8',
    STAGE2_CALENDAR_MARGIN_MIN: '2',
    STAGE2_SCHEDULE_SCORE_MIN: '7',
    STAGE2_SCHEDULE_MARGIN_MIN: '2',
    STAGE2_SMALL_POST_MAX_ITEMS: '5',
    STAGE2_TILED_CALENDAR_SCORE_MIN: '10',
    STAGE2_TILED_MIN_ITEMS: '8',
    STAGE2_SCHEDULE_BLOCK_IF_GRID: 'true',
    STAGE2_AMBIGUOUS_ROUTE: 'CALENDAR_BASIC',
  };
  const frames = [
    { kind: 'whole', sourceGalleryIndex: 0 },
    { kind: 'whole', sourceGalleryIndex: 1 },
    { kind: 'calendar_band', sourceGalleryIndex: 0 },
  ];
  const baselineValidation = {
    imageAnalysis: [
      { imageIndex: 0, imageComplexity: {
        hasCalendarGrid: true, recommendsTiling: true, hasDenseText: true,
        hasMultipleEventListings: true, textDensityScore: 0.82, isPromotionalPhoto: false,
      } },
      { imageIndex: 1, imageComplexity: {
        hasCalendarGrid: false, recommendsTiling: false, hasDenseText: false,
        hasMultipleEventListings: false, textDensityScore: 0.2, isPromotionalPhoto: true,
      } },
    ],
  };
  const candidateValidation = structuredClone(baselineValidation);
  candidateValidation.imageAnalysis[0].imageComplexity.hasDenseText = false;
  candidateValidation.imageAnalysis[0].imageComplexity.recommendsTiling = false;
  candidateValidation.imageAnalysis[1].imageComplexity.hasDenseText = true;
  candidateValidation.imageAnalysis[1].imageComplexity.recommendsTiling = true;
  candidateValidation.imageAnalysis[1].imageComplexity.textDensityScore = 0.8;
  candidateValidation.imageAnalysis[1].imageComplexity.isPromotionalPhoto = false;

  const baseline = {
    classification: buildClassification(),
    validation: baselineValidation,
    lunaAnalysisFrames: frames,
    productionDenseFrameIndices: [0],
    lunaFullImageReady: true,
  };
  const candidate = {
    classification: buildClassification({ contentType: 'CALENDAR' }),
    validation: candidateValidation,
    lunaAnalysisFrames: frames,
    productionDenseFrameIndices: [1],
    lunaFullImageReady: true,
  };
  const compared = compareStage2RouteArms(combinedText, baseline, candidate, environment);

  assert.deepEqual(
    compared.baseline.routing,
    resolveStage2ScoreRouting(combinedText, baseline.classification, baseline.validation, environment)
  );
  assert.deepEqual(
    compared.baseline.denseFrameIndices,
    selectLunaDenseFrameIndices(baseline.validation, frames)
  );
  assert.deepEqual(compared.baseline.denseFrameIndices, [0]);
  assert.deepEqual(compared.candidate.denseFrameIndices, [1]);
  assert.equal(compared.baseline.denseFrameSelectionMatchesProductionSnapshot, true);
  assert.equal(compared.candidate.denseFrameSelectionMatchesProductionSnapshot, true);
  assert.equal(compared.baseline.calendarTilesSelected, false);
  assert.equal(compared.changed.denseFrameSelection, true);
});
