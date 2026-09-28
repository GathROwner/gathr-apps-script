/*
 * Converts a reviewed visual-duplicate audit into guarded Firestore updates.
 * Default mode writes a plan only. --apply requires that plan and makes no
 * Cloud Storage deletions.
 *
 * Usage:
 *   $env:GATHR_SERVICE_ACCOUNT_PATH='C:\\path\\to\\service-account.json'
 *   node firebase/apply-visual-duplicate-event-media.js --report <audit.json>
 *   node firebase/apply-visual-duplicate-event-media.js --apply --report <plan.json>
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
const suppliedReportPath = reportIndex >= 0 ? String(process.argv[reportIndex + 1] || '') : '';
if (!suppliedReportPath) throw new Error('--report <path> is required');

const fingerprint = (urls) => crypto.createHash('sha256').update(JSON.stringify(urls)).digest('hex');
const normalizeUrls = (value) => Array.isArray(value) ? value.map((url) => String(url || '').trim()).filter(Boolean) : [];
const artifactPath = (name) => path.join(__dirname, 'artifacts', `${name}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);

function buildProposal(finding) {
  const urls = normalizeUrls(finding.mediaUrls);
  const parent = new Map(urls.map((url) => [url, url]));
  const cropUrls = new Set();
  const fullUrls = new Set();
  const find = (url) => parent.get(url) === url ? url : parent.set(url, find(parent.get(url))).get(url);
  const join = (left, right) => parent.set(find(left), find(right));
  for (const match of finding.matches || []) {
    const left = match.left || match.cropUrl;
    const right = match.right || match.fullUrl;
    if (parent.has(left) && parent.has(right)) join(left, right);
    if (match.cropUrl) cropUrls.add(match.cropUrl);
    if (match.fullUrl) fullUrls.add(match.fullUrl);
  }
  const groups = new Map();
  for (const url of urls) {
    const root = find(url);
    const group = groups.get(root) || [];
    group.push(url);
    groups.set(root, group);
  }
  const keep = new Set();
  let primaryReplacementUrl = '';
  for (const group of groups.values()) {
    if (group.length === 1) keep.add(group[0]);
    else {
      const fullSource = group.find((url) => fullUrls.has(url));
      const existingPrimary = group.includes(finding.primaryUrl) && !cropUrls.has(finding.primaryUrl)
        ? finding.primaryUrl
        : '';
      const retained = fullSource || existingPrimary || group[0];
      keep.add(retained);
      if (group.includes(finding.primaryUrl) && retained !== finding.primaryUrl) primaryReplacementUrl = retained;
    }
  }
  const desiredMediaUrls = urls.filter((url) => keep.has(url));
  return {
    path: finding.path, eventName: finding.eventName, uniqueId: finding.uniqueId,
    primaryUrl: finding.primaryUrl, originalMediaUrls: urls, originalFingerprint: fingerprint(urls), desiredMediaUrls,
    removedUrls: urls.filter((url) => !keep.has(url)), primaryReplacementUrl, matches: finding.matches,
  };
}

async function main() {
  const input = JSON.parse(fs.readFileSync(suppliedReportPath, 'utf8'));
  const proposals = input.mode === 'plan'
    ? (input.proposals || [])
    : (input.findings || [])
      .filter((finding) => Array.isArray(finding.matches) && finding.matches.length > 0)
      .map(buildProposal)
      .filter((proposal) => proposal.removedUrls.length > 0);
  if (!apply) {
    const plan = { createdAt: new Date().toISOString(), mode: 'plan', sourceReport: path.resolve(suppliedReportPath), proposalCount: proposals.length, removedReferenceCount: proposals.reduce((sum, item) => sum + item.removedUrls.length, 0), proposals };
    const outputPath = artifactPath('visual-duplicate-event-media-plan');
    fs.writeFileSync(outputPath, JSON.stringify(plan, null, 2));
    console.log(JSON.stringify({ ...plan, proposals: undefined, outputPath }, null, 2));
    return;
  }
  const db = admin.firestore();
  const backup = [];
  for (const proposal of proposals) {
    const snapshot = await db.doc(proposal.path).get();
    const data = snapshot.data();
    const current = normalizeUrls(data && data.mediaUrls);
    // Title cleanup (for example, repaired Unicode) is harmless here. The
    // source identity plus exact ordered media fingerprint protects the media
    // mutation without blocking on presentation-only title normalization.
    if (!snapshot.exists || data.uniqueId !== proposal.uniqueId || fingerprint(current) !== proposal.originalFingerprint) throw new Error(`Guard mismatch: ${proposal.path}`);
    if (proposal.primaryUrl && current.includes(proposal.primaryUrl) && !proposal.desiredMediaUrls.includes(proposal.primaryUrl) && !proposal.primaryReplacementUrl) throw new Error(`Primary removal blocked: ${proposal.path}`);
    if (proposal.primaryReplacementUrl && !proposal.desiredMediaUrls.includes(proposal.primaryReplacementUrl)) throw new Error(`Primary replacement missing: ${proposal.path}`);
    backup.push({ path: proposal.path, before: data, proposal });
  }
  const backupPath = artifactPath('visual-duplicate-event-media-apply-backup');
  fs.writeFileSync(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), backup }, null, 2));
  for (let offset = 0; offset < backup.length; offset += 400) {
    const batch = db.batch();
    for (const entry of backup.slice(offset, offset + 400)) {
      const update = { mediaUrls: entry.proposal.desiredMediaUrls, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
      if (entry.proposal.primaryReplacementUrl) {
        for (const field of ['relevantImageUrl', 'imageUrl', 'image']) {
          if (entry.before[field] === entry.proposal.primaryUrl) update[field] = entry.proposal.primaryReplacementUrl;
        }
      }
      batch.update(db.doc(entry.path), update);
    }
    await batch.commit();
  }
  for (const entry of backup) {
    const after = normalizeUrls((await db.doc(entry.path).get()).get('mediaUrls'));
    if (JSON.stringify(after) !== JSON.stringify(entry.proposal.desiredMediaUrls)) throw new Error(`Post-write verification failed: ${entry.path}`);
    if (entry.proposal.primaryReplacementUrl && (await db.doc(entry.path).get()).get('relevantImageUrl') !== entry.proposal.primaryReplacementUrl) throw new Error(`Primary replacement verification failed: ${entry.path}`);
  }
  const resultPath = artifactPath('visual-duplicate-event-media-apply-result');
  fs.writeFileSync(resultPath, JSON.stringify({ createdAt: new Date().toISOString(), appliedEventCount: backup.length, removedReferenceCount: proposals.reduce((sum, item) => sum + item.removedUrls.length, 0), backupPath }, null, 2));
  console.log(JSON.stringify({ appliedEventCount: backup.length, removedReferenceCount: proposals.reduce((sum, item) => sum + item.removedUrls.length, 0), backupPath, resultPath }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
