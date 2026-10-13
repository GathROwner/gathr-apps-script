import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './__fixtures__/oct13-integrity.json';
import {constrainSourceTimes} from './sourceTimeConstraints.js';
import {sourceItemHoldReason, bindDatedTicketLink} from './sourceItemEvidence.js';
import {rehydrateFormattedEventMetadata, preserveValidatedOccurrence, applyCategoryCorrectionsForRegression} from './finalFormatter.js';
import {applyFallbackTimes, resolveTimesWithOperatingHours} from './venueResolver.js';
import {enforceDateTimeCompleteness} from './postParser.js';
import {previewDuplicateMerge} from '../processing/rowProcessor.js';
import {hasConflictingOccurrenceIdentity,findConflictingSourceCinemaDate} from '../utils/occurrenceMergeGuard.js';
import {isDuplicateEntry} from '../utils/similarity.js';
import {isExactUniqueIdDuplicateCompatible} from '../services/exactUniqueIdCompatibility.js';
import {isRecurringFamilyFallbackCompatible, getRecurringFamilyFallbackDiagnostics} from '../services/recurringFamilyFallback.js';
const row=(n:number):any=>fixture.rows.find(x=>x.row===n)!;
const event=(patch:any={}):any=>({name:'Activity',eventName:'Activity',establishment:'Venue',venueId:'v',category:'Workshops & Classes',isEvent:'Yes',isFoodSpecial:'No',startDate:'2026-10-14',endDate:'2026-10-14',startTime:'17:30',endTime:'19:30',isRecurring:'No',recurringPattern:'none',uniqueId:'new_1',...patch});
const merge=(a:any,b:any)=>previewDuplicateMerge({existingEvent:a,incomingEvent:b,venue:{id:a.venueId,name:a.establishment,address:'',latitude:0,longitude:0} as any});

test('Dunes placeholder clocks and dinner scope cannot inherit retail hours',async()=>{
 const r=row(55), items:any[]=constrainSourceTimes(r.stage3,r.caption);
 assert.equal(items.length,4);
 for(const item of items){assert.equal(item.startTime,'');assert.equal(item.recurringPattern,'none');assert.equal(item._sourceTimeConstraint.reason,'meal_period_without_clock');
  const formatted=rehydrateFormattedEventMetadata(event({startDate:item.date,startTime:'09:00'}),item);
  assert.equal(formatted.startTime,'');
  const resolved=(await resolveTimesWithOperatingHours([formatted],'The Dunes','',r.timestamp))[0];
  assert.equal(applyFallbackTimes(resolved,formatted,'12:00',item.date).startTime,'');
  assert.equal(enforceDateTimeCompleteness([resolved],r.timestamp,'America/Halifax').length,0);
 }
 const printed={...r.stage3[0],startTime:'18:00',timeFlags:{start:{source:'explicit',evidence:'6 pm'}}};
 assert.equal(constrainSourceTimes([printed],'')[0]._sourceTimeConstraint,undefined);
 const allDay={...r.stage3[0],name:'All day breakfast special',description:'Breakfast deal served all day',startTime:''};
 assert.equal(constrainSourceTimes([allDay],'')[0]._sourceTimeConstraint,undefined);
 const ambiguous={...r.stage3[0],name:'Knitting social',description:'AM/PM unknown',extractionReason:'Meridiem not printed',startTime:'1h30',endTime:'3h30'};
 assert.equal(constrainSourceTimes([ambiguous],'')[0]._sourceTimeConstraint?.reason,'unresolved_meridiem');
});

test('explicit one-hour duration survives Stage 5 and supersedes a same-date inferred end',()=>{
 const r=row(224), item=constrainSourceTimes(r.stage3,'')[0]; assert.equal(item.endTime,'18:30');
 const formatted=rehydrateFormattedEventMetadata({...r.events[0],endTime:'19:30'},item);
 assert.equal(formatted.endTime,'18:30'); assert.equal(formatted.timeFlags?.end.source,'implied');
 const previous=event({endTime:'19:30',timeFlags:{end:{source:'none'}},timeResolution:{endFromHours:'duration_default'}});
 const incoming=event({...formatted,uniqueId:'source_1'});
 assert.equal(merge(previous,incoming).updates.endTime,'18:30');
 const olderFamily={...previous,startDate:'2026-10-07',isRecurring:true,recurringPattern:'weekly_wednesday'};
 assert.equal(merge(olderFamily,incoming).updates.endTime,undefined,'a dated duration cannot change the entire earlier family');
 assert.equal(merge({...olderFamily,startDate:incoming.startDate},incoming).updates.endTime,undefined,'matching base date is not proof for every future class');
 const ambiguous={...item,_sourceDurationResolution:undefined,endTime:'',description:'Doors open one hour before the class'};
 assert.equal(constrainSourceTimes([ambiguous],'')[0].endTime,'');
 const conflict={...item,_sourceDurationResolution:undefined,endTime:'',description:'A one hour or two hour class'};
 assert.equal(constrainSourceTimes([conflict],'')[0].endTime,'');
});

test('recital and public aquatic access categories survive venue priors; cinema and lessons remain distinct',()=>{
 const r=row(136), item=r.stage3.find((x:any)=>/Violinist/.test(x.name));
 assert.equal(applyCategoryCorrectionsForRegression(event({...r.events.find((x:any)=>/Violinist/.test(x.name)),category:'Live Music'}),item).category,'Live Music');
 for(const name of ['Leisure and Toddler Pools Open','Walking Track','Lane Swim'])
  assert.equal(applyCategoryCorrectionsForRegression(event({name,description:'Public recreation',category:'Gatherings & Parties'}),{name,description:'Public recreation'} as any).category,'Sports');
 for(const name of ['Swimming lessons','Pool party'])
  assert.notEqual(applyCategoryCorrectionsForRegression(event({name,description:name}),{name,description:name} as any).category,'Sports');
 assert.equal(applyCategoryCorrectionsForRegression(event({name:'Film screening',establishment:'The Tivoli Cinema'}),{name:'Film screening'} as any).category,'Cinema');
});

test('weekday walking access retains all five weekdays and no invented season end',()=>{
 const r=row(330), item:any=constrainSourceTimes(r.stage3,r.caption)[0];
 assert.equal(item.recurringPattern,'weekly_custom');assert.deepEqual(item.recurringDaysOfWeek,['monday','tuesday','wednesday','thursday','friday']);
 const out=preserveValidatedOccurrence(r.events[0],item);
 assert.equal(out.recurringPattern,'weekly_custom');assert(!out.recurrenceUntilDate);
 const oneOff={...r.stage3[0],description:'One-day walking track session Monday only'};
 assert.equal((constrainSourceTimes([oneOff],'')[0] as any).recurringPattern,'none');
});

test('each Trailside ticket stays on its own date and doors-only clock is held',()=>{
 const r=row(163), items=constrainSourceTimes(r.stage3,r.caption);
 items.forEach((item:any,i:number)=>{
  assert.match(item.ticketLink,new RegExp('/'+(3328+i)+'/'));assert.equal(item.startTime,'');
  assert.equal(item._sourceTimeConstraint.reason,'doors_without_showtime');
  const out=rehydrateFormattedEventMetadata({...r.events[i],ticketLink:'https://trailside.ca',startTime:'18:30'},item);
  assert.equal(out.ticketLink,item.ticketLink);assert.equal(out.startTime,'');
 });
 const jazz=row(162);assert.equal(constrainSourceTimes(jazz.stage3,jazz.caption)[0].startTime,'19:00');
 const before=event({startTime:'18:30',timeFlags:{start:{source:'explicit',evidence:'doors-630-pm'}}});
 const after=event({startTime:'20:00',timeFlags:{start:{source:'explicit',evidence:'Linked performance timestamp'}}});
 assert.equal(merge(before,after).updates.startTime,'20:00');
 assert.equal(bindDatedTicketLink({...r.stage3[0],date:'2026-11-29'},r.caption).ticketLink,undefined);
 assert.equal(bindDatedTicketLink(r.stage3[0],r.caption+'\nhttps://locarius.io/events/999/another-oct-29th').ticketLink,undefined,'ambiguous binding remains unassigned');
});

test('adjacent screening mention cannot replace the primary film title or merge different cinema clocks',()=>{
 const r=row(143), source=constrainSourceTimes(r.stage3,r.caption)[0];assert.equal(source.name,'Screamplay!');
 const existing=event({name:'Screamplay! and Evil Dead II',eventName:'Screamplay! and Evil Dead II',category:'Cinema',establishment:'The Tivoli Cinema',startTime:'21:10'});
 const incoming=event({name:'Evil Dead II',eventName:'Evil Dead II',category:'Cinema',establishment:'The Tivoli Cinema',startTime:'19:15'});
 assert.equal(hasConflictingOccurrenceIdentity(incoming,existing),true);
 assert.equal(isDuplicateEntry(incoming,existing),false); assert.equal(isExactUniqueIdDuplicateCompatible(incoming,existing),false);
 assert.deepEqual(merge(existing,incoming).changedFields,[]);
 assert.equal(hasConflictingOccurrenceIdentity(incoming,{...incoming,uniqueId:'other'}),false);
 const joint=constrainSourceTimes(r.stage3,r.caption.split('OCR TEXT:')[0]+' Double-feature ticket: one ticket admits both films.')[0];assert.equal(joint.name,r.stage3[0].name);
});

test('expired bounded course cannot capture new cycle; still-covered and unbounded classes remain compatible',()=>{
 const keeper:any=fixture.keepers.find(x=>x.id==='dUp4A9jObgs6DwbXrPOA');
 const actual=row(136).events.find((x:any)=>/water.*colou?r.*course/i.test(x.name));assert(actual);
 const incoming=event({...actual,eventName:actual.name,establishment:keeper.establishment,venueId:keeper.venueId,uniqueId:'1562661692568029_new'});
 assert.equal(hasConflictingOccurrenceIdentity(incoming,keeper),true);
 assert.equal(isRecurringFamilyFallbackCompatible(incoming,keeper),false);assert.equal(getRecurringFamilyFallbackDiagnostics(incoming,keeper).compatible,false);
 assert.deepEqual(merge(keeper,incoming).changedFields,[]);
 assert.equal(hasConflictingOccurrenceIdentity({...incoming,startDate:'2026-09-29'},keeper),false);
 assert.equal(hasConflictingOccurrenceIdentity(incoming,{...keeper,totalOccurrences:null,recurrenceUntilDate:''}),false);
 assert.equal(hasConflictingOccurrenceIdentity({...incoming,uniqueId:keeper.uniqueId},keeper),false,'same source corrections retain existing compatibility gates');
});

test('same-source cinema date protection spans changed generated IDs but retains real multiple screenings',()=>{
 const before=event({name:'Back In Black',eventName:'Back In Black',category:'Cinema',uniqueId:'1645766067560308_old',startDate:'2026-10-14'});
 const incoming={...before,uniqueId:'1645766067560308_new',startDate:'2026-10-18',sourceOccurrenceCount:1};
 assert.equal(findConflictingSourceCinemaDate(incoming,[before],'v'),before);
 for(const patch of [{sourceOccurrenceCount:2},{sourceOccurrenceCount:undefined},{uniqueId:'other_new'},{startDate:before.startDate},{name:'Different film',eventName:'Different film'}])
  assert.equal(findConflictingSourceCinemaDate({...incoming,...patch},[before],'v'),undefined);
 const multi=row(143);assert(constrainSourceTimes(multi.stage3,multi.caption).every(x=>x._sourceOccurrenceCount===2));
 const mixedVenueNames=[{...multi.stage3[0],venue:'Tivoli Cinema'},{...multi.stage3[1],venue:''}];
 assert(constrainSourceTimes(mixedVenueNames,multi.caption).every(x=>x._sourceOccurrenceCount===2),'multiple dates remain multiple even if raw venue aliases differ');
 const otherDate={...multi.stage3[0],date:'2026-10-21',_sourceOccurrenceCount:2};
 assert.equal(constrainSourceTimes([otherDate],multi.caption)[0]._sourceOccurrenceCount,2,'downstream filtering cannot erase source multiplicity');
});

test('placeholder identities and private occupied slots are held; public rental availability is kept',()=>{
 assert.equal(sourceItemHoldReason(row(225).stage3[0]),'activity_identity_not_visible');
 const privateItem=row(294).stage3.find((x:any)=>/Private Rental/.test(x.name));assert(privateItem);
 assert.equal(sourceItemHoldReason(privateItem),'private_occupied_slot');
 for(const name of ['Available to Rent','Book your private party','Private rental available for booking','Family Public Skate'])assert.equal(sourceItemHoldReason({name,description:name} as any),undefined);
 assert.equal(sourceItemHoldReason({name:'Private rental',description:'Not available for booking; occupied'} as any),'private_occupied_slot');
});
