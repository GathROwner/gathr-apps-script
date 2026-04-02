const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const serviceAccount = require(path.join(process.cwd(), 'service-account.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

function parseCsvArg(flag) {
  const raw = getArgValue(flag);
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function firstPresent(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return undefined;
}

function parseBoolLike(value) {
  if (value === true || value === false) return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return null;
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  return null;
}

function normalizePattern(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[.,;:]+$/, '');
}

function normalizeIsoDate(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string') {
    const s = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return undefined;
  }
  if (value && typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      const d = value.toDate();
      if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    if (typeof value._seconds === 'number') {
      const d = new Date(value._seconds * 1000);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }
  return undefined;
}

function diffDays(a, b) {
  const da = new Date(`${a}T00:00:00Z`);
  const db = new Date(`${b}T00:00:00Z`);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return null;
  return Math.round((db - da) / 86400000);
}

function hasConcreteDateReference(text) {
  const normalized = String(text || '').toLowerCase();
  if (!normalized) return false;
  return (
    /\b20\d{2}-\d{2}-\d{2}\b/.test(normalized) ||
    /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/.test(normalized) ||
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*20\d{2})?\b/i.test(
      normalized
    ) ||
    /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i.test(
      normalized
    )
  );
}

function mapWeekdayTokenToPattern(token) {
  if (!token) return null;
  const normalized = String(token)
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/s$/, '');
  const map = {
    monday: 'weekly_monday',
    tuesday: 'weekly_tuesday',
    wednesday: 'weekly_wednesday',
    thursday: 'weekly_thursday',
    friday: 'weekly_friday',
    saturday: 'weekly_saturday',
    sunday: 'weekly_sunday',
    mon: 'weekly_monday',
    tue: 'weekly_tuesday',
    tues: 'weekly_tuesday',
    wed: 'weekly_wednesday',
    thu: 'weekly_thursday',
    thur: 'weekly_thursday',
    thurs: 'weekly_thursday',
    fri: 'weekly_friday',
    sat: 'weekly_saturday',
    sun: 'weekly_sunday',
  };
  return map[normalized] || null;
}

function detectStandaloneWeeklyPattern(text) {
  const normalized = String(text || '').toLowerCase();
  if (!normalized || hasConcreteDateReference(normalized)) return 'none';

  const matches = new Set();
  const candidatePatterns = [
    /\bon\s+(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/g,
    /\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b\s*(?:from|at|@|\||:|,|-|\u2013|\u2014)\s*/g,
    /\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b\s+(?:mornings?|afternoons?|evenings?|nights?)\b/g,
  ];

  for (const pattern of candidatePatterns) {
    for (const match of normalized.matchAll(pattern)) {
      const mapped = mapWeekdayTokenToPattern(match[1]);
      if (mapped) matches.add(mapped);
    }
  }

  return matches.size === 1 ? Array.from(matches)[0] : 'none';
}

function getDocSourceText(data) {
  return [
    data.eventName,
    data.name,
    data.title,
    data.description,
    data.metadata && data.metadata.eventName,
    data.metadata && data.metadata.name,
    data.metadata && data.metadata.title,
    data.metadata && data.metadata.description,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
}

function getLifecycle(data) {
  const meta = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
  return {
    recurrenceUntilDate: normalizeIsoDate(
      firstPresent(
        data.recurrenceUntilDate,
        data.recurrenceEndDate,
        data.recurrenceUntil,
        data.untilDate,
        data.repeatUntil,
        data.recursUntil,
        meta.recurrenceUntilDate,
        meta.recurrenceEndDate,
        meta.recurrenceUntil,
        meta.untilDate,
        meta.repeatUntil,
        meta.recursUntil
      )
    ),
    totalOccurrences: firstPresent(
      data.totalOccurrences,
      data.occurrenceCount,
      data.occurrences,
      data.numberOfOccurrences,
      data.numberOfRecurrences,
      data.numRecurrences,
      data.recurrenceCount,
      data.totalRecurrences,
      meta.totalOccurrences,
      meta.occurrenceCount,
      meta.occurrences,
      meta.numberOfOccurrences,
      meta.numberOfRecurrences,
      meta.numRecurrences,
      meta.recurrenceCount,
      meta.totalRecurrences
    ),
  };
}

function classifyDoc(data, finding) {
  const meta = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
  const pattern = normalizePattern(
    firstPresent(data.recurringPattern, data.recurrencePattern, meta.recurringPattern, meta.recurrencePattern) || 'none'
  );
  const explicitRecurring = parseBoolLike(firstPresent(data.isRecurring, meta.isRecurring));
  const startDate = normalizeIsoDate(firstPresent(data.startDate, meta.startDate));
  const endDate = normalizeIsoDate(firstPresent(data.endDate, meta.endDate)) || startDate;
  const lifecycle = getLifecycle(data);
  const sourceText = getDocSourceText(data);
  const concreteDate = hasConcreteDateReference(sourceText);
  const standaloneWeeklyPattern = pattern === 'daily' ? detectStandaloneWeeklyPattern(sourceText) : 'none';
  const durationDays = startDate && endDate ? diffDays(startDate, endDate) : null;

  const clearRecurringPayload = {
    isRecurring: false,
    recurringPattern: 'none',
    totalOccurrences: 0,
    recurrenceUntilDate: '',
  };

  if (pattern === 'none' && explicitRecurring === true) {
    return {
      action: 'auto_fix_clear_dirty_recurring_flag',
      reason: 'Explicit recurring flag is true while recurringPattern is none.',
      updates: clearRecurringPayload,
    };
  }

  if (
    pattern === 'daily' &&
    !lifecycle.recurrenceUntilDate &&
    !lifecycle.totalOccurrences &&
    startDate &&
    endDate &&
    endDate > startDate
  ) {
    if (durationDays === 1 && !finding.strongRecurringCue) {
      return {
        action: 'auto_fix_make_non_recurring',
        reason: 'One-night overnight event was stored as open-ended daily recurrence.',
        updates: clearRecurringPayload,
      };
    }

    return {
      action: 'auto_fix_bound_daily_series_to_end_date',
      reason: 'Finite multi-day daily run has an endDate but no recurrence lifecycle bound.',
      updates: {
        isRecurring: true,
        recurringPattern: 'daily',
        recurrenceUntilDate: endDate,
      },
    };
  }

  if (pattern === 'daily' && standaloneWeeklyPattern !== 'none') {
    return {
      action: 'auto_fix_daily_to_weekly',
      reason: `Text contains a single weekday-based recurring cue; "${pattern}" is too broad.`,
      updates: {
        isRecurring: true,
        recurringPattern: standaloneWeeklyPattern,
        totalOccurrences: 0,
        recurrenceUntilDate: '',
      },
    };
  }

  if (finding.risk === 'high' && pattern !== 'none') {
    if (pattern.startsWith('weekly_') && !concreteDate) {
      return {
        action: 'manual_review',
        reason: 'Weekly recurrence may be valid; source text lacks an explicit concrete date anchor.',
      };
    }

    return {
      action: 'auto_fix_make_non_recurring',
      reason: 'Dated or one-off looking event is stored as recurring without lifecycle.',
      updates: clearRecurringPayload,
    };
  }

  return {
    action: 'manual_review',
    reason: 'Recurring semantics are ambiguous and need human review.',
  };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const selectedActions = new Set(parseCsvArg('--actions'));
  const reportPath =
    getArgValue('--report') ||
    path.join(process.cwd(), '..', 'tmp_recurrence_anomaly_report_2026-04-01.json');

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const plan = [];

  for (const finding of findings) {
    const snap = await db.doc(finding.path).get();
    if (!snap.exists) {
      plan.push({
        path: finding.path,
        title: finding.title,
        venue: finding.venue,
        action: 'missing_doc',
        reason: 'Document no longer exists.',
      });
      continue;
    }

    const data = snap.data() || {};
    const classification = classifyDoc(data, finding);
    plan.push({
      path: finding.path,
      title: finding.title,
      venue: finding.venue,
      createdAt: finding.createdAt,
      risk: finding.risk,
      recurringPattern: finding.recurringPattern,
      action: classification.action,
      reason: classification.reason,
      updates: classification.updates || null,
      nextOccurrence: finding.nextOccurrence,
    });
  }

  const summary = plan.reduce((acc, row) => {
    acc[row.action] = (acc[row.action] || 0) + 1;
    return acc;
  }, {});
  const selectedPlan =
    selectedActions.size > 0
      ? plan.filter((row) => selectedActions.has(row.action))
      : plan;
  const selectedSummary = selectedPlan.reduce((acc, row) => {
    acc[row.action] = (acc[row.action] || 0) + 1;
    return acc;
  }, {});

  const nowTag = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(process.cwd(), '..', `tmp_recurrence_remediation_plan_${nowTag}.json`);
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        reportPath,
        applyMode: apply,
        summary,
        selectedActions: Array.from(selectedActions),
        selectedSummary,
        plan,
      },
      null,
      2
    )
  );

  if (apply) {
    const autoRows = selectedPlan.filter((row) => row.action.startsWith('auto_fix_') && row.updates);
    const backupPath = path.join(
      process.cwd(),
      '..',
      `tmp_recurrence_remediation_backup_${nowTag}.json`
    );
    const backup = [];

    for (let i = 0; i < autoRows.length; i += 400) {
      const chunk = autoRows.slice(i, i + 400);
      const batch = db.batch();
      for (const row of chunk) {
        const ref = db.doc(row.path);
        const snap = await ref.get();
        if (!snap.exists) continue;
        backup.push({ path: row.path, data: snap.data() || {} });
        batch.update(ref, {
          ...row.updates,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }

    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
    console.log(
      JSON.stringify(
        {
          applied: true,
          summary,
          selectedActions: Array.from(selectedActions),
          selectedSummary,
          outPath,
          backupPath,
          appliedCount: autoRows.length,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(
    JSON.stringify(
      {
        applied: false,
        summary,
        selectedActions: Array.from(selectedActions),
        selectedSummary,
        outPath,
        sampleAutoFixes: selectedPlan
          .filter((row) => row.action.startsWith('auto_fix_'))
          .slice(0, 20),
        sampleManualReview: selectedPlan
          .filter((row) => row.action === 'manual_review')
          .slice(0, 20),
      },
      null,
      2
    )
  );
}

main()
  .then(async () => {
    await admin.app().delete();
  })
  .catch(async (error) => {
    console.error(error);
    try {
      await admin.app().delete();
    } catch {}
    process.exit(1);
  });
