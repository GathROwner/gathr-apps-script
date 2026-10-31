import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const functionsDirectory = path.resolve(scriptsDirectory, '..');
const compiledSocialDirectory = path.join(functionsDirectory, 'lib', 'social');
const stagingSocialDirectory = path.join(
  functionsDirectory,
  'social-staging',
  'lib',
  'social'
);

// Copy the reviewed pure-OSM public catalogue/notice into both local compiled
// tests and the existing isolated deployment source. No download occurs here.
await cp(path.join(functionsDirectory, 'src', 'social', 'data'), path.join(compiledSocialDirectory, 'data'), { recursive: true });

await rm(stagingSocialDirectory, { recursive: true, force: true });
await mkdir(path.dirname(stagingSocialDirectory), { recursive: true });
await cp(compiledSocialDirectory, stagingSocialDirectory, {
  recursive: true,
  filter: (source) => !source.endsWith('.test.js')
    && !source.endsWith('.test.js.map')
    && !source.endsWith('.test.d.ts')
    && !source.endsWith('.test.d.ts.map'),
});

console.log('Prepared isolated social staging deployment source.');
