import assert from 'node:assert/strict';
import test from 'node:test';

import { prepareManagedProfileIconUrlForRegression } from './postParser.js';

test('downloads the Facebook profile image and uploads it to GCS before returning the app image URL', async () => {
  const facebookProfileUrl =
    'https://scontent.xx.fbcdn.net/profile/olde-dublin-recovery-test.jpg';
  const uploadEndpoint = 'https://test-upload.invalid/upload-image';
  const uploadedGcsUrl =
    'https://storage.googleapis.com/gathr-uploaded-images/profilepictures/olde-dublin-recovery-test.webp';
  const originalFetch = globalThis.fetch;
  const previousUploadUrl = process.env.IMAGE_UPLOAD_URL;
  const calls: string[] = [];
  let capturedUploadForm: FormData | undefined;

  process.env.IMAGE_UPLOAD_URL = uploadEndpoint;
  globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
    const [input, init] = args;
    const url = String(input);
    calls.push(url);

    if (url === facebookProfileUrl) {
      assert.equal(init?.method, 'GET');
      return new Response(new Uint8Array([255, 216, 255]), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      });
    }

    if (url === uploadEndpoint) {
      assert.equal(init?.method, 'POST');
      assert.ok(init?.body instanceof FormData);
      capturedUploadForm = init.body as FormData;
      return new Response(JSON.stringify({ imageUrl: uploadedGcsUrl }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    throw new Error(`Unexpected request in upload test: ${url}`);
  }) as typeof fetch;

  try {
    const prepared = await prepareManagedProfileIconUrlForRegression(
      facebookProfileUrl,
      { postId: 'olde-dublin-recovery-test' }
    );

    assert.deepEqual(calls, [facebookProfileUrl, uploadEndpoint]);
    assert.ok(capturedUploadForm);
    assert.equal(capturedUploadForm.get('folder'), 'profilepictures');
    assert.equal(capturedUploadForm.get('ocr'), 'false');
    assert.equal(prepared.url, uploadedGcsUrl);
    assert.equal(prepared.createdForThisParse, true);
    assert.ok(prepared.url.startsWith('https://storage.googleapis.com/gathr-uploaded-images/'));
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUploadUrl === undefined) {
      delete process.env.IMAGE_UPLOAD_URL;
    } else {
      process.env.IMAGE_UPLOAD_URL = previousUploadUrl;
    }
  }
});
