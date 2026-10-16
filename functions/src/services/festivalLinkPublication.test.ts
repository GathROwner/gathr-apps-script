import test from 'node:test';import assert from 'node:assert/strict';
import {planFestivalLinkPublication as plan,assertFestivalPublicationFence as fence,FESTIVAL_PUBLICATION_POLICY} from './festivalLinkPublication.js';
import type {FestivalPublicationInput} from './festivalLinkPublication.js';
const input=():FestivalPublicationInput=>{
 const heading='ANCHOR Fest 2026 Programme',row='Unholy Night | October 17 | 7:00 pm | Tivoli Cinema';
 return {edition:{id:'festival_fixture',name:'ANCHOR Fest',year:2026,startDate:'2026-10-14',endDate:'2026-10-18',organizerId:'organizer_fixture',organizerNames:['AMPA'],sourceIds:['programme_source']},
  umbrella:{path:'events/festival_fixture',data:{locationScope:'area',cityLevelReviewId:'review_fixture',startDate:'2026-10-14',endDate:'2026-10-18',description:'Reviewed description',startTime:'',areaData:{version:1,status:'partial',locations:[{id:'tivoli_point',label:'Tivoli Cinema',venueId:'tivoli_fixture',certainty:'confirmed',coordinates:{latitude:46.2,longitude:-63.1},linkedEventIds:['human_fixture']}]}}},
  review:{path:'city_level_event_reviews/review_fixture',data:{status:'published',publishedEventPath:'events/festival_fixture',finalization:{action:'approve_publish',manual:{areaData:{version:1}}}}},
  completion:{fileId:'dataset_fixture',checkpointExists:false,lock:{fileId:'dataset_fixture',runId:'run_fixture',status:'completed'},marker:{fileId:'dataset_fixture'},batch:{fileId:'dataset_fixture',runId:'run_fixture',status:'completed',currentRowIndex:20,totalRows:20}},sourceInventoryComplete:true,
  sources:[{id:'evidence_fixture',source:{id:'programme_source',url:'https://festival.example/programme',text:heading+'\n'+row,publisherId:'publisher_fixture',organizerId:'organizer_fixture'},kind:'programme_row',scopeText:row,membershipText:heading,festivalNameText:'ANCHOR Fest',yearText:'2026',activity:{name:'Unholy Night',venueId:'tivoli_fixture',startDate:'2026-10-17',startTime:'19:00'},eventText:'Unholy Night',dateText:'October 17',timeText:'7:00 pm',venueText:'Tivoli Cinema'}],
  candidates:[{path:'venues/tivoli_fixture/events/child_fixture',data:{eventName:'Unholy Night',venueId:'tivoli_fixture',startDate:'2026-10-17',endDate:'2026-10-17',startTime:'19:00',isRecurring:'No'}}],
  venues:[{id:'tivoli_fixture',label:'Tivoli Cinema',latitude:46.2,longitude:-63.1}]};
};
test('writer adds only exact verified existing children; keeps human links and point fields',async()=>{
 const x=input(),before=JSON.stringify(x),r=await plan(x);assert.equal(r.status,'ready');assert.deepEqual(r.addedEventIds,['child_fixture']);
 assert.deepEqual(r.areaData?.locations[0].linkedEventIds,['human_fixture','child_fixture']);assert.equal(JSON.stringify(x),before);assert.equal(r.ownership?.machineLinks.length,1);
 assert.equal((r.areaData as any).description,undefined);assert.equal(JSON.stringify(r.areaData).includes('sourceText'),false);
});
test('order-independent replay adds no duplicates and never adopts manually existing links',async()=>{
 const x=input(),first=await plan(x);x.umbrella.data.areaData=first.areaData;x.ownership=first.ownership;
 const replay=await plan(x);assert.deepEqual(replay.addedEventIds,[]);assert.deepEqual(replay.areaData,first.areaData);
 const manual=input();manual.umbrella.data.areaData.locations[0].linkedEventIds.push('child_fixture');const result=await plan(manual);assert.equal(result.ownership?.machineLinks.length,0);
});
test('manual removal of a machine link creates a sticky suppression, even after later arrival',async()=>{
 const x=input(),first=await plan(x);x.ownership=first.ownership;const r=await plan(x);assert.deepEqual(r.addedEventIds,[]);assert.deepEqual(r.ownership?.suppressedEventIds,['child_fixture']);
 x.ownership=r.ownership;assert.deepEqual((await plan(x)).addedEventIds,[]);
});
test('one unreadable source or incomplete final run blocks all public changes',async()=>{
 for(const change of [(x:FestivalPublicationInput)=>x.sourceInventoryComplete=false,(x:FestivalPublicationInput)=>x.completion.checkpointExists=true,(x:FestivalPublicationInput)=>x.completion.marker!.dryRun=true]){const x=input();change(x);assert.equal((await plan(x)).status,'held');}
});
test('revoked manual edition approval, changed date or wrong review holds',async()=>{
 for(const change of [(x:FestivalPublicationInput)=>x.review.data.status='held',(x:FestivalPublicationInput)=>x.review.data.finalization.action='reject',(x:FestivalPublicationInput)=>x.umbrella.data.endDate='2026-10-19',(x:FestivalPublicationInput)=>x.review.path='city_level_event_reviews/other']){const x=input();change(x);assert.equal((await plan(x)).status,'held');}
});
test('missing child remains pending, then links once the exact child arrives',async()=>{
 const x=input(),children=x.candidates;x.candidates=[];let r=await plan(x);assert.deepEqual(r.addedEventIds,[]);assert.equal(r.result?.outcomes[0].pending,true);
 x.candidates=children;r=await plan(x);assert.deepEqual(r.addedEventIds,['child_fixture']);
});
test('conflicting date/time/venue never creates or rematches a child',async()=>{
 for(const change of [{startTime:'21:00'},{venueId:'other_fixture'},{startDate:'2026-10-16'},{isRecurring:'Yes'}]){const x=input();Object.assign(x.candidates[0].data,change);assert.deepEqual((await plan(x)).addedEventIds,[]);}
});
test('new, ambiguous, approximate or moved points cannot be silently invented',async()=>{
 for(const change of [(x:FestivalPublicationInput)=>x.umbrella.data.areaData.locations[0].venueId='other_fixture',(x:FestivalPublicationInput)=>x.umbrella.data.areaData.locations.push({...x.umbrella.data.areaData.locations[0],id:'another_point'}),(x:FestivalPublicationInput)=>x.umbrella.data.areaData.locations[0].certainty='approximate',(x:FestivalPublicationInput)=>x.umbrella.data.areaData.locations[0].coordinates.latitude=47]){const x=input();change(x);assert.equal((await plan(x)).status,'held');}
});
test('invalid or foreign ownership state holds',async()=>{
 const x=input();x.ownership={version:1,umbrellaPath:'events/other_fixture',policy:FESTIVAL_PUBLICATION_POLICY,machineLinks:[],suppressedEventIds:[]};assert.equal((await plan(x)).status,'held');
});
test('the 100-link point contract is revalidated after additions without truncating human links',async()=>{
 const x=input();x.umbrella.data.areaData.locations[0].linkedEventIds=Array.from({length:100},(_,i)=>'human_'+i);const r=await plan(x);assert.equal(r.status,'held');assert.equal(r.reason,'public_area_contract_limit');assert.equal(x.umbrella.data.areaData.locations[0].linkedEventIds.length,100);
});
test('source inventory omission cannot be disguised by an eligible-only result',async()=>{
 const x=input();x.sourceInventoryComplete=false;const r=await plan(x);assert.equal(r.reason,'source_inventory_incomplete');assert.equal(r.areaData,undefined);
});
test('transaction fences stale workers, nanosecond drift, missing references and active parses',()=>{
 const claim:any={status:'running',generation:2,workerToken:'worker_fixture',inputFingerprint:'fingerprint_fixture',leaseUntilMs:2000};
 const refs=[{path:'events/festival_fixture',version:{seconds:100,nanoseconds:12}}],read=new Map([[refs[0].path,{exists:true,version:{...refs[0].version}}]]);
 assert.doesNotThrow(()=>fence(claim,claim,1000,refs,read,false));
 for(const [current,now,active]of [[{...claim,generation:3},1000,false],[{...claim,workerToken:'older_worker'},1000,false],[{...claim,inputFingerprint:'changed'},1000,false],[claim,2000,false],[claim,1000,true]] as const)assert.throws(()=>fence(current,claim,now,refs,read,active));
 read.set(refs[0].path,{exists:true,version:{seconds:100,nanoseconds:13}});assert.throws(()=>fence(claim,claim,1000,refs,read,false),/reference_drift/);
 assert.throws(()=>fence(claim,claim,1000,refs,new Map(),false));
});
