import test from 'node:test';import assert from 'node:assert/strict';
import {contradictsReviewedOccurrenceTiming as holds} from './reviewedOccurrenceTiming.js';
import {previewDuplicateMerge} from './rowProcessor.js';
const proof={version:1,reviewId:'fixture_review',venueId:'fixture_venue',startDate:'2026-10-15',endDate:'2026-10-15',startTime:'19:00',endTime:'',sourceUrls:['https://organizer.example/programme']};
const existing:any={eventName:'Fixture Film',name:'Fixture Film',venueId:proof.venueId,startDate:proof.startDate,endDate:proof.endDate,startTime:proof.startTime,endTime:'',uniqueId:'1111111111111_old',isRecurring:'No',recurringPattern:'none',reviewedOccurrenceTiming:proof};
const venue:any={id:proof.venueId,name:'Example Cinema',normalizedName:'example cinema',address:'1 Example St',latitude:46.2,longitude:-63.1};
test('another source cannot restore the old date or category-default finish through actual duplicate merge',()=>{
 for(const patch of [{startDate:'2026-10-16',endDate:'2026-10-16'},{endTime:'23:00',timeFlags:{end:{source:'none'}}},{startTime:'09:38'}]){
  const incoming={...existing,...patch,reviewedOccurrenceTiming:undefined,uniqueId:'2222222222222_new',description:'Newer conflicting source'};
  assert.equal(holds(existing,incoming),true);
  assert.deepEqual(previewDuplicateMerge({existingEvent:existing,incomingEvent:incoming,venue}).updates,{});
 }
});
test('exact corroboration remains mergeable and ordinary unreviewed records are unchanged',()=>{
 assert.equal(holds(existing,{...existing,uniqueId:'2222222222222_new'}),false);
 assert.equal(holds({...existing,reviewedOccurrenceTiming:undefined},{...existing,endTime:'23:00'}),false);
 assert.equal(holds({...existing,reviewedOccurrenceTiming:{...proof,startDate:'2026-02-30'}},existing),true);
});
