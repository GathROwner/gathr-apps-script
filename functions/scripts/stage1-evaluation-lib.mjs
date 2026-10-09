import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const MAX_SOURCE_GALLERY_IMAGES = 16;
export const INITIAL_STAGE1_IMAGE_LIMIT = 4;
export const MAX_ESTIMATED_SPEND_USD = 10;
export const DEFAULT_ESTIMATED_SPEND_USD = 1;
export const MAX_EVALUATION_CONCURRENCY = 3;
export const IMAGE_TOKEN_RESERVE = 25_000;

export const MODEL_RATES_PER_MILLION = Object.freeze({
  'gpt-5-mini': Object.freeze({ input: 0.25, cachedInput: 0.025, cacheWrite: null, output: 2.0 }),
  'gpt-6-luna': Object.freeze({ input: 0.1, cachedInput: 0.01, cacheWrite: 0.125, output: 0.5 }),
});

export const VARIANTS = Object.freeze([
  Object.freeze({
    id: 'mini-current',
    model: 'gpt-5-mini',
    promptVariant: 'production',
    structuredOutput: false,
  }),
  Object.freeze({
    id: 'mini-compact-structured',
    model: 'gpt-5-mini',
    promptVariant: 'compact',
    structuredOutput: true,
  }),
  Object.freeze({
    id: 'luna-current',
    model: 'gpt-6-luna',
    promptVariant: 'production',
    structuredOutput: false,
  }),
  Object.freeze({
    id: 'luna-compact-structured',
    model: 'gpt-6-luna',
    promptVariant: 'compact',
    structuredOutput: true,
  }),
  Object.freeze({
    id: 'mini-compact-v2',
    model: 'gpt-5-mini',
    promptVariant: 'compact-v2',
    structuredOutput: false,
  }),
  Object.freeze({
    id: 'luna-compact-v2',
    model: 'gpt-6-luna',
    promptVariant: 'compact-v2',
    structuredOutput: false,
  }),
  Object.freeze({
    id: 'mini-compact-v3',
    model: 'gpt-5-mini',
    promptVariant: 'compact-v3',
    structuredOutput: false,
  }),
  Object.freeze({
    id: 'luna-compact-v3',
    model: 'gpt-6-luna',
    promptVariant: 'compact-v3',
    structuredOutput: false,
  }),
  Object.freeze({
    id: 'mini-compact-v4',
    model: 'gpt-5-mini',
    promptVariant: 'compact-v4',
    structuredOutput: false,
  }),
  Object.freeze({
    id: 'luna-compact-v4',
    model: 'gpt-6-luna',
    promptVariant: 'compact-v4',
    structuredOutput: false,
  }),
  Object.freeze({
    id: 'mini-compact-v5',
    model: 'gpt-5-mini',
    promptVariant: 'compact-v5',
    structuredOutput: false,
  }),
  Object.freeze({
    id: 'luna-compact-v5',
    model: 'gpt-6-luna',
    promptVariant: 'compact-v5',
    structuredOutput: false,
  }),
  Object.freeze({
    id: 'luna-compact-v5-low',
    model: 'gpt-6-luna',
    promptVariant: 'compact-v5',
    structuredOutput: false,
    reasoningEffort: 'low',
  }),
  Object.freeze({
    id: 'luna-compact-v5-high',
    model: 'gpt-6-luna',
    promptVariant: 'compact-v5',
    structuredOutput: false,
    reasoningEffort: 'high',
  }),
  Object.freeze({
    id: 'luna-compact-v6-high',
    model: 'gpt-6-luna',
    promptVariant: 'compact-v6',
    structuredOutput: false,
    reasoningEffort: 'high',
  }),
  Object.freeze({
    id: 'luna-compact-v7-high',
    model: 'gpt-6-luna',
    promptVariant: 'compact-v7',
    structuredOutput: false,
    reasoningEffort: 'high',
  }),
  Object.freeze({
    id: 'luna-compact-v8-high',
    model: 'gpt-6-luna',
    promptVariant: 'compact-v8',
    structuredOutput: false,
    reasoningEffort: 'high',
  }),
  Object.freeze({
    id: 'luna-compact-v8-high-strict-links',
    model: 'gpt-6-luna',
    promptVariant: 'compact-v8',
    structuredOutput: false,
    reasoningEffort: 'high',
    localGatePolicy: 'evidence-backed-links',
  }),
  Object.freeze({
    id: 'luna-compact-v9-high',
    model: 'gpt-6-luna',
    promptVariant: 'compact-v9',
    structuredOutput: false,
    reasoningEffort: 'high',
    localGatePolicy: 'evidence-backed-links',
  }),
  Object.freeze({
    id: 'luna-compact-v9-high-offer-guards',
    model: 'gpt-6-luna',
    promptVariant: 'compact-v9',
    structuredOutput: false,
    reasoningEffort: 'high',
    localGatePolicy: 'source-offer-guards',
  }),
  Object.freeze({
    id: 'luna-compact-v10-high',
    model: 'gpt-6-luna',
    promptVariant: 'compact-v10',
    structuredOutput: false,
    reasoningEffort: 'high',
    localGatePolicy: 'source-offer-guards',
  }),
  Object.freeze({
    id: 'luna-compact-v10-high-mixed-offers',
    model: 'gpt-6-luna',
    promptVariant: 'compact-v10',
    structuredOutput: false,
    reasoningEffort: 'high',
    localGatePolicy: 'source-offer-guards-v2',
  }),
  Object.freeze({
    id: 'luna-compact-v10-high-menu-guard',
    model: 'gpt-6-luna',
    promptVariant: 'compact-v10',
    structuredOutput: false,
    reasoningEffort: 'high',
    localGatePolicy: 'source-menu-guards',
  }),
]);

export const DEFAULT_VARIANT_IDS = Object.freeze([
  'mini-current',
  'mini-compact-structured',
  'luna-current',
]);

const variantById = new Map(VARIANTS.map((variant) => [variant.id, variant]));

export function getVariants(includeCompactLuna = false) {
  const ids = includeCompactLuna
    ? [...DEFAULT_VARIANT_IDS, 'luna-compact-structured']
    : DEFAULT_VARIANT_IDS;
  return ids.map((id) => variantById.get(id));
}

export function selectVariants(variantIds, includeCompactLuna = false) {
  if (variantIds == null) return getVariants(includeCompactLuna);
  if (!Array.isArray(variantIds) || variantIds.length === 0) {
    throw new Error('Select at least one variant.');
  }
  const requested = variantIds.map((id) => String(id).trim()).filter(Boolean);
  if (requested.length !== variantIds.length) throw new Error('Variant IDs cannot be empty.');
  const duplicates = requested.filter((id, index) => requested.indexOf(id) !== index);
  if (duplicates.length > 0) throw new Error(`Duplicate variant ID: ${duplicates[0]}`);
  const unknown = requested.filter((id) => !variantById.has(id));
  if (unknown.length > 0) throw new Error(`Unknown variant ID: ${unknown[0]}`);
  return requested.map((id) => variantById.get(id));
}

export function selectCases(manifest, caseIds) {
  if (caseIds == null) return [...manifest.cases];
  if (!Array.isArray(caseIds) || caseIds.length === 0) throw new Error('Select at least one case ID.');
  const requested = caseIds.map((id) => String(id).trim()).filter(Boolean);
  if (requested.length !== caseIds.length) throw new Error('Case IDs cannot be empty.');
  const duplicates = requested.filter((id, index) => requested.indexOf(id) !== index);
  if (duplicates.length > 0) throw new Error(`Duplicate case ID: ${duplicates[0]}`);
  const byId = new Map(manifest.cases.map((item) => [item.caseId, item]));
  const unknown = requested.filter((id) => !byId.has(id));
  if (unknown.length > 0) throw new Error(`Unknown case ID: ${unknown[0]}`);
  const requestedSet = new Set(requested);
  return manifest.cases.filter((item) => requestedSet.has(item.caseId));
}

export function getCaseSourceIdentity(item) {
  const dataset = String(item.dataset || item.datasetId || '').trim();
  const fileId = String(item.fileId || item.sourceFileId || '').trim();
  const datasetFile = [dataset, fileId].filter(Boolean).join('/');
  return `${datasetFile || `case:${item.caseId}`}#${item.sourceRow}`;
}

export function validateEvaluationConcurrency(value) {
  const concurrency = Number(value);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_EVALUATION_CONCURRENCY) {
    throw new Error(`--concurrency must be an integer from 1 to ${MAX_EVALUATION_CONCURRENCY}.`);
  }
  return concurrency;
}

export function validateEstimatedSpendLimit(value) {
  const maxUsd = Number(value);
  if (!Number.isFinite(maxUsd) || maxUsd <= 0 || maxUsd > MAX_ESTIMATED_SPEND_USD) {
    throw new Error(`--max-estimated-usd must be greater than 0 and no more than $${MAX_ESTIMATED_SPEND_USD}.`);
  }
  return maxUsd;
}

export function estimateRequestCostUsd(plan, imageTokenReserve = IMAGE_TOKEN_RESERVE) {
  const rates = MODEL_RATES_PER_MILLION[plan.model];
  if (!rates) throw new Error(`No Stage 1 pricing table entry for model ${plan.model}`);
  const estimatedTextTokens = Math.ceil(Number(plan.inputTextChars || 0) / 2);
  const estimatedInputTokens = estimatedTextTokens + plan.imageCount * imageTokenReserve;
  const conservativeInputRate = Math.max(rates.input, rates.cacheWrite || 0);
  return (estimatedInputTokens * conservativeInputRate + plan.maxOutputTokens * rates.output) / 1_000_000;
}

export function calculateObservedCostUsd(attempt) {
  const rates = MODEL_RATES_PER_MILLION[attempt.model];
  if (!rates) throw new Error(`No Stage 1 pricing table entry for model ${attempt.model}`);
  const inputTokens = Math.max(0, Number(attempt.inputTokens || 0));
  const cachedInputTokens = Math.min(
    inputTokens,
    Math.max(0, Number(attempt.cachedInputTokens || 0))
  );
  const cacheWriteTokens = Math.min(
    inputTokens - cachedInputTokens,
    Math.max(0, Number(attempt.cacheWriteTokens || 0))
  );
  const uncachedInputTokens = inputTokens - cachedInputTokens - cacheWriteTokens;
  const outputTokens = Math.max(0, Number(attempt.outputTokens || 0));
  const uncachedRate = rates.cacheWrite || rates.input;
  return (
    uncachedInputTokens * uncachedRate +
    cacheWriteTokens * (rates.cacheWrite || rates.input) +
    cachedInputTokens * rates.cachedInput +
    outputTokens * rates.output
  ) / 1_000_000;
}

export class Stage1EvaluationBudgetError extends Error {
  constructor(message) {
    super(message);
    this.name = 'Stage1EvaluationBudgetError';
    this.code = 'STAGE1_EVAL_BUDGET_STOP';
  }
}

export class Stage1SpendBudget {
  constructor(maxUsd = DEFAULT_ESTIMATED_SPEND_USD, historicalSpendUsd = 0) {
    if (!Number.isFinite(maxUsd) || maxUsd <= 0 || maxUsd > MAX_ESTIMATED_SPEND_USD) {
      throw new Error(`--max-estimated-usd must be greater than 0 and no more than $${MAX_ESTIMATED_SPEND_USD}.`);
    }
    this.maxUsd = maxUsd;
    this.historicalSpendUsd = Math.max(0, Number(historicalSpendUsd || 0));
    this.reservations = new Map();
  }

  get reservedUsd() {
    return this.historicalSpendUsd +
      [...this.reservations.values()].reduce((sum, value) => sum + value.currentUsd, 0);
  }

  reserve(plan) {
    const estimateUsd = estimateRequestCostUsd(plan);
    const projectedUsd = this.reservedUsd + estimateUsd;
    if (projectedUsd > this.maxUsd + 1e-12) {
      throw new Stage1EvaluationBudgetError(
        `Estimated spend cap reached before request ${plan.requestIndex}: reserved $${this.reservedUsd.toFixed(4)}, next request reserve $${estimateUsd.toFixed(4)}, cap $${this.maxUsd.toFixed(2)}.`
      );
    }
    const reservationId = randomUUID();
    this.reservations.set(reservationId, {
      estimateUsd,
      currentUsd: estimateUsd,
      observedUsd: null,
      inFlight: true,
    });
    return reservationId;
  }

  getReservation(reservationId) {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) return null;
    return {
      estimatedReservedUsd: reservation.estimateUsd,
      currentReservedUsd: reservation.currentUsd,
      usageCostEstimateUsd: reservation.observedUsd,
    };
  }

  settle(attempt) {
    if (!attempt.reservationId || !this.reservations.has(attempt.reservationId)) return null;
    const reservation = this.reservations.get(attempt.reservationId);
    if (attempt.inputTokens > 0 || attempt.outputTokens > 0) {
      reservation.observedUsd = calculateObservedCostUsd(attempt);
      reservation.currentUsd = reservation.observedUsd;
    }
    reservation.inFlight = false;
    return {
      estimatedReservedUsd: reservation.estimateUsd,
      usageCostEstimateUsd: reservation.observedUsd,
      retainedReserveUsd: reservation.currentUsd,
    };
  }

  describe() {
    const reservations = [...this.reservations.values()];
    const usageCostEstimateUsd = reservations.reduce((sum, row) => sum + (row.observedUsd || 0), 0);
    const unresolvedReserveUsd = reservations.reduce(
      (sum, row) => sum + (row.observedUsd == null ? row.currentUsd : 0),
      0
    );
    const inFlightReserveUsd = reservations.reduce(
      (sum, row) => sum + (row.inFlight ? row.currentUsd : 0),
      0
    );
    return {
      capUsd: this.maxUsd,
      estimatedOrObservedReservedUsd: this.reservedUsd,
      usageCostEstimateUsd,
      historicalSpendUsd: this.historicalSpendUsd,
      unresolvedReserveUsd,
      inFlightReserveUsd,
      requestCount: reservations.length,
      imageTokenReservePerImage: IMAGE_TOKEN_RESERVE,
      pricingBasis: 'Conservative Standard API token estimate as of 2026-10-08; uncached GPT-6 Luna input reserves at the cache-write rate.',
    };
  }
}

export async function runWithConcurrency(items, concurrency, worker, stopWhen = () => false) {
  const limit = validateEvaluationConcurrency(concurrency);
  const results = new Array(items.length);
  let cursor = 0;
  let startedCount = 0;
  let stopped = false;
  let failure = null;

  async function runWorker() {
    while (!stopped) {
      const index = cursor;
      if (index >= items.length) return;
      cursor++;
      startedCount++;
      try {
        const result = await worker(items[index], index);
        results[index] = result;
        if (stopWhen(result)) stopped = true;
      } catch (error) {
        failure ||= error;
        stopped = true;
      }
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  if (failure) throw failure;
  return {
    results,
    stopped,
    startedCount,
    skippedCount: items.length - startedCount,
  };
}

export function appendJsonlRecord(outputPath, record) {
  const line = `${JSON.stringify(record)}\n`;
  if (outputPath === '-') {
    process.stdout.write(line);
    return;
  }
  const retryDelaysMs = [25, 50, 100, 200, 400];
  const waitCell = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  let fd = null;
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
    try {
      fd = fs.openSync(outputPath, 'a');
      break;
    } catch (error) {
      const retryable = ['EBUSY', 'EPERM'].includes(error?.code);
      if (!retryable || attempt === retryDelaysMs.length) {
        const suffix = retryable
          ? ` after ${attempt + 1} bounded open attempts`
          : '';
        throw new Error(
          `Could not open JSONL output ${outputPath}${suffix}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error }
        );
      }
      Atomics.wait(waitCell, 0, 0, retryDelaysMs[attempt]);
    }
  }
  if (fd == null) throw new Error(`Could not open JSONL output ${outputPath}.`);

  const bytes = Buffer.from(line, 'utf8');
  let writeError = null;
  let originalSize = null;
  try {
    originalSize = fs.fstatSync(fd).size;
    let offset = 0;
    while (offset < bytes.length) {
      const written = fs.writeSync(fd, bytes, offset, bytes.length - offset, null);
      if (written <= 0) throw new Error('JSONL append returned a zero-byte write.');
      offset += written;
    }
    fs.fsyncSync(fd);
  } catch (error) {
    writeError = error;
    if (originalSize != null) {
      try {
        fs.ftruncateSync(fd, originalSize);
        fs.fsyncSync(fd);
      } catch (rollbackError) {
        writeError = new AggregateError(
          [error, rollbackError],
          `JSONL append failed and partial-record rollback also failed for ${outputPath}.`
        );
      }
    }
  }
  try {
    fs.closeSync(fd);
  } catch (error) {
    writeError ||= error;
  }
  if (writeError) {
    throw new Error(
      `Could not durably append one JSONL record to ${outputPath}: ${writeError instanceof Error ? writeError.message : String(writeError)}`,
      { cause: writeError }
    );
  }
}

export function makeSourceTruthScore(caseData, status, result) {
  const expected = caseData.sourceTruth.expectedDecision;
  const observedDecision = status === 'completed' && result
    ? (result.hasValidContent ? 'accept' : 'reject')
    : null;
  const goldDecisionAvailable = expected !== 'review';
  return {
    expectedDecision: expected,
    observedDecision,
    matches: !goldDecisionAvailable || observedDecision == null
      ? null
      : observedDecision === expected,
    goldDecisionAvailable,
    scoredOnlyOnCompletedImageRequest: true,
  };
}

function assertInside(root, candidate, label) {
  const relative = path.relative(root, candidate);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    if (relative === '') return;
    throw new Error(`${label} must stay inside sourceRoot: ${candidate}`);
  }
}

export function loadAndValidateManifest(manifestPath, sourceRootOverride) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const manifest = JSON.parse(fs.readFileSync(absoluteManifestPath, 'utf8'));
  if (manifest.manifestVersion !== 1 || !Array.isArray(manifest.cases)) {
    throw new Error('Unsupported Stage 1 manifest. Expected manifestVersion 1 and a cases array.');
  }
  const sourceRoot = path.resolve(
    sourceRootOverride || path.resolve(path.dirname(absoluteManifestPath), manifest.sourceRoot || '.')
  );
  const realSourceRoot = fs.realpathSync(sourceRoot);
  const seenCaseIds = new Set();
  const seenSourceRows = new Set();

  for (const item of manifest.cases) {
    if (!item.caseId || seenCaseIds.has(item.caseId)) throw new Error(`Missing or duplicate caseId: ${item.caseId}`);
    if (item.sourceRow == null || String(item.sourceRow).trim() === '') {
      throw new Error(`${item.caseId} must define sourceRow`);
    }
    const dataset = String(item.dataset || item.datasetId || '').trim();
    const fileId = String(item.fileId || item.sourceFileId || '').trim();
    const sourceFileIdentity = [dataset, fileId].filter(Boolean).join('/') || `case:${item.caseId}`;
    const sourceRowIdentity = `${sourceFileIdentity}\u0000${item.sourceRow}`;
    if (seenSourceRows.has(sourceRowIdentity)) {
      throw new Error(`Duplicate source identity: ${sourceFileIdentity} row ${item.sourceRow}`);
    }
    seenCaseIds.add(item.caseId);
    seenSourceRows.add(sourceRowIdentity);
    if (!Array.isArray(item.images)) throw new Error(`${item.caseId} images must be an array`);
    if (item.images.length === 0 && item.gallery?.sourceImageCount !== 0) {
      throw new Error(`${item.caseId} without images must declare gallery.sourceImageCount as 0`);
    }
    if (item.images.length > MAX_SOURCE_GALLERY_IMAGES) {
      throw new Error(`${item.caseId} exceeds the ${MAX_SOURCE_GALLERY_IMAGES}-image source gallery limit`);
    }
    if (!['accept', 'reject', 'review'].includes(item.sourceTruth?.expectedDecision)) {
      throw new Error(`${item.caseId} must define sourceTruth.expectedDecision as accept, reject, or review`);
    }
    const indexes = item.images.map((image) => image.sourceGalleryIndex);
    if (indexes.some((index, position) => index !== position)) {
      throw new Error(`${item.caseId} images must be ordered and indexed from zero`);
    }
    const expected = item.expectedImageAnalysisIndexes || [];
    if (expected.length !== item.images.length || expected.some((index, position) => index !== position)) {
      throw new Error(`${item.caseId} expectedImageAnalysisIndexes must cover the full gallery in order`);
    }
    if (item.gallery?.sourceImageCount !== item.images.length) {
      throw new Error(`${item.caseId} gallery.sourceImageCount must match its frozen image list`);
    }
    for (const image of item.images) {
      const imagePath = path.resolve(sourceRoot, image.path);
      assertInside(sourceRoot, imagePath, `${item.caseId} image path`);
      const realImagePath = fs.realpathSync(imagePath);
      assertInside(realSourceRoot, realImagePath, `${item.caseId} resolved image path`);
      if (!fs.statSync(realImagePath).isFile()) throw new Error(`Fixture is not a file: ${realImagePath}`);
      if (image.expectedSemanticCueGroups != null && !Array.isArray(image.expectedSemanticCueGroups)) {
        throw new Error(`${item.caseId} image ${image.sourceGalleryIndex} expectedSemanticCueGroups must be an array when supplied`);
      }
      const bytes = fs.readFileSync(realImagePath);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      if (sha256 !== image.sha256) throw new Error(`SHA-256 mismatch for ${imagePath}`);
    }
  }

  return { manifest, manifestPath: absoluteManifestPath, sourceRoot };
}

export function selectImagesForCase(item, imageSet) {
  if (!['initial', 'full'].includes(imageSet)) throw new Error('--image-set must be initial or full');
  const count = imageSet === 'initial'
    ? Math.min(item.images.length, INITIAL_STAGE1_IMAGE_LIMIT)
    : Math.min(item.images.length, MAX_SOURCE_GALLERY_IMAGES);
  return item.images.slice(0, count);
}

export function readImagesAsDataUrls(images, sourceRoot) {
  return images.map((image) => {
    const bytes = fs.readFileSync(path.resolve(sourceRoot, image.path));
    let mime;
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      mime = 'image/jpeg';
    } else if (
      bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
      mime = 'image/png';
    } else if (
      bytes.length >= 12 &&
      bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP'
    ) {
      mime = 'image/webp';
    } else {
      throw new Error(`Unsupported image bytes for ${image.path}; expected JPEG, PNG, or WebP.`);
    }
    return `data:${mime};base64,${bytes.toString('base64')}`;
  });
}

export function assessImageAnalysis(result, selectedImages) {
  const expectedIndexes = selectedImages.map((image) => image.sourceGalleryIndex);
  const analyses = Array.isArray(result?.imageAnalysis) ? result.imageAnalysis : [];
  const actualIndexes = analyses.map((image) => Number(image?.imageIndex));
  const counts = new Map();
  for (const index of actualIndexes) counts.set(index, (counts.get(index) || 0) + 1);
  const expectedSet = new Set(expectedIndexes);
  const missingIndexes = expectedIndexes.filter((index) => !counts.has(index));
  const duplicateIndexes = [...counts.entries()].filter(([, count]) => count > 1).map(([index]) => index);
  const unexpectedIndexes = [...counts.keys()].filter((index) => !expectedSet.has(index));
  const blankDescriptionIndexes = analyses
    .filter((image) => !String(image?.description || '').trim())
    .map((image) => Number(image?.imageIndex));
  const blankRelevanceIndexes = analyses
    .filter((image) => !String(image?.relevanceToPost || '').trim())
    .map((image) => Number(image?.imageIndex));
  const expectedLayoutChecks = [];

  for (const selected of selectedImages) {
    if (!selected.expectedComplexity) continue;
    const analysis = analyses.find((image) => Number(image?.imageIndex) === selected.sourceGalleryIndex);
    const fields = Object.keys(selected.expectedComplexity);
    expectedLayoutChecks.push({
      imageIndex: selected.sourceGalleryIndex,
      expected: selected.expectedComplexity,
      observed: analysis?.imageComplexity || null,
      matches: Boolean(analysis) && fields.every(
        (field) => analysis.imageComplexity?.[field] === selected.expectedComplexity[field]
      ),
    });
  }

  const populatedIndexes = new Set(
    analyses
      .filter((image) => String(image?.description || '').trim() && String(image?.relevanceToPost || '').trim())
      .map((image) => Number(image?.imageIndex))
  );
  const missingRelevantDescriptionIndexes = selectedImages
    .filter((image) => image.expectedRole === 'event_or_offer_identifier')
    .map((image) => image.sourceGalleryIndex)
    .filter((index) => !populatedIndexes.has(index));
  const semanticAssociationChecks = selectedImages.map((selected) => {
    const analysis = analyses.find((image) => Number(image?.imageIndex) === selected.sourceGalleryIndex);
    const description = normalizeSemanticText(analysis?.description || '');
    const requiredGroups = selected.expectedSemanticCueGroups || [];
    const forbiddenGroups = selected.forbiddenSemanticCueGroups || [];
    const requiredMatches = requiredGroups.map((alternatives) => ({
      alternatives,
      matched: alternatives.some((phrase) => {
        const normalizedPhrase = normalizeSemanticText(phrase);
        return normalizedPhrase.length > 0 && ` ${description} `.includes(` ${normalizedPhrase} `);
      }),
    }));
    const forbiddenMatches = forbiddenGroups
      .flat()
      .filter((phrase) => {
        const normalizedPhrase = normalizeSemanticText(phrase);
        return normalizedPhrase.length > 0 && ` ${description} `.includes(` ${normalizedPhrase} `);
      });
    const hasCueSpec = requiredGroups.length > 0 || forbiddenGroups.length > 0;
    return {
      imageIndex: selected.sourceGalleryIndex,
      description: analysis?.description || '',
      requiredMatches,
      forbiddenMatches,
      checked: hasCueSpec,
      matches:
        !hasCueSpec || (
          Boolean(analysis) &&
          requiredMatches.every((group) => group.matched) &&
          forbiddenMatches.length === 0
        ),
    };
  });
  const uncheckedSemanticIndexes = semanticAssociationChecks
    .filter((check) => !check.checked)
    .map((check) => check.imageIndex);
  const semanticMismatchedIndexes = semanticAssociationChecks
    .filter((check) => check.checked && !check.matches)
    .map((check) => check.imageIndex);

  return {
    hasImages: expectedIndexes.length > 0,
    expectedImageCount: expectedIndexes.length,
    observedImageAnalysisCount: analyses.length,
    expectedIndexes,
    observedIndexes: actualIndexes,
    missingIndexes,
    duplicateIndexes,
    unexpectedIndexes,
    blankDescriptionIndexes,
    blankRelevanceIndexes,
    missingRelevantDescriptionIndexes,
    semanticAssociationChecks,
    uncheckedSemanticIndexes,
    semanticMismatchedIndexes,
    semanticAssociationPassed:
      uncheckedSemanticIndexes.length === 0 && semanticMismatchedIndexes.length === 0,
    expectedLayoutChecks,
    coverageStatus: expectedIndexes.length === 0
      ? 'not_applicable'
      : analyses.length === expectedIndexes.length &&
        missingIndexes.length === 0 &&
        duplicateIndexes.length === 0 &&
        unexpectedIndexes.length === 0 &&
        blankDescriptionIndexes.length === 0 &&
        blankRelevanceIndexes.length === 0
        ? 'complete'
        : 'incomplete',
    onePopulatedEntryPerImage:
      analyses.length === expectedIndexes.length &&
      missingIndexes.length === 0 &&
      duplicateIndexes.length === 0 &&
      unexpectedIndexes.length === 0 &&
      blankDescriptionIndexes.length === 0 &&
      blankRelevanceIndexes.length === 0,
  };
}

const semanticPluralExceptions = new Map([
  ['movies', 'movie'],
  ['pies', 'pie'],
  ['news', 'news'],
  ['series', 'series'],
  ['species', 'species'],
  ['lens', 'lens'],
  ['lenses', 'lens'],
  ['business', 'business'],
  ['businesses', 'business'],
  ['status', 'status'],
  ['statuses', 'status'],
]);

function normalizeSemanticText(value) {
  const normalized = String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    // Normalize common time spellings before punctuation is converted to spaces.
    .replace(/\b(\d{1,2})[:.](\d{2})\s*([ap])\.?\s*m\.?\b/gi, '$1 $2 $3m')
    .replace(/\b([ap])\.?\s*m\.?\b/gi, '$1m')
    // Apostrophe-s is grammatical, not part of the name cue (for example, Toby's).
    .replace(/([a-z])['’]s\b/gi, '$1')
    .replace(/([a-z])s['’](?=\s|$)/gi, '$1s')
    // Calendar descriptions often render ordinal dates where the cue uses cardinals.
    .replace(/\b(\d{1,2})(?:st|nd|rd|th)\b/gi, '$1')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  return normalized
    .split(' ')
    .filter(Boolean)
    .map(normalizeCommonPlural)
    .join(' ');
}

function normalizeCommonPlural(token) {
  if (semanticPluralExceptions.has(token)) return semanticPluralExceptions.get(token);

  // Conservative regular English plurals: flowers -> flower, activities -> activity,
  // and dishes -> dish. Do not stem arbitrary terminal s/es words.
  if (token.length >= 5 && /[^aeiou]ies$/.test(token)) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.length >= 5 && /(?:ches|shes|sses|xes|zes)$/.test(token)) {
    return token.slice(0, -2);
  }
  if (
    token.length >= 5 &&
    token.endsWith('s') &&
    !/(?:ss|us|is)$/.test(token)
  ) {
    return token.slice(0, -1);
  }
  return token;
}

export function getCompletedResumeKeys(lines) {
  const completed = new Set();
  for (const line of lines) {
    if (!line.trim()) continue;
    const record = JSON.parse(line);
    if (record.recordType !== 'case_result') continue;
    if (!['completed', 'inconclusive'].includes(record.status)) continue;
    completed.add(`${record.caseId}\u0000${record.variantId}\u0000${record.imageSet}`);
  }
  return completed;
}

export function historicalSpendFromCaseRecords(records) {
  return records.reduce((sum, record) => {
    const attempts = Array.isArray(record.requestAttempts) ? record.requestAttempts : [];
    return sum + attempts.reduce((attemptSum, attempt) => {
      const retained = Number(attempt.retainedReserveUsd);
      if (Number.isFinite(retained)) return attemptSum + Math.max(0, retained);
      const observed = Number(attempt.usageCostEstimateUsd);
      if (Number.isFinite(observed)) return attemptSum + Math.max(0, observed);
      return attemptSum + Math.max(0, Number(attempt.estimatedReservedUsd) || 0);
    }, 0);
  }, 0);
}

export function historicalSpendFromOutputRecords(records) {
  const requestEvents = records.filter((record) => record.recordType === 'request_attempt');
  const reservationEvents = records.filter((record) => record.recordType === 'request_reserved');
  if (requestEvents.length === 0 && reservationEvents.length === 0) {
    return historicalSpendFromCaseRecords(records.filter((record) => record.recordType === 'case_result'));
  }
  const eventRunIds = new Set(
    [...requestEvents, ...reservationEvents].map((event) => event.runId).filter(Boolean)
  );
  const spendByAttempt = new Map();
  for (const event of reservationEvents) {
    if (!event.attemptEventId) continue;
    spendByAttempt.set(event.attemptEventId, {
      runId: event.runId,
      estimatedReservedUsd: event.estimatedReservedUsd,
    });
  }
  for (const event of requestEvents) {
    const eventId = event.attemptEventId || `legacy:${event.runId || ''}:${spendByAttempt.size}`;
    spendByAttempt.set(eventId, { ...spendByAttempt.get(eventId), ...event });
  }
  const eventSpend = [...spendByAttempt.values()].reduce((sum, event) => {
    const attempt = event.attempt || {};
    const retained = Number(attempt.retainedReserveUsd);
    if (Number.isFinite(retained)) return sum + Math.max(0, retained);
    const usageEstimate = Number(attempt.usageCostEstimateUsd);
    if (Number.isFinite(usageEstimate)) return sum + Math.max(0, usageEstimate);
    const estimated = Number(attempt.estimatedReservedUsd ?? event.estimatedReservedUsd);
    return sum + Math.max(0, Number.isFinite(estimated) ? estimated : 0);
  }, 0);
  const legacyResults = records.filter(
    (record) => record.recordType === 'case_result' && !eventRunIds.has(record.runId)
  );
  return eventSpend + historicalSpendFromCaseRecords(legacyResults);
}

export function makeRunId() {
  return randomUUID();
}
