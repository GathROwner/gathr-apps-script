/*
 * Builds a deletion manifest for managed postimages that were removed from
 * Firestore during the duplicate-media repairs. This is deliberately read-only.
 *
 * A candidate may appear in a local repair backup, but it is deletable only if
 * a complete Firestore traversal finds it nowhere: neither in live fields nor
 * in imageProvenance history. The resulting manifest is the sole allowed input
 * for a storage delete step.
 *
 * Usage:
 *   $env:GATHR_SERVICE_ACCOUNT_PATH='C:\\...\\service-account.json'
 *   node firebase/audit-retired-postimages.js
 */

const admin = require('firebase-admin');
const fs = require('node:fs');
const path = require('node:path');

const serviceAccountPath = process.env.GATHR_SERVICE_ACCOUNT_PATH;
if (!serviceAccountPath) throw new Error('GATHR_SERVICE_ACCOUNT_PATH is required');
admin.initializeApp({ credential: admin.credential.cert(require(serviceAccountPath)) });

const artifactsDir = path.join(__dirname, 'artifacts');
const managedPrefix = 'https://storage.googleapis.com/gathr-uploaded-images/postimages/';
const candidates = new Set();
const activeReferences = new Map();
const provenanceReferences = new Map();
const progressFile = path.join(artifactsDir, 'retired-postimages-audit-progress.json');
let lastProgressWriteMs = 0;

function writeProgress(totals, completed = false) {
  const now = Date.now();
  if (!completed && now - lastProgressWriteMs < 5000) return;
  lastProgressWriteMs = now;
  fs.writeFileSync(progressFile, JSON.stringify({
    updatedAt: new Date().toISOString(),
    completed,
    candidateCount: candidates.size,
    scannedCollectionCount: totals.scannedCollectionCount,
    scannedDocumentCount: totals.scannedDocumentCount,
    activeReferenceCandidateCount: activeReferences.size,
    provenanceReferenceCandidateCount: provenanceReferences.size,
  }, null, 2));
}

function addReference(index, url, documentPath, fieldPath) {
  const entries = index.get(url) || [];
  entries.push({ documentPath, fieldPath });
  index.set(url, entries);
}

function collectBackupUrls(value) {
  if (typeof value === 'string') {
    if (value.startsWith(managedPrefix)) candidates.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(collectBackupUrls);
    return;
  }
  if (value && typeof value === 'object') Object.values(value).forEach(collectBackupUrls);
}

function scanDocumentValue(value, documentPath, fieldPath = '', inProvenance = false) {
  if (typeof value === 'string') {
    if (!candidates.has(value)) return;
    addReference(inProvenance ? provenanceReferences : activeReferences, value, documentPath, fieldPath);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanDocumentValue(item, documentPath, `${fieldPath}[${index}]`, inProvenance));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = fieldPath ? `${fieldPath}.${key}` : key;
    scanDocumentValue(child, documentPath, childPath, inProvenance || key === 'imageProvenance');
  }
}

async function mapWithConcurrency(items, concurrency, worker) {
  const queue = [...items];
  const workerCount = Math.min(concurrency, queue.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (item) await worker(item);
    }
  }));
}

async function walkCollection(collectionRef, totals) {
  totals.scannedCollectionCount += 1;
  writeProgress(totals);
  const snapshot = await collectionRef.get();
  await mapWithConcurrency(snapshot.docs, 24, async (document) => {
    totals.scannedDocumentCount += 1;
    scanDocumentValue(document.data(), document.ref.path);
    writeProgress(totals);
    const subcollections = await document.ref.listCollections();
    await mapWithConcurrency(subcollections, 8, (subcollection) => walkCollection(subcollection, totals));
  });
}

function reportPath() {
  return path.join(artifactsDir, `retired-postimages-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
}

async function main() {
  const backupFiles = fs.readdirSync(artifactsDir)
    .filter((name) => name.endsWith('.json') && name.includes('backup'))
    .sort();
  if (backupFiles.length === 0) throw new Error(`No repair backups found in ${artifactsDir}`);

  for (const name of backupFiles) collectBackupUrls(JSON.parse(fs.readFileSync(path.join(artifactsDir, name), 'utf8')));
  const totals = { scannedCollectionCount: 0, scannedDocumentCount: 0 };
  writeProgress(totals);
  for (const collection of await admin.firestore().listCollections()) await walkCollection(collection, totals);

  const entries = [...candidates].sort().map((url) => {
    const active = activeReferences.get(url) || [];
    const provenance = provenanceReferences.get(url) || [];
    return {
      url,
      activeReferences: active,
      provenanceReferences: provenance,
      status: active.length || provenance.length ? 'protected' : 'deletable',
    };
  });
  const deletable = entries.filter((entry) => entry.status === 'deletable');
  const report = {
    createdAt: new Date().toISOString(),
    mode: 'read-only',
    sourceBackupFiles: backupFiles,
    candidateCount: entries.length,
    scannedDocumentCount: totals.scannedDocumentCount,
    activeReferenceCandidateCount: entries.filter((entry) => entry.activeReferences.length).length,
    provenanceReferenceCandidateCount: entries.filter((entry) => entry.provenanceReferences.length).length,
    deletableCount: deletable.length,
    entries,
    deletionManifest: deletable.map((entry) => entry.url),
  };
  const outputPath = reportPath();
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  writeProgress(totals, true);
  console.log(JSON.stringify({
    ...report,
    entries: undefined,
    deletionManifest: undefined,
    outputPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
