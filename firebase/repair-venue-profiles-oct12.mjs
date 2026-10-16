import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
const bucketName='gathr-uploaded-images',dir='functions/artifacts/oldedublin-profile-oct12';
const targets=[
 {id:'fb_100057777755102',name:'New Glasgow Lobster Suppers | New Glasgow PE',old:'1775135636217-i6j4ib.webp',slug:'newglasgow-lobster',source:'https://peilobstersuppers.com/wp-content/uploads/2022/07/cropped-NGLS_Favicon-192x192.png',hash:'0963d363d49efc240dae30b2130bbb3706316484ac242f14aeaa6afdd35f8b6a',type:'image/png',ext:'png'},
 {id:'fb_100064147174976',name:'The Lost Anchor | Cavendish PE',old:'1771374964110-r499lb.webp',slug:'lostanchor',source:'https://www.lostanchorpei.com/opengraph-image?bebca75a60abe85a',hash:'7db23dce761ed53633b06d9a5e0075d2e3c0ea6e2e4249d5cb6a6dea212d3bc5',type:'image/png',ext:'png'},
 {id:'slug_montague-rotary-library',name:'Montague Rotary Library',old:'1769875185301.webp',slug:'montague-library',source:'https://www.princeedwardisland.ca/sites/default/files/styles/large/public/embedded_images/mon.jpg?itok=1CT59iW1',hash:'4e365d5ff569363a9b5d964e0ad4404f5c1aa07578d42661d216fb56d3ce678d',type:'image/jpeg',ext:'jpg'},
 {id:'slug_peibrewingcompany',name:'PEI Brewing Company',old:'1768326647941.webp',slug:'peibrewing',source:'https://peibrewingcompany.com/wp-content/uploads/2019/04/peibc-favicon.png',hash:'94983c54aa76251adf693134e5f818fb97fb980f94eb1fdbff649f0839fbf2fc',type:'image/png',ext:'png'},
];
const key=JSON.parse(await fs.readFile(process.env.GATHR_SERVICE_ACCOUNT_PATH,'utf8'));assert.equal(key.project_id,'gathr-migrated');admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});
const db=admin.firestore(),bucket=admin.storage().bucket(bucketName),apply=process.argv.includes('--apply'),planArg=process.argv.find(x=>x.startsWith('--plan='));assert(!apply||planArg);
const capture=d=>({path:d.ref.path,seconds:d.updateTime.seconds,nanos:d.updateTime.nanoseconds,data:d.data()});
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
try{
 const locks=await db.collection('processing_locks').get();assert(!locks.docs.some(d=>!['completed','failed','cancelled'].includes(d.data().status)),'Active parser');
 const states=[],plans=[],uploads=[];
 for(const t of targets){const old=`https://storage.googleapis.com/${bucketName}/profilepictures/${t.old}`,path=`venues/${t.id}`,object=`profilepictures/${t.slug}-official-20261012-${t.hash.slice(0,12)}.${t.ext}`,next=`https://storage.googleapis.com/${bucketName}/${object}`;
  const [venue,events,response,previous,exists]=await Promise.all([db.doc(path).get(),db.collection(path+'/events').get(),fetch(t.source,{signal:AbortSignal.timeout(25000)}),fetch(old,{signal:AbortSignal.timeout(15000)}),bucket.file(object).exists()]);
  assert(venue.exists);assert.equal(venue.data().name,t.name);assert.equal(venue.data().profileImage,old);assert.equal(previous.status,404);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),t.type);
  const bytes=Buffer.from(await response.arrayBuffer());assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),t.hash);
  if(exists[0]){const[existingBytes]=await bucket.file(object).download();assert.equal(crypto.createHash('sha256').update(existingBytes).digest('hex'),t.hash,'Existing immutable replacement differs');}
  const u=new URL(t.source);u.search='';const patch={profileImage:next,profileImageSourceSignature:u.host+u.pathname};
  states.push({venue:capture(venue),events:events.docs.map(capture).sort((a,b)=>a.path.localeCompare(b.path))});plans.push({path,previous:old,source:t.source,sha256:t.hash,object,next,patch,eventMutations:0});uploads.push({file:bucket.file(object),bytes,type:t.type,source:t.source,hash:t.hash,venue,reused:exists[0]});
 }
 const plan={targets:plans,stateHash:hash(states)},stamp=new Date().toISOString().replace(/[:.]/g,'-'),backup=`firebase/venue-profiles-oct12-backup-${stamp}.json`;
 await fs.writeFile(backup,JSON.stringify({plan,states},null,2));
 if(!apply){const planPath=`${dir}/four-venue-repair-plan-${stamp}.json`;await fs.writeFile(planPath,JSON.stringify(plan,null,2));console.log(JSON.stringify({mode:'dry-run',backup,planPath,plan},null,2));}
 else{assert.deepEqual(JSON.parse(await fs.readFile(planArg.slice(7),'utf8')),plan,'Reviewed plan drift');
  for(const u of uploads){if(!u.reused)await u.file.save(u.bytes,{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:u.type,cacheControl:'public,max-age=86400',metadata:{sourceUrl:u.source,sha256:u.hash,repair:'venue-profiles-oct12'}}});const r=await fetch(`https://storage.googleapis.com/${bucketName}/${u.file.name}`,{signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);assert.equal(crypto.createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex'),u.hash);}
  await fs.writeFile(`${dir}/four-venue-staged-assets-${stamp}.json`,JSON.stringify({backup,assets:uploads.map(u=>({object:u.file.name,sha256:u.hash,reused:u.reused})),note:'Retain these immutable assets if the guarded transaction aborts; do not delete automatically.'},null,2));
  await db.runTransaction(async tx=>{
   const currentLocks=await tx.get(db.collection('processing_locks'));assert(!currentLocks.docs.some(d=>!['completed','failed','cancelled'].includes(d.data().status)),'Active parser before write');
   const venues=await tx.getAll(...uploads.map(u=>u.venue.ref)),current=[];
   for(let i=0;i<plans.length;i++){const events=await tx.get(db.collection(plans[i].path+'/events'));current.push({venue:capture(venues[i]),events:events.docs.map(capture).sort((a,b)=>a.path.localeCompare(b.path))});}
   assert.equal(hash(current),plan.stateHash,'Venue/event/sibling drift before transaction');
   for(let i=0;i<plans.length;i++)tx.update(venues[i].ref,{...plans[i].patch,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{lastUpdateTime:venues[i].updateTime});
  });
  const after=[];for(let i=0;i<plans.length;i++){const v=await uploads[i].venue.ref.get(),events=await db.collection(plans[i].path+'/events').get();assert.deepEqual(v.data(),{...uploads[i].venue.data(),...plans[i].patch,updatedAt:v.data().updatedAt});assert.deepEqual(events.docs.map(capture).sort((a,b)=>a.path.localeCompare(b.path)),states[i].events);after.push(capture(v));}
  const result=`${dir}/four-venue-repair-result-${stamp}.json`;await fs.writeFile(result,JSON.stringify({backup,plan,after,verified:true},null,2));console.log(JSON.stringify({mode:'applied',backup,result,venues:4,eventMutations:0,verified:true}));
 }
}finally{await admin.app().delete();}
