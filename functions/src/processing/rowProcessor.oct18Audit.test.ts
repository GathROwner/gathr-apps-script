import test from 'node:test';
import assert from 'node:assert/strict';
import {previewDuplicateMerge,resolveVenueForFullParserEventWithMatcherForRegression} from './rowProcessor.js';
const venue:any={id:'library',name:'Library',facebookUrl:'https://www.facebook.com/PEILibrary'};
const existing:any={uniqueId:'1406589781656692_1',eventName:'Creative Kids program',name:'Creative Kids program',venueId:'library',facebookUrl:venue.facebookUrl,
 category:'Workshops & Classes',eventType:'workshops_classes',description:'Join us weekly for after-school crafts. September’s theme is Maker Skills, where we explore basic craft techniques.',
 startDate:'2026-09-16',endDate:'2026-09-16',startTime:'15:30',endTime:'16:30',isRecurring:'Yes',recurringPattern:'weekly_wednesday',sourceTimestamp:new Date('2026-09-15T12:00:00Z')};
test('newer same-source recurring programme theme replaces stale longer monthly copy',()=>{
 const incoming:any={...existing,uniqueId:'1436879098627760_1',eventName:'Creative Kids: Write It, Draw It!',name:'Creative Kids: Write It, Draw It!',startDate:'2026-10-21',endDate:'2026-10-21',description:'This month we are writing, drawing and telling stories.',sourceTimestamp:new Date('2026-10-17T12:00:00Z')};
 const r=previewDuplicateMerge({existingEvent:existing,incomingEvent:incoming,venue});assert.equal(r.updates.description,incoming.description);
 assert(!r.changedFields.includes('recurringPattern'));assert(!r.changedFields.includes('startDate'));
 const stale=previewDuplicateMerge({existingEvent:existing,incomingEvent:{...incoming,sourceTimestamp:new Date('2026-09-01T12:00:00Z')},venue});assert.equal(stale.updates.description,undefined);
 const other=previewDuplicateMerge({existingEvent:existing,incomingEvent:{...incoming,facebookUrl:'https://www.facebook.com/Other'},venue});assert.equal(other.updates.description,undefined);
});
test('generic video frame cannot repaint an existing managed poster; genuine owner poster still can',()=>{
 const poster='https://storage.googleapis.com/gathr-uploaded-images/postimages/poster.webp',frame='https://storage.googleapis.com/gathr-uploaded-images/postimages/frame.webp';
 const before:any={...existing,isRecurring:'No',recurringPattern:'none',image:poster,relevantImageUrl:poster,mediaUrls:[poster],imageProvenance:{isFallback:false,selectionReason:'model_selected_original_image_index'}};
 const after:any={...before,sourceTimestamp:new Date('2026-10-17T12:00:00Z'),description:'An updated description with much more information about this event and its venue and admission details.',image:frame,relevantImageUrl:frame,mediaUrls:[frame],imageProvenance:{isFallback:false,selectionReason:'model_selected_analysis_frame_source; generic_video_frame_without_event_details'}};
 const r=previewDuplicateMerge({existingEvent:before,incomingEvent:after,venue});for(const field of ['image','imageUrl','relevantImageUrl','mediaUrls','imageProvenance'])assert(!r.changedFields.includes(field));
 const valid=previewDuplicateMerge({existingEvent:before,incomingEvent:{...after,imageProvenance:{...after.imageProvenance,selectionReason:'model_selected_original_image_index'}},venue});assert(valid.changedFields.includes('mediaUrls'));
});

test('Memorial Hall uses only the reviewed source-parent room alias',async()=>{
 const venue:any={id:'slug_confedcentre',name:'Confederation Centre of the Arts',facebookUrl:'https://www.facebook.com/ConfedCentre',aliases:['Memorial Hall, Confederation Centre of the Arts']};
 const row:any={userName:venue.name,pageName:'ConfedCentre',facebookUrl:venue.facebookUrl,text:'Rising Stars, December 5, 11:30 a.m. Memorial Hall'};
 const resolve=(v:any)=>resolveVenueForFullParserEventWithMatcherForRegression({item:{name:'Rising Stars',establishment:'Memorial Hall',venue:'Memorial Hall'} as any,row,rowVenue:v,establishment:venue.name,rowIndex:234,matcher:async()=>({isMatch:false,matchType:'none',similarity:0})});
 assert.equal((await resolve(venue))?.id,venue.id);assert.equal(await resolve({...venue,aliases:[]}),null);
});
