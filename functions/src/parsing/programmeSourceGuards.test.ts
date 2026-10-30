import assert from 'node:assert/strict';
import test from 'node:test';
import {bindProgrammeMonth,restoreExplainedOccurrenceDate,sourceInterpretationTimestamp} from './programmeSourceGuards.js';
import {prepareOccurrenceSourceItem,restoreOccurrenceSourceOwnership} from './occurrenceSourceOwnership.js';
import {rehydrateFormattedEventMetadata,rehydrateFamilyAudienceMetadata} from './finalFormatter.js';
import {bindCompactStage4Sources,parseCompactStage4Response} from './compactStage4.js';
import {scoreFamilyFriendly} from '../utils/familyFriendlyScoring.js';
import {sourceItemHoldReason} from './sourceItemEvidence.js';
import type {ExtractedItem,ExtractedEvent,FormattedEvent} from './types.js';
import type {RawRowData} from '../types/index.js';

const item=(extra:Partial<ExtractedItem>={}):ExtractedItem=>({name:'Library Games',date:'2026-11-07',startTime:'11:00',endTime:'',venue:'Library',price:'',description:'Every Saturday at 11am.',recurringPattern:'weekly_saturday',extractionReason:'printed programme',...extra} as ExtractedItem);
const formatted=(source:ExtractedItem):FormattedEvent=>({name:source.name,startDate:source.date,endDate:source.date,startTime:source.startTime,endTime:source.endTime,description:source.description,establishment:source.venue,venue:source.venue,address:'',category:'Gatherings & Parties',isEvent:'Yes',isFoodSpecial:'No',isRecurring:'Yes',recurringPattern:'weekly_saturday',ticketPrice:'',ticketLink:'',relevantImageIndex:0,additionalLocation:''} as FormattedEvent);

test('November programme is bounded before validation and after formatting without inventing clocks',()=>{
 const source=prepareOccurrenceSourceItem(item(),'November at our Western Region Libraries!');
 assert.equal(source.recurrenceUntilDate,'2026-11-30');assert.equal(source.endTime,'');
 const out=rehydrateFormattedEventMetadata({...formatted(source),recurrenceUntilDate:''},source);
 assert.equal(out.recurrenceUntilDate,'2026-11-30');assert.equal(out.startTime,'11:00');assert.equal(out.endTime,'');
 assert.equal(restoreOccurrenceSourceOwnership([out],[source])[0].recurrenceUntilDate,'2026-11-30');
 const shorter=rehydrateFormattedEventMetadata({...formatted(source),recurrenceUntilDate:'2026-11-20'},source);
 assert.equal(shorter.recurrenceUntilDate,'2026-11-20');
 assert.equal(restoreOccurrenceSourceOwnership([shorter],[source])[0].recurrenceUntilDate,'2026-11-20');
 assert.equal(restoreOccurrenceSourceOwnership([shorter],[{...source,_sourceWeeklyProgramPattern:'weekly_saturday'} as ExtractedItem])[0].recurrenceUntilDate,'2026-11-20');
});
test('month extent cannot come from another month, generic prose, OCR tail or incompatible year',()=>{
 for(const caption of ['December programmes','November and December programmes','November is a lovely month.','Post\nOCR TEXT:\nNovember Programs','November 2027 Programs'])assert.equal(bindProgrammeMonth(item(),caption)._sourceProgrammeMonthEnd,undefined);
 assert.equal(bindProgrammeMonth(item({recurrenceUntilDate:'2026-11-14'}),'November Programs').recurrenceUntilDate,'2026-11-14');
 assert.equal(bindProgrammeMonth(item({recurringPattern:'none'}),'November Programs').recurrenceUntilDate,undefined);
});
test('own explained Friday occurrence survives a collapsed Thursday date, with strict source corroboration',()=>{
 const source=item({name:'Try Curling',date:'2026-10-29',recurringPattern:'none',description:'Thursday Oct29 and Friday Oct30,6–8each night.',extractionReason:'A dated public curling activity is advertised for Friday, October 30, with an explicit time.'});
 const caption='Try Curling is moved to Thursday Oct29th and Friday Oct30th from 6 to 8pm each night!'.replaceAll('Oct29','Oct 29').replaceAll('Oct30','Oct 30');
 assert.equal(restoreExplainedOccurrenceDate(source,caption).date,'2026-10-30');
 assert.equal(restoreExplainedOccurrenceDate(source,'Thursday Oct29 only.').date,'2026-10-29');
 assert.equal(restoreExplainedOccurrenceDate({...source,extractionReason:String(source.extractionReason).replace('Friday','Thursday')},caption).date,'2026-10-29');
 assert.equal(restoreExplainedOccurrenceDate({...source,extractionReason:source.extractionReason+' Also for Saturday, October 31.'},caption).date,'2026-10-29');
 assert.equal(restoreExplainedOccurrenceDate({...source,extractionReason:'Originally advertised for Friday, October 30, before being moved.'},'Rescheduled from Friday October 30 to Thursday October 29.').date,'2026-10-29');
 assert.equal(restoreExplainedOccurrenceDate(source,'Cancelled Friday October 30; now Thursday October 29.').date,'2026-10-29');
 assert.equal(restoreExplainedOccurrenceDate(source,'Craft Night is Thursday October 29, not Friday October 30.').date,'2026-10-29');
});
test('relative original text uses original timestamp while mixed relative captions and structured events stay unchanged',()=>{
 const row={timestamp:'2026-10-28T01:52:54Z',sharedPostTimestamp:'2026-10-27T12:07:28Z',sharedPostAuthorUrl:'https://www.facebook.com/original',text:'See you at the fair on November7!',sharedPostText:'Tuesday updates: discounted butter tarts today after10:30am.'} as RawRowData;
 assert.equal(sourceInterpretationTimestamp(row),row.sharedPostTimestamp);
 for(const extra of [{text:'Come tomorrow!'},{text:'See you next Friday!'},{text:'Last week was busy.'},{sharedPostTimestamp:'not a timestamp'},{sharedPostTimestamp:'2026-11-01T12:00:00Z'},{sourceScraperType:'events' as const},{sharedPostAuthorUrl:''}])assert.equal(sourceInterpretationTimestamp({...row,...extra}),row.timestamp);
});
test('item-local recurrence holds preserve other validated identities and do not weaken malformed response guards',()=>{
 const sources=bindCompactStage4Sources([item({recurringPattern:'none'}),item({name:'One-off Craft',recurringPattern:'none',description:'A single dated craft activity.'})]);
 const decisions=sources.map((s,i)=>({sourceItemIndex:(s as ExtractedEvent)._pipelineIndex,sourceIdentity:{name:s.name,date:s.date,startTime:s.startTime,venue:s.venue},decision:'KEPT',reason:'Dated activity.',corrections:{recurringPattern:i===1?'daily':null,correctionReason:i===1?'Invented daily schedule.':''}}));
 const result=parseCompactStage4Response(JSON.stringify({decisions}),sources);
 assert.equal(result.validatedItems[0].decision,'KEPT');assert.equal(result.validatedItems[1].decision,'REJECTED');assert.equal(result.validatedItems[1].sourceHoldReason,'unsupported_recurrence_correction');
 assert.equal((result.validatedItems[1].item as ExtractedEvent).recurringPattern,'none');
 assert.throws(()=>parseCompactStage4Response(JSON.stringify({decisions:[decisions[0],decisions[0]]}),sources),/duplicate_source_identity/);
 assert.throws(()=>parseCompactStage4Response('{broken',sources),/malformed_json/);
});
test('explicit child/family phrases survive formatting while adult and beneficiary controls remain restrictive',()=>{
 for(const text of ['A family Halloween evening with child costume categories.','Bring your kiddos on Saturday.','Junior Board Game Social: play classic board games with other kids.','Une soirée pour toute la famille.'])assert(scoreFamilyFriendly({name:text,description:text}).familyFriendlyScore>=60);
 const child=item({name:'Remembrance Day Craft',description:'For children. Make homemade poppies out of paper.'});
 const restored=rehydrateFamilyAudienceMetadata({...formatted(child),description:'Make homemade poppies out of paper.'},child,[child],'November programmes.');assert(scoreFamilyFriendly(restored).familyFriendlyScore>=60);
 for(const text of ['Adult Craft Night, for adults only.','Burlesque: bring your kiddos.','Donate children\'s coats; proceeds for children\'s charities.'])assert(scoreFamilyFriendly({name:text,description:text}).familyFriendlyScore<60);
});
test('body headings cannot become published activity titles',()=>{
 assert.equal(sourceItemHoldReason(item({name:'The night will feature: | A silent auction'})),'activity_identity_not_visible');
 assert.equal(sourceItemHoldReason(item({name:'The Secret Set Fundraiser'})),undefined);
});
