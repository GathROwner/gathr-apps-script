import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { DateTime } from 'luxon';
import { logger } from '../utils/logger.js';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const COLLECTIONS = {
  PARSE_SNAPSHOTS: 'parse_snapshots',
  PIPELINE_COST_REPORTS: 'pipeline_cost_reports',
};

const DEFAULT_LOOKBACK_HOURS = 24;
const DEFAULT_SCAN_LIMIT = 5000;
const PAGE_SIZE = 400;

type MetricBucket = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
};

type ReportAggregation = {
  scanStartIso: string;
  scanEndIso: string;
  lookbackHours: number;
  snapshotsScanned: number;
  snapshotsWithUsage: number;
  rowsWithEvents: number;
  rowsSkippedOrEmpty: number;
  totalEventsExtracted: number;
  totalCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
  byStage: Record<string, MetricBucket>;
  byComponent: Record<string, MetricBucket>;
  byModel: Record<string, MetricBucket>;
};

type CostBucket = {
  model: string;
  estimatedCostUsd: number;
  coverage: 'priced' | 'missing_pricing';
};

function parseBooleanEnv(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw === '') return defaultValue;
  return String(raw).trim().toLowerCase() !== 'false';
}

function parsePositiveInt(raw: unknown, fallback: number): number {
  const value = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

function getMetricBucket(map: Record<string, MetricBucket>, key: string): MetricBucket {
  if (!map[key]) {
    map[key] = {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cachedInputTokens: 0,
    };
  }
  return map[key];
}

function addToBucket(
  target: MetricBucket,
  source: Partial<MetricBucket>
): void {
  target.calls += Number(source.calls || 0);
  target.inputTokens += Number(source.inputTokens || 0);
  target.outputTokens += Number(source.outputTokens || 0);
  target.totalTokens += Number(source.totalTokens || 0);
  target.cachedInputTokens += Number(source.cachedInputTokens || 0);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractUsageSummaryFromSnapshot(snapshot: Record<string, unknown>): Record<string, unknown> | null {
  const stages = Array.isArray(snapshot.stages) ? snapshot.stages : [];
  for (const stage of stages) {
    const stageObj = asRecord(stage);
    const output = stageObj ? asRecord(stageObj.output) : null;
    const summary = output ? asRecord(output.gptUsageSummary) : null;
    if (summary) return summary;
  }
  return null;
}

function extractEventCountFromSnapshot(snapshot: Record<string, unknown>): number {
  const stages = Array.isArray(snapshot.stages) ? snapshot.stages : [];
  for (const stage of stages) {
    const stageObj = asRecord(stage);
    const output = stageObj ? asRecord(stageObj.output) : null;
    const eventCount = Number(output?.eventCount || 0);
    if (Number.isFinite(eventCount) && eventCount > 0) {
      return eventCount;
    }
  }
  return 0;
}

function toModelEnvPrefix(model: string): string {
  return model
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function readModelPricing(model: string): {
  inputPerM: number;
  outputPerM: number;
  cachedInputPerM: number;
} | null {
  const prefix = toModelEnvPrefix(model);
  const inputRaw = Number(process.env[`PRICE_${prefix}_INPUT_PER_M`]);
  const outputRaw = Number(process.env[`PRICE_${prefix}_OUTPUT_PER_M`]);
  const cachedRaw = Number(process.env[`PRICE_${prefix}_CACHED_INPUT_PER_M`]);

  const hasInput = Number.isFinite(inputRaw) && inputRaw >= 0;
  const hasOutput = Number.isFinite(outputRaw) && outputRaw >= 0;
  if (!hasInput || !hasOutput) return null;

  return {
    inputPerM: inputRaw,
    outputPerM: outputRaw,
    cachedInputPerM: Number.isFinite(cachedRaw) && cachedRaw >= 0 ? cachedRaw : inputRaw,
  };
}

function estimateModelCost(
  model: string,
  bucket: MetricBucket
): CostBucket {
  const pricing = readModelPricing(model);
  if (!pricing) {
    return {
      model,
      estimatedCostUsd: 0,
      coverage: 'missing_pricing',
    };
  }

  const cachedInput = Math.max(0, Math.min(bucket.cachedInputTokens, bucket.inputTokens));
  const uncachedInput = Math.max(0, bucket.inputTokens - cachedInput);
  const output = Math.max(0, bucket.outputTokens);

  const estimatedCostUsd =
    (uncachedInput / 1_000_000) * pricing.inputPerM +
    (cachedInput / 1_000_000) * pricing.cachedInputPerM +
    (output / 1_000_000) * pricing.outputPerM;

  return {
    model,
    estimatedCostUsd,
    coverage: 'priced',
  };
}

function captureExperimentFlags(): Record<string, unknown> {
  const keys = [
    'ENABLE_OCR_DEBUG',
    'STAGE1_MODEL_OVERRIDE',
    'STAGE2_MODEL_OVERRIDE',
    'STAGE3_MODEL_OVERRIDE',
    'STAGE4_MODEL_OVERRIDE',
    'STAGE5_MODEL_OVERRIDE',
    'OCR_DEBUG_MODEL_OVERRIDE',
    'STAGE1_IMAGE_DETAIL',
    'STAGE2_IMAGE_DETAIL',
    'STAGE3_IMAGE_DETAIL',
    'OCR_DEBUG_IMAGE_DETAIL',
    'ENABLE_STAGE3_MIXED_DUAL_EXTRACT',
    'ENABLE_STAGE3_CALENDAR_SUPPLEMENTAL_OCR',
  ];
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const value = process.env[key];
    if (value == null || value === '') continue;
    result[key] = value;
  }
  return result;
}

async function buildPipelineCostReport(
  lookbackHours: number,
  scanLimit: number
): Promise<Record<string, unknown>> {
  const now = DateTime.now().setZone('UTC');
  const start = now.minus({ hours: lookbackHours });

  const aggregate: ReportAggregation = {
    scanStartIso: start.toISO() || '',
    scanEndIso: now.toISO() || '',
    lookbackHours,
    snapshotsScanned: 0,
    snapshotsWithUsage: 0,
    rowsWithEvents: 0,
    rowsSkippedOrEmpty: 0,
    totalEventsExtracted: 0,
    totalCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cachedInputTokens: 0,
    byStage: {},
    byComponent: {},
    byModel: {},
  };

  let scanned = 0;
  let cursor: admin.firestore.QueryDocumentSnapshot | null = null;

  while (scanned < scanLimit) {
    const pageLimit = Math.min(PAGE_SIZE, scanLimit - scanned);
    let query: admin.firestore.Query = db
      .collection(COLLECTIONS.PARSE_SNAPSHOTS)
      .where('createdAt', '>=', start.toJSDate())
      .orderBy('createdAt', 'asc')
      .limit(pageLimit);

    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;

    for (const doc of page.docs) {
      scanned += 1;
      aggregate.snapshotsScanned += 1;
      const data = (doc.data() || {}) as Record<string, unknown>;
      const eventCount = extractEventCountFromSnapshot(data);
      if (eventCount > 0) {
        aggregate.rowsWithEvents += 1;
        aggregate.totalEventsExtracted += eventCount;
      } else {
        aggregate.rowsSkippedOrEmpty += 1;
      }

      const usageSummary = extractUsageSummaryFromSnapshot(data);
      if (!usageSummary) continue;
      aggregate.snapshotsWithUsage += 1;

      aggregate.totalCalls += Number(usageSummary.totalCalls || 0);
      aggregate.inputTokens += Number(usageSummary.inputTokens || 0);
      aggregate.outputTokens += Number(usageSummary.outputTokens || 0);
      aggregate.totalTokens += Number(usageSummary.totalTokens || 0);
      aggregate.cachedInputTokens += Number(usageSummary.cachedInputTokens || 0);

      const byStage = asRecord(usageSummary.byStage) || {};
      for (const [key, value] of Object.entries(byStage)) {
        const bucket = getMetricBucket(aggregate.byStage, key);
        addToBucket(bucket, asRecord(value) || {});
      }

      const byComponent = asRecord(usageSummary.byComponent) || {};
      for (const [key, value] of Object.entries(byComponent)) {
        const bucket = getMetricBucket(aggregate.byComponent, key);
        addToBucket(bucket, asRecord(value) || {});
      }

      const byModel = asRecord(usageSummary.byModel) || {};
      for (const [key, value] of Object.entries(byModel)) {
        const bucket = getMetricBucket(aggregate.byModel, key);
        addToBucket(bucket, asRecord(value) || {});
      }
    }

    cursor = page.docs[page.docs.length - 1] || null;
    if (!cursor || page.size < pageLimit) {
      break;
    }
  }

  const perModelCost: CostBucket[] = [];
  let estimatedCostUsd = 0;
  let pricedModelCalls = 0;
  let unpricedModelCalls = 0;

  for (const [model, bucket] of Object.entries(aggregate.byModel)) {
    const cost = estimateModelCost(model, bucket);
    perModelCost.push(cost);
    if (cost.coverage === 'priced') {
      estimatedCostUsd += cost.estimatedCostUsd;
      pricedModelCalls += bucket.calls;
    } else {
      unpricedModelCalls += bucket.calls;
    }
  }

  return {
    generatedAt: admin.firestore.FieldValue.serverTimestamp(),
    generatedAtIso: now.toISO(),
    scanWindow: {
      startIso: aggregate.scanStartIso,
      endIso: aggregate.scanEndIso,
      lookbackHours: aggregate.lookbackHours,
    },
    snapshotStats: {
      scanned: aggregate.snapshotsScanned,
      withUsage: aggregate.snapshotsWithUsage,
      scanLimit,
    },
    qualityStats: {
      rowsWithEvents: aggregate.rowsWithEvents,
      rowsSkippedOrEmpty: aggregate.rowsSkippedOrEmpty,
      totalEventsExtracted: aggregate.totalEventsExtracted,
    },
    usage: {
      totalCalls: aggregate.totalCalls,
      inputTokens: aggregate.inputTokens,
      outputTokens: aggregate.outputTokens,
      totalTokens: aggregate.totalTokens,
      cachedInputTokens: aggregate.cachedInputTokens,
      byStage: aggregate.byStage,
      byComponent: aggregate.byComponent,
      byModel: aggregate.byModel,
    },
    estimatedCost: {
      usd: estimatedCostUsd,
      pricedModelCalls,
      unpricedModelCalls,
      perModel: perModelCost,
    },
    experimentFlags: captureExperimentFlags(),
  };
}

async function runAndStoreCostReport(
  triggerType: 'scheduled' | 'manual',
  lookbackHours: number,
  scanLimit: number
): Promise<Record<string, unknown>> {
  const report = await buildPipelineCostReport(lookbackHours, scanLimit);
  const docRef = db.collection(COLLECTIONS.PIPELINE_COST_REPORTS).doc();
  await docRef.set({
    ...report,
    triggerType,
    reportId: docRef.id,
  });

  logger.info('Pipeline cost report generated', {
    triggerType,
    reportId: docRef.id,
    lookbackHours,
    scanLimit,
    scanned: (report.snapshotStats as Record<string, unknown>)?.scanned || 0,
    totalCalls: (report.usage as Record<string, unknown>)?.totalCalls || 0,
    totalTokens: (report.usage as Record<string, unknown>)?.totalTokens || 0,
    estimatedCostUsd: (report.estimatedCost as Record<string, unknown>)?.usd || 0,
  });

  return {
    ...report,
    reportId: docRef.id,
    triggerType,
  };
}

export const scheduledPipelineCostReport = onSchedule(
  {
    schedule: '15 4 * * *',
    timeZone: 'America/Halifax',
    timeoutSeconds: 540,
    memory: '512MiB',
    region: 'northamerica-northeast1',
  },
  async () => {
    if (!parseBooleanEnv('ENABLE_DAILY_PIPELINE_COST_REPORT', true)) {
      logger.info('scheduledPipelineCostReport disabled by env flag');
      return;
    }

    const lookbackHours = parsePositiveInt(
      process.env.PIPELINE_COST_REPORT_LOOKBACK_HOURS,
      DEFAULT_LOOKBACK_HOURS
    );
    const scanLimit = parsePositiveInt(
      process.env.PIPELINE_COST_REPORT_SCAN_LIMIT,
      DEFAULT_SCAN_LIMIT
    );

    logger.setContext({ functionName: 'scheduledPipelineCostReport' });
    try {
      await runAndStoreCostReport('scheduled', lookbackHours, scanLimit);
    } finally {
      logger.clearContext('functionName');
    }
  }
);

export const manualPipelineCostReport = onRequest(
  {
    timeoutSeconds: 540,
    memory: '512MiB',
    region: 'northamerica-northeast2',
    cors: true,
  },
  async (request, response) => {
    if (request.method !== 'POST') {
      response.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const authHeader = request.headers.authorization;
    const expectedKey = process.env.ADMIN_API_KEY;
    if (expectedKey && authHeader !== `Bearer ${expectedKey}`) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const body = (request.body ?? {}) as {
      lookbackHours?: number;
      scanLimit?: number;
    };

    const lookbackHours = parsePositiveInt(
      body.lookbackHours,
      parsePositiveInt(process.env.PIPELINE_COST_REPORT_LOOKBACK_HOURS, DEFAULT_LOOKBACK_HOURS)
    );
    const scanLimit = parsePositiveInt(
      body.scanLimit,
      parsePositiveInt(process.env.PIPELINE_COST_REPORT_SCAN_LIMIT, DEFAULT_SCAN_LIMIT)
    );

    logger.setContext({ functionName: 'manualPipelineCostReport' });
    try {
      const report = await runAndStoreCostReport('manual', lookbackHours, scanLimit);
      response.json({
        success: true,
        report,
      });
    } catch (error) {
      logger.error('manualPipelineCostReport failed', error);
      response.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      logger.clearContext('functionName');
    }
  }
);
