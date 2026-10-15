// Default dry run. Exact reviewed Harvest programme consolidation; no models or replay.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';import {exec} from 'node:child_process';import {promisify} from 'node:util';
import {venuePath,sourceId,sourcePath,feedPath,website,faq,poster,keepers,retired,eventPath,buildChanges} from './harvest-oct15-spec.mjs';
const args=process.argv.slice(2),apply=args.includes('--apply'),planArg=args.find(a=>a.startsWith('--plan='));
assert(args.every(a=>a==='--apply'||a.startsWith('--plan=')));assert.equal(apply,Boolean(planArg));
const out=path.join(import.meta.dirname,'artifacts/harvest-series-oct15'),plain=x=>JSON.parse(JSON.stringify(x));
const hash=x=>createHash('sha256').update(Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const wrap=d=>({path:d.ref.path,exists:d.exists,version:d.updateTime?{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds}:null,data:d.exists?plain(d.data()):null});
const idle=docs=>assert(!docs.some(d=>!['completed','failed','cancelled','canceled','released'].includes(String(d.get('status')||''))),'Active or unknown parser blocks repair');
const original=JSON.parse(await fs.readFile(path.resolve(import.meta.dirname,'../functions/artifacts/oct15-sequential-repairs/next-batch/harvest-source-and-siblings.json'),'utf8'));
const roots=new Set(original.events.map(d=>String(d.data.uniqueId||'').split('_')[0]));
const related=d=>d.ref.path.startsWith(venuePath+'/events/')||roots.has(String(d.get('uniqueId')||'').split('_')[0])||(d.get('sourceUniqueIds')||[]).some(id=>roots.has(id));
const siblings=docs=>docs.filter(related).map(wrap).sort((a,b)=>a.path.localeCompare(b.path));
async function officialProof(){
 const pages=await Promise.all([website,faq].map(async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);assert.equal(new URL(r.url).hostname,'innatbayfortune.com');const html=await r.text();
  const text=html.replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<style\b[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&#8211;|&ndash;/g,'–').replace(/&#8217;|&rsquo;/g,'’').replace(/\s+/g,' ').trim();return{url,html,text};}));
 const p=pages[0].text,f=pages[1].text;
 for(const block of ['October 15, 16, 17','October 22, 23, 24','October 29, 30, 31','November 5, 6, 7'])assert(p.includes(block),'Printed date block changed '+block);
 assert(/5:00[–-]9:30 PM\s*\|\s*Chefs’ Harvest Dining Series/.test(p),'Dining programme clock changed');
 assert(/\$305 plus tax per person/.test(p));assert(/Thursdays, Fridays, and Saturdays from October 15 to November 7, 2026/.test(f));
 for(const name of ['NICK OF NORTH','MATT PIGEON','MACKENZIE BROWN','MICHAEL SMITH'])assert(p.toUpperCase().includes(name));
 const r=await fetch(poster,{signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);const bytes=Buffer.from(await r.arrayBuffer());
 return{pages,bytes,facts:{website,faq,dates:'Oct15/16/17,22/23/24,29/30/31;Nov5/6/7;2026',startTime:'17:00',endTime:'21:30',price:'$305 plus tax per person',posterSha256:hash(bytes)}};
}
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
const key=JSON.parse(await fs.readFile(process.env.GATHR_SERVICE_ACCOUNT_PATH,'utf8'));assert.equal(key.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});const db=admin.firestore();
try{
 const createPaths=['20261022','20261023','20261024','20261029','20261030','20261031','20261105','20261106','20261107'].map(d=>eventPath('harvest_20261015_'+d+'_1700'));
 const paths=[...new Set([venuePath,sourcePath,feedPath,...original.events.map(d=>d.path),...original.sources.map(d=>d.path),...createPaths])].sort();
 const [docs,all,locks,proof]=await Promise.all([db.getAll(...paths.map(p=>db.doc(p))),db.collectionGroup('events').get(),db.collection('processing_locks').get(),officialProof()]);idle(locks.docs);
 const documents=docs.map(wrap),map=new Map(documents.map(d=>[d.path,d]));
 for(const old of [original.venue,...original.events,...original.sources])assert.deepEqual(map.get(old.path),{exists:true,...old},'Reviewed source or venue event drift '+old.path);
 for(const p of createPaths)assert.equal(map.get(p).exists,false,'Recovery target already exists');
 assert.equal(map.get(feedPath).data.version,265,'Feed marker drift requires a new reviewed plan');
 const currentRelated=siblings(all.docs);assert.equal(currentRelated.length,original.events.length,'Additional source-linked siblings require review');
 const changes=buildChanges(documents);
 const canonicals=changes.filter(c=>c.kind==='create'||keepers.some(id=>c.path===eventPath(id)));
 assert.equal(new Set(canonicals.map(c=>(c.payload||c.patch).startDate)).size,12);
 const mediaUrls=[...new Set(canonicals.flatMap(c=>{const e=c.payload||c.patch;return [...e.mediaUrls,map.get(venuePath).data.profileImage];}))].sort();
 const media=await Promise.all(mediaUrls.map(async url=>{const r=await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,'Retained source media unavailable '+url);return{url,status:r.status};}));
 const capture={schema:1,changes,feedVersionChange:{path:feedPath,from:265,to:266},documents,siblings:currentRelated,officialEvidence:proof.facts,media};
 const snapshotHash=hash(capture),stamp=new Date().toISOString().replace(/[:.]/g,'-');await fs.mkdir(out,{recursive:true});
 const backupPath=path.join(out,`${apply?'prewrite':'backup'}-${stamp}.json`);await fs.writeFile(backupPath,JSON.stringify(capture,null,2));
 for(let i=0;i<proof.pages.length;i++)await fs.writeFile(path.join(out,`official-${i}-${stamp}.html`),proof.pages[i].html);
 await fs.writeFile(path.join(out,'reviewed-programme.webp'),proof.bytes);
 if(!apply){
  const planPath=path.join(out,`plan-${stamp}.json`);await fs.writeFile(planPath,JSON.stringify({mode:'dry_run',snapshotHash,backupPath,changes,feedVersionChange:capture.feedVersionChange,requiredRelease:'Exact reviewed occurrence retirement guard, independently ACTIVE on all three parsers; unchanged model/prompt/configuration',liveWrites:0},null,2));
  console.log(JSON.stringify({planPath,backupPath,keeperUpdates:3,creates:9,deletes:5,venuePolicyUpdates:1,feedVersion:266,guardedReferences:documents.length,relatedEvents:currentRelated.length,media200:media.length,liveWrites:0}));
 }else{
  const plan=JSON.parse(await fs.readFile(path.resolve(planArg.slice(7)),'utf8'));assert.equal(plan.snapshotHash,snapshotHash,'Approved source/target/sibling/media/marker drift');assert.deepEqual(plan.changes,changes);assert.deepEqual(plan.feedVersionChange,capture.feedVersionChange);
  const expectedHash=process.env.HARVEST_RELEASE_HASH;assert(/^[a-f0-9]{40}$/.test(expectedHash||''),'Independently verified release hash required');
  assert.notEqual(expectedHash,'de8b283b5d93c7a569dc8bec95b4448fce196d73','Unrepaired serving baseline cannot authorize retirement');
  const serving=JSON.parse(await fs.readFile(path.join(out,'serving-after.json'),'utf8'));assert.equal(serving.rows.length,3);
  assert(serving.rows.every(r=>r.hash===expectedHash&&r.state==='ACTIVE'&&r.trafficPercent===100),'Independent release readback required');
  const run=promisify(exec);await Promise.all([['processDataset','northamerica-northeast2'],['processDatasetResume','northamerica-northeast1'],['processDatasetSelectedRows','northamerica-northeast1']].map(async([name,region])=>{const r=await run(`gcloud functions describe ${name} --gen2 --region=${region} --project=gathr-migrated --format="json(state,labels.firebase-functions-hash)"`);const f=JSON.parse(r.stdout);assert.equal(f.state,'ACTIVE');assert.equal(f.labels['firebase-functions-hash'],expectedHash);}));
  await db.runTransaction(async tx=>{
   idle((await tx.get(db.collection('processing_locks'))).docs);assert.deepEqual((await tx.getAll(...docs.map(d=>d.ref))).map(wrap),documents,'Reference drift');assert.deepEqual(siblings((await tx.get(db.collectionGroup('events'))).docs),capture.siblings,'Source-linked sibling drift');
   for(const c of changes){const ref=db.doc(c.path);if(c.kind==='delete')tx.delete(ref);else if(c.kind==='create'){
    const payload={...c.payload};if(payload.sourceTimestamp){assert(Number.isFinite(payload.sourceTimestamp._seconds));payload.sourceTimestamp=new admin.firestore.Timestamp(payload.sourceTimestamp._seconds,payload.sourceTimestamp._nanoseconds||0);}
    tx.create(ref,{...payload,createdAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()});
   }else tx.update(ref,{...c.patch,updatedAt:admin.firestore.FieldValue.serverTimestamp()});}
   tx.update(db.doc(feedPath),{version:266,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
  });
  const resultPath=path.join(out,`applied-${stamp}.json`);await fs.writeFile(resultPath,JSON.stringify({appliedAt:new Date().toISOString(),backupPath,changes,feedVersionChange:capture.feedVersionChange,releaseHash:expectedHash,creates:9,keeperUpdates:3,deletes:5,venuePolicyUpdates:1,metadataUpdates:1,mediaWrites:0},null,2));console.log(JSON.stringify({resultPath,creates:9,keeperUpdates:3,deletes:5,venuePolicyUpdates:1,feedVersion:266,mediaWrites:0}));
 }
}finally{await admin.app().delete();}
