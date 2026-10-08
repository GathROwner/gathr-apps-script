import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import {
  createCompactValidationPrompt,
  createValidationPrompt,
  createValidationSchema,
  validateContentForStage1Evaluation,
} from '../lib/parsing/contentValidator.js';
import {
  assessImageAnalysis,
  estimateRequestCostUsd,
  getCompletedResumeKeys,
  getVariants,
  historicalSpendFromOutputRecords,
  loadAndValidateManifest,
  makeRunId,
  readImagesAsDataUrls,
  selectImagesForCase,
  Stage1SpendBudget,
} from './stage1-evaluation-lib.mjs';

const DEFAULT_MANIFEST = path.resolve('test/fixtures/stage1-oct8/manifest.json');

function parseArgs(argv) {
  const options = {
    manifest: DEFAULT_MANIFEST,
    output: null,
    imageSet: 'initial',
    maxEstimatedUsd: 1,
    sourceRoot: null,
    execute: false,
    includeCompactLuna: false,
    rerun: false,
    help: false,
  };
  const valueFlags = new Set(['--manifest', '--output', '--image-set', '--max-estimated-usd', '--source-root']);
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
  --max-estimated-usd N        Estimated spend stop, capped at $1.00 (default: 1)
  --include-compact-luna       Add the optional Luna compact+Structured Outputs arm
  --rerun                      Re-run case/variant pairs already completed in this output file
  --execute                    Make OpenAI API calls; without this flag the run is offline preflight only
  --help                       Show this help

The runner reads only OPENAI_API_KEY from the environment, does not load .env files,
and has no Firebase, Firestore, Storage, venue-write, or release capability.`);
}

function effectivePromptChars(caseData, variant) {
  const prompt = variant.promptVariant === 'compact'
    ? createCompactValidationPrompt(caseData.caption, true, caseData.venue, caseData.postedAt)
    : createValidationPrompt(caseData.caption, true, caseData.venue, caseData.postedAt);
  return variant.structuredOutput
    ? prompt.length
    : `${prompt}\n\nReturn ONLY valid JSON that matches this schema:\n${JSON.stringify(createValidationSchema()[0].parameters, null, 2)}`.length;
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

function appendJsonl(outputPath, record) {
  const line = `${JSON.stringify(record)}\n`;
  if (outputPath === '-') process.stdout.write(line);
  else fs.appendFileSync(outputPath, line, 'utf8');
}

function makeSourceTruthScore(caseData, status, result) {
  const expected = caseData.sourceTruth.expectedDecision;
  const observed = status === 'completed' && result
    ? (result.hasValidContent ? 'accept' : 'reject')
    : null;
  return {
    expectedDecision: expected,
    observedDecision: observed,
    matches: observed == null ? null : observed === expected,
    scoredOnlyOnCompletedImageRequest: true,
  };
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

function buildPlan(manifest, variants, imageSet, maxEstimatedUsd) {
  let requestCount = 0;
  let selectedImageCount = 0;
  let estimatedInitialSpendUsd = 0;
  const casePlans = [];
  for (const caseData of manifest.cases) {
    const images = selectImagesForCase(caseData, imageSet);
    selectedImageCount += images.length;
    for (const variant of variants) {
      const maxOutputTokens = variant.model === 'gpt-6-luna' ? 6000 : 2000;
      estimatedInitialSpendUsd += estimateRequestCostUsd({
        model: variant.model,
        imageCount: images.length,
        maxOutputTokens,
        inputTextChars: effectivePromptChars(caseData, variant),
      });
      requestCount++;
    }
    casePlans.push({
      caseId: caseData.caseId,
      sourceRow: caseData.sourceRow,
      sourceImageCount: caseData.images.length,
      selectedImageCount: images.length,
      selectedSourceGalleryIndexes: images.map((image) => image.sourceGalleryIndex),
      expectedDecision: caseData.sourceTruth.expectedDecision,
    });
  }
  return {
    recordType: 'plan',
    manifestVersion: manifest.manifestVersion,
    imageSet,
    variants: variants.map((variant) => ({ ...variant })),
    caseCount: casePlans.length,
    requestCount,
    selectedImageCountAcrossCases: selectedImageCount,
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
  if (!Number.isFinite(options.maxEstimatedUsd) || options.maxEstimatedUsd <= 0 || options.maxEstimatedUsd > 1) {
    throw new Error('--max-estimated-usd must be greater than 0 and no more than 1.');
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
  const variants = getVariants(options.includeCompactLuna);
  const plan = buildPlan(manifest, variants, options.imageSet, options.maxEstimatedUsd);

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

  if (outputPath !== '-') fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  console.error(JSON.stringify({
    recordType: 'run_started',
    runId,
    manifestPath,
    sourceRoot,
    imageSet: options.imageSet,
    variantIds: variants.map((variant) => variant.id),
    resumedPairsSkipped: completedKeys.size,
    historicalSpendUsd,
  }));

  let completedCount = 0;
  let inconclusiveCount = 0;
  let errorCount = 0;
  let budgetStopped = false;
  const miniCurrentDecisions = new Map();

  for (const caseData of manifest.cases) {
    const selectedImages = selectImagesForCase(caseData, options.imageSet);
    const imageUrls = readImagesAsDataUrls(selectedImages, sourceRoot);
    for (const variant of variants) {
      const resumeKey = `${caseData.caseId}\u0000${variant.id}\u0000${options.imageSet}`;
      const prior = resultByKey.get(resumeKey);
      if (prior?.variantId === 'mini-current' && prior.status === 'completed') {
        miniCurrentDecisions.set(caseData.caseId, prior);
      }
      if (completedKeys.has(resumeKey) && !options.rerun) {
        if (variant.id === 'mini-current' && prior?.status === 'completed') {
          miniCurrentDecisions.set(caseData.caseId, prior);
        }
        continue;
      }

      const requestAttempts = [];
      const modelOutputTokenLimit = variant.model === 'gpt-6-luna' ? 6000 : 2000;
      const config = {
        gptModelFast: variant.model,
        stage1ModelOverride: variant.model,
      };
      const run = await validateContentForStage1Evaluation(
        caseData.caption,
        imageUrls,
        caseData.venue,
        caseData.postedAt,
        variant.model,
        {
          promptVariant: variant.promptVariant,
          structuredOutput: variant.structuredOutput,
          client: openai,
          onBeforeRequest: (requestPlan) => budget.reserve(requestPlan),
          onAttempt: (attempt) => {
            addBudgetCostDetails(attempt, budget, requestAttempts);
            const attemptRecord = requestAttempts.at(-1);
            appendJsonl(outputPath, {
              recordType: 'request_attempt',
              recordVersion: 1,
              attemptEventId: `${runId}:${caseData.caseId}:${variant.id}:${attempt.requestIndex}`,
              runId,
              caseId: caseData.caseId,
              sourceRow: caseData.sourceRow,
              variantId: variant.id,
              imageSet: options.imageSet,
              attempt: attemptRecord,
            });
          },
        },
        config
      );

      const imageAnalysis = assessImageAnalysis(run.result, selectedImages);
      const baseline = miniCurrentDecisions.get(caseData.caseId) || null;
      const record = {
        recordType: 'case_result',
        recordVersion: 1,
        runId,
        completedAt: new Date().toISOString(),
        caseId: caseData.caseId,
        sourceRow: caseData.sourceRow,
        variantId: variant.id,
        model: variant.model,
        promptVariant: variant.promptVariant,
        structuredOutput: variant.structuredOutput,
        imageSet: options.imageSet,
        selectedImageCount: selectedImages.length,
        sourceImageCount: caseData.images.length,
        selectedSourceGalleryIndexes: selectedImages.map((image) => image.sourceGalleryIndex),
        status: run.status,
        incompleteReason: run.incompleteReason || null,
        noImageFallbackUsed: run.noImageFallbackUsed,
        sourceTruth: {
          ...makeSourceTruthScore(caseData, run.status, run.result),
          rationale: caseData.sourceTruth.rationale,
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
      completedKeys.add(resumeKey);
      if (variant.id === 'mini-current' && run.status === 'completed') {
        miniCurrentDecisions.set(caseData.caseId, record);
      }
      if (run.status === 'completed') completedCount++;
      else if (run.status === 'inconclusive') inconclusiveCount++;
      else if (run.status === 'budget_stopped') {
        budgetStopped = true;
        errorCount++;
      } else errorCount++;

      console.error(JSON.stringify({
        recordType: 'case_progress',
        caseId: caseData.caseId,
        variantId: variant.id,
        status: run.status,
        decision: run.result ? (run.result.hasValidContent ? 'accept' : 'reject') : null,
        sourceTruthMatch: record.sourceTruth.matches,
        imageCoverageComplete: imageAnalysis.onePopulatedEntryPerImage,
        semanticAssociationPassed: imageAnalysis.semanticAssociationPassed,
        reservedSpendUsd: budget.reservedUsd,
      }));

      if (budgetStopped) break;
    }
    if (budgetStopped) break;
  }

  const summary = {
    recordType: 'run_summary',
    runId,
    completedCount,
    inconclusiveCount,
    errorCount,
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
