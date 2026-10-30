import test from 'node:test';
import assert from 'node:assert/strict';
import {cdnUrl,discover,rangeRequest,publicCandidate,validateJudgment,allowedIdentity} from '../policy.mjs';
const url='https://video.xx.fbcdn.net/a.mp4?sig=secret';
const media={__typename:'Video',videoId:'1234567',playable_duration_in_ms:5000,audio_availability:'UNAVAILABLE',videoDeliveryLegacyFields:{browser_native_sd_url:url}};
test('finds nested shared videos while binding the outer post',()=>{
  const [c]=discover([{postId:'999999',text:'Outer',sharedPost:{id:'888888',text:'Shared',media:[media]}}],'file',0);
  assert.equal(c.sourcePostId,'999999');assert.equal(c.sourceVideoId,'1234567');assert.equal(c.caption,'Outer\n\nShared');assert.equal(c.sourceAudio,false);assert.equal(c.state,'queued');assert.equal(c.mediaPath,'sharedPost/media/0');
});
test('XLSX flattened discovery is identical to nested JSON and deduplicates repeats',()=>{
  const flat={'postId':'999999','media/0/__typename':'Video','media/0/videoId':'1234567','media/0/playable_duration_in_ms':5000,'media/0/audio_availability':'UNAVAILABLE','media/0/videoDeliveryLegacyFields/browser_native_sd_url':url};
  assert.equal(discover([flat,flat],'file').length,1);assert.equal(discover([flat],'a')[0].id,discover([flat],'b')[0].id);
});
test('overlong and undownloadable clips remain visible with source and judgment revision',()=>{
  const [c]=discover([{postId:'999999',media:[{...media,playable_duration_in_ms:61000}]}],'f');
  assert.equal(c.state,'held');assert.deepEqual(c.reasons,['clip_over_60_seconds']);assert.match(c.revision,/^[a-f0-9]{64}$/);assert.match(c.sourcePage,/1234567/);
});
test('different captions create a new candidate while repeat datasets reuse identity',()=>{
  const c=t=>discover([{postId:'999999',text:t,media:[media]}],'f')[0].id;
  assert.notEqual(c('old'),c('new'));assert.equal(c('old'),c('old'));
});
test('CDN gate accepts both actual Facebook video host forms but rejects SSRF',()=>{
  assert.equal(cdnUrl(url),url);assert.doesNotThrow(()=>cdnUrl('https://video-lga3-1.xx.fbcdn.net/a'));
  for(const x of ['http://video.xx.fbcdn.net/a','https://video.xx.fbcdn.net.evil.com/a','https://127.0.0.1/a','https://video.xx.fbcdn.net:444/a','https://me:pw@video.xx.fbcdn.net/a','https://fbcdn.net/a'])assert.throws(()=>cdnUrl(x));
});
test('portal never returns signed source URL, leases or artifact paths',()=>{
  assert.deepEqual(publicCandidate({sourceUrl:url,lease:{owner:'x'},artifacts:'x',id:'a',sourcePage:'https://www.facebook.com/reel/123/'}),{id:'a',sourcePage:'https://www.facebook.com/reel/123/'});
});
test('HTTP range handling covers suffix, open-ended and bounded requests',()=>{
  assert.deepEqual(rangeRequest('bytes=10-19',100),{start:10,end:19,partial:true});assert.equal(rangeRequest('bytes=-10',100).start,90);assert.equal(rangeRequest('bytes=90-',100).end,99);
  for(const x of ['bytes=100-','bytes=9-1','bytes=-','bytes=0-1,5-6','nonsense'])assert.throws(()=>rangeRequest(x,100));
});
test('human opinions are revision-bound and cannot request publication',()=>{
  assert.deepEqual(validateJudgment({judgment:'want_video',notes:'Animation helps',revision:'a'.repeat(64)}),{judgment:'want_video',choice:'use',notes:'Animation helps'});
  for(const x of [{judgment:'publish',notes:'',revision:'a'.repeat(64)},{judgment:'want_video',notes:'',revision:'stale'},{judgment:'unsure',notes:'x'.repeat(2001),revision:'a'.repeat(64)}])assert.throws(()=>validateJudgment(x));
});
test('300 distinct clips are retained without a per-parse count cap',()=>{
  const rows=Array.from({length:300},(_,n)=>({postId:String(100000+n),media:[{...media,videoId:String(200000+n)}]}));
  assert.equal(discover(rows,'large-parse').length,300);
});
test('private review requires a verified explicitly allowlisted UID',()=>{
  assert.equal(allowedIdentity({uid:'craig',email_verified:true},{adminUids:['craig']}),true);
  for(const [identity,config]of [[{uid:'stranger',email_verified:true},{adminUids:['craig']}],[{uid:'craig',email_verified:false},{adminUids:['craig']}],[{uid:'craig',email_verified:true},undefined],[null,{adminUids:['craig']}]])assert.equal(allowedIdentity(identity,config),false);
});
