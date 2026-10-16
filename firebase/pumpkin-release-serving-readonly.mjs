// Exact target readback. Raw environment, inline credentials and tokens stay in memory.
import fs from 'node:fs/promises';import {exec} from 'node:child_process';import {promisify} from 'node:util';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const run=promisify(exec),phase=process.argv[2];assert(['before','check','after'].includes(phase));
const dir='functions/artifacts/pumpkin-overview-oct16',targets=[['processDataset','northamerica-northeast2'],['processDatasetResume','northamerica-northeast1'],['processDatasetSelectedRows','northamerica-northeast1'],['finalizeCityLevelEventReviewTrigger','northamerica-northeast2'],['processSharedEventPublicCandidates','northamerica-northeast2'],['scheduledSharedEventPublicCandidateProcessor','northamerica-northeast1'],['scheduledFestivalLinker','northamerica-northeast1']];
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v,hash=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const runtimes=new Map();
const unorderedEnvironment=runtime=>{const copy=structuredClone(runtime);for(const container of copy.containers||[]){const env=container.env||[];assert.equal(new Set(env.map(e=>e.name)).size,env.length,'Duplicate environment keys');assert(env.every(e=>!String(e.value||'').includes('$(')),'Environment expansion can depend on ordering');env.sort((a,b)=>a.name.localeCompare(b.name));}return copy;};
const group=process.argv.find(a=>a.startsWith('--group='))?.slice(8);assert(!group||['parser','finalizer','shared','worker'].includes(group));
const selected=group==='parser'?targets.slice(0,3):group==='finalizer'?targets.slice(3,4):group==='shared'?targets.slice(4,6):group==='worker'?targets.slice(6):targets;
const rows=await Promise.all(selected.map(async([name,region])=>{
 const fn=JSON.parse((await run(`gcloud functions describe ${name} --gen2 --project=gathr-migrated --region=${region} --format=json`,{maxBuffer:4194304})).stdout);
 assert.equal(fn.state,'ACTIVE');assert.equal(fn.serviceConfig.allTrafficOnLatestRevision,true);
 const serviceName=fn.serviceConfig.service.split('/').at(-1);assert(/^[a-z0-9-]+$/.test(serviceName));
 const service=JSON.parse((await run(`gcloud run services describe ${serviceName} --project=gathr-migrated --region=${region} --format=json`,{maxBuffer:4194304})).stdout);
 const traffic=service.status.traffic.filter(t=>Number(t.percent)>0);assert.equal(traffic.length,1);assert.equal(traffic[0].percent,100);assert.equal(traffic[0].revisionName,fn.serviceConfig.revision);assert.equal(service.status.latestReadyRevisionName,fn.serviceConfig.revision);
 const config=structuredClone(fn.serviceConfig);delete config.revision;delete config.uri;const runtime=structuredClone(service.spec.template.spec);delete runtime.containers[0].image;
 runtimes.set(name,runtime);
 return{name,region,state:fn.state,revision:fn.serviceConfig.revision,hash:fn.labels['firebase-functions-hash'],source:fn.buildConfig.source.storageSource,runtime:fn.buildConfig.runtime,functionConfigHash:hash(config),runtimeHash:hash(runtime),environmentHash:hash(fn.serviceConfig.environmentVariables||{}),secretBindingsHash:hash(fn.serviceConfig.secretEnvironmentVariables||[]),traffic:100};
}));
if(!group||group==='parser')assert.equal(new Set(rows.slice(0,3).map(r=>r.hash)).size,1,'Parser serving baselines diverge');
if(phase==='after'||phase==='check'){const before=JSON.parse(await fs.readFile(dir+'/serving-before.json','utf8'));for(const row of rows){const old=before.rows.find(r=>r.name===row.name);for(const field of ['functionConfigHash','environmentHash','secretBindingsHash'])assert.equal(row[field],old[field],row.name+' configuration drift');
 if(row.runtimeHash!==old.runtimeHash){
  // Provider may reorder literal environment entries. Prove the archived
  // revision is exactly the original baseline, then compare every setting
  // with only that array order normalized. No changed value is permitted.
  assert(/^[a-z0-9-]+$/.test(old.revision));
  const previous=JSON.parse((await run(`gcloud run revisions describe ${old.revision} --project=gathr-migrated --region=${row.region} --format=json`,{maxBuffer:4194304})).stdout);
  const original=structuredClone(previous.spec);delete original.containers[0].image;
  assert.equal(hash(original),old.runtimeHash,'Archived runtime does not match pinned baseline');
  assert.equal(hash(unorderedEnvironment(runtimes.get(row.name))),hash(unorderedEnvironment(original)),row.name+' runtime configuration drift');
  row.runtimeOrderOnlyDifference=true;row.runtimeSemanticHash=hash(unorderedEnvironment(original));
 }
 if(phase==='after')assert.notEqual(row.hash,old.hash);else{assert.equal(row.hash,old.hash,row.name+' serving source changed');assert.deepEqual(row.source,old.source,row.name+' source archive changed');}}}
await fs.writeFile(dir+'/serving-'+phase+(group?'-'+group:'')+'.json',JSON.stringify({checkedAt:new Date().toISOString(),rows,liveWrites:0},null,2));console.log(JSON.stringify(rows.map(({source,functionConfigHash,runtimeHash,environmentHash,secretBindingsHash,...visible})=>visible)));
