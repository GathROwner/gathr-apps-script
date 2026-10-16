import test from 'node:test';import assert from 'node:assert/strict';import {validFestivalNonmembership as valid} from './festivalSourceDecision.js';
const expected={editionId:'festival_fixture',sourceId:'source_fixture',captureKey:'key_fixture',sourceFingerprint:'fingerprint_fixture',evidencePolicy:'policy_fixture'};
const decision={version:1,kind:'reviewed_not_member',...expected,reviewId:'review_fixture',reason:'Separate exhibition; no festival membership claim',reviewedAt:'2026-10-15T15:00:00Z'};
test('exact reviewed nonmember is separate from source completeness and grants no link',()=>assert.equal(valid(decision,expected),true));
test('caption/gallery, source, edition, policy or capture drift invalidates a past negative decision',()=>{for(const key of Object.keys(expected))assert.equal(valid({...decision,[key]:'changed'},expected),false);});
test('an unsigned suggestion or missing human review cannot exclude a source',()=>{for(const patch of [{kind:'suggested'},{reviewId:''},{reviewedAt:''},{reviewedAt:'invalid'},{reason:''},{version:2}])assert.equal(valid({...decision,...patch},expected),false);});
