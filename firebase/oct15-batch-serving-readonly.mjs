// Secret-safe independent readback. Raw function/service JSON never leaves memory.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {exec} from 'node:child_process';
import {promisify} from 'node:util';
const phase = process.argv[2]; assert(['before','after'].includes(phase)); assert.equal(process.argv.length, 3);
const run = promisify(exec);
const out = path.resolve(import.meta.dirname, 'artifacts/oct15-reviewed-batch');
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const hash = v => createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const names = [['processDataset','northamerica-northeast2'], ['processDatasetResume','northamerica-northeast1'], ['processDatasetSelectedRows','northamerica-northeast1']];
const visibleKeys = ['STAGE1_MODEL_OVERRIDE','STAGE1_RESPONSES_REASONING_EFFORT',
  'STAGE2_MODEL_OVERRIDE','STAGE2_RESPONSES_REASONING_EFFORT','STAGE3_MODEL_OVERRIDE','STAGE3_RESPONSES_REASONING_EFFORT',
  'STAGE4_MODEL_OVERRIDE','STAGE4_RESPONSES_REASONING_EFFORT','STAGE5_MODEL_OVERRIDE','STAGE5_RESPONSES_REASONING_EFFORT',
  'LUNA_CANARY_ENABLED','LUNA_CANARY_STAGE3_ONLY','LUNA_CANARY_SAMPLE_PERCENT','LUNA_CANARY_REASONING_EFFORT',
  'LUNA_STAGE1_PILOT_ENABLED','LUNA_STAGE1_PILOT_SAMPLE_PERCENT','LUNA_STAGE2_PILOT_ENABLED','LUNA_STAGE2_PILOT_SAMPLE_PERCENT',
  'LUNA_TEXT_ONLY_ENABLED','PARSER_DATE_ONLY_PUBLICATION_ENABLED'];
const rows = await Promise.all(names.map(async ([name,region]) => {
  const [fnResult, runResult] = await Promise.all([
    run(`gcloud functions describe ${name} --gen2 --region=${region} --project=gathr-migrated --format=json`, {maxBuffer: 4*1024*1024}),
    run(`gcloud run services describe ${name.toLowerCase()} --region=${region} --project=gathr-migrated --format=json`, {maxBuffer: 4*1024*1024})
  ]);
  const fn = JSON.parse(fnResult.stdout), service = JSON.parse(runResult.stdout);
  assert.equal(fn.state, 'ACTIVE'); assert.equal(fn.serviceConfig.allTrafficOnLatestRevision, true);
  assert.equal(service.status.latestReadyRevisionName, fn.serviceConfig.revision);
  assert(service.status.conditions.some(c => c.type === 'Ready' && c.status === 'True'));
  const traffic = service.status.traffic.filter(t => Number(t.percent) > 0);
  assert.equal(traffic.length, 1); assert.equal(traffic[0].percent, 100); assert.equal(traffic[0].revisionName, fn.serviceConfig.revision);
  const config = structuredClone(fn.serviceConfig); delete config.revision; delete config.uri;
  const spec = structuredClone(service.spec.template.spec); assert.equal(spec.containers.length, 1); delete spec.containers[0].image;
  const env = fn.serviceConfig.environmentVariables || {};
  assert.notEqual(env.PARSER_DATE_ONLY_PUBLICATION_ENABLED, 'true', 'Global date-only gate changed');
  return {name,region,state:fn.state,hash:fn.labels['firebase-functions-hash'],revision:fn.serviceConfig.revision,
    trafficPercent:100,functionConfigSha256:hash(config),runtimeConfigSha256:hash(spec),
    environmentSha256:hash(env),secretBindingsSha256:hash(fn.serviceConfig.secretEnvironmentVariables || []),
    modelSettings:Object.fromEntries(visibleKeys.filter(k => k in env).map(k => [k,env[k]]))};
}));
assert.equal(new Set(rows.map(r => r.hash)).size, 1);
if (phase === 'before') assert.equal(rows[0].hash, '15a93b64dc5ce4d892adfe5b52d3d46c0ff9ad06');
else {
  const before = JSON.parse(await fs.readFile(path.join(out, 'serving-before.json'), 'utf8'));
  for (const row of rows) {
    const prev = before.rows.find(r => r.name === row.name);
    for (const key of ['functionConfigSha256','runtimeConfigSha256','environmentSha256','secretBindingsSha256']) assert.equal(row[key], prev[key], `${row.name} ${key} drift`);
    assert.deepEqual(row.modelSettings, prev.modelSettings); assert.notEqual(row.hash, prev.hash); assert.notEqual(row.revision, prev.revision);
  }
}
await fs.mkdir(out, {recursive:true});
await fs.writeFile(path.join(out, `serving-${phase}.json`), JSON.stringify({checkedAt:new Date().toISOString(),rows,liveWrites:0}, null, 2));
console.log(JSON.stringify({phase,rows:rows.map(({name,state,hash,revision,trafficPercent})=>({name,state,hash,revision,trafficPercent})),liveWrites:0}));

