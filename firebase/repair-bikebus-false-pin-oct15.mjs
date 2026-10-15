// Default dry run. Delete only the approved unsupported public card; preserve source/media.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const args = process.argv.slice(2), apply = args.includes('--apply');
const planArg = args.find(a => a.startsWith('--plan='));
assert(args.every(a => a === '--apply' || a.startsWith('--plan=')));
assert.equal(apply, Boolean(planArg), 'Apply requires exact reviewed plan');
const target = 'venues/i3qvfV2bLwzx5LhJM1IB/events/DpmCz0FWEAR5t8HqczPP';
const venue = 'venues/i3qvfV2bLwzx5LhJM1IB';
const source = 'parse_snapshots/1YPf2cKvXfXl8L0HVL63VZ2zeTLEvWlit_221_1792070300114';
const sourceId = '2040103623589693', marker = 'runtime_metadata/event_feed';
const out = path.resolve(import.meta.dirname, '../functions/artifacts/oct15-sequential-repairs/bikebus');
const plain = x => JSON.parse(JSON.stringify(x));
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const wrap = d => ({path: d.ref.path, exists: d.exists,
  version: d.updateTime ? {seconds: d.updateTime.seconds, nanoseconds: d.updateTime.nanoseconds} : null,
  data: d.exists ? plain(d.data()) : null});
const related = d => d.ref.path.startsWith(venue + '/events/') ||
  String(d.get('uniqueId') || '').startsWith(sourceId + '_') || (d.get('sourceUniqueIds') || []).includes(sourceId);
const siblings = docs => docs.filter(related).map(wrap).sort((a, b) => a.path.localeCompare(b.path));
const idle = docs => assert(!docs.some(d => !['completed','failed','cancelled','canceled','released']
  .includes(String(d.get('status') || ''))), 'Active parser blocks cleanup');
const require = createRequire(new URL('../functions/package.json', import.meta.url)), admin = require('firebase-admin');
const key = JSON.parse(await fs.readFile(process.env.GATHR_SERVICE_ACCOUNT_PATH, 'utf8'));
assert.equal(key.project_id, 'gathr-migrated');
admin.initializeApp({credential: admin.credential.cert(key), projectId: key.project_id});
const db = admin.firestore();
try {
  const [refs, all, locks] = await Promise.all([
    db.getAll(db.doc(target), db.doc(venue), db.doc(source), db.doc(marker)),
    db.collectionGroup('events').get(), db.collection('processing_locks').get()
  ]);
  idle(locks.docs); assert(refs.every(d => d.exists));
  const event = refs[0].data(), snapshot = refs[2].data();
  assert.equal(event.eventName, 'Bike bus - Pink route');
  assert.equal(event.uniqueId, sourceId + '_77a3548a211ddc2e');
  assert.equal(event.venueId, venue.split('/')[1]); assert.equal(event.locationScope, 'venue');
  assert.equal(event.startDate, '2026-10-15'); assert.equal(event.endDate, '2026-10-15');
  assert.equal(event.startTime, '10:17'); assert.equal(event.endTime, '23:00');
  assert.equal(event.isRecurring, 'No'); assert.equal(event.recurringPattern, 'none');
  assert.equal(event.timeResolution.startFromPostTime, true);
  assert.equal(event.timeResolution.endFromHours, 'category_default');
  assert.equal(event.imageProvenance.primarySource, 'venue_media_fallback');
  assert.equal(snapshot.uniqueId, sourceId); assert.equal(snapshot.rowMeta.mediaUrls.length, 0);
  assert.match(snapshot.inputText, /Thursday, October 15th/);
  assert.match(snapshot.inputText, /Yellow route cancelled this morning/);
  assert.match(snapshot.inputText, /pink route/);
  assert(!/\b\d{1,2}[:.]\d{2}\b|\b\d{1,2}\s*(?:am|pm)\b/i.test(snapshot.inputText), 'Unexpected printed clock');
  const exactSource = all.docs.filter(d => String(d.get('uniqueId') || '').startsWith(sourceId + '_') || (d.get('sourceUniqueIds') || []).includes(sourceId));
  assert.deepEqual(exactSource.map(d => d.ref.path), [target], 'Unexpected exact-source sibling');
  const version = refs[3].get('version'); assert(Number.isSafeInteger(version) && version >= 0);
  const feedVersionChange = {path: marker, from: version, to: version + 1, updatedAt: 'server_timestamp'};
  const heldActivity = {sourceId, sourceSnapshot: source, name: event.eventName, date: '2026-10-15',
    startTime: '', endTime: '', locationScope: 'route', originalMediaUrls: [], confirmedStreets: [],
    reason: 'Qualifying morning activity retained for route/time verification; no invented school venue or public clocks',
    liveReviewCreated: false};
  const capture = {target, action: 'delete_unsupported_public_card', feedVersionChange,
    heldActivity, documents: refs.map(wrap), siblings: siblings(all.docs)};
  const snapshotHash = hash(capture), stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await fs.mkdir(out, {recursive: true});
  const backupPath = path.join(out, `${apply ? 'prewrite' : 'backup'}-${stamp}.json`);
  await fs.writeFile(backupPath, JSON.stringify(capture, null, 2));
  if (!apply) {
    const planPath = path.join(out, `plan-${stamp}.json`);
    await fs.writeFile(planPath, JSON.stringify({mode: 'dry_run', approvedForApply: false, target,
      action: capture.action, feedVersionChange, heldActivity, snapshotHash, backupPath}, null, 2));
    console.log(JSON.stringify({planPath, backupPath, target, action: capture.action, feedVersionChange,
      relatedEvents: capture.siblings.length, guardedReferences: refs.length, sourcePreserved: true, mediaDeletes: 0, liveWrites: 0}));
  } else {
    const plan = JSON.parse(await fs.readFile(path.resolve(planArg.slice(7)), 'utf8'));
    assert.equal(plan.target, target); assert.equal(plan.action, capture.action);
    assert.deepEqual(plan.feedVersionChange, feedVersionChange); assert.deepEqual(plan.heldActivity, heldActivity);
    assert.equal(plan.snapshotHash, snapshotHash, 'Approved source/target/sibling/marker drift');
    await db.runTransaction(async tx => {
      idle((await tx.get(db.collection('processing_locks'))).docs);
      assert.deepEqual((await tx.getAll(...refs.map(d => d.ref))).map(wrap), capture.documents, 'Reference drift');
      assert.deepEqual(siblings((await tx.get(db.collectionGroup('events'))).docs), capture.siblings, 'Sibling drift');
      tx.delete(db.doc(target));
      tx.update(db.doc(marker), {version: admin.firestore.FieldValue.increment(1), updatedAt: admin.firestore.FieldValue.serverTimestamp()});
    });
    assert(!(await db.doc(target).get()).exists);
    assert.equal((await db.doc(marker).get()).get('version'), version + 1);
    const resultPath = path.join(out, `applied-${stamp}.json`);
    await fs.writeFile(resultPath, JSON.stringify({appliedAt: new Date().toISOString(), target, action: capture.action,
      feedVersionChange, heldActivity, backupPath, deleted: 1, metadataUpdates: 1, mediaDeletes: 0, venueDeletes: 0,
      sourcePreserved: true, reviewWrites: 0}, null, 2));
    console.log(JSON.stringify({resultPath, target, deleted: 1, metadataUpdates: 1, mediaDeletes: 0, sourcePreserved: true}));
  }
} finally { await admin.app().delete(); }
