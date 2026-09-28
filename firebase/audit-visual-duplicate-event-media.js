/*
 * Read-only audit for visually near-identical managed event images.
 *
 * The existing MD5 cleanup handles identical bytes. This script is deliberately
 * report-only: it uses a strict average-hash comparison to find re-encodes and
 * resized variants that need review before any Firestore mutation.
 *
 * Requires ffmpeg on PATH (or set FFMPEG_PATH). No Cloud Storage objects or
 * Firestore documents are changed.
 *
 * Usage:
 *   $env:GATHR_SERVICE_ACCOUNT_PATH='C:\\path\\to\\service-account.json'
 *   node firebase/audit-visual-duplicate-event-media.js
 *   node firebase/audit-visual-duplicate-event-media.js --event venues/.../events/...
 */

const admin = require('firebase-admin');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const serviceAccountPath = process.env.GATHR_SERVICE_ACCOUNT_PATH;
if (!serviceAccountPath) throw new Error('GATHR_SERVICE_ACCOUNT_PATH is required');
admin.initializeApp({ credential: admin.credential.cert(require(serviceAccountPath)) });

const eventFlagIndex = process.argv.indexOf('--event');
const requestedEventPath = eventFlagIndex >= 0 ? String(process.argv[eventFlagIndex + 1] || '').trim() : '';
const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
const HASH_SIZE = 32;
const MAX_DISTANCE = 6; // 0.6% of a 1,024-bit image hash: only near-identical renders.
const DECODE_TIMEOUT_MS = 20_000;

function normalizeUrls(value) {
  return Array.isArray(value) ? value.map((url) => String(url || '').trim()).filter(Boolean) : [];
}

function isManagedImageUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'storage.googleapis.com' && parsed.pathname.includes('/gathr-uploaded-images/');
  } catch {
    return false;
  }
}

function decodeToGrayPixels(url) {
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-rw_timeout', '15000000', '-i', url,
      '-frames:v', '1', '-vf', `scale=${HASH_SIZE}:${HASH_SIZE}:flags=lanczos,format=gray`,
      '-f', 'rawvideo', 'pipe:1',
    ], { windowsHide: true });
    const chunks = [];
    const errors = [];
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`ffmpeg timed out after ${DECODE_TIMEOUT_MS}ms`));
    }, DECODE_TIMEOUT_MS);
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => errors.push(chunk));
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      const pixels = Buffer.concat(chunks);
      if (code !== 0 || pixels.length !== HASH_SIZE * HASH_SIZE) {
        reject(new Error(`ffmpeg ${code}: ${Buffer.concat(errors).toString('utf8').slice(0, 240)}`));
        return;
      }
      resolve(pixels);
    });
  });
}

async function averageHash(url) {
  const pixels = await decodeToGrayPixels(url);
  let total = 0;
  for (const pixel of pixels) total += pixel;
  const average = total / pixels.length;
  const bits = Buffer.alloc(HASH_SIZE * HASH_SIZE);
  for (let index = 0; index < pixels.length; index += 1) bits[index] = pixels[index] >= average ? 1 : 0;
  return bits;
}

function hammingDistance(left, right) {
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) distance += left[index] === right[index] ? 0 : 1;
  return distance;
}

async function inspectEvent(snapshot) {
  const data = snapshot.data();
  const urls = normalizeUrls(data.mediaUrls).filter(isManagedImageUrl);
  if (urls.length < 2) return null;

  const fingerprints = [];
  const errors = [];
  for (const url of urls) {
    try {
      fingerprints.push({ url, hash: await averageHash(url) });
    } catch (error) {
      errors.push({ url, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const matches = [];
  for (let left = 0; left < fingerprints.length; left += 1) {
    for (let right = left + 1; right < fingerprints.length; right += 1) {
      const distance = hammingDistance(fingerprints[left].hash, fingerprints[right].hash);
      if (distance <= MAX_DISTANCE) {
        matches.push({ left: fingerprints[left].url, right: fingerprints[right].url, distance });
      }
    }
  }
  if (matches.length === 0 && errors.length === 0) return null;
  return {
    path: snapshot.ref.path,
    eventName: String(data.eventName || data.name || ''),
    uniqueId: String(data.uniqueId || ''),
    primaryUrl: String(data.relevantImageUrl || data.imageUrl || data.image || ''),
    mediaUrls: urls,
    matches,
    errors,
  };
}

async function main() {
  const db = admin.firestore();
  const snapshots = requestedEventPath
    ? [await db.doc(requestedEventPath).get()]
    : (await db.collectionGroup('events').get()).docs;
  const candidates = snapshots.filter((snapshot) => snapshot.exists && normalizeUrls(snapshot.get('mediaUrls')).filter(isManagedImageUrl).length >= 2);
  const findings = [];
  const queue = [...candidates];
  let inspectedCount = 0;
  let matchedEventCount = 0;
  let decodeErrorEventCount = 0;
  // This is read-only and every decoder has a hard timeout. More parallelism
  // keeps a few unreachable public objects from making the full audit drag.
  const workerCount = Math.min(12, queue.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (queue.length) {
      const snapshot = queue.shift();
      if (!snapshot) return;
      const finding = await inspectEvent(snapshot);
      if (finding) findings.push(finding);
      inspectedCount += 1;
      if (finding && finding.matches.length > 0) matchedEventCount += 1;
      if (finding && finding.errors.length > 0) decodeErrorEventCount += 1;
      if (inspectedCount % 25 === 0 || inspectedCount === candidates.length) {
        console.log(JSON.stringify({ progress: `${inspectedCount}/${candidates.length}`, matchedEventCount, decodeErrorEventCount }));
      }
    }
  }));
  findings.sort((left, right) => left.path.localeCompare(right.path));
  const outputPath = path.join(__dirname, 'artifacts', `visual-duplicate-event-media-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const report = {
    createdAt: new Date().toISOString(), mode: 'read-only', hash: `average-${HASH_SIZE}x${HASH_SIZE}`,
    maxHammingDistance: MAX_DISTANCE, scannedEventCount: snapshots.length, mediaCandidateCount: candidates.length,
    findingCount: findings.filter((finding) => finding.matches.length > 0).length, decodeErrorEventCount: findings.filter((finding) => finding.errors.length > 0).length,
    findings,
  };
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, findings: undefined, outputPath }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
