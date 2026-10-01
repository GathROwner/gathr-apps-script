import assert from 'node:assert/strict';
import test from 'node:test';
import { createOcrDebugPrompt } from './eventExtractor.js';

test('OCR prompt does not bill image data URLs as text', () => {
  const payload = 'data:image/webp;base64,' + 'A'.repeat(200_000);
  const prompt = createOcrDebugPrompt([payload]);

  assert.ok(prompt.includes('Attached image 1'));
  assert.ok(prompt.includes('"index": 1'));
  assert.ok(prompt.length < 1_000);
  assert.ok(!prompt.includes('base64'));
});
