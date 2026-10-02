import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  reconcileCalendarInventory,
  buildGuardedCalendarInventoryAdditions,
} from '../lib/parsing/calendarInventoryReconciliation.js';

// Read-only replay of source listings frozen from the original photographed
// calendars. This does not test whether a second model read discovers them.
const root = path.resolve(import.meta.dirname, '../..');
const artifactRoot = path.join(root, 'artifacts/luna-six-calendars-2026-10-02');
const load = async (id, label) => JSON.parse(await fs.readFile(path.join(
  artifactRoot, id, `luna-high-reviewed-${label}.json`), 'utf8'));
const listing = (date, title, startTime, frameIndex, excerpt) => ({
  date, title, startTime, frameIndex, sourceGalleryIndex: 0, excerpt,
});
const cases = [
  {
    id: 'photo-06', label: 'oct2-current', issue: 'omitted_Feb_3_Wing_Night',
    source: [listing('2026-02-03', '75¢ Wing Night', '4:00 PM', 0,
      '75¢ Wing Night at 4pm in the February 3 cell.')],
    expected: { matched: 0, additions: 0,
      conflicts: ['same_slot_different_title'], decision: 'disputed_reading' },
  },
  {
    id: 'photo-06', label: 'oct2-repeat', issue: 'repeat_Feb_3_Wing_Night',
    source: [listing('2026-02-03', '75¢ Wing Night', '4:00 PM', 0,
      '75¢ Wing Night at 4pm in the February 3 cell.')],
    expected: { matched: 1, additions: 0,
      conflicts: [], decision: 'incomplete_primary_coverage' },
  },
  {
    id: 'photo-03', label: 'oct2-repeat', issue: 'merged_June_6_Bingo_DJ',
    source: [
      listing('2026-06-06', 'Music Bingo! with Darcy', '7:00 PM', 0,
        'Music Bingo! at 7pm with Darcy.'),
      listing('2026-06-06', 'Top 40 DJ Dance Party with DJ Douce', '', 0,
        'Top 40 DJ Dance Party with DJ Douce; no separate time is printed.'),
    ],
    expected: { matched: 0, additions: 0,
      conflicts: ['same_slot_different_title', 'source_start_time_unprinted'],
      decision: 'disputed_reading' },
  },
  {
    id: 'photo-04', label: 'oct2-current', issue: 'May_30_HeartFakers_spelling',
    source: [listing('2026-05-30', 'Tom Petty & The HeartFakers', '', 2,
      'Tom Petty & The HeartFakers; performance time is not printed.')],
    expected: { matched: 0, additions: 0,
      conflicts: ['source_start_time_unprinted'], decision: 'disputed_reading' },
  },
];

const results = [];
for (const testcase of cases) {
  const run = await load(testcase.id, testcase.label);
  const reconciliation = reconcileCalendarInventory(run.stage3Items, testcase.source);
  const decision = buildGuardedCalendarInventoryAdditions(
    run.stage3Items, reconciliation, 0);
  const actual = {
    matched: reconciliation.matched.length,
    additions: reconciliation.additions.length,
    conflicts: reconciliation.conflicts.map(value => value.reason),
    decision: decision.reason,
  };
  assert.deepEqual(actual, testcase.expected, testcase.issue);
  results.push({ id: testcase.id, label: testcase.label, issue: testcase.issue,
    primaryCount: run.stage3Items.length, sourceListingCount: testcase.source.length,
    ...actual, autoAdditionEligible: decision.eligible });
}
const outputPath = path.join(artifactRoot, 'reconciliation-offline-2026-10-02.json');
await fs.writeFile(outputPath, JSON.stringify({
  method: 'frozen visual source listings replayed against saved Stage 3 with current reconciliation code',
  apiCalls: 0, firestoreWrites: 0, limitations: [
    'Manual source listings do not prove a second Luna read would independently find them.',
    'These targeted listings are not a complete calendar inventory.',
  ], results,
}, null, 2));
console.log(JSON.stringify({ outputPath, results }));
