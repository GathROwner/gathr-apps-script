import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const fixturesPath = path.join(__dirname, 'fixtures', 'live-wet-cases.json');
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

function parseArgs(argv) {
  const selectedCaseIds = [];
  const options = {
    cleanupStale: false,
    cases: selectedCaseIds,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--cleanup-stale') {
      options.cleanupStale = true;
      continue;
    }
    if (arg === '--case' && argv[index + 1]) {
      selectedCaseIds.push(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith('--case=')) {
      selectedCaseIds.push(arg.slice('--case='.length));
    }
  }

  return options;
}

function loadFixtures() {
  return JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
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
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => normalizeLower(entry)).filter(Boolean);
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

function normalizeTimestamp(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value;
  if (typeof value?.toDate === 'function') {
    const date = value.toDate();
    return Number.isNaN(date?.getTime?.()) ? '' : date.toISOString();
  }
  if (typeof value?._seconds === 'number') {
    return new Date(value._seconds * 1000).toISOString();
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  }
  return '';
}

function pickName(data) {
  return normalizeString(data?.name || data?.eventName);
}

function flattenDoc(pathName, data) {
  return {
    path: pathName,
    exists: Boolean(data),
    id: path.basename(pathName),
    name: pickName(data),
    eventName: normalizeString(data?.eventName),
    description: normalizeString(data?.description),
    startDate: normalizeIsoDate(data?.startDate),
    endDate: normalizeIsoDate(data?.endDate),
    startTime: normalizeString(data?.startTime),
    endTime: normalizeString(data?.endTime),
    recurringPattern: normalizeLower(data?.recurringPattern),
    recurrenceUntilDate: normalizeIsoDate(data?.recurrenceUntilDate),
    totalOccurrences: normalizeNumber(data?.totalOccurrences),
    isRecurring: normalizeBoolean(data?.isRecurring),
    recurringDaysOfWeek: normalizeArray(data?.recurringDaysOfWeek),
    recurringWeekdaySequence: normalizeArray(data?.recurringWeekdaySequence),
    recurringWeekInterval: normalizeNumber(data?.recurringWeekInterval),
    updatedAt: normalizeTimestamp(data?.updatedAt),
    lastSeenAt: normalizeTimestamp(data?.lastSeenAt),
    raw: data || null,
  };
}

function matchesKeyword(doc, keyword) {
  const haystack = `${normalizeLower(doc.name)}\n${normalizeLower(doc.eventName)}\n${normalizeLower(doc.description)}`;
  return haystack.includes(normalizeLower(keyword));
}

function isCaseRelevantDoc(doc, testCase) {
  return Array.isArray(testCase.keywordsAny) && testCase.keywordsAny.some((keyword) => matchesKeyword(doc, keyword));
}

function getComparableValue(doc, key) {
  switch (key) {
    case 'path':
      return normalizeString(doc.path);
    case 'exactName':
      return normalizeString(doc.name);
    case 'nameIncludes':
      return normalizeLower(doc.name);
    case 'descriptionIncludes':
      return normalizeLower(doc.description);
    case 'startDate':
      return normalizeIsoDate(doc.startDate);
    case 'endDate':
      return normalizeIsoDate(doc.endDate);
    case 'startTime':
      return normalizeString(doc.startTime);
    case 'endTime':
      return normalizeString(doc.endTime);
    case 'recurringPattern':
      return normalizeLower(doc.recurringPattern);
    case 'recurrenceUntilDate':
      return normalizeIsoDate(doc.recurrenceUntilDate);
    case 'totalOccurrences':
      return normalizeNumber(doc.totalOccurrences);
    case 'isRecurring':
      return normalizeBoolean(doc.isRecurring);
    case 'recurringDaysOfWeek':
      return normalizeArray(doc.recurringDaysOfWeek);
    case 'recurringWeekdaySequence':
      return normalizeArray(doc.recurringWeekdaySequence);
    case 'recurringWeekInterval':
      return normalizeNumber(doc.recurringWeekInterval);
    default:
      return doc[key];
  }
}

function matcherPasses(doc, matcher) {
  return Object.entries(matcher).every(([key, expected]) => {
    const actual = getComparableValue(doc, key);

    if (key === 'nameIncludes' || key === 'descriptionIncludes') {
      return actual.includes(normalizeLower(expected));
    }

    if (Array.isArray(expected)) {
      return JSON.stringify(actual) === JSON.stringify(expected.map((value) => normalizeLower(value)));
    }

    if (typeof expected === 'boolean') {
      return actual === expected;
    }

    if (typeof expected === 'number') {
      return actual === expected;
    }

    return normalizeString(actual) === normalizeString(expected);
  });
}

function findFirstMatch(docs, matcher) {
  return docs.find((doc) => matcherPasses(doc, matcher)) || null;
}

function findAllMatches(docs, matcher) {
  return docs.filter((doc) => matcherPasses(doc, matcher));
}

async function fetchDoc(pathName) {
  const snap = await db.doc(pathName).get();
  return flattenDoc(pathName, snap.exists ? snap.data() : null);
}

async function fetchCaseDocs(testCase) {
  const watchedDocs = [];
  for (const pathName of testCase.watchPaths || []) {
    watchedDocs.push(await fetchDoc(pathName));
  }

  const venueSnap = await db.collection('venues').doc(testCase.venueId).collection('events').get();
  const relevantDocs = venueSnap.docs
    .map((doc) => flattenDoc(`venues/${testCase.venueId}/events/${doc.id}`, doc.data()))
    .filter((doc) => isCaseRelevantDoc(doc, testCase));

  const byPath = new Map();
  for (const doc of [...watchedDocs, ...relevantDocs]) {
    byPath.set(doc.path, doc);
  }

  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

async function fetchLatestSnapshot(testCase, runStartedAtIso) {
  const snap = await db
    .collection('parse_snapshots')
    .where('fileId', '==', testCase.fileId)
    .where('rowIndex', '==', testCase.rowIndex)
    .get();

  const thresholdMs = Date.parse(runStartedAtIso);
  const candidates = snap.docs
    .map((doc) => {
      const data = doc.data();
      const createdAt = normalizeTimestamp(data.createdAt);
      const formatStage = Array.isArray(data.stages)
        ? data.stages.find((stage) => stage.stage === 'format')
        : null;
      return {
        id: doc.id,
        createdAt,
        createdAtMs: createdAt ? Date.parse(createdAt) : 0,
        eventCount: Array.isArray(data.events)
          ? data.events.length
          : Array.isArray(formatStage?.output?.events)
            ? formatStage.output.events.length
            : data.eventCount ?? null,
        parserMode: normalizeString(data.rowMeta?.parserMode),
        error: normalizeString(data.error),
      };
    })
    .filter((entry) => Number.isFinite(entry.createdAtMs) && entry.createdAtMs >= thresholdMs)
    .sort((left, right) => right.createdAtMs - left.createdAtMs);

  return candidates[0] || null;
}

async function callWetRun(testCase) {
  const response = await fetch(processUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileId: testCase.fileId,
      rowIndexes: [testCase.rowIndex],
      dryRun: false,
      parserMode: 'full5stage',
    }),
    signal: AbortSignal.timeout(9 * 60 * 1000),
  });

  const bodyText = await response.text();
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = bodyText;
  }

  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

function evaluateCase(testCase, docs) {
  const failures = [];
  const relevantExisting = docs.filter((doc) => doc.exists && isCaseRelevantDoc(doc, testCase));
  const expectedMatches = [];
  const forbiddenMatches = [];

  if (Number.isFinite(testCase.expectedDocCountExact) && relevantExisting.length !== testCase.expectedDocCountExact) {
    failures.push(`expected ${testCase.expectedDocCountExact} relevant docs, found ${relevantExisting.length}`);
  }

  for (const matcher of testCase.expectedDocs || []) {
    const match = findFirstMatch(docs, matcher);
    if (!match) {
      failures.push(`missing expected doc: ${JSON.stringify(matcher)}`);
      continue;
    }
    expectedMatches.push({
      matcher,
      doc: match,
    });
  }

  for (const matcher of testCase.forbiddenDocs || []) {
    for (const match of findAllMatches(docs.filter((doc) => doc.exists), matcher)) {
      forbiddenMatches.push({
        matcher,
        doc: match,
      });
    }
  }

  if (forbiddenMatches.length) {
    failures.push(`found ${forbiddenMatches.length} forbidden doc(s)`);
  }

  return {
    success: failures.length === 0,
    failures,
    expectedMatches,
    forbiddenMatches,
  };
}

async function cleanupDocs(testCase, docs) {
  const deleted = [];
  for (const matcher of testCase.cleanupDocs || []) {
    const matches = findAllMatches(docs.filter((doc) => doc.exists), matcher);
    for (const match of matches) {
      await db.doc(match.path).delete();
      deleted.push(match);
    }
  }
  return deleted;
}

function toSerializable(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => toSerializable(entry));
  }
  if (value && typeof value === 'object') {
    const output = {};
    for (const [key, entry] of Object.entries(value)) {
      output[key] = toSerializable(entry);
    }
    return output;
  }
  return value;
}

function ensureResultsDir() {
  fs.mkdirSync(resultsDir, { recursive: true });
}

function writeJsonArtifact(prefix, payload) {
  ensureResultsDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(resultsDir, `${prefix}-${timestamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(toSerializable(payload), null, 2));
  return outPath;
}

async function runCase(testCase, options) {
  const runStartedAt = new Date().toISOString();
  const beforeDocs = await fetchCaseDocs(testCase);
  const response = await callWetRun(testCase);
  const latestSnapshot = await fetchLatestSnapshot(testCase, runStartedAt);
  const afterDocs = await fetchCaseDocs(testCase);

  const beforeEvaluation = evaluateCase(testCase, beforeDocs);
  const afterEvaluation = evaluateCase(testCase, afterDocs);

  let finalDocs = afterDocs;
  const deletedDocs = [];

  if (
    options.cleanupStale &&
    (testCase.cleanupDocs || []).length > 0 &&
    afterEvaluation.expectedMatches.length === (testCase.expectedDocs || []).length
  ) {
    deletedDocs.push(...(await cleanupDocs(testCase, afterDocs)));
    finalDocs = await fetchCaseDocs(testCase);
  }

  const finalEvaluation = evaluateCase(testCase, finalDocs);

  return {
    caseId: testCase.id,
    description: testCase.description,
    processUrl,
    request: {
      fileId: testCase.fileId,
      rowIndex: testCase.rowIndex,
      parserMode: 'full5stage',
      dryRun: false,
    },
    response,
    latestSnapshot,
    before: {
      evaluation: beforeEvaluation,
      docs: beforeDocs,
    },
    after: {
      evaluation: afterEvaluation,
      docs: afterDocs,
    },
    cleanup: {
      enabled: options.cleanupStale,
      deletedDocs,
    },
    final: {
      evaluation: finalEvaluation,
      docs: finalDocs,
    },
    success: response.ok && finalEvaluation.success,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const allCases = loadFixtures();
  const cases = options.cases.length
    ? allCases.filter((testCase) => options.cases.includes(testCase.id))
    : allCases;

  if (!cases.length) {
    throw new Error('No matching live wet cases found.');
  }

  const results = [];
  for (const testCase of cases) {
    console.log(`Running live wet case: ${testCase.id}`);
    results.push(await runCase(testCase, options));
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    processUrl,
    cleanupStale: options.cleanupStale,
    totalCases: results.length,
    passedCases: results.filter((result) => result.success).length,
    failedCases: results.filter((result) => !result.success).map((result) => ({
      caseId: result.caseId,
      failures: result.final.evaluation.failures,
      responseOk: result.response.ok,
      status: result.response.status,
    })),
    results,
  };

  const outPath = writeJsonArtifact('live-wet-regression-report', summary);
  console.log(`Saved report to ${outPath}`);

  if (summary.failedCases.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
