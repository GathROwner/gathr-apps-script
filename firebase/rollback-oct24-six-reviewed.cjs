// Rollback preview only. Never commits and rejects --apply.
const assert=require('node:assert/strict'),path=require('node:path'),c=require('./oct24-six-record-contract.cjs'),a=c.a;
(async()=>{
 assert(!process.argv.includes('--apply'),'Rollback execution is not implemented');
 const post=process.argv.includes('--after-apply'),plan=c.load('repair-plan'),capture=c.load('repair-preflight'),digest=c.sha(path.join(c.root,'repair-plan.json')),payload=c.payload(plan,capture,digest),writes=[],versions={};let feed=capture.feed;
 if(post){assert(c.load('repair-apply-result').status.startsWith('applied'));await a.signIn();await c.serving();const idle=await c.idle();c.equal(idle,capture.idle,'Checkpoint drift');feed=await a.get('runtime_metadata/event_feed');c.equal(feed.fields,payload.expectedFeedFields,'Feed drift');}
 for(const action of plan.actions){const d=capture.documents[action.path],deleted=action.action==='archive_and_delete';let current=null;
  if(post){current=await a.get(action.path);if(deleted)assert.equal(current,null);else {assert(current);c.equal(current.fields,payload.expectedAfter[action.path],'Postcommit target drift');}}
  writes.push({update:{name:d.name,fields:d.fields},currentDocument:deleted?{exists:false}:{updateTime:post?current.updateTime:'POST_COMMIT_UPDATE_TIME_REQUIRED'}});versions[action.path]=post?current?.updateTime||null:'not_applied';
 }
 const afterVersion=plan.expectedFeedVersion+1;writes.push({update:{name:feed.name,fields:a.fields({version:afterVersion+1,updatedAt:new Date()})},updateMask:{fieldPaths:['updatedAt','version']},currentDocument:{updateTime:post?feed.updateTime:'POST_COMMIT_UPDATE_TIME_REQUIRED'}});
 c.validateWriteNames(writes,[...c.TARGETS,'runtime_metadata/event_feed']);assert.equal(writes.length,7);assert.equal(new Set(writes.map(x=>x.update.name)).size,7);assert(writes.every(x=>!x.delete));
 if(post){for(const[p,d]of Object.entries({...capture.protectedDocuments,...capture.venues}))c.equal(await a.get(p),d);for(const[p,fields]of Object.entries(payload.archiveSnapshots)){const d=await a.get(p);assert(d);c.equal(d.fields,fields);}}
 const report={atUTC:new Date().toISOString(),status:post?'rollback_live_precondition_dry_run_pass':'rollback_shape_verified_before_apply',planSHA256:digest,applied:false,writes:7,restoreEvents:6,archivesRetained:7,feed:[afterVersion,afterVersion+1],postCommitVersions:versions,preApplyPlaceholders:!post,limits:['Restores all stored typed event fields. Recreated deleted documents receive new Firestore server createTime/updateTime; original metadata remains recorded in archives.','Pre-apply shape is not executable until actual postcommit versions are captured.'],body:{writes:c.canonical(writes)}};
 c.save(post?'repair-rollback-dry-run':'repair-rollback-shape',report);console.log(JSON.stringify({status:report.status,writes:7,restoreEvents:6,archivesRetained:7,feed:report.feed,applied:false}));
})().catch(e=>{console.error('Oct24 rollback preparation stopped: '+e.message);process.exitCode=1;});
