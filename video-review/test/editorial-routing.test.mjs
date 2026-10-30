import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import ffmpeg from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
import {prepare,transcribe,rebindTranscripts} from '../evidence-worker.mjs';
import {reviewEditorial} from '../editorial-review.mjs';
const exec=promisify(execFile);let root;
process.env.FFMPEG_PATH=ffmpeg;process.env.FFPROBE_PATH=ffprobe.path;
const answer=()=>({content:{decision:'useful',kind:'specific_event_or_special',reason:'Specific Friday dinner, $18.',evidence:[{modality:'caption',timestampSeconds:null,detail:'Friday dinner $18'}]},motion:{value:'static_poster',evidence:[]},listing:{association:'unmatched',reason:'No exact listing supplied.',conflicts:[]},audioNotes:[]});
const response=d=>new Response(JSON.stringify({status:'completed',model:'mock',usage:{input_tokens:100,output_tokens:50,input_tokens_details:{cached_tokens:0,cache_write_tokens:0}},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(d)}]}]}),{status:200});
before(async()=>{
 root=await fs.mkdtemp(join(tmpdir(),'editorial-routing-'));
 await exec(ffmpeg,['-nostdin','-v','error','-f','lavfi','-i','color=blue:s=128x96:r=10:d=2','-c:v','libx264','-pix_fmt','yuv420p',join(root,'silent.mp4')],{windowsHide:true});
 await exec(ffmpeg,['-nostdin','-v','error','-i',join(root,'silent.mp4'),'-f','lavfi','-i','sine=frequency=500:sample_rate=16000:duration=2','-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac',join(root,'audio.mp4')],{windowsHide:true});
});
after(async()=>{const resolved=await fs.realpath(root);assert.equal(dirname(resolved),await fs.realpath(tmpdir()));assert.ok(basename(resolved).startsWith('editorial-routing-'));await fs.rm(resolved,{recursive:true,force:true});});
async function fixture(id,audio=false){
 const dir=join(root,id);await fs.mkdir(dir);await fs.writeFile(join(dir,'input.json'),JSON.stringify({clips:[{id,sourcePostId:'12345',sourceVideoId:'67890',videoPath:join(root,audio?'audio.mp4':'silent.mp4'),sourceAudio:audio,caption:'Friday dinner $18',listingContext:{sourceMatched:false}}]}));
 const preparedPath=join(dir,'prepared/prepared.json');await prepare({manifestPath:join(dir,'input.json'),out:join(dir,'prepared')});return{dir,preparedPath};
}
test('missing listing still receives Luna content assessment, with no unnecessary Terra',async()=>{
 const f=await fixture('unmatched');await transcribe({preparedPath:f.preparedPath,out:join(f.dir,'speech'),execute:true,fetchImpl:()=>{throw Error('No audio request expected');}});
 const options={preparedPath:f.preparedPath,transcriptsPath:join(f.dir,'speech/transcripts.json'),out:join(f.dir,'review'),execute:true,apiKey:'test-key'};let calls=0;
 const r=await reviewEditorial({...options,fetchImpl:async()=>{calls++;return response(answer());}});assert.equal(calls,1);assert.equal(r.entries[0].contentAssessment.decision,'useful');assert.equal(r.entries[0].state,'held');assert.deepEqual(r.entries[0].reasons,['listing_match_needed']);
 await reviewEditorial({...options,fetchImpl:()=>{throw Error('Cache replay must not call network');}});
});
test('uncertain content receives blind Terra on identical evidence',async()=>{
 const f=await fixture('uncertain');await transcribe({preparedPath:f.preparedPath,out:join(f.dir,'speech'),execute:true});const requests=[];
 const r=await reviewEditorial({preparedPath:f.preparedPath,transcriptsPath:join(f.dir,'speech/transcripts.json'),out:join(f.dir,'review'),execute:true,apiKey:'test-key',fetchImpl:async(_,o)=>{const body=JSON.parse(o.body);requests.push(body);const d=answer();if(requests.length===1){d.content.decision='uncertain';d.content.kind='uncertain';}return response(d);}});
 assert.equal(requests.length,2);assert.equal(requests[0].model,'gpt-6-luna');assert.equal(requests[1].model,'gpt-6.1-terra');assert.deepEqual(requests[0].input,requests[1].input);assert.equal(r.entries[0].route,'terra_escalated');assert.equal(r.entries[0].contentAssessment.decision,'useful');
});
test('transport uncertainty stops without a Terra call or automatic retry',async()=>{
 const f=await fixture('failure');await transcribe({preparedPath:f.preparedPath,out:join(f.dir,'speech'),execute:true});let calls=0;
 const o={preparedPath:f.preparedPath,transcriptsPath:join(f.dir,'speech/transcripts.json'),out:join(f.dir,'review'),execute:true,apiKey:'test-key',fetchImpl:async()=>{calls++;throw Error('network');}};
 const r=await reviewEditorial(o);assert.equal(calls,1);assert.equal(r.entries[0].state,'held');assert.equal(r.entries[0].terra,null);await reviewEditorial(o);assert.equal(calls,1);
});
test('speech reuse across clip IDs requires the same WAV bytes and keeps provenance',async()=>{
 const old=await fixture('audioold',true),next=await fixture('audionew',true);let calls=0;
 await transcribe({preparedPath:old.preparedPath,out:join(old.dir,'speech'),execute:true,apiKey:'test-key',fetchImpl:async()=>{calls++;return new Response(JSON.stringify({text:'Friday dinner $18',model:'gpt-transcribe'}),{status:200});}});
 const reused=await rebindTranscripts({preparedPath:next.preparedPath,transcriptsPath:join(old.dir,'speech/transcripts.json'),out:join(next.dir,'speech'),matchByAudioSHA:true});
 assert.equal(calls,1);assert.equal(reused.entries[0].id,'audionew');assert.equal(reused.entries[0].reboundFrom.sourceClipId,'audioold');assert.equal(reused.entries[0].reboundFrom.match,'exact_audio_sha256');
});
