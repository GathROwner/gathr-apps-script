const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),cli='C:/Users/craig/AppData/Roaming/npm/node_modules/firebase-tools/lib/';
(async()=>{
 const publishing=JSON.parse(fs.readFileSync(path.join(root,'functions/artifacts/oct18-audit-fixes/release/verified.json'))).rows.filter(r=>!['processDataset','processDatasetResume','processDatasetSelectedRows'].includes(r.name));
 const worker=JSON.parse(fs.readFileSync(path.join(root,'functions/artifacts/oct18-audit-fixes/festival-followup-release/verified.json'))).rows;
 const auth=require(cli+'auth.js');await require(cli+'requireAuth.js').requireAuth({project:'gathr-migrated',...auth.getGlobalDefaultAccount(),nonInteractive:true});
 const rows=await Promise.all([...publishing,...worker].map(async old=>{
  const fn=await require(cli+'gcp/cloudfunctionsv2.js').getFunction('gathr-migrated',old.region,old.name),service=await require(cli+'gcp/run.js').getService(fn.serviceConfig.service);
  assert.equal(fn.state,'ACTIVE');assert.equal(fn.serviceConfig.revision,old.revision);assert.equal(fn.labels['firebase-functions-hash'],old.sourceHash);assert.equal(service.status.latestReadyRevisionName,old.revision);assert.equal(service.status.traffic.length,1);assert.equal(service.status.traffic[0].percent,100);assert.equal(service.status.traffic[0].revisionName,old.revision);assert.equal(service.status.traffic[0].latestRevision,true);
  return {name:old.name,state:fn.state,revision:old.revision,sourceHash:old.sourceHash,latestTraffic:100};
 }));
 fs.writeFileSync(path.join(root,'functions/artifacts/island-open-oct18-release/untouched-functions-verified.json'),JSON.stringify({status:'verified_unchanged',at:new Date().toISOString(),rows},null,2));console.log(JSON.stringify({status:'verified_unchanged',functions:rows.map(r=>r.name)}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
