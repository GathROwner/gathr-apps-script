import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const resultsDir = path.join(__dirname, 'results');
const functionsPackagePath = path.join(repoRoot, 'functions', 'package.json');
const functionsLibRoot = path.join(repoRoot, 'functions', 'lib');
const serviceAccountPath = path.join(repoRoot, 'firebase', 'service-account.json');

const DEFAULT_SNAPSHOT_ID = '1FolYXmvvtboUHnGSq3Q_wNjYlAc1H4S5_300_1775314347718';
const DEFAULT_EVENT_NAME = 'Open mic Sunday with Mike Fagen';
const DEFAULT_REPORT_LABEL = 'club-open-mic-write-path-replay';

function parseArgs(argv) {
  const options = {
    snapshotId: DEFAULT_SNAPSHOT_ID,
    eventName: DEFAULT_EVENT_NAME,
    eventIndex: null,
    reportLabel: DEFAULT_REPORT_LABEL,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--snapshot-id' && argv[index + 1]) {
      options.snapshotId = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }

    if (arg.startsWith('--snapshot-id=')) {
      options.snapshotId = String(arg.slice('--snapshot-id='.length)).trim();
      continue;
    }

    if (arg === '--event-name' && argv[index + 1]) {
      options.eventName = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }

    if (arg.startsWith('--event-name=')) {
      options.eventName = String(arg.slice('--event-name='.length)).trim();
      continue;
    }

    if (arg === '--event-index' && argv[index + 1]) {
      const parsed = Number(argv[index + 1]);
      options.eventIndex = Number.isFinite(parsed) ? Math.trunc(parsed) : null;
      index += 1;
      continue;
    }

    if (arg.startsWith('--event-index=')) {
      const parsed = Number(arg.slice('--event-index='.length));
      options.eventIndex = Number.isFinite(parsed) ? Math.trunc(parsed) : null;
      continue;
    }

    if (arg === '--report-label' && argv[index + 1]) {
      options.reportLabel = String(argv[index + 1]).trim() || options.reportLabel;
      index += 1;
      continue;
    }

    if (arg.startsWith('--report-label=')) {
      options.reportLabel = String(arg.slice('--report-label='.length)).trim() || options.reportLabel;
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

function normalizeIsoDate(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const directMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (directMatch) return directMatch[1];
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
    const millis = value._seconds * 1000 + Math.floor((value._nanoseconds || 0) / 1e6);
    return new Date(millis).toISOString();
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  }
  return '';
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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function slugify(value) {
  return normalizeLower(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'write-path-replay';
}

function writeJsonArtifact(prefix, payload) {
  ensureDir(resultsDir);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(resultsDir, `${prefix}-${timestamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  return outPath;
}

function extractEvents(snapshot) {
  if (Array.isArray(snapshot?.events) && snapshot.events.length) {
    return snapshot.events;
  }
  if (Array.isArray(snapshot?.stages)) {
    const formatStage = snapshot.stages.find((stage) => stage?.stage === 'format');
    if (Array.isArray(formatStage?.output?.events)) {
      return formatStage.output.events;
    }
  }
  return [];
}

function pickComparableName(value) {
  return normalizeString(value?.eventName || value?.name);
}

function flattenDoc(venueId, data) {
  const id = normalizeString(data?.id);
  return {
    path: id ? `venues/${venueId}/events/${id}` : '',
    id,
    uniqueId: normalizeString(data?.uniqueId),
    venueId: normalizeString(data?.venueId || venueId),
    establishment: normalizeString(data?.establishment),
    eventType: normalizeString(data?.eventType),
    name: pickComparableName(data),
    eventName: normalizeString(data?.eventName),
    description: normalizeString(data?.description),
    startDate: normalizeIsoDate(data?.startDate),
    endDate: normalizeIsoDate(data?.endDate),
    startTime: normalizeString(data?.startTime),
    endTime: normalizeString(data?.endTime),
    isRecurring: normalizeBoolean(data?.isRecurring),
    recurringPattern: normalizeString(data?.recurringPattern),
    recurringDaysOfWeek: Array.isArray(data?.recurringDaysOfWeek) ? data.recurringDaysOfWeek : [],
    recurringWeekdaySequence: Array.isArray(data?.recurringWeekdaySequence)
      ? data.recurringWeekdaySequence
      : [],
    totalOccurrences: normalizeNumber(data?.totalOccurrences),
    recurrenceUntilDate: normalizeIsoDate(data?.recurrenceUntilDate),
    updatedAt: normalizeTimestamp(data?.updatedAt),
    raw: data,
  };
}

function normalizeIncomingEvent(snapshot, rawEvent) {
  const normalized = {
    ...rawEvent,
    uniqueId: normalizeString(rawEvent?.uniqueId || snapshot.uniqueId),
    venueId: normalizeString(rawEvent?.venueId || snapshot.venueId),
    establishment: normalizeString(
      rawEvent?.establishment ||
        snapshot.establishment ||
        snapshot.rowMeta?.pageName ||
        snapshot.rowMeta?.userName
    ),
    eventType: normalizeString(rawEvent?.eventType || rawEvent?.category || 'live_music'),
    eventName: normalizeString(rawEvent?.eventName || rawEvent?.name),
    name: normalizeString(rawEvent?.name || rawEvent?.eventName),
    description: normalizeString(rawEvent?.description),
    startDate: normalizeIsoDate(rawEvent?.startDate),
    endDate: normalizeIsoDate(rawEvent?.endDate),
    startTime: normalizeString(rawEvent?.startTime),
    endTime: normalizeString(rawEvent?.endTime),
    recurringPattern: normalizeString(rawEvent?.recurringPattern),
    recurringDaysOfWeek: Array.isArray(rawEvent?.recurringDaysOfWeek) ? rawEvent.recurringDaysOfWeek : [],
    recurringWeekdaySequence: Array.isArray(rawEvent?.recurringWeekdaySequence)
      ? rawEvent.recurringWeekdaySequence
      : [],
    isRecurring: rawEvent?.isRecurring,
    isEvent: rawEvent?.isEvent ?? 'Yes',
    isFoodSpecial: rawEvent?.isFoodSpecial ?? 'No',
    mediaUrls: Array.isArray(rawEvent?.mediaUrls) ? rawEvent.mediaUrls : [],
    facebookUrl: normalizeString(rawEvent?.facebookUrl || snapshot.facebookUrl || snapshot.rowMeta?.facebookUrl),
  };

  if (!normalized.name && normalized.eventName) normalized.name = normalized.eventName;
  if (!normalized.eventName && normalized.name) normalized.eventName = normalized.name;

  return normalized;
}

function selectSnapshotEvent(snapshot, options) {
  const events = extractEvents(snapshot);
  if (!events.length) {
    throw new Error(`Snapshot ${options.snapshotId} has no formatted events`);
  }

  if (Number.isFinite(options.eventIndex) && options.eventIndex >= 0 && options.eventIndex < events.length) {
    return { selectedEvent: events[options.eventIndex], selectedEventIndex: options.eventIndex };
  }

  const wantedName = normalizeLower(options.eventName);
  const selectedEventIndex = events.findIndex((event) => normalizeLower(pickComparableName(event)) === wantedName);
  if (selectedEventIndex >= 0) {
    return { selectedEvent: events[selectedEventIndex], selectedEventIndex };
  }

  const partialIndex = events.findIndex((event) => normalizeLower(pickComparableName(event)).includes(wantedName));
  if (partialIndex >= 0) {
    return { selectedEvent: events[partialIndex], selectedEventIndex: partialIndex };
  }

  throw new Error(
    `Event "${options.eventName}" was not found in snapshot ${options.snapshotId}. Available events: ${events
      .map((event) => pickComparableName(event))
      .join(', ')}`
  );
}

function extractUniqueIdRoot(uniqueId) {
  const normalized = normalizeString(uniqueId);
  if (!normalized) return '';
  const match = normalized.match(/^(.*?)(?:_[^_]+)?$/);
  return normalizeString(match?.[1] || normalized);
}

function shouldSkipSiblingUniqueIdDuplicateCheck(incoming, existing) {
  const incomingUniqueId = normalizeString(incoming.uniqueId);
  const existingUniqueId = normalizeString(existing.uniqueId);
  if (!incomingUniqueId || !existingUniqueId || incomingUniqueId === existingUniqueId) {
    return false;
  }

  const incomingRoot = extractUniqueIdRoot(incomingUniqueId);
  const existingRoot = extractUniqueIdRoot(existingUniqueId);
  if (!incomingRoot || incomingRoot !== existingRoot) return false;

  const incomingStartDate = normalizeIsoDate(incoming.startDate);
  const existingStartDate = normalizeIsoDate(existing.startDate);
  if (!incomingStartDate || incomingStartDate !== existingStartDate) return false;

  const incomingStartTime = normalizeString(incoming.startTime);
  const existingStartTime = normalizeString(existing.startTime);
  if (incomingStartTime && existingStartTime && incomingStartTime !== existingStartTime) {
    return true;
  }

  return false;
}

function addDaysToIsoDate(isoDate, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate || ''))) return '';
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + Math.trunc(days));
  return date.toISOString().slice(0, 10);
}

function summarizeEvent(event) {
  return {
    uniqueId: normalizeString(event.uniqueId),
    venueId: normalizeString(event.venueId),
    establishment: normalizeString(event.establishment),
    eventType: normalizeString(event.eventType),
    name: pickComparableName(event),
    description: normalizeString(event.description),
    startDate: normalizeIsoDate(event.startDate),
    endDate: normalizeIsoDate(event.endDate),
    startTime: normalizeString(event.startTime),
    endTime: normalizeString(event.endTime),
    isRecurring: normalizeBoolean(event.isRecurring),
    recurringPattern: normalizeString(event.recurringPattern),
    recurringDaysOfWeek: Array.isArray(event.recurringDaysOfWeek) ? event.recurringDaysOfWeek : [],
    recurringWeekdaySequence: Array.isArray(event.recurringWeekdaySequence)
      ? event.recurringWeekdaySequence
      : [],
  };
}

function sortRecurringDiagnostics(entries) {
  return [...entries].sort((left, right) => {
    if (right.diagnostics.familyAnchorScore !== left.diagnostics.familyAnchorScore) {
      return right.diagnostics.familyAnchorScore - left.diagnostics.familyAnchorScore;
    }
    if (right.diagnostics.hostOverlapSharedCount !== left.diagnostics.hostOverlapSharedCount) {
      return right.diagnostics.hostOverlapSharedCount - left.diagnostics.hostOverlapSharedCount;
    }
    if (right.diagnostics.hostOverlapRatio !== left.diagnostics.hostOverlapRatio) {
      return right.diagnostics.hostOverlapRatio - left.diagnostics.hostOverlapRatio;
    }
    if (left.diagnostics.baseAlignmentDays !== right.diagnostics.baseAlignmentDays) {
      return left.diagnostics.baseAlignmentDays - right.diagnostics.baseAlignmentDays;
    }
    return left.diagnostics.startTimePenalty - right.diagnostics.startTimePenalty;
  });
}

function sortExactDiagnostics(entries, incomingStartDate) {
  return [...entries].sort((left, right) => {
    const leftExactStart = normalizeIsoDate(left.event.startDate) === incomingStartDate;
    const rightExactStart = normalizeIsoDate(right.event.startDate) === incomingStartDate;
    if (leftExactStart !== rightExactStart) {
      return rightExactStart ? 1 : -1;
    }
    if (right.diagnostics.titleSimilarity !== left.diagnostics.titleSimilarity) {
      return right.diagnostics.titleSimilarity - left.diagnostics.titleSimilarity;
    }
    return left.diagnostics.timeAgreementPenalty - right.diagnostics.timeAgreementPenalty;
  });
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
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  return value;
}

async function loadModules() {
  const requireFromFunctions = createRequire(functionsPackagePath);
  const admin = requireFromFunctions('firebase-admin');
  const serviceAccount = requireFromFunctions(serviceAccountPath);

  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }

  const [
    firestoreService,
    exactUniqueIdCompatibility,
    recurringFamilyFallback,
    similarity,
    rowProcessor,
  ] = await Promise.all([
    import(pathToFileURL(path.join(functionsLibRoot, 'services', 'firestoreService.js')).href),
    import(pathToFileURL(path.join(functionsLibRoot, 'services', 'exactUniqueIdCompatibility.js')).href),
    import(pathToFileURL(path.join(functionsLibRoot, 'services', 'recurringFamilyFallback.js')).href),
    import(pathToFileURL(path.join(functionsLibRoot, 'utils', 'similarity.js')).href),
    import(pathToFileURL(path.join(functionsLibRoot, 'processing', 'rowProcessor.js')).href),
  ]);

  return {
    admin,
    firestoreService,
    exactUniqueIdCompatibility,
    recurringFamilyFallback,
    similarity,
    rowProcessor,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const modules = await loadModules();
  const {
    firestoreService,
    exactUniqueIdCompatibility,
    recurringFamilyFallback,
    similarity,
    rowProcessor,
  } = modules;

  const snapshot = await firestoreService.getParseSnapshotById(options.snapshotId);
  if (!snapshot) {
    throw new Error(`Snapshot not found: ${options.snapshotId}`);
  }

  const { selectedEvent, selectedEventIndex } = selectSnapshotEvent(snapshot, options);
  const incomingEvent = normalizeIncomingEvent(snapshot, selectedEvent);
  const venueId = normalizeString(incomingEvent.venueId || snapshot.venueId);
  if (!venueId) {
    throw new Error(`Snapshot ${options.snapshotId} does not resolve to a venueId`);
  }

  const venue = await firestoreService.getVenue(venueId);
  if (!venue) {
    throw new Error(`Venue not found: ${venueId}`);
  }

  const venueEvents = (await firestoreService.getVenueEvents(venueId)).map((event) =>
    flattenDoc(venueId, event)
  );

  const currentRunEntries = [];
  const incomingStartDate = normalizeIsoDate(incomingEvent.startDate);
  const normalizedUniqueId = normalizeString(incomingEvent.uniqueId);

  const exactCurrentRunCandidates = currentRunEntries
    .filter((existing) => normalizeString(existing.venueId) === venueId)
    .filter((existing) => normalizeString(existing.uniqueId) === normalizedUniqueId)
    .map((event) => ({
      path: event.id ? `currentRun/${event.id}` : '',
      event,
      diagnostics: exactUniqueIdCompatibility.getExactUniqueIdCompatibilityDiagnostics(
        incomingEvent,
        event,
        { venueId }
      ),
    }));

  const exactFirestoreCandidates = venueEvents
    .filter((existing) => existing.uniqueId === normalizedUniqueId)
    .map((existing) => ({
      path: existing.path,
      event: existing.raw,
      diagnostics: exactUniqueIdCompatibility.getExactUniqueIdCompatibilityDiagnostics(
        incomingEvent,
        existing.raw,
        { venueId }
      ),
    }));

  const exactCurrentRunSelected = exactUniqueIdCompatibility.pickCompatibleExactUniqueIdMatch(
    incomingEvent,
    exactCurrentRunCandidates.map((entry) => entry.event),
    { venueId }
  );
  const exactFirestoreSelected = exactUniqueIdCompatibility.pickCompatibleExactUniqueIdMatch(
    incomingEvent,
    exactFirestoreCandidates.map((entry) => entry.event),
    { venueId }
  );
  const exactStageSelected = exactCurrentRunSelected || exactFirestoreSelected;

  const sameDateCurrentRunCandidates = currentRunEntries
    .filter((existing) => normalizeString(existing.venueId) === venueId)
    .filter((existing) => !shouldSkipSiblingUniqueIdDuplicateCheck(incomingEvent, existing))
    .map((event) => ({
      path: event.id ? `currentRun/${event.id}` : '',
      event,
      isDuplicate: similarity.isDuplicateEntry(incomingEvent, event, {
        requireEstablishmentMatch: false,
      }),
    }));

  const sameDateFirestoreCandidates = venueEvents
    .filter((existing) => existing.startDate === incomingStartDate)
    .filter((existing) => !shouldSkipSiblingUniqueIdDuplicateCheck(incomingEvent, existing.raw))
    .map((existing) => ({
      path: existing.path,
      event: existing.raw,
      isDuplicate: similarity.isDuplicateEntry(incomingEvent, existing.raw, {
        requireEstablishmentMatch: false,
      }),
    }));

  const sameDateCurrentRunSelected =
    sameDateCurrentRunCandidates.find((entry) => entry.isDuplicate)?.event || undefined;
  const sameDateFirestoreSelected =
    sameDateFirestoreCandidates.find((entry) => entry.isDuplicate)?.event || undefined;
  const sameDateStageSelected = sameDateCurrentRunSelected || sameDateFirestoreSelected;

  const fallbackWindowStart = incomingStartDate ? addDaysToIsoDate(incomingStartDate, -120) : '';
  const fallbackWindowEnd = incomingStartDate ? addDaysToIsoDate(incomingStartDate, 21) : '';
  const recurringFallbackCurrentRunCandidates = currentRunEntries.map((event) => ({
    path: event.id ? `currentRun/${event.id}` : '',
    event,
    diagnostics: recurringFamilyFallback.getRecurringFamilyFallbackDiagnostics(
      incomingEvent,
      event,
      { venueId }
    ),
  }));

  const recurringFallbackFirestoreCandidates = venueEvents
    .filter((existing) => {
      if (!fallbackWindowStart || !fallbackWindowEnd) return true;
      return existing.startDate >= fallbackWindowStart && existing.startDate <= fallbackWindowEnd;
    })
    .map((existing) => ({
      path: existing.path,
      event: existing.raw,
      diagnostics: recurringFamilyFallback.getRecurringFamilyFallbackDiagnostics(
        incomingEvent,
        existing.raw,
        { venueId }
      ),
    }));

  const recurringFallbackCurrentRunSelected = recurringFamilyFallback.pickRecurringFamilyFallbackMatch(
    incomingEvent,
    recurringFallbackCurrentRunCandidates.map((entry) => entry.event),
    { venueId }
  );
  const recurringFallbackFirestoreSelected = recurringFamilyFallback.pickRecurringFamilyFallbackMatch(
    incomingEvent,
    recurringFallbackFirestoreCandidates.map((entry) => entry.event),
    { venueId }
  );
  const recurringFallbackStageSelected =
    recurringFallbackCurrentRunSelected || recurringFallbackFirestoreSelected;

  const derivedSelectedEvent =
    exactStageSelected || sameDateStageSelected || recurringFallbackStageSelected;
  const derivedSelectedStage = exactStageSelected
    ? 'exact_unique_id'
    : sameDateStageSelected
      ? 'same_date_duplicate'
      : recurringFallbackStageSelected
        ? 'recurring_family_fallback'
        : 'none';

  const checkDuplicateResult = await firestoreService.checkDuplicate(incomingEvent, venueId, currentRunEntries);
  const selectedKeeperPath =
    derivedSelectedEvent && normalizeString(derivedSelectedEvent.id)
      ? `venues/${venueId}/events/${normalizeString(derivedSelectedEvent.id)}`
      : '';
  const checkDuplicateKeeperPath =
    checkDuplicateResult?.existingEvent?.id
      ? `venues/${venueId}/events/${normalizeString(checkDuplicateResult.existingEvent.id)}`
      : '';

  const mergePreview =
    derivedSelectedEvent && derivedSelectedStage !== 'none'
      ? rowProcessor.previewDuplicateMerge({
          existingEvent: derivedSelectedEvent,
          incomingEvent,
          venue,
        })
      : null;

  const report = {
    generatedAt: new Date().toISOString(),
    options,
    snapshot: {
      id: options.snapshotId,
      fileId: normalizeString(snapshot.fileId),
      fileName: normalizeString(snapshot.fileName),
      rowIndex: Number(snapshot.rowIndex || 0),
      venueId: normalizeString(snapshot.venueId),
      establishment: normalizeString(snapshot.establishment),
      createdAt: normalizeTimestamp(snapshot.createdAt),
      parserMode: normalizeString(snapshot.rowMeta?.parserMode),
      inputPreview: normalizeString(snapshot.inputText).slice(0, 600),
      selectedEventIndex,
      allEventNames: extractEvents(snapshot).map((event) => pickComparableName(event)),
      selectedEvent: summarizeEvent(incomingEvent),
    },
    liveVenueState: {
      venue: {
        id: normalizeString(venue.id),
        name: normalizeString(venue.name),
        address: normalizeString(venue.address),
      },
      openMicKeepers: venueEvents
        .filter((doc) => normalizeLower(`${doc.name}\n${doc.description}`).includes('open mic'))
        .map((doc) => ({
          path: doc.path,
          uniqueId: doc.uniqueId,
          name: doc.name,
          startDate: doc.startDate,
          endDate: doc.endDate,
          startTime: doc.startTime,
          endTime: doc.endTime,
          recurringPattern: doc.recurringPattern,
          isRecurring: doc.isRecurring,
          updatedAt: doc.updatedAt,
        })),
    },
    stages: {
      exactUniqueId: {
        currentRunCandidates: sortExactDiagnostics(
          exactCurrentRunCandidates,
          incomingStartDate
        ).map((entry) => ({
          path: entry.path,
          event: summarizeEvent(entry.event),
          diagnostics: entry.diagnostics,
        })),
        firestoreCandidates: sortExactDiagnostics(
          exactFirestoreCandidates,
          incomingStartDate
        ).map((entry) => ({
          path: entry.path,
          event: summarizeEvent(entry.event),
          diagnostics: entry.diagnostics,
        })),
        selectedPath:
          exactStageSelected && normalizeString(exactStageSelected.id)
            ? `venues/${venueId}/events/${normalizeString(exactStageSelected.id)}`
            : '',
      },
      sameDateDuplicate: {
        currentRunCandidates: sameDateCurrentRunCandidates.map((entry) => ({
          path: entry.path,
          event: summarizeEvent(entry.event),
          isDuplicate: entry.isDuplicate,
        })),
        firestoreCandidates: sameDateFirestoreCandidates.map((entry) => ({
          path: entry.path,
          event: summarizeEvent(entry.event),
          isDuplicate: entry.isDuplicate,
        })),
        selectedPath:
          sameDateStageSelected && normalizeString(sameDateStageSelected.id)
            ? `venues/${venueId}/events/${normalizeString(sameDateStageSelected.id)}`
            : '',
      },
      recurringFamilyFallback: {
        windowStart: fallbackWindowStart,
        windowEnd: fallbackWindowEnd,
        currentRunCandidates: sortRecurringDiagnostics(recurringFallbackCurrentRunCandidates).map((entry) => ({
          path: entry.path,
          event: summarizeEvent(entry.event),
          diagnostics: entry.diagnostics,
        })),
        firestoreCandidates: sortRecurringDiagnostics(recurringFallbackFirestoreCandidates).map((entry) => ({
          path: entry.path,
          event: summarizeEvent(entry.event),
          diagnostics: entry.diagnostics,
        })),
        selectedPath:
          recurringFallbackStageSelected && normalizeString(recurringFallbackStageSelected.id)
            ? `venues/${venueId}/events/${normalizeString(recurringFallbackStageSelected.id)}`
            : '',
      },
    },
    finalSelection: {
      derivedStage: derivedSelectedStage,
      derivedKeeperPath: selectedKeeperPath,
      checkDuplicateMatched: Boolean(checkDuplicateResult.isDuplicate),
      checkDuplicateKeeperPath,
      derivedMatchesCheckDuplicate: selectedKeeperPath === checkDuplicateKeeperPath,
      intendedKeeperPath: `venues/${venueId}/events/d5Da71CL7gn5SpiNrATy`,
      intendedKeeperSelected: selectedKeeperPath === `venues/${venueId}/events/d5Da71CL7gn5SpiNrATy`,
    },
    mergePreview: mergePreview
      ? {
          changedFields: mergePreview.changedFields,
          duplicateEventId: normalizeString(mergePreview.duplicateEventId),
          updates: mergePreview.updates,
        }
      : null,
  };

  const reportPath = writeJsonArtifact(slugify(options.reportLabel), toSerializable(report));
  console.log(
    JSON.stringify(
      {
        reportPath,
        snapshotId: options.snapshotId,
        selectedEvent: report.snapshot.selectedEvent.name,
        derivedStage: report.finalSelection.derivedStage,
        derivedKeeperPath: report.finalSelection.derivedKeeperPath,
        checkDuplicateKeeperPath: report.finalSelection.checkDuplicateKeeperPath,
        intendedKeeperSelected: report.finalSelection.intendedKeeperSelected,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
