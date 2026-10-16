import test from 'node:test';import assert from 'node:assert/strict';
import {literalFestivalProgrammeHeading} from './festivalProgrammeHeading.js';
import {expandFestivalSourceScope} from './festivalSourceScope.js';
import {resolveFestivalMembership,festivalVenueMentionLabel} from './festivalLinker.js';
import type {FestivalSourceEvidence} from './festivalLinker.js';

function fixture(header='2026 HARBOUR Pumpkin FESTIVAL OCTOBER 15 TO 31'){
 const date='FRIDAY, OCTOBER 16',row='6 p.m.\nMystery Night\nLocation: Community Centre';
 const documents=[{index:-1,text:'Here is the festival schedule.'},{index:0,text:header+'\n\n'+date+'\n'+row}];
 const expanded=expandFestivalSourceScope({scopeText:row,dateText:date,timeText:'6 p.m.',venueText:'Community Centre',sourceIndices:[0]},documents);
 assert(expanded.sourceScope);
 const e:FestivalSourceEvidence={id:'row_fixture',kind:'programme_row',source:{id:'source_fixture',url:'https://organizer.example/programme',text:documents.map(d=>d.text).join('\n'),documents,publisherId:'publisher_fixture',organizerId:'organizer_fixture'},...expanded,
  membershipText:header,festivalNameText:'HARBOUR Pumpkin FESTIVAL',yearText:'2026',activity:{name:'Mystery Night',venueId:'centre_fixture',startDate:'2026-10-16',startTime:'18:00'},eventText:'Mystery Night'};
 const edition={id:'festival_fixture',name:'Harbour Pumpkin Festival',year:2026,startDate:'2026-10-15',endDate:'2026-10-31',organizerId:'organizer_fixture',organizerNames:['Festival organizer'],sourceIds:['source_fixture']};
 const input={umbrella:edition,sources:[e],venues:[{id:'centre_fixture',label:'Community Centre',latitude:46.3,longitude:-63.1}],candidates:[{path:'venues/centre_fixture/events/night_fixture',data:{eventName:'Mystery Night',venueId:'centre_fixture',startDate:'2026-10-16',endDate:'2026-10-16',startTime:'18:00',isRecurring:'No'}}]};
 const heading=()=>literalFestivalProgrammeHeading({documents:e.source.documents!,scope:e.sourceScope,festivalNameText:e.festivalNameText,yearText:e.yearText});
 return{e,input,heading};
}
test('year-first poster title binds same-image programme without a Programme keyword',async()=>{
 const f=fixture();assert.equal(f.heading(),f.e.membershipText);const r=await resolveFestivalMembership(f.input);assert.equal(r.links.length,1);assert.equal(r.outcomes[0].reason,'eligible');
 assert.equal((await resolveFestivalMembership({...f.input,sources:[...f.input.sources,...f.input.sources]})).links.length,1);
});
test('festival-first poster title also binds the exact edition',()=>{
 const f=fixture('HARBOUR Pumpkin FESTIVAL 2026 OCTOBER 15 TO 31');assert.equal(f.heading(),f.e.membershipText);
});
test('caption schedule wording can defer to the independently scoped literal image edition',async()=>{
 const f=fixture();f.e.membershipText=f.e.source.documents![0].text;
 assert.equal((await resolveFestivalMembership(f.input)).links.length,1);
});
test('poster evidence does not bypass reviewed source ownership',async()=>{
 const f=fixture();for(const umbrella of [{...f.input.umbrella,sourceIds:[]},{...f.input.umbrella,organizerId:'another_organizer'}])assert.equal((await resolveFestivalMembership({...f.input,umbrella})).links.length,0);
});
test('another gallery image, a caption, biography, repeated heading and wrong year cannot bind',()=>{
 const f=fixture();const docs=f.e.source.documents!;
 assert.equal(literalFestivalProgrammeHeading({documents:[{index:-1,text:docs[1].text},{index:0,text:'Unrelated programme'}],scope:f.e.sourceScope,festivalNameText:f.e.festivalNameText,yearText:'2026'}),undefined);
 for(const header of ['2025 HARBOUR Pumpkin FESTIVAL OCTOBER 15 TO 31','Previously performed at HARBOUR Pumpkin FESTIVAL 2026','HARBOUR Pumpkin FESTIVAL 2026 and 2025 Programme'])assert.equal(fixture(header).heading(),undefined);
 const repeated=fixture();repeated.e.source.documents![1].text+='\n\n'+repeated.e.membershipText;assert.equal(repeated.heading(),undefined);
 const caption=fixture();caption.e.sourceScope={...caption.e.sourceScope!,documentIndex:-1};assert.equal(caption.heading(),undefined);
});
test('poster title cannot override the printed row date or an ambiguous canonical child',async()=>{
 const f=fixture();assert.equal((await resolveFestivalMembership({...f.input,sources:[{...f.e,activity:{...f.e.activity,startDate:'2026-10-17'}}]})).links.length,0);
 const duplicate={...f.input.candidates[0],path:'venues/centre_fixture/events/duplicate_fixture'};assert.equal((await resolveFestivalMembership({...f.input,candidates:[...f.input.candidates,duplicate]})).outcomes[0].reason,'ambiguous_canonical');
});
test('another festival edition heading on the image stops an earlier poster heading',async()=>{
 const f=fixture('2026 HARBOUR Pumpkin FESTIVAL OCTOBER 15 TO 31\n\nAnother Festival 2026');const r=await resolveFestivalMembership(f.input);assert.equal(r.links.length,0);assert.equal(r.outcomes[0].reason,'unbound_programme');
});
test('literal interior context matches only its exact known parent; bare rooms, roads and vague nearby wording hold',()=>{
 const venue={id:'centre_fixture',label:'Community Centre',latitude:46.3,longitude:-63.1};
 assert.equal(festivalVenueMentionLabel(venue,'the corridors of the Community Centre'),'the corridors of the Community Centre');
 for(const mention of ['Ballroom','Community Centre Road','near Community Centre','the corridors of a different centre','grounds of Community Centre'])assert.equal(festivalVenueMentionLabel(venue,mention),undefined);
});
