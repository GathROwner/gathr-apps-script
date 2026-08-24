import assert from 'node:assert/strict';
import test from 'node:test';

import * as exportedFunctions from '../index.js';
import {
  applyRuntimeSecretAliases,
  coreRuntimeSecrets,
  runtimeSecretNamesForProject,
} from './globalRuntimeSecrets.js';

test('uses each Firebase project existing Secret Manager contract', () => {
  assert.deepEqual(runtimeSecretNamesForProject('gathr-m1'), ['OPENAI_API_KEY', 'APIFY_TOKEN']);
  assert.deepEqual(runtimeSecretNamesForProject('gathr-migrated'), [
    'GATHR_OPENAI_API_KEY',
    'GATHR_APIFY_TOKEN',
  ]);
});

test('maps collision-free runtime secrets to the established environment names', () => {
  const env: NodeJS.ProcessEnv = {
    GATHR_OPENAI_API_KEY: 'openai-test-value',
    GATHR_APIFY_TOKEN: 'apify-test-value',
  };

  applyRuntimeSecretAliases(env);

  assert.equal(env.OPENAI_API_KEY, 'openai-test-value');
  assert.equal(env.APIFY_TOKEN, 'apify-test-value');
});

test('binds collision-free runtime secrets to every exported Cloud Function', () => {
  const endpoints = Object.entries(exportedFunctions)
    .filter(([, value]) => Boolean((value as { __endpoint?: unknown })?.__endpoint));

  assert.ok(endpoints.length > 0);
  for (const [name, value] of endpoints) {
    const endpoint = (value as {
      __endpoint: { secretEnvironmentVariables?: Array<{ key?: string }> };
    }).__endpoint;
    const keys = (endpoint.secretEnvironmentVariables || []).map((entry) => entry.key);
    for (const requiredSecret of coreRuntimeSecrets) {
      assert.ok(keys.includes(requiredSecret), `${name} is missing ${requiredSecret}`);
    }
    assert.equal(keys.includes('OPENAI_API_KEY'), false, `${name} still binds OPENAI_API_KEY`);
    assert.equal(keys.includes('APIFY_TOKEN'), false, `${name} still binds APIFY_TOKEN`);
  }
});
