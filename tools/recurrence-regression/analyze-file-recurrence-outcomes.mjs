import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const resultsDir = path.join(__dirname, 'results');
const requireFromRepo = createRequire(import.meta.url);
const admin = requireFromRepo(path.join(repoRoot, 'firebase', 'node_modules', 'firebase-admin'));
const serviceAccount = requireFromRepo(path.join(repoRoot, 'firebase', 'service-account.json'));

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

function parseArgs(argv) {
  let fileId = '';
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--file' && argv[index + 1]) {
      fileId = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg.startsWith('--file=')) {
      fileId = String(arg.slice('--file='.length)).trim();
    }
  }
  if (!fileId) {
    throw new Error('Usage: node tools/recurrence-regression/analyze-file-recurrence-outcomes.mjs --file <FILE_ID>');
  }
  return { fileId };
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

function normalizeIsoDate(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  if (typeof value?.toDate === 'function') {
    const date = value.toDate();
    return Number.isNaN(date?.getTime?.()) ? '' : date.toISOString().slice(0, 10);
  }
  if (typeof value?._seconds === 'number') {
    return new Date(value._seconds * 1000).toISOString().slice(0, 10);
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function timestampMs(value) {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') {
    const date = value.toDate();
    return Number.isNaN(date?.getTime?.()) ? 0 : date.getTime();
  }
  if (typeof value?._seconds === 'number') {
    return value._seconds * 1000 + Math.floor((value._nanoseconds || 0) / 1_000_000);
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function timestampIso(value) {
  const ms = timestampMs(value);
  return ms ? new Date(ms).toISOString() : '';
}

function normalizeFamilyName(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/\(session\s+\d+\s+of\s+\d+\)/gi, '')
    .replace(/\bsession\s+\d+\s+of\s+\d+\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function eventTimeKey(value) {
  const start = normalizeString(value?.startTime);
  const end = normalizeString(value?.endTime);
  return `${start}|${end}`;
}

function patternKey(value) {
  return normalizeLower(value?.recurringPattern || 'none') || 'none';
}

function isRecurringLike(value) {
  return (
    patternKey(value) !== 'none' ||
    normalizeBoolean(value?.isRecurring) ||
    Boolean(normalizeString(value?.recurrenceUntilDate)) ||
    Number.isFinite(Number(value?.totalOccurrences)) && Number(value?.totalOccurrences) > 1
  );
}

function sameWeekdayWeeklySeries(dates) {
  const normalizedDates = [...new Set(dates.map((value) => normalizeIsoDate(value)).filter(Boolean))].sort();
  if (normalizedDates.length < 2) return false;
  const first = new Date(`${normalizedDates[0]}T00:00:00Z`);
  if (Number.isNaN(first.getTime())) return false;
  const targetWeekday = first.getUTCDay();
  for (let index = 1; index < normalizedDates.length; index += 1) {
    const current = new Date(`${normalizedDates[index]}T00:00:00Z`);
    const previous = new Date(`${normalizedDates[index - 1]}T00:00:00Z`);
    if (Number.isNaN(current.getTime()) || Number.isNaN(previous.getTime())) return false;
    if (current.getUTCDay() !== targetWeekday) return false;
    const diffDays = Math.round((current.getTime() - previous.getTime()) / 86_400_000);
    if (diffDays !== 7) return false;
  }
  return true;
}

function extractSnapshotEvents(snapshotData) {
  const stages = Array.isArray(snapshotData?.stages) ? snapshotData.stages : [];
  const formatStage = stages.find((stage) => normalizeLower(stage?.stage) === 'format');
  const stageEvents = formatStage?.output?.events;
  return Array.isArray(stageEvents) ? stageEvents : [];
}

function summarizeFamily(entries, side) {
  const dates = [...new Set(entries.map((entry) => normalizeIsoDate(entry.startDate)).filter(Boolean))].sort();
  const times = [...new Set(entries.map((entry) => eventTimeKey(entry)))].sort();
  const patterns = [...new Set(entries.map((entry) => patternKey(entry)))].sort();
  return {
    side,
    name: normalizeString(entries[0]?.name || entries[0]?.eventName),
    familyName: normalizeFamilyName(entries[0]?.name || entries[0]?.eventName),
    count: entries.length,
    dates,
    timeSet: times,
    patternSet: patterns,
    recurringLike: entries.some((entry) => isRecurringLike(entry)),
    totalOccurrencesValues: [...new Set(entries.map((entry) => Number(entry.totalOccurrences || 0)).filter((value) => value > 0))].sort((a, b) => a - b),
    recurrenceUntilDates: [...new Set(entries.map((entry) => normalizeIsoDate(entry.recurrenceUntilDate)).filter(Boolean))].sort(),
    sample: entries.map((entry) => ({
      name: normalizeString(entry.name || entry.eventName),
      startDate: normalizeIsoDate(entry.startDate),
      endDate: normalizeIsoDate(entry.endDate),
      startTime: normalizeString(entry.startTime),
      endTime: normalizeString(entry.endTime),
      recurringPattern: patternKey(entry),
      isRecurring: normalizeBoolean(entry.isRecurring),
      totalOccurrences: Number.isFinite(Number(entry.totalOccurrences)) ? Number(entry.totalOccurrences) : null,
      recurrenceUntilDate: normalizeIsoDate(entry.recurrenceUntilDate),
      path: entry.path || '',
      updatedAt: entry.updatedAtIso || '',
    })),
  };
}

function buildFamilyMap(entries) {
  const byFamily = new Map();
  for (const entry of entries) {
    const familyName = normalizeFamilyName(entry.name || entry.eventName);
    if (!familyName) continue;
    const list = byFamily.get(familyName) || [];
    list.push(entry);
    byFamily.set(familyName, list);
  }
  return byFamily;
}

function compareFamilies(snapshotSummary, firestoreSummary, postBatchTouched) {
  const reasons = [];

  if (!snapshotSummary && firestoreSummary) {
    reasons.push('extra_in_firestore');
  } else if (snapshotSummary && !firestoreSummary) {
    reasons.push('missing_in_firestore');
  }

  if (snapshotSummary && firestoreSummary) {
    if (snapshotSummary.count !== firestoreSummary.count) {
      reasons.push('doc_count_mismatch');
    }
    if (snapshotSummary.recurringLike !== firestoreSummary.recurringLike) {
      reasons.push('recurrence_shape_mismatch');
    }
    if (JSON.stringify(snapshotSummary.patternSet) !== JSON.stringify(firestoreSummary.patternSet)) {
      reasons.push('recurring_pattern_mismatch');
    }
    if (JSON.stringify(snapshotSummary.timeSet) !== JSON.stringify(firestoreSummary.timeSet)) {
      reasons.push('time_set_mismatch');
    }
    if (
      snapshotSummary.recurringLike &&
      snapshotSummary.count === 1 &&
      firestoreSummary.count > 1 &&
      !firestoreSummary.recurringLike
    ) {
      reasons.push('snapshot_collapsed_but_firestore_split');
    }
    if (
      !snapshotSummary.recurringLike &&
      snapshotSummary.count > 1 &&
      firestoreSummary.recurringLike &&
      firestoreSummary.count === 1
    ) {
      reasons.push('snapshot_split_but_firestore_collapsed');
    }
  }

  return {
    postBatchTouched,
    reasons: [...new Set(reasons)],
    snapshot: snapshotSummary || null,
    firestore: firestoreSummary || null,
  };
}

function reportTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main() {
  const { fileId } = parseArgs(process.argv.slice(2));
  fs.mkdirSync(resultsDir, { recursive: true });

  const processedDoc = await db.collection('processed_datasets').doc(fileId).get();
  if (!processedDoc.exists) {
    throw new Error(`Processed dataset not found for file ${fileId}`);
  }

  const batchSnap = await db.collection('batch_states').where('fileId', '==', fileId).get();
  const batchStates = batchSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const batchEndMs = Math.max(
    timestampMs(processedDoc.data().processedAt),
    ...batchStates.map((entry) => timestampMs(entry.lastUpdatedAt)).filter(Boolean)
  );

  const parseSnap = await db.collection('parse_snapshots').where('fileId', '==', fileId).get();
  const latestSnapshotByRow = new Map();
  for (const doc of parseSnap.docs) {
    const data = doc.data();
    const rowIndex = Number(data.rowIndex || 0);
    if (!rowIndex) continue;
    const createdAtMs = timestampMs(data.createdAt);
    if (batchEndMs && createdAtMs > batchEndMs + 60_000) continue;
    const existing = latestSnapshotByRow.get(rowIndex);
    if (!existing || createdAtMs > existing.createdAtMs) {
      latestSnapshotByRow.set(rowIndex, {
        id: doc.id,
        rowIndex,
        createdAtMs,
        createdAtIso: timestampIso(data.createdAt),
        uniqueId: normalizeString(data.uniqueId),
        venueId: normalizeString(data.venueId),
        inputTextLength: Number(data.inputTextLength || 0) || 0,
        events: extractSnapshotEvents(data),
      });
    }
  }

  const allEventDocsSnap = await db.collectionGroup('events').get();
  const allEventDocs = allEventDocsSnap.docs.map((doc) => {
    const data = doc.data();
    return {
      path: doc.ref.path,
      name: normalizeString(data.name || data.eventName),
      startDate: normalizeIsoDate(data.startDate),
      endDate: normalizeIsoDate(data.endDate),
      startTime: normalizeString(data.startTime),
      endTime: normalizeString(data.endTime),
      recurringPattern: patternKey(data),
      isRecurring: normalizeBoolean(data.isRecurring),
      totalOccurrences: Number.isFinite(Number(data.totalOccurrences)) ? Number(data.totalOccurrences) : null,
      recurrenceUntilDate: normalizeIsoDate(data.recurrenceUntilDate),
      uniqueId: normalizeString(data.uniqueId),
      updatedAtMs: timestampMs(data.updatedAt),
      updatedAtIso: timestampIso(data.updatedAt),
    };
  });

  const collapsedRecurringFamilies = [];
  const splitRecurringCandidates = [];
  const divergenceFamilies = [];
  const postBatchTouchedFamilies = [];

  const rowSummaries = [];

  for (const rowSummary of [...latestSnapshotByRow.values()].sort((a, b) => a.rowIndex - b.rowIndex)) {
    const snapshotEvents = rowSummary.events.map((event) => ({
      name: normalizeString(event.name || event.eventName),
      startDate: normalizeIsoDate(event.startDate),
      endDate: normalizeIsoDate(event.endDate),
      startTime: normalizeString(event.startTime),
      endTime: normalizeString(event.endTime),
      recurringPattern: patternKey(event),
      isRecurring: normalizeBoolean(event.isRecurring),
      totalOccurrences: Number.isFinite(Number(event.totalOccurrences)) ? Number(event.totalOccurrences) : null,
      recurrenceUntilDate: normalizeIsoDate(event.recurrenceUntilDate),
    }));

    const prefix = rowSummary.uniqueId ? `${rowSummary.uniqueId}_` : '';
    const matchedFirestoreDocs = prefix
      ? allEventDocs.filter((doc) => doc.uniqueId.startsWith(prefix))
      : [];
    const postBatchTouched = matchedFirestoreDocs.some((doc) => doc.updatedAtMs > batchEndMs + 60_000);

    const snapshotFamilies = buildFamilyMap(snapshotEvents);
    const firestoreFamilies = buildFamilyMap(matchedFirestoreDocs);
    const familyNames = [...new Set([...snapshotFamilies.keys(), ...firestoreFamilies.keys()])].sort();

    const rowDivergences = [];
    for (const familyName of familyNames) {
      const snapshotFamilyEntries = snapshotFamilies.get(familyName) || [];
      const firestoreFamilyEntries = firestoreFamilies.get(familyName) || [];
      const snapshotSummary = snapshotFamilyEntries.length
        ? summarizeFamily(snapshotFamilyEntries, 'snapshot')
        : null;
      const firestoreSummary = firestoreFamilyEntries.length
        ? summarizeFamily(firestoreFamilyEntries, 'firestore')
        : null;
      const comparison = compareFamilies(snapshotSummary, firestoreSummary, postBatchTouched);

      if (comparison.reasons.length === 0 && snapshotSummary?.recurringLike) {
        collapsedRecurringFamilies.push({
          rowIndex: rowSummary.rowIndex,
          snapshotId: rowSummary.id,
          uniqueId: rowSummary.uniqueId,
          venueId: rowSummary.venueId,
          familyName,
          summary: snapshotSummary,
        });
      }

      if (comparison.reasons.length > 0) {
        const entry = {
          rowIndex: rowSummary.rowIndex,
          snapshotId: rowSummary.id,
          uniqueId: rowSummary.uniqueId,
          venueId: rowSummary.venueId,
          familyName,
          ...comparison,
        };
        rowDivergences.push(entry);
        divergenceFamilies.push(entry);
        if (postBatchTouched) {
          postBatchTouchedFamilies.push(entry);
        }
      }
    }

    const splitGroupsByKey = new Map();
    for (const event of snapshotEvents) {
      if (isRecurringLike(event)) continue;
      const key = [
        normalizeFamilyName(event.name),
        normalizeLower(event.startTime),
        normalizeLower(event.endTime),
      ].join('|');
      const list = splitGroupsByKey.get(key) || [];
      list.push(event);
      splitGroupsByKey.set(key, list);
    }

    const rowSplitCandidates = [];
    for (const [key, entries] of splitGroupsByKey.entries()) {
      if (entries.length < 2) continue;
      const dates = entries.map((entry) => entry.startDate).filter(Boolean).sort();
      if (!sameWeekdayWeeklySeries(dates)) continue;
      const [familyName, startTime, endTime] = key.split('|');
      const candidate = {
        rowIndex: rowSummary.rowIndex,
        snapshotId: rowSummary.id,
        uniqueId: rowSummary.uniqueId,
        venueId: rowSummary.venueId,
        familyName,
        name: entries[0].name,
        count: entries.length,
        dates,
        startTime,
        endTime,
        description: '',
      };
      rowSplitCandidates.push(candidate);
      splitRecurringCandidates.push(candidate);
    }

    rowSummaries.push({
      rowIndex: rowSummary.rowIndex,
      snapshotId: rowSummary.id,
      createdAtIso: rowSummary.createdAtIso,
      uniqueId: rowSummary.uniqueId,
      venueId: rowSummary.venueId,
      snapshotEventCount: snapshotEvents.length,
      matchedFirestoreDocCount: matchedFirestoreDocs.length,
      postBatchTouched,
      recurringSnapshotFamilyCount: [...snapshotFamilies.values()]
        .map((entries) => summarizeFamily(entries, 'snapshot'))
        .filter((summary) => summary.recurringLike)
        .length,
      splitCandidateCount: rowSplitCandidates.length,
      divergenceCount: rowDivergences.length,
    });
  }

  const report = {
    fileId,
    generatedAt: new Date().toISOString(),
    batchWindow: {
      startedAt: batchStates
        .map((entry) => timestampIso(entry.startedAt))
        .filter(Boolean)
        .sort()[0] || '',
      completedAt: batchEndMs ? new Date(batchEndMs).toISOString() : '',
    },
    processedDataset: processedDoc.data(),
    snapshotRowCount: latestSnapshotByRow.size,
    collapsedRecurringFamiliesCount: collapsedRecurringFamilies.length,
    splitRecurringCandidatesCount: splitRecurringCandidates.length,
    divergenceFamiliesCount: divergenceFamilies.length,
    postBatchTouchedFamiliesCount: postBatchTouchedFamilies.length,
    collapsedRecurringFamilies,
    splitRecurringCandidates,
    divergenceFamilies,
    postBatchTouchedFamilies,
    rowSummaries,
  };

  const outputPath = path.join(
    resultsDir,
    `${fileId}-bucketed-recurrence-audit-${reportTimestamp()}.json`
  );
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({
    fileId: report.fileId,
    outputPath,
    snapshotRowCount: report.snapshotRowCount,
    collapsedRecurringFamiliesCount: report.collapsedRecurringFamiliesCount,
    splitRecurringCandidatesCount: report.splitRecurringCandidatesCount,
    divergenceFamiliesCount: report.divergenceFamiliesCount,
    postBatchTouchedFamiliesCount: report.postBatchTouchedFamiliesCount,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
