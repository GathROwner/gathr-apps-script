/** Read-only source and live-state capture for the approved October17 follow-ups. */
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const admin=require('firebase-admin');
const scoring=require('../functions/artifacts/oct17-eight-group-release/parser-release/lib/utils/familyFriendlyScoring.js');
assert.equal(scoring.FAMILY_FRIENDLY_SCORING_VERSION,'family-friendly-v6');
const credential=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));
assert.equal(credential.project_id,'gathr-migrated');
const app=admin.initializeApp({credential:admin.credential.cert(credential),projectId:credential.project_id}),db=app.firestore();
const out=new URL('./artifacts/oct17-remaining-followups/',import.meta.url);
const wrap=d=>({path:d.ref.path,exists:d.exists,updateTime:d.updateTime?{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}:null,data:d.exists?d.data():null});
try {
 const [venue,events,snapshots,locks,feed,hold,retired]=await Promise.all([
  db.doc('venues/1ehK5wrBKC460QSpqUMq').get(),db.collection('venues/1ehK5wrBKC460QSpqUMq/events').get(),
  db.collection('parse_snapshots').where('uniqueId','==','1732518712212204').get(),db.collection('processing_locks').get(),
  db.doc('runtime_metadata/event_feed').get(),db.doc('event_integrity_holds/oct17_mothlane_clock_1720610070064632').get(),
  db.doc('venues/slug_mothlanebrewing/events/dqtPfabTkUTz0dn2pHVW').get()]);
 const relevant=events.docs.filter(d=>String(d.get('uniqueId')||'').startsWith('1732518712212204'));
 const calculations=relevant.map(d=>({path:d.ref.path,name:d.get('name'),stored:d.get('familyFriendlyScore'),calculated:scoring.scoreFamilyFriendly(d.data())}));
 const result={checkedAt:new Date().toISOString(),venue:wrap(venue),events:relevant.map(wrap),snapshots:snapshots.docs.map(wrap),
  locks:locks.docs.map(wrap),feed:wrap(feed),mothHold:wrap(hold),mothRetired:wrap(retired),calculations,liveWrites:0,paidCalls:0};
 await fs.mkdir(out,{recursive:true});await fs.writeFile(new URL('housekeeping-readback.json',out),JSON.stringify(result,null,2));
 console.log(JSON.stringify({checkedAt:result.checkedAt,snapshots:snapshots.size,calculations,feedVersion:feed.get('version'),
  activeLocks:locks.docs.filter(d=>!['completed','failed','cancelled','canceled','released'].includes(d.get('status'))).length,
  mothHoldStatus:hold.get('status'),mothRetiredAbsent:!retired.exists,liveWrites:0,paidCalls:0}));
}finally{await app.delete();}
