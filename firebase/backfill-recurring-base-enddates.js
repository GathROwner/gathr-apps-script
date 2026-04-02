const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const serviceAccount = require(path.join(process.cwd(), 'service-account.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const apply = process.argv.includes('--apply');
const reportArg = process.argv.find((arg) => arg.startsWith('--report='));
const reportPath = reportArg
  ? path.resolve(process.cwd(), reportArg.slice('--report='.length))
  : path.join(process.cwd(), 'tmp_recurrence_integrity_report_2026-04-01.json');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

function normalizePattern(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[.,;:]+$/, '');
}

function parseIsoDate(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
  }
  if (typeof value?.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : null;
  }
  if (typeof value?._seconds === 'number') {
    const date = new Date(value._seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  return null;
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function parseTimeMinutes(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function computeOccurrenceLocalEndDate(data) {
  const recurringPattern = normalizePattern(data.recurringPattern);
  if (!recurringPattern || recurringPattern === 'none' || recurringPattern === 'n/a' || recurringPattern === 'false') {
    return null;
  }

  const startDate = parseIsoDate(data.startDate);
  if (!startDate) return null;

  const startMinutes = parseTimeMinutes(data.startTime);
  const endMinutes = parseTimeMinutes(data.endTime);
  if (startMinutes !== null && endMinutes !== null && endMinutes < startMinutes) {
    return addDays(startDate, 1) || startDate;
  }

  return startDate;
}

function readReport(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getTargets(report) {
  const targets = new Map();
  for (const finding of Array.isArray(report.findings) ? report.findings : []) {
    const hasStretchIssue = Array.isArray(finding.issues)
      ? finding.issues.some((issue) => issue?.type === 'stretched_series_end_date')
      : false;
    if (hasStretchIssue && finding.path) {
      targets.set(finding.path, {
        path: finding.path,
        venue: finding.venue || '',
        title: finding.title || '',
        reportedStartDate: finding.startDate || '',
        reportedEndDate: finding.endDate || '',
        reportedPattern: finding.recurringPattern || '',
      });
    }
  }
  return [...targets.values()];
}

async function main() {
  if (!fs.existsSync(reportPath)) {
    throw new Error(`Report not found: ${reportPath}`);
  }

  const report = readReport(reportPath);
  const targets = getTargets(report);
  const plan = [];
  const backup = [];

  for (const target of targets) {
    const ref = db.doc(target.path);
    const snap = await ref.get();
    if (!snap.exists) {
      plan.push({
        ...target,
        exists: false,
        action: 'skip_missing',
      });
      continue;
    }

    const data = snap.data() || {};
    const currentEndDate = parseIsoDate(data.endDate);
    const expectedEndDate = computeOccurrenceLocalEndDate(data);
    const recurringPattern = normalizePattern(data.recurringPattern);

    const entry = {
      ...target,
      exists: true,
      action: 'skip_not_applicable',
      eventName: data.eventName || data.name || '',
      startDate: parseIsoDate(data.startDate),
      currentEndDate,
      expectedEndDate,
      startTime: data.startTime || '',
      endTime: data.endTime || '',
      recurringPattern,
      recurrenceUntilDate: parseIsoDate(data.recurrenceUntilDate),
      totalOccurrences: data.totalOccurrences ?? null,
    };

    if (!expectedEndDate) {
      plan.push(entry);
      continue;
    }

    if (currentEndDate === expectedEndDate) {
      entry.action = 'skip_already_normalized';
      plan.push(entry);
      continue;
    }

    entry.action = 'update_endDate';
    plan.push(entry);
    backup.push({
      path: target.path,
      data,
    });
  }

  const toUpdate = plan.filter((entry) => entry.action === 'update_endDate');
  const planOut = path.join(process.cwd(), `tmp_recurrence_base_enddate_backfill_plan_${timestamp}.json`);
  const backupOut = path.join(process.cwd(), `tmp_recurrence_base_enddate_backfill_backup_${timestamp}.json`);

  fs.writeFileSync(
    planOut,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        apply,
        reportPath,
        summary: {
          targetsInReport: targets.length,
          actionable: toUpdate.length,
          alreadyNormalized: plan.filter((entry) => entry.action === 'skip_already_normalized').length,
          missing: plan.filter((entry) => entry.action === 'skip_missing').length,
          notApplicable: plan.filter((entry) => entry.action === 'skip_not_applicable').length,
        },
        plan,
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    backupOut,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        apply,
        count: backup.length,
        docs: backup,
      },
      null,
      2
    )
  );

  if (apply && toUpdate.length > 0) {
    let batch = db.batch();
    let writesInBatch = 0;

    for (const entry of toUpdate) {
      batch.update(db.doc(entry.path), {
        endDate: entry.expectedEndDate,
        updatedAt: FieldValue.serverTimestamp(),
      });
      writesInBatch += 1;

      if (writesInBatch === 400) {
        await batch.commit();
        batch = db.batch();
        writesInBatch = 0;
      }
    }

    if (writesInBatch > 0) {
      await batch.commit();
    }
  }

  console.log(
    JSON.stringify(
      {
        apply,
        reportPath,
        planOut,
        backupOut,
        summary: {
          targetsInReport: targets.length,
          actionable: toUpdate.length,
          alreadyNormalized: plan.filter((entry) => entry.action === 'skip_already_normalized').length,
          missing: plan.filter((entry) => entry.action === 'skip_missing').length,
          notApplicable: plan.filter((entry) => entry.action === 'skip_not_applicable').length,
        },
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
