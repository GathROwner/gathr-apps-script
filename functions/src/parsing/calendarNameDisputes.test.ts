import test from 'node:test';
import assert from 'node:assert/strict';
import { findCalendarOcrNameDisputes } from './calendarNameDisputes.js';

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
