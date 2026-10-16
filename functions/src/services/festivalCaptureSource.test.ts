import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {festivalCaptureSource} from './festivalCaptureSource.js';
const fingerprint=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function fixture(){const original='https://images.fbcdn.net/v/poster.png?ctp=s590x590&token=original',resolved='https://images.fbcdn.net/v/poster.png?token=original';
 const source={caption:'Original caption',imageUrls:[original]},capture={sourceRecovery:{version:1,reason:'explicit_unreadable_source_fallback',upscaled:false,originalSourceFingerprint:fingerprint(source),imageUrls:[resolved],versions:[{sourceGalleryIndex:0,originalUrl:original,resolvedUrl:resolved,assetPath:'/v/poster.png',original:{width:590,height:382,bytes:60000,sha256:'a'.repeat(64)},larger:{width:2048,height:1325,bytes:600000,sha256:'b'.repeat(64)}}]}};return{source,capture,resolved};}
test('default capture source remains unchanged; explicit measured recovery preserves original identity and order',()=>{
 const f=fixture();assert.equal(festivalCaptureSource({},f.source,fingerprint),f.source);assert.deepEqual(festivalCaptureSource(f.capture,f.source,fingerprint),{caption:f.source.caption,imageUrls:[f.resolved]});assert(f.source.imageUrls[0].includes('ctp='));
});
test('foreign assets, gallery swaps, stale original, changed crop, invented measurements and upscaling fail closed',()=>{
 const mutations=[(f:any)=>f.source.caption+=' changed',(f:any)=>f.capture.sourceRecovery.upscaled=true,(f:any)=>f.capture.sourceRecovery.imageUrls.push(f.resolved),
  (f:any)=>f.capture.sourceRecovery.versions[0].sourceGalleryIndex=1,(f:any)=>f.capture.sourceRecovery.versions[0].assetPath='/v/another.png',
  (f:any)=>{f.capture.sourceRecovery.imageUrls[0]='https://images.fbcdn.net/v/another.png?token=original';f.capture.sourceRecovery.versions[0].resolvedUrl=f.capture.sourceRecovery.imageUrls[0];},
  (f:any)=>f.capture.sourceRecovery.versions[0].larger.width=100,(f:any)=>f.capture.sourceRecovery.versions[0].larger.sha256='bad',
  (f:any)=>f.capture.sourceRecovery.versions[0].larger.height=2048,(f:any)=>f.capture.sourceRecovery.versions.push(f.capture.sourceRecovery.versions[0])];
 for(const mutate of mutations){const f=fixture();mutate(f);assert.throws(()=>festivalCaptureSource(f.capture,f.source,fingerprint),/source_recovery_invalid/);}
});
