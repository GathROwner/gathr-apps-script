// Read-only exact plan; no apply path. Existing records retain identity and media.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {dateOnlyActivity} from '../functions/lib/parsing/dateOnlyActivity.js';
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
assert.equal(process.argv.length,2);const out=path.resolve(import.meta.dirname,'artifacts/oct15-hardening');
const key=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));assert.equal(key.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});const db=admin.firestore();
const targets=[{path:'venues/slug_confedcentre/events/bqk2pKnr1HHZQvhaz6Qo',source:'1512432880922082',date:'2026-10-26',clock:'08:00',title:/AUDITIONS/},
 {path:'venues/fb_100063617721610/events/L5dAjm7VnQOOCMMze25W',source:'1727757279354846',date:'2026-10-15',clock:'12:30',title:/Foraged Seven/}];
try{
 const [docs,sources,locks]=await Promise.all([db.getAll(...targets.map(t=>db.doc(t.path))),
   db.collection('parse_snapshots').where('fileId','==','1YPf2cKvXfXl8L0HVL63VZ2zeTLEvWlit').get(),db.collection('processing_locks').get()]);
 assert(!locks.docs.some(d=>!['completed','failed','cancelled','canceled','released'].includes(String(d.get('status')||''))));
 const changes=[],siblings=[];
 for(let i=0;i<targets.length;i++){
   const target=targets[i],data=docs[i].data();assert(docs[i].exists);assert(target.title.test(data.eventName));assert.equal(data.startDate,target.date);assert.equal(data.startTime,target.clock);assert(String(data.uniqueId).startsWith(target.source+'_'));
   const source=sources.docs.filter(d=>d.get('uniqueId')===target.source);assert.equal(source.length,1);
   const sameDay=await docs[i].ref.parent.where('startDate','==',target.date).limit(65).get();
   const sameSource=await docs[i].ref.parent.where('uniqueId','>=',target.source+'_').where('uniqueId','<',target.source+'_\uf8ff').limit(65).get();
   assert(sameDay.size<65&&sameSource.size<65,'Sibling lookup must be complete');
   siblings.push(...sameDay.docs,...sameSource.docs);
   const candidate=dateOnlyActivity({...data,name:data.eventName,startTime:'',endTime:'',endDate:target.date,recurringPattern:'none',
     _sourceTimeConstraint:{reason:'dated_activity_without_clock',evidence:'Source advertises this date but no exact activity clock'}});assert(candidate);
   const patch=Object.fromEntries(['startTime','endTime','endDate','timeFlags','timeResolution','timing'].map(k=>[k,candidate[k]]));
   if(i===0){
     assert.equal(data.mediaUrls.length,1);const original=data.mediaUrls[0];
     assert(data.imageProvenance.media.some(m=>m.url===original&&m.source==='post_media'&&!m.isFallback));
     assert.equal((await fetch(original,{signal:AbortSignal.timeout(20000)})).status,200);
     Object.assign(patch,{image:original,imageUrl:original,relevantImageUrl:original,imageProvenance:{...data.imageProvenance,
       primaryUrl:original,primarySource:'post_media',primaryField:'relevantImageUrl',isFallback:false,
       selectionReason:'source_verified_original_audition_poster',updatedBy:'manual_repair',
       media:[...['relevantImageUrl','image','imageUrl'].map(field=>({url:original,source:'post_media',field,isPrimary:field==='relevantImageUrl',isFallback:false})),
         ...data.imageProvenance.media.filter(m=>['icon','mediaUrls'].includes(m.field)).map(m=>({...m,isPrimary:false}))]}});
   }
   changes.push({path:target.path,title:data.eventName,source:target.source,sourcePath:source[0].ref.path,
     version:{seconds:docs[i].updateTime.seconds,nanoseconds:docs[i].updateTime.nanoseconds},patch});
 }
 const now=new Date().toISOString().replace(/[:.]/g,'-');await fs.mkdir(out,{recursive:true});
 const backup=path.join(out,`time-backup-${now}.json`),plan=path.join(out,`time-plan-${now}.json`);
 await fs.writeFile(backup,JSON.stringify({documents:docs.map(d=>({path:d.ref.path,data:d.data(),version:{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}})),
   sources:targets.map(t=>{const d=sources.docs.find(d=>d.get('uniqueId')===t.source);return {path:d.ref.path,data:d.data(),version:{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}};}),
   siblings:[...new Map(siblings.map(d=>[d.ref.path,{path:d.ref.path,data:d.data(),version:{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}}])).values()]},null,2));
 await fs.writeFile(plan,JSON.stringify({version:1,backup,changes,requiredGate:'Exact approval and accepted date-only frontend compatibility',liveWrites:0},null,2));
 console.log(JSON.stringify({plan,backup,targets:changes.map(x=>({path:x.path,title:x.title,startTime:'',endTime:'',originalPosterRestored:!!x.patch.image})),liveWrites:0}));
}finally{await admin.app().delete();}
