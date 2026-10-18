const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'functions/artifacts/oct18-audit-fixes/festival-release');
const cli='C:/Users/craig/AppData/Roaming/npm/node_modules/firebase-tools/lib/';
const mode=process.argv[2];assert(['before','after','run'].includes(mode));
(async()=>{const auth=require(cli+'auth.js');await require(cli+'requireAuth.js').requireAuth({project:'gathr-migrated',...auth.getGlobalDefaultAccount(),nonInteractive:true});const token=await require(cli+'apiv2.js').getAccessToken();
 const name='projects/gathr-migrated/locations/northamerica-northeast1/jobs/firebase-schedule-scheduledFestivalLinker-northamerica-northeast1',url='https://cloudscheduler.googleapis.com/v1/'+name;
 if(mode==='run'){
  const verified=JSON.parse(fs.readFileSync(path.join(out,'verified.json')));assert.equal(verified.status,'verified');
  const idle=cp.spawnSync(process.execPath,[path.join(root,'firebase/assert-oct18-idle.mjs')],{encoding:'utf8',env:{...process.env,ANCHOR_CREDENTIAL_PATH:'C:/Users/craig/Dev/gathr-apps-script/firebase/service-account.json'}});assert.equal(idle.status,0,'Parser completion/idle guard failed');
  const report=JSON.parse(fs.readFileSync(path.join(root,'functions/artifacts/oct18-audit-fixes/festival-proposed-inventory.json')));assert.equal(report.report.paidSources,0);assert.equal(report.report.eventWrites,0);assert.deepEqual(report.report.reports.flatMap(r=>r.addedEventIds).sort(),['6jnJDvVa88NAjhSxFTc5','DVKFvUQEAMC6rzVcsLDz','ZQMZNY0JUq1RPfqLhmDu','vuKXYSXmuJ7h04QXOarO']);
  const r=await fetch(url+':run',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'});assert(r.ok,'Scheduler invocation failed '+r.status);fs.writeFileSync(path.join(out,'authorized-single-invocation.json'),JSON.stringify({at:new Date().toISOString(),status:r.status,job:name,expectedAdds:4,sourcePaidCalls:0},null,2));console.log('One existing scheduler invocation requested; publication completion still requires live verification.');return;
 }
 const r=await fetch(url,{headers:{Authorization:'Bearer '+token}});assert(r.ok,'Scheduler read failed '+r.status);const job=await r.json();fs.writeFileSync(path.join(out,mode+'-scheduler.json'),JSON.stringify(job,null,2));
 if(mode==='after'){const before=JSON.parse(fs.readFileSync(path.join(out,'before-scheduler.json')));for(const k of ['schedule','timeZone','attemptDeadline','retryConfig','httpTarget','state'])assert.deepEqual(job[k],before[k],'Scheduler configuration changed '+k);}
 console.log(JSON.stringify({mode,schedule:job.schedule,timeZone:job.timeZone,state:job.state,lastAttemptTime:job.lastAttemptTime,configurationPreserved:mode==='after'}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
