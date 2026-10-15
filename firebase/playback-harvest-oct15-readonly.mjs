// Saved-plan playback only. No API/model calls or database writes.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
import {venuePath,sourceId,sourcePath,keepers,retired,eventPath,storedIdentity,dates} from './harvest-oct15-spec.mjs';
assert.equal(process.argv.length,3);const planPath=path.resolve(process.argv[2]),plan=JSON.parse(await fs.readFile(planPath,'utf8'));
const before=JSON.parse(await fs.readFile(plan.backupPath,'utf8')),docs=new Map(before.documents.map(d=>[d.path,d.data]));
const release=path.resolve(import.meta.dirname,'../../../arts-mixer-release/gathr-apps-script/functions/lib');
// Resolve the explicitly selected isolated release, never the coordinator's shadow build.
const {buildExpandedEventStoredUniqueId,previewDuplicateMerge}=await import(pathToFileURL(path.join(release,'processing/rowProcessor.js')));
const {classifyReviewedOccurrenceRetirement}=await import(pathToFileURL(path.join(release,'services/reviewedOccurrenceRetirement.js')));
const {checkDuplicate}=await import(pathToFileURL(path.join(release,'services/firestoreService.js')));
const policy=plan.changes.find(c=>c.path===venuePath).patch.reviewedOccurrenceRetirements;
const venue={id:venuePath.split('/')[1],...docs.get(venuePath),reviewedOccurrenceRetirements:policy};
const canonicals=plan.changes.filter(c=>c.kind==='create'||keepers.some(id=>c.path===eventPath(id)));
assert.deepEqual(canonicals.map(c=>(c.payload||c.patch).startDate),dates);
for(const c of canonicals){
 const existing=c.kind==='create'?c.payload:{...docs.get(c.path),...c.patch};
 assert.equal(classifyReviewedOccurrenceRetirement(existing,venue).kind,'none');
 if(c.kind==='create')assert.equal(existing.uniqueId,buildExpandedEventStoredUniqueId({row:{uniqueId:sourceId},eventName:existing.eventName,startDate:existing.startDate,endDate:existing.endDate,startTime:existing.startTime,endTime:existing.endTime,venueName:venue.name,additionalLocation:''}));
 const incoming={...existing,startTime:'',endTime:'',timeFlags:{start:{source:'none',evidence:''},end:{source:'none',evidence:'',toClose:false}}};
 const merged={...existing,...previewDuplicateMerge({existingEvent:existing,incomingEvent:incoming,venue}).updates};
 assert.equal(merged.startTime,'17:00');assert.equal(merged.endTime,'21:30');assert.equal(merged.startDate,existing.startDate);assert.equal(merged.imageUrl,existing.imageUrl);
}
for(const [id,uid] of retired){
 const old=docs.get(eventPath(id));assert.equal(old.uniqueId,uid);
 const reconstructed=buildExpandedEventStoredUniqueId({row:{uniqueId:uid.split('_')[0]},eventName:old.eventName,startDate:old.startDate,endDate:old.endDate,startTime:old.startTime,endTime:old.endTime,venueName:old.establishment,additionalLocation:old.additionalLocation});
 assert.equal(reconstructed,storedIdentity(uid.split('_')[0],old));assert(policy.retiredUniqueIds.includes(reconstructed));
}
for(const uniqueId of policy.retiredUniqueIds){assert.deepEqual(await checkDuplicate({uniqueId,venueId:venue.id},venue.id,[],venue),{isDuplicate:true});}
const untouched=before.siblings.filter(d=>!retired.some(([id])=>d.path===eventPath(id))&&!keepers.some(id=>d.path===eventPath(id)));
assert.equal(untouched.length,3);for(const d of untouched)assert.equal(classifyReviewedOccurrenceRetirement(d.data,venue).kind,'none');
for(const root of policy.sourceUniqueIds)assert.equal(classifyReviewedOccurrenceRetirement({uniqueId:root+'_different_activity',venueId:venue.id},venue).kind,'none');
const source=docs.get(sourcePath);assert.equal(source.stages[0].output.stageArtifacts.stage3Items.length,10);
const report={verifiedAt:new Date().toISOString(),planPath,canonicalInventory:12,currentIdentityCreatesVerified:9,legacyRetiredParents:5,exactLegacyAndReconstructedRetiredIdentities:policy.retiredUniqueIds.length,
 actualDuplicateServiceSuppressions:policy.retiredUniqueIds.length,mutableKeeperSelected:false,canonicalFutureMergeClockChecks:12,otherVenueActivitiesPreserved:3,sameSourceOtherActivitiesPreserved:policy.sourceUniqueIds.length,
 networkCalls:0,modelCalls:0,liveWrites:0,limitation:'Exact reviewed identities only; changed occurrence facts, new source posts and future enrichment remain subject to normal resolution and audit.'};
await fs.writeFile(path.join(path.dirname(planPath),'offline-playback.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
