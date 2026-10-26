// Offline only: reads the original captured evidence in place. No network or model calls.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const guards=require('../lib/parsing/occurrenceSourceOwnership.js');
const {classifySpatialEvent}=require('../lib/parsing/spatialEventClassifier.js');
const {parseCompactStage4Response}=require('../lib/parsing/compactStage4.js');
const {applyRecurrenceNormalizationForRegression}=require('../lib/parsing/finalFormatter.js');
const {resolvePostDerivedCityLevelEventLocation,resolveVenueForFullParserEventWithMatcherForRegression,fullParserEventLocationCheck}=require('../lib/processing/rowProcessor.js');
const root=process.argv[2];
assert.ok(root,'Usage: node scripts/oct17-occurrence-ownership-playback.mjs <read-only evidence directory> [local output json]');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
const snapshots=read('snapshots.json');
const receipt=n=>{
  const data=snapshots.find(x=>x.data.rowIndex===n)?.data;
  assert.ok(data,`Missing row ${n}`);
  const output=data.stages.find(x=>x.output.stageArtifacts?.stage3Items)?.output;
  assert.ok(output,`Missing Stage 3 row ${n}`);
  return {data,output,items:output.stageArtifacts.stage3Items,events:output.events};
};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const report={mode:'offline_saved_source_only',modelCalls:0,liveWrites:0,rows:[],inputHashes:{}};
for(const file of ['snapshots.json','stage4-response-readback.json','venues.json'])report.inputHashes[file]=hash(read(file));
const visit=receipt(27);
assert.equal(visit.items.length,6);assert.equal(visit.events.length,6);
const venues=read('venues.json');
for(let i=0;i<6;i++){
  const source=visit.items[i],event=visit.events[i];
  assert.ok(guards.datedOccurrenceLocation({date:source.date,name:source.name,location:source.venue,combinedText:visit.data.inputText}));
  const classification=classifySpatialEvent({date:event.startDate,name:event.name,description:event.description,
    location:event.additionalLocation,combinedText:visit.data.inputText});
  assert.equal(classification.kind,'single_location');
  const row={...visit.data.rowMeta,text:visit.data.inputText,uniqueId:visit.data.uniqueId};
  assert.equal(resolvePostDerivedCityLevelEventLocation({item:event,row,establishment:visit.data.establishment}),null);
  let attempts=0;
  const venue=await resolveVenueForFullParserEventWithMatcherForRegression({item:event,row,rowVenue:null,
    establishment:visit.data.establishment,rowIndex:27,matcher:async(name)=>{
      attempts++;
      const normalize=x=>String(x||'').toLowerCase().replace(/[^a-z0-9]/g,'');
      const matches=venues.filter(x=>[x.data.name,x.data.pagename,...(x.data.aliases||[])].some(v=>normalize(v)===normalize(name)));
      return matches.length===1?{isMatch:true,matchType:'exact',matchedVenue:{id:matches[0].id,...matches[0].data},confidence:100}
        :{isMatch:false,matchType:'none',confidence:0};
    }});
  report.rows.push({row:27,source:visit.data.uniqueId,date:source.date,venue:source.venue,spatial:classification.kind,
    canonicalVenueId:venue?.id||null,disposition:venue?'exact_existing_venue':'hold_specific_unresolved_point',matcherAttempts:attempts});
}
const donation=receipt(103),source=donation.items[0];
const nano=read('stage4-response-readback.json').map(x=>x.body?.output?.flatMap(o=>o.content||[]).find(c=>c.type==='output_text')?.text)
  .find(text=>text&&JSON.parse(text).decisions?.some(d=>d.sourceIdentity?.name===source.name&&d.corrections?.recurringPattern==='none'));
assert.ok(nano,'Missing original captured Nano none correction');
assert.equal(parseCompactStage4Response(nano,donation.items).validatedItems[0].corrections.recurringPattern,'none');
const prepared=guards.prepareOccurrenceSourceItem(source,donation.data.inputText);
assert.equal(prepared.recurringPattern,'none');
const formatted=applyRecurrenceNormalizationForRegression({...donation.events[0]},prepared);
const restored=guards.restoreOccurrenceSourceOwnership([formatted],[prepared])[0];
assert.equal(restored.recurringPattern,'none');assert.equal(restored.isRecurring,'No');
report.rows.push({row:103,source:donation.data.uniqueId,originalNanoCorrectionAccepted:true,patternAfterFormatting:restored.recurringPattern});
const program=receipt(343),weekly=guards.prepareOccurrenceSourceItem(program.items[0],program.data.inputText);
assert.equal(weekly.recurringPattern,'weekly_saturday');
const normalized=applyRecurrenceNormalizationForRegression({...program.events[0]},weekly);
const week=guards.restoreOccurrenceSourceOwnership([normalized],[weekly])[0];
assert.equal(week.recurringPattern,'weekly_saturday');assert.equal(week.totalOccurrences,undefined);assert.equal(week.recurrenceUntilDate,undefined);
report.rows.push({row:343,source:program.data.uniqueId,pattern:week.recurringPattern,count:week.totalOccurrences??null,until:week.recurrenceUntilDate??null});
const collection=receipt(283),held=guards.prepareOccurrenceSourceItem(collection.items[0],collection.data.inputText);
assert.equal(held.sourceLocationRole,'collection_partner_only');
const cleared=guards.restoreOccurrenceSourceOwnership(collection.events,[held])[0];
assert.equal(cleared.establishment,'');
assert.equal(fullParserEventLocationCheck(cleared,{...collection.data.rowMeta,text:collection.data.inputText}).decision,'hold');
report.rows.push({row:283,source:collection.data.uniqueId,role:held.sourceLocationRole,disposition:'hold_attendance_venue_unstated'});
const clock=receipt(247);
assert.equal(guards.materialCaptionClockConflict(clock.items[0],clock.data.inputText,clock.items.length),true);
report.rows.push({row:247,source:clock.data.uniqueId,disposition:'material_clock_conflict_hold',historicalDate:clock.items[0].date,
  originalSharedTimestamp:clock.data.rowMeta.sharedPostTimestamp,outerTimestamp:clock.data.rowMeta.timestamp});
if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
