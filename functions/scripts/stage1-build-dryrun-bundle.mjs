import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAndValidateManifest } from './stage1-evaluation-lib.mjs';

const functionsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.argv[2];
if (!output) throw new Error('Usage: node scripts/stage1-build-dryrun-bundle.mjs EMPTY_OUTPUT_DIRECTORY');
const destination = path.resolve(output);
if (fs.existsSync(destination) && fs.readdirSync(destination).length) {
  throw new Error('Bundle destination must be empty; existing files will not be overwritten.');
}
const fixture = 'test/fixtures/stage1-oct8';
const { manifest, sourceRoot } = loadAndValidateManifest(path.join(functionsRoot, fixture, 'manifest.json'));
const files = [
  'scripts/stage1-evaluation-runner.mjs',
  'scripts/stage1-evaluation-lib.mjs',
  'lib/parsing/contentValidator.js',
  'lib/parsing/runtimeConfig.js',
  'lib/parsing/types.js',
  'lib/utils/logger.js',
  `${fixture}/manifest.json`,
];
for (const file of files) {
  const target = path.join(destination, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(functionsRoot, file), target);
}
for (const image of manifest.cases.flatMap(item => item.images)) {
  const target = path.join(destination, fixture, image.path);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(sourceRoot, image.path), target);
}
const smoke = { ...manifest, cases: manifest.cases.filter(item => [287, 65, 62].includes(item.sourceRow)) };
fs.writeFileSync(path.join(destination, fixture, 'manifest-hosted-smoke.json'), JSON.stringify(smoke, null, 2));
fs.writeFileSync(path.join(destination, 'package.json'), JSON.stringify({
  name: 'gathr-stage1-dryrun', version: '1.0.0', private: true,
  dependencies: { openai: '4.104.0' },
}, null, 2));
fs.copyFileSync(path.join(functionsRoot, 'scripts/stage1-dryrun-package-lock.json'), path.join(destination, 'package-lock.json'));
const args = ['node', 'scripts/stage1-evaluation-runner.mjs', '--execute', '--include-compact-luna',
  '--image-set', 'full', '--manifest', `${fixture}/manifest-hosted-smoke.json`, '--output', '-', '--max-estimated-usd', '0.35'];
fs.writeFileSync(path.join(destination, 'Dockerfile'), [
  'FROM node:22-slim', 'WORKDIR /app', 'COPY package.json package-lock.json ./',
  'RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund',
  'COPY lib ./lib', 'COPY scripts ./scripts', 'COPY test ./test',
  `CMD ${JSON.stringify(args)}`, '',
].join('\n'));
for (const name of ['.gcloudignore', '.dockerignore']) {
  fs.writeFileSync(path.join(destination, name), 'node_modules/\n.git/\n*.log\n');
}
console.log(JSON.stringify({ destination, cases: manifest.cases.length,
  images: manifest.cases.flatMap(item => item.images).length, smokeRows: smoke.cases.map(item => item.sourceRow),
  dependencies: ['openai@4.104.0'], includesFirebaseClient: false }));
