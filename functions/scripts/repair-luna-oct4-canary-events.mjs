import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import admin from 'firebase-admin';

const apply = process.argv.includes('--apply');
const keyPath = process.env.GATHR_SERVICE_ACCOUNT_PATH;
if (!keyPath) throw new Error('Set GATHR_SERVICE_ACCOUNT_PATH');
const key = JSON.parse(await fs.readFile(keyPath, 'utf8'));
const app = admin.initializeApp({
  credential: admin.credential.cert(key), projectId: key.project_id,
}, 'lunaOct4CanaryRepair');
const db = admin.firestore(app);
const root = path.resolve(import.meta.dirname, '../..');
const artifactDir = path.join(root, 'artifacts/luna-oct4-canary-audit');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

const sourceTangoPath = 'venues/0F6W6IBgJqlKQ8AmaTGC/events/CYXXEhbfahgyorkBiHuh';
const otherTangoPath = 'venues/0F6W6IBgJqlKQ8AmaTGC/events/vCh9VytctvxFJMLJt4sw';
const tangoId = createHash('sha256')
  .update('122146813899035455|Saturday Night $5 Tango|2026-10-17|19:00')
  .digest('hex').slice(0, 20);
const newTangoPath = `venues/0F6W6IBgJqlKQ8AmaTGC/events/${tangoId}`;
const availablePath = 'venues/slug_easternkingssportsplex/events/ROzJR7ratuRXNmaj5Fam';
const macpheePath = 'venues/slug_easternkingssportsplex/events/LOtdim5QCB9piP3YiF4n';
const paths = [sourceTangoPath, otherTangoPath, availablePath, macpheePath];
const snapshots = await Promise.all(paths.map(p => db.doc(p).get()));
if (snapshots.some(s => !s.exists)) throw new Error('A source or target document is missing');
const [sourceTango, otherTango, available, macphee] = snapshots;
const sameSource = (data, id) => String(data.uniqueId || '').startsWith(`${id}_`);
if (!sameSource(sourceTango.data(), '122146813899035455') ||
    sourceTango.get('name') !== 'Saturday Night $5 Tango' ||
    sourceTango.get('startDate') !== '2026-10-10' ||
    sourceTango.get('startTime') !== '19:00' ||
    sourceTango.get('endTime') !== '21:00' ||
    sourceTango.get('recurringPattern') !== 'none' ||
    !sameSource(otherTango.data(), '122146813899035455') ||
    otherTango.get('startDate') !== '2026-10-24' ||
    otherTango.get('startTime') !== '19:00' ||
    !sameSource(available.data(), '1662948381959213') ||
    available.get('name') !== 'AVAILABLE' ||
    available.get('startDate') !== '2026-10-10' ||
    available.get('startTime') !== '09:00' ||
    available.get('endTime') !== '10:00' ||
    !sameSource(macphee.data(), '1662948381959213') ||
    macphee.get('name') !== 'MACPHEE' ||
    macphee.get('startDate') !== '2026-10-10' ||
    macphee.get('startTime') !== '11:20' ||
    macphee.get('endDate') !== '2026-10-11' ||
    macphee.get('endTime') !== '00:20') {
  throw new Error('A live document no longer matches the approved source/date/time fingerprint');
}

const existingNew = await db.doc(newTangoPath).get();
if (existingNew.exists) throw new Error('The planned October 17 document already exists');
const venueSiblings = await db.collection('venues/0F6W6IBgJqlKQ8AmaTGC/events').get();
const october17Tango = venueSiblings.docs.filter(doc => {
  const d = doc.data();
  return d.startDate === '2026-10-17' && /tango/i.test(String(d.name || d.eventName || ''));
});
if (october17Tango.length) {
  throw new Error(`October 17 Tango already exists: ${october17Tango.map(x => x.ref.path).join(', ')}`);
}

const backup = {
  checkedAt: new Date().toISOString(),
  plannedNewPath: newTangoPath,
  documents: snapshots.map(snapshot => ({
    path: snapshot.ref.path,
    updateTime: snapshot.updateTime.toDate().toISOString(),
    data: snapshot.data(),
  })),
  tangoSiblings: venueSiblings.docs
    .filter(doc => /tango/i.test(String(doc.get('name') || doc.get('eventName') || '')))
    .map(doc => ({ path: doc.ref.path, uniqueId: doc.get('uniqueId'),
      startDate: doc.get('startDate'), startTime: doc.get('startTime') })),
};
await fs.mkdir(artifactDir, { recursive: true });
const backupPath = path.join(artifactDir, `oct4-canary-event-repair-backup-${stamp}.json`);
await fs.writeFile(backupPath, JSON.stringify(backup, null, 2));

const availableUpdate = {
  name: 'Bookable Ice Time',
  eventName: 'Bookable Ice Time',
  description: 'Saturday, October 10, 9–10 a.m. is marked AVAILABLE for ice-time booking. To book, call Aaron at (902) 687-2323, email eksportsplex@gmail.com, or message @EasternKingsSportsplex on Facebook. Confirm availability with the venue.',
};
const macpheeUpdate = {
  endDate: '2026-10-10',
  endTime: '12:20',
  description: 'MACPHEE ice time, Saturday, October 10, 11:20 a.m.–12:20 p.m. The poster prints “12:20 AM” for the end, apparently an AM/PM error: the next listed slot starts at 12:30 p.m. Confirm the time with Eastern Kings Sportsplex.',
};
const newTango = {
  ...sourceTango.data(),
  uniqueId: `122146813899035455_${tangoId.slice(0, 16)}`,
  startDate: '2026-10-17',
  endDate: '2026-10-17',
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
};
const result = {
  mode: apply ? 'apply' : 'dry-run',
  backupPath,
  planned: [
    { path: newTangoPath, action: 'create', name: newTango.name,
      date: newTango.startDate, time: newTango.startTime },
    { path: availablePath, action: 'update', fields: availableUpdate },
    { path: macpheePath, action: 'update', fields: macpheeUpdate },
  ],
};
if (apply) {
  const batch = db.batch();
  batch.create(db.doc(newTangoPath), newTango);
  batch.update(available.ref, availableUpdate, { lastUpdateTime: available.updateTime });
  batch.update(macphee.ref, macpheeUpdate, { lastUpdateTime: macphee.updateTime });
  await batch.commit();
  const [newAfter, availableAfter, macpheeAfter] = await Promise.all(
    [newTangoPath, availablePath, macpheePath].map(p => db.doc(p).get())
  );
  if (!newAfter.exists || newAfter.get('startDate') !== '2026-10-17' ||
      newAfter.get('startTime') !== '19:00' ||
      availableAfter.get('name') !== 'Bookable Ice Time' ||
      macpheeAfter.get('endDate') !== '2026-10-10' ||
      macpheeAfter.get('endTime') !== '12:20') {
    throw new Error('The write committed but readback did not match; inspect live data immediately');
  }
  result.verified = true;
}
const reportPath = path.join(artifactDir, `oct4-canary-event-repair-${stamp}.json`);
await fs.writeFile(reportPath, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, reportPath }));
