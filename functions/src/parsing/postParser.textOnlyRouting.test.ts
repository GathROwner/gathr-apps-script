import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePostData } from './postParser.js';
import type { ParseSkipReason, ParseStageArtifactsSnapshot } from './types.js';

test('selected text-only post reaches validation without an image-availability hold', async () => {
  const settings = {
    DRY_RUN: 'true', PARSER_DRY_RUN_LOCAL_IMAGES: 'true', LUNA_CANARY_ENABLED: 'true', LUNA_CANARY_STAGE3_ONLY: 'true',
    LUNA_CANARY_POST_IDS: 'text-routing-regression', LUNA_CANARY_SAMPLE_PERCENT: '100',
    LUNA_CANARY_LEGACY_FALLBACK_ENABLED: 'false', LUNA_TEXT_ONLY_ENABLED: 'true',
  };
  const old = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  Object.assign(process.env, settings);
  const skips: ParseSkipReason[] = [], artifacts: ParseStageArtifactsSnapshot[] = [];
  try {
    const events = await parsePostData({
      combinedText: 'A birthday greeting, not a public activity.', mediaUrls: [],
      sharedPostThumbnails: [], userName: 'Hall', pageName: 'Hall',
      timestamp: '2026-10-09T12:00:00Z', facebookUrl: '', profilePicUrl: '',
      extractedData: { id: 'text-routing-regression' },
    }, {}, {
      stage1EvaluationValidationOverride: {
        imageAnalysis: [], hasValidContent: false, validationDecision: 'VALIDATION_FAILED',
        confidence: 1, reason: 'Personal birthday greeting',
      },
      skipReasonHandler: value => { skips.push(value); },
      stageArtifactsHandler: value => { artifacts.push(value); },
    });
    assert.deepEqual(events, []);
    assert.ok(artifacts.some(value => value.stage1Validation?.reason === 'Personal birthday greeting'));
    assert.equal(skips.length, 1);
    assert.equal(skips[0].stage, 'stage1');
    assert.match(skips[0].detail || '', /stage1_validation_failed/);
    assert.doesNotMatch(skips[0].detail || '', /image_missing|image_unavailable|source_mapping/);
  } finally {
    for (const key of Object.keys(settings)) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
  }
});
