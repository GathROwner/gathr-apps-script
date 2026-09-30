import test from 'node:test';
import assert from 'node:assert/strict';

import { selectDistinctDisplaySourceImageUrls } from './postParser.js';

test('keeps only the highest resolution Facebook CDN variant of one attachment', () => {
  const lowResolution = 'https://scontent.fyhz1-1.fna.fbcdn.net/v/t39.30808-6/123456_abcdef.jpg?stp=dst-jpg_p526x296&_nc_cat=1';
  const highResolution = 'https://scontent.fyhz1-1.fna.fbcdn.net/v/t39.30808-6/123456_abcdef.jpg?stp=dst-jpg_p960x540&_nc_cat=1';

  assert.deepEqual(selectDistinctDisplaySourceImageUrls([
    lowResolution,
    highResolution,
    'https://scontent.fyhz1-1.fna.fbcdn.net/v/t39.30808-6/different_page.jpg?stp=dst-jpg_p960x540',
  ]), [
    highResolution,
    'https://scontent.fyhz1-1.fna.fbcdn.net/v/t39.30808-6/different_page.jpg?stp=dst-jpg_p960x540',
  ]);
});

test('does not collapse different non-Facebook URLs that may have meaningful queries', () => {
  assert.deepEqual(selectDistinctDisplaySourceImageUrls([
    'https://images.example/flyer.jpg?version=front',
    'https://images.example/flyer.jpg?version=back',
  ]), [
    'https://images.example/flyer.jpg?version=front',
    'https://images.example/flyer.jpg?version=back',
  ]);
});
