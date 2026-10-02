/** Conservative OCR date localization for saved-calendar diagnostics.
 * This does not infer years, cell borders, event times, or publication safety.
 */
export interface SourceOcrWord {
  id: string;
  text: string;
  vertices: { x: number; y: number }[];
  confidence: number | null;
  paragraphId: string;
}

export interface SourceDateAnchor {
  wordId: string;
  day: number;
  x: number;
  y: number;
  status: 'supported' | 'unsupported' | 'conflicting_reading' | 'duplicate_reading';
  reason: string;
}

export interface SourceDateAssociation {
  status: 'associated' | 'ambiguous' | 'unsupported';
  day: number | null;
  candidateDays: number[];
  anchorWordIds: string[];
}

export interface SourceDateLocalization {
  anchors: SourceDateAnchor[];
  associate: (point: { x: number; y: number }) => SourceDateAssociation;
}

export interface DatedSourcePhrase {
  sourceGalleryIndex: number;
  date: string | null;
  phrase: string;
  evidenceId: string;
}

export interface DatedPrimaryPhrase {
  sourceGalleryIndex: number;
  date: string;
  phrase: string;
}

/** One-to-one diagnostic matching, including equal-total wrong-date cases. */
export function reconcileLocalizedSourcePhrases(
  source: readonly DatedSourcePhrase[], primary: readonly DatedPrimaryPhrase[]
): { unmatchedSource: DatedSourcePhrase[]; unmatchedPrimary: DatedPrimaryPhrase[];
    unresolvedSource: DatedSourcePhrase[] } {
  const unmatchedPrimary = [...primary];
  const unmatchedSource: DatedSourcePhrase[] = [];
  const unresolvedSource: DatedSourcePhrase[] = [];
  for (const observation of source) {
    if (!observation.date) { unresolvedSource.push(observation); continue; }
    const matchIndex = unmatchedPrimary.findIndex(item =>
      item.sourceGalleryIndex === observation.sourceGalleryIndex &&
      item.date === observation.date && item.phrase === observation.phrase);
    if (matchIndex < 0) unmatchedSource.push(observation);
    else unmatchedPrimary.splice(matchIndex, 1);
  }
  return { unmatchedSource, unmatchedPrimary, unresolvedSource };
}

function midpoint(vertices: SourceOcrWord['vertices']): { x: number; y: number } | null {
  if (vertices.length < 3 || !vertices.every(point =>
    Number.isFinite(point.x) && Number.isFinite(point.y))) return null;
  return { x: vertices.reduce((sum, point) => sum + point.x, 0) / vertices.length,
    y: vertices.reduce((sum, point) => sum + point.y, 0) / vertices.length };
}

function hasVerticalPair(anchor: SourceDateAnchor, candidates: SourceDateAnchor[]): boolean {
  return candidates.some(other => (
    (other.day === anchor.day + 7 && other.y > anchor.y) ||
    (other.day === anchor.day - 7 && other.y < anchor.y)) &&
    Math.abs(other.x - anchor.x) <= 130 &&
    Math.abs(other.y - anchor.y) >= 300 &&
    Math.abs(other.y - anchor.y) <= 750);
}

/**
 * Find local horizontal date sequences corroborated by +7 vertical pairs.
 * Near-identical positions with different digits remain conflicting, even if
 * calendar arithmetic would make one digit look more likely.
 */
export function localizeSourceDateAnchors(words: SourceOcrWord[]): SourceDateLocalization {
  const candidates: SourceDateAnchor[] = [];
  for (const [wordIndex, word] of words.entries()) {
    const point = midpoint(word.vertices);
    if (!point || !/^(?:[1-9]|[12]\d|3[01])$/.test(word.text)) continue;
    const previous = words[wordIndex - 1];
    const priceContext = previous?.paragraphId === word.paragraphId &&
      /^[$¢]$/.test(previous.text);
    candidates.push({ wordId: word.id, day: Number(word.text), ...point,
      status: 'unsupported', reason: priceContext ? 'price_context' :
        'no_supported_local_date_run' });
  }
  for (const anchor of candidates) {
    if (candidates.some(other => other !== anchor && other.day !== anchor.day &&
      Math.abs(other.x - anchor.x) <= 8 && Math.abs(other.y - anchor.y) <= 8)) {
      anchor.status = 'conflicting_reading';
      anchor.reason = 'different_digits_at_same_position';
    }
  }
  for (const [index, anchor] of candidates.entries()) {
    if (anchor.status === 'conflicting_reading') continue;
    if (candidates.slice(0, index).some(other => other.status !== 'conflicting_reading' &&
      other.day === anchor.day && Math.abs(other.x - anchor.x) <= 8 &&
      Math.abs(other.y - anchor.y) <= 8)) {
      anchor.status = 'duplicate_reading';
      anchor.reason = 'same_digit_at_same_position';
    }
  }
  const eligible = candidates.filter(value => value.status === 'unsupported' &&
    value.reason !== 'price_context');
  const supported = new Set<SourceDateAnchor>();
  for (const start of eligible) {
    const run = [start];
    let last = start;
    while (run.length < 8) {
      const options = eligible.filter(next => !run.includes(next) &&
        next.day === last.day + 1 && next.x - last.x >= 80 &&
        next.x - last.x <= 600 && Math.abs(next.y - last.y) <= 80);
      if (options.length !== 1) break;
      run.push(options[0]);
      last = options[0];
    }
    if (run.length < 3 || run.filter(value => hasVerticalPair(value, eligible)).length < 2) continue;
    for (const value of run) supported.add(value);
  }
  for (const anchor of supported) {
    anchor.status = 'supported';
    anchor.reason = 'horizontal_run_with_vertical_pairs';
  }
  return {
    anchors: candidates,
    associate(point) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        return { status: 'unsupported', day: null, candidateDays: [], anchorWordIds: [] };
      }
      const possible = candidates.filter(anchor => {
        if (anchor.status !== 'supported') return false;
        // Even a disputed or unsupported numeric reading blocks expansion
        // across its position. Price tokens and duplicate OCR copies do not.
        const sameRow = candidates.filter(other =>
          other.reason !== 'price_context' &&
          other.status !== 'duplicate_reading' &&
          Math.abs(other.y - anchor.y) <= 80).sort((a, b) => a.x - b.x);
        const right = sameRow.find(other => other.x > anchor.x + 60);
        const left = [...sameRow].reverse().find(other => other.x < anchor.x - 60);
        const width = right ? right.x - anchor.x : left ? anchor.x - left.x : 300;
        const leftEdge = anchor.x - Math.min(30, width * 0.1);
        const rightEdge = right ? right.x - Math.min(30, width * 0.1) : anchor.x + width;
        return point.x >= leftEdge && point.x < rightEdge &&
          anchor.y - point.y >= 10 && anchor.y - point.y <= 330;
      });
      const days = [...new Set(possible.map(value => value.day))];
      return { status: days.length === 1 ? 'associated' :
        days.length > 1 ? 'ambiguous' : 'unsupported',
      day: days.length === 1 ? days[0] : null,
      candidateDays: days, anchorWordIds: possible.map(value => value.wordId) };
    },
  };
}
