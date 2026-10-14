// Only the reviewed Be You keeper/source-link and two confirmed copies.
// Defaults to dry run; apply requires the exact fresh saved plan.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const admin=require('firebase-admin');
const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'functions/artifacts/recurring-series-hardening-oct14');
const reviewedBytes=await fs.readFile(path.join(out,'reviewed-cleanup-plan.json'));
assert.equal(crypto.createHash('sha256').update(reviewedBytes).digest('hex'),'cec88c13acae9c7d64d702bfc032cc96a4e0a366ccabeae757a588a8466265e5','Reviewed cleanup plan changed');
const reviewed=JSON.parse(reviewedBytes);
const base='venues/name_n2ivcu/events/';
const fingerprints=[
 ['NJ5X8fPIVOy405M9sfFS','Karaoke Night','2026-09-30','122202851828910683_c6a2578c31e84265','update'],
 ['Uo0EN3ofQfIFbxcYRYwy','Karaoke Night ✨','2026-05-27','1563147748686067_1','delete'],
 ['mB37Tk3gVTT0zvlkXiPg','Karaoke','2026-10-14','1562661692568029_72f05ef2d5d4041b','delete'],
];
assert.equal(reviewed.actions.length,3);
const actions=reviewed.actions;
for(let i=0;i<actions.length;i++){assert.equal(actions[i].path,base+fingerprints[i][0]);assert.equal(actions[i].action,fingerprints[i][4]);}
assert.deepEqual(Object.keys(actions[0].patch).sort(),['sourceUniqueIds','sourceUrls']);
assert(actions[0].patch.sourceUniqueIds.every(x=>/^\d+$/.test(x)));
assert(actions[0].patch.sourceUrls.every(x=>/^https:\/\/www\.facebook\.com\//.test(x)));
const args=process.argv.slice(2),apply=args.includes('--apply'),planArg=args.find(x=>x.startsWith('--plan='));
assert(args.every(x=>x==='--apply'||x.startsWith('--plan=')));assert.equal(Boolean(planArg),apply);
const key=JSON.parse(await fs.readFile(process.env.GATHR_SERVICE_ACCOUNT_PATH,'utf8'));assert.equal(key.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});const db=admin.firestore();
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const pack=s=>({path:s.ref.path,data:s.data(),updateTime:s.updateTime.toDate().toISOString()});
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const active=locks=>locks.docs.some(d=>!['completed','failed','cancelled'].includes(d.get('status')));
try{
 const [locks,venue,children,roots]=await Promise.all([db.collection('processing_locks').get(),db.doc('venues/name_n2ivcu').get(),
   db.collection(base.slice(0,-1)).get(),db.collection('events').where('venueId','==','name_n2ivcu').get()]);
 assert(!active(locks),'Active parser prevents cleanup');assert(venue.exists);assert(/119 Grafton/i.test(venue.get('address')));
 const siblings=[...children.docs,...roots.docs].map(pack).sort((a,b)=>a.path.localeCompare(b.path));
 for(const [id,title,date,uniqueId]of fingerprints){const s=siblings.find(x=>x.path===base+id);assert(s,'Missing reviewed record '+id);
   assert.equal(s.data.eventName,title);assert.equal(s.data.startDate,date);assert.equal(s.data.startTime,'20:00');assert.equal(s.data.uniqueId,uniqueId);}
 assert.equal(siblings.find(x=>x.path===base+'NJ5X8fPIVOy405M9sfFS').data.recurringPattern,'weekly_wednesday');
 assert.equal(siblings.find(x=>x.path===base+'NJ5X8fPIVOy405M9sfFS').data.endTime,'00:00');
 for(const [id,pattern]of [['PBW360WVRvt9ijTQs9fS','weekly_wednesday'],['skLvOjG88fMQAxcjUAU0','weekly_friday']])
   assert.equal(siblings.find(x=>x.path===base+id)?.data.recurringPattern,pattern,'Protected sing-along changed');
 const backupPath=path.join(out,`beyou-backup-${stamp}.json`);
 await fs.writeFile(backupPath,JSON.stringify({project:key.project_id,capturedAt:new Date().toISOString(),venue:pack(venue),siblings,actions},null,2));
 const plan={project:key.project_id,actions,siblingHash:hash(siblings),venueHash:hash(pack(venue))};
 if(!apply){const planPath=path.join(out,`beyou-plan-${stamp}.json`);await fs.writeFile(planPath,JSON.stringify({...plan,backupPath},null,2));
   console.log(JSON.stringify({mode:'dry-run',deletes:2,keeperUpdates:1,planPath,backupPath,liveWrites:0}));
 }else{
   const approved=JSON.parse(await fs.readFile(path.resolve(planArg.slice(7)),'utf8'));
   for(const f of ['project','actions','siblingHash','venueHash'])assert.deepEqual(plan[f],approved[f],'Approval drift: '+f);
   await db.runTransaction(async tx=>{
     const [freshLocks,freshVenue,freshChildren,freshRoots]=await Promise.all([tx.get(db.collection('processing_locks')),tx.get(venue.ref),
       tx.get(db.collection(base.slice(0,-1))),tx.get(db.collection('events').where('venueId','==','name_n2ivcu'))]);
     assert(!active(freshLocks));assert.equal(hash(pack(freshVenue)),plan.venueHash);
     const fresh=[...freshChildren.docs,...freshRoots.docs].map(pack).sort((a,b)=>a.path.localeCompare(b.path));
     assert.equal(hash(fresh),plan.siblingHash,'Sibling changed before cleanup');
     for(const a of actions)if(a.action==='delete')tx.delete(db.doc(a.path));else tx.update(db.doc(a.path),{...a.patch,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
   });
   const [afterChildren,afterRoots]=await Promise.all([db.collection(base.slice(0,-1)).get(),db.collection('events').where('venueId','==','name_n2ivcu').get()]);
   const after=[...afterChildren.docs,...afterRoots.docs].map(pack).sort((a,b)=>a.path.localeCompare(b.path));
   assert.equal(after.length,siblings.length-2);
   for(const a of actions){const s=after.find(x=>x.path===a.path);if(a.action==='delete')assert(!s);else{assert(s);for(const [k,v]of Object.entries(a.patch))assert.deepEqual(s.data[k],v);}}
   for(const before of siblings){const action=actions.find(x=>x.path===before.path);if(action?.action==='delete')continue;
     const current=after.find(x=>x.path===before.path);assert(current);
     const omitted=new Set(action?['sourceUniqueIds','sourceUrls','updatedAt']:[]);
     for(const [k,v]of Object.entries(before.data))if(!omitted.has(k))assert.deepEqual(current.data[k],v,'Unapproved field changed '+before.path+':'+k);
   }
   const resultPath=path.join(out,`beyou-result-${stamp}.json`);await fs.writeFile(resultPath,JSON.stringify({verifiedAt:new Date().toISOString(),backupPath,actions,after,untargetedSiblingsUnchanged:true},null,2));
   console.log(JSON.stringify({mode:'applied',deletes:2,keeperUpdates:1,resultPath,backupPath,untargetedSiblingsUnchanged:true}));
 }
}finally{await admin.app().delete();}
