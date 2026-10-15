import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
assert.equal(process.argv.length,2);const root=path.resolve(import.meta.dirname,'..'),out=path.join(import.meta.dirname,'artifacts/six-groups-oct15');
const ledger=JSON.parse(await fs.readFile(path.join(root,'functions/artifacts/luna-oct15-production-audit/source-review/source-ledger.json'),'utf8'));
const rows=[48,154,178,192,200,231,254,271,307,317,325,338],sources=ledger.filter(s=>rows.includes(s.row)),ids=new Set(sources.map(s=>s.sourceId));assert.equal(sources.length,12);
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');const key=JSON.parse(await fs.readFile(process.env.GATHR_SERVICE_ACCOUNT_PATH,'utf8'));assert.equal(key.project_id,'gathr-migrated');admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});
const db=admin.firestore(),wrap=d=>({path:d.ref.path,exists:d.exists,version:d.updateTime?{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}:null,data:d.exists?JSON.parse(JSON.stringify(d.data())):null});
try{
 const [all,venues,unknown,reviews,snaps,locks,feed]=await Promise.all([db.collectionGroup('events').get(),db.collection('venues').get(),db.collection('unrecognized_venues').get(),db.collection('city_level_event_reviews').get(),db.getAll(...sources.map(s=>db.doc(s.snapshotPath))),db.collection('processing_locks').get(),db.doc('runtime_metadata/event_feed').get()]);
 const match=/Ruby|Mill River|RCMP|Blank Canvas|Confederation Court|Andersons Creek|Skeleton|Soft Internet|Adoption Week|Playhouse Christmas|Energy Drinks|October Council Meeting/i;
 const selectedVenueIds=new Set(venues.docs.filter(d=>match.test(String(d.get('name')||''))||/Kings Playhouse|Kensington.*Library|PetSmart/i.test(String(d.get('name')||''))).map(d=>d.id));
 const related=all.docs.filter(d=>selectedVenueIds.has(d.get('venueId'))||ids.has(String(d.get('uniqueId')||'').split('_')[0])||(d.get('sourceUniqueIds')||[]).some(id=>ids.has(id))||match.test(String(d.get('eventName')||d.get('name')||'')));
 const venueIds=new Set(related.map(d=>d.get('venueId')));
 const matchingVenues=venues.docs.filter(d=>venueIds.has(d.id)||selectedVenueIds.has(d.id));
 const queues=[...unknown.docs,...reviews.docs].filter(d=>match.test(JSON.stringify(d.data()))||sources.some(s=>JSON.stringify(d.data()).includes(s.sourceId)));
 await fs.mkdir(out,{recursive:true});const capture={capturedAt:new Date().toISOString(),sources,documents:[...related,...matchingVenues,...queues,...snaps,feed].map(wrap),locks:locks.docs.map(wrap),liveWrites:0};
 await fs.writeFile(path.join(out,'capture.json'),JSON.stringify(capture,null,2));
 console.log(JSON.stringify({out,sources:sources.length,events:related.length,venues:matchingVenues.length,queues:queues.length,marker:feed.get('version'),liveWrites:0}));
}finally{await admin.app().delete();}
