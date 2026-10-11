// Read-only conversion of captured October 11 audit evidence into regression fixtures.
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2];
if (!root) throw new Error('Supply the captured audit directory');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const targetRows = [20, 66, 120, 234, 277, 313, 315, 332];
const rows = read('ledger.json').filter(row => targetRows.includes(row.row)).map(row => ({
  row: row.row, id: row.id, caption: row.caption, venue: row.venue, timestamp: row.timestamp,
  stage3: row.row === 20 ? row.stage3.filter(item => /Baba/i.test(item.venue)) : row.stage3,
  stage4: row.row === 20 ? row.stage4.filter(item => /Baba/i.test(item.venue)) : row.stage4,
  events: row.row === 20 ? row.events.filter(item => /Baba/i.test(item.establishment)) : row.events,
}));
const audits = read('event-update-audits.json').filter(audit =>
  /0HKcUnxA1jou0pFpLmzI|3C9dqyOoaejurl8zjx3x|O4FDKN8GUqCUld1ZhO8p|SEWO0qtndzRF6gyqMjbB/.test(audit.eventPath)
).map(audit => ({path: audit.eventPath, before: audit.before, incoming: audit.incoming, after: audit.after}));
const out = path.join(__dirname, '../src/processing/__fixtures__/oct11-integrity-repair.json');
fs.mkdirSync(path.dirname(out), {recursive: true});
fs.writeFileSync(out, JSON.stringify({dataset: '1w9joG-FJhXFTLKes7T4836iykHoPMZYU', rows, audits}, null, 2) + '\n');
console.log(JSON.stringify({rows: rows.length, audits: audits.length, out}));
