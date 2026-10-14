// Independent readback only. Raw function descriptions remain local/private.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../artifacts/recurring-series-hardening-oct14');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8').replace(/^\uFEFF/,''));
const rows=['processDataset','processDatasetResume','processDatasetSelectedRows'].map(name=>{
 const before=read(name+'-predeploy.json'),after=read(name+'-after.json'),run=read(name+'-traffic-after.json');
 assert.equal(after.state,'ACTIVE',name);assert.equal(after.serviceConfig.allTrafficOnLatestRevision,true,name);
 assert.notEqual(before.serviceConfig.revision,after.serviceConfig.revision,name);
 assert.notEqual(before.labels['firebase-functions-hash'],after.labels['firebase-functions-hash'],name);
 const a=before.serviceConfig.environmentVariables||{},b=after.serviceConfig.environmentVariables||{};
 for(const key of new Set([...Object.keys(a),...Object.keys(b)]))if(a[key]!==b[key])throw Error(name+': environment drift in '+key);
 const traffic=run.status.traffic.filter(x=>Number(x.percent)>0);
 assert.equal(traffic.length,1,name);assert.equal(traffic[0].revisionName,after.serviceConfig.revision,name);assert.equal(Number(traffic[0].percent),100,name);
 return {name,state:after.state,revision:after.serviceConfig.revision,hash:after.labels['firebase-functions-hash'],trafficPercent:100,allEnvironmentUnchanged:true};
});
assert.equal(new Set(rows.map(x=>x.hash)).size,1);
const result={verifiedAt:new Date().toISOString(),project:'gathr-migrated',codeCommit:'e026d19',rows};
fs.writeFileSync(path.join(root,'serving-verified.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
