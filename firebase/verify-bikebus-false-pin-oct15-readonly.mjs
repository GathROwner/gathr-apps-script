// Independent read-only verification of one approved public-card deletion.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
assert.equal(process.argv.length, 3, 'Applied result required');
const resultPath = path.resolve(process.argv[2]), result = JSON.parse(await fs.readFile(resultPath, 'utf8'));
const before = JSON.parse(await fs.readFile(result.backupPath, 'utf8'));
const target = 'venues/i3qvfV2bLwzx5LhJM1IB/events/DpmCz0FWEAR5t8HqczPP', id = target.split('/').at(-1);
assert.equal(result.target, target); assert.equal(result.deleted, 1); assert.equal(result.metadataUpdates, 1);
assert.equal(result.mediaDeletes, 0); assert.equal(result.venueDeletes, 0); assert.equal(result.reviewWrites, 0);
assert.deepEqual(result.heldActivity, before.heldActivity);
const require = createRequire(new URL('../functions/package.json', import.meta.url)), admin = require('firebase-admin');
const key = JSON.parse(await fs.readFile(process.env.GATHR_SERVICE_ACCOUNT_PATH, 'utf8'));
assert.equal(key.project_id, 'gathr-migrated');
admin.initializeApp({credential: admin.credential.cert(key), projectId: key.project_id});
const db = admin.firestore(), plain = x => JSON.parse(JSON.stringify(x));
const wrap = d => ({path: d.ref.path, exists: d.exists,
  version: d.updateTime ? {seconds: d.updateTime.seconds, nanoseconds: d.updateTime.nanoseconds} : null,
  data: d.exists ? plain(d.data()) : null});
const api = 'https://gathr-backend-924732524090.northamerica-northeast1.run.app/api/v2/firestore/events';
const get = async (url, status = 200) => { const r = await fetch(url, {signal: AbortSignal.timeout(60000)}); assert.equal(r.status, status); return r.json(); };
try {
  const refs = [...new Map([...before.documents, ...before.siblings].map(d => [d.path, d])).values()];
  const [docs, all] = await Promise.all([db.getAll(...refs.map(d => db.doc(d.path))), db.collectionGroup('events').get()]);
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i], old = refs[i];
    if (d.ref.path === target) assert(!d.exists);
    else if (d.ref.path === result.feedVersionChange.path) {
      const actual = plain(d.data()), expected = {...old.data, version: result.feedVersionChange.to};
      delete actual.updatedAt; delete expected.updatedAt; assert.deepEqual(actual, expected);
    } else assert.deepEqual(wrap(d), old, 'Untouched ' + old.path);
  }
  const sourceId = before.heldActivity.sourceId;
  const related = all.docs.filter(d => d.ref.path.startsWith('venues/i3qvfV2bLwzx5LhJM1IB/events/') ||
    String(d.get('uniqueId') || '').startsWith(sourceId + '_') || (d.get('sourceUniqueIds') || []).includes(sourceId));
  assert.deepEqual(related.map(d => d.ref.path).sort(), before.siblings.filter(d => d.path !== target).map(d => d.path).sort());
  await get(api + '/' + id, 404); await get(api + '/' + id + '?dateOnlyActivities=v1', 404);
  let cursor = '', pages = 0, feedTotal = 0; const seen = new Set();
  do {
    const u = new URL(api); u.searchParams.set('includeExpired', 'false');
    u.searchParams.set('limit', '100'); u.searchParams.set('dateOnlyActivities', 'v1');
    if (cursor) u.searchParams.set('startAfter', cursor);
    const p = await get(u); assert(Array.isArray(p.events)); feedTotal += p.events.length;
    assert(!p.events.some(e => e.id === id || e.originalEventId === id || String(e.id).startsWith(id + '_')));
    cursor = p.nextPageToken || ''; assert(++pages < 100);
    if (cursor) { assert(!seen.has(cursor)); seen.add(cursor); }
  } while (cursor);
  const event = before.documents[0].data;
  const media = [...new Set([event.imageUrl, ...event.mediaUrls, event.icon].filter(Boolean))];
  for (const url of media) assert.equal((await fetch(url, {method: 'HEAD', signal: AbortSignal.timeout(20000)})).status, 200);
  let marker;
  for (let attempt = 0; attempt < 3; attempt++) {
    marker = await get(api + '/version'); if (marker.version === result.feedVersionChange.to) break;
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 20000));
  }
  assert.equal(marker.version, result.feedVersionChange.to);
  const verified = {verifiedAt: new Date().toISOString(), resultPath, target, exactDeltaVerified: true,
    untouchedReferences: refs.length - 2, otherSiblingMembershipUnchanged: true, bothDetails404: true,
    activeFeedCount: 0, feedTotal, pages, sourceSnapshotUnchanged: true,
    heldActivityPreserved: true, liveReviewCreated: false, managedImages200: media.length,
    feedVersionVerified: marker.version, liveWrites: 0};
  const out = path.join(path.dirname(resultPath), 'independent-verification.json');
  await fs.writeFile(out, JSON.stringify(verified, null, 2)); console.log(JSON.stringify({out, ...verified}));
} finally { await admin.app().delete(); }
