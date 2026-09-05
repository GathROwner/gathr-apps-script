import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const requireFromFunctions = createRequire(path.join(repoRoot, 'functions', 'package.json'));
const admin = requireFromFunctions('firebase-admin');

const targetPath = 'venues/name_2lgcnn/events/n1i4FeSuJmsDwsXPKupo';
const expected = {
  title: 'Confederation Court Mall Saturday Hours',
  uniqueId: '1658722082923973_b288600d36c3bf24',
  ticketsBuyUrl: 'https://confedcourtmall.com/visit/mall-hours/',
};

function serialize(value) {
  if (value == null) return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, serialize(child)]));
  }
  return value;
}

function compactEvent(doc) {
  const data = doc.data() || {};
  return {
    path: doc.ref.path,
    title: String(data.eventName || data.name || data.title || '').trim(),
    startDate: data.startDate || null,
    endDate: data.endDate || null,
    startTime: data.startTime || null,
    endTime: data.endTime || null,
    isRecurring: data.isRecurring ?? null,
    recurringPattern: data.recurringPattern || null,
    uniqueId: data.uniqueId || null,
    ticketsBuyUrl: data.ticketsBuyUrl || null,
  };
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main() {
  const apply = process.argv.includes('--apply');
  const serviceAccountPath = process.env.GATHR_SERVICE_ACCOUNT_PATH ||
    path.join(__dirname, 'service-account.json');
  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(`Service account file not found: ${serviceAccountPath}`);
  }

  const serviceAccount = requireFromFunctions(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
  const db = admin.firestore();

  const targetRef = db.doc(targetPath);
  const [target, venueSiblings, allEvents] = await Promise.all([
    targetRef.get(),
    targetRef.parent.get(),
    db.collectionGroup('events').get(),
  ]);
  if (!target.exists) throw new Error(`Approved target is missing: ${targetPath}`);

  const data = target.data() || {};
  const actualTitle = String(data.eventName || data.name || data.title || '').trim();
  for (const [field, value] of Object.entries(expected)) {
    const actual = field === 'title' ? actualTitle : String(data[field] || '').trim();
    if (actual !== value) {
      throw new Error(`Approved target changed: expected ${field}=${value}, received ${actual}`);
    }
  }

  const familyDocs = allEvents.docs.filter((doc) => {
    const event = doc.data() || {};
    return String(event.uniqueId || '').trim() === expected.uniqueId;
  });
  const unexpectedFamilyPaths = familyDocs
    .map((doc) => doc.ref.path)
    .filter((eventPath) => eventPath !== targetPath);
  if (unexpectedFamilyPaths.length > 0) {
    throw new Error(`Unexpected recurring/source family documents: ${unexpectedFamilyPaths.join(', ')}`);
  }

  const siblingSummary = venueSiblings.docs
    .filter((doc) => doc.ref.path !== targetPath)
    .map(compactEvent)
    .sort((left, right) => left.startDate.localeCompare(right.startDate));

  const plan = {
    applied: apply,
    projectId: serviceAccount.project_id,
    target: {
      path: targetPath,
      data: serialize(data),
    },
    sourceFamilyPaths: familyDocs.map((doc) => doc.ref.path),
    preservedVenueSiblingCount: siblingSummary.length,
    preservedVenueSiblings: siblingSummary,
  };

  if (!apply) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  const artifactsDir = path.join(__dirname, 'artifacts');
  fs.mkdirSync(artifactsDir, { recursive: true });
  const runStamp = stamp();
  const backupPath = path.join(
    artifactsDir,
    `confed-mall-hours-2026-09-05-predelete-backup-${runStamp}.json`
  );
  fs.writeFileSync(backupPath, JSON.stringify({ backedUpAt: new Date().toISOString(), ...plan }, null, 2));

  await targetRef.delete();
  const verification = await targetRef.get();
  if (verification.exists) throw new Error(`Delete verification failed: ${targetPath} still exists`);

  const reportPath = path.join(
    artifactsDir,
    `confed-mall-hours-2026-09-05-delete-report-${runStamp}.json`
  );
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        deletedAt: new Date().toISOString(),
        targetPath,
        existsAfterDelete: verification.exists,
        backupPath,
        preservedVenueSiblingCount: siblingSummary.length,
      },
      null,
      2
    )
  );

  console.log(JSON.stringify({
    targetPath,
    deleted: true,
    existsAfterDelete: verification.exists,
    backupPath,
    reportPath,
    preservedVenueSiblingCount: siblingSummary.length,
  }, null, 2));
}

main()
  .then(async () => {
    if (admin.apps.length) await admin.app().delete();
  })
  .catch(async (error) => {
    console.error(error);
    try {
      if (admin.apps.length) await admin.app().delete();
    } catch {}
    process.exit(1);
  });

