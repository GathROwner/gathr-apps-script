// Independent, secret-safe preservation and serving checks. No remote writes.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {exec} from 'node:child_process';import {promisify} from 'node:util';import {createRequire} from 'node:module';
const phase=process.argv[2];assert(['before','after'].includes(phase));
const root=path.resolve('functions/artifacts/festival-context-oct15'),run=promisify(exec),require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const targets=[['processDataset','northamerica-northeast2'],['processDatasetResume','northamerica-northeast1'],['processDatasetSelectedRows','northamerica-northeast1'],['scheduledFestivalLinker','northamerica-northeast1']];
const functions=await Promise.all(targets.map(async([name,region])=>{
 const f=JSON.parse((await run(`gcloud functions describe ${name} --gen2 --region=${region} --project=gathr-migrated --format=json`,{maxBuffer:4194304})).stdout);
 assert.equal(f.state,'ACTIVE');assert.equal(f.serviceConfig.allTrafficOnLatestRevision,true);
 const serviceName=f.serviceConfig.service.split('/').at(-1),s=JSON.parse((await run(`gcloud run services describe ${serviceName} --region=${region} --project=gathr-migrated --format=json`,{maxBuffer:4194304})).stdout);
 const traffic=s.status.traffic.filter(t=>Number(t.percent)>0);assert.equal(traffic.length,1);assert.equal(traffic[0].percent,100);assert.equal(traffic[0].revisionName,f.serviceConfig.revision);assert.equal(s.status.latestReadyRevisionName,f.serviceConfig.revision);
 const config=structuredClone(f.serviceConfig);delete config.revision;delete config.uri;
 const runtime=structuredClone(s.spec.template.spec);delete runtime.containers[0].image;
 return{name,revision:f.serviceConfig.revision,hash:f.labels['firebase-functions-hash'],configHash:hash(config),runtimeHash:hash(runtime),mode:f.serviceConfig.environmentVariables.FESTIVAL_LINKER_MODE||null,traffic:100};
}));
const credential=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));assert.equal(credential.project_id,'gathr-migrated');admin.initializeApp({credential:admin.credential.cert(credential),projectId:credential.project_id});
try{
 const db=admin.firestore(),locks=await db.collection('processing_locks').get();assert(!locks.docs.some(d=>!['completed','failed','cancelled','canceled','released'].includes(String(d.get('status')||''))),'Active parser');
 const protectedBase=JSON.parse(await fs.readFile('functions/artifacts/festival-linker-oct15/activation-preservation-before.json','utf8'));
 const seed=JSON.parse(await fs.readFile('functions/artifacts/festival-linker-oct15/seed-plan-2026-10-16T01-19-51-395Z.json','utf8'));
 const paths=[...new Set([...protectedBase.documents.map(d=>d.path),...seed.changes.map(c=>c.path)])].sort();
 const docs=await db.getAll(...paths.map(p=>db.doc(p)));assert(docs.every(d=>d.exists));
 const pins=docs.map(d=>({path:d.ref.path,version:{seconds:d.updateTime.seconds,nanoseconds:d.updateTime.nanoseconds},dataHash:hash(d.data())}));
 const umbrella=docs.find(d=>d.ref.path==='events/area_7ebb4bc0846d26c4470e6842'),links=umbrella.get('areaData').locations.flatMap(p=>p.linkedEventIds||[]);assert.equal(links.length,17);
 const report={checkedAt:new Date().toISOString(),phase,functions,pins,manualLinks:links,feedVersion:docs.find(d=>d.ref.path==='runtime_metadata/event_feed').get('version'),activeParsers:0,liveWrites:0};
 if(phase==='after'){
  const before=JSON.parse(await fs.readFile(path.join(root,'release-before.json'),'utf8'));assert.deepEqual(report.pins,before.pins,'Protected records changed');assert.deepEqual(report.manualLinks,before.manualLinks);
  for(const fn of functions){const old=before.functions.find(f=>f.name===fn.name);assert.equal(fn.configHash,old.configHash,fn.name+' config drift');assert.equal(fn.runtimeHash,old.runtimeHash,fn.name+' runtime drift');if(fn.name!=='scheduledFestivalLinker'){assert.equal(fn.hash,old.hash);assert.equal(fn.revision,old.revision);}else{assert.notEqual(fn.hash,old.hash);assert.notEqual(fn.revision,old.revision);assert.equal(fn.mode,'publish');}}
 }
 await fs.writeFile(path.join(root,'release-'+phase+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({phase,functions:report.functions.map(({configHash,runtimeHash,...f})=>f),protectedDocuments:pins.length,manualLinks:17,activeParsers:0,feedVersion:report.feedVersion,liveWrites:0}));
}finally{await admin.app().delete();}
