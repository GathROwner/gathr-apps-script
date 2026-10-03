#!/usr/bin/env node
// Correct the Delta/Cork venue identity and move only the three audited CBA CLE sessions.
// Requires GATHR_SERVICE_ACCOUNT_PATH; default is read-only, --apply writes atomically.
const fs = require('node:fs');
const path = require('node:path');

const keyPath = process.env.GATHR_SERVICE_ACCOUNT_PATH;
if (!keyPath || !path.isAbsolute(keyPath)) {
  throw new Error('Set GATHR_SERVICE_ACCOUNT_PATH to an absolute service-account.json path.');
}
const admin = require(require.resolve('firebase-admin', { paths: [path.dirname(keyPath)] }));
admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
const db = admin.firestore();
const FV = admin.firestore.FieldValue;
const apply = process.argv.includes('--apply');
const outputDir = path.resolve(__dirname, '../artifacts/luna-oct3-canary-audit');
const hotelPath = 'venues/slug_thecorkandcast';
const corkPath = 'venues/fb_100063454005090';
const organizerPath = 'venues/slug_cbapeibranch';
const sourceRoot = '1401951132140319_';
const sessions = [
  { id: 'j5Hgi5E7eo8JFtdaJId7', uniqueId: `${sourceRoot}2533dd31b83ba332`,
    name: 'Session 1: Body worn cameras – how do they work?', startTime: '09:00', endTime: '10:00' },
  { id: 'PcdCv7owRyGL9d3VWFRU', uniqueId: `${sourceRoot}619f694e72d7a37b`,
    name: 'Session 2: I have a DUI – what now?', startTime: '10:15', endTime: '11:15' },
  { id: '5BLbnZHgUDJBhWz4PxLl', uniqueId: `${sourceRoot}bfb730c468f7c6bc`,
    name: 'Session 3: I have been charged or convicted – will I be deported?',
    startTime: '23:30', endTime: '12:30' },
];

async function readPlan() {
  const hotelRef = db.doc(hotelPath);
  const corkRef = db.doc(corkPath);
  const organizerRef = db.doc(organizerPath);
  const sourceRefs = sessions.map(item => organizerRef.collection('events').doc(item.id));
  const destRefs = sessions.map(item => hotelRef.collection('events').doc(item.id));
  const [hotel, cork, ...docs] = await Promise.all([
    hotelRef.get(), corkRef.get(), ...sourceRefs.map(ref => ref.get()), ...destRefs.map(ref => ref.get()),
  ]);
  const sources = docs.slice(0, sessions.length);
  const destinations = docs.slice(sessions.length);
  const errors = [];
  if (!hotel.exists || !cork.exists) errors.push('hotel or independent Cork venue missing');
  if (sources.some(s => !s.exists)) errors.push('one or more CBA source documents missing');
  if (destinations.some(s => s.exists)) errors.push('one or more destination event IDs already exist');
  if (errors.length) throw new Error(errors.join('; '));
  const h = hotel.data(), c = cork.data();
  if (h.name !== 'Delta Hotels by Marriott Prince Edward | Charlottetown PE' ||
      h.googlePlaceId !== 'ChIJafTyeuJSXksRfB4nqjM1eRc' ||
      h.address !== '18 Queen St, Charlottetown, PE C1A 4A1, Canada' ||
      h.facebookUrl !== 'https://www.facebook.com/thecorkandcast' ||
      h.pageurl !== 'https://www.facebook.com/thecorkandcast' ||
      h.pagenameSlug !== 'thecorkandcast' ||
      c.facebookUrl !== 'https://www.facebook.com/thecorkandcast' ||
      c.googlePlaceId !== 'ChIJvaVGTpFTXksRaFjPyWpl8ow') {
    errors.push('venue identity fingerprint changed');
  }
  sources.forEach((doc, index) => {
    const x = doc.data(), expected = sessions[index];
    if (x.uniqueId !== expected.uniqueId || x.name !== expected.name ||
        x.venueId !== 'slug_cbapeibranch' ||
        x.additionalLocation !== 'The Delta Prince Edward' ||
        x.startDate !== '2026-10-20' || x.endDate !== (index === 2 ? '2026-10-21' : '2026-10-20') ||
        x.startTime !== expected.startTime || x.endTime !== expected.endTime ||
        x.isRecurring !== 'No') errors.push(`CBA event ${expected.id} fingerprint changed`);
  });
  const siblings = await db.collectionGroup('events').orderBy('uniqueId')
    .startAt(sourceRoot).endAt(`${sourceRoot}\uf8ff`).get();
  const siblingPaths = siblings.docs.map(d => d.ref.path).sort();
  const expectedPaths = sourceRefs.map(ref => ref.path).sort();
  if (JSON.stringify(siblingPaths) !== JSON.stringify(expectedPaths)) {
    errors.push(`unexpected source siblings: ${siblingPaths.join(', ')}`);
  }
  if (errors.length) throw new Error(errors.join('; '));
  return { hotel, cork, sources, destinations, hotelRef, sourceRefs, destRefs, siblingPaths };
}

async function main() {
  if (process.argv.some(arg => arg.startsWith('--') && arg !== '--apply')) {
    throw new Error('Only --apply is supported. Default is dry run.');
  }
  const p = await readPlan();
  const address = p.hotel.get('address');
  const summary = {
    mode: apply ? 'apply' : 'dry-run', hotelPath, independentCorkPath: corkPath,
    hotelUpdate: ['delete false facebookUrl', 'delete false pageurl',
      'delete false pagenameSlug', 'delete unavailable profileImage'],
    move: sessions.map((item, i) => ({
      from: p.sourceRefs[i].path, to: p.destRefs[i].path, name: item.name,
      date: '2026-10-20', time: i === 2 ? '11:30–12:30' : `${item.startTime}–${item.endTime}`,
      address,
    })),
    sourceSiblingPaths: p.siblingPaths,
  };
  if (!apply) { console.log(JSON.stringify(summary, null, 2)); return; }

  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(outputDir, `cba-delta-live-backup-${stamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify({ capturedAt: new Date().toISOString(),
    documents: [p.hotel, p.cork, ...p.sources].map(s => ({ path: s.ref.path,
      updateTime: s.updateTime.toDate().toISOString(), data: s.data() })),
    absentDestinations: p.destRefs.map(ref => ref.path),
  }, null, 2));

  const batch = db.batch();
  batch.update(p.hotelRef, {
    facebookUrl: FV.delete(), pageurl: FV.delete(), pagenameSlug: FV.delete(),
    profileImage: FV.delete(), updatedAt: FV.serverTimestamp(),
  }, { lastUpdateTime: p.hotel.updateTime });
  p.sources.forEach((source, i) => {
    const next = { ...source.data(),
      venueId: p.hotelRef.id,
      establishment: p.hotel.get('name'),
      locationScope: 'venue',
      locationLabel: p.hotel.get('name'),
      locationPrecision: 'exact',
      locationReviewStatus: 'not_needed',
      address, rawAddress: address, normalizedAddress: address,
      addressSource: 'venue', addressNormalizationIssues: [],
      latitude: p.hotel.get('latitude'), longitude: p.hotel.get('longitude'),
      addressUpdatedAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp(),
    };
    if (i === 2) {
      next.startTime = '11:30';
      next.endDate = '2026-10-20';
      next.timeFlags = {
        start: { source: 'semantic', evidence: '11:30 a.m. reconciled from the printed 8:30 a.m.–12:30 p.m. half-day program; session meridiem typo' },
        end: { source: 'explicit', toClose: false, evidence: 'printed 12:30 p.m. session end' },
      };
    }
    batch.create(p.destRefs[i], next);
    batch.delete(p.sourceRefs[i], { lastUpdateTime: source.updateTime });
  });
  await batch.commit();
  const [hotelAfter, ...destAfter] = await Promise.all([
    p.hotelRef.get(), ...p.destRefs.map(ref => ref.get()),
  ]);
  const sourceAfter = await Promise.all(p.sourceRefs.map(ref => ref.get()));
  if (hotelAfter.get('facebookUrl') || hotelAfter.get('pageurl') ||
      hotelAfter.get('pagenameSlug') || hotelAfter.get('profileImage') ||
      sourceAfter.some(s => s.exists) || destAfter.some((s, i) => !s.exists ||
        s.get('venueId') !== p.hotelRef.id || s.get('address') !== address ||
        (i === 2 && (s.get('startTime') !== '11:30' || s.get('endDate') !== '2026-10-20')))) {
    throw new Error(`Write committed but verification failed; inspect ${backupPath}`);
  }
  const resultPath = path.join(outputDir, `cba-delta-live-result-${stamp}.json`);
  fs.writeFileSync(resultPath, JSON.stringify({ ...summary, mode: 'applied',
    backupPath, verified: true, appliedAt: new Date().toISOString() }, null, 2));
  console.log(JSON.stringify({ mode: 'applied', backupPath, resultPath, verified: true }));
}

main().catch(e => { console.error(e.message); process.exitCode = 1; })
  .finally(() => admin.app().delete());
