import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const admin=require('firebase-admin');
const args=process.argv.slice(2),apply=args.includes('--apply'),planArg=args.find(x=>x.startsWith('--plan='));
assert(args.every(x=>x==='--apply'||x.startsWith('--plan=')));assert.equal(Boolean(planArg),apply);
const key=JSON.parse(await fs.readFile(process.env.GATHR_SERVICE_ACCOUNT_PATH,'utf8'));assert.equal(key.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});const db=admin.firestore();
const target='venues/nvQTJXSbDsSfJTCxDKCH/events/0niGreSHiC7mgtbxUksA',patch={totalOccurrences:1,recurrenceUntilDate:'2026-10-07'};
const normalize=x=>JSON.parse(JSON.stringify(x));
try{
 const locks=await db.collection('processing_locks').get();assert(!locks.docs.some(x=>!['completed','failed','cancelled'].includes(x.data().status)),'Active parser');
 const s=await db.doc(target).get();assert(s.exists);const data=normalize(s.data());
 for(const [k,v]of Object.entries({name:'ZUMBA',uniqueId:'1922694639184538_1c89602b9be3537c',startDate:'2026-10-07',startTime:'17:30',endTime:'19:30',recurringPattern:'weekly_wednesday',totalOccurrences:4}))assert.deepEqual(data[k],v,k+' drift');
 const keepers=[];for(const id of ['0gGOviSZCv9OE2KhpL3Z','oct13_repair_zumba_20261014']){const k=await db.doc('venues/nvQTJXSbDsSfJTCxDKCH/events/'+id).get();assert(k.exists);keepers.push({path:k.ref.path,data:normalize(k.data())});}
 assert.equal(keepers[0].data.startDate,'2026-10-21');assert.equal(keepers[0].data.totalOccurrences,2);assert.equal(keepers[0].data.recurrenceUntilDate,'2026-10-28');assert.equal(keepers[1].data.startDate,'2026-10-14');assert.equal(keepers[1].data.endTime,'18:30');
 const stamp=new Date().toISOString().replace(/[:.]/g,'-'),out=path.resolve('functions/artifacts/luna-oct13-repair');
 const backup={project:key.project_id,target,data,updateSeconds:s.updateTime.seconds,updateNanos:s.updateTime.nanoseconds,keepers};
 const backupPath=path.join(out,'zumba-sibling-backup-'+stamp+'.json');await fs.writeFile(backupPath,JSON.stringify(backup,null,2));
 const plan={...backup,patch};
 if(!apply){const planPath=path.join(out,'zumba-sibling-plan-'+stamp+'.json');await fs.writeFile(planPath,JSON.stringify(plan,null,2));console.log(JSON.stringify({mode:'dry-run',target,patch,backupPath,planPath,reason:'End redundant older series after its original October7 class; retain corrected October14 and existing October21/28 series.'},null,2));}
 else{const approved=JSON.parse(await fs.readFile(path.resolve(planArg.slice(7)),'utf8'));assert.deepEqual(plan,approved,'Plan drift');const batch=db.batch();batch.update(s.ref,patch,{lastUpdateTime:s.updateTime});await batch.commit();const after=await s.ref.get();assert.deepEqual(normalize(after.data()),{...data,...patch});for(const k of keepers)assert.deepEqual(normalize((await db.doc(k.path).get()).data()),k.data);const resultPath=path.join(out,'zumba-sibling-result-'+stamp+'.json');await fs.writeFile(resultPath,JSON.stringify({target,patch,backupPath,verified:true},null,2));console.log(JSON.stringify({mode:'applied',resultPath}));}
}finally{await admin.app().delete();}
