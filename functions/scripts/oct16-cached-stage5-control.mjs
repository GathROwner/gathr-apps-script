// Explicitly OFFLINE cached-response playback; no paid calls or Firestore use.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const args=process.argv.slice(2),arg=k=>args.find(x=>x.startsWith(k+'='))?.slice(k.length+1);
if(!arg('--snapshots')||!arg('--response'))throw Error('Requires exact private --snapshots and --response');
const snapshots=JSON.parse(fs.readFileSync(arg('--snapshots'))),s=snapshots.find(x=>x.data.rowIndex===165).data;
const raw=JSON.parse(fs.readFileSync(arg('--response'))).body;
const requests=[];globalThis.fetch=async(url,options)=>{
 assert.match(String(url),/^https:\/\/api.openai.com\/v1\/responses$/);requests.push(JSON.parse(options.body));
 return new Response(JSON.stringify({...raw,usage:{input_tokens:0,output_tokens:0,total_tokens:0}}),{status:200,headers:{'content-type':'application/json','x-gathr-offline-replay':'1'}});
};
process.env.OPENAI_API_KEY='offline-fixture-not-a-key';createRequire(import.meta.url)('openai/shims/web');
const {performFinalFormatting}=await import('../lib/parsing/finalFormatter.js');
const items=s.stages[0].output.stageArtifacts.stage4Items;
const out=await performFinalFormatting(items,s.establishment,'',s.rowMeta.timestamp,{stage5ModelOverride:'gpt-6-luna',stage5ReasoningEffortOverride:'none',stage5BatchSize:9,stage5BatchConcurrency:1},s.inputText);
assert.equal(requests.length,1);const r=requests[0];
assert.deepEqual(r.prompt_cache_options,{mode:'explicit',ttl:'30m'});assert.equal(r.input[0].content.length,2);
assert.deepEqual(r.input[0].content[0].prompt_cache_breakpoint,{mode:'explicit'});assert.equal(r.reasoning.effort,'none');assert.equal(r.model,'gpt-6-luna');
assert.equal(r.text.format.strict,true);assert.equal(r.text.format.schema.properties.formattedEvents.minItems,4);
assert.equal(r.text.format.schema.properties.formattedEvents.maxItems,4);assert.deepEqual(r.text.format.schema.properties.formattedEvents.items.properties.sourceItemIndex.enum,[0,1,2,3]);
assert.equal(out.length,4);assert.equal(out[0].category,'Gatherings & Parties');assert.equal(out[0].isEvent,'Yes');assert.equal(out[0].isFoodSpecial,'No');
assert.deepEqual(out.map(x=>[x.startDate,x.startTime]),items.map(x=>[x.date,x.startTime]));
const result={offline:true,paidGenerationCalls:0,liveWrites:0,sourceItems:4,formattedItems:out.length,cacheContract:'explicit 30m two-text-block prefix unchanged',events:out.map(x=>({name:x.name,category:x.category,startDate:x.startDate,startTime:x.startTime}))};
const dest=path.resolve('artifacts/oct16-eight-group/cached-stage5-control.json');fs.writeFileSync(dest,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
