// One authorized existing-scheduler invocation; no schedule/configuration mutation.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),base=path.join(root,'functions/artifacts/oct18-audit-fixes'),out=path.join(base,'festival-followup-release');
const cli='C:/Users/craig/AppData/Roaming/npm/node_modules/firebase-tools/lib/';
(async()=>{
 const verified=JSON.parse(fs.readFileSync(path.join(out,'verified.json')));assert.equal(verified.status,'verified');
 const report=JSON.parse(fs.readFileSync(path.join(base,'festival-followup-current-inventory.json')));assert.equal(report.readOnly,true);assert.equal(report.report.paidSources,0);assert.equal(report.report.eventWrites,0);assert.deepEqual(report.report.reports.flatMap(r=>r.addedEventIds),[]);
 const idle=cp.spawnSync(process.execPath,[path.join(root,'firebase/assert-oct18-idle.mjs')],{encoding:'utf8',env:{...process.env,ANCHOR_CREDENTIAL_PATH:'C:/Users/craig/Dev/gathr-apps-script/firebase/service-account.json'}});assert.equal(idle.status,0,'Parser completion/idle guard failed');
 const auth=require(cli+'auth.js');await require(cli+'requireAuth.js').requireAuth({project:'gathr-migrated',...auth.getGlobalDefaultAccount(),nonInteractive:true});
 const live=await require(cli+'gcp/cloudfunctionsv2.js').getFunction('gathr-migrated','northamerica-northeast1','scheduledFestivalLinker');assert.equal(live.state,'ACTIVE');assert.equal(live.serviceConfig.revision,verified.rows[0].revision);assert.equal(live.labels['firebase-functions-hash'],verified.rows[0].sourceHash);
 const token=await require(cli+'apiv2.js').getAccessToken(),name='projects/gathr-migrated/locations/northamerica-northeast1/jobs/firebase-schedule-scheduledFestivalLinker-northamerica-northeast1',url='https://cloudscheduler.googleapis.com/v1/'+name;
 const read=await fetch(url,{headers:{Authorization:'Bearer '+token}});assert(read.ok);const scheduler=await read.json(),before=JSON.parse(fs.readFileSync(path.join(base,'festival-release/before-scheduler.json')));
 for(const k of ['schedule','timeZone','attemptDeadline','retryConfig','httpTarget','state'])assert.deepEqual(scheduler[k],before[k],'Scheduler configuration changed '+k);
 const response=await fetch(url+':run',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'});assert(response.ok,'Scheduler invocation failed '+response.status);
 fs.writeFileSync(path.join(out,'authorized-single-invocation.json'),JSON.stringify({at:new Date().toISOString(),status:response.status,job:name,revision:live.serviceConfig.revision,expectedAdds:0,sourcePaidCalls:0,configurationPreserved:true},null,2));
 console.log('One existing scheduler invocation requested on the verified follow-up revision; live completion verification remains required.');
})().catch(e=>{console.error(e.message);process.exitCode=1});
