// Independent read-only readback; persist only parser settings, never secrets.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const run=promisify(execFile),phase=process.argv[2];assert(['before','after'].includes(phase));
const dir='artifacts/stage4-compact-release';fs.mkdirSync(dir,{recursive:true});
const services=[['processDataset','northamerica-northeast2'],['processDatasetResume','northamerica-northeast1'],['processDatasetSelectedRows','northamerica-northeast1']];
async function cloud(args){const r=await run('gcloud.cmd',args,{shell:true,maxBuffer:4*1024*1024});return JSON.parse(r.stdout);}
(async()=>{
 const rows=await Promise.all(services.map(async([name,region])=>{
  const common=['--region='+region,'--project=gathr-migrated','--format=json'];
  const [f,s]=await Promise.all([cloud(['functions','describe',name,'--gen2',...common]),cloud(['run','services','describe',name.toLowerCase(),...common])]);
  const row={name,region,state:f.state,hash:f.labels['firebase-functions-hash'],revision:f.serviceConfig.revision,allLatest:f.serviceConfig.allTrafficOnLatestRevision,
   env:Object.fromEntries(Object.entries(f.serviceConfig.environmentVariables).filter(([k])=>/^(LUNA_|STAGE[1-5]_|ENABLE_STAGE2_)/.test(k))),traffic:s.status.traffic};
  assert.equal(row.state,'ACTIVE');assert.equal(row.allLatest,true);assert.equal(row.traffic.filter(t=>t.percent>0).length,1);
  assert(row.traffic.some(t=>t.revisionName===row.revision&&t.percent===100));return row;
 }));
 assert.equal(new Set(rows.map(r=>r.hash)).size,1);
 if(phase==='before')assert.equal(rows[0].hash,'0678cc45a38a27c4ad4a04a7f947241106a41eb9');
 else {
  const before=JSON.parse(fs.readFileSync(dir+'/serving-before.json')).rows;
  for(const row of rows){const previous=before.find(p=>p.name===row.name);
   assert.deepEqual(row.env,{...previous.env,STAGE4_COMPACT_VALIDATION_ENABLED:'true'});
   assert.notEqual(row.hash,previous.hash);assert.notEqual(row.revision,previous.revision);}
 }
 fs.writeFileSync(dir+'/serving-'+phase+'.json',JSON.stringify({checkedAt:new Date().toISOString(),rows},null,2));
 console.log(JSON.stringify(rows.map(({env,traffic,...r})=>r)));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
