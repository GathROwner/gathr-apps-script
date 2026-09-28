/*
 * Deletes only the objects in a completed managed-image audit manifest.
 * Default mode performs a storage preflight. --apply requires every object to
 * still exist and writes a metadata backup before deleting and re-verifying.
 *
 * Usage:
 *   node firebase/delete-retired-postimages.js --report <audit-report.json>
 *   node firebase/delete-retired-postimages.js --apply --report <audit-report.json>
 */

const admin = require('firebase-admin');
const fs = require('node:fs');
const path = require('node:path');

const serviceAccountPath = process.env.GATHR_SERVICE_ACCOUNT_PATH;
if (!serviceAccountPath) throw new Error('GATHR_SERVICE_ACCOUNT_PATH is required');
admin.initializeApp({ credential: admin.credential.cert(require(serviceAccountPath)) });

const apply = process.argv.includes('--apply');
const reportIndex = process.argv.indexOf('--report');
const reportPath = reportIndex >= 0 ? process.argv[reportIndex + 1] : '';
if (!reportPath) throw new Error('--report <audit-report.json> is required');

function objectLocation(url, expectedPrefix) {
  const parsed = new URL(url);
  if (parsed.hostname !== 'storage.googleapis.com') throw new Error(`Unexpected storage URL: ${url}`);
  const [bucket, ...objectParts] = parsed.pathname.split('/').filter(Boolean);
  const objectName = objectParts.join('/');
  if (!['postimages/', 'profilepictures/'].includes(expectedPrefix)) throw new Error(`Unexpected audit prefix: ${expectedPrefix}`);
  if (bucket !== 'gathr-uploaded-images' || !objectName.startsWith(expectedPrefix)) {
    throw new Error(`Unexpected deletion target: ${url}`);
  }
  return { url, bucket, objectName };
}

function timestampedPath(suffix) {
  return path.join(__dirname, 'artifacts', `retired-postimages-delete-${new Date().toISOString().replace(/[:.]/g, '-')}-${suffix}.json`);
}

async function main() {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  if (report.mode !== 'read-only' || !Array.isArray(report.entries) || !Array.isArray(report.deletionManifest)) {
    throw new Error('Audit report shape is invalid');
  }
  const expectedPrefix = report.objectPrefix || 'postimages/';
  const manifest = [...new Set(report.deletionManifest)].map((url) => objectLocation(url, expectedPrefix));
  if (manifest.length === 0) throw new Error('Audit report contains no deletion targets');
  const invalid = report.entries.filter((entry) => report.deletionManifest.includes(entry.url) && (
    entry.status !== 'deletable' || entry.activeReferences.length || entry.provenanceReferences.length
  ));
  if (invalid.length) throw new Error(`Manifest contains protected objects: ${invalid.map((entry) => entry.url).join(', ')}`);

  const metadata = [];
  for (const target of manifest) {
    const file = admin.storage().bucket(target.bucket).file(target.objectName);
    const [exists] = await file.exists();
    if (!exists) throw new Error(`Preflight object missing: ${target.url}`);
    const [objectMetadata] = await file.getMetadata();
    metadata.push({ ...target, metadata: {
      generation: String(objectMetadata.generation || ''),
      size: String(objectMetadata.size || ''),
      md5Hash: String(objectMetadata.md5Hash || ''),
      updated: String(objectMetadata.updated || ''),
    } });
  }

  if (!apply) {
    const outputPath = timestampedPath('preflight');
    fs.writeFileSync(outputPath, JSON.stringify({ createdAt: new Date().toISOString(), mode: 'preflight', reportPath, objectCount: metadata.length, metadata }, null, 2));
    console.log(JSON.stringify({ mode: 'preflight', objectCount: metadata.length, outputPath }, null, 2));
    return;
  }

  const backupPath = timestampedPath('backup');
  fs.writeFileSync(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), reportPath, softDeleteRecovery: '7 days', metadata }, null, 2));
  for (const target of metadata) await admin.storage().bucket(target.bucket).file(target.objectName).delete();
  for (const target of metadata) {
    const [exists] = await admin.storage().bucket(target.bucket).file(target.objectName).exists();
    if (exists) throw new Error(`Post-delete verification failed: ${target.url}`);
  }
  const resultPath = timestampedPath('result');
  fs.writeFileSync(resultPath, JSON.stringify({ completedAt: new Date().toISOString(), reportPath, backupPath, deletedObjectCount: metadata.length, urls: metadata.map((target) => target.url) }, null, 2));
  console.log(JSON.stringify({ mode: 'applied', deletedObjectCount: metadata.length, backupPath, resultPath }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
