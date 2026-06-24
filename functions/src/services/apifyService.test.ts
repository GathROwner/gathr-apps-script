import assert from 'node:assert/strict';
import test from 'node:test';

import { startActorRunNoWait } from './apifyService.js';

test('startActorRunNoWait attaches ad-hoc webhook definitions to Apify actor runs', async (t) => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = '';
  let capturedBody = '';

  globalThis.fetch = (async (input, init) => {
    capturedUrl = String(input);
    capturedBody = String(init?.body || '');
    return new Response(JSON.stringify({
      data: {
        id: 'run-123',
        defaultDatasetId: 'dataset-123',
      },
    }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const webhook = {
    eventTypes: ['ACTOR.RUN.SUCCEEDED'],
    requestUrl: 'https://northamerica-northeast2-gathr-m1.cloudfunctions.net/apifyWebhook',
    idempotencyKey: 'shared-event-scrape-test',
  };

  const result = await startActorRunNoWait(
    'KoJrdxJCTtpon81KY',
    'token value',
    { startUrls: [{ url: 'https://www.facebook.com/example/posts/123' }] },
    { webhooks: [webhook] }
  );

  assert.equal(result.actorRunId, 'run-123');
  assert.equal(result.datasetId, 'dataset-123');

  const url = new URL(capturedUrl);
  assert.equal(url.searchParams.get('token'), 'token value');
  assert.equal(url.searchParams.get('waitForFinish'), '0');
  assert.equal(
    capturedBody,
    JSON.stringify({ startUrls: [{ url: 'https://www.facebook.com/example/posts/123' }] })
  );

  const encodedWebhooks = url.searchParams.get('webhooks');
  assert.ok(encodedWebhooks);
  assert.deepEqual(
    JSON.parse(Buffer.from(encodedWebhooks, 'base64').toString('utf8')),
    [webhook]
  );
});
