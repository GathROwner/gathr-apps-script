import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const projectId = process.argv[2];
const location = process.argv[3] || 'northamerica-northeast1';
assert.ok(projectId, 'Usage: node run-production-social-venue-mirror.mjs <projectId> [location]');
assert.equal(
  process.env.ALLOW_PRODUCTION_SOCIAL_VENUE_MIRROR,
  'YES_I_UNDERSTAND',
  'Set ALLOW_PRODUCTION_SOCIAL_VENUE_MIRROR=YES_I_UNDERSTAND to run the production job.'
);

const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
const config = JSON.parse(await readFile(configPath, 'utf8'));
const accessToken = config.tokens?.access_token;
assert.ok(accessToken, 'Firebase CLI access token is unavailable.');

const parent = `projects/${projectId}/locations/${location}`;
const listResponse = await fetch(
  `https://cloudscheduler.googleapis.com/v1/${parent}/jobs`,
  { headers: { Authorization: `Bearer ${accessToken}` } }
);
if (!listResponse.ok) {
  throw new Error(`Cloud Scheduler list failed (${listResponse.status}): ${await listResponse.text()}`);
}
const listPayload = await listResponse.json();
const matches = (Array.isArray(listPayload.jobs) ? listPayload.jobs : []).filter((job) =>
  typeof job.name === 'string'
  && job.name.toLowerCase().includes('scheduledsocialvenuemirror')
);
assert.equal(matches.length, 1, `Expected one venue-mirror Scheduler job, found ${matches.length}.`);

const runResponse = await fetch(
  `https://cloudscheduler.googleapis.com/v1/${matches[0].name}:run`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  }
);
if (!runResponse.ok) {
  throw new Error(`Cloud Scheduler run failed (${runResponse.status}): ${await runResponse.text()}`);
}

console.log(`job=${matches[0].name}`);
console.log('run_requested=true');
