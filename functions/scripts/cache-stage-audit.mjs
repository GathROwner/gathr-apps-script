// Paid read-only paired cache audit. API-only transport; no writer imports.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {AsyncLocalStorage} from 'node:async_hooks';
const stage=Number(process.argv[2]);assert([2,3,4,5].includes(stage));
const execute=process.argv.includes('--execute');
const repeat=process.argv.includes('--repeat');
const audit='C:/Users/craig/.codex/worktrees/luna-pilot-release/gathr-apps-script/artifacts/luna-oct11-production-audit';
const out=path.resolve('artifacts/luna-stage'+stage+'-cache-oct11-'+(execute?(repeat?'repeat':'paired'):'offline-v2'));
fs.mkdirSync(out,{recursive:true});
assert(!fs.existsSync(out+'/results.jsonl'),'No automatic paid replay');
const read=p=>JSON.parse(fs.readFileSync(p));
const ledger=read(audit+'/ledger.json'),snapshots=read(audit+'/snapshots.json'),images=read(audit+'/image-manifest.json');
const repair=read('src/processing/__fixtures__/oct11-integrity-repair.json');
const selected=repeat?(stage===2?[64,65,66,120]:stage===3?[37,292,332]:stage===4?[20,32,37,64,65,66,120,127,234,277,279,292,313,315,332]:[20,234,332]):stage===2?[20,32,37,64,65,66,120,127,157,234,235,277,278,279,292,313,315,332]:
  stage===3?[20,32,37,64,65,66,120,234,277,292,313,332]:[20,32,37,64,65,66,120,127,234,277,279,292,313,315,332];
const cases=selected.map(row=>{
  const s=ledger.find(s=>s.row===row);assert(s);
  const artifacts=snapshots.find(x=>x.rowIndex===row)?.stages?.find(x=>x.stage==='format')?.output?.stageArtifacts;
  const gallery=images.filter(i=>i.row===row).sort((a,b)=>a.index-b.index);
  assert.equal(gallery.length,s.media.length);assert(gallery.every(i=>i.status==='ok'&&fs.existsSync(i.path)));
  const fixed=repair.rows.find(x=>x.row===row);
  return {row,postId:s.id,venue:s.venue,caption:s.caption,timestamp:s.timestamp,type:artifacts?.contentType||'EVENT',stage1:s.stage1,
    sourceStage3:fixed?.stage3||artifacts?.stage3Items||[],sourceStage4:artifacts?.stage4Items||[],
    images:gallery.map(i=>({index:i.index,path:i.path,sha:createHash('sha256').update(fs.readFileSync(i.path)).digest('hex')}))};
});
fs.writeFileSync(out+'/cohort.json',JSON.stringify(cases,null,2));
const sha=s=>createHash('sha256').update(typeof s==='string'?s:JSON.stringify(s)).digest('hex');
function layout(body,c){
  const original=body.input[0].content;
  assert.equal(body.input.length,1);assert.equal(body.input[0].role,'user');
  assert.equal(original.filter(x=>x.type==='input_text').length,1);
  const text=original[0].text;
  let stable=text;const dynamic=[];
  const remove=(start,end)=>{const at=stable.indexOf(start);assert(at>=0,'Missing '+start);const to=stable.indexOf(end,at+start.length);assert(to>at,'Missing end '+end);dynamic.push(stable.slice(at,to));stable=stable.slice(0,at)+stable.slice(to);};
  if(stage===2){
    remove('CONTENT:\n','CLASSIFICATION CATEGORIES:');
    // The source block moves below the rules; preserve the same reference meaning.
    stable=stable.replace('FACEBOOK EVENT DATA is present above','FACEBOOK EVENT DATA is present in CONTENT');
  }else if(stage===3){
    const at=stable.indexOf('CONTENT:\n');
    if(at<0)return {body,applied:false,prefix:null}; // auxiliary prompts audited unchanged
    const field='- Text: "'+c.caption+'"';
    const to=stable.indexOf(field,at);assert(to>at,'Source caption mismatch');
    dynamic.push(stable.slice(at,to+field.length));stable=stable.slice(0,at)+stable.slice(to+field.length);
    const variable=stable.split('\n').filter(line=>line.includes(c.timestamp)||line.startsWith('- Timezone: use ')||(c.venue&&line.includes(c.venue)));
    for(const line of variable){dynamic.push(line);stable=stable.replace(line,'');}
  }else if(stage===4){
    remove('CURRENT CONTEXT:\n','IMPORTANT CONTEXT:');
  }else{
    remove('BATCH COUNT ENFORCEMENT:','Format these validated items');
    remove('CONTEXT:\n','CRITICAL VENUE PRESERVATION:');
    remove('ITEMS TO FORMAT:\n','CRITICAL CATEGORIZATION INSTRUCTION:');
    const venueRules=stable.split('\n').filter(line=>line.includes(c.venue));
    for(const line of venueRules){dynamic.push(line);stable=stable.replace(line,'');}
  }
  const normalize=s=>s.replace('FACEBOOK EVENT DATA is present above','FACEBOOK EVENT DATA is present in CONTENT').split('\n').filter(x=>x.trim()).sort();
  assert.deepEqual(normalize(stable+'\n'+dynamic.join('\n')),normalize(text),'Lost/duplicated rules or source fields');
  const luna=body.model==='gpt-6-luna';
  const content=[{type:'input_text',text:stable,...(luna?{prompt_cache_breakpoint:{mode:'explicit'}}:{})},{type:'input_text',text:dynamic.join('\n')},...original.slice(1)];
  assert.deepEqual(content.slice(2),original.slice(1));
  const candidate={...body,input:[{role:'user',content}],...(luna?{prompt_cache_options:{mode:'explicit',ttl:'30m'}}:{prompt_cache_key:'gathr-stage4-validation-v1'})};
  assert.deepEqual(candidate.text,body.text);assert.deepEqual(candidate.reasoning,body.reasoning);assert.equal(candidate.max_output_tokens,body.max_output_tokens);
  return {body:candidate,applied:true,prefix:sha(stable),prefixChars:stable.length};
}
const local=new AsyncLocalStorage(),nativeFetch=globalThis.fetch;
const serving=read('artifacts/luna-stage1-cache-release/serving-after.json').rows[0].env;
Object.assign(process.env,serving,{DRY_RUN:'true'});
if(!execute)process.env.OPENAI_API_KEY='offline-capture-not-a-key';
assert(process.env.OPENAI_API_KEY,'Authorized credential required');
let totalUsd=0,totalCalls=0;
globalThis.fetch=async(url,options={})=>{
  assert.equal(typeof url==='string'?url:url.url,'https://api.openai.com/v1/responses');
  const ctx=local.getStore();assert(ctx);
  const original=JSON.parse(options.body),change=layout(original,ctx.source),body=ctx.arm==='candidate'?change.body:original;
  assert.equal(body.model,stage===4?'gpt-5-nano':'gpt-6-luna');
  if(stage===2)assert(['none','high'].includes(body.reasoning?.effort));
  else assert.equal(body.reasoning?.effort,stage===3?'high':stage===4?'low':'none');
  if(!execute){ctx.requests.push({original,change});const result=stage===2?{contentType:'EVENT',confidence:.95,estimatedItemCount:1,classificationReason:'Activity',contentAnalysis:{hasEvents:true,hasFoodSpecials:false,hasMultipleItems:false,organizationStyle:'unstructured'}}:stage===3?{extractedEvents:ctx.source.sourceStage3,extractedSpecials:ctx.source.sourceStage3,extractedItems:ctx.source.sourceStage3,extractionSummary:{totalFound:ctx.source.sourceStage3.length}}:stage===4?{validatedItems:ctx.source.sourceStage3.map(item=>({item,decision:'KEPT',reason:'Source activity',corrections:{}}))}:{formattedEvents:ctx.source.sourceStage4.map((item,i)=>({...item,sourceItemIndex:i,startDate:item.date,isEvent:'Yes',isFoodSpecial:'No',category:'Gatherings & Parties'}))};return new Response(JSON.stringify({id:'offline',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(result)}]}]}),{status:200,headers:{'content-type':'application/json'}});}
  assert(++totalCalls<=160&&ctx.requests.length<12,'Call cap');assert(totalUsd+.035<=2,'USD 2 per-stage spend cap');
  const started=Date.now(),headers=new Headers(options.headers);headers.delete('content-length');
  const response=await nativeFetch(url,{...options,headers,body:JSON.stringify(body),signal:AbortSignal.any([...(options.signal?[options.signal]:[]),AbortSignal.timeout(300000)])});
  const raw=await response.clone().json();
  const u=raw.usage,d=u?.input_tokens_details;let usd=null;
  if(u){const read=d?.cached_tokens||0,write=body.model==='gpt-5-nano'?0:d?.cache_write_tokens;assert(Number.isFinite(write));assert(read+write<=u.input_tokens);usd=body.model==='gpt-5-nano'?((u.input_tokens-read)*.05+read*.005+u.output_tokens*.4)/1e6:((u.input_tokens-read-write)*.1+read*.01+write*.125+u.output_tokens*.5)/1e6;totalUsd+=usd;}
  const record={number:totalCalls,originalHash:sha(original),candidateHash:sha(change.body),prefix:change.prefix,prefixChars:change.prefixChars,applied:ctx.arm==='candidate'&&change.applied,
    model:body.model,effort:body.reasoning.effort,maxOutputTokens:body.max_output_tokens,imageHashes:original.input[0].content.filter(x=>x.type==='input_image').map(x=>sha(x.image_url)),
    ms:Date.now()-started,httpStatus:response.status,status:raw.status,incomplete:raw.incomplete_details,usage:u,usd,raw};
  ctx.requests.push(record);
  fs.writeFileSync(out+`/response-${ctx.source.row}-${ctx.arm}-${ctx.requests.length}.json`,JSON.stringify(record,null,2));
  if(!response.ok){const h=new Headers(response.headers);h.set('x-should-retry','false');return new Response(JSON.stringify(raw),{status:response.status,headers:h});}
  return response;
};
createRequire(import.meta.url)('openai/shims/web');
const {classifyContent}=await import('../lib/parsing/contentClassifier.js');
const {resolveStage2ScoreRouting}=await import('../lib/parsing/stage2Routing.js');
const {extractContentByType}=await import('../lib/parsing/eventExtractor.js');
const {performSecondaryValidation}=await import('../lib/parsing/secondaryValidator.js');
const {performFinalFormatting}=await import('../lib/parsing/finalFormatter.js');
const summary=[];
for(const source of cases){
  if(stage>=4&&!(stage===4?source.sourceStage3:source.sourceStage4).length)continue;
  const arms=source.row%2?['candidate','baseline']:['baseline','candidate'];
  const pair=await Promise.all(arms.map(arm=>local.run({source,arm,requests:[]},async()=>{
    const ctx=local.getStore(),usage=[];let output,error;
    const config={stage2ModelOverride:'gpt-6-luna',stage2ReasoningEffort:'none',stage2LunaNegativeRecheck:true,
      stage3ModelOverride:'gpt-6-luna',stage3ReasoningEffort:'high',stage3ImageDetail:'high',lunaCalendarLiteralSourcePrompt:true,
      stage4ModelOverride:'gpt-5-nano',stage4BatchSize:15,stage4BatchConcurrency:2,
      stage5ModelOverride:'gpt-6-luna',stage5ReasoningEffortOverride:'none',stage5BatchSize:9,stage5BatchConcurrency:2,
      gptUsageHandler:r=>usage.push(r)};
    const urls=source.images.map(i=>'data:image/jpeg;base64,'+fs.readFileSync(i.path).toString('base64'));
    try{
      if(stage===2){const classification=await classifyContent(source.caption,urls,source.venue,{},config);const routing=resolveStage2ScoreRouting(source.caption,classification,source.stage1);output={classification,routing,route:routing.shouldUseRoutedContentType?routing.routedContentType:classification.contentType,passed:classification.confidence>=.6};}
      else if(stage===3)output=await extractContentByType(source.type,source.caption,urls,source.venue,source.timestamp,config);
      else if(stage===4)output=await performSecondaryValidation(structuredClone(source.sourceStage3),source.venue,source.timestamp,config);
      else output=await performFinalFormatting(structuredClone(source.sourceStage4),source.venue,'',source.timestamp,config,source.caption);
    }catch(e){error=e.message;}
    const r={row:source.row,postId:source.postId,stage,arm,output,error,usage,metadata:output?Object.fromEntries(Object.keys(output).filter(k=>k.startsWith('_')).map(k=>[k,output[k]])):{},requests:ctx.requests.map(({raw,...r})=>r)};
    fs.appendFileSync(out+'/results.jsonl',JSON.stringify(r)+'\n');return r;
  })));
  summary.push(pair);console.log(JSON.stringify({stage,row:source.row,arms:pair.map(p=>({arm:p.arm,count:Array.isArray(p.output)?p.output.length:undefined,route:p.output?.route,error:p.error,calls:p.requests.length,usd:p.requests.reduce((n,r)=>n+(r.usd||0),0)}))}));
}
fs.writeFileSync(out+'/summary.json',JSON.stringify({complete:true,execute,repeat,sourceCases:cases.length,pairedCases:summary.length,totalCalls,totalUsd},null,2));
console.log(JSON.stringify({stage,complete:true,pairedCases:summary.length,totalCalls,totalUsd}));
