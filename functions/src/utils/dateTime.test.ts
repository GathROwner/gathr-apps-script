import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeTime } from './dateTime.js';

test('invalid clock values are rejected rather than becoming event times', () => {
  assert.equal(normalizeTime('42:00'), '');
  assert.equal(normalizeTime('19:75'), '');
  assert.equal(normalizeTime('24:00'), '');
  assert.equal(normalizeTime('18:30'), '18:30');
});
