import test from 'node:test';import assert from 'node:assert/strict';
import {previewDuplicateMerge} from './rowProcessor.js';
import {reviewedSourcePrice,contradictsReviewedPrice} from './reviewedSourcePrice.js';
test('approved craft-fair metadata resists a more specific food-special enrichment',()=>{
 const existing:any={uniqueId:'1111111111111_fixture',venueId:'fixture',name:'Christmas Craft Fair',eventName:'Christmas Craft Fair',
  startDate:'2026-11-14',endDate:'2026-11-14',startTime:'10:00',endTime:'15:00',
  isEvent:'Yes',isFoodSpecial:'No',category:'Gatherings & Parties',eventType:'gatherings_parties',
  locationReviewStatus:'approved',source:'approved_city_review_recovery',reviewedCategory:{version:1,category:'Gatherings & Parties',reviewId:'fixture-reviewed-category'},isRecurring:'No',recurringPattern:'none'};
 const incoming={...existing,source:undefined,category:'Food Special',eventType:'food_special',isEvent:'No',isFoodSpecial:'Yes',description:'Festive treats and vendors'};
 const result={...existing,...previewDuplicateMerge({existingEvent:existing,incomingEvent:incoming,venue:{id:'fixture',name:'Fixture Garden'} as any}).updates};
 assert.equal(result.category,'Gatherings & Parties');assert.equal(result.isEvent,'Yes');assert.equal(result.isFoodSpecial,false);
});
test('same reviewed source/image cannot repaint price, title or description with a new misread amount',()=>{
 const source='1111111111111',image='https://example.invalid/reviewed-original.webp';
 const existing:any={uniqueId:source+'_fixture',sourceUniqueIds:[source],venueId:'fixture',name:'$16 Kitchen Feature — Meatloaf Sandwich',eventName:'$16 Kitchen Feature — Meatloaf Sandwich',
  startDate:'2026-10-16',endDate:'2026-10-16',startTime:'08:00',endTime:'16:00',price:'$16',ticketPrice:'$16',description:'Meatloaf sandwich with a side and beverage.',
  imageUrl:image,mediaUrls:[image],category:'Food Special',eventType:'food_special',isEvent:'No',isFoodSpecial:'Yes',isRecurring:'No',recurringPattern:'none',
  reviewedSourcePrice:{version:1,sourceUniqueId:source,imageSha256:'a'.repeat(64),imageUrl:image,price:'$16',reviewId:'fixture-original-board'}};
 const incoming={...existing,name:'$18 Kitchen Feature — Meatloaf Sandwich',eventName:'$18 Kitchen Feature — Meatloaf Sandwich',price:'$18 per meal including side and beverage',ticketPrice:'$18',description:'Today’s $18 meatloaf sandwich special includes cheese, garlic mayo, lettuce, red onion, barbecue sauce, a side and a small beverage.'};
 const merged={...existing,...previewDuplicateMerge({existingEvent:existing,incomingEvent:incoming,venue:{id:'fixture',name:'Fixture Counter'} as any}).updates};
 assert.equal(merged.price,'$16');assert.equal(merged.ticketPrice,'$16');assert.equal(merged.name,existing.name);assert.equal(merged.description,existing.description);
 const compatible={...existing,...previewDuplicateMerge({existingEvent:existing,incomingEvent:{...existing,price:'$16 including side and beverage'},venue:{id:'fixture',name:'Fixture Counter'} as any}).updates};
 assert.equal(compatible.price,'$16 including side and beverage');
 const proof=reviewedSourcePrice(existing,incoming);assert(proof);
 assert(contradictsReviewedPrice(18,proof,true));assert(contradictsReviewedPrice('18',proof,true));
 assert(!contradictsReviewedPrice('Doors18:00',proof));
 assert(reviewedSourcePrice(existing,{...incoming,imageUrl:'https://example.invalid/reuploaded-board.webp'}));
 assert(reviewedSourcePrice(existing,{...incoming,imageUrl:undefined,mediaUrls:[]}));
});
test('location-only approval does not freeze an unreviewed activity category',()=>{
 const existing:any={uniqueId:'1111111111111_fixture',venueId:'fixture',name:'Evening Gathering',eventName:'Evening Gathering',startDate:'2026-11-14',startTime:'19:00',endDate:'2026-11-14',endTime:'21:00',category:'Gatherings & Parties',isEvent:'Yes',isFoodSpecial:'No',locationReviewStatus:'approved',source:'approved_city_review_recovery',isRecurring:'No',recurringPattern:'none'};
 const incoming={...existing,category:'Live Music'};
 const merged={...existing,...previewDuplicateMerge({existingEvent:existing,incomingEvent:incoming,venue:{id:'fixture',name:'Fixture Hall'} as any}).updates};
 assert.equal(merged.category,'Live Music');
});
