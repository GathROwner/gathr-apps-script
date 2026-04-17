import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const resultsDir = path.join(__dirname, 'results');
const processUrl = process.env.PROCESS_DATASET_URL || 'https://processdataset-6ju7yi5g2a-pd.a.run.app';
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
    targets: [],
    explicitRows: [],
    applyCleanup: false,
    rerun: false,
    reportLabel: '',
    maxSnapshotCandidates: 8,
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

    if (arg === '--target' && argv[index + 1]) {
      options.targets.push(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith('--target=')) {
      options.targets.push(arg.slice('--target='.length));
      continue;
    }

    if (arg === '--row' && argv[index + 1]) {
      options.explicitRows.push(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith('--row=')) {
      options.explicitRows.push(arg.slice('--row='.length));
      continue;
    }

    if (arg === '--apply-cleanup') {
      options.applyCleanup = true;
      continue;
    }

    if (arg === '--rerun') {
      options.rerun = true;
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

    if (arg === '--max-snapshot-candidates' && argv[index + 1]) {
      options.maxSnapshotCandidates = Number(argv[index + 1]) || options.maxSnapshotCandidates;
      index += 1;
      continue;
    }

    if (arg.startsWith('--max-snapshot-candidates=')) {
      options.maxSnapshotCandidates = Number(arg.slice('--max-snapshot-candidates='.length)) || options.maxSnapshotCandidates;
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

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  const lowered = normalizeLower(value);
  if (['yes', 'true', '1'].includes(lowered)) return true;
  if (['no', 'false', '0', ''].includes(lowered)) return false;
  return Boolean(value);
}

function normalizeNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeIsoDate(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  if (typeof value?.toDate === 'function') {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  }
  if (typeof value?._seconds === 'number') {
    return new Date(value._seconds * 1000).toISOString().slice(0, 10);
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function normalizeTimestamp(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value;
  if (typeof value?.toDate === 'function') {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  }
  if (typeof value?._seconds === 'number') {
    return new Date(value._seconds * 1000 + Math.floor((value._nanoseconds || 0) / 1e6)).toISOString();
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  }
  return '';
}

function toMillis(value) {
  const iso = normalizeTimestamp(value);
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : 0;
}

function flattenDoc(pathName, data) {
  return {
    path: pathName,
    exists: Boolean(data),
    id: path.basename(pathName),
    name: normalizeString(data?.name || data?.eventName),
    description: normalizeString(data?.description),
    startDate: normalizeIsoDate(data?.startDate),
    endDate: normalizeIsoDate(data?.endDate),
    startTime: normalizeString(data?.startTime),
    endTime: normalizeString(data?.endTime),
    isRecurring: normalizeBoolean(data?.isRecurring),
    recurringPattern: normalizeLower(data?.recurringPattern),
    recurrenceUntilDate: normalizeIsoDate(data?.recurrenceUntilDate),
    totalOccurrences: normalizeNumber(data?.totalOccurrences),
    uniqueId: normalizeString(data?.uniqueId),
    updatedAt: normalizeTimestamp(data?.updatedAt),
    sourceUrl: normalizeString(data?.sourceUrl),
    raw: data || null,
  };
}

function extractEvents(snapshotData) {
  if (Array.isArray(snapshotData?.events) && snapshotData.events.length) return snapshotData.events;
  if (Array.isArray(snapshotData?.stages)) {
    const formatStage = snapshotData.stages.find((stage) => stage.stage === 'format');
    if (Array.isArray(formatStage?.output?.events)) return formatStage.output.events;
  }
  return [];
}

function makeKeywordBag(value) {
  return normalizeLower(value)
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function matchesTargetText(haystack, target) {
  const loweredHaystack = normalizeLower(haystack);
  const loweredTarget = normalizeLower(target);
  if (!loweredTarget) return false;
  if (loweredHaystack.includes(loweredTarget)) return true;
  const targetTokens = makeKeywordBag(loweredTarget);
  return targetTokens.length > 0 && targetTokens.every((token) => loweredHaystack.includes(token));
}

function docMatchesAnyTarget(doc, targets) {
  const haystack = `${normalizeString(doc.name)}\n${normalizeString(doc.description)}`;
  return targets.some((target) => matchesTargetText(haystack, target));
}

function scoreSnapshotForTarget(snapshot, target) {
  const loweredTarget = normalizeLower(target);
  const inputText = normalizeLower(snapshot.inputText || snapshot.inputPreview || '');
  const eventNames = (snapshot.eventNames || []).map((name) => normalizeLower(name));
  const combinedEventNames = eventNames.join('\n');
  const eventCount = extractEvents(snapshot).length || (snapshot.eventNames || []).length || 0;
  const formatStage = Array.isArray(snapshot.stages) ? snapshot.stages.find((stage) => stage.stage === 'format') : null;
  const skipReason = formatStage?.output?.skipReason;

  let score = 0;

  if (eventNames.some((name) => name.includes(loweredTarget))) score += 100;
  if (combinedEventNames.includes(loweredTarget)) score += 60;
  if (inputText.includes(loweredTarget)) score += 45;

  const tokens = makeKeywordBag(target);
  score += tokens.filter((token) => inputText.includes(token) || combinedEventNames.includes(token)).length * 8;

  if (eventCount > 0) score += 20;
  if (skipReason) score -= 50;

  const penaltyTerms = ['thank you', 'joined us this morning', 'mark your calendars', 'next session', 'tomorrow'];
  if (penaltyTerms.some((term) => inputText.includes(term))) score -= 15;

  score += Math.min(20, Math.floor(toMillis(snapshot.createdAt) / 86_400_000));
  return score;
}

function dedupeRows(rowSpecs) {
  const seen = new Set();
  const unique = [];
  for (const rowSpec of rowSpecs) {
    const key = `${rowSpec.fileId}:${rowSpec.rowIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(rowSpec);
  }
  return unique;
}

function parseExplicitRow(value) {
  const [fileId, rowIndexRaw] = String(value).split(':');
  const rowIndex = Number(rowIndexRaw);
  if (!fileId || !Number.isFinite(rowIndex)) return null;
  return { fileId, rowIndex };
}

async function resolveVenue(options) {
  if (options.venueId) {
    const snap = await db.collection('venues').doc(options.venueId).get();
    if (!snap.exists) {
      throw new Error(`Venue id not found: ${options.venueId}`);
    }
    return { id: snap.id, path: `venues/${snap.id}`, ...snap.data() };
  }

  if (!options.venue) {
    throw new Error('Provide --venue or --venue-id');
  }

  const wanted = normalizeLower(options.venue);
  const snap = await db.collection('venues').get();
  const venues = snap.docs.map((doc) => ({ id: doc.id, path: `venues/${doc.id}`, ...doc.data() }));
  const exact = venues.find((venue) => normalizeLower(venue.name) === wanted || normalizeLower(venue.id) === wanted);
  if (exact) return exact;

  const partials = venues.filter((venue) => normalizeLower(venue.name).includes(wanted) || normalizeLower(venue.id).includes(wanted));
  if (partials.length === 1) return partials[0];
  if (partials.length > 1) {
    throw new Error(`Venue name is ambiguous: ${options.venue}. Matches: ${partials.map((venue) => venue.name || venue.id).join(', ')}`);
  }

  throw new Error(`Venue not found: ${options.venue}`);
}

async function fetchVenueDocs(venueId) {
  const snap = await db.collection('venues').doc(venueId).collection('events').get();
  return snap.docs.map((doc) => flattenDoc(`venues/${venueId}/events/${doc.id}`, doc.data()));
}

async function fetchVenueSnapshots(venueId) {
  const snap = await db.collection('parse_snapshots').where('venueId', '==', venueId).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function summarizeSnapshot(snapshot) {
  const events = extractEvents(snapshot).map((event) => ({
    name: normalizeString(event.name),
    startDate: normalizeIsoDate(event.startDate),
    endDate: normalizeIsoDate(event.endDate),
    startTime: normalizeString(event.startTime),
    endTime: normalizeString(event.endTime),
    isRecurring: normalizeBoolean(event.isRecurring),
    recurringPattern: normalizeLower(event.recurringPattern),
    recurrenceUntilDate: normalizeIsoDate(event.recurrenceUntilDate),
    totalOccurrences: normalizeNumber(event.totalOccurrences),
  }));

  return {
    id: snapshot.id,
    fileId: snapshot.fileId,
    rowIndex: snapshot.rowIndex,
    createdAt: normalizeTimestamp(snapshot.createdAt),
    eventCount: events.length,
    eventNames: events.map((event) => event.name),
    inputPreview: normalizeString(snapshot.inputPreview || snapshot.inputText),
    skipReason: Array.isArray(snapshot.stages)
      ? snapshot.stages.find((stage) => stage.stage === 'format')?.output?.skipReason || null
      : null,
    events,
  };
}

function buildTargetAnalysis(targets, liveDocs, snapshots, maxSnapshotCandidates) {
  return targets.map((target) => {
    const matchingDocs = liveDocs.filter((doc) => docMatchesAnyTarget(doc, [target]));
    const rankedSnapshots = snapshots
      .map((snapshot) => ({
        score: scoreSnapshotForTarget(snapshot, target),
        snapshot: summarizeSnapshot(snapshot),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || right.snapshot.createdAt.localeCompare(left.snapshot.createdAt))
      .slice(0, maxSnapshotCandidates);

    return {
      target,
      liveDocs: matchingDocs,
      candidateSnapshots: rankedSnapshots,
      suggestedRow: rankedSnapshots[0]
        ? {
            fileId: rankedSnapshots[0].snapshot.fileId,
            rowIndex: rankedSnapshots[0].snapshot.rowIndex,
            snapshotId: rankedSnapshots[0].snapshot.id,
            score: rankedSnapshots[0].score,
          }
        : null,
    };
  });
}

function mergeTargetAnalysis(beforeAnalysis, afterAnalysis) {
  const beforeByTarget = new Map(beforeAnalysis.map((entry) => [entry.target, entry]));
  const afterByTarget = new Map(afterAnalysis.map((entry) => [entry.target, entry]));
  const targets = Array.from(new Set([...beforeByTarget.keys(), ...afterByTarget.keys()]));

  return targets.map((target) => {
    const beforeEntry = beforeByTarget.get(target) || {
      target,
      liveDocs: [],
      candidateSnapshots: [],
      suggestedRow: null,
    };
    const afterEntry = afterByTarget.get(target) || beforeEntry;

    return {
      target,
      liveDocs: afterEntry.liveDocs,
      beforeLiveDocs: beforeEntry.liveDocs,
      afterLiveDocs: afterEntry.liveDocs,
      candidateSnapshots: beforeEntry.candidateSnapshots,
      suggestedRow: beforeEntry.suggestedRow,
    };
  });
}

async function backupAndDeleteDocs(docs, reportStem) {
  if (!docs.length) return { backupPath: null, deletedCount: 0 };

  const backupPath = path.join(repoRoot, 'firebase', `${reportStem}-cleanup-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      {
        deletedAt: new Date().toISOString(),
        count: docs.length,
        docs,
      },
      null,
      2,
    ),
  );

  for (let index = 0; index < docs.length; index += 400) {
    const batch = db.batch();
    for (const doc of docs.slice(index, index + 400)) {
      batch.delete(db.doc(doc.path));
    }
    await batch.commit();
  }

  return { backupPath, deletedCount: docs.length };
}

async function rerunRows(rowSpecs) {
  const grouped = new Map();
  for (const rowSpec of rowSpecs) {
    const existing = grouped.get(rowSpec.fileId) || [];
    existing.push(rowSpec.rowIndex);
    grouped.set(rowSpec.fileId, existing);
  }

  const runs = [];
  for (const [fileId, rowIndexes] of grouped.entries()) {
    const body = {
      fileId,
      rowIndexes: Array.from(new Set(rowIndexes)).sort((left, right) => left - right),
      dryRun: false,
      parserMode: 'full5stage',
    };
    const startedAt = new Date().toISOString();
    const response = await fetch(processUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const bodyText = await response.text();
    let parsedBody = bodyText;
    try {
      parsedBody = JSON.parse(bodyText);
    } catch {
      // keep text body
    }

    runs.push({
      fileId,
      rowIndexes: body.rowIndexes,
      processUrl,
      startedAt,
      status: response.status,
      ok: response.ok,
      response: parsedBody,
    });
  }

  return runs;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchLatestSnapshotsForRows(rowSpecs, rerunResults) {
  const byFileId = new Map();
  for (const rowSpec of rowSpecs) {
    const rows = byFileId.get(rowSpec.fileId) || [];
    rows.push(rowSpec);
    byFileId.set(rowSpec.fileId, rows);
  }

  const latest = [];
  for (const [fileId, rows] of byFileId.entries()) {
    const rerun = rerunResults.find((result) => result.fileId === fileId);
    const thresholdMs = Date.parse(rerun?.startedAt || new Date().toISOString());

    let fileSnapshots = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const snap = await db.collection('parse_snapshots').where('fileId', '==', fileId).get();
      fileSnapshots = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const readyRows = rows.filter((row) =>
        fileSnapshots.some((snapshot) => snapshot.rowIndex === row.rowIndex && toMillis(snapshot.createdAt) >= thresholdMs),
      );
      if (readyRows.length === rows.length) break;
      await sleep(5000);
    }

    for (const row of rows) {
      const candidates = fileSnapshots
        .filter((snapshot) => snapshot.rowIndex === row.rowIndex && toMillis(snapshot.createdAt) >= thresholdMs)
        .sort((left, right) => toMillis(right.createdAt) - toMillis(left.createdAt));

      latest.push({
        fileId,
        rowIndex: row.rowIndex,
        latestSnapshot: candidates[0] ? summarizeSnapshot(candidates[0]) : null,
      });
    }
  }

  return latest;
}

function buildSummary(afterDocs, targets) {
  return {
    targetCount: targets.length,
    liveDocCount: afterDocs.length,
    recurringCount: afterDocs.filter((doc) => doc.isRecurring).length,
    oneOffCount: afterDocs.filter((doc) => !doc.isRecurring).length,
  };
}

function slugify(value) {
  return normalizeLower(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'venue-review';
}

async function main() {
  ensureDir(resultsDir);
  const options = parseArgs(process.argv.slice(2));
  if (!options.targets.length) {
    throw new Error('Provide at least one --target');
  }

  const venue = await resolveVenue(options);
  const beforeDocs = await fetchVenueDocs(venue.id);
  const relevantBeforeDocs = beforeDocs.filter((doc) => docMatchesAnyTarget(doc, options.targets));
  const snapshots = await fetchVenueSnapshots(venue.id);
  const beforeTargetAnalysis = buildTargetAnalysis(
    options.targets,
    beforeDocs,
    snapshots,
    options.maxSnapshotCandidates,
  );

  const explicitRows = options.explicitRows.map(parseExplicitRow).filter(Boolean);
  const suggestedRows = beforeTargetAnalysis.map((entry) => entry.suggestedRow).filter(Boolean);
  const rowsToRerun = explicitRows.length ? dedupeRows(explicitRows) : dedupeRows(suggestedRows);

  const reportStem = `${options.reportLabel ? slugify(options.reportLabel) : slugify(`${venue.name || venue.id}-${options.targets.join('-')}`)}-venue-review`;

  let cleanup = { backupPath: null, deletedCount: 0 };
  if (options.applyCleanup && relevantBeforeDocs.length) {
    cleanup = await backupAndDeleteDocs(relevantBeforeDocs, reportStem);
  }

  let rerunResults = [];
  let latestSnapshots = [];
  if (options.rerun && rowsToRerun.length) {
    rerunResults = await rerunRows(rowsToRerun);
    latestSnapshots = await fetchLatestSnapshotsForRows(rowsToRerun, rerunResults);
  }

  const afterDocs = await fetchVenueDocs(venue.id);
  const relevantAfterDocs = afterDocs.filter((doc) => docMatchesAnyTarget(doc, options.targets));
  const afterTargetAnalysis = buildTargetAnalysis(
    options.targets,
    afterDocs,
    snapshots,
    options.maxSnapshotCandidates,
  );
  const targetAnalysis = mergeTargetAnalysis(beforeTargetAnalysis, afterTargetAnalysis);

  const report = {
    generatedAt: new Date().toISOString(),
    processUrl,
    options: {
      venue: options.venue,
      venueId: options.venueId,
      targets: options.targets,
      explicitRows,
      applyCleanup: options.applyCleanup,
      rerun: options.rerun,
      reportLabel: options.reportLabel,
    },
    venue: {
      id: venue.id,
      path: venue.path,
      name: normalizeString(venue.name),
    },
    summary: buildSummary(relevantAfterDocs, options.targets),
    targetAnalysis,
    before: {
      relevantDocs: relevantBeforeDocs,
      targetAnalysis: beforeTargetAnalysis,
    },
    cleanup,
    rerun: {
      rows: rowsToRerun,
      calls: rerunResults,
      latestSnapshots,
    },
    after: {
      relevantDocs: relevantAfterDocs,
      targetAnalysis: afterTargetAnalysis,
    },
  };

  const reportPath = path.join(resultsDir, `${reportStem}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(
    JSON.stringify(
      {
        reportPath,
        venue: report.venue,
        summary: report.summary,
        cleanup,
        rerunRows: rowsToRerun,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
