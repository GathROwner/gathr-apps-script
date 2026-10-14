// Exact two-record repair. Default is a guarded dry run; no replacement venue,
// event or media mutation is authorized here.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url));const admin=require('firebase-admin');
const args=process.argv.slice(2),apply=args.includes('--apply'),planArg=args.find(x=>x.startsWith('--plan='));
assert(planArg && args.every(x=>x==='--apply'||x.startsWith('--plan=')),'Supply exact reviewed --plan= path');
const plan=JSON.parse(await fs.readFile(path.resolve(planArg.slice(7)),'utf8'));
const targets=['venues/slug_peifoodies/events/L6dOyFMhpOWTcZSdwPfh','venues/slug_peifoodies/events/krhMcNCxV2s5sM7m26si'];
assert.equal(plan.project,'gathr-migrated');assert.deepEqual(plan.actions.map(x=>x.path).sort(),[...targets].sort());assert(plan.actions.every(x=>x.action==='delete'));
const key=JSON.parse(await fs.readFile(process.env.DAISY_CREDENTIAL_PATH,'utf8'));assert.equal(key.project_id,plan.project);
admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});const db=admin.firestore();
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const pack=d=>({path:d.ref.path,updateTime:d.updateTime.toDate().toISOString(),data:d.data()});
const active=locks=>locks.docs.some(x=>!['completed','failed','cancelled'].includes(x.get('status')));
const sourceQuery=db.collectionGroup('events').where('uniqueId','>=','1738543821054078_').where('uniqueId','<','1738543821054078_\uf8ff');
const childrenQuery=db.collection('venues/slug_peifoodies/events');
const locksQuery=db.collection('processing_locks'),venueRef=db.doc('venues/slug_peifoodies');
const guard=(sources,venue)=>{
 const docs=sources.docs.map(pack);assert.deepEqual(docs.map(x=>x.path).sort(),[...targets].sort(),'Source sibling drift');
 for(const a of plan.actions){const d=docs.find(x=>x.path===a.path);assert(d);assert.equal(d.updateTime,a.expectedUpdateTime);assert.equal(hash(d.data),a.contentHash);
   assert.equal(d.data.eventName,'Burger Basket Day (Burger Basket)');assert.equal(d.data.startTime,'11:00');assert.equal(d.data.endTime,'21:00');assert.equal(d.data.venueId,'slug_peifoodies');
   assert.equal(d.data.recurringPattern,a.path.endsWith('L6dOyFMhpOWTcZSdwPfh')?'weekly_wednesday':'weekly_monday');}
 assert.equal(venue.updateTime.toDate().toISOString(),plan.publisherVersionGuard.updateTime);assert.equal(hash(venue.data()),plan.publisherVersionGuard.contentHash);
 return docs;
};
try{
 const [locks,sources,venue,children]=await Promise.all([locksQuery.get(),sourceQuery.get(),venueRef.get(),childrenQuery.get()]);
 assert(!active(locks),'Active parser prevents cleanup');const docs=guard(sources,venue);
 const siblings=children.docs.map(pack).sort((a,b)=>a.path.localeCompare(b.path));const siblingHash=hash(siblings);
 const stamp=new Date().toISOString().replace(/[:.]/g,'-'),out=path.resolve(import.meta.dirname,'artifacts/daisy-oct14');await fs.mkdir(out,{recursive:true});
 const backupPath=path.join(out,`prewrite-backup-${stamp}.json`);await fs.writeFile(backupPath,JSON.stringify({capturedAt:new Date().toISOString(),project:plan.project,plan,venue:pack(venue),sourceDocs:docs,siblings},null,2));
 if(!apply){console.log(JSON.stringify({mode:'dry-run',writes:0,targets,backupPath,siblingCount:siblings.length}));}
 else{
   await db.runTransaction(async tx=>{
     const [freshLocks,freshSources,freshVenue,freshChildren]=await Promise.all([tx.get(locksQuery),tx.get(sourceQuery),tx.get(venueRef),tx.get(childrenQuery)]);
     assert(!active(freshLocks));guard(freshSources,freshVenue);assert.equal(hash(freshChildren.docs.map(pack).sort((a,b)=>a.path.localeCompare(b.path))),siblingHash,'Publisher siblings drifted');
     for(const target of targets)tx.delete(db.doc(target));
   });
   const [after,afterVenue]=await Promise.all([childrenQuery.get(),venueRef.get()]);assert.equal(hash(afterVenue.data()),hash(venue.data()));
   assert.equal(after.size,children.size-2);for(const d of after.docs){const old=siblings.find(x=>x.path===d.ref.path);assert(old);assert.equal(hash(pack(d)),hash(old),'Untargeted sibling changed');}
   for(const target of targets)assert(!(await db.doc(target).get()).exists);
   const resultPath=path.join(out,`applied-${stamp}.json`);await fs.writeFile(resultPath,JSON.stringify({verifiedAt:new Date().toISOString(),targets,backupPath,remainingPublisherEvents:after.size,untargetedSiblingsAndVenueUnchanged:true,mediaDeleted:0},null,2));
   console.log(JSON.stringify({mode:'applied',deleted:2,backupPath,resultPath,untargetedSiblingsAndVenueUnchanged:true}));
 }
}finally{await admin.app().delete();}
