import test from 'node:test';import assert from 'node:assert/strict';
import {validateEventProgrammeData,verifyVenueProgrammeReferences} from './venueProgramme.js';
import {buildEventUpdatePayloadForRegression} from './firestoreService.js';
const data=()=>({version:1 as const,status:'partial' as const,venueId:'fixture_hall',linkedEventIds:['band_fixture'],sourceUrl:'https://venue.example/events/autumn-fest/',sourceLabel:'Official programme'});
const child=()=>({venueId:'fixture_hall',eventName:'Band One',startDate:'2026-10-17',endDate:'2026-10-17',startTime:'15:00',endTime:'17:00',isRecurring:'No'});
const proof=()=>({eventPath:'venues/fixture_hall/events/band_fixture',eventName:'Band One',venueId:'fixture_hall',startDate:'2026-10-17',startTime:'15:00',festivalName:'Autumn Fest',sourceUrl:data().sourceUrl,
 sourceText:'Autumn Fest, October 17, 2026 at Example Hall. Band One 3:00 PM.',sourceEventText:'Band One',sourceDateText:'October 17, 2026',sourceTimeText:'3:00 PM',sourceVenueText:'Example Hall'});
const input=()=>({eventPath:'venues/fixture_hall/events/parent_fixture',eventName:'Autumn Fest',startDate:'2026-10-17',endDate:'2026-10-17',programmeData:data(),evidence:[proof()],read:async(p:string)=>p==='venues/fixture_hall'?{name:'Example Hall',latitude:46.2,longitude:-63.1}:p===proof().eventPath?child():undefined});
test('single-venue programme retains canonical exact children without changing the public venue scope',async()=>assert.deepEqual(await verifyVenueProgrammeReferences(input()),data()));
test('literal official programme clocks written with to remain source excerpts, not synthesized times',async()=>{
 const p={...proof(),sourceText:proof().sourceText.replace('3:00 PM','3:00 to 5:00 pm'),sourceTimeText:'3:00 to 5:00 pm'};
 assert.deepEqual(await verifyVenueProgrammeReferences({...input(),evidence:[p]}),data());
});
test('programme public whitelist drops review evidence and defensively clones IDs',()=>{
 const d={...data(),proof:proof(),reviewReasons:['private']};const clean=validateEventProgrammeData(d,'fixture_hall');assert.deepEqual(clean,data());clean.linkedEventIds.push('different');assert.deepEqual(d.linkedEventIds,['band_fixture']);
});
test('invalid owners, duplicate IDs, unbounded inventory and credential URLs fail closed',()=>{
 for(const change of [{venueId:'another'},{linkedEventIds:['band_fixture','band_fixture']},{linkedEventIds:['venues/other/events/x']},{linkedEventIds:Array.from({length:101},(_,i)=>'id'+i)},{sourceUrl:'https://user:password@example.com/x'},{sourceUrl:'javascript:alert(1)'}])assert.throws(()=>validateEventProgrammeData({...data(),...change},'fixture_hall'));
});
test('venue programme rejects self link, absent child and wrong venue/date/time',async()=>{
 await assert.rejects(verifyVenueProgrammeReferences({...input(),eventPath:'events/parent_fixture'}));
 await assert.rejects(verifyVenueProgrammeReferences({...input(),programmeData:{...data(),linkedEventIds:['parent_fixture']}}));
 for(const change of [undefined,{...child(),venueId:'other'},{...child(),startDate:'2026-10-18'},{...child(),startTime:'16:00'},{...child(),status:'deleted'}])await assert.rejects(verifyVenueProgrammeReferences({...input(),read:async p=>p==='venues/fixture_hall'?{name:'Example Hall',latitude:46.2,longitude:-63.1}:change}));
});
test('same venue/date alone never establishes festival membership',async()=>{
 await assert.rejects(verifyVenueProgrammeReferences({...input(),evidence:[]}));
 await assert.rejects(verifyVenueProgrammeReferences({...input(),evidence:[{...proof(),sourceText:'Ordinary business hours'}]}));
});
test('normal parser update payload cannot clear approved programme metadata by omission',()=>{
 const before={...child(),programmeData:data(),locationScope:'venue'};
 const updates=buildEventUpdatePayloadForRegression({description:'Fresh source caption'});
 assert.equal(Object.hasOwn(updates,'programmeData'),false);
 assert.deepEqual({...before,...updates}.programmeData,data());
 assert.equal({...before,...updates}.locationScope,'venue');
});
