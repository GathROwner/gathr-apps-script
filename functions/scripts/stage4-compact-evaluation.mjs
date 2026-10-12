// Paid or offline frozen Stage 4 comparison. Only OpenAI Responses traffic is allowed.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash} from 'node:crypto';
const execute=process.argv.includes('--execute');
const playback=process.argv.find(x=>x.startsWith('--playback='))?.slice(11);assert(!(playback&&execute));
const label=process.argv.find(x=>x.startsWith('--label='))?.slice(8)||'full';assert(/^[a-z0-9-]+$/.test(label));
const rows=process.argv.find(x=>x.startsWith('--rows='))?.slice(7).split(',').map(Number);
const days=process.argv.find(x=>x.startsWith('--days='))?.slice(7).split(',')||['oct10','oct11'];
const only=process.argv.find(x=>x.startsWith('--arm='))?.slice(6);
assert(!only||['baseline','compact'].includes(only));assert(days.every(d=>['oct10','oct11'].includes(d)));
const dir=`artifacts/stage4-compact-oct11/${label}-${execute?'api':'offline'}`;
assert(!fs.existsSync(dir),'Refuse output overwrite or implicit paid replay');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const captures=new Map();
if(playback)for(const r of fs.readdirSync(playback).filter(n=>/-compact-\d+\.json$/.test(n))
  .map(n=>({...read(playback+'/'+n),caseId:n.replace(/-compact-\d+\.json$/,'')})).sort((a,b)=>a.number-b.number)){
  const key=r.caseId+'|'+hash(r.request);if(!captures.has(key))captures.set(key,[]);captures.get(key).push(r.raw);
}
const historic='C:/Users/craig/.codex/worktrees/luna-pilot-release/gathr-apps-script/artifacts';
const sources=[];
if(days.includes('oct10'))sources.push(...read(historic+'/luna-stage4-oct10-full-comparison/cohort.json').map(c=>({...c,day:'oct10',caseId:'oct10-'+c.row})));
if(days.includes('oct11'))sources.push(...read('artifacts/luna-stage4-cache-layout-oct11/full-api/cohort.json').map(c=>({...c,day:'oct11',caseId:'oct11-'+c.row})));
const cases=sources.filter(c=>!rows||rows.includes(c.row));
assert(cases.length>0);assert.equal(new Set(cases.map(c=>c.caseId)).size,cases.length);
Object.assign(process.env,read('artifacts/luna-stage2-cache-release/serving-after.json').rows[0].env,{DRY_RUN:'true'});
delete process.env.IMAGE_UPLOAD_URL;delete process.env.IMAGE_DELETE_URL;delete process.env.STAGE4_COMPACT_VALIDATION_ENABLED;
assert.equal(process.env.STAGE4_MODEL_OVERRIDE,'gpt-5-nano');assert.equal(process.env.STAGE4_RESPONSES_REASONING_EFFORT,'low');
if(!execute)process.env.OPENAI_API_KEY='offline-compact-not-a-key';assert(process.env.OPENAI_API_KEY);
fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/cohort.json',JSON.stringify(cases,null,2));
const local=new AsyncLocalStorage(),nativeFetch=globalThis.fetch;let calls=0,usd=0;
globalThis.fetch=async(url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/responses','No DB, image or writer network permitted');
  const ctx=local.getStore();assert(ctx);
  const body=JSON.parse(options.body);assert.equal(body.model,'gpt-5-nano');assert.equal(body.reasoning?.effort,'low');
  assert.equal(body.max_output_tokens,32000);assert.equal(Boolean(body.text?.format),ctx.arm==='compact');
  assert.equal(body.prompt_cache_key,undefined,'No Stage 4 cache experiment');
  const items=JSON.parse(body.input[0].content[0].text.split('ITEMS TO VALIDATE:\n')[1].split('\n\nIMPORTANT CONTEXT:')[0]);
  assert(++calls<=400&&usd+.03<1&&ctx.requests.length<12,'Bounded call and cost budget');
  const number=calls,started=Date.now();let response,raw;
  if(execute){
    response=await nativeFetch(url,{...options,signal:AbortSignal.any([...(options.signal?[options.signal]:[]),AbortSignal.timeout(180000)])});
    raw=await response.clone().json();
  }else if(playback){
    raw=captures.get(ctx.source.caseId+'|'+hash(body))?.shift();assert(raw,'No saved API response for this exact request');
    response=new Response(JSON.stringify(raw),{status:200,headers:{'content-type':'application/json'}});
  }else{
    const result=ctx.arm==='compact'?{decisions:items.map(i=>({sourceItemIndex:i._pipelineIndex,
      sourceIdentity:Object.fromEntries(['name','date','startTime','venue'].map(k=>[k,String(i[k]??'')])),decision:'KEPT',reason:'Offline capture.',corrections:{recurringPattern:null,correctionReason:''}}))}:
      {validatedItems:items.map(i=>({item:i,decision:'KEPT',reason:'Offline capture.',corrections:{}}))};
    raw={id:'offline-'+number,status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(result)}]}]};
    response=new Response(JSON.stringify(raw),{status:200,headers:{'content-type':'application/json'}});
  }
  const usage=raw.usage;let cost=0;
  if(usage){const d=usage.input_tokens_details;assert(Number.isFinite(d?.cached_tokens));assert.equal(d?.cache_write_tokens,0);
    cost=execute?((usage.input_tokens-d.cached_tokens)*.05+d.cached_tokens*.005+usage.output_tokens*.4)/1e6:0;usd+=cost;}
  const text=(raw.output||[]).filter(x=>x.type==='message').flatMap(x=>x.content||[]).map(x=>x.text||'').join('');
  let parsed;try{parsed=JSON.parse(text);}catch{}
  const record={number,sourceIndices:items.map(i=>i._pipelineIndex),inputCount:items.length,
    request:body,raw,parsed,ms:Date.now()-started,usd:cost,usage,httpStatus:response.status,visibleChars:text.length};
  ctx.requests.push(record);
  fs.writeFileSync(`${dir}/${ctx.source.caseId}-${ctx.arm}-${number}.json`,JSON.stringify(record,null,2));
  if(!response.ok){const headers=new Headers(response.headers);headers.set('x-should-retry','false');return new Response(JSON.stringify(raw),{status:response.status,headers});}
  return response;
};
createRequire(import.meta.url)('openai/shims/web');
const {performSecondaryValidation}=await import('../lib/parsing/secondaryValidator.js');
const jobs=cases.flatMap((source,i)=>(only?[only]:i%2?['compact','baseline']:['baseline','compact']).map(arm=>({source,arm})));
let next=0;const results=[];
await Promise.all(Array.from({length:execute?4:1},async()=>{while(next<jobs.length){
  const {source,arm}=jobs[next++];
  await local.run({source,arm,requests:[]},async()=>{
    const ctx=local.getStore(),usage=[],start=Date.now();let output,error;
    try{output=await performSecondaryValidation(structuredClone(source.items),source.venue,source.timestamp,{
      stage4ModelOverride:'gpt-5-nano',stage4BatchSize:15,stage4BatchConcurrency:2,lunaCalendarLiteralSourcePrompt:true,
      stage4CompactValidation:arm==='compact',gptUsageHandler:r=>usage.push(r),
      diagnosticContext:{fileId:'frozen-compact-'+source.day,postId:source.postId,rowIndex:source.row,runId:label+'-'+arm}
    });}catch(e){error=e.stack;}
    const result={caseId:source.caseId,row:source.row,postId:source.postId,arm,output,error,usage,wallMs:Date.now()-start,
      metadata:output?Object.fromEntries(Object.keys(output).filter(k=>k.startsWith('_')).map(k=>[k,output[k]])):{},
      requests:ctx.requests.map(({raw,request,...rest})=>rest)};
    results.push(result);fs.appendFileSync(dir+'/results.jsonl',JSON.stringify(result)+'\n');
    console.log(JSON.stringify({caseId:source.caseId,arm,kept:output?.length,calls:ctx.requests.length,hold:result.metadata._compactValidationHold,guard:result.metadata._validationFallbackReason,error}));
  });
}}));
if(playback)for(const [key,queue] of captures){
  if(cases.some(c=>key.startsWith(c.caseId+'|')))assert.equal(queue.length,0,'Saved API request left unmatched: '+key);
}
fs.writeFileSync(dir+'/summary.json',JSON.stringify({complete:true,execute,playback,label,days,sources:cases.length,inputItems:cases.reduce((s,c)=>s+c.items.length,0),
  calls:execute?calls:0,usd,errors:results.filter(r=>r.error).length,noLiveWrites:true},null,2));
console.log(JSON.stringify({complete:true,sources:cases.length,calls:execute?calls:0,usd}));
