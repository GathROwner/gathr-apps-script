import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const admin=require('firebase-admin');
const key=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));
assert.equal(key.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});
const db=admin.firestore(), out=new URL('../functions/artifacts/arts-mixer-oct15/',import.meta.url);
await fs.mkdir(out,{recursive:true});
const wrap=d=>({path:d.ref.path,exists:d.exists,updateTime:d.updateTime?.toDate().toISOString(),data:d.data()});
try{
 const [event,review,venue,oldChild,siblings,snapshots,locks]=await Promise.all([
  db.doc('events/location_4a23fba2153afb4b591c2675').get(),
  db.doc('city_level_event_reviews/cityevt_1eacc2fb688bed5d5af74314').get(),
  db.doc('venues/slug_confedcentre').get(),
  db.doc('venues/slug_confedcentre/events/tzoUblUahp59XP7sgK6H').get(),
  db.collectionGroup('events').where('startDate','==','2026-10-15').get(),
  db.collection('parse_snapshots').where('uniqueId','==','1506646261500744').get(),
  db.collection('processing_locks').get()]);
 const response=await fetch('https://gathr-backend-924732524090.northamerica-northeast1.run.app/api/v2/firestore/events/'+event.id,{signal:AbortSignal.timeout(30000)});
 const api={status:response.status,body:await response.json()};
 const evidence={checkedAt:new Date().toISOString(),event:wrap(event),review:wrap(review),venue:wrap(venue),oldChild:wrap(oldChild),
  siblings:siblings.docs.filter(d=>d.get('venueId')==='slug_confedcentre'||/arts.?mixer/i.test(d.get('eventName')||'')).map(wrap),
  snapshots:snapshots.docs.map(wrap),activeLocks:locks.docs.filter(d=>!['completed','failed','cancelled'].includes(d.get('status'))).map(wrap),api};
 await fs.writeFile(new URL('live-evidence.json',out),JSON.stringify(evidence,null,2));
 console.log(JSON.stringify({out:out.pathname,eventPath:event.ref.path,scope:event.get('locationScope'),venueId:event.get('venueId'),endTime:event.get('endTime'),reviewStatus:review.get('status'),snapshotCount:snapshots.size,siblingPaths:evidence.siblings.map(d=>d.path),activeLocks:evidence.activeLocks.map(d=>({path:d.path,status:d.data.status})),apiStatus:api.status,liveWrites:0}));
}finally{await admin.app().delete();}
