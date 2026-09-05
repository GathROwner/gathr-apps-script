import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveTrustedFullParserStartDate } from './rowProcessor.js';

test('rejects a full-parser event when neither the item nor structured source has a date', () => {
  assert.equal(
    resolveTrustedFullParserStartDate({
      itemStartDate: 'unknown',
      rowUtcStartDate: '',
    }),
    ''
  );
});

test('keeps an explicit event date', () => {
  assert.equal(
    resolveTrustedFullParserStartDate({
      itemStartDate: '2026-09-05',
      rowUtcStartDate: '',
    }),
    '2026-09-05'
  );
});

test('uses a structured Facebook event start date when the model date is missing', () => {
  assert.equal(
    resolveTrustedFullParserStartDate({
      itemStartDate: 'unknown',
      rowUtcStartDate: '2026-09-05T23:00:00.000Z',
    }),
    '2026-09-05'
  );
});
