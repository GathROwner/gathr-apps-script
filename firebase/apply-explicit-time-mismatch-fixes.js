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

function normalizeTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const m24 = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::\d{2})?$/);
  if (m24) {
    return `${String(parseInt(m24[1], 10)).padStart(2, '0')}:${m24[2]}`;
  }
  return '';
}

function readReport(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getTargets(report) {
  return (Array.isArray(report.findings) ? report.findings : [])
    .filter((finding) => Array.isArray(finding.issues) && finding.issues.some((issue) => issue?.type === 'explicit_time_mismatch'))
    .filter((finding) => finding.path && finding.explicitTimeRange?.startTime && finding.explicitTimeRange?.endTime)
    .map((finding) => ({
      path: finding.path,
      venue: finding.venue || '',
      title: finding.title || '',
      currentStartTime: normalizeTime(finding.startTime),
      currentEndTime: normalizeTime(finding.endTime),
      expectedStartTime: normalizeTime(finding.explicitTimeRange.startTime),
      expectedEndTime: normalizeTime(finding.explicitTimeRange.endTime),
      recurringPattern: finding.recurringPattern || '',
      reasons: finding.issues.filter((issue) => issue?.type === 'explicit_time_mismatch').map((issue) => issue.reason || ''),
    }));
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
    const currentStartTime = normalizeTime(data.startTime);
    const currentEndTime = normalizeTime(data.endTime);
    const expectedStartTime = target.expectedStartTime;
    const expectedEndTime = target.expectedEndTime;

    const entry = {
      ...target,
      exists: true,
      eventName: data.eventName || data.name || '',
      currentStartTime,
      currentEndTime,
      expectedStartTime,
      expectedEndTime,
      action: 'skip_already_correct',
    };

    if (!expectedStartTime || !expectedEndTime) {
      entry.action = 'skip_missing_expected_time';
      plan.push(entry);
      continue;
    }

    if (currentStartTime === expectedStartTime && currentEndTime === expectedEndTime) {
      plan.push(entry);
      continue;
    }

    entry.action = 'update_times';
    plan.push(entry);
    backup.push({
      path: target.path,
      data,
    });
  }

  const toUpdate = plan.filter((entry) => entry.action === 'update_times');
  const planOut = path.join(process.cwd(), `tmp_explicit_time_fix_plan_${timestamp}.json`);
  const backupOut = path.join(process.cwd(), `tmp_explicit_time_fix_backup_${timestamp}.json`);

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
          alreadyCorrect: plan.filter((entry) => entry.action === 'skip_already_correct').length,
          missing: plan.filter((entry) => entry.action === 'skip_missing').length,
          missingExpectedTime: plan.filter((entry) => entry.action === 'skip_missing_expected_time').length,
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
        startTime: entry.expectedStartTime,
        endTime: entry.expectedEndTime,
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
          alreadyCorrect: plan.filter((entry) => entry.action === 'skip_already_correct').length,
          missing: plan.filter((entry) => entry.action === 'skip_missing').length,
          missingExpectedTime: plan.filter((entry) => entry.action === 'skip_missing_expected_time').length,
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
