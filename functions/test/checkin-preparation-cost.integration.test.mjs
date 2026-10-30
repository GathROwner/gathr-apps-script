import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { discoverNearbyCheckInPlaces, listNearbyCanonicalCheckInVenues } from '../lib/social/nearbyCheckInPlaces.js';

assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):8098$/);
const projectId = 'demo-gathr-checkin-cost';
const point = { latitude: 46.2382, longitude: -63.1311 };
const baseMs = Date.now();
let app;
let db;
const reads = { queries: 0, documents: 0 };

function measuredQuery(query, collection) {
  return new Proxy(query, {
    get(target, property) {
      if (property === 'get') return async () => {
        const result = await target.get();
        if (collection === 'venues') { reads.queries += 1; reads.documents += result.size; }
        return result;
      };
      if (['where', 'limit', 'startAfter', 'orderBy'].includes(property)) {
        return (...args) => measuredQuery(target[property](...args), collection);
      }
      const value = target[property];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
let measuredDb;
before(async () => {
  app = initializeApp({ projectId }, 'checkin-cost-integration');
  db = getFirestore(app);
  measuredDb = new Proxy(db, { get(target, property) {
    if (property === 'collection') return name => measuredQuery(target.collection(name), name);
    const value = target[property]; return typeof value === 'function' ? value.bind(target) : value;
  } });
  const fixtures = [
    ['near-numeric', { ...point }],
    ['near-numeric-with-string-longitude', { latitude: point.latitude + .0002, longitude: ' -63.1311 ' }],
    ['same-band-far-longitude', { latitude: point.latitude, longitude: -62 }],
    ['near-string', { latitude: '46.2382', longitude: '-63.1311' }],
    ['near-string-exponent', { latitude: ' 4.62382e1 ', longitude: ' -63.1311 ' }],
    ['far-string', { latitude: '-46.2382', longitude: '-63.1311' }],
    ['invalid-string', { latitude: 'not-a-coordinate', longitude: '-63.1311' }],
    ...Array.from({ length: 600 }, (_, index) => [`far-numeric-${index}`, { latitude: 40 + index / 10000, longitude: -63 }]),
  ];
  for (let offset = 0; offset < fixtures.length; offset += 400) {
    const batch = db.batch();
    for (const [id, value] of fixtures.slice(offset, offset + 400)) batch.set(db.doc(`venues/${id}`), { pagename: id, ...value });
    await batch.commit();
  }
});
after(async () => { await deleteApp(app); });

const input = elapsed => ({ ...point, accuracyMeters: 17, capturedAtMs: baseMs + elapsed, preparation: true });
const emptyProvider = async () => ({ ok: true, json: async () => ({ elements: [] }) });
const expected = ['near-numeric', 'near-numeric-with-string-longitude', 'near-string', 'near-string-exponent'];
function assertCoverage(result) {
  assert.equal(result.preparationRadiusMetres, 175);
  assert.deepEqual(result.candidates.filter(x => x.type === 'gathr_venue').map(x => x.venueId).sort(), expected);
}

test('one combined preparation reads only the numeric latitude band and all supported legacy strings', async () => {
  const result = await discoverNearbyCheckInPlaces('local-cost-user', input(0), {
    db: measuredDb, fetchImpl: emptyProvider, now: Timestamp.fromMillis(baseMs),
  });
  assertCoverage(result);
  assert.equal(reads.queries, 2, 'one numeric-band query and one legacy-string query');
  assert.equal(reads.documents, 7, '600 unrelated numeric documents are never returned/read');
});

test('canonical fallback and explicit OSM retry reuse the complete covered cache with zero extra catalog reads', async () => {
  const before = { ...reads };
  const result = await listNearbyCanonicalCheckInVenues(input(10_000), { db: measuredDb, now: Timestamp.fromMillis(baseMs + 10_000) });
  assertCoverage(result);
  const retried = await discoverNearbyCheckInPlaces('local-cost-user', input(20_000), {
    db: measuredDb, fetchImpl: emptyProvider, now: Timestamp.fromMillis(baseMs + 20_000),
  });
  assertCoverage(retried);
  assert.deepEqual(reads, before);
});

test('expired cache performs one bounded refresh and retains mixed-coordinate coverage', async () => {
  const before = { ...reads };
  const elapsed = 5 * 60_000 + 1;
  const result = await discoverNearbyCheckInPlaces('local-cost-user', input(elapsed), {
    db: measuredDb, fetchImpl: emptyProvider, now: Timestamp.fromMillis(baseMs + elapsed),
  });
  assertCoverage(result);
  assert.equal(reads.queries - before.queries, 2);
  assert.equal(reads.documents - before.documents, 7);
});
