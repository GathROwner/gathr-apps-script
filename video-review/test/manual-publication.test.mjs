import test from 'node:test';import assert from 'node:assert/strict';
import {validateSelection,validateMatch,expiryFor} from '../manual-publication.mjs';
const at=Date.parse('2026-10-30T16:00:00Z'),sha='a'.repeat(64);
const c={sha256:sha,sourcePostId:'12345',sourceAudio:true,durationSeconds:10,contentAssessment:{decision:'useful'},humanJudgment:{choice:'use',sha256:sha,reviewerUid:'reviewer',reviewedAt:'2026-10-30T15:00:00Z'}};
const config={adminUids:['reviewer']},probe={durationSeconds:10,bytes:1234,width:360,height:640,codec:'h264',hasAudio:true,audioCodec:'aac'};
test('A human Use is required and cannot approve different bytes, unknown sound or rejected content',()=>{
 validateSelection(c,config,probe,at);
 for(const bad of [{...c,humanJudgment:{...c.humanJudgment,choice:'dont_use'}},{...c,humanJudgment:{...c.humanJudgment,sha256:'b'.repeat(64)}},{...c,sourceAudio:'unknown'},{...c,contentAssessment:{decision:'reject'}}])assert.throws(()=>validateSelection(bad,config,probe,at));
 assert.throws(()=>validateSelection(c,config,{...probe,durationSeconds:83},at));
});
test('Cross-post matches preserve the listing source but require exact venue, date and written evidence',()=>{
 const event={venueId:'v',startDate:'2026-10-31',sourceUniqueIds:['67890']};
 const match={path:'venues/v/events/e',venueId:'v',date:event.startDate,listingSourceId:'67890',mode:'verified_same_occurrence',reason:'Same official venue, October 31 programme and named chef',evidenceDigest:sha};
 validateMatch(c,event,match);
 for(const bad of [{...match,date:'2026-10-30'},{...match,venueId:'other'},{...match,evidenceDigest:''},{...match,listingSourceId:'12345'},{...match,mode:'same_post'}])assert.throws(()=>validateMatch(c,event,bad));
 assert.throws(()=>validateMatch(c,{...event,status:'cancelled'},match));
});
test('Expiry follows Halifax daylight saving time',()=>{
 assert.equal(expiryFor({endDate:'2026-10-31'}),'2026-11-01T02:59:59.000Z');
 assert.equal(expiryFor({endDate:'2026-11-12'}),'2026-11-13T03:59:59.000Z');
});
test('The source-selected Hokum trial is a narrow exception and cannot authorize arbitrary longer clips',()=>{
 const longer={...c,sourceVideoId:'1068937392790830',durationSeconds:83.06,reviewVersion:'hokum-longer-trial-v1',humanJudgment:{...c.humanJudgment,judgment:'use_video',sha256:null}};
 const proof={sourceVideoId:longer.sourceVideoId,reviewedSHA256:sha,maximumSeconds:90},probe83={...probe,durationSeconds:83.06};
 validateSelection(longer,config,probe83,at,proof);
 assert.throws(()=>validateSelection(longer,config,probe83,at));
 assert.throws(()=>validateSelection({...longer,sourceVideoId:'99999'},config,probe83,at,proof));
 assert.throws(()=>validateSelection(longer,config,{...probe83,durationSeconds:91},at,proof));
 assert.throws(()=>validateSelection(longer,config,probe83,at,{...proof,reviewedSHA256:'b'.repeat(64)}));
});
