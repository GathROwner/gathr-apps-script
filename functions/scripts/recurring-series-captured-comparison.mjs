// Read-only comparison of captured production pairs against the accepted patch.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import admin from 'firebase-admin';
import {execFileSync} from 'node:child_process';
const out='artifacts/recurring-series-hardening-oct14';
if(process.argv.includes('--baseline-worker')){
 const baseline=await import('../artifacts/recurring-series-hardening-oct14/baseline/functions/lib/processing/rowProcessor.js');
 const input=JSON.parse(await fs.readFile(`${out}/comparison-input.json`,'utf8'));
 const results=input.map(x=>baseline.previewDuplicateMerge(x));
 await fs.writeFile(`${out}/comparison-baseline.json`,JSON.stringify(results));
 process.exit(0);
}
const key=JSON.parse(await fs.readFile(process.env.BE_YOU_CREDENTIAL_PATH,'utf8'));
assert.equal(key.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(key),projectId:key.project_id});
const current=await import('../lib/processing/rowProcessor.js');
const oldFamily=await import('../artifacts/recurring-series-hardening-oct14/baseline/functions/lib/services/recurringFamilyFallback.js');
const newFamily=await import('../lib/services/recurringFamilyFallback.js');
const {sourceLinkedHistoricalSeriesKeepers}=await import('../lib/services/recurringSeriesCatalog.js');
const {recurringSeriesCoversOccurrence}=await import('../lib/services/firestoreService.js');
const rows=JSON.parse(await fs.readFile('artifacts/be-you-oct14/all-events.json','utf8'));
const revive=row=>({...row.data,id:row.path.split('/').at(-1),venueId:row.path.split('/')[1],
 sourceTimestamp:row.data.sourceTimestamp?._seconds?new Date(row.data.sourceTimestamp._seconds*1000):row.data.sourceTimestamp});
const nested=rows.filter(x=>/^venues\/[^/]+\/events\/[^/]+$/.test(x.path)).map(x=>({path:x.path,event:revive(x)}));
const venues=await admin.firestore().collection('venues').get();
const byVenue=new Map(venues.docs.map(x=>[x.id,{id:x.id,...x.data()}]));
const pairs=[],oldActivePairs=[];
for(const a of nested)for(const b of nested){
 if(a.path===b.path||a.event.venueId!==b.event.venueId||a.event.startTime!==b.event.startTime)continue;
 if(String(a.event.uniqueId||'').split('_')[0]===String(b.event.uniqueId||'').split('_')[0])continue;
 const oldCompatible=oldFamily.isRecurringFamilyFallbackCompatible(a.event,b.event,{venueId:a.event.venueId,startTimeToleranceHours:0});
 const newCompatible=newFamily.isRecurringFamilyFallbackCompatible(a.event,b.event,{venueId:a.event.venueId,startTimeToleranceHours:0});
 if(!oldCompatible&&!newCompatible)continue;
 const venue=byVenue.get(a.event.venueId);assert(venue,'Captured venue unavailable');
 const fresh=current.previewDuplicateMerge({existingEvent:b.event,incomingEvent:a.event,venue});
 const ageDays=(Date.parse(a.event.startDate)-Date.parse(b.event.startDate))/86400000;
 const pair={incoming:a.path,existing:b.path,venue:venue.name,incomingTitle:a.event.eventName,existingTitle:b.event.eventName,
  ageDays,oldCompatible,newCompatible,fresh,input:{existingEvent:b.event,incomingEvent:a.event,venue}};
 pairs.push(pair);
 if(ageDays>120&&recurringSeriesCoversOccurrence(b.event,a.event.startDate))oldActivePairs.push(pair);
}
await fs.writeFile(`${out}/comparison-input.json`,JSON.stringify(pairs.map(x=>x.input)));
execFileSync(process.execPath,[process.argv[1],'--baseline-worker'],{stdio:'pipe'});
const oldResults=JSON.parse(await fs.readFile(`${out}/comparison-baseline.json`,'utf8'));
for(let i=0;i<pairs.length;i++){pairs[i].old=oldResults[i];pairs[i].changed=JSON.stringify(oldResults[i])!==JSON.stringify(pairs[i].fresh);delete pairs[i].input;}
const beYou=nested.filter(x=>x.event.venueId==='name_n2ivcu');
const old=beYou.find(x=>x.event.id==='Uo0EN3ofQfIFbxcYRYwy').event;
const keeper={...beYou.find(x=>x.event.id==='NJ5X8fPIVOy405M9sfFS').event,sourceUniqueIds:['122202851828910683','1563147748686067','1562661692568029','1563713265796205']};
assert.equal(sourceLinkedHistoricalSeriesKeepers(old,[keeper])[0]?.id,keeper.id);
const replay=current.previewDuplicateMerge({existingEvent:{...keeper,_sourceCorroborationOnly:true},incomingEvent:old,venue:byVenue.get('name_n2ivcu')});
assert(replay.changedFields.every(x=>['sourceUniqueIds','sourceUrls'].includes(x)));
const report={checkedAt:new Date().toISOString(),capturedDocuments:rows.length,nestedDocuments:nested.length,
 applicableDirectedPairs:pairs.length,changedPairs:pairs.filter(x=>x.changed),oldActivePairs,historicalReplay:replay,
 limits:'Captured events compared using real venue metadata and the actual family/merge functions. This scan identifies mechanisms, not deletion authority. No model calls or writes.'};
await fs.writeFile(`${out}/captured-comparison.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({capturedDocuments:rows.length,nestedDocuments:nested.length,applicableDirectedPairs:pairs.length,
 changedPairs:report.changedPairs.map(x=>({incoming:x.incoming,existing:x.existing,venue:x.venue,title:x.incomingTitle,
 oldFields:x.old.changedFields,newFields:x.fresh.changedFields,oldCompatible:x.oldCompatible,newCompatible:x.newCompatible})),
 oldActivePairs:oldActivePairs.map(x=>({incoming:x.incoming,existing:x.existing,ageDays:x.ageDays})),historicalReplayFields:replay.changedFields}));
await admin.app().delete();
