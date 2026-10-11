import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
const calls=[];let replies=[];
globalThis.fetch=async(_url,options)=>{calls.push(JSON.parse(options.body));const response=replies.shift();assert(response);return new Response(JSON.stringify({id:'local',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(response)}]}]}),{status:200,headers:{'content-type':'application/json'}});};
process.env.OPENAI_API_KEY='local-test-not-a-key';
createRequire(import.meta.url)('openai/shims/web');
const {classifyContent}=await import('../lib/parsing/contentClassifier.js');
const value=confidence=>({contentType:'EVENT',confidence,estimatedItemCount:1,classificationReason:'Activity',contentAnalysis:{hasEvents:true,hasFoodSpecials:false,hasMultipleItems:false,organizationStyle:'unstructured'}});
test('Luna fast and high negative review share the cached rules and ordered gallery',async()=>{
 calls.length=0;replies=[value(.2),value(.95)];
 const images=['https://example.test/first.jpg','https://example.test/second.jpg'];
 const out=await classifyContent('Public visit October 17',images,'Test venue',{utcStartDate:'2026-10-17T18:00:00Z'},{stage2ModelOverride:'gpt-6-luna',stage2ReasoningEffort:'none',stage2LunaNegativeRecheck:true});
 assert.equal(out.confidence,.95);assert.equal(calls.length,2);
 assert.deepEqual(calls.map(c=>c.reasoning.effort),['none','high']);
 for(const c of calls){assert.equal(c.max_output_tokens,6000);assert.deepEqual(c.prompt_cache_options,{mode:'explicit',ttl:'30m'});assert.deepEqual(c.input[0].content.slice(2),images.map(image_url=>({type:'input_image',image_url,detail:'high'})));assert(c.input[0].content[1].text.includes('FACEBOOK EVENT DATA'));}
 assert.deepEqual(calls[0].input,calls[1].input);
});
test('Mini retains its original request without Luna cache options',async()=>{
 calls.length=0;replies=[value(.95)];await classifyContent('Public activity',[],'Test venue',{}, {stage2ModelOverride:'gpt-5-mini'});
 assert.equal(calls.length,1);assert.equal(calls[0].input[0].content.length,1);assert.equal(calls[0].prompt_cache_options,undefined);assert.equal(calls[0].max_output_tokens,1500);
});
