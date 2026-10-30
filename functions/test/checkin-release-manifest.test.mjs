import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const callables = require('../lib/social/callables.js');
const names = [
  'recordCheckInReadinessSampleCallable',
  'bindCheckInReadinessCallable',
  'createPrivateCheckInPlaceCandidateCallable',
  'discoverNearbyCheckInPlacesCallable',
  'listNearbyCanonicalCheckInVenuesCallable',
];

test('rendered five-function release retains captured capacity and callable settings', () => {
  for (const name of names) {
    // Serializing renders SDK RESET_VALUE objects just like manifest discovery.
    const endpoint = JSON.parse(JSON.stringify(callables[name].__endpoint));
    assert.equal(endpoint.maxInstances, name === names[4] ? null : 20, name);
    assert.equal(endpoint.availableMemoryMb, 256, name);
    assert.equal(endpoint.timeoutSeconds, 30, name);
    assert.deepEqual(endpoint.region, ['northamerica-northeast1'], name);
    assert.equal(endpoint.platform, 'gcfv2', name);
    assert.deepEqual(endpoint.callableTrigger, {}, name);
    assert.equal(endpoint.secretEnvironmentVariables?.length || 0, 0, name);
  }
  // This targeted preservation must not change other exported callable limits.
  assert.equal(JSON.parse(JSON.stringify(callables.createCheckInCallable.__endpoint)).maxInstances, null);
});

test('all five callable handlers reject missing identity before accessing services', async () => {
  for (const name of names) {
    await assert.rejects(callables[name].run({ data: {} }), { code: 'unauthenticated' }, name);
  }
});
