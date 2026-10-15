// Read-only exact provenance plan; intentionally no apply operation.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
const args=process.argv.slice(2);assert.equal(args.length,0,'No mutation switches supported');
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
const targets=[
 ['venues/slug_trailsidemusichall/events/J1TauchdK3akdCxHuasT','event_update_audits/yCYRIswJFU7twWlt2ap9','2026-10-15','20:00'],
 ['venues/slug_theguildpei/events/mgXvpu5EB2N7eqnyeHa3','event_update_audits/VcaXZeA8TTBbVPZQMSrR','2026-10-15','21:00'],
 ['venues/slug_theguildpei/events/80rdBjhcuZ0U4udVx0a2','event_update_audits/TfQjxVcpxgoXGaOxBRuK','2026-10-15','09:00'],
 ['venues/slug_thetivolicinema/events/dz35gb3dc50NwIl9kuUo','event_update_audits/MegyqblVmVi8qMPi8Tfz','2026-10-16','20:00']
];
const sourceId='1564814712352727',fileId='1YPf2cKvXfXl8L0HVL63VZ2zeTLEvWlit';
const key=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));assert.equal(key.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});const db=admin.firestore();
const plain=v=>JSON.parse(JSON.stringify(v));
const wrap=d=>{assert(d.exists,'Missing pinned reference '+d.ref.path);return {path:d.ref.path,version:{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds},data:plain(d.data())};};
try{
 const locks=await db.collection('processing_locks').get();assert(!locks.docs.some(d=>!['completed','failed','cancelled','canceled','released'].includes(String(d.get('status')||''))),'Active parser');
 const snapshots=await db.collection('parse_snapshots').where('fileId','==',fileId).get();
 const sources=snapshots.docs.filter(d=>d.get('uniqueId')===sourceId);assert.equal(sources.length,1,'One exact source snapshot required');
 const documents=new Map([[sources[0].ref.path,wrap(sources[0])]]),changes=[];
 for(const [eventPath,auditPath,date,time] of targets){
  const [event,audit]=await db.getAll(db.doc(eventPath),db.doc(auditPath));const e=wrap(event),a=wrap(audit);
  assert.equal(a.data.fileId,fileId);assert.equal(a.data.eventPath,eventPath);assert.equal(a.data.row?.uniqueId,sourceId);
  assert.equal(a.data.after?.startDate,date);assert.equal(a.data.after?.startTime,time);
  assert.equal(e.data.startDate,date);assert.equal(e.data.startTime,time);assert.equal(e.data.venueId,eventPath.split('/')[1]);
  assert.equal(e.data.eventName,a.data.after.eventName);assert(Array.isArray(e.data.sourceUniqueIds)||e.data.sourceUniqueIds==null);
  assert(!(e.data.sourceUniqueIds||[]).includes(sourceId),'Already associated: review before regenerating plan');
  const siblings=await event.ref.parent.where('startDate','==',date).limit(65).get();assert(siblings.size<65,'Unbounded sibling set');
  for(const d of [event,audit,...siblings.docs])documents.set(d.ref.path,wrap(d));
  const venue=await event.ref.parent.parent.get();documents.set(venue.ref.path,wrap(venue));
  changes.push({path:eventPath,title:e.data.eventName,date,time,auditPath,sourceId,patch:{sourceUniqueIds:[...(e.data.sourceUniqueIds||[]),sourceId]}});
 }
 const capture={version:1,fileId,sourceId,changes,documents:[...documents.values()].sort((a,b)=>a.path.localeCompare(b.path))};
 const out=path.resolve(import.meta.dirname,'artifacts/oct15-hardening');await fs.mkdir(out,{recursive:true});const stamp=new Date().toISOString().replace(/[:.]/g,'-');
 const backup=path.join(out,`festival-provenance-backup-${stamp}.json`),plan=path.join(out,`festival-provenance-plan-${stamp}.json`);
 await fs.writeFile(backup,JSON.stringify(capture,null,2));await fs.writeFile(plan,JSON.stringify({mode:'read_only_plan',approvedForApply:false,backup,snapshotHash:createHash('sha256').update(JSON.stringify(capture)).digest('hex'),changes},null,2));
 console.log(JSON.stringify({plan,backup,targets:changes.map(c=>({path:c.path,title:c.title,date:c.date,time:c.time})),guardedReferences:documents.size,liveWrites:0,automaticLinkPublication:false}));
}finally{await admin.app().delete();}
