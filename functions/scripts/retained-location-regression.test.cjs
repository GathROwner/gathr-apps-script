const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const fixture=require('./fixtures/retained-location-oct18.json');
const replay=require('./retained-location-replay.cjs');
const {datedOccurrenceLocation,restoreOccurrenceSourceOwnership,prepareOccurrenceSourceItem}=require('../lib/parsing/occurrenceSourceOwnership.js');
const {classifySpatialEvent}=require('../lib/parsing/spatialEventClassifier.js');
const {resolvePostDerivedCityLevelEventLocation,resolveVenueForFullParserEventWithMatcherForRegression,fullParserEventLocationCheck}=require('../lib/processing/rowProcessor.js');
const cfcy=fixture.rows.find(x=>x.rowIndex===27),first=cfcy.stage4Items[0];
const input=overrides=>({date:first.date,name:first.name,location:first.venue,combinedText:cfcy.combinedText,...overrides});
for(const date of ['2026-10-20','2026-10-22','2026-10-27','2026-11-03','2026-11-05'])test('retained CFCY exact date/time/canonical venue '+date,async()=>{
 const report=await replay,actual=report.rows.find(x=>x.rowIndex===27&&x.date===date),source=cfcy.stage4Items.find(i=>i.date===date);
 assert.equal(actual.start,source.startTime);assert.equal(actual.end,source.endTime);assert.equal(actual.recurrence,'none');assert.equal(actual.sourceSpatialPresent,false);
 assert.equal(actual.reformattedRouting.areaKind,null);assert.equal(actual.reformattedRouting.disposition,'existing_venue');
 assert.equal(actual.reformattedRouting.attempts.find(x=>x.venueId===actual.reformattedRouting.venueId).matchType,'exact');
 const canonical=fixture.venues.find(v=>(v.aliases||[]).includes(source.venue)||v.name===source.venue);assert(canonical);assert.equal(actual.reformattedRouting.venueId,canonical.id);
});
test('retained Kay exact stop held when catalog lacks its venue',async()=>{const r=(await replay).rows.find(x=>x.rowIndex===27&&x.date==='2026-10-29');assert.equal(r.reformattedRouting.disposition,'hold_unresolved_point');assert.equal(r.reformattedRouting.areaKind,null);});
for(const [row,name]of [[214,'Artisans Christmas Market'],[105,'PUMPKINS & POTTERY'],[185,'Family Skate']])test('retained own point and complete original spatial fields preserved: '+name,async()=>{
 const r=(await replay).rows.find(x=>x.rowIndex===row);assert.equal(r.sourceSpatialHash,r.outputSpatialHash);assert.equal(r.reformattedRouting.disposition,'hold_unresolved_point');assert.equal(r.reformattedRouting.venueId,null);assert.equal(r.reformattedRouting.areaKind,null);
 if(row===185)assert.equal(r.captionLength,0,'No original poster certainty may be inferred from model output');
 if(row===105)assert.equal(r.sourceUniqueId,'1732801838854635','Recovered source ID comes from exact snapshot, not queue backfill');
});
test('a missing date cannot borrow a different retained stop',()=>{assert.equal(datedOccurrenceLocation(input({date:'2026-10-21'})),null);});
test('two printed stops on one date do not collapse to one venue',()=>{assert.equal(datedOccurrenceLocation(input({combinedText:cfcy.combinedText.split('OCR TEXT:')[0]+'\nOct. 20 – 12p-4p – Second Site'})),null);});
test('route model evidence prevents dated stop override',()=>{assert.equal(datedOccurrenceLocation(input({modelSpatialEvidence:{kind:'route',locations:[]}})),null);});
test('model start/finish/stop roles remain guarded',()=>{for(const role of ['start','finish','stop'])assert.equal(datedOccurrenceLocation(input({modelSpatialEvidence:{kind:'multi_location',locations:[{label:first.venue,role}]}})),null);});
test('simultaneous multi-location evidence remains multi-location',()=>{const combinedText='Oct. 20 – 12p-4p – at both Fixture Hall and Other Hall\nOct. 22 – 4p-7p – Third Hall';const a={name:'Food drive',date:first.date,location:'Fixture Hall',combinedText,modelSpatialEvidence:{kind:'multi_location',locations:[{label:'Fixture Hall',role:'location'},{label:'Other Hall',role:'location'}]}};assert.equal(datedOccurrenceLocation(a),null);assert.notEqual(classifySpatialEvent(a).kind,'single_location');});
test('OCR-only dates cannot override missing original caption locations',()=>{for(const prefix of ['OCR TEXT:\n','  OCR TEXT:\n','\nOCR TEXT:\n','Unrelated caption\n\nOCR TEXT:\n'])assert.equal(datedOccurrenceLocation(input({combinedText:prefix+cfcy.combinedText})),null);});
test('wrong venue and broad location cannot borrow a source date',()=>{for(const location of ['Different Place','PEI','Island wide locations'])assert.equal(datedOccurrenceLocation(input({location})),null);});
test('exact duplicate source bindings do not restore ownership to an arbitrary item',()=>{const source={...first,recurringPattern:'none',description:'A dated food event. An alternative depot is open daily in Another Mall.'};const output={name:source.name,startDate:source.date,startTime:source.startTime,recurringPattern:'daily'};const result=restoreOccurrenceSourceOwnership([output],[source,{...source}]);assert.deepEqual(result,[output]);});
test('collection-only source stays held before any venue matcher',async()=>{const source=prepareOccurrenceSourceItem({name:'Winter clothing distribution',date:'2026-11-01',startTime:'12:00',venue:'',spatial:{kind:'unknown',locations:[],evidenceNotes:'The post does not state the event venue; businesses are collection spots.'}},'');assert.equal(source.sourceLocationRole,'collection_partner_only');const item={...source,startDate:source.date};let calls=0;assert.equal(fullParserEventLocationCheck(item,{text:''}).decision,'hold');assert.equal(await resolveVenueForFullParserEventWithMatcherForRegression({item,row:{text:'',userName:'Publisher Cafe'},rowVenue:{id:'publisher',name:'Publisher Cafe'},establishment:'Publisher Cafe',rowIndex:0,matcher:async()=>{calls++;throw Error('No collection-only lookup permitted');}}),null);assert.equal(calls,0);});
test('unresolved retained point cannot fall back to a publisher venue',async()=>{const item=fixture.rows.find(r=>r.rowIndex===105).savedPostFormatEvents[0];const result=await resolveVenueForFullParserEventWithMatcherForRegression({item,row:{text:'',userName:'Unrelated Publisher'},rowVenue:{id:'publisher',name:'Unrelated Publisher'},establishment:'Unrelated Publisher',rowIndex:105,matcher:async()=>({isMatch:false,matchType:'none',similarity:0})});assert.equal(result,null);});
test('all original captions remain distinct from generated OCR and media pipeline',()=>{for(const r of fixture.rows){assert.equal(r.binding.rawCaptionEqualsSnapshotPrefix,true);assert.equal(r.binding.inputComplete,true);}assert.equal(fixture.mediaPipelineCoverage,false);});
test('a road name in another venue address is not Linkletter venue identity',async()=>{
 await replay;const {findMatchingVenue}=require('../lib/services/firestoreService.js');
 globalThis.__retainedSetCatalog([{id:'synthetic-road-conflict-control',name:'Wm Callbeck Centre',normalizedName:'wm callbeck centre',address:'106 Linkletter Avenue, Summerside, PE'}]);
 try{const result=await findMatchingVenue('Linkletter Community Centre');assert.equal(result.isMatch,false);}finally{globalThis.__retainedSetCatalog(fixture.venues);}
});
test('ownership restoration does not borrow evidence from a different date or clock',()=>{
 const source={...first,description:'A dated food event. An alternative depot is open daily in Another Mall.'};
 for(const override of [{startDate:'2026-10-21',startTime:first.startTime},{startDate:first.date,startTime:'13:00'}]){
  const event={name:first.name,recurringPattern:'daily',...override};assert.deepEqual(restoreOccurrenceSourceOwnership([event],[source]),[event]);
 }
});
test('successful retained replay attempts no credentials, network, process or writes',async()=>{assert.equal((await replay).stubProviderCalls,4);assert.deepEqual(globalThis.__retainedSafety,{networkAttempts:0,writeAttempts:0,credentialReadAttempts:0,childProcessAttempts:0});});
