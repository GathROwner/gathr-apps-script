/** Telemetry only. Missing historical cache-write usage must remain unknown. */
export interface CacheWriteMetrics {
  cacheWriteTokens: number;
  cacheWriteKnownCalls: number;
  cacheWriteUnknownCalls: number;
  cacheWriteUnknownInputTokens: number;
}

export function optionalTokenCount(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : undefined;
}

export function createCacheWriteMetrics(): CacheWriteMetrics {
  return { cacheWriteTokens: 0, cacheWriteKnownCalls: 0, cacheWriteUnknownCalls: 0, cacheWriteUnknownInputTokens: 0 };
}

export function addCacheWriteUsage(
  target: CacheWriteMetrics,
  usage: { inputTokens?: number; cachedInputTokens?: number; cacheWriteTokens?: number }
): void {
  const written = optionalTokenCount(usage.cacheWriteTokens);
  if (written !== undefined) {
    target.cacheWriteTokens += written;
    target.cacheWriteKnownCalls++;
  } else {
    target.cacheWriteUnknownCalls++;
    target.cacheWriteUnknownInputTokens += Math.max(0, Number(usage.inputTokens || 0) - Number(usage.cachedInputTokens || 0));
  }
}

export function addCacheWriteSummary(target: CacheWriteMetrics, source: Record<string, unknown>): void {
  const written = optionalTokenCount(source.cacheWriteTokens);
  target.cacheWriteTokens += written || 0;
  // New summaries have explicit coverage. Old summaries must not become zero-write calls.
  if (optionalTokenCount(source.cacheWriteKnownCalls) !== undefined &&
      optionalTokenCount(source.cacheWriteUnknownCalls) !== undefined) {
    target.cacheWriteKnownCalls += Number(source.cacheWriteKnownCalls);
    target.cacheWriteUnknownCalls += Number(source.cacheWriteUnknownCalls);
    target.cacheWriteUnknownInputTokens += Number(source.cacheWriteUnknownInputTokens || 0);
  } else {
    const calls = Number(source.calls ?? source.totalCalls ?? 0);
    if (written !== undefined) target.cacheWriteKnownCalls += calls;
    else {
      target.cacheWriteUnknownCalls += calls;
      target.cacheWriteUnknownInputTokens += Math.max(0, Number(source.inputTokens || 0) - Number(source.cachedInputTokens || 0));
    }
  }
}

export function defaultCacheWriteMultiplier(model: string): number {
  const version = /^gpt-(\d+)(?:\.(\d+))?/.exec(model);
  return version && (Number(version[1]) >= 6 || (Number(version[1]) === 5 && Number(version[2]) >= 6)) ? 1.25 : 1;
}

export interface TokenPricing {
  inputPerM: number;
  cachedInputPerM: number;
  cacheWritePerM: number;
  outputPerM: number;
}

// Standard USD rates verified 2026-10-10 against developers.openai.com/api/docs/models/<model>.
// Explicit environment rates take precedence; unsupported models remain unpriced.
const STANDARD_RATES: Record<string, TokenPricing> = {
  'gpt-6-luna': { inputPerM: .1, cachedInputPerM: .01, cacheWritePerM: .125, outputPerM: .5 },
  'gpt-5-mini': { inputPerM: .25, cachedInputPerM: .025, cacheWritePerM: .25, outputPerM: 2 },
  'gpt-5-nano': { inputPerM: .05, cachedInputPerM: .005, cacheWritePerM: .05, outputPerM: .4 },
  'gpt-5.2': { inputPerM: 1.75, cachedInputPerM: .175, cacheWritePerM: 1.75, outputPerM: 14 },
};

export function readTokenPricing(model: string, env: NodeJS.ProcessEnv = process.env): TokenPricing | null {
  const prefix = model.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const defaults = STANDARD_RATES[model];
  const rate = (suffix: string, fallback: number | undefined) => {
    const raw = env[`PRICE_${prefix}_${suffix}_PER_M`];
    return raw == null || raw.trim() === '' ? fallback : optionalTokenCount(raw);
  };
  const inputPerM = rate('INPUT', defaults?.inputPerM);
  const outputPerM = rate('OUTPUT', defaults?.outputPerM);
  if (inputPerM === undefined || outputPerM === undefined) return null;
  const cachedInputPerM = rate('CACHED_INPUT', defaults?.cachedInputPerM ?? inputPerM);
  const cacheWritePerM = rate('CACHE_WRITE', inputPerM * defaultCacheWriteMultiplier(model));
  if (cachedInputPerM === undefined || cacheWritePerM === undefined) return null;
  return { inputPerM, cachedInputPerM, cacheWritePerM, outputPerM };
}

export function estimateTokenCost(
  usage: { inputTokens: number; outputTokens: number; cachedInputTokens: number } & CacheWriteMetrics,
  pricing: TokenPricing
): { estimatedCostUsd: number; estimatedCostUsdUpperBound: number; cacheWriteCoverage: 'complete' | 'partial' | 'unknown' } {
  const input = Math.max(0, usage.inputTokens);
  const cached = Math.max(0, Math.min(usage.cachedInputTokens, input));
  const written = Math.max(0, Math.min(usage.cacheWriteTokens, input - cached));
  const ordinary = input - cached - written;
  const unknown = Math.max(0, Math.min(usage.cacheWriteUnknownInputTokens, ordinary));
  const estimatedCostUsd = (ordinary * pricing.inputPerM + cached * pricing.cachedInputPerM +
    written * pricing.cacheWritePerM + Math.max(0, usage.outputTokens) * pricing.outputPerM) / 1_000_000;
  return {
    estimatedCostUsd,
    estimatedCostUsdUpperBound: estimatedCostUsd + unknown * Math.max(0, pricing.cacheWritePerM - pricing.inputPerM) / 1_000_000,
    cacheWriteCoverage: !usage.cacheWriteUnknownCalls ? 'complete' : usage.cacheWriteKnownCalls ? 'partial' : 'unknown',
  };
}
