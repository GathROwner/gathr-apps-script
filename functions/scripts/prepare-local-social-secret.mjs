import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const sourcePath = process.argv[2];

if (!sourcePath) {
  throw new Error('Pass the mobile .env.local path as the first argument.');
}

const source = await readFile(path.resolve(sourcePath), 'utf8');
const tokenLine = source
  .split(/\r?\n/u)
  .find((line) => line.startsWith('MAPBOX_ACCESS_TOKEN='));
const token = tokenLine?.slice('MAPBOX_ACCESS_TOKEN='.length).trim();

if (!token) {
  throw new Error('MAPBOX_ACCESS_TOKEN is missing from the supplied environment file.');
}

await writeFile(
  path.resolve('social-staging', '.secret.local'),
  `FRIEND_EVENT_GEOCODING_TOKEN=${token}\n`,
  { encoding: 'utf8', mode: 0o600 }
);

console.log('Prepared the ignored Functions emulator secret file.');
