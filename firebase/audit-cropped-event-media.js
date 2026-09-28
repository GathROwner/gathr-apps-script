/* Builds Firestore input for the strict crop-derivative audit. Read-only. */
const admin = require('firebase-admin');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const serviceAccountPath = process.env.GATHR_SERVICE_ACCOUNT_PATH;
if (!serviceAccountPath) throw new Error('GATHR_SERVICE_ACCOUNT_PATH is required');
admin.initializeApp({ credential: admin.credential.cert(require(serviceAccountPath)) });
const python = process.env.PYTHON_PATH || 'python';
const isManaged = (url) => { try { const p = new URL(url); return p.hostname === 'storage.googleapis.com' && p.pathname.includes('/gathr-uploaded-images/'); } catch { return false; } };
(async () => {
  const docs = await admin.firestore().collectionGroup('events').get();
  const events = docs.docs.map((doc) => ({ path: doc.ref.path, eventName: String(doc.get('eventName') || ''), uniqueId: String(doc.get('uniqueId') || ''), primaryUrl: String(doc.get('relevantImageUrl') || doc.get('imageUrl') || doc.get('image') || ''), mediaUrls: (Array.isArray(doc.get('mediaUrls')) ? doc.get('mediaUrls') : []).map(String).filter(isManaged) })).filter((event) => event.mediaUrls.length >= 2);
  const child = spawn(python, [path.join(__dirname, 'audit-cropped-event-media.py')], { windowsHide: true });
  child.stdin.end(events.map((event) => JSON.stringify(event)).join('\n'));
  const output = [], errors = [];
  child.stdout.on('data', (chunk) => output.push(chunk));
  child.stderr.on('data', (chunk) => { errors.push(chunk); process.stderr.write(chunk); });
  child.on('close', (code) => {
    if (code !== 0) throw new Error(`Crop audit failed: ${Buffer.concat(errors).toString('utf8')}`);
    const report = JSON.parse(Buffer.concat(output).toString('utf8'));
    report.createdAt = new Date().toISOString(); report.mode = 'read-only'; report.mediaCandidateCount = events.length;
    const outputPath = path.join(__dirname, 'artifacts', `cropped-event-media-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true }); fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report, findings: undefined, outputPath }, null, 2));
  });
})();
