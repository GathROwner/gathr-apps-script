// Print metadata/counts only. Never print environment values or credentials.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=path.resolve('..'),dir=path.resolve('artifacts/oct16-five-followups');
const envFile=p=>Object.fromEntries(fs.readFileSync(p,'utf8').split(/\r?\n/).flatMap(line=>{const m=line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);if(!m)return[];let v=m[2].trim();if(v.startsWith('"')&&v.endsWith('"'))v=JSON.parse(v);else if(v.startsWith("'")&&v.endsWith("'"))v=v.slice(1,-1);return [[m[1],v]];}));
const local=envFile('.env'),results=[];
for(const [name,revision,service] of [['processDataset','processdataset-00496-deb','processdataset'],['processDatasetResume','processdatasetresume-00460-cat','processdatasetresume'],['processDatasetSelectedRows','processdatasetselectedrows-00452-jov','processdatasetselectedrows']]){
 const f=JSON.parse(fs.readFileSync(path.join(dir,'runtime-'+name+'.json'))),s=JSON.parse(fs.readFileSync(path.join(dir,'service-'+service+'.json')));
 assert.equal(f.state,'ACTIVE');assert.equal(f.serviceConfig.revision,revision);assert.equal(f.labels['firebase-functions-hash'],'10b3d3af4e8c9e4f2d9883b4194298a25e48d5c2');assert.equal(s.status.latestReadyRevisionName,revision);assert.equal(s.status.latestCreatedRevisionName,revision);
 assert.equal(s.status.traffic.length,1);assert.equal(s.status.traffic[0].revisionName,revision);assert.equal(s.status.traffic[0].percent,100);
 const mismatch=Object.keys(local).filter(k=>local[k]!==f.serviceConfig.environmentVariables[k]);assert.deepEqual(mismatch,[],'Local/serving environment mismatch key names: '+mismatch.join(','));
 results.push({name,revision,sourceHash:f.labels['firebase-functions-hash'],active:true,latestTraffic:100,localEnvironmentMatches:true,localUserEnvCount:Object.keys(local).length,secretKeys:(f.serviceConfig.secretEnvironmentVariables||[]).map(x=>x.key)});
}
const report={checkedAt:new Date().toISOString(),results,liveWrites:0};fs.writeFileSync(path.join(dir,'parser-preflight-verified.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
