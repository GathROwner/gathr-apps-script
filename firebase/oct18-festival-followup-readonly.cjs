// Read exact function/service baselines through the existing Firebase CLI login.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const cli='C:/Users/craig/AppData/Roaming/npm/node_modules/firebase-tools/lib/';
const auth=require(cli+'auth.js'),requireAuth=require(cli+'requireAuth.js').requireAuth;
const functions=require(cli+'gcp/cloudfunctionsv2.js'),run=require(cli+'gcp/run.js'),api=require(cli+'apiv2.js');
const out=path.resolve(__dirname,'../functions/artifacts/oct18-audit-fixes/festival-followup-release');
const names=['scheduledFestivalLinker'];
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(stable(x))).digest('hex');
const mode=process.argv[2];if(!['before','after','download','check'].includes(mode))throw Error('Expected before/after/download/check');
(async()=>{
 fs.mkdirSync(out,{recursive:true});const account=auth.getGlobalDefaultAccount();if(!account)throw Error('Firebase login unavailable');await requireAuth({project:'gathr-migrated',...account,nonInteractive:true});
 if(mode==='check'){
  const before=JSON.parse(fs.readFileSync(path.join(out,'before.json'))),chosen=(process.argv[3]||names.join(',')).split(',');
  for(const name of chosen){if(!names.includes(name))throw Error('Unknown target');const row=before.rows.find(x=>x.name===name),fn=await functions.getFunction('gathr-migrated',row.region,name);if(fn.state!=='ACTIVE'||fn.serviceConfig.revision!==row.revision||fn.labels['firebase-functions-hash']!==row.sourceHash||JSON.stringify(fn.buildConfig.source.storageSource)!==JSON.stringify(row.source))throw Error('Serving baseline drift '+name);}
  console.log(JSON.stringify({status:'baseline_unchanged',functions:chosen,at:new Date().toISOString()}));return;
 }
 if(mode==='download'){
  const before=JSON.parse(fs.readFileSync(path.join(out,'before.json')));const chosen=names;
  const token=await api.getAccessToken();
  for(const name of chosen){const row=before.rows.find(x=>x.name===name),s=row.source;const current=await functions.getFunction('gathr-migrated',row.region,name);if(current.labels['firebase-functions-hash']!==row.sourceHash||JSON.stringify(current.buildConfig.source.storageSource)!==JSON.stringify(s))throw Error('Serving source drift '+name);
   const url='https://storage.googleapis.com/storage/v1/b/'+encodeURIComponent(s.bucket)+'/o/'+encodeURIComponent(s.object)+'?alt=media&generation='+encodeURIComponent(s.generation);const r=await fetch(url,{headers:{Authorization:'Bearer '+token}});if(!r.ok)throw Error('Source read failed '+r.status+' '+name);const bytes=Buffer.from(await r.arrayBuffer());fs.writeFileSync(path.join(out,name+'-serving.zip'),bytes);console.log(JSON.stringify({name,generation:s.generation,archiveSha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length}));
  }return;
 }
 const rows=await Promise.all(names.map(async name=>{const region=['processDataset','finalizeCityLevelEventReviewTrigger','processSharedEventPublicCandidates'].includes(name)?'northamerica-northeast2':'northamerica-northeast1';const fn=await functions.getFunction('gathr-migrated',region,name);const service=await run.getService(fn.serviceConfig.service);fs.writeFileSync(path.join(out,mode+'-'+name+'-function.json'),JSON.stringify(fn,null,2));fs.writeFileSync(path.join(out,mode+'-'+name+'-service.json'),JSON.stringify(service,null,2));const config={...fn.serviceConfig};for(const k of ['revision','uri','service','allTrafficOnLatestRevision'])delete config[k];const env=config.environmentVariables||{};const automatic=new Set(['K_SERVICE','K_REVISION','K_CONFIGURATION','FUNCTION_TARGET','FUNCTION_SIGNATURE_TYPE','FUNCTION_NAME','FUNCTION_MEMORY_MB','FUNCTION_TIMEOUT_SEC','FUNCTION_IDENTITY','FUNCTION_REGION','FIREBASE_CONFIG','CLOUD_RUNTIME_CONFIG','ENTRY_POINT','GCP_PROJECT','GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','FUNCTION_TRIGGER_TYPE','EVENTARC_CLOUD_EVENT_SOURCE','PORT']);config.environmentVariables=Object.fromEntries(Object.entries(env).filter(([k])=>!automatic.has(k)));return {name,region,state:fn.state,revision:fn.serviceConfig.revision,sourceHash:fn.labels['firebase-functions-hash'],source:fn.buildConfig.source.storageSource,traffic:service.status?.traffic,latestReadyRevision:service.status?.latestReadyRevisionName,configurationHash:hash(config),environmentHash:hash(config.environmentVariables),secretsHash:hash(fn.serviceConfig.secretEnvironmentVariables||[])};}));
 const value={at:new Date().toISOString(),rows};fs.writeFileSync(path.join(out,mode+'.json'),JSON.stringify(value,null,2));console.log(JSON.stringify(rows));
})().catch(e=>{console.error(e.message);process.exitCode=1});
