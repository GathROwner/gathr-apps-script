import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { findSpatialCalendarNameDisputes } from '../lib/parsing/calendarNameDisputes.js';

// Saved-artifact diagnostic. It makes no provider requests or payload changes.
const root = path.resolve(import.meta.dirname, '../..');
const artifactRoot = path.join(root, 'artifacts/luna-six-calendars-2026-10-02');
const colorRoot = path.resolve(process.env.LUNA_COLOR_EVAL_DIR || path.resolve(root,
  '../../luna-parser-cost-trial/gathr-apps-script/artifacts/calendar-heldout-photos-2026-09-30/eval'));
const ledger = JSON.parse(await fs.readFile(path.join(artifactRoot,
  'ocr-source-ledger.json'), 'utf8'));
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const cases = [['photo-01', 'oct2-current'], ['photo-02', 'oct2-current'],
  ['photo-03', 'oct2-repeat'], ['photo-04', 'equal-bands-r1'],
  ['photo-05', 'oct2-current'], ['photo-06', 'oct2-current'],
  ['photo-06', 'equal-bands-r2']];
const results = [];
for (const [id, label] of cases) {
  const dir = path.join(artifactRoot, id);
  const run = JSON.parse(await fs.readFile(path.join(dir,
    `luna-high-reviewed-${label}.json`), 'utf8'));
  const ocr = JSON.parse(await fs.readFile(path.join(dir,
    'full-color-google-ocr.json'), 'utf8'));
  const page = ocr.responses?.[0]?.fullTextAnnotation?.pages?.[0];
  const expected = ledger.results.find(value => value.source.id === id)?.source;
  const imagePath = path.join(colorRoot, id, 'cloudrun-calendar-color.webp');
  const imageHash = sha256(await fs.readFile(imagePath));
  if (!page || !expected || imageHash !== expected.ocrImageSha256 ||
      page.width !== expected.ocrImageWidth ||
      page.height !== expected.ocrImageHeight) {
    throw new Error(`OCR source identity mismatch: ${id}`);
  }
  const paragraphs = [];
  for (const block of page.blocks || []) for (const paragraph of block.paragraphs || []) {
    paragraphs.push({ words: (paragraph.words || []).map(word => ({
      text: (word.symbols || []).map(symbol => symbol.text || '').join(''),
      vertices: word.boundingBox?.vertices || [],
      confidence: word.confidence ?? null,
    })) });
  }
  const frames = (run.frameManifest || []).filter(frame =>
    Number.isInteger(frame.sourceGalleryIndex) && frame.sourceGalleryIndex >= 0 &&
    frame.region && Number.isInteger(frame.frameIndex));
  const disagreements = findSpatialCalendarNameDisputes(run.stage3Items || [],
    frames, new Map([[0, paragraphs]]));
  results.push({ id, label, sourceGalleryIndex: 0,
    originalImageSha256: expected.originalImageSha256,
    ocrImageSha256: imageHash, ocrImageWidth: page.width,
    ocrImageHeight: page.height, paragraphCount: paragraphs.length,
    frameCount: frames.length, stage3Count: run.stage3Items?.length || 0,
    disagreements, interpretation: 'Review evidence only; absence of a dispute does not prove completeness.' });
}
const outputPath = path.join(artifactRoot, 'spatial-name-dispute-diagnostic.json');
await fs.writeFile(outputPath, JSON.stringify({ noApiCalls: true,
  noPayloadChanges: true, results }, null, 2));
console.log(JSON.stringify({ outputPath, results: results.map(result => ({
  id: result.id, label: result.label, disagreements: result.disagreements.map(value =>
    ({ date: value.date, modelWord: value.modelWord, ocrWord: value.ocrWord,
      sharedAnchors: value.sharedAnchors, sourceGalleryIndex: value.sourceGalleryIndex }))
})) }));
