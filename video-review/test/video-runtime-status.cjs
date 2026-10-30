const auth=require('C:/Users/craig/.codex/worktrees/luna-accounting-release/gathr-apps-script/functions/artifacts/ocr-caption-fooddrive-oct18/tools/normal-auth.cjs');
(async()=>{
 await auth.signIn();const name=process.argv[2]||'cleanupPublishedListingVideos';if(!['cleanupPublishedListingVideos','publishListingVideos','reviewListingVideos'].includes(name))throw Error('Invalid scope');
 const logs=await auth.request('https://logging.googleapis.com/v2/entries:list','POST',{resourceNames:['projects/gathr-migrated'],filter:`resource.type="cloud_run_revision" AND resource.labels.service_name="${name.toLowerCase()}"`,orderBy:'timestamp desc',pageSize:12});
 console.log(JSON.stringify({entries:logs.entries?.map(e=>({at:e.timestamp,severity:e.severity,text:e.textPayload,data:e.jsonPayload,status:e.httpRequest?.status}))}));
 const job=await auth.request('https://cloudscheduler.googleapis.com/v1/projects/gathr-migrated/locations/northamerica-northeast1/jobs/firebase-schedule-'+name+'-northamerica-northeast1');
 console.log(JSON.stringify({job:job.name,state:job.state,status:job.status,lastAttemptTime:job.lastAttemptTime,scheduleTime:job.scheduleTime,oidcServiceAccount:job.httpTarget?.oidcToken?.serviceAccountEmail}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
