import { logger } from 'firebase-functions';

export type ProviderAlias = 'overpass_de' | 'overpass_kumi' | 'configured';
export type FailureLog = Readonly<Record<string, string | number | null | readonly string[]>>;
export type FailureLogger = (record: FailureLog) => void;
const MAX_SAMPLE_BYTES = 8_192;
const SAMPLE_BUDGET_MS = 100;
const BRANDS = ['nginx', 'apache', 'envoy', 'cloudflare', 'squid', 'haproxy', 'varnish', 'caddy', 'openresty', 'google frontend'];
const ERROR_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENETUNREACH',
  'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
  'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_INVALID']);
const BODY_MARKERS: Array<[string, RegExp]> = [
  ['bad_gateway', /\bbad\s+gateway\b/],
  ['upstream_connect_error', /\bupstream\s+connect(?:ion)?\s+(?:error|fail)/],
  ['connection_refused', /\bconnection\s+refused\b/], ['connection_reset', /\bconnection\s+reset\b/],
  ['upstream_timeout', /\b(?:upstream|connection|gateway)\s+(?:timed?\s*out|timeout)\b/],
  ['no_healthy_upstream', /\bno\s+healthy\s+upstream\b/], ['dns_failure', /\bdns\s+(?:lookup\s+)?(?:fail|error)/],
  ['tls_failure', /\b(?:tls|ssl|certificate)\s+(?:handshake\s+)?(?:fail|error|expired)/],
  ['access_denied', /\b(?:access\s+denied|forbidden|permission\s+denied)\b/],
  ['robots_denied', /\brobots[_\s-]*(?:denied|disallowed)\b/], ['challenge', /\b(?:captcha|challenge\s+required)\b/],
  ['rate_limited', /\b(?:rate[_\s-]*limit|too\s+many\s+requests)\b/],
  ['service_unavailable', /\b(?:service\s+unavailable|server\s+(?:is\s+)?busy)\b/],
  ['query_timeout', /\bquery\b.{0,40}\b(?:timed?\s*out|timeout)\b/],
  ['query_parse_error', /\b(?:parse|syntax)\s+error\b/], ['memory_limit', /\b(?:out\s+of\s+memory|memory\s+(?:limit|exhaust))\b/],
];

function normalizeBody(text: string): string {
  return text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ')
    .replace(/&#(?:x([0-9a-f]{1,6})|(\d{1,7}));?/gi, (_, hex: string, dec: string) => {
      const value = Number.parseInt(hex || dec, hex ? 16 : 10);
      return value <= 0x10ffff ? String.fromCodePoint(value) : ' ';
    }).replace(/&(?:nbsp|amp|lt|gt|quot|apos);/gi, ' ')
    .replace(/[\s\u200b-\u200d\ufeff]+/g, ' ').toLowerCase();
}

function originMetadata(response: Response): FailureLog {
  const get = (name: string) => String(response.headers.get(name) || '').slice(0, 512).toLowerCase();
  const server = get('server'); const via = get('via');
  const contentType = get('content-type').split(';')[0].trim();
  const encoding = get('content-encoding');
  return {
    server_brands: BRANDS.filter(brand => server.includes(brand)), via_brands: BRANDS.filter(brand => via.includes(brand)),
    via_protocols: [...new Set(via.split(',').map(entry => entry.trim().match(/^(?:[a-z]+\/)?(1\.0|1\.1|2(?:\.0)?|3(?:\.0)?)\s/)?.[1]).filter((v): v is string => !!v))].slice(0, 4),
    server_header: server ? 'present' : 'absent', via_header: via ? 'present' : 'absent',
    challenge_header: get('cf-mitigated') === 'challenge' ? 'challenge' : 'none',
    content_type: ['text/html', 'text/plain', 'application/json', 'application/xml', 'text/xml'].includes(contentType) ? contentType : 'other',
    content_encoding: !encoding ? 'absent' : ['gzip', 'br', 'deflate', 'identity'].includes(encoding) ? encoding : 'other',
    squid_error: get('x-squid-error').match(/^err_(access_denied|connect_fail|dns_fail|read_timeout|secure_connect_fail|zero_size_object)\b/)?.[1] || null,
  };
}

async function sampleBody(response: Response): Promise<{ text: string; bytes: number; state: string }> {
  if (!response.body) return { text: '', bytes: 0, state: 'empty' };
  const reader = response.body.getReader(); const chunks: Buffer[] = []; let bytes = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const snapshot = (state: string) => ({ text: Buffer.concat(chunks).toString('utf8'), bytes, state });
  const read = async () => {
    while (bytes < MAX_SAMPLE_BYTES) {
      const part = await reader.read();
      if (part.done) return snapshot('complete');
      const chunk = Buffer.from(part.value.subarray(0, MAX_SAMPLE_BYTES - bytes));
      bytes += chunk.length; chunks.push(chunk);
    }
    return snapshot('truncated');
  };
  try {
    return await Promise.race([read(), new Promise<ReturnType<typeof snapshot>>(resolve => {
      timer = setTimeout(() => resolve(snapshot('timed_out')), SAMPLE_BUDGET_MS);
    })]);
  } finally {
    clearTimeout(timer);
    // Initiate cleanup, without awaiting a remote cancellation acknowledgement.
    void reader.cancel().catch(() => undefined);
  }
}

function publish(record: FailureLog, sink?: FailureLogger): void {
  try {
    if (sink) sink(record);
    else logger.warn('Nearby public-place provider attempt failed', record);
  } catch { /* Diagnostics must never change discovery results or fallback. */ }
}
function duration(startedAt: number): number { return Math.max(0, Math.min(30_000, Date.now() - startedAt)); }
function httpCategory(status: number): string {
  return ({ 401: 'access_restriction', 403: 'access_restriction', 407: 'access_restriction', 429: 'rate_limited',
    451: 'access_restriction', 502: 'bad_gateway', 503: 'service_unavailable', 504: 'gateway_timeout' } as Record<number, string>)[status] || 'provider_http_error';
}

export async function logProviderHttpFailure(provider: ProviderAlias, response: Response, startedAt: number, sink?: FailureLogger): Promise<void> {
  let metadata: FailureLog = {}; let sample = { text: '', bytes: 0, state: 'unavailable' };
  try { metadata = originMetadata(response); } catch { /* Never log the thrown object. */ }
  try { sample = await sampleBody(response); } catch { /* Keep the status if sampling fails. */ }
  const text = normalizeBody(sample.text);
  const categories = BODY_MARKERS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name).slice(0, 6);
  const format = !sample.text ? 'empty' : /[\u0000-\u0008\u000e-\u001f\ufffd]/.test(sample.text) ? 'non_text'
    : /<\s*(?:!doctype|html|head|body|h1|title)\b/i.test(sample.text) ? 'html'
    : /^\s*[\[{]/.test(sample.text) ? 'json_like' : 'text';
  const status = response.status;
  // Unknown names/addresses cannot be exhaustively redacted from arbitrary text.
  // This controlled summary is deliberately NOT a verbatim server excerpt.
  publish({ event: 'nearby_place_provider_failure', provider, stage: 'http', http_status: status,
    elapsed_ms: duration(startedAt), category: httpCategory(status), ...metadata,
    body_sample: sample.state, sampled_bytes: sample.bytes, body_format: format, body_categories: categories,
    safe_summary: `HTTP ${status}: ${httpCategory(status)}; ${format}; ${categories.join(', ') || 'cause unclassified'}`,
  }, sink);
}

export function logProviderException(provider: ProviderAlias, stage: 'request' | 'json', status: number | null,
  error: unknown, startedAt: number, sink?: FailureLogger): void {
  let name = 'other'; let code: string | null = null;
  try {
    const value = error as { name?: string; code?: string; cause?: { code?: string } };
    if (['TimeoutError', 'AbortError', 'TypeError', 'SyntaxError'].includes(value?.name || '')) name = value.name!;
    const candidate = value?.cause?.code || value?.code;
    if (candidate && ERROR_CODES.has(candidate)) code = candidate;
  } catch { /* Do not invoke arbitrary error serializers. */ }
  publish({ event: 'nearby_place_provider_failure', provider, stage, http_status: status,
    elapsed_ms: duration(startedAt), category: name === 'TimeoutError' || name === 'AbortError' ? 'deadline_or_abort' : stage === 'json' ? 'invalid_json' : 'transport_error',
    error_name: name, error_code: code,
  }, sink);
}

/** HTTP200 may contain an Overpass runtime error; never publish its text. */
export function logProviderPayloadFailure(provider: ProviderAlias, status: number, payload: unknown,
  startedAt: number, sink?: FailureLogger): void {
  const value = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown> : {};
  const remark = typeof value.remark === 'string' ? value.remark.trim() : '';
  const categories = remark ? BODY_MARKERS.filter(([, pattern]) => pattern.test(normalizeBody(remark)))
    .map(([name]) => name).slice(0, 6) : [];
  publish({ event: 'nearby_place_provider_failure', provider, stage: 'payload', http_status: status,
    elapsed_ms: duration(startedAt), category: remark ? 'provider_runtime_error' : 'invalid_payload',
    body_categories: categories,
  }, sink);
}
