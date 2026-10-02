/** OCR is a second, fallible reading. A near match is a review signal, never a correction. */
export interface CalendarNameDispute {
  itemIndex: number;
  date: string;
  sourceImageIndex: number;
  modelName: string;
  ocrCandidate: string;
  differingModelWord: string;
  differingOcrWord: string;
}

interface DatedNameItem {
  name: string;
  date: string;
  relevantImageIndex?: number;
}

function words(text: string): string[] {
  return String(text || '').match(/[\p{L}\p{N}]+/gu) || [];
}

function comparable(word: string): string {
  return word.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en-CA');
}

function oneCharacterApart(left: string, right: string): boolean {
  if (left.length !== right.length || left.length < 4) return false;
  let differences = 0;
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i] && ++differences > 1) return false;
  }
  return differences === 1;
}

function datedOcrCells(ocrText: string): Map<number, string[]> {
  const result = new Map<number, string[]>();
  let day: number | null = null;
  for (const rawLine of String(ocrText || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^(?:[1-9]|[12]\d|3[01])$/.test(line)) {
      day = Number(line);
      if (!result.has(day)) result.set(day, []);
      else result.set(day, ['__DUPLICATE_DAY__']);
      continue;
    }
    if (day !== null) result.get(day)?.push(line);
  }
  return result;
}

export function findCalendarOcrNameDisputes(
  items: DatedNameItem[],
  ocrText: string
): CalendarNameDispute[] {
  const cells = datedOcrCells(ocrText);
  const disputes: CalendarNameDispute[] = [];
  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) continue;
    const day = Number(item.date.slice(-2));
    const cellLines = cells.get(day);
    if (!cellLines?.length || cellLines.includes('__DUPLICATE_DAY__')) continue;
    const modelWords = words(item.name);
    const ocrWords = words(cellLines.join(' '));
    if (modelWords.length < 3 || ocrWords.length < modelWords.length) continue;
    const hasExactReading = ocrWords.some((_, start) =>
      start + modelWords.length <= ocrWords.length &&
      modelWords.every((word, index) =>
        comparable(word) === comparable(ocrWords[start + index]))
    );
    if (hasExactReading) continue;
    for (let start = 0; start <= ocrWords.length - modelWords.length; start++) {
      const candidate = ocrWords.slice(start, start + modelWords.length);
      const mismatches = modelWords.map((modelWord, i) =>
        comparable(modelWord) === comparable(candidate[i]) ? -1 : i
      ).filter(i => i >= 0);
      if (mismatches.length !== 1) continue;
      const difference = mismatches[0];
      if (!/^\p{Lu}/u.test(modelWords[difference]) ||
          !/^\p{Lu}/u.test(candidate[difference]) ||
          !oneCharacterApart(comparable(modelWords[difference]), comparable(candidate[difference]))) continue;
      disputes.push({
        itemIndex,
        date: item.date,
        sourceImageIndex: Number.isInteger(item.relevantImageIndex) ? Number(item.relevantImageIndex) : -1,
        modelName: item.name,
        ocrCandidate: candidate.join(' '),
        differingModelWord: modelWords[difference],
        differingOcrWord: candidate[difference],
      });
      break;
    }
  }
  return disputes;
}

/** A diagnostic from OCR word positions. It never rewrites a model title. */
export interface SpatialOcrWord {
  text: string;
  vertices: { x: number; y: number }[];
  confidence: number | null;
}

export interface SpatialOcrParagraph {
  words: SpatialOcrWord[];
}

export interface SpatialCalendarFrame {
  frameIndex: number;
  sourceGalleryIndex: number;
  region: { left: number; top: number; width: number; height: number };
}

export interface SpatialNameDispute {
  kind: 'name_disagreement';
  itemIndex: number;
  date: string;
  sourceGalleryIndex: number;
  frameIndex: number;
  modelWord: string;
  ocrWord: string;
  sharedAnchors: string[];
  ocrVertices: SpatialOcrWord['vertices'];
  ocrConfidence: number | null;
}

function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1,
        previous[j - 1] + Number(a[i - 1] !== b[j - 1]));
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[b.length];
}

function insideRegion(word: SpatialOcrWord, region: SpatialCalendarFrame['region']): boolean {
  if (word.vertices.length < 3 || !word.vertices.every(point =>
    Number.isFinite(point.x) && Number.isFinite(point.y))) return false;
  const centerX = word.vertices.reduce((sum, point) => sum + point.x, 0) / word.vertices.length;
  const centerY = word.vertices.reduce((sum, point) => sum + point.y, 0) / word.vertices.length;
  return centerX >= region.left && centerX <= region.left + region.width &&
    centerY >= region.top && centerY <= region.top + region.height;
}

/**
 * Compare a model title with OCR text from the same original image and frame.
 * Two other shared name words are required, so an isolated fuzzy word never
 * creates a confirmed dispute. The result is review evidence, not a correction
 * or a statement that other titles are complete.
 */
export function findSpatialCalendarNameDisputes(
  items: DatedNameItem[],
  frames: SpatialCalendarFrame[],
  paragraphsBySource: Map<number, SpatialOcrParagraph[]>
): SpatialNameDispute[] {
  const disputes: SpatialNameDispute[] = [];
  const seen = new Set<string>();
  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) continue;
    const frame = frames.find(value => value.frameIndex === item.relevantImageIndex);
    if (!frame || frame.sourceGalleryIndex < 0) continue;
    const modelWords = words(item.name).map(value => ({ raw: value, normalized: comparable(value) }));
    if (modelWords.length < 3) continue;
    for (const paragraph of paragraphsBySource.get(frame.sourceGalleryIndex) || []) {
      const local = paragraph.words.filter(word => insideRegion(word, frame.region));
      if (local.length < 3) continue;
      const ocrWords = local.map(value => ({ ...value, normalized: comparable(value.text) }));
      const sharedAnchors = [...new Set(ocrWords.map(value => value.normalized)
        .filter(value => value.length >= 3 && modelWords.some(model => model.normalized === value)))];
      if (sharedAnchors.length < 2) continue;
      for (const ocr of ocrWords) {
        if (ocr.normalized.length < 5 || modelWords.some(model => model.normalized === ocr.normalized)) continue;
        const candidates = modelWords.filter(model => model.normalized.length >= 5 &&
          model.normalized.slice(0, 3) === ocr.normalized.slice(0, 3) &&
          editDistance(model.normalized, ocr.normalized) <= 4 &&
          editDistance(model.normalized, ocr.normalized) / Math.max(model.normalized.length,
            ocr.normalized.length) <= 0.35);
        if (candidates.length !== 1) continue;
        const model = candidates[0];
        const key = `${itemIndex}|${frame.sourceGalleryIndex}|${model.normalized}|${ocr.normalized}`;
        if (seen.has(key)) continue;
        seen.add(key);
        disputes.push({ kind: 'name_disagreement', itemIndex, date: item.date,
          sourceGalleryIndex: frame.sourceGalleryIndex, frameIndex: frame.frameIndex,
          modelWord: model.raw, ocrWord: ocr.text, sharedAnchors,
          ocrVertices: ocr.vertices, ocrConfidence: ocr.confidence });
      }
    }
  }
  return disputes;
}
