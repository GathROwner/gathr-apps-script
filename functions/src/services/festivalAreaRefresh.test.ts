import test from 'node:test';import assert from 'node:assert/strict';import {restoreFestivalAreaRefresh} from './festivalAreaRefresh.js';
function fixture(){
 const point={id:'centre_point',label:'Community Centre',venueId:'centre_fixture',certainty:'confirmed',coordinates:{latitude:46.3,longitude:-63.1},linkedEventIds:[] as string[]};
 const approvedArea={version:1,status:'partial',locations:[point]},previousArea=structuredClone(approvedArea);previousArea.locations[0].linkedEventIds=['night_fixture'];
 const proof={eventPath:'venues/centre_fixture/events/night_fixture',eventName:'Mystery Night',venueId:'centre_fixture',startDate:'2026-10-16',startTime:'18:00',festivalName:'Example Festival',sourceUrl:'https://organizer.example/programme',sourceText:'Example Festival 2026\nMystery Night | October 16 | 6 pm | Community Centre',sourceEventText:'Mystery Night',sourceDateText:'October 16',sourceTimeText:'6 pm',sourceVenueText:'Community Centre'};
 const ownership={version:1,umbrellaPath:'events/festival_fixture',policy:'source-verified-additions-v1',machineLinks:[{eventId:'night_fixture',venueId:'centre_fixture',fingerprint:'a'.repeat(64)}],suppressedEventIds:[] as string[],proofs:{night_fixture:{fingerprint:'a'.repeat(64),evidence:[proof]}}};
 const child={eventName:proof.eventName,venueId:proof.venueId,startDate:proof.startDate,endDate:proof.startDate,startTime:proof.startTime,isRecurring:'No'};
 const read=async(p:string)=>p===proof.eventPath?child:p==='venues/centre_fixture'?{latitude:46.3,longitude:-63.1}:undefined;
 return{eventPath:'events/festival_fixture',eventName:'Example Festival 2026',startDate:'2026-10-15',endDate:'2026-10-31',approvedArea,previousArea,ownership,read,child,proof};
}
test('source refresh preserves actual machine links while keeping the approved manual schedule empty',async()=>{
 const f=fixture(),before=JSON.stringify(f.approvedArea),r=await restoreFestivalAreaRefresh(f);assert.deepEqual(r.areaData.locations[0].linkedEventIds,['night_fixture']);assert.equal(JSON.stringify(f.approvedArea),before);assert.equal(JSON.stringify(r.areaData).includes('sourceText'),false);
});
test('removed and suppressed machine links are never restored',async()=>{
 for(const removed of [true,false]){const f=fixture();if(removed)f.previousArea.locations[0].linkedEventIds=[];else f.ownership.suppressedEventIds=['night_fixture'];assert.deepEqual((await restoreFestivalAreaRefresh(f)).areaData.locations[0].linkedEventIds,[]);}
});
test('expired child deletion prunes the link; changed clock or edition window holds the refresh',async()=>{
 const missing=fixture();const read=missing.read;missing.read=async p=>p===missing.proof.eventPath?undefined:read(p);assert.deepEqual((await restoreFestivalAreaRefresh(missing)).areaData.locations[0].linkedEventIds,[]);
 const changed=fixture();changed.child.startTime='19:00';await assert.rejects(restoreFestivalAreaRefresh(changed),/occurrence changed/);
 const window=fixture();window.startDate='2026-10-17';await assert.rejects(restoreFestivalAreaRefresh(window),/occurrence changed/);
});
test('ownership and source-proof drift cannot overwrite a current schedule',async()=>{
 const wrong=fixture();wrong.ownership.umbrellaPath='events/another';await assert.rejects(restoreFestivalAreaRefresh(wrong),/ownership/);
 const proof=fixture();proof.ownership.proofs.night_fixture.fingerprint='b'.repeat(64);await assert.rejects(restoreFestivalAreaRefresh(proof),/refresh proof/);
});
test('literal interior location proof survives refresh at the existing canonical parent',async()=>{
 const f=fixture();f.proof.sourceVenueText='the corridors of the Community Centre';f.proof.sourceText+='\n'+f.proof.sourceVenueText;assert.deepEqual((await restoreFestivalAreaRefresh(f)).areaData.locations[0].linkedEventIds,['night_fixture']);
 f.proof.sourceVenueText='the corridors of a different centre';f.proof.sourceText+='\n'+f.proof.sourceVenueText;await assert.rejects(restoreFestivalAreaRefresh(f),/source-bound festival membership/);
});
