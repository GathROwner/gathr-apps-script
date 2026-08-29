import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectId = process.argv[2];
const outputRoot = process.argv[3];
if (!projectId || !outputRoot) {
  throw new Error('Usage: node backup-production-social-venues.mjs <projectId> <outputDirectory>');
}

const collectionUrl =
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/venues`;
const documents = [];
let pageToken = '';
do {
  const params = new URLSearchParams({ pageSize: '300' });
  if (pageToken) params.set('pageToken', pageToken);
  const response = await fetch(`${collectionUrl}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Firestore venue backup failed (${response.status}): ${await response.text()}`);
  }
  const payload = await response.json();
  documents.push(...(Array.isArray(payload.documents) ? payload.documents : []));
  pageToken = typeof payload.nextPageToken === 'string' ? payload.nextPageToken : '';
} while (pageToken);

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDirectory = path.resolve(outputRoot, `${projectId}-venues-${timestamp}`);
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, 'venues.json'),
  `${JSON.stringify({ documents }, null, 2)}\n`,
  'utf8'
);
await writeFile(
  path.join(outputDirectory, 'manifest.json'),
  `${JSON.stringify({
    projectId,
    backedUpAt: new Date().toISOString(),
    venueDocumentCount: documents.length,
    venueDocumentNames: documents.map((document) => document.name),
  }, null, 2)}\n`,
  'utf8'
);

console.log(`backup_directory=${outputDirectory}`);
console.log(`venue_documents=${documents.length}`);
