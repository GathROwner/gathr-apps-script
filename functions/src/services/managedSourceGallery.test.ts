import test from 'node:test';
import assert from 'node:assert/strict';
import { selectRecoverableManagedGallery } from './managedSourceGallery.js';

const source = [
  'https://scontent-a.fbcdn.net/v/t39/photo-one.jpg?old=1',
  'https://scontent-b.fbcdn.net/v/t39/photo-two.jpg?old=1',
];
const managed = [
  'https://storage.googleapis.com/gathr-uploaded-images/postimages/one.webp',
  'https://storage.googleapis.com/gathr-uploaded-images/postimages/two.webp',
];

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: 'saved-parse', createdAtMs: 10, uniqueId: 'post-123',
    rowMeta: { mediaUrls: source },
    stages: [{ output: { events: [{ imageProvenance: { media: managed.map(url =>
      ({ field: 'mediaUrls', source: 'post_media', url })) } }] } }],
    ...overrides,
  };
}

test('recovers a complete ordered gallery across changed Facebook CDN hosts and tokens', () => {
  const current = [
    'https://scontent-other.fbcdn.net/v/t39/photo-one.jpg?new=2',
    'https://scontent-other.fbcdn.net/v/t39/photo-two.jpg?new=2',
  ];
  assert.deepEqual(selectRecoverableManagedGallery([snapshot()], 'post-123', current),
    { urls: managed, snapshotId: 'saved-parse' });
});

test('refuses changed order, incomplete gallery, wrong post, or conflicting saved provenance', () => {
  assert.equal(selectRecoverableManagedGallery([snapshot()], 'post-123', [...source].reverse()), null);
  assert.equal(selectRecoverableManagedGallery([snapshot()], 'post-123', source.slice(0, 1)), null);
  assert.equal(selectRecoverableManagedGallery([snapshot()], 'another-post', source), null);
  const disputed = snapshot({ stages: [{ output: { events: [
    { imageProvenance: { media: managed.map(url =>
      ({ field: 'mediaUrls', source: 'post_media', url })) } },
    { imageProvenance: { media: [...managed].reverse().map(url =>
      ({ field: 'mediaUrls', source: 'post_media', url })) } },
  ] } }] });
  assert.equal(selectRecoverableManagedGallery([disputed], 'post-123', source), null);
});

test('refuses an untrusted or truncated managed gallery', () => {
  const unsafe = snapshot({ stages: [{ output: { events: [{ imageProvenance: { media: [
    { field: 'mediaUrls', source: 'post_media', url: managed[0] },
    { field: 'mediaUrls', source: 'post_media', url: 'https://example.com/two.webp' },
  ] } }] } }] });
  assert.equal(selectRecoverableManagedGallery([unsafe], 'post-123', source), null);
});
