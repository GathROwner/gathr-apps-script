import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const out=path.join(import.meta.dirname,'artifacts/six-groups-oct15'),c=JSON.parse(await fs.readFile(path.join(out,'capture.json'),'utf8'));
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');const key=JSON.parse(await fs.readFile(process.env.GATHR_SERVICE_ACCOUNT_PATH,'utf8'));assert.equal(key.project_id,'gathr-migrated');admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});
try{
 const db=admin.firestore(),wrap=d=>({path:d.ref.path,version:{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds},data:JSON.parse(JSON.stringify(d.data()))});
 const roots=[...new Set(c.documents.filter(d=>d.path.startsWith('venues/ZDUj9euh7NVJ6INSlHM8/events/')).map(d=>d.data.uniqueId.split('_')[0]))];
 const [old,all]=await Promise.all([db.collection('parse_snapshots').where('uniqueId','in',roots).get(),db.collection('venues').get()]);
 const names=/corner cafe|island stone|willow bakery|knead a brake|shear intensity|spring valley|provincial credit union|kensington.*library/i;
 const venues=all.docs.filter(d=>names.test(String(d.get('name')||'')));
 const body={capturedAt:new Date().toISOString(),oldRubySources:old.docs.map(wrap),skeletonVenueCandidates:venues.map(wrap),liveWrites:0};await fs.writeFile(path.join(out,'extra-evidence.json'),JSON.stringify(body,null,2));
 console.log(JSON.stringify({oldRubySources:old.size,skeletonVenueCandidates:venues.map(d=>({path:d.ref.path,name:d.get('name'),address:d.get('address')})),liveWrites:0}));
}finally{await admin.app().delete();}
