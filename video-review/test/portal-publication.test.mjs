import test from 'node:test';import assert from 'node:assert/strict';
import {inGathR,filtered,waiting,needsReview,presentation} from '../public/review-ui.js';
import {validateJudgment} from '../policy.mjs';
const sha='a'.repeat(64),base={state:'recommended',sha256:sha};
test('attached clips leave the edge inbox and retain their content assessment',()=>{
 const c={...base,publication:{state:'published',assetId:sha,paths:['venues/v/events/e']}};
 assert.equal(inGathR(c),true);assert.equal(needsReview(c),false);assert.equal(waiting(c),false);assert.equal(presentation(c).badge,'IN GATHR');
});
test('another selected video covering the same listing is not mislabelled as this clip being in GathR',()=>{
 const c={...base,publication:{state:'already_covered',assetId:'b'.repeat(64),paths:['venues/v/events/e']}};
 assert.equal(inGathR(c),false);assert.equal(filtered(c),true);assert.equal(needsReview(c),false);assert.equal(presentation(c).badge,'LISTING ALREADY COVERED');
});
test('waiting automatic matches need no user decision; real holds remain visible after Use',()=>{
 assert.equal(waiting(base),true);assert.equal(needsReview(base),false);
 const c={...base,state:'held',humanJudgment:{choice:'use'},publication:{state:'needs_review',reason:'Date conflict'}};
 assert.equal(needsReview(c),true);assert.equal(presentation(c).badge,'NEEDS YOUR REVIEW');
});
test('Not sure and Don’t use retain their distinct review paths',()=>{
 assert.equal(needsReview({...base,humanJudgment:{choice:'unsure'}}),true);
 assert.equal(filtered({...base,humanJudgment:{choice:'dont_use'}}),true);
});
test('a chosen listing is constrained to public listing path syntax, with membership checked by the API',()=>{
 assert.equal(validateJudgment({judgment:'use_video',notes:'',revision:sha,listingPath:'venues/v/events/e'}).listingPath,'venues/v/events/e');
 for(const path of ['users/private','venues/v','../events/e','private_video_candidates/'+sha])assert.throws(()=>validateJudgment({judgment:'use_video',notes:'',revision:sha,listingPath:path}));
});
