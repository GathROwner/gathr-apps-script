import test from 'node:test';import assert from 'node:assert/strict';
import {hash,POLICY} from '../policy.mjs';
import {EDITORIAL_VERSION} from '../editorial-review.mjs';
import {eligibility,listingFingerprint,REGISTRY_LOCK,publicPath,PUBLIC_POLICY} from '../published-policy.mjs';
import {publishCandidate,publishTick,cleanupPublished,retireRequestedVideo,parserIdle} from '../automatic-publication.mjs';
import {FakeDB,FakeBucket} from './fake-publication.mjs';
const id='a'.repeat(64),eventPath='venues/v/events/event',candidatePath=POLICY.queue+'/'+id,bytes=Buffer.from('owned full reviewed MP4 test bytes'),sha=hash(bytes);
const probe={durationSeconds:83.06,bytes:bytes.length,width:640,height:360,codec:'h264',hasAudio:true,audioCodec:'aac'};
const event={uniqueId:'12345',sourceUniqueIds:['12345'],venueId:'v',name:'Concert',startDate:'2099-10-30',endDate:'2099-10-30',startTime:'19:00',description:'Current concert',price:'$10'};
function setup(){const c={sourcePostId:'12345',sourceVideoId:'67890',object:`clips/${id}.mp4`,sha256:sha,durationSeconds:83.06,expiresAt:'2099-11-01',sourceAudio:true,state:'recommended',reviewVersion:EDITORIAL_VERSION,revision:'b'.repeat(64),contentAssessment:{decision:'useful',reason:'Specific concert'},listingCheck:{status:'matched'},listings:[{path:eventPath,updateTime:'1:0',fingerprint:listingFingerprint(event),title:'Concert',date:'2099-10-30',time:'19:00',venue:'Venue'}],reasons:[]};
 const db=new FakeDB({[candidatePath]:c,[eventPath]:event,'runtime_metadata/video_review':{enabled:true,automaticPublication:true,publishedCleanupEnabled:true,automaticPublicationEnabledAt:'2020-01-01'},[REGISTRY_LOCK]:{owner:'test',until:'2099-01-01'},'venues/v':{name:'Venue'}});
 const bucket=new FakeBucket({[`clips/${id}.mp4`]:{bytes,metadata:{sha256:sha,owner:POLICY.version}}}),publicBucket=new FakeBucket();
 return {db,bucket,publicBucket,c,options:{probeFile:async()=>probe},fence:async tx=>{assert.equal((await tx.get(db.doc(REGISTRY_LOCK))).data().owner,'test');}};
}
test('clear 83-second matches publish without human approval, leaving event/photo data untouched',async()=>{
 const s=setup(),before=s.db.snap(eventPath);const r=await publishCandidate(s,s.db.snap(candidatePath),s.fence,s.options);
 assert.equal(r.published,true);assert.equal(s.publicBucket.saved,1);assert.equal(s.db.snap(`listing_video_assets/${sha}`).data().state,'ready');assert.equal(s.db.snap(candidatePath).data().publication.state,'published');assert.deepEqual(s.db.snap(eventPath).data(),before.data());assert.equal(s.db.snap(eventPath).updateTime.seconds,before.updateTime.seconds);
});
test('human vetoes and uncertainty beat automatic recommendation; content-only uncertainty is resolvable by Use',()=>{
 const {c}=setup();assert.equal(eligibility(c,EDITORIAL_VERSION).state,'eligible');
 assert.equal(eligibility({...c,humanJudgment:{choice:'dont_use'}},EDITORIAL_VERSION).state,'declined');
 assert.equal(eligibility({...c,humanJudgment:{choice:'unsure'}},EDITORIAL_VERSION).state,'needs_review');
 const manual={...c,state:'held',contentAssessment:{decision:'uncertain'},reasons:['content_reviewers_disagree'],humanJudgment:{choice:'use',sha256:sha}};
 assert.equal(eligibility(manual,EDITORIAL_VERSION).state,'eligible');
 for(const reason of ['listing_conflict_needs_review','expected_audio_missing','editorial_review_incomplete'])assert.equal(eligibility({...manual,reasons:[reason]},EDITORIAL_VERSION).state,'needs_review');
});
test('no title-only, stale-assessment, missing-audio or ambiguous listing publication',()=>{
 const {c}=setup();for(const change of [{listingCheck:{status:'not_found'}},{listings:[...c.listings,...c.listings]},{sourceAudio:'unknown'},{reasons:['listing_conflict_needs_review']}])assert.notEqual(eligibility({...c,...change},EDITORIAL_VERSION).state,'eligible');
 assert.equal(eligibility({...c,reviewVersion:'older'},EDITORIAL_VERSION).state,'upgrade_review');
 assert.equal(eligibility({...c,reviewVersion:'older',state:'rejected',contentAssessment:{decision:'reject'}},EDITORIAL_VERSION).state,'filtered');
});
test('parser activity blocks reservation and public upload',async()=>{
 const s=setup();s.db.rows.set('processing_locks/live',{data:{status:'processing'},v:1});await assert.rejects(publishCandidate(s,s.db.snap(candidatePath),s.fence,s.options),/parser_busy/);assert.equal(s.publicBucket.saved,0);assert.equal(s.db.snap(`listing_video_assets/${sha}`).exists,false);
});
test('retained old legacy checkpoints are distinguished from a newly paused run',async()=>{
 const s=setup();s.db.rows.set('checkpoints/legacy',{v:1,data:{fileId:'old'}});await parserIdle(s.db);
 s.db.rows.set('checkpoints/recent',{v:Math.floor(Date.now()/1000),data:{fileId:'new'}});await assert.rejects(parserIdle(s.db),/parser_busy/);
});
test('a Not sure decision pauses a published clip without deleting its media',async()=>{
 const s=setup();await publishCandidate(s,s.db.snap(candidatePath),s.fence,s.options);await s.db.doc(candidatePath).update({humanJudgment:{choice:'unsure',reviewedAt:new Date().toISOString()}});
 assert.equal(await retireRequestedVideo(s,s.db.snap(candidatePath),s.db.snap('runtime_metadata/video_review').data(),s.fence),true);
 assert.equal(s.db.snap(candidatePath).data().publication.state,'needs_review');assert.equal(s.db.snap(`listing_video_links/${hash(eventPath)}`).data().state,'retired');assert.equal(s.publicBucket.deleted,0);
});
test('a source/listing change during upload cannot make the reservation visible',async()=>{
 const s=setup();s.publicBucket.onSave=()=>s.db.doc(eventPath).update({startTime:'22:00'});await assert.rejects(publishCandidate(s,s.db.snap(candidatePath),s.fence,s.options),/listing_changed/);assert.equal(s.db.snap(`listing_video_links/${hash(eventPath)}`).data().state,'preparing');assert.equal(s.db.snap(`listing_video_assets/${sha}`).data().state,'preparing');
});
test('a concurrent Don’t use prevents completion and a retry resumes owned uploads without duplicating media',async()=>{
 const s=setup();s.publicBucket.onSave=()=>s.db.doc(candidatePath).update({humanJudgment:{choice:'dont_use'}});await assert.rejects(publishCandidate(s,s.db.snap(candidatePath),s.fence,s.options),/human_choice/);assert.equal(s.db.snap(`listing_video_links/${hash(eventPath)}`).data().state,'preparing');
 s.publicBucket.onSave=null;await s.db.doc(candidatePath).update({humanJudgment:{choice:'use',sha256:sha}});await publishCandidate(s,s.db.snap(candidatePath),s.fence,s.options);assert.equal(s.publicBucket.saved,1);assert.equal(s.db.snap(`listing_video_links/${hash(eventPath)}`).data().state,'ready');
});
test('an existing different approved clip is preserved instead of overwritten',async()=>{
 const s=setup(),other='c'.repeat(64);s.db.rows.set(`listing_video_assets/${other}`,{data:{state:'ready'},v:1});s.db.rows.set(`listing_video_links/${hash(eventPath)}`,{v:1,data:{state:'ready',assetId:other,binding:{path:eventPath,sourceId:'12345',expiresAt:'2099-11-01'},fingerprint:listingFingerprint(event)}});
 const r=await publishCandidate(s,s.db.snap(candidatePath),s.fence,s.options);assert.equal(r.covered,true);assert.equal(s.publicBucket.saved,0);assert.equal(s.db.snap(candidatePath).data().publication.assetId,other);
});
test('new explicit Don’t use removes an owned link recoverably; Use restores it without another object',async()=>{
 const s=setup();await publishCandidate(s,s.db.snap(candidatePath),s.fence,s.options);await s.db.doc(candidatePath).update({humanJudgment:{choice:'dont_use',reviewedAt:new Date().toISOString()}});
 await retireRequestedVideo(s,s.db.snap(candidatePath),s.db.snap('runtime_metadata/video_review').data(),s.fence);assert.equal(s.db.snap(`listing_video_links/${hash(eventPath)}`).data().state,'retired');assert.equal(s.publicBucket.deleted,0);
 await s.db.doc(candidatePath).update({humanJudgment:{choice:'use',sha256:sha}});await publishCandidate(s,s.db.snap(candidatePath),s.fence,s.options);assert.equal(s.db.snap(`listing_video_links/${hash(eventPath)}`).data().state,'ready');assert.equal(s.publicBucket.saved,1);
});
test('private byte corruption or unavailable source audio cannot produce public media',async()=>{
 const s=setup();s.bucket.files.get(`clips/${id}.mp4`).bytes=Buffer.from('different');await assert.rejects(publishCandidate(s,s.db.snap(candidatePath),s.fence,s.options),/hash_invalid/);assert.equal(s.publicBucket.saved,0);
});
test('cleanup paginates beyond the old twenty-asset pilot and protects all active links',async()=>{
 const s=setup();s.db.rows.delete(REGISTRY_LOCK);
 for(let n=0;n<125;n++){const asset=hash('asset'+n),path='venues/v/events/e'+n,binding={path,sourceId:'12345',expiresAt:'2099-11-01'};s.db.rows.set(path,{data:event,v:1});s.db.rows.set(`listing_video_assets/${asset}`,{data:{state:'ready',objectPath:publicPath(asset),plan:{bindings:[binding]}},v:1});s.db.rows.set(`listing_video_links/${hash(path)}`,{data:{state:'ready',assetId:asset,binding},v:1});}
 const r=await cleanupPublished(s);assert.equal(r.inspected,125);assert.equal(r.protected,125);assert.equal(r.deleted,0);
});
test('cleanup requires the exact owned object and generation after the full grace period',async()=>{
 const s=setup();await publishCandidate(s,s.db.snap(candidatePath),s.fence,s.options);s.db.rows.delete(REGISTRY_LOCK);await s.db.doc(eventPath).update({isExpired:true});await s.db.doc(`listing_video_assets/${sha}`).update({unreferencedSince:'2020-01-01'});
 const r=await cleanupPublished(s);assert.equal(r.deleted,1);assert.equal(s.publicBucket.deleted,1);assert.equal(s.db.snap(`listing_video_assets/${sha}`).data().state,'deleted');
});
