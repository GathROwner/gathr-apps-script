import test from 'node:test';
import assert from 'node:assert/strict';
import { boundStageArtifactSnapshot } from './stageArtifactBudget.js';
import { ParseStageArtifactsSnapshot, ExtractedItem } from './types.js';

test('stage evidence budget preserves normal snapshots and bounds oversized diagnostics without mutating the source', () => {
  const small: ParseStageArtifactsSnapshot = { source: 'live', stage3Items: [] };
  assert.equal(boundStageArtifactSnapshot(small), small);
  const items = Array.from({ length: 120 }, (_, index) => ({ name: `Event ${index}`,
    description: 'é'.repeat(4000), date: '2026-10-09' } as ExtractedItem));
  const large: ParseStageArtifactsSnapshot = { source: 'live', stage3Items: items, stage4Items: items };
  const result = boundStageArtifactSnapshot(large);
  assert.ok(Buffer.byteLength(JSON.stringify(result), 'utf8') <= 240_000);
  assert.ok(result.stage3Items!.length > 0 && result.stage4Items!.length > 0);
  assert.ok(result.artifactTruncation);
  assert.equal(large.stage3Items!.length, 120);
  assert.equal(large.stage4Items!.length, 120);
});
