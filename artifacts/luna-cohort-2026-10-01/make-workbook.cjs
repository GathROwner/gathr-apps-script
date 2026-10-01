const fs = require('node:fs/promises');
const path = require('node:path');
const { Workbook, SpreadsheetFile } = require('@oai/artifact-tool');

async function main() {
  const root = __dirname;
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
  const results = JSON.parse(await fs.readFile(path.join(root, 'results.json'), 'utf8'));
  const outputDir = path.resolve(root, '../../outputs/luna-cohort-2026-10-01');
  await fs.mkdir(outputDir, { recursive: true });
  const wb = Workbook.create();
  const summary = wb.worksheets.add('Cohort');
  const details = wb.worksheets.add('Extracted events');
  summary.showGridLines = false;
  details.showGridLines = false;
  summary.getRange('A1').values = [['Luna high · selected-row dry cohort']];
  summary.getRange('A2').values = [[`Frozen ${manifest.frozenAtUtc}; production scheduled parsers remained on GPT-5.2`]];
  summary.getRange('A3').values = [['Model costs use uncached Standard Luna rates; infrastructure and tax excluded. Legacy baselines are saved mixed-model parses.']];
  const header = ['Case', 'Source', 'Expected', 'Actual', 'Result', 'Critical evidence', 'Legacy USD', 'Luna USD', 'Saving', 'Snapshot', 'Configuration'];
  summary.getRange('A5:K5').values = [header];
  const rows = [];
  const eventRows = [];
  for (const c of manifest.cases) {
    for (const r of results.filter(x => x.key === c.key)) {
      const audited = c.key === 'cornfest' && r.createdAt > '2026-10-01T23:30:00Z';
      let result = r.actualCount === c.expectedCount ? 'Coverage pass' : 'Coverage fail';
      if (c.key === 'pints' && r.actualCount === 0) result = 'Unscorable: source image unavailable';
      if (c.key === 'downtown' && r.actualCount === c.expectedCount) result = 'Coverage pass; venue review';
      rows.push([c.key, c.source, c.expectedCount, r.actualCount, result, c.critical,
        c.legacyCostUsd, r.estimatedNoDiscountUsd, null, r.snapshotId,
        audited ? 'Luna high + dense inventory audit' : 'Luna high; audit off']);
      for (const e of r.events) {
        eventRows.push([c.key, r.snapshotId, e.date || '', e.start || '', e.end || '',
          e.name || '', e.venue || '', e.ticket || '', e.image || '']);
      }
    }
  }
  if (rows.length) {
    summary.getRange(`A6:K${5 + rows.length}`).values = rows;
    for (let i = 0; i < rows.length; i++) {
      const row = i + 6;
      if (String(rows[i][4]).startsWith('Coverage pass')) {
        summary.getRange(`I${row}`).formulas = [[`=IFERROR(1-H${row}/G${row},"")`]];
      }
    }
  }
  details.getRange('A1').values = [['Extracted event evidence']];
  details.getRange('A2').values = [['These are saved dry-run payloads, not published Firestore events.']];
  details.getRange('A4:I4').values = [['Case', 'Snapshot', 'Date', 'Start', 'End', 'Title', 'Venue', 'Ticket URL', 'Primary image URL']];
  if (eventRows.length) details.getRange(`A5:I${4 + eventRows.length}`).values = eventRows;
  for (const [sheet, title, headerRange] of [[summary, 'A1', 'A5:K5'], [details, 'A1', 'A4:I4']]) {
    sheet.getRange(title).format.font = { name: 'Arial', size: 15, bold: true, color: '#17212D' };
    sheet.getRange(headerRange).format = { fill: '#253548', font: { name: 'Arial', size: 10, bold: true, color: '#FFFFFF' } };
  }
  summary.getRange(`A6:K${Math.max(6, 5 + rows.length)}`).format.font = { name: 'Arial', size: 10, color: '#17212D' };
  details.getRange(`A5:I${Math.max(5, 4 + eventRows.length)}`).format.font = { name: 'Arial', size: 10, color: '#17212D' };
  summary.getRange('A:A').format.columnWidth = 17;
  summary.getRange('B:B').format.columnWidth = 29;
  summary.getRange('C:D').format.columnWidth = 10;
  summary.getRange('E:E').format.columnWidth = 30;
  summary.getRange('F:F').format.columnWidth = 64;
  summary.getRange('G:I').format.columnWidth = 13;
  summary.getRange('J:J').format.columnWidth = 61;
  summary.getRange('K:K').format.columnWidth = 35;
  summary.getRange(`E6:F${5 + rows.length}`).format.wrapText = true;
  summary.getRange(`A6:K${5 + rows.length}`).format.rowHeight = 42;
  summary.getRange(`G6:H${5 + rows.length}`).format.numberFormat = '$0.00000';
  summary.getRange(`I6:I${5 + rows.length}`).format.numberFormat = '0.0%';
  summary.freezePanes.freezeRows(5);
  details.getRange('A:A').format.columnWidth = 16;
  details.getRange('B:B').format.columnWidth = 60;
  details.getRange('C:E').format.columnWidth = 14;
  details.getRange('F:G').format.columnWidth = 40;
  details.getRange('H:I').format.columnWidth = 70;
  details.freezePanes.freezeRows(4);
  const inspect = await wb.inspect({ kind: 'region', sheetId: 'Cohort', range: `A5:K${5 + rows.length}`, maxChars: 2500, tableMaxRows: 12, tableMaxCols: 11 });
  await fs.writeFile(path.join(outputDir, 'inspect.json'), JSON.stringify(inspect, null, 2));
  const preview = await wb.render({ sheetName: 'Cohort', range: `A1:I${5 + rows.length}`, scale: 1, format: 'png' });
  await fs.writeFile(path.join(outputDir, 'cohort-preview.png'), new Uint8Array(await preview.arrayBuffer()));
  const blob = await SpreadsheetFile.exportXlsx(wb);
  await blob.save(path.join(outputDir, 'luna-cohort-evidence.xlsx'));
  process.stdout.write(JSON.stringify({ workbook: path.join(outputDir, 'luna-cohort-evidence.xlsx'), cases: rows.length, events: eventRows.length }));
}
main().catch(err => { console.error(err); process.exitCode = 1; });
