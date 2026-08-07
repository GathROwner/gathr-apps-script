import fs from 'node:fs';
import path from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const apply = process.argv.includes('--apply');
const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credentialsPath) throw new Error('GOOGLE_APPLICATION_CREDENTIALS is required.');

const serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
const projectId = serviceAccount.project_id || 'gathr-migrated';
if (!getApps().length) initializeApp({ credential: cert(serviceAccount), projectId });
const db = getFirestore();

const targets = [
  {
    path: 'venues/5ASqnoESU87ep4brTev1/events/tKyowhXRwvnJRLRird7l',
    title: 'Genealogy Saturday',
    uniqueId: '1501423875348067_c6f5207b7d29ef75',
    startDate: '2026-07-11',
    endDate: '2026-07-11',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_saturday',
  },
  {
    path: 'venues/5ASqnoESU87ep4brTev1/events/XZKT5CpeHBT44AUrly9p',
    title: 'DanceFit with Rhonda',
    uniqueId: '1509870157836772_b7ce27b729b10fed',
    startDate: '2026-07-23',
    endDate: '2026-07-23',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_thursday',
  },
  {
    path: 'venues/aaUr1AtLKEjPEtmhKD8u/events/6lz2c8Pd9vo2UsSTx6aT',
    title: 'Solo acoustic show',
    uniqueId: '1545634797257414_0b0a0338907ac91d',
    startDate: '2026-07-10',
    endDate: '2026-07-10',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_friday',
  },
  {
    path: 'venues/fb_100052606604879/events/W6xawAOcRqbTR1GryLrf',
    title: '3 Course Menu Special',
    uniqueId: '1626750482421823_1',
    startDate: '2026-04-10',
    endDate: '2026-04-10',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_friday',
  },
  {
    path: 'venues/fb_100063464116222/events/4ioQeQxKHxP3KzVptoAq',
    title: 'Poutine Night ($9 poutines)',
    uniqueId: '1592781786180610_4',
    startDate: '2026-05-28',
    endDate: '2026-05-28',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_thursday',
  },
  {
    path: 'venues/fb_100063763432825/events/PAltbNmhZEd3gR7kqEf4',
    title: 'Irish Session (Live Music)',
    uniqueId: '1641315841337181_abda5f35bc4f3810',
    startDate: '2026-07-12',
    endDate: '2026-07-12',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_sunday',
  },
  {
    path: 'venues/fb_100063763432825/events/V8heE50enHBovcsuQswg',
    title: 'Roger Stone (Live Music)',
    uniqueId: '1641315841337181_37858f6bb59cca8f',
    startDate: '2026-07-11',
    endDate: '2026-07-11',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_saturday',
  },
  {
    path: 'venues/fb_951/events/hKe3es4dvpusKi2DWhF1',
    title: 'Top 100 from the 80s',
    uniqueId: '1655067686627854_ddb0cfe0cd1bbe33',
    startDate: '2026-08-03',
    endDate: '2026-08-03',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_monday',
  },
  {
    path: 'venues/nvQTJXSbDsSfJTCxDKCH/events/IQuKn38h4IMGIMxD65ge',
    title: 'FREE exercise class with Michele (Senior fitness)',
    uniqueId: '1820523456068324_1',
    startDate: '2026-06-24',
    endDate: '2026-06-24',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_wednesday',
  },
  {
    path: 'venues/slug_creditunionplace/events/k7634HbVm9ZnQSY1Nryl',
    title: 'Yoga',
    uniqueId: '1677239110790569_df0409d52c636349',
    startDate: '2026-07-23',
    endDate: '2026-07-23',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_thursday',
  },
  {
    path: 'venues/slug_creditunionplace/events/mzDM7IAmnzm9d76X2mli',
    title: 'Body Bar',
    uniqueId: '1673969137784233_19d8fd626f94fb8e',
    startDate: '2026-07-15',
    endDate: '2026-07-15',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_wednesday',
  },
  {
    path: 'venues/slug_creditunionplace/events/t9FjmpBLk3eNqMOQfiFx',
    title: "Noah Dobson's Hockey Fest",
    uniqueId: '1530558895458592_1',
    startDate: '2026-06-19',
    endDate: '2026-06-19',
    isRecurring: true,
    recurringPattern: 'weekly_friday',
  },
  {
    path: 'venues/slug_creditunionplace/events/Z6RlW1mLiCCysvDgPnrW',
    title: 'HIIT with Karla',
    uniqueId: '1644038907443923_1',
    startDate: '2026-06-13',
    endDate: '2026-06-13',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_saturday',
  },
  {
    path: 'venues/fb_100063464116222/events/mqKAD7VDBwbYyGJ0NPRz',
    title: 'Poutine Flight ($14)',
    uniqueId: '1592781786180610_5',
    startDate: '2026-05-28',
    endDate: '2026-05-28',
    isRecurring: 'Yes',
    recurringPattern: 'weekly_thursday',
  },
];

const titleOf = (data) => String(data.eventName || data.name || data.title || '').trim();
const timestampValue = (value) => value?.toDate?.().toISOString?.() || value;
const stableValue = (value) => JSON.stringify(value);

function assertExpected(data, target, phase) {
  const expected = {
    title: target.title,
    uniqueId: target.uniqueId,
    startDate: target.startDate,
    endDate: target.endDate,
    isRecurring: target.isRecurring,
    recurringPattern: target.recurringPattern,
  };
  const actual = {
    title: titleOf(data),
    uniqueId: data.uniqueId,
    startDate: data.startDate,
    endDate: data.endDate,
    isRecurring: data.isRecurring,
    recurringPattern: data.recurringPattern,
  };
  for (const key of Object.keys(expected)) {
    if (stableValue(actual[key]) !== stableValue(expected[key])) {
      throw new Error(
        `${phase} stale-state guard failed for ${target.path} ${key}: expected ${stableValue(expected[key])}, got ${stableValue(actual[key])}`
      );
    }
  }
  if (String(data.recurrenceUntilDate || '').trim() || Number(data.totalOccurrences || 0) > 1) {
    throw new Error(`${phase} lifecycle guard failed for ${target.path}; refusing to remove a now-bounded recurrence.`);
  }
}

const refs = targets.map((target) => db.doc(target.path));
const initialSnapshots = await Promise.all(refs.map((ref) => ref.get()));
for (let index = 0; index < targets.length; index += 1) {
  const snapshot = initialSnapshots[index];
  if (!snapshot.exists) throw new Error(`Missing approved target: ${targets[index].path}`);
  assertExpected(snapshot.data(), targets[index], 'prewrite');
}

const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const artifactDir = path.resolve('artifacts');
fs.mkdirSync(artifactDir, { recursive: true });
const backupPath = path.join(artifactDir, `approved-14-open-ended-weekly-backup-${timestamp}.json`);
const backup = {
  generatedAt: new Date().toISOString(),
  projectId,
  mode: apply ? 'apply' : 'dry-run',
  documents: initialSnapshots.map((snapshot, index) => ({
    path: targets[index].path,
    data: snapshot.data(),
  })),
};
fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));

const update = {
  isRecurring: false,
  recurring: false,
  recurringPattern: 'none',
  recurringDaysOfWeek: [],
  recurringWeekdaySequence: [],
  recurringWeekInterval: 1,
  recurrenceUntilDate: '',
  totalOccurrences: 0,
  updatedAt: FieldValue.serverTimestamp(),
};

console.log(JSON.stringify({
  mode: apply ? 'apply' : 'dry-run',
  projectId,
  targetCount: targets.length,
  backupPath,
  targets: targets.map(({ path: targetPath, title, startDate, endDate, recurringPattern }) => ({
    path: targetPath,
    title,
    startDate,
    endDate,
    recurringPattern,
  })),
  update: { ...update, updatedAt: '<serverTimestamp>' },
}, null, 2));

if (!apply) process.exit(0);

await db.runTransaction(async (transaction) => {
  const snapshots = [];
  for (const ref of refs) snapshots.push(await transaction.get(ref));
  for (let index = 0; index < targets.length; index += 1) {
    if (!snapshots[index].exists) throw new Error(`Missing approved target during transaction: ${targets[index].path}`);
    assertExpected(snapshots[index].data(), targets[index], 'transaction');
  }
  for (const ref of refs) transaction.update(ref, update);
});

const afterSnapshots = await Promise.all(refs.map((ref) => ref.get()));
const verification = afterSnapshots.map((snapshot, index) => {
  const target = targets[index];
  const after = snapshot.data();
  const unchangedIdentityAndDates =
    titleOf(after) === target.title &&
    after.uniqueId === target.uniqueId &&
    after.startDate === target.startDate &&
    after.endDate === target.endDate;
  const recurrenceRemoved =
    after.isRecurring === false &&
    after.recurring === false &&
    after.recurringPattern === 'none' &&
    Array.isArray(after.recurringDaysOfWeek) && after.recurringDaysOfWeek.length === 0 &&
    Array.isArray(after.recurringWeekdaySequence) && after.recurringWeekdaySequence.length === 0 &&
    after.recurringWeekInterval === 1 &&
    after.recurrenceUntilDate === '' &&
    after.totalOccurrences === 0;
  return {
    path: target.path,
    title: titleOf(after),
    startDate: after.startDate,
    endDate: after.endDate,
    recurrenceRemoved,
    unchangedIdentityAndDates,
    updatedAt: timestampValue(after.updatedAt),
  };
});

if (verification.some((item) => !item.recurrenceRemoved || !item.unchangedIdentityAndDates)) {
  throw new Error(`Post-write verification failed: ${JSON.stringify(verification, null, 2)}`);
}

const reportPath = path.join(artifactDir, `approved-14-open-ended-weekly-apply-report-${timestamp}.json`);
fs.writeFileSync(reportPath, JSON.stringify({
  appliedAt: new Date().toISOString(),
  projectId,
  targetCount: targets.length,
  backupPath,
  verifiedCount: verification.length,
  verification,
}, null, 2));

console.log(JSON.stringify({
  applied: true,
  targetCount: targets.length,
  verifiedCount: verification.length,
  backupPath,
  reportPath,
  verification,
}, null, 2));
