import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  applyStage1LocalDecisionGates,
  createCompactValidationPrompt,
  createValidationPrompt,
  createValidationSchema,
  detectCalendarSignals,
  normalizeValidationResponse,
  validateContentForStage1Evaluation,
} from '../lib/parsing/contentValidator.js';
import {
  assessImageAnalysis,
  calculateObservedCostUsd,
  estimateRequestCostUsd,
  getCompletedResumeKeys,
  getVariants,
  historicalSpendFromCaseRecords,
  historicalSpendFromOutputRecords,
  loadAndValidateManifest,
  selectImagesForCase,
  Stage1EvaluationBudgetError,
  Stage1SpendBudget,
} from './stage1-evaluation-lib.mjs';

const functionsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = path.join(functionsRoot, 'test', 'fixtures', 'stage1-oct8');
const manifestPath = path.join(fixtureRoot, 'manifest.json');

function validationResult(imageCount, decision = true) {
  return {
    imageAnalysis: Array.from({ length: imageCount }, (_, index) => ({
      imageIndex: index,
      description: `Source image ${index} contains a clear image-specific cue.`,
      relevanceToPost: `Image ${index} supports the post.`,
      imageComplexity: {
        hasCalendarGrid: false,
        hasDenseText: false,
        hasMultipleEventListings: false,
        isPromotionalPhoto: true,
        textDensityScore: 0.2,
        recommendsTiling: false,
        recommendationReason: 'Mostly photographic.',
      },
    })),
    hasValidContent: decision,
    confidence: 0.9,
    validationDecision: decision ? 'VALIDATION_PASSED' : 'VALIDATION_FAILED',
    reason: decision ? 'Specific event or offer.' : 'No qualifying source content.',
  };
}

function apiResponse(payload, overrides = {}) {
  return {
    id: 'resp_mock_1',
    status: 'completed',
    output_text: JSON.stringify(payload),
    usage: {
      input_tokens: 1200,
      output_tokens: 80,
      total_tokens: 1280,
      input_tokens_details: { cached_tokens: 200, cache_write_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 7 },
    },
    ...overrides,
  };
}

function fakeClient(sequence) {
  const calls = [];
  const client = {
    responses: {
      create: async (request) => {
        calls.push(request);
        const next = sequence.shift();
        if (next instanceof Error) throw next;
        return next;
      },
    },
  };
  return { client, calls };
}

function getInputText(request) {
  return request.input[0].content.find((part) => part.type === 'input_text').text;
}

test('current GPT-5 mini arm keeps the production prompt, schema hint, and Responses request shape', async () => {
  const caption = 'No named event details in this caption.';
  const imageUrls = ['data:image/jpeg;base64,Zm9v'];
  const { client, calls } = fakeClient([apiResponse(validationResult(1))]);
  const usageEvents = [];
  const run = await validateContentForStage1Evaluation(
    caption,
    imageUrls,
    'A&W Restaurants, PEI',
    '2026-10-07T00:00:00.000Z',
    'gpt-5-mini',
    { promptVariant: 'production', structuredOutput: false, client },
    { gptUsageHandler: (usage) => usageEvents.push(usage) }
  );

  assert.equal(run.status, 'completed');
  assert.equal(run.attempts.length, 1);
  assert.equal(run.attempts[0].requestKind, 'initial');
  assert.equal(run.attempts[0].imageCount, 1);
  assert.equal(run.attempts[0].responseId, 'resp_mock_1');
  assert.equal(run.attempts[0].reasoningTokens, 7);
  assert.equal(run.attempts[0].visibleOutput, JSON.stringify(validationResult(1)));
  assert.equal(usageEvents[0].responseStatus, 'completed');
  assert.equal(usageEvents[0].reasoningTokens, 7);
  assert.equal(usageEvents[0].visibleOutputChars, run.attempts[0].visibleOutput.length);

  assert.equal(calls.length, 1);
  const request = calls[0];
  assert.equal(request.model, 'gpt-5-mini');
  assert.equal(request.max_output_tokens, 2000);
  assert.equal(request.input[0].content.length, 2);
  assert.equal(request.input[0].content[1].type, 'input_image');
  assert.equal(request.input[0].content[1].image_url, imageUrls[0]);
  assert.equal(request.text, undefined);
  assert.equal(request.tools, undefined);
  const exactProductionPrompt = createValidationPrompt(
    caption,
    true,
    'A&W Restaurants, PEI',
    '2026-10-07T00:00:00.000Z'
  );
  const exactCurrentRequestText = `${exactProductionPrompt}\n\nReturn ONLY valid JSON that matches this schema:\n${JSON.stringify(createValidationSchema()[0].parameters, null, 2)}`;
  assert.equal(getInputText(request), exactCurrentRequestText);
});

test('compact Structured Outputs arm uses the same schema without adding a new decision policy', async () => {
  const caption = 'A dated workshop with registration details.';
  const { client, calls } = fakeClient([apiResponse(validationResult(2))]);
  const run = await validateContentForStage1Evaluation(
    caption,
    ['data:image/jpeg;base64,Zm9v', 'data:image/jpeg;base64,YmFy'],
    'Test venue',
    '2026-10-07T00:00:00.000Z',
    'gpt-5-mini',
    { promptVariant: 'compact', structuredOutput: true, client }
  );

  assert.equal(run.status, 'completed');
  const request = calls[0];
  const compactPrompt = getInputText(request);
  const productionPrompt = createValidationPrompt(caption, true, 'Test venue', '2026-10-07T00:00:00.000Z');
  assert.equal(compactPrompt, createCompactValidationPrompt(caption, true, 'Test venue', '2026-10-07T00:00:00.000Z'));
  assert.ok(compactPrompt.length < productionPrompt.length);
  assert.match(compactPrompt, /An explicitly advertised daily special or deal qualifies even without a printed price/);
  assert.doesNotMatch(compactPrompt, /merchandise|retail discount/i);
  assert.deepEqual(request.text.format, {
    type: 'json_schema',
    name: 'validateContent',
    strict: true,
    schema: createValidationSchema()[0].parameters,
  });
  assert.equal(request.max_output_tokens, 2000);
  assert.equal(request.input[0].content.filter((part) => part.type === 'input_image').length, 2);
});

test('production normalizer clamps image complexity and local calendar gates remain active', () => {
  const normalized = normalizeValidationResponse({
    imageAnalysis: [{
      imageIndex: 0,
      description: 'Schedule table.',
      imageComplexity: { textDensityScore: 4, hasCalendarGrid: true },
    }],
    hasValidContent: false,
    confidence: 0.4,
    validationDecision: 'VALIDATION_FAILED',
    reason: 'Model rejected.',
  }, 'No text signals', true);
  assert.equal(normalized.imageAnalysis[0].imageComplexity.textDensityScore, 1);
  assert.equal(normalized.imageAnalysis[0].imageComplexity.hasDenseText, false);
  assert.equal(normalized.imageAnalysis[0].relevanceToPost, '');

  const calendarText = [
    'Events:',
    'Monday at Venue One: music 7 PM',
    'Tuesday at Venue Two: trivia 8 PM',
    'Wednesday at Venue Three: comedy 9 PM',
  ].join('\n');
  assert.equal(detectCalendarSignals(calendarText).hasCalendar, true);
  applyStage1LocalDecisionGates(normalized, calendarText, false);
  assert.equal(normalized.validationDecision, 'VALIDATION_PASSED');
  assert.match(normalized.reason, /override PASS/);
});

test('manifest pins hashes and distinguishes initial four-image coverage from full galleries', () => {
  const { manifest, sourceRoot } = loadAndValidateManifest(manifestPath);
  assert.equal(sourceRoot, fixtureRoot);
  assert.equal(manifest.cases.length, 12);
  assert.equal(manifest.cases.reduce((sum, item) => sum + item.images.length, 0), 27);
  const row65 = manifest.cases.find((item) => item.sourceRow === 65);
  assert.equal(selectImagesForCase(row65, 'initial').length, 4);
  assert.equal(selectImagesForCase(row65, 'full').length, 5);
  assert.deepEqual(selectImagesForCase(row65, 'full').map((image) => image.sourceGalleryIndex), [0, 1, 2, 3, 4]);
  assert.deepEqual(row65.expectedRelevantImageIndexes, [2, 3, 4]);
  assert.equal(row65.priorRunObservation.rawStage1DecisionCaptured, false);

  const manifestCopy = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifestCopy.cases[0].images[0].sha256 = '0'.repeat(64);
  const tempManifest = path.join(fs.mkdtempSync(path.join(process.env.TEMP || process.env.TMP || '.', 'stage1-manifest-')), 'manifest.json');
  fs.writeFileSync(tempManifest, JSON.stringify(manifestCopy));
  assert.throws(() => loadAndValidateManifest(tempManifest, fixtureRoot), /SHA-256 mismatch/);

  const pathCopy = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  pathCopy.cases[0].images[0].path = '../../package.json';
  const traversalManifest = path.join(path.dirname(tempManifest), 'path-manifest.json');
  fs.writeFileSync(traversalManifest, JSON.stringify(pathCopy));
  assert.throws(() => loadAndValidateManifest(traversalManifest, fixtureRoot), /must stay inside sourceRoot/);
});

test('semantic association catches swapped but nonempty image descriptions and cross-image time contamination', () => {
  const { manifest } = loadAndValidateManifest(manifestPath);
  const row65 = manifest.cases.find((item) => item.sourceRow === 65);
  const selected65 = selectImagesForCase(row65, 'full');
  const valid65 = {
    imageAnalysis: selected65.map((image) => ({
      imageIndex: image.sourceGalleryIndex,
      description: image.expectedCue,
      relevanceToPost: 'Describes this source image only.',
      imageComplexity: {},
    })),
  };
  assert.equal(assessImageAnalysis(valid65, selected65).semanticAssociationPassed, true);
  const swapped65 = structuredClone(valid65);
  [swapped65.imageAnalysis[2].description, swapped65.imageAnalysis[3].description] = [
    swapped65.imageAnalysis[3].description,
    swapped65.imageAnalysis[2].description,
  ];
  const swapCheck = assessImageAnalysis(swapped65, selected65);
  assert.equal(swapCheck.onePopulatedEntryPerImage, true);
  assert.deepEqual(swapCheck.semanticMismatchedIndexes, [2, 3]);
  assert.equal(swapCheck.semanticAssociationPassed, false);

  const row62 = manifest.cases.find((item) => item.sourceRow === 62);
  const selected62 = selectImagesForCase(row62, 'full');
  const contaminated = {
    imageAnalysis: selected62.map((image) => ({
      imageIndex: image.sourceGalleryIndex,
      description: image.sourceGalleryIndex === 4
        ? 'Relive the Music - 50s, 60s & 70s Show, October 19 at 7:30 PM.'
        : image.expectedCue,
      relevanceToPost: 'Describes this source image only.',
      imageComplexity: {},
    })),
  };
  const timeCheck = assessImageAnalysis(contaminated, selected62);
  assert.deepEqual(timeCheck.semanticMismatchedIndexes, [4]);
  assert.equal(timeCheck.semanticAssociationPassed, false);
});

test('semantic cue matching tolerates ordinal dates, time punctuation, possessives, and common plurals', () => {
  const { manifest } = loadAndValidateManifest(manifestPath);
  const row124 = manifest.cases.find((item) => item.sourceRow === 124);
  const selected124 = selectImagesForCase(row124, 'full');
  const ordinaryMarketDescriptions = [
    'Toby’s Farm Market exterior with a flower.',
    'Rows of pumpkins for sale in a field.',
    'Pumpkins beside a sign.',
    'Rutabagas and cabbages on a produce display.',
    'A bag of root vegetables, likely parsnips.',
  ];
  const marketResult = {
    imageAnalysis: selected124.map((image) => ({
      imageIndex: image.sourceGalleryIndex,
      description: ordinaryMarketDescriptions[image.sourceGalleryIndex],
      relevanceToPost: 'Describes this source image only.',
    })),
  };
  const marketCheck = assessImageAnalysis(marketResult, selected124);
  assert.equal(marketCheck.semanticAssociationPassed, true);
  assert.deepEqual(marketCheck.semanticMismatchedIndexes, []);

  const swappedMarket = structuredClone(marketResult);
  [swappedMarket.imageAnalysis[1].description, swappedMarket.imageAnalysis[2].description] = [
    swappedMarket.imageAnalysis[2].description,
    swappedMarket.imageAnalysis[1].description,
  ];
  assert.deepEqual(assessImageAnalysis(swappedMarket, selected124).semanticMismatchedIndexes, [1, 2]);

  for (const sourceRow of [329, 343]) {
    const sourceCase = manifest.cases.find((item) => item.sourceRow === sourceRow);
    const selected = selectImagesForCase(sourceCase, 'full');
    const description = sourceRow === 329
      ? 'Pancake brunch fundraiser October 25th, 2026; servings at 9.30 a.m. and 11:30AM.'
      : 'The Arts Guild on October 10th, 2026: restorative healing at 1:00 p.m., then community time.';
    const checked = assessImageAnalysis({
      imageAnalysis: selected.map((image) => ({
        imageIndex: image.sourceGalleryIndex,
        description,
        relevanceToPost: 'Describes this source image only.',
      })),
    }, selected);
    assert.equal(checked.semanticAssociationPassed, true, `source row ${sourceRow}`);
    assert.deepEqual(checked.semanticMismatchedIndexes, [], `source row ${sourceRow}`);
  }
});

test('dense PowerSkate layout flags are compared, while full date transcription is not required', () => {
  const { manifest } = loadAndValidateManifest(manifestPath);
  const row287 = manifest.cases.find((item) => item.sourceRow === 287);
  const selected = selectImagesForCase(row287, 'full');
  const checked = assessImageAnalysis({
    imageAnalysis: [{
      imageIndex: 0,
      description: 'A two-column PowerSkating sessions schedule with Saturday and Sunday dates.',
      relevanceToPost: 'The table lists multiple sessions.',
      imageComplexity: {
        hasCalendarGrid: true,
        hasDenseText: true,
        hasMultipleEventListings: true,
        recommendsTiling: true,
      },
    }],
  }, selected);
  assert.equal(checked.expectedLayoutChecks[0].matches, true);
  assert.equal(checked.onePopulatedEntryPerImage, true);
  assert.equal(checked.semanticAssociationPassed, true);
  assert.doesNotMatch(row287.images[0].expectedCue, /October 24|October 31|November 14/);
});

test('image request error and truncated responses expose attempts and mark image fallback inconclusive', async () => {
  const fallbackPayload = validationResult(0, false);
  const imageUrls = [
    'data:image/jpeg;base64,Zm9v',
    'data:image/jpeg;base64,YmFy',
  ];
  const first = fakeClient([
    new Error('mock connection reset'),
    apiResponse(fallbackPayload),
  ]);
  const failedImageRun = await validateContentForStage1Evaluation(
    'No event details.', imageUrls, 'Venue', '2026-10-07', 'gpt-5-mini',
    { promptVariant: 'production', structuredOutput: false, client: first.client }
  );
  assert.equal(failedImageRun.status, 'inconclusive');
  assert.equal(failedImageRun.noImageFallbackUsed, true);
  assert.deepEqual(failedImageRun.attempts.map((attempt) => attempt.requestKind), ['initial', 'no_image_fallback']);
  assert.deepEqual(failedImageRun.attempts.map((attempt) => attempt.imageCount), [2, 0]);
  assert.match(failedImageRun.attempts[1].visibleOutput, /VALIDATION_FAILED/);
  assert.match(getInputText(first.calls[1]), /Has images: true/);

  const truncated = fakeClient([
    apiResponse({}, { status: 'incomplete', output_text: '{"hasValidContent":false,', usage: {
      input_tokens: 500, output_tokens: 2000, total_tokens: 2500,
    } }),
    apiResponse({}, { status: 'incomplete', output_text: '{"hasValidContent":', usage: {
      input_tokens: 500, output_tokens: 4000, total_tokens: 4500,
    } }),
    apiResponse(fallbackPayload),
  ]);
  const truncatedRun = await validateContentForStage1Evaluation(
    'No event details.', imageUrls, 'Venue', '2026-10-07', 'gpt-5-mini',
    { promptVariant: 'production', structuredOutput: false, client: truncated.client }
  );
  assert.equal(truncatedRun.status, 'inconclusive');
  assert.deepEqual(truncatedRun.attempts.map((attempt) => attempt.requestKind), [
    'initial', 'output_limit_retry', 'no_image_fallback',
  ]);
  assert.deepEqual(truncatedRun.attempts.map((attempt) => attempt.status), [
    'incomplete', 'incomplete', 'completed',
  ]);
  assert.equal(truncatedRun.attempts[1].maxOutputTokens, 4000);
  assert.ok(truncatedRun.attempts[0].visibleOutput.length > 0);
});

test('spend preflight stops before transport and the JSONL resume key ignores unfinished records', async () => {
  const budget = new Stage1SpendBudget(0.0001);
  const plan = {
    requestIndex: 1,
    requestKind: 'initial',
    model: 'gpt-5-mini',
    endpoint: 'responses',
    imageCount: 4,
    maxOutputTokens: 2000,
    inputTextChars: 6000,
  };
  assert.throws(() => budget.reserve(plan), Stage1EvaluationBudgetError);
  const tooLarge = estimateRequestCostUsd(plan);
  assert.ok(tooLarge > 0.0001);

  const clientState = fakeClient([]);
  const run = await validateContentForStage1Evaluation(
    'Text', ['data:image/jpeg;base64,Zm9v'], 'Venue', '2026-10-07', 'gpt-5-mini',
    {
      promptVariant: 'production',
      structuredOutput: false,
      client: clientState.client,
      onBeforeRequest: () => { throw new Stage1EvaluationBudgetError('cap reached'); },
      onAttempt: () => {},
    }
  );
  assert.equal(run.status, 'budget_stopped');
  assert.equal(run.result, null);
  assert.equal(run.noImageFallbackUsed, false);
  assert.equal(clientState.calls.length, 0);

  const records = [
    { recordType: 'case_result', caseId: 'a', variantId: 'mini-current', imageSet: 'initial', status: 'completed' },
    { recordType: 'case_result', caseId: 'b', variantId: 'luna-current', imageSet: 'full', status: 'inconclusive' },
    { recordType: 'case_result', caseId: 'c', variantId: 'mini-current', imageSet: 'initial', status: 'request_error' },
    { recordType: 'run_summary' },
  ];
  const keys = getCompletedResumeKeys(records.map((record) => JSON.stringify(record)));
  assert.equal(keys.size, 2);
  assert.equal(keys.has('a\u0000mini-current\u0000initial'), true);
  assert.equal(historicalSpendFromCaseRecords([
    { recordType: 'case_result', requestAttempts: [{ retainedReserveUsd: 0.02 }, { retainedReserveUsd: 0.03 }] },
  ]), 0.05);
  assert.equal(historicalSpendFromOutputRecords([
    { recordType: 'request_attempt', runId: 'new', attemptEventId: 'new:1', attempt: { retainedReserveUsd: 0.02 } },
    { recordType: 'case_result', runId: 'new', requestAttempts: [{ retainedReserveUsd: 0.02 }] },
    { recordType: 'case_result', runId: 'old', requestAttempts: [{ retainedReserveUsd: 0.03 }] },
  ]), 0.05);
});

test('cost estimate includes cached input, reasoning output, and conservative GPT-6 cache-write reserve', () => {
  const observedMini = calculateObservedCostUsd({
    model: 'gpt-5-mini', inputTokens: 1000, cachedInputTokens: 200, outputTokens: 300,
  });
  assert.equal(observedMini, 0.000805);
  const observedLuna = calculateObservedCostUsd({
    model: 'gpt-6-luna', inputTokens: 1000, cachedInputTokens: 0, outputTokens: 300,
  });
  assert.equal(observedLuna, 0.000275);
  const lunaPlan = {
    model: 'gpt-6-luna', imageCount: 1, maxOutputTokens: 6000, inputTextChars: 100,
  };
  assert.ok(estimateRequestCostUsd(lunaPlan) > observedLuna);
});

test('runner uses zero hidden retries, a bounded request timeout, and imports no write-capable Firebase client', () => {
  const runnerPath = path.join(functionsRoot, 'scripts', 'stage1-evaluation-runner.mjs');
  const runnerSource = fs.readFileSync(runnerPath, 'utf8');
  const validatorSource = fs.readFileSync(path.join(functionsRoot, 'src', 'parsing', 'contentValidator.ts'), 'utf8');
  assert.match(runnerSource, /maxRetries:\s*0/);
  assert.match(runnerSource, /timeout:\s*60_000/);
  assert.doesNotMatch(runnerSource, /from\s+['"][^'"]*(?:firebase|firestore)/i);
  assert.doesNotMatch(validatorSource, /firebase-admin|firebase-functions|firestore/i);
  assert.deepEqual(getVariants(true).map((variant) => variant.id), [
    'mini-current',
    'mini-compact-structured',
    'luna-current',
    'luna-compact-structured',
  ]);
});
