// Read-only, redacted function/traffic verification for the narrow cache release.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {exec}=require('node:child_process'),{promisify}=require('node:util');
const run=promisify(exec);
const phase=process.argv[2];assert(['before','after'].includes(phase));
const services=[['processDataset','northamerica-northeast2'],['processDatasetResume','northamerica-northeast1'],['processDatasetSelectedRows','northamerica-northeast1']];
const dir='artifacts/luna-stage5-cache-release';fs.mkdirSync(dir,{recursive:true});
(async()=>{
  const rows=await Promise.all(services.map(async([name,region])=>{
    const [f,r]=await Promise.all([
      run(`gcloud functions describe ${name} --gen2 --region=${region} --project=gathr-migrated --format=json`),
      run(`gcloud run services describe ${name.toLowerCase()} --region=${region} --project=gathr-migrated --format=json`),
    ]);
    const fn=JSON.parse(f.stdout),service=JSON.parse(r.stdout);
    const record={name,region,state:fn.state,hash:fn.labels['firebase-functions-hash'],revision:fn.serviceConfig.revision,allLatest:fn.serviceConfig.allTrafficOnLatestRevision,
      env:Object.fromEntries(Object.entries(fn.serviceConfig.environmentVariables).filter(([key])=>/^(LUNA_|STAGE[1-5]_|ENABLE_STAGE2_)/.test(key))),traffic:service.status.traffic};
    assert.equal(record.state,'ACTIVE');assert.equal(record.allLatest,true);
    assert.equal(record.traffic.filter(t=>t.percent>0).length,1);
    assert(record.traffic.some(t=>t.revisionName===record.revision&&t.percent===100));
    return record;
  }));
  assert.equal(new Set(rows.map(r=>r.hash)).size,1);
  if(phase==='before')assert.equal(rows[0].hash,'c6f04a6761d3129fc2b0399f3a77d84ad9a9afd7');
  else{
    const before=JSON.parse(fs.readFileSync(dir+'/serving-before.json')).rows;
    for(const row of rows){const prev=before.find(r=>r.name===row.name);assert.deepEqual(row.env,prev.env);assert.notEqual(row.hash,prev.hash);assert.notEqual(row.revision,prev.revision);}
  }
  fs.writeFileSync(dir+'/serving-'+phase+'.json',JSON.stringify({checkedAt:new Date().toISOString(),rows},null,2));
  console.log(JSON.stringify(rows.map(({name,state,hash,revision})=>({name,state,hash,revision}))));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
