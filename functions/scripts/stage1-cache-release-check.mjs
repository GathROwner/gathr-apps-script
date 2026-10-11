// Exercise the real patched request builder. No database/media writers.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import OpenAI from 'openai';
process.argv.push('--import-only');
const {cacheLayout} = await import('./stage1-cache-experiment.mjs');
const {createStage1EvaluationPrompt, createValidationSchema, validateContentForStage1Evaluation} = await import('../lib/parsing/contentValidator.js');
const out=path.resolve('artifacts/luna-stage1-cache-release');
fs.mkdirSync(out,{recursive:true});
const root='artifacts/luna-stage1-cache-oct11-full/';
const cohort=JSON.parse(fs.readFileSync(root+'cohort.json'));
const previous=fs.readFileSync(root+'results.jsonl','utf8').trim().split('\n').map(JSON.parse);
const execute=process.argv.includes('--execute');
const nativeFetch=globalThis.fetch;
const client=execute ? new OpenAI({apiKey:process.env.OPENAI_API_KEY,maxRetries:0,timeout:120000,fetch:async(url,options)=>{
  assert.equal(String(url),'https://api.openai.com/v1/responses');return nativeFetch(url,options);
}}) : null;
const schema='\n\nReturn ONLY valid JSON that matches this schema:\n'+JSON.stringify(createValidationSchema()[0].parameters,null,2);
const results=[];
for(const c of cohort){
  const old=previous.find(r=>r.caseId===c.caseId&&r.arm==='explicit-static');
  const urls=c.images.map(i=>'data:image/jpeg;base64,'+fs.readFileSync(i.absolutePath).toString('base64'));
  const text=createStage1EvaluationPrompt(c.caption,urls.length,c.venue,c.postedAt,'compact-v10')+schema;
  const expected=cacheLayout({model:'gpt-6-luna',reasoning:{effort:'high'},max_output_tokens:6000,input:[{role:'user',content:[{type:'input_text',text},...urls.map(image_url=>({type:'input_image',image_url,detail:'high'}))]}]}).candidate;
  const paid=execute&&[37,64,66,277,292,332].includes(c.sourceRow);
  const calls=[];
  const transport={responses:{create:async request=>{
    assert.deepEqual(request,expected,'Patched request differs from tested candidate: '+c.caseId);
    if(!paid)return {status:'completed',output_text:JSON.stringify(old.run.preGateResult),usage:{input_tokens:0,output_tokens:0,total_tokens:0}};
    const start=Date.now(),response=await client.responses.create(request);
    calls.push({latencyMs:Date.now()-start,usage:response.usage,status:response.status,incomplete:response.incomplete_details,raw:response});
    return response;
  }}};
  const run=await validateContentForStage1Evaluation(c.caption,urls,c.venue,c.postedAt,'gpt-6-luna',{promptVariant:'compact-v10',structuredOutput:false,reasoningEffort:'high',localGatePolicy:'source-menu-guards',client:transport});
  assert.equal(run.status,'completed',c.caseId);
  assert.equal(run.noImageFallbackUsed,false,c.caseId);
  if(!paid)assert.equal(run.result.hasValidContent,old.run.result.hasValidContent,c.caseId);
  if(paid){assert.equal(run.result.imageAnalysis.length,c.images.length,c.caseId);assert(calls.every(x=>x.status==='completed'&&!x.incomplete));}
  const record={caseId:c.caseId,row:c.sourceRow,paid,decision:run.result.hasValidContent,run,calls};results.push(record);
  if(paid){
    fs.writeFileSync(path.join(out,'builder-row-'+c.sourceRow+'.json'),JSON.stringify(record,null,2));
    console.log(JSON.stringify({row:c.sourceRow,decision:record.decision,previousDecision:old.run.result.hasValidContent,calls:calls.length,ms:calls.reduce((n,x)=>n+x.latencyMs,0)}));
  }
}
fs.writeFileSync(path.join(out,execute?'builder-api-check.json':'builder-offline-check.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify({exactRequestMatches:results.length,actualApiCalls:results.reduce((n,x)=>n+x.calls.length,0),freshDifferences:results.filter(x=>x.paid&&x.decision!==previous.find(r=>r.caseId===x.caseId&&r.arm==='explicit-static').run.result.hasValidContent).map(x=>x.caseId)}));
