import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const auth = require('firebase-tools/lib/auth');
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const { Client } = require('firebase-tools/lib/apiv2');
const { FirestoreApi } = require('firebase-tools/lib/firestore/api');

const projectId = process.argv[2];
const outputRoot = process.argv[3];
if (!projectId || !outputRoot) {
  throw new Error('Usage: node backup-production-firestore-state.mjs <projectId> <outputDirectory>');
}

const account = auth.getGlobalDefaultAccount();
if (!account) throw new Error('No Firebase CLI account is available.');

await requireAuth({
  project: projectId,
  user: account.user,
  tokens: account.tokens,
});

const rulesClient = new Client({
  urlPrefix: 'https://firebaserules.googleapis.com',
  apiVersion: 'v1',
});
const releaseResponse = await rulesClient.get(
  `/projects/${projectId}/releases/cloud.firestore`
);
const release = releaseResponse.body;
const rulesetResponse = await rulesClient.get(`/${release.rulesetName}`);
const ruleset = rulesetResponse.body;

const firestoreApi = new FirestoreApi();
const indexes = await firestoreApi.listIndexes(projectId);
const fieldOverrides = await firestoreApi.listFieldOverrides(projectId);
const indexSpec = firestoreApi.makeIndexSpec(indexes, fieldOverrides);

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDirectory = path.resolve(outputRoot, `${projectId}-${timestamp}`);
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, 'ruleset.json'),
  `${JSON.stringify(ruleset, null, 2)}\n`,
  'utf8'
);
for (const [index, file] of (ruleset.source?.files ?? []).entries()) {
  const safeName = path.basename(file.name || `firestore-${index}.rules`);
  await writeFile(
    path.join(outputDirectory, safeName),
    file.content ?? '',
    'utf8'
  );
}
await writeFile(
  path.join(outputDirectory, 'firestore.indexes.json'),
  `${JSON.stringify(indexSpec, null, 2)}\n`,
  'utf8'
);
await writeFile(
  path.join(outputDirectory, 'manifest.json'),
  `${JSON.stringify({
    projectId,
    backedUpAt: new Date().toISOString(),
    releaseName: release.name,
    rulesetName: release.rulesetName,
    releaseUpdatedAt: release.updateTime,
    ruleFileCount: ruleset.source?.files?.length ?? 0,
    compositeIndexCount: indexSpec.indexes.length,
    fieldOverrideCount: indexSpec.fieldOverrides.length,
  }, null, 2)}\n`,
  'utf8'
);

console.log(`backup_directory=${outputDirectory}`);
console.log(`ruleset=${release.rulesetName}`);
console.log(`rule_files=${ruleset.source?.files?.length ?? 0}`);
console.log(`composite_indexes=${indexSpec.indexes.length}`);
console.log(`field_overrides=${indexSpec.fieldOverrides.length}`);
