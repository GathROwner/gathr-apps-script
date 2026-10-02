import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { localizeSourceDateAnchors, reconcileLocalizedSourcePhrases
} from '../lib/parsing/calendarSourceLocalization.js';
import { findSpatialCalendarNameDisputes
} from '../lib/parsing/calendarNameDisputes.js';

// Saved-image diagnostic only. The year/month below are reviewed fixture
// assumptions from poster text and weekday alignment, not model-majority dates.
const root = path.resolve(import.meta.dirname, '../..');
const evidenceRoot = path.join(root, 'artifacts/luna-six-calendars-2026-10-02');
const colorRoot = path.resolve(process.env.LUNA_COLOR_EVAL_DIR || path.resolve(root,
  '../../luna-parser-cost-trial/gathr-apps-script/artifacts/calendar-heldout-photos-2026-09-30/eval'));
const sourceLedger = JSON.parse(await fs.readFile(path.join(evidenceRoot,
  'ocr-source-ledger.json'), 'utf8'));
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const cases = [
  { id: 'photo-06', yearMonth: '2026-02', primaryLabels: ['oct2-current', 'equal-bands-r2'],
    phrase: ['wing', 'night'] },
  { id: 'photo-04', yearMonth: '2026-05', primaryLabels: ['equal-bands-r1'],
    phrase: ['heartfakers'] },
];
const normalize = value => String(value || '').normalize('NFKD').toLowerCase()
  .replace(/[^a-z0-9]+/g, '');
const center = vertices => ({ x: vertices.reduce((sum, point) => sum + point.x, 0) / vertices.length,
  y: vertices.reduce((sum, point) => sum + point.y, 0) / vertices.length });
const results = [];
for (const item of cases) {
  const dir = path.join(evidenceRoot, item.id);
  const expected = sourceLedger.results.find(value => value.source.id === item.id)?.source;
  const ocr = JSON.parse(await fs.readFile(path.join(dir,
    'full-color-google-ocr.json'), 'utf8'));
  const page = ocr.responses?.[0]?.fullTextAnnotation?.pages?.[0];
  const imageHash = sha256(await fs.readFile(path.join(colorRoot,
    item.id, 'cloudrun-calendar-color.webp')));
  if (!expected || !page || expected.ocrImageSha256 !== imageHash ||
    expected.ocrImageWidth !== page.width || expected.ocrImageHeight !== page.height) {
    throw new Error(`Source hash/dimensions mismatch: ${item.id}`);
  }
  const paragraphs = [];
  const words = [];
  for (const [bi, block] of (page.blocks || []).entries()) {
    for (const [pi, paragraph] of (block.paragraphs || []).entries()) {
      const record = [];
      for (const [wi, word] of (paragraph.words || []).entries()) {
        const entry = { id: `${bi}:${pi}:${wi}`,
          paragraphId: `${bi}:${pi}`,
          text: (word.symbols || []).map(symbol => symbol.text || '').join(''),
          vertices: word.boundingBox?.vertices || [],
          confidence: word.confidence ?? null };
        record.push(entry); words.push(entry);
      }
      paragraphs.push(record);
    }
  }
  const localization = localizeSourceDateAnchors(words);
  const observations = [];
  for (const paragraph of paragraphs) {
    for (let i = 0; i <= paragraph.length - item.phrase.length; i++) {
      const group = paragraph.slice(i, i + item.phrase.length);
      if (!group.every((word, offset) => normalize(word.text) === item.phrase[offset])) continue;
      const points = group.map(word => center(word.vertices));
      const point = { x: points.reduce((sum, value) => sum + value.x, 0) / points.length,
        y: points.reduce((sum, value) => sum + value.y, 0) / points.length };
      const assignment = localization.associate(point);
      if (observations.some(previous =>
        Math.abs(previous.point.x - point.x) < 20 &&
        Math.abs(previous.point.y - point.y) < 20)) continue;
      observations.push({ phrase: group.map(word => word.text).join(' '), point,
        sourceGalleryIndex: expected.galleryImageIndex,
        wordIds: group.map(word => word.id), assignment,
        date: assignment.day === null ? null :
          `${item.yearMonth}-${String(assignment.day).padStart(2, '0')}` });
    }
  }
  const primaryComparisons = [];
  const nameDisputes = [];
  for (const label of item.primaryLabels) {
    const run = JSON.parse(await fs.readFile(path.join(dir,
      `luna-high-reviewed-${label}.json`), 'utf8'));
    if (item.id === 'photo-04') {
      const found = findSpatialCalendarNameDisputes(run.stage3Items,
        run.frameManifest, new Map([[expected.galleryImageIndex,
          paragraphs.map(record => ({ words: record }))]]));
      for (const dispute of found) {
        const sourceAssignment = localization.associate(center(dispute.ocrVertices));
        nameDisputes.push({ ...dispute, runLabel: label, sourceAssignment,
          modelName: run.stage3Items[dispute.itemIndex]?.name || '',
          modelDate: run.stage3Items[dispute.itemIndex]?.date || '',
          sourceDateAgreesWithModel: sourceAssignment.day !== null &&
            run.stage3Items[dispute.itemIndex]?.date ===
              `${item.yearMonth}-${String(sourceAssignment.day).padStart(2, '0')}`,
          sourceImageSha256: expected.originalImageSha256,
          ocrImageSha256: imageHash, noSourcePerformanceTimeAssigned: true });
      }
      primaryComparisons.push({ label, status: 'coverage_not_performed',
        reason: 'The selected May name phrase is not a complete OCR listing inventory.' });
      continue;
    }
    const primary = run.stage3Items.filter(value =>
      /wing night/i.test(value.name))
      .map(value => ({ sourceGalleryIndex: run.frameManifest
        .find(frame => frame.frameIndex === value.relevantImageIndex)?.sourceGalleryIndex ?? -1,
      date: value.date, phrase: 'wing night' }));
    const source = observations.map((value, index) =>
      ({ sourceGalleryIndex: value.sourceGalleryIndex, date: value.date,
        phrase: 'wing night', evidenceId: `ocr-${index}` }));
    const reconciled = reconcileLocalizedSourcePhrases(source, primary);
    primaryComparisons.push({ label, primaryDates: primary.map(value => value.date),
      unmatchedSourceDates: reconciled.unmatchedSource.map(value => value.date),
      primaryDatesWithoutOcrMatch: reconciled.unmatchedPrimary.map(value => value.date),
      unresolvedSourceOccurrences: reconciled.unresolvedSource.length });
  }
  results.push({ id: item.id, sourceGalleryIndex: expected.galleryImageIndex,
    sourceImageSha256: expected.originalImageSha256, ocrImageSha256: imageHash,
    verifiedYearMonth: item.yearMonth,
    verifiedYearMonthOrigin: 'reviewed poster text and weekday-alignment fixture assumption; no source post recovered',
    anchors: localization.anchors, observations, primaryComparisons,
    nameDisputes });
}
const outputPath = path.join(evidenceRoot, 'ocr-localization-offline.json');
await fs.writeFile(outputPath, JSON.stringify({ noProviderCalls: true,
  noPayloadChanges: true, noPublicationDecision: true, results }, null, 2));
console.log(JSON.stringify({ outputPath, results: results.map(value => ({
  id: value.id,
  supportedAnchors: value.anchors.filter(anchor => anchor.status === 'supported').length,
  conflictingAnchors: value.anchors.filter(anchor => anchor.status === 'conflicting_reading').length,
  observations: value.observations.map(observation =>
    ({ phrase: observation.phrase, date: observation.date, status: observation.assignment.status })),
  primaryComparisons: value.primaryComparisons,
  nameDisputeDays: value.nameDisputes.map(dispute => dispute.sourceAssignment.day),
})) }));
