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
