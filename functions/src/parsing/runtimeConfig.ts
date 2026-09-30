import { GptUsageRecord, ParsingConfig } from './types.js';
import { logger } from '../utils/logger.js';

export type ImageDetailLevel = 'low' | 'high' | 'auto';

export function resolveStageModel(defaultModel: string, envVarName: string): string {
  const override = String(process.env[envVarName] || '').trim();
  return override || defaultModel;
}

export function resolveImageDetail(
  envVarName: string,
  fallback: ImageDetailLevel = 'high'
): ImageDetailLevel {
  const raw = String(process.env[envVarName] || '').trim().toLowerCase();
  if (raw === 'low' || raw === 'high' || raw === 'auto') {
    return raw;
  }
  return fallback;
}

export function parseBooleanEnv(varName: string, defaultValue: boolean): boolean {
  const raw = process.env[varName];
  if (raw == null || raw === '') return defaultValue;
  return String(raw).trim().toLowerCase() !== 'false';
}

export function parseNumberEnv(varName: string, defaultValue: number): number {
  const raw = process.env[varName];
  if (raw == null || raw === '') return defaultValue;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export function extractTokenUsage(usage: any): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
} {
  const inputTokens = Number(
    usage?.input_tokens ??
    usage?.prompt_tokens ??
    0
  ) || 0;
  const outputTokens = Number(
    usage?.output_tokens ??
    usage?.completion_tokens ??
    0
  ) || 0;
  const totalTokens = Number(
    usage?.total_tokens ??
    inputTokens + outputTokens
  ) || 0;
  const cachedInputTokens = Number(
    usage?.input_tokens_details?.cached_tokens ??
    usage?.prompt_tokens_details?.cached_tokens ??
    0
  ) || 0;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens,
  };
}

export async function emitGptUsage(
  config: ParsingConfig,
  usage: GptUsageRecord
): Promise<void> {
  if (typeof config.gptUsageHandler !== 'function') return;
  try {
    await config.gptUsageHandler(usage);
  } catch (error) {
    logger.warn('gptUsageHandler failed', {
      stage: usage.stage,
      component: usage.component,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
