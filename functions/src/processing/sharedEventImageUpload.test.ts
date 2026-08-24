import assert from 'node:assert/strict';
import test from 'node:test';

import { parseSharedEventImageUpload } from './sharedEventImageUpload.js';

test('accepts the durable native binary image upload contract', () => {
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const result = parseSharedEventImageUpload({
    body: bytes,
    rawBody: bytes,
    contentTypeHeader: 'image/png',
    fileNameHeader: 'route-poster.png',
  });

  assert.equal(result.contentType, 'image/png');
  assert.equal(result.fileName, 'route-poster.png');
  assert.deepEqual(result.buffer, bytes);
});

test('keeps the legacy JSON base64 upload contract working', () => {
  const bytes = Buffer.from('synthetic-poster');
  const result = parseSharedEventImageUpload({
    body: {
      contentType: 'image/jpeg',
      fileName: 'multi-location.jpg',
      base64Data: `data:image/jpeg;base64,${bytes.toString('base64')}`,
    },
    contentTypeHeader: 'application/json; charset=utf-8',
  });

  assert.equal(result.contentType, 'image/jpeg');
  assert.equal(result.fileName, 'multi-location.jpg');
  assert.deepEqual(result.buffer, bytes);
});

test('rejects an empty binary image request', () => {
  assert.throws(() => parseSharedEventImageUpload({
    body: Buffer.alloc(0),
    rawBody: Buffer.alloc(0),
    contentTypeHeader: 'image/png',
  }), /Missing image data/);
});

test('rejects non-image payloads', () => {
  assert.throws(() => parseSharedEventImageUpload({
    body: Buffer.from('not an image'),
    rawBody: Buffer.from('not an image'),
    contentTypeHeader: 'application/octet-stream',
  }), /Only image uploads are supported/);
});
