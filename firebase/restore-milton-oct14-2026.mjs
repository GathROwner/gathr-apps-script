import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const admin=require('firebase-admin');
const args=process.argv.slice(2),apply=args.includes('--apply'),planArg=args.find(x=>x.startsWith('--plan='));
assert(args.every(x=>x==='--apply'||x.startsWith('--plan=')));
assert.equal(Boolean(planArg),apply);
const key=JSON.parse(await fs.readFile(process.env.GATHR_SERVICE_ACCOUNT_PATH,'utf8'));
assert.equal(key.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});
const db=admin.firestore();
const target='venues/nvQTJXSbDsSfJTCxDKCH/events/pgViRsWspKTtSODqvrN6';
const originalBackup='functions/artifacts/luna-oct12-repair/live-backup-2026-10-12T16-28-44-613Z.json';
const original=JSON.parse(await fs.readFile(originalBackup,'utf8')).records.find(x=>x.path===target);
assert(original);
assert.equal(original.data.uniqueId,'1927464192040916_84b9c5552c4f5cac');
assert.equal(original.data.name,'Knit and Crochet Socials');
assert.equal(original.data.startDate,'2026-10-14');
assert.equal(original.data.startTime,'01:30');
assert.equal(original.data.endTime,'03:30');
assert.equal(original.data.isRecurring,'No');
assert.equal(original.data.recurringPattern,'none');
const evidence='October 11 dated flyer: October 14 1:30–3:30 between 9 a.m. fitness and 5:30 p.m. Zumba. PM inferred from chronology and corroborated by the hall calendar. Older August-updated calendar/October 1 notice say 1–3 p.m.; newer flyer preferred for this occurrence.';
const patch={startTime:'13:30',endTime:'15:30',description:'',
  timeFlags:{start:{source:'implied',evidence},end:{source:'implied',toClose:false,evidence}},
  timeResolution:{hoursUsed:false}};
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const dir='functions/artifacts/luna-oct12-milton';
function timestamps(x) {
  if(Array.isArray(x))return x.map(timestamps);
  if(x&&typeof x==='object'){
    if(Object.keys(x).length===2&&Number.isInteger(x._seconds)&&Number.isInteger(x._nanoseconds))return new admin.firestore.Timestamp(x._seconds,x._nanoseconds);
    return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,timestamps(v)]));
  }
  return x;
}
async function inspect() {
  const [locks,current,venue,source]=await Promise.all([
    db.collection('processing_locks').get(),db.doc(target).get(),
    db.collection(target.split('/events/')[0]+'/events').get(),
    db.collectionGroup('events').where('uniqueId','>=','1927464192040916_').where('uniqueId','<','1927464192040916_\uf8ff').get()]);
  assert(!locks.docs.some(x=>!['completed','failed','cancelled'].includes(x.data().status)),'Active parser');
  assert(!current.exists,'Target already exists; do not overwrite');
  const conflicts=venue.docs.filter(x=>/knit|crochet/i.test(String(x.data().name||x.data().eventName||''))&&
    (x.data().startDate==='2026-10-14'||(x.data().startDate<='2026-10-14'&&
      (x.data().isRecurring===true||x.data().isRecurring==='Yes')&&
      (!x.data().recurrenceUntilDate||x.data().recurrenceUntilDate>='2026-10-14'))));
  assert.equal(conflicts.length,0,'Potential existing knitting occurrence/family; inspect instead of duplicating');
  const capture=q=>q.docs.map(x=>({path:x.ref.path,data:x.data(),seconds:x.updateTime.seconds,nanos:x.updateTime.nanoseconds})).sort((a,b)=>a.path.localeCompare(b.path));
  return {targetExists:false,venue:capture(venue),source:capture(source)};
}
try {
  const state=await inspect();
  const plan={project:key.project_id,target,originalBackup,originalHash:hash(original.data),patch,stateHash:hash(state)};
  await fs.mkdir(dir,{recursive:true});
  const backupPath=path.join(dir,`restore-backup-${stamp}.json`);
  await fs.writeFile(backupPath,JSON.stringify({plan,original:original.data,state},null,2));
  if(!apply){
    const planPath=path.join(dir,`restore-plan-${stamp}.json`);
    await fs.writeFile(planPath,JSON.stringify(plan,null,2));
    console.log(JSON.stringify({mode:'dry-run',planPath,backupPath,creates:1,target,patch},null,2));
  }else{
    const approved=JSON.parse(await fs.readFile(planArg.slice(7),'utf8'));
    assert.deepEqual(approved,plan,'Drift since exact restoration dry run');
    const restored={...timestamps(original.data),...patch,updatedAt:admin.firestore.Timestamp.now()};
    await db.doc(target).create(restored);
    const after=await db.doc(target).get();assert(after.exists);
    for(const[k,v]of Object.entries(patch))assert.deepEqual(after.data()[k],v,k);
    assert.equal(after.data().uniqueId,original.data.uniqueId);
    assert.equal(after.data().startDate,'2026-10-14');
    assert.equal(after.data().endDate,'2026-10-14');
    assert.deepEqual(after.data().mediaUrls,original.data.mediaUrls);
    const resultPath=path.join(dir,`restore-result-${stamp}.json`);
    await fs.writeFile(resultPath,JSON.stringify({target,backupPath,planPath:planArg.slice(7),verified:true,after:after.data()},null,2));
    console.log(JSON.stringify({mode:'applied',target,backupPath,resultPath,verified:true}));
  }
} finally {await admin.app().delete();}
