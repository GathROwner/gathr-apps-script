import test from 'node:test';import assert from 'node:assert/strict';
import {applyVerifiedSourceComplexVenue} from './verifiedSourceComplex.js';
const venue:any={id:'name_6387om',name:'Blank Canvas Art Supplies',facebookUrl:'https://www.facebook.com/fixture-art-store',address:'125 Great George Street, Charlottetown, PE'};
const row:any={facebookUrl:venue.facebookUrl,text:'Register through our website. The Confederation Court Mall'};
const item:any={name:'Acrylic Colour Theory class',venue:'Confederation Court Mall',ticketLink:'www.blankcanvasartsupplies.ca',spatial:{kind:'single_location',locations:[{label:'Confederation Court Mall, Charlottetown, PEI'}]}};
test('verified source-store class uses its classroom while retaining mall context',()=>{
 const x=applyVerifiedSourceComplexVenue(item,row,venue);assert.equal(x.venue,venue.name);assert.equal(x._locationMentionResolution?.venueId,venue.id);assert.equal(x._locationMentionResolution?.complexContext,'The Confederation Court Mall');assert.equal(item.venue,'Confederation Court Mall');
});
test('mall publisher, off-site class, wrong registration domain and unknown relationship do not adopt the store',()=>{
 for(const [i,r,v] of [[item,{...row,facebookUrl:'https://www.facebook.com/mall'},venue],[{...item,venue:'Other Hall'},row,venue],
 [{...item,ticketLink:'https://unrelated.example/class'},row,venue],[item,row,{...venue,id:'unverified-store'}]])assert.equal(applyVerifiedSourceComplexVenue(i as any,r as any,v as any),i);
});
test('relocation, routes, multi-site and shared publisher sources retain normal review',()=>{
 for(const [i,r] of [[item,{...row,text:'Moved to a new venue'}],[{...item,spatial:{kind:'multi_location'}},row],[item,{...row,sharedPostAuthorUrl:'https://www.facebook.com/other'}]])assert.equal(applyVerifiedSourceComplexVenue(i as any,r as any,venue),i);
});
