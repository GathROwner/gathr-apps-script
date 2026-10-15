// Read-only source/record capture for the next grouped review. No apply path.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');
const key = JSON.parse(await fs.readFile(process.env.GATHR_SERVICE_ACCOUNT_PATH, 'utf8'));
assert.equal(key.project_id, 'gathr-migrated');
assert.equal(process.argv.length, 2);
admin.initializeApp({credential: admin.credential.cert(key), projectId: key.project_id});
const db = admin.firestore();
const fileId = '1YPf2cKvXfXl8L0HVL63VZ2zeTLEvWlit';
const exactIds = new Set(['122317448546189551','1512635307563171','1727757279354846']);
const match = /RCMP|Royal Canadian Mounted|Blank Canvas|Daniel James McFadyen/i;
const wrap = d => ({path: d.ref.path, version: {seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}, data:d.data()});
try {
  const [snapshots, events] = await Promise.all([
    db.collection('parse_snapshots').where('fileId','==',fileId).get(),
    db.collectionGroup('events').get()
  ]);
  const sources = snapshots.docs.filter(d => exactIds.has(String(d.get('uniqueId'))) ||
    match.test(String(d.get('inputText') || '') + ' ' + String(d.get('venueName') || '')));
  const ids = sources.map(d => String(d.get('uniqueId')));
  const related = events.docs.filter(d => ids.some(id => String(d.get('uniqueId') || '').startsWith(id + '_') ||
    (d.get('sourceUniqueIds') || []).includes(id)) || match.test(String(d.get('eventName') || '')));
  const venuePaths = [...new Set(related.map(d => d.ref.path).filter(p => p.startsWith('venues/')).map(p => p.split('/').slice(0,2).join('/')))];
  const venues = venuePaths.length ? await db.getAll(...venuePaths.map(p => db.doc(p))) : [];
  const out = path.resolve(import.meta.dirname,'../functions/artifacts/oct15-sequential-repairs/next-batch');
  await fs.mkdir(out,{recursive:true});
  const output = path.join(out, 'readonly-capture.json');
  await fs.writeFile(output, JSON.stringify({capturedAt:new Date().toISOString(),fileId,
    sources:sources.map(wrap),events:related.map(wrap),venues:venues.filter(d=>d.exists).map(wrap),liveWrites:0},null,2));
  console.log(JSON.stringify({output,sourceCount:sources.length,eventCount:related.length,venueCount:venues.length,
    sources:sources.map(d=>({sourceId:d.get('uniqueId'),row:d.get('rowIndex')})),liveWrites:0}));
} finally { await admin.app().delete(); }
