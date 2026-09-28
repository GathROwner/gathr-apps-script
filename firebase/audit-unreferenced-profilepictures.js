/*
 * Read-only audit of every managed profile picture. An object is a deletion
 * candidate only when a complete Firestore traversal finds no live or
 * imageProvenance reference to it.
 *
 * Usage:
 *   $env:GATHR_SERVICE_ACCOUNT_PATH='C:\\...\\service-account.json'
 *   node firebase/audit-unreferenced-profilepictures.js
 */

const admin = require('firebase-admin');
const fs = require('node:fs');
const path = require('node:path');

const serviceAccountPath = process.env.GATHR_SERVICE_ACCOUNT_PATH;
if (!serviceAccountPath) throw new Error('GATHR_SERVICE_ACCOUNT_PATH is required');
admin.initializeApp({ credential: admin.credential.cert(require(serviceAccountPath)) });

const bucketName = 'gathr-uploaded-images';
const objectPrefix = 'profilepictures/';
const canonicalPrefix = `https://storage.googleapis.com/${bucketName}/${objectPrefix}`;
const artifactsDir = path.join(__dirname, 'artifacts');
const progressFile = path.join(artifactsDir, 'unreferenced-profilepictures-audit-progress.json');
const candidates = new Set();
const activeReferences = new Map();
const provenanceReferences = new Map();
let lastProgressWriteMs = 0;

function canonicalProfileUrl(value) {
  if (typeof value !== 'string') return '';
  try {
    const parsed = new URL(value);
    const expectedPathPrefix = `/${bucketName}/${objectPrefix}`;
    if (parsed.hostname !== 'storage.googleapis.com' || !parsed.pathname.startsWith(expectedPathPrefix)) return '';
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return '';
  }
}

function addReference(index, url, documentPath, fieldPath) {
  const entries = index.get(url) || [];
  entries.push({ documentPath, fieldPath });
  index.set(url, entries);
}

function scanDocumentValue(value, documentPath, fieldPath = '', inProvenance = false) {
  if (typeof value === 'string') {
    const url = canonicalProfileUrl(value);
    if (url && candidates.has(url)) addReference(inProvenance ? provenanceReferences : activeReferences, url, documentPath, fieldPath);
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

function writeProgress(totals, completed = false) {
  const now = Date.now();
  if (!completed && now - lastProgressWriteMs < 5000) return;
  lastProgressWriteMs = now;
  fs.writeFileSync(progressFile, JSON.stringify({
    updatedAt: new Date().toISOString(), completed,
    candidateObjectCount: candidates.size,
    scannedCollectionCount: totals.scannedCollectionCount,
    scannedDocumentCount: totals.scannedDocumentCount,
    currentCollectionPath: totals.currentCollectionPath || '',
    currentDocumentPath: totals.currentDocumentPath || '',
    activeReferenceObjectCount: activeReferences.size,
    provenanceReferenceObjectCount: provenanceReferences.size,
  }, null, 2));
}

async function mapWithConcurrency(items, concurrency, worker) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (item) await worker(item);
    }
  }));
}

async function withTimeout(promise, label, timeoutMs = 45000) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms: ${label}`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function walkCollection(collectionRef, totals) {
  totals.scannedCollectionCount += 1;
  totals.currentCollectionPath = collectionRef.path;
  writeProgress(totals);
  let lastDocument = null;
  while (true) {
    let query = collectionRef.orderBy(admin.firestore.FieldPath.documentId()).limit(500);
    if (lastDocument) query = query.startAfter(lastDocument);
    const snapshot = await withTimeout(query.get(), `collection page read ${collectionRef.path}`);
    if (snapshot.empty) return;
    await mapWithConcurrency(snapshot.docs, 24, async (document) => {
      totals.scannedDocumentCount += 1;
      totals.currentDocumentPath = document.ref.path;
      scanDocumentValue(document.data(), document.ref.path);
      writeProgress(totals);
      const subcollections = await withTimeout(document.ref.listCollections(), `subcollection list ${document.ref.path}`);
      await mapWithConcurrency(subcollections, 8, (subcollection) => walkCollection(subcollection, totals));
    });
    if (snapshot.size < 500) return;
    lastDocument = snapshot.docs[snapshot.docs.length - 1];
  }
}

async function main() {
  const totals = { scannedCollectionCount: 0, scannedDocumentCount: 0 };
  writeProgress(totals);
  const [files] = await admin.storage().bucket(bucketName).getFiles({ prefix: objectPrefix, autoPaginate: true });
  for (const file of files) candidates.add(`${canonicalPrefix}${file.name.slice(objectPrefix.length)}`);
  writeProgress(totals);
  for (const collection of await admin.firestore().listCollections()) await walkCollection(collection, totals);

  const entries = [...candidates].sort().map((url) => {
    const active = activeReferences.get(url) || [];
    const provenance = provenanceReferences.get(url) || [];
    return { url, activeReferences: active, provenanceReferences: provenance, status: active.length || provenance.length ? 'protected' : 'deletable' };
  });
  const deletionManifest = entries.filter((entry) => entry.status === 'deletable').map((entry) => entry.url);
  const report = {
    createdAt: new Date().toISOString(), mode: 'read-only', bucketName, objectPrefix,
    objectCount: entries.length, scannedCollectionCount: totals.scannedCollectionCount, scannedDocumentCount: totals.scannedDocumentCount,
    activeReferenceObjectCount: entries.filter((entry) => entry.activeReferences.length).length,
    provenanceReferenceObjectCount: entries.filter((entry) => entry.provenanceReferences.length).length,
    deletableCount: deletionManifest.length, entries, deletionManifest,
  };
  const outputPath = path.join(artifactsDir, `unreferenced-profilepictures-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  writeProgress(totals, true);
  console.log(JSON.stringify({ ...report, entries: undefined, deletionManifest: undefined, outputPath }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
