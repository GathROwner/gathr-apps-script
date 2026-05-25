import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveSelectedRowIndexes } from './fileProcessor.js';
import { RawRowData } from '../types/index.js';

function row(uniqueId: string, userName = 'Venue'): RawRowData {
  return {
    uniqueId,
    text: uniqueId,
    mediaUrls: [],
    userName,
    pageName: userName,
    timestamp: '2099-05-29T23:00:00.000Z',
  };
}

test('selected row replay prefers sourceUniqueIds over stale row indexes', () => {
  const rows = [
    row('1003907418884852', 'Canoe Cove, PEI'),
    row('1274354194029233', 'Island Hill Farm Inc'),
    row('1552494202718548', 'Goju PEI'),
    row('2887408424926185', 'Victoria Park, Charlottetown'),
    row('981131691551659', "Playmaker's Club"),
  ];

  assert.deepEqual(
    resolveSelectedRowIndexes(rows, [3], ['981131691551659']),
    [4]
  );
});

test('selected row replay falls back to row indexes when no sourceUniqueId matches', () => {
  const rows = [
    row('a'),
    row('b'),
  ];

  assert.deepEqual(
    resolveSelectedRowIndexes(rows, [1], ['missing']),
    [1]
  );
});
