// Independent exact-delta and complete app-feed verification. Never writes live data.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
assert.equal(process.argv.length, 3, 'Applied result required');
const resultPath = path.resolve(process.argv[2]), result = JSON.parse(await fs.readFile(resultPath, 'utf8'));
const before = JSON.parse(await fs.readFile(result.backupPath, 'utf8'));
const target = 'venues/slug_thetivolicinema/events/dz35gb3dc50NwIl9kuUo', id = target.split('/').at(-1);
assert.equal(result.target, target); assert.equal(result.updated, 1); assert.equal(result.metadataUpdates, 1);
assert.equal(result.mediaWrites, 0); assert.deepEqual(result.patch, before.patch);
const require = createRequire(new URL('../functions/package.json', import.meta.url)), admin = require('firebase-admin');
const key = JSON.parse(await fs.readFile(process.env.GATHR_SERVICE_ACCOUNT_PATH, 'utf8'));
assert.equal(key.project_id, 'gathr-migrated');
admin.initializeApp({credential: admin.credential.cert(key), projectId: key.project_id});
const db = admin.firestore(), plain = x => JSON.parse(JSON.stringify(x));
const wrap = d => ({path: d.ref.path, exists: d.exists,
  version: d.updateTime ? {seconds: d.updateTime.seconds, nanoseconds: d.updateTime.nanoseconds} : null,
  data: d.exists ? plain(d.data()) : null});
const api = 'https://gathr-backend-924732524090.northamerica-northeast1.run.app/api/v2/firestore/events';
const get = async url => { const r = await fetch(url, {signal: AbortSignal.timeout(60000)}); assert.equal(r.status, 200); return r.json(); };
const oldEvent = before.documents[0].data, poster = before.evidence.poster;
function checkEvent(e) {
  assert.equal(e.id, id); assert.equal(e.title, oldEvent.eventName);
  assert.equal(e.category, 'Cinema'); assert.equal(e.venueId, 'slug_thetivolicinema');
  assert.equal(e.startDate, '2026-10-16'); assert.equal(e.endDate, '2026-10-16');
  assert.equal(e.startTime, '20:00'); assert.equal(e.endTime, '22:00'); assert.equal(e.isRecurring, false);
  assert.equal(e.imageUrl, poster); assert.equal(e.relevantImageUrl, poster);
  assert.deepEqual(e.metadata.mediaUrls, oldEvent.mediaUrls, 'Full source gallery changed');
  assert.deepEqual(e.metadata.imageProvenance, result.patch.imageProvenance);
  assert.equal(e.metadata.imageProvenance.isFallback, false);
  assert.equal(e.description, oldEvent.description);
}
try {
  const refs = [...new Map([...before.documents, ...before.siblings].map(d => [d.path, d])).values()];
  const [docs, all] = await Promise.all([db.getAll(...refs.map(d => db.doc(d.path))), db.collectionGroup('events').get()]);
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i], old = refs[i]; assert(d.exists);
    if (d.ref.path === target || d.ref.path === result.feedVersionChange.path) {
      const actual = plain(d.data()), expected = d.ref.path === target ? {...old.data, ...result.patch} : {...old.data, version: result.feedVersionChange.to};
      delete actual.updatedAt; delete expected.updatedAt; assert.deepEqual(actual, expected, 'Exact approved delta');
    } else assert.deepEqual(wrap(d), old, 'Untouched ' + old.path);
  }
  const related = all.docs.filter(d => d.ref.path.startsWith('venues/slug_thetivolicinema/events/') ||
    ['1645766067560308','122232548528578108'].some(sourceId => String(d.get('uniqueId') || '').startsWith(sourceId + '_') || (d.get('sourceUniqueIds') || []).includes(sourceId)));
  assert.deepEqual(related.map(d => d.ref.path).sort(), before.siblings.map(d => d.path).sort());
  checkEvent((await get(api + '/' + id)).event);
  checkEvent((await get(api + '/' + id + '?dateOnlyActivities=v1')).event);
  const events = [], seen = new Set(); let cursor = '', pages = 0;
  do {
    const u = new URL(api); u.searchParams.set('includeExpired', 'false');
    u.searchParams.set('limit', '100'); u.searchParams.set('dateOnlyActivities', 'v1');
    if (cursor) u.searchParams.set('startAfter', cursor);
    const p = await get(u); assert(Array.isArray(p.events)); events.push(...p.events);
    cursor = p.nextPageToken || ''; assert(++pages < 100);
    if (cursor) { assert(!seen.has(cursor)); seen.add(cursor); }
  } while (cursor);
  const matches = events.filter(e => e.id === id || e.originalEventId === id);
  assert.equal(matches.length, 1); checkEvent(matches[0]);
  assert.equal(events.filter(e => e.venueId === 'slug_thetivolicinema' && e.title === oldEvent.eventName && e.startDate === '2026-10-16' && e.startTime === '20:00').length, 1);
  const media = [...new Set([oldEvent.imageUrl, ...oldEvent.mediaUrls, oldEvent.icon, poster].filter(Boolean))];
  for (const url of media) assert.equal((await fetch(url, {method: 'HEAD', signal: AbortSignal.timeout(20000)})).status, 200);
  const bytes = await (await fetch(poster, {signal: AbortSignal.timeout(20000)})).arrayBuffer();
  assert.equal(createHash('sha256').update(Buffer.from(bytes)).digest('hex'), before.evidence.posterSha256);
  let marker;
  for (let attempt = 0; attempt < 3; attempt++) {
    marker = await get(api + '/version'); if (marker.version === result.feedVersionChange.to) break;
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 20000));
  }
  assert.equal(marker.version, result.feedVersionChange.to);
  const verified = {verifiedAt: new Date().toISOString(), resultPath, target, exactDeltaVerified: true,
    untouchedReferences: refs.length - 2, siblingMembershipUnchanged: true, defaultAndCapableDetails200: true,
    activeFeedCount: 1, activeFeedTotal: events.length, activeFeedPages: pages, sameSessionDuplicate: false,
    galleryUnchanged: true, galleryCount: oldEvent.mediaUrls.length, managedImages200: media.length,
    restoredPosterBytesVerified: true, feedVersionVerified: marker.version, liveWrites: 0};
  const out = path.join(path.dirname(resultPath), 'independent-verification.json');
  await fs.writeFile(out, JSON.stringify(verified, null, 2)); console.log(JSON.stringify({out, ...verified}));
} finally { await admin.app().delete(); }
