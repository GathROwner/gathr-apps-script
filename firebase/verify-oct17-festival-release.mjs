// Independent secret-safe serving readback for the exact October 17 release.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {exec} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const run=promisify(exec),dir=path.resolve(import.meta.dirname,'../functions/artifacts/oct17-festival-corroboration-release');
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const hash=x=>createHash('sha256').update(JSON.stringify(stable(x))).digest('hex');
const read=async n=>JSON.parse((await fs.readFile(path.join(dir,n),'utf8')).replace(/^\uFEFF/,''));
const commands={function:'gcloud functions describe scheduledFestivalLinker --gen2 --region=northamerica-northeast1 --project=gathr-migrated --format=json',service:'gcloud run services describe scheduledfestivallinker --region=northamerica-northeast1 --project=gathr-migrated --format=json',scheduler:'gcloud scheduler jobs describe firebase-schedule-scheduledFestivalLinker-northamerica-northeast1 --location=northamerica-northeast1 --project=gathr-migrated --format=json'};
const after={};await Promise.all(Object.entries(commands).map(async([key,cmd])=>{after[key]=JSON.parse((await run(cmd,{maxBuffer:8388608})).stdout);await fs.writeFile(path.join(dir,'postdeploy-'+key+'.json'),JSON.stringify(after[key],null,2));}));
const before={};for(const key of Object.keys(commands))before[key]=await read('predeploy-'+key+'.json');
const fn=after.function,service=after.service;
assert.equal(fn.state,'ACTIVE');assert.equal(fn.serviceConfig.allTrafficOnLatestRevision,true);
assert.notEqual(fn.serviceConfig.revision,before.function.serviceConfig.revision);
assert.notEqual(fn.labels['firebase-functions-hash'],before.function.labels['firebase-functions-hash']);
assert.equal(service.status.latestReadyRevisionName,fn.serviceConfig.revision);
assert.deepEqual(service.status.traffic.filter(t=>Number(t.percent)>0).map(t=>({revision:t.revisionName,percent:t.percent})),[{revision:fn.serviceConfig.revision,percent:100}]);
const serviceConfig=f=>{const c=structuredClone(f.serviceConfig);delete c.uri;delete c.revision;return c;};
assert.deepEqual(serviceConfig(fn),serviceConfig(before.function),'Function configuration changed');
for(const field of ['runtime','entryPoint','environmentVariables'])assert.deepEqual(fn.buildConfig[field],before.function.buildConfig[field],field+' changed');
const runtime=s=>{const c=structuredClone(s.spec.template.spec);for(const x of c.containers)delete x.image;return c;};
assert.deepEqual(runtime(service),runtime(before.service),'Cloud Run runtime changed');
const scheduler=j=>Object.fromEntries(['name','state','schedule','timeZone','httpTarget','retryConfig','attemptDeadline'].map(k=>[k,j[k]]));
assert.deepEqual(scheduler(after.scheduler),scheduler(before.scheduler),'Scheduler changed');assert.equal(after.scheduler.state,'ENABLED');
const parsers=[];for(const [name,region,revision] of [['processDataset','northamerica-northeast2','processdataset-00501-lel'],['processDatasetResume','northamerica-northeast1','processdatasetresume-00465-tub'],['processDatasetSelectedRows','northamerica-northeast1','processdatasetselectedrows-00457-muz']]){
 const p=JSON.parse((await run(`gcloud functions describe ${name} --gen2 --region=${region} --project=gathr-migrated --format=json`,{maxBuffer:8388608})).stdout);
 const old=JSON.parse((await fs.readFile(path.resolve(dir,'../oct17-corroboration-preflight/runtime-'+name+'.json'),'utf8')).replace(/^\uFEFF/,''));
 assert.equal(p.state,'ACTIVE');assert.equal(p.serviceConfig.allTrafficOnLatestRevision,true);assert.equal(p.serviceConfig.revision,revision);assert.equal(p.labels['firebase-functions-hash'],'0c06b198eacb9cf32171e0d68fbea89e889a93c3');assert.deepEqual(p.serviceConfig,old.serviceConfig);assert.deepEqual(p.buildConfig,old.buildConfig);
 await fs.writeFile(path.join(dir,'postdeploy-'+name+'.json'),JSON.stringify(p,null,2));parsers.push({name,state:p.state,revision,hash:p.labels['firebase-functions-hash'],configurationPreserved:true});
}
const result={checkedAt:new Date().toISOString(),state:fn.state,revision:fn.serviceConfig.revision,hash:fn.labels['firebase-functions-hash'],trafficPercent:100,configurationPreserved:true,functionConfigSha256:hash(serviceConfig(fn)),runtimeConfigSha256:hash(runtime(service)),schedulerSha256:hash(scheduler(after.scheduler)),source:fn.buildConfig.source,parsers,liveWrites:0};
await fs.writeFile(path.join(dir,'independent-serving-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
