import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveStage2ScoreRouting } from './postParser.js';

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
