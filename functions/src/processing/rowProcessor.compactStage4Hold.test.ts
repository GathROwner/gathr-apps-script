import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeStageArtifactsSnapshot, sanitizeStageArtifactsSnapshot} from './rowProcessor.js';

test('compact validation hold survives row snapshot merge and Firestore size bounding', () => {
  const stage3Items = Array.from({length: 120}, (_, n) => ({name: `Event ${n}`, description: 'x'.repeat(3000)})) as any;
  const hold = {format: 'compact_v1' as const, reason: 'source_identity_mismatch', attempts: 2};
  const merged = mergeStageArtifactsSnapshot({source: 'live', stage3Items}, {source: 'live', stage4Items: [], stage4ValidationHold: hold});
  const saved = sanitizeStageArtifactsSnapshot(merged)!;
  assert.deepEqual(saved.stage4ValidationHold, hold);
  assert.deepEqual(saved.stage4Items, []);
  assert(saved.stage3Items!.length > 0);
  assert(saved.artifactTruncation);
  assert(Buffer.byteLength(JSON.stringify(saved), 'utf8') <= 240_000);
});
