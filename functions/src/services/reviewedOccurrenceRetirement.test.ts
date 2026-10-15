import test from 'node:test';import assert from 'node:assert/strict';
import {classifyReviewedOccurrenceRetirement} from './reviewedOccurrenceRetirement.js';
import {checkDuplicate} from './firestoreService.js';
const incoming:any={uniqueId:'1111111111111_old',venueId:'fixture',name:'Old programme',startDate:'2026-09-13',startTime:'15:00'};
const policy:any={version:1,kind:'reviewed_duplicate_cleanup',reviewId:'fixture-review',canonicalEventPath:'venues/fixture/events/canonical',sourceUniqueIds:['1111111111111'],retiredUniqueIds:['1111111111111_old']};
const venue:any={id:'fixture',reviewedOccurrenceRetirements:policy};
test('exact retired identity is suppressed without selecting a mutable dated keeper',()=>{
 const before=JSON.stringify(venue),result=classifyReviewedOccurrenceRetirement(incoming,venue);
 assert.equal(result.kind,'retired');assert.equal(JSON.stringify(venue),before);assert.equal('existingEvent' in result,false);
});
test('other activity from the same post, different source and different venue remain eligible',()=>{
 for(const change of [{uniqueId:'1111111111111_other'},{uniqueId:'3333333333333_old'},{venueId:'another'}])
  assert.equal(classifyReviewedOccurrenceRetirement({...incoming,...change},venue).kind,'none');
});
test('ordinary provenance and unreviewed metadata cannot retire events',()=>{
 for(const candidate of [undefined,{id:'fixture'},{id:'fixture',sourceUniqueIds:['1111111111111']},
  {id:'fixture',reviewedOccurrenceRetirements:{...policy,kind:'suggested'}}])
  assert.equal(classifyReviewedOccurrenceRetirement(incoming,candidate as any).kind,'none');
});
test('a malformed reviewed policy fails closed rather than ignoring a known retirement',()=>{
 for(const change of [{version:2},{reviewId:''},{sourceUniqueIds:undefined},{sourceUniqueIds:[4]},{retiredUniqueIds:undefined},{retiredUniqueIds:[4]},{canonicalEventPath:4},{canonicalEventPath:'venues/other/events/canonical'}])
  assert.equal(classifyReviewedOccurrenceRetirement(incoming,{id:'fixture',reviewedOccurrenceRetirements:{...policy,...change}} as any).kind,'hold');
});
test('source root and full retired identity must agree in the reviewed decision',()=>{
 assert.equal(classifyReviewedOccurrenceRetirement(incoming,{id:'fixture',reviewedOccurrenceRetirements:{...policy,sourceUniqueIds:['3333333333333']}} as any).kind,'hold');
 assert.equal(classifyReviewedOccurrenceRetirement({...incoming,uniqueId:'manual_event'},venue).kind,'none');
});
test('a dense source needs only loaded venue data and leaves its other 52 activities alone',()=>{
 for(let i=0;i<52;i++)assert.equal(classifyReviewedOccurrenceRetirement({...incoming,uniqueId:'1111111111111_activity_'+i},venue).kind,'none');
 assert.equal(classifyReviewedOccurrenceRetirement(incoming,venue).kind,'retired');
});
test('the actual duplicate service stops a retired replay before any Firestore access',async()=>{
 // No Admin app, credentials or database is initialized in this test. Reaching
 // the normal catalog/query path would throw rather than produce this result.
 assert.deepEqual(await checkDuplicate(incoming,'fixture',[],venue),{isDuplicate:true});
});
