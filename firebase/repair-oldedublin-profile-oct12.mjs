import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const admin=require('firebase-admin');
const target='venues/fb_100063673418060';
const previous='https://storage.googleapis.com/gathr-uploaded-images/profilepictures/1768411503650.webp';
const source='https://oldedublinpub.com/wp-content/uploads/2021/03/cropped-odp-site-icon-192x192.png';
const digest='49f5ede02f70b2d81157436d39688b2df1d0cba060a4c17ed1f4b3d4b3447a7b';
const object='profilepictures/oldedublinpub-official-20261012-49f5ede02f70.png';
const next='https://storage.googleapis.com/gathr-uploaded-images/'+object;
const apply=process.argv.includes('--apply'),planArg=process.argv.find(x=>x.startsWith('--plan='));
assert(!apply||planArg,'Apply requires the exact reviewed plan');
const key=JSON.parse(await fs.readFile(process.env.GATHR_SERVICE_ACCOUNT_PATH,'utf8'));
assert.equal(key.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});
const db=admin.firestore(),file=admin.storage().bucket('gathr-uploaded-images').file(object);
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const dir='functions/artifacts/oldedublin-profile-oct12';
const capture=x=>({path:x.ref.path,updateSeconds:x.updateTime.seconds,updateNanos:x.updateTime.nanoseconds,data:x.data()});
try{
  const [v,events,locks,exists,response,oldResponse]=await Promise.all([
    db.doc(target).get(),db.collection(target+'/events').get(),db.collection('processing_locks').get(),file.exists(),
    fetch(source,{signal:AbortSignal.timeout(20000)}),fetch(previous,{signal:AbortSignal.timeout(20000)})]);
  assert(v.exists);assert.equal(v.data().facebookId,'100063673418060');assert.equal(v.data().profileImage,previous);
  assert(!locks.docs.some(x=>!['completed','failed','cancelled'].includes(x.data().status)),'Active parser');
  assert.equal(exists[0],false,'Destination already exists; inspect before reuse');
  assert.equal(oldResponse.status,404);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');
  const bytes=Buffer.from(await response.arrayBuffer());assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),digest);
  assert.equal(bytes.readUInt32BE(16),192);assert.equal(bytes.readUInt32BE(20),192);
  const state={venue:capture(v),events:events.docs.map(capture).sort((a,b)=>a.path.localeCompare(b.path))};
  const plan={target,previous,source,sha256:digest,object,next,patch:{profileImage:next,profileImageSourceSignature:'oldedublinpub.com/wp-content/uploads/2021/03/cropped-odp-site-icon-192x192.png'},stateHash:hash(state),eventMutations:0};
  await fs.mkdir(dir,{recursive:true});
  const backupPath=`firebase/oldedublin-profile-backup-${stamp}.json`;
  await fs.writeFile(backupPath,JSON.stringify({plan,state},null,2));
  if(!apply){const planPath=`${dir}/repair-plan-${stamp}.json`;await fs.writeFile(planPath,JSON.stringify(plan,null,2));console.log(JSON.stringify({mode:'dry-run',plan,planPath,backupPath},null,2));}
  else{
    assert.deepEqual(JSON.parse(await fs.readFile(planArg.slice(7),'utf8')),plan,'Drift since reviewed plan');
    await file.save(bytes,{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:'image/png',cacheControl:'public,max-age=86400',metadata:{sourceUrl:source,sha256:digest,repair:'oldedublin-profile-oct12'}}});
    const publicResponse=await fetch(next,{signal:AbortSignal.timeout(20000)});assert.equal(publicResponse.status,200);
    assert.equal(crypto.createHash('sha256').update(Buffer.from(await publicResponse.arrayBuffer())).digest('hex'),digest);
    await db.doc(target).update({...plan.patch,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{lastUpdateTime:v.updateTime});
    const after=await db.doc(target).get();for(const[k,value]of Object.entries(plan.patch))assert.equal(after.data()[k],value);
    const updatedEvents=await db.collection(target+'/events').get();assert.deepEqual(updatedEvents.docs.map(capture).sort((a,b)=>a.path.localeCompare(b.path)),state.events);
    const expected={...v.data(),...plan.patch,updatedAt:after.data().updatedAt};assert.deepEqual(after.data(),expected);
    const resultPath=`${dir}/repair-result-${stamp}.json`;await fs.writeFile(resultPath,JSON.stringify({target,backupPath,plan,after:capture(after),verified:true},null,2));
    console.log(JSON.stringify({mode:'applied',target,backupPath,resultPath,verified:true,eventMutations:0}));
  }
}finally{await admin.app().delete();}
