import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import { approvePostResponseReuse, createPostResponseReuseSession, createReuseImageHasher,
  postReusePolicyHash, POST_RESPONSE_REUSE_TTL_MS, PostResponseReuseRecord, PostResponseReuseStore,
  reuseDigest, runWithPostResponseReuse, withPostResponseReuse } from './postResponseReuse.js';
import { invalidatePostResponseReuse, notePostResponseReuseDocument } from './postResponseReuse.js';
import { extractTokenUsage } from './runtimeConfig.js';

const oldFence = { fileId: 'completed-yesterday', runId: 'run-1', workerId: 'worker-1' };
const newFence = { fileId: 'regular-today', runId: 'run-2', workerId: 'worker-2' };
const request = { model: 'gpt-6-luna', input: [{ role: 'user', content: [{ type: 'input_text', text: 'Original caption: swim at 10.' }] }], reasoning: { effort: 'high' } };
const visible = JSON.stringify({ items: [{ name: 'Swim', startTime: '10:00' }] });
function response(text = visible): any { return { id: 'paid-provider-id', model: 'gpt-6-luna', status: 'completed',
  output: [{ type: 'reasoning', encrypted_content: 'must-not-persist', summary: [] },
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }],
  usage: { input_tokens: 1000, output_tokens: 100, total_tokens: 1100,
    input_tokens_details: { cached_tokens: 200, cache_write_tokens: 100 } } }; }
function fixture() {
  const records = new Map<string, PostResponseReuseRecord>();
  let saves = 0;
  const store: PostResponseReuseStore = { async load(id) { return records.get(id); },
    async save(id, value) { saves++; records.set(id, structuredClone(value)); } };
  const options = { source: { postId: '1234567890123', caption: 'swim at 10', galleryPartition: [0, 0] },
    identity: { postId: '1234567890123', publisher: 'same-page' }, imageUrls: [] as string[],
    policyHash: reuseDigest('runtime-1'), fence: oldFence, hasher: async (url: string) => reuseDigest(url), store, now: () => 1000 };
  return { records, store, options, saves: () => saves };
}
async function warm(f = fixture(), body: any = request, reply: any = response()) {
  const session = await createPostResponseReuseSession(f.options);
  await runWithPostResponseReuse(session, async () => { await session.invoke('responses', body, async () => reply); notePostResponseReuseDocument('venues/venue-fixture'); approvePostResponseReuse(); });
  assert.equal(await session.commit(), true); return f;
}

test('same completed source and exact request reuses visible JSON with zero billed usage', async () => {
  const f = await warm(); const session = await createPostResponseReuseSession({ ...f.options, fence: newFence, now: () => 2000 });
  let paid = 0; const out = await session.invoke('responses', request, async () => { paid++; return response(); });
  assert.equal(paid, 0); assert.equal(out.output[0].content[0].text, visible);
  assert.deepEqual(extractTokenUsage(out.usage), { inputTokens: 0, outputTokens: 0, totalTokens: 0,
    cachedInputTokens: 0, cacheWriteTokens: 0, reusedResponse: true });
  assert.equal(session.metrics.hits, 1);
});

test('all-hit runs refresh current document pins without extending answer lifetime', async () => {
  const f = await warm(), before = [...f.records.values()][0];
  const session = await createPostResponseReuseSession({ ...f.options, fence: newFence, now: () => 2000 });
  await runWithPostResponseReuse(session, async () => {
    await session.invoke('responses', request, async () => { throw Error('no paid call expected'); });
    notePostResponseReuseDocument('venues/venue-fixture'); approvePostResponseReuse();
  });
  assert.equal(await session.commit(), true); const after = [...f.records.values()][0];
  assert.equal(after.producer.fileId, newFence.fileId); assert.equal(after.createdAtMs, before.createdAtMs);
  assert.equal(after.expiresAtMs, before.expiresAtMs);
  assert.equal(after.validatedAtMs, 2000);
});

for (const field of ['caption', 'publisher', 'postId', 'policy', 'time', 'effort', 'schema'] as const) {
  test(`changed ${field} cannot reuse a previous answer`, async () => {
    const f = await warm(); const args = { ...f.options, fence: newFence, now: () => 2000 };
    const body: any = structuredClone(request);
    if (field === 'caption') args.source = { ...args.source, caption: 'changed caption' };
    if (field === 'publisher') args.identity = { ...args.identity, publisher: 'other-page' };
    if (field === 'postId') args.identity = { ...args.identity, postId: '9999999999999' };
    if (field === 'policy') args.policyHash = reuseDigest('runtime-2');
    if (field === 'time') body.input[0].content[0].text = 'Original caption: swim at 11.';
    if (field === 'effort') body.reasoning.effort = 'low';
    if (field === 'schema') body.text = { format: { type: 'json_schema', name: 'changed', schema: { type: 'object' } } };
    const session = await createPostResponseReuseSession(args); let paid = 0;
    await session.invoke('responses', body, async () => { paid++; return response(); }); assert.equal(paid, 1);
  });
}

test('same signed source URLs with changed image bytes cause a miss', async () => {
  const f = fixture(); f.options.imageUrls = ['https://scontent.fbcdn.net/a.jpg']; await warm(f);
  const session = await createPostResponseReuseSession({ ...f.options, fence: newFence, hasher: async () => reuseDigest('new-bytes') });
  let paid = 0; await session.invoke('responses', request, async () => { paid++; return response(); }); assert.equal(paid, 1);
});

test('ordered gallery and source/shared partition remain part of the source identity', async () => {
  const f = fixture(); f.options.imageUrls = ['a', 'b']; await warm(f);
  for (const args of [{ ...f.options, imageUrls: ['b', 'a'] }, { ...f.options, source: { ...f.options.source, galleryPartition: [1, 1] } }]) {
    const session = await createPostResponseReuseSession({ ...args, fence: newFence });
    let paid = 0; await session.invoke('responses', request, async () => { paid++; return response(); }); assert.equal(paid, 1);
  }
});

test('current preprocessed image bytes must match too, despite new upload URLs', async () => {
  const f = fixture(); f.options.hasher = async () => reuseDigest('same-image-bytes');
  const body = { ...request, input: [{ role: 'user', content: [{ type: 'input_image', image_url: 'https://storage.googleapis.com/gathr-uploaded-images/old.jpg', detail: 'high' }] }] };
  await warm(f, body);
  const next = structuredClone(body); next.input[0].content[0].image_url = 'https://storage.googleapis.com/gathr-uploaded-images/new.jpg';
  const same = await createPostResponseReuseSession({ ...f.options, fence: newFence });
  let paid = 0; await same.invoke('responses', next, async () => { paid++; return response(); }); assert.equal(paid, 0);
  const changed = await createPostResponseReuseSession({ ...f.options, fence: newFence, hasher: async () => reuseDigest('different') });
  await changed.invoke('responses', next, async () => { paid++; return response(); }); assert.equal(paid, 1);
});

test('failed source hashing never truncates a gallery into caption-only proof', async () => {
  const f = fixture(); await assert.rejects(createPostResponseReuseSession({ ...f.options,
    imageUrls: ['missing'], hasher: async () => { throw Error('unavailable'); } }), /unavailable/);
  await assert.rejects(createPostResponseReuseSession({ ...f.options, imageUrls: ['1','2','3','4','5'] }), /complete/);
  assert.equal(f.saves(), 0);
});

for (const condition of ['expired', 'same-dataset', 'corrupt', 'future'] as const) {
  test(`${condition} receipts cannot supply an answer`, async () => {
    const f = await warm(), record = [...f.records.values()][0];
    if (condition === 'corrupt') record.answersHash = reuseDigest('corrupted');
    if (condition === 'future') record.createdAtMs = 3000;
    const session = await createPostResponseReuseSession({ ...f.options,
      fence: condition === 'same-dataset' ? oldFence : newFence,
      now: () => condition === 'expired' ? 1001 + POST_RESPONSE_REUSE_TTL_MS : 2000 });
    let paid = 0; await session.invoke('responses', request, async () => { paid++; return response(); }); assert.equal(paid, 1);
  });
}

test('holds and failed processing do not approve reuse receipts; completed replies alone are insufficient', async () => {
  const f = fixture(), session = await createPostResponseReuseSession(f.options);
  await session.invoke('responses', request, async () => response());
  assert.equal(await session.commit(), false); assert.equal(f.saves(), 0);
});

test('a later row/snapshot failure invalidates an already approved answer', async () => {
  const f = fixture(), session = await createPostResponseReuseSession(f.options);
  await runWithPostResponseReuse(session, async () => {
    await session.invoke('responses', request, async () => response());
    notePostResponseReuseDocument('venues/venue-fixture'); approvePostResponseReuse(); invalidatePostResponseReuse();
  });
  assert.equal(await session.commit(), false); assert.equal(f.saves(), 0);
});

test('temporary image URLs in model answers cannot be replayed into a later run', async () => {
  const f = fixture(), session = await createPostResponseReuseSession(f.options);
  await session.invoke('responses', request, async () => response(JSON.stringify({ image: 'https://storage.googleapis.com/gathr-uploaded-images/temp.jpg' })));
  await runWithPostResponseReuse(session, async () => { notePostResponseReuseDocument('venues/venue-fixture'); approvePostResponseReuse(); });
  assert.equal(await session.commit(), false);
});

for (const kind of ['incomplete', 'refusal', 'invalid-json', 'network-error'] as const) {
  test(`${kind} is never saved, including a later successful retry`, async () => {
    const f = fixture(), session = await createPostResponseReuseSession(f.options);
    const reply = response(kind === 'invalid-json' ? 'not-json' : visible);
    if (kind === 'incomplete') reply.status = 'incomplete';
    if (kind === 'refusal') reply.output = [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }];
    await session.invoke('responses', request, async () => { if (kind === 'network-error') throw Error('network'); return reply; }).catch(() => {});
    await session.invoke('responses', request, async () => response());
    await runWithPostResponseReuse(session, async () => { notePostResponseReuseDocument('venues/venue-fixture'); approvePostResponseReuse(); });
    assert.equal(await session.commit(), false); assert.equal(f.saves(), 0);
  });
}

test('stateful and streaming requests bypass reuse without changing the requested call', async () => {
  const f = await warm(); for (const extra of [{ stream: true }, { previous_response_id: 'prior' }, { tools: [{ type: 'web_search' }] }]) {
    const session = await createPostResponseReuseSession({ ...f.options, fence: newFence }); let paid = 0;
    await session.invoke('responses', { ...request, ...extra }, async () => { paid++; return response(); }); assert.equal(paid, 1);
    assert.equal(session.metrics.disabled, 1);
  }
});

test('private receipts omit provider IDs, usage and hidden reasoning', async () => {
  const f = await warm(), text = JSON.stringify([...f.records.values()]);
  for (const forbidden of ['must-not-persist', 'encrypted_content', 'paid-provider-id', '1100', 'input_tokens']) assert(!text.includes(forbidden));
});

test('worker fencing errors survive the cache commit path', async () => {
  const f = fixture(); f.store.save = async () => { throw Error('resume_worker_fenced'); };
  const session = await createPostResponseReuseSession(f.options);
  await session.invoke('responses', request, async () => response()); await runWithPostResponseReuse(session, async () => { notePostResponseReuseDocument('venues/venue-fixture'); approvePostResponseReuse(); });
  await assert.rejects(session.commit(), /resume_worker_fenced/);
});

test('client wrapper preserves original options and has no cache behavior outside regular-row context', async () => {
  const calls: unknown[] = [], opts = { timeout: 1234, maxRetries: 0 };
  const client: any = { responses: { create: async (...args: unknown[]) => { calls.push(args); return response(); } }, chat: { completions: { create: async () => ({}) } } };
  const wrapped = withPostResponseReuse(client); await wrapped.responses.create(request as any, opts);
  assert.deepEqual(calls, [[request, opts]]); assert.equal(withPostResponseReuse(client), wrapped);
});

test('real SDK wrapper retains the exact outgoing body with offline fetch playback', async () => {
  let requests = 0;
  const client = new OpenAI({ apiKey: 'offline-fixture-only', maxRetries: 0,
    fetch: (async (_url: unknown, options: any) => { requests++;
      assert.deepEqual(JSON.parse(options.body), request);
      return new Response(JSON.stringify(response()), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as any });
  const f = fixture(), session = await createPostResponseReuseSession(f.options);
  const wrapper = withPostResponseReuse(client);
  const first = await runWithPostResponseReuse(session, async () => {
    const out = await wrapper.responses.create(request as any); notePostResponseReuseDocument('venues/venue-fixture'); approvePostResponseReuse(); return out;
  });
  assert.equal(first.id, 'paid-provider-id'); assert.equal(requests, 1); assert.equal(await session.commit(), true);
  const next = await createPostResponseReuseSession({ ...f.options, fence: newFence });
  const reused: any = await runWithPostResponseReuse(next, () => wrapper.responses.create(request as any) as any);
  assert.equal(requests, 1); assert.equal(reused.output[0].content[0].text, visible);
});

test('parallel row contexts cannot borrow another post answer', async () => {
  const f = await warm(), other = await warm(fixture(), { ...request, input: [{ role: 'user', content: [{ type: 'input_text', text: 'different' }] }] });
  const a = await createPostResponseReuseSession({ ...f.options, fence: newFence });
  const b = await createPostResponseReuseSession({ ...other.options, fence: newFence });
  const client: any = { responses: { create: async () => response() }, chat: { completions: { create: async () => ({}) } } };
  const wrapped = withPostResponseReuse(client);
  await Promise.all([runWithPostResponseReuse(a, () => wrapped.responses.create(request as any) as any),
    runWithPostResponseReuse(b, () => wrapped.responses.create(request as any) as any)]);
  assert.equal(a.metrics.hits, 1); assert.equal(b.metrics.hits, 0);
});

test('configuration/effort changes invalidate policy while worker revision names do not', () => {
  const config = { parserMode: 'full5stage' };
  const first = postReusePolicyHash(config, { MODEL: 'same', K_REVISION: 'one' });
  assert.equal(postReusePolicyHash(config, { MODEL: 'same', K_REVISION: 'two' }), first);
  assert.notEqual(postReusePolicyHash(config, { MODEL: 'changed' }), first);
  assert.notEqual(postReusePolicyHash({ parserMode: 'legacy' }, { MODEL: 'same' }), first);
});

test('image proof rejects redirects, non-image bodies and unsupported destinations', async () => {
  const calls: unknown[] = [];
  const fetcher: any = async (url: string, options: unknown) => { calls.push([url, options]); return new Response('bytes', { status: 200, headers: { 'content-type': 'image/jpeg' } }); };
  const hash = createReuseImageHasher(fetcher); const url = 'https://scontent.fbcdn.net/photo.jpg';
  assert.equal(await hash(url), createHash('sha256').update('bytes').digest('hex'));
  await hash(url); assert.equal(calls.length, 1); assert.equal((calls[0] as any)[1].redirect, 'error');
  await assert.rejects(hash('http://127.0.0.1/private'), /host/);
  const wrong = createReuseImageHasher((async () => new Response('not-image', { headers: { 'content-type': 'text/html' } })) as any);
  await assert.rejects(wrong(url), /unavailable/);
});

test('Chat function-call JSON is preserved without exposing old billed usage', async () => {
  const f = fixture(), body = { model: 'gpt-5-nano', messages: [{ role: 'user', content: 'caption' }] };
  const session = await createPostResponseReuseSession(f.options);
  await session.invoke('chat', body, async () => ({ choices: [{ finish_reason: 'function_call', message: {
    role: 'assistant', function_call: { name: 'format', arguments: visible } } }], usage: { total_tokens: 200 } }));
  await runWithPostResponseReuse(session, async () => { notePostResponseReuseDocument('venues/venue-fixture'); approvePostResponseReuse(); }); assert.equal(await session.commit(), true);
  const next = await createPostResponseReuseSession({ ...f.options, fence: newFence });
  const out = await next.invoke('chat', body, async () => { throw Error('should not call'); });
  assert.equal(out.choices[0].message.function_call.arguments, visible); assert.equal(out.usage.total_tokens, 0);
  assert.equal(out.choices[0].finish_reason, 'function_call');
});
