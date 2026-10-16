// Actual worker, actual saved source/gallery and fresh captured canonical data.
// Edition/review and completed-run envelope exist ONLY in this in-memory DB.
// Not a production claim, approval, API call, public write or parser replay.
import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {Database} from '../functions/scripts/festival-worker-test-db.mjs';
import {festivalEvidenceEditionFingerprint,festivalEvidenceSourceFingerprint,FESTIVAL_EVIDENCE_POLICY} from '../functions/scripts/festival-evidence-extractor.mjs';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {restoreFestivalAreaRefresh}=require('../functions/lib/services/festivalAreaRefresh.js');
const {runFestivalLinkWorker}=require('../functions/lib/services/festivalLinkWorker.js'),{reviewedFestivalEdition}=require('../functions/lib/services/festivalEditionRegistry.js'),{festivalShadowFingerprint}=require('../functions/lib/services/festivalLinkShadowJob.js');
const dir='functions/artifacts/pumpkin-overview-oct16',inventory=JSON.parse(await fs.readFile('functions/artifacts/festival-week-oct15/inventory.json','utf8'));
const source=inventory.sources.find(s=>s.uniqueId==='1539985468169427');assert(source);
const trial=JSON.parse(await fs.readFile(dir+'/parade-reverified-capture.json','utf8'));
const recovery=JSON.parse(await fs.readFile('functions/artifacts/festival-context-oct15/fresh-pumpkin/1539985468169427.json','utf8')).sourceRecovery;
const live=JSON.parse(await fs.readFile(dir+'/live-readonly.json','utf8'));
assert.equal(source.inputText,trial.capture.caption);assert.equal(source.rowMeta.mediaUrls.length,2);
assert.deepEqual(recovery.versions.map(v=>v.originalUrl),source.rowMeta.mediaUrls);assert.deepEqual(recovery.imageUrls,trial.capture.imageUrls);
const originalSource={caption:source.inputText,imageUrls:source.rowMeta.mediaUrls};
const rootId='local_pumpkin_2026',reviewId='local_pumpkin_review_2026',fileId=source.fileId;
const areaData={version:1,status:'partial',sourceUrl:source.facebookUrl,locations:live.documents.filter(d=>!d.path.includes('/events/')).map(d=>({id:'venue_'+d.path.split('/')[1],venueId:d.path.split('/')[1],label:d.path.endsWith('2ei5OViB21wZRLJsXH1Z')?'J.-Henri-Blanchard Library, Centre Belle-Alliance':'Centre Belle-Alliance',certainty:'confirmed',coordinates:{latitude:d.data.latitude,longitude:d.data.longitude},linkedEventIds:[]}))};
const umbrella={eventName:'Summerside Pumpkin Festival 2026',locationScope:'area',cityLevelReviewId:reviewId,startDate:'2026-10-15',endDate:'2026-10-31',areaData};
const review={status:'published',publishedEventPath:'events/'+rootId,areaEventLinks:[],finalization:{action:'approve_publish',manual:{areaData,programmeSources:[{sourceId:source.uniqueId,sourceUrl:source.facebookUrl,sourceFingerprint:festivalEvidenceSourceFingerprint(originalSource)}]}}};
const edition=reviewedFestivalEdition({path:'events/'+rootId,data:umbrella},{path:'city_level_event_reviews/'+reviewId,data:review},'2026-10-16');assert(edition);assert.equal(edition.occurrenceAuthorities.length,0);assert.equal(festivalEvidenceEditionFingerprint(edition),trial.result.editionFingerprint,'Never re-label a capture for another edition');
const key=festivalShadowFingerprint({source:festivalEvidenceSourceFingerprint(originalSource),edition:festivalEvidenceEditionFingerprint(edition),policy:FESTIVAL_EVIDENCE_POLICY});
const cache={captureKey:key,sourceId:source.uniqueId,result:trial.result,sourceRecovery:{...recovery,version:1,originalSourceFingerprint:festivalEvidenceSourceFingerprint(originalSource)}};
await fs.writeFile(dir+'/draft-worker-inputs.json',JSON.stringify({proposedOnly:true,rootId,reviewId,fileId,umbrella,review,key,cache},null,2));
const entries=[...live.documents.map(d=>[d.path,d.data]),['events/'+rootId,umbrella],['city_level_event_reviews/'+reviewId,review],['parse_snapshots/replay_source',source],
 ['processing_locks/'+fileId,{fileId,runId:'offline_envelope',status:'completed',startedAt:{toMillis:()=>0}}],['processed_datasets/'+fileId,{fileId,processedAt:{toMillis:()=>100000}}],['batch_states/'+fileId+'_1',{fileId,runId:'offline_envelope',status:'completed',batchNumber:1,currentRowIndex:1,totalRows:1}],['festival_link_captures/'+key,cache],['runtime_metadata/event_feed',{version:1}]];
const options={mode:'publish',fileId,asOf:'2026-10-16'},db=new Database(entries);
const first=await runFestivalLinkWorker(db,options);await fs.writeFile(dir+'/actual-worker-first-diagnostic.json',JSON.stringify(first,null,2));assert.equal(first.paidSources,0);assert.equal(first.eventWrites,1);const report=first.reports[0];assert.equal(report.status,'ready');assert.equal(report.addedEventIds.length,13);assert.equal(report.gaps.length,0);assert.equal(report.unconfirmedItems.length,1);
const published=db.values.get('events/'+rootId).data,ids=published.areaData.locations.flatMap(p=>p.linkedEventIds||[]);assert.equal(new Set(ids).size,13);
const refresh=await restoreFestivalAreaRefresh({eventPath:'events/'+rootId,eventName:umbrella.eventName,startDate:umbrella.startDate,endDate:umbrella.endDate,approvedArea:umbrella.areaData,previousArea:published.areaData,ownership:db.values.get('festival_link_publications/'+rootId).data,read:async p=>db.values.get(p)?.data});assert.deepEqual(refresh.areaData,published.areaData,'Parser refresh lost machine-generated schedule');
assert(ids.includes('oct14_repair_festival_20261030_11'),'Reverified printed parade window must link');assert(!db.writes.some(p=>p.startsWith('venues/')||p.startsWith('city_level_event_reviews/')));
const repeat=await runFestivalLinkWorker(db,options);assert.equal(repeat.eventWrites,0);assert.equal(db.values.get('runtime_metadata/event_feed').data.version,2);
const missing=new Database(entries.filter(([p])=>!p.endsWith('/oct14_repair_festival_20261031_13')));const early=await runFestivalLinkWorker(missing,options);assert.equal(early.reports[0].addedEventIds.length,12);missing.values.set(live.documents[0].path,{data:live.documents[0].data,version:++missing.sequence});const arrived=await runFestivalLinkWorker(missing,options);assert.deepEqual(arrived.reports[0].addedEventIds,['oct14_repair_festival_20261031_13']);
const result={checkedAt:new Date().toISOString(),sourceId:source.uniqueId,originalDataset:fileId,mode:'actual_worker_in_memory_only',proposedEdition:true,syntheticCompletionEnvelope:true,manualChildLinksSeeded:0,sourceGalleryIdentityPreserved:true,measuredResolutionReceipt:true,simulatedPublicAdditions:report.addedEventIds,confirmedActivitiesLinked:13,refreshLinksRetained:13,explicitUnconfirmedItems:report.unconfirmedItems,repeatAdditions:0,laterArrivalAdditions:arrived.reports[0].addedEventIds,childrenModified:0,paidCalls:0,liveWrites:0,firstWorkerResult:first};
await fs.writeFile(dir+'/actual-worker-offline.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,firstWorkerResult:undefined}));
