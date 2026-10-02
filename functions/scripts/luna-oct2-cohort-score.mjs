import fs from 'node:fs/promises';
import path from 'node:path';

const dir = path.resolve(import.meta.dirname, '../../artifacts/luna-oct2-cohort',
  process.env.LUNA_COHORT_RUN_LABEL || '');
const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'));
// Standard API list prices per million tokens, October 2, 2026. All input is
// priced as uncached, so this is an upper estimate; it excludes other vendors.
const rates = { 'gpt-6-luna': [0.10, 0.50], 'gpt-5.2': [1.75, 14.00],
  'gpt-5-mini': [0.25, 2.00], 'gpt-5-nano': [0.05, 0.40] };
const wordSet = name => new Set(String(name || '').toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter(word => word.length > 2 &&
    !['the', 'and', 'with', 'for', 'day', 'night'].includes(word)));
function nameScore(a, b) {
  const left = wordSet(a), right = wordSet(b);
  if (!left.size || !right.size) return 0;
  const overlap = [...left].filter(word => right.has(word)).length;
  return overlap / Math.max(left.size, right.size);
}
function matches(legacy, luna) {
  const available = new Set(luna.map((_, index) => index));
  const exact = [], slotOnly = [], missed = [];
  // Match the strongest title pairs first. Multiple distinct events can share a
  // start slot; greedy legacy ordering otherwise masks a real omission.
  const candidates = legacy.flatMap((old, oldIndex) => luna.map((newEvent, index) => ({
    oldIndex, index, score: nameScore(old.name, newEvent.name),
    sameSlot: newEvent.startDate === old.startDate && newEvent.startTime === old.startTime,
  }))).filter(pair => pair.sameSlot).sort((a, b) => b.score - a.score);
  const matchedOld = new Set();
  for (const pair of candidates) {
    if (matchedOld.has(pair.oldIndex) || !available.has(pair.index)) continue;
    matchedOld.add(pair.oldIndex);
    available.delete(pair.index);
    const match = { legacy: legacy[pair.oldIndex], luna: luna[pair.index], nameScore: pair.score };
    (pair.score >= 0.4 ? exact : slotOnly).push(match);
  }
  for (const [oldIndex, old] of legacy.entries()) {
    if (matchedOld.has(oldIndex)) continue;
    missed.push(old);
  }
  return { exact, slotOnly, missed, extra: [...available].map(index => luna[index]) };
}
const rows = [];
for (const item of manifest.rows) {
  const file = path.join(dir, `row-${String(item.rowIndex).padStart(3, '0')}.json`);
  let result;
  try { result = JSON.parse(await fs.readFile(file, 'utf8')); } catch { continue; }
  const models = [...new Set((result.usage || []).map(call => call.model))];
  const fallback = models.some(model => model !== 'gpt-6-luna');
  // A mocked upload count can increase when website or legacy retry images are
  // prepared. It is a harness warning, not evidence that the Luna output failed.
  const substantiveError = result.error && !result.unavailable &&
    !/^ upload counts:/.test(result.error);
  const comparable = !result.unavailable && !fallback && !substantiveError;
  const aligned = comparable ? matches(result.legacyEvents, result.lunaEvents) : null;
  const usageByModel = {};
  for (const call of result.usage || []) {
    const entry = usageByModel[call.model] ||= { calls: 0, inputTokens: 0, outputTokens: 0 };
    entry.calls++;
    entry.inputTokens += Number(call.inputTokens || 0);
    entry.outputTokens += Number(call.outputTokens || 0);
  }
  const apiCostUpperUsd = Object.entries(usageByModel).reduce((total, [model, usage]) => {
    const price = rates[model];
    return total + (price ? (usage.inputTokens * price[0] + usage.outputTokens * price[1]) / 1e6 : 0);
  }, 0);
  rows.push({ rowIndex: item.rowIndex, cohort: item.cohort, postId: item.postId,
    sourceImageCount: item.imageCount, legacyCount: result.legacyEvents.length,
    lunaCount: result.lunaEvents.length, comparable, fallback, unavailable: !!result.unavailable,
    substantiveError: !!substantiveError,
    error: result.error || '', models, usageByModel, apiCostUpperUsd,
    exactCount: aligned?.exact.length ?? null, slotOnlyCount: aligned?.slotOnly.length ?? null,
    missedCount: aligned?.missed.length ?? null, extraCount: aligned?.extra.length ?? null,
    aligned, legacyEvents: result.legacyEvents, lunaEvents: result.lunaEvents,
    tokens: (result.usage || []).filter(call => call.model === 'gpt-6-luna').reduce((sum, call) => {
      sum.input += Number(call.inputTokens || 0);
      sum.output += Number(call.outputTokens || 0);
      return sum;
    }, { input: 0, output: 0 }),
  });
}
function summarize(items) {
  const valid = items.filter(row => row.comparable);
  const available = items.filter(row => !row.unavailable && !row.substantiveError);
  return { attempted: items.length, comparable: valid.length,
    unavailable: items.filter(row => row.unavailable).length,
    fallback: items.filter(row => row.fallback).length,
    error: items.filter(row => row.substantiveError).length,
    uploadCountWarnings: items.filter(row => /^ upload counts:/.test(row.error)).length,
    allAvailableLegacyEvents: available.reduce((n, row) => n + row.legacyCount, 0),
    allAvailableCandidateEvents: available.reduce((n, row) => n + row.lunaCount, 0),
    allAvailableLegacyPositiveRows: available.filter(row => row.legacyCount > 0).length,
    allAvailableCandidatePositiveRows: available.filter(row => row.lunaCount > 0).length,
    legacyEvents: valid.reduce((n, row) => n + row.legacyCount, 0),
    lunaEvents: valid.reduce((n, row) => n + row.lunaCount, 0),
    legacyPositiveRows: valid.filter(row => row.legacyCount > 0).length,
    lunaPositiveRows: valid.filter(row => row.lunaCount > 0).length,
    exactMatches: valid.reduce((n, row) => n + row.exactCount, 0),
    sameSlotNameReview: valid.reduce((n, row) => n + row.slotOnlyCount, 0),
    legacyUnmatched: valid.reduce((n, row) => n + row.missedCount, 0),
    lunaExtra: valid.reduce((n, row) => n + row.extraCount, 0),
    lunaInputTokens: valid.reduce((n, row) => n + row.tokens.input, 0),
    lunaOutputTokens: valid.reduce((n, row) => n + row.tokens.output, 0),
    allAttemptedApiCostUpperUsd: items.reduce((n, row) => n + row.apiCostUpperUsd, 0) };
}
const report = { generatedAtUtc: new Date().toISOString(), fileId: manifest.fileId,
  method: 'same date/start and title word-overlap comparison; counts require source review, not automatic quality conclusions',
  pricingSource: 'https://developers.openai.com/api/docs/models/',
  apiCostAssumption: 'standard rates; every input token priced uncached; output tokens include reasoning; no Google/Cloud cost',
  representative: summarize(rows.filter(row => row.cohort === 'representative')),
  stress: summarize(rows.filter(row => row.cohort === 'stress')),
  additional: summarize(rows.filter(row => row.cohort === 'additional')),
  rows };
await fs.writeFile(path.join(dir, 'score.json'), JSON.stringify(report, null, 2));
const header = 'rowIndex,cohort,comparable,unavailable,fallback,legacyCount,lunaCount,exactCount,slotOnlyCount,missedCount,extraCount,inputTokens,outputTokens,apiCostUpperUsd,error';
const csv = value => `"${String(value ?? '').replaceAll('"', '""').replace(/[\r\n]+/g, ' ')}"`;
await fs.writeFile(path.join(dir, 'score.csv'), [header, ...rows.map(row => [row.rowIndex,
  row.cohort, row.comparable, row.unavailable, row.fallback, row.legacyCount, row.lunaCount,
  row.exactCount, row.slotOnlyCount, row.missedCount, row.extraCount, row.tokens.input,
  row.tokens.output, row.apiCostUpperUsd.toFixed(6), row.error.slice(0, 200)].map(csv).join(','))].join('\n'));
console.log(JSON.stringify(rows.some(row => row.cohort === 'additional')
  ? { additional: report.additional }
  : { representative: report.representative, stress: report.stress }));
