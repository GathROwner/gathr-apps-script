import assert from 'node:assert/strict';
import test from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { logProviderException, logProviderHttpFailure, type FailureLog } from './nearbyPlaceDiagnostics.js';
import { discoverNearbyCheckInPlaces } from './nearbyCheckInPlaces.js';

const secret = 'PRIVATE_SENTINEL_7f845b';
const privateText = `${secret} Jane Doe jane@example.test +1-902-555-0199 123 Private Road password=hunter123 token=sk-private-123 cookie=abc latitude=46.0855005 longitude=-64.7849229 https://private.example/search?q=46.0855005,-64.7849229`;
const now = Timestamp.fromMillis(1_700_000_000_000);
const input = { latitude: 46.2382, longitude: -63.1311, accuracyMeters: 5, capturedAtMs: now.toMillis() };
function fakeDb() {
  let commits = 0;
  return {
    collection(name: string) {
      assert.equal(name, 'venues');
      return { limit: () => ({ get: async () => ({ docs: [{ id: 'known', data: () => ({
        name: 'Known venue', latitude: input.latitude, longitude: input.longitude,
      }) }] }) }) };
    },
    batch: () => ({ set: () => assert.fail('Unexpected candidate write'), commit: async () => { commits++; } }),
    get commits() { return commits; },
  };
}
function assertPrivate(record: unknown) {
  const text = JSON.stringify(record);
  for (const value of [secret, 'Jane', 'Doe', '@', '902', 'Private Road', 'hunter123', 'sk-private', 'cookie', '46.0855005', '-64.7849229', 'https:', 'private.example']) {
    assert.ok(!text.includes(value), `Unsafe value or field in log: ${value}`);
  }
  assert.ok(text.length < 1_600);
}

test('502 HTML entities and plaintext retain useful categories, never reflected private text', async () => {
  const bodies = [
    `<html><title>502&nbsp;Bad&#32;Gateway</title><body>upstream <b>connect</b> error: connection refused ${privateText}<script>${privateText}</script></body></html>`,
    `502 Bad Gateway. Upstream connect error: connection reset. ${privateText}`,
  ];
  for (const body of bodies) {
    const logs: FailureLog[] = [];
    await logProviderHttpFailure('overpass_de', new Response(body, { status: 502, headers: {
      server: `nginx/1.25.3 ${secret}`, via: `1.1 ${secret}.example (envoy/1.29.3)`,
      'content-type': `text/html; private=${secret}`, 'content-encoding': secret,
      'set-cookie': privateText, 'www-authenticate': privateText, 'x-request-id': secret, location: `https://private.example/${secret}`,
    } }), Date.now() - 5, record => logs.push(record));
    assert.equal(logs.length, 1);
    assert.equal(logs[0].category, 'bad_gateway');
    assert.ok((logs[0].body_categories as string[]).includes('bad_gateway'));
    assert.ok((logs[0].body_categories as string[]).includes('upstream_connect_error'));
    assert.deepEqual(logs[0].server_brands, ['nginx']);
    assert.deepEqual(logs[0].via_brands, ['envoy']);
    assert.deepEqual(logs[0].via_protocols, ['1.1']);
    assert.equal(logs[0].content_type, 'text/html');
    assert.equal(logs[0].content_encoding, 'other');
    assert.match(String(logs[0].safe_summary), /bad_gateway/);
    assertPrivate(logs);
  }
});

test('unknown, encoded and personal response text is withheld rather than guessed or regex-redacted', async () => {
  for (const body of [privateText, encodeURIComponent(privateText), Buffer.from(privateText).toString('base64'),
    `Fictional Person ${secret} 999 Unlisted Avenue`, `{"private":"${secret}","coordinates":[46.0855005,-64.7849229]}`]) {
    const logs: FailureLog[] = [];
    await logProviderHttpFailure('configured', new Response(body, { status: 502 }), Date.now(), record => logs.push(record));
    assert.deepEqual(logs[0].body_categories, []);
    assert.match(String(logs[0].safe_summary), /cause unclassified/);
    assertPrivate(logs);
    assert.ok(!JSON.stringify(logs).includes(body));
  }
});

test('error stream sampling is byte-bounded and cancels without waiting for remote cancellation', async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(Buffer.from(`Bad Gateway ${'x'.repeat(20_000)}${secret}`));
  }, cancel() { cancelled = true; return new Promise<void>(() => undefined); } });
  const logs: FailureLog[] = [];
  await logProviderHttpFailure('overpass_de', new Response(body, { status: 502 }), Date.now(), record => logs.push(record));
  assert.equal(logs[0].sampled_bytes, 8_192);
  assert.equal(logs[0].body_sample, 'truncated');
  assert.equal(cancelled, true);
  assertPrivate(logs);
});

test('a stalled error body times out after the diagnostic budget with no real-time sleep', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ pull() { return new Promise<void>(() => undefined); }, cancel() { cancelled = true; } });
  const logs: FailureLog[] = [];
  const pending = logProviderHttpFailure('overpass_de', new Response(body, { status: 502 }), Date.now(), record => logs.push(record));
  context.mock.timers.tick(100);
  await pending;
  assert.equal(logs[0].body_sample, 'timed_out');
  assert.equal(cancelled, true);
});

test('request and JSON failures log only allowlisted names/codes, never error messages, URLs or stack', () => {
  const logs: FailureLog[] = [];
  const error = Object.assign(new TypeError(privateText), { cause: { code: 'ECONNRESET', message: privateText }, stack: privateText });
  logProviderException('configured', 'request', null, error, Date.now(), record => logs.push(record));
  logProviderException('overpass_de', 'json', 200, new SyntaxError(privateText), Date.now(), record => logs.push(record));
  logProviderException('overpass_kumi', 'request', null, { name: secret, code: secret, toJSON() { throw Error('Must not serialize'); } }, Date.now(), record => logs.push(record));
  assert.equal(logs[0].error_code, 'ECONNRESET');
  assert.equal(logs[1].category, 'invalid_json');
  assert.equal(logs[2].error_name, 'other');
  assertPrivate(logs);
});

test('the production logger receives the same safe structured payload and fixed message', async context => {
  const calls: unknown[][] = [];
  context.mock.method(logger, 'warn', (...args: unknown[]) => { calls.push(args); });
  await logProviderHttpFailure('overpass_de', new Response(`Bad Gateway ${privateText}`, { status: 502 }), Date.now());
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'Nearby public-place provider attempt failed');
  assertPrivate(calls);
});

test('502 then success uses existing operators with the current fallback hostname; success is quiet', async () => {
  const logs: FailureLog[] = []; const calls: Array<{ url: string; init: RequestInit }> = [];
  const db = fakeDb();
  const result = await discoverNearbyCheckInPlaces('private-user', input, { db: db as never, now,
    providerFailureLogger: record => logs.push(record), fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init: init! });
      return calls.length === 1 ? new Response(`Bad Gateway ${privateText}`, { status: 502 })
        : new Response('{"elements":[]}', { status: 200 });
    } });
  assert.deepEqual(calls.map(x => x.url), ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']);
  assert.equal(calls[0].init.method, 'POST');
  assert.ok(calls[0].init.body instanceof URLSearchParams);
  assert.match(String(calls[0].init.body), /data=/);
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  assert.deepEqual(result.candidates.map(x => x.venueId), ['known']);
  assert.equal(result.externalLookupStatus, 'complete');
  assert.equal(db.commits, 0);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].provider, 'overpass_de');
  assertPrivate(logs);
});

test('HTTP200 runtime remarks and malformed payloads fall back rather than claim complete empty preparation', async () => {
  for (const invalid of [null, [], {}, {elements: null}, {elements: [], remark: {message: privateText}},
    {elements: [], remark: `runtime error: Query timed out ${privateText}`},
    {elements: [{type: 'node', id: 1}], remark: `runtime error: out of memory ${privateText}`}]) {
    let calls = 0;
    const logs: FailureLog[] = [];
    const result = await discoverNearbyCheckInPlaces('private-user', input, {db: fakeDb() as never, now,
      providerFailureLogger: record => logs.push(record), fetchImpl: async () => new Response(JSON.stringify(
        ++calls === 1 ? invalid : {elements: []}))});
    assert.equal(calls, 2);
    assert.equal(result.externalLookupStatus, 'complete');
    assert.equal(logs.length, 1);
    assert.equal(logs[0].stage, 'payload');
    assertPrivate(logs);
  }
});

test('two HTTP200 query errors retain canonical choices with partial status and no candidate writes', async () => {
  let calls = 0;
  const db = fakeDb();
  const logs: FailureLog[] = [];
  const result = await discoverNearbyCheckInPlaces('private-user', input, {db: db as never, now,
    providerFailureLogger: record => logs.push(record), fetchImpl: async () => {
      calls++;
      return new Response(JSON.stringify({elements: [], remark: `runtime error: Query timed out ${privateText}`}));
    }});
  assert.equal(calls, 2);
  assert.equal(result.externalLookupStatus, 'partial_unavailable');
  assert.deepEqual(result.candidates.map(candidate => candidate.venueId), ['known']);
  assert.equal(db.commits, 0);
  assert.ok(logs.every(record => record.category === 'provider_runtime_error'
    && (record.body_categories as string[]).includes('query_timeout')));
  assertPrivate(logs);
});

test('provider budget subtracts canonical, response body and diagnostic time from the callable deadline', async context => {
  context.mock.timers.enable({apis: ['Date'], now: now.toMillis()});
  const deadlines: number[] = [];
  context.mock.method(AbortSignal, 'timeout', (milliseconds: number) => {
    deadlines.push(milliseconds);
    return new AbortController().signal;
  });
  let calls = 0;
  const db = fakeDb();
  const query = db.collection.bind(db);
  db.collection = name => {
    context.mock.timers.tick(3_000); // Canonical work has already used3s.
    return query(name);
  };
  const result = await discoverNearbyCheckInPlaces('private-user', input, {db: db as never, now,
    providerFailureLogger: () => {}, fetchImpl: async () => {
      calls++;
      // Account for a slow response body, not just the initial HTTP headers.
      return {status: 200, ok: true, json: async () => {
        context.mock.timers.tick(calls === 1 ? 16_000 : 3_000);
        return {elements: [], remark: 'runtime error: Query timed out'};
      }} as Response;
    }});
  assert.equal(calls, 2);
  assert.deepEqual(deadlines, [16_000, 2_900]);
  assert.equal(result.externalLookupStatus, 'partial_unavailable');
});

test('a documented15s primary queue can finish within the existing shared20s budget', async context => {
  context.mock.timers.enable({apis: ['Date'], now: now.toMillis()});
  const deadlines: number[] = [];
  context.mock.method(AbortSignal, 'timeout', (milliseconds: number) => {
    deadlines.push(milliseconds);
    return new AbortController().signal;
  });
  let calls = 0;
  const result = await discoverNearbyCheckInPlaces('private-user', input, {db: fakeDb() as never, now,
    providerFailureLogger: () => {}, fetchImpl: async () => {
      calls++;
      if (calls === 1) {
        context.mock.timers.tick(15_000);
        if (deadlines[0] < 15_000) throw new DOMException('Synthetic queued request aborted.', 'TimeoutError');
      }
      return new Response('{"elements":[]}');
    }});
  assert.equal(calls, 1);
  assert.deepEqual(deadlines, [16_000]);
  assert.equal(result.externalLookupStatus, 'complete');
});

test('a16s primary timeout leaves only the shared remainder for a successful fallback', async context => {
  context.mock.timers.enable({apis: ['Date'], now: now.toMillis()});
  const deadlines: number[] = [];
  context.mock.method(AbortSignal, 'timeout', (milliseconds: number) => {
    deadlines.push(milliseconds);
    return new AbortController().signal;
  });
  let calls = 0;
  const logs: FailureLog[] = [];
  const result = await discoverNearbyCheckInPlaces('private-user', input, {db: fakeDb() as never, now,
    providerFailureLogger: record => logs.push(record), fetchImpl: async () => {
      calls++;
      if (calls === 1) {
        context.mock.timers.tick(16_000);
        throw new DOMException('Synthetic primary timeout.', 'TimeoutError');
      }
      context.mock.timers.tick(3_000);
      return new Response('{"elements":[]}');
    }});
  assert.equal(calls, 2);
  assert.deepEqual(deadlines, [16_000, 3_900]);
  assert.equal(result.externalLookupStatus, 'complete');
  assert.equal(logs[0].category, 'deadline_or_abort');
});

test('an exhausted canonical budget starts no provider request and never reports public preparation complete', async context => {
  context.mock.timers.enable({apis: ['Date'], now: now.toMillis()});
  const db = fakeDb();
  const query = db.collection.bind(db);
  db.collection = name => { context.mock.timers.tick(22_000); return query(name); };
  let calls = 0;
  const result = await discoverNearbyCheckInPlaces('private-user', input, {db: db as never, now,
    providerFailureLogger: () => {}, fetchImpl: async () => {calls++; return new Response('{"elements":[]}');}});
  assert.equal(calls, 0);
  assert.equal(result.externalLookupStatus, 'partial_unavailable');
  assert.equal(result.candidates[0].venueId, 'known');
});

test('a body arriving after the shared deadline cannot mark public preparation complete', async context => {
  context.mock.timers.enable({apis: ['Date'], now: now.toMillis()});
  const logs: FailureLog[] = [];
  let calls = 0;
  const result = await discoverNearbyCheckInPlaces('private-user', input, {db: fakeDb() as never, now,
    providerFailureLogger: record => logs.push(record), fetchImpl: async () => {
      calls++;
      return {status: 200, ok: true, json: async () => {
        context.mock.timers.tick(20_001);
        return {elements: []};
      }} as Response;
    }});
  assert.equal(calls, 1);
  assert.equal(result.externalLookupStatus, 'partial_unavailable');
  assert.equal(logs[0].category, 'deadline_or_abort');
  assert.equal(logs[0].stage, 'json');
});

test('a configured loopback provider retains10s and one attempt; genuine empty results remain complete', async context => {
  const deadlines: number[] = [];
  context.mock.method(AbortSignal, 'timeout', (milliseconds: number) => {
    deadlines.push(milliseconds);
    return new AbortController().signal;
  });
  let calls = 0;
  const result = await discoverNearbyCheckInPlaces('private-user', input, {db: fakeDb() as never, now,
    overpassEndpoint: 'http://127.0.0.1:5018/interpreter', providerFailureLogger: () => {},
    fetchImpl: async url => {
      calls++;
      assert.equal(String(url), 'http://127.0.0.1:5018/interpreter');
      return new Response('{"elements":[],"remark":"  "}');
    }});
  assert.equal(calls, 1);
  assert.deepEqual(deadlines, [10_000]);
  assert.equal(result.externalLookupStatus, 'complete');
});

test('timeouts preserve exactly two attempts and usable canonical venues with explicit partial status', async () => {
  const logs: FailureLog[] = []; let calls = 0;
  const result = await discoverNearbyCheckInPlaces('private-user', input, { db: fakeDb() as never, now,
    providerFailureLogger: record => logs.push(record), fetchImpl: async () => { calls++; throw new DOMException(privateText, 'TimeoutError'); },
  });
  assert.equal(result.externalLookupStatus, 'partial_unavailable');
  assert.deepEqual(result.candidates.map(candidate => candidate.venueId), ['known']);
  assert.equal(calls, 2); assert.equal(logs.length, 2);
  assert.ok(logs.every(record => record.category === 'deadline_or_abort' && record.stage === 'request'));
  assertPrivate(logs);
});

test('successful empty discovery has no warning; diagnostics failure cannot prevent fallback', async () => {
  let calls = 0;
  const logs: FailureLog[] = [];
  const result = await discoverNearbyCheckInPlaces('private-user', input, { db: fakeDb() as never, now,
    providerFailureLogger: record => logs.push(record), fetchImpl: async () => new Response('{"elements":[]}'),
  });
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(logs, []);
  const recovered = await discoverNearbyCheckInPlaces('private-user', input, { db: fakeDb() as never, now,
    providerFailureLogger: () => { throw new Error(privateText); }, fetchImpl: async () => ++calls === 1
      ? new Response('Bad Gateway', { status: 502 }) : new Response('{"elements":[]}'),
  });
  assert.equal(calls, 2); assert.equal(recovered.candidates.length, 1);
});

test('JSON parsing failure remains retryable and location guards still reject before provider or logger', async () => {
  const logs: FailureLog[] = []; let calls = 0;
  const recovered = await discoverNearbyCheckInPlaces('private-user', input, { db: fakeDb() as never, now,
    providerFailureLogger: record => logs.push(record), fetchImpl: async () => ++calls === 1
      ? new Response(privateText, { status: 200 }) : new Response('{"elements":[]}'),
  });
  assert.equal(recovered.candidates.length, 1); assert.equal(calls, 2);
  assert.equal(logs.length, 1); assert.equal(logs[0].stage, 'json'); assert.equal(logs[0].http_status, 200);
  assertPrivate(logs);
  let invalidFetches = 0; let invalidLogs = 0;
  for (const invalid of [{ ...input, capturedAtMs: now.toMillis() - 60_001 }, { ...input, accuracyMeters: 101 }]) {
    await assert.rejects(discoverNearbyCheckInPlaces('private-user', invalid, { db: fakeDb() as never, now,
      providerFailureLogger: () => { invalidLogs++; },
      fetchImpl: async () => { invalidFetches++; return new Response('{"elements":[]}'); },
    }));
  }
  assert.equal(invalidFetches, 0); assert.equal(invalidLogs, 0);
});
