import test from 'node:test';
import assert from 'node:assert/strict';
import { localizeSourceDateAnchors, reconcileLocalizedSourcePhrases,
  type SourceOcrWord } from './calendarSourceLocalization.js';

const word = (id: string, text: string, x: number, y: number): SourceOcrWord => ({
  id, text, confidence: 0.9, paragraphId: id,
  vertices: [{ x: x - 10, y: y - 10 }, { x: x + 10, y: y - 10 },
    { x: x + 10, y: y + 10 }, { x: x - 10, y: y + 10 }],
});

test('accepts locally corroborated date runs while rejecting price digits', () => {
  const source = [3, 4, 5, 10, 11, 12].map((day, index) =>
    word(`day-${day}`, String(day), 100 + (index % 3) * 300,
      index < 3 ? 500 : 1000));
  source.push({ ...word('currency', '$', 180, 250), paragraphId: 'price' },
    { ...word('price-three', '3', 200, 250), paragraphId: 'price' });
  const localized = localizeSourceDateAnchors(source);
  assert.equal(localized.anchors.find(value => value.wordId === 'day-3')?.status, 'supported');
  assert.equal(localized.anchors.find(value => value.wordId === 'price-three')?.status,
    'unsupported');
  assert.equal(localized.anchors.find(value => value.wordId === 'price-three')?.reason,
    'price_context');
  assert.deepEqual(localized.associate({ x: 240, y: 370 }), {
    status: 'associated', day: 3, candidateDays: [3], anchorWordIds: ['day-3'],
  });
  assert.equal(localized.associate({ x: 1500, y: 370 }).status, 'unsupported');
});

test('preserves conflicting digit readings and folds identical duplicate readings', () => {
  const source = [24, 25, 26, 31].map((day, index) =>
    word(`day-${day}`, String(day), 100 + (index % 3) * 300,
      index === 3 ? 1000 : 500));
  source.push(word('day-25-copy', '25', 400, 500));
  source.push(word('day-27-conflict', '27', 700, 500));
  source.push(word('day-17', '17', 100, 0), word('day-18', '18', 400, 0),
    word('day-19', '19', 700, 0));
  const localized = localizeSourceDateAnchors(source);
  assert.equal(localized.anchors.find(value => value.wordId === 'day-25-copy')?.status,
    'duplicate_reading');
  assert.equal(localized.anchors.find(value => value.wordId === 'day-26')?.status,
    'conflicting_reading');
  assert.equal(localized.anchors.find(value => value.wordId === 'day-27-conflict')?.status,
    'conflicting_reading');
  assert.equal(localized.associate({ x: 800, y: 350 }).status, 'unsupported');
});

test('does not infer a date from an isolated numeral or missing vertical support', () => {
  const localized = localizeSourceDateAnchors([word('one', '1', 100, 500),
    word('two', '2', 400, 500), word('three', '3', 700, 500)]);
  assert.equal(localized.anchors.every(value => value.status === 'unsupported'), true);
  assert.equal(localized.associate({ x: 250, y: 350 }).status, 'unsupported');
});

test('one-to-one matching exposes equal-total wrong-date and cross-gallery differences', () => {
  const source = [{ sourceGalleryIndex: 1, date: '2026-02-03',
    phrase: 'wing night', evidenceId: 'cell-3' },
  { sourceGalleryIndex: 1, date: '2026-02-10',
    phrase: 'wing night', evidenceId: 'cell-10' },
  { sourceGalleryIndex: 1, date: null,
    phrase: 'wing night', evidenceId: 'uncertain' }];
  const primary = [{ sourceGalleryIndex: 1, date: '2026-02-10', phrase: 'wing night' },
    { sourceGalleryIndex: 1, date: '2026-02-17', phrase: 'wing night' },
    { sourceGalleryIndex: 0, date: '2026-02-03', phrase: 'wing night' }];
  const result = reconcileLocalizedSourcePhrases(source, primary);
  assert.deepEqual(result.unmatchedSource.map(item => item.evidenceId), ['cell-3']);
  assert.deepEqual(result.unmatchedPrimary.map(item =>
    `${item.sourceGalleryIndex}:${item.date}`), ['1:2026-02-17', '0:2026-02-03']);
  assert.deepEqual(result.unresolvedSource.map(item => item.evidenceId), ['uncertain']);
});

test('a conflicting date cell is a barrier between otherwise supported runs', () => {
  const top = [1, 2, 3, 5, 6, 7].map(day =>
    word(`top-${day}`, String(day), 100 + (day - 1) * 300, 500));
  const bottom = [8, 9, 10, 12, 13, 14].map(day =>
    word(`bottom-${day}`, String(day), 100 + (day - 8) * 300, 1000));
  const localized = localizeSourceDateAnchors([...top, ...bottom,
    word('four', '4', 1000, 500), word('thirty-one', '31', 1000, 500)]);
  assert.equal(localized.anchors.find(value => value.wordId === 'top-3')?.status,
    'supported');
  assert.equal(localized.anchors.find(value => value.wordId === 'top-5')?.status,
    'supported');
  assert.equal(localized.anchors.find(value => value.wordId === 'four')?.status,
    'conflicting_reading');
  assert.equal(localized.associate({ x: 1100, y: 350 }).status, 'unsupported');
});

test('a reversed week cannot corroborate a date row', () => {
  const top = [10, 11, 12].map((day, index) =>
    word(`top-${day}`, String(day), 100 + index * 300, 500));
  const bottom = [3, 4, 5].map((day, index) =>
    word(`bottom-${day}`, String(day), 100 + index * 300, 1000));
  assert.equal(localizeSourceDateAnchors([...top, ...bottom]).anchors
    .some(value => value.status === 'supported'), false);
});
