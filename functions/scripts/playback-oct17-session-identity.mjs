// Offline saved-source regression. No replay, generation, network or writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../package.json',import.meta.url));
const {isDuplicateEntry,isHighConfidenceSameOccurrenceDuplicate}=require('./lib/utils/similarity.js');
const {hasMatchingLabeledSlotTimeEvidence}=require('./lib/utils/eventSlotIdentity.js');
const {shouldSkipSiblingUniqueIdDuplicateCheck}=require('./lib/services/firestoreService.js');
const {buildExpandedEventStoredUniqueId,previewDuplicateMerge}=require('./lib/processing/rowProcessor.js');
const capture=process.argv[2];assert(capture,'Pass private audit directory');
const read=async n=>JSON.parse(await fs.readFile(path.join(capture,n),'utf8'));
const snapshots=await read('snapshots.json'),live=await read('live-events.json');
const output=row=>snapshots.find(s=>s.data.rowIndex===row).data.stages.find(s=>s.stage==='format').output;
const row318=output(318),accepted=[];
for(const [i,item] of row318.events.entries()){
  const incoming={...item,eventName:item.name,venueId:'LglliE42SPFssmoU01su',
    uniqueId:buildExpandedEventStoredUniqueId({row:{uniqueId:'1733964295400114'},item,
      eventName:item.name,startDate:item.startDate,endDate:item.endDate,startTime:item.startTime,endTime:item.endTime,
      venueName:item.establishment,additionalLocation:item.additionalLocation})};
  const match=accepted.find(existing=>!shouldSkipSiblingUniqueIdDuplicateCheck(incoming,existing)&&
    (isDuplicateEntry(incoming,existing,{requireEstablishmentMatch:false})||isHighConfidenceSameOccurrenceDuplicate(incoming,existing)));
  assert(!match,`Unexpected lost slot ${i+1}: ${incoming.name}`);accepted.push(incoming);
}
assert.equal(accepted.length,26);
const groups=live.filter(e=>['3DO8t0Eyl1TB8scIBfEx','nOz8TgJISaSmdkMUVNzY'].includes(e.id));
const eptek=[];
for(const item of output(193).events){
  const incoming={...item,eventName:item.name};
  const matches=groups.filter(group=>hasMatchingLabeledSlotTimeEvidence(incoming,group.data));
  assert.equal(matches.length,1);
  assert.equal(matches[0].data.startTime,incoming.startTime);
  const wrong=groups.find(g=>g.id!==matches[0].id);
  assert.equal(isDuplicateEntry(incoming,wrong.data,{requireEstablishmentMatch:false}),false);
  assert.equal(isHighConfidenceSameOccurrenceDuplicate(incoming,wrong.data),false);
  const merged=previewDuplicateMerge({existingEvent:wrong.data,incomingEvent:incoming,
    venue:{id:'slug_eptek.centre',name:'Eptek',normalizedName:'eptek',address:'fixture',latitude:0,longitude:0}});
  assert.deepEqual(merged.changedFields,[]);
  eptek.push({start:incoming.startTime,keeperId:matches[0].id,wrongGroupRejected:true});
}
console.log(JSON.stringify({skatingExtracted:row318.events.length,skatingAccepted:accepted.length,
  eptek,liveWrites:0,networkCalls:0,paidCalls:0},null,2));
