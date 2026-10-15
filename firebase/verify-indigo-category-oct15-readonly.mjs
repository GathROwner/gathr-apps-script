// Read-only exact-delta, source, media and app-delivery verification.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
assert.equal(process.argv.length, 3, 'Applied result required');
const resultPath = path.resolve(process.argv[2]), result = JSON.parse(await fs.readFile(resultPath, 'utf8'));
const before = JSON.parse(await fs.readFile(result.backupPath, 'utf8'));
const target = 'venues/jY4hgzi01XJTh33vzH8j/events/vGzlY5BUkEthCbw9ZITj', id = target.split('/').at(-1);
assert.equal(result.target, target); assert.equal(result.updated, 1); assert.equal(result.metadataUpdates, 1);
assert.equal(result.mediaWrites, 0);
assert.deepEqual(result.patch, {category: 'Gatherings & Parties', eventType: 'gatherings_parties'});
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
function checkEvent(e) {
  assert.equal(e.id, id); assert.equal(e.category, 'Gatherings & Parties');
  assert.equal(e.title, 'Thriller Book Club'); assert.equal(e.venueId, 'jY4hgzi01XJTh33vzH8j');
  assert.equal(e.startDate, '2026-10-15'); assert.equal(e.endDate, '2026-10-15');
  assert.equal(e.startTime, '18:00'); assert.equal(e.endTime, '19:00');
  assert.equal(e.imageUrl, before.evidence.poster); assert.equal(e.isRecurring, false);
}
async function feed(includeExpired) {
  const events = [], seen = new Set(); let cursor = '', pages = 0;
  do {
    const u = new URL(api); u.searchParams.set('includeExpired', String(includeExpired));
    u.searchParams.set('limit', '100'); u.searchParams.set('dateOnlyActivities', 'v1');
    if (cursor) u.searchParams.set('startAfter', cursor);
    const p = await get(u); assert(Array.isArray(p.events)); events.push(...p.events);
    cursor = p.nextPageToken || ''; assert(++pages < 100);
    if (cursor) { assert(!seen.has(cursor)); seen.add(cursor); }
  } while (cursor);
  return {events, pages};
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
  const related = all.docs.filter(d => d.ref.path.startsWith('venues/jY4hgzi01XJTh33vzH8j/events/') ||
    String(d.get('uniqueId') || '').startsWith('1686018636743347_') || (d.get('sourceUniqueIds') || []).includes('1686018636743347'));
  assert.deepEqual(related.map(d => d.ref.path).sort(), before.siblings.map(d => d.path).sort());
  checkEvent((await get(api + '/' + id)).event);
  checkEvent((await get(api + '/' + id + '?dateOnlyActivities=v1')).event);
  const active = await feed(false), matches = active.events.filter(e => e.id === id || e.originalEventId === id);
  const knownExpired = Date.now() > Date.parse('2026-10-15T22:05:00Z');
  assert.equal(matches.length, knownExpired ? 0 : 1); matches.forEach(checkEvent);
  const complete = await feed(true), stored = complete.events.filter(e => e.id === id || e.originalEventId === id);
  assert.equal(stored.length, 1); checkEvent(stored[0]);
  assert.equal(complete.events.filter(e => e.venueId === 'jY4hgzi01XJTh33vzH8j' && e.title === 'Thriller Book Club' && e.startDate === '2026-10-15' && e.startTime === '18:00').length, 1);
  const media = [...new Set([before.documents[0].data.imageUrl, ...before.documents[0].data.mediaUrls, before.documents[0].data.icon].filter(Boolean))];
  for (const url of media) assert.equal((await fetch(url, {method: 'HEAD', signal: AbortSignal.timeout(20000)})).status, 200);
  let marker;
  for (let attempt = 0; attempt < 3; attempt++) {
    marker = await get(api + '/version'); if (marker.version === result.feedVersionChange.to) break;
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 20000));
  }
  assert.equal(marker.version, result.feedVersionChange.to);
  const verified = {verifiedAt: new Date().toISOString(), resultPath, target, exactDeltaVerified: true,
    untouchedReferences: refs.length - 2, siblingMembershipUnchanged: true, defaultAndCapableDetails200: true,
    activeFeedCount: matches.length, activeFeedTotal: active.events.length, activeFeedPages: active.pages,
    completeFeedCount: 1, completeFeedTotal: complete.events.length, completeFeedPages: complete.pages,
    sameSessionDuplicate: false, managedImages200: media.length, feedVersionVerified: marker.version, liveWrites: 0};
  const out = path.join(path.dirname(resultPath), 'independent-verification.json');
  await fs.writeFile(out, JSON.stringify(verified, null, 2)); console.log(JSON.stringify({out, ...verified}));
} finally { await admin.app().delete(); }
