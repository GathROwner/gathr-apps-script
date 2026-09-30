import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { prepareCalendarBandFrames } from './postParser.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l2cAAAAASUVORK5CYII=',
  'base64'
);

test('four-band upload preserves the versioned crop manifest and returns four model frames', async () => {
  let origin = '';
  let uploadBody = '';
  const server = http.createServer(async (request, response) => {
    if (request.method === 'GET') {
      response.writeHead(200, { 'Content-Type': 'image/png' });
      response.end(png);
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    uploadBody = Buffer.concat(chunks).toString('latin1');
    const baseImageUrl = `${origin}/base`;
    const regions = Array.from({ length: 4 }, (_, index) => ({
      index, left: 0, top: index * 300, width: 1200, height: 360,
      imageUrl: `${origin}/band-${index + 1}`,
    }));
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      imageUrl: baseImageUrl,
      imageUrls: [baseImageUrl, ...regions.map(region => region.imageUrl)],
      bandManifest: {
        version: 'calendar-bands-v1', eligible: true,
        baseImageUrl, width: 1200, height: 1600, regions,
      },
    }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  origin = `http://127.0.0.1:${address.port}`;
  const oldUpload = process.env.IMAGE_UPLOAD_URL;
  const oldDelete = process.env.IMAGE_DELETE_URL;
  process.env.IMAGE_UPLOAD_URL = `${origin}/upload-image`;
  delete process.env.IMAGE_DELETE_URL;
  try {
    const result = await prepareCalendarBandFrames(
      `${origin}/source`,
      { left: 0, top: 100, width: 1200, height: 1400 },
      [430, 780, 1130],
      { postId: 'protocol-test' }
    );
    assert.ok(result);
    assert.equal(result.imageUrls.length, 4);
    assert.ok(result.imageUrls.every(url => url.startsWith('data:image/png;base64,')));
    assert.equal(result.uploadedUrls.length, 5);
    assert.equal(result.regions[3].top, 900);
    assert.match(uploadBody, /calendar-bands-v1/);
    assert.match(uploadBody, /bandCrop/);
    assert.match(uploadBody, /bandCuts/);
  } finally {
    if (oldUpload === undefined) delete process.env.IMAGE_UPLOAD_URL;
    else process.env.IMAGE_UPLOAD_URL = oldUpload;
    if (oldDelete === undefined) delete process.env.IMAGE_DELETE_URL;
    else process.env.IMAGE_DELETE_URL = oldDelete;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
