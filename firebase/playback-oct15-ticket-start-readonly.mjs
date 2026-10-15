// Original saved source/current ticket response through the candidate; offline only.
import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const dir=path.resolve(import.meta.dirname,'../functions/artifacts/oct15-sequential-repairs/next-batch');
const source=JSON.parse(await fs.readFile(path.join(dir,'readonly-capture.json'),'utf8')).sources.find(s=>s.data.rowIndex===269).data;
const response=JSON.parse(await fs.readFile(path.join(dir,'trailside-current-api-response.txt'),'utf8'));
const lib=pathToFileURL('C:/Users/craig/.codex/worktrees/arts-mixer-release/gathr-apps-script/functions/lib/parsing/');
const [{enrichEventsFromVenueWebsite},{reconcileSourceItemEvidence},{DEFAULT_PARSING_CONFIG}]=await Promise.all(['websiteDetailEnricher.js','sourceItemEvidence.js','types.js'].map(p=>import(new URL(p,lib).href)));
const [{buildExpandedEventStoredUniqueId,previewDuplicateMerge},{isHighConfidenceSameOccurrenceDuplicate}]=await Promise.all([
  import(new URL('../processing/rowProcessor.js',lib).href),import(new URL('../utils/similarity.js',lib).href)]);
const plan=JSON.parse(await fs.readFile(path.resolve(import.meta.dirname,'artifacts/oct15-reviewed-batch/plan-2026-10-15T21-54-55-119Z.json'),'utf8'));
const backup=JSON.parse(await fs.readFile(plan.backupPath,'utf8')),candidate=plan.changes.find(c=>c.kind==='create').payload;
const stable=buildExpandedEventStoredUniqueId({row:{uniqueId:source.uniqueId},eventName:candidate.eventName,startDate:candidate.startDate,endDate:candidate.endDate,startTime:candidate.startTime,endTime:candidate.endTime,venueName:candidate.establishment,additionalLocation:''});
assert.equal(stable,candidate.uniqueId);
const incoming={...candidate,uniqueId:'fixture_secondary_source_identity',name:'Daniel James McFadyen',eventName:'Daniel James McFadyen',sourceUniqueIds:['fixture_secondary_source']};
assert(isHighConfidenceSameOccurrenceDuplicate(incoming,candidate));
const merged={...candidate,...previewDuplicateMerge({existingEvent:candidate,incomingEvent:incoming,venue:backup.documents.find(d=>d.path==='venues/slug_trailsidemusichall').data}).updates};
for(const k of ['startDate','startTime','endTime','price','ticketLink','imageUrl'])assert.deepEqual(merged[k],candidate[k],'Future merge preserves '+k);
const original=globalThis.fetch,requested=[];
try{
 globalThis.fetch=async input=>{const u=new URL(String(input));assert(['trailside.ca','www.trailside.ca'].includes(u.hostname),'No external network in playback');requested.push(u.href);
 if(u.pathname==='/')return new Response('<script src="/static/js/main.js"></script>',{headers:{'content-type':'text/html'}});
 if(u.pathname==='/static/js/main.js')return new Response('const api=axios.create({baseURL:"/api"});api.get("/events/locarius")',{headers:{'content-type':'application/javascript'}});
 if(u.pathname==='/api/events/locarius')return new Response(JSON.stringify(response),{headers:{'content-type':'application/json'}});throw Error('Unexpected offline fetch');};
 const items=source.stages[0].output.stageArtifacts.stage3Items;
 assert.equal(items.length,1);assert.equal(items[0]._sourceTimeConstraint.reason,'doors_without_showtime');
 const enriched=await enrichEventsFromVenueWebsite(items,source.inputText,'','2026-10-15T12:00:00Z',{name:'Trailside Music Hall',website:'https://trailside.ca/'},DEFAULT_PARSING_CONFIG);
 const final=reconcileSourceItemEvidence(enriched.items,source.inputText);assert.equal(final.length,1);assert.equal(final[0].startTime,'20:00');assert.equal(final[0].endTime,'');assert.equal(final[0]._sourceTimeConstraint,undefined);
 const result={checkedAt:new Date().toISOString(),sourceId:source.uniqueId,row:269,sourceItems:1,outputItems:1,startTime:'20:00',endTimeUnknown:true,doorsHoldCleared:true,stableProductionUniqueIdMatches:true,futureDifferentSourceMergePreservesFacts:true,offlineRequests:requested,paidCalls:0,liveWrites:0};
 await fs.writeFile(path.join(dir,'actual-source-playback.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{globalThis.fetch=original;}
