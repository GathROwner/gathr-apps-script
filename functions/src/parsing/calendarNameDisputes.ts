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
