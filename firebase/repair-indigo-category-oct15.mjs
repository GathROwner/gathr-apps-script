// Exact category repair. Default dry run; no deletes, uploads or parser replay.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';

const args = process.argv.slice(2), apply = args.includes('--apply');
const planArg = args.find(a => a.startsWith('--plan='));
assert(args.every(a => a === '--apply' || a.startsWith('--plan=')));
assert.equal(apply, Boolean(planArg), 'Apply requires the exact approved plan');
const target = 'venues/jY4hgzi01XJTh33vzH8j/events/vGzlY5BUkEthCbw9ZITj';
const venue = 'venues/jY4hgzi01XJTh33vzH8j';
const source = 'parse_snapshots/1YPf2cKvXfXl8L0HVL63VZ2zeTLEvWlit_312_1792072126096';
const sourceId = '1686018636743347';
const feedMarker = 'runtime_metadata/event_feed';
const poster = 'https://storage.googleapis.com/gathr-uploaded-images/postimages/1792072107994-7f44sv.webp';
const patch = {category: 'Gatherings & Parties', eventType: 'gatherings_parties'};
const out = path.resolve(import.meta.dirname, '../functions/artifacts/oct15-sequential-repairs/indigo');
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
  assert.equal(event.eventName, 'Thriller Book Club');
  assert.equal(event.uniqueId, sourceId + '_dad7a82b1415bc16');
  assert.equal(event.venueId, venue.split('/')[1]);
  assert.equal(event.startDate, '2026-10-15'); assert.equal(event.endDate, '2026-10-15');
  assert.equal(event.startTime, '18:00'); assert.equal(event.endTime, '19:00');
  assert.equal(event.category, 'Live Music'); assert.equal(event.eventType, 'live_music');
  assert.equal(event.isRecurring, 'No'); assert.equal(event.recurringPattern, 'none');
  assert.equal(event.isEvent, 'Yes'); assert.equal(event.isFoodSpecial, 'No');
  assert.equal(event.imageUrl, poster); assert.equal(event.imageProvenance.primarySource, 'post_media');
  assert.equal(refs[1].get('name'), 'Indigo Charlottetown');
  assert.equal(refs[2].get('uniqueId'), sourceId);
  assert.match(refs[2].get('inputText'), /discussions at Thriller book club/);
  assert.match(refs[2].get('inputText'), /October 15th/);
  assert.match(refs[2].get('inputText'), /6PM To 7PM/);
  const version = refs[3].get('version'); assert(Number.isSafeInteger(version) && version >= 0);
  const feedVersionChange = {path: feedMarker, from: version, to: version + 1, updatedAt: 'server_timestamp'};
  const bytes = Buffer.from(await image.arrayBuffer());
  const capture = {target, patch, feedVersionChange, documents: refs.map(wrap), siblings: siblings(all.docs),
    evidence: {sourceId, source, poster, posterSha256: hash(bytes), assessment: 'Source-confirmed book discussion; no live music performance'}};
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
      feedVersionChange, backupPath, updated: 1, metadataUpdates: 1, mediaWrites: 0}, null, 2));
    console.log(JSON.stringify({resultPath, target, updated: 1, metadataUpdates: 1, mediaWrites: 0}));
  }
} finally { await admin.app().delete(); }
