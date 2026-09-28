/*
 * Audits duplicate event-media references without deleting Cloud Storage
 * objects. Default mode writes a report only. --apply accepts only proposals
 * from that report whose live media list still exactly matches the fingerprint.
 *
 * Usage:
 *   $env:GATHR_SERVICE_ACCOUNT_PATH='C:\\...\\service-account.json'
 *   node firebase/audit-and-clean-duplicate-event-media.js
 *   node firebase/audit-and-clean-duplicate-event-media.js --apply --report <report-path>
 */

const admin = require('firebase-admin');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const serviceAccountPath = process.env.GATHR_SERVICE_ACCOUNT_PATH;
if (!serviceAccountPath) throw new Error('GATHR_SERVICE_ACCOUNT_PATH is required');
admin.initializeApp({ credential: admin.credential.cert(require(serviceAccountPath)) });

const apply = process.argv.includes('--apply');
const reportIndex = process.argv.indexOf('--report');
const suppliedReportPath = reportIndex >= 0 ? process.argv[reportIndex + 1] : '';
const metadataByUrl = new Map();

function normalizeUrls(value) {
  return Array.isArray(value) ? value.map((url) => String(url || '').trim()).filter(Boolean) : [];
}

function fingerprint(urls) {
  return crypto.createHash('sha256').update(JSON.stringify(urls)).digest('hex');
}

function parseManagedUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'storage.googleapis.com') return null;
    const [bucket, ...objectParts] = parsed.pathname.split('/').filter(Boolean);
    return bucket && objectParts.length ? { bucket, objectName: objectParts.join('/') } : null;
  } catch {
    return null;
  }
}

async function getObjectMd5(url) {
  if (metadataByUrl.has(url)) return metadataByUrl.get(url);
  const location = parseManagedUrl(url);
  const promise = !location
    ? Promise.resolve('')
    : admin.storage().bucket(location.bucket).file(location.objectName).getMetadata()
      .then(([metadata]) => String(metadata.md5Hash || '').trim())
      .catch(() => '');
  metadataByUrl.set(url, promise);
  return promise;
}

function preferredUrl(data, urls) {
  for (const url of [data.relevantImageUrl, data.imageUrl, data.image]) {
    if (typeof url === 'string' && urls.includes(url)) return url;
  }
  return urls[0] || '';
}

async function proposeCleanup(snapshot) {
  const data = snapshot.data();
  const original = normalizeUrls(data.mediaUrls);
  if (original.length < 2) return null;

  const primary = preferredUrl(data, original);
  const keep = new Set();
  const reasons = [];
  const seenUrls = new Set();
  for (const url of original) {
    if (seenUrls.has(url)) {
      reasons.push({ dropped: url, kept: url, reason: 'exact_url' });
      continue;
    }
    seenUrls.add(url);
    keep.add(url);
  }

  const md5Groups = new Map();
  for (const url of keep) {
    const md5 = await getObjectMd5(url);
    if (!md5) continue;
    const group = md5Groups.get(md5) || [];
    group.push(url);
    md5Groups.set(md5, group);
  }
  for (const group of md5Groups.values()) {
    if (group.length < 2) continue;
    const retained = group.includes(primary) ? primary : group[0];
    for (const url of group) {
      if (url === retained) continue;
      keep.delete(url);
      reasons.push({ dropped: url, kept: retained, reason: 'byte_identical_md5' });
    }
  }

  const desired = original.filter((url, index) => keep.has(url) && original.indexOf(url) === index);
  if (desired.length === original.length) return null;
  return {
    path: snapshot.ref.path,
    eventName: String(data.eventName || data.name || ''),
    uniqueId: String(data.uniqueId || ''),
    originalMediaUrls: original,
    originalFingerprint: fingerprint(original),
    desiredMediaUrls: desired,
    primaryUrl: primary,
    reasons,
  };
}

function reportPath() {
  return path.join(__dirname, 'artifacts', `duplicate-event-media-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
}

async function audit() {
  const db = admin.firestore();
  const snapshots = await db.collectionGroup('events').get();
  const candidates = snapshots.docs.filter((snapshot) => normalizeUrls(snapshot.get('mediaUrls')).length >= 2);
  const proposals = [];
  const queue = [...candidates];
  const workerCount = Math.min(12, queue.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (queue.length > 0) {
      const snapshot = queue.shift();
      if (!snapshot) return;
      const proposal = await proposeCleanup(snapshot);
      if (proposal) proposals.push(proposal);
    }
  }));
  proposals.sort((left, right) => left.path.localeCompare(right.path));
  const report = {
    createdAt: new Date().toISOString(),
    mode: 'dry-run',
    scannedEventCount: snapshots.size,
    mediaCandidateCount: candidates.length,
    duplicateEventCount: proposals.length,
    duplicateReferenceCount: proposals.reduce((count, proposal) => count + proposal.reasons.length, 0),
    proposals,
  };
  const outputPath = reportPath();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, proposals: undefined, outputPath }, null, 2));
}

async function applyReport() {
  if (!suppliedReportPath) throw new Error('--apply requires --report <audit-report-path>');
  const report = JSON.parse(fs.readFileSync(suppliedReportPath, 'utf8'));
  if (!Array.isArray(report.proposals) || report.proposals.length === 0) {
    throw new Error('Report contains no cleanup proposals');
  }
  const db = admin.firestore();
  const backup = [];
  for (const proposal of report.proposals) {
    const snapshot = await db.doc(proposal.path).get();
    const current = normalizeUrls(snapshot.get('mediaUrls'));
    if (!snapshot.exists || fingerprint(current) !== proposal.originalFingerprint) {
      throw new Error(`Fingerprint mismatch: ${proposal.path}`);
    }
    if (!proposal.desiredMediaUrls.includes(proposal.primaryUrl)) {
      throw new Error(`Primary image would be removed: ${proposal.path}`);
    }
    backup.push({ path: proposal.path, before: snapshot.data(), proposal });
  }
  const backupPath = path.join(__dirname, 'artifacts', `duplicate-event-media-apply-${new Date().toISOString().replace(/[:.]/g, '-')}-backup.json`);
  fs.writeFileSync(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), backup }, null, 2));
  for (let offset = 0; offset < backup.length; offset += 400) {
    const batch = db.batch();
    for (const entry of backup.slice(offset, offset + 400)) {
      batch.update(db.doc(entry.path), {
        mediaUrls: entry.proposal.desiredMediaUrls,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
  for (const entry of backup) {
    const after = normalizeUrls((await db.doc(entry.path).get()).get('mediaUrls'));
    if (JSON.stringify(after) !== JSON.stringify(entry.proposal.desiredMediaUrls)) {
      throw new Error(`Post-write verification failed: ${entry.path}`);
    }
  }
  console.log(JSON.stringify({ appliedEventCount: backup.length, backupPath }, null, 2));
}

(apply ? applyReport() : audit()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
