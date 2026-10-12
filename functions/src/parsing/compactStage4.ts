import type { ExtractedItem, ParsingConfig, SecondaryValidationResult } from './types.js';
import {isDeepStrictEqual} from 'node:util';

export const COMPACT_STAGE4_FORMAT = 'compact_v1';
type ValidationSource = ExtractedItem & { _pipelineIndex?: number; recurringPattern?: string };
const patterns = ['none', 'daily', 'weekly_monday', 'weekly_tuesday', 'weekly_wednesday',
  'weekly_thursday', 'weekly_friday', 'weekly_saturday', 'weekly_sunday'];

export function compactStage4Enabled(config: Partial<ParsingConfig>): boolean {
  return config.stage4CompactValidation ?? process.env.STAGE4_COMPACT_VALIDATION_ENABLED === 'true';
}

export class CompactStage4Error extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'CompactStage4Error'; }
}

/** Bind once before partitioning. Never mutate the caller's objects or renumber supplied identities. */
export function bindCompactStage4Sources(items: ValidationSource[]): ExtractedItem[] {
  const seen = new Set<number>();
  return items.map((item, index) => {
    const id = item._pipelineIndex ?? index + 1;
    if (!Number.isSafeInteger(id) || id < 1 || seen.has(id)) {
      throw new CompactStage4Error('invalid_input_source_identity');
    }
    seen.add(id);
    return { ...structuredClone(item), _pipelineIndex: id };
  });
}

export const compactStage4ResponseFormat = {
  type: 'json_schema' as const,
  name: 'stage4_compact_validation_v1', strict: true,
  schema: {
    type: 'object', additionalProperties: false, required: ['decisions'], properties: {
      decisions: { type: 'array', items: {
        type: 'object', additionalProperties: false,
        required: ['sourceItemIndex', 'sourceIdentity', 'decision', 'reason', 'corrections'], properties: {
          sourceItemIndex: { type: 'integer' },
          sourceIdentity: { type: 'object', additionalProperties: false,
            required: ['name', 'date', 'startTime', 'venue'], properties: {
              name: { type: 'string' }, date: { type: 'string' },
              startTime: { type: 'string' }, venue: { type: 'string' },
            } },
          decision: { type: 'string', enum: ['KEPT', 'REJECTED'] },
          reason: { type: 'string', description: 'One short sentence explaining the decision.' },
          corrections: { type: 'object', additionalProperties: false,
            required: ['recurringPattern', 'correctionReason'], properties: {
              recurringPattern: { anyOf: [{ type: 'string', enum: patterns }, { type: 'null' }] },
              correctionReason: { type: 'string', description: 'Empty when no recurrence correction is needed.' },
            } },
        },
      } },
    },
  },
};

export function compactStage4Prompt(legacyPrompt: string): string {
  const marker = 'CRITICAL JSON FORMATTING REQUIREMENTS:';
  const offset = legacyPrompt.lastIndexOf(marker);
  if (offset < 0) throw new CompactStage4Error('unrecognized_prompt_contract');
  return legacyPrompt.slice(0, offset) + `COMPACT JSON RESPONSE REQUIREMENTS:
Return ONLY a JSON object with a decisions array. Return exactly one decision
for every supplied item, including rejected items. sourceItemIndex MUST be that
item's original _pipelineIndex. Do not repeat, invent or omit an index.
For sourceIdentity, copy that same item's name, date, startTime and venue exactly
as strings (use an empty string for an absent value). These fields are identity
checks only. They must belong to sourceItemIndex, never to the preceding or
following item. Do not count positions from zero or renumber items in a batch.
Do not return the original item or rewrite any title, date, time, venue, price,
URL, source image, spatial metadata or description. Apply the validation rules
above. The only model correction allowed is recurringPattern, following those
same rules and supported by the item's source wording. Use null for no change.
Keep reason to one short sentence describing the actual item, and
correctionReason empty for no change. No validationSummary is needed.
Follow the supplied JSON schema; there is no example decision to copy.`;
}

function objectKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
}

/** A correction cannot manufacture a recurring schedule from an isolated weekday/date. */
function supportedRecurrence(item: ValidationSource, proposed: string | null): boolean {
  if (proposed === null || proposed === item.recurringPattern) return true;
  const text = `${item.name || ''} ${item.description || ''}`;
  if (proposed === 'none') {
    if (!item.recurringPattern || item.recurringPattern === 'none') return true;
    return /\b(?:annual|one[ -](?:off|time)|christmas|thanksgiving|halloween|easter|valentine|father['’]?s\s+day|mother['’]?s\s+day|new\s+year|st\.?\s+patrick)\b/i.test(text) &&
      /^\d{4}-\d{2}-\d{2}$/.test(String(item.date || ''));
  }
  // A negative/conditional schedule mention is insufficient to create recurrence.
  // Ignore that entire sentence; an independent affirmative sentence may qualify.
  const affirmative = text.split(/[.!?\n]+/).filter(sentence =>
    !/\b(?:not|never|no\s+longer|except|cancel(?:led|ed)?|if|might|may\s+(?:be|run|become|occur|happen)|previously|formerly|used\s+to)\b/i.test(sentence)).join('\n');
  if (proposed === 'daily') return /\b(?:every\s+day|everyday|daily)\b/i.test(affirmative);
  const day = proposed?.replace(/^weekly_/, '');
  return !!day && new RegExp(`\\b(?:every|each)\\s+${day}\\b|\\b${day}s\\b|\\bweekly\\b[^.!?\\n]{0,35}\\b${day}\\b|\\b${day}\\b[^.!?\\n]{0,35}\\bweekly\\b`, 'i').test(affirmative);
}

/** Strict parsing and source reconstruction. Response order is never used as identity. */
export function parseCompactStage4Response(text: string, sources: ValidationSource[]): SecondaryValidationResult {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new CompactStage4Error('malformed_json'); }
  if (!objectKeys(parsed, ['decisions']) || !Array.isArray(parsed.decisions)) {
    throw new CompactStage4Error('invalid_response_shape');
  }
  if (parsed.decisions.length !== sources.length) throw new CompactStage4Error('response_count_mismatch');
  const byId = new Map(sources.map(item => [item._pipelineIndex, item]));
  if (byId.size !== sources.length || sources.some(i => !Number.isSafeInteger(i._pipelineIndex) || i._pipelineIndex! < 1)) {
    throw new CompactStage4Error('invalid_input_source_identity');
  }
  const decisions = new Map<number, any>();
  for (const entry of parsed.decisions) {
    if (!objectKeys(entry, ['sourceItemIndex', 'sourceIdentity', 'decision', 'reason', 'corrections'])) throw new CompactStage4Error('invalid_decision_shape');
    const id = entry.sourceItemIndex;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || !byId.has(id)) throw new CompactStage4Error('foreign_source_identity');
    if (decisions.has(id)) throw new CompactStage4Error('duplicate_source_identity');
    const source = byId.get(id)!;
    const identity = entry.sourceIdentity;
    if (!objectKeys(identity, ['name', 'date', 'startTime', 'venue']) ||
      ['name', 'date', 'startTime', 'venue'].some(key => identity[key] !== String((source as any)[key] ?? ''))) {
      throw new CompactStage4Error('source_identity_mismatch');
    }
    if (entry.decision !== 'KEPT' && entry.decision !== 'REJECTED') throw new CompactStage4Error('invalid_decision');
    if (typeof entry.reason !== 'string' || !entry.reason.trim() || entry.reason.length > 600) throw new CompactStage4Error('invalid_reason');
    if (!objectKeys(entry.corrections, ['recurringPattern', 'correctionReason']) ||
      !(entry.corrections.recurringPattern === null || (typeof entry.corrections.recurringPattern === 'string' && patterns.includes(entry.corrections.recurringPattern))) ||
      typeof entry.corrections.correctionReason !== 'string' || entry.corrections.correctionReason.length > 600) {
      throw new CompactStage4Error('invalid_correction');
    }
    if (!supportedRecurrence(byId.get(id)!, entry.corrections.recurringPattern as string | null)) throw new CompactStage4Error('unsupported_recurrence_correction');
    decisions.set(id, entry);
  }
  return { validatedItems: sources.map(item => {
    const entry = decisions.get(item._pipelineIndex!);
    return { item: structuredClone(item), decision: entry.decision, reason: entry.reason, corrections: { ...entry.corrections } };
  }) } as SecondaryValidationResult;
}

export interface CompactStage4Hold { format: 'compact_v1'; reason: string; attempts: number; }
export function heldCompactStage4(reason: string, attempts: number): ExtractedItem[] {
  return Object.assign([], { _compactValidationHold: { format: COMPACT_STAGE4_FORMAT, reason, attempts } });
}
export function getCompactStage4Hold(items: ExtractedItem[]): CompactStage4Hold | undefined {
  return (items as any)?._compactValidationHold;
}

/** Same-post, fully identical timed one-offs only. Never merge differing evidence. */
export function removeExactCompactDuplicates(items: ExtractedItem[]): ExtractedItem[] {
  const kept: ExtractedItem[] = [];
  const comparison = (item: ExtractedItem) => Object.fromEntries(Object.entries(item)
    .filter(([key]) => key !== '_pipelineIndex' && key !== '_pipelineTotalStage3'));
  const eligible = (item: ValidationSource) => Boolean(item.name) &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(item.date || '')) &&
    /^(?:[01]?\d|2[0-3]):[0-5]\d(?:\s*[ap]m)?$/i.test(String((item as any).startTime || '').trim()) &&
    (!item.recurringPattern || item.recurringPattern === 'none');
  for (const item of items) {
    if (eligible(item) && kept.some(other => eligible(other) && isDeepStrictEqual(comparison(item), comparison(other)))) continue;
    kept.push(item);
  }
  return kept;
}
