import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const MAX_SOURCE_GALLERY_IMAGES = 16;
export const INITIAL_STAGE1_IMAGE_LIMIT = 4;
export const MAX_ESTIMATED_SPEND_USD = 1;
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
]);

export function getVariants(includeCompactLuna = false) {
  return includeCompactLuna
    ? [
        ...VARIANTS,
        {
          id: 'luna-compact-structured',
          model: 'gpt-6-luna',
          promptVariant: 'compact',
          structuredOutput: true,
        },
      ]
    : [...VARIANTS];
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
  constructor(maxUsd = MAX_ESTIMATED_SPEND_USD, historicalSpendUsd = 0) {
    if (!Number.isFinite(maxUsd) || maxUsd <= 0 || maxUsd > MAX_ESTIMATED_SPEND_USD) {
      throw new Error(`--max-estimated-usd must be greater than 0 and no more than ${MAX_ESTIMATED_SPEND_USD}`);
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
    if (projectedUsd > this.maxUsd) {
      throw new Stage1EvaluationBudgetError(
        `Estimated spend cap reached before request ${plan.requestIndex}: reserved $${this.reservedUsd.toFixed(4)}, next request reserve $${estimateUsd.toFixed(4)}, cap $${this.maxUsd.toFixed(2)}.`
      );
    }
    const reservationId = randomUUID();
    this.reservations.set(reservationId, {
      estimateUsd,
      currentUsd: estimateUsd,
      observedUsd: null,
    });
    return reservationId;
  }

  settle(attempt) {
    if (!attempt.reservationId || !this.reservations.has(attempt.reservationId)) return null;
    const reservation = this.reservations.get(attempt.reservationId);
    if (attempt.inputTokens > 0 || attempt.outputTokens > 0) {
      reservation.observedUsd = calculateObservedCostUsd(attempt);
      reservation.currentUsd = reservation.observedUsd;
    }
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
    return {
      capUsd: this.maxUsd,
      estimatedOrObservedReservedUsd: this.reservedUsd,
      usageCostEstimateUsd,
      historicalSpendUsd: this.historicalSpendUsd,
      unresolvedReserveUsd,
      requestCount: reservations.length,
      imageTokenReservePerImage: IMAGE_TOKEN_RESERVE,
      pricingBasis: 'Conservative Standard API token estimate as of 2026-10-08; uncached GPT-6 Luna input reserves at the cache-write rate.',
    };
  }
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
  const seenRows = new Set();

  for (const item of manifest.cases) {
    if (!item.caseId || seenCaseIds.has(item.caseId)) throw new Error(`Missing or duplicate caseId: ${item.caseId}`);
    if (seenRows.has(item.sourceRow)) throw new Error(`Duplicate source row: ${item.sourceRow}`);
    seenCaseIds.add(item.caseId);
    seenRows.add(item.sourceRow);
    if (!Array.isArray(item.images) || item.images.length === 0) throw new Error(`${item.caseId} has no image files`);
    if (item.images.length > MAX_SOURCE_GALLERY_IMAGES) {
      throw new Error(`${item.caseId} exceeds the ${MAX_SOURCE_GALLERY_IMAGES}-image source gallery limit`);
    }
    if (!['accept', 'reject'].includes(item.sourceTruth?.expectedDecision)) {
      throw new Error(`${item.caseId} must define sourceTruth.expectedDecision as accept or reject`);
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
      if (!Array.isArray(image.expectedSemanticCueGroups) || image.expectedSemanticCueGroups.length === 0) {
        throw new Error(`${item.caseId} image ${image.sourceGalleryIndex} needs semantic cue groups`);
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
    const extension = path.extname(image.path).toLowerCase();
    const mime = extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg';
    const bytes = fs.readFileSync(path.resolve(sourceRoot, image.path));
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
  if (requestEvents.length === 0) {
    return historicalSpendFromCaseRecords(records.filter((record) => record.recordType === 'case_result'));
  }
  const seen = new Set();
  const eventRunIds = new Set(requestEvents.map((event) => event.runId).filter(Boolean));
  const eventSpend = requestEvents.reduce((sum, event) => {
      const eventId = event.attemptEventId;
      if (eventId && seen.has(eventId)) return sum;
      if (eventId) seen.add(eventId);
      const attempt = event.attempt || {};
      const retained = Number(attempt.retainedReserveUsd);
      if (Number.isFinite(retained)) return sum + Math.max(0, retained);
      const usageEstimate = Number(attempt.usageCostEstimateUsd);
      if (Number.isFinite(usageEstimate)) return sum + Math.max(0, usageEstimate);
      return sum + Math.max(0, Number(attempt.estimatedReservedUsd) || 0);
  }, 0);
  const legacyResults = records.filter(
    (record) => record.recordType === 'case_result' && !eventRunIds.has(record.runId)
  );
  return eventSpend + historicalSpendFromCaseRecords(legacyResults);
}

export function makeRunId() {
  return randomUUID();
}
