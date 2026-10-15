// Exact entertainment identity repair. Default dry run; no new event or meal copy.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {exec} from 'node:child_process';
import {promisify} from 'node:util';

const args = process.argv.slice(2), apply = args.includes('--apply');
const planArg = args.find(a => a.startsWith('--plan='));
assert(args.every(a => a === '--apply' || a.startsWith('--plan=')));
assert.equal(apply, Boolean(planArg), 'Apply requires the exact approved plan');
const target = 'venues/mke7HhKpmcxbnpV2tuzg/events/u0UWyWPeqU5IKF0SiWvs';
const venue = 'venues/mke7HhKpmcxbnpV2tuzg';
const source = 'parse_snapshots/1YPf2cKvXfXl8L0HVL63VZ2zeTLEvWlit_251_1792070859224';
const sourceId = '1734842218648626';
const feedMarker = 'runtime_metadata/event_feed';
const poster = 'https://storage.googleapis.com/gathr-uploaded-images/postimages/1792070833781-k51iy0.webp';
const title = 'Vintage 2.0 — Small Business Big Party';
const description = "Vintage 2.0 performs from 9:00 p.m. to 12:30 a.m. at Rodd Brudenell River Resort's Small Business Big Party on November 28. The $86.95 + tax per-person dinner-and-entertainment ticket includes a buffet dinner; dinner serving time is not supplied. Optional overnight packages start at $199.55 + tax for one guest or $310.10 + tax for two guests, including dinner, entertainment, accommodation and buffet breakfast the next morning. Bookings: jrice@roddvacations.com or +1 (902) 652-2332.";
const clockEvidence = 'Live entertainment by Vintage 2.0 from 9:00 PM–12:30 AM; dinner serving time is not supplied';
const patch = {eventName: title, name: title, description, _sourceType: 'event',
  timeFlags: {start: {source: 'explicit', evidence: clockEvidence}, end: {source: 'explicit', toClose: false, evidence: clockEvidence}},
  timeResolution: {hoursUsed: false, reason: 'source_explicit_entertainment_window'}};
const out = path.resolve(import.meta.dirname, '../functions/artifacts/oct15-sequential-repairs/rodd-party');
const plain = x => JSON.parse(JSON.stringify(x));
const hash = x => createHash('sha256').update(Buffer.isBuffer(x) ? x : JSON.stringify(x)).digest('hex');
const wrap = d => ({path: d.ref.path, exists: d.exists,
  version: d.updateTime ? {seconds: d.updateTime.seconds, nanoseconds: d.updateTime.nanoseconds} : null,
  data: d.exists ? plain(d.data()) : null});
const related = d => d.ref.path.startsWith(venue + '/events/') ||
  String(d.get('uniqueId') || '').startsWith(sourceId + '_') ||
  (d.get('sourceUniqueIds') || []).includes(sourceId);
const siblings = docs => docs.filter(related).map(wrap).sort((a, b) => a.path.localeCompare(b.path));
const idle = docs => assert(!docs.some(d => !['completed','failed','cancelled','canceled','released']
  .includes(String(d.get('status') || ''))), 'Active parser blocks repair');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');
const key = JSON.parse(await fs.readFile(process.env.GATHR_SERVICE_ACCOUNT_PATH, 'utf8'));
assert.equal(key.project_id, 'gathr-migrated');
admin.initializeApp({credential: admin.credential.cert(key), projectId: key.project_id});
const db = admin.firestore();
try {
  const [refs, all, locks, image] = await Promise.all([
    db.getAll(db.doc(target), db.doc(venue), db.doc(source), db.doc(feedMarker)),
    db.collectionGroup('events').get(), db.collection('processing_locks').get(),
    fetch(poster, {signal: AbortSignal.timeout(20000)})
  ]);
  idle(locks.docs); assert(refs.every(d => d.exists)); assert.equal(image.status, 200);
  const event = plain(refs[0].data());
  assert.equal(event.eventName, 'Buffet dinner'); assert.equal(event.name, 'Buffet dinner');
  assert.equal(event.uniqueId, sourceId + '_e967c3a3bdf9718c');
  assert.equal(event.venueId, venue.split('/')[1]);
  assert.equal(event.startDate, '2026-11-28'); assert.equal(event.endDate, '2026-11-29');
  assert.equal(event.startTime, '21:00'); assert.equal(event.endTime, '00:30');
  assert.equal(event.category, 'Live Music'); assert.equal(event.eventType, 'live_music');
  assert.equal(event.price, '$86.95 + tax per person'); assert.equal(event.ticketPrice, event.price);
  assert.equal(event._sourceType, 'special');
  assert.equal(event.isRecurring, 'No'); assert.equal(event.recurringPattern, 'none');
  assert.equal(event.isEvent, 'Yes'); assert.equal(event.isFoodSpecial, 'No');
  assert.equal(event.imageUrl, poster); assert.equal(event.imageProvenance.primarySource, 'post_media');
  assert.equal(refs[1].get('name'), 'Rodd Brudenell River Resort');
  assert.equal(refs[2].get('uniqueId'), sourceId);
  assert.match(refs[2].get('inputText'), /Small Business Big Party/);
  assert.match(refs[2].get('inputText'), /November 28th/);
  assert.match(refs[2].get('inputText'), /live entertainment by Vintage 2\.0 from 9:00 PM–12:30 AM/);
  assert.match(refs[2].get('inputText'), /Dinner & Entertainment:\s*\$86\.95 \+ tax per person/);
  const version = refs[3].get('version'); assert(Number.isSafeInteger(version) && version >= 0);
  const feedVersionChange = {path: feedMarker, from: version, to: version + 1, updatedAt: 'server_timestamp'};
  const bytes = Buffer.from(await image.arrayBuffer());
  const capture = {target, patch, feedVersionChange, documents: refs.map(wrap), siblings: siblings(all.docs),
    evidence: {sourceId, source, poster, posterSha256: hash(bytes), assessment: 'Named live entertainment owns the explicit clocks; dinner is included in the same admission and has no supplied serving time'}};
  const snapshotHash = hash(capture), stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await fs.mkdir(out, {recursive: true});
  const backupPath = path.join(out, `${apply ? 'prewrite' : 'backup'}-${stamp}.json`);
  await fs.writeFile(backupPath, JSON.stringify(capture, null, 2));
  await fs.writeFile(path.join(out, 'original-poster.webp'), bytes);
  if (!apply) {
    const planPath = path.join(out, `plan-${stamp}.json`);
    await fs.writeFile(planPath, JSON.stringify({mode: 'dry_run', approvedForApply: false,
      target, patch, feedVersionChange, snapshotHash, backupPath, evidence: capture.evidence}, null, 2));
    console.log(JSON.stringify({planPath, backupPath, target, patch, feedVersionChange,
      relatedEvents: capture.siblings.length, guardedReferences: refs.length, liveWrites: 0}));
  } else {
    const plan = JSON.parse(await fs.readFile(path.resolve(planArg.slice(7)), 'utf8'));
    assert.equal(plan.target, target); assert.deepEqual(plan.patch, patch);
    assert.deepEqual(plan.feedVersionChange, feedVersionChange);
    assert.equal(plan.snapshotHash, snapshotHash, 'Approved source/target/sibling/marker/media drift');
    const expectedHash = process.env.SHARED_ADMISSION_RELEASE_HASH;
    assert(/^[a-f0-9]{40}$/.test(expectedHash || ''), 'Independently verified parser repair hash required');
    const run = promisify(exec);
    const serving = await Promise.all([['processDataset','northamerica-northeast2'],['processDatasetResume','northamerica-northeast1'],['processDatasetSelectedRows','northamerica-northeast1']].map(async ([name,region]) => {
      const r = await run(`gcloud functions describe ${name} --gen2 --region=${region} --project=gathr-migrated --format="json(state,labels.firebase-functions-hash)"`);
      const fn = JSON.parse(r.stdout); assert.equal(fn.state, 'ACTIVE'); assert.equal(fn.labels['firebase-functions-hash'], expectedHash, 'Approved parser prevention not serving');
      return {name,hash:expectedHash};
    }));
    await db.runTransaction(async tx => {
      idle((await tx.get(db.collection('processing_locks'))).docs);
      assert.deepEqual((await tx.getAll(...refs.map(d => d.ref))).map(wrap), capture.documents, 'Reference drift');
      assert.deepEqual(siblings((await tx.get(db.collectionGroup('events'))).docs), capture.siblings, 'Sibling drift');
      tx.update(db.doc(target), {...patch, updatedAt: admin.firestore.FieldValue.serverTimestamp()});
      tx.update(db.doc(feedMarker), {version: admin.firestore.FieldValue.increment(1), updatedAt: admin.firestore.FieldValue.serverTimestamp()});
    });
    const fresh = plain((await db.doc(target).get()).data()), expected = {...event, ...patch};
    delete fresh.updatedAt; delete expected.updatedAt; assert.deepEqual(fresh, expected);
    assert.equal((await db.doc(feedMarker).get()).get('version'), version + 1);
    const resultPath = path.join(out, `applied-${stamp}.json`);
    await fs.writeFile(resultPath, JSON.stringify({appliedAt: new Date().toISOString(), target, patch,
      feedVersionChange, backupPath, serving, updated: 1, metadataUpdates: 1, mediaWrites: 0}, null, 2));
    console.log(JSON.stringify({resultPath, target, updated: 1, metadataUpdates: 1, mediaWrites: 0}));
  }
} finally { await admin.app().delete(); }
