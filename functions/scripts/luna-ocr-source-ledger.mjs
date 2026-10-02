import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Offline diagnostic only. OCR and primary extraction remain independent,
// fallible witnesses. A discrepancy never edits an event or gallery mapping.
const root = path.resolve(import.meta.dirname, '../..');
const fixtureRoot = path.join(root, 'artifacts/luna-six-calendars-2026-10-02');
const colorRoot = path.resolve(process.env.LUNA_COLOR_EVAL_DIR || path.resolve(root,
  '../../luna-parser-cost-trial/gathr-apps-script/artifacts/calendar-heldout-photos-2026-09-30/eval'));
const attachmentRoot = path.resolve(process.env.LUNA_ORIGINAL_IMAGE_DIR ||
  'C:/Users/craig/.codex/codex-remote-attachments/01a0ea83-7031-7423-b853-966f2180d186/6427722B-FBC8-4767-A514-8489C6D55CEA');
const cases = [
  ['photo-01', 'oct2-current'], ['photo-02', 'oct2-current'],
  ['photo-03', 'oct2-repeat'], ['photo-04', 'oct2-current'],
  ['photo-05', 'oct2-current'], ['photo-06', 'oct2-current'],
];
const ignored = new Set(['with', 'from', 'your', 'this', 'that', 'the', 'and',
  'nightly', 'party', 'free', 'price', 'priced']);
const tokenize = value => String(value || '').normalize('NFKD').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
const stem = word => word.length > 4 && word.endsWith('s') ? word.slice(0, -1) : word;
const pairs = value => {
  const tokens = tokenize(value).map(stem);
  const found = new Set();
  for (let i = 0; i + 1 < tokens.length; i++) {
    if (tokens[i].length >= 4 && tokens[i + 1].length >= 4 &&
        !ignored.has(tokens[i]) && !ignored.has(tokens[i + 1])) {
      found.add(`${tokens[i]} ${tokens[i + 1]}`);
    }
  }
  return found;
};
const midpoint = vertices => ({
  x: vertices.reduce((sum, point) => sum + (point.x || 0), 0) / vertices.length,
  y: vertices.reduce((sum, point) => sum + (point.y || 0), 0) / vertices.length,
});
const wordRecords = page => {
  const paragraphs = [];
  const words = [];
  for (const block of page.blocks || []) for (const paragraph of block.paragraphs || []) {
    const record = [];
    for (const word of paragraph.words || []) {
      const text = (word.symbols || []).map(symbol => symbol.text || '').join('');
      const point = midpoint(word.boundingBox?.vertices || []);
      const item = { text, normalized: stem(tokenize(text)[0] || ''), ...point,
        confidence: word.confidence ?? null };
      record.push(item);
      words.push(item);
    }
    paragraphs.push(record);
  }
  return { paragraphs, words };
};
const findDayAnchor = (point, words, width) => {
  const options = words.filter(word => /^(?:[1-9]|[12]\d|3[01])$/.test(word.text) &&
    (word.confidence ?? 0) >= 0.8 && word.y > point.y + 15 &&
    word.y < point.y + 220 && Math.abs(word.x - point.x) < width * 0.09)
    .map(word => ({ day: Number(word.text), x: word.x, y: word.y,
      score: word.y - point.y + Math.abs(word.x - point.x) * 0.3 }));
  options.sort((a, b) => a.score - b.score);
  return options.length && (options.length === 1 ||
    options[1].score - options[0].score > 25)
    ? { day: options[0].day, x: options[0].x, y: options[0].y }
    : null;
};
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const results = [];
for (const [id, label] of cases) {
  const run = JSON.parse(await fs.readFile(path.join(fixtureRoot, id,
    `luna-high-reviewed-${label}.json`), 'utf8'));
  const ocr = JSON.parse(await fs.readFile(path.join(fixtureRoot, id,
    'full-color-google-ocr.json'), 'utf8'));
  const page = ocr.responses?.[0]?.fullTextAnnotation?.pages?.[0];
  if (!page) throw new Error(`No Google OCR page for ${id}`);
  const colorPath = path.join(colorRoot, id, 'cloudrun-calendar-color.webp');
  const originalPath = path.join(attachmentRoot,
    `${Number(id.slice(-2))}-Photo-${Number(id.slice(-2))}.jpg`);
  const source = { id, galleryImageIndex: 0, ocrImage: colorPath,
    ocrImageSha256: sha256(await fs.readFile(colorPath)),
    originalImage: originalPath,
    originalImageSha256: sha256(await fs.readFile(originalPath)),
    ocrImageWidth: page.width, ocrImageHeight: page.height,
    preprocessing: 'saved Cloud Run-style color WebP from held-out fixture' };
  const { paragraphs, words } = wordRecords(page);
  const primary = run.stage3Items;
  const primaryPairs = new Map();
  for (const item of primary) for (const phrase of pairs(item.name)) {
    if (!primaryPairs.has(phrase)) primaryPairs.set(phrase, []);
    primaryPairs.get(phrase).push({ date: item.date, title: item.name });
  }
  const monthCounts = new Map();
  for (const item of primary) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) continue;
    const month = item.date.slice(0, 7);
    monthCounts.set(month, (monthCounts.get(month) || 0) + 1);
  }
  const month = [...monthCounts].sort((a, b) => b[1] - a[1])[0]?.[0];
  const observations = new Map();
  for (const paragraph of paragraphs) for (let i = 0; i + 1 < paragraph.length; i++) {
    const first = paragraph[i], second = paragraph[i + 1];
    const phrase = `${first.normalized} ${second.normalized}`;
    if (!primaryPairs.has(phrase) || primaryPairs.get(phrase).length < 3) continue;
    if (Math.abs(second.x - first.x) > page.width * 0.12 ||
        Math.abs(second.y - first.y) > page.height * 0.025) continue;
    const point = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    if (point.x < run.crop.left || point.x >= run.crop.left + run.crop.width ||
        point.y < run.crop.top || point.y >= run.crop.top + run.crop.height) continue;
    if (!observations.has(phrase)) observations.set(phrase, []);
    if (observations.get(phrase).some(other =>
      Math.abs(other.point.x - point.x) < 65 &&
      Math.abs(other.point.y - point.y) < 65)) continue;
    const anchor = findDayAnchor(point, words, page.width);
    const date = anchor && month ? `${month}-${String(anchor.day).padStart(2, '0')}` : null;
    observations.get(phrase).push({ point, anchor, date,
      ocrWords: [first.text, second.text],
      wordConfidence: [first.confidence, second.confidence] });
  }
  const discrepancies = [];
  for (const [phrase, occurrences] of observations) {
    const extracted = primaryPairs.get(phrase);
    if (occurrences.length <= extracted.length) continue;
    const sourceDays = occurrences.map(occurrence => occurrence.date).filter(Boolean);
    const ambiguousDateAnchors = occurrences.filter(occurrence => !occurrence.date).length;
    if (new Set(sourceDays).size !== sourceDays.length) {
      discrepancies.push({ phrase, status: 'ambiguous_duplicate_date',
        ocrCount: occurrences.length, primaryCount: extracted.length, occurrences });
      continue;
    }
    const missing = occurrences.filter(occurrence => occurrence.date &&
      !extracted.some(item => item.date === occurrence.date));
    if (missing.length > 0) {
      discrepancies.push({ phrase, status: 'source_review_needed',
        ocrCount: occurrences.length, primaryCount: extracted.length,
        ambiguousDateAnchors, missing, occurrences });
    } else if (ambiguousDateAnchors > 0) {
      discrepancies.push({ phrase, status: 'ambiguous_date_anchor',
        ocrCount: occurrences.length, primaryCount: extracted.length,
        ambiguousDateAnchors, occurrences });
    }
  }
  results.push({ source, primaryCount: primary.length, monthInferredFromPrimary: month,
    warning: 'Month/year from primary items is a diagnostic grouping aid, not independent source proof.',
    discrepancies });
}
const outputPath = path.join(fixtureRoot, 'ocr-source-ledger.json');
await fs.writeFile(outputPath, JSON.stringify({
  method: 'Google fullTextAnnotation word boxes; source phrase occurrences mapped to nearby printed date digits; no payload mutations',
  noApiCalls: true, noPayloadChanges: true,
  results,
}, null, 2));
console.log(JSON.stringify({ outputPath, results: results.map(result => ({
  id: result.source.id, discrepancies: result.discrepancies.map(value => ({
    phrase: value.phrase, status: value.status,
    ocrCount: value.ocrCount, primaryCount: value.primaryCount,
    missingDates: value.missing?.map(item => item.date),
  })),
})) }));
