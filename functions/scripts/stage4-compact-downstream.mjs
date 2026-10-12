// Stage 5 compatibility controls for compact Stage 4. No Firestore/media transport.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {AsyncLocalStorage} from 'node:async_hooks';
const input=process.argv[2];assert(input);
const dir=input+'/downstream';
const normalize=v=>String(v??'').normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]/g,'');
if(process.argv.includes('--verify-saved')){
 const saved=fs.readFileSync(dir+'/results.jsonl','utf8').trim().split('\n').map(JSON.parse);let checked=0;
 for(const r of saved)for(const item of r.input){
  const price=item.price||item.pricing?.price||(typeof item.pricing==='string'?item.pricing:'');if(!price)continue;
  // These frozen controls have one price per title across their dated sessions.
  const matches=r.output.filter(e=>normalize(e.name)===normalize(item.name));assert(matches.length);
  assert(matches.every(e=>normalize(e.ticketPrice)===normalize(price)),r.caseId+': source price lost');checked++;
 }
 const result={complete:true,paidApiCalls:0,sources:saved.length,pricedOccurrencesChecked:checked};
 fs.writeFileSync(dir+'/saved-price-check.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));process.exit(0);
}
assert(!fs.existsSync(dir),'No implicit paid replay');
fs.mkdirSync(dir);
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const records=fs.readFileSync(input+'/results.jsonl','utf8').trim().split('\n').map(JSON.parse);
const cohort=read(input+'/cohort.json');
const ids=process.argv.find(x=>x.startsWith('--cases='))?.slice(8).split(',')||
 ['oct10-291','oct11-20','oct11-37','oct11-64','oct11-127','oct11-234','oct11-294','oct11-332'];
const selected=ids.map(id=>({source:cohort.find(c=>c.caseId===id),validation:records.find(r=>r.caseId===id&&r.arm==='compact')}));
assert(selected.every(c=>c.source&&c.validation?.output?.length&&!c.validation.metadata._compactValidationHold));
Object.assign(process.env,read('artifacts/luna-stage2-cache-release/serving-after.json').rows[0].env,{DRY_RUN:'true'});
delete process.env.IMAGE_UPLOAD_URL;delete process.env.IMAGE_DELETE_URL;assert(process.env.OPENAI_API_KEY);
let calls=0,usd=0;const local=new AsyncLocalStorage(),nativeFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
 assert.equal(url,'https://api.openai.com/v1/responses','No live writer or media transport');
 const ctx=local.getStore(),body=JSON.parse(options.body);
 assert.equal(body.model,'gpt-6-luna');assert.equal(body.reasoning?.effort,'none');assert(++calls<40&&usd<.25);
 const start=Date.now();
 const response=await nativeFetch(url,{...options,signal:AbortSignal.any([...(options.signal?[options.signal]:[]),AbortSignal.timeout(180000)])});
 const raw=await response.clone().json(),u=raw.usage,d=u?.input_tokens_details;let cost=0;
 if(u){assert(Number.isFinite(d?.cache_write_tokens));cost=((u.input_tokens-d.cached_tokens-d.cache_write_tokens)*.1+d.cached_tokens*.01+d.cache_write_tokens*.125+u.output_tokens*.5)/1e6;usd+=cost;}
 const record={number:calls,request:body,raw,ms:Date.now()-start,usd:cost};ctx.requests.push(record);
 fs.writeFileSync(`${dir}/${ctx.source.caseId}-${calls}.json`,JSON.stringify(record,null,2));
 if(!response.ok){const h=new Headers(response.headers);h.set('x-should-retry','false');return new Response(JSON.stringify(raw),{status:response.status,headers:h});}
 return response;
};
createRequire(import.meta.url)('openai/shims/web');
const {performFinalFormatting}=await import('../lib/parsing/finalFormatter.js');
const clock=v=>['unknown',''].includes(String(v??'').toLowerCase())?'':String(v);
const key=i=>[normalize(i.name),i.startDate||i.date,clock(i.startTime)].join('|');
const results=[];
for(const {source,validation} of selected){
 await local.run({source,requests:[]},async()=>{
  const ctx=local.getStore(),usage=[];
  const output=await performFinalFormatting(structuredClone(validation.output),source.venue,'',source.timestamp,
   {stage5ModelOverride:'gpt-6-luna',stage5ReasoningEffortOverride:'none',stage5BatchSize:9,stage5BatchConcurrency:2,gptUsageHandler:r=>usage.push(r)},source.caption);
  const expanded=output.flatMap(e=>{
   const n=Number(e.totalOccurrences||1),weekly=String(e.recurringPattern||'').startsWith('weekly_');
   if(n<2||!weekly)return[e];assert(Number.isInteger(n)&&n<=200);
   return Array.from({length:n},(_,i)=>{const d=new Date(e.startDate+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+7*Number(e.recurringWeekInterval||1)*i);return {...e,startDate:d.toISOString().slice(0,10)};});
  });
  const errors=[];
  if(expanded.length!==validation.output.length)errors.push(`count ${expanded.length} != ${validation.output.length}`);
  for(const item of validation.output){
   const at=expanded.findIndex(e=>key(e)===key(item));
   if(at<0){errors.push('Missing source occurrence '+key(item));continue;}
   const event=expanded.splice(at,1)[0];
   if(clock(event.endTime)!==clock(item.endTime))errors.push(item.name+': end time changed');
   if(item.ticketLink&&event.ticketLink!==item.ticketLink)errors.push(item.name+': ticket link changed');
   if(Number.isInteger(item.relevantImageIndex)&&event.relevantImageIndex!==item.relevantImageIndex)errors.push(item.name+': image index changed');
   if(item.venue&&normalize(event.venue||event.establishment)!==normalize(item.venue))errors.push(item.name+': venue changed');
  }
  const result={caseId:source.caseId,input:validation.output,output,usage,errors,requests:ctx.requests.map(({raw,request,...r})=>r)};
  results.push(result);fs.appendFileSync(dir+'/results.jsonl',JSON.stringify(result)+'\n');
  console.log(JSON.stringify({caseId:source.caseId,inputs:validation.output.length,outputs:output.length,errors}));
 });
}
const summary={complete:true,noLiveWrites:true,sources:results.length,inputItems:results.reduce((s,r)=>s+r.input.length,0),calls,usd,
 errors:results.flatMap(r=>r.errors.map(error=>({caseId:r.caseId,error})))};
fs.writeFileSync(dir+'/summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
if(summary.errors.length)process.exitCode=1;
