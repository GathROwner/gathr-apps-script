#!/usr/bin/env node

import { execSync } from 'node:child_process';

const DEFAULT_PROJECT = 'gathr-migrated';
const SERVICES = [
  { name: 'processdataset', region: 'northamerica-northeast2' },
  { name: 'processdatasetresume', region: 'northamerica-northeast1' },
  { name: 'processdatasetselectedrows', region: 'northamerica-northeast1' },
];

const REQUIRED_ENV = {
  ENABLE_STAGE2_SCORE_ROUTING: 'true',
  ENABLE_STAGE2_SCORE_SHADOW_LOG: 'true',
  STAGE2_CALENDAR_SCORE_MIN: '8',
  STAGE2_CALENDAR_MARGIN_MIN: '2',
  STAGE2_SCHEDULE_SCORE_MIN: '7',
  STAGE2_SCHEDULE_MARGIN_MIN: '2',
  STAGE2_SMALL_POST_MAX_ITEMS: '5',
  STAGE2_TILED_CALENDAR_SCORE_MIN: '10',
  STAGE2_TILED_MIN_ITEMS: '8',
  STAGE2_SCHEDULE_BLOCK_IF_GRID: 'true',
  STAGE2_AMBIGUOUS_ROUTE: 'CALENDAR_BASIC',
};

function parseProjectArg(argv) {
  const exact = argv.find((arg) => arg.startsWith('--project='));
  if (exact) return exact.split('=')[1];
  const idx = argv.findIndex((arg) => arg === '--project');
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
  return process.env.GCLOUD_PROJECT || DEFAULT_PROJECT;
}

function describeService({ name, region }, project) {
  const cmd = [
    'gcloud run services describe',
    name,
    `--region ${region}`,
    `--project ${project}`,
    '--format=json',
  ].join(' ');

  const raw = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(raw);
}

function getEnvMap(serviceJson) {
  const envArray =
    serviceJson?.spec?.template?.spec?.containers?.[0]?.env && Array.isArray(serviceJson.spec.template.spec.containers[0].env)
      ? serviceJson.spec.template.spec.containers[0].env
      : [];
  const map = new Map();
  for (const env of envArray) {
    if (typeof env?.name === 'string') {
      map.set(env.name, typeof env.value === 'string' ? env.value : '');
    }
  }
  return map;
}

function main() {
  const project = parseProjectArg(process.argv.slice(2));
  const failures = [];

  console.log(`Verifying parser env flags in project: ${project}`);

  for (const service of SERVICES) {
    const serviceLabel = `${service.name} (${service.region})`;
    let envMap;
    try {
      const json = describeService(service, project);
      envMap = getEnvMap(json);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({
        service: serviceLabel,
        key: '<service>',
        expected: 'reachable via gcloud',
        actual: `error: ${message}`,
      });
      console.log(`- ${serviceLabel}: ERROR reading service`);
      continue;
    }

    const serviceFailures = [];
    for (const [key, expected] of Object.entries(REQUIRED_ENV)) {
      const actual = envMap.has(key) ? envMap.get(key) : '<unset>';
      if (actual !== expected) {
        serviceFailures.push({ key, expected, actual });
      }
    }

    if (serviceFailures.length === 0) {
      console.log(`- ${serviceLabel}: OK`);
    } else {
      console.log(`- ${serviceLabel}: ${serviceFailures.length} mismatch(es)`);
      for (const item of serviceFailures) {
        failures.push({ service: serviceLabel, ...item });
      }
    }
  }

  if (failures.length > 0) {
    console.error('\nParser env verification FAILED:');
    for (const failure of failures) {
      console.error(
        `  [${failure.service}] ${failure.key} expected="${failure.expected}" actual="${failure.actual}"`
      );
    }
    process.exit(1);
  }

  console.log('\nParser env verification PASSED.');
}

main();
