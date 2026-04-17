import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const resultsDir = path.join(__dirname, 'results');
const serviceAccountPath = path.join(repoRoot, 'firebase', 'service-account.json');

const requireFromFunctions = createRequire(path.join(repoRoot, 'functions', 'package.json'));
const admin = requireFromFunctions('firebase-admin');
const serviceAccount = requireFromFunctions(serviceAccountPath);

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function parseArgs(argv) {
  const options = {
    venue: '',
    venueId: '',
    reportLabel: '',
    snapshotLimit: 600,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--venue' && argv[index + 1]) {
      options.venue = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith('--venue=')) {
      options.venue = arg.slice('--venue='.length);
      continue;
    }
    if (arg === '--venue-id' && argv[index + 1]) {
      options.venueId = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith('--venue-id=')) {
      options.venueId = arg.slice('--venue-id='.length);
      continue;
    }
    if (arg === '--report-label' && argv[index + 1]) {
      options.reportLabel = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith('--report-label=')) {
      options.reportLabel = arg.slice('--report-label='.length);
      continue;
    }
    if (arg === '--snapshot-limit' && argv[index + 1]) {
      options.snapshotLimit = Number(argv[index + 1]) || options.snapshotLimit;
      index += 1;
      continue;
    }
    if (arg.startsWith('--snapshot-limit=')) {
      options.snapshotLimit = Number(arg.slice('--snapshot-limit='.length)) || options.snapshotLimit;
    }
  }

  return options;
}

function normalizeString(value) {
  return String(value ?? '').trim();
}

function normalizeLower(value) {
  return normalizeString(value).toLowerCase();
}

function slugify(value) {
  return normalizeLower(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function makeKeywordBag(value) {
  const stopWords = new Set([
    'the',
    'and',
    'with',
    'for',
    'at',
    'our',
    'your',
    'night',
    'theatre',
    'harbourfront',
    'live',
    'event',
    'show',
    'tour',
    'presents',
    'performing',
    'music',
    'celebrating',
  ]);

  return slugify(value)
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !stopWords.has(token));
}

function familyKey(name) {
  return makeKeywordBag(name).join(' ');
}

function extractEvents(snapshotData) {
  if (Array.isArray(snapshotData?.events) && snapshotData.events.length) return snapshotData.events;
  if (Array.isArray(snapshotData?.stages)) {
    const formatStage = snapshotData.stages.find((stage) => stage.stage === 'format');
    if (Array.isArray(formatStage?.output?.events)) return formatStage.output.events;
  }
  return [];
}

function extractOcrText(combinedText) {
  const text = normalizeString(combinedText);
  if (!text) return '';
  const marker = /OCR TEXT:/i;
  if (!marker.test(text)) return '';
  return text.split(marker).slice(1).join(' ').trim();
}

function toMillis(value) {
  const parsed = Date.parse(normalizeString(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function overlapStats(title, text) {
  const titleTokens = makeKeywordBag(title);
  const haystack = slugify(text);
  const matched = titleTokens.filter((token) => haystack.includes(token));
  return {
    titleTokens,
    matchedTokens: matched,
    matchedCount: matched.length,
    titleTokenCount: titleTokens.length,
  };
}

function scoreSnapshotForDoc(snapshot, liveDoc) {
  const name = normalizeLower(liveDoc.name);
  const inputText = normalizeLower(snapshot.inputText || '');
  const eventNames = extractEvents(snapshot).map((event) => normalizeLower(event?.name || ''));
  const combinedEventNames = eventNames.join('\n');
  const tokens = makeKeywordBag(liveDoc.name);

  let score = 0;
  if (eventNames.some((eventName) => eventName.includes(name))) score += 120;
  if (combinedEventNames.includes(name)) score += 80;
  if (inputText.includes(name)) score += 50;
  score += tokens.filter((token) => inputText.includes(token) || combinedEventNames.includes(token)).length * 10;
  return score;
}

async function resolveVenue(options) {
  if (options.venueId) {
    const doc = await db.collection('venues').doc(options.venueId).get();
    if (!doc.exists) throw new Error(`Venue id not found: ${options.venueId}`);
    return { id: doc.id, path: doc.ref.path, name: normalizeString(doc.data()?.pagename || doc.data()?.name || doc.id) };
  }

  if (!options.venue) {
    throw new Error('Provide --venue or --venue-id');
  }

  const wanted = normalizeLower(options.venue);
  const snap = await db.collection('venues').get();
  const matches = snap.docs
    .map((doc) => ({
      id: doc.id,
      path: doc.ref.path,
      name: normalizeString(doc.data()?.pagename || doc.data()?.name || doc.id),
    }))
    .filter((venue) => normalizeLower(venue.name) === wanted || normalizeLower(venue.id) === wanted);

  if (matches.length === 1) return matches[0];

  const fuzzy = snap.docs
    .map((doc) => ({
      id: doc.id,
      path: doc.ref.path,
      name: normalizeString(doc.data()?.pagename || doc.data()?.name || doc.id),
    }))
    .filter((venue) => normalizeLower(venue.name).includes(wanted) || normalizeLower(venue.id).includes(wanted));

  if (fuzzy.length === 1) return fuzzy[0];
  if (fuzzy.length === 0) throw new Error(`Venue not found: ${options.venue}`);
  throw new Error(`Venue search ambiguous for "${options.venue}": ${fuzzy.map((venue) => venue.name).join(', ')}`);
}

async function loadLiveDocs(venue) {
  const snap = await db.collection('venues').doc(venue.id).collection('events').get();
  return snap.docs
    .map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        path: doc.ref.path,
        name: normalizeString(data.name || data.eventName),
        description: normalizeString(data.description),
        startDate: normalizeString(data.startDate),
      endDate: normalizeString(data.endDate),
      startTime: normalizeString(data.startTime),
      endTime: normalizeString(data.endTime),
      updatedAt: typeof data.updatedAt?.toDate === 'function' ? data.updatedAt.toDate().toISOString() : '',
      lastSeenAt: typeof data.lastSeenAt?.toDate === 'function' ? data.lastSeenAt.toDate().toISOString() : '',
      image: normalizeString(data.relevantImageUrl || data.image),
      mediaUrls: Array.isArray(data.mediaUrls) ? data.mediaUrls.map((url) => normalizeString(url)).filter(Boolean) : [],
        raw: data,
      };
    })
    .filter((doc) => doc.name && doc.startDate);
}

async function loadVenueSnapshots(venueId, limit) {
  const results = [];
  let cursor = null;

  for (let page = 0; page < 20 && results.length < limit; page += 1) {
    let query = db.collection('parse_snapshots').orderBy('createdAt', 'desc').limit(250);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const data = doc.data() || {};
      if (normalizeString(data.venueId) !== venueId) continue;
      results.push({
        id: doc.id,
        fileId: normalizeString(data.fileId),
        rowIndex: Number(data.rowIndex),
        createdAt: typeof data.createdAt?.toDate === 'function' ? data.createdAt.toDate().toISOString() : '',
        inputText: normalizeString(data.inputText),
        rowMeta: data.rowMeta || {},
        events: extractEvents(data),
        eventNames: extractEvents(data).map((event) => normalizeString(event?.name)),
      });
      if (results.length >= limit) break;
    }

    cursor = snap.docs[snap.docs.length - 1];
  }

  return results;
}

function buildSharedImageFlags(liveDocs) {
  const byImage = new Map();
  for (const doc of liveDocs) {
    if (!doc.image) continue;
    if (!byImage.has(doc.image)) byImage.set(doc.image, []);
    byImage.get(doc.image).push(doc);
  }

  const shared = new Map();
  for (const [image, docs] of byImage.entries()) {
    const families = new Map();
    for (const doc of docs) {
      const key = familyKey(doc.name) || slugify(doc.name);
      if (!families.has(key)) families.set(key, []);
      families.get(key).push({ id: doc.id, name: doc.name, startDate: doc.startDate });
    }
    if (families.size > 1) {
      shared.set(image, {
        image,
        distinctFamilyCount: families.size,
        families: [...families.values()],
      });
    }
  }
  return shared;
}

function analyzeDoc(doc, snapshots, sharedImageFlags) {
  const scored = snapshots
    .map((snapshot) => ({ snapshot, score: scoreSnapshotForDoc(snapshot, doc) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
  const best = scored[0] || null;
  const reasons = [];

  if (doc.image && sharedImageFlags.has(doc.image)) {
    const shared = sharedImageFlags.get(doc.image);
    reasons.push({
      type: 'shared_canonical_image',
      detail: `Canonical image is shared across ${shared.distinctFamilyCount} distinct event families at this venue.`,
      sharedFamilies: shared.families,
    });
  }

  if (best) {
    const snapshot = best.snapshot;
    const snapshotMedia = Array.isArray(snapshot.rowMeta?.mediaUrls)
      ? snapshot.rowMeta.mediaUrls.map((url) => normalizeString(url)).filter(Boolean)
      : [];
    const snapshotMillis = toMillis(snapshot.createdAt);
    const updatedMillis = toMillis(doc.updatedAt);
    const ocrText = extractOcrText(snapshot.inputText);
    const overlap = overlapStats(doc.name, ocrText);

    if (
      doc.image &&
      snapshotMedia.length > 0 &&
      !snapshotMedia.includes(doc.image) &&
      updatedMillis <= snapshotMillis
    ) {
      reasons.push({
        type: 'canonical_missing_from_latest_snapshot_media',
        detail: 'Live canonical image is not present in the latest matching snapshot media set.',
        snapshotId: snapshot.id,
        snapshotFileId: snapshot.fileId,
        snapshotRowIndex: snapshot.rowIndex,
        snapshotMedia,
      });
    }

    if (
      doc.image &&
      snapshotMedia.includes(doc.image) &&
      overlap.titleTokenCount >= 2 &&
      overlap.matchedCount === 0 &&
      ocrText.length >= 24
    ) {
      reasons.push({
        type: 'title_vs_snapshot_ocr_mismatch',
        detail: 'Snapshot OCR text does not contain any meaningful title tokens for the current event name.',
        snapshotId: snapshot.id,
        snapshotFileId: snapshot.fileId,
        snapshotRowIndex: snapshot.rowIndex,
        titleTokens: overlap.titleTokens,
        ocrPreview: ocrText.slice(0, 240),
      });
    }

    return {
      docId: doc.id,
      path: doc.path,
      name: doc.name,
      startDate: doc.startDate,
      image: doc.image,
      relevantImageUrl: normalizeString(doc.raw?.relevantImageUrl || doc.raw?.image),
      bestSnapshot: {
        id: snapshot.id,
        fileId: snapshot.fileId,
        rowIndex: snapshot.rowIndex,
        createdAt: snapshot.createdAt,
        score: best.score,
        eventNames: snapshot.eventNames,
        snapshotMedia: snapshotMedia.slice(0, 8),
      },
      reasons,
    };
  }

  return {
    docId: doc.id,
    path: doc.path,
    name: doc.name,
    startDate: doc.startDate,
    image: doc.image,
    relevantImageUrl: normalizeString(doc.raw?.relevantImageUrl || doc.raw?.image),
    bestSnapshot: null,
    reasons,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const venue = await resolveVenue(options);
  const [liveDocs, snapshots] = await Promise.all([
    loadLiveDocs(venue),
    loadVenueSnapshots(venue.id, options.snapshotLimit),
  ]);

  const sharedImageFlags = buildSharedImageFlags(liveDocs);
  const analyses = liveDocs
    .map((doc) => analyzeDoc(doc, snapshots, sharedImageFlags))
    .filter((analysis) => analysis.reasons.length > 0);

  const report = {
    generatedAt: new Date().toISOString(),
    options,
    venue,
    summary: {
      liveDocCount: liveDocs.length,
      snapshotCount: snapshots.length,
      flaggedDocCount: analyses.length,
      sharedImageFlagCount: analyses.filter((item) =>
        item.reasons.some((reason) => reason.type === 'shared_canonical_image')
      ).length,
      snapshotMediaMismatchCount: analyses.filter((item) =>
        item.reasons.some((reason) => reason.type === 'canonical_missing_from_latest_snapshot_media')
      ).length,
      ocrMismatchCount: analyses.filter((item) =>
        item.reasons.some((reason) => reason.type === 'title_vs_snapshot_ocr_mismatch')
      ).length,
    },
    flaggedDocs: analyses,
  };

  ensureDir(resultsDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const label = options.reportLabel ? `${options.reportLabel}-` : '';
  const reportPath = path.join(resultsDir, `${label}image-mismatch-review-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(
    JSON.stringify(
      {
        reportPath,
        venue,
        summary: report.summary,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
