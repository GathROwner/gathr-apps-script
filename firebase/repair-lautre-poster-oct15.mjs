// Exact poster restoration. Default dry run; no uploads, deletes or source-array changes.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const args = process.argv.slice(2), apply = args.includes('--apply');
const planArg = args.find(a => a.startsWith('--plan='));
assert(args.every(a => a === '--apply' || a.startsWith('--plan=')));
assert.equal(apply, Boolean(planArg), 'Apply requires exact reviewed plan');
const target = 'venues/slug_thetivolicinema/events/dz35gb3dc50NwIl9kuUo';
const venue = 'venues/slug_thetivolicinema';
const ownerSource = 'parse_snapshots/11-wPIfOUWmVwQqpUGUQ3LF36BFDPWuOC_130_1791982660183';
const ownerId = '122232548528578108', originalId = '1645766067560308';
const ownerAudit = 'event_update_audits/xukMh49zSoikIwFa8PAT';
const overwriteAudit = 'event_update_audits/MegyqblVmVi8qMPi8Tfz';
const feedMarker = 'runtime_metadata/event_feed';
const poster = 'https://storage.googleapis.com/gathr-uploaded-images/postimages/1791982587266-8cbjb2.webp';
const generic = 'https://storage.googleapis.com/gathr-uploaded-images/postimages/1792068067084-5066ww.webp';
const out = path.resolve(import.meta.dirname, '../functions/artifacts/oct15-sequential-repairs/lautre');
const plain = x => JSON.parse(JSON.stringify(x));
const hash = x => createHash('sha256').update(Buffer.isBuffer(x) ? x : JSON.stringify(x)).digest('hex');
const wrap = d => ({path: d.ref.path, exists: d.exists,
  version: d.updateTime ? {seconds: d.updateTime.seconds, nanoseconds: d.updateTime.nanoseconds} : null,
  data: d.exists ? plain(d.data()) : null});
const related = d => d.ref.path.startsWith(venue + '/events/') ||
  [originalId, ownerId].some(id => String(d.get('uniqueId') || '').startsWith(id + '_') || (d.get('sourceUniqueIds') || []).includes(id));
const siblings = docs => docs.filter(related).map(wrap).sort((a, b) => a.path.localeCompare(b.path));
const idle = docs => assert(!docs.some(d => !['completed','failed','cancelled','canceled','released']
  .includes(String(d.get('status') || ''))), 'Active parser blocks repair');
const require = createRequire(new URL('../functions/package.json', import.meta.url)), admin = require('firebase-admin');
const key = JSON.parse(await fs.readFile(process.env.GATHR_SERVICE_ACCOUNT_PATH, 'utf8'));
assert.equal(key.project_id, 'gathr-migrated');
admin.initializeApp({credential: admin.credential.cert(key), projectId: key.project_id});
const db = admin.firestore();
try {
  const paths = [target, venue, ownerSource, ownerAudit, overwriteAudit, feedMarker];
  const [refs, all, locks, image] = await Promise.all([
    db.getAll(...paths.map(p => db.doc(p))), db.collectionGroup('events').get(),
    db.collection('processing_locks').get(), fetch(poster, {signal: AbortSignal.timeout(20000)})
  ]);
  idle(locks.docs); assert(refs.every(d => d.exists)); assert.equal(image.status, 200);
  const event = plain(refs[0].data()), owner = refs[3].data(), overwrite = refs[4].data();
  assert.equal(event.eventName, "L'Autre (The Other)");
  assert.equal(event.uniqueId, originalId + '_73e1ef9c2f67043a');
  assert.equal(event.venueId, 'slug_thetivolicinema'); assert.equal(event.category, 'Cinema');
  assert.equal(event.startDate, '2026-10-16'); assert.equal(event.endDate, '2026-10-16');
  assert.equal(event.startTime, '20:00'); assert.equal(event.endTime, '22:00');
  assert.equal(event.isRecurring, 'No'); assert.equal(event.recurringPattern, 'none');
  for (const f of ['image','imageUrl','relevantImageUrl']) assert.equal(event[f], generic);
  assert.equal(event.imageProvenance.primaryUrl, generic);
  assert.equal(event.imageProvenance.updatedBy, 'duplicate_merge');
  assert(event.mediaUrls.includes(poster)); assert(event.mediaUrls.includes(generic));
  assert.equal(refs[1].get('name'), 'The Tivoli Cinema');
  assert.equal(refs[2].get('uniqueId'), ownerId); assert.equal(refs[2].get('rowMeta').userName, 'The Tivoli Cinema');
  assert.match(refs[2].get('inputText'), /screenings hosted at Tivoli/);
  for (const audit of [owner, overwrite]) {
    assert.equal(audit.eventPath, target); assert.equal(audit.after.startDate, '2026-10-16');
    assert.equal(audit.after.startTime, '20:00'); assert.equal(audit.after.eventName, event.eventName);
  }
  assert.equal(owner.row.uniqueId, ownerId); assert.equal(owner.after.imageUrl, poster);
  assert.equal(owner.after.imageProvenance.isFallback, false);
  assert.equal(overwrite.row.uniqueId, '1564814712352727');
  assert.equal(overwrite.before.imageUrl, poster); assert.equal(overwrite.after.imageUrl, generic);
  const primaryFields = new Set(['image','imageUrl','relevantImageUrl']);
  const provenance = {...event.imageProvenance, primarySource: 'post_media', primaryField: 'relevantImageUrl',
    primaryUrl: poster, isFallback: false, updatedBy: 'manual_repair',
    selectionReason: 'source_verified_owner_programme_restore; audit:MegyqblVmVi8qMPi8Tfz',
    media: event.imageProvenance.media.map(m => primaryFields.has(m.field)
      ? {...m, url: poster, source: 'post_media', isPrimary: m.field === 'relevantImageUrl', isFallback: false}
      : {...m, isPrimary: false, ...(m.url === poster ? {isFallback: false} : {})})};
  // The overwrite's historical selection timestamp must not describe this restoration.
  delete provenance.setAt;
  const patch = {image: poster, imageUrl: poster, relevantImageUrl: poster, imageProvenance: provenance};
  const version = refs[5].get('version'); assert(Number.isSafeInteger(version) && version >= 0);
  const feedVersionChange = {path: feedMarker, from: version, to: version + 1, updatedAt: 'server_timestamp'};
  const bytes = Buffer.from(await image.arrayBuffer());
  const capture = {target, patch, feedVersionChange, documents: refs.map(wrap), siblings: siblings(all.docs),
    evidence: {ownerId, ownerSource, ownerAudit, overwriteAudit, poster, posterSha256: hash(bytes),
      printedOccurrence: 'Friday October16, L’Autre(The Other),8:00PM', retainedGalleryCount: event.mediaUrls.length}};
  const snapshotHash = hash(capture), stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await fs.mkdir(out, {recursive: true});
  const backupPath = path.join(out, `${apply ? 'prewrite' : 'backup'}-${stamp}.json`);
  await fs.writeFile(backupPath, JSON.stringify(capture, null, 2));
  await fs.writeFile(path.join(out, 'original.webp'), bytes);
  if (!apply) {
    const planPath = path.join(out, `plan-${stamp}.json`);
    await fs.writeFile(planPath, JSON.stringify({mode: 'dry_run', approvedForApply: false, target, patch,
      feedVersionChange, snapshotHash, backupPath, evidence: capture.evidence}, null, 2));
    console.log(JSON.stringify({planPath, backupPath, target, primaryPoster: poster, retainedGalleryCount: event.mediaUrls.length,
      feedVersionChange, relatedEvents: capture.siblings.length, guardedReferences: refs.length, liveWrites: 0}));
  } else {
    const plan = JSON.parse(await fs.readFile(path.resolve(planArg.slice(7)), 'utf8'));
    assert.equal(plan.target, target); assert.deepEqual(plan.patch, patch);
    assert.deepEqual(plan.feedVersionChange, feedVersionChange);
    assert.equal(plan.snapshotHash, snapshotHash, 'Approved record/source/audit/sibling/media/marker drift');
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
    await fs.writeFile(resultPath, JSON.stringify({appliedAt: new Date().toISOString(), target, patch, feedVersionChange,
      backupPath, updated: 1, metadataUpdates: 1, mediaWrites: 0}, null, 2));
    console.log(JSON.stringify({resultPath, target, updated: 1, metadataUpdates: 1, mediaWrites: 0}));
  }
} finally { await admin.app().delete(); }
