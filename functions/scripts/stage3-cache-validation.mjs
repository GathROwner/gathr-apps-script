// Bounded API-only paired experiment. No DB, image uploader or live writer imports.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {AsyncLocalStorage} from 'node:async_hooks';
import {stage3CacheLayout} from './stage3-cache-layout.mjs';
const mode=process.argv[2];assert(['guard','full','repeat'].includes(mode));
const execute=process.argv.includes('--execute');
const rowsArg=process.argv.find(s=>s.startsWith('--rows='));
const requested=rowsArg?rowsArg.slice(7).split(',').map(Number):null;
const label=process.argv.find(s=>s.startsWith('--label='))?.slice(8)||mode;
assert(/^[a-z0-9-]+$/.test(label));
const out='artifacts/luna-stage3-cache-layout-oct11/'+label+(execute?'-api':'-offline');
assert(!fs.existsSync(out),'Refuse to overwrite any prior experiment');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const audit='C:/Users/craig/.codex/worktrees/luna-pilot-release/gathr-apps-script/artifacts/luna-oct11-production-audit';
const snapshots=read(audit+'/snapshots.json'),ledger=read(audit+'/ledger.json'),images=read(audit+'/image-manifest.json');
const snapshotArtifact=s=>s.stages.find(x=>x.output?.stageArtifacts)?.output.stageArtifacts;
const candidates=snapshots.filter(s=>snapshotArtifact(s)?.stage3InputKind);
const selected=candidates.filter(s=>!requested||requested.includes(s.rowIndex)).filter(s=>mode!=='guard'||[37,234,292].includes(s.rowIndex));
const excluded=[],sources=[];
for(const snap of selected){
  const s=ledger.find(x=>x.row===snap.rowIndex),a=snapshotArtifact(snap);
  const gallery=images.filter(i=>i.row===s.row).sort((a,b)=>a.index-b.index);
  assert.equal(gallery.length,s.media.length);
  if(gallery.some(i=>i.status!=='ok'||!fs.existsSync(i.path))){excluded.push({row:s.row,postId:s.id,reason:'Original gallery unavailable; not relabeled caption-only'});continue;}
  sources.push({row:s.row,postId:s.id,venue:s.venue,caption:s.caption,timestamp:s.timestamp,type:a.contentType||'EVENT',inputKind:a.stage3InputKind,
    frozenItems:a.stage3Items||[],images:gallery.map(i=>({index:i.index,path:i.path,sha:createHash('sha256').update(fs.readFileSync(i.path)).digest('hex')}))});
}
assert.equal(new Set(sources.map(s=>s.postId)).size,sources.length);
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(out+'/cohort.json',JSON.stringify(sources,null,2));
fs.writeFileSync(out+'/excluded.json',JSON.stringify(excluded,null,2));
Object.assign(process.env,read('artifacts/luna-stage2-cache-release/serving-after.json').rows[0].env,{DRY_RUN:'true'});
if(!execute)process.env.OPENAI_API_KEY='offline-placeholder-not-a-key';
assert(process.env.OPENAI_API_KEY,'Previously authorized credential required');
const local=new AsyncLocalStorage(),nativeFetch=globalThis.fetch;
let totalCalls=0,totalUSD=0;
globalThis.fetch=async(url,options={})=>{
  assert.equal(typeof url==='string'?url:url.url,'https://api.openai.com/v1/responses','API-only network allowlist');
  const ctx=local.getStore();assert(ctx);
  const original=JSON.parse(options.body);
  assert.equal(original.reasoning?.effort,'high');
  const layout=stage3CacheLayout(original,ctx.source);
  const body=ctx.arm==='candidate'?layout.body:original;
  const attached=original.input[0].content.filter(p=>p.type==='input_image');
  assert.equal(attached.length,ctx.source.images.length,'No image-to-text retry or substituted gallery');
  if(!execute){
    ctx.calls.push({original,layout});
    const result={extractedEvents:ctx.source.frozenItems,extractedSpecials:ctx.source.frozenItems,extractedItems:ctx.source.frozenItems,items:ctx.source.frozenItems,extractionSummary:{totalFound:ctx.source.frozenItems.length}};
    return new Response(JSON.stringify({id:'offline',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(result)}]}]}),{status:200,headers:{'content-type':'application/json'}});
  }
  assert(++totalCalls<=250&&ctx.calls.length<10&&totalUSD+.04<=1.0,'Call or USD 1 spend cap reached');
  const started=Date.now(),headers=new Headers(options.headers);headers.delete('content-length');
  const response=await nativeFetch(url,{...options,headers,body:JSON.stringify(body),signal:AbortSignal.any([...(options.signal?[options.signal]:[]),AbortSignal.timeout(180000)])});
  const raw=await response.clone().json(),u=raw.usage;let usd=0;
  if(u){const d=u.input_tokens_details||{},cached=d.cached_tokens||0,write=d.cache_write_tokens;assert(Number.isFinite(write));assert(cached+write<=u.input_tokens);usd=((u.input_tokens-cached-write)*.1+cached*.01+write*.125+u.output_tokens*.5)/1e6;totalUSD+=usd;}
  const text=raw.output?.filter(x=>x.type==='message').flatMap(x=>x.content||[]).map(x=>x.text||'').join('')||'';
  const record={number:totalCalls,ms:Date.now()-started,usd,httpStatus:response.status,status:raw.status,incomplete:raw.incomplete_details,usage:u,
    model:body.model,effort:body.reasoning.effort,maxOutputTokens:body.max_output_tokens,
    applied:ctx.arm==='candidate'&&layout.applied,prefix:layout.prefix,prefixChars:layout.prefixChars,fieldsChars:layout.fieldsChars,sourceChars:layout.sourceChars,
    imageCount:attached.length,originalHash:layout.originalHash,candidateHash:layout.candidateHash,visibleChars:text.length,raw};
  ctx.calls.push(record);
  fs.writeFileSync(out+`/response-${ctx.source.row}-${ctx.arm}-${ctx.calls.length}.json`,JSON.stringify(record,null,2));
  if(!response.ok){const h=new Headers(response.headers);h.set('x-should-retry','false');return new Response(JSON.stringify(raw),{status:response.status,headers:h});}
  return response;
};
createRequire(import.meta.url)('openai/shims/web');
const {extractContentByType}=await import('../lib/parsing/eventExtractor.js');
const config={stage3ModelOverride:'gpt-6-luna',stage3ReasoningEffort:'high',stage3ImageDetail:'high',lunaCalendarLiteralSourcePrompt:true};
// Interleave arms and bound concurrency. No artificial cache warmup requests.
const tasks=sources.flatMap((source,i)=>(i%2?['candidate','baseline']:['baseline','candidate']).map(arm=>({source,arm})));
let cursor=0;const results=[];
await Promise.all(Array.from({length:execute?4:1},async()=>{while(cursor<tasks.length){
  const {source,arm}=tasks[cursor++];
  await local.run({source,arm,calls:[]},async()=>{
    const ctx=local.getStore(),usage=[];let output,error;
    const urls=source.images.map(i=>'data:image/jpeg;base64,'+fs.readFileSync(i.path).toString('base64'));
    try{output=await extractContentByType(source.type,source.caption,urls,source.venue,source.timestamp,{...config,gptUsageHandler:r=>usage.push(r)});}catch(e){error=e.stack;}
    const result={row:source.row,postId:source.postId,arm,output,error,usage,calls:ctx.calls.map(({raw,...r})=>r)};
    fs.appendFileSync(out+'/results.jsonl',JSON.stringify(result)+'\n');results.push(result);
    console.log(JSON.stringify({row:source.row,arm,count:output?.length,calls:ctx.calls.length,error:error?.slice(0,200)}));
  });
}}));
fs.writeFileSync(out+'/summary.json',JSON.stringify({complete:true,execute,mode,label,sourceCases:sources.length,excluded,totalCalls,totalUSD,errors:results.filter(r=>r.error).length,config},null,2));
console.log(JSON.stringify({complete:true,totalCalls,totalUSD,sourceCases:sources.length,excluded}));
