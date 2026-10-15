// Exact source-backed recovery. Default dry run; no parser/model/geocoding calls.
import fs from'node:fs/promises';import path from'node:path';import assert from'node:assert/strict';import {createHash}from'node:crypto';import {createRequire}from'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
const args=process.argv.slice(2),apply=args.includes('--apply'),planArg=args.find(x=>x.startsWith('--plan='));assert(args.every(x=>x==='--apply'||x.startsWith('--plan=')));assert.equal(apply,Boolean(planArg));
const out=path.resolve(import.meta.dirname,'../functions/artifacts/fin-tacos-oct15'),sourceId='122305763552019252',venuePath='venues/1MYRGigRnV8KbuEigjMg';
const target=venuePath+'/events/oct15_fin_122305763552019252_dc008c031ae01b13',sourcePath='parse_snapshots/1YPf2cKvXfXl8L0HVL63VZ2zeTLEvWlit_257_1792070990779';
const marker='https://storage.googleapis.com/gathr-uploaded-images/postimages/__fin_approved_source_upload__.webp';
const plain=x=>JSON.parse(JSON.stringify(x)),hash=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const wrap=d=>({path:d.ref.path,exists:d.exists,version:d.updateTime?{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}:null,data:d.exists?plain(d.data()):null});
const related=d=>d.ref.path.startsWith(venuePath+'/events/')||String(d.get('uniqueId')||'').startsWith(sourceId+'_')||(d.get('sourceUniqueIds')||[]).includes(sourceId);
const captureRelated=docs=>docs.filter(related).map(wrap).sort((a,b)=>a.path.localeCompare(b.path));
const payload=JSON.parse(await fs.readFile(path.join(out,'candidate-payload.json'),'utf8'));payload.recoveryRun='oct15-fin-source-verified-recovery';
assert.equal(payload.uniqueId,'122305763552019252_dc008c031ae01b13');assert.equal(payload.eventName,'Thursday Fish Tacos');assert.equal(payload.venueId,'1MYRGigRnV8KbuEigjMg');assert.equal(payload.recurringPattern,'weekly_thursday');assert.equal(payload.isRecurring,'Yes');
assert.equal(payload.startDate,'2026-10-15');assert.equal(payload.endDate,'2026-10-15');assert.equal(payload.startTime,'07:00');assert.equal(payload.endTime,'20:00');assert.equal(payload.ticketPrice,'$7 each (fish tacos)');assert(!payload.timing);assert.deepEqual(payload.sourceUniqueIds,[sourceId]);
const image=await fs.readFile(path.join(out,'source-original.jpg')),imageSha=hash(image);assert.equal(imageSha,'a9a65519558daef866c9ec4dd1dcf7bf8657f0fe3f88eb537136889ad5a59240');
const hoursUrl='https://finfolkfood.ca/contact-us/',hoursPattern=/NEW FALL 2026 HOURS\s*Open Everyday:\s*7am.?8pm/i;
const key=JSON.parse(await fs.readFile(process.env.GATHR_SERVICE_ACCOUNT_PATH,'utf8'));assert.equal(key.project_id,'gathr-migrated');admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});const db=admin.firestore();
const idle=docs=>assert(!docs.some(d=>!['completed','failed','cancelled','canceled','released'].includes(String(d.get('status')||''))),'Active parser blocks recovery');
try{
 const [locks,refs,all]=await Promise.all([db.collection('processing_locks').get(),db.getAll(db.doc(venuePath),db.doc(sourcePath),db.doc(target)),db.collectionGroup('events').get()]);idle(locks.docs);
 assert(refs[0].exists&&refs[1].exists&&!refs[2].exists);assert.equal(refs[0].get('name'),'FiN Folk Food');assert.equal(refs[1].get('uniqueId'),sourceId);assert.deepEqual(refs[0].get('operatingHours').thursday,{open:'07:00',close:'20:00'});
 assert(/every Thursday/i.test(refs[1].get('inputText')));const siblings=captureRelated(all.docs);assert(!siblings.some(d=>/taco/i.test(d.data.eventName||d.data.name||'')),'Taco sibling appeared; review first');assert(!all.docs.some(d=>d.get('uniqueId')===payload.uniqueId));
 const capture={version:1,target,payload,imageSha,hoursAuthority:{url:hoursUrl,scope:'NEW FALL 2026 HOURS',open:'07:00',close:'20:00'},documents:refs.map(wrap),siblings};
 const snapshotHash=hash(capture),stamp=new Date().toISOString().replace(/[:.]/g,'-');await fs.mkdir(out,{recursive:true});
 const website=await fetch(hoursUrl,{signal:AbortSignal.timeout(20000)});assert.equal(website.status,200);const html=await website.text();assert(hoursPattern.test(html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')),'Current-year hours changed or missing');
 const backup=path.join(out,`${apply?'prewrite':'backup'}-${stamp}.json`);await fs.writeFile(backup,JSON.stringify(capture,null,2));
 if(!apply){const plan=path.join(out,`plan-${stamp}.json`);await fs.writeFile(plan,JSON.stringify({mode:'dry_run',snapshotHash,backup,action:{path:target,create:payload},media:{sourceSha256:imageSha,folder:'postimages',uploads:1},held:'No separate chicken price or serving clock; chicken choice retained as qualified caption context.'},null,2));console.log(JSON.stringify({plan,backup,target,title:payload.eventName,price:payload.ticketPrice,start:payload.startTime,end:payload.endTime,weekly:'Thursday',mediaUploads:0,liveWrites:0}));}
 else{
  const approved=JSON.parse(await fs.readFile(path.resolve(planArg.slice(7)),'utf8'));assert.equal(snapshotHash,approved.snapshotHash,'Reviewed source/venue/sibling/payload drift');assert.deepEqual(approved.action,{path:target,create:payload});
  const serving=JSON.parse(await fs.readFile(process.env.FIN_SERVING_DESCRIPTION_PATH,'utf8')),uploadUrl=serving.serviceConfig.environmentVariables.IMAGE_UPLOAD_URL;assert.equal(new URL(uploadUrl).origin,'https://gathr-backend-6ju7yi5g2a-nn.a.run.app');assert.equal(new URL(uploadUrl).pathname,'/upload-image');
  const uploadState=path.join(out,`image-upload-${imageSha}.json`);let media;try{media=JSON.parse(await fs.readFile(uploadState,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(media){assert.equal(media.status,'complete','Unknown prior upload outcome; inspect before retry');assert.equal(media.sourceSha256,imageSha);}else{
   await fs.writeFile(uploadState,JSON.stringify({status:'pending',sourceSha256:imageSha,startedAt:new Date().toISOString()},null,2));
   const form=new FormData();form.append('folder','postimages');form.append('image',new Blob([image],{type:'image/jpeg'}),'fin-taco-source-'+imageSha+'.jpg');form.append('filename','fin-taco-source-'+imageSha+'.jpg');form.append('ocr','false');
   const r=await fetch(uploadUrl,{method:'POST',body:form,signal:AbortSignal.timeout(60000)});assert.equal(r.status,200);const response=await r.json();const imageUrl=response.imageUrl||response.publicUrl;assert(typeof imageUrl==='string'&&imageUrl.startsWith('https://storage.googleapis.com/gathr-uploaded-images/postimages/'));
   media={status:'complete',sourceSha256:imageSha,imageUrl,completedAt:new Date().toISOString()};await fs.writeFile(uploadState,JSON.stringify(media,null,2));
  }
  assert.equal((await fetch(media.imageUrl,{method:'HEAD',signal:AbortSignal.timeout(15000)})).status,200);
  const substitute=v=>typeof v==='string'?v===marker?media.imageUrl:v:Array.isArray(v)?v.map(substitute):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,substitute(x)])):v;const event=substitute(payload);
  await db.runTransaction(async tx=>{idle((await tx.get(db.collection('processing_locks'))).docs);const current=await tx.getAll(...refs.map(d=>d.ref));assert.deepEqual(current.map(wrap),capture.documents,'Transactional reference drift');assert.deepEqual(captureRelated((await tx.get(db.collectionGroup('events'))).docs),siblings,'Transactional sibling drift');tx.create(db.doc(target),{...event,createdAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()});});
  const after=await db.doc(target).get();const actual=plain(after.data());delete actual.createdAt;delete actual.updatedAt;assert.deepEqual(actual,event);
  const resultPath=path.join(out,`applied-${stamp}.json`);await fs.writeFile(resultPath,JSON.stringify({appliedAt:new Date().toISOString(),backup,target,payload:event,media,created:1},null,2));console.log(JSON.stringify({resultPath,target,created:1,mediaUploads:1,otherRecordsChanged:0}));
 }
}finally{await admin.app().delete();}
