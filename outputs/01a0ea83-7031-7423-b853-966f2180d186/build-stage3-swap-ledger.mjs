import fs from 'node:fs/promises';
import path from 'node:path';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const root = path.resolve(import.meta.dirname, '../..');
const source = JSON.parse(await fs.readFile(path.join(root,
  'artifacts/luna-oct2-cohort/stage3-swap-combined.json'), 'utf8'));
const rates = { 'gpt-5-mini': [0.25, 2], 'gpt-6-luna': [0.10, 0.50],
  'gpt-5-nano': [0.05, 0.40] };
const workbook = Workbook.create();
const overview = workbook.worksheets.add('Summary');
const rows = workbook.worksheets.add('Rows');
const listings = workbook.worksheets.add('Listings');
const retests = workbook.worksheets.add('Retests');
for (const sheet of [overview, rows, listings, retests]) sheet.showGridLines = false;

const rawResults = [];
for (const label of ['stage3-swap-first48', 'stage3-swap-additional40']) {
  const dir = path.join(root, 'artifacts/luna-oct2-cohort', label);
  for (const name of (await fs.readdir(dir)).filter(name => /^row-\d{3}\.json$/.test(name))) {
    rawResults.push(JSON.parse(await fs.readFile(path.join(dir, name), 'utf8')));
  }
}
const byRow = new Map(rawResults.map(result => [result.rowIndex, result]));
if (source.rows.length !== 88 || byRow.size !== 88) throw new Error('Incomplete cohort');

const header = ['Row', 'Cohort', 'Post ID', 'Images', 'Comparable',
  'Saved listings', 'Candidate listings', 'Difference', 'Saved positive',
  'Candidate positive', 'Exact slot and title', 'Saved unmatched',
  'Candidate extra', 'Mini cost USD', 'Luna cost USD', 'Nano cost USD',
  'Total cost USD', 'Models used', 'Replay issue'];
rows.getRangeByIndexes(0, 0, 1, header.length).values = [header];
const modelCost = (result, model) => (result.usage || []).filter(call => call.model === model)
  .reduce((total, call) => total + ((call.inputTokens || 0) * rates[model][0] +
    (call.outputTokens || 0) * rates[model][1]) / 1e6, 0);
rows.getRange('C2:C89').setNumberFormat('@');
const values = source.rows.map((row, i) => {
  const result = byRow.get(row.rowIndex);
  const nr = i + 2;
  return [row.rowIndex, row.cohort, `\u200B${row.postId}`, row.sourceImageCount,
    row.comparable ? 1 : 0, row.savedListings, row.candidateListings,
    null, null, null, row.exactSlotTitleMatches ?? '', row.savedUnmatched ?? '',
    row.candidateExtra ?? '', modelCost(result, 'gpt-5-mini'),
    modelCost(result, 'gpt-6-luna'), modelCost(result, 'gpt-5-nano'),
    null, row.models.join(', '), row.error?.split('\n')[0] ||
      (result.unavailable ? 'Source image unavailable' : '')];
});
rows.getRangeByIndexes(1, 0, values.length, header.length).values = values;
for (let i = 0; i < values.length; i++) {
  const nr = i + 2;
  rows.getRange(`H${nr}:J${nr}`).formulas = [[`=G${nr}-F${nr}`,
    `=IF(F${nr}>0,1,0)`, `=IF(G${nr}>0,1,0)`]];
  rows.getRange(`Q${nr}`).formulas = [[`=SUM(N${nr}:P${nr})`]];
}
rows.getRange('N2:Q89').setNumberFormat('"$"0.000000');
rows.getRange('A1:S89').format.font = { name: 'Arial', size: 10, color: '#1F2937' };
rows.getRange('A1:S1').format = { fill: '#243B53',
  font: { name: 'Arial', size: 10, bold: true, color: '#FFFFFF' } };
rows.getRange('A1:A89').format.columnWidth = 9;
rows.getRange('B1:B89').format.columnWidth = 19;
rows.getRange('C1:C89').format.columnWidth = 24;
rows.getRange('D1:M89').format.columnWidth = 17;
rows.getRange('N1:Q89').format.columnWidth = 19;
rows.getRange('R1:R89').format.columnWidth = 41;
rows.getRange('S1:S89').format.columnWidth = 44;
rows.freezePanes.freezeRows(1);
rows.tables.add('A1:S89', true, 'Stage3SwapRows');

overview.getRange('A1').values = [['Stage 3 Luna comparison']];
overview.getRange('A2').values = [['October 2, 2026 completed GathR parse']];
overview.getRange('A4:B4').values = [['Measure', 'Value']];
const metrics = [
  ['Selected posts', `=COUNTA('Rows'!A2:A89)`],
  ['Comparable posts', `=SUM('Rows'!E2:E89)`],
  ['Saved listings', `=SUM('Rows'!F2:F89)`],
  ['Candidate listings', `=SUM('Rows'!G2:G89)`],
  ['Saved posts with listings', `=SUM('Rows'!I2:I89)`],
  ['Candidate posts with listings', `=SUM('Rows'!J2:J89)`],
  ['Mini cost upper USD', `=SUM('Rows'!N2:N89)`],
  ['Luna cost upper USD', `=SUM('Rows'!O2:O89)`],
  ['Nano cost upper USD', `=SUM('Rows'!P2:P89)`],
  ['Candidate cost upper USD', `=SUM('Rows'!Q2:Q89)`],
];
overview.getRange('A5:A14').values = metrics.map(item => [item[0]]);
overview.getRange('B5:B14').formulas = metrics.map(item => [item[1]]);
overview.getRange('B11:B14').setNumberFormat('"$"0.000000');
overview.getRange('A16').values = [['Scope and limits']];
overview.getRange('A17').values = [['Only Stage 3 changed: GPT-5.2 to Luna high; mini and nano retained.']];
overview.getRange('A18').values = [['GPT-5.2 retry disabled. Earlier all-Luna trial had a different scope.']];
overview.getRange('A19').values = [['Listing counts precede Firestore expansion. Saved output is not ground truth.']];
overview.getRange('A20').values = [['Saved snapshots lack token usage, so exact baseline cost is unavailable.']];
overview.getRange('A21').values = [['Costs assume uncached standard API rates; other vendor costs excluded.']];
overview.getRange('A23:B25').values = [
  ['Source dataset', source.datasetId],
  ['Model pricing', 'https://developers.openai.com/api/docs/models/'],
  ['Status', 'Dry run, no event writes'],
];
overview.getRange('A1:B25').format.font = { name: 'Arial', size: 10, color: '#1F2937' };
overview.getRange('A1').format.font = { name: 'Arial', size: 16, bold: true, color: '#111827' };
overview.getRange('A2').format.font = { name: 'Arial', size: 10, italic: true, color: '#4B5563' };
overview.getRange('A4:B4').format = { fill: '#243B53',
  font: { name: 'Arial', size: 10, bold: true, color: '#FFFFFF' } };
overview.getRange('A16').format.font = { name: 'Arial', size: 11, bold: true, color: '#111827' };
overview.getRange('A1:A25').format.columnWidth = 57;
overview.getRange('B1:B25').format.columnWidth = 26;
overview.getRange('A17:A21').format.rowHeight = 28;

const listingHeader = ['Row', 'Post ID', 'Output', 'Title', 'Start date', 'Start time',
  'End date', 'End time', 'Recurrence', 'Occurrences', 'Venue', 'Source image index'];
const listingValues = source.rows.flatMap(row => [
  ...row.saved.map(event => ['Saved', event]),
  ...row.candidate.map(event => ['Candidate', event]),
].map(([side, event]) => [row.rowIndex, `\u200B${row.postId}`, side, event.name || '',
  event.startDate || '', event.startTime || '', event.endDate || '',
  event.endTime || '', event.recurringPattern || '', event.totalOccurrences ?? '',
  event.venue || '', event.relevantImageIndex ?? '']));
listings.getRangeByIndexes(0, 0, 1, listingHeader.length).values = [listingHeader];
listings.getRangeByIndexes(1, 1, listingValues.length, 1).setNumberFormat('@');
listings.getRangeByIndexes(1, 0, listingValues.length, listingHeader.length).values = listingValues;
listings.getRangeByIndexes(0, 0, listingValues.length + 1, listingHeader.length).format.font =
  { name: 'Arial', size: 10, color: '#1F2937' };
listings.getRangeByIndexes(0, 0, 1, listingHeader.length).format = { fill: '#243B53',
  font: { name: 'Arial', size: 10, bold: true, color: '#FFFFFF' } };
listings.getRangeByIndexes(0, 0, listingValues.length + 1, 1).format.columnWidth = 9;
listings.getRangeByIndexes(0, 1, listingValues.length + 1, 1).format.columnWidth = 22;
listings.getRangeByIndexes(0, 2, listingValues.length + 1, 1).format.columnWidth = 16;
listings.getRangeByIndexes(0, 3, listingValues.length + 1, 1).format.columnWidth = 54;
listings.getRangeByIndexes(0, 4, listingValues.length + 1, 6).format.columnWidth = 18;
listings.getRangeByIndexes(0, 10, listingValues.length + 1, 1).format.columnWidth = 42;
listings.getRangeByIndexes(0, 11, listingValues.length + 1, 1).format.columnWidth = 21;
listings.freezePanes.freezeRows(1);
listings.tables.add(`A1:L${listingValues.length + 1}`, true, 'Stage3SwapListings');

const readReplayCount = async (label, row) => {
  const file = path.join(root, 'artifacts/luna-oct2-cohort', label,
    `row-${String(row).padStart(3, '0')}.json`);
  const result = JSON.parse(await fs.readFile(file, 'utf8'));
  return result.lunaEvents.length;
};
const retestValues = [
  [209, 'Primary comparison', 15, byRow.get(209).lunaEvents.length,
    'Mini image validation hit the 2,000-token cap; text-only retry rejected gallery.'],
  [209, 'Unchanged repeat', 15, await readReplayCount('stage3-swap-upeisu-repeat', 209),
    'Same model mix and code; mini text-only retry passed on this run.'],
  [209, 'Higher-cap image retry', 15, await readReplayCount('stage3-swap-upeisu-cap-fix', 209),
    'Truncated mini JSON retried with the images at 4,000 tokens.'],
  [325, 'Before schedule repair', 3, JSON.parse(await fs.readFile(path.join(root,
    'artifacts/luna-oct2-cohort/stage3-swap-additional40/row-325.pre-schedule-fix.json'),
  'utf8')).lunaEvents.length, 'Timed class dates were blank; nano rejected them.'],
  [325, 'After schedule repair', 3, byRow.get(325).lunaEvents.length,
    'Three weekly classes retained; each ends October 31.'],
  [319, 'Primary comparison', 2, byRow.get(319).lunaEvents.length,
    'Sponsor caption gives a weekend date range without a start time.'],
];
retests.getRange('A1:E1').values = [['Row', 'Scenario', 'Saved listings',
  'Candidate listings', 'Interpretation']];
retests.getRangeByIndexes(1, 0, retestValues.length, 5).values = retestValues;
retests.getRange('A1:E7').format.font = { name: 'Arial', size: 10, color: '#1F2937' };
retests.getRange('A1:E1').format = { fill: '#243B53',
  font: { name: 'Arial', size: 10, bold: true, color: '#FFFFFF' } };
retests.getRange('A1:A7').format.columnWidth = 10;
retests.getRange('B1:B7').format.columnWidth = 27;
retests.getRange('C1:D7').format.columnWidth = 20;
retests.getRange('E1:E7').format.columnWidth = 85;
retests.freezePanes.freezeRows(1);
retests.tables.add('A1:E7', true, 'Stage3SwapRetests');

for (const [sheetName, range] of [['Summary', 'A1:B25'], ['Rows', 'A1:S14'],
  ['Listings', 'A1:L14'], ['Retests', 'A1:E7']]) {
  const check = await workbook.inspect({ kind: 'table', range: `${sheetName}!${range}`,
    include: 'values,formulas', tableMaxRows: 9, tableMaxCols: 7, maxChars: 1400 });
  console.log(`${sheetName}: ${check.ndjson.slice(0, 1300)}`);
  const preview = await workbook.render({ sheetName, range, scale: 1.1, format: 'png' });
  await fs.writeFile(path.join(import.meta.dirname,
    `stage3-swap-${sheetName.toLowerCase()}-preview.png`),
  new Uint8Array(await preview.arrayBuffer()));
}
const errors = await workbook.inspect({ kind: 'match',
  searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',
  options: { useRegex: true, maxResults: 30 }, maxChars: 900 });
console.log(`Formula errors: ${errors.ndjson.slice(0, 850)}`);
const outputPath = path.join(import.meta.dirname, 'luna-oct2-stage3-swap-audit.xlsx');
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(JSON.stringify({ outputPath, rows: source.rows.length,
  listings: listingValues.length }));
