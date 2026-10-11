// Bounded Stage 4-only frozen-input experiment. No database, media or writer imports.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {AsyncLocalStorage} from 'node:async_hooks';
import {stage4CacheLayout,digest} from './stage4-cache-layout.mjs';
const execute=process.argv.includes('--execute');
const rowsArg=process.argv.find(x=>x.startsWith('--rows='));
const selected=rowsArg?rowsArg.slice(7).split(',').map(Number):null;
const label=process.argv.find(x=>x.startsWith('--label='))?.slice(8)||'full';
assert(/^[a-z0-9-]+$/.test(label));
const out='artifacts/luna-stage4-cache-layout-oct11/'+label+(execute?'-api':'-offline');
assert(!fs.existsSync(out),'Refuse automatic replay or overwrite');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const audit='C:/Users/craig/.codex/worktrees/luna-pilot-release/gathr-apps-script/artifacts/luna-oct11-production-audit';
const snapshots=read(audit+'/snapshots.json'),ledger=read(audit+'/ledger.json');
const cases=snapshots.map(s=>{
  const a=s.stages.find(x=>x.output?.stageArtifacts)?.output.stageArtifacts;
  const source=ledger.find(x=>x.row===s.rowIndex);assert(source);
  return {row:s.rowIndex,postId:source.id,venue:source.venue,caption:source.caption,timestamp:source.timestamp,
    items:a?.stage3Items||[],productionKept:a?.stage4Items||[]};
}).filter(c=>c.items.length&&(!selected||selected.includes(c.row)));
assert.equal(new Set(cases.map(c=>c.postId)).size,cases.length);
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/cohort.json',JSON.stringify(cases,null,2));
Object.assign(process.env,read('artifacts/luna-stage2-cache-release/serving-after.json').rows[0].env,{DRY_RUN:'true'});
assert.equal(process.env.STAGE4_MODEL_OVERRIDE,'gpt-5-nano');
assert.equal(process.env.STAGE4_RESPONSES_REASONING_EFFORT,'low');
if(!execute)process.env.OPENAI_API_KEY='offline-placeholder-not-a-key';
assert(process.env.OPENAI_API_KEY,'Previously authorized GathR credential required');
const storage=new AsyncLocalStorage(),nativeFetch=globalThis.fetch;
let totalCalls=0,totalUSD=0;
globalThis.fetch=async(url,options={})=>{
  assert.equal(typeof url==='string'?url:url.url,'https://api.openai.com/v1/responses','API-only network allowlist');
  const ctx=storage.getStore();assert(ctx);
  const original=JSON.parse(options.body),layout=stage4CacheLayout(original);
  const body=ctx.arm==='candidate'?layout.body:original;
  const callNumber=++totalCalls;
  assert(totalCalls<=180&&ctx.requests.length<8&&totalUSD+.04<=.75,'Paid call/spend cap');
  if(!execute){
    ctx.requests.push({original,layout});
    const result={validatedItems:layout.items.map(item=>({item,decision:'KEPT',reason:'Offline request capture',corrections:{}}))};
    return new Response(JSON.stringify({id:'offline',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(result)}]}]}),{status:200,headers:{'content-type':'application/json'}});
  }
  const started=Date.now(),headers=new Headers(options.headers);headers.delete('content-length');
  const response=await nativeFetch(url,{...options,headers,body:JSON.stringify(body),signal:AbortSignal.any([...(options.signal?[options.signal]:[]),AbortSignal.timeout(180000)])});
  const raw=await response.clone().json(),u=raw.usage,d=u?.input_tokens_details;let usd=0;
  if(u){assert(Number.isFinite(d?.cached_tokens));assert(d.cached_tokens<=u.input_tokens);assert(!d.cache_write_tokens,'Unexpected Nano cache-write usage');
    usd=((u.input_tokens-d.cached_tokens)*.05+d.cached_tokens*.005+u.output_tokens*.4)/1e6;totalUSD+=usd;}
  const text=(raw.output||[]).filter(x=>x.type==='message').flatMap(x=>x.content||[]).map(x=>x.text||'').join('');
  let parsed;try{parsed=JSON.parse(normalizeStage4JsonForRegression(text));}catch{}
  const record={number:callNumber,model:body.model,effort:body.reasoning.effort,maxOutputTokens:body.max_output_tokens,
    responseId:raw.id,httpStatus:response.status,status:raw.status,incomplete:raw.incomplete_details,
    ms:Date.now()-started,usd,usage:u,visibleChars:text.length,parseError:!parsed,
    inputItems:layout.items,rawDecisions:parsed?.validatedItems,rawSummary:parsed?.validationSummary,
    originalHash:layout.originalHash,candidateHash:layout.candidateHash,prefix:layout.prefix,
    prefixChars:layout.prefixChars,sourceChars:layout.sourceChars,contractChars:layout.contractChars,raw};
  ctx.requests.push(record);
  fs.writeFileSync(out+`/response-${ctx.source.row}-${ctx.arm}-${callNumber}.json`,JSON.stringify(record,null,2));
  if(!response.ok){const h=new Headers(response.headers);h.set('x-should-retry','false');return new Response(JSON.stringify(raw),{status:response.status,headers:h});}
  return response;
};
createRequire(import.meta.url)('openai/shims/web');
const {performSecondaryValidation,normalizeStage4JsonForRegression}=await import('../lib/parsing/secondaryValidator.js');
const tasks=cases.flatMap((source,i)=>(i%2?['candidate','baseline']:['baseline','candidate']).map(arm=>({source,arm})));
let next=0;const results=[];
await Promise.all(Array.from({length:execute?4:1},async()=>{while(next<tasks.length){
  const {source,arm}=tasks[next++];
  await storage.run({source,arm,requests:[]},async()=>{
    const ctx=storage.getStore(),usage=[];let output,error;
    try{output=await performSecondaryValidation(structuredClone(source.items),source.venue,source.timestamp,{
      stage4ModelOverride:'gpt-5-nano',stage4BatchSize:15,stage4BatchConcurrency:2,lunaCalendarLiteralSourcePrompt:true,
      diagnosticContext:{fileId:'stage4-cache-only-frozen',postId:source.postId,rowIndex:source.row,runId:label+'-'+arm},
      gptUsageHandler:r=>usage.push(r)
    });}catch(e){error=e.stack;}
    const result={row:source.row,postId:source.postId,arm,output,error,usage,
      metadata:output?Object.fromEntries(Object.keys(output).filter(k=>k.startsWith('_')).map(k=>[k,output[k]])):{},
      requests:ctx.requests.map(({raw,...r})=>r)};
    fs.appendFileSync(out+'/results.jsonl',JSON.stringify(result)+'\n');results.push(result);
    console.log(JSON.stringify({row:source.row,arm,kept:output?.length,calls:ctx.requests.length,guard:result.metadata._validationFallbackReason,error}));
  });
}}));
fs.writeFileSync(out+'/summary.json',JSON.stringify({complete:true,execute,label,sourceCases:cases.length,inputItems:cases.reduce((n,c)=>n+c.items.length,0),
  totalCalls:execute?totalCalls:0,totalUSD,errors:results.filter(r=>r.error).length,noLiveWrites:true},null,2));
console.log(JSON.stringify({complete:true,execute,totalCalls:execute?totalCalls:0,totalUSD,sourceCases:cases.length}));
