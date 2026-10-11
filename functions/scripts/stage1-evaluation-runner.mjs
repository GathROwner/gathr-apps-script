import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import { stage1CachedTextBlocks } from '../lib/parsing/stage1PromptCache.js';
import {
  createStage1EvaluationPrompt,
  createValidationSchema,
  validateContentForStage1Evaluation,
} from '../lib/parsing/contentValidator.js';
import {
  assessImageAnalysis,
  appendJsonlRecord,
  DEFAULT_ESTIMATED_SPEND_USD,
  estimateRequestCostUsd,
  getCaseSourceIdentity,
  getCompletedResumeKeys,
  getVariants,
  historicalSpendFromOutputRecords,
  loadAndValidateManifest,
  makeSourceTruthScore,
  makeRunId,
  readImagesAsDataUrls,
  runWithConcurrency,
  selectCases,
  selectImagesForCase,
  selectVariants,
  Stage1SpendBudget,
  validateEstimatedSpendLimit,
  validateEvaluationConcurrency,
} from './stage1-evaluation-lib.mjs';

const contentValidatorPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../lib/parsing/contentValidator.js'
);
const compiledContentValidatorSha256 = createHash('sha256')
  .update(fs.readFileSync(contentValidatorPath))
  .digest('hex');

function requestedReasoningEffortForVariant(variant) {
  return variant.model.startsWith('gpt-6')
    ? variant.reasoningEffort || 'none'
    : null;
}

const DEFAULT_MANIFEST = path.resolve('test/fixtures/stage1-oct8/manifest.json');
const appendJsonl = appendJsonlRecord;

function parseArgs(argv) {
  const options = {
    manifest: DEFAULT_MANIFEST,
    output: null,
    imageSet: 'initial',
    maxEstimatedUsd: DEFAULT_ESTIMATED_SPEND_USD,
    sourceRoot: null,
    execute: false,
    includeCompactLuna: false,
    variantIds: null,
    caseIds: null,
    concurrency: 1,
    rerun: false,
    help: false,
  };
  const valueFlags = new Set([
    '--manifest', '--output', '--image-set', '--max-estimated-usd', '--source-root',
    '--variants', '--case-ids', '--concurrency',
  ]);
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--execute') {
      options.execute = true;
      continue;
    }
    if (arg === '--include-compact-luna') {
      options.includeCompactLuna = true;
      continue;
    }
    if (arg === '--variants') {
      const value = argv[++index];
      if (!value) throw new Error('Missing value for --variants');
      options.variantIds = value.split(',').map((id) => id.trim());
      continue;
    }
    if (arg === '--case-ids') {
      const value = argv[++index];
      if (!value) throw new Error('Missing value for --case-ids');
      options.caseIds = value.split(',').map((id) => id.trim());
      continue;
    }
    if (arg === '--concurrency') {
      const value = argv[++index];
      if (!value) throw new Error('Missing value for --concurrency');
      options.concurrency = Number(value);
      continue;
    }
    if (arg === '--rerun') {
      options.rerun = true;
      continue;
    }
    const separator = arg.indexOf('=');
    const flag = separator >= 0 ? arg.slice(0, separator) : arg;
    if (!valueFlags.has(flag)) throw new Error(`Unknown option: ${arg}`);
    const value = separator >= 0 ? arg.slice(separator + 1) : argv[++index];
    if (!value) throw new Error(`Missing value for ${flag}`);
    if (flag === '--manifest') options.manifest = value;
    if (flag === '--output') options.output = value;
    if (flag === '--image-set') options.imageSet = value;
    if (flag === '--max-estimated-usd') options.maxEstimatedUsd = Number(value);
    if (flag === '--source-root') options.sourceRoot = value;
    if (flag === '--variants') options.variantIds = value.split(',').map((id) => id.trim());
    if (flag === '--case-ids') options.caseIds = value.split(',').map((id) => id.trim());
    if (flag === '--concurrency') options.concurrency = Number(value);
  }
  return options;
}

function printHelp() {
  console.log(`Stage 1 local evaluation runner

Usage:
  node scripts/stage1-evaluation-runner.mjs [options]

Options:
  --manifest PATH              Versioned source-truth manifest (default: ${path.relative(process.cwd(), DEFAULT_MANIFEST)})
  --source-root PATH           Override the manifest's explicit local image root
  --image-set initial|full     Use first 4 images or the full source gallery (default: initial)
  --output PATH|-              Append JSONL case results to a file, or write JSONL to stdout
  --max-estimated-usd N        Spend stop, default $1, hard ceiling $10
  --variants ID,...            Select one or more arms; e.g. luna-compact-v5
  --case-ids ID,...            Select caseId values from the manifest
  --concurrency N              Parallel case/variant pairs, from 1 to 3 (default: 1)
  --include-compact-luna       Add the legacy Luna compact+Structured Outputs arm to defaults
  --rerun                      Re-run case/variant pairs already completed in this output file
  --execute                    Make OpenAI API calls; without this flag the run is offline preflight only
  --help                       Show this help

The runner reads only OPENAI_API_KEY from the environment, does not load .env files,
and has no Firebase, Firestore, Storage, venue-write, or release capability.`);
}

function effectivePromptText(caseData, variant, attachedImageCount = caseData.images.length) {
  const prompt = createStage1EvaluationPrompt(caseData.caption, attachedImageCount, caseData.venue, caseData.postedAt, variant.promptVariant);
  const text = variant.structuredOutput
    ? prompt
    : `${prompt}\n\nReturn ONLY valid JSON that matches this schema:\n${JSON.stringify(createValidationSchema()[0].parameters, null, 2)}`;
  return variant.model === 'gpt-6-luna' && variant.promptVariant === 'compact-v10' && !variant.structuredOutput
    ? stage1CachedTextBlocks(text).map(block=>block.text).join('\n')
    : text;
}

function effectivePromptSha256(caseData, variant, attachedImageCount = caseData.images.length) {
  return createHash('sha256').update(effectivePromptText(caseData, variant, attachedImageCount)).digest('hex');
}

function resolveOutputPath(output) {
  if (output === '-') return '-';
  if (!output) throw new Error('--output PATH|- is required for both offline preflight and execution.');
  return path.resolve(output);
}

function readExistingOutput(outputPath) {
  if (outputPath === '-' || !fs.existsSync(outputPath)) return { lines: [], records: [] };
  const text = fs.readFileSync(outputPath, 'utf8');
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const records = lines.map((line) => JSON.parse(line));
  return { lines, records };
}

function ensureOutputOutsideSourceRoot(outputPath, sourceRoot) {
  if (outputPath === '-') return;
  const relative = path.relative(sourceRoot, outputPath);
  if (relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))) {
    throw new Error('Choose an output file outside the fixture source root.');
  }
}

function makeMiniParity(variantId, caseData, status, result, baselineRecord) {
  if (variantId === 'mini-current') return null;
  const candidateDecision = status === 'completed' && result
    ? (result.hasValidContent ? 'accept' : 'reject')
    : null;
  const baselineDecision = baselineRecord?.status === 'completed' && baselineRecord?.finalNormalizedResult
    ? (baselineRecord.finalNormalizedResult.hasValidContent ? 'accept' : 'reject')
    : null;
  return {
    baselineVariant: 'mini-current',
    baselineDecision,
    candidateDecision,
    sameDecision: baselineDecision == null || candidateDecision == null
      ? null
      : baselineDecision === candidateDecision,
    status: baselineDecision == null || candidateDecision == null ? 'inconclusive' : 'compared',
    separateFromSourceTruthScore: true,
    knownHistoricalMiniFalseAccept: caseData.priorRunObservation?.knownHistoricalMiniFalseAccept ?? null,
  };
}

function addBudgetCostDetails(attempt, budget, requestAttempts) {
  const costs = budget.settle(attempt);
  requestAttempts.push({
    ...attempt,
    estimatedReservedUsd: costs?.estimatedReservedUsd ?? null,
    usageCostEstimateUsd: costs?.usageCostEstimateUsd ?? null,
    retainedReserveUsd: costs?.retainedReserveUsd ?? null,
  });
}

function buildPlan(manifest, cases, variants, imageSet, maxEstimatedUsd, concurrency) {
  let requestCount = 0;
  let selectedImageCount = 0;
  let estimatedInitialSpendUsd = 0;
  const casePlans = [];
  const requestedReasoningEffortByVariant = Object.fromEntries(
    variants.map((variant) => [variant.id, requestedReasoningEffortForVariant(variant)])
  );
  for (const caseData of cases) {
    const images = selectImagesForCase(caseData, imageSet);
    selectedImageCount += images.length;
    const promptSha256ByVariant = {};
    for (const variant of variants) {
      const promptText = effectivePromptText(caseData, variant, images.length);
      promptSha256ByVariant[variant.id] = createHash('sha256').update(promptText).digest('hex');
      const maxOutputTokens = variant.model === 'gpt-6-luna' ? 6000 : 2000;
      estimatedInitialSpendUsd += estimateRequestCostUsd({
        model: variant.model,
        imageCount: images.length,
        maxOutputTokens,
        inputTextChars: promptText.length,
      });
      requestCount++;
    }
    casePlans.push({
      caseId: caseData.caseId,
      sourceIdentity: getCaseSourceIdentity(caseData),
      dataset: caseData.dataset || caseData.datasetId || null,
      fileId: caseData.fileId || caseData.sourceFileId || null,
      sourceRow: caseData.sourceRow,
      sourceImageCount: caseData.images.length,
      selectedImageCount: images.length,
      hasImages: images.length > 0,
      selectedSourceGalleryIndexes: images.map((image) => image.sourceGalleryIndex),
      imageCoverage: {
        status: images.length === 0 ? 'not_applicable' : 'pending',
        expectedIndexes: images.map((image) => image.sourceGalleryIndex),
      },
      expectedDecision: caseData.sourceTruth.expectedDecision,
      goldDecisionAvailable: caseData.sourceTruth.expectedDecision !== 'review',
      effectivePromptSha256ByVariant: promptSha256ByVariant,
      requestedReasoningEffortByVariant,
    });
  }
  return {
    recordType: 'plan',
    manifestVersion: manifest.manifestVersion,
    imageSet,
    selectedCaseIds: cases.map((item) => item.caseId),
    variants: variants.map((variant) => ({
      ...variant,
      requestedReasoningEffort: requestedReasoningEffortForVariant(variant),
    })),
    caseCount: cases.length,
    requestCount,
    concurrency,
    selectedImageCountAcrossCases: selectedImageCount,
    compiledContentValidatorSha256,
    requestedReasoningEffortByVariant,
    estimatedInitialSpendUsd,
    maxEstimatedSpendUsd: maxEstimatedUsd,
    notes: [
      'Offline estimate reserves 25,000 image input tokens per attached image and the full output-token limit per request.',
      'Retries, cache-write usage, and provider-side image tokenization can change final cost; each request is separately preflighted and reported.',
      'No OpenAI request is made unless --execute is present.',
    ],
    cases: casePlans,
  };
}

function validateOptions(options) {
  if (options.help) return;
  if (!['initial', 'full'].includes(options.imageSet)) throw new Error('--image-set must be initial or full.');
  if (!options.output) throw new Error('--output PATH|- is required.');
  validateEstimatedSpendLimit(options.maxEstimatedUsd);
  validateEvaluationConcurrency(options.concurrency);
  if (options.variantIds && options.includeCompactLuna) {
    throw new Error('--variants cannot be combined with --include-compact-luna.');
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  validateOptions(options);

  const outputPath = resolveOutputPath(options.output);
  const { manifest, manifestPath, sourceRoot } = loadAndValidateManifest(options.manifest, options.sourceRoot);
  ensureOutputOutsideSourceRoot(outputPath, sourceRoot);
  const cases = selectCases(manifest, options.caseIds);
  const variants = selectVariants(options.variantIds, options.includeCompactLuna);
  const plan = buildPlan(manifest, cases, variants, options.imageSet, options.maxEstimatedUsd, options.concurrency);

  if (!options.execute) {
    console.error(JSON.stringify({ ...plan, mode: 'offline_preflight', manifestPath, sourceRoot }, null, 2));
    return;
  }

  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY is required only when --execute is supplied.');
  const existing = readExistingOutput(outputPath);
  const priorResults = existing.records.filter((record) => record.recordType === 'case_result');
  const historicalSpendUsd = historicalSpendFromOutputRecords(existing.records);
  const budget = new Stage1SpendBudget(options.maxEstimatedUsd, historicalSpendUsd);
  if (budget.reservedUsd > budget.maxUsd) {
    throw new Error(`Existing JSONL usage estimate ($${budget.reservedUsd.toFixed(4)}) already exceeds the $${budget.maxUsd.toFixed(2)} cap.`);
  }
  const completedKeys = options.rerun ? new Set() : getCompletedResumeKeys(existing.lines);
  const openai = new OpenAI({
    apiKey,
    baseURL: 'https://api.openai.com/v1',
    maxRetries: 0,
    timeout: 60_000,
  });
  const runId = makeRunId();
  const resultByKey = new Map();
  for (const record of priorResults) {
    const key = `${record.caseId}\u0000${record.variantId}\u0000${record.imageSet}`;
    if (['completed', 'inconclusive'].includes(record.status)) resultByKey.set(key, record);
  }
  const miniCurrentDecisions = new Map(
    priorResults
      .filter((record) => record.variantId === 'mini-current' && record.imageSet === options.imageSet)
      .map((record) => [record.caseId, record])
  );

  const completedCount = { value: 0 };
  const inconclusiveCount = { value: 0 };
  const errorCount = { value: 0 };
  let budgetStopped = false;
  const pendingPairs = [];
  for (const caseData of cases) {
    for (const variant of variants) {
      const resumeKey = `${caseData.caseId}\u0000${variant.id}\u0000${options.imageSet}`;
      if (completedKeys.has(resumeKey) && !options.rerun) continue;
      pendingPairs.push({ caseData, variant, resumeKey });
    }
  }

  if (outputPath !== '-') fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  console.error(JSON.stringify({
    recordType: 'run_started',
    runId,
    manifestPath,
    sourceRoot,
    imageSet: options.imageSet,
    selectedCaseIds: cases.map((item) => item.caseId),
    variantIds: variants.map((variant) => variant.id),
    concurrency: options.concurrency,
    compiledContentValidatorSha256,
    requestedReasoningEffortByVariant: Object.fromEntries(
      variants.map((variant) => [variant.id, requestedReasoningEffortForVariant(variant)])
    ),
    resumedPairsSkipped: completedKeys.size,
    reviewCaseCount: cases.filter((item) => item.sourceTruth.expectedDecision === 'review').length,
    historicalSpendUsd,
  }));

  async function runPair({ caseData, variant, resumeKey }) {
    const selectedImages = selectImagesForCase(caseData, options.imageSet);
    const imageUrls = readImagesAsDataUrls(selectedImages, sourceRoot);
    const effectivePromptHash = effectivePromptSha256(caseData, variant, selectedImages.length);
    const requestedReasoningEffort = requestedReasoningEffortForVariant(variant);
    const requestAttempts = [];
    const eventIdByReservation = new Map();
    const run = await validateContentForStage1Evaluation(
      caseData.caption,
      imageUrls,
      caseData.venue,
      caseData.postedAt,
      variant.model,
      {
        promptVariant: variant.promptVariant,
        structuredOutput: variant.structuredOutput,
        reasoningEffort: variant.reasoningEffort,
        localGatePolicy: variant.localGatePolicy,
        client: openai,
        onBeforeRequest: (requestPlan) => {
          const reservationId = budget.reserve(requestPlan);
          const attemptEventId = `${runId}:${caseData.caseId}:${variant.id}:${requestPlan.requestIndex}`;
          const reservation = budget.getReservation(reservationId);
          eventIdByReservation.set(reservationId, attemptEventId);
          appendJsonl(outputPath, {
            recordType: 'request_reserved',
            recordVersion: 1,
            attemptEventId,
            runId,
            caseId: caseData.caseId,
            sourceIdentity: getCaseSourceIdentity(caseData),
            sourceRow: caseData.sourceRow,
            fileId: caseData.fileId || caseData.sourceFileId || null,
            variantId: variant.id,
            imageSet: options.imageSet,
            requestedReasoningEffort,
            effectivePromptSha256: effectivePromptHash,
            compiledContentValidatorSha256,
            reservationId,
            estimatedReservedUsd: reservation.estimatedReservedUsd,
            requestPlan,
          });
          return reservationId;
        },
        onAttempt: (attempt) => {
          addBudgetCostDetails(attempt, budget, requestAttempts);
          const attemptRecord = requestAttempts.at(-1);
          appendJsonl(outputPath, {
            recordType: 'request_attempt',
            recordVersion: 1,
            attemptEventId: eventIdByReservation.get(attempt.reservationId) ||
              `${runId}:${caseData.caseId}:${variant.id}:${attempt.requestIndex}`,
            runId,
            caseId: caseData.caseId,
            sourceIdentity: getCaseSourceIdentity(caseData),
            sourceRow: caseData.sourceRow,
            fileId: caseData.fileId || caseData.sourceFileId || null,
            variantId: variant.id,
            imageSet: options.imageSet,
            requestedReasoningEffort,
            effectivePromptSha256: effectivePromptHash,
            compiledContentValidatorSha256,
            attempt: attemptRecord,
          });
        },
      },
      {
        gptModelFast: variant.model,
        stage1ModelOverride: variant.model,
      }
    );

    const imageAnalysis = assessImageAnalysis(run.result, selectedImages);
    const baseline = miniCurrentDecisions.get(caseData.caseId) || null;
    const record = {
      recordType: 'case_result',
      recordVersion: 1,
      runId,
      completedAt: new Date().toISOString(),
      caseId: caseData.caseId,
      sourceIdentity: getCaseSourceIdentity(caseData),
      dataset: caseData.dataset || caseData.datasetId || null,
      fileId: caseData.fileId || caseData.sourceFileId || null,
      postId: caseData.postId || null,
      sourceRow: caseData.sourceRow,
      variantId: variant.id,
      model: variant.model,
      promptVariant: variant.promptVariant,
      localGatePolicy: variant.localGatePolicy || 'production',
      requestedReasoningEffort,
      effectivePromptSha256: effectivePromptHash,
      compiledContentValidatorSha256,
      structuredOutput: variant.structuredOutput,
      imageSet: options.imageSet,
      selectedImageCount: selectedImages.length,
      sourceImageCount: caseData.images.length,
      hasImages: selectedImages.length > 0,
      selectedSourceGalleryIndexes: selectedImages.map((image) => image.sourceGalleryIndex),
      imageCoverage: {
        status: imageAnalysis.coverageStatus,
        expectedIndexes: imageAnalysis.expectedIndexes,
        observedIndexes: imageAnalysis.observedIndexes,
      },
      status: run.status,
      incompleteReason: run.incompleteReason || null,
      noImageFallbackUsed: run.noImageFallbackUsed,
      sourceTruth: {
        ...makeSourceTruthScore(caseData, run.status, run.result),
        rationale: caseData.sourceTruth.rationale || null,
      },
      stage1DecisionAudit: {
        modelNormalizedDecision: run.preGateResult?.validationDecision || null,
        recordedPolicyNormalizedDecision: run.result?.validationDecision || null,
        localGateChangedDecision: run.preGateResult && run.result
          ? run.preGateResult.validationDecision !== run.result.validationDecision
          : null,
      },
      miniCurrentParity: makeMiniParity(variant.id, caseData, run.status, run.result, baseline),
      priorRunObservation: caseData.priorRunObservation,
      imageAnalysisChecks: imageAnalysis,
      requestAttempts,
      finalNormalizedResult: run.result,
      costGuard: budget.describe(),
    };
    appendJsonl(outputPath, record);
    resultByKey.set(resumeKey, record);
    if (variant.id === 'mini-current' && run.status === 'completed') {
      miniCurrentDecisions.set(caseData.caseId, record);
    }
    if (run.status === 'completed') completedCount.value++;
    else if (run.status === 'inconclusive') inconclusiveCount.value++;
    else errorCount.value++;

    console.error(JSON.stringify({
      recordType: 'case_progress',
      caseId: caseData.caseId,
      sourceIdentity: record.sourceIdentity,
      variantId: variant.id,
      status: run.status,
      decision: run.result ? (run.result.hasValidContent ? 'accept' : 'reject') : null,
      modelDecision: run.preGateResult ? (run.preGateResult.hasValidContent ? 'accept' : 'reject') : null,
      localGateChangedDecision: record.stage1DecisionAudit.localGateChangedDecision,
      sourceTruthMatch: record.sourceTruth.matches,
      goldDecisionAvailable: record.sourceTruth.goldDecisionAvailable,
      imageCoverageStatus: imageAnalysis.coverageStatus,
      imageCoverageComplete: selectedImages.length === 0
        ? null
        : imageAnalysis.onePopulatedEntryPerImage,
      semanticAssociationPassed: imageAnalysis.semanticAssociationPassed,
      reservedSpendUsd: budget.reservedUsd,
      inFlightReserveUsd: budget.describe().inFlightReserveUsd,
    }));
    return { status: run.status, record };
  }

  const miniPairs = pendingPairs.filter((pair) => pair.variant.id === 'mini-current');
  const candidatePairs = pendingPairs.filter((pair) => pair.variant.id !== 'mini-current');
  const miniRun = await runWithConcurrency(
    miniPairs,
    options.concurrency,
    runPair,
    (result) => result.status === 'budget_stopped'
  );
  let candidateRun = { startedCount: 0, skippedCount: candidatePairs.length, stopped: false };
  budgetStopped = miniRun.stopped;
  if (!budgetStopped) {
    candidateRun = await runWithConcurrency(
      candidatePairs,
      options.concurrency,
      runPair,
      (result) => result.status === 'budget_stopped'
    );
    budgetStopped = candidateRun.stopped;
  }
  const startedPairCount = miniRun.startedCount + candidateRun.startedCount;
  const skippedPairCount = pendingPairs.length - startedPairCount;

  const summary = {
    recordType: 'run_summary',
    runId,
    selectedCaseCount: cases.length,
    selectedVariantIds: variants.map((variant) => variant.id),
    compiledContentValidatorSha256,
    requestedReasoningEffortByVariant: Object.fromEntries(
      variants.map((variant) => [variant.id, requestedReasoningEffortForVariant(variant)])
    ),
    selectedPairCount: cases.length * variants.length,
    startedPairCount,
    skippedPairCount,
    concurrency: options.concurrency,
    completedCount: completedCount.value,
    inconclusiveCount: inconclusiveCount.value,
    errorCount: errorCount.value,
    budgetStopped,
    sourceTruthAndMiniParityScoredSeparately: true,
    costGuard: budget.describe(),
  };
  appendJsonl(outputPath, summary);
  console.error(JSON.stringify(summary));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
