import test from 'node:test';import assert from 'node:assert/strict';
import {previewDuplicateMerge,previewFullParserEventWritePayload,createFullParserVenueLookupCache} from './rowProcessor.js';
const venue:any={id:'fixture',name:'Fixture Venue',normalizedName:'fixture venue',address:'145 Richmond St, Charlottetown, PE',latitude:46.2348,longitude:-63.1268,facebookUrl:'https://www.facebook.com/FixtureVenue'};
const event:any={uniqueId:'legacy_1',eventName:"L'Autre (The Other)",name:"L'Autre (The Other)",venueId:'fixture',establishment:'Fixture Venue',category:'Cinema',isEvent:'Yes',isFoodSpecial:'No',eventType:'special_event',description:'Festival screening',startDate:'2026-10-16',endDate:'2026-10-16',startTime:'20:00',endTime:'22:00',isRecurring:false,recurringPattern:'none',facebookUrl:'https://www.facebook.com/CityCinemaChtown',relevantImageUrl:'https://storage.googleapis.com/gathr-uploaded-images/postimages/original.webp',image:'https://storage.googleapis.com/gathr-uploaded-images/postimages/original.webp',mediaUrls:['https://storage.googleapis.com/gathr-uploaded-images/postimages/original.webp']};
test('ordinary parser payload binds exact source ID without location-role metadata',async()=>{
  const item:any={...event,ticketPrice:'',ticketLink:'',relevantImageIndex:0,venue:'Fixture Venue',additionalLocation:'',address:venue.address,imageUrl:event.image,mediaUrls:event.mediaUrls};
  const row:any={uniqueId:'source-exact-id',text:'Film October 16 at 8 pm',mediaUrls:[],userName:'Fixture Venue',pageName:'Fixture Venue',timestamp:'2026-10-15T12:00:00Z',facebookUrl:venue.facebookUrl};
  const lookup=createFullParserVenueLookupCache(async()=>({isMatch:true,matchType:'exact',confidence:1,venue} as any),async()=>({isMatch:true,matchType:'exact',confidence:1,venue} as any));
  const payload=await previewFullParserEventWritePayload(item,row,1,0,venue,venue.name,lookup);
  assert.deepEqual(payload.sourceUniqueIds,['source-exact-id']);
  assert.deepEqual(payload.sourceUrls,[venue.facebookUrl]);
});
test('safe merge preserves independent source provenance and specific keeper media',()=>{
  const incoming:any={...event,uniqueId:'aggregator_2',facebookUrl:'https://www.facebook.com/DowntownCharlottetownInc',sourceUniqueIds:['actual-source-id'],sourceUrls:['https://www.facebook.com/post/actual-source-id'],sourceTimestamp:new Date('2026-10-15T12:00:00Z'),image:'https://storage.googleapis.com/gathr-uploaded-images/postimages/generic.webp',relevantImageUrl:'https://storage.googleapis.com/gathr-uploaded-images/postimages/generic.webp',mediaUrls:['https://storage.googleapis.com/gathr-uploaded-images/postimages/generic.webp']};
  const result=previewDuplicateMerge({existingEvent:event,incomingEvent:incoming,venue});
  assert.deepEqual(result.updates.sourceUniqueIds,['actual-source-id']);
  assert.equal(result.updates.image,undefined);assert.equal(result.updates.relevantImageUrl,undefined);assert.equal(result.updates.mediaUrls,undefined);
  const again=previewDuplicateMerge({existingEvent:{...event,...result.updates},incomingEvent:incoming,venue});
  assert.equal(again.updates.sourceUniqueIds,undefined);
});
test('conflicting occurrence cannot gain another source ownership',()=>{
  const outcome=previewDuplicateMerge({existingEvent:event,incomingEvent:{...event,startDate:'2026-10-17',endDate:'2026-10-17',sourceUniqueIds:['unrelated']},venue});
  assert.equal(outcome.updates.sourceUniqueIds,undefined);
});
