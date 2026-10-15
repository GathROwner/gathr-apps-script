// Exact two-document repair. Default dry run only; coordinator owns approval/apply.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const admin=require('firebase-admin');
const {validateEventAreaData,verifyAreaPublicationReferences}=require('../functions/lib/services/areaEventPublication.js');
const {resolveAreaDateRangeTiming}=require('../functions/lib/services/areaDateRangeTiming.js');
const args=process.argv.slice(2),apply=args.includes('--apply');
assert(args.every(x=>x==='--apply'||x.startsWith('--spec=')||x.startsWith('--plan=')),'Unexpected option');
const option=name=>args.find(x=>x.startsWith(`--${name}=`))?.slice(name.length+3);
assert(option('spec'),'Supply --spec= reviewed local specification');
assert(!apply||option('plan'),'Apply requires the saved reviewed --plan=');
const spec=JSON.parse(await fs.readFile(path.resolve(option('spec')),'utf8'));
const eventPath='events/area_7ebb4bc0846d26c4470e6842';
const reviewPath='city_level_event_reviews/cityevt_b6a99eb338c41a0c50bf39ce';
assert.equal(spec.project,'gathr-migrated');assert.equal(spec.eventPath,eventPath);assert.equal(spec.reviewPath,reviewPath);
assert([1,2].includes(spec.version),'Unsupported specification version');
assert.deepEqual(Object.keys(spec.eventPatch).sort(),spec.version===2?['areaData','description','endTime','startTime','timing']:['areaData','description','endTime','startTime']);
if(spec.version===2){
 const derived=resolveAreaDateRangeTiming({locationScope:'area',startDate:'2026-10-14',endDate:'2026-10-18',startTime:'',endTime:'',reviewedDateOnly:true});
 assert.equal(derived.action,'set');assert.deepEqual(spec.eventPatch.timing,derived.timing,'Only the generated date-range compatibility timing is allowed');
}
assert.equal(spec.eventPatch.startTime,'');assert.equal(spec.eventPatch.endTime,'');
assert(spec.eventPatch.description && !/Observed broad location:|Review reasons:/i.test(spec.eventPatch.description));
spec.eventPatch.areaData=validateEventAreaData(spec.eventPatch.areaData);
const key=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));assert.equal(key.project_id,spec.project);
admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});const db=admin.firestore();
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const pack=d=>({path:d.ref.path,updateTime:d.updateTime?.toDate().toISOString(),data:d.data()});
const active=s=>s.docs.some(d=>!['completed','failed','cancelled'].includes(d.get('status')));
const relatedQuery=db.collectionGroup('events').where('startDate','>=','2026-10-14').where('startDate','<=','2026-10-18');
const locksQuery=db.collection('processing_locks');
const venuePaths=spec.eventPatch.areaData.locations.map(x=>'venues/'+x.venueId);
const linkedPaths=spec.areaEventLinks.map(x=>x.eventPath);
const paths=[...new Set([eventPath,reviewPath,...venuePaths,...linkedPaths])].sort();
assert(venuePaths.every(x=>/^venues\/[A-Za-z0-9_-]+$/.test(x)));
const guard=async(docs,related,locks)=>{
 assert(!active(locks),'Active parser prevents repair');
 const byPath=new Map(docs.map(d=>[d.ref.path,d.data()]));const e=byPath.get(eventPath),r=byPath.get(reviewPath);
 assert(e&&r,'Missing umbrella or review');
 assert.equal(e.eventName,'Anchor Fest 2026');assert.equal(e.uniqueId,'1555098099991055_area');
 assert.equal(e.cityLevelReviewId,reviewPath.split('/').at(-1));assert.equal(e.venueId,null);
 assert.equal(e.startDate,'2026-10-14');assert.equal(e.endDate,'2026-10-18');assert.equal(e.locationScope,'area');assert.equal(e.mapMode,'area');
 assert.equal(e.startTime,'19:00');assert.equal(e.endTime,'23:00');assert.equal(e.areaData,undefined);
 if(spec.version===2)assert(e.timing==null,'Existing timing needs separate review; do not overwrite it');
 assert.equal(r.uniqueId,'1555098099991055');assert.equal(r.status,'published');assert.equal(r.publishedEventPath,eventPath);
 if(spec.version===2){assert.equal(r.eventDate,e.startDate);assert.equal(r.endDate,e.endDate);assert(r.timing==null,'Existing reviewed timing needs separate review');}
 await verifyAreaPublicationReferences({areaData:spec.eventPatch.areaData,evidence:spec.areaEventLinks,eventName:e.eventName,startDate:e.startDate,endDate:e.endDate,read:async p=>byPath.get(p)});
 const linked=new Set(linkedPaths),venues=new Set(venuePaths.map(x=>x.split('/')[1]));
 const scope=related.docs.filter(d=>linked.has(d.ref.path)||venues.has(d.get('venueId'))||/anchor fest/i.test(d.get('eventName')||''));
 const activity=x=>String(x.eventName||x.name||'').split(/\s+[—–]\s+/)[0].toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 for(const p of linkedPaths){const child=byPath.get(p);const duplicates=scope.filter(d=>d.ref.path!==p && d.get('venueId')===child.venueId && d.get('startDate')===child.startDate && d.get('startTime')===child.startTime && activity(d.data())===activity(child));assert.equal(duplicates.length,0,`Canonical child has same-occurrence siblings: ${p}`);}
 return scope.map(pack).sort((a,b)=>a.path.localeCompare(b.path));
};
try {
 const [docs,related,locks]=await Promise.all([db.getAll(...paths.map(p=>db.doc(p))),relatedQuery.get(),locksQuery.get()]);
 const scoped=await guard(docs,related,locks);
 const manual={eventTime:'',endTime:'',description:spec.eventPatch.description,locationScope:'area',areaData:spec.eventPatch.areaData,areaEventLinks:spec.areaEventLinks};
 if(spec.version===2){manual.eventDate='2026-10-14';manual.endDate='2026-10-18';}
 const reviewPatch={areaData:spec.eventPatch.areaData,areaEventLinks:spec.areaEventLinks,description:spec.eventPatch.description,eventTime:'',endTime:'',finalization:{action:'approve_publish',manual,publishedEventPath:eventPath}};
 const beforeFields=(target,patch)=>Object.fromEntries(Object.keys(patch).map(k=>[k,docs.find(d=>d.ref.path===target).data()[k]??null]));
 const actions=[{path:eventPath,before:beforeFields(eventPath,spec.eventPatch),patch:spec.eventPatch},{path:reviewPath,before:beforeFields(reviewPath,reviewPatch),patch:reviewPatch}];
 const guards=docs.map(pack).map(d=>({path:d.path,updateTime:d.updateTime,contentHash:hash(d.data)}));
 const plan={version:1,project:spec.project,specHash:hash(spec),actions,guards,relatedHash:hash(scoped)};
 if(option('plan')){const reviewed=JSON.parse(await fs.readFile(path.resolve(option('plan')),'utf8'));assert.deepEqual(plan,reviewed,'Reviewed plan or live evidence drifted');}
 const out=path.resolve(import.meta.dirname,'../functions/tmp/anchor-backend-oct14',spec.version===2?'date-range-v2':'.'),stamp=new Date().toISOString().replace(/[:.]/g,'-');await fs.mkdir(out,{recursive:true});
 const backupPath=path.join(out,`prewrite-backup-${stamp}.json`),planPath=path.join(out,`plan-${stamp}.json`);
 await fs.writeFile(backupPath,JSON.stringify({capturedAt:new Date().toISOString(),project:spec.project,documents:docs.map(pack),related:scoped,spec},null,2));
 await fs.writeFile(planPath,JSON.stringify(plan,null,2));
 if(!apply){console.log(JSON.stringify({mode:'dry-run',writes:0,planPath,backupPath,actions:actions.map(x=>({path:x.path,fields:Object.keys(x.patch)})),points:spec.eventPatch.areaData.locations.length,linkedChildren:linkedPaths.length,relatedCount:scoped.length}));}
 else {
  await db.runTransaction(async tx=>{
   const fresh=await tx.getAll(...paths.map(p=>db.doc(p)));const [freshRelated,freshLocks]=await Promise.all([tx.get(relatedQuery),tx.get(locksQuery)]);
   const freshScope=await guard(fresh,freshRelated,freshLocks);
   assert.deepEqual(fresh.map(pack).map(d=>({path:d.path,updateTime:d.updateTime,contentHash:hash(d.data)})),guards,'Reference/target drift');assert.equal(hash(freshScope),plan.relatedHash);
   for(const action of actions)tx.update(db.doc(action.path),{...action.patch,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
  });
  const after=await db.getAll(...paths.map(p=>db.doc(p)));
  for(const d of after){const old=docs.find(x=>x.ref.path===d.ref.path);const action=actions.find(x=>x.path===d.ref.path);if(!action){assert.equal(hash(pack(d)),hash(pack(old)),'Reference changed');continue;}const expected={...old.data(),...action.patch};const actual={...d.data()};delete expected.updatedAt;delete actual.updatedAt;assert.deepEqual(actual,expected,'Unapproved field delta');}
  const resultPath=path.join(out,`applied-${stamp}.json`);await fs.writeFile(resultPath,JSON.stringify({verifiedAt:new Date().toISOString(),backupPath,planPath,actions:actions.map(x=>x.path),unchangedReferences:paths.length-2,eventsCreated:0,eventsDeleted:0,venuesChanged:0,mediaDeleted:0},null,2));
  console.log(JSON.stringify({mode:'applied',updated:2,backupPath,planPath,resultPath}));
 }
} finally {await admin.app().delete();}
