const fs = require('fs');
const path = require('path');
const admin = require('../functions/node_modules/firebase-admin');
const { VenueMatcher, normalizeVenueName, normalizeUrl } = require('./venue-matcher');
let XLSX = null;
try {
  XLSX = require('xlsx');
} catch (_) {
  XLSX = require('../functions/node_modules/xlsx');
}

const ROOT = path.resolve(__dirname, '..');
const TMP_DIR = path.join(ROOT, 'functions', 'tmp');
const XLSX_FILE = path.join(ROOT, 'GPT Processed.xlsx');
const SHEET_NAME = 'Sheet1';
const TODAY = '2026-02-20';

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const args = { apply: false, maxUpdates: 10, onlyFuture: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--max-updates') args.maxUpdates = Number(argv[++i] || '10');
    else if (arg === '--only-future') args.onlyFuture = true;
    else if (arg === '--report') args.report = argv[++i];
  }
  return args;
}

function toStringValue(v) {
  return v === undefined || v === null ? '' : String(v).trim();
}

function parseBool(v) {
  const s = toStringValue(v).toLowerCase();
  return s === 'yes' || s === 'y' || s === 'true' || s === '1';
}

function normalizeText(value) {
  return toStringValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDate(value) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (Number.isFinite(n) && n > 20000 && n < 60000) {
    const ms = Math.round((n - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = toStringValue(value);
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
}

function parseTime(value) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0 && n < 1) {
    const total = Math.round(n * 24 * 60);
    const hh = Math.floor(total / 60) % 24;
    const mm = total % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  const s = toStringValue(value);
  if (!s) return '';
  const m24 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m24) return `${String(Number(m24[1])).padStart(2, '0')}:${m24[2]}`;
  const m12 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (m12) {
    let hh = Number(m12[1]);
    const mm = m12[2];
    const ap = m12[3].toUpperCase();
    if (ap === 'PM' && hh !== 12) hh += 12;
    if (ap === 'AM' && hh === 12) hh = 0;
    return `${String(hh).padStart(2, '0')}:${mm}`;
  }
  return s;
}

function toIsoDateWithOffset(isoDate, days) {
  const base = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return isoDate;
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function parseWeekCount(text) {
  const normalized = normalizeText(text);
  if (!normalized) return null;
  const unit = '(?:week|weeks|session|sessions|class|classes)';
  const digitMatch = normalized.match(new RegExp(`\\b(\\d{1,2})\\s*${unit}\\b`));
  if (digitMatch) {
    const n = Number(digitMatch[1]);
    if (Number.isFinite(n) && n >= 2 && n <= 52) return n;
  }
  const words = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
  };
  const wordMatch = normalized.match(new RegExp(`\\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\\s*${unit}\\b`));
  if (wordMatch) {
    const count = words[wordMatch[1]];
    if (Number.isFinite(count) && count >= 2) return count;
  }
  return null;
}

function meaningfulPattern(rawPattern) {
  const p = normalizeText(rawPattern);
  if (!p) return false;
  if (['none', 'no', 'na', 'n a', 'not recurring'].includes(p)) return false;
  return true;
}

function inferDayTokenFromText(text) {
  const normalized = normalizeText(text);
  if (!normalized) return '';
  const plural = {
    mondays: 'monday',
    tuesdays: 'tuesday',
    wednesdays: 'wednesday',
    thursdays: 'thursday',
    fridays: 'friday',
    saturdays: 'saturday',
    sundays: 'sunday',
  };
  for (const [k, v] of Object.entries(plural)) {
    if (new RegExp(`\\b${k}\\b`, 'i').test(normalized)) return v;
  }
  const singular = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  for (const d of singular) {
    if (new RegExp(`\\b${d}\\b`, 'i').test(normalized)) return d;
  }
  return '';
}

function canonicalizeRecurringPattern(rawPattern, name, description) {
  const raw = toStringValue(rawPattern).toLowerCase();
  const clean = normalizeText(rawPattern);
  const combined = `${normalizeText(name)} ${normalizeText(description)} ${clean}`.trim();

  const weeklyDayMatch = raw.match(/weekly[_\s-]*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
  if (weeklyDayMatch) {
    return { pattern: `weekly_${weeklyDayMatch[1].toLowerCase()}`, confidence: 'high', source: 'pattern_weekly_day' };
  }

  const everyDayMatch = raw.match(/every[_\s-]*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
  if (everyDayMatch) {
    return { pattern: `weekly_${everyDayMatch[1].toLowerCase()}`, confidence: 'high', source: 'pattern_every_day' };
  }

  const dayFromText = inferDayTokenFromText(combined);
  if (raw.includes('daily') || clean === 'daily') {
    return { pattern: 'daily', confidence: 'high', source: 'pattern_daily' };
  }
  if (raw.includes('monthly') || clean === 'monthly') {
    return { pattern: 'monthly', confidence: 'high', source: 'pattern_monthly' };
  }
  if (raw.includes('recurring')) {
    if (dayFromText) {
      return { pattern: `weekly_${dayFromText}`, confidence: 'medium', source: 'pattern_recurring_day_text' };
    }
    return { pattern: 'weekly', confidence: 'low', source: 'pattern_recurring_generic' };
  }
  if (raw.includes('weekly') || clean === 'weekly') {
    if (dayFromText) {
      return { pattern: `weekly_${dayFromText}`, confidence: 'medium', source: 'pattern_weekly_day_text' };
    }
    return { pattern: 'weekly', confidence: 'high', source: 'pattern_weekly' };
  }
  if (dayFromText && /(every|weekly|nights|night|mornings|afternoons|taco tuesday|wing night|karaoke)/i.test(combined)) {
    return { pattern: `weekly_${dayFromText}`, confidence: 'medium', source: 'text_day_cue' };
  }
  return { pattern: '', confidence: 'none', source: 'unresolved' };
}

function normalizeNameKey(value) {
  return normalizeText(value).replace(/\b(the|a|an|at|with|and|of)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenSet(value) {
  const s = normalizeNameKey(value);
  if (!s) return new Set();
  return new Set(s.split(' ').filter((t) => t.length >= 3));
}

function tokenJaccard(a, b) {
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  const union = sa.size + sb.size - inter;
  if (!union) return 0;
  return inter / union;
}

function daysBetween(a, b) {
  if (!a || !b) return null;
  const da = new Date(`${a}T00:00:00Z`);
  const db = new Date(`${b}T00:00:00Z`);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return null;
  return Math.round((da.getTime() - db.getTime()) / 86400000);
}

async function initializeFirestore() {
  loadEnvFile(path.join(__dirname, '.env'));
  loadEnvFile(path.join(ROOT, 'functions', '.env'));
  const serviceAccountPath = process.env.SERVICE_ACCOUNT_PATH || path.join(ROOT, 'firebase', 'service-account.json');
  const resolved = path.isAbsolute(serviceAccountPath)
    ? serviceAccountPath
    : path.resolve(__dirname, serviceAccountPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Missing service account file: ${resolved}`);
  }
  const serviceAccount = require(resolved);
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  const db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

function loadSheetRows() {
  const wb = XLSX.readFile(XLSX_FILE);
  const ws = wb.Sheets[SHEET_NAME];
  if (!ws) throw new Error(`Missing sheet: ${SHEET_NAME}`);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const dataRows = rows.slice(1);

  const out = [];
  for (let i = 0; i < dataRows.length; i += 1) {
    const raw = dataRows[i];
    const sheetRow = i + 2;
    const isRecurring = parseBool(raw[2]);
    const recurringPattern = toStringValue(raw[3]);
    if (!isRecurring || !meaningfulPattern(recurringPattern)) continue;

    out.push({
      sheetRow,
      name: toStringValue(raw[5]),
      description: toStringValue(raw[6]),
      establishment: toStringValue(raw[7]),
      address: toStringValue(raw[8]),
      startDate: parseDate(raw[9]),
      endDate: parseDate(raw[10]),
      startTime: parseTime(raw[11]),
      endTime: parseTime(raw[12]),
      profileUrl: toStringValue(raw[16]),
      eventId: toStringValue(raw[32]),
      isRecurring,
      recurringPattern,
      rawColumns: raw,
    });
  }
  return out;
}

function listManualReportFiles() {
  return fs
    .readdirSync(TMP_DIR)
    .filter((n) => /^manual-migration-report-\d+\.json$/.test(n))
    .map((name) => {
      const p = path.join(TMP_DIR, name);
      let generatedAt = '';
      let ts = fs.statSync(p).mtimeMs;
      try {
        const j = JSON.parse(fs.readFileSync(p, 'utf8'));
        generatedAt = j.generatedAt || '';
        if (generatedAt) {
          const t = Date.parse(generatedAt);
          if (Number.isFinite(t)) ts = t;
        }
      } catch (_) {}
      return { name, path: p, ts };
    })
    .sort((a, b) => a.ts - b.ts);
}

function loadLatestRowState() {
  const files = listManualReportFiles();
  const latestByRow = new Map();
  for (const f of files) {
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(f.path, 'utf8'));
    } catch (_) {
      continue;
    }
    for (const row of doc.rows || []) {
      const sr = Number(row.sheetRow);
      if (!Number.isFinite(sr)) continue;
      latestByRow.set(sr, {
        report: f.name,
        generatedAt: doc.generatedAt || '',
        row,
      });
    }
  }
  return latestByRow;
}

function resolveVenueForRow(row, matcher) {
  const byUrl = row.profileUrl ? matcher.findMatch(row.establishment, row.profileUrl) : null;
  const byName = matcher.findMatch(row.establishment, null);

  if (byUrl && byName) {
    const sameVenue = (byUrl.venueId || '') === (byName.venueId || '');
    if (sameVenue) return { status: 'matched', selected: byUrl, flags: [] };

    // prefer strong name match if URL appears mismatched/legacy
    if ((byName.score || 0) >= 0.85 && (byUrl.score || 0) < 0.8) {
      return {
        status: 'matched',
        selected: byName,
        flags: ['url_name_disagree', 'using_name_over_url'],
      };
    }
    return {
      status: 'review',
      reason: 'url_name_venue_conflict',
      selected: byName,
      flags: ['url_name_disagree', 'manual_review_needed'],
      diagnostics: {
        urlVenueId: byUrl.venueId,
        nameVenueId: byName.venueId,
        urlScore: byUrl.score,
        nameScore: byName.score,
      },
    };
  }

  if (byUrl) return { status: 'matched', selected: byUrl, flags: [] };
  if (byName) return { status: 'matched', selected: byName, flags: [] };
  return { status: 'unmatched', reason: 'venue_not_found', flags: ['manual_review_needed'] };
}

function extractDocRefsFromLatestState(row, latestState) {
  const refs = [];
  if (!latestState || !latestState.row) return refs;
  const r = latestState.row;
  const status = toStringValue(r.status);

  if ((status === 'written' || status === 'ready_dry_run') && r.docId && r.venueId) {
    refs.push({ venueId: toStringValue(r.venueId), docId: toStringValue(r.docId), source: 'latest_docId' });
  }
  if (status === 'updated_existing' && r.updatedExistingId && r.venueId) {
    refs.push({ venueId: toStringValue(r.venueId), docId: toStringValue(r.updatedExistingId), source: 'latest_updatedExisting' });
  }
  if (r.duplicateCheck && r.duplicateCheck.existing && r.duplicateCheck.existing.id && r.duplicateCheck.existing.venueId) {
    refs.push({
      venueId: toStringValue(r.duplicateCheck.existing.venueId),
      docId: toStringValue(r.duplicateCheck.existing.id),
      source: 'latest_duplicate_existing',
    });
  }
  return refs.filter((x) => x.venueId && x.docId);
}

async function getVenueEvents(db, cache, venueId) {
  if (cache.has(venueId)) return cache.get(venueId);
  const snap = await db.collection('venues').doc(venueId).collection('events').get();
  const docs = snap.docs.map((d) => ({ id: d.id, ref: d.ref, data: d.data() || {} }));
  cache.set(venueId, docs);
  return docs;
}

async function findAdditionalDocRefs(db, cache, row, venueResolution, options = {}) {
  const allowVenueScan = Boolean(options.allowVenueScan);
  const refs = [];
  // 1) sourceRow exact (collection group)
  try {
    const sourceSnap = await db.collectionGroup('events').where('sourceRow', '==', row.sheetRow).get();
    for (const doc of sourceSnap.docs) {
      const venueId = doc.ref.parent.parent ? doc.ref.parent.parent.id : '';
      if (venueId) refs.push({ venueId, docId: doc.id, source: 'sourceRow_query' });
    }
  } catch (_) {}

  // 2) Conservative venue scan only when we don't already have explicit refs.
  // This avoids broad eventId collisions that can map unrelated events.
  if (allowVenueScan && venueResolution.status === 'matched') {
    const venueId = toStringValue(venueResolution.selected.venueId);
    if (venueId) {
      const events = await getVenueEvents(db, cache, venueId);
      const nameKey = normalizeNameKey(row.name);
      for (const e of events) {
        const d = e.data || {};
        const reasons = [];
        if (normalizeNameKey(d.name || d.title) === nameKey && nameKey) {
          reasons.push('name_exact');
        }
        const jacc = tokenJaccard(row.name, d.name || d.title || '');
        if (jacc >= 0.95) reasons.push(`name_jaccard_${jacc.toFixed(2)}`);
        const dd = daysBetween(toStringValue(d.startDate), row.startDate);
        if (dd !== null && Math.abs(dd) <= 1) reasons.push(`date_close_${dd}`);

        const strong = reasons.includes('name_exact');
        const medium = reasons.some((x) => x.startsWith('name_jaccard_')) && reasons.some((x) => x.startsWith('date_close_'));
        if (strong || medium) {
          refs.push({ venueId, docId: e.id, source: `venue_scan:${reasons.join('|')}` });
        }
      }
    }
  }

  // dedupe
  const unique = [];
  const seen = new Set();
  for (const r of refs) {
    const key = `${r.venueId}/${r.docId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(r);
  }
  return unique;
}

function shouldApplyRecurringFromRow(row, canonical) {
  if (!canonical.pattern) {
    return { shouldApply: false, reason: 'unresolved_pattern' };
  }

  const combined = `${normalizeText(row.name)} ${normalizeText(row.description)}`;
  const obviousRecurringCue = /\b(every|weekly|daily|mondays|tuesdays|wednesdays|thursdays|fridays|saturdays|sundays|nights|karaoke|wing night|taco tuesday|sundays|wednesdays)\b/.test(combined);
  const oneOffCue = /\b(one time|one-time|special event only|today only|one night only)\b/.test(combined);

  if (oneOffCue && !obviousRecurringCue) {
    return { shouldApply: false, reason: 'one_off_cue' };
  }

  // Known parser garbage that should not be trusted automatically.
  if (/timeflags|source\"\s*:\s*\"none/.test((row.recurringPattern || '').toLowerCase())) {
    return { shouldApply: false, reason: 'corrupt_pattern_payload' };
  }

  return { shouldApply: true, reason: canonical.source };
}

function recurrenceWindowFromRow(row, canonicalPattern) {
  const text = `${row.name || ''} ${row.description || ''}`;
  const count = parseWeekCount(text);
  if (!row.startDate) return { recurrenceCount: undefined, recurrenceEndDate: undefined, method: '' };

  if (canonicalPattern === 'daily' && row.endDate && row.endDate > row.startDate) {
    const days = daysBetween(row.endDate, row.startDate);
    if (days !== null && days >= 1) {
      return {
        recurrenceCount: days + 1,
        recurrenceEndDate: row.endDate,
        method: 'daily_range_from_dates',
      };
    }
  }

  if ((canonicalPattern === 'weekly' || canonicalPattern.startsWith('weekly_')) && count && count >= 2) {
    return {
      recurrenceCount: count,
      recurrenceEndDate: toIsoDateWithOffset(row.startDate, (count - 1) * 7),
      method: 'weekly_count_from_text',
    };
  }

  return { recurrenceCount: undefined, recurrenceEndDate: undefined, method: '' };
}

function currentPatternCanonical(value) {
  const c = canonicalizeRecurringPattern(value, '', '');
  return c.pattern || normalizeText(value);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const db = await initializeFirestore();

  const venueSnap = await db.collection('venues').get();
  const venues = venueSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const matcher = new VenueMatcher(venues);

  const recurringRows = loadSheetRows();
  const latestByRow = loadLatestRowState();
  const venueEventsCache = new Map();

  const report = {
    generatedAt: new Date().toISOString(),
    apply: Boolean(args.apply),
    maxUpdates: Math.max(1, Number(args.maxUpdates || 10)),
    onlyFuture: Boolean(args.onlyFuture),
    sheetFile: XLSX_FILE,
    sheetName: SHEET_NAME,
    rowCount: recurringRows.length,
    summary: {
      candidates: 0,
      matchedDocs: 0,
      readyToUpdate: 0,
      updated: 0,
      alreadyCorrect: 0,
      skippedNoMatch: 0,
      skippedManualReview: 0,
      skippedNameMismatch: 0,
      unresolvedPattern: 0,
      futureCandidates: 0,
      pastCandidates: 0,
    },
    rows: [],
  };

  const pendingUpdates = [];

  for (const row of recurringRows) {
    if (args.onlyFuture && (!row.startDate || row.startDate < TODAY)) continue;

    report.summary.candidates += 1;
    if (row.startDate && row.startDate >= TODAY) report.summary.futureCandidates += 1;
    else report.summary.pastCandidates += 1;

    const latest = latestByRow.get(row.sheetRow);
    const venueResolution = resolveVenueForRow(row, matcher);
    const canonical = canonicalizeRecurringPattern(row.recurringPattern, row.name, row.description);
    const recurringDecision = shouldApplyRecurringFromRow(row, canonical);
    const window = recurrenceWindowFromRow(row, canonical.pattern || '');

    const rowResult = {
      sheetRow: row.sheetRow,
      name: row.name,
      establishment: row.establishment,
      startDate: row.startDate,
      recurringPatternRaw: row.recurringPattern,
      recurringPatternCanonical: canonical.pattern,
      canonicalConfidence: canonical.confidence,
      canonicalSource: canonical.source,
      venueResolution: {
        status: venueResolution.status,
        reason: venueResolution.reason || '',
        venueId: venueResolution.selected ? venueResolution.selected.venueId : '',
        flags: venueResolution.flags || [],
      },
      latestStatus: latest ? toStringValue(latest.row.status) : '',
      latestReport: latest ? latest.report : '',
      updateDecision: recurringDecision,
      recurrenceWindow: window,
      docMatches: [],
      status: 'pending',
    };

    if (!recurringDecision.shouldApply) {
      rowResult.status = 'manual_review';
      report.summary.skippedManualReview += 1;
      if (recurringDecision.reason === 'unresolved_pattern') report.summary.unresolvedPattern += 1;
      report.rows.push(rowResult);
      continue;
    }

    const explicitRefs = extractDocRefsFromLatestState(row, latest);
    const additionalRefs = await findAdditionalDocRefs(db, venueEventsCache, row, venueResolution, {
      allowVenueScan: explicitRefs.length === 0,
    });

    const merged = [];
    const seen = new Set();
    for (const ref of [...explicitRefs, ...additionalRefs]) {
      const key = `${ref.venueId}/${ref.docId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(ref);
    }

    if (!merged.length) {
      rowResult.status = 'no_match';
      report.summary.skippedNoMatch += 1;
      report.rows.push(rowResult);
      continue;
    }

    let anyNeedsUpdate = false;
    for (const ref of merged) {
      const docRef = db.collection('venues').doc(ref.venueId).collection('events').doc(ref.docId);
      const snap = await docRef.get();
      if (!snap.exists) {
        rowResult.docMatches.push({ ...ref, exists: false, status: 'missing' });
        continue;
      }

      const d = snap.data() || {};
      const docName = toStringValue(d.name || d.title);
      const nameJaccard = tokenJaccard(row.name, docName);
      const nameExact = normalizeNameKey(row.name) && normalizeNameKey(row.name) === normalizeNameKey(docName);
      const nameStrongEnough = Boolean(nameExact) || nameJaccard >= 0.75;
      const trustedSource = ref.source === 'sourceRow_query' || String(ref.source || '').startsWith('latest_');
      const currentPattern = currentPatternCanonical(d.recurringPattern || '');
      const currentIsRecurring = d.isRecurring === true;

      const desiredPattern = canonical.pattern;
      const needsPatternUpdate = desiredPattern && currentPattern !== desiredPattern;
      const needsRecurringFlag = !currentIsRecurring;
      const needsWindowUpdate = Boolean(window.recurrenceCount && d.recurrenceCount !== window.recurrenceCount)
        || Boolean(window.recurrenceEndDate && toStringValue(d.recurrenceEndDate) !== window.recurrenceEndDate);
      const needsUpdate = needsPatternUpdate || needsRecurringFlag || needsWindowUpdate;

      rowResult.docMatches.push({
        ...ref,
        exists: true,
        status: !nameStrongEnough
          ? 'name_mismatch_manual_review'
          : needsUpdate
            ? 'needs_update'
            : 'already_correct',
        current: {
          name: docName,
          isRecurring: currentIsRecurring,
          recurringPattern: toStringValue(d.recurringPattern),
          recurrenceCount: d.recurrenceCount,
          recurrenceEndDate: toStringValue(d.recurrenceEndDate),
        },
        desired: {
          isRecurring: true,
          recurringPattern: desiredPattern,
          recurrenceCount: window.recurrenceCount,
          recurrenceEndDate: window.recurrenceEndDate,
        },
        matchQuality: {
          nameExact,
          nameJaccard: Number(nameJaccard.toFixed(3)),
          trustedSource,
        },
      });

      report.summary.matchedDocs += 1;

      if (!nameStrongEnough) {
        report.summary.skippedNameMismatch += 1;
        continue;
      }

      // Even with trusted references, avoid mutating mismatched-name docs.
      if (needsUpdate) {
        anyNeedsUpdate = true;
        pendingUpdates.push({
          row,
          ref,
          docRef,
          desiredPattern,
          recurrenceCount: window.recurrenceCount,
          recurrenceEndDate: window.recurrenceEndDate,
          reason: recurringDecision.reason,
          rowResult,
        });
      }
    }

    rowResult.status = anyNeedsUpdate ? 'ready_update' : 'already_correct';
    if (!anyNeedsUpdate) report.summary.alreadyCorrect += 1;
    else report.summary.readyToUpdate += 1;
    report.rows.push(rowResult);
  }

  // Deduplicate doc updates (same doc hit by multiple rows)
  const dedupedUpdates = [];
  const seenDoc = new Set();
  for (const u of pendingUpdates) {
    const key = `${u.ref.venueId}/${u.ref.docId}`;
    if (seenDoc.has(key)) continue;
    seenDoc.add(key);
    dedupedUpdates.push(u);
  }

  let appliedCount = 0;
  const limit = Math.max(1, Number(args.maxUpdates || 10));
  for (const u of dedupedUpdates) {
    if (!args.apply) break;
    if (appliedCount >= limit) break;

    const patch = {
      isRecurring: true,
      recurringPattern: u.desiredPattern || undefined,
      recurrenceCount: u.recurrenceCount || undefined,
      recurrenceEndDate: u.recurrenceEndDate || undefined,
      recurrenceResolution: {
        adjusted: true,
        method: 'sheet_recurring_backfill',
        sourceRow: u.row.sheetRow,
        sourceReason: u.reason,
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await u.docRef.set(patch, { merge: true });
    appliedCount += 1;

    u.rowResult.docMatches = (u.rowResult.docMatches || []).map((m) => {
      if (m.venueId === u.ref.venueId && m.docId === u.ref.docId) {
        return { ...m, status: 'updated' };
      }
      return m;
    });
  }

  report.summary.updated = appliedCount;
  report.summary.totalDocUpdatesPending = dedupedUpdates.length;
  report.summary.totalDocUpdatesDeferred = Math.max(0, dedupedUpdates.length - appliedCount);

  const reportPath = args.report || path.join(TMP_DIR, `recurring-backfill-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ reportPath, summary: report.summary }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
