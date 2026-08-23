import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeExpectedSharedEventUploadIds,
  normalizeSharedEventUploadId,
  sharedEventClientIngestId,
  sharedEventUploadPath,
  sharedEventUploadsReady,
} from '../utils/sharedEventUpload.js';

test('accepts only bounded upload ids safe for storage paths', () => {
  assert.equal(normalizeSharedEventUploadId('share_abc-12345678'), 'share_abc-12345678');
  assert.equal(normalizeSharedEventUploadId('../unsafe'), undefined);
  assert.equal(normalizeSharedEventUploadId('short'), undefined);
});

test('creates a stable per-user ingest id for retry-safe submissions', () => {
  const first = sharedEventClientIngestId('user-123', 'share_abc-12345678');
  assert.equal(first, sharedEventClientIngestId('user-123', 'share_abc-12345678'));
  assert.notEqual(first, sharedEventClientIngestId('user-456', 'share_abc-12345678'));
  assert.match(first || '', /^client-[a-f0-9]{40}$/);
});

test('uses an idempotent storage path when the client supplies an upload id', () => {
  const params = {
    ownerUid: 'user-123',
    uploadId: 'share_abc-12345678',
    fileName: 'poster.jpg',
  };
  assert.equal(
    sharedEventUploadPath(params),
    'sharedEventUploads/user-123/share_abc-12345678-poster.jpg'
  );
  assert.equal(sharedEventUploadPath(params), sharedEventUploadPath(params));
});

test('prepared uploads accept only bounded ids owned by the client submission', () => {
  assert.deepEqual(
    normalizeExpectedSharedEventUploadIds('share_abc-12345678', [
      'share_abc-12345678_0',
      'share_abc-12345678_1',
      'share_abc-12345678_1',
    ]),
    ['share_abc-12345678_0', 'share_abc-12345678_1']
  );
  assert.deepEqual(
    normalizeExpectedSharedEventUploadIds('share_abc-12345678', ['another_share_12345678_0']),
    []
  );
});

test('prepared uploads become ready only after every expected receipt exists', () => {
  assert.equal(sharedEventUploadsReady(['upload_12345678_0'], []), false);
  assert.equal(sharedEventUploadsReady(
    ['upload_12345678_0', 'upload_12345678_1'],
    ['upload_12345678_1', 'upload_12345678_0']
  ), true);
});
