import fs from 'node:fs/promises';
import admin from 'firebase-admin';
import assert from 'node:assert/strict';
const credential=JSON.parse(await fs.readFile(process.env.BE_YOU_CREDENTIAL_PATH,'utf8'));
assert.equal(credential.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(credential),projectId:'gathr-migrated'});
const {selectStandingKaraokeOccurrence,coversStandingKaraokeOccurrence,isPlainKaraoke,isStandingKaraoke}=await import('../lib/services/standingKaraokeOccurrence.js');
const {getRecurringFamilyFallbackDiagnostics}=await import('../lib/services/recurringFamilyFallback.js');
const {previewDuplicateMerge}=await import('../lib/processing/rowProcessor.js');
const {checkDuplicate}=await import('../lib/services/firestoreService.js');
const out='artifacts/be-you-oct14',capture=JSON.parse(await fs.readFile(`${out}/capture.json`,'utf8'));
const docs=JSON.parse(await fs.readFile(`${out}/all-events.json`,'utf8'));
const revive=x=>({...x.data,id:x.path.split('/').at(-1),venueId:x.data.venueId || (x.path.startsWith('venues/')?x.path.split('/')[1]:x.data.venueId),sourceTimestamp:x.data.sourceTimestamp?._seconds?new Date(x.data.sourceTimestamp._seconds*1000):x.data.sourceTimestamp});
const byId=id=>revive(capture.events.find(x=>x.path.endsWith('/'+id)));
const old=byId('Uo0EN3ofQfIFbxcYRYwy'),fresh=byId('NJ5X8fPIVOy405M9sfFS'),dated=byId('mB37Tk3gVTT0zvlkXiPg'),sing=byId('PBW360WVRvt9ijTQs9fS'),fri=byId('skLvOjG88fMQAxcjUAU0');
const venue={id:'name_n2ivcu',...capture.venues[0].data};
const historical={ageDays:(Date.parse(fresh.startDate)-Date.parse(old.startDate))/86400000,
  originalFamilyPredicate:getRecurringFamilyFallbackDiagnostics(fresh,old),
  originalGenericTitlePredicate:getRecurringFamilyFallbackDiagnostics(dated,fresh),
  newSelection:selectStandingKaraokeOccurrence(fresh,[old]),
  merge:previewDuplicateMerge({existingEvent:old,incomingEvent:fresh,venue})};
assert(historical.ageDays>120);assert.equal(historical.originalFamilyPredicate.compatible,true);
assert.equal(historical.originalGenericTitlePredicate.familyAnchorScore,0);
assert.equal(historical.newSelection.kind,'match');
assert.equal(historical.merge.updates.startDate,undefined);
assert.deepEqual(historical.merge.updates.mediaUrls,[fresh.imageProvenance.primaryUrl]);
const cases=[['aggregate-covered',dated,[fresh]],['historical-covered',fresh,[old]],['live-ambiguous',dated,[old,fresh]],['singalong-distinct',sing,[old,fresh]],['friday-protected',fri,[old,fresh]]];
const playback=cases.map(([label,incoming,peers])=>({label,decision:selectStandingKaraokeOccurrence(incoming,peers)}));
assert.deepEqual(playback.map(x=>x.decision.kind),['match','match','hold','none','none']);
const corroboration=previewDuplicateMerge({existingEvent:fresh,incomingEvent:dated,venue});
assert(corroboration.changedFields.every(x=>['sourceUniqueIds','sourceUrls'].includes(x)));
const liveSelector=await checkDuplicate(dated,dated.venueId);
assert.equal(liveSelector.isDuplicate,true);assert.equal(liveSelector.existingEvent,undefined);
const pairs=[];
for(const incomingDoc of docs){const incoming=revive(incomingDoc);if(!isPlainKaraoke(incoming))continue;
 for(const existingDoc of docs){if(existingDoc.path===incomingDoc.path)continue;const existing=revive(existingDoc);
  if(coversStandingKaraokeOccurrence(incoming,existing))pairs.push({incoming:incomingDoc.path,existing:existingDoc.path,venue:incoming.establishment,incomingName:incoming.eventName,existingName:existing.eventName,ageDays:(Date.parse(incoming.startDate)-Date.parse(existing.startDate))/86400000,mechanism:Date.parse(incoming.startDate)-Date.parse(existing.startDate)>120*86400000?'outside-120-day-parent-window':'plain-activity-family'});
 }}
const groups=[];for(const pair of pairs){const connected=groups.filter(g=>g.paths.includes(pair.incoming)||g.paths.includes(pair.existing));if(!connected.length)groups.push({venue:pair.venue,paths:[pair.incoming,pair.existing]});else {const first=connected[0];first.paths=[...new Set([...first.paths,pair.incoming,pair.existing,...connected.slice(1).flatMap(x=>x.paths)])];for(const other of connected.slice(1))groups.splice(groups.indexOf(other),1);}}
const agePairs=[];
for(const incomingDoc of docs){const incoming=revive(incomingDoc);for(const existingDoc of docs){
 const existing=revive(existingDoc);
 if(!incoming.venueId||incoming.venueId!==existing.venueId||incoming.startTime!==existing.startTime)continue;
 const ageDays=(Date.parse(incoming.startDate)-Date.parse(existing.startDate))/86400000;if(!(ageDays>120))continue;
 const diagnostic=getRecurringFamilyFallbackDiagnostics(incoming,existing,{venueId:incoming.venueId});
 if(!diagnostic.compatible)continue;
 agePairs.push({incoming:incomingDoc.path,existing:existingDoc.path,venue:incoming.establishment,incomingName:incoming.eventName,existingName:existing.eventName,ageDays,diagnostic,
  status:'REVIEW_ONLY: same lookup exclusion; source equivalence, current lifecycle and keeper require individual verification'});
}}
const result={checkedAt:new Date().toISOString(),historical,playback,corroboration,liveSelector,scan:{documents:docs.length,plainKaraoke:docs.filter(x=>isPlainKaraoke(x.data)).length,standingKaraoke:docs.filter(x=>isStandingKaraoke(x.data)).length,pairs,groups,agePairs,limits:'Plain Karaoke identity is the local prevention scope. Other >120-day pairs use the actual existing family predicate plus exact start and same venue; all remain source-review candidates, never deletion authority. No branded sing-along alias scan.'}};
await fs.writeFile(`${out}/playback-and-scan.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify({ageDays:historical.ageDays,playback:playback.map(x=>({label:x.label,kind:x.decision.kind})),liveSelector,scan:result.scan}));
