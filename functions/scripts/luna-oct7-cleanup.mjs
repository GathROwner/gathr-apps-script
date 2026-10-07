import fs from 'node:fs/promises';
import path from 'node:path';
import admin from 'firebase-admin';

// Exact source-reviewed false listings from the completed October 7 canary.
// Run without --apply to create a backup and inspect the manifest first.
const targets = [
  ['venues/slug_kentstmarket/events/mHSh51ILHxY3QI7Qw17V', '1703137428484552', 'Thanksgiving Giveaway', '2026-10-06', '05:30'],
  ['venues/slug_kentstmarket/events/8Nl7VXj4JlW0sHmmXmFc', '1703120861819542', 'Mitchell’s Soups', '2026-10-06', '05:30'],
  ['venues/slug_easternkingssportsplex/events/eGhChwCIU8tk7mcHO1Mx', '1664781341775917', 'Ice Times', '2026-10-10', '10:00'],
  ['venues/slug_thepeicostore/events/uQaR8fMqYsZoW9tXmS1Q', '1708321424627287', '50% Off Sale', '2026-10-06', '15:58'],
  ['venues/nvQTJXSbDsSfJTCxDKCH/events/7Ox2Msd03bay2zjhtD9b', '1921690982618237', 'Miltonvale Park Municipal Council nomination deadline', '2026-10-16', '14:00'],
  ['venues/slug_koolbreezefarms/events/eA44SlcU3fzeUL1Cm2aQ', '1698435238957956', 'Small pumpkin', '2026-10-06', '11:30'],
  ['venues/slug_koolbreezefarms/events/s6GEwytdd4TjOrGXGpUx', '1698435238957956', 'Pumpkins, gourds & squash', '2026-10-06', '11:30'],
  ['venues/4OcLMCRKRGoKO5eQncLi/events/qZ9WlKhqMynLrQBAhbAx', '1137900838963869', 'Thanksgiving Pumpkin Floral Arrangement', '2026-10-09', '09:00'],
];
const keyPath = 'C:/Users/craig/Dev/gathr-apps-script/firebase/service-account.json';
const key = JSON.parse(await fs.readFile(keyPath, 'utf8'));
const app = admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id });
const db = admin.firestore(app);
const encode = value => {
  if (value instanceof admin.firestore.Timestamp) return { type: 'Timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds };
  if (value instanceof admin.firestore.GeoPoint) return { type: 'GeoPoint', latitude: value.latitude, longitude: value.longitude };
  if (value instanceof admin.firestore.DocumentReference) return { type: 'DocumentReference', path: value.path };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)]));
  return value;
};
const assertFingerprint = (snap, [, root, name, date, time]) => {
  if (!snap.exists) throw new Error(`Missing ${snap.ref.path}`);
  const value = snap.data();
  if (!String(value.uniqueId || '').startsWith(`${root}_`) ||
      String(value.name || '') !== name || String(value.startDate || '') !== date ||
      String(value.startTime || '') !== time) {
    throw new Error(`Fingerprint changed for ${snap.ref.path}`);
  }
};
const args = process.argv.slice(2);
const apply = args[0] === '--apply';
if (apply && !args[1]) throw new Error('Apply requires the exact reviewed manifest path');
const targetSnaps = await Promise.all(targets.map(async target => {
  const snap = await db.doc(target[0]).get();
  assertFingerprint(snap, target);
  return snap;
}));
const venueIds = [...new Set(targets.map(target => target[0].split('/')[1]))];
const siblings = [];
for (const venueId of venueIds) {
  const roots = new Set(targets.filter(target => target[0].split('/')[1] === venueId).map(target => target[1]));
  const docs = await db.collection('venues').doc(venueId).collection('events').get();
  for (const snap of docs.docs) {
    const value = snap.data();
    if ([...roots].some(root => String(value.uniqueId || '').startsWith(`${root}_`) ||
        (value.sourceUniqueIds || []).includes(root))) {
      siblings.push({ path: snap.ref.path, name: value.name, date: value.startDate,
        startTime: value.startTime, target: targets.some(target => target[0] === snap.ref.path) });
    }
  }
}
const current = targetSnaps.map(snap => ({ path: snap.ref.path,
  updateTime: encode(snap.updateTime), data: encode(snap.data()) }));
const outDir = path.resolve(import.meta.dirname, '../artifacts/luna-oct7-full-audit');
await fs.mkdir(outDir, { recursive: true });
if (!apply) {
  const filename = `live-cleanup-manifest-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const out = path.join(outDir, filename);
  await fs.writeFile(out, JSON.stringify({ purpose: 'Exact eight false listings, October 7 canary',
    createdAt: new Date().toISOString(), projectId: key.project_id, targets: current, siblings }, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ mode: 'dry-run', manifest: out, targets: current.map(x => x.path), siblings }));
  process.exit(0);
}
const manifest = JSON.parse(await fs.readFile(args[1], 'utf8'));
if (manifest.projectId !== key.project_id || manifest.targets?.length !== targets.length ||
    manifest.targets.some((entry, index) => entry.path !== targets[index][0] ||
      entry.updateTime?.seconds !== current[index].updateTime?.seconds ||
      entry.updateTime?.nanoseconds !== current[index].updateTime?.nanoseconds)) {
  throw new Error('Target or update-time drift from reviewed manifest');
}
const batch = db.batch();
for (const snap of targetSnaps) batch.delete(snap.ref, { lastUpdateTime: snap.updateTime });
await batch.commit();
const verification = await Promise.all(targets.map(async target => ({ path: target[0],
  exists: (await db.doc(target[0]).get()).exists })));
if (verification.some(item => item.exists)) throw new Error('Post-delete Firestore verification failed');
const resultPath = args[1].replace(/\.json$/, '-result.json');
await fs.writeFile(resultPath, JSON.stringify({ appliedAt: new Date().toISOString(), manifest: args[1], verification }, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ mode: 'applied', resultPath, verification }));
