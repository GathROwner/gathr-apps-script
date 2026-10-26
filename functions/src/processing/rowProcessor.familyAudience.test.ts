import test from 'node:test';
import assert from 'node:assert/strict';
import {previewDuplicateMerge,previewFullParserEventWritePayload,createFullParserVenueLookupCache} from './rowProcessor.js';
import {bindFamilyAudienceEvidence} from '../utils/familyFriendlyScoring.js';
import {validFamilyAudienceEvidence} from '../services/familyAudienceEvidence.js';
const venue:any={id:'fixture',name:'Fixture Venue',normalizedName:'fixture venue',address:'145 Richmond St, Charlottetown, PE',latitude:46.2348,longitude:-63.1268,facebookUrl:'https://www.facebook.com/FixtureVenue'};
const item:any={uniqueId:'source_item',eventName:'Community Concert',name:'Community Concert',venueId:'fixture',establishment:venue.name,venue:venue.name,category:'Live Music',isEvent:'Yes',isFoodSpecial:'No',eventType:'special_event',description:'An afternoon concert.',startDate:'2026-10-17',endDate:'2026-10-17',startTime:'16:00',endTime:'17:00',isRecurring:false,recurringPattern:'none',ticketPrice:'',ticketLink:'',relevantImageIndex:0,additionalLocation:'',address:venue.address,mediaUrls:[]};

test('real payload transfers scoped evidence and never scores the whole row/gallery',async()=>{
  const row:any={uniqueId:'source-exact-id',text:'Another venue: family day, children ages 6–12.',ocrText:'Cocktails for adults only. 19+',mediaUrls:[],userName:venue.name,pageName:venue.name,timestamp:'2026-10-15T12:00:00Z',facebookUrl:venue.facebookUrl};
  const lookup=createFullParserVenueLookupCache(async()=>({isMatch:true,matchType:'exact',confidence:1,venue} as any),async()=>({isMatch:true,matchType:'exact',confidence:1,venue} as any));
  const without=await previewFullParserEventWritePayload(item,row,1,0,venue,venue.name,lookup);
  assert(without.familyFriendlyScore!<60);
  const bound={...item,familyAudienceEvidence:bindFamilyAudienceEvidence(item,'A family-friendly concert.','validated_item','source-exact-id')};
  const withProof=await previewFullParserEventWritePayload(bound,row,1,0,venue,venue.name,lookup);
  assert(withProof.familyFriendlyScore!>=60);
  assert(validFamilyAudienceEvidence(withProof));
  assert.deepEqual(withProof.sourceUniqueIds,['source-exact-id']);
  for(const field of ['startDate','startTime','endDate','endTime','venueId','mediaUrls','description']) assert.deepEqual((withProof as any)[field],(without as any)[field]);
});

test('real duplicate merge retains validated context and rejects stale score/contradictory audience',()=>{
  const existing={...item,familyAudienceEvidence:bindFamilyAudienceEvidence(item,'A family-friendly concert.','reviewed_activity','source-older')};
  const refresh={...item,description:'An updated afternoon concert programme.'};
  const first=previewDuplicateMerge({existingEvent:existing,incomingEvent:refresh,venue});
  assert(first.updates.familyFriendlyScore!>=60);
  const second=previewDuplicateMerge({existingEvent:{...existing,...first.updates},incomingEvent:refresh,venue});
  assert.equal(second.updates.familyFriendlyScore,undefined);
  assert.equal(second.updates.familyAudienceEvidence,undefined);
  const restricted=previewDuplicateMerge({existingEvent:existing,incomingEvent:{...item,description:'19+'},venue});
  assert.equal(restricted.updates.familyFriendlyScore,0);
  const unbound=previewDuplicateMerge({existingEvent:item,incomingEvent:{...refresh,familyFriendlyScore:100,familyFriendlyLevel:'high',familyFriendlyScoringVersion:'family-friendly-v5',familyFriendlyReasons:['explicit_family_audience']},venue});
  assert(unbound.updates.familyFriendlyScore!<60);
});
