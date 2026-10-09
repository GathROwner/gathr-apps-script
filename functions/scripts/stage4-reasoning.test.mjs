import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
let request;
globalThis.fetch=async(_url,options)=>{
  request=JSON.parse(options.body);
  const text=JSON.stringify({validatedItems:[{item:{name:'Test concert',date:'2026-10-17',startTime:'20:00',type:'event'},decision:'KEPT',reason:'Valid event with explicit timing'}]});
  return new Response(JSON.stringify({id:'local-test',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text}]}],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}),{status:200,headers:{'content-type':'application/json'}});
};
process.env.OPENAI_API_KEY='local-test-not-a-key';
createRequire(import.meta.url)('openai/shims/web');
const {performSecondaryValidation}=await import('../lib/parsing/secondaryValidator.js');
for(const [model,effort,expected] of [
  ['gpt-6-luna','none','none'],['gpt-6-luna','low','low'],['gpt-6-luna','medium','medium'],
  ['gpt-5-nano','low','low'],['gpt-5-nano','none',undefined],['gpt-5-nano','',undefined],
])test(`${model} Stage 4 reasoning ${effort||'omitted'} reaches the request correctly`,async()=>{
  process.env.STAGE4_RESPONSES_REASONING_EFFORT=effort;
  const result=await performSecondaryValidation([{name:'Test concert',date:'2026-10-17',startTime:'20:00',type:'event'}],'Test venue','2026-10-09T12:00:00Z',{stage4ModelOverride:model,stage4BatchSize:15});
  assert.equal(request.model,model);assert.equal(request.reasoning?.effort,expected);
  assert.equal(request.max_output_tokens,32000);assert.equal(request.text,undefined);
  assert.equal(result.length,1);
});
