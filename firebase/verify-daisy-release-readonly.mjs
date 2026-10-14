// Readback only; raw descriptions contain private configuration and stay local.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir=path.resolve(import.meta.dirname,'../functions/artifacts/daisy-oct14');
const read=async file=>JSON.parse((await fs.readFile(path.join(dir,file),'utf8')).replace(/^\uFEFF/,''));
const managed=/^(?:FUNCTION_|EVENTARC_|FIREBASE_|K_|GCLOUD_PROJECT$|GCP_PROJECT$|CLOUD_RUNTIME_CONFIG$|PORT$)/;
const rows=[];
const names=['processDataset','processDatasetResume','processDatasetSelectedRows','scheduledUnknownVenueResolver','processUnrecognizedVenues'];
const expectedHashes={processDataset:'05085d8b2f51df99d8c8e67e40146f1902afdf64',processDatasetResume:'05085d8b2f51df99d8c8e67e40146f1902afdf64',
  processDatasetSelectedRows:'05085d8b2f51df99d8c8e67e40146f1902afdf64',scheduledUnknownVenueResolver:'c4444a96e69c6a70fa2f45fd12381db7e4a8148a',
  processUnrecognizedVenues:'e9df136f0868f360f12cb394753fd576b7f00f1b'};
const parserOnly=process.argv.includes('--parser-only');
for(const name of parserOnly?names.slice(0,3):names){
 const before=await read(name+'-before.json'),after=await read(name+'-after.json'),run=await read(name+'-traffic-after.json');
 assert.equal(after.state,'ACTIVE',name);assert.equal(after.serviceConfig.allTrafficOnLatestRevision,true,name);
 assert.equal(after.labels['firebase-functions-hash'],expectedHashes[name],name+' unexpected release');
 assert.notEqual(after.serviceConfig.revision,before.serviceConfig.revision,name);assert.notEqual(after.labels['firebase-functions-hash'],before.labels['firebase-functions-hash'],name);
 const parser=name.startsWith('processDataset');
 const a=before.serviceConfig.environmentVariables||{},b=after.serviceConfig.environmentVariables||{};
 for(const key of new Set([...Object.keys(a),...Object.keys(b)])){
   if(!parser && managed.test(key))continue;
   if(a[key]!==b[key])throw new Error(name+' configuration drift: '+key);
 }
 const traffic=run.status.traffic.filter(x=>Number(x.percent)>0);assert.equal(traffic.length,1,name);assert.equal(Number(traffic[0].percent),100,name);assert.equal(traffic[0].revisionName,after.serviceConfig.revision,name);
 rows.push({name,state:after.state,revision:after.serviceConfig.revision,hash:after.labels['firebase-functions-hash'],trafficPercent:100,configurationPreserved:true});
}
assert.equal(new Set(rows.slice(0,3).map(x=>x.hash)).size,1);
const result={verifiedAt:new Date().toISOString(),runtimeCommit:'42f5330',project:'gathr-migrated',rows};
await fs.writeFile(path.join(dir,parserOnly?'parser-serving-verified.json':'serving-verified.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
