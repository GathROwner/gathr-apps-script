import test from 'node:test';
import assert from 'node:assert/strict';
import {previewDuplicateMerge} from './rowProcessor.js';
const owner='https://www.facebook.com/babasloungepei';
const existing:any={uniqueId:'owner_1',name:'Island Jazz ft. Nadine Haddad',eventName:'Island Jazz ft. Nadine Haddad',
  venueId:'babas',category:'Live Music',eventType:'live_music',startDate:'2026-10-15',startTime:'20:00',endDate:'2026-10-15',endTime:'22:00',
  facebookUrl:owner,description:'A jazz show.',isRecurring:'No',recurringPattern:'none',
  relevantImageUrl:'https://storage.googleapis.com/gathr-uploaded-images/postimages/nadine.webp',
  image:'https://storage.googleapis.com/gathr-uploaded-images/postimages/nadine.webp',
  mediaUrls:['https://storage.googleapis.com/gathr-uploaded-images/postimages/nadine.webp']};
const incoming:any={...existing,uniqueId:'downtown_1',description:'Nadine Haddad performs with her quartet in two sets. Doors open before the show.',
  facebookUrl:'https://www.facebook.com/DowntownCharlottetownInc',sourceTimestamp:'2026-10-14T14:00:00Z',
  image:'https://storage.googleapis.com/gathr-uploaded-images/postimages/downtown-collage.webp',
  relevantImageUrl:'https://storage.googleapis.com/gathr-uploaded-images/postimages/downtown-collage.webp',
  mediaUrls:['https://storage.googleapis.com/gathr-uploaded-images/postimages/downtown-collage.webp']};
const venue:any={id:'babas',name:"Baba's Lounge",facebookUrl:owner};
test('a Downtown roundup cannot repaint the venue owner poster during duplicate enrichment',()=>{
  const result=previewDuplicateMerge({existingEvent:existing,incomingEvent:incoming,venue});
  for(const field of ['image','imageUrl','relevantImageUrl','mediaUrls','imageProvenance','icon'])assert(!result.changedFields.includes(field));
});
test('the owner can still refresh its own poster',()=>{
  const result=previewDuplicateMerge({existingEvent:existing,incomingEvent:{...incoming,uniqueId:existing.uniqueId,facebookUrl:owner},venue});
  assert(result.changedFields.includes('mediaUrls'));
});
