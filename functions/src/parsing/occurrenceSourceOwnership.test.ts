import test from 'node:test';
import assert from 'node:assert/strict';
import {datedOccurrenceLocation, hasOnlyAlternativeRecurrence, explicitStartingProgramPattern,
  materialCaptionClockConflict, hasExplicitVenueAbsence, prepareOccurrenceSourceItem,
  restoreOccurrenceSourceOwnership} from './occurrenceSourceOwnership.js';
import {classifySpatialEvent} from './spatialEventClassifier.js';
import {bindCompactStage4Sources, parseCompactStage4Response} from './compactStage4.js';
import {allowsPublisherAddressHydration} from '../services/sourceLocationRole.js';
import type {ExtractedEvent, FormattedEvent} from './types.js';

const item = (overrides: any = {}): ExtractedEvent => ({name:'Donation Day',description:'Collect winter clothes.',
  date:'2026-10-18',startTime:'12:00',endTime:'20:00',venue:'Fixture Grocery, 9 Example Rd',price:'',
  recurringPattern:'daily',extractionReason:'Dated donation event',...overrides});
const formatted = (source: ExtractedEvent, overrides: any = {}): FormattedEvent => ({...source,
  startDate:source.date,endDate:source.date,establishment:source.venue,additionalLocation:source.venue,address:'',
  category:'Gatherings & Parties',isEvent:'Yes',isFoodSpecial:'No',isRecurring:'Yes',ticketPrice:'',ticketLink:'',
  relevantImageIndex:0,...overrides});
const response = (source: any, proposed: string | null) => JSON.stringify({decisions:[{
  sourceItemIndex:source._pipelineIndex,sourceIdentity:Object.fromEntries(['name','date','startTime','venue'].map(k=>[k,String(source[k]??'')])),
  decision:'KEPT',reason:'Dated activity',corrections:{recurringPattern:proposed,correctionReason:proposed?'Source item owns this schedule.':''},
}]});

test('an OCR section at the start of an empty-caption input cannot supply dated venue ownership',()=>{
  const schedule='Oct. 20 – Fixture Grocery in Charlottetown\nOct. 22 – Example Mansion in Kensington';
  const own={name:'Food drive',date:'2026-10-20',location:'Fixture Grocery, Charlottetown'};
  assert.ok(datedOccurrenceLocation({...own,combinedText:schedule}));
  for(const marker of ['OCR TEXT:\n','  OCR TEXT:\n','\nOCR TEXT:\n','Unrelated caption\n\nOCR TEXT:\n']) {
    assert.equal(datedOccurrenceLocation({...own,combinedText:marker+schedule}),null);
  }
});

test('OCR-only programme wording cannot create weekly ownership or caption clock conflict',()=>{
  const programme={name:'First Games Program',description:'Starting Saturday October 24th. Day: Saturdays.',date:'2026-10-24'};
  const caption='First Games Program starting Saturday October 24th. Day: Saturdays.';
  assert.equal(explicitStartingProgramPattern(programme,caption),'weekly_saturday');
  assert.equal(explicitStartingProgramPattern(programme,'OCR TEXT:\n'+caption),null);
  const activity={name:'Evening concert',startTime:'19:00',timeFlags:{start:{source:'explicit',evidence:'show starts 7 PM'}}};
  assert.equal(materialCaptionClockConflict(activity,'Evening concert starting 6 till 9',1),true);
  assert.equal(materialCaptionClockConflict(activity,'OCR TEXT:\nEvening concert starting 6 till 9',1),false);
});

test('dated source lines own their named stops without flattening a global tour',()=>{
  const combinedText='Island wide campaign at multiple locations.\nOct. 20 – 12p-4p – Fixture Grocery in Charlottetown\nOct. 22 – 4p-7p – Example Mansion in Kensington';
  const input={name:'Island Wide Food Drive',date:'2026-10-20',location:'Fixture Grocery, Charlottetown',combinedText};
  assert.ok(datedOccurrenceLocation(input));
  const spatial=classifySpatialEvent(input);
  assert.equal(spatial.kind,'single_location');assert.equal(spatial.locations.length,1);
  assert.equal(spatial.locations[0].label,input.location);
  assert.notEqual(classifySpatialEvent({...input,date:undefined}).kind,'single_location');
  assert.equal(datedOccurrenceLocation({...input,date:'2026-10-21'}),null);
  assert.equal(datedOccurrenceLocation({...input,location:'Other Grocery'}),null);
  assert.equal(datedOccurrenceLocation({...input,name:'Parade route'}),null);
  assert.equal(datedOccurrenceLocation({...input,combinedText:combinedText+'\nOct. 20 – Second Grocery'}),null);
  assert.equal(datedOccurrenceLocation({...input,modelSpatialEvidence:{kind:'route'}}),null);
  assert.equal(datedOccurrenceLocation({...input,combinedText:combinedText.replace('Fixture Grocery in Charlottetown','at both Fixture Grocery and Second Grocery in Charlottetown')}),null);
  assert.equal(datedOccurrenceLocation({...input,combinedText:combinedText.replace('Fixture Grocery in Charlottetown','Fixture Grocery and Second Grocery in Charlottetown'),
    modelSpatialEvidence:{kind:'multi_location',locations:[{label:'Fixture Grocery'},{label:'Second Grocery'}]}}),null);
});

test('a separate daily depot can neither lend recurrence nor prevent a compact none correction',()=>{
  const original=item({description:'Collect winter clothes on October 18. An alternative drop-off depot is open daily in The Fixture Mall.'});
  const source=bindCompactStage4Sources([original])[0];
  assert.ok(hasOnlyAlternativeRecurrence(source));
  assert.equal(parseCompactStage4Response(response(source,'none'),[source]).validatedItems[0].corrections?.recurringPattern,'none');
  const prepared=prepareOccurrenceSourceItem(original,'');
  assert.equal(prepared.recurringPattern,'none');
  const restored=restoreOccurrenceSourceOwnership([formatted(prepared,{recurringPattern:'daily',isRecurring:'Yes'})],[prepared])[0];
  assert.equal(restored.recurringPattern,'none');assert.equal(restored.isRecurring,'No');
  const absent=bindCompactStage4Sources([{...original,recurringPattern:'none' as const}])[0];
  assert.throws(()=>parseCompactStage4Response(response(absent,'daily'),[absent]),/unsupported_recurrence_correction/);
});

test('real daily depot and own weekly programme remain protected from recurrence removal',()=>{
  for(const control of [item({name:'Donation depot',description:'Donation depot is open daily.',venue:'Fixture Mall'}),
    item({description:'Our event runs daily at Fixture Grocery. An alternative drop-off depot is open daily in The Fixture Mall.'}),
    item({description:'Every Sunday at Fixture Grocery.',recurringPattern:'weekly_sunday'})]){
    assert.equal(hasOnlyAlternativeRecurrence(control),false);
    const source=bindCompactStage4Sources([control])[0];
    assert.throws(()=>parseCompactStage4Response(response(source,'none'),[source]),/unsupported_recurrence_correction/);
  }
});

test('starting programme with labelled plural weekday preserves weekly intent without inventing extent',()=>{
  const original=item({name:'First Games Program',description:'Starting Saturday October 24th! Day: Saturdays. Ages: 4–6yr.',date:'2026-10-24',recurringPattern:'none'});
  const caption='First Games Program starting Saturday October 24th. Day: Saturdays.';
  assert.equal(explicitStartingProgramPattern(original,caption),'weekly_saturday');
  const prepared=prepareOccurrenceSourceItem(original,caption);
  assert.equal(prepared.recurringPattern,'weekly_saturday');
  const restored=restoreOccurrenceSourceOwnership([formatted(prepared,{recurringPattern:'none',isRecurring:'No',totalOccurrences:8,recurrenceUntilDate:'2026-12-12'})],[prepared])[0];
  assert.equal(restored.recurringPattern,'weekly_saturday');assert.equal(restored.isRecurring,'Yes');
  assert.equal(restored.totalOccurrences,undefined);assert.equal(restored.recurrenceUntilDate,undefined);
  for(const overrides of [{description:'Saturday social.'},{description:'Formerly starting Saturday. Day: Saturdays.'},
    {description:'Starting Saturday. Day: Saturdays. Day: Sundays.'},{description:'Starting Sunday. Day: Saturdays.'},{date:'2026-10-23'}]){
    assert.equal(explicitStartingProgramPattern({...original,...overrides},caption),null);
  }
  assert.equal(explicitStartingProgramPattern(original,'Another Programme every Saturday.'),null);
  assert.equal(explicitStartingProgramPattern(original,'First Games Program starting Saturday October 24th.'),null);
});

test('explicit absence of attendance venue holds collection identity and blocks publisher hydration',()=>{
  const original=item({venue:'',spatial:{kind:'unknown',locations:[],evidenceNotes:'The post does not state the event venue; the businesses named are collection spots.'}});
  assert.ok(hasExplicitVenueAbsence(original));
  const prepared=prepareOccurrenceSourceItem(original,'');
  assert.equal(prepared.sourceLocationRole,'collection_partner_only');assert.equal(allowsPublisherAddressHydration(prepared),false);
  const restored=restoreOccurrenceSourceOwnership([formatted(prepared,{venue:'Publisher Cafe',establishment:'Publisher Cafe',address:'1 Example Rd'})],[prepared])[0];
  assert.equal(restored.venue,'');assert.equal(restored.establishment,'');assert.equal(restored.address,'');
  assert.equal(hasExplicitVenueAbsence({...original,venue:'Actual Distribution Hall'}),false);
  assert.equal(hasExplicitVenueAbsence({...original,spatial:{kind:'unknown',locations:[],evidenceNotes:'No venue identified.'}}),false);
});

test('material advertised clock conflict holds without guessing priority, preserving doors and separate slots',()=>{
  const original=item({name:'Wing Night',startTime:'17:00',timeFlags:{start:{source:'explicit',evidence:'Starts @ 5pm'}}});
  assert.equal(materialCaptionClockConflict(original,'Wing night tonight.\nStarting at 6 till 9',1),true);
  assert.equal(materialCaptionClockConflict(original,'Wing night tonight.\nStarting at 5 till 9',1),false);
  assert.equal(materialCaptionClockConflict(original,'Wing night tonight.\nStarting at 6 till 9',2),false);
  assert.equal(materialCaptionClockConflict(original,'Other event starting at 6 till 9',1),false);
  assert.equal(materialCaptionClockConflict(original,'Wing Night doors starting at 6 till 9',1),false);
  assert.equal(materialCaptionClockConflict({...original,timeFlags:{start:{source:'implied',evidence:''}}},'Wing Night starting at 6 till 9',1),false);
  assert.equal(materialCaptionClockConflict(item({name:'Comedy',startTime:'20:00',timeFlags:{start:{source:'explicit',evidence:'Show 8PM'}}}),
    'Comedy. Doors at 7PM. Show 8PM–10PM.',1),false);
});
