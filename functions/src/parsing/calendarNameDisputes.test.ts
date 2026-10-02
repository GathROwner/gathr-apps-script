import test from 'node:test';
import assert from 'node:assert/strict';
import { findCalendarOcrNameDisputes, findSpatialCalendarNameDisputes,
  type SpatialOcrParagraph } from './calendarNameDisputes.js';

test('flags a one-letter proper-name disagreement on the same printed date', () => {
  const items = [{ name: 'Island Jazz: Flamenco ft. Iván Garnica & Friends',
    date: '2026-09-10', relevantImageIndex: 0 }];
  const ocr = '9\nOpen Mic\n10\nIsland Jazz:\nFlamenco ft. Iván\nGarmica & Friends\n8PM\n11\nHuman Missile';
  assert.deepEqual(findCalendarOcrNameDisputes(items, ocr), [{
    itemIndex: 0, date: '2026-09-10', sourceImageIndex: 0,
    modelName: items[0].name, ocrCandidate: 'Island Jazz Flamenco ft Iván Garmica Friends',
    differingModelWord: 'Garnica', differingOcrWord: 'Garmica',
  }]);
  assert.equal(items[0].name, 'Island Jazz: Flamenco ft. Iván Garnica & Friends');
});

test('does not flag exact agreement, unrelated names, or a duplicated day number', () => {
  const item = [{ name: 'Island Jazz: Flamenco ft. Iván Garnica & Friends',
    date: '2026-09-10', relevantImageIndex: 0 }];
  assert.deepEqual(findCalendarOcrNameDisputes(item,
    '10\nIsland Jazz: Flamenco ft. Iván Garnica & Friends'), []);
  assert.deepEqual(findCalendarOcrNameDisputes(item,
    '10\nIsland Jazz: Flamenco ft. Iván Garmica & Friends\nIsland Jazz: Flamenco ft. Iván Garnica & Friends'), []);
  assert.deepEqual(findCalendarOcrNameDisputes(item,
    '10\nCompletely unrelated event'), []);
  assert.deepEqual(findCalendarOcrNameDisputes(item,
    '10\nIsland Jazz: Flamenco ft. Iván Garmica & Friends\n10\nAnother month'), []);
});

test('spatial OCR flags a name dispute in the same source band without changing an item', () => {
  const item = { name: 'TOM PETTY & THE HEARTBREAKERS (Tom Petty Tribute)',
    date: '2026-05-30', relevantImageIndex: 4 };
  const word = (text: string, x: number) => ({ text, confidence: 0.85,
    vertices: [{ x, y: 90 }, { x: x + 20, y: 90 },
      { x: x + 20, y: 110 }, { x, y: 110 }] });
  const paragraphs: SpatialOcrParagraph[] = [{ words: [word('THE', 10),
    word('HEARTFAKERS', 40), word('Tom', 80), word('Petty', 110),
    word('Tribute', 140)] }];
  const frame = { frameIndex: 4, sourceGalleryIndex: 1,
    region: { left: 0, top: 0, width: 200, height: 200 } };
  const result = findSpatialCalendarNameDisputes([item], [frame],
    new Map([[1, paragraphs]]));
  assert.equal(result.length, 1);
  assert.equal(result[0].kind, 'name_disagreement');
  assert.equal(result[0].modelWord, 'HEARTBREAKERS');
  assert.equal(result[0].ocrWord, 'HEARTFAKERS');
  assert.equal(result[0].sourceGalleryIndex, 1);
  assert.equal(item.name, 'TOM PETTY & THE HEARTBREAKERS (Tom Petty Tribute)');
  assert.deepEqual(findSpatialCalendarNameDisputes([item], [frame],
    new Map([[0, paragraphs]])), []);
  assert.deepEqual(findSpatialCalendarNameDisputes([item], [{ ...frame,
    region: { left: 0, top: 300, width: 200, height: 200 } }],
  new Map([[1, paragraphs]])), []);
});

test('spatial OCR avoids lone fuzzy words and exact agreements', () => {
  const word = (text: string) => ({ text, confidence: 0.9,
    vertices: [{ x: 0, y: 0 }, { x: 20, y: 0 },
      { x: 20, y: 20 }, { x: 0, y: 20 }] });
  const frame = [{ frameIndex: 0, sourceGalleryIndex: 0,
    region: { left: 0, top: 0, width: 100, height: 100 } }];
  const items = [{ name: 'Liam & Adam', date: '2026-05-01', relevantImageIndex: 0 }];
  assert.deepEqual(findSpatialCalendarNameDisputes(items, frame,
    new Map([[0, [{ words: [word('Liam'), word('Adan')] }]]])), []);
  assert.deepEqual(findSpatialCalendarNameDisputes(items, frame,
    new Map([[0, [{ words: [word('Liam'), word('Adam'), word('Live')] }]]])), []);
});
