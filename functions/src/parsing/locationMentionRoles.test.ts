import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './__fixtures__/jingle-mingle-location.json';
import {resolveLocationMentionRoles,applyLocationMentionResolution,KNOWN_LOCATION_RELATIONSHIPS} from './locationMentionRoles.js';
import {classifySpatialEvent} from './spatialEventClassifier.js';
import {rehydrateFormattedEventMetadata} from './finalFormatter.js';
import {preserveValidatedItemSourceType} from './secondaryValidator.js';
import {resolveVenueForFullParserEventWithMatcherForRegression,previewDuplicateMerge} from '../processing/rowProcessor.js';
import {isApprovedVenueOccurrenceMatch,ticketOccurrenceKey,approvedVenueOccurrenceSourcePatch} from '../services/approvedVenueOccurrence.js';
import {linkApprovedVenueOccurrenceSource} from '../services/firestoreService.js';
import * as admin from 'firebase-admin';
const relation=KNOWN_LOCATION_RELATIONSHIPS[0];
const input=(patch:any={})=>({name:'Jingle & Mingle',location:relation.venue,description:'The poster lists the location as Red Shores Charlottetown.',
 combinedText:'Coming to the Eastlink Centre on December 5. Tickets available at Eastlink Centre Charlottetown box office.',
 modelSpatialEvidence:{kind:'separate_occurrences',locations:[{label:relation.venue,sourceText:'RED SHORES CHARLOTTETOWN'},{label:relation.context,sourceText:'Eastlink Centre box office'}]},...patch});
const event=(patch:any={}):any=>({uniqueId:'1805887057841497_location',name:'Jingle & Mingle — Kim Albert & Faces with opening act TIP-ER-BACK',eventName:'Jingle & Mingle — Kim Albert & Faces with opening act TIP-ER-BACK',establishment:relation.venue,venueId:relation.venueId,startDate:'2026-12-05',startTime:'20:00',eventType:'live_music',ticketsBuyUrl:'https://purchase.eastlinkcentrepei.com/EventAvailability?EventId=28202',source:'approved_location_review',locationReviewStatus:'approved',...patch});

for(const row of fixture.rows)test(`captured source row ${row.row} resolves Red Shores before venue matching`,async()=>{
 const normalized=applyLocationMentionResolution(row.item as any,row.text);
 assert.equal(normalized.venue,relation.venue);assert.equal(normalized._locationMentionResolution.venueId,relation.venueId);
 assert.equal(normalized._locationMentionResolution.ticketingLocation,relation.context+' box office');
 assert.equal(classifySpatialEvent({name:row.item.name,description:row.item.description,location:row.item.establishment,combinedText:row.text,modelSpatialEvidence:row.item.spatial}).kind,'single_location');
 const matched=await resolveVenueForFullParserEventWithMatcherForRegression({item:row.item as any,rowVenue:null,row:{text:row.text,uniqueId:row.sourceId,mediaUrls:[]} as any,establishment:row.publisher,rowIndex:row.row,matcher:async(candidate,url)=>{assert.equal(candidate,relation.venue);assert.equal(url,undefined);return {isMatch:true,matchType:'exact',confidence:1,matchedVenue:{id:relation.venueId,name:relation.venue}} as any;}});
 assert.equal(matched?.id,relation.venueId);
 const missing=await resolveVenueForFullParserEventWithMatcherForRegression({item:row.item as any,rowVenue:{id:'eastlink',name:relation.context} as any,row:{text:row.text,mediaUrls:[]} as any,establishment:row.publisher,rowIndex:row.row,matcher:async()=>({isMatch:false}) as any});assert.equal(missing,null);
});
test('a standalone Eastlink event stays at Eastlink',()=>{
 const x=input({location:relation.context,description:'Concert at Eastlink Centre Charlottetown.',combinedText:'December 5 concert at Eastlink Centre Charlottetown.',modelSpatialEvidence:{kind:'single_location',locations:[{label:relation.context,sourceText:'Concert at Eastlink Centre Charlottetown'}]}});
 assert.equal(resolveLocationMentionRoles(x),null);assert.equal(classifySpatialEvent(x).kind,'single_location');
});
test('separates an unrelated ticket outlet without changing the actual event venue',()=>{
 const r=resolveLocationMentionRoles(input({location:'Community Hall',description:'Concert held at Community Hall. Tickets available at Corner Shop.',combinedText:'Concert held at Community Hall. Tickets available at Corner Shop.',modelSpatialEvidence:{kind:'separate_occurrences',locations:[{label:'Community Hall',sourceText:'Concert held at Community Hall'},{label:'Corner Shop',sourceText:'Tickets available at Corner Shop'}]}}));
 assert.equal(r?.eventVenue,'Community Hall');assert.equal(r?.ticketingLocation,'Corner Shop');
});
test('a venue may also sell its own tickets',()=>{
 const x=input({location:relation.venue,description:'Event held at Red Shores Charlottetown. Tickets available at Red Shores Charlottetown.',modelSpatialEvidence:{kind:'single_location',locations:[{label:relation.venue,sourceText:'Event held at Red Shores Charlottetown'}]}});
 assert.equal(resolveLocationMentionRoles(x)?.eventVenue,relation.venue);
});
test('Red Shores used only as ticket outlet does not displace an Eastlink event',()=>{
 const x=input({location:relation.context,description:'Concert held at Eastlink Centre Charlottetown. Tickets available at Red Shores Charlottetown.',combinedText:'Concert held at Eastlink Centre Charlottetown. Tickets available at Red Shores Charlottetown.',modelSpatialEvidence:{kind:'single_location',locations:[{label:relation.context,sourceText:'Concert held at Eastlink Centre Charlottetown'},{label:relation.venue,sourceText:'Tickets available at Red Shores Charlottetown'}]}});
 assert.equal(resolveLocationMentionRoles(x)?.eventVenue,relation.context);
});
test('an explicitly named promoter is supporting context, not a second venue',()=>{
 const x=input({location:'Community Hall',description:'Presented by Arts Club. Concert held at Community Hall.',combinedText:'Presented by Arts Club. Concert held at Community Hall.',modelSpatialEvidence:{kind:'separate_occurrences',locations:[{label:'Arts Club',sourceText:'Presented by Arts Club'},{label:'Community Hall',sourceText:'Concert held at Community Hall'}]}});
 const r=resolveLocationMentionRoles(x);assert.equal(r?.eventVenue,'Community Hall');assert(r?.mentions.some(m=>m.label==='Arts Club'&&m.role==='organizer'));
});
test('does not promote a sponsor logo or publishing page to event venue',()=>{
 assert.equal(resolveLocationMentionRoles(input({location:relation.context,description:'Red Shores Charlottetown sponsor logo. Concert held at Eastlink Centre.',modelSpatialEvidence:{kind:'single_location',locations:[{label:relation.venue,sourceText:'Red Shores Charlottetown sponsor logo'},{label:relation.context,sourceText:'Concert held at Eastlink Centre'}]}})),null);
});
test('an explicit relocation cannot be overridden by facility configuration',()=>{
 assert.equal(resolveLocationMentionRoles(input({combinedText:'Moved from Red Shores Charlottetown to Eastlink Centre. Tickets available at Eastlink Centre box office.'})),null);
});
test('unknown competing venues and true multi-site events remain review candidates',()=>{
 const x=input({location:'Small Hall',description:'Venue: Small Hall; Large Campus',combinedText:'Venue: Small Hall; Large Campus',modelSpatialEvidence:{kind:'multi_location',locations:[{label:'Small Hall'},{label:'Large Campus'}]}});
 assert.equal(resolveLocationMentionRoles(x),null);assert.equal(classifySpatialEvent(x).kind,'multi_location');
 assert.equal(resolveLocationMentionRoles(input({modelSpatialEvidence:{...input().modelSpatialEvidence,kind:'multi_location'}}))?.eventVenue,relation.venue);
 assert.equal(resolveLocationMentionRoles(input({combinedText:'Performances at both Red Shores Charlottetown and Eastlink Centre Charlottetown.'})),null);
 assert.equal(resolveLocationMentionRoles(input({combinedText:'December 5 at Red Shores Charlottetown\nDecember 6 at Eastlink Centre Charlottetown'})),null);
});
test('repeated paragraphs and city context do not manufacture a tour',()=>{
 assert.equal(classifySpatialEvent({name:'Concert',location:relation.venue,description:'December 5 at Red Shores Charlottetown.',combinedText:'December 5 at Red Shores Charlottetown.',modelSpatialEvidence:{kind:'single_location',locations:[{label:relation.venue}]}}).kind,'single_location');
 assert.equal(classifySpatialEvent({name:'Tour',description:'December 5 at Charlottetown\nDecember 6 at Summerside',location:'PEI'}).kind,'separate_occurrences');
});
test('deterministic location metadata survives Stage 4 and Stage 5 formatting drift',()=>{
 const row=fixture.rows[0],original=applyLocationMentionResolution({...row.item,venue:row.item.establishment} as any,row.text);
 const validated=preserveValidatedItemSourceType({...original,venue:relation.context,_locationMentionResolution:undefined},original);
 assert.equal(validated._locationMentionResolution?.venueId,relation.venueId);
 const formatted=rehydrateFormattedEventMetadata({...original,venue:relation.context,establishment:relation.context,_locationMentionResolution:undefined} as any,validated);
 assert.equal(formatted.venue,relation.venue);assert.equal(formatted.establishment,relation.venue);
});
test('different publisher posts match one approved event; event ID query is retained',()=>{
 const incoming=event({uniqueId:'1708626300787719_abc',establishment:'redshoresPEI',sourceUniqueIds:['1708626300787719'],sourceUrls:['https://www.facebook.com/100049210974665/posts/1708626300787719']});
 assert(isApprovedVenueOccurrenceMatch(incoming,event()));
 for(const patch of [{startDate:'2026-12-06'},{startTime:'21:00'},{venueId:'eastlink'},{name:'Other band',eventName:'Other band'},{ticketsBuyUrl:'https://purchase.eastlinkcentrepei.com/EventAvailability?EventId=28203'},{additionalLocation:'Separate private room'}])assert(!isApprovedVenueOccurrenceMatch({...incoming,...patch},event()));
 assert.equal(ticketOccurrenceKey('https://purchase.eastlinkcentrepei.com/'),'');
 assert.equal(ticketOccurrenceKey('https://purchase.eastlinkcentrepei.com/EventAvailability?EventId=28202&utm_source=fb'),'eastlink:28202');
 assert.equal(ticketOccurrenceKey('https://purchase.eastlinkcentrepei.com/EventAvailability?EventId=28202&EventId=28203'),'');
 assert(!isApprovedVenueOccurrenceMatch(incoming,event({locationReviewStatus:'needs_review'})));
 const patch=approvedVenueOccurrenceSourcePatch(event(),incoming);assert.deepEqual(patch.sourceUniqueIds,['1805887057841497','1708626300787719']);
});
test('normal venue duplicate merges retain both source identities without context becoming a room',()=>{
 const resolution=resolveLocationMentionRoles(input())!;
 const original=event({uniqueId:'1805887057841497_a',sourceUniqueIds:['1805887057841497']});
 const incoming=event({uniqueId:'1708626300787719_b',sourceUniqueIds:['1708626300787719'],locationMentionResolution:resolution,complexContext:resolution.complexContext,ticketingLocation:resolution.ticketingLocation});
 const result=previewDuplicateMerge({existingEvent:original,incomingEvent:incoming,venue:{id:relation.venueId,name:relation.venue} as any});
 assert.deepEqual(result.updates.sourceUniqueIds,['1805887057841497','1708626300787719']);
 assert.equal(result.updates.complexContext,relation.context);assert(!result.updates.additionalLocation);
});
test('approved top-level keeper transaction links sources only and rejects live identity drift',async()=>{
 const db=admin.firestore(),original=db.runTransaction;
 const existing=event({_canonicalDocumentPath:'events/existing-approved'}),incoming=event({uniqueId:'1708626300787719_xyz',sourceUniqueIds:['1708626300787719'],sourceUrls:['https://www.facebook.com/posts/1708626300787719']});
 let current=event(),writes:any[]=[];
 (db as any).runTransaction=async(callback:any)=>callback({get:async(ref:any)=>{assert.equal(ref.path,'events/existing-approved');return {data:()=>current};},update:(ref:any,patch:any)=>writes.push({path:ref.path,patch})});
 try{
   await linkApprovedVenueOccurrenceSource(existing,incoming);assert.equal(writes.length,1);assert.equal(writes[0].path,'events/existing-approved');
   assert.deepEqual(Object.keys(writes[0].patch).sort(),['lastSeenAt','sourceUniqueIds','sourceUrls']);assert.deepEqual(writes[0].patch.sourceUniqueIds,['1805887057841497','1708626300787719']);
   current=event({venueId:'moved-venue'});writes=[];await assert.rejects(linkApprovedVenueOccurrenceSource(existing,incoming),/changed before source link/);assert.equal(writes.length,0);
   await assert.rejects(linkApprovedVenueOccurrenceSource({...existing,_canonicalDocumentPath:'venues/other/events/child'},incoming),/Invalid approved occurrence reference/);
 }finally{db.runTransaction=original;}
});
