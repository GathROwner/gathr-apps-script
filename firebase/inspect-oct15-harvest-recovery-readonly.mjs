// Bounded read-only inspection of a named series and its existing records.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const admin=require('firebase-admin');
const key=JSON.parse(await fs.readFile(process.env.GATHR_SERVICE_ACCOUNT_PATH,'utf8'));
assert.equal(key.project_id,'gathr-migrated');assert.equal(process.argv.length,2);
admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});
const db=admin.firestore(),plain=x=>JSON.parse(JSON.stringify(x));
const wrap=d=>({path:d.ref.path,version:{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds},data:plain(d.data())});
const out=path.resolve(import.meta.dirname,'../functions/artifacts/oct15-sequential-repairs/next-batch');
try{
 const [venue,all]=await Promise.all([db.doc('venues/fb_100063617721610').get(),db.collectionGroup('events').get()]);
 assert(venue.exists);const events=all.docs.filter(d=>d.ref.path.startsWith(venue.ref.path+'/events/'));
 const ids=[...new Set(events.map(d=>String(d.get('uniqueId')||'').split('_')[0]))];
 const sources=(await db.collection('parse_snapshots').where('uniqueId','in',ids).get()).docs;
 const trail=all.docs.filter(d=>/McFadyen|Daniel James/i.test(String(d.get('eventName')||''))||
   (d.get('venueId')==='slug_trailsidemusichall' && d.get('startDate')==='2026-11-19'));
 await fs.mkdir(out,{recursive:true});
 await fs.writeFile(path.join(out,'harvest-source-and-siblings.json'),JSON.stringify({capturedAt:new Date().toISOString(),venue:wrap(venue),events:events.map(wrap),sources:sources.map(wrap),trail:trail.map(wrap),liveWrites:0},null,2));
 const poster='https://storage.googleapis.com/gathr-uploaded-images/postimages/1792069908955-ld90tm.webp';
 const p=await fetch(poster,{signal:AbortSignal.timeout(20000)});assert.equal(p.status,200);
 await fs.writeFile(path.join(out,'harvest-original.webp'),Buffer.from(await p.arrayBuffer()));
 const r=await fetch('https://trailside.ca/api/events/locarius',{signal:AbortSignal.timeout(20000)});
 const body=await r.text();await fs.writeFile(path.join(out,'trailside-current-api-response.txt'),body);
 console.log(JSON.stringify({events:events.map(d=>({path:d.ref.path,title:d.get('eventName'),date:d.get('startDate'),pattern:d.get('recurringPattern')})),sourceSnapshots:sources.length,sourceIds:ids,trail:trail.map(d=>({path:d.ref.path,title:d.get('eventName'),date:d.get('startDate')})),ticketEndpointStatus:r.status,liveWrites:0}));
}finally{await admin.app().delete();}
