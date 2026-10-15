import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
let request, requests=[];
globalThis.fetch=async(_url,options)=>{
  request=JSON.parse(options.body);
  requests.push(request);
  return new Response(JSON.stringify({id:'local-test',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'{"formattedEvents":[],"formattingDecisions":[]}'}]}],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}),{status:200,headers:{'content-type':'application/json'}});
};
process.env.OPENAI_API_KEY='local-test-not-a-key';
createRequire(import.meta.url)('openai/shims/web');
const {performFinalFormatting}=await import('../lib/parsing/finalFormatter.js');
for(const [model,effort,expected] of [
  ['gpt-6-luna','none','none'],['gpt-6-luna','low','low'],['gpt-6-luna','medium','medium'],
  ['gpt-5-nano','medium','medium'],['gpt-5-nano','none',undefined],['gpt-5-nano','',undefined],
])test(`${model} reasoning ${effort||'omitted'} reaches the request correctly`,async()=>{
  requests=[];
  process.env.STAGE5_RESPONSES_REASONING_EFFORT=effort;
  await performFinalFormatting([{name:'Test concert',date:'2026-10-17',startTime:'20:00',type:'event'}],'Test venue','','2026-10-09T12:00:00Z',{stage5ModelOverride:model,stage5BatchSize:9});
  assert.equal(request.model,model);assert.equal(request.reasoning?.effort,expected);
  assert.deepEqual(requests.map(r=>r.max_output_tokens),[32000,8000]);assert.equal(request.text.format.strict,true);
});
test('a selected Luna pilot uses none even while unselected Nano keeps the medium environment',async()=>{
  process.env.STAGE5_RESPONSES_REASONING_EFFORT='medium';
  const items=[{name:'Test concert',date:'2026-10-17',startTime:'20:00',type:'event'}];
  await performFinalFormatting(items,'Test venue','','2026-10-09T12:00:00Z',
    {stage5ModelOverride:'gpt-6-luna',stage5ReasoningEffortOverride:'none',stage5BatchSize:9});
  assert.equal(request.reasoning.effort,'none');
  await performFinalFormatting(items,'Test venue','','2026-10-09T12:00:00Z',
    {stage5ModelOverride:'gpt-5-nano',stage5BatchSize:9});
  assert.equal(request.reasoning.effort,'medium');
});

test('the 100 percent default uses Luna none without a per-post model override',async()=>{
  const priorModel=process.env.STAGE5_MODEL_OVERRIDE;
  const priorEffort=process.env.STAGE5_RESPONSES_REASONING_EFFORT;
  process.env.STAGE5_MODEL_OVERRIDE='gpt-6-luna';
  process.env.STAGE5_RESPONSES_REASONING_EFFORT='none';
  try {
    await performFinalFormatting([{name:'Test concert',date:'2026-10-17',startTime:'20:00',type:'event'}],
      'Test venue','','2026-10-09T12:00:00Z',{stage5BatchSize:9});
    assert.equal(request.model,'gpt-6-luna');
    assert.equal(request.reasoning.effort,'none');
  } finally {
    if(priorModel===undefined)delete process.env.STAGE5_MODEL_OVERRIDE;else process.env.STAGE5_MODEL_OVERRIDE=priorModel;
    if(priorEffort===undefined)delete process.env.STAGE5_RESPONSES_REASONING_EFFORT;else process.env.STAGE5_RESPONSES_REASONING_EFFORT=priorEffort;
  }
});
