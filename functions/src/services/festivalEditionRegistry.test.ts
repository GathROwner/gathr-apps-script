import test from 'node:test';import assert from 'node:assert/strict';
import {reviewedFestivalEdition} from './festivalEditionRegistry.js';
const fingerprint='a'.repeat(64);
function fixture(){
 const areaData={version:1,status:'partial',sourceUrl:'https://organizer.example/programme',locations:[{venueId:'centre_fixture',label:'Community Centre',certainty:'confirmed'}]};
 const event={path:'events/festival_fixture',data:{locationScope:'area',cityLevelReviewId:'review_fixture',eventName:'Example Festival 2026',startDate:'2026-10-15',endDate:'2026-10-31',areaData}};
 const programme={sourceId:'1111111111111',sourceUrl:areaData.sourceUrl,sourceFingerprint:fingerprint};
 const review={path:'city_level_event_reviews/review_fixture',data:{status:'published',publishedEventPath:event.path,areaEventLinks:[],finalization:{action:'approve_publish',manual:{areaData,programmeSources:[programme]}}}};
 return{event,review,programme};
}
test('exact reviewed original programme identity registers with zero manually linked activities',()=>{
 const f=fixture(),e=reviewedFestivalEdition(f.event,f.review,'2026-10-16');assert(e);assert.deepEqual(e.sourceIds,['1111111111111']);assert.equal(e.sourceBindings['1111111111111'].sourceFingerprint,fingerprint);assert.deepEqual(e.occurrenceAuthorities,[]);
});
test('unreviewed identity, foreign publisher, invalid fingerprint and conflicting identities cannot register',()=>{
 for(const delta of [{sourceUrl:'https://other.example/programme'},{sourceUrl:'http://organizer.example/programme'},{sourceUrl:'https://organizer.example/programme?id=another_page'},{sourceFingerprint:'bad'},{sourceId:'not-a-post'}]){const f=fixture();Object.assign(f.programme,delta);assert.equal(reviewedFestivalEdition(f.event,f.review,'2026-10-16'),undefined);}
 const f=fixture();f.review.data.finalization.manual.programmeSources.push({...f.programme});assert.equal(reviewedFestivalEdition(f.event,f.review,'2026-10-16'),undefined);
 const notApproved=fixture();notApproved.review.data.status='pending';assert.equal(reviewedFestivalEdition(notApproved.event,notApproved.review,'2026-10-16'),undefined);
});
