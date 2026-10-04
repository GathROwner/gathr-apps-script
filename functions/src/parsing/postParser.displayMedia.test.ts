import test from 'node:test';
import assert from 'node:assert/strict';

import { selectDistinctDisplaySourceImageUrls, resolveFacebookDisplayImageAliases } from './postParser.js';

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

test('maps only uploaded Facebook attachment variants to the same managed image', () => {
  const lower = 'https://scontent.fna.fbcdn.net/v/a.jpg?ctp=p403x403';
  const higher = 'https://scontent.fna.fbcdn.net/v/a.jpg?ctp=p1080x1080';
  const other = 'https://scontent.fna.fbcdn.net/v/b.jpg?ctp=p1080x1080';
  const nonFacebook = 'https://images.example/a.jpg?version=2';
  const selected = selectDistinctDisplaySourceImageUrls([lower, higher, other, nonFacebook]);
  assert.deepEqual(selected, [higher, other, nonFacebook]);
  const aliases = resolveFacebookDisplayImageAliases(
    [lower, higher, other, nonFacebook],
    selected,
    new Map([[higher, 'https://storage.googleapis.com/bucket/a.jpg']])
  );
  assert.deepEqual([...aliases], [
    [lower, 'https://storage.googleapis.com/bucket/a.jpg'],
    [higher, 'https://storage.googleapis.com/bucket/a.jpg'],
  ]);
});
