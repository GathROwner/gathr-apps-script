// Exactly six reviewed groups. Default dry run, pinned target file, explicit
// saved-plan apply, full backups/update-time guards. Never deletes media.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const admin=require('firebase-admin');
const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'functions/artifacts/dedup-oct14');
const raw=await fs.readFile(path.join(out,'cleanup-targets.json'));
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const hash=x=>sha(JSON.stringify(x));
assert.equal(sha(raw),'93195a2ec0403db7b21be0cd8a52876d58d4de6cf69f29a0e6a41d9299cb5749','Reviewed target file changed');
const {targets,groups}=JSON.parse(raw);
assert.equal(groups.length,6);assert.equal(targets.length,13);
assert.equal(targets.filter(x=>x.action==='delete').length,7);
assert.equal(targets.filter(x=>x.action==='update').length,6);
const args=process.argv.slice(2),apply=args.includes('--apply'),planArg=args.find(x=>x.startsWith('--plan='));
assert(args.every(x=>x==='--apply'||x.startsWith('--plan=')));assert.equal(Boolean(planArg),apply);
const key=JSON.parse(await fs.readFile(process.env.GATHR_SERVICE_ACCOUNT_PATH,'utf8'));assert.equal(key.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});
const db=admin.firestore(),stamp=new Date().toISOString().replace(/[:.]/g,'-');
try{
  const [locks,snaps,all]=await Promise.all([db.collection('processing_locks').get(),db.getAll(...targets.map(t=>db.doc(t.path))),db.collectionGroup('events').get()]);
  const active=locks.docs.some(x=>!['completed','failed','cancelled'].includes(x.get('status')));
  assert(!active,'Active parser prevents cleanup');
  const records=snaps.map((s,i)=>{
    assert(s.exists,'Missing reviewed target '+s.ref.path);
    for(const [k,v]of Object.entries(targets[i].expected))assert.deepEqual(s.get(k),v,s.ref.path+':'+k);
    return {...targets[i],data:s.data(),updateTime:s.updateTime.toDate().toISOString(),updateSeconds:s.updateTime.seconds,updateNanos:s.updateTime.nanoseconds};
  });
  const related=all.docs.filter(s=>records.some(r=>r.data.venueId===s.get('venueId')&&r.data.startDate===s.get('startDate')))
    .map(s=>({path:s.ref.path,data:s.data(),updateTime:s.updateTime.toDate().toISOString()})).sort((a,b)=>a.path.localeCompare(b.path));
  const plan={project:key.project_id,targets:records.map(({data,...r})=>({...r,dataHash:hash(data)})),relatedHash:hash(related)};
  const backupPath=path.join(out,`cleanup-backup-${stamp}.json`);
  await fs.writeFile(backupPath,JSON.stringify({createdAt:new Date().toISOString(),records,related,groups},null,2));
  if(!apply){
    const planPath=path.join(out,`cleanup-plan-${stamp}.json`);
    await fs.writeFile(planPath,JSON.stringify({...plan,backupPath},null,2));
    console.log(JSON.stringify({mode:'dry-run',deletes:7,keeperUpdates:6,planPath,backupPath,liveWrites:0}));
  }else{
    const approved=JSON.parse(await fs.readFile(path.resolve(planArg.slice(7)),'utf8'));
    for(const field of ['project','targets','relatedHash'])assert.deepEqual(plan[field],approved[field],'Approval drift: '+field);
    await db.runTransaction(async tx=>{
      const locks=await tx.get(db.collection('processing_locks'));
      assert(!locks.docs.some(x=>!['completed','failed','cancelled'].includes(x.get('status'))),'Parser started before cleanup');
      const fresh=await Promise.all(targets.map(t=>tx.get(db.doc(t.path))));
      fresh.forEach((s,i)=>assert(s.exists&&s.updateTime.isEqual(snaps[i].updateTime),'Target changed before cleanup '+targets[i].path));
      for(const t of targets){
        if(t.action==='delete')tx.delete(db.doc(t.path));
        else tx.update(db.doc(t.path),{...t.patch,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
      }
    });
    const after=await db.getAll(...targets.map(t=>db.doc(t.path)));
    after.forEach((s,i)=>{
      const t=targets[i];if(t.action==='delete'){assert(!s.exists);return;}
      assert(s.exists);for(const [k,v]of Object.entries(t.patch))assert.deepEqual(s.get(k),v,s.ref.path+':'+k);
      for(const field of ['name','eventName','venueId','address','startDate','startTime','endDate','endTime'])assert.deepEqual(s.get(field),snaps[i].get(field),'Keeper content drift '+field);
    });
    const resultPath=path.join(out,`cleanup-result-${stamp}.json`);
    await fs.writeFile(resultPath,JSON.stringify({verifiedAt:new Date().toISOString(),backupPath,targets:targets.map(t=>({path:t.path,action:t.action,verified:true}))},null,2));
    console.log(JSON.stringify({mode:'applied',deletes:7,keeperUpdates:6,resultPath,backupPath}));
  }
}finally{await admin.app().delete();}
