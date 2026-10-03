import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../artifacts/luna-oct2-cohort');
const first = JSON.parse(await fs.readFile(path.join(root, 'stage3-swap-first48/score.json')));
const additional = JSON.parse(await fs.readFile(path.join(root, 'stage3-swap-additional40/score.json')));
const rows = [...first.rows, ...additional.rows].sort((a, b) => a.rowIndex - b.rowIndex);
if (rows.length !== 88 || new Set(rows.map(row => row.postId)).size !== 88) {
  throw new Error(`Expected 88 distinct selected posts, found ${rows.length}`);
}
const usable = rows.filter(row => row.comparable);
const exceptions = rows.filter(row => !row.comparable);
const rates = { 'gpt-6-luna': [0.1, 0.5], 'gpt-5-mini': [0.25, 2],
  'gpt-5-nano': [0.05, 0.4] };
const costByModel = Object.fromEntries(Object.keys(rates).map(model => [model, 0]));
for (const row of rows) {
  for (const [model, usage] of Object.entries(row.usageByModel || {})) {
    const rate = rates[model];
    if (rate) costByModel[model] +=
      (usage.inputTokens * rate[0] + usage.outputTokens * rate[1]) / 1e6;
  }
}
const sum = (key) => usable.reduce((n, row) => n + Number(row[key] || 0), 0);
const report = {
  datasetId: first.fileId,
  modelScope: first.modelScope,
  expectedPosts: 88,
  comparablePosts: usable.length,
  exceptions: exceptions.map(row => ({ rowIndex: row.rowIndex, postId: row.postId,
    unavailable: row.unavailable, fallback: row.fallback, error: row.error })),
  savedListings: sum('legacyCount'), candidateListings: sum('lunaCount'),
  savedPositivePosts: usable.filter(row => row.legacyCount > 0).length,
  candidatePositivePosts: usable.filter(row => row.lunaCount > 0).length,
  exactSlotTitleMatches: sum('exactCount'), sameSlotNameReview: sum('slotOnlyCount'),
  savedUnmatched: sum('missedCount'), candidateExtra: sum('extraCount'),
  candidateApiCostUpperUsd: Object.values(costByModel).reduce((n, x) => n + x, 0),
  costByModelUpperUsd: costByModel,
  pricingAssumption: 'Standard API list rates; every input token charged uncached; excludes other vendors and cloud services.',
  baselineCostLimitation: 'Saved 5.2 parse snapshots contain final listings, not per-call tokens. No exact baseline API cost can be reconstructed from these snapshots.',
  rows: rows.map(row => ({ rowIndex: row.rowIndex, cohort: row.cohort,
    postId: row.postId, sourceImageCount: row.sourceImageCount,
    comparable: row.comparable, savedListings: row.legacyCount,
    candidateListings: row.lunaCount, exactSlotTitleMatches: row.exactCount,
    sameSlotNameReview: row.slotOnlyCount, savedUnmatched: row.missedCount,
    candidateExtra: row.extraCount, models: row.models,
    apiCostUpperUsd: row.apiCostUpperUsd, error: row.error,
    saved: row.legacyEvents, candidate: row.lunaEvents })),
};
await fs.writeFile(path.join(root, 'stage3-swap-combined.json'), JSON.stringify(report, null, 2));
const fields = ['rowIndex', 'cohort', 'postId', 'sourceImageCount', 'comparable',
  'savedListings', 'candidateListings', 'exactSlotTitleMatches', 'sameSlotNameReview',
  'savedUnmatched', 'candidateExtra', 'models', 'apiCostUpperUsd', 'error'];
const csv = value => `"${String(value ?? '').replaceAll('"', '""').replace(/[\r\n]+/g, ' ')}"`;
await fs.writeFile(path.join(root, 'stage3-swap-combined.csv'),
  [fields.join(','), ...report.rows.map(row => fields.map(field => csv(
    field === 'models' ? row.models.join(', ') : row[field])).join(','))].join('\n'));
console.log(JSON.stringify({ comparablePosts: report.comparablePosts,
  savedListings: report.savedListings, candidateListings: report.candidateListings,
  savedPositivePosts: report.savedPositivePosts,
  candidatePositivePosts: report.candidatePositivePosts,
  candidateApiCostUpperUsd: report.candidateApiCostUpperUsd,
  costByModelUpperUsd: report.costByModelUpperUsd,
  exceptions: report.exceptions }, null, 2));
