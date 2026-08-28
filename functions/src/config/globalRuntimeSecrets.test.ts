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

test('binds collision-free runtime secrets to every exported Gen 2 Cloud Function', () => {
  // Firebase's Gen 1 Auth trigger builds its resource name lazily and therefore
  // needs a project ID even when a test only inspects endpoint metadata.
  const previousProjectId = process.env.GCLOUD_PROJECT;
  process.env.GCLOUD_PROJECT ||= 'demo-gathr-social';

  const endpoints = Object.entries(exportedFunctions)
    .map(([name, value]) => [name, (value as { __endpoint?: unknown })?.__endpoint] as const)
    .filter(([, endpoint]) => Boolean(endpoint));

  assert.ok(endpoints.length > 0);
  for (const [name, rawEndpoint] of endpoints) {
    const endpoint = rawEndpoint as {
      platform?: string;
      eventTrigger?: { eventType?: string };
      secretEnvironmentVariables?: Array<{ key?: string }>;
    };

    // Auth user lifecycle triggers only exist on Gen 1 and cannot inherit the
    // Gen 2 global secret binding. This cleanup trigger does not read secrets.
    if (
      endpoint.platform === 'gcfv1'
      && endpoint.eventTrigger?.eventType === 'providers/firebase.auth/eventTypes/user.delete'
    ) {
      assert.deepEqual(endpoint.secretEnvironmentVariables || [], []);
      continue;
    }

    const keys = (endpoint.secretEnvironmentVariables || []).map((entry) => entry.key);
    for (const requiredSecret of coreRuntimeSecrets) {
      assert.ok(keys.includes(requiredSecret), `${name} is missing ${requiredSecret}`);
    }
    assert.equal(keys.includes('OPENAI_API_KEY'), false, `${name} still binds OPENAI_API_KEY`);
    assert.equal(keys.includes('APIFY_TOKEN'), false, `${name} still binds APIFY_TOKEN`);
  }

  if (previousProjectId === undefined) delete process.env.GCLOUD_PROJECT;
  else process.env.GCLOUD_PROJECT = previousProjectId;
});
