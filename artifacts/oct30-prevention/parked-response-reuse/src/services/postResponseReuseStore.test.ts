import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostResponseReuseStore } from './postResponseReuseStore.js';
import type { PostResponseReuseRecord } from '../parsing/postResponseReuse.js';
const fence = { fileId: 'prior', runId: 'run-1', workerId: 'worker-1' };
const record = { producer: fence, createdAtMs: 1000, validatedAtMs: 1000, dependencies: [{ path: 'venues/venue', updateTime: '50:123' },
  { path: 'venues/venue/events/event', updateTime: '50:123' }] } as PostResponseReuseRecord;
function fixture() {
  const data = new Map<string, any>([
    ['parser_response_reuse/key', record],
    ['processing_locks/prior', { status: 'completed', runId: 'run-1', workerId: 'worker-1' }],
    ['processed_datasets/prior', { fileId: 'prior', processedAt: { toMillis: () => 2000 } }],
    ['venues/venue', { name: 'Venue' }], ['venues/venue/events/event', { title: 'Event' }],
  ]);
  const reads: string[] = [], writes: string[] = [];
  const versions = new Map<string, number>();
  const snap = (id: string) => ({ exists: data.has(id), data: () => data.get(id), get: (k: string) => data.get(id)?.[k],
    updateTime: { seconds: 50, nanoseconds: versions.get(id) || 123 } });
  const db: any = { doc: (id: string) => ({ id, get: async () => { reads.push(id); return snap(id); } }),
    getAll: async (...refs: { id: string }[]) => refs.map(r => { reads.push(r.id); return snap(r.id); }),
    runTransaction: async (fn: any) => fn({ get: async (ref: { id: string }) => { reads.push(ref.id); return snap(ref.id); },
      getAll: async (...refs: { id: string }[]) => refs.map(r => { reads.push(r.id); return snap(r.id); }),
      set: (ref: { id: string }, value: unknown) => { writes.push(ref.id); data.set(ref.id, value); } }) };
  return { data, versions, reads, writes, store: createPostResponseReuseStore(() => db) };
}
test('only completed producer run plus a later completed marker qualifies', async () => {
  const f = fixture(); assert.equal(await f.store.load('key', { ...fence, fileId: 'today' }), record);
  assert.deepEqual(f.reads, ['parser_response_reuse/key', 'processing_locks/prior', 'processed_datasets/prior', 'venues/venue', 'venues/venue/events/event']); assert.equal(f.writes.length, 0);
});
for (const kind of ['running', 'failed', 'other-run', 'old-marker', 'missing-marker'] as const) {
  test(`${kind} producer cannot supply cached results`, async () => {
    const f = fixture();
    if (kind === 'running' || kind === 'failed') f.data.get('processing_locks/prior').status = kind;
    if (kind === 'other-run') f.data.get('processing_locks/prior').runId = 'replay-run';
    if (kind === 'old-marker') f.data.get('processed_datasets/prior').processedAt = { toMillis: () => 999 };
    if (kind === 'missing-marker') f.data.delete('processed_datasets/prior');
    assert.equal(await f.store.load('key', { ...fence, fileId: 'today' }), undefined); assert.equal(f.writes.length, 0);
  });
}
test('same dataset bypasses lookup even if its historical completed marker exists', async () => {
  const f = fixture(); assert.equal(await f.store.load('key', fence), undefined); assert.equal(f.reads.length, 1);
});
test('receipt save is fenced within the transaction and writes only internal collection', async () => {
  const f = fixture(); f.data.get('processing_locks/prior').status = 'running';
  await f.store.save('new', record, fence); assert.deepEqual(f.reads, ['processing_locks/prior', 'venues/venue', 'venues/venue/events/event']);
  assert.deepEqual(f.writes, ['parser_response_reuse/new']);
});

for (const kind of ['venue-edit', 'manual-event-edit', 'deleted-event', 'missing-proof'] as const) {
  test(`${kind} forces normal parsing rather than reusing a prior answer`, async () => {
    const f = fixture();
    if (kind === 'venue-edit') f.versions.set('venues/venue', 124);
    if (kind === 'manual-event-edit') f.versions.set('venues/venue/events/event', 124);
    if (kind === 'deleted-event') f.data.delete('venues/venue/events/event');
    if (kind === 'missing-proof') f.data.set('parser_response_reuse/key', { ...record, dependencies: [] });
    assert.equal(await f.store.load('key', { ...fence, fileId: 'today' }), undefined); assert.equal(f.writes.length, 0);
  });
}
for (const kind of ['new-worker', 'new-run', 'completed'] as const) {
  test(`${kind} prevents stale worker cache writes`, async () => {
    const f = fixture(), lock = f.data.get('processing_locks/prior'); lock.status = 'running';
    if (kind === 'new-worker') lock.workerId = 'worker-2';
    if (kind === 'new-run') lock.runId = 'run-2';
    if (kind === 'completed') lock.status = 'completed';
    await assert.rejects(f.store.save('new', record, fence), /resume_worker_fenced/); assert.equal(f.writes.length, 0);
  });
}
