import test from 'node:test';
import assert from 'node:assert/strict';
import {editorialOutcome,editorialIssues,validateEditorial,EDITORIAL_PROMPT} from '../editorial-review.mjs';
import {validateJudgment} from '../policy.mjs';
import {needsReview,humanChoice,presentation} from '../public/review-ui.js';
const clip=()=>({id:'test',sourcePostId:'12345',sourceVideoId:'67890',caption:'Friday dinner $18',sourceAudioExpected:false,listingContext:{title:'Dinner',date:'2026-10-31',time:'18:00',venue:'Ruby',sourceMatched:true},video:{completeDecode:true,durationSeconds:5,finalFrameDurationSeconds:.1},audio:{present:false},sampling:{regularIntervalSeconds:.5},frames:[0,.5,1,1.5,2,2.5,3,3.5,4,4.5,4.9].map(timestampSeconds=>({timestampSeconds}))});
const decision=()=>({content:{decision:'useful',kind:'specific_event_or_special',reason:'A specific $18 Friday dinner is advertised.',evidence:[{modality:'caption',timestampSeconds:null,detail:'Friday dinner $18'}]},motion:{value:'static_poster',evidence:[]},listing:{association:'matched',reason:'The exact source-linked dinner listing matches.',conflicts:[]},audioNotes:[]});
test('clear generic business advertising is rejected without a matched listing',()=>{
 const c=clip();c.listingContext={sourceMatched:false};const d=decision();d.content={decision:'reject',kind:'generic_business_advertising',reason:'Book an ordinary treatment; no specific event or special.',evidence:[{modality:'caption',timestampSeconds:null,detail:'Book your session today'}]};d.listing.association='unmatched';
 const r=editorialOutcome({clip:c,luna:d});assert.equal(r.state,'rejected');assert.equal(r.contentAssessment.kind,'generic_business_advertising');
});
test('a useful event remains useful when no listing exists',()=>{
 const c=clip();c.listingContext={sourceMatched:false};const d=decision();d.listing.association='unmatched';
 const r=editorialOutcome({clip:c,luna:d});assert.equal(r.contentAssessment.decision,'useful');assert.equal(r.state,'held');assert.deepEqual(r.reasons,['listing_match_needed']);assert.deepEqual(editorialIssues(d,false),[]);
});
test('music or empty speech is a note, not a veto on a matched event',()=>{
 const c=clip();c.sourceAudioExpected=true;c.audio={present:true,completeExtraction:true,coversTimeline:true};
 const entry={status:'transcribed',transcriptionComplete:true,text:''};const r=editorialOutcome({clip:c,entry,luna:decision()});assert.equal(r.state,'recommended');assert.deepEqual(r.reasons,[]);assert.deepEqual(r.audioNotes,['no_speech_detected']);
});
test('a static specific dinner poster is eligible',()=>{const r=editorialOutcome({clip:clip(),luna:decision()});assert.equal(r.state,'recommended');assert.equal(r.contentAssessment.motion,'static_poster');assert.match(EDITORIAL_PROMPT,/static poster also qualifies/);});
test('actual missing expected audio is held separately',()=>{const c=clip();c.sourceAudioExpected=true;const r=editorialOutcome({clip:c,luna:decision()});assert.equal(r.state,'held');assert.ok(r.reasons.includes('expected_audio_missing'));});
test('content uncertainty can escalate even without a listing; absence alone does not',()=>{const d=decision();d.content.decision='uncertain';assert.ok(editorialIssues(d,false).includes('content_uncertain'));d.content.decision='useful';d.listing.association='uncertain';assert.deepEqual(editorialIssues(d,false),[]);});
test('invented frame timestamps and animation claims fail validation',()=>{const d=decision();d.content.evidence=[{modality:'visible',timestampSeconds:3.123,detail:'Poster'}];assert.throws(()=>validateEditorial(d,clip()));d.content.evidence[0].timestampSeconds=0;d.motion.value='animated_promotion';assert.throws(()=>validateEditorial(d,clip()));});
test('decisive reviewer disagreement stays visible for human review',()=>{const d=decision(),t=decision();t.content.decision='reject';t.content.kind='generic_business_advertising';const r=editorialOutcome({clip:clip(),luna:d,terra:t});assert.equal(r.state,'held');assert.ok(r.reasons.includes('content_reviewers_disagree'));});
test('explicit do-not-use is saved independently of any model verdict',()=>{const p=validateJudgment({judgment:'dont_use_video',notes:'Generic ad',revision:'a'.repeat(64)});assert.equal(p.choice,'dont_use');assert.equal(humanChoice(p),'dont_use');assert.equal(needsReview({state:'recommended',humanJudgment:p}),false);});
test('legacy agreement is never silently converted to rejection or use',()=>{assert.equal(humanChoice({judgment:'agree_with_decision'}),'legacy_agreement');assert.equal(needsReview({state:'held',humanJudgment:{judgment:'agree_with_decision'}}),true);});
test('generic advertising leaves the review inbox but remains inspectable',()=>{const c={state:'rejected',reasons:['generic_business_advertising'],contentAssessment:decision().content};assert.equal(needsReview(c),false);assert.equal(presentation(c).badge,'FILTERED OUT');});
test('rejecting a clearly specific event is inconsistent and requires review',()=>{const d=decision();d.content.decision='reject';assert.ok(editorialIssues(d,false).includes('editorial_content_inconsistent'));});
test('an acquisition failure is not presented as a listing-match failure',()=>{const v=presentation({state:'held',reasons:['clip_over_60_seconds']});assert.equal(v.listing,'Listing check pending');assert.doesNotMatch(v.listingReason,/60-second/);assert.match(v.reviewReasons[0],/60-second/);});
