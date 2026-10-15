// Independent saved readbacks only; private environment values are never printed.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir=path.resolve(import.meta.dirname,'../functions/artifacts/anchor-festival-oct14');
const read=async name=>JSON.parse((await fs.readFile(path.join(dir,name),'utf8')).replace(/^\uFEFF/,''));
const managed=/^(?:FUNCTION_|EVENTARC_|FIREBASE_|K_|GCLOUD_PROJECT$|GCP_PROJECT$|CLOUD_RUNTIME_CONFIG$|PORT$)/;
const names=['processDataset','processDatasetResume','processDatasetSelectedRows','finalizeCityLevelEventReviewTrigger','processSharedEventPublicCandidates','scheduledSharedEventPublicCandidateProcessor'];
const rows=[];
for(const name of names){
 const before=await read(name+'-before.json'),after=await read(name+'-after.json'),run=await read(name+'-traffic-after.json');
 assert.equal(after.state,'ACTIVE',name);assert.equal(after.serviceConfig.allTrafficOnLatestRevision,true,name);
 assert.notEqual(after.serviceConfig.revision,before.serviceConfig.revision,name);
 assert.notEqual(after.labels['firebase-functions-hash'],before.labels['firebase-functions-hash'],name);
 const a=before.serviceConfig.environmentVariables||{},b=after.serviceConfig.environmentVariables||{};
 for(const key of new Set([...Object.keys(a),...Object.keys(b)])){
  if(!name.startsWith('processDataset')&&managed.test(key))continue;
  assert.equal(b[key],a[key],name+' configuration drift in '+key);
 }
 const traffic=run.status.traffic.filter(x=>Number(x.percent)>0);
 assert.equal(traffic.length,1,name);assert.equal(traffic[0].revisionName,after.serviceConfig.revision,name);assert.equal(Number(traffic[0].percent),100,name);
 rows.push({name,state:after.state,revision:after.serviceConfig.revision,hash:after.labels['firebase-functions-hash'],trafficPercent:100,configurationPreserved:true});
}
assert.equal(new Set(rows.slice(0,3).map(x=>x.hash)).size,1,'Parser package mismatch');
// HTTP and scheduled deployments can carry distinct function fingerprints.
// Their independently retrieved immutable source archives are the code proof.
const promotionSources=await read('promotion-source-verified.json');
assert.equal(promotionSources.identicalServingArchives,true);
const report={checkedAt:new Date().toISOString(),sourceCommit:'5f657d5',project:'gathr-migrated',promotionSources,rows};
await fs.writeFile(path.join(dir,'serving-verified.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
