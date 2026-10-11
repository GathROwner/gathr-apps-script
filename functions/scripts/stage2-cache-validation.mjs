// Bounded API-only experiment. No Firestore, image uploader or event writer imports.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash} from 'node:crypto';
const mode=process.argv[2];assert(['classify','downstream','playback'].includes(mode));
const execute=process.argv.includes('--execute');
const dir='artifacts/luna-stage2-cache-release/'+mode+(execute?'-api':'-offline');
fs.mkdirSync(dir,{recursive:true});assert(!fs.existsSync(dir+'/results.jsonl'),'No automatic replay');
const read=p=>JSON.parse(fs.readFileSync(p));
const lines=p=>fs.readFileSync(p,'utf8').trim().split('\n').map(JSON.parse);
const audit='C:/Users/craig/.codex/worktrees/luna-pilot-release/gathr-apps-script/artifacts/luna-oct11-production-audit';
const ledger=read(audit+'/ledger.json'),images=read(audit+'/image-manifest.json');
const previous=read('artifacts/luna-stage2-cache-oct11-paired/cohort.json');
const eligible=ledger.filter(s=>s.stage1?.hasValidContent||previous.some(p=>p.row===s.row));
const excluded=eligible.filter(s=>images.some(i=>i.row===s.row&&(i.status!=='ok'||!fs.existsSync(i.path))));
fs.writeFileSync(dir+'/excluded.json',JSON.stringify(excluded.map(s=>({row:s.row,postId:s.id,reason:'Original gallery unavailable; not relabeled caption-only'})),null,2));
const sources=eligible.filter(s=>!excluded.includes(s)).map(s=>{
 const gallery=images.filter(i=>i.row===s.row).sort((a,b)=>a.index-b.index);
 assert.equal(gallery.length,s.media.length);assert(gallery.every(i=>i.status==='ok'&&fs.existsSync(i.path)));
 return {row:s.row,postId:s.id,venue:s.venue,caption:s.caption,timestamp:s.timestamp,stage1:s.stage1,
   images:gallery.map(i=>({index:i.index,path:i.path,sha:createHash('sha256').update(fs.readFileSync(i.path)).digest('hex')}))};
});
assert.equal(new Set(sources.map(s=>s.postId)).size,sources.length);
fs.writeFileSync(dir+'/cohort.json',JSON.stringify(sources,null,2));
Object.assign(process.env,read('artifacts/luna-stage5-cache-release/serving-after.json').rows[0].env,{DRY_RUN:'true'});
if(!execute)process.env.OPENAI_API_KEY='offline-not-a-key';
assert(process.env.OPENAI_API_KEY,'Authorized credential required');
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const local=new AsyncLocalStorage(),nativeFetch=globalThis.fetch;
let totalCalls=0,totalUsd=0;
let createClassificationPrompt,createClassificationSchema;
function originalBody(actual,source){
 const prompt=createClassificationPrompt(source.caption,source.images.length>0,source.venue,{});
 const text=prompt+'\n\nReturn ONLY valid JSON that matches this schema:\n'+JSON.stringify(createClassificationSchema()[0].parameters,null,2);
 const original={...actual,input:[{role:'user',content:[{type:'input_text',text},...actual.input[0].content.filter(c=>c.type==='input_image')]}]};
 delete original.prompt_cache_options;
 // Independent transformation retained from the original paired experiment.
 const from=text.indexOf('CONTENT:\n'),to=text.lastIndexOf('CLASSIFICATION CATEGORIES:');
 const stable=(text.slice(0,from)+text.slice(to)).replace('FACEBOOK EVENT DATA is present above','FACEBOOK EVENT DATA is present in CONTENT');
 const candidate={...original,input:[{role:'user',content:[{type:'input_text',text:stable,prompt_cache_breakpoint:{mode:'explicit'}},{type:'input_text',text:text.slice(from,to)},...original.input[0].content.slice(1)]}],prompt_cache_options:{mode:'explicit',ttl:'30m'}};
 assert.deepEqual(actual,candidate,'Runtime request differs from tested cache layout');
 return original;
}
globalThis.fetch=async(url,options={})=>{
 assert.equal(typeof url==='string'?url:url.url,'https://api.openai.com/v1/responses');
 const ctx=local.getStore();assert(ctx);
 const actual=JSON.parse(options.body),isStage2=ctx.stage===2;
 let original=actual;
 if(isStage2){assert.equal(actual.model,'gpt-6-luna');assert(['none','high'].includes(actual.reasoning.effort));original=originalBody(actual,ctx.source);}
 const body=isStage2&&ctx.arm==='baseline'?original:actual;
 if(!execute){
  ctx.calls.push({originalHash:sha(original),actualHash:sha(actual),effort:actual.reasoning.effort});
  const output={contentType:'EVENT',confidence:.95,estimatedItemCount:1,classificationReason:'Source activity',contentAnalysis:{hasEvents:true,hasFoodSpecials:false,hasMultipleItems:false,organizationStyle:'unstructured'}};
  return new Response(JSON.stringify({id:'offline',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(output)}]}]}),{status:200,headers:{'content-type':'application/json'}});
 }
 assert(++totalCalls<=260&&totalUsd+.04<=.75,'Bounded spend/call cap');
 const number=totalCalls,started=Date.now(),headers=new Headers(options.headers);headers.delete('content-length');
 const response=await nativeFetch(url,{...options,headers,body:JSON.stringify(body),signal:AbortSignal.any([...(options.signal?[options.signal]:[]),AbortSignal.timeout(240000)])});
 const raw=await response.clone().json(),u=raw.usage;let usd=0;
 if(u){const d=u.input_tokens_details||{},cached=d.cached_tokens||0,write=body.model==='gpt-5-nano'?0:d.cache_write_tokens;assert(Number.isFinite(write));assert(cached+write<=u.input_tokens);
  usd=body.model==='gpt-5-nano'?((u.input_tokens-cached)*.05+cached*.005+u.output_tokens*.4)/1e6:((u.input_tokens-cached-write)*.1+cached*.01+write*.125+u.output_tokens*.5)/1e6;totalUsd+=usd;}
 const record={number,stage:ctx.stage,model:body.model,effort:body.reasoning?.effort,originalHash:sha(original),actualHash:sha(actual),ms:Date.now()-started,usd,httpStatus:response.status,status:raw.status,incomplete:raw.incomplete_details,usage:u,raw};
 ctx.calls.push(record);fs.writeFileSync(dir+`/response-${ctx.source.row}-${ctx.arm}-${ctx.calls.length}.json`,JSON.stringify(record,null,2));
 if(!response.ok){const h=new Headers(response.headers);h.set('x-should-retry','false');return new Response(JSON.stringify(raw),{status:response.status,headers:h});}
 return response;
};
createRequire(import.meta.url)('openai/shims/web');
const classifier=await import('../lib/parsing/contentClassifier.js');
({createClassificationPrompt,createClassificationSchema}=classifier);
const {resolveStage2ScoreRouting}=await import('../lib/parsing/stage2Routing.js');
const {extractContentByType}=await import('../lib/parsing/eventExtractor.js');
const {performSecondaryValidation}=await import('../lib/parsing/secondaryValidator.js');
const {performFinalFormatting}=await import('../lib/parsing/finalFormatter.js');
const cfg={stage2ModelOverride:'gpt-6-luna',stage2ReasoningEffort:'none',stage2LunaNegativeRecheck:true,
 stage3ModelOverride:'gpt-6-luna',stage3ReasoningEffort:'high',stage3ImageDetail:'high',lunaCalendarLiteralSourcePrompt:true,
 stage4ModelOverride:'gpt-5-nano',stage4BatchSize:15,stage4BatchConcurrency:2,
 stage5ModelOverride:'gpt-6-luna',stage5ReasoningEffortOverride:'none',stage5BatchSize:9,stage5BatchConcurrency:2};
const tasks=mode==='downstream'?[64,65,66,120].flatMap(row=>{
 const old=[...lines('artifacts/luna-stage2-cache-oct11-paired/results.jsonl'),...lines('artifacts/luna-stage2-cache-oct11-repeat/results.jsonl')].filter(r=>r.row===row);
 return [...new Set(old.map(r=>r.output.route))].map(route=>({source:sources.find(s=>s.row===row),arm:route}));
}):sources.flatMap((source,i)=>(i%2?['candidate','baseline']:['baseline','candidate']).map(arm=>({source,arm})));
let cursor=0;const results=[];
await Promise.all(Array.from({length:mode==='downstream'?2:4},async()=>{while(cursor<tasks.length){
 const {source,arm}=tasks[cursor++];assert(source);
 await local.run({source,arm,stage:mode==='downstream'?3:2,calls:[]},async()=>{
  const ctx=local.getStore(),urls=source.images.map(i=>'data:image/jpeg;base64,'+fs.readFileSync(i.path).toString('base64'));
  let output,error;const usage=[];
  try{
   const config={...cfg,gptUsageHandler:r=>usage.push(r)};
   if(mode==='downstream'){
    const stage3=await extractContentByType(arm,source.caption,urls,source.venue,source.timestamp,config);
    ctx.stage=4;const stage4=await performSecondaryValidation(structuredClone(stage3),source.venue,source.timestamp,config);
    ctx.stage=5;const events=await performFinalFormatting(structuredClone(stage4),source.venue,'',source.timestamp,config,source.caption);
    output={stage3,stage4,events,guard:Object.fromEntries(Object.entries(stage4).filter(([k])=>k.startsWith('_')))};
   }else{
    const classification=await classifier.classifyContent(source.caption,urls,source.venue,{},config);
    const routing=resolveStage2ScoreRouting(source.caption,classification,source.stage1);
    output={classification,routing,route:routing.shouldUseRoutedContentType?routing.routedContentType:classification.contentType,passed:classification.confidence>=.6};
   }
  }catch(e){error=e.stack;}
  const result={row:source.row,postId:source.postId,arm,output,error,usage,calls:ctx.calls.map(({raw,...r})=>r)};
  fs.appendFileSync(dir+'/results.jsonl',JSON.stringify(result)+'\n');results.push(result);
  console.log(JSON.stringify({row:source.row,arm,error,route:output?.route,passed:output?.passed,stage3:output?.stage3?.length,stage4:output?.stage4?.length,events:output?.events?.length,calls:ctx.calls.length}));
 });
}}));
fs.writeFileSync(dir+'/summary.json',JSON.stringify({complete:true,execute,mode,sourceCases:new Set(tasks.map(t=>t.source.postId)).size,tasks:tasks.length,totalCalls,totalUsd,errors:results.filter(r=>r.error).length},null,2));
console.log(JSON.stringify({complete:true,totalCalls,totalUsd}));
