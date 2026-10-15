// Source-specific recovery. Default dry run; apply only an explicitly approved
// saved plan. Never invokes the parser, geocoder, storage cleanup or model API.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'functions/artifacts/venue-resolution-oct14/apm-recovery');
const venuePath = 'venues/ItWg0uH2yXtETbhlepAJ';
const sourceIds = ['1744647737666047', '1744647037666117'];
const sourcePaths=['parse_snapshots/11-wPIfOUWmVwQqpUGUQ3LF36BFDPWuOC_266_1791985655889','parse_snapshots/11-wPIfOUWmVwQqpUGUQ3LF36BFDPWuOC_267_1791985685350'];
const args = process.argv.slice(2), apply = args.includes('--apply');
const planArg = args.find(x=>x.startsWith('--plan='));
assert(args.every(x=>x==='--apply'||x.startsWith('--plan=')));
assert.equal(Boolean(planArg), apply, 'Apply requires the exact approved --plan');
const hash = x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const plain = x=>JSON.parse(JSON.stringify(x));
const previews = JSON.parse(await fs.readFile(path.join(root,'functions/artifacts/venue-resolution-oct14/apm-preview-payloads.json'),'utf8'));
assert.equal(previews.length,17);
const targets = previews.map(({row,event})=>{
  const source = String(event.uniqueId).split('_')[0];
  assert(sourceIds.includes(source));
  assert.equal(event.venueId,venuePath.split('/')[1]);
  assert(/^2026-10-(?:15|16|17|18|20|22|23)$/.test(event.startDate));
  assert.equal(event.recurringPattern,'none');
  const payload = JSON.parse(JSON.stringify(event));
  if(row===267){
    assert.equal(source,sourceIds[1]); assert.equal(payload.startDate,'2026-10-15'); assert.equal(payload.startTime,'18:00');
    payload.endTime='';
    payload.timeFlags={...payload.timeFlags,end:{source:'none',toClose:false,evidence:'Source gives a start only; category-default end removed during recovery.'}};
    payload.timeResolution={hoursUsed:false,reason:'source_start_only'};
  } else {
    assert.equal(row,266);
    payload.timeFlags={start:{source:'explicit',evidence:`Source evaluation poster: ${payload.startTime}–${payload.endTime}`},end:{source:'explicit',toClose:false,evidence:`Source evaluation poster: ${payload.startTime}–${payload.endTime}`}};
  }
  payload.sourceUniqueIds=[source];
  payload.sourceUrls=[`https://www.facebook.com/${source}`];
  payload.recoveryRun='oct14-apm-source-verified-recovery';
  return {path:`${venuePath}/events/oct14_apm_${event.uniqueId}`,action:'create',payload};
});
assert.equal(new Set(targets.map(x=>x.path)).size,17);
const keyPath=process.env.GATHR_SERVICE_ACCOUNT_PATH;
assert(keyPath,'Set GATHR_SERVICE_ACCOUNT_PATH');
const key=JSON.parse(await fs.readFile(keyPath,'utf8'));assert.equal(key.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});
const db=admin.firestore();
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const relatedToRecovery=doc=>doc.ref.path.startsWith(venuePath+'/events/')||sourceIds.some(id=>String(doc.get('uniqueId')||'').startsWith(id+'_')||(doc.get('sourceUniqueIds')||[]).includes(id));
const captureRelated=docs=>docs.filter(relatedToRecovery).map(doc=>({path:doc.ref.path,data:doc.data(),updateTime:{seconds:doc.updateTime.seconds,nanoseconds:doc.updateTime.nanoseconds}})).sort((a,b)=>a.path.localeCompare(b.path));
const captureSource=doc=>{assert(doc.exists,'Missing original source');return {path:doc.ref.path,data:doc.data(),updateTime:{seconds:doc.updateTime.seconds,nanoseconds:doc.updateTime.nanoseconds}};};
try{
  const [locks,venue,all]=await Promise.all([db.collection('processing_locks').get(),db.doc(venuePath).get(),db.collectionGroup('events').get()]);
  assert(!locks.docs.some(x=>!['completed','failed','cancelled'].includes(x.get('status'))),'Active parser prevents recovery');
  assert(venue.exists);assert.equal(venue.get('name'),'APM Centre');assert(/35 Mercedes/i.test(venue.get('address')));
  const related=captureRelated(all.docs);
  const sourceDocs=await db.getAll(...sourcePaths.map(p=>db.doc(p)));sourceDocs.forEach((doc,i)=>assert.equal(doc.get('uniqueId'),sourceIds[i]));
  const sources=sourceDocs.map(captureSource);
  for(const t of targets){
    assert(!all.docs.some(doc=>doc.ref.path===t.path),'Destination already exists '+t.path);
    assert(!all.docs.some(doc=>doc.get('uniqueId')===t.payload.uniqueId),'Source occurrence already exists '+t.path);
    assert(!related.some(x=>x.data.startDate===t.payload.startDate&&x.data.startTime===t.payload.startTime&&
      String(x.data.name||x.data.eventName||'').toLowerCase()===t.payload.name.toLowerCase()),'Equivalent APM occurrence exists '+t.path);
  }
  const plan={project:key.project_id,targets,venue:{path:venuePath,data:venue.data(),updateTime:venue.updateTime.toDate().toISOString()},relatedHash:hash(related),sourceHash:hash(sources)};
  await fs.mkdir(out,{recursive:true});
  const backupPath=path.join(out,`backup-${stamp}.json`);
  await fs.writeFile(backupPath,JSON.stringify({createdAt:new Date().toISOString(),venue:plan.venue,related,sources,targets},null,2));
  if(!apply){
    const planPath=path.join(out,`plan-${stamp}.json`);
    await fs.writeFile(planPath,JSON.stringify({...plan,backupPath},null,2));
    console.log(JSON.stringify({mode:'dry-run',creates:17,planPath,backupPath,meetingEnd:'unknown',liveWrites:0}));
  } else {
    const approved=JSON.parse(await fs.readFile(path.resolve(planArg.slice(7)),'utf8'));
    for(const field of ['project','targets','venue','relatedHash','sourceHash'])assert.deepEqual(plain(plan[field]),approved[field],`Approval drift: ${field}`);
    await db.runTransaction(async tx=>{
      const locked=await tx.get(db.collection('processing_locks'));
      assert(!locked.docs.some(x=>!['completed','failed','cancelled'].includes(x.get('status'))),'Parser started before recovery');
      const fresh=await tx.get(db.doc(venuePath));assert(fresh.updateTime.isEqual(venue.updateTime),'Venue drift');
      const currentEvents=await tx.get(db.collectionGroup('events'));assert.equal(hash(captureRelated(currentEvents.docs)),plan.relatedHash,'Source/venue sibling drift');
      const currentSources=await tx.getAll(...sourcePaths.map(p=>db.doc(p)));assert.equal(hash(currentSources.map(captureSource)),plan.sourceHash,'Original source drift');
      for(const t of targets)assert(!currentEvents.docs.some(doc=>doc.ref.path===t.path||doc.get('uniqueId')===t.payload.uniqueId),'Destination or exact source occurrence appeared');
      for(const t of targets)tx.create(db.doc(t.path),{...t.payload,createdAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()});
    });
    const after=await db.getAll(...targets.map(x=>db.doc(x.path)));
    after.forEach((doc,i)=>{assert(doc.exists);for(const [field,value]of Object.entries(targets[i].payload))assert.deepEqual(doc.get(field),value,`${doc.ref.path}:${field}`);});
    const resultPath=path.join(out,`result-${stamp}.json`);
    await fs.writeFile(resultPath,JSON.stringify({verifiedAt:new Date().toISOString(),backupPath,created:targets.map(x=>x.path)},null,2));
    console.log(JSON.stringify({mode:'applied',created:17,resultPath,backupPath}));
  }
}finally{await admin.app().delete();}
