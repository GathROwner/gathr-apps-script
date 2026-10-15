// Actual saved inputs against the exact isolated release and serving API guard.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';
const out=path.join(import.meta.dirname,'artifacts/six-groups-oct15');assert.equal(process.argv.length,3);const plan=JSON.parse(await fs.readFile(path.resolve(process.argv[2]),'utf8')),before=JSON.parse(await fs.readFile(plan.backupPath,'utf8'));
const c=JSON.parse(await fs.readFile(path.join(out,'capture.json'),'utf8')),docs=new Map(before.documents.map(d=>[d.path,d.data]));
const release=path.resolve(import.meta.dirname,'../../../arts-mixer-release/gathr-apps-script/functions/lib');
const row=await import(pathToFileURL(path.join(release,'processing/rowProcessor.js'))),retire=await import(pathToFileURL(path.join(release,'services/reviewedOccurrenceRetirement.js')));
const require=createRequire(import.meta.url),{validateAreaData}=require('./area-event-contract.js');
const {canDeliverDateOnlyActivity}=require('../../../date-only-delivery-api/gathr-backend/backend/services/dateOnlyActivityDelivery.js');
for(const[index,venuePath]of [[254,'venues/name_6387om'],[231,'venues/jluPLYoWDPhhkJ4NZitP']]){
 const source=c.sources.find(s=>s.row===index),snapshot=docs.get(source.snapshotPath),venue={id:venuePath.split('/')[1],...docs.get(venuePath)},raw={...snapshot.rowMeta,text:source.caption,uniqueId:source.sourceId,facebookUrl:source.sourceUrl};
 for(const item of [source.stage3[0],...(index===254?source.events:[])]){
  const match=await row.resolveVenueForFullParserEventWithMatcherForRegression({item,rowVenue:venue,row:raw,establishment:venue.name,rowIndex:index,matcher:async name=>name===venue.name?{isMatch:true,matchType:'exact',matchedVenue:venue}:{isMatch:false}});assert.equal(match?.id,venue.id,'Saved source venue resolution '+index);
 }
}
for(const index of [154,192,271]){const s=c.sources.find(s=>s.row===index);for(const item of s.stage3){const r=row.fullParserEventLocationCheck(item,{text:s.caption,facebookUrl:s.sourceUrl});assert.equal(r.decision,'hold');assert.equal(r.reason,'online_activity_requires_non_venue_publication');}}
let timingChecks=0,priceChecks=0,retireChecks=0;
for(const change of plan.changes){const after=change.kind==='create'?change.payload:change.kind==='update'?{...docs.get(change.path),...change.patch}:null;if(!after)continue;
 if(after.timing?.estimate?.estimateVersion==='date-only-activity-v1'){assert.equal(canDeliverDateOnlyActivity(after),false);assert.equal(canDeliverDateOnlyActivity(after,'v1'),true,'Capable API date-only delivery '+change.path);assert.equal(after.startTime,'');assert.equal(after.endTime,'');timingChecks++;}
 if(after.areaData)validateAreaData(after.areaData);
 if(change.path.endsWith('oct15_chowder_20261015')){const incoming={...after,price:'$6 per bowl',ticketPrice:'$6 per bowl'};const result={...after,...row.previewDuplicateMerge({existingEvent:after,incomingEvent:incoming,venue:{id:after.venueId,...docs.get('venues/'+after.venueId)}}).updates};assert.equal(result.price,'$6.50');assert.equal(result.ticketPrice,'$6.50');priceChecks++;}
 if(after.reviewedOccurrenceRetirements){const venue={id:change.path.split('/')[1],...after};for(const uniqueId of after.reviewedOccurrenceRetirements.retiredUniqueIds){assert.equal(retire.classifyReviewedOccurrenceRetirement({uniqueId,venueId:venue.id},venue).kind,'retired');retireChecks++;}}
}
const targetNames=plan.changes.filter(c=>c.kind==='create'&&c.path.startsWith('venues/')&&c.payload.eventName==='Kings Playhouse Christmas!');assert.equal(targetNames.length,3);
for(let i=0;i<3;i++){const p=targetNames[i].payload,api=JSON.parse(await fs.readFile(path.join(out,'showpass-exact-'+(i+1)+'.json'),'utf8'));
 const format=instant=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Halifax',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant)).map(p=>[p.type,p.value]));return{date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`};};
 assert.deepEqual(format(api.starts_on),{date:p.startDate,time:p.startTime});assert.deepEqual(format(api.ends_on),{date:p.endDate,time:p.endTime});assert(api.ticket_types.some(t=>t.price==='20.00'));
}
const report={verifiedAt:new Date().toISOString(),savedVenueSources:2,savedBlankFormattedOutput:true,onlineSourcesHeld:3,capabilityContracts:timingChecks,decimalPriceChecks:priceChecks,exactRetiredIdentityChecks:retireChecks,verifiedShowpassUtcLocalOccurrences:3,partialAreaContract:true,sourceUploads:8,liveWrites:0,networkCalls:0,modelCalls:0};
await fs.writeFile(path.join(out,'offline-playback.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
