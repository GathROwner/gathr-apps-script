// Exercise the real release builder and safeguards. Playback has zero API calls;
// --execute sends only six explicit paired controls to the Responses API.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {createRequire} from 'node:module';
import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash} from 'node:crypto';
const execute=process.argv.includes('--execute');
const dir='artifacts/luna-stage5-cache-release';fs.mkdirSync(dir,{recursive:true});
const tag=execute?'api':process.argv.includes('--verify-playback')?'playback-verified':'playback';
const out=dir+'/'+tag+'-results.jsonl';
assert(!fs.existsSync(out),'No automatic replay/overwrite');
const read=p=>JSON.parse(fs.readFileSync(p));
const lines=p=>fs.readFileSync(p,'utf8').trim().split('\n').map(JSON.parse);
const root='artifacts/luna-stage5-cache-oct11-full';
const cohort=read(root+'/cohort.json');
const prior=lines(root+'/results.jsonl');
const templates=lines(root+'-offline/results.jsonl').filter(r=>r.arm==='baseline');
const plans=[];
Object.assign(process.env,read('artifacts/luna-stage1-cache-release/serving-after.json').rows[0].env,{DRY_RUN:'true'});
if(!execute)process.env.OPENAI_API_KEY='playback-not-a-key';
assert(process.env.OPENAI_API_KEY,'Authorized credential required');
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const norm=v=>String(v||'').normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]/g,'');
const clock=v=>String(v||'').toLowerCase()==='unknown'?'':String(v||'');
const identity=e=>[norm(e.name),e.startDate||e.date,clock(e.startTime)].join('|');
function verifyInventory(output,source){
 const expanded=output.flatMap(e=>{
  const count=Number(e.totalOccurrences||1),weekly=String(e.recurringPattern||'').startsWith('weekly_');
  if(count<2||!weekly)return[e];assert(Number.isInteger(count)&&count<=200);
  return Array.from({length:count},(_,i)=>{const d=new Date(e.startDate+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+7*Number(e.recurringWeekInterval||1)*i);return {...e,startDate:d.toISOString().slice(0,10)};});
 });
 assert.equal(expanded.length,source.sourceStage4.length,'Occurrence count changed');
 for(const item of source.sourceStage4){
  const at=expanded.findIndex(e=>identity(e)===identity(item));assert(at>=0,'Missing source occurrence: '+item.name);
  const event=expanded.splice(at,1)[0];assert.equal(clock(event.endTime),clock(item.endTime));
  if(item.ticketLink)assert.equal(event.ticketLink,item.ticketLink);
  const price=item.price||item.pricing?.price||(typeof item.pricing==='string'?item.pricing:'');
  if(price)assert.equal(norm(event.ticketPrice),norm(price));
  if(Number.isInteger(item.relevantImageIndex))assert.equal(event.relevantImageIndex,item.relevantImageIndex);
  if(item.venue)assert.equal(norm(event.venue||event.establishment),norm(item.venue));
 }
 assert.equal(expanded.length,0);
}
const local=new AsyncLocalStorage(),nativeFetch=globalThis.fetch;
let totalUsd=0,apiCalls=0,builderChecks=0;
globalThis.fetch=async(url,options={})=>{
 assert.equal(String(url),'https://api.openai.com/v1/responses');
 const ctx=local.getStore(),actual=JSON.parse(options.body);
 const plan=plans.find(r=>r.row===ctx.source.row).requests.find(q=>isDeepStrictEqual(q.expected,actual));
 assert(plan,'Release builder differs from tested cache candidate, row '+ctx.source.row);
 builderChecks++;
 const originalHash=sha(plan.original);
 const old=prior.find(r=>r.row===ctx.source.row&&r.arm===ctx.arm);
 const index=old.requests.findIndex(q=>q.originalHash===originalHash);
 assert(index>=0,'No retained matching batch');
 const request=ctx.arm==='candidate'?actual:plan.original;
 let raw,response,ms=0,usd=0;
 if(execute){
  assert(++apiCalls<=40&&totalUsd<.25,'Bounded controls only');
  const started=Date.now(),headers=new Headers(options.headers);headers.delete('content-length');
  response=await nativeFetch(url,{...options,headers,body:JSON.stringify(request),signal:AbortSignal.any([...(options.signal?[options.signal]:[]),AbortSignal.timeout(180000)])});
  raw=await response.clone().json();ms=Date.now()-started;
  assert(response.ok);assert.equal(raw.status,'completed');assert(!raw.incomplete_details);
  const u=raw.usage,d=u.input_tokens_details,write=d.cache_write_tokens;
  assert(Number.isFinite(write));const cached=d.cached_tokens||0;assert(cached+write<=u.input_tokens);
  usd=((u.input_tokens-cached-write)*.1+cached*.01+write*.125+u.output_tokens*.5)/1e6;totalUsd+=usd;
 }else raw=read(root+`/response-${ctx.source.row}-${ctx.arm}-${index+1}.json`).raw;
 const text=raw.output.filter(x=>x.type==='message').flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');
 const parsed=JSON.parse(text),count=old.requests[index].batchItems.length;
 assert.deepEqual(parsed.formattedEvents.map(e=>e.sourceItemIndex).sort((a,b)=>a-b),Array.from({length:count},(_,i)=>i));
 ctx.calls.push({originalHash,ms,usd,raw});
 return response||new Response(JSON.stringify(raw),{status:200,headers:{'content-type':'application/json'}});
};
createRequire(import.meta.url)('openai/shims/web');
const {performFinalFormatting,createFormattingPrompt}=await import('../lib/parsing/finalFormatter.js');
// Independent prototype transformation from the experiment. Every reconstructed
// original must also match a real paid full-cohort original hash below.
for(const source of cohort){
 const template=templates.find(r=>r.row===source.row).requests[0].original,requests=[];
 for(let offset=0;offset<source.sourceStage4.length;offset+=9){
  const items=source.sourceStage4.slice(offset,offset+9),count=items.length;
  const text=`BATCH COUNT ENFORCEMENT: You are formatting exactly ${count} validated items.\n`+
   `Return exactly ${count} objects in formattedEvents (one-to-one with the input order).\n`+
   'Copy each input sourceItemIndex to the matching formatted event. Do not drop, merge, or reorder items.\n'+
   'Never return arrays of values for an item; each must be a JSON object.\n\n'+
   createFormattingPrompt(items,source.venue,'',source.timestamp);
  const original={...template,input:[{role:'user',content:[{type:'input_text',text}]}]};
  assert(prior.find(r=>r.row===source.row&&r.arm==='baseline').requests.some(q=>q.originalHash===sha(original)),'Original request drift');
  let stable=text;const dynamic=[];
  for(const [start,end] of [['BATCH COUNT ENFORCEMENT:','Format these validated items'],['CONTEXT:\n','CRITICAL VENUE PRESERVATION:'],['ITEMS TO FORMAT:\n','CRITICAL CATEGORIZATION INSTRUCTION:']]){
   const from=stable.indexOf(start),to=stable.indexOf(end,from+start.length);assert(from>=0&&to>from);
   dynamic.push(stable.slice(from,to));stable=stable.slice(0,from)+stable.slice(to);
  }
  for(const line of stable.split('\n').filter(line=>line.includes(source.venue))){dynamic.push(line);stable=stable.replace(line,'');}
  const expected={...original,input:[{role:'user',content:[{type:'input_text',text:stable,prompt_cache_breakpoint:{mode:'explicit'}},{type:'input_text',text:dynamic.join('\n')}]}],prompt_cache_options:{mode:'explicit',ttl:'30m'}};
  requests.push({original,expected});
 }
 plans.push({row:source.row,requests});
}
const results=[];
for(const source of cohort.filter(c=>!execute||[22,48,212,229,234,285].includes(c.row))){
 for(const arm of source.row%2?['candidate','baseline']:['baseline','candidate']){
  await local.run({source,arm,calls:[]},async()=>{
   const ctx=local.getStore();
   const output=await performFinalFormatting(structuredClone(source.sourceStage4),source.venue,'',source.timestamp,
    {stage5ModelOverride:'gpt-6-luna',stage5ReasoningEffortOverride:'none',stage5BatchSize:9,stage5BatchConcurrency:2},source.caption);
   assert(output.length,'Unexpected formatter hold');
   const expectedCount=prior.find(r=>r.row===source.row&&r.arm===arm).output.length;
   assert.equal(output.length,expectedCount,'Final count changed, row '+source.row);
   verifyInventory(output,source);
   const earlier=prior.find(r=>r.row===source.row&&r.arm===arm).output;
   for(let i=0;i<output.length;i++) for(const field of ['name','startDate','endDate','startTime','endTime','venue','establishment','additionalLocation','ticketPrice','ticketLink','relevantImageIndex','category','isEvent','isFoodSpecial','isRecurring','recurringPattern','totalOccurrences','recurrenceUntilDate','recurringDaysOfWeek','recurringWeekdaySequence','recurringWeekInterval']){
    if(field==='endDate'&&[212,229].includes(source.row))continue;
    if(field==='category'&&[48,285].includes(source.row))continue;
    // Fresh model reads can vary broad categories; retain field equality as a
    // regression gate for saved-response playback, not for fresh generation.
    if(!execute)assert.deepEqual(output[i][field],earlier[i][field],`${source.row}:${arm}:${i}:${field}`);
   }
   if([212,229].includes(source.row)){
    assert.equal(output[0].endDate,'2026-10-11');assert.equal(output[0].endTime,'02:00');
   }
   if([48,285].includes(source.row)){
    assert.equal(output[0].category,'Gatherings & Parties');assert.equal(output[0].isEvent,'Yes');assert.equal(output[0].isFoodSpecial,'No');
   }
   const record={row:source.row,postId:source.postId,arm,output,calls:ctx.calls};
   results.push(record);fs.appendFileSync(out,JSON.stringify(record)+'\n');
   console.log(JSON.stringify({row:source.row,arm,count:output.length,calls:ctx.calls.length,paid:execute}));
  });
 }
}
fs.writeFileSync(dir+'/'+tag+'-summary.json',JSON.stringify({complete:true,execute,postPairs:results.length/2,builderChecks,apiCalls,totalUsd},null,2));
console.log(JSON.stringify({complete:true,postPairs:results.length/2,builderChecks,apiCalls,totalUsd}));
