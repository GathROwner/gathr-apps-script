import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type OpenAI from 'openai';

/** Reuse visible JSON answers, never a whole row's publication decision.
 * Every routing, source guard, venue lookup, duplicate check and write still runs.
 * These entries are separate from OpenAI's token/prompt cache. */
export const POST_RESPONSE_REUSE_VERSION = 1;
export const POST_RESPONSE_REUSE_TTL_MS = 72 * 60 * 60 * 1000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_SOURCE_BYTES = 24 * 1024 * 1024;
const MAX_ENTRY_BYTES = 96 * 1024;
const MAX_RECORD_BYTES = 384 * 1024;
const MAX_RESPONSES = 32;
type Endpoint = 'responses' | 'chat';
type Json = Record<string, any>;
export interface ReuseFence { fileId: string; runId: string; workerId: string }
export interface VisibleAnswer { endpoint: Endpoint; model: string; content: unknown; finishReason?: string }
export interface PostResponseReuseRecord {
  version: 1; sourceHash: string; policyHash: string; identityHash: string;
  createdAtMs: number; expiresAtMs: number; validatedAtMs: number; producer: ReuseFence;
  answers: Record<string, VisibleAnswer>; answersHash: string;
  dependencies: { path: string; updateTime: string }[];
}
export interface PostResponseReuseStore {
  load(id: string, consumer: ReuseFence): Promise<PostResponseReuseRecord | undefined>;
  save(id: string, record: PostResponseReuseRecord, fence: ReuseFence): Promise<void>;
}
export interface ReuseMetrics { hits: number; misses: number; disabled: number }
export type ImageHasher = (url: string) => Promise<string>;

function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort()
    .filter(k => value[k] !== undefined).map(k => [k, canonical(value[k])]));
  return value;
}
export const reuseDigest = (value: unknown): string => createHash('sha256')
  .update(JSON.stringify(canonical(value))).digest('hex');
const validHash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** Exact bytes, bounded reads, no follow-on requests to redirect destinations. */
export function createReuseImageHasher(fetcher: typeof fetch = fetch): ImageHasher {
  let total = 0;
  const promises = new Map<string, Promise<string>>();
  return (url: string): Promise<string> => {
    const old = promises.get(url); if (old) return old;
    const pending = (async () => {
      const parsed = new URL(url);
      const sourceHost = /^(?:[a-z0-9-]+\.)*fbcdn\.net$/i.test(parsed.hostname);
      const managedHost = parsed.hostname === 'storage.googleapis.com' &&
        /^\/(?:gathr-uploaded-images|gathr-migrated[^/]*)\//.test(parsed.pathname);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || (!sourceHost && !managedHost)) {
        throw new Error('reuse_image_host_unverified');
      }
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 1500);
      try {
        const response = await fetcher(url, { signal: controller.signal, redirect: 'error' });
        if (!response.ok || !/^image\/(?:jpeg|png|webp)\b/i.test(response.headers.get('content-type') || '') || !response.body) {
          throw new Error('reuse_image_unavailable');
        }
        const length = Number(response.headers.get('content-length') || 0);
        if (length > MAX_IMAGE_BYTES) { controller.abort(); throw new Error('reuse_image_too_large'); }
        const reader = response.body.getReader(), hash = createHash('sha256'); let bytes = 0;
        try {
          while (true) { const chunk = await reader.read(); if (chunk.done) break;
            bytes += chunk.value.byteLength; total += chunk.value.byteLength;
            if (bytes > MAX_IMAGE_BYTES || total > MAX_SOURCE_BYTES) throw new Error('reuse_image_budget_exceeded');
            hash.update(chunk.value);
          }
        } catch (error) { await reader.cancel().catch(() => {}); controller.abort(); throw error; }
        if (!bytes) throw new Error('reuse_image_empty');
        return hash.digest('hex');
      } finally { clearTimeout(timer); }
    })();
    promises.set(url, pending); return pending;
  };
}

/** Runtime bytes invalidate every prior answer after any deployed implementation
 * change. Environment/config values are hashed locally; never stored or logged. */
let runtimeDigest: string | undefined;
export function postReusePolicyHash(config: unknown, env: NodeJS.ProcessEnv = process.env): string {
  if (!runtimeDigest) {
    const root = resolve(__dirname, '..'), files: [string, string][] = [];
    const walk = (dir: string): void => { for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.(?:js|json)$/.test(entry.name) && !/\.test\.js$/.test(entry.name)) {
        files.push([p.slice(root.length + 1).replace(/\\/g, '/'), createHash('sha256').update(readFileSync(p)).digest('hex')]);
      }
    } };
    walk(root);
    const lock = join(dirname(root), 'package-lock.json');
    files.push(['package-lock.json', createHash('sha256').update(readFileSync(lock)).digest('hex')]);
    runtimeDigest = reuseDigest(files.sort(([a], [b]) => a.localeCompare(b)));
  }
  // Per-worker routing identifiers must not prevent reuse between the three
  // parser functions. Model, prompt, secret, project and feature settings remain.
  const dynamic = new Set(['K_REVISION', 'K_SERVICE', 'K_CONFIGURATION', 'PORT', 'HOSTNAME',
    'FUNCTION_TARGET', 'FUNCTION_NAME', 'FUNCTION_REGION', 'FUNCTION_SIGNATURE_TYPE',
    'ENTRY_POINT', 'CLOUD_RUN_EXECUTION', 'CLOUD_RUN_TASK_INDEX', 'CLOUD_RUN_TASK_ATTEMPT']);
  const environment = Object.fromEntries(Object.entries(env).filter(([key]) => !dynamic.has(key)));
  return reuseDigest({ version: POST_RESPONSE_REUSE_VERSION, runtimeDigest, environment, config });
}

function visibleAnswer(endpoint: Endpoint, request: Json, response: Json): VisibleAnswer | undefined {
  if (endpoint === 'responses') {
    if (response?.status !== 'completed' || response.error || response.incomplete_details) return undefined;
    if (!Array.isArray(response.output)) return undefined;
    const messages = response.output.filter((x: Json) => x.type === 'message');
    if (response.output.some((x: Json) => !['message', 'reasoning'].includes(x.type))) return undefined;
    const texts = messages.flatMap((m: Json) => m.content || []);
    if (texts.some((x: Json) => x.type !== 'output_text' || typeof x.text !== 'string')) return undefined;
    const text = texts.map((x: Json) => x.text).join('');
    try { const parsed = JSON.parse(text); if (!parsed || typeof parsed !== 'object') return undefined; } catch { return undefined; }
    if (/https?:\/\/[^\s"\\]*(?:storage\.googleapis\.com|fbcdn\.net|fbsbx\.com)/i.test(text)) return undefined;
    return { endpoint, model: String(request.model), content: text };
  }
  if (response?.choices?.length !== 1 || !['stop', 'function_call', 'tool_calls'].includes(response.choices[0].finish_reason)) return undefined;
  const message = response.choices[0].message;
  if (!message || message.refusal) return undefined;
  const content = { role: 'assistant', content: message.content ?? null,
    ...(message.function_call ? { function_call: message.function_call } : {}),
    ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}) };
  const json = message.function_call?.arguments || message.tool_calls?.[0]?.function?.arguments || message.content;
  try { const parsed = JSON.parse(json); if (!parsed || typeof parsed !== 'object') return undefined; } catch { return undefined; }
  if (/https?:\/\/[^\s"\\]*(?:storage\.googleapis\.com|fbcdn\.net|fbsbx\.com)/i.test(String(json))) return undefined;
  return { endpoint, model: String(request.model), content, finishReason: response.choices[0].finish_reason };
}

function restoredAnswer(answer: VisibleAnswer, id: string): Json {
  // Deliberately omit historic provider IDs, billed usage and hidden reasoning.
  const usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0,
    input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
    output_tokens_details: { reasoning_tokens: 0 },
    prompt_tokens: 0, completion_tokens: 0, prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
    gathr_reused_response: true };
  return answer.endpoint === 'responses'
    ? { id: `post-reuse:${id}`, model: answer.model, status: 'completed', usage,
      output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: answer.content, annotations: [] }] }] }
    : { id: `post-reuse:${id}`, model: answer.model, usage,
      choices: [{ index: 0, finish_reason: answer.finishReason || 'stop', message: clone(answer.content) }] };
}

export class PostResponseReuseSession {
  readonly metrics: ReuseMetrics = { hits: 0, misses: 0, disabled: 0 };
  private readonly pending = new Map<string, VisibleAnswer>();
  private failed = false;
  private approved = false;
  private readonly documents = new Set<string>();
  constructor(readonly id: string, readonly sourceHash: string, readonly policyHash: string,
    readonly identityHash: string, private readonly previous: PostResponseReuseRecord | undefined,
    private readonly hasher: ImageHasher, private readonly store: PostResponseReuseStore,
    private readonly fence: ReuseFence, private readonly now: () => number = Date.now) {}

  approve(): void { this.approved = true; }
  invalidate(): void { this.failed = true; }
  noteDocument(path: string): void {
    if (/^(?:venues\/[^/]+(?:\/events\/[^/]+)?|events\/[^/]+)$/.test(path)) this.documents.add(path);
    else this.failed = true;
  }
  private async requestKey(endpoint: Endpoint, request: Json): Promise<string> {
    const visit = async (value: any): Promise<any> => {
      if (Array.isArray(value)) return Promise.all(value.map(visit));
      if (value && typeof value === 'object') {
        const result: Json = {};
        for (const key of Object.keys(value).sort()) {
          const item = value[key];
          if ((key === 'image_url' || key === 'url') && (value.type === 'input_image' || value.type === 'image_url')) {
            const url = typeof item === 'string' ? item : item?.url;
            if (!url) throw new Error('reuse_image_reference_missing');
            result[key] = { ...(typeof item === 'object' ? item : {}), url: undefined, sha256: await this.hasher(url) };
          } else result[key] = await visit(item);
        }
        return result;
      }
      return value;
    };
    if (request.stream || request.background || request.previous_response_id || request.conversation || request.tools?.some((x: Json) => x.type !== 'function')) {
      throw new Error('reuse_request_not_self_contained');
    }
    const imageCount = (JSON.stringify(request).match(/"type":"(?:input_image|image_url)"/g) || []).length;
    if (imageCount > 4) throw new Error('reuse_image_work_budget');
    return reuseDigest({ endpoint, request: await visit(request) });
  }

  async invoke(endpoint: Endpoint, request: Json, call: () => Promise<any>): Promise<any> {
    let key: string | undefined;
    try {
      key = await this.requestKey(endpoint, request);
      const old = this.previous?.answers?.[key];
      if (old && old.endpoint === endpoint && old.model === request.model &&
          reuseDigest(this.previous!.answers) === this.previous!.answersHash) {
        this.metrics.hits++; return restoredAnswer(old, `${this.id}:${key}`);
      }
    } catch { this.failed = true; this.metrics.disabled++; }
    this.metrics.misses++;
    let response: Json;
    try { response = await call(); } catch (error) { this.failed = true; throw error; }
    const answer = visibleAnswer(endpoint, request, response);
    if (!answer) this.failed = true;
    if (key && answer && Buffer.byteLength(JSON.stringify(answer)) <= MAX_ENTRY_BYTES) this.pending.set(key, answer);
    return response;
  }

  async commit(): Promise<boolean> {
    if (!this.approved || this.failed || (!this.pending.size && !this.metrics.hits) || this.pending.size > MAX_RESPONSES || !this.documents.size || this.documents.size > 32) return false;
    const answers = { ...this.previous?.answers, ...Object.fromEntries(this.pending) };
    if (Object.keys(answers).length > MAX_RESPONSES || Buffer.byteLength(JSON.stringify(answers)) > MAX_RECORD_BYTES) return false;
    // Refresh document-version pins after normal writes, but do not extend
    // the age of the underlying model answers indefinitely through cache hits.
    const createdAtMs = this.previous?.createdAtMs ?? this.now();
    await this.store.save(this.id, { version: 1, sourceHash: this.sourceHash, policyHash: this.policyHash,
      identityHash: this.identityHash, createdAtMs, expiresAtMs: createdAtMs + POST_RESPONSE_REUSE_TTL_MS,
      validatedAtMs: this.now(),
      producer: this.fence, answers, answersHash: reuseDigest(answers),
      dependencies: [...this.documents].sort().map(path => ({ path, updateTime: '' })) }, this.fence);
    return true;
  }
}

export async function createPostResponseReuseSession(args: {
  source: unknown; identity: unknown; imageUrls: string[]; policyHash: string; fence: ReuseFence;
  hasher: ImageHasher; store: PostResponseReuseStore; now?: () => number;
}): Promise<PostResponseReuseSession> {
  if (!validHash(args.policyHash) || args.imageUrls.length > 4) throw new Error('reuse_source_not_complete');
  const hashes = await Promise.all(args.imageUrls.map(args.hasher));
  if (!hashes.every(validHash)) throw new Error('reuse_invalid_image_hash');
  const sourceHash = reuseDigest({ source: args.source, orderedImageHashes: hashes }), identityHash = reuseDigest(args.identity);
  const id = reuseDigest({ sourceHash, identityHash, policyHash: args.policyHash });
  const now = (args.now || Date.now)(), record = await args.store.load(id, args.fence);
  const valid = record?.version === 1 && record.sourceHash === sourceHash && record.policyHash === args.policyHash &&
    record.identityHash === identityHash && record.producer.fileId !== args.fence.fileId &&
    Number.isFinite(record.createdAtMs) && record.createdAtMs <= now && record.expiresAtMs > now &&
    record.expiresAtMs <= record.createdAtMs + POST_RESPONSE_REUSE_TTL_MS &&
    Object.keys(record.answers || {}).length <= MAX_RESPONSES && reuseDigest(record.answers) === record.answersHash;
  return new PostResponseReuseSession(id, sourceHash, args.policyHash, identityHash, valid ? record : undefined,
    args.hasher, args.store, args.fence, args.now);
}

const context = new AsyncLocalStorage<PostResponseReuseSession>();
export const runWithPostResponseReuse = <T>(session: PostResponseReuseSession, fn: () => Promise<T>): Promise<T> => context.run(session, fn);
export function approvePostResponseReuse(): void { context.getStore()?.approve(); }
export function invalidatePostResponseReuse(): void { context.getStore()?.invalidate(); }
export function notePostResponseReuseDocument(path: string): void { context.getStore()?.noteDocument(path); }
const clients = new WeakMap<OpenAI, OpenAI>();
/** Keep every existing request body and SDK retry/timeout option unchanged. */
export function withPostResponseReuse(client: OpenAI): OpenAI {
  const old = clients.get(client); if (old) return old;
  const wrapper = Object.create(client);
  wrapper.responses = Object.create(client.responses);
  wrapper.responses.create = (request: any, options: any) => {
    const active = context.getStore();
    return active ? active.invoke('responses', request, () => client.responses.create(request, options) as any)
      : client.responses.create(request, options);
  };
  wrapper.chat = Object.create(client.chat); wrapper.chat.completions = Object.create(client.chat.completions);
  wrapper.chat.completions.create = (request: any, options: any) => {
    const active = context.getStore();
    return active ? active.invoke('chat', request, () => client.chat.completions.create(request, options) as any)
      : client.chat.completions.create(request, options);
  };
  clients.set(client, wrapper); return wrapper;
}
