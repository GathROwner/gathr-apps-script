import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const requireFromFunctions = createRequire(path.join(repoRoot, 'functions', 'package.json'));
const admin = requireFromFunctions('firebase-admin');

const targets = [
  {
    path: 'venues/name_n2ivcu/events/Ck0jrxoLQTqdGlKZJY7M',
    title: 'Live DJ',
    uniqueId: '122188154576910683_7dbd3cfa4063d46c',
    startDate: '2026-08-11',
    endDate: '2026-08-12',
    startTime: '22:00',
    endTime: '01:00',
    isRecurring: 'Yes',
    recurringPattern: 'none',
  },
  {
    path: 'venues/name_n2ivcu/events/JcxkvzCF9W23dEHpjnJ7',
    title: 'Live DJ',
    uniqueId: '122188154576910683_6a2cdfa992a5cb85',
    startDate: '2026-08-10',
    endDate: '2026-08-11',
    startTime: '22:00',
    endTime: '01:00',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_custom',
  },
  {
    path: 'venues/slug_saltandsolpei/events/hk56ENbgJxXh4wbxjyGT',
    title: 'Salty Saturdays: MÖJO',
    uniqueId: '1796647248391130_1',
    startDate: '2026-05-16',
    endDate: '2026-05-17',
    startTime: '22:00',
    endTime: '02:00',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_saturday',
  },
  {
    path: 'venues/tqkqD2DAJbioute8QMbJ/events/QIIScYmQdYCjvFztAHUH',
    title: 'Art Installations',
    uniqueId: '1503722248464388_20a2539223fb9ee5',
    startDate: '2026-08-29',
    endDate: '2026-08-29',
    startTime: '16:00',
    endTime: '23:00',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_saturday',
  },
];

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

function eventTitle(data) {
  return String(data.eventName || data.name || data.title || '').trim();
}

function sourceRoot(value) {
  const normalized = String(value || '').trim();
  return normalized ? normalized.split('_')[0] : '';
}

function compactEvent(doc) {
  const data = doc.data() || {};
  return {
    path: doc.ref.path,
    title: eventTitle(data),
    uniqueId: data.uniqueId || null,
    startDate: data.startDate || null,
    endDate: data.endDate || null,
    isRecurring: data.isRecurring ?? null,
    recurringPattern: data.recurringPattern || null,
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

  const snapshots = await Promise.all(targets.map((target) => db.doc(target.path).get()));
  const validatedTargets = [];
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    const snapshot = snapshots[index];
    if (!snapshot.exists) throw new Error(`Approved target is missing: ${target.path}`);

    const data = snapshot.data() || {};
    for (const [field, expected] of Object.entries(target)) {
      const actual = field === 'title' ? eventTitle(data) : String(data[field] ?? '').trim();
      if (field !== 'path' && actual !== expected) {
        throw new Error(
          `Approved target changed: ${target.path} expected ${field}=${expected}, received ${actual}`
        );
      }
    }

    const exactFamily = await db.collectionGroup('events').where('uniqueId', '==', target.uniqueId).get();
    const unexpectedFamilyPaths = exactFamily.docs
      .map((doc) => doc.ref.path)
      .filter((eventPath) => eventPath !== target.path);
    if (unexpectedFamilyPaths.length > 0) {
      throw new Error(
        `Unexpected exact-source family documents for ${target.uniqueId}: ${unexpectedFamilyPaths.join(', ')}`
      );
    }

    const venueSiblings = await snapshot.ref.parent.get();
    const targetSourceRoot = sourceRoot(target.uniqueId);
    const sameSourceRootSiblings = venueSiblings.docs
      .filter((doc) => doc.ref.path !== target.path)
      .filter((doc) => sourceRoot((doc.data() || {}).uniqueId) === targetSourceRoot)
      .map(compactEvent);

    validatedTargets.push({
      path: target.path,
      data: serialize(data),
      exactSourceFamilyPaths: exactFamily.docs.map((doc) => doc.ref.path),
      venueSiblingCount: venueSiblings.size - 1,
      sameSourceRootSiblings,
    });
  }

  const plan = {
    applied: apply,
    projectId: serviceAccount.project_id,
    targetCount: validatedTargets.length,
    targets: validatedTargets,
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
    `expired-recurrence-2026-09-05-predelete-backup-${runStamp}.json`
  );
  fs.writeFileSync(
    backupPath,
    JSON.stringify({ backedUpAt: new Date().toISOString(), ...plan }, null, 2)
  );

  const batch = db.batch();
  for (const target of targets) batch.delete(db.doc(target.path));
  await batch.commit();

  const verificationSnapshots = await Promise.all(
    targets.map((target) => db.doc(target.path).get())
  );
  const verification = targets.map((target, index) => ({
    path: target.path,
    existsAfterDelete: verificationSnapshots[index].exists,
  }));
  const failedDeletes = verification.filter((item) => item.existsAfterDelete);
  if (failedDeletes.length > 0) {
    throw new Error(`Delete verification failed: ${failedDeletes.map((item) => item.path).join(', ')}`);
  }

  const reportPath = path.join(
    artifactsDir,
    `expired-recurrence-2026-09-05-delete-report-${runStamp}.json`
  );
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        deletedAt: new Date().toISOString(),
        projectId: serviceAccount.project_id,
        deletedCount: targets.length,
        verification,
        backupPath,
      },
      null,
      2
    )
  );

  console.log(JSON.stringify({
    projectId: serviceAccount.project_id,
    deletedCount: targets.length,
    verification,
    backupPath,
    reportPath,
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
